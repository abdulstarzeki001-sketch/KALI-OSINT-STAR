import {test} from 'node:test';import assert from 'node:assert/strict';
import {safePath,applyEdit,encodeText,decodeText,github,sensitive,tokenState,githubFailure} from '../github-workspace.js';
import {handleGitHub} from '../functions/api/ai/github.js';
test('restrict paths to allowed repo files',()=>{assert.ok(safePath('apps/web/src/main.tsx'));for(const p of ['../README.md','.github/workflows/ci.yml','apps/web/src/.env','apps/web/src/secret.ts','services/agent/main.py','apps/web/src/../main.tsx'])assert.equal(safePath(p),false);});
test('requires exact unique edit and valid JSON',()=>{assert.equal(applyEdit('a b c','{"old":"b","new":"x"}'),'a x c');assert.throws(()=>applyEdit('b b','{"old":"b","new":"x"}'));assert.throws(()=>applyEdit('abc','not json'));});
test('UTF8 and credential pattern',()=>{const s='مرحبا 😀';assert.equal(decodeText(encodeText(s)),s);assert.equal(sensitive('-----BEGIN PRIVATE KEY-----'),true);});
test('writes fail without server token',async()=>{await assert.rejects(github({},'/git/refs','POST',{},()=>{throw Error('unexpected fetch')}),/TOKEN_MISSING/);});
test('route denies anonymous and cross origin',async()=>{const base='https://kali-osint-star.pages.dev/api/ai/github';assert.equal((await handleGitHub({request:new Request(base),env:{}},async()=>({ok:false,reason:'ACCESS_REQUIRED'}))).status,401);assert.equal((await handleGitHub({request:new Request(base,{method:'POST',headers:{origin:'https://evil.example'}}),env:{}},async()=>({ok:true}))).status,403);});

test('invalid token never sent, surrounding whitespace trimmed and failures sanitized',async()=>{
 assert.equal(tokenState({STAR_GITHUB_TOKEN:'STAR_GITHUB_TOKEN'}),'invalid_format');
 await assert.rejects(github({STAR_GITHUB_TOKEN:'bad'},'', 'GET',undefined,()=>{throw Error('must not fetch')}),/TOKEN_FORMAT/);
 const fake='github_pat_TEST_ONLY';
 const data=await github({STAR_GITHUB_TOKEN:' '+fake+'\n'},'', 'GET',undefined,async(url,init)=>{assert.equal(init.headers.authorization,'Bearer '+fake);return Response.json({ok:true});});
 assert.equal(data.ok,true);
 try{await github({STAR_GITHUB_TOKEN:fake},'', 'GET',undefined,async()=>{throw Error(fake)});}catch(e){assert.equal(githubFailure(e).code,'GITHUB_NETWORK');assert.ok(!JSON.stringify(githubFailure(e)).includes(fake));}
});
test('GitHub HTTP status is preserved without body or secret',async()=>{
 try{await github({},'', 'GET',undefined,async()=>new Response('private body',{status:401}));assert.fail('expected failure');}
 catch(e){assert.deepEqual(githubFailure(e),{code:'GITHUB_HTTP',error:'GitHub API rejected the request (HTTP 401)',githubStatus:401});}
});
test('default fetch retains global receiver',async()=>{
 const old=globalThis.fetch;
 try{globalThis.fetch=function(){assert.equal(this,globalThis);return Promise.resolve(Response.json({ok:true}));};assert.equal((await github({},'')).ok,true);}finally{globalThis.fetch=old;}
});

test('Workers-compatible manual redirects and no credential forwarding',async()=>{
 const fake='github_pat_TEST_ONLY';let count=0;
 try{await github({STAR_GITHUB_TOKEN:fake},'', 'GET',undefined,async(url,init)=>{
  count++;assert.equal(init.redirect,'manual');assert.equal(url,'https://api.github.com/repos/abdulstarzeki001-sketch/KALI-OSINT-STAR');
  return new Response(null,{status:302,headers:{location:'https://example.invalid/redirect'}});
 });assert.fail('expected redirect rejection');}
 catch(e){assert.deepEqual(githubFailure(e),{code:'GITHUB_REDIRECT',error:'GitHub API redirect refused; credentials were not forwarded',githubStatus:302});}
 assert.equal(count,1);
});
