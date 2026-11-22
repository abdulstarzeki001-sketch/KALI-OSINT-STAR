import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runEngineeringCycle} from '../src/engineering-agent.ts';
function setup(overrides={}){
 const controller=new AbortController(),calls=[],phases=[],proposals=[],reviews=[];
 const source='def add(a,b):\n    return a+b',candidate=source+'\n# Add numbers';
 const opts={name:'sample.py',source,task:'documentation',consentQwen:true,consentLlama:true,signal:controller.signal,isCurrent:()=>true,
  ask:async(model,messages)=>{calls.push(model);return model==='qwen3-coder-vast'?{model,reply:JSON.stringify({source:candidate,summary:'Add comment'})}:{model:'@cf/meta/llama-3.3-70b-instruct-fp8-fast',reply:'Review only; test not executed.'}},
  onPhase:p=>phases.push(p),onProposal:p=>proposals.push(p),onReview:(p,r)=>reviews.push(r),...overrides};
 return {opts,controller,calls,phases,proposals,reviews};
}
test('sequential proposal and review never apply or claim tests',async()=>{
 const s=setup();const r=await runEngineeringCycle(s.opts);
 assert.deepEqual(s.calls,['qwen3-coder-vast','llama-cloudflare']);
 assert.deepEqual(s.phases,['proposing','reviewing','ready']);
 assert.equal(r.applied,false);assert.equal(r.testsExecuted,false);assert.equal(s.reviews.length,1);
});
test('requires both provider consents before any request',async()=>{
 for(const key of ['consentQwen','consentLlama']){const s=setup({[key]:false});await assert.rejects(runEngineeringCycle(s.opts));assert.equal(s.calls.length,0)}
});
test('invalid proposal stops before review',async()=>{
 const s=setup({ask:async()=>({model:'wrong',reply:'bad'})});
 await assert.rejects(runEngineeringCycle(s.opts));assert.deepEqual(s.phases,['proposing','stopped']);assert.equal(s.proposals.length,0);
});
test('source change during proposal blocks review',async()=>{
 const s=setup();let current=true;s.opts.isCurrent=()=>current;
 const ask=s.opts.ask;s.opts.ask=async(...args)=>{const r=await ask(...args);current=false;return r};
 await assert.rejects(runEngineeringCycle(s.opts));assert.equal(s.calls.length,1);assert.equal(s.proposals.length,0);
});
test('cancellation after proposal stops second provider',async()=>{
 const s=setup();s.opts.onProposal=()=>s.controller.abort();
 await assert.rejects(runEngineeringCycle(s.opts));assert.equal(s.calls.length,1);assert.equal(s.phases.at(-1),'stopped');
});
test('review failure leaves proposal available but not approved',async()=>{
 const s=setup();const ask=s.opts.ask;s.opts.ask=async(...args)=>{if(args[0]==='llama-cloudflare')throw Error('Unavailable');return ask(...args)};
 await assert.rejects(runEngineeringCycle(s.opts));assert.equal(s.proposals.length,1);assert.equal(s.reviews.length,0);assert.equal(s.phases.at(-1),'stopped');
});
