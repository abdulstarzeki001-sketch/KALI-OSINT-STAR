import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleAnalyzePost,onRequestPost,onRequestGet} from '../functions/api/ai/analyze.js';
import {ownerToken, mint, attackerPair, resetCerts} from './access-test-keys.mjs';

const ENDPOINT='https://kali-osint-star.pages.dev/api/ai/analyze';
const REPORT='SYNTHETIC LAB TEST. Offline VM 192.168.56.10 had SSH TCP 22 reachable and port 8080 unreachable. Patches unknown.';
const HEADERS={'Content-Type':'application/json','Cf-Access-Jwt-Assertion':ownerToken};
test.beforeEach(resetCerts);
function input(opts={}){
 const headers={...HEADERS,...opts.headers};
 return new Request(opts.url||ENDPOINT,{method:'POST',headers,body:opts.body??JSON.stringify({report:REPORT,question:'Give defensive advice'})});
}
function service(){
 let requests=0;
 return { get calls(){return requests}, async fetch(_url,init){
  requests++;
  const json=JSON.parse(init.body);
  assert.equal(json.report,REPORT);
  return new Response(JSON.stringify({status:'completed',model:'test-model',analysis:'Defensive analysis of this synthetic lab report identifies an unknown patch status and recommends validating versions.'}),{status:200,headers:{'Content-Type':'application/json'}});
 }};
}
test('GET denies analysis',async()=>{
 const r=await onRequestGet();
 assert.equal(r.status,405);
});
test('host mismatch rejects without forwarding',async()=>{
 const s=service();const r=await onRequestPost({request:input({url:'https://evil.example/api/ai/analyze'}),env:{STAR_AI:s}});
 assert.equal(r.status,403);assert.equal(s.calls,0);
});
test('requires Access assertion header (real session enforced at Cloudflare edge)',async()=>{
 const s=service();const r=await onRequestPost({request:input({headers:{'Cf-Access-Jwt-Assertion':''}}),env:{STAR_AI:s}});
 assert.equal(r.status,401);assert.equal(s.calls,0);
});
test('rejects foreign Origin',async()=>{
 const s=service();const r=await onRequestPost({request:input({headers:{Origin:'https://attacker.invalid'}}),env:{STAR_AI:s}});
 assert.equal(r.status,403);assert.equal(s.calls,0);
});
test('fails closed if service binding missing',async()=>{
 const r=await onRequestPost({request:input(),env:{}});
 assert.equal(r.status,503);
});
test('rejects invalid report without forwarding',async()=>{
 const s=service();const r=await onRequestPost({request:input({body:JSON.stringify({report:'tiny'})}),env:{STAR_AI:s}});
 assert.equal(r.status,422);assert.equal(s.calls,0);
});
test('forwards synthetically valid request to private service and returns completed analysis',async()=>{
 const s=service();const r=await onRequestPost({request:input({headers:{Origin:'https://kali-osint-star.pages.dev'}}),env:{STAR_AI:s}});
 assert.equal(r.status,200);assert.equal(s.calls,1);
 const j=await r.json();assert.equal(j.status,'completed');assert.ok(j.analysis.includes('patch'));
 assert.equal(r.headers.get('Cache-Control'),'no-store');
});

test('rejects forged and login-page meta Access assertions without forwarding',async()=>{
 const s=service();
 for(const assertion of ['synthetic-assertion-not-a-real-session',await mint({},{key:attackerPair.privateKey}),await mint({type:'meta'})]){
  const r=await onRequestPost({request:input({headers:{'Cf-Access-Jwt-Assertion':assertion}}),env:{STAR_AI:s}});
  assert.equal(r.status,401);
 }
 assert.equal(s.calls,0);
});

test('private report analysis redacts recognized secrets and preserves long reports',async()=>{
 const s=service();
 const secret='synthetic-credential-test';
 const report=('password: '+secret+' '+ 'a'.repeat(18000)).slice(0,17970)+' report-end-marker';
 const request=input({body:JSON.stringify({model:'qwen3-coder-vast',report,question:'Summarize.'})});
 let calls=0;
 const response=await handleAnalyzePost({request,env:{STAR_AI:s}},async(url,options)=>{
  calls++;
  assert.match(url,/\.up\.railway\.app\/v1\/chat\/completions$/);
  const payload=JSON.parse(options.body);
  assert.equal(payload.model,'qwen3-coder-vast');
  assert.equal(payload.mode,'security');
  assert.equal(payload.stream,false);
  assert.ok(payload.messages.every(m=>m.role==='user'&&m.content.length<5000));
  assert.match(options.body,/\[REDACTED\]/);
  assert.match(options.body,/report-end-marker/);
  assert.ok(!options.body.includes(secret));
  return Response.json({choices:[{message:{content:'The report needs a defensive review.'}}]});
 });
 assert.equal(calls,1);
 assert.equal(s.calls,0);
 assert.equal(response.status,200);
 assert.equal((await response.json()).model,'qwen3-coder-vast');
});
