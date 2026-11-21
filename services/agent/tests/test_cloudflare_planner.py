import json
import httpx
import pytest
from services.agent.cloudflare_planner import CloudflarePlanner,parse_action

def test_parser_accepts_only_allowlisted_json_actions():
    result=parse_action('{"action":"tool","name":"read_file","arguments":{"path":"README.md"}}')
    assert result['tool_calls'][0]['function']['name']=='read_file'
    assert json.loads(result['tool_calls'][0]['function']['arguments'])=={'path':'README.md'}
    for bad in [
      '{"action":"tool","name":"approve","arguments":{"approve":true}}',
      '{"action":"tool","name":"shell","arguments":{"command":"rm -rf /"}}',
      '{"action":"tool","name":"read_file","arguments":"README.md"}'
    ]:assert not parse_action(bad).get('tool_calls')
    assert parse_action('{"action":"finish","message":"تم الفحص"}')['content']=='تم الفحص'

@pytest.mark.asyncio
async def test_model_adapter_returns_real_http_plan_without_executing_it():
    requests=[]
    def answer(req):
        requests.append(req)
        body=json.loads(req.content)
        assert 'Available tools' in body['prompt']
        return httpx.Response(200,json={'status':'completed','reply':
           '{"action":"tool","name":"list_files","arguments":{"path":"."}}'})
    planner=CloudflarePlanner('https://kali-osint-star.pages.dev/api/agent/inference',
        transport=httpx.MockTransport(answer))
    r=await planner.complete([{'role':'user','content':'افحص الملفات'}],'signed-access-test-token')
    assert r['tool_calls'][0]['function']['name']=='list_files'
    assert len(requests)==1
    assert requests[0].headers['cf-access-token']=='signed-access-test-token'

@pytest.mark.asyncio
async def test_access_redirect_and_absent_token_fail_closed():
    planner=CloudflarePlanner('https://kali-osint-star.pages.dev/api/agent/inference',
       transport=httpx.MockTransport(lambda request:httpx.Response(
           302,headers={'location':'/cdn-cgi/access/login'})))
    with pytest.raises(ValueError,match='Access rejected'):
        await planner.complete([{'role':'user','content':'test'}],'sample-token')
    with pytest.raises(ValueError,match='Access session'):
        await planner.complete([{'role':'user','content':'test'}],None)

def test_model_url_restriction_prevents_ssrf():
    for url in ['http://kali-osint-star.pages.dev/api/ai/chat',
       'https://evil.test/api/ai/chat',
       'https://kali-osint-star.pages.dev:8443/api/ai/chat',
       'https://kali-osint-star.pages.dev/api/ai/chat?u=https://evil.test']:
        with pytest.raises(ValueError):CloudflarePlanner(url)
