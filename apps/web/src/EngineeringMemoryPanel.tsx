import {useState} from 'react';
import {emptyMemory,validateMemory,saveProject,summarizeRuns,STORAGE_KEY} from './engineering-memory';
import type {Memory,Project,ModelId} from './engineering-memory';
const MODELS:ModelId[]=['qwen3-coder-vast','@cf/meta/llama-3.3-70b-instruct-fp8-fast'];
export function loadEngineeringMemory():Memory{
 try{return validateMemory(JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'))}catch{return emptyMemory()}
}
export default function EngineeringMemoryPanel({memory,onChange,storageError}:{memory:Memory;onChange:(next:Memory)=>void;storageError:boolean}){
 const [repo,setRepo]=useState('');
 const [ref,setRef]=useState('');
 const [stage,setStage]=useState<Project['stage']>('development');
 const [error,setError]=useState('');
 const [confirmClear,setConfirmClear]=useState(false);
 function addProject(){
  setError('');
  try{onChange(saveProject(memory,{repo:repo.trim(),ref:ref.trim(),stage}));setRepo('');setRef('')}
  catch{setError('أدخل مستودع GitHub بصيغة owner/repo وبصمة commit من 7 إلى 40 حرفاً ست عشرياً.')}
 }
 function download(){
  const u=URL.createObjectURL(new Blob([JSON.stringify(memory,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=u;a.download='star-engineering-memory.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
 }
 return <section className="ai-panel" aria-label="ذاكرة المشاريع المحلية">
  <h2>STAR AI — الذاكرة الهندسية المحلية</h2>
  <small>السجل اختياري على هذا المتصفح فقط، غير مشفر وليس سجلاً موثوقاً للأدلة؛ لا تُحفظ المحادثات أو الأكواد أو المفاتيح. تجنب أسماء المستودعات الخاصة على الأجهزة المشتركة. قد يحذف المتصفح البيانات.</small>
  {storageError&&<p role="alert" className="ai-error">تعذر الحفظ المحلي؛ البيانات متاحة لهذه الجلسة فقط.</p>}
  <h3>متوسط نتائج الاختبارات المكتملة</h3>
  <div className="ai-grid">{MODELS.map(id=>{const s=summarizeRuns(memory.runs,id);return <article key={id} className="ai-panel"><strong dir="auto">{id}</strong><p>الجولات المكتملة: {s.count}</p><p>متوسط الدرجة: {s.averageScore===null?'—':s.averageScore.toFixed(2)+' / 5'}</p><p>متوسط زمن الطلب: {s.averageMs===null?'—':s.averageMs+' ms'}</p></article>})}</div>
  <details><summary>سجل آخر {memory.runs.length} استجابة مقيمة</summary>{memory.runs.map((r,i)=><p key={i} dir="auto">{r.at} · {r.model} · {r.complete?r.correct+' / 5':'غير مكتمل'} · {r.ms} ms · {r.version}</p>)}</details>
  <h3>فهرس المشاريع والإصدارات</h3>
  <form className="ai-panel" onSubmit={e=>{e.preventDefault();addProject()}}>
   <label>المستودع<input dir="ltr" value={repo} maxLength={140} onChange={e=>setRepo(e.target.value)} placeholder="owner/repo" required/></label>
   <label>بصمة الإصدار<input dir="ltr" value={ref} maxLength={40} onChange={e=>setRef(e.target.value)} placeholder="commit SHA" required/></label>
   <label>المرحلة<select value={stage} onChange={e=>setStage(e.target.value as Project['stage'])}><option value="planning">التخطيط</option><option value="development">التطوير</option><option value="review">المراجعة</option><option value="released">النشر</option></select></label>
   <button type="submit">حفظ بيانات الإصدار محلياً</button>
  </form>
  {error&&<p role="alert" className="ai-error">{error}</p>}
  {memory.projects.map(p=><article key={p.repo.toLowerCase()} className="ai-panel"><a href={'https://github.com/'+p.repo+'/commit/'+p.ref} target="_blank" rel="noopener noreferrer" dir="ltr">{p.repo} · {p.ref}</a><p>{p.stage} — بيانات أدخلها المستخدم، غير متحققة من GitHub</p><button type="button" onClick={()=>onChange({...memory,projects:memory.projects.filter(x=>x!==p)})}>إزالة من الفهرس</button></article>)}
  <button type="button" onClick={download}>تصدير السجل JSON</button>
  <label><input type="checkbox" checked={confirmClear} onChange={e=>setConfirmClear(e.target.checked)}/> تأكيد مسح السجل المحلي</label>
  <button type="button" disabled={!confirmClear} onClick={()=>{onChange(emptyMemory());setConfirmClear(false)}}>مسح البيانات المحلية</button>
 </section>
}
