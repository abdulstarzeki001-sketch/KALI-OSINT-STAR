import asyncio
import time
from fastapi.testclient import TestClient
from services.agent.access_auth import AccessVerifier
from services.agent.core import Executor,Engine,Store
from services.agent.cloudflare_planner import CloudflarePlanner
from services.agent.main import create_app

class ReadOnlyModel:
    requires_owner_access=True
    async def complete(self,messages,token):
        assert token in {'signed-session-one','signed-session-two'}
        return {'content':'نهاية المهمة مع مخرجات'}
def app_with_agent(tmp_path,monkeypatch):
    async def fake_verify(self,token):
        if token=='signed-session-one':return {'sub':'owner-1','email':'one@test.local'}
        if token=='signed-session-two':return {'sub':'owner-2','email':'two@test.local'}
        return None
    monkeypatch.setattr(AccessVerifier,'verify',fake_verify)
    engine=Engine(Executor(tmp_path/'workspace',tmp_path/'state',[]),
                 ReadOnlyModel(),Store(tmp_path/'state'/'tasks.sqlite'))
    return create_app(engine,secret='s'*48),engine

def test_authenticated_owner_submits_sees_own_task_but_other_owner_is_denied(tmp_path,monkeypatch):
    app,engine=app_with_agent(tmp_path,monkeypatch)
    with TestClient(app) as c:
        h={'Authorization':'Bearer signed-session-one'}
        t=c.post('/api/tasks',headers=h,json={'prompt':'اقرأ README'});assert t.status_code==202
        id=t.json()['id']
        assert c.get('/api/tasks/'+id,headers={'Authorization':'Bearer signed-session-two'}).status_code==403
        assert c.get('/api/tasks/'+id).status_code==401
        for _ in range(30):
            r=c.get('/api/tasks/'+id,headers=h)
            if r.json()['status']=='completed':break
            time.sleep(.02)
        assert r.status_code==200
        assert r.json()['result']=='نهاية المهمة مع مخرجات'
        assert 'access_token' not in str(r.json())

def test_no_cloudflare_backend_without_access_credentials(tmp_path,monkeypatch):
    engine=Engine(Executor(tmp_path/'workspace',tmp_path/'state',[]),
                  ReadOnlyModel(),Store(tmp_path/'state'/'tasks.sqlite'))
    app=create_app(engine,secret='s'*48)
    with TestClient(app) as c:
        r=c.post('/api/tasks',headers={'Authorization':'Bearer '+'s'*48},
                 json={'prompt':'inspect'})
        assert r.status_code==422
        assert 'signed Cloudflare Access' in r.text

def test_access_token_is_ephemeral_after_task_completion(tmp_path):
    engine=Engine(Executor(tmp_path/'workspace',tmp_path/'state',[]),
                  ReadOnlyModel(),Store(tmp_path/'state'/'tasks.sqlite'))
    async def run():
        t=await engine.submit('inspect',access_token='signed-session-one',owner_id='owner-1')
        for _ in range(30):
            if t.status=='completed':break
            await asyncio.sleep(.02)
        assert t.status=='completed'
        assert t.access_token is None
        assert 'signed-session-one' not in str(t.public())
        assert 'signed-session-one' not in str(engine.store.get(t.id))
    asyncio.run(run())
