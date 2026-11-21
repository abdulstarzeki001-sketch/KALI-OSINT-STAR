import {useRef,useState} from 'react';
import {QUALITY_FIXTURE,QUALITY_QUESTION,QUALITY_MODELS,parseReview,parseQualityReport} from './quality-report';
import type {QualityModel} from './quality-report';

type Result = {requested:QualityModel;model:string;analysis:string;elapsed:number};
export default function StarQualityPanel(){
 const lock=useRef(false);
 const [busy,setBusy]=useState(false);
 const [results,setResults]=useState<Result[]>([]);
 const [errors,setErrors]=useState<string[]>([]);
 const [report,setReport]=useState<ReturnType<typeof parseQualityReport>|null>(null);
 const [importError,setImportError]=useState('');
 async function compare(){
  if(lock.current)return;
  lock.current=true;setBusy(true);setResults([]);setErrors([]);
  try{
   for(const requested of QUALITY_MODELS){
    const start=performance.now();
    const controller=new AbortController();
    const timeout=window.setTimeout(()=>controller.abort(),90000);
    try{
     const r=await fetch('/api/ai/analyze',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/json'},signal:controller.signal,body:JSON.stringify({report:QUALITY_FIXTURE,question:QUALITY_QUESTION,model:requested})});
     if(!r.ok||!(r.headers.get('content-type')||'').includes('application/json'))throw new Error('HTTP '+r.status+' — تحقق من الجلسة وموارد النموذج');
     const answer=parseReview(await r.json(),requested);
     setResults(previous=>[...previous,{requested,...answer,elapsed:Math.round(performance.now()-start)}]);
    }catch(e){setErrors(previous=>[...previous,requested+': '+(e instanceof Error?e.message:'فشل الاتصال')]);}
    finally{window.clearTimeout(timeout);}
   }
  }finally{lock.current=false;setBusy(false);}
 }
 async function importReport(file:File|undefined){
  setReport(null);setImportError('');
  if(!file)return;
  try{
   if(file.size>256000)throw new Error('حجم الملف أكبر من الحد');
   setReport(parseQualityReport(await file.text()));
  }catch(e){setImportError(e instanceof Error?e.message:'تعذر قراءة التقرير');}
 }
 return <section className="ai-panel" aria-label="STAR AI Quality">
  <h2>STAR AI — مختبر الجودة والمراجعة</h2>
  <p>مقارنة مستقلة بين Qwen3-Coder 30B وLlama عبر البوابة المصادق عليها. يُرسل تمرين مصطنع فقط لكل نموذج؛ لا تُرسل ملفاتك أو إجابة النموذج الأول إلى الطرف الآخر. قد تُحتسب رسوم الاستدلال المعتادة.</p>
  <details><summary>عرض حالة الاختبار المصطنعة</summary><pre className="ai-source-view" dir="ltr">{QUALITY_FIXTURE}</pre></details>
  <button type="button" disabled={busy} onClick={()=>void compare()}>{busy?'جارٍ المقارنة...':'اختبار النموذجين ومقارنة المراجعة'}</button>
  <p role="status">{results.length} / 2 استجابة مكتملة — لا يعني نجاح الاستجابة صحة التحليل أو تنفيذ اختبارات.</p>
  {errors.map((e,i)=><p key={i} role="alert" className="ai-error">{e}</p>)}
  <div className="ai-grid">{results.map(r=><article className="ai-panel" key={r.requested}><h2 dir="auto">{r.model}</h2><p>{r.elapsed} ms · زمن الطلب من المتصفح، وليس سرعة توليد الرموز</p><pre dir="auto" className="ai-source-view">{r.analysis}</pre></article>)}</div>
  <label className="ai-upload">استيراد تقرير GPU JSON محلياً<input type="file" accept=".json,application/json" onChange={e=>void importReport(e.target.files?.[0])}/></label>
  <small>لا يُرفع الملف إلى أي خادم. التقرير المستورد إفادة غير موقعة وليس دليلاً مستقلاً على التشغيل.</small>
  {importError&&<p className="ai-error" role="alert">{importError}</p>}
  {report&&<div className="ai-result" role="status"><p dir="auto">النموذج: {report.model}</p><p>الزمن: {report.elapsed_seconds} s</p><p>Tokens/s: {report.tokens_per_second??'غير متاح'}</p><p>نتائج الفحص الثابت: {report.findings.length}</p>{report.findings.map((f,i)=><p key={i} dir="ltr">{f.rule} — line {f.line}</p>)}<p>الكود المولّد لم يُنفّذ.</p></div>}
 </section>;
}
