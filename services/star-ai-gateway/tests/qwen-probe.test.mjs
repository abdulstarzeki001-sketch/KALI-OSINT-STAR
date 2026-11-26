import test from 'node:test';
import assert from 'node:assert/strict';
import {qwenStartupProbe,qwenConnectivityProbe,qwenReleaseProbe} from '../qwen-probe.mjs';

const env={STAR_TAILNET_STATE:'enrolled',STAR_TAILNET_OLLAMA_URL:'https://qwen.example.ts.net/v1'};
const good=new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'STAR_QWEN_ONLINE'}}]}),{
  status:200,headers:{'content-type':'application/json'}
});

test('startup verification makes one private, bounded Qwen chat request',async()=>{
  const calls=[];
  const outcome=await qwenStartupProbe({env,fetchImpl:async(url,opts)=>{
    calls.push({url,opts});
    return good.clone();
  }});
  assert.equal(outcome,'ok');
  assert.equal(calls.length,1);
  const req=calls[0];
  assert.equal(req.url,'https://qwen.example.ts.net/v1/chat/completions');
  assert.equal(req.opts.method,'POST');
  assert.equal(req.opts.redirect,'error');
  assert.equal(req.opts.headers.authorization,'Bearer ollama');
  assert.equal(JSON.parse(req.opts.body).model,'qwen3-coder:30b');
  assert.equal(JSON.parse(req.opts.body).stream,false);
  assert.equal(JSON.parse(req.opts.body).max_tokens,64);
  assert.ok(req.opts.signal);
});

test('probe never contacts a model when Tailscale failed or is not configured',async()=>{
  for(const state of ['auth_failed','missing_key','not_configured','unknown']){
    const result=await qwenStartupProbe({env:{...env,STAR_TAILNET_STATE:state},fetchImpl:async()=>{throw Error('Network must not be touched')}});
    assert.equal(result,'skipped');
  }
});

test('probe reports HTTP failures or invalid model output as bounded codes',async()=>{
  for(const status of [401,404,429,502,503]){
    const result=await qwenStartupProbe({env,fetchImpl:async()=>new Response('provider rejected',{status})});
    assert.equal(result,'http_'+status);
  }
  const none=await qwenStartupProbe({env,fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:''}}]}),{headers:{'content-type':'application/json'}})});
  assert.equal(none,'no_answer');
});

test('private URLs, model text and errors cannot leak into startup log result',async()=>{
  const secret='tskey-auth-EXAMPLE-DO-NOT-USE';
  const result=await qwenStartupProbe({env,fetchImpl:async()=>{throw Error('private.url.ts.net?key='+secret)}});
  assert.equal(result,'network_error');
  assert.equal(JSON.stringify(result).includes('tskey-auth'),false);
  const invalid=await qwenStartupProbe({env,fetchImpl:async()=>new Response('unexpected HTML',{headers:{'content-type':'text/html'}})});
  assert.equal(invalid,'invalid_content_type');
});

test('catalog reachability is distinct from generation and missing models do not trigger inference',async()=>{
 const calls=[],events=[];
 await qwenReleaseProbe({env,fetchImpl:async(url,opts)=>{calls.push({url,opts});return Response.json({data:[{id:'other'}]});}},(stage,status)=>events.push([stage,status]));
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://qwen.example.ts.net/v1/models');
 assert.equal(calls[0].opts.method,'GET');
 assert.deepEqual(events,[['catalog','model_missing'],['inference','skipped']]);
});
test('healthy catalog permits one bounded real inference; timeout is separately reported',async()=>{
 const calls=[],events=[];
 await qwenReleaseProbe({env,fetchImpl:async(url,opts)=>{calls.push({url,opts});if(url.endsWith('/models'))return Response.json({data:[{id:'qwen3-coder:30b'}]});throw new DOMException('not exposed','TimeoutError');}},(stage,status)=>events.push([stage,status]));
 assert.equal(calls.length,2);
 assert.deepEqual(events,[['catalog','model_present'],['inference','timeout']]);
 assert.equal(await qwenConnectivityProbe({env,fetchImpl:async()=>Response.json({data:'bad'})}),'invalid_catalog');
 assert.equal(await qwenConnectivityProbe({env,fetchImpl:async()=>{throw new DOMException('secret','TimeoutError')}}),'timeout');
});
