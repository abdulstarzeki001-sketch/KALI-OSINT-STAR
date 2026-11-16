from fastapi.testclient import TestClient
from app.main import app
client=TestClient(app)
def test_health():
    assert client.get("/api/v1/health").json()["mode"]=="training-only"
def test_capabilities():
    payload=client.get("/api/v1/capabilities").json()
    assert payload["remote_execution"] is False
    assert payload["vulnerability_scanning"] is False
def test_no_remote_shell():
    for route in ("/api/v1/execute","/api/v1/terminal","/api/v1/scan"):
        assert client.post(route,json={"command":"id"}).status_code==404
