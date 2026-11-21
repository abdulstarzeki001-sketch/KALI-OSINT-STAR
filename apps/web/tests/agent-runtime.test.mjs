import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAgent} from '../agent-proxy.js';
import {ownerToken,resetCerts} from './access-test-keys.mjs';
const SITE='https://kali-osint-star.pages.dev',ID='0123456789abcdef01234567';
test.beforeEach(resetCerts);
function req(path,body,opts={}){
 return new Request((opts.host||SITE)+path,{
  method:body===undefined?'GET':'POST',
  headers:{'Cf-Access-Jwt-Assertion':opts.jwt===undefined?ownerToken:opts.jwt,
    ...(body===undefined?{}:{'content-type':'application/json'}),
    ...(opts.origin?{origin:opts.origin}:{})},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
 });
}
function mock(){
 const calls=[];
 const fetch=async(url,init)=>{
  calls.push({url,init});
  return new Response(JSON.stringify({status:'running',id:ID}),
    {status:200,headers:{'content-type':'application/json'}});
 };
 return {calls,fetch};
}
test('forged JWT and untrusted Origin/Host fail before model or Agent',async()=>{
 const f=mock();
 for(const opts of [{jwt:''},{jwt:'fake.jwt.token'},{host:'https://evil.test'},{origin:'https://evil.test'}]){
  const r=await handleAgent({request:req('/api/agent/tasks',{prompt:'test'},opts),env:{}},'submit',f.fetch);
  assert.ok([401,403].includes(r.status));
 }
 assert.equal(f.calls.length,0);
});
test('owner session relays bounded task to pinned Railway service',async()=>{
 const f=mock();
 const r=await handleAgent({request:req('/api/agent/tasks',{prompt:'Inspect',command:'whoami'}),env:{}},'submit',f.fetch);
 assert.equal(r.status,200);
 assert.equal(f.calls[0].url,'https://star-agent-runner-production.up.railway.app/api/tasks');
 assert.equal(f.calls[0].init.headers.authorization,'Bearer '+ownerToken);
 assert.deepEqual(JSON.parse(f.calls[0].init.body),{prompt:'Inspect'});
 const st=await handleAgent({request:req('/api/agent/tasks/'+ID),env:{},params:{id:ID}},'status',f.fetch);
 assert.equal(st.status,200);
 assert.equal(f.calls[1].init.method,'GET');
 assert.equal(f.calls[1].url,'https://star-agent-runner-production.up.railway.app/api/tasks/'+ID);
});
test('approvals relay only explicit boolean; malformed requests blocked',async()=>{
 const f=mock();
 const ctx={request:req('/api/agent/tasks/'+ID+'/decide',{approve:true,command:'id'}),env:{},params:{id:ID}};
 assert.equal((await handleAgent(ctx,'decide',f.fetch)).status,200);
 assert.deepEqual(JSON.parse(f.calls[0].init.body),{approve:true});
 assert.equal((await handleAgent({request:req('/api/agent/tasks/'+ID+'/decide',{approve:'true'}),env:{},params:{id:ID}},'decide',f.fetch)).status,422);
 assert.equal((await handleAgent({request:req('/api/agent/tasks/invalid'),env:{},params:{id:'invalid'}},'status',f.fetch)).status,422);
 assert.equal(f.calls.length,1);
});
test('other targets, excessive input and backend redirects are blocked',async()=>{
 const f=mock();
 assert.equal((await handleAgent({request:req('/api/agent/tasks',{prompt:'x'.repeat(4001)}),env:{}},'submit',f.fetch)).status,422);
 assert.equal((await handleAgent({request:req('/api/agent/tasks'),env:{}},'shell',f.fetch)).status,404);
 assert.equal(f.calls.length,0);
 assert.equal((await handleAgent({request:req('/api/agent/health'),env:{}},'health',
  async()=>new Response(null,{status:302,headers:{location:'https://evil.test'}}))).status,502);
});
