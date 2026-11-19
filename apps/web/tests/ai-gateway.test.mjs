import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequestPost,onRequestGet} from '../functions/api/ai/analyze.js';
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
