import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addFile,editFile,diffLines,workspaceReport,validateFile} from '../src/project-workspace.ts';
test('original retained and changes remain isolated to selected file',()=>{
 let files=addFile([], 'app.py','a\nb');
 files=addFile(files,'readme.md','docs');
 const next=editFile(files,'app.py','a\nc');
 assert.equal(next[0].original,'a\nb');assert.equal(files[0].draft,'a\nb');assert.equal(next[1].draft,'docs');
});
test('line diff tracks insertions, deletions, unchanged context and line numbers',()=>{
 const d=diffLines('a\nb\nc','a\nx\nc');
 assert.deepEqual(d.map(l=>l.kind),['same','remove','add','same']);
 assert.deepEqual(d[1],{kind:'remove',text:'b',oldLine:2});
 assert.deepEqual(d[2],{kind:'add',text:'x',newLine:2});
});
test('empty and identical sources',()=>{
 assert.deepEqual(diffLines('',''),[]);
 assert.equal(diffLines('','a')[0].kind,'add');
 assert.equal(diffLines('a','')[0].kind,'remove');
 assert.ok(diffLines('a\nb','a\nb').every(l=>l.kind==='same'));
});
test('reject unsupported names, path traversal, secret filenames and invalid input',()=>{
 for(const n of ['../app.py','.env','credentials.json','secrets.txt','id_rsa.txt','a.pem.txt','app.exe'])assert.throws(()=>validateFile(n,'a'));
 assert.throws(()=>validateFile('app.py','a\u0000b'));
 assert.throws(()=>validateFile('app.py','x'.repeat(96001)));
 assert.throws(()=>validateFile('app.py','x\n'.repeat(600)));
});
test('enforce file count and case-insensitive deduplication',()=>{
 let f=addFile([], 'app.py','x');
 assert.throws(()=>addFile(f,'APP.PY','y'));
 for(let i=0;i<11;i++)f=addFile(f,'f'+i+'.py','x');
 assert.throws(()=>addFile(f,'extra.py','y'));
 assert.throws(()=>editFile(f,'missing.py','x'));
});
test('report contains only filenames, counts and explicit no-execution evidence',()=>{
 let f=addFile([],'app.py','private-original');f=editFile(f,'app.py','private-draft');
 const r=workspaceReport(f);
 assert.deepEqual(r.files,[{name:'app.py',changed:true,added:1,removed:1}]);
 assert.equal(r.testsExecuted,false);
 assert.doesNotMatch(JSON.stringify(r),/private-original|private-draft/);
});
