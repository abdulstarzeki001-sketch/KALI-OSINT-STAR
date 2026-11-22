import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recommendModel,routeEvidence,PROBE_TTL,BENCHMARK_TTL} from '../src/smart-router.ts';
const now=Date.parse('2026-11-22T00:00:00Z');
const q='qwen3-coder-vast',l='llama-cloudflare',llama='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const probes={[q]:{state:'responded',at:now-1000,elapsedMs:1000},[l]:{state:'responded',at:now-1000,elapsedMs:2000}};
function runs(model,correct,count=3,at=now-1000){return Array.from({length:count},()=>({model,correct,total:5,complete:true,version:'python-compat-v1',ms:100,at:new Date(at).toISOString()}))}
test('role defaults with no measurements do not claim availability',()=>{
 const r=recommendModel('coding',[],{},now);assert.equal(r.model,q);assert.equal(r.reason,'role');assert.ok(r.evidence.every(e=>e.connection==='unknown'));
 assert.equal(recommendModel('review',[],{},now).model,l);
});
test('recent connectivity can recommend alternative without sending',()=>{
 const r=recommendModel('coding',[],{[q]:{state:'failed',at:now,elapsedMs:null},[l]:probes[l]},now);
 assert.equal(r.model,l);assert.equal(r.reason,'connectivity');
 assert.equal(recommendModel('coding',[],{[q]:{state:'failed',at:now,elapsedMs:null}},now).model,null);
});
test('stale and future probes remain unknown',()=>{
 const r=routeEvidence([],{[q]:{state:'responded',at:now-PROBE_TTL-1,elapsedMs:1},[l]:{state:'responded',at:now+1,elapsedMs:1}},now);
 assert.ok(r.every(e=>e.connection==='unknown'&&e.latencyMs===null));
});
test('recent completed benchmark evidence can choose general route',()=>{
 const r=recommendModel('general',[...runs(q,5),...runs(llama,3)],probes,now);
 assert.equal(r.model,q);assert.equal(r.reason,'benchmark');
 assert.equal(recommendModel('review',[...runs(q,5),...runs(llama,3)],probes,now).model,l);
});
test('latency only breaks close benchmark scores with enough samples',()=>{
 const r=recommendModel('general',[...runs(q,4),...runs(llama,4)],probes,now);
 assert.equal(r.model,q);assert.equal(r.reason,'latency');
 assert.equal(recommendModel('general',[...runs(q,5,2),...runs(llama,3,2)],probes,now).model,l);
});
test('exclude incomplete, stale and future runs and cap recent history',()=>{
 const r=routeEvidence([...runs(q,5,15),...runs(q,0,3,now-BENCHMARK_TTL-1),...runs(q,0,3,now+1000),...runs(q,0,3).map(x=>({...x,complete:false}))],probes,now);
 assert.equal(r[0].benchmarkCount,10);assert.equal(r[0].averageScore,5);
 assert.equal(r[1].averageScore,null);
});
