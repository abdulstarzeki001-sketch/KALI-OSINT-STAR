import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyMemory,validateMemory,appendRun,saveProject,summarizeRuns} from '../src/engineering-memory.ts';
const run={model:'qwen3-coder-vast',at:'2026-11-22T00:00:00.000Z',ms:2000,version:'python-compat-v1',correct:4,total:5,complete:true};
test('bounded run retention and newest-first order',()=>{
 let m=emptyMemory();for(let i=0;i<110;i++)m=appendRun(m,{...run,ms:i});
 assert.equal(m.runs.length,100);assert.equal(m.runs[0].ms,109);
});
test('reject malformed metrics and unknown models',()=>{
 for(const patch of [{correct:6},{ms:-1},{model:'unknown'},{total:4},{at:'today'}])assert.throws(()=>appendRun(emptyMemory(),{...run,...patch}));
});
test('strip response text and unrelated keys',()=>{
 const m=validateMemory({version:1,runs:[{...run,analysis:'not stored',token:'not stored'}],projects:[]});
 assert.equal(Object.hasOwn(m.runs[0],'analysis'),false);assert.equal(Object.hasOwn(m.runs[0],'token'),false);
});
test('project upsert case-insensitive, links restricted to GitHub repo syntax and SHA',()=>{
 let m=saveProject(emptyMemory(),{repo:'Owner/Repo',ref:'123abcd',stage:'development'});
 m=saveProject(m,{repo:'owner/repo',ref:'abcdef0',stage:'released'});
 assert.equal(m.projects.length,1);assert.equal(m.projects[0].stage,'released');
 for(const repo of ['https://example.com/a','a/..','a/b?x=y','a/b/c'])assert.throws(()=>saveProject(m,{repo,ref:'abcdef0',stage:'review'}));
 assert.throws(()=>saveProject(m,{repo:'a/b',ref:'main',stage:'review'}));
});
test('metrics exclude incomplete and other model runs',()=>{
 const s=summarizeRuns([run,{...run,correct:0,complete:false},{...run,model:'@cf/meta/llama-3.3-70b-instruct-fp8-fast',correct:1}],run.model);
 assert.deepEqual(s,{count:1,averageScore:4,averageMs:2000});
 assert.equal(summarizeRuns([],run.model).averageScore,null);
});
test('version or oversize inputs fail closed',()=>{
 assert.throws(()=>validateMemory({version:2,runs:[],projects:[]}));
 assert.throws(()=>validateMemory({version:1,runs:Array(101).fill(run),projects:[]}));
});
