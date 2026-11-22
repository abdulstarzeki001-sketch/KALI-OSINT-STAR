import type {Run} from './engineering-memory';
import type {AIModel} from './ai-models';
export type RouteTask='coding'|'review'|'general';
export type Probe={state:'responded'|'failed';at:number;elapsedMs:number|null};
export type Probes=Partial<Record<AIModel,Probe>>;
export const PROBE_TTL=15*60*1000;
export const BENCHMARK_TTL=7*24*60*60*1000;
const IDS:AIModel[]=['qwen3-coder-vast','llama-cloudflare'];
export function routeEvidence(runs:Run[],probes:Probes,now:number){
 return IDS.map(model=>{
  const id=model==='qwen3-coder-vast'?model:'@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  const eligible=runs.filter(r=>r.model===id&&r.complete&&r.version==='python-compat-v1'&&now-Date.parse(r.at)>=0&&now-Date.parse(r.at)<=BENCHMARK_TTL).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,10);
  const p=probes[model];const fresh=p&&Number.isFinite(p.at)&&now>=p.at&&now-p.at<=PROBE_TTL;
  return {model,connection:fresh?p.state:'unknown' as const,latencyMs:fresh&&p.state==='responded'&&typeof p.elapsedMs==='number'&&Number.isFinite(p.elapsedMs)&&p.elapsedMs>=0?p.elapsedMs:null,benchmarkCount:eligible.length,averageScore:eligible.length>=3?eligible.reduce((sum,r)=>sum+r.correct,0)/eligible.length:null};
 });
}
export function recommendModel(task:RouteTask,runs:Run[],probes:Probes,now:number){
 const evidence=routeEvidence(runs,probes,now);
 const preferred:AIModel=task==='coding'?'qwen3-coder-vast':'llama-cloudflare';
 const available=evidence.filter(e=>e.connection==='responded');
 const defaultRow=evidence.find(e=>e.model===preferred)!;
 let model=preferred,reason:'role'|'connectivity'|'benchmark'|'latency'|'no-confirmed-route'='role';
 if(!available.length){
  if(defaultRow.connection==='failed')return {model:null,reason:'no-confirmed-route' as const,evidence};
 }else if(!available.some(e=>e.model===preferred)){
  model=available[0].model;reason='connectivity';
 }else if(task==='general'&&available.length===2){
  const [a,b]=available;
  if(a.averageScore!==null&&b.averageScore!==null&&Math.abs(a.averageScore-b.averageScore)>=0.5){
   model=a.averageScore>b.averageScore?a.model:b.model;reason='benchmark';
  }else if(a.averageScore!==null&&b.averageScore!==null&&Math.abs(a.averageScore-b.averageScore)<0.5&&a.latencyMs!==null&&b.latencyMs!==null&&Math.abs(a.latencyMs-b.latencyMs)>=500){
   model=a.latencyMs<b.latencyMs?a.model:b.model;reason='latency';
  }
 }
 return {model,reason,evidence};
}
