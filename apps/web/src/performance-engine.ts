export const PERFORMANCE_MODELS=['qwen3-coder-vast','llama-cloudflare'] as const;
export type PerformanceModel=typeof PERFORMANCE_MODELS[number];
export const MAX_SAMPLES=40;
export const CHECK_COOLDOWN_MS=30000;
export type Usage={prompt_tokens:number;completion_tokens:number;total_tokens:number};
export type Sample={model:PerformanceModel;elapsedMs:number;status:'responded'|'timeout'|'rate-limited'|'failed';usage:Usage|null};
const isCount=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=10000000;
export function parseUsage(value:unknown):Usage|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const {prompt_tokens,completion_tokens,total_tokens}=value as Record<string,unknown>;
 if(!isCount(prompt_tokens)||!isCount(completion_tokens)||!isCount(total_tokens)||total_tokens!==prompt_tokens+completion_tokens)return null;
 return {prompt_tokens,completion_tokens,total_tokens};
}
export function appendSample(history:Sample[],sample:Sample):Sample[]{
 if(!PERFORMANCE_MODELS.includes(sample.model)||!Number.isFinite(sample.elapsedMs)||sample.elapsedMs<0||sample.elapsedMs>300000||!['responded','timeout','rate-limited','failed'].includes(sample.status))throw Error('Invalid performance sample');
 return [...history,{model:sample.model,elapsedMs:Math.round(sample.elapsedMs),status:sample.status,usage:sample.status==='responded'?parseUsage(sample.usage):null}].slice(-MAX_SAMPLES);
}
export function remainingCooldown(now:number,lastStart:number|null){
 return lastStart===null?0:Math.max(0,CHECK_COOLDOWN_MS-Math.max(0,now-lastStart));
}
export function summarizePerformance(history:Sample[],model:PerformanceModel){
 const rows=history.filter(s=>s.model===model),ok=rows.filter(s=>s.status==='responded');
 const latencies=ok.map(s=>s.elapsedMs).sort((a,b)=>a-b);
 const percentile=(p:number)=>latencies.length?latencies[Math.ceil(p*latencies.length)-1]:null;
 const observed=ok.filter(s=>s.usage!==null);
 return {requests:rows.length,responded:ok.length,failed:rows.length-ok.length,rateLimited:rows.filter(s=>s.status==='rate-limited').length,p50:percentile(.5),p95:percentile(.95),usageSamples:observed.length,totalTokens:observed.length?observed.reduce((n,s)=>n+(s.usage?.total_tokens??0),0):null};
}
