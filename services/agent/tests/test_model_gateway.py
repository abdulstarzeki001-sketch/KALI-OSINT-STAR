"""Gateway-backed planner tests: real API shape, no unapproved execution."""
import json

import httpx
import pytest

from services.agent.cloudflare_planner import CloudflarePlanner

URL="https://star-ai-minis-v2.abdulstarzeki001.workers.dev/v1/chat/completions"
KEY="test-owner-model-gateway-key-strong-000001"

@pytest.mark.asyncio
async def test_keyed_planner_converts_model_json_into_approved_tool_plan():
    requests=[]
    def respond(req):
        requests.append(req)
        assert req.url == URL
        assert req.headers["authorization"] == "Bearer "+KEY
        assert "cf-access-token" not in req.headers
        body=json.loads(req.content)
        assert body["model"]=="star-ai-pro"
        assert body["stream"] is False
        assert "Available tools" in body["messages"][0]["content"]
        return httpx.Response(200,json={"choices":[{"message":{"role":"assistant","content":
            '{"action":"tool","name":"read_file","arguments":{"path":"README.md"}}'}}]})
    agent=CloudflarePlanner(URL,model_key=KEY,transport=httpx.MockTransport(respond))
    assert agent.requires_owner_access is False
    response=await agent.complete([{"role":"user","content":"افحص README"}])
    assert response["tool_calls"][0]["function"]["name"]=="read_file"
    assert len(requests)==1

@pytest.mark.asyncio
async def test_fail_closed_on_bad_model_auth_and_non_json():
    for result in [
        httpx.Response(401,json={"error":{"message":"invalid key"}}),
        httpx.Response(200,text="not json"),
        httpx.Response(200,json={"choices":[]}),
    ]:
        agent=CloudflarePlanner(URL,model_key=KEY,
                               transport=httpx.MockTransport(lambda req:result))
        with pytest.raises(ValueError):
            await agent.complete([{"role":"user","content":"test"}])

def test_keyed_gateway_is_pinned_and_key_is_never_added_to_prompt():
    for bad_url in [
        "https://evil.invalid/v1/chat/completions",
        "http://star-ai-minis-v2.abdulstarzeki001.workers.dev/v1/chat/completions",
        "https://star-ai-minis-v2.abdulstarzeki001.workers.dev:8443/v1/chat/completions",
        "https://star-ai-minis-v2.abdulstarzeki001.workers.dev/v1/chat/completions?redirect=evil",
        "https://star-ai-minis-v2.abdulstarzeki001.workers.dev/v1/models",
    ]:
        with pytest.raises(ValueError):CloudflarePlanner(bad_url,model_key=KEY)
    with pytest.raises(ValueError):CloudflarePlanner(URL,model_key="weak")
    with pytest.raises(ValueError):
        CloudflarePlanner("https://kali-osint-star.pages.dev/api/agent/inference",
                          model_key=KEY)
    agent=CloudflarePlanner(URL,model_key=KEY)
    assert KEY not in agent.build_prompt([{"role":"user","content":"hello"}])
