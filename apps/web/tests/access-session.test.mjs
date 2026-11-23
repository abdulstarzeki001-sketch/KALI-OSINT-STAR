import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet} from '../functions/api/access/session.js';
import {ownerToken,resetCerts,mint} from './access-test-keys.mjs';
import {readFileSync} from 'node:fs';

const url='https://kali-osint-star.pages.dev/api/access/session';
const request=(token,endpoint=url)=>new Request(endpoint,{headers:token?{'Cf-Access-Jwt-Assertion':token}:{}});
test.beforeEach(resetCerts);

test('Access session diagnostic requires a cryptographically verified owner app JWT',async()=>{
 const response=await onRequestGet({request:request(ownerToken),env:{}});
 assert.equal(response.status,200);
 assert.match(response.headers.get('cache-control'),/no-store/);
 assert.deepEqual(await response.json(),{authenticated:true,provider:'cloudflare-access',jwt_verified:true});
});
test('anonymous, expired, forged and login-page meta sessions fail closed',async()=>{
 const missing=await onRequestGet({request:request(''),env:{}});
 assert.equal(missing.status,401);
 const tampered=await onRequestGet({request:request(ownerToken.slice(0,-3)+'xxx'),env:{}});
 assert.equal(tampered.status,401);
 const expired=await onRequestGet({request:request(await mint({exp:1000000000})),env:{}});
 assert.equal(expired.status,401);
 const meta=await onRequestGet({request:request(await mint({type:'meta'})),env:{}});
 assert.equal(meta.status,401);
});
test('Access diagnostic rejects alias and non-TLS hosts',async()=>{
 for(const alt of ['https://untrusted.example.test/api/access/session','http://kali-osint-star.pages.dev/api/access/session']){
  const response=await onRequestGet({request:request(ownerToken,alt),env:{}});
  assert.equal(response.status,403);
 }
});
test('Access UI reports redirected HTML login as needing authentication',()=>{
 const content=readFileSync(new URL('../src/StarOSPanel.tsx',import.meta.url),'utf8');
 assert.match(content,/\/api\/access\/session/);
 assert.match(content,/response\.redirected/);
 assert.match(content,/text\/html/);
 assert.match(content,/checks\.access\.state/);
 assert.doesNotMatch(content,/Cf-Access-Jwt-Assertion|STAR_AGENT_MODEL_KEY|apiKey/);
});
