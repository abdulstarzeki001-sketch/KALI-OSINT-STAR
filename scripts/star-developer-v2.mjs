// Runs trusted main workflow code only. Never executes proposed bytes.
import assert from 'node:assert/strict';
import {readFileSync,appendFileSync} from 'node:fs';
import {validatePayload,branchFor,pathURL} from '../apps/web/developer-v2.js';
import {REPO,shaOK,decodeText} from '../apps/web/github-workspace.js';
export async function executeApproved(p,api,log=()=>{}){
 validatePayload(p);const branch=branchFor(p.id);
 const main=await api('/git/ref/heads/main');assert.equal(main.object.sha,p.base,'main changed');
 const commit=await api('/git/commits/'+p.base);assert.ok(shaOK(commit.tree?.sha));
 const tree=await api('/git/trees/'+commit.tree.sha+'?recursive=1');assert.ok(!tree.truncated&&Array.isArray(tree.tree));
 const entries=new Map(tree.tree.map(x=>[x.path,x]));
 const changes=[];
 for(const f of p.files){
  const old=entries.get(f.path);
  if(f.op==='create'){assert.equal(old,undefined);const parents=f.path.split('/');parents.pop();for(let i=1;i<=parents.length;i++){const x=entries.get(parents.slice(0,i).join('/'));assert.ok(!x||x.type==='tree');}}
  else {assert.equal(old?.type,'blob');assert.equal(old?.mode,'100644');assert.equal(old?.sha,f.blob);}
  if(f.op==='delete')changes.push({path:f.path,mode:'100644',type:'blob',sha:null});
  else changes.push({path:f.path,mode:'100644',type:'blob',content:decodeText(f.content)});
 }
 const built=await api('/git/trees','POST',{base_tree:commit.tree.sha,tree:changes});assert.ok(shaOK(built.sha));
 const next=await api('/git/commits','POST',{message:'STAR V2 approved plan '+p.id,tree:built.sha,parents:[p.base]});assert.ok(shaOK(next.sha));
 assert.equal((await api('/git/ref/heads/main')).object.sha,p.base,'main changed before publish');
 const ref=await api('/git/refs','POST',{ref:'refs/heads/'+branch,sha:next.sha});assert.equal(ref.object.sha,next.sha);
 const actual=await api('/git/trees/'+built.sha+'?recursive=1');assert.ok(!actual.truncated&&Array.isArray(actual.tree));
 for(const f of p.files){
  const item=actual.tree.find(x=>x.path===f.path);
  if(f.op==='delete'){assert.equal(item,undefined);continue;}
  const remote=await api('/contents/'+pathURL(f.path)+'?ref='+next.sha);
  assert.equal(remote.type,'file');assert.equal(remote.encoding,'base64');assert.equal(decodeText(remote.content),decodeText(f.content));
 }
 const pr=await api('/pulls','POST',{title:'STAR V2 approved plan '+p.id,head:branch,base:'main',body:'Reviewed multi-file proposal. No automatic merge. Separate approval after exact-head CI and Quality.'});
 assert.equal(pr.head.sha,next.sha);assert.equal(pr.base.ref,'main');assert.ok(Number.isInteger(pr.number));
 log('Created PR #'+pr.number+' at '+next.sha+'; '+p.files.length+' verified file operations.');
 for(const file of ['ci.yml','star-ai-quality.yml']){await api('/actions/workflows/'+file+'/dispatches','POST',{ref:branch});log('Dispatched '+file);}
 return {pr:pr.number,head:next.sha};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const {client_payload:p}=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
 assert.equal(process.env.GITHUB_REPOSITORY,REPO);
 const api=async(path,method='GET',body)=>{
  const response=await fetch('https://api.github.com/repos/'+REPO+path,{method,redirect:'error',headers:{authorization:'Bearer '+process.env.GH_TOKEN,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','user-agent':'STAR-AI-V2',...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok)throw Error(method+' '+path.split('?')[0]+' HTTP '+response.status);
  return response.status===204?{}:response.json();
 };
 await executeApproved(p,api,s=>{console.log(s);appendFileSync(process.env.GITHUB_STEP_SUMMARY,s+'\n\n');});
}
