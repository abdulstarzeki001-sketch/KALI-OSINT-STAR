import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeManifest} from '../src/repository-intelligence.ts';
test('npm dependencies inventory and exact versions',()=>{
 const r=analyzeManifest('package.json',JSON.stringify({dependencies:{react:'19.1.0',vite:'^6.3.0'},devDependencies:{typescript:'~5.9.0'},scripts:{test:'node --test'}}));
 assert.deepEqual(r.counts,{total:3,exact:1,nonExact:2,scripts:1});
 assert.ok(r.findings.some(f=>f.code==='NON_EXACT_SPEC'));
});
test('lifecycle and non-registry sources identified without exposing commands or URLs',()=>{
 const r=analyzeManifest('package.json',JSON.stringify({dependencies:{sample:'https://example.invalid/private.tgz'},scripts:{postinstall:'do-not-run-this'}}));
 assert.ok(r.findings.some(f=>f.code==='LIFECYCLE_SCRIPT'));
 assert.ok(r.findings.some(f=>f.code==='NON_REGISTRY_SOURCE'));
 assert.doesNotMatch(JSON.stringify(r),/private\.tgz|do-not-run-this/);
});
test('Python inventory handles extras, constraints, markers and comments',()=>{
 const r=analyzeManifest('requirements.txt','fastapi==0.128.2\nhttpx>=0.28,<1\nuvicorn[standard]==0.40.0 ; python_version >= "3.12"\n# comment\n');
 assert.deepEqual(r.counts,{total:3,exact:2,nonExact:1,scripts:0});
});
test('Python directives are marked unparsed without echoing private source',()=>{
 const r=analyzeManifest('requirements-dev.txt','-r private.txt\n-e git+https://example.invalid/private.git\npytest\n');
 assert.equal(r.counts.total,1);
 assert.deepEqual(r.findings.filter(f=>f.code==='UNPARSED_REQUIREMENT').map(f=>f.line),[1,2]);
 assert.doesNotMatch(JSON.stringify(r),/private\.txt|private\.git/);
});
test('invalid, oversized or unsupported input rejected',()=>{
 for(const content of ['[]','{','{"dependencies":[]}','{"dependencies":{"react":4}}','{"scripts":{"test":4}}'])assert.throws(()=>analyzeManifest('package.json',content));
 assert.throws(()=>analyzeManifest('package.json','x'.repeat(128001)));
 assert.throws(()=>analyzeManifest('.env','SECRET=sample'));
});
test('empty manifest is not a security pass and custom tests are not ruled out',()=>{
 const r=analyzeManifest('package.json','{"scripts":{"test:unit":"node --test"}}');
 assert.equal(r.counts.total,0);
 assert.ok(r.findings.some(f=>f.code==='NO_STANDARD_TEST_SCRIPT'&&f.priority==='info'));
 assert.ok(r.limitations.some(s=>s.includes('no lockfile resolution')));
});
