import asyncio
import time
from fastapi.testclient import TestClient
from services.agent.core import Executor, Engine, Store
from services.agent.main import create_app

TOKEN='t'*48
class FixedModel:
    async def complete(self,messages):
        return {'content':'فحص ناجح'}

def test_api_auth_tasks_and_mcp(tmp_path):
    ex=Executor(tmp_path/'repo',tmp_path/'data',[])
    engine=Engine(ex,FixedModel(),Store(tmp_path/'history.sqlite'))
    app=create_app(engine,secret=TOKEN)
    with TestClient(app) as c:
        assert c.get('/health').status_code==200
        assert c.post('/api/tasks',json={'prompt':'test'}).status_code==401
        headers={'Authorization':'Bearer '+TOKEN}
        r=c.post('/api/tasks',json={'prompt':'افحص الملفات'},headers=headers)
        assert r.status_code==202
        id=r.json()['id']
        for _ in range(40):
            view=c.get('/api/tasks/'+id,headers=headers)
            if view.json()['status']=='completed':break
            time.sleep(.02)
        assert view.status_code==200
        assert view.json()['result']=='فحص ناجح'
        assert c.get('/api/tasks/'+id+'/screenshot',headers=headers).status_code==404
        assert c.get('/api/tasks/'+id+'/screenshot').status_code==401
        assert c.post('/api/tasks/'+id+'/decide',json={'approve':True},headers=headers).status_code==409
        init=c.post('/mcp',json={'jsonrpc':'2.0','id':1,'method':'initialize'},headers=headers)
        assert init.status_code==200
        assert init.json()['result']['serverInfo']['name']=='STAR CPU Agent'
        listing=c.post('/mcp',json={'jsonrpc':'2.0','id':2,'method':'tools/list'},headers=headers).json()['result']['tools']
        assert {x['name'] for x in listing}=={'star_agent_submit','star_agent_status'}
        assert c.post('/mcp',json={'jsonrpc':'2.0','id':2,'method':'tools/list'}).status_code==401

def test_task_validation_and_origin(tmp_path):
    ex=Executor(tmp_path/'repo',tmp_path/'data',[])
    app=create_app(Engine(ex,FixedModel(),Store(tmp_path/'db.sqlite')),secret=TOKEN)
    with TestClient(app) as c:
        h={'Authorization':'Bearer '+TOKEN}
        assert c.post('/api/tasks',json={'prompt':''},headers=h).status_code==422
        assert c.post('/api/tasks',json={'prompt':'hi'},headers={**h,'Origin':'https://attacker.invalid'}).status_code==403
        assert c.get('/api/tasks/../../.env',headers=h).status_code in (404,422)
        assert 'STAR AI Agent' in c.get('/').text
