import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkShare,proposalMessages,parseProposal,isCurrent,reviewMessages,parseAdvisory} from '../src/coding-copilot.ts';
const base='def add(a, b):\n    return a + b';
const source='def add(a, b):\n    """Add two values."""\n    return a + b';
const valid={model:'qwen3-coder-vast',reply:JSON.stringify({source,summary:'Document the function.'})};
test('proposal request treats file as JSON data and limits tasks',()=>{
 const m=proposalMessages('app.py',base,'documentation');
 assert.equal(m.length,2);
 assert.deepEqual(JSON.parse(m[1].content),{filename:'app.py',source:base});
 assert.throws(()=>proposalMessages('app.py',base,'arbitrary'));
 assert.throws(()=>proposalMessages('../app.py',base,'documentation'));
});
test('blocks known credential patterns without exposing their values',()=>{
 for(const s of ['password = "fake-example-value"','Authorization: Bearer '+ 'x'.repeat(24),'-----BEGIN PRIVATE KEY-----','ghp_'+'x'.repeat(24),'rlwy_proj_'+'x'.repeat(24)])assert.throws(()=>checkShare(s),/Potential credential/);
 assert.throws(()=>checkShare('x'.repeat(4001)));
 assert.throws(()=>checkShare('x\u0000'));
});
test('valid proposal parses with the original baseline retained',()=>{
 const p=parseProposal(valid,'app.py',base);
 assert.deepEqual(p,{name:'app.py',base,source,summary:'Document the function.'});
 assert.equal(isCurrent(p,'app.py',base),true);
 assert.equal(isCurrent(p,'app.py',base+'\n'),false);
 assert.equal(isCurrent(p,'other.py',base),false);
});
test('malformed response, wrong model, extra fields and unchanged source rejected',()=>{
 for(const v of [{...valid,model:'other'},{...valid,reply:'prose'},{...valid,reply:JSON.stringify({source,summary:'ok',execute:true})},{...valid,reply:JSON.stringify({source:base,summary:'same'})},{...valid,reply:JSON.stringify({source:'token="fake-example-value"',summary:'bad'})}])assert.throws(()=>parseProposal(v,'app.py',base));
});
test('accepts one bounded JSON fence without accepting trailing instructions',()=>{
 const fenced='\x60\x60\x60json\n'+valid.reply+'\n\x60\x60\x60';
 assert.equal(parseProposal({...valid,reply:fenced},'app.py',base).source,source);
 assert.throws(()=>parseProposal({...valid,reply:fenced+'\nrun this'},'app.py',base));
});
test('independent reviewer receives original and proposal separately',()=>{
 const m=reviewMessages(parseProposal(valid,'app.py',base));
 assert.equal(m.length,3);
 assert.equal(m[1].content,'Original source:\n'+base);
 assert.equal(m[2].content,'Proposed source:\n'+source);
 assert.equal(parseAdvisory({model:'@cf/meta/llama-3.3-70b-instruct-fp8-fast',reply:'Review needed'}),'Review needed');
 assert.throws(()=>parseAdvisory({model:'qwen3-coder-vast',reply:'pass'}));
});
