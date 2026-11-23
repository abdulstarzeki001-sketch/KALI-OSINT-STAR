import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const SERVICES=Object.freeze([
 {id:'agent',label:'STAR Agent Railway',url:'https://star-agent-runner-production.up.railway.app/health'},
 {id:'gateway',label:'STAR AI Cloudflare Gateway',url:'https://star-ai-minis-v2.abdulstarzeki001.workers.dev/health'}
]);

function validate(service,body){
 if(!body||typeof body!=='object'||Array.isArray(body))return 'invalid_json';
 if(service.id==='agent'){
  if(body.ok!==true||body.service!=='star-agent-cpu')return 'agent_unhealthy';
  if(body.live_inference_tested!==true||body.model_probe?.state!=='ok')return 'agent_model_probe_not_verified';
  return null;
 }
 if(service.id==='gateway'){
  if(body.status!=='ok'||body.service!=='star-ai-minis-v2')return 'gateway_unhealthy';
  return null;
 }
 return 'unknown_service';
}

export async function inspectService(service,fetchImpl=globalThis.fetch){
 try{
  const response=await fetchImpl(service.url,{
   method:'GET',redirect:'manual',headers:{accept:'application/json'},
   signal:AbortSignal.timeout(10000)
  });
  if(response.status!==200)return {id:service.id,label:service.label,ok:false,reason:'http_'+response.status};
  const contentType=response.headers.get('content-type')||'';
  if(!contentType.includes('application/json'))return {id:service.id,label:service.label,ok:false,reason:'non_json'};
  let body;
  try{body=await response.json();}catch{return {id:service.id,label:service.label,ok:false,reason:'invalid_json'};}
  const issue=validate(service,body);
  return {id:service.id,label:service.label,ok:issue===null,reason:issue||'verified'};
 }catch(e){
  const errorType=e instanceof Error&&e.name==='TimeoutError'?'timeout':'network_error';
  return {id:service.id,label:service.label,ok:false,reason:errorType};
 }
}

export async function runHealthChecks(fetchImpl=globalThis.fetch,retries=2){
 const results=[];
 for(const service of SERVICES){
  let result;
  for(let attempt=0;attempt<=retries;attempt++){
   result=await inspectService(service,fetchImpl);
   if(result.ok)break;
   if(attempt<retries)await new Promise(resolve=>setTimeout(resolve,2000));
  }
  results.push(result);
 }
 return {ok:results.every(x=>x.ok),checks:results};
}

export function markdownSummary(result){
 return [
 '# STAR AI — Cloud Health Check','',
 '| Service | Result | Evidence |','|---|---|---|',
 ...result.checks.map(x=>'| '+x.label+' | '+(x.ok?'PASS':'FAIL')+' | '+x.reason+' |'),
 '','**Limits:** Public health and Railway startup inference only. This does not test a Minis iPhone session, command approval or GPU availability.'
 ].join('\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await runHealthChecks();
 const summary=markdownSummary(result);
 console.log(summary);
 if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary+'\n',{encoding:'utf8'});
 if(!result.ok)process.exitCode=1;
}
