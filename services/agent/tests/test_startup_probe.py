import time
import httpx
from fastapi.testclient import TestClient
from services.agent.core import Executor, Engine, Store
from services.agent.cloudflare_planner import CloudflarePlanner
from services.agent.main import create_app

URL="https://star-ai-minis-v2.abdulstarzeki001.workers.dev/v1/chat/completions"
KEY="test-model-secret-strong-123456789012345678901234"

def _client(tmp_path, transport):
    planner=CloudflarePlanner(URL,model_key=KEY,transport=transport)
    engine=Engine(Executor(tmp_path/'workspace',tmp_path/'state',[]),
                  planner,Store(tmp_path/'state'/'tasks.sqlite'))
    return TestClient(create_app(engine,secret="owner-key-strong-00000000000000000000"))

def _await_terminal_state(client):
    for _ in range(60):
        response=client.get("/health")
        assert response.status_code==200
        state=response.json()["model_probe"]["state"]
        if state in {"ok","failed","invalid_action"}:
            return response.json()
        time.sleep(.03)
    raise AssertionError("Startup probe did not finish")

def test_startup_probe_success_without_exposing_token(tmp_path,monkeypatch):
    monkeypatch.setenv("STAR_AGENT_STARTUP_PROBE","1")
    calls=[]
    def respond(request):
        calls.append(request)
        assert request.headers["authorization"]=="Bearer "+KEY
        return httpx.Response(200,json={"choices":[{"message":{"role":"assistant",
            "content":'{"action":"finish","message":"STAR_AGENT_PROBE_OK"}'}}]})
    with _client(tmp_path,httpx.MockTransport(respond)) as client:
        health=_await_terminal_state(client)
        assert health["live_inference_tested"] is True
        assert health["model_probe"]=={"state":"ok"}
        for _ in range(3):client.get("/health")
        assert len(calls)==1
        assert KEY not in str(health)

def test_startup_probe_auth_failure_fails_closed(tmp_path,monkeypatch):
    monkeypatch.setenv("STAR_AGENT_STARTUP_PROBE","1")
    with _client(tmp_path,httpx.MockTransport(lambda request: httpx.Response(401))) as client:
        health=_await_terminal_state(client)
        assert health["live_inference_tested"] is False
        assert health["model_probe"]["state"]=="failed"
        assert health["model_probe"]["error_category"]=="auth_rejected"

def test_startup_probe_is_opt_in(tmp_path,monkeypatch):
    monkeypatch.delenv("STAR_AGENT_STARTUP_PROBE",raising=False)
    with _client(tmp_path,httpx.MockTransport(lambda request: (_ for _ in ()).throw(
        AssertionError("must not send inference request")))) as client:
        health=client.get("/health").json()
        assert health["live_inference_tested"] is False
        assert health["model_probe"]["state"]=="not_run"
