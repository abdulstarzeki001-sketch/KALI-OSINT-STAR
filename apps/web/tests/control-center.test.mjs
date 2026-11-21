import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CONTROL_SECTIONS,CONTROL_LABELS,isControlSection,parseConnection} from '../src/control-center.ts';
const reply={model:'qwen3-coder-vast',status:'completed',analysis:'A real response describing a synthetic unit test.'};
test('all nine sections have unique ids and labels',()=>{
 assert.equal(new Set(CONTROL_SECTIONS).size,9);
 for(const id of CONTROL_SECTIONS){assert.equal(isControlSection(id),true);assert.ok(CONTROL_LABELS[id])}
 assert.equal(isControlSection('unknown'),false);
});
test('model status requires completed response and expected alias',()=>{
 assert.deepEqual(parseConnection(reply,'qwen3-coder-vast',21.6),{state:'responded',elapsedMs:22,model:'qwen3-coder-vast'});
 for(const data of [{...reply,status:'failed'},{...reply,model:'other'},{...reply,analysis:'hi'},null])assert.throws(()=>parseConnection(data,'qwen3-coder-vast',20));
});
test('Llama must report configured identity',()=>{
 assert.equal(parseConnection({...reply,model:'@cf/meta/llama-3.3-70b-instruct-fp8-fast'},'llama-cloudflare',10).state,'responded');
 assert.throws(()=>parseConnection(reply,'llama-cloudflare',10));
});
test('reject invalid model and latency',()=>{
 assert.throws(()=>parseConnection(reply,'unknown',20));
 for(const ms of [-1,Infinity,NaN])assert.throws(()=>parseConnection(reply,'qwen3-coder-vast',ms));
});
