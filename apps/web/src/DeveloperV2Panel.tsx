import {useEffect,useRef,useState} from 'react';
import './ai-settings.css';
import './developer-v2.css';
import './engineering-v3.css';
import EngineeringV3 from './EngineeringV3';
import EngineeringOps from './EngineeringOps';
type Edit={path:string;op:'modify'|'create'|'delete';before:string|null;after:string|null;blob:string|null};
type Check={workflow:string;status:string;conclusion:string|null;id:number|null};
type Job={id:string;task:string;state:string;kind:string;files?:Edit[];pr?:number;head?:string;mergeSha?:string;repairCount?:number;run?:{id:number;status:string;conclusion:string}|null;checks?:Check[];created?:number};
type CatalogItem={path:string;size:number};
const repo='https://github.com/abdulstarzeki001-sketch/KALI-OSINT-STAR';
const endpoint='/api/ai/developer-v2';
const stateLabels:Record<string,string>={draft:'بانتظار اعتماد المقترح',queued:'في قائمة التنفيذ',pr_open:'مراجعة الاختبارات',merged:'تم الدمج',discarded:'مسودة ملغاة'};
async function api(query='',data?:object,signal?:AbortSignal){const r=await fetch(endpoint+query,{signal,cache:'no-store',credentials:'same-origin',...(data?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}:{})});let v;try{v=await r.json();}catch{throw Error('تحقق من تسجيل الدخول');}if(!r.ok)throw Error(v.error||'HTTP '+r.status);return v;}
const checksReady=(j:Job)=>j.run?.status==='completed'&&j.run.conclusion==='success'&&j.checks?.length===2&&j.checks.every(c=>c.status==='completed'&&c.conclusion==='success');
const terminalFailure=(j:Job)=>j.run?.status==='completed'&&j.run.conclusion!=='success'||j.checks?.some(c=>c.status==='completed'&&c.conclusion!=='success');
async function liveDeployment(signal?:AbortSignal){try{const r=await fetch('/star-deployment.json?t='+Date.now(),{signal,cache:'no-store'});const d=await r.json();return r.ok&&d.source==='cloudflare-pages'&&/^[a-f0-9]{40}$/.test(d.sha)?d.sha:'';}catch{return '';}}
export default function DeveloperV2Panel({initialTask=''}:{initialTask?:string}){
 const [task,setTask]=useState(initialTask),[paths,setPaths]=useState(''),[job,setJob]=useState<Job|null>(null),[jobs,setJobs]=useState<Job[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[deployed,setDeployed]=useState(''),[configured,setConfigured]=useState(false),[catalog,setCatalog]=useState<CatalogItem[]>([]),[query,setQuery]=useState(''),[auto,setAuto]=useState(true),[lastUpdate,setLastUpdate]=useState(0),[pollError,setPollError]=useState(''),[filter,setFilter]=useState('all');
 const [provider,setProvider]=useState('llama-cloudflare'),[recoverPR,setRecoverPR]=useState('');
 const working=useRef(false),activeId=useRef<string|null>(null);
 useEffect(()=>{if(initialTask)setTask(initialTask);},[initialTask]);
 function select(j:Job|null){activeId.current=j?.id||null;setJob(j);setPollError('');setLastUpdate(0);setDeployed('');}
 async function refresh(){const r=await api();setJobs(r.jobs);setConfigured(r.configured);}
 async function action(fn:()=>Promise<void>){if(working.current)return;working.current=true;setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'تعذر التنفيذ');}finally{working.current=false;setBusy(false);}}
 useEffect(()=>{void action(async()=>{const r=await api();setJobs(r.jobs);setConfigured(r.configured);const active=r.jobs.find((x:Job)=>['queued','pr_open'].includes(x.state));if(active&&!activeId.current)select(await api('?action=job&id='+encodeURIComponent(active.id)));});},[]);
 async function fetchStatus(id:string,signal?:AbortSignal){
  await api('',{action:'sync',id},signal);
  const j:Job=await api('?action=status&id='+encodeURIComponent(id),undefined,signal);
  const sha=j.state==='merged'?await liveDeployment(signal):'';
  if(signal?.aborted||activeId.current!==id)return;
  setJob(j);setDeployed(sha);setLastUpdate(Date.now());setPollError('');
  setJobs(old=>old.map(x=>x.id===id?{...x,state:j.state,pr:j.pr}:x));
 }
 const watched=job?.id,watchState=job?.state,watchDone=!!job&&(!!terminalFailure(job)||!!checksReady(job)&&job.state!=='merged'||job.state==='merged'&&!!job.mergeSha&&job.mergeSha===deployed);
 useEffect(()=>{
  if(!auto||busy||!watched||!['queued','pr_open','merged'].includes(watchState||'')||watchDone)return;
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;let attempts=0;
  async function tick(){
   if(controller.signal.aborted||!watched||working.current||activeId.current!==watched)return;
   if(document.visibilityState!=='visible'){timer=setTimeout(tick,15000);return;}
   try{await fetchStatus(watched,controller.signal);attempts=0;}catch(e){if(controller.signal.aborted)return;attempts++;setPollError(e instanceof Error?e.message:'تعذر تحديث الحالة');}
   if(!controller.signal.aborted)timer=setTimeout(tick,attempts?30000:15000);
  }
  timer=setTimeout(tick,1200);
  return ()=>{controller.abort();clearTimeout(timer);};
 },[auto,busy,watched,watchState,watchDone]);
 const lines=paths.split('\n').map(s=>s.trim()).filter(Boolean);
 const selectedPaths=new Set(lines.map(s=>s.replace(/^\+\s*/,'')));
 const matches=catalog.filter(x=>x.path.toLowerCase().includes(query.toLowerCase())).slice(0,18);
 async function create(){const files=lines.map(s=>({op:s.startsWith('+')?'create':'modify',path:s.replace(/^\+\s*/,'')}));select(await api('',{action:'plan',task,files,provider}));await refresh();}
 const runAction=(name:string,approve=false)=>void action(async()=>{if(!job)return;const id=job.id;try{const j=await api('',{action:name,id,...(approve?{approve:true}:{})});select(j);await refresh();if(name==='merge')await fetchStatus(j.id);}catch(e){
  // A server response may be lost after dispatch. Recover the stored state, not a second write.
  try{select(await api('?action=job&id='+encodeURIComponent(id)));await refresh();}catch{}
  throw e;
 }});
 const ready=!!job&&!!checksReady(job);
 const live=!!job?.mergeSha&&deployed===job.mergeSha;
 const stages=job?[{label:'المقترح',status:'done'},{label:'التنفيذ',status:job.state==='draft'||job.state==='discarded'?'pending':job.run?.conclusion==='success'?'done':job.run?.status==='completed'?'failed':'active'},{label:'الاختبارات',status:ready?'done':job.checks?.some(c=>c.status==='completed'&&c.conclusion!=='success')?'failed':job.state==='pr_open'?'active':'pending'},{label:'الدمج',status:job.state==='merged'?'done':'pending'},{label:'النشر',status:live?'done':job.state==='merged'?'active':'pending'}]:[];
 return <section id="developer-v2-center" className="star-settings star-dev-v2" dir="rtl" aria-label="STAR Autonomous Developer V2">
 <header className="dev-v2-head"><div><span className="eyebrow">STAR / AUTONOMOUS DEVELOPER V2</span><h2>مركز التطوير والتشغيل</h2><p>خطّط، راجع، اختبر وانشر ضمن نطاق المشروع المصرّح.</p></div><span className={'dev-v2-pill '+(configured?'is-ready':'')}>{configured?'GitHub: مفتاح مضبوط':'GitHub: غير جاهز'}</span></header>
 {error&&<p role="alert" className="star-settings-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <div className="dev-v2-metrics"><div><small>المهام المسجلة (آخر 30)</small><strong>{jobs.length}</strong></div><div><small>قيد التنفيذ / المراجعة</small><strong>{jobs.filter(j=>['queued','pr_open'].includes(j.state)).length}</strong></div><div><small>مدمجة</small><strong>{jobs.filter(j=>j.state==='merged').length}</strong></div></div>
 <label>مهمة التطوير<textarea rows={4} dir="auto" maxLength={2000} value={task} onChange={e=>setTask(e.target.value)} placeholder="صف النتيجة المطلوبة والتغييرات"/></label>
 <label>نموذج التخطيط والتعديل<select value={provider} disabled={busy} onChange={e=>setProvider(e.target.value)}><option value="llama-cloudflare">Cloudflare Llama</option><option value="qwen3-coder-vast">Qwen — البوابة الخاصة (يتطلب توفر الخادم)</option><option value="star-ai-auto">Auto — Qwen ثم Llama عند تعذر الاتصال</option></select></label>
 <EngineeringV3 task={task} provider={provider} busy={busy} jobVersion={job?job.id+':'+job.state+':'+(job.pr||''):''} onJob={id=>void action(async()=>{select(await api('?action=job&id='+encodeURIComponent(id)));await refresh();})} onStage={(t,p)=>{setTask(t);setPaths(p);setNotice('تم اختيار المرحلة. راجع المهمة والملفات قبل إنشاء التعديل.');}}/>
 <label>الملفات المختارة ({lines.length}/4؛ + لإنشاء ملف جديد)<textarea rows={4} dir="ltr" value={paths} onChange={e=>setPaths(e.target.value)} placeholder={'apps/web/src/Example.tsx\n+ docs/new-guide.md'}/></label>
 <details className="dev-v2-catalog"><summary>متصفح ملفات المستودع</summary><button disabled={busy} onClick={()=>void action(async()=>{const d=await api('?action=catalog');setCatalog(d.files);})}>تحميل الملفات المتاحة</button>{catalog.length>0&&<><label>بحث<input value={query} dir="ltr" onChange={e=>setQuery(e.target.value)} placeholder="اسم الملف أو المجلد"/></label><div className="dev-v2-filelist">{matches.map(f=><button key={f.path} disabled={busy||selectedPaths.has(f.path)||lines.length>=4} dir="ltr" onClick={()=>setPaths(old=>[old.trim(),f.path].filter(Boolean).join('\n'))}>{f.path} <small>{Math.ceil(f.size/1024)} KB</small></button>)}</div><small>يعرض أول 18 نتيجة؛ ابحث للوصول إلى مسار محدد. صلاحية محتوى الملف تُفحص عند التخطيط.</small></>}</details>
 <div className="star-settings-actions"><button className="dev-v2-primary" disabled={busy||!task.trim()||lines.length<1||lines.length>4} onClick={()=>void action(create)}>{busy?'جارٍ التنفيذ...':'إنشاء خطة وتعديلات V2'}</button><button disabled={busy} onClick={()=>void action(async()=>{select(await api('',{action:'smoke_plan'}));await refresh();setNotice('أُنشئت خطة اختبار ثابتة من المستودع. لا كتابة قبل اعتمادك؛ الدمج محظور لهذا الاختبار.');})}>إنشاء اختبار ربط موثوق</button></div>
 {job&&<article><header><h3>{job.task}</h3><p><span className="dev-v2-pill">{stateLabels[job.state]||job.state}</span> <small dir="ltr">{job.id} · {job.kind}</small></p></header>
 <div className="dev-v2-stages" aria-label="مراحل التنفيذ">{stages.map((s,i)=><div key={s.label} data-status={s.status}><b>{s.status==='done'?'✓':s.status==='failed'?'!':i+1}</b><span>{s.label}</span></div>)}</div>
 {job.files?.map(f=><details key={f.path} open={job.state==='draft'}><summary dir="ltr">{f.op.toUpperCase()} · {f.path}</summary><div className="dev-v2-preview"><div><p>قبل</p><pre dir="ltr">{f.before??'(new file)'}</pre></div><div><p>بعد</p><pre dir="ltr">{f.after??'(rollback deletion)'}</pre></div></div></details>)}
 {job.state==='draft'&&<div className="star-settings-actions"><button className="dev-v2-primary" disabled={busy||!configured} onClick={()=>{if(window.confirm('اعتماد جميع الملفات الظاهرة وإنشاء فرع وPR فقط؟'))runAction('approve',true);}}>اعتماد الخطة — GitHub Actions</button><button disabled={busy} onClick={()=>{if(window.confirm('إلغاء هذه المسودة دون أي تغيير في GitHub؟'))runAction('discard',true);}}>إلغاء المسودة</button></div>}
 {['queued','pr_open','merged'].includes(job.state)&&<><div className="star-settings-actions"><button disabled={busy} onClick={()=>void action(()=>fetchStatus(job.id))}>تحديث الحالة الآن</button><label><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/> متابعة تلقائية</label></div><small>{lastUpdate?'آخر تحديث: '+new Date(lastUpdate).toLocaleTimeString('ar-IQ'):'لم تُسترجع حالة التنفيذ بعد'} · تعمل المتابعة أثناء فتح الصفحة فقط</small></>}
 {pollError&&<p role="status">توقف مؤقت في المتابعة: {pollError}، تُعاد قراءة الحالة فقط.</p>}
 {job.run&&<p>Executor: {job.run.status} {job.run.conclusion||''} <a href={repo+'/actions/runs/'+job.run.id} target="_blank" rel="noreferrer">السجل</a></p>}
 {job.pr&&<a href={repo+'/pull/'+job.pr} target="_blank" rel="noreferrer">PR #{job.pr}</a>}
 {job.checks?.map(c=><p key={c.workflow}>{c.workflow}: {c.status} {c.conclusion||''} {c.id&&<a href={repo+'/actions/runs/'+c.id} target="_blank" rel="noreferrer">السجل</a>}</p>)}
 {job.kind==='smoke'&&<p>هذه مهمة إثبات ربط؛ لا يسمح النظام بدمجها. {ready?'نجح التنفيذ والاختبارات، وتم التحقق من مسار GitHub لهذه الجلسة.':''}</p>}
 {job.state==='pr_open'&&job.kind!=='smoke'&&<div className="star-settings-actions"><button className="dev-v2-primary" disabled={busy||!ready} onClick={()=>{if(window.confirm('دمج الخطة بعد نجاح الاختبارات ونشرها؟'))runAction('merge',true);}}>اعتماد الدمج والنشر</button><button disabled={busy||job.kind==='rollback'||(job.repairCount??0)>=2||!job.checks?.some(c=>c.conclusion==='failure')} onClick={()=>runAction('repair')}>اقتراح إصلاح من نتائج CI</button></div>}
 {job.state==='merged'&&<><p>Cloudflare: {live?'تم التحقق من الإصدار المنشور':'نشر هذا الإصدار غير مؤكد بعد'} <small dir="ltr">{deployed||'unknown'}</small></p><button disabled={busy} onClick={()=>runAction('rollback')}>إنشاء خطة تراجع للمراجعة</button></>}
 {job.state==='queued'&&<details><summary>استعادة حالة PR معروف</summary><label>رقم Pull Request<input inputMode="numeric" value={recoverPR} onChange={e=>setRecoverPR(e.target.value)}/></label><button disabled={busy||!/^\d+$/.test(recoverPR)} onClick={()=>void action(async()=>{await api('',{action:'sync',id:job.id,pr:Number(recoverPR)});await fetchStatus(job.id);})}>مطابقة PR مع المهمة</button><small>لا يعيد التنفيذ؛ يتحقق من الفرع والمحتوى المعتمد.</small></details>}
 {job.state==='queued'&&<p>{terminalFailure(job)?'فشل محرك التنفيذ. افتح السجل لمعرفة السبب؛ لا تُعد إرسال نفس المهمة.':'تم تسجيل الطلب؛ انتظر نتيجة GitHub أو حدّث الحالة. لا تُعد إرسال الطلب عند انقطاع الشبكة.'}</p>}
 </article>}
 <EngineeringOps onJob={id=>void action(async()=>{select(await api('?action=job&id='+encodeURIComponent(id)));await refresh();})} onRunner={()=>document.getElementById('star-agent-runner')?.scrollIntoView({behavior:'smooth',block:'start'})}/>
 <h3>سجل المهام</h3><div className="star-settings-actions"><button disabled={busy} onClick={()=>void action(refresh)}>تحديث السجل</button><label>الحالة <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">الكل</option>{Object.entries(stateLabels).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label></div>
 <div className="dev-v2-history">{jobs.filter(j=>filter==='all'||j.state===filter).map(j=><button key={j.id} disabled={busy} aria-current={job?.id===j.id?'true':undefined} onClick={()=>void action(async()=>select(await api('?action=job&id='+encodeURIComponent(j.id))))}><strong>{j.task.slice(0,100)}</strong><small>{stateLabels[j.state]||j.state} {j.created?' · '+new Date(j.created).toLocaleString('ar-IQ'):''}</small></button>)}</div>
 <small>المتابعة تقرأ حالة GitHub فقط ولا تكرر أوامر الكتابة. الإصلاح مقترح يستند إلى بيانات CI المحدودة؛ لا تنفيذ Shell حر أو تعديل أسرار أو workflows. يتطلب النشر اعتماداً منفصلاً.</small>
 </section>;
}
