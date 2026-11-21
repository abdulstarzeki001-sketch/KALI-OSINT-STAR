import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseReview,parseQualityReport} from '../src/quality-report.ts';
const good={model:'qwen3-coder:30b',elapsed_seconds:2.4,tokens_per_second:32,executed_generated_code:false,static_findings:[{rule:'PYDANTIC_V1_API',line:2}],response:'not displayed'};
test('accept report and expose metrics only',()=>{
 const r=parseQualityReport(JSON.stringify(good));
 assert.equal(r.tokens_per_second,32);assert.equal(r.findings[0].line,2);
 assert.equal(Object.hasOwn(r,'response'),false);
});
test('reject invalid report fields',()=>{
 for(const bad of [{elapsed_seconds:-2},{tokens_per_second:'fast'},{executed_generated_code:true},{static_findings:[{rule:'bad<script>',line:0}]}]){
  assert.throws(()=>parseQualityReport(JSON.stringify({...good,...bad})));
 }
 assert.throws(()=>parseQualityReport('not JSON'));
});
test('allow unknown speed only as null',()=>assert.equal(parseQualityReport(JSON.stringify({...good,tokens_per_second:null})).tokens_per_second,null));
test('reject mismatched or incomplete model replies',()=>{
 const analysis='A complete synthetic analysis of the example code.';
 assert.throws(()=>parseReview({status:'completed',model:'fallback',analysis},'qwen3-coder-vast'));
 assert.throws(()=>parseReview({status:'failed',model:'qwen3-coder-vast',analysis},'qwen3-coder-vast'));
 assert.throws(()=>parseReview({status:'completed',model:'qwen3-coder-vast',analysis:'hi'},'qwen3-coder-vast'));
});
test('accept configured reviewer identity',()=>{
 const model='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
 assert.equal(parseReview({status:'completed',model,analysis:'A complete independent review of the sample.'},'llama-cloudflare').model,model);
});
