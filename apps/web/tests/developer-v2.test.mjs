import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseTargets,payloadFor,validatePayload,reversePlan,modelEdit,verifyFileList,fileCatalog,smokeFiles} from '../developer-v2.js';
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

test('persistent V2 API journey: multi-file draft, owner isolation, one dispatch, exact reconciliation, CI repair and rollback',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const {readFileSync}=await import('node:fs');const sql=new DatabaseSync(':memory:');
 for(const name of ['001','002','003','004','005','006','007'])sql.exec(readFileSync(new URL('../../../cloudflare/memory/'+name+'.sql',import.meta.url),'utf8'));
 const db={prepare(query){return {bind(...args){const stmt=sql.prepare(query);return {first:async()=>stmt.get(...args)||null,all:async()=>({results:stmt.all(...args)}),run:async()=>({meta:{changes:Number(stmt.run(...args).changes)}})};}};}};
 const root='https://kali-osint-star.pages.dev',repo='abdulstarzeki001-sketch/KALI-OSINT-STAR',endpoint=root+'/api/ai/developer-v2';
 let main=base,dispatched=null,hasPR=false,wrong=false,passed=false,merged=false,hidePRList=false,wrongExecutor=false;
 let modelCalls=0;const stageContexts=[];const writes=[],newblob='e'.repeat(40),newblob2='f'.repeat(40),mergeSha='1'.repeat(40);
 const smokePath='docs/STAR_AUTONOMOUS_DEVELOPER_V2.md';
 const entries=[{path:files[0].path,type:'blob',mode:'100644',sha:blob,size:3},{path:smokePath,type:'blob',mode:'100644',sha:blob,size:3}];
 const updated=files.map((f,i)=>({path:f.path,type:'blob',mode:'100644',sha:i?newblob2:newblob}));
 const env={STAR_MEMORY:db,STAR_GITHUB_TOKEN:'github_pat_TEST_ONLY',
 STAR_AI:{fetch:async(_url,init)=>{modelCalls++;const m=JSON.parse(init.body).messages;if(m[0].content.includes('repository planning assistant'))return Response.json({reply:JSON.stringify({summary:'Docs plan',stages:[{title:'Docs',task:'Update docs',acceptance:'CI passes',files:[{path:files[0].path,op:'modify'}]}]})});if(m.some(x=>x.content.startsWith('Original owner roadmap request'))){stageContexts.push(m);}
const repair=m.at(-1).content.includes('Repair this proposed file');const create=m[0].content.includes('complete new text file');const first=m[0].content.includes('current path: docs/existing.md');return Response.json({reply:JSON.stringify(repair?(first?{old:'new',new:'fixed'}:{old:'created',new:'fixed new file'}):create?{content:'created'}:{old:'old',new:'new'})});}},
 STAR_GITHUB_EGRESS:{fetch:async(url,init)=>{
  const u=new URL(url),p=u.pathname.slice(('/repos/'+repo).length),body=init.body?JSON.parse(init.body):null;
  if(init.method!=='GET')writes.push(p);
  const branch=dispatched?'star-ai/edit-'+dispatched.id:'';
  const pr={number:12,state:merged?'closed':'open',base:{ref:'main',sha:base},head:{ref:branch,sha:head,repo:{full_name:repo}},merged};
  if(p==='/git/ref/heads/main')return Response.json({object:{sha:main}});
  if(p==='/git/trees/'+base)return Response.json({tree:entries});
  if(p==='/git/trees/'+head||p==='/git/trees/'+mergeSha)return Response.json({tree:updated});
  if(p.startsWith('/contents/')){const name=p.slice(10),isNew=name===files[1].path,ref=u.searchParams.get('ref');const value=ref===base?'old':isNew?'created':wrong?'unexpected':'new';const sha=ref===base?blob:isNew?newblob2:newblob;return Response.json({type:'file',encoding:'base64',sha,size:value.length,content:encodeText(value)});}
  if(p==='/dispatches'&&init.method==='POST'){assert.equal(body.event_type,'star-ai-v2-approved-edit');dispatched=validatePayload(body.client_payload);return new Response(null,{status:204});}
  if(p==='/pulls'&&init.method==='GET')return Response.json(hasPR&&!hidePRList?[pr]:[]);
  if(p==='/pulls/12/files')return Response.json([{filename:files[0].path,status:'modified'},{filename:files[1].path,status:'added'}]);
  if(p==='/pulls/12')return Response.json(pr);
  if(p==='/actions/workflows/star-ai-developer-v2.yml/runs')return Response.json({workflow_runs:dispatched?[{id:14,display_title:'STAR V2 '+dispatched.id,event:'repository_dispatch',head_sha:wrongExecutor?head:base,status:'completed',conclusion:'success'}]:[]});
  if(p.startsWith('/actions/workflows/'))return Response.json({workflow_runs:[{id:p.includes('ci.yml')?15:16,head_sha:head,event:'workflow_dispatch',head_branch:branch,status:'completed',conclusion:passed?'success':'failure'}]});
  if(/^\/actions\/runs\/\d+\/jobs$/.test(p))return Response.json({jobs:[{name:'web',conclusion:'failure',steps:[{name:'Run npm test',conclusion:'failure'}]}]});
  if(p==='/pulls/12/merge'&&init.method==='PUT'){assert.equal(body.sha,head);assert.ok(passed);merged=true;main=mergeSha;return Response.json({merged:true,sha:mergeSha});}
  throw Error('Unexpected '+p);
 }}};
 const auth=sub=>async()=>({ok:true,identity:{sub}});
 const call=(query='',data,sub='owner')=>handleDeveloper({request:new Request(endpoint+query,{...(data?{method:'POST',headers:{origin:root,'content-type':'application/json'},body:JSON.stringify(data)}:{})}),env},auth(sub));
 try{
  const memoryId='11111111-1111-1111-1111-111111111111';
  const ownKey=await (await import('../durable-memory.js')).ownerKey({sub:'owner'});
  sql.prepare('INSERT INTO star_v3_notes(owner,id,category,note,created) VALUES(?,?,?,?,?)').run(ownKey,memoryId,'decision','Update existing docs carefully',1);
  sql.prepare('INSERT INTO star_v3_notes(owner,id,category,note,created) VALUES(?,?,?,?,?)').run('other-owner','22222222-2222-2222-2222-222222222222','fix','Update existing docs other private context',2);
  const originalTask='Update existing docs. Append exactly one literal line: STAR precise marker. No extra heading. Later remove it.';
  const planned=await call('',{action:'roadmap',task:originalTask,provider:'llama-cloudflare',reviewSource:true,useMemory:true});assert.equal(planned.status,201);const road=await planned.json();assert.equal(road.provider,'llama-cloudflare');assert.deepEqual(road.roadmap.memoryReview.references.map(n=>n.id),[memoryId]);assert.equal(road.roadmap.sourceReview.files.length,2);assert.equal(road.roadmap.sourceReview.files[0].partial,false);assert.equal(road.roadmap.stages[0].files[0].path,files[0].path);assert.equal(writes.length,0);
  assert.equal((await (await call('?action=roadmaps')).json()).roadmaps.length,1);assert.equal((await (await call('?action=roadmaps',undefined,'other')).json()).roadmaps.length,0);
  const without=await (await call('',{action:'roadmap',task:'Update existing docs',provider:'llama-cloudflare'})).json();assert.equal(without.roadmap.memoryReview.requested,false);assert.equal(without.roadmap.memoryReview.references.length,0);
  const stageBefore=await (await call('?action=roadmap_progress&id='+road.id)).json();assert.equal(stageBefore.stages[0].state,'planned');
  assert.equal((await call('?action=roadmap_progress&id='+road.id,undefined,'other')).status,404);
  assert.equal((await call('',{action:'prepare_stage',roadmapId:road.id,index:0},'other')).status,404);
  const stageDraft=await call('',{action:'prepare_stage',roadmapId:road.id,index:0});assert.equal(stageDraft.status,201);const stageJob=await stageDraft.json();assert.equal(stageJob.kind,'stage');assert.equal(stageJob.parent,road.id);assert.equal(writes.length,0);
  assert.equal(stageContexts.length,1);const original=stageContexts[0].find(m=>m.content.startsWith('Original owner roadmap request'));assert.equal(original.content.split('\n').slice(1).join('\n'),originalTask);assert.match(stageContexts[0].at(-1).content,/Execute ONLY the current stage, not subsequent stages/);assert.match(stageContexts[0].at(-1).content,/Acceptance: CI passes/);assert.ok(stageContexts[0].every(m=>m.content.length<=5000));
  const repeat=await (await call('',{action:'prepare_stage',roadmapId:road.id,index:0})).json();assert.equal(repeat.id,stageJob.id);assert.equal(stageContexts.length,1);
  const stageAfter=await (await call('?action=roadmap_progress&id='+road.id)).json();assert.equal(stageAfter.stages[0].jobId,stageJob.id);assert.equal(stageAfter.stages[0].state,'draft');
  assert.equal((await call('',{action:'discard',id:stageJob.id,approve:true})).status,200);
  assert.equal((await (await call('?action=roadmap_progress&id='+road.id)).json()).stages[0].state,'planned');
  const probe=await (await call('',{action:'model_probe',provider:'llama-cloudflare'})).json();assert.equal(probe.ok,true);assert.equal(probe.provider,'llama-cloudflare');assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM star_v3_model_probes').get().n,1);assert.equal(writes.length,0);
  const catalog=await (await call('?action=catalog')).json();assert.equal(catalog.files.length,2);
  const smoke=await (await call('',{action:'smoke_plan'})).json();assert.equal(smoke.kind,'smoke');assert.equal(smoke.files.length,2);assert.equal(writes.length,0);
  assert.equal((await call('',{action:'merge',id:smoke.id,approve:true})).status,409);
  assert.equal((await call('',{action:'discard',id:smoke.id,approve:true},'other')).status,404);
  assert.equal((await (await call('',{action:'discard',id:smoke.id,approve:true})).json()).state,'discarded');
  assert.equal((await call('',{action:'approve',id:smoke.id,approve:true})).status,409);assert.equal(writes.length,0);
  const proposed=await call('',{action:'plan',task:'Update docs and create a file',files:files.map(({op,path})=>({op,path}))});assert.equal(proposed.status,201);
  const draft=await proposed.json();assert.deepEqual(draft.files,files);assert.equal(writes.length,0);
  assert.equal((await call('?action=job&id='+draft.id,undefined,'other')).status,404);
  assert.equal((await call('',{action:'approve',id:draft.id,approve:true},'other')).status,404);
  assert.equal((await call('',{action:'approve',id:draft.id,approve:false})).status,409);
  assert.equal((await (await call('',{action:'approve',id:draft.id,approve:true})).json()).state,'queued');
  assert.equal((await call('',{action:'approve',id:draft.id,approve:true})).status,409);assert.equal(writes.length,1);
  assert.equal((await (await call('',{action:'sync',id:draft.id})).json()).state,'queued');
  hasPR=true;assert.equal((await call('',{action:'sync',id:draft.id,pr:12},'other')).status,404);wrong=true;assert.equal((await call('',{action:'sync',id:draft.id})).status,409);wrong=false;
  hidePRList=true;
  const hintOwner=await (await import('../durable-memory.js')).ownerKey({sub:'owner'});
  const hintSQL="INSERT INTO star_v3_observation(owner,job_id,checked,pr,head,observation) VALUES(?,?,?,?,?,'pr_seen')";
  sql.prepare(hintSQL).run('other-owner',draft.id,Date.now(),12,head);
  assert.equal((await (await call('',{action:'sync',id:draft.id})).json()).state,'queued');
  sql.prepare(hintSQL).run(hintOwner,draft.id,Date.now()-7200000,12,head);
  assert.equal((await (await call('',{action:'sync',id:draft.id})).json()).state,'queued');
  sql.prepare('UPDATE star_v3_observation SET checked=? WHERE owner=? AND job_id=?').run(Date.now(),hintOwner,draft.id);
  wrong=true;assert.equal((await call('',{action:'sync',id:draft.id})).status,409);wrong=false;
  assert.equal((await (await call('',{action:'sync',id:draft.id})).json()).state,'pr_open');
  assert.equal(writes.length,1);
  const status=await (await call('?action=status&id='+draft.id)).json();assert.equal(status.run.id,14);assert.equal(status.checks.length,2);
  assert.equal((await call('',{action:'merge',id:draft.id,approve:true})).status,409);
  const repair=await call('',{action:'repair',id:draft.id});assert.equal(repair.status,201);const fixed=await repair.json();assert.equal(fixed.kind,'repair');assert.equal(fixed.repairCount,1);assert.equal(fixed.files[0].after,'fixed');assert.equal(writes.length,1);
  passed=true;wrongExecutor=true;assert.equal((await call('',{action:'merge',id:draft.id,approve:true})).status,409);assert.equal(writes.length,1);wrongExecutor=false;
  const m=await call('',{action:'merge',id:draft.id,approve:true});assert.equal(m.status,200);assert.equal((await m.json()).mergeSha,mergeSha);assert.equal(writes.length,2);
  const rollback=await call('',{action:'rollback',id:draft.id});assert.equal(rollback.status,201);const inverse=await rollback.json();assert.equal(inverse.kind,'rollback');assert.equal(inverse.files[0].after,'old');assert.equal(inverse.files[1].op,'delete');assert.equal(writes.length,2);
  wrong=true;assert.equal((await call('',{action:'rollback',id:draft.id})).status,409);
  // Seed a merged stage in this isolated fixture; the actual rollback route must use exact stored bytes.
  wrong=false;sql.prepare("UPDATE star_developer_v2 SET state='merged',merge_sha=? WHERE owner=? AND id=?").run(mergeSha,ownKey,stageJob.id);
  const stageMerged=await (await call('?action=roadmap_progress&id='+road.id)).json();assert.equal(stageMerged.stages[0].state,'merged');
  const priorCalls=modelCalls,priorWrites=writes.length;
  assert.equal((await call('',{action:'rollback',id:stageJob.id},'other')).status,404);
  const staged=await call('',{action:'rollback',id:stageJob.id});assert.equal(staged.status,201);const restored=await staged.json();assert.equal(restored.parent,stageJob.id);assert.equal(restored.files[0].after,stageJob.files[0].before);
  const linked=await (await call('?action=roadmap_progress&id='+road.id)).json();assert.equal(linked.stages[0].rollbackJobId,restored.id);assert.equal(linked.stages[0].rollbackState,'draft');
  assert.equal(modelCalls,priorCalls);assert.equal(writes.length,priorWrites);
  wrong=true;assert.equal((await call('',{action:'rollback',id:stageJob.id})).status,409);wrong=false;
  sql.prepare("UPDATE star_developer_v2 SET state='merged',merge_sha=? WHERE owner=? AND id=?").run(mergeSha,ownKey,restored.id);
  const reverted=await (await call('?action=roadmap_progress&id='+road.id)).json();assert.equal(reverted.stages[0].state,'rolled_back');assert.equal(reverted.stages[0].rollbackJobId,restored.id);assert.equal(reverted.stages[0].rollbackState,'merged');
 }finally{sql.close();}
});

test('catalog excludes unsafe, oversized, nonregular and missing-size entries; smoke is fixed and preview only',()=>{
 const entries=new Map([['docs/a.md',{path:'docs/a.md',type:'blob',mode:'100644',sha:blob,size:10}],['docs/b.md',{path:'docs/b.md',type:'blob',mode:'120000',sha:blob,size:10}],['docs/secret.md',{path:'docs/secret.md',type:'blob',mode:'100644',sha:blob,size:1}],['docs/big.md',{path:'docs/big.md',type:'blob',mode:'100644',sha:blob,size:50000}]]);
 assert.deepEqual(fileCatalog(entries),[{path:'docs/a.md',size:10}]);
 const plan=smokeFiles({sha:blob,text:'original'},id);assert.equal(plan.length,2);assert.ok(plan[0].after.startsWith('original'));assert.equal(plan[1].path,'docs/v2-owner-check/'+id+'.md');
});

test('explicit documentation append preserves every original character and rejects ambiguous empty anchors',()=>{
 assert.equal(modelEdit('modify','original\n','{"append":"فقرة جديدة"}',true),'original\n\n\nفقرة جديدة\n');
 assert.throws(()=>modelEdit('modify','original','{"append":"new"}'));
 assert.throws(()=>modelEdit('modify','original','{"old":"","new":"new"}',true));
 assert.throws(()=>modelEdit('modify','original','{"append":"new","old":"original"}',true));
 assert.throws(()=>modelEdit('modify','original','{"append":"   "}',true));
});

 test('deterministic rollback removes the entire append including whitespace without model reconstruction',()=>{
 const original='Original documentation\n\n';const after=modelEdit('modify',original,'{"append":"STAR staged acceptance A"}',true);const f={path:'docs/existing.md',op:'modify',blob,before:original,after};const inverse=reversePlan([f],{[f.path]:{sha:head,text:after}});assert.equal(inverse[0].after,original);assert.equal(inverse[0].before,after);assert.throws(()=>reversePlan([f],{[f.path]:{sha:head,text:after+'unrelated edit'}}));
});


test('V3.11 isolated two-stage acceptance: gated order, concurrent approval, exact inverse and owner isolation',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const {readFileSync}=await import('node:fs');const {createHash}=await import('node:crypto');const {decodeText}=await import('../github-workspace.js');
 const sql=new DatabaseSync(':memory:');
 for(const n of ['001','002','003','004','005','006','007'])sql.exec(readFileSync(new URL('../../../cloudflare/memory/'+n+'.sql',import.meta.url),'utf8'));
 const db={prepare(query){return {bind(...args){const stmt=sql.prepare(query);return {first:async()=>stmt.get(...args)||null,all:async()=>({results:stmt.all(...args)}),run:async()=>({meta:{changes:Number(stmt.run(...args).changes)}})};}};}};
 const root='https://kali-osint-star.pages.dev',repo='abdulstarzeki001-sketch/KALI-OSINT-STAR',endpoint=root+'/api/ai/developer-v2';
 const path='docs/staged-acceptance.md',original='Original documentation.\n\n';
 const digest=s=>createHash('sha1').update(s).digest('hex');
 let current=base,active=null,serial=0,modelCalls=0;
 const snapshots=new Map([[base,original]]),prs=new Map(),runs=new Map(),writes=[];
 const stages=['Add marker A','Add marker B'].map(task=>({title:task,task,acceptance:'One marker only',files:[{path,op:'modify'}]}));
 const env={STAR_MEMORY:db,STAR_GITHUB_TOKEN:'github_pat_TEST_ONLY',
 STAR_AI:{fetch:async(_url,init)=>{modelCalls++;const m=JSON.parse(init.body).messages;const reply=m[0].content.includes('repository planning assistant')?{summary:'Two stages',stages}:{append:m.at(-1).content.includes('Add marker B')?'Marker B':'Marker A'};return Response.json({reply:JSON.stringify(reply)});}},
 STAR_GITHUB_EGRESS:{fetch:async(url,init)=>{
  const u=new URL(url),p=u.pathname.slice(('/repos/'+repo).length),body=init.body?JSON.parse(init.body):null;
  if(init.method!=='GET')writes.push(p);
  if(p==='/git/ref/heads/main')return Response.json({object:{sha:current}});
  if(p.startsWith('/git/trees/')){const sha=p.split('/').at(-1),text=snapshots.get(sha);assert.equal(typeof text,'string');return Response.json({tree:[{path,type:'blob',mode:'100644',sha:digest(text),size:Buffer.byteLength(text)}]});}
  if(p.startsWith('/contents/')){const text=snapshots.get(u.searchParams.get('ref'));assert.equal(p,'/contents/'+path);return Response.json({type:'file',encoding:'base64',sha:digest(text),size:Buffer.byteLength(text),content:encodeText(text)});}
  if(p==='/dispatches'&&init.method==='POST'){
   const approved=validatePayload(body.client_payload);assert.equal(approved.base,current);assert.equal(approved.files.length,1);assert.equal(approved.files[0].blob,digest(snapshots.get(current)));
   const next=decodeText(approved.files[0].content),number=++serial,sha=digest('head-'+number),branch='star-ai/edit-'+approved.id;
   snapshots.set(sha,next);const pr={number,state:'open',base:{ref:'main',sha:current},head:{ref:branch,sha,repo:{full_name:repo}},merged:false};
   prs.set(number,pr);runs.set(approved.id,{id:100+number,display_title:'STAR V2 '+approved.id,event:'repository_dispatch',head_sha:current,status:'completed',conclusion:'success'});active=pr;
   return new Response(null,{status:204});
  }
  if(p==='/pulls'&&init.method==='GET')return Response.json([...prs.values()].filter(pr=>pr.state==='open'));
  if(/^\/pulls\/\d+\/files$/.test(p))return Response.json([{filename:path,status:'modified'}]);
  if(/^\/pulls\/\d+$/.test(p))return Response.json(prs.get(Number(p.split('/').at(-1))));
  if(p==='/actions/workflows/star-ai-developer-v2.yml/runs')return Response.json({workflow_runs:[...runs.values()]});
  if(p.startsWith('/actions/workflows/'))return Response.json({workflow_runs:[{id:p.includes('ci.yml')?201:202,head_sha:active.head.sha,event:'workflow_dispatch',head_branch:active.head.ref,status:'completed',conclusion:'success'}]});
  if(/^\/pulls\/\d+\/merge$/.test(p)&&init.method==='PUT'){
   const pr=prs.get(Number(p.split('/')[2]));assert.equal(pr.base.sha,current);assert.equal(body.sha,pr.head.sha);const merged=digest('merge-'+pr.number);snapshots.set(merged,snapshots.get(pr.head.sha));current=merged;pr.state='closed';pr.merged=true;return Response.json({merged:true,sha:merged});
  }
  throw Error('Unexpected '+p);
 }}};
 const call=(query='',data,sub='owner')=>handleDeveloper({request:new Request(endpoint+query,{...(data?{method:'POST',headers:{origin:root,'content-type':'application/json'},body:JSON.stringify(data)}:{})}),env},async()=>({ok:true,identity:{sub}}));
 const doMerge=async job=>{
  assert.equal((await call('',{action:'approve',id:job.id,approve:true},'other')).status,404);
  const before=writes.length;
  const approvals=await Promise.all(Array.from({length:8},()=>call('',{action:'approve',id:job.id,approve:true})));
  assert.equal(approvals.filter(x=>x.status===200).length,1);assert.equal(approvals.filter(x=>x.status===409).length,7);assert.equal(writes.length,before+1);
  assert.equal((await (await call('',{action:'sync',id:job.id})).json()).state,'pr_open');
  assert.equal((await call('',{action:'merge',id:job.id,approve:false})).status,409);
  const response=await call('',{action:'merge',id:job.id,approve:true});assert.equal(response.status,200);assert.equal((await response.json()).state,'merged');assert.equal(writes.length,before+2);
 };
 try{
  const planned=await call('',{action:'roadmap',task:'Add marker A then B to the existing documentation',provider:'llama-cloudflare'});assert.equal(planned.status,201);const road=await planned.json();assert.equal(road.roadmap.stages.length,2);
  const prepare=index=>call('',{action:'prepare_stage',roadmapId:road.id,index});
  const progress=async()=>(await (await call('?action=roadmap_progress&id='+road.id)).json()).stages;
  assert.equal((await prepare(1)).status,409);
  const one=await (await prepare(0)).json();assert.equal(one.kind,'stage');assert.equal((await prepare(1)).status,409);assert.equal(writes.length,0);
  await doMerge(one);assert.equal((await progress())[0].state,'merged');
  const two=await (await prepare(1)).json();assert.equal(two.kind,'stage');assert.equal(two.base,current);assert.equal(two.files[0].before,one.files[0].after);
  await doMerge(two);assert.deepEqual((await progress()).map(p=>p.state),['merged','merged']);assert.equal(snapshots.get(current),two.files[0].after);
  assert.equal((await call('',{action:'rollback',id:one.id})).status,409);
  const count=modelCalls;
  const undoTwo=await (await call('',{action:'rollback',id:two.id})).json();assert.equal(undoTwo.files[0].after,one.files[0].after);await doMerge(undoTwo);
  const undoOne=await (await call('',{action:'rollback',id:one.id})).json();assert.equal(undoOne.files[0].after,original);await doMerge(undoOne);
  assert.equal(snapshots.get(current),original);assert.equal(modelCalls,count);assert.deepEqual((await progress()).map(p=>p.state),['rolled_back','rolled_back']);assert.equal(writes.length,8);
 }finally{sql.close();}
});

test('V3.11 bounded stress: 1000 exact Unicode and whitespace restores, 1000 conflicting restores rejected',()=>{
 const start=performance.now();for(let i=0;i<1000;i++){
  const before='Doc '+i+' العربية کوردی 🙂\r\n'+' '.repeat(i%7)+'\n'.repeat(i%5+1);
  const after=modelEdit('modify',before,JSON.stringify({append:'Marker '+i}),true),f={path:'docs/stress.md',op:'modify',blob,before,after};
  const inverse=reversePlan([f],{[f.path]:{sha:head,text:after}});
  assert.equal(inverse[0].after,before);assert.throws(()=>reversePlan([f],{[f.path]:{sha:head,text:after+'later change'}}));
 }
 console.log('STAR_STRESS exact=1000 conflict_rejected=1000 elapsed_ms='+Math.round(performance.now()-start));
});
