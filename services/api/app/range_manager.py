"""Range Manager: start, stop and reset the isolated local training range.

Security model
  * Local API only (TrustedHostMiddleware in main.py), operator token on every
    route, and the separate approval token to start or reset a target.
  * Disabled unless STAR_RANGE_ENABLED=true is set on the Kali host.
  * Never builds a shell string. Every Docker call is a fixed argv whose only
    variable part is a service name taken from the hardcoded LABS registry.
  * Targets live on an internal Docker network with no egress (range/compose.yml).
  * Each start/reset is a new attempt: the container is recreated from the
    image and Juice Shop gets a fresh random CTF key, so flags prove that this
    attempt was actually solved. CTF keys never leave this process.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import subprocess
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .operations import approval_auth, auth, connection, event, timestamp

router = APIRouter(prefix="/api/v1/range", tags=["training-range"])

PROJECT = "kos-range"
_LOCK = threading.RLock()
_EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="star-range")
_TIMEOUT = 600          # first start may pull images
_STATUS_TIMEOUT = 20
_MAX_OUTPUT = 4000


@dataclass(frozen=True)
class Lab:
    id: str
    title: str
    category: str
    url: str
    flags: bool
    summary: str


LABS: tuple[Lab, ...] = (
    Lab("juice-shop", "OWASP Juice Shop", "Web", "http://127.0.0.1:3000", True,
        "Modern web app with 100+ challenges: XSS, injection, broken access control, JWT, SSRF."),
    Lab("dvwa", "DVWA", "Web", "http://127.0.0.1:4280", False,
        "Classic PHP/MySQL training app with adjustable difficulty. Default login admin/password."),
    Lab("webgoat", "OWASP WebGoat", "Web", "http://127.0.0.1:8081/WebGoat", False,
        "Guided lessons that explain each vulnerability class step by step."),
)
BY_ID = {lab.id: lab for lab in LABS}


def enabled() -> bool:
    return os.environ.get("STAR_RANGE_ENABLED", "").strip().lower() == "true"


def compose_file() -> Path:
    default = Path(__file__).resolve().parents[3] / "range" / "compose.yml"
    return Path(os.environ.get("STAR_RANGE_COMPOSE", str(default))).expanduser()


def base_argv(lab_id: str | None = None) -> list[str]:
    argv = ["docker", "compose", "-f", str(compose_file()), "-p", PROJECT]
    if lab_id is not None:
        argv += ["--profile", lab_id]
    return argv


def child_env(extra: dict[str, str] | None = None) -> dict[str, str]:
    """Minimal environment for Docker: no operator/approval tokens leak to children."""
    env = {k: v for k, v in os.environ.items()
           if k in ("PATH", "HOME", "DOCKER_HOST", "DOCKER_CONFIG", "DOCKER_CONTEXT", "XDG_RUNTIME_DIR")}
    env.setdefault("PATH", "/usr/local/bin:/usr/bin:/bin")
    env.update(extra or {})
    return env


def compose(argv: list[str], env: dict[str, str], timeout: int) -> subprocess.CompletedProcess:
    """Single choke point for Docker execution (patched in tests)."""
    return subprocess.run(argv, env=env, stdin=subprocess.DEVNULL, capture_output=True,
                          timeout=timeout, check=False, shell=False)


def juice_flag(ctf_key: str, challenge: str) -> str:
    """Juice Shop's flag code: HMAC-SHA1(CTF_KEY, challenge name), lowercase hex."""
    return hmac.new(ctf_key.encode(), challenge.encode(), hashlib.sha1).hexdigest()


def tables(db):
    db.execute("""CREATE TABLE IF NOT EXISTS range_attempts (
        id TEXT PRIMARY KEY, lab_id TEXT NOT NULL, status TEXT NOT NULL,
        ctf_key TEXT, reason TEXT, detail TEXT,
        started_at TEXT NOT NULL, updated_at TEXT NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS range_solves (
        attempt_id TEXT NOT NULL, challenge TEXT NOT NULL, solved_at TEXT NOT NULL,
        PRIMARY KEY (attempt_id, challenge))""")


def attempt_json(db, row) -> dict:
    solves = [dict(r) for r in db.execute(
        "SELECT challenge, solved_at FROM range_solves WHERE attempt_id=? ORDER BY solved_at", (row["id"],))]
    data = {k: row[k] for k in ("id", "lab_id", "status", "reason", "started_at", "updated_at")}
    data["detail"] = json.loads(row["detail"]) if row["detail"] else None
    data["solves"] = solves
    return data   # ctf_key is deliberately never included


def lab_or_404(lab_id: str) -> Lab:
    lab = BY_ID.get(lab_id)
    if lab is None:
        raise HTTPException(404, "Unknown range lab")
    return lab


def require_enabled():
    if not enabled():
        raise HTTPException(403, "Training range is disabled. Set STAR_RANGE_ENABLED=true in .env.local")


def running_services() -> tuple[bool, set[str], str | None]:
    try:
        result = compose(base_argv() + ["ps", "--format", "json"], child_env(), _STATUS_TIMEOUT)
    except (OSError, subprocess.TimeoutExpired):
        return False, set(), "docker_unavailable"
    if result.returncode != 0:
        return False, set(), "docker_error"
    names: set[str] = set()
    text = result.stdout.decode("utf-8", "replace").strip()
    rows = []
    if text.startswith("["):
        try:
            rows = json.loads(text)
        except ValueError:
            rows = []
    else:
        for line in text.splitlines():
            try:
                rows.append(json.loads(line))
            except ValueError:
                continue
    for row in rows:
        if isinstance(row, dict) and str(row.get("State", "")).lower() == "running":
            names.add(str(row.get("Service", "")))
    return True, names, None


def _clip(raw: bytes) -> str:
    text = raw.decode("utf-8", "replace")
    return text[-_MAX_OUTPUT:]


def _launch(attempt_id: str, lab_id: str, ctf_key: str | None):
    extra = {"KOS_JUICE_CTF_KEY": ctf_key} if ctf_key else {}
    steps = [
        base_argv(lab_id) + ["up", "-d", "gateway"],
        base_argv(lab_id) + ["up", "-d", "--force-recreate", "--no-deps", "--renew-anon-volumes", lab_id],
    ]
    status, detail = "running", {"url": BY_ID[lab_id].url}
    for argv in steps:
        try:
            result = compose(argv, child_env(extra), _TIMEOUT)
        except (OSError, subprocess.TimeoutExpired) as exc:
            status, detail = "failed", {"error_code": type(exc).__name__}
            break
        if result.returncode != 0:
            status, detail = "failed", {"error_code": "compose_failed", "stderr": _clip(result.stderr)}
            break
    with _LOCK, connection() as db:
        tables(db)
        row = db.execute("SELECT status FROM range_attempts WHERE id=?", (attempt_id,)).fetchone()
        if row is None or row["status"] != "starting":
            return
        db.execute("UPDATE range_attempts SET status=?, detail=?, updated_at=? WHERE id=?",
                   (status, json.dumps(detail, ensure_ascii=False), timestamp(), attempt_id))
        event(db, "range_started" if status == "running" else "range_start_failed", attempt_id, lab_id)


def recover_interrupted_attempts():
    """After an API restart, the background start thread is gone: fail open starts."""
    with _LOCK, connection() as db:
        tables(db)
        for row in db.execute("SELECT id FROM range_attempts WHERE status='starting'").fetchall():
            db.execute("UPDATE range_attempts SET status='failed', detail=?, updated_at=? WHERE id=?",
                       (json.dumps({"error_code": "interrupted_by_restart"}), timestamp(), row["id"]))
            event(db, "range_start_interrupted", row["id"], "server restarted")


class Consent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(min_length=12, max_length=250)
    scope_confirmed: bool

    @model_validator(mode="after")
    def confirmed(self):
        if not self.scope_confirmed:
            raise ValueError("Confirm that the range is local and isolated")
        return self


class FlagSubmission(BaseModel):
    model_config = ConfigDict(extra="forbid")
    challenge: str = Field(min_length=2, max_length=80)
    flag: str = Field(min_length=40, max_length=40)

    @model_validator(mode="after")
    def shape(self):
        if not re.fullmatch(r"[0-9a-fA-F]{40}", self.flag):
            raise ValueError("Flag must be a 40-character hex code")
        if not re.fullmatch(r"[\w .,'’()\-:/&!?+#]{2,80}", self.challenge):
            raise ValueError("Invalid challenge name")
        return self


def _end_open_attempts(db, lab_id: str, why: str):
    for row in db.execute("SELECT id FROM range_attempts WHERE lab_id=? AND status IN ('starting','running')",
                          (lab_id,)).fetchall():
        db.execute("UPDATE range_attempts SET status='ended', ctf_key=NULL, updated_at=? WHERE id=?",
                   (timestamp(), row["id"]))
        event(db, "range_attempt_ended", row["id"], why)


@router.get("/labs", dependencies=[Depends(auth)])
def labs():
    available, running, problem = running_services() if enabled() else (False, set(), "disabled")
    with connection() as db:
        tables(db)
        current = {}
        for row in db.execute("SELECT * FROM range_attempts WHERE status IN ('starting','running') "
                              "ORDER BY started_at DESC").fetchall():
            current.setdefault(row["lab_id"], attempt_json(db, row))
    return {
        "enabled": enabled(), "docker": available, "problem": problem,
        "isolation": "internal network, no egress; gateway on 127.0.0.1 only",
        "labs": [{"id": lab.id, "title": lab.title, "category": lab.category, "url": lab.url,
                  "flags": lab.flags, "summary": lab.summary,
                  "running": lab.id in running, "attempt": current.get(lab.id)} for lab in LABS],
    }


def _start(lab_id: str, consent: Consent, verb: str):
    require_enabled()
    lab = lab_or_404(lab_id)
    attempt_id = str(uuid.uuid4())
    ctf_key = secrets.token_hex(32) if lab.flags else None
    now = timestamp()
    with _LOCK, connection() as db:
        tables(db)
        if db.execute("SELECT 1 FROM range_attempts WHERE status='starting'").fetchone():
            raise HTTPException(429, "Another range target is still starting")
        _end_open_attempts(db, lab_id, "superseded by " + verb)
        db.execute("INSERT INTO range_attempts(id,lab_id,status,ctf_key,reason,started_at,updated_at) "
                   "VALUES(?,?,?,?,?,?,?)", (attempt_id, lab_id, "starting", ctf_key, consent.reason, now, now))
        event(db, "range_" + verb + "_requested", attempt_id, lab_id + ": scope confirmation recorded")
        output = attempt_json(db, db.execute("SELECT * FROM range_attempts WHERE id=?", (attempt_id,)).fetchone())
    _EXECUTOR.submit(_launch, attempt_id, lab_id, ctf_key)
    return output


@router.post("/labs/{lab_id}/start", status_code=202, dependencies=[Depends(auth), Depends(approval_auth)])
def start(lab_id: str, consent: Consent):
    return _start(lab_id, consent, "start")


@router.post("/labs/{lab_id}/reset", status_code=202, dependencies=[Depends(auth), Depends(approval_auth)])
def reset(lab_id: str, consent: Consent):
    return _start(lab_id, consent, "reset")


@router.post("/labs/{lab_id}/stop", dependencies=[Depends(auth)])
def stop(lab_id: str):
    require_enabled()
    lab_or_404(lab_id)
    try:
        result = compose(base_argv(lab_id) + ["rm", "--stop", "--force", "-v", lab_id], child_env(), _TIMEOUT)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(503, "Docker unavailable: " + type(exc).__name__)
    if result.returncode != 0:
        raise HTTPException(502, "docker compose rm failed")
    with _LOCK, connection() as db:
        tables(db)
        _end_open_attempts(db, lab_id, "stopped by operator")
        event(db, "range_stopped", lab_id, "container removed")
    return {"lab_id": lab_id, "status": "stopped"}


@router.get("/attempts", dependencies=[Depends(auth)])
def attempts(limit: int = 30):
    if not 1 <= limit <= 100:
        raise HTTPException(422, "limit must be 1..100")
    with connection() as db:
        tables(db)
        rows = db.execute("SELECT * FROM range_attempts ORDER BY started_at DESC, rowid DESC LIMIT ?",
                          (limit,)).fetchall()
        return {"attempts": [attempt_json(db, row) for row in rows]}


@router.post("/attempts/{attempt_id}/flags", dependencies=[Depends(auth)])
def submit_flag(attempt_id: str, body: FlagSubmission):
    with _LOCK, connection() as db:
        tables(db)
        row = db.execute("SELECT * FROM range_attempts WHERE id=?", (attempt_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "Attempt not found")
        if row["status"] != "running" or not row["ctf_key"]:
            raise HTTPException(409, "Flags are accepted only for the running attempt of a flag-enabled lab")
        challenge = body.challenge.strip()
        expected = juice_flag(row["ctf_key"], challenge)
        if not hmac.compare_digest(expected, body.flag.lower()):
            event(db, "range_flag_rejected", attempt_id, challenge)
            return {"correct": False, "challenge": challenge}
        duplicate = db.execute("SELECT 1 FROM range_solves WHERE attempt_id=? AND challenge=?",
                               (attempt_id, challenge)).fetchone()
        if not duplicate:
            db.execute("INSERT INTO range_solves(attempt_id,challenge,solved_at) VALUES(?,?,?)",
                       (attempt_id, challenge, timestamp()))
            event(db, "range_flag_verified", attempt_id, challenge)
        return {"correct": True, "challenge": challenge, "duplicate": bool(duplicate),
                "solves": db.execute("SELECT count(*) FROM range_solves WHERE attempt_id=?",
                                     (attempt_id,)).fetchone()[0]}
