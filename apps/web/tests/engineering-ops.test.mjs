import {test} from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import worker,{observe,matchObservation} from '../../../cloudflare/engineering-monitor/worker.mjs';
import {handleOps,publicProject} from '../functions/api/ai/engineering-ops.js';
const id='12345678-1234-1234-1234-123456789abc',base='a'.repeat(40),head='b'.repeat(40),repo='abdulstarzeki001-sketch/KALI-OSINT-STAR';
const root='https://kali-osint-star.pages.dev',endpoint=root+'/api/ai/engineering-ops';
function fixture(){const sql=new DatabaseSync(':memory:');for(const n of ['004','007'])sql.exec(readFileSync(new URL('../../../cloudflare/memory/'+n+'.sql',import.meta.url),'utf8'));const db={prepare(q){const wrap=(args)=>({all:async()=>({results:sql.prepare(q).all(...args)}),first:async()=>sql.prepare(q).get(...args)||null,run:async()=>({meta:{changes:Number(sql.prepare(q).run(...args).changes)}})});return {...wrap([]),bind:(...args)=>wrap(args)};}};return {sql,env:{STAR_MEMORY:db}};}
test('observer matches approved job, exact head/base and never changes authoritative state',async()=>{
 const {sql,env}=fixture();try{
 sql.prepare("INSERT INTO star_developer_v2(owner,id,task,state,base_sha,files_json,kind,created) VALUES(?,?,?,?,?,?,?,?)").run('owner',id,'docs','queued',base,'[]','smoke',1);
 const run={id:42,display_title:'STAR V2 '+id,event:'repository_dispatch',head_sha:base,status:'completed',conclusion:'success'};
 const pr={number:12,state:'open',head:{ref:'star-ai/edit-'+id,sha:head,repo:{full_name:repo}},base:{ref:'main',sha:base}};
 const calls=[];const f=async(url,init)=>{calls.push(url);assert.equal(init.method,'GET');assert.equal(init.headers.authorization,undefined);return Response.json(url.includes('/actions/')?{workflow_runs:[run]}:[pr]);};
 assert.equal((await observe(env,f,123)).observed,1);assert.equal(calls.length,2);
 assert.equal(sql.prepare('SELECT state FROM star_developer_v2').get().state,'queued');const row=sql.prepare('SELECT * FROM star_v3_observation').get();assert.equal(row.pr,12);assert.equal(row.head,head);assert.equal(row.executor_id,42);
 assert.equal(matchObservation({id,base_sha:base},[{...run,head_sha:head}],[{...pr,base:{ref:'main',sha:head}}]).observation,'not_seen');
 await assert.rejects(observe(env,async()=>new Response(null,{status:429}),124));assert.equal(sql.prepare('SELECT status FROM star_v3_monitor_heartbeat').get().status,'upstream_error');assert.equal(sql.prepare('SELECT checked FROM star_v3_observation').get().checked,123);
 assert.equal((await worker.fetch()).status,404);
 }finally{sql.close();}
});
test('ops isolates notes, model history and public registry; no arbitrary URLs',async()=>{
 const {sql,env}=fixture();const auth=sub=>async()=>({ok:true,identity:{sub}});
 const fake=async(url,init)=>{assert.equal(url,'https://api.github.com/repos/example/project');assert.equal(init.method,'GET');assert.equal(init.headers.authorization,undefined);return Response.json({full_name:'example/project',private:false,default_branch:'main',description:'Public example'});};
 const call=(body,sub='owner')=>handleOps({request:new Request(endpoint,body?{method:'POST',headers:{origin:root,'content-type':'application/json'},body:JSON.stringify(body)}:{}),env},auth(sub),fake);
 try{assert.equal((await call({action:'note',category:'decision',note:'Review tests first'})).status,201);assert.equal((await call({action:'note',category:'note',note:'-----BEGIN PRIVATE KEY-----'})).status,422);
 assert.equal((await call({action:'project',repo:'example/project'})).status,201);assert.equal((await call({action:'project',repo:'https://evil.example'})).status,422);
 const own=await (await call()).json();assert.equal(own.notes.length,1);assert.equal(own.projects.length,1);assert.equal(own.writeRepo,repo);
 const other=await (await call(undefined,'other')).json();assert.equal(other.notes.length,0);assert.equal(other.projects.length,0);
 assert.equal((await call({action:'delete_note',id:own.notes[0].id,confirm:true},'other')).status,404);
 assert.equal((await call({action:'delete_note',id:own.notes[0].id})).status,422);
 assert.equal((await call({action:'delete_note',id:own.notes[0].id,confirm:true})).status,200);
 assert.equal((await call({action:'remove_project',repo:'example/project',confirm:true},'other')).status,404);
 assert.equal((await call({action:'remove_project',repo:'example/project',confirm:true})).status,200);
 const remaining=await (await call()).json();assert.equal(remaining.notes.length,0);assert.equal(remaining.projects.length,0);
 await assert.rejects(publicProject('example/project',async()=>Response.json({full_name:'example/project',private:true,default_branch:'main'})));
 assert.equal((await handleOps({request:new Request(endpoint),env},async()=>({ok:false,reason:'ACCESS_REQUIRED'}))).status,401);
 }finally{sql.close();}
});
