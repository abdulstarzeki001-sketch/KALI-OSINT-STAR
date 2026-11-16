"""Security regression tests for explicitly approved, local-only operations."""
import pytest
from fastapi.testclient import TestClient
from app.main import app

OP = "test-operator-token-value-with-over-32-characters"
APPROVER = "test-approver-token-value-with-over-32-characters"
AUTH = {"Authorization": "Bearer " + OP}
APPROVE = {**AUTH, "X-STAR-APPROVAL": APPROVER}

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("STAR_OPERATOR_TOKEN", OP)
    monkeypatch.setenv("STAR_APPROVAL_TOKEN", APPROVER)
    monkeypatch.setenv("STAR_LAB_CIDRS", "192.168.56.0/24")
    monkeypatch.setenv("STAR_DB_PATH", str(tmp_path / "jobs.sqlite"))
    return TestClient(app)

def test_auth_required_and_fail_closed(client, monkeypatch):
    assert client.get("/api/v1/jobs").status_code == 401
    assert client.get("/api/v1/jobs", headers=AUTH).status_code == 200
    assert client.get("/api/v1/jobs", headers=AUTH).headers["Cache-Control"] == "no-store"
    monkeypatch.delenv("STAR_APPROVAL_TOKEN")
    assert client.get("/api/v1/jobs", headers=AUTH).status_code == 503

def test_approve_then_run_once(client):
    job = client.post("/api/v1/jobs", headers=AUTH, json={"kind": "system_inventory"})
    assert job.status_code == 201
    id = job.json()["id"]
    assert job.json()["status"] == "pending_approval"
    assert client.post("/api/v1/jobs/" + id + "/run", headers=AUTH).status_code == 409
    assert client.post("/api/v1/jobs/" + id + "/approve", headers=AUTH,
        json={"reason": "Authorized local training", "scope_confirmed": True}).status_code == 403
    assert client.post("/api/v1/jobs/" + id + "/approve", headers=APPROVE,
        json={"reason": "Authorized local training", "scope_confirmed": False}).status_code == 422
    result = client.post("/api/v1/jobs/" + id + "/approve", headers=APPROVE,
        json={"reason": "Authorized local training", "scope_confirmed": True})
    assert result.status_code == 200
    assert result.json()["status"] == "approved"
    done = client.post("/api/v1/jobs/" + id + "/run", headers=AUTH)
    assert done.json()["status"] == "completed"
    assert done.json()["result"]["source"] == "local_python"
    assert client.post("/api/v1/jobs/" + id + "/run", headers=AUTH).status_code == 409
    events = client.get("/api/v1/audit", headers=AUTH).json()["events"]
    assert [e["action"] for e in events][:3] == ["job_finished", "job_started", "job_approved"]
    assert OP not in str(events) and APPROVER not in str(events)

def test_shell_not_supported_and_scope_restricted(client):
    assert client.post("/api/v1/jobs", headers=AUTH,
        json={"kind": "shell", "command": "id"}).status_code == 422
    for target in ("8.8.8.8", "127.0.0.1", "169.254.169.254", "example.com", "192.168.57.5"):
        result = client.post("/api/v1/jobs", headers=AUTH,
            json={"kind": "lab_port_check", "target": target, "port": 443})
        assert result.status_code in (403, 422)
    assert client.post("/api/v1/jobs", headers=AUTH,
        json={"kind": "lab_port_check", "target": "192.168.56.10", "port": 4444}).status_code == 422
    job = client.post("/api/v1/jobs", headers=AUTH,
        json={"kind": "lab_port_check", "target": "192.168.56.10", "port": 443})
    assert job.status_code == 201
    id = job.json()["id"]
    assert client.post("/api/v1/jobs/" + id + "/cancel", headers=AUTH).json()["status"] == "cancelled"

def test_local_tool_inventory(client):
    job = client.post("/api/v1/jobs", headers=AUTH, json={"kind": "tool_inventory"}).json()
    client.post("/api/v1/jobs/" + job["id"] + "/approve", headers=APPROVE,
        json={"reason": "Inventory installed local tools", "scope_confirmed": True})
    output = client.post("/api/v1/jobs/" + job["id"] + "/run", headers=AUTH).json()
    assert isinstance(output["result"]["installed"], dict)
    assert output["result"]["source"] == "local_path_check_no_execution"

def test_private_only_configuration(client, monkeypatch):
    monkeypatch.setenv("STAR_LAB_CIDRS", "0.0.0.0/0")
    assert client.post("/api/v1/jobs", headers=AUTH,
        json={"kind": "lab_port_check", "target": "192.168.56.10", "port": 443}).status_code == 503
