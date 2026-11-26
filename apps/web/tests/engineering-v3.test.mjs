import {test} from 'node:test';import assert from 'node:assert/strict';
import {inventory,parseRoadmap,roadmapMessages,collectSourceReview,reviewedRoadmapMessages} from '../engineering-v3.js';
import {engineeringCompletion} from '../functions/api/ai/engineering-provider.js';
const sha='a'.repeat(40),entry=(path,size=100)=>({path,size,type:'blob',mode:'100644',sha});
const entries=new Map(['docs/STAR_AUTONOMOUS_DEVELOPER_V2.md','apps/web/src/Other.tsx','.github/workflows/ci.yml','docs/secret.md'].map(p=>[p,entry(p)]));
entries.set('docs/large.md',entry('docs/large.md',13000));
const plan={summary:'Review documentation',stages:[{title:'Docs',task:'Update explanation',acceptance:'CI passes',files:[{path:'docs/STAR_AUTONOMOUS_DEVELOPER_V2.md',op:'modify'}]}]};
test('inventory ranks full tree metadata and excludes unauthorized and oversized files',()=>{
 const scan=inventory(entries,'أضف توثيق المطور V2');assert.equal(scan.total,5);assert.equal(scan.eligible,2);assert.equal(scan.candidates[0].path,'docs/STAR_AUTONOMOUS_DEVELOPER_V2.md');assert.ok(roadmapMessages('documentation',scan).every(m=>m.content.length<=5000));
 assert.deepEqual(parseRoadmap(JSON.stringify(plan),scan.candidates),plan);
 for(const op of ['create','delete'])assert.throws(()=>parseRoadmap(JSON.stringify({...plan,stages:[{...plan.stages[0],files:[{path:plan.stages[0].files[0].path,op}]}]}),scan.candidates));
 assert.throws(()=>parseRoadmap(JSON.stringify({...plan,stages:[{...plan.stages[0],files:[{path:'.github/workflows/ci.yml',op:'modify'}]}]}),scan.candidates));
});
test('provider choice is explicit; private model does not silently fail over',async()=>{
 const req=new Request('https://kali-osint-star.pages.dev',{headers:{'Cf-Access-Jwt-Assertion':'mock-access'}});
 let calls=0;const env={STAR_AI:{fetch:async()=>{calls++;return Response.json({reply:'cloud result'});}}};
 const messages=[{role:'user',content:'Plan docs'}];
 const fake=async(url,init)=>{assert.match(url,/\.up\.railway\.app\/v1\/chat\/completions$/);assert.equal(init.headers.authorization,'Bearer mock-access');return new Response(null,{status:503});};
 assert.equal((await engineeringCompletion(req,env,messages,'qwen3-coder-vast',fake)).ok,false);assert.equal(calls,0);
 const auto=await engineeringCompletion(req,env,messages,'star-ai-auto',fake);assert.equal(auto.model,'llama-cloudflare');assert.equal(calls,1);
 const privateResult=await engineeringCompletion(req,env,messages,'qwen3-coder-vast',async()=>Response.json({choices:[{message:{content:'private result'}}]}));assert.equal(privateResult.model,'qwen3-coder-vast');assert.equal(calls,1);
 await assert.rejects(engineeringCompletion(req,env,[{role:'user',content:'-----BEGIN PRIVATE KEY-----'}],'llama-cloudflare'));
});

test('source review bounds excerpts, excludes secrets and stores only metadata',async()=>{
 const scan={candidates:Array.from({length:6},(_,i)=>({path:'docs/'+i+'.md',size:4000}))};
 const calls=[];const review=await collectSourceReview(scan,async path=>{calls.push(path);if(path==='docs/1.md')return {sha,text:'-----BEGIN PRIVATE KEY-----'};if(path==='docs/2.md')throw Error('missing');return {sha,text:'x'.repeat(4000)};});
 assert.equal(calls.length,4);assert.equal(review.reviewed.length,2);assert.equal(review.reviewed[0].chars,3000);assert.equal(review.reviewed[0].partial,true);assert.ok(!JSON.stringify(review.reviewed).includes('xxxx'));assert.ok(!JSON.stringify(review.messages).includes('PRIVATE KEY'));
 const messages=reviewedRoadmapMessages('Improve docs',scan,review);assert.ok(messages.every(m=>m.content.length<=5000));assert.ok(messages.at(-1).content.includes('Improve docs'));
});

test('planner contract explicitly disallows creating files',()=>{assert.match(roadmapMessages('documentation',inventory(entries,'documentation'))[0].content,/Never create, rename or delete files/);});
