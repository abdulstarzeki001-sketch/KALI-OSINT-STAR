import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseTargets,payloadFor,validatePayload,reversePlan,modelEdit,verifyFileList} from '../developer-v2.js';
import {encodeText} from '../github-workspace.js';
import {executeApproved} from '../../../scripts/star-developer-v2.mjs';
import {handleDeveloper} from '../functions/api/ai/developer-v2.js';
const id='12345678-1234-1234-1234-123456789abc',base='a'.repeat(40),blob='b'.repeat(40),tree='c'.repeat(40),head='d'.repeat(40);
const files=[{path:'docs/existing.md',op:'modify',blob,before:'old',after:'new'},{path:'docs/new/file.md',op:'create',blob:null,before:null,after:'created'}];
test('restrict paths, duplicate targets, new file JSON, exact preview and payload',()=>{
 assert.throws(()=>parseTargets([{path:'.github/workflows/ci.yml',op:'modify'}]));
 assert.throws(()=>parseTargets([{path:'docs/a.md',op:'create'},{path:'docs/a.md',op:'modify'}]));
 assert.equal(modelEdit('modify','old','{"old":"old","new":"new"}'),'new');
 assert.equal(modelEdit('create',null,'{"content":"created"}'),'created');
 const p=payloadFor(id,base,files);assert.deepEqual(validatePayload(p),p);
 assert.throws(()=>validatePayload({...p,files:[{...p.files[0],path:'docs/../README.md'}]}));
 assert.throws(()=>validatePayload({...p,files:[{...p.files[0],content:'not valid'}]}));
 assert.ok(verifyFileList(files,[{filename:files[0].path,status:'modified'},{filename:files[1].path,status:'added'}]));
 assert.equal(verifyFileList(files,[{filename:files[0].path,status:'modified'}]),false);
});
test('rollback preserves unrelated modifications and rejects conflicts',()=>{
 const current={'docs/existing.md':{sha:blob,text:'new'},'docs/new/file.md':{sha:head,text:'created'}};
 const r=reversePlan(files,current);assert.equal(r[0].after,'old');assert.equal(r[1].op,'delete');
 assert.throws(()=>reversePlan(files,{...current,'docs/existing.md':{sha:blob,text:'changed later'}}));
});
test('atomic executor creates one tree and commit; dispatches exact branch tests',async()=>{
 const writes=[];const branch='star-ai/edit-'+id;
 const api=async(p,method='GET',data)=>{
  if(method!=='GET')writes.push({p,method,data});
  if(p==='/git/ref/heads/main')return {object:{sha:base}};
  if(p==='/git/commits/'+base)return {tree:{sha:tree}};
  if(p==='/git/trees/'+tree+'?recursive=1')return {tree:[{path:files[0].path,type:'blob',mode:'100644',sha:blob}]};
  if(p==='/git/trees'&&method==='POST'){assert.equal(data.tree.length,2);assert.equal(data.tree[1].content,'created');return {sha:'e'.repeat(40)};}
  if(p==='/git/commits'&&method==='POST'){assert.deepEqual(data.parents,[base]);return {sha:head};}
  if(p==='/git/refs'&&method==='POST'){assert.equal(data.ref,'refs/heads/'+branch);assert.equal(data.sha,head);return {object:{sha:head}};}
  if(p==='/git/trees/'+'e'.repeat(40)+'?recursive=1')return {tree:files.map(f=>({path:f.path,type:'blob'}))};
  if(p.startsWith('/contents/')){const f=files.find(f=>p.startsWith('/contents/'+f.path+'?'));return {type:'file',encoding:'base64',content:encodeText(f.after)};}
  if(p==='/pulls')return {number:12,head:{sha:head},base:{ref:'main'}};
  if(p.endsWith('/dispatches')){assert.equal(data.ref,branch);return {};}
  throw Error('Unexpected '+p);
 };
 assert.deepEqual(await executeApproved(payloadFor(id,base,files),api),{pr:12,head});
 assert.equal(writes.filter(x=>x.p==='/git/commits').length,1);
 assert.equal(writes.filter(x=>x.p.endsWith('/dispatches')).length,2);
});
test('route rejects anonymous and cross origin before touching storage',async()=>{
 const endpoint='https://kali-osint-star.pages.dev/api/ai/developer-v2';
 assert.equal((await handleDeveloper({request:new Request(endpoint),env:{}},async()=>({ok:false,reason:'ACCESS_REQUIRED'}))).status,401);
 assert.equal((await handleDeveloper({request:new Request(endpoint,{method:'POST',headers:{origin:'https://example.invalid'}}),env:{}},async()=>({ok:true}))).status,403);
});
