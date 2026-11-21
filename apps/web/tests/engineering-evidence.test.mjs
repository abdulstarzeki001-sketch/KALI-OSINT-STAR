import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseEvidence,evidenceLink} from '../src/engineering-evidence.ts';
const good={schema:1,origin:'github-actions',commit:'a'.repeat(40),runId:'123',passed:true,suites:['python-quality','opencode-config','web-quality'].map(id=>({id,status:'passed',exitCode:0,elapsedMs:10}))};
const parse=x=>parseEvidence(JSON.stringify(x));
test('accept consistent fixed-suite evidence',()=>{assert.equal(parse(good).passed,true);assert.equal(parse(good).suites.length,3)});
test('reject false pass and duplicate suite records',()=>{
 assert.throws(()=>parse({...good,passed:false}));
 assert.throws(()=>parse({...good,suites:[good.suites[0],good.suites[0],good.suites[2]]}));
});
test('reject invalid commit or run identity',()=>{
 assert.throws(()=>parse({...good,commit:'main'}));
 assert.throws(()=>parse({...good,runId:'../123'}));
 assert.equal(evidenceLink('javascript:alert(1)'),null);
 assert.match(evidenceLink('123'),/github\.com\/abdulstarzeki001-sketch\/KALI-OSINT-STAR\/actions\/runs\/123$/);
});
test('failed suites and timeouts never produce success',()=>{
 const suites=[{...good.suites[0],status:'failed',exitCode:1},{...good.suites[1],status:'timeout',exitCode:null},good.suites[2]];
 assert.equal(parse({...good,suites,passed:false}).passed,false);
 assert.throws(()=>parse({...good,suites}));
});
test('reject unsupported schema or impossible metrics',()=>{
 assert.throws(()=>parse({...good,schema:2}));
 assert.throws(()=>parse({...good,suites:[{...good.suites[0],elapsedMs:-1},...good.suites.slice(1)]}));
 assert.throws(()=>parse({...good,suites:[{...good.suites[0],exitCode:1},...good.suites.slice(1)]}));
});
test('local reports have no CI identity and unknown fields are discarded',()=>{
 const r=parse({...good,origin:'local',commit:null,runId:null,secret:'not displayed'});
 assert.equal(r.origin,'local');assert.equal(Object.hasOwn(r,'secret'),false);assert.equal(evidenceLink(r.runId),null);
});
