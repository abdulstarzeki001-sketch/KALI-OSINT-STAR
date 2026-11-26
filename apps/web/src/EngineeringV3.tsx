import {useEffect,useState} from 'react';
type Stage={title:string;task:string;acceptance:string;files:{path:string;op:string}[]};
type Roadmap={id:string;task:string;base:string;roadmap:{summary:string;stages:Stage[]};provider:string;ms:number;total:number;eligible:number;created:number};
const endpoint='/api/ai/developer-v2';
async function api(query='',body?:object){const r=await fetch(endpoint+query,{cache:'no-store',credentials:'same-origin',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw Error(d.error||'HTTP '+r.status);return d;}
export default function EngineeringV3({task,provider,busy,onStage}:{task:string;provider:string;busy:boolean;onStage:(task:string,paths:string)=>void}){
 const [plans,setPlans]=useState<Roadmap[]>([]),[current,setCurrent]=useState<Roadmap|null>(null),[working,setWorking]=useState(false),[error,setError]=useState('');
 async function refresh(){const d=await api('?action=roadmaps');setPlans(d.roadmaps||[]);}
 useEffect(()=>{void refresh().catch(()=>setError('تعذر تحميل سجل الخطط'));},[]);
 async function generate(){if(working||busy||!task.trim())return;setWorking(true);setError('');try{const p=await api('',{action:'roadmap',task,provider});setCurrent(p);await refresh();}catch(e){setError(e instanceof Error?e.message:'فشل التخطيط');}finally{setWorking(false);}}
 return <article className="dev-v3-planner"><header><span className="eyebrow">STAR / AUTONOMOUS ENGINEERING V3</span><h3>المخطط الهندسي الذكي</h3><p>يفحص فهرس المشروع، ويرشح الملفات المسموح بها ويقترح حتى ثلاث مراحل. لا يعدّل الملفات أو ينفذ أوامر عند التخطيط.</p></header>
 {error&&<p role="alert">{error}</p>}
 <div className="star-settings-actions"><button className="dev-v2-primary" disabled={busy||working||!task.trim()} onClick={()=>void generate()}>{working?'تحليل الفهرس وتوليد الخطة...':'حلّل المشروع واختر الملفات تلقائياً'}</button><button disabled={working||busy} onClick={()=>void refresh().catch(e=>setError(String(e)))}>استعادة الخطط المحفوظة</button></div>
 {current&&<><div className="dev-v2-metrics"><div><small>ملفات الفهرس</small><strong>{current.total}</strong></div><div><small>مؤهلة للترشيح</small><strong>{current.eligible}</strong></div><div><small>زمن استجابة المخطط</small><strong>{(current.ms/1000).toFixed(1)}s</strong></div></div><p dir="auto">{current.roadmap.summary}</p><small dir="ltr">{current.provider} · base {current.base.slice(0,8)}</small>
 {current.roadmap.stages.map((s,i)=><div className="dev-v3-stage" key={i}><h4>{i+1}. {s.title}</h4><p dir="auto">{s.task}</p><small>معيار القبول: {s.acceptance}</small>{s.files.map(f=><p dir="ltr" key={f.path}><code>{f.path}</code></p>)}<button disabled={busy||working} onClick={()=>onStage(s.task,s.files.map(f=>f.path).join('\n'))}>نقل المرحلة إلى محرر التعديلات</button></div>)}</>}
 {plans.length>0&&<details><summary>سجل الخطط (آخر 15)</summary>{plans.map(p=><button key={p.id} disabled={busy||working} onClick={()=>setCurrent(p)}>{p.task.slice(0,100)} · {p.roadmap.stages.length} مراحل</button>)}</details>}
 <small>التحليل هنا مبني على أسماء الملفات وحجومها، وليس مراجعة محتوى المستودع بالكامل. يُقرأ محتوى الملفات المختارة عند إنشاء التعديل. نفّذ المراحل بالتتابع بعد مراجعة نتائج كل مرحلة.</small></article>;
}
