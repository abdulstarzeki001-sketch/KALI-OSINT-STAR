import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advanceFlow,currentFlow,evidenceState,summarizeFlow} from '../src/engineering-orchestrator.ts';
const proposal={type:'proposal',name:'app.py',base:'a',candidate:'b'};
test('proposal and review are source-bound',()=>{
 const p=advanceFlow(null,proposal);
 assert.equal(currentFlow(p,'app.py','a'),'proposed');
 const q=advanceFlow(p,{...proposal,type:'review'});
 assert.equal(currentFlow(q,'app.py','a'),'reviewed');
 assert.equal(currentFlow(q,'app.py','c'),'stale');
 assert.equal(currentFlow(q,'other.py','a'),null);
});
test('reject unmatched review or apply events',()=>{
 assert.equal(advanceFlow(null,{...proposal,type:'apply'}),null);
 const p=advanceFlow(null,proposal);
 assert.equal(advanceFlow(p,{...proposal,type:'apply',candidate:'c'}),p);
 assert.equal(advanceFlow(p,{...proposal,type:'review',name:'other.py'}),p);
});
test('apply is local and requires exact candidate to remain current',()=>{
 const p=advanceFlow(advanceFlow(null,proposal),{...proposal,type:'apply'});
 assert.equal(currentFlow(p,'app.py','b'),'applied');
 assert.equal(currentFlow(p,'app.py','a'),'stale');
 assert.equal(advanceFlow(p,{...proposal,type:'discard'}),p);
});
test('discard removes pending proposal',()=>{
 const p=advanceFlow(null,proposal);
 assert.equal(advanceFlow(p,{...proposal,type:'discard'}),null);
});
test('invalid and unchanged candidates do not advance state',()=>{
 assert.equal(advanceFlow(null,{...proposal,candidate:'a'}),null);
 assert.equal(advanceFlow(null,{...proposal,candidate:' '}),null);
});
test('imported CI pass cannot verify or authorize an unrelated local draft',()=>{
 const e={origin:'github-actions',commit:'a'.repeat(40),runId:'123',passed:true};
 const flow=advanceFlow(advanceFlow(null,proposal),{...proposal,type:'apply'});
 const r=summarizeFlow(flow,'app.py','b',e);
 assert.equal(r.evidence.status,'reported-pass');
 assert.equal(r.draftTestsVerified,false);
 assert.equal(r.releaseAuthorized,false);
 assert.equal(evidenceState(null).status,'missing');
 assert.equal(evidenceState({...e,passed:false}).status,'reported-failure');
});
