import {useEffect,useState} from 'react';
import './ai-settings.css';
type Change={id:string;path:string;task:string;state:string;pr?:number;before?:string;after?:string};
const repo='https://github.com/abdulstarzeki001-sketch/KALI-OSINT-STAR';
async function api(query='',data?:object){
 const r=await fetch('/api/ai/github'+query,{credentials:'same-origin',cache:'no-store',...(data?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}:{})});
 let v;try{v=await r.json();}catch{throw Error('تحقق من تسجيل الدخول');}
 if(!r.ok)throw Error(v.error||'HTTP '+r.status);return v;
}
export default function GitHubWorkspacePanel(){
 const [diagnostic,setDiagnostic]=useState('');
 const [execution,setExecution]=useState<any>(null);
 const [deployedSha,setDeployedSha]=useState<string|null>(null);
 const testPath='docs/STAR_GITHUB_WORKSPACE.md',testTask='Append only a short heading STAR AI Integration Test at the end of the file, preserving every existing character.';
 const [files,setFiles]=useState<string[]>([]),[path,setPath]=useState('README.md'),[task,setTask]=useState(''),[source,setSource]=useState(''),[change,setChange]=useState<Change|null>(null),[history,setHistory]=useState<Change[]>([]),[write,setWrite]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function readDeployment(){try{const r=await fetch('/star-deployment.json?t='+Date.now(),{cache:'no-store',credentials:'same-origin'});const d=await r.json();setDeployedSha(r.ok&&d.source==='cloudflare-pages'&&/^[a-f0-9]{40}$/.test(d.sha)?d.sha:null);}catch{setDeployedSha(null);}}
 async function refresh(){const v=await api();setWrite(v.writeConfigured);setHistory(v.changes);}
 async function action(fn:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'تعذر التنفيذ');}finally{setBusy(false);}}
 useEffect(()=>{void action(refresh);},[]);
 return <section className="star-settings" dir="rtl">
 <header><span className="eyebrow">STAR AI / GITHUB WORKSPACE</span><h2>وكيل GitHub — ملف واحد (الإصدار السابق)</h2><p>للمهام الحديثة متعددة الملفات ومتابعة الاختبارات استخدم <a href="#developer-v2-center" onClick={e=>{e.preventDefault();document.getElementById('developer-v2-center')?.scrollIntoView({behavior:'smooth',block:'start'});}}>مركز التطوير V2 أعلاه</a>.</p><p>المستودع المصرح به: <a href={repo} target="_blank" rel="noreferrer">KALI-OSINT-STAR</a>. يقترح النموذج تعديلاً فعلياً لملف واحد ويعرضه للموافقة. لا يكتب مباشرة إلى main.</p><p>{write?'مفتاح الكتابة مضبوط؛ صلاحياته تُتحقق عند الطلب.':'مفتاح GitHub للكتابة غير مضبوط بعد؛ القراءة والاقتراح متاحان إذا سمحت الخدمة.'}</p></header>
 {error&&<p role="alert" className="star-settings-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <div className="star-settings-actions"><button disabled={busy} onClick={()=>void action(async()=>{const d=await api('?action=files');setFiles(d.files);})}>جلب ملفات GitHub</button><button disabled={busy} onClick={()=>void action(refresh)}>تحديث حالة الربط</button></div>
 <div className="star-settings-actions"><button disabled={busy} onClick={()=>void action(async()=>{const d=await api('?action=diagnose');setDiagnostic(JSON.stringify(d,null,2));})}>تشخيص اتصال GitHub</button></div>
 {diagnostic&&<pre dir="ltr" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{diagnostic}</pre>}
 <button disabled={busy} onClick={()=>void action(async()=>{setPath(testPath);setTask(testTask);setSource('');setChange(null);setExecution(null);const d=await api('',{action:'propose',path:testPath,task:testTask});setChange(d);await refresh();setNotice('تم إنشاء مقترح الاختبار. راجعه ثم وافق على فتح PR فقط، دون دمج.');})}>إنشاء مقترح اختبار GitHub الآن</button>
 <label>مسار الملف<input value={path} dir="ltr" list="star-github-files" onChange={e=>{setPath(e.target.value);setSource('');}}/></label><datalist id="star-github-files">{files.map(x=><option key={x} value={x}/>)}</datalist>
 <button disabled={busy||!path.trim()} onClick={()=>void action(async()=>{const d=await api('?action=file&path='+encodeURIComponent(path));setSource(d.text);})}>قراءة الملف من main</button>
 {source&&<details><summary>عرض محتوى الملف</summary><pre dir="ltr" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{source}</pre></details>}
 <label>تعليمات التعديل<textarea dir="auto" rows={4} maxLength={2000} value={task} onChange={e=>setTask(e.target.value)} placeholder="مثال: أصلح مشكلة عرض العنوان على الهاتف"/></label>
 <button disabled={busy||!task.trim()} onClick={()=>void action(async()=>{setChange(await api('',{action:'propose',path,task}));await refresh();})}>{busy?'جارٍ العمل...':'اطلب من STAR AI تعديل الملف'}</button>
 {change&&<article><strong dir="ltr">{change.path}</strong><p>{change.state}</p>{change.before!==undefined&&<details open><summary>المحتوى قبل التعديل</summary><pre dir="ltr" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{change.before}</pre></details>}{change.after!==undefined&&<details open><summary>المحتوى المقترح بعد التعديل</summary><pre dir="ltr" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{change.after}</pre></details>}
 {change.state==='draft'&&<button disabled={busy||!write} onClick={()=>{if(window.confirm('هل توافق على رفع هذا التعديل إلى فرع جديد وفتح Pull Request؟'))void action(async()=>{const v=await api('',{action:'publish_actions',id:change.id,approve:true});setChange(old=>old?{...old,...v}:old);await refresh();const d=await api('?action=diagnose');setDiagnostic(JSON.stringify(d,null,2));});}}>أوافق — تنفيذ GitHub Actions</button>}
 {change.pr&&<a href={repo+'/pull/'+change.pr} target="_blank" rel="noreferrer">فتح PR #{change.pr}</a>}
 {['pr_open','actions_pr_open'].includes(change.state)&&<button disabled={busy||!write} onClick={()=>{if(window.confirm('هل توافق على الدمج في main بعد تحقق CI؟ سيبدأ نشر Cloudflare تلقائياً.'))void action(async()=>{const v=await api('',{action:'merge',id:change.id,approve:true});setChange(old=>old?{...old,...v}:old);setNotice('تم الدمج؛ نشر Cloudflare لا يُعتبر ناجحاً حتى يتطابق رقم الإصدار الفعلي.');await refresh();setExecution(await api('?action=execution&id='+encodeURIComponent(change.id)));await readDeployment();});}}>تحقق من CI وادمج للنشر</button>}
 {change.state.startsWith('actions_')&&<div><button disabled={busy} onClick={()=>void action(async()=>{if(change.state==='actions_queued'){const v=await api('',{action:'sync_actions',id:change.id});setChange(old=>old?{...old,...v}:old);await refresh();}setExecution(await api('?action=execution&id='+encodeURIComponent(change.id)));await readDeployment();})}>تحديث التنفيذ والاختبارات</button>{execution&&<div><p>GitHub Actions: {execution.run?.status||'لم يظهر التشغيل بعد'} {execution.run?.conclusion||''}</p>{execution.run?.id&&<a href={repo+'/actions/runs/'+execution.run.id} target="_blank" rel="noreferrer">سجل التنفيذ</a>}{execution.mergeSha&&<p>Cloudflare: {deployedSha===execution.mergeSha?'تم التحقق من نشر هذا الإصدار': 'نشر هذا الإصدار غير مؤكد بعد'} <small dir="ltr">{deployedSha||'unknown'}</small></p>}{execution.checks?.map((c:any)=><p key={c.workflow}>{c.workflow}: {c.status} {c.conclusion||''} {c.id&&<a href={repo+'/actions/runs/'+c.id} target="_blank" rel="noreferrer">السجل</a>}</p>)}</div>}</div>}{change.state==='publishing'&&<p>الرفع غير مكتمل أو يحتاج مراجعة في GitHub؛ لا تعِد العملية دون التحقق من الفرع.</p>}</article>}
 <h3>سجل التعديلات المحفوظ</h3>{history.map(x=><button key={x.id} disabled={busy} onClick={()=>void action(async()=>{setExecution(null);setChange(await api('?action=change&id='+encodeURIComponent(x.id)));})}>{x.path} — {x.state}</button>)}
 <small>النطاق الحالي: ملفات الواجهة والاختبارات والوثائق المسموح بها. النموذج Cloudflare Llama. التعديلات الصغيرة فقط، ولا يدعم الحذف أو workflows أو ملفات الأسرار. النشر ليس نجاحاً مؤكداً حتى تظهر نتيجة Cloudflare.</small>
 </section>;
}
