export const STORAGE_KEY='star-engineering-local-v1';
export type ModelId='qwen3-coder-vast'|'@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export type Run={model:ModelId;at:string;ms:number;version:string;correct:number;total:5;complete:boolean};
export type Project={repo:string;stage:'planning'|'development'|'review'|'released';ref:string};
export type Memory={version:1;runs:Run[];projects:Project[]};
export const emptyMemory=():Memory=>({version:1,runs:[],projects:[]});
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const count=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
const model=(v:unknown):v is ModelId=>v==='qwen3-coder-vast'||v==='@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const stage=(v:unknown):v is Project['stage']=>v==='planning'||v==='development'||v==='review'||v==='released';
const repo=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(v)&&!v.endsWith('/.')&&!v.endsWith('/..');
const ref=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{7,40}$/.test(v);
export function validateMemory(input:unknown):Memory{
 if(!obj(input)||input.version!==1||!Array.isArray(input.runs)||input.runs.length>100||!Array.isArray(input.projects)||input.projects.length>30)throw Error('Invalid local memory');
 const runs=input.runs.map((r:unknown):Run=>{
  if(!obj(r)||!model(r.model)||typeof r.at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.at)||!Number.isFinite(Date.parse(r.at))||!count(r.ms,0,300000)||r.version!=='python-compat-v1'||!count(r.correct,0,5)||r.total!==5||typeof r.complete!=='boolean')throw Error('Invalid benchmark entry');
  return {model:r.model,at:r.at,ms:r.ms,version:r.version,correct:r.correct,total:5,complete:r.complete};
 });
 const projects=input.projects.map((p:unknown):Project=>{
  if(!obj(p)||!repo(p.repo)||!stage(p.stage)||!ref(p.ref))throw Error('Invalid project entry');
  return {repo:p.repo,stage:p.stage,ref:p.ref};
 });
 return {version:1,runs,projects};
}
export function appendRun(memory:Memory,run:Run):Memory{
 return validateMemory({...memory,runs:[run,...memory.runs].slice(0,100)});
}
export function saveProject(memory:Memory,project:Project):Memory{
 return validateMemory({...memory,projects:[project,...memory.projects.filter(p=>p.repo.toLowerCase()!==project.repo.toLowerCase())].slice(0,30)});
}
export function summarizeRuns(runs:Run[],id:ModelId){
 const complete=runs.filter(r=>r.model===id&&r.complete);
 return {count:complete.length,averageScore:complete.length?complete.reduce((sum,r)=>sum+r.correct,0)/complete.length:null,averageMs:complete.length?Math.round(complete.reduce((sum,r)=>sum+r.ms,0)/complete.length):null};
}
