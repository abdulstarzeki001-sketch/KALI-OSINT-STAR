import {useState} from 'react';
import {parseEvidence,evidenceLink} from './engineering-evidence';
export default function EngineeringEvidencePanel({onReport}:{onReport:(r:ReturnType<typeof parseEvidence>|null)=>void}){
 const [report,setReport]=useState<ReturnType<typeof parseEvidence>|null>(null);
 const [error,setError]=useState('');
 async function load(f:File|undefined){
  if(!f)return;
  setReport(null);onReport(null);setError('');
  try{if(f.size>16000)throw Error('Size limit');const next=parseEvidence(await f.text());setReport(next);onReport(next)}
  catch{setError('تم رفض التقرير: صيغة غير صالحة أو نتائج غير متسقة.')}
 }
 return <section className="ai-panel" aria-label="STAR AI Test Evidence">
  <h2>STAR AI — نتائج الاختبارات الهندسية</h2>
  <small>شغّل الاختبارات الثابتة للمستودع عبر GitHub Actions. افتح سجل التشغيل وحمّل artifact باسم star-engineering-evidence، ثم استخرج JSON واستورده هنا. لا تُرسل بيانات الملف إلى أي خادم.</small>
  <a href="https://github.com/abdulstarzeki001-sketch/KALI-OSINT-STAR/actions/workflows/star-ai-quality.yml" target="_blank" rel="noopener noreferrer">فتح اختبارات GitHub Actions</a>
  <label className="ai-upload">استيراد تقرير الاختبار JSON<input type="file" accept=".json,application/json" onChange={e=>{void load(e.target.files?.[0]);e.currentTarget.value=''}}/></label>
  {error&&<p role="alert" className="ai-error">{error}</p>}
  {report&&<article className="ai-panel">
   <p role="status">{report.passed?'النتيجة المبلّغ عنها: نجاح جميع المجموعات':'النتيجة المبلّغ عنها: لم تنجح جميع المجموعات'}</p>
   <small>تقرير مستورد غير موقّع. افحص سجل GitHub وبصمة الالتزام بنفسك؛ الاستيراد لا يؤكد أصالة التقرير.</small>
   {report.commit&&<p dir="ltr">Commit: {report.commit}</p>}
   {evidenceLink(report.runId)&&<a href={evidenceLink(report.runId)!} target="_blank" rel="noopener noreferrer">فتح سجل تشغيل CI المشار إليه</a>}
   {report.suites.map(s=><p key={s.id} dir="ltr">{s.id} · {s.status} · exit={s.exitCode??'—'} · {s.elapsedMs} ms</p>)}
   <small>هذه اختبارات المستودع الثابتة فقط، وليست اختبارات لملف محلي غير ملتزم أو للكود المولد بواسطة النموذج.</small>
  </article>}
 </section>
}
