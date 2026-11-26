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
 for(const name of ['001','002','003','004','005','006'])sql.exec(readFileSync(new URL('../../../cloudflare/memory/'+name+'.sql',import.meta.url),'utf8'));
 const db={prepare(query){return {bind(...args){const stmt=sql.prepare(query);return {first:async()=>stmt.get(...args)||null,all:async()=>({results:stmt.all(...args)}),run:async()=>({meta:{changes:Number(stmt.run(...args).changes)}})};}};}};
 const root='https://kali-osint-star.pages.dev',repo='abdulstarzeki001-sketch/KALI-OSINT-STAR',endpoint=root+'/api/ai/developer-v2';
 let main=base,dispatched=null,hasPR=false,wrong=false,passed=false,merged=false;
 const writes=[],newblob='e'.repeat(40),newblob2='f'.repeat(40),mergeSha='1'.repeat(40);
 const smokePath='docs/STAR_AUTONOMOUS_DEVELOPER_V2.md';
 const entries=[{path:files[0].path,type:'blob',mode:'100644',sha:blob,size:3},{path:smokePath,type:'blob',mode:'100644',sha:blob,size:3}];
 const updated=files.map((f,i)=>({path:f.path,type:'blob',mode:'100644',sha:i?newblob2:newblob}));
 const env={STAR_MEMORY:db,STAR_GITHUB_TOKEN:'github_pat_TEST_ONLY',
 STAR_AI:{fetch:async(_url,init)=>{const m=JSON.parse(init.body).messages;if(m[0].content.includes('repository planning assistant'))return Response.json({reply:JSON.stringify({summary:'Docs plan',stages:[{title:'Docs',task:'Update docs',acceptance:'CI passes',files:[{path:files[0].path,op:'modify'}]}]})});const repair=m.at(-1).content.includes('Repair this proposed file');const create=m[0].content.includes('complete new text file');const first=m[0].content.includes('current path: docs/existing.md');return Response.json({reply:JSON.stringify(repair?(first?{old:'new',new:'fixed'}:{old:'created',new:'fixed new file'}):create?{content:'created'}:{old:'old',new:'new'})});}},
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
  if(p==='/pulls'&&init.method==='GET')return Response.json(hasPR?[pr]:[]);
  if(p==='/pulls/12/files')return Response.json([{filename:files[0].path,status:'modified'},{filename:files[1].path,status:'added'}]);
  if(p==='/pulls/12')return Response.json(pr);
  if(p==='/actions/workflows/star-ai-developer-v2.yml/runs')return Response.json({workflow_runs:dispatched?[{id:14,display_title:'STAR V2 '+dispatched.id,event:'repository_dispatch',status:'completed',conclusion:'success'}]:[]});
  if(p.startsWith('/actions/workflows/'))return Response.json({workflow_runs:[{id:p.includes('ci.yml')?15:16,head_sha:head,event:'workflow_dispatch',head_branch:branch,status:'completed',conclusion:passed?'success':'failure'}]});
  if(/^\/actions\/runs\/\d+\/jobs$/.test(p))return Response.json({jobs:[{name:'web',conclusion:'failure',steps:[{name:'Run npm test',conclusion:'failure'}]}]});
  if(p==='/pulls/12/merge'&&init.method==='PUT'){assert.equal(body.sha,head);assert.ok(passed);merged=true;main=mergeSha;return Response.json({merged:true,sha:mergeSha});}
  throw Error('Unexpected '+p);
 }}};
 const auth=sub=>async()=>({ok:true,identity:{sub}});
 const call=(query='',data,sub='owner')=>handleDeveloper({request:new Request(endpoint+query,{...(data?{method:'POST',headers:{origin:root,'content-type':'application/json'},body:JSON.stringify(data)}:{})}),env},auth(sub));
 try{
  const planned=await call('',{action:'roadmap',task:'Update existing docs',provider:'llama-cloudflare',reviewSource:true});assert.equal(planned.status,201);const road=await planned.json();assert.equal(road.provider,'llama-cloudflare');assert.equal(road.roadmap.sourceReview.files.length,2);assert.equal(road.roadmap.sourceReview.files[0].partial,false);assert.equal(road.roadmap.stages[0].files[0].path,files[0].path);assert.equal(writes.length,0);
  assert.equal((await (await call('?action=roadmaps')).json()).roadmaps.length,1);assert.equal((await (await call('?action=roadmaps',undefined,'other')).json()).roadmaps.length,0);
  const stageBefore=await (await call('?action=roadmap_progress&id='+road.id)).json();assert.equal(stageBefore.stages[0].state,'planned');
  assert.equal((await call('?action=roadmap_progress&id='+road.id,undefined,'other')).status,404);
  assert.equal((await call('',{action:'prepare_stage',roadmapId:road.id,index:0},'other')).status,404);
  const stageDraft=await call('',{action:'prepare_stage',roadmapId:road.id,index:0});assert.equal(stageDraft.status,201);const stageJob=await stageDraft.json();assert.equal(stageJob.kind,'stage');assert.equal(stageJob.parent,road.id);assert.equal(writes.length,0);
  const repeat=await (await call('',{action:'prepare_stage',roadmapId:road.id,index:0})).json();assert.equal(repeat.id,stageJob.id);
  const stageAfter=await (await call('?action=roadmap_progress&id='+road.id)).json();assert.equal(stageAfter.stages[0].jobId,stageJob.id);assert.equal(stageAfter.stages[0].state,'draft');
  assert.equal((await call('',{action:'discard',id:stageJob.id,approve:true})).status,200);
  assert.equal((await (await call('?action=roadmap_progress&id='+road.id)).json()).stages[0].state,'planned');
  const probe=await (await call('',{action:'model_probe',provider:'llama-cloudflare'})).json();assert.equal(probe.ok,true);assert.equal(probe.provider,'llama-cloudflare');assert.equal(writes.length,0);
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
  assert.equal((await (await call('',{action:'sync',id:draft.id,pr:12})).json()).state,'pr_open');
  const status=await (await call('?action=status&id='+draft.id)).json();assert.equal(status.run.id,14);assert.equal(status.checks.length,2);
  assert.equal((await call('',{action:'merge',id:draft.id,approve:true})).status,409);
  const repair=await call('',{action:'repair',id:draft.id});assert.equal(repair.status,201);const fixed=await repair.json();assert.equal(fixed.kind,'repair');assert.equal(fixed.repairCount,1);assert.equal(fixed.files[0].after,'fixed');assert.equal(writes.length,1);
  passed=true;const m=await call('',{action:'merge',id:draft.id,approve:true});assert.equal(m.status,200);assert.equal((await m.json()).mergeSha,mergeSha);assert.equal(writes.length,2);
  const rollback=await call('',{action:'rollback',id:draft.id});assert.equal(rollback.status,201);const inverse=await rollback.json();assert.equal(inverse.kind,'rollback');assert.equal(inverse.files[0].after,'old');assert.equal(inverse.files[1].op,'delete');assert.equal(writes.length,2);
  wrong=true;assert.equal((await call('',{action:'rollback',id:draft.id})).status,409);
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
