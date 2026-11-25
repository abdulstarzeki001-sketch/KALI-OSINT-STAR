import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleMemory} from '../functions/api/ai/memory.js';
import {ownerKey,memoryContext,attachMemory} from '../durable-memory.js';
const auth=async()=>({ok:true,identity:{sub:'owner',email:'a@example.com'}});
const base='https://kali-osint-star.pages.dev';
function req(method='GET',data,origin=base){return new Request(base+'/api/ai/memory',{method,headers:{origin,'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});}
test('rejects anonymous and cross origin, fails closed without D1',async()=>{
 assert.equal((await handleMemory({request:req(),env:{}},async()=>({ok:false,reason:'ACCESS_REQUIRED'}))).status,401);
 assert.equal((await handleMemory({request:req('POST',{id:'x'},'https://evil.example'),env:{}},auth)).status,403);
 assert.equal((await handleMemory({request:req(),env:{}},auth)).status,503);
});
test('SQL reads and writes are scoped to verified owner, never caller provided owner',async()=>{
 let bindings;const db={prepare:()=>({bind:(...p)=>{bindings=p;return {all:async()=>({results:[]}),run:async()=>({meta:{changes:1}})};}})};
 assert.equal((await handleMemory({request:req(),env:{STAR_MEMORY:db}},auth)).status,200);
 const owner=await ownerKey({sub:'owner',email:'a@example.com'});assert.equal(bindings[0],owner);
 assert.equal((await handleMemory({request:req('POST',{id:'test',kind:'instruction',body:'test',owner:'other'}),env:{STAR_MEMORY:db}},auth)).status,201);
 assert.equal(bindings[0],owner);assert.notEqual(owner,await ownerKey({sub:'other'}));
 assert.equal((await handleMemory({request:req('POST',{id:'test',kind:'shell',body:'test'}),env:{STAR_MEMORY:db}},auth)).status,422);
});
test('context is bounded and does not alter last user prompt',async()=>{
 const db={prepare:()=>({bind:()=>({all:async()=>({results:[{kind:'instruction',body:'remember tests',state:'saved'},{kind:'note',body:'x'.repeat(4000),state:'saved'}]})})})};
 const ctx=await memoryContext(db,'owner');assert.match(ctx,/remember tests/);assert.ok(ctx.length<3200);
 const last={role:'user',content:'latest prompt'};const messages=attachMemory([...Array(23)].map(()=>({role:'user',content:'x'.repeat(1000)})).concat(last),ctx);
 assert.deepEqual(messages.at(-1),last);assert.ok(messages.length<=24);assert.ok(messages.reduce((n,m)=>n+m.content.length,0)<=24000);
});
