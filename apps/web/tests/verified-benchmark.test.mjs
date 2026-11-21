import {test} from 'node:test';
import assert from 'node:assert/strict';
import {benchmarkPrompt,gradeBenchmark} from '../src/verified-benchmark.ts';
test('fixed prompt has all five questions and no answer key',()=>{
 const p=benchmarkPrompt();assert.equal((p.match(/^Q[1-5]:/gm)||[]).length,5);assert.doesNotMatch(p,/^Q[1-5]=/m);
});
test('all correct with leading advisory prose',()=>{
 const g=gradeBenchmark('Evidence disclaimer\nQ1=B\nQ2=C\nQ3=A\nQ4=B\nQ5=C');
 assert.equal(g.complete,true);assert.equal(g.correct,5);assert.equal(g.total,5);
});
test('wrong answers remain wrong',()=>{
 const g=gradeBenchmark('Q1=A\nQ2=B\nQ3=B\nQ4=A\nQ5=A');assert.equal(g.correct,0);assert.equal(g.complete,true);
});
test('duplicate or missing answers are unscorable',()=>{
 const g=gradeBenchmark('Q1=B\nQ1=B\nQ2=C\nQ3=A or B\nQ4=B\nQ5=C');assert.equal(g.complete,false);assert.equal(g.correct,3);assert.equal(g.details[0].status,'unscorable');assert.equal(g.details[2].status,'unscorable');
});
test('claims of passing tests do not affect score',()=>assert.equal(gradeBenchmark('All tests passed: 100%').correct,0));
test('case and whitespace tolerated, invalid choice rejected',()=>{
 const g=gradeBenchmark(' q1 = b \r\nQ2=D');assert.equal(g.correct,1);assert.equal(g.complete,false);
});
