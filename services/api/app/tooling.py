"""Locally approved, fixed-action, non-destructive Kali tool probes."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timedelta,timezone
import json,os,signal,subprocess,tempfile,threading,time,uuid
from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,ConfigDict,Field,model_validator
from .operations import auth,approval_auth,connection,event,timestamp
from .tool_registry import TOOLS,REGISTRY,resolve,help_enabled,to_json

router=APIRouter(prefix="/api/v1/tooling",tags=["read-only-tools"])
LOCK=threading.RLock()
POOL=ThreadPoolExecutor(max_workers=2,thread_name_prefix="star-tools")

class NewToolJob(BaseModel):
    model_config=ConfigDict(extra="forbid")
    tool_id:str=Field(min_length=2,max_length=32)
    action:str="inspect"
    @model_validator(mode="after")
    def valid(self):
        tool=REGISTRY.get(self.tool_id)
        if not tool or self.action not in ("inspect","help"):raise ValueError("Unknown tool/action")
        if self.action=="help" and (not tool.help_args or not help_enabled()):
            raise ValueError("Optional local help is disabled for this tool")
        return self

class Consent(BaseModel):
    model_config=ConfigDict(extra="forbid")
    reason:str=Field(min_length=12,max_length=250)
    scope_confirmed:bool
    @model_validator(mode="after")
    def valid(self):
        if not self.scope_confirmed:raise ValueError("Scope must be confirmed")
        return self

def ensure(db):
    db.execute("""CREATE TABLE IF NOT EXISTS tool_jobs(
        id TEXT PRIMARY KEY,tool_id TEXT NOT NULL,action TEXT NOT NULL,
        status TEXT NOT NULL,reason TEXT,result TEXT,
        created_at TEXT NOT NULL,updated_at TEXT NOT NULL)""")

def item(db,uid):
    row=db.execute("SELECT * FROM tool_jobs WHERE id=?",(uid,)).fetchone()
    if row is None:raise HTTPException(404,"Unknown tool job")
    return row

def as_json(row):
    out=dict(row)
    out["result"]=json.loads(out["result"]) if out["result"] else None
    return out

def probe(tool_id,action):
    tool=REGISTRY[tool_id]
    path=resolve(tool)
    if action=="inspect":
        return {"installed":bool(path),"executable":os.path.basename(path) if path else None,
                "method":"local_binary_inventory","executed":False}
    if not tool.help_args or not help_enabled():raise ValueError("Help disabled by policy")
    if not path:raise FileNotFoundError("Tool not installed")
    args=[path,*tool.help_args]  # hard-coded; no user parameters
    env={"PATH":"/usr/local/bin:/usr/bin:/bin","LANG":"C","LC_ALL":"C",
         "HOME":"/nonexistent","NO_COLOR":"1","TERM":"dumb"}
    with tempfile.TemporaryDirectory(prefix="star-help-") as cwd:
        start=time.monotonic()
        proc=subprocess.Popen(args,cwd=cwd,env=env,stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=(os.name=="posix"))
        try:
            stdout,stderr=proc.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            if os.name=="posix":os.killpg(proc.pid,signal.SIGKILL)
            else:proc.kill()
            proc.communicate()
            return {"executed":True,"success":False,"timed_out":True}
    return {"executed":True,"success":proc.returncode==0,"exit_code":proc.returncode,
            "elapsed_ms":round((time.monotonic()-start)*1000),
            "stdout":stdout[:6000].decode("utf-8","replace"),
            "stderr":stderr[:6000].decode("utf-8","replace"),
            "truncated":len(stdout)>6000 or len(stderr)>6000}

def worker(uid):
    with LOCK,connection() as db:
        ensure(db);row=item(db,uid)
        if row["status"]!="queued":return
        db.execute("UPDATE tool_jobs SET status='running',updated_at=? WHERE id=?",(timestamp(),uid))
        event(db,"tool_probe_started",uid,row["tool_id"]+":"+row["action"])
        tool_id,action=row["tool_id"],row["action"]
    try:
        result=probe(tool_id,action)
        state="completed" if action=="inspect" or result.get("success",False) else "failed"
    except Exception as exc:
        result={"error_code":type(exc).__name__,"message":"Local probe failed"}
        state="failed"
    with LOCK,connection() as db:
        ensure(db);row=item(db,uid)
        if row["status"] not in ("running","queued"):return
        db.execute("UPDATE tool_jobs SET status=?,result=?,updated_at=? WHERE id=?",
            (state,json.dumps(result,ensure_ascii=False),timestamp(),uid))
        event(db,"tool_probe_finished",uid,state)

def recover_interrupted_jobs():
    with LOCK,connection() as db:
        ensure(db)
        for row in db.execute("SELECT id FROM tool_jobs WHERE status IN ('running','queued')").fetchall():
            db.execute("UPDATE tool_jobs SET status='failed',result=?,updated_at=? WHERE id=?",
                (json.dumps({"error_code":"interrupted_by_restart"}),timestamp(),row["id"]))
            event(db,"tool_probe_interrupted",row["id"],"server restarted")

@router.get("/catalog",dependencies=[Depends(auth)])
def catalog():
    return {"tools":[to_json(tool) for tool in TOOLS],"help_enabled":help_enabled(),
            "mode":"read_only_local","notice":"No arbitrary shell, targets, C2 or credential extraction"}

@router.get("/jobs",dependencies=[Depends(auth)])
def jobs(limit:int=50):
    if not 1<=limit<=100:raise HTTPException(422,"Invalid limit")
    with connection() as db:
        ensure(db)
        return {"jobs":[as_json(row) for row in db.execute(
            "SELECT * FROM tool_jobs ORDER BY rowid DESC LIMIT ?",(limit,)).fetchall()]}

@router.post("/jobs",status_code=201,dependencies=[Depends(auth)])
def create(body:NewToolJob):
    uid=str(uuid.uuid4());now=timestamp()
    with LOCK,connection() as db:
        ensure(db)
        db.execute("INSERT INTO tool_jobs(id,tool_id,action,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",
            (uid,body.tool_id,body.action,"pending_approval",now,now))
        event(db,"tool_probe_requested",uid,body.tool_id+":"+body.action)
        return as_json(item(db,uid))

@router.post("/jobs/{uid}/approve",dependencies=[Depends(auth),Depends(approval_auth)])
def approve(uid:str,body:Consent):
    with LOCK,connection() as db:
        ensure(db);row=item(db,uid)
        if row["status"]!="pending_approval":raise HTTPException(409,"Not awaiting approval")
        db.execute("UPDATE tool_jobs SET status='approved',reason=?,updated_at=? WHERE id=?",
            (body.reason,timestamp(),uid))
        event(db,"tool_probe_approved",uid,"scope confirmed")
        return as_json(item(db,uid))

@router.post("/jobs/{uid}/run",dependencies=[Depends(auth)])
def run(uid:str):
    with LOCK,connection() as db:
        ensure(db);row=item(db,uid)
        if row["status"]!="approved":raise HTTPException(409,"Approval required")
        try:approved=datetime.fromisoformat(row["updated_at"])
        except ValueError:raise HTTPException(409,"Invalid timestamp")
        if datetime.now(timezone.utc)-approved>timedelta(minutes=15):
            raise HTTPException(409,"Approval expired")
        tool=REGISTRY[row["tool_id"]]
        if row["action"]=="help" and (not tool.help_args or not help_enabled()):
            raise HTTPException(403,"Help disabled by local policy")
        active=db.execute("SELECT COUNT(*) FROM tool_jobs WHERE status IN ('running','queued')").fetchone()[0]
        if active>=2:raise HTTPException(429,"Too many active tasks")
        db.execute("UPDATE tool_jobs SET status='queued',updated_at=? WHERE id=?",(timestamp(),uid))
        event(db,"tool_probe_queued",uid,row["tool_id"])
        data=as_json(item(db,uid))
    POOL.submit(worker,uid)
    return data

@router.post("/jobs/{uid}/cancel",dependencies=[Depends(auth)])
def cancel(uid:str):
    with LOCK,connection() as db:
        ensure(db);row=item(db,uid)
        if row["status"] not in ("pending_approval","approved","queued"):
            raise HTTPException(409,"Cannot cancel a running/completed task")
        db.execute("UPDATE tool_jobs SET status='cancelled',updated_at=? WHERE id=?",(timestamp(),uid))
        event(db,"tool_probe_cancelled",uid,"cancelled before execution")
        return as_json(item(db,uid))
