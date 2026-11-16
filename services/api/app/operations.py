"""Allowlisted local Kali tasks. Never expose this API on a public interface."""
from __future__ import annotations
import hmac
import ipaddress
import json
import os
import platform
import shutil
import socket
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, model_validator

router = APIRouter(prefix="/api/v1", tags=["local-operations"])
_LOCK = threading.RLock()
_ALLOWED_PORTS = {22, 80, 443, 8000, 8080, 8443}
_TOOLS = ("python3", "git", "nmap", "tcpdump", "tshark", "frida", "ghidra", "nxc", "certipy-ad")
_PRIVATE_SUPERNETS = tuple(ipaddress.ip_network(v) for v in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"))

def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def configured():
    op = os.getenv("STAR_OPERATOR_TOKEN", "")
    ap = os.getenv("STAR_APPROVAL_TOKEN", "")
    return len(op) >= 32 and len(ap) >= 32 and not hmac.compare_digest(op, ap)

def auth(authorization: str | None = Header(default=None)):
    if not configured():
        raise HTTPException(503, "Local operator credentials are not configured")
    expected = os.getenv("STAR_OPERATOR_TOKEN", "")
    candidate = authorization[7:] if authorization and authorization.startswith("Bearer ") else ""
    if not hmac.compare_digest(candidate, expected):
        raise HTTPException(401, "Invalid operator credential", headers={"WWW-Authenticate": "Bearer"})

def approval_auth(x_star_approval: str | None = Header(default=None)):
    if not x_star_approval or not hmac.compare_digest(x_star_approval, os.getenv("STAR_APPROVAL_TOKEN", "")):
        raise HTTPException(403, "Separate approval credential required")

def lab_networks():
    result = []
    for text in filter(None, (v.strip() for v in os.getenv("STAR_LAB_CIDRS", "").split(","))):
        try:
            net = ipaddress.ip_network(text, strict=True)
        except ValueError:
            raise HTTPException(503, "Invalid lab CIDR configuration")
        if net.version != 4 or not any(net.subnet_of(base) for base in _PRIVATE_SUPERNETS):
            raise HTTPException(503, "Only explicit RFC1918 training networks are permitted")
        result.append(net)
    return result

def allowed_target(text: str) -> bool:
    try:
        ip = ipaddress.ip_address(text)
        return ip.version == 4 and not (ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_unspecified) and any(ip in net for net in lab_networks())
    except ValueError:
        return False

def db_path() -> Path:
    return Path(os.getenv("STAR_DB_PATH", str(Path.home() / ".local/share/kali-osint-star/operations.sqlite"))).expanduser()

def connection():
    file = db_path()
    file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    conn = sqlite3.connect(str(file), timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("""CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, target TEXT, port INTEGER,
      status TEXT NOT NULL, reason TEXT, result TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""")
    conn.execute("""CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, time TEXT NOT NULL,
      action TEXT NOT NULL, job_id TEXT, detail TEXT NOT NULL)""")
    if os.name == "posix":
        file.chmod(0o600)
    return conn

def event(conn, action: str, job_id: str, detail: str):
    conn.execute("INSERT INTO audit(time,action,job_id,detail) VALUES(?,?,?,?)",
                 (timestamp(), action, job_id, detail))

def fetch_job(conn, job_id: str):
    row = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Job not found")
    return row

def as_json(row):
    data = dict(row)
    data["result"] = json.loads(data["result"]) if data["result"] else None
    return data

class NewJob(BaseModel):
    kind: str = Field(max_length=32)
    target: str | None = Field(default=None, max_length=64)
    port: int | None = None

    @model_validator(mode="after")
    def validate(self):
        if self.kind not in ("system_inventory", "tool_inventory", "lab_port_check"):
            raise ValueError("Only predefined local tasks are supported")
        if self.kind == "lab_port_check":
            if not self.target or self.port not in _ALLOWED_PORTS:
                raise ValueError("A single allowed port and a literal lab IPv4 target are required")
            try:
                addr = ipaddress.ip_address(self.target)
                if addr.version != 4 or addr.is_loopback or addr.is_link_local or addr.is_multicast:
                    raise ValueError("Unapproved target")
            except ValueError as exc:
                raise ValueError("Invalid literal lab IPv4 address") from exc
        elif self.target is not None or self.port is not None:
            raise ValueError("Inventory jobs have no target or port")
        return self

class Approval(BaseModel):
    reason: str = Field(min_length=12, max_length=250)
    scope_confirmed: bool

    @model_validator(mode="after")
    def confirmed(self):
        if not self.scope_confirmed:
            raise ValueError("Explicit scope confirmation is required")
        return self

def execute(row):
    kind = row["kind"]
    if kind == "system_inventory":
        return {"os": platform.system(), "release": platform.release(),
                "architecture": platform.machine(), "python": platform.python_version(),
                "source": "local_python"}
    if kind == "tool_inventory":
        return {"installed": {key: shutil.which(key) is not None for key in _TOOLS},
                "source": "local_path_check_no_execution"}
    if kind == "lab_port_check":
        try:
            with socket.create_connection((row["target"], row["port"]), timeout=1.5):
                state = "open"
        except (OSError, TimeoutError):
            state = "unreachable_or_closed"
        return {"target": row["target"], "port": row["port"], "tcp": state,
                "source": "one_bounded_tcp_connection"}
    raise ValueError("Unknown task")

@router.get("/jobs", dependencies=[Depends(auth)])
def jobs(limit: int = 30):
    if not 1 <= limit <= 100:
        raise HTTPException(422, "limit must be 1..100")
    with connection() as db:
        return {"jobs": [as_json(row) for row in db.execute(
            "SELECT * FROM jobs ORDER BY rowid DESC LIMIT ?", (limit,)).fetchall()]}

@router.post("/jobs", status_code=201, dependencies=[Depends(auth)])
def submit(body: NewJob):
    if body.kind == "lab_port_check" and not allowed_target(body.target or ""):
        raise HTTPException(403, "Target outside the configured isolated lab CIDRs")
    now = timestamp()
    job_id = str(uuid.uuid4())
    with _LOCK, connection() as db:
        db.execute("INSERT INTO jobs(id,kind,target,port,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                   (job_id, body.kind, body.target, body.port, "pending_approval", now, now))
        event(db, "job_created", job_id, body.kind)
        result = as_json(fetch_job(db, job_id))
    return result

@router.get("/jobs/{job_id}", dependencies=[Depends(auth)])
def get_job(job_id: str):
    with connection() as db:
        return as_json(fetch_job(db, job_id))

@router.post("/jobs/{job_id}/approve", dependencies=[Depends(auth), Depends(approval_auth)])
def approve(job_id: str, data: Approval):
    with _LOCK, connection() as db:
        row = fetch_job(db, job_id)
        if row["status"] != "pending_approval":
            raise HTTPException(409, "Job cannot be approved")
        db.execute("UPDATE jobs SET status='approved', reason=?, updated_at=? WHERE id=?",
                   (data.reason, timestamp(), job_id))
        event(db, "job_approved", job_id, "scope confirmation recorded")
        result = as_json(fetch_job(db, job_id))
    return result

@router.post("/jobs/{job_id}/run", dependencies=[Depends(auth)])
def run(job_id: str):
    with _LOCK, connection() as db:
        row = fetch_job(db, job_id)
        if row["status"] != "approved":
            raise HTTPException(409, "Explicit approval is required before execution")
        if row["kind"] == "lab_port_check" and not allowed_target(row["target"]):
            raise HTTPException(403, "Target is no longer authorized by lab CIDRs")
        db.execute("UPDATE jobs SET status='running',updated_at=? WHERE id=?", (timestamp(), job_id))
        event(db, "job_started", job_id, row["kind"])
        try:
            result, state = execute(row), "completed"
        except Exception:
            result, state = {"error": "Local task failed"}, "failed"
        db.execute("UPDATE jobs SET status=?,result=?,updated_at=? WHERE id=?",
                   (state, json.dumps(result, ensure_ascii=False), timestamp(), job_id))
        event(db, "job_finished", job_id, state)
        output = as_json(fetch_job(db, job_id))
    return output

@router.post("/jobs/{job_id}/cancel", dependencies=[Depends(auth)])
def cancel(job_id: str):
    with _LOCK, connection() as db:
        row = fetch_job(db, job_id)
        if row["status"] not in ("approved", "pending_approval"):
            raise HTTPException(409, "Job cannot be cancelled")
        db.execute("UPDATE jobs SET status='cancelled',updated_at=? WHERE id=?", (timestamp(), job_id))
        event(db, "job_cancelled", job_id, "cancelled before execution")
        output = as_json(fetch_job(db, job_id))
    return output

@router.get("/audit", dependencies=[Depends(auth)])
def audit(limit: int = 30):
    if not 1 <= limit <= 100:
        raise HTTPException(422, "limit must be 1..100")
    with connection() as db:
        return {"events": [dict(row) for row in db.execute(
            "SELECT * FROM audit ORDER BY id DESC LIMIT ?", (limit,)).fetchall()]}
