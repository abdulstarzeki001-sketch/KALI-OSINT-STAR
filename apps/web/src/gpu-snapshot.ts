import {parseInstalledModels} from './model-manager.ts';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const num=(v:unknown,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max;
function nullable(v:unknown,max=Number.MAX_SAFE_INTEGER):number|null{
 if(v===null)return null;
 if(!num(v,max))throw Error('Invalid metric');
 return v;
}
function safeName(v:unknown,max:number){
 if(typeof v!=='string'||!v.trim()||v.length>max||/[\u0000-\u001f\u007f]/.test(v))throw Error('Invalid name');
 return v;
}
function pair(v:unknown,a:string,b:string){
 if(v===null)return null;
 if(!object(v)||!num(v[a])||!num(v[b])||v[a]<v[b])throw Error('Invalid resource counters');
 return {total:v[a],available:v[b]};
}
export function parseGpuSnapshot(raw:string){
 if(raw.length>64000)throw Error('Snapshot too large');
 const v:unknown=JSON.parse(raw);
 if(!object(v)||v.schema!==1||v.source!=='local-host-snapshot'||typeof v.capturedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|\+00:00)$/.test(v.capturedAt)||!Number.isFinite(Date.parse(v.capturedAt)))throw Error('Invalid snapshot');
 if(v.gpus!==null&&(!Array.isArray(v.gpus)||v.gpus.length>16))throw Error('Invalid GPU list');
 const gpus=v.gpus===null?null:(v.gpus as unknown[]).map(g=>{
  if(!object(g))throw Error('Invalid GPU');
  const usedMiB=nullable(g.usedMiB),totalMiB=nullable(g.totalMiB);
  if(usedMiB!==null&&totalMiB!==null&&usedMiB>totalMiB)throw Error('Invalid VRAM');
  return {index:nullable(g.index,1024),name:safeName(g.name,100),utilization:nullable(g.utilization,100),usedMiB,totalMiB,temperatureC:nullable(g.temperatureC,150)};
 });
 if(v.models!==null&&(!Array.isArray(v.models)||v.models.length>32))throw Error('Invalid model list');
 const models=v.models===null?null:(v.models as unknown[]).map(m=>{
  if(!object(m))throw Error('Invalid model');
  return {name:safeName(m.name,160),sizeBytes:nullable(m.sizeBytes??null),vramBytes:nullable(m.vramBytes??null)};
 });
 if(v.loadAverage!==null&&(!Array.isArray(v.loadAverage)||v.loadAverage.length!==3||!v.loadAverage.every(n=>num(n,100000))))throw Error('Invalid load average');
 return {capturedAt:v.capturedAt,gpus,models,installedModels:parseInstalledModels(v.installedModels),ram:pair(v.ram,'totalBytes','availableBytes'),storage:pair(v.storage,'totalBytes','freeBytes'),cpuCount:nullable(v.cpuCount,65536),loadAverage:v.loadAverage as number[]|null};
}
