import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseLog} from '../src/intelligent-debugger.ts';
test('classifies Python, TypeScript and dependency failures by log lines',()=>{
 const r=diagnoseLog('ModuleNotFoundError: No module named sample\napp.ts(8,2): error TS2322: wrong type\nnpm error code ERESOLVE');
 assert.deepEqual(r.findings.map(f=>f.id),['PY_IMPORT','TS_COMPILE','NPM_RESOLVE']);
 assert.deepEqual(r.findings.map(f=>f.lines),[[1],[2],[3]]);
});
test('handles CRLF and ANSI formatting',()=>{
 const r=diagnoseLog('\u001b[31mSyntaxError: invalid syntax\u001b[0m\r\nPermissionError: denied');
 assert.equal(r.linesAnalyzed,2);assert.deepEqual(r.findings.map(f=>f.id),['PY_SYNTAX','PERMISSION']);
});
test('notices are distinct from confirmed build failure',()=>{
 const r=diagnoseLog('DeprecationWarning: old API');
 assert.equal(r.findings[0].priority,'notice');assert.equal(r.testsExecuted,false);
 assert.match(r.limitations,/no root-cause confirmation/);
});
test('report never copies raw matched text or credentials',()=>{
 const r=diagnoseLog('ImportError: token=example-sensitive-value\nRollupError: private-source-name');
 assert.doesNotMatch(JSON.stringify(r),/example-sensitive-value|private-source-name/);
 assert.equal(r.findings.length,2);
});
test('bounds input and caps stored line references',()=>{
 for(const s of ['', 'x\u0000y','x'.repeat(96001),'x\n'.repeat(3001)])assert.throws(()=>diagnoseLog(s));
 const r=diagnoseLog(Array(20).fill('SyntaxError: bad').join('\n'));
 assert.equal(r.findings[0].count,20);assert.equal(r.findings[0].lines.length,12);
});
test('no match is not a test pass',()=>{
 const r=diagnoseLog('Build completed successfully');
 assert.equal(r.findings.length,0);assert.equal(r.testsExecuted,false);
});
