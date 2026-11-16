import time
import pytest
from fastapi.testclient import TestClient
from app.main import app
AUTH={"Authorization":"Bearer operator-token-longer-than-thirty-two-chars"}
APP={**AUTH,"X-STAR-APPROVAL":"approval-token-longer-than-thirty-two-chars"}
@pytest.fixture
def client(tmp_path,monkeypatch):
    monkeypatch.setenv("STAR_OPERATOR_TOKEN",AUTH["Authorization"][7:])
    monkeypatch.setenv("STAR_APPROVAL_TOKEN",APP["X-STAR-APPROVAL"])
    monkeypatch.setenv("STAR_DB_PATH",str(tmp_path/"jobs.db"))
    monkeypatch.delenv("STAR_ENABLE_TOOL_HELP",raising=False)
    with TestClient(app) as c:yield c
def test_catalog_requires_auth(client):
    assert client.get("/api/v1/tooling/catalog").status_code==401
    v=client.get("/api/v1/tooling/catalog",headers=AUTH).json()
    assert len(v["tools"])==15
    assert all(t["actions"]==["inspect"] for t in v["tools"])
def test_tool_approval_and_inventory(client):
    p=client.post("/api/v1/tooling/jobs",headers=AUTH,json={"tool_id":"mimikatz","action":"inspect"})
    assert p.status_code==201
    uid=p.json()["id"]
    assert client.post(f"/api/v1/tooling/jobs/{uid}/run",headers=AUTH).status_code==409
    assert client.post(f"/api/v1/tooling/jobs/{uid}/approve",headers=AUTH,json={"reason":"Authorized local lab","scope_confirmed":True}).status_code==403
    ok=client.post(f"/api/v1/tooling/jobs/{uid}/approve",headers=APP,json={"reason":"Authorized local lab","scope_confirmed":True})
    assert ok.status_code==200
    assert client.post(f"/api/v1/tooling/jobs/{uid}/run",headers=AUTH).status_code==200
    for _ in range(50):
        row=next(j for j in client.get("/api/v1/tooling/jobs",headers=AUTH).json()["jobs"] if j["id"]==uid)
        if row["status"] in ("completed","failed"):break
        time.sleep(.03)
    assert row["status"]=="completed"
    assert row["result"]["executed"] is False
    assert client.post(f"/api/v1/tooling/jobs/{uid}/run",headers=AUTH).status_code==409
def test_rejects_unsafe_actions(client):
    for body in ({"tool_id":"frida","action":"shell"},{"tool_id":"mimikatz","action":"help"},
                 {"tool_id":"frida","action":"inspect","command":"id"},
                 {"tool_id":"frida","action":"help"}):
        assert client.post("/api/v1/tooling/jobs",headers=AUTH,json=body).status_code==422
def test_cancel(client):
    uid=client.post("/api/v1/tooling/jobs",headers=AUTH,json={"tool_id":"frida"}).json()["id"]
    assert client.post(f"/api/v1/tooling/jobs/{uid}/cancel",headers=AUTH).json()["status"]=="cancelled"
