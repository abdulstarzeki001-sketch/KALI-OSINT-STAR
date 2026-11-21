import {useEffect,useMemo,useRef,useState} from 'react';
import {checkShare,isCurrent,parseAdvisory,parseProposal,proposalMessages,reviewMessages,TASKS} from './coding-copilot';
import type {Proposal,Task} from './coding-copilot';
import {diffLines} from './project-workspace';

const labels:Record<Task,string>={documentation:'تحسين التوثيق',readability:'تحسين قابلية القراءة',validation:'مراجعة التحقق من المدخلات',tests:'تحسين اختبارات الوحدة الموجودة'};
async function ask(model:string,messages:{role:string;content:string}[],signal:AbortSignal){
 if(messages.some(m=>m.content.length>5000))throw Error('حجم الرسالة يتجاوز حد البوابة');
 const response=await fetch('/api/ai/chat',{method:'POST',credentials:'same-origin',cache:'no-store',signal,headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({model,messages,mode:'code',stream:false,temperature:0.1})});
 if(!response.ok||!(response.headers.get('content-type')||'').includes('application/json'))throw Error('HTTP '+response.status+' — تحقق من الجلسة والخدمة');
 const raw=await response.text();
 if(raw.length>64000)throw Error('استجابة أكبر من الحد');
 return JSON.parse(raw) as unknown;
}
export default function CodingCopilotPanel({name,source,onApply,disabled}:{name:string;source:string;onApply:(p:Proposal)=>void;disabled:boolean}){
 const [task,setTask]=useState<Task>('readability');
 const [consent,setConsent]=useState(false);
 const [reviewConsent,setReviewConsent]=useState(false);
 const [approval,setApproval]=useState(false);
 const [proposal,setProposal]=useState<Proposal|null>(null);
 const [review,setReview]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 const current=proposal!==null&&isCurrent(proposal,name,source);
 const diff=useMemo(()=>proposal?diffLines(proposal.base,proposal.source):[],[proposal]);
 function reset(){setProposal(null);setReview('');setApproval(false);setReviewConsent(false);setError('')}
 async function requestProposal(){
  if(disabled||!consent||controller.current)return;
  reset();setConsent(false);
  const abort=new AbortController();controller.current=abort;setBusy(true);
  const timer=window.setTimeout(()=>abort.abort(),90000);
  try{
   checkShare(source);
   const data=await ask('qwen3-coder-vast',proposalMessages(name,source,task),abort.signal);
   setProposal(parseProposal(data,name,source));
  }catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'تعذر إنشاء المقترح');else setError('تم إلغاء الطلب أو انتهت مهلته')}
  finally{window.clearTimeout(timer);controller.current=null;setBusy(false)}
 }
 async function requestReview(){
  if(disabled||!proposal||!current||!reviewConsent||controller.current)return;
  setReviewConsent(false);setApproval(false);setReview('');setError('');
  const abort=new AbortController();controller.current=abort;setBusy(true);
  const timer=window.setTimeout(()=>abort.abort(),90000);
  try{setReview(parseAdvisory(await ask('llama-cloudflare',reviewMessages(proposal),abort.signal)))}
  catch(e){setError(e instanceof Error?e.message:'تعذر إجراء المراجعة')}
  finally{window.clearTimeout(timer);controller.current=null;setBusy(false)}
 }
 return <section className="ai-panel" aria-label="STAR AI Coding Copilot">
  <h3>STAR AI — مساعد تحرير الكود</h3>
  <small>يرسل الملف الحالي فقط بعد موافقتك إلى Qwen عبر بوابة المشروع. الحد 4000 حرف. لا ترسل أسراراً أو بيانات حكومية أو شيفرة غير مصرح لك بمشاركتها. فحص الأسرار استدلالي وغير شامل، ولا يوجد تنفيذ للكود أو نشر تلقائي.</small>
  <label>نوع المساعدة<select disabled={busy||disabled} value={task} onChange={e=>{setTask(e.target.value as Task);setConsent(false);reset()}}>{Object.keys(TASKS).map(k=><option key={k} value={k}>{labels[k as Task]}</option>)}</select></label>
  <label><input type="checkbox" checked={consent} disabled={busy||disabled} onChange={e=>setConsent(e.target.checked)}/> أوافق على إرسال محتوى الملف الحالي إلى Qwen</label>
  <button type="button" disabled={busy||disabled||!consent||source.length>4000||!source.trim()} onClick={()=>void requestProposal()}>إنشاء مقترح تعديل</button>
  {busy&&<button type="button" onClick={()=>controller.current?.abort()}>إلغاء الطلب</button>}
  {error&&<p className="ai-error" role="alert">{error}</p>}
  {proposal&&<>
   <p role="status">{current?'مسودة مقترحة للمراجعة — لم تُطبق':'تغيّر الملف؛ يلزم إنشاء مقترح جديد'}</p>
   <p dir="auto">{proposal.summary}</p>
   <p>+{diff.filter(l=>l.kind==='add').length} / −{diff.filter(l=>l.kind==='remove').length}</p>
   <pre className="ai-source-view" dir="ltr" style={{maxHeight:420,overflow:'auto'}}>{diff.map((l,i)=><span key={i} style={{display:'block',whiteSpace:'pre-wrap',color:l.kind==='add'?'#16a34a':l.kind==='remove'?'#dc2626':undefined}}>{l.kind==='add'?'+':l.kind==='remove'?'-':' '} {l.oldLine??' '}:{l.newLine??' '} {l.text}</span>)}</pre>
   <label><input type="checkbox" disabled={!current||busy||disabled} checked={reviewConsent} onChange={e=>setReviewConsent(e.target.checked)}/> أوافق على إرسال الأصل والمقترح إلى Llama للمراجعة المستقلة</label>
   <button type="button" disabled={!current||busy||disabled||!reviewConsent} onClick={()=>void requestReview()}>طلب مراجعة Llama</button>
   {review&&<><small>مراجعة استشارية لا تثبت صحة الكود أو نجاح الاختبارات</small><pre className="ai-source-view" dir="auto">{review}</pre></>}
   <label><input type="checkbox" checked={approval} disabled={!current||busy||disabled} onChange={e=>setApproval(e.target.checked)}/> راجعت المقارنة وأوافق على تعديل مسودة الملف المحلية</label>
   <button type="button" disabled={!current||!approval||busy||disabled} onClick={()=>{if(current&&approval){onApply(proposal);reset();}}}>تطبيق المقترح على المسودة</button>
   <button type="button" disabled={busy} onClick={reset}>رفض المقترح</button>
  </>}
  <small>لا تُنفّذ اختبارات في هذا القسم. راجع التعديلات وشغّل اختبارات مشروعك الموثوقة قبل اعتمادها.</small>
 </section>
}
