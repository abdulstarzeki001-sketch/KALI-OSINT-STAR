"""Approval-gated, bounded, asynchronous read-only tool probes.

This is not a shell or a remote command-execution API. The only executable
subprocesses use fixed hardcoded --help/-h arguments and have a timeout.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import json
import os
import signal
import subprocess
import tempfile
import threading
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ConfigDict, model_validator

from .operations import auth, approval_auth, connection, event, timestamp
from .tool_registry import TOOLS, BY_ID, find_binary, help_is_enabled, serialize

router = APIRouter(prefix='/api/v1/tooling', tags=['kali-read-only'])
_LOCK = threading.RLock()
_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix='star-tooling')
_TIMEOUT = 5
_MAX_RUNNING = 2
_MAX_OUTPUT = 6000

class ToolJobRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    tool_id: str = Field(min_length=2, max_length=32)
    action: str = Field(default='inspect')

    @model_validator(mode='after')
    def valid(self):
        tool = BY_ID.get(self.tool_id)
        if tool is None or self.action not in ('inspect', 'help'):
            raise ValueError('Unknown tool or action')
        if self.action == 'help' and not tool.help_args:
            raise ValueError('Tool is inventory-only by design')
        if self.action == 'help' and not help_is_enabled():
            raise ValueError('Optional local help commands are disabled')
        return self

class Consent(BaseModel):
    model_config = ConfigDict(extra='forbid')
    reason: str = Field(min_length=12, max_length=250)
    scope_confirmed: bool

    @model_validator(mode='after')
    def confirmed(self):
        if not self.scope_confirmed:
            raise ValueError('Explicit isolated lab confirmation required')
        return self

def tables(db):
    db.execute('''CREATE TABLE IF NOT EXISTS tool_jobs (
        id TEXT PRIMARY KEY, tool_id TEXT NOT NULL, action TEXT NOT NULL,
        status TEXT NOT NULL, reason TEXT, result TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL)''')
    db.execute('''CREATE INDEX IF NOT EXISTS idx_tool_jobs_created ON tool_jobs(created_at DESC)''')

def find_job(db, job_id):
    row = db.execute('SELECT * FROM tool_jobs WHERE id=?', (job_id,)).fetchone()
    if row is None:
        raise HTTPException(404, 'Tool job not found')
    return row

def job_json(row):
    value = dict(row)
    value['result'] = json.loads(value['result']) if value['result'] else None
    return value

def probe(tool_id: str, action: str) -> dict:
    spec = BY_ID[tool_id]
    found = find_binary(spec)
    if action == 'inspect':
        return {'tool':tool_id,'installed':bool(found),
                'executable': os.path.basename(found) if found else None,
                'method':'local_executable_inventory','executed':False,
                'note':spec.note}
    if action != 'help' or not spec.help_args or not help_is_enabled():
        raise ValueError('This action is disabled by the local policy')
    if found is None:
        raise FileNotFoundError('Tool executable is not installed or not on PATH')

    # Pass no credentials or arbitrary user arguments; this isn't an OS sandbox.
    env={'PATH':'/usr/local/bin:/usr/bin:/bin', 'LANG':'C', 'LC_ALL':'C',
         'HOME':'/nonexistent', 'NO_COLOR':'1', 'TERM':'dumb'}
    argv=[found, *spec.help_args]
    started=time.monotonic()
    with tempfile.TemporaryDirectory(prefix='star-help-') as folder:
        process=subprocess.Popen(argv, cwd=folder, env=env, stdin=subprocess.DEVNULL,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 start_new_session=(os.name=='posix'))
        try:
            stdout,stderr=process.communicate(timeout=_TIMEOUT)
        except subprocess.TimeoutExpired:
            if os.name == 'posix':
                os.killpg(process.pid, signal.SIGKILL)
            else:
                process.kill()
            process.communicate()
            return {'tool':tool_id,'action':'help','executed':True,'timed_out':True,
                    'timeout_seconds':_TIMEOUT,'success':False}
    return {'tool':tool_id,'action':'help','executed':True,
            'exit_code':process.returncode,'success':process.returncode==0,
            'elapsed_ms':round((time.monotonic()-started)*1000),
            'stdout':stdout[:_MAX_OUTPUT].decode('utf-8',errors='replace'),
            'stderr':stderr[:_MAX_OUTPUT].decode('utf-8',errors='replace'),
            'truncated':len(stdout)>_MAX_OUTPUT or len(stderr)>_MAX_OUTPUT}

def worker(job_id: str):
    with _LOCK, connection() as db:
        tables(db)
        row=find_job(db,job_id)
        if row['status']!='queued':
            return
        db.execute('UPDATE tool_jobs SET status=?, updated_at=? WHERE id=?',('running',timestamp(),job_id))
        event(db,'tool_probe_started',job_id,row['tool_id']+':'+row['action'])
        tool_id, action = row['tool_id'], row['action']
    try:
        result=probe(tool_id,action)
        status='completed' if (action=='inspect' or result.get('success',False)) else 'failed'
    except Exception as exc:
        # Do not expose arbitrary OS exception text or secrets to the browser.
        result={'error_code':type(exc).__name__,'message':'Local read-only probe did not finish'}
        status='failed'
    with _LOCK, connection() as db:
        tables(db)
        row=find_job(db,job_id)
        if row['status'] not in ('running','queued'):
            return
        db.execute('UPDATE tool_jobs SET status=?,result=?,updated_at=? WHERE id=?',
                   (status,json.dumps(result,ensure_ascii=False),timestamp(),job_id))
        event(db,'tool_probe_finished',job_id,status)

def recover_interrupted_jobs():
    """Mark in-process work interrupted after server restart."""
    with _LOCK, connection() as db:
        tables(db)
        interrupted=db.execute("SELECT id FROM tool_jobs WHERE status IN ('queued','running')").fetchall()
        for row in interrupted:
            db.execute("UPDATE tool_jobs SET status='failed',result=?,updated_at=? WHERE id=?",
                       (json.dumps({'error_code':'interrupted_by_restart'}),timestamp(),row['id']))
            event(db,'tool_probe_interrupted',row['id'],'server restarted')

@router.get('/catalog',dependencies=[Depends(auth)])
def catalog():
    return {'tools':[serialize(tool) for tool in TOOLS],
            'help_enabled':help_is_enabled(),'mode':'read_only_local',
            'notice':'High-risk frameworks are inventory-only. No attacks, agents, credentials, shell or scanning.'}

@router.get('/jobs',dependencies=[Depends(auth)])
def jobs(limit:int=50):
    if limit<1 or limit>100:
        raise HTTPException(422,'limit must be 1..100')
    with connection() as db:
        tables(db)
        return {'jobs':[job_json(row) for row in db.execute(
            'SELECT * FROM tool_jobs ORDER BY created_at DESC, rowid DESC LIMIT ?', (limit,)).fetchall()]}

@router.post('/jobs',status_code=201,dependencies=[Depends(auth)])
def submit(body:ToolJobRequest):
    uid=str(uuid.uuid4()); now=timestamp()
    with _LOCK, connection() as db:
        tables(db)
        db.execute('INSERT INTO tool_jobs(id,tool_id,action,status,created_at,updated_at) VALUES(?,?,?,?,?,?)',
                   (uid,body.tool_id,body.action,'pending_approval',now,now))
        event(db,'tool_probe_requested',uid,body.tool_id+':'+body.action)
        return job_json(find_job(db,uid))

@router.post('/jobs/{job_id}/approve',dependencies=[Depends(auth),Depends(approval_auth)])
def approve(job_id:str, consent:Consent):
    with _LOCK, connection() as db:
        tables(db); row=find_job(db,job_id)
        if row['status']!='pending_approval':
            raise HTTPException(409,'Tool job already processed')
        db.execute('UPDATE tool_jobs SET status=?,reason=?,updated_at=? WHERE id=?',
                   ('approved',consent.reason,timestamp(),job_id))
        event(db,'tool_probe_approved',job_id,'scope confirmation recorded')
        return job_json(find_job(db,job_id))

@router.post('/jobs/{job_id}/run',dependencies=[Depends(auth)])
def run(job_id:str):
    with _LOCK, connection() as db:
        tables(db);row=find_job(db,job_id)
        if row['status']!='approved':
            raise HTTPException(409,'Tool job requires explicit approval')
        try:
            approved=datetime.fromisoformat(row['updated_at'])
        except ValueError:
            raise HTTPException(409,'Invalid approval timestamp')
        if datetime.now(timezone.utc)-approved>timedelta(minutes=15):
            raise HTTPException(409,'Approval expired; create a new request')
        spec=BY_ID[row['tool_id']]
        if row['action']=='help' and (not spec.help_args or not help_is_enabled()):
            raise HTTPException(403,'Help command disabled by local policy')
        pending=db.execute("SELECT count(*) FROM tool_jobs WHERE status IN ('queued','running')").fetchone()[0]
        if pending>=_MAX_RUNNING:
            raise HTTPException(429,'Maximum active tool jobs reached')
        db.execute('UPDATE tool_jobs SET status=?,updated_at=? WHERE id=?',('queued',timestamp(),job_id))
        event(db,'tool_probe_queued',job_id,row['tool_id']+':'+row['action'])
        output=job_json(find_job(db,job_id))
    _EXECUTOR.submit(worker,job_id)
    return output

@router.post('/jobs/{job_id}/cancel',dependencies=[Depends(auth)])
def cancel(job_id:str):
    with _LOCK,connection() as db:
        tables(db);row=find_job(db,job_id)
        if row['status'] not in ('pending_approval','approved','queued'):
            raise HTTPException(409,'Running or finished jobs cannot be cancelled')
        db.execute('UPDATE tool_jobs SET status=?,updated_at=? WHERE id=?',('cancelled',timestamp(),job_id))
        event(db,'tool_probe_cancelled',job_id,'cancelled before execution')
        return job_json(find_job(db,job_id))
