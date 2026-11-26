import {useEffect,useState} from 'react';
import './ai-settings.css';
type Edit={path:string;op:'modify'|'create'|'delete';before:string|null;after:string|null;blob:string|null};
type Job={id:string;task:string;state:string;kind:string;files?:Edit[];pr?:number;head?:string;mergeSha?:string;repairCount?:number;run?:{id:number;status:string;conclusion:string}|null;checks?:{workflow:string;status:string;conclusion:string|null;id:number|null}[]};
const repo='https://github.com/abdulstarzeki001-sketch/KALI-OSINT-STAR';
const endpoint='/api/ai/developer-v2';
async function api(query='',data?:object){const r=await fetch(endpoint+query,{cache:'no-store',credentials:'same-origin',...(data?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}:{})});let v;try{v=await r.json();}catch{throw Error('تحقق من تسجيل الدخول');}if(!r.ok)throw Error(v.error||'HTTP '+r.status);return v;}
export default function DeveloperV2Panel({initialTask=''}:{initialTask?:string}){
 const [task,setTask]=useState(initialTask),[paths,setPaths]=useState('docs/STAR_GITHUB_WORKSPACE.md'),[job,setJob]=useState<Job|null>(null),[jobs,setJobs]=useState<Job[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[deployed,setDeployed]=useState(''),[configured,setConfigured]=useState(false);
 useEffect(()=>{if(initialTask)setTask(initialTask);},[initialTask]);
 async function refresh(){const r=await api();setJobs(r.jobs);setConfigured(r.configured);}
 async function action(fn:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'تعذر التنفيذ');}finally{setBusy(false);}}
 useEffect(()=>{void action(refresh);},[]);
 async function status(id:string){await api('',{action:'sync',id});const j=await api('?action=status&id='+encodeURIComponent(id));setJob(j);await refresh();try{const r=await fetch('/star-deployment.json?t='+Date.now(),{cache:'no-store'});const d=await r.json();setDeployed(r.ok&&d.source==='cloudflare-pages'&&/^[a-f0-9]{40}$/.test(d.sha)?d.sha:'');}catch{setDeployed('');}}
 async function create(){const files=paths.split('\n').map(s=>s.trim()).filter(Boolean).map(s=>({op:s.startsWith('+')?'create':'modify',path:s.replace(/^\+\s*/,'')}));setJob(await api('',{action:'plan',task,files}));await refresh();}
 const runAction=(name:string,approve=false)=>void action(async()=>{if(!job)return;const j=await api('',{action:name,id:job.id,...(approve?{approve:true}:{})});setJob(j);await refresh();if(name==='merge')await status(j.id);});
 const ready=job?.run?.status==='completed'&&job.run.conclusion==='success'&&job.checks?.length===2&&job.checks.every(c=>c.status==='completed'&&c.conclusion==='success');
 return <section className="star-settings" dir="rtl" aria-label="STAR Autonomous Developer V2">
 <header><span className="eyebrow">STAR / AUTONOMOUS DEVELOPER V2</span><h2>المطور الهندسي V2</h2><p>مهام متعددة الملفات · إنشاء ملفات ومجلدات · Commit واحد · اختبارات · إصلاح مقترح · تراجع آمن.</p><p>{configured?'مفتاح GitHub مضبوط؛ الصلاحية تُتحقق عند التنفيذ.':'مفتاح GitHub غير مضبوط.'}</p></header>
 {error&&<p role="alert" className="star-settings-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <label>مهمة التطوير<textarea rows={4} dir="auto" maxLength={2000} value={task} onChange={e=>setTask(e.target.value)} placeholder="صف التعديل المطلوب بوضوح"/></label>
 <label>الملفات (1–4، كل مسار في سطر؛ + قبل المسار لإنشاء ملف جديد)<textarea rows={4} dir="ltr" value={paths} onChange={e=>setPaths(e.target.value)} placeholder={'apps/web/src/Example.tsx\n+ docs/new-guide.md'}/></label>
 <div className="star-settings-actions"><button disabled={busy||!task.trim()||!paths.trim()} onClick={()=>void action(create)}>{busy?'جارٍ التنفيذ...':'إنشاء خطة وتعديلات V2'}</button><button disabled={busy} onClick={()=>{setTask('Append a short V2 integration verification heading to the existing document; create a new Markdown document with one short paragraph explaining this is a documentation-only test.');setPaths('docs/STAR_GITHUB_WORKSPACE.md\n+ docs/v2-integration-check.md');setNotice('هذا اختبار توثيقي فقط؛ راجع المقترح ولا تدمجه إن لم ترده.');}}>تجهيز اختبار متعدد الملفات</button></div>
 {job&&<article><h3>{job.task}</h3><p dir="ltr">{job.id} · {job.state} · {job.kind}</p>
 {job.files?.map(f=><details key={f.path} open={job.state==='draft'}><summary dir="ltr">{f.op.toUpperCase()} · {f.path}</summary><p>قبل</p><pre dir="ltr" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{f.before??'(new file)'}</pre><p>بعد</p><pre dir="ltr" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{f.after??'(rollback deletion)'}</pre></details>)}
 {job.state==='draft'&&<button disabled={busy||!configured} onClick={()=>{if(window.confirm('اعتماد جميع الملفات الظاهرة وإنشاء فرع وPR فقط؟'))runAction('approve',true);}}>اعتماد الخطة — GitHub Actions</button>}
 {job.state!=='draft'&&<button disabled={busy} onClick={()=>void action(()=>status(job.id))}>تحديث مراحل التنفيذ والاختبارات والنشر</button>}
 {job.run&&<p>Executor: {job.run.status} {job.run.conclusion||''} <a href={repo+'/actions/runs/'+job.run.id} target="_blank" rel="noreferrer">السجل</a></p>}
 {job.pr&&<a href={repo+'/pull/'+job.pr} target="_blank" rel="noreferrer">PR #{job.pr}</a>}
 {job.checks?.map(c=><p key={c.workflow}>{c.workflow}: {c.status} {c.conclusion||''} {c.id&&<a href={repo+'/actions/runs/'+c.id} target="_blank" rel="noreferrer">السجل</a>}</p>)}
 {job.state==='pr_open'&&<><button disabled={busy||!ready} onClick={()=>{if(window.confirm('دمج الخطة بعد نجاح الاختبارات ونشرها؟'))runAction('merge',true);}}>اعتماد الدمج والنشر</button><button disabled={busy||job.kind==='rollback'||(job.repairCount??0)>=2||!job.checks?.some(c=>c.conclusion==='failure')} onClick={()=>runAction('repair')}>اقتراح إصلاح من نتائج CI</button></>}
 {job.state==='merged'&&<><p>Cloudflare: {job.mergeSha&&deployed===job.mergeSha?'تم التحقق من الإصدار المنشور':'نشر هذا الإصدار غير مؤكد بعد'} <small dir="ltr">{deployed||'unknown'}</small></p><button disabled={busy} onClick={()=>runAction('rollback')}>إنشاء خطة تراجع للمراجعة</button></>}
 {job.state==='queued'&&<p>إذا فشل التنفيذ لا تعِد إرسال نفس المهمة؛ راجع السجل أولاً.</p>}
 </article>}
 <h3>المهام المحفوظة</h3><button disabled={busy} onClick={()=>void action(refresh)}>تحديث السجل</button>{jobs.map(j=><button key={j.id} disabled={busy} onClick={()=>void action(async()=>setJob(await api('?action=job&id='+encodeURIComponent(j.id))))}>{j.task.slice(0,80)} — {j.state}</button>)}
 <small>لا تنفيذ Shell حر ولا تعديل workflows أو الأسرار. النموذج Cloudflare Llama. إصلاح CI يستند إلى أسماء الوظائف والخطوات الفاشلة، وليس سجلات سرية كاملة. التراجع مقترح جديد ويُرفض إذا تغيرت الملفات.</small>
 </section>;
}
