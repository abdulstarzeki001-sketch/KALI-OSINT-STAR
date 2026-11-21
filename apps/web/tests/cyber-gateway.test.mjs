import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleCyberPost,onRequestGet} from '../functions/api/ai/cyber.js';
import {ownerToken,resetCerts} from './access-test-keys.mjs';

const URL='https://kali-osint-star.pages.dev/api/ai/cyber';
const TOKEN='secret-gateway-token-at-least-32-characters';
const ENV={STAR_CYBER_GATEWAY_URL:'https://star-cyber-production.up.railway.app/',
  STAR_CYBER_GATEWAY_TOKEN:TOKEN};
function req(body={action:'audit',kind:'code',artifact:'eval(userInput)'},extra={}){
  return new Request(extra.url||URL,{method:'POST',headers:{
    'Cf-Access-Jwt-Assertion':extra.jwt===undefined?ownerToken:extra.jwt,
    'Content-Type':'application/json', ...(extra.headers||{})
  },body:JSON.stringify(body)});
}
function fixture(){
  const seen=[];
  const fetchUpstream=async(url,options)=>{
    seen.push({url,options});
    return new Response(JSON.stringify({kind:'code',lines_analyzed:1,findings:[],counts:{}}),
      {status:200,headers:{'content-type':'application/json'}});
  };
  return {seen,fetchUpstream};
}
test.beforeEach(resetCerts);
test('blocks forged or missing identity and hostile hosts before gateway',async()=>{
  const f=fixture();
  for(const options of [{jwt:''},{jwt:'fake.jwt.token'},{url:'https://evil.example/api/ai/cyber'},
    {headers:{origin:'https://evil.example'}}]){
    const r=await handleCyberPost({request:req(undefined,options),env:ENV},f.fetchUpstream);
    assert.ok(r.status===401||r.status===403);
  }
  assert.equal(f.seen.length,0);
});
test('missing or insecure gateway configuration only permits local audit',async()=>{
  const f=fixture();
  for(const env of [{...ENV,STAR_CYBER_GATEWAY_URL:'http://localhost:3000/'},
    {...ENV,STAR_CYBER_GATEWAY_URL:'https://not-a-railway-host.example/'}]){
    const safe=await handleCyberPost({request:req(),env},f.fetchUpstream);
    assert.equal(safe.status,200);
    assert.equal((await safe.json()).findings[0].id,'UNSAFE_EVAL');
    const remote=await handleCyberPost({request:req({action:'review',kind:'code',
      artifact:'eval(userInput)',model:'qwen-coder'}),env},f.fetchUpstream);
    assert.equal(remote.status,503);
  }
  assert.equal(f.seen.length,0);
});
test('passes only allowlisted audit data, server token and fixed target route',async()=>{
  const f=fixture();
  const r=await handleCyberPost({request:req({action:'audit',kind:'logs',artifact:'sample event',command:'whoami',url:'https://evil.example'}),env:ENV},f.fetchUpstream);
  assert.equal(r.status,200);
  assert.equal(f.seen[0].url,'https://star-cyber-production.up.railway.app/v1/security/audit');
  assert.equal(f.seen[0].options.headers.authorization,'Bearer '+TOKEN);
  assert.deepEqual(JSON.parse(f.seen[0].options.body),{kind:'logs',artifact:'sample event'});
});
test('model discovery is server-side and unknown action rejected',async()=>{
  const f=fixture();
  const r=await handleCyberPost({request:req({action:'models'}),env:ENV},f.fetchUpstream);
  assert.equal(r.status,200);
  assert.equal(f.seen[0].options.method,'GET');
  assert.equal(f.seen[0].url,'https://star-cyber-production.up.railway.app/v1/models');
  assert.equal((await handleCyberPost({request:req({action:'shell',command:'ls'}),env:ENV},f.fetchUpstream)).status,422);
  assert.equal(f.seen.length,1);
});
test('returns POST-only response for GET',async()=>{
  assert.equal((await onRequestGet()).status,405);
});

test('without Railway, local audit remains real and does not call a model',async()=>{
  const f=fixture();
  const r=await handleCyberPost({request:req({action:'audit',kind:'code',artifact:'const password="test-secret-value";'}),env:{}},async()=>{throw Error('temporary outage');});
  assert.equal(r.status,200);
  const data=await r.json();
  assert.equal(data.findings[0].id,'HARDCODED_SECRET');
  assert.equal(JSON.stringify(data).includes('test-secret-value'),false);
  assert.equal(f.seen.length,0);
});
test('Cloudflare fallback exposes its model only when service binding exists',async()=>{
  const f=fixture(),env={STAR_AI:{fetch:async()=>new Response(JSON.stringify({reply:'Cyber advice'}),{
    headers:{'content-type':'application/json'}})}};
  const m=await handleCyberPost({request:req({action:'models'}),env},f.fetchUpstream);
  assert.equal((await m.json()).data[0].id,'llama-cloudflare');
  const r=await handleCyberPost({request:req({action:'review',model:'llama-cloudflare',
    kind:'code',artifact:'const token="my-secret-1234";'}),env},f.fetchUpstream);
  assert.equal(r.status,200);
  assert.equal((await r.json()).analysis,'Cyber advice');
  assert.equal(f.seen.length,0);
});

test('default Railway gateway receives the verified owner Access JWT, not an invented token',async()=>{
  const f=fixture();
  const resp=await handleCyberPost({request:req({action:'audit',kind:'code',artifact:'eval(x)'}),env:{}},f.fetchUpstream);
  assert.equal(resp.status,200);
  assert.equal(f.seen[0].url,'https://star-ai-cyber-gateway-production.up.railway.app/v1/security/audit');
  assert.equal(f.seen[0].options.headers.authorization,'Bearer '+ownerToken);
});
test('Cloudflare fallback is included even if the independent Railway gateway responds with no model keys',async()=>{
  const f=fixture();
  const env={STAR_AI:{fetch:async()=>new Response(JSON.stringify({reply:'Cloudflare answer'}),{headers:{'content-type':'application/json'}})}};
  const r=await handleCyberPost({request:req({action:'models'}),env},f.fetchUpstream);
  assert.equal(r.status,200);
  const out=await r.json();
  assert.equal(out.data[0].id,'llama-cloudflare');
});
