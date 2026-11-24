import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleCyberPost} from '../functions/api/ai/cyber.js';
import {ownerToken,resetCerts} from './access-test-keys.mjs';

const URL='https://kali-osint-star.pages.dev/api/ai/cyber';
const ENV={STAR_CYBER_GATEWAY_URL:'https://star-ai-cyber-gateway-production.up.railway.app/',
  STAR_CYBER_GATEWAY_TOKEN:'test-token-secure-and-longer-than-32-characters'};
const request=(jwt=ownerToken)=>new Request(URL,{method:'POST',headers:{
  'content-type':'application/json','Cf-Access-Jwt-Assertion':jwt
},body:JSON.stringify({action:'probe',model:'attacker-host',
  messages:[{role:'user',content:'do not send to provider'}],
  url:'https://evil.example',artifact:'secret-input'})});
const qwenResponse=(content='STAR_AI_READY')=>new Response(JSON.stringify({
  choices:[{message:{role:'assistant',content}}]
}),{status:200,headers:{'content-type':'application/json'}});

test.beforeEach(resetCerts);

test('real inference probe rejects missing Access JWT before contacting Railway',async()=>{
  let calls=0;
  const r=await handleCyberPost({request:request(''),env:ENV},async()=>{calls++;return qwenResponse();});
  assert.equal(r.status,401);
  assert.equal(calls,0);
});

test('probe pins model, target, and message and never returns provider text',async()=>{
  const seen=[];
  const r=await handleCyberPost({request:request(),env:ENV},async(url,opts)=>{
    seen.push({url,opts});
    return qwenResponse('response includes no user secret');
  });
  assert.equal(r.status,200);
  const result=await r.json();
  assert.equal(result.status,'ok');
  assert.equal(result.model,'qwen3-coder-vast');
  assert.ok(Number.isSafeInteger(result.latency_ms)&&result.latency_ms>=0);
  assert.equal(seen.length,1);
  assert.equal(seen[0].url,'https://star-ai-cyber-gateway-production.up.railway.app/v1/chat/completions');
  assert.equal(seen[0].opts.headers.authorization,'Bearer '+ENV.STAR_CYBER_GATEWAY_TOKEN);
  assert.equal(seen[0].opts.redirect,'manual');
  assert.ok(seen[0].opts.signal);
  const payload=JSON.parse(seen[0].opts.body);
  assert.equal(payload.model,'qwen3-coder-vast');
  assert.equal(payload.stream,false);
  assert.equal(payload.max_tokens,128);
  assert.deepEqual(payload.messages,[{role:'user',content:'Reply with STAR_AI_READY in one short sentence.'}]);
  assert.equal(JSON.stringify(result).includes('user secret'),false);
  assert.equal(JSON.stringify(payload).includes('secret-input'),false);
  assert.equal(JSON.stringify(payload).includes('evil.example'),false);
});

test('probe reports nonanswer, model error, redirect and non-JSON without false OK',async()=>{
  for(const [reply,expected] of [
    [qwenResponse(''),502],
    [new Response('unavailable',{status:502,headers:{'content-type':'application/json'}}),503],
    [new Response('too many',{status:429,headers:{'content-type':'application/json'}}),429],
    [new Response('redirect',{status:302,headers:{location:'https://evil.example'}}),502],
    [new Response('<html>no</html>',{status:200,headers:{'content-type':'text/html'}}),502]
  ]){
    const r=await handleCyberPost({request:request(),env:ENV},async()=>reply);
    assert.equal(r.status,expected);
    assert.notEqual((await r.json()).status,'ok');
  }
});

test('probe requires a configured pinned Railway origin',async()=>{
  const env={STAR_CYBER_GATEWAY_URL:'https://evil.example/'};
  let calls=0;
  const r=await handleCyberPost({request:request(),env},async()=>{calls++;return qwenResponse();});
  assert.equal(r.status,503);
  assert.equal(calls,0);
});

test('client tests Qwen only on button click, never confuses catalog with inference',()=>{
  const src=readFileSync(new URL('../src/CyberAIPanel.tsx',import.meta.url),'utf8');
  assert.match(src,/function runQwenProbe\(/);
  assert.match(src,/await invoke\('probe'\)/);
  assert.match(src,/onClick=\{\(\)=>void runQwenProbe\(\)\}/);
  assert.match(src,/result\.status!=='ok'/);
  assert.match(src,/models\.includes\('qwen3-coder-vast'\)/);
  assert.doesNotMatch(src,/useEffect\(\(\)=>\{[^}]+invoke\('probe'\)/);
});
