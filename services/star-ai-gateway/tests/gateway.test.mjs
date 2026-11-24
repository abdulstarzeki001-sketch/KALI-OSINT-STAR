import test from 'node:test';
import assert from 'node:assert/strict';
import {createGateway,auditArtifact,redactSecrets,modelCatalog} from '../gateway.mjs';

const TOKEN='test-gateway-token-with-at-least-32-characters';
const ENV={
  STAR_GATEWAY_TOKEN:TOKEN,
  STAR_PROVIDER_TEST_KEY:'upstream-private-key-for-tests',
  STAR_MODELS_JSON:JSON.stringify([{id:'qwen-coder',baseUrl:'https://models.example.org/v1',
    upstreamModel:'Qwen/Qwen3-Coder',keyEnv:'STAR_PROVIDER_TEST_KEY'}])
};
function request(path,body,key=TOKEN,method='POST') {
  return new Request('http://localhost:8080'+path,{
    method,headers:{authorization:'Bearer '+key,...(body!==undefined?{'content-type':'application/json'}:{})},
    ...(body!==undefined?{body:JSON.stringify(body)}:{})
  });
}
const fakeAnswer={id:'upstream-test',choices:[{message:{content:'Verified mock provider answer'}}]};
function fixture(overrides={}) {
  const calls=[];
  const handler=createGateway({env:{...ENV,...overrides},
    fetchImpl:async(url,options)=>{
      calls.push({url,options});
      return new Response(JSON.stringify(fakeAnswer),{status:200,headers:{'content-type':'application/json'}});
    }});
  return {handler,calls};
}
test('health shows whether an upstream credential is configured without exposing it',async()=>{
  const {handler}=fixture({STAR_PROVIDER_TEST_KEY:''});
  const r=await handler(request('/healthz',undefined,'', 'GET'));
  assert.equal(r.status,200);
  const value=await r.json();
  assert.equal(value.local_audit,true);
  assert.equal(value.ai_ready,false);
  assert.equal(JSON.stringify(value).includes('upstream-private-key'),false);
});
test('fails closed without valid gateway auth and never calls provider',async()=>{
  const {handler,calls}=fixture();
  assert.equal((await handler(request('/v1/models',undefined,'wrong','GET'))).status,401);
  assert.equal((await handler(request('/v1/security/audit',{artifact:'eval(x)'},'wrong'))).status,401);
  assert.equal(calls.length,0);
});
test('model listing returns alias only, no upstream URL or credential',async()=>{
  const {handler}=fixture();
  const r=await handler(request('/v1/models',undefined,TOKEN,'GET'));
  const value=await r.json();
  assert.equal(value.data[0].id,'qwen-coder');
  assert.equal(JSON.stringify(value).includes('models.example.org'),false);
});
test('audits evidence locally and returns line numbers without echoing secrets',async()=>{
  const {handler,calls}=fixture();
  const artifact='const fine=true;\nconst password="super-secret-value";\neval(userInput);';
  const r=await handler(request('/v1/security/audit',{artifact,kind:'code'}));
  const out=await r.json();
  assert.equal(r.status,200);
  assert.equal(out.findings.some(x=>x.id==='HARDCODED_SECRET'&&x.line===2),true);
  assert.equal(out.findings.some(x=>x.id==='UNSAFE_EVAL'&&x.line===3),true);
  assert.equal(JSON.stringify(out).includes('super-secret-value'),false);
  assert.equal(calls.length,0);
});
test('sends bounded chat to the operator-configured HTTPS endpoint only',async()=>{
  const {handler,calls}=fixture();
  const r=await handler(request('/v1/chat/completions',{
    model:'qwen-coder',mode:'security',messages:[{role:'user',content:'Review my lab logs'}]
  }));
  assert.equal(r.status,200);
  assert.equal((await r.json()).choices[0].message.content,'Verified mock provider answer');
  assert.equal(calls[0].url,'https://models.example.org/v1/chat/completions');
  assert.equal(JSON.parse(calls[0].options.body).messages[0].role,'system');
  assert.match(calls[0].options.headers.authorization,/upstream-private-key-for-tests/);
});
test('rejects unsupported command endpoints and tool payloads',async()=>{
  const {handler,calls}=fixture();
  assert.equal((await handler(request('/v1/terminal/run',{command:'whoami'}))).status,404);
  const r=await handler(request('/v1/chat/completions',{model:'qwen-coder',
    messages:[{role:'tool',content:'exec'}],tools:[{name:'exec'}]}));
  assert.equal(r.status,422);
  assert.equal(calls.length,0);
});
test('rejects malformed model catalog and private upstream URLs',()=>{
  assert.throws(()=>modelCatalog({STAR_MODELS_JSON:'not-json'}));
  assert.throws(()=>modelCatalog({...ENV,STAR_MODELS_JSON:JSON.stringify([{
    id:'local',upstreamModel:'x',baseUrl:'http://localhost:11434/v1',keyEnv:'STAR_PROVIDER_TEST_KEY'
  }])}));
});
test('sanitizes recognized secrets before sending security review',async()=>{
  const {handler,calls}=fixture();
  const r=await handler(request('/v1/security/review',{
    model:'qwen-coder',kind:'config',artifact:'password="super-secret-value"',
    question:'Identify configuration weaknesses'
  }));
  assert.equal(r.status,200);
  const data=await r.json();
  assert.match(data.analysis,/Verified mock/);
  const providerBody=JSON.stringify(JSON.parse(calls[0].options.body));
  assert.equal(providerBody.includes('super-secret-value'),false);
  assert.equal(JSON.stringify(data).includes('super-secret-value'),false);
  assert.equal(redactSecrets('api_key="abc123456789"').includes('abc123456789'),false);
});
test('invalid bodies and unknown model fail without fallback fake output',async()=>{
  const {handler,calls}=fixture();
  assert.equal((await handler(request('/v1/security/audit',{kind:'oops',artifact:'hello world'}))).status,422);
  assert.equal((await handler(request('/v1/chat/completions',{
    model:'nonexistent',messages:[{role:'user',content:'hi'}]}))).status,503);
  assert.equal(calls.length,0);
});
test('per-instance rate limit blocks the 21st authenticated request',async()=>{
  const {handler}=fixture();
  for(let i=0;i<20;i++)assert.equal((await handler(request('/v1/security/audit',{artifact:'eval(x)'}))).status,200);
  assert.equal((await handler(request('/v1/security/audit',{artifact:'eval(x)'}))).status,429);
});

test('authenticated API root is discoverable without exposing credentials',async()=>{
 const {handler,calls}=fixture();
 const denied=await handler(request('/v1',undefined,'wrong','GET'));
 assert.equal(denied.status,401);
 assert.equal((await denied.json()).error.type,'authentication_error');
 const allowed=await handler(request('/v1',undefined,TOKEN,'GET'));
 assert.equal(allowed.status,200);
 assert.equal((await allowed.json()).text_only,true);
 assert.equal(calls.length,0);
});
test('supports bounded max_completion_tokens and rejects conflicts',async()=>{
 const {handler,calls}=fixture();
 const base={model:'qwen-coder',messages:[{role:'user',content:'Explain unit tests'}]};
 const response=await handler(request('/v1/chat/completions',{...base,max_completion_tokens:512}));
 assert.equal(response.status,200);
 assert.equal(JSON.parse(calls[0].options.body).max_tokens,512);
 assert.ok(Number.isInteger((await response.json()).created));
 assert.equal((await handler(request('/v1/chat/completions',{...base,max_completion_tokens:512,max_tokens:1024}))).status,422);
 assert.equal((await handler(request('/v1/chat/completions',{...base,max_completion_tokens:5000}))).status,422);
 assert.equal(calls.length,1);
});
test('gives actionable errors for excess history and unsupported agent features',async()=>{
 const {handler,calls}=fixture();
 const messages=Array.from({length:6},()=>({role:'user',content:'a'.repeat(4500)}));
 const long=await handler(request('/v1/chat/completions',{model:'qwen-coder',messages}));
 assert.equal(long.status,422);
 assert.equal((await long.json()).error.code,'conversation_too_long');
 const tools=await handler(request('/v1/chat/completions',{model:'qwen-coder',messages:[{role:'user',content:'hello'}],tools:[{type:'function'}]}));
 assert.equal(tools.status,422);
 assert.equal((await tools.json()).error.code,'unsupported_chat_features');
 const malformed=await handler(request('/v1/chat/completions',{model:'qwen-coder',messages:{some:'bad'}}));
 assert.equal(malformed.status,422);
 assert.equal(calls.length,0);
});
test('does not turn internal reasoning into an answer, preserves length stop',async()=>{
 let answer={choices:[{message:{content:'',reasoning:'private reasoning'},finish_reason:'length'}]};
 const handler=createGateway({env:ENV,fetchImpl:async()=>new Response(JSON.stringify(answer),{headers:{'content-type':'application/json'}})});
 const payload={model:'qwen-coder',messages:[{role:'user',content:'hello'}]};
 const empty=await handler(request('/v1/chat/completions',payload));
 assert.equal(empty.status,502);
 const error=await empty.json();
 assert.equal(error.error.code,'provider_reasoning_only');
 assert.equal(JSON.stringify(error).includes('private reasoning'),false);
 answer={choices:[{message:{content:'partial answer'},finish_reason:'length'}]};
 const response=await handler(request('/v1/chat/completions',payload));
 assert.equal((await response.json()).choices[0].finish_reason,'length');
});

test('Railway quick audit matches the iPhone three-line example without sending source',async()=>{
  const {handler,calls}=fixture();
  const artifact=[
    'const password = "demo-test-only";',
    'const input = location.hash.slice(1);',
    'document.body.innerHTML = input;'
  ].join('\n');
  const response=await handler(request('/v1/security/audit',{artifact,kind:'code'}));
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.lines_analyzed,3);
  assert.ok(body.findings.some(x=>x.id==='HARDCODED_SECRET'&&x.line===1));
  assert.ok(body.findings.some(x=>x.id==='DOM_XSS_CANDIDATE'&&x.line===3));
  assert.equal(JSON.stringify(body).includes('demo-test-only'),false);
  assert.equal(calls.length,0);
});
test('quick audit does not flag static HTML strings, sanitizer or untrusted logs as code',()=>{
  for(const artifact of [
    'element.innerHTML = "<p>trusted</p>";',
    'element.innerHTML = DOMPurify.sanitize(input);'
  ])assert.equal(auditArtifact(artifact,'code').findings.some(f=>f.id==='DOM_XSS_CANDIDATE'),false);
  assert.equal(auditArtifact('element.innerHTML = input','logs').findings.length,0);
});


test('authenticated model catalog reports tailnet auth failure without URLs, keys or false inference readiness',async()=>{
  const {handler,calls}=fixture({STAR_TAILNET_STATE:'auth_failed'});
  const reply=await handler(request('/v1/models',undefined,TOKEN,'GET'));
  assert.equal(reply.status,200);
  const data=await reply.json();
  assert.equal(data.tailnet_status,'auth_failed');
  assert.equal(data.data[0].id,'qwen-coder');
  assert.equal(calls.length,0);
  assert.equal(JSON.stringify(data).includes('STAR_TAILNET_OLLAMA_URL'),false);
  assert.equal(JSON.stringify(data).includes('upstream-private-key'),false);
  const denied=await handler(request('/v1/models',undefined,'bad-token','GET'));
  assert.equal(denied.status,401);
  const other=createGateway({env:{...ENV,STAR_TAILNET_STATE:'sensitive-private-host'},fetchImpl:async()=>{throw Error('not called')}});
  const safe=await (await other(request('/v1/models',undefined,TOKEN,'GET'))).json();
  assert.equal(safe.tailnet_status,'unknown');
});


test('returns 504 for a timed-out provider without leaking network details',async()=>{
  const handler=createGateway({env:ENV,fetchImpl:async()=>{
    const error=new Error('private host details should not leak');
    error.name='TimeoutError';
    throw error;
  }});
  const response=await handler(request('/v1/chat/completions',{
    model:'qwen-coder',messages:[{role:'user',content:'Summarize code review findings'}]
  }));
  assert.equal(response.status,504);
  const body=await response.json();
  assert.equal(body.error.code,'provider_timeout');
  assert.equal(JSON.stringify(body).includes('private host details'),false);
});

test('distinguishes upstream network failure from timeout',async()=>{
  const handler=createGateway({env:ENV,fetchImpl:async()=>{throw new TypeError('network unreachable')}});
  const response=await handler(request('/v1/chat/completions',{
    model:'qwen-coder',messages:[{role:'user',content:'Hello'}]
  }));
  assert.equal(response.status,502);
  assert.equal((await response.json()).error.code,'provider_unreachable');
});

test('passes through SSE responses for clients with streaming enabled',async()=>{
  const event='data: {"choices":[{"delta":{"content":"hello"}}]}\\n\\n';
  const handler=createGateway({env:ENV,fetchImpl:async(_url,options)=>{
    assert.equal(JSON.parse(options.body).stream,true);
    return new Response(event,{headers:{'content-type':'text/event-stream'}});
  }});
  const response=await handler(request('/v1/chat/completions',{
    model:'qwen-coder',stream:true,max_tokens:128,messages:[{role:'user',content:'Hello'}]
  }));
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/text\\/event-stream/);
  assert.equal(await response.text(),event);
});
