// Private cron-only observer. No PAT, no arbitrary destinations, no repository writes.
const REPO='abdulstarzeki001-sketch/KALI-OSINT-STAR';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SHA=/^[a-f0-9]{40}$/;
const statusOK=s=>['queued','in_progress','completed','waiting','requested','pending'].includes(s);
const conclusions=['success','failure','cancelled','timed_out','action_required','neutral','skipped','stale','startup_failure'];
const validId=n=>Number.isSafeInteger(n)&&n>0;
class ObservationError extends Error{
 constructor(code){super(code);this.code=code;}
}
async function get(path,fetcher,source,timeoutMs){
 const controller=new AbortController();
 let timer;
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new ObservationError(source+'_timeout'));},timeoutMs);});
 try{
  const work=async()=>{
   let res;try{res=await fetcher('https://api.github.com/repos/'+REPO+path,{method:'GET',redirect:'manual',signal:controller.signal,headers:{accept:'application/vnd.github+json','user-agent':'STAR-V3-Observer','x-github-api-version':'2022-11-28'}});}catch{throw new ObservationError(source+(controller.signal.aborted?'_timeout':'_network'));}
   if(!res.ok)throw new ObservationError(source+(res.status===429||res.status===403&&res.headers.get('x-ratelimit-remaining')==='0'?'_rate_limited':'_http_'+res.status));
   let data;try{data=await res.json();}catch{throw new ObservationError(source+'_invalid_json');}
   if(!Array.isArray(source==='runs'?data?.workflow_runs:data))throw new ObservationError(source+'_invalid_shape');
   return data;
  };
  return await Promise.race([work(),deadline]);
 }finally{clearTimeout(timer);}
}
export function matchObservation(job,runs,prs){
 if(!UUID.test(job.id)||!SHA.test(job.base_sha))return null;
 const run=runs.find(x=>x.display_title==='STAR V2 '+job.id&&x.event==='repository_dispatch'&&x.head_sha===job.base_sha&&validId(x.id)&&statusOK(x.status));
 const pr=prs.find(x=>x.state==='open'&&x.head?.ref==='star-ai/edit-'+job.id&&x.head?.repo?.full_name===REPO&&x.base?.ref==='main'&&x.base?.sha===job.base_sha&&SHA.test(x.head?.sha||'')&&validId(x.number)&&(!job.pr||job.pr===x.number)&&(!job.head_sha||job.head_sha===x.head.sha));
 return {runId:run?.id??null,status:run?.status??null,conclusion:conclusions.includes(run?.conclusion)?run.conclusion:null,pr:pr?.number??null,head:pr?.head?.sha??null,observation:pr?'pr_seen':run?'executor_seen':'not_seen'};
}
export async function observe(env,fetcher=(url,init)=>fetch(url,init),now=Date.now(),options={}){
 const db=env.STAR_MEMORY;if(!db)throw Error('D1 missing');
 const jobs=(await db.prepare("SELECT owner,id,base_sha,pr,head_sha FROM star_developer_v2 WHERE state IN ('queued','pr_open') ORDER BY created DESC LIMIT 20").all()).results||[];
 const heartbeat=state=>db.prepare("INSERT INTO star_v3_monitor_heartbeat(id,checked,status) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET checked=excluded.checked,status=excluded.status WHERE excluded.checked>=checked").bind(now,state).run();
 if(!jobs.length){await heartbeat('idle');return {status:'idle',observed:0};}
 try{
  const timeout=options.timeoutMs??12000;
  // Finish both bounded reads to report both failures; never replace complete evidence with partial data.
  const results=await Promise.allSettled([get('/actions/workflows/star-ai-developer-v2.yml/runs?event=repository_dispatch&per_page=100',fetcher,'runs',timeout),get('/pulls?state=open&base=main&per_page=100',fetcher,'prs',timeout)]);
  const failures=results.filter(r=>r.status==='rejected').map(r=>r.reason instanceof ObservationError?r.reason.code:'unknown');
  if(failures.length)throw new ObservationError(failures.join(','));
  const [runs,prs]=results.map(r=>r.value);
  let count=0;
  for(const job of jobs){const o=matchObservation(job,runs.workflow_runs,prs);if(!o)continue;
   await db.prepare("INSERT INTO star_v3_observation(owner,job_id,checked,executor_id,executor_status,executor_conclusion,pr,head,observation) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,job_id) DO UPDATE SET checked=excluded.checked,executor_id=excluded.executor_id,executor_status=excluded.executor_status,executor_conclusion=excluded.executor_conclusion,pr=excluded.pr,head=excluded.head,observation=excluded.observation WHERE excluded.checked>=checked").bind(job.owner,job.id,now,o.runId,o.status,o.conclusion,o.pr,o.head,o.observation).run();count++;
  }
  await heartbeat('ok');return {status:'ok',observed:count};
 }catch(e){const status=e instanceof ObservationError?'upstream_error:'+e.code:'storage_error';await heartbeat(status);throw Error('Observer failed: '+status+'; authoritative job state unchanged');}
}
export default {async fetch(){return new Response('Not found',{status:404});},async scheduled(_controller,env){await observe(env);}};
