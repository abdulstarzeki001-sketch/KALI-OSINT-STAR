"""Authenticated STAR AI Agent HTTP and MCP task APIs.

Run in an isolated deployment with a private Qwen CPU inference URL. This is
NOT the existing public website or its Terminal service.
"""
import os
import asyncio
from pathlib import Path
import re
from typing import Any
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from .core import Executor, Model, Engine, Store
from .cloudflare_planner import CloudflarePlanner
from .access_auth import AccessVerifier

def create_app(engine:Engine|None=None,secret:str|None=None)->FastAPI:
    secret=secret if secret is not None else os.getenv('STAR_AGENT_API_KEY','')
    if secret and (len(secret)<32 or secret.startswith('CHANGE_ME')):
        raise RuntimeError('STAR_AGENT_API_KEY must contain 32+ random characters')
    access_verifier=AccessVerifier(
        os.getenv('STAR_AGENT_ACCESS_TEAM_DOMAIN',''),
        os.getenv('STAR_AGENT_ACCESS_AUD',''),
        os.getenv('STAR_AGENT_ACCESS_ALLOWED_EMAILS',''))
    if not secret and not access_verifier.enabled:
        raise RuntimeError('Configure signed Cloudflare Access or a strong owner API key')
    if engine is None:
        state=Path(os.getenv('STAR_AGENT_STATE_DIR','/data'))
        executor=Executor(Path(os.getenv('STAR_AGENT_WORKSPACE','/workspace')),state,
                          os.getenv('STAR_AGENT_BROWSER_HOSTS','').split(','))
        backend=os.getenv('STAR_MODEL_BACKEND','cpu').strip().lower()
        if backend=='cloudflare':
            model_key=os.getenv('STAR_AGENT_MODEL_KEY','')
            if not access_verifier.enabled and len(secret)<32:
                raise RuntimeError('Configure Cloudflare Access or a strong owner API key')
            model=CloudflarePlanner(os.getenv('STAR_CLOUDFLARE_MODEL_URL',
                'https://kali-osint-star.pages.dev/api/agent/inference'),
                model_key=model_key)
        elif backend=='cpu':
            cpu_key=os.getenv('STAR_CPU_API_KEY','')
            if len(cpu_key)<32:raise RuntimeError('STAR_CPU_API_KEY is required in CPU model mode')
            model=Model(os.getenv('STAR_MODEL_URL','http://star-ai-cpu:8080/v1'),
                        cpu_key,os.getenv('STAR_MODEL_ID','star-ai-cpu'))
        else:raise RuntimeError('STAR_MODEL_BACKEND must be cloudflare or cpu')
        engine=Engine(executor,model,Store(state/'agent-tasks.sqlite'))
    app=FastAPI(title='STAR AI CPU Agent',docs_url=None,openapi_url=None,redoc_url=None)
    app.state.engine=engine
    app.state.model_probe={'state':'not_run'}
    public=Path(__file__).resolve().parent/'static'/'index.html'

    @app.middleware('http')
    async def security(request:Request,call_next):
        # Forbid all browser cross-origin API calls; do not enable CORS.
        if request.method in ('POST','PUT','PATCH','DELETE'):
            origin=request.headers.get('origin')
            # Compare origins by hostname; HTTPS reverse proxies may connect to the app over HTTP.
            from urllib.parse import urlparse
            host=request.headers.get('host','').lower()
            parsed=urlparse(origin) if origin else None
            if origin and (parsed.scheme not in ('https','http') or parsed.netloc.lower()!=host):
                return JSONResponse({'error':'Cross-origin requests refused'},status_code=403)
        res=await call_next(request)
        res.headers['Cache-Control']='no-store'
        res.headers['X-Content-Type-Options']='nosniff'
        res.headers['Referrer-Policy']='no-referrer'
        res.headers['X-Frame-Options']='DENY'
        res.headers['Content-Security-Policy']="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; base-uri 'none'; form-action 'self'"
        return res

    async def auth(req:Request):
        value=req.headers.get('authorization','')
        import secrets
        if not value.startswith('Bearer '):
            raise HTTPException(401,'Invalid agent access token')
        token=value[7:]
        if len(secret)>=32 and len(token)<=256 and secrets.compare_digest(token,secret):
            return {'owner':'admin','token':None}
        identity=await access_verifier.verify(token)
        if identity:
            return {'owner':identity['sub'] or identity['email'],'token':token}
        raise HTTPException(401,'Invalid signed Access session')

    def owner_check(id:str,session:dict):
        current=engine.tasks.get(id)
        if current and current.owner_id and session['owner']!='admin' and current.owner_id!=session['owner']:
            raise HTTPException(403,'Task belongs to another owner')
        if not current and session['owner']!='admin':
            # Recovered tasks have no live owner approval context. Do not leak
            # them to a different browser session after container restart.
            raise HTTPException(404,'Task not active')


    async def run_model_probe():
        app.state.model_probe={'state':'running'}
        try:
            answer=await asyncio.wait_for(engine.model.complete([
                {'role':'user','content':
                    'Health check. Respond with exactly one JSON object: '
                    '{"action":"finish","message":"STAR_AGENT_PROBE_OK"}. '
                    'Do not request tools or browse.'}
            ]),timeout=65)
            if isinstance(answer,dict) and answer.get('content')=='STAR_AGENT_PROBE_OK':
                app.state.model_probe={'state':'ok'}
            else:
                app.state.model_probe={'state':'invalid_action'}
        except Exception as exc:
            app.state.model_probe={'state':'failed','error_type':type(exc).__name__}
        print('STAR_AGENT_MODEL_PROBE '+app.state.model_probe['state'],flush=True)

    @app.on_event('startup')
    async def startup_model_probe():
        # Nonblocking one-shot test; never spend model tokens on routine health probes.
        if (os.getenv('STAR_AGENT_STARTUP_PROBE')=='1'
                and isinstance(engine.model,CloudflarePlanner)
                and not engine.model.requires_owner_access):
            asyncio.create_task(run_model_probe())

    @app.get('/',response_class=HTMLResponse)
    async def home():
        return HTMLResponse(public.read_text(encoding='utf-8'))
    @app.get('/health')
    async def health():
        return {'ok':True,'service':'star-agent-cpu','tool_mode':'approval-gated',
                'model_endpoint_configured':True,'model_backend':(
                  'cloudflare' if isinstance(engine.model,CloudflarePlanner) else 'cpu'),
                'live_inference_tested':app.state.model_probe['state']=='ok',
                'model_probe':app.state.model_probe,'allowed_host_count':len(engine.executor.hosts)}
    @app.post('/api/tasks',status_code=202)
    async def submit(req:Request):
        session=await auth(req)
        try:
            data=await req.json()
            task=await engine.submit(data.get('prompt',''),
                access_token=session['token'],owner_id=session['owner'])
            return task.public()
        except (ValueError,AttributeError,TypeError) as exc:
            raise HTTPException(422,str(exc))
    @app.get('/api/tasks/{id}')
    async def status(id:str,req:Request):
        session=await auth(req)
        if not re.fullmatch('[0-9a-f]{24}',id):raise HTTPException(404,'Task missing')
        owner_check(id,session)
        obj=engine.fetch(id)
        if obj is None:raise HTTPException(404,'Task missing')
        return obj
    @app.post('/api/tasks/{id}/decide')
    async def decide(id:str,req:Request):
        session=await auth(req)
        if not re.fullmatch('[0-9a-f]{24}',id):raise HTTPException(404,'Task missing')
        owner_check(id,session)
        try:
            d=await req.json()
            if type(d.get('approve')) is not bool:raise ValueError('approve must be boolean')
            return (await engine.decide(id,d['approve'],access_token=session['token'])).public()
        except (ValueError,TypeError) as e:
            raise HTTPException(409,str(e))
    @app.get('/api/tasks/{id}/screenshot')
    async def screenshot(id:str,req:Request):
        session=await auth(req)
        if not re.fullmatch('[0-9a-f]{24}',id) or not engine.fetch(id):
            raise HTTPException(404,'Task missing')
        owner_check(id,session)
        image=engine.executor.state/'screenshots'/f'{id}.png'
        if not image.is_file():raise HTTPException(404,'Screenshot missing')
        return FileResponse(image,media_type='image/png',headers={'Cache-Control':'no-store'})

    @app.post('/mcp')
    async def mcp(req:Request):
        session=await auth(req)
        try:
            rpc=await req.json()
            method=rpc.get('method')
            id=rpc.get('id')
            if method=='notifications/initialized':return JSONResponse({},status_code=202)
            if method=='initialize':
                result={'protocolVersion':'2025-06-18','capabilities':{'tools':{}},
                        'serverInfo':{'name':'STAR CPU Agent','version':'1.0.0'}}
            elif method=='tools/list':
                result={'tools':[
                    {'name':'star_agent_submit','description':'Submit a task to the owner-controlled CPU agent; sensitive actions will require human approval in the agent console',
                     'inputSchema':{'type':'object','properties':{'prompt':{'type':'string'}},'required':['prompt']}},
                    {'name':'star_agent_status','description':'Read task progress and pending approval',
                     'inputSchema':{'type':'object','properties':{'task_id':{'type':'string'}},'required':['task_id']}}
                ]}
            elif method=='tools/call':
                params=rpc.get('params') or {}
                arguments=params.get('arguments') or {}
                if params.get('name')=='star_agent_submit':
                    t=await engine.submit(arguments.get('prompt',''),access_token=session['token'],owner_id=session['owner'])
                    data=t.public()
                elif params.get('name')=='star_agent_status':
                    task_id=arguments.get('task_id','')
                    if not isinstance(task_id,str) or not re.fullmatch('[0-9a-f]{24}',task_id):
                        raise ValueError('Invalid task ID')
                    owner_check(task_id,session)
                    data=engine.fetch(task_id)
                    if data is None:raise ValueError('Unknown task')
                else:raise ValueError('Unknown tool')
                result={'content':[{'type':'text','text':__import__('json').dumps(data,ensure_ascii=False)}]}
            else:return JSONResponse({'jsonrpc':'2.0','id':id,'error':{'code':-32601,'message':'Method not found'}})
            return {'jsonrpc':'2.0','id':id,'result':result}
        except (ValueError,AttributeError,TypeError) as e:
            return {'jsonrpc':'2.0','id':None,'error':{'code':-32602,'message':str(e)[:160]}}
    return app

# Uvicorn imports this as a factory, so tests can inject an isolated engine.
