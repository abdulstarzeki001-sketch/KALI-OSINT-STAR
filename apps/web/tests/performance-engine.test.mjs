import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendSample,parseUsage,remainingCooldown,summarizePerformance} from '../src/performance-engine.ts';
import {providerUsage} from '../functions/api/ai/analyze.js';
const model='qwen3-coder-vast';
const usage={prompt_tokens:100,completion_tokens:20,total_tokens:120};
test('accept only consistent numeric provider token counts',()=>{
 for(const parse of [parseUsage,providerUsage]){
  assert.deepEqual(parse({...usage,raw:'not exposed'}),usage);
  for(const bad of [null,{}, {...usage,total_tokens:121},{...usage,prompt_tokens:-1},{...usage,total_tokens:'120'}])assert.equal(parse(bad),null);
 }
});
test('latency percentiles exclude failed requests',()=>{
 const samples=[100,200,300,400,500].map(elapsedMs=>({model,elapsedMs,status:'responded',usage:null}));
 samples.push({model,elapsedMs:9000,status:'timeout',usage:null});
 samples.push({model,elapsedMs:20,status:'rate-limited',usage:null});
 const result=summarizePerformance(samples,model);
 assert.equal(result.p50,300);assert.equal(result.p95,500);assert.equal(result.requests,7);assert.equal(result.failed,2);assert.equal(result.rateLimited,1);
});
test('missing usage is unknown, not zero',()=>{
 const samples=[{model,elapsedMs:10,status:'responded',usage:null}];
 assert.equal(summarizePerformance(samples,model).totalTokens,null);
 const result=summarizePerformance([...samples,{model,elapsedMs:20,status:'responded',usage}],model);
 assert.equal(result.usageSamples,1);assert.equal(result.totalTokens,120);
});
test('bounded samples and invalid metrics',()=>{
 let rows=[];
 for(let i=0;i<45;i++)rows=appendSample(rows,{model,elapsedMs:i,status:'responded',usage});
 assert.equal(rows.length,40);assert.equal(rows[0].elapsedMs,5);
 assert.throws(()=>appendSample(rows,{model,elapsedMs:-1,status:'responded',usage}));
 assert.equal(appendSample([],{model,elapsedMs:5,status:'failed',usage})[0].usage,null);
});
test('cooldown prevents repeated checks and does not run requests',()=>{
 assert.equal(remainingCooldown(100,null),0);assert.equal(remainingCooldown(100,100),30000);
 assert.equal(remainingCooldown(15100,100),15000);assert.equal(remainingCooldown(30100,100),0);
});
test('separate model metrics and no latency on missing samples',()=>{
 const rows=[{model,elapsedMs:20,status:'responded',usage}];
 const result=summarizePerformance(rows,'llama-cloudflare');
 assert.equal(result.requests,0);assert.equal(result.p95,null);assert.equal(result.totalTokens,null);
});
