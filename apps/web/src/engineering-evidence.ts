const IDS=['python-quality','opencode-config','web-quality'] as const;
type SuiteId=typeof IDS[number];
type Status='passed'|'failed'|'timeout'|'unavailable';
type Suite={id:SuiteId;status:Status;exitCode:number|null;elapsedMs:number};
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
function status(x:unknown):x is Status{return x==='passed'||x==='failed'||x==='timeout'||x==='unavailable'}
export function parseEvidence(raw:string){
 if(raw.length>16000)throw Error('Report too large');
 const r:unknown=JSON.parse(raw);
 if(!obj(r)||r.schema!==1||!Array.isArray(r.suites)||r.suites.length!==IDS.length||typeof r.passed!=='boolean')throw Error('Invalid evidence schema');
 if(r.origin==='github-actions'){
  if(typeof r.commit!=='string'||!/^[a-f0-9]{40}$/.test(r.commit)||typeof r.runId!=='string'||!/^\d{1,20}$/.test(r.runId))throw Error('Invalid CI metadata');
 }else if(r.origin!=='local'||r.commit!==null||r.runId!==null)throw Error('Invalid report origin');
 const suites:Suite[]=IDS.map(id=>{
  const rows=(r.suites as unknown[]).filter(x=>obj(x)&&x.id===id);
  const s=rows[0];
  if(rows.length!==1||!obj(s)||!status(s.status)||typeof s.elapsedMs!=='number'||!Number.isInteger(s.elapsedMs)||s.elapsedMs<0||s.elapsedMs>300000)throw Error('Invalid suite');
  const c=s.exitCode;
  if(s.status==='passed'?c!==0:s.status==='failed'?typeof c!=='number'||!Number.isInteger(c)||c===0||Math.abs(c)>255:c!==null)throw Error('Inconsistent exit status');
  return {id,status:s.status,exitCode:c as number|null,elapsedMs:s.elapsedMs};
 });
 if(r.passed!==suites.every(s=>s.status==='passed'))throw Error('Inconsistent report result');
 return {origin:r.origin,commit:r.commit as string|null,runId:r.runId as string|null,suites,passed:r.passed};
}
export function evidenceLink(runId:string|null){
 if(!runId||!/^\d{1,20}$/.test(runId))return null;
 return 'https://github.com/abdulstarzeki001-sketch/KALI-OSINT-STAR/actions/runs/'+runId;
}
