import {useEffect,useState} from 'react';
import './agent-runner.css';

type Pending={id:string;name:string;arguments:Record<string,unknown>};
type Event={kind:string;ts:number;detail:unknown};
type Task={
  id:string;status:string;steps:number;result:string;pending:Pending|null;
  events:Event[];created:number
};
type Health={ok:boolean;service:string;tool_mode:string;model_backend:string;
 live_inference_tested:boolean;allowed_host_count:number};
type ErrorBody={error?:string;detail?:string};
const FINAL=new Set(['completed','failed','rejected','interrupted']);

async function requestAgent(path:string,body?:Record<string,unknown>){
 const response=await fetch('/api/agent/'+path,{
  method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',
  headers:body?{'content-type':'application/json'}:{},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 let output:Record<string,unknown>&ErrorBody={};
 try{output=await response.json();}catch{throw Error('استجابة غير صالحة من خادم الوكيل');}
 if(!response.ok)throw Error(
  (typeof output.error==='string'?output.error:typeof output.detail==='string'?output.detail:'فشل الطلب')+
  ' (HTTP '+response.status+')');
 return output;
}
const EXAMPLES=[
 'افتح README.md من مساحة المشروع ثم لخص بنيته وما يحتاج إصلاحه.',
 'اعرض ملفات apps/web/src وحدد صفحة واجهة STAR AI.',
 'ابحث عن TODO في ملفات المشروع ثم رتّب المهام المقترحة.',
 'راجع كود الحماية واطلب الموافقة قبل تعديل أي ملف.'
];
export default function AgentRunnerPanel(){
 const [prompt,setPrompt]=useState('');
 const [current,setCurrent]=useState<Task|null>(null);
 const [health,setHealth]=useState<Health|null>(null);
 const [busy,setBusy]=useState(false);
 const [approvalBusy,setApprovalBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 async function refresh(id:string){
  try{const result=await requestAgent('tasks/'+encodeURIComponent(id));
      setCurrent(result as unknown as Task);}
  catch(e){setError(e instanceof Error?e.message:'تعذر تحديث المهمة');}
 }
 useEffect(()=>{
  let live=true;
  void requestAgent('health').then(x=>{if(live)setHealth(x as unknown as Health);})
   .catch(e=>{if(live)setError(e instanceof Error?e.message:'الوكيل غير متاح');});
  return ()=>{live=false;};
 },[]);
 useEffect(()=>{
  if(!current||FINAL.has(current.status)||current.status==='approval_required')return;
  const interval=window.setInterval(()=>{void refresh(current.id);},2500);
  return ()=>window.clearInterval(interval);
 },[current?.id,current?.status]);
 async function submit(){
  if(busy||!prompt.trim())return;
  setError('');setMessage('');setBusy(true);
  try{
   const result=await requestAgent('tasks',{prompt:prompt.trim()});
   const task=result as unknown as Task;
   setCurrent(task);
   setMessage('تم إنشاء المهمة على خادم Railway. انتظر سجل الأدوات أو طلب الموافقة.');
  }catch(e){setError(e instanceof Error?e.message:'فشل إرسال المهمة');}
  finally{setBusy(false);}
 }
 async function decide(approve:boolean){
  if(!current||!current.pending||approvalBusy)return;
  setApprovalBusy(true);setError('');
  try{
   const result=await requestAgent('tasks/'+current.id+'/decide',{approve});
   setCurrent(result as unknown as Task);
   setMessage(approve?'تم إرسال الموافقة على هذا الإجراء فقط':'تم رفض الإجراء، ولم يُنفذ');
  }catch(e){setError(e instanceof Error?e.message:'فشل الإجراء');}
  finally{setApprovalBusy(false);}
 }
 return <section className="agent-runner-page page-animate" dir="rtl">
  <div className="runner-header">
   <span className="eyebrow">STAR AI / CONTROLLED EXECUTION</span>
   <h1>STAR Agent Runner <span>وكيل تنفيذ حقيقي</span></h1>
   <p>يعمل على Railway داخل نسخة معزولة من مشروعك. يقرأ الملفات ويبحث فيها، ويطلب موافقتك على التعديلات والاختبارات. لا يتحكم بترمنال جهازك أو خوادم أخرى.</p>
  </div>
  <div className="runner-status" role="status">
   <div><strong>حالة خدمة الوكيل</strong><span>{health?.ok?'الخدمة تستجيب':'لم يُتحقق من اتصال الخدمة'}</span></div>
   <div><strong>محرك الاستدلال</strong><span>{health?.model_backend==='cloudflare'?'Cloudflare Llama — يتطلب جلسة Access نشطة':health?.model_backend||'غير معروف'}</span></div>
   <div><strong>عزل الأدوات</strong><span>موافقة بشرية قبل التعديل والاختبار</span></div>
   <div><strong>المتصفح</strong><span>معطل في خدمة 1GB الحالية</span></div>
  </div>
  <div className="runner-columns">
   <div className="runner-panel">
    <h2>01 — أرسل المهمة</h2>
    <label htmlFor="runner-prompt">ماذا تريد أن يفعل الوكيل داخل نسخة المشروع؟</label>
    <textarea id="runner-prompt" value={prompt} maxLength={4000} rows={9}
     onChange={e=>setPrompt(e.target.value)} placeholder="اقرأ README.md، افحص كود الواجهة، واقترح تحسينات مع الأدلة..."/>
    <div className="runner-count">{prompt.length} / 4000</div>
    <button className="runner-primary" disabled={busy||prompt.trim().length===0}
     onClick={()=>void submit()}>{busy?'جارٍ الإرسال...':'ابدأ تنفيذ المهمة'}</button>
    <div className="runner-examples">
     <strong>أمثلة مهام</strong>
     {EXAMPLES.map(value=><button type="button" key={value} onClick={()=>setPrompt(value)}>{value}</button>)}
    </div>
    <p className="runner-note">مصدر المشروع موجود داخل حاوية Railway. لا تُخزن البيانات الحساسة في المطالبات. موافقتك لا تسمح بأوامر عشوائية؛ قائمة الأوامر محصورة في كود التنفيذ.</p>
   </div>
   <div className="runner-panel runner-output" aria-live="polite">
    <h2>02 — التنفيذ والتدقيق</h2>
    {error&&<p role="alert" className="runner-error">{error}</p>}
    {message&&<p className="runner-msg">{message}</p>}
    {current?<div className="runner-task">
      <div className="runner-state"><strong>الحالة: {current.status}</strong>
       <span>{current.steps} دورات استدلال</span>
       <button type="button" onClick={()=>void refresh(current.id)}>تحديث</button></div>
      <div className="runner-id" dir="ltr">{current.id}</div>
      {current.pending&&<div className="runner-approval">
       <h3>موافقة مطلوبة: {current.pending.name}</h3>
       <p>راجع العملية كاملة قبل السماح للوكيل بالاستمرار. الموافقة تخص هذه العملية فقط.</p>
       <pre dir="ltr">{JSON.stringify(current.pending.arguments,null,2)}</pre>
       <div className="runner-approval-buttons">
        <button disabled={approvalBusy} onClick={()=>void decide(true)}>أوافق على هذا الإجراء</button>
        <button disabled={approvalBusy} onClick={()=>void decide(false)}>أرفض</button>
       </div>
      </div>}
      {current.result&&<div className="runner-result"><strong>نتيجة المهمة</strong><pre>{current.result}</pre></div>}
      <h3>سجل الخطوات الفعلية</h3>
      <div className="runner-events">{(current.events||[]).map((event,index)=>
       <div className="runner-event" key={index}>
        <strong>{event.kind}</strong>
        <span>{new Date(event.ts*1000).toLocaleString('ar-IQ')}</span>
        <pre>{JSON.stringify(event.detail,null,2)}</pre>
       </div>)}</div>
    </div>:<p className="runner-empty">أرسل مهمة لتظهر هنا خطوات التنفيذ، النتائج وطلبات الموافقة. لن نعرض نتائج تجريبية على أنها عمليات حقيقية.</p>}
    <p className="runner-note">الاستدلال النصي من Cloudflare لا يضمن إرجاع استدعاء أداة صالح. نجاح الخدمة لا يعني نجاح تنفيذ مهمة إلا إذا ظهر سجل أداة حقيقي.</p>
   </div>
  </div>
 </section>;
