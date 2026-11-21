import {useRef,useState} from 'react';
import {diagnoseLog,MAX_DEBUG_LOG} from './intelligent-debugger';
type Report=ReturnType<typeof diagnoseLog>;
export default function IntelligentDebuggerPanel({onReport}:{onReport:(text:string)=>void}){
 const [text,setText]=useState('');
 const [report,setReport]=useState<Report|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const lock=useRef(false);
 function inspect(){
  setReport(null);setError('');
  try{setReport(diagnoseLog(text))}catch{setError('السجل فارغ أو غير صالح أو يتجاوز 96 KB / 3000 سطر.')}
 }
 async function load(f:File|undefined){
  if(!f||lock.current)return;
  lock.current=true;setBusy(true);setError('');setReport(null);
  try{
   if(f.size>MAX_DEBUG_LOG)throw Error('size');
   const value=new TextDecoder('utf-8',{fatal:true}).decode(await f.arrayBuffer());
   const result=diagnoseLog(value);setText(value);setReport(result);
  }catch{setError('تعذر تحليل الملف. اختر سجلاً نصياً UTF-8 ضمن الحدود.')}
  finally{lock.current=false;setBusy(false)}
 }
 function exportResult(){
  if(!report)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='star-debugger-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <section className="ai-panel" aria-label="STAR AI Intelligent Debugger">
  <h2>STAR AI — تشخيص أخطاء البناء والبرمجة</h2>
  <small>تحليل محلي لأنماط أخطاء Python وNode وTypeScript وVite وبيئة التشغيل. لا يُرسل السجل الخام ولا يُنفّذ الكود. تجنب إدخال الأسرار والبيانات الحساسة.</small>
  <label>سجل الأخطاء<textarea dir="ltr" rows={8} spellCheck={false} maxLength={MAX_DEBUG_LOG} disabled={busy} value={text} onChange={e=>{setText(e.target.value);setReport(null);setError('')}} placeholder="Paste compiler or test output"/></label>
  <label className="ai-upload">استيراد سجل TXT / LOG<input type="file" accept=".txt,.log,text/plain" disabled={busy} onChange={e=>{void load(e.target.files?.[0]);e.currentTarget.value=''}}/></label>
  <button type="button" disabled={busy||!text.trim()} onClick={inspect}>تشخيص السجل محلياً</button>
  <button type="button" disabled={busy} onClick={()=>{setText('');setReport(null);setError('')}}>مسح السجل</button>
  {error&&<p role="alert" className="ai-error">{error}</p>}
  {report&&<div className="ai-panel">
   <p role="status">{report.linesAnalyzed} سطر · {report.findings.length} أنواع تشخيص</p>
   {!report.findings.length&&<p>لم تُطابق القواعد الحالية. هذا لا يثبت نجاح البناء أو خلو المشروع من الأخطاء.</p>}
   {report.findings.map(f=><article key={f.id} className="ai-panel"><strong dir="ltr">{f.family} · {f.id}</strong><p>التصنيف: {f.priority==='error'?'نمط خطأ':'ملاحظة'} · {f.count} مطابقة</p><p dir="ltr">Log lines: {f.lines.join(', ')}</p><p>{f.advice}</p><a href={f.reference} target="_blank" rel="noopener noreferrer">التوثيق المرجعي</a></article>)}
   <small>أرقام الأسطر تشير إلى مواضع في السجل وليس بالضرورة في ملف المصدر. لا يؤكد هذا السبب الجذري ولا نجاح أي اختبار.</small>
   <button type="button" onClick={exportResult}>تنزيل تقرير التشخيص JSON</button>
   <button type="button" onClick={()=>onReport(JSON.stringify(report,null,2))}>نقل ملخص التشخيص إلى نموذج التحليل الذكي</button>
   <small>ينقل التصنيفات والإرشادات الثابتة فقط إلى حقل التحليل. لا يرسل الطلب تلقائياً ولا ينقل نص السجل.</small>
  </div>}
 </section>
}
