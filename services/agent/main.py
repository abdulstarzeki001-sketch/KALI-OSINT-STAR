"""Authenticated STAR AI Agent HTTP and MCP task APIs.

Run in an isolated deployment with a private Qwen CPU inference URL. This is
NOT the existing public website or its Terminal service.
"""
import os
from pathlib import Path
import re
from typing import Any
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from .core import Executor, Model, Engine, Store

def create_app(engine:Engine|None=None,secret:str|None=None)->FastAPI:
    secret=secret if secret is not None else os.getenv('STAR_AGENT_API_KEY','')
    if len(secret)<32 or secret.startswith('CHANGE_ME'):
        raise RuntimeError('STAR_AGENT_API_KEY must contain 32+ random characters')
    if engine is None:
        cpu_key=os.getenv('STAR_CPU_API_KEY','')
        if len(cpu_key)<32:raise RuntimeError('STAR_CPU_API_KEY is required')
        state=Path(os.getenv('STAR_AGENT_STATE_DIR','/data'))
        executor=Executor(Path(os.getenv('STAR_AGENT_WORKSPACE','/workspace')),state,
                          os.getenv('STAR_AGENT_BROWSER_HOSTS','').split(','))
        model=Model(os.getenv('STAR_MODEL_URL','http://star-ai-cpu:8080/v1'),
                    cpu_key,os.getenv('STAR_MODEL_ID','star-ai-cpu'))
        engine=Engine(executor,model,Store(state/'agent-tasks.sqlite'))
    app=FastAPI(title='STAR AI CPU Agent',docs_url=None,openapi_url=None,redoc_url=None)
    app.state.engine=engine
    public=Path(__file__).resolve().parent/'static'/'index.html'

    @app.middleware('http')
    async def security(request:Request,call_next):
        # Forbid all browser cross-origin API calls; do not enable CORS.
        if request.method in ('POST','PUT','PATCH','DELETE'):
            origin=request.headers.get('origin')
            if origin and origin!=str(request.base_url).rstrip('/'):
                return JSONResponse({'error':'Cross-origin requests refused'},status_code=403)
        res=await call_next(request)
        res.headers['Cache-Control']='no-store'
        res.headers['X-Content-Type-Options']='nosniff'
        res.headers['Referrer-Policy']='no-referrer'
        res.headers['X-Frame-Options']='DENY'
        res.headers['Content-Security-Policy']="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; base-uri 'none'; form-action 'self'"
        return res

    def auth(req:Request):
        value=req.headers.get('authorization','')
        import secrets
        if not value.startswith('Bearer ') or not secrets.compare_digest(value[7:],secret):
            raise HTTPException(401,'Invalid agent access token')

    @app.get('/',response_class=HTMLResponse)
    async def home():
        return HTMLResponse(public.read_text(encoding='utf-8'))
    @app.get('/health')
    async def health():
        return {'ok':True,'service':'star-agent-cpu','tool_mode':'approval-gated',
                'model_configured':True,'browser_hosts':sorted(engine.executor.hosts)}
    @app.post('/api/tasks',status_code=202)
    async def submit(req:Request):
        auth(req)
        try:
            data=await req.json()
            task=await engine.submit(data.get('prompt',''))
            return task.public()
        except (ValueError,AttributeError,TypeError) as exc:
            raise HTTPException(422,str(exc))
    @app.get('/api/tasks/{id}')
    async def status(id:str,req:Request):
        auth(req)
        if not re.fullmatch('[0-9a-f]{24}',id):raise HTTPException(404,'Task missing')
        obj=engine.fetch(id)
        if obj is None:raise HTTPException(404,'Task missing')
        return obj
    @app.post('/api/tasks/{id}/decide')
    async def decide(id:str,req:Request):
        auth(req)
        if not re.fullmatch('[0-9a-f]{24}',id):raise HTTPException(404,'Task missing')
        try:
            d=await req.json()
            if type(d.get('approve')) is not bool:raise ValueError('approve must be boolean')
            return (await engine.decide(id,d['approve'])).public()
        except (ValueError,TypeError) as e:
            raise HTTPException(409,str(e))
    @app.get('/api/tasks/{id}/screenshot')
    async def screenshot(id:str,req:Request):
        auth(req)
        if not re.fullmatch('[0-9a-f]{24}',id) or not engine.fetch(id):
            raise HTTPException(404,'Task missing')
        image=engine.executor.state/'screenshots'/f'{id}.png'
        if not image.is_file():raise HTTPException(404,'Screenshot missing')
        return FileResponse(image,media_type='image/png',headers={'Cache-Control':'no-store'})

    @app.post('/mcp')
    async def mcp(req:Request):
        auth(req)
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
                    t=await engine.submit(arguments.get('prompt',''))
                    data=t.public()
                elif params.get('name')=='star_agent_status':
                    data=engine.fetch(arguments.get('task_id',''))
                    if data is None:raise ValueError('Unknown task')
                else:raise ValueError('Unknown tool')
                result={'content':[{'type':'text','text':__import__('json').dumps(data,ensure_ascii=False)}]}
            else:return JSONResponse({'jsonrpc':'2.0','id':id,'error':{'code':-32601,'message':'Method not found'}})
            return {'jsonrpc':'2.0','id':id,'result':result}
        except (ValueError,AttributeError,TypeError) as e:
            return {'jsonrpc':'2.0','id':None,'error':{'code':-32602,'message':str(e)[:160]}}
    return app

app=create_app()
