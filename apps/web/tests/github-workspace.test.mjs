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

test('configured bridge routes through service binding, never sends credential to external fallback',async()=>{
 const fake='github_pat_TEST_ONLY';let called=0;
 const env={STAR_GITHUB_TOKEN:fake,STAR_GITHUB_EGRESS:{fetch:async(url,init)=>{called++;assert.equal(url,'https://star-github-egress.internal/repos/abdulstarzeki001-sketch/KALI-OSINT-STAR');assert.equal(init.headers.authorization,'Bearer '+fake);return Response.json({full_name:'repo'});}}};
 assert.equal((await github(env,'','GET',undefined,()=>{throw Error('direct fallback forbidden')})).full_name,'repo');assert.equal(called,1);
});

test('integrated route flow: read, AI draft, scoped approval, branch, commit, PR, CI gate',async()=>{
 const {DatabaseSync}=await import('node:sqlite');
 const {readFileSync}=await import('node:fs');
 const sql=new DatabaseSync(':memory:');
 for(const name of ['001','002','003'])sql.exec(readFileSync(new URL('../../../cloudflare/memory/'+name+'.sql',import.meta.url),'utf8'));
 const db={prepare(query){return {bind(...args){const stmt=sql.prepare(query);return {first:async()=>stmt.get(...args)||null,all:async()=>({results:stmt.all(...args)}),run:async()=>({meta:{changes:Number(stmt.run(...args).changes)}})};}};}};
 const root='https://kali-osint-star.pages.dev';
 const endpoint=root+'/api/ai/github';
 const repo='abdulstarzeki001-sketch/KALI-OSINT-STAR';
 const base='a'.repeat(40),blob='b'.repeat(40),head='c'.repeat(40);
 const path='docs/STAR_GITHUB_WORKSPACE.md';
 const before='Original documentation.\n';
 const after=before+'\n## STAR AI Integration Test\n';
 const writes=[];let ciOK=false;let branch='';
 const env={STAR_MEMORY:db,STAR_GITHUB_TOKEN:'github_pat_TEST_ONLY',
 STAR_AI:{fetch:async(url,init)=>{assert.equal(url,'https://star-ai-service.internal/chat');const b=JSON.parse(init.body);assert.equal(b.mode,'code');assert.ok(b.messages.some(m=>m.content.includes(before)));return Response.json({reply:JSON.stringify({old:before,new:after})});}},
 STAR_GITHUB_EGRESS:{fetch:async(url,init)=>{
   const u=new URL(url);assert.equal(u.origin,'https://star-github-egress.internal');assert.equal(init.headers.authorization,'Bearer github_pat_TEST_ONLY');
   assert.ok(u.pathname.startsWith('/repos/'+repo));
   const p=u.pathname.slice(('/repos/'+repo).length);
   const data=init.body?JSON.parse(init.body):null;
   if(init.method!=='GET')writes.push({path:p,method:init.method});
   if(p==='')return Response.json({full_name:repo});
   if(p==='/git/ref/heads/main')return Response.json({object:{sha:base}});
   if(p==='/git/trees/'+base)return Response.json({tree:[{type:'blob',path}]});
   if(p==='/contents/'+path&&init.method==='GET')return Response.json({type:'file',encoding:'base64',sha:blob,size:before.length,content:encodeText(before)});
   if(p==='/git/refs'&&init.method==='POST'){assert.equal(data.sha,base);assert.match(data.ref,/^refs\/heads\/star-ai\/edit-/);branch=data.ref.slice(11);return Response.json({ref:data.ref},{status:201});}
   if(p==='/contents/'+path&&init.method==='PUT'){assert.equal(data.branch,branch);assert.notEqual(data.branch,'main');assert.equal(data.sha,blob);assert.equal(decodeText(data.content),after);return Response.json({commit:{sha:head}});}
   if(p==='/pulls'&&init.method==='POST'){assert.equal(data.head,branch);assert.equal(data.base,'main');return Response.json({number:101,head:{sha:head}},{status:201});}
   if(p==='/pulls/101')return Response.json({number:101,state:'open',base:{ref:'main'},head:{ref:branch,sha:head,repo:{full_name:repo}}});
   if(p.startsWith('/actions/workflows/'))return Response.json({workflow_runs:[{head_sha:head,event:'pull_request',status:ciOK?'completed':'in_progress',conclusion:ciOK?'success':null}]});
   if(p==='/pulls/101/merge'&&init.method==='PUT'){assert.ok(ciOK);assert.equal(data.sha,head);return Response.json({merged:true,sha:'d'.repeat(40)});}
   throw Error('Unexpected mock operation '+p);
 }}};
 const auth=sub=>async()=>({ok:true,identity:{sub}});
 const call=async(query='',data,sub='owner')=>handleGitHub({request:new Request(endpoint+query,{...(data?{method:'POST',headers:{origin:root,'content-type':'application/json'},body:JSON.stringify(data)}:{})}),env},auth(sub));
 try{
  const list=await call('?action=files');assert.equal(list.status,200);assert.deepEqual((await list.json()).files,[path]);
  assert.equal((await (await call('?action=file&path='+encodeURIComponent(path))).json()).text,before);
  const firstDiagnostic=await (await call('?action=diagnose')).json();assert.equal(firstDiagnostic.ok,true);assert.equal(firstDiagnostic.writeVerified,false);
  const proposed=await call('',{action:'propose',path,task:'Append integration test heading'});
  assert.equal(proposed.status,201);const draft=await proposed.json();assert.equal(draft.after,after);assert.equal(draft.state,'draft');assert.equal(writes.length,0);
  assert.equal((await call('',{action:'publish',id:draft.id,approve:false})).status,422);
  assert.equal((await call('',{action:'publish',id:draft.id,approve:true},'other-owner')).status,404);assert.equal(writes.length,0);
  const published=await call('',{action:'publish',id:draft.id,approve:true});assert.equal(published.status,200);assert.equal((await published.json()).pr,101);assert.equal(writes.length,3);
  const evidence=await (await call('?action=diagnose')).json();assert.equal(evidence.writeVerified,true);assert.equal(evidence.writeEvidence.pr,101);assert.equal((await (await call('?action=diagnose',undefined,'other-owner')).json()).writeVerified,false);assert.equal(writes.length,3);
  assert.equal((await call('',{action:'publish',id:draft.id,approve:true})).status,409);assert.equal(writes.length,3);
  assert.equal((await call('',{action:'merge',id:draft.id,approve:true})).status,409);assert.equal(writes.length,3);
  ciOK=true;const merged=await call('',{action:'merge',id:draft.id,approve:true});assert.equal(merged.status,200);assert.equal((await merged.json()).state,'merged');assert.equal(writes.length,4);
  assert.equal(sql.prepare('SELECT state FROM star_github_changes WHERE id=?').get(draft.id).state,'merged');
 }finally{sql.close();}
});
