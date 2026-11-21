import {useRef,useState} from 'react';
import ProjectWorkspacePanel from './ProjectWorkspacePanel';
import RepositoryIntelligencePanel from './RepositoryIntelligencePanel';
import EngineeringMemoryPanel,{loadEngineeringMemory} from './EngineeringMemoryPanel';
import {appendRun,STORAGE_KEY} from './engineering-memory';
import type {Memory,ModelId} from './engineering-memory';
import {QUALITY_FIXTURE,QUALITY_QUESTION,QUALITY_MODELS,parseReview,parseQualityReport} from './quality-report';
import type {QualityModel} from './quality-report';
import {benchmarkPrompt,BENCHMARK_INSTRUCTION,gradeBenchmark} from './verified-benchmark';

type Result = {requested:QualityModel;model:string;analysis:string;elapsed:number;grade?:ReturnType<typeof gradeBenchmark>};
export default function StarQualityPanel(){
 const lock=useRef(false);
 const [memory,setMemory]=useState(loadEngineeringMemory);
 const memoryRef=useRef(memory);
 const [remember,setRemember]=useState(false);
 const [storageError,setStorageError]=useState(false);
 function updateMemory(next:Memory){
  memoryRef.current=next;setMemory(next);
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(next));setStorageError(false)}catch{setStorageError(true)}
 }
 const [busy,setBusy]=useState(false);
 const [results,setResults]=useState<Result[]>([]);
 const [errors,setErrors]=useState<string[]>([]);
 const [report,setReport]=useState<ReturnType<typeof parseQualityReport>|null>(null);
 const [importError,setImportError]=useState('');
 async function compare(verified=false){
  if(lock.current)return;
  lock.current=true;setBusy(true);setResults([]);setErrors([]);
  try{
   for(const requested of QUALITY_MODELS){
    const start=performance.now();
    const controller=new AbortController();
    const timeout=window.setTimeout(()=>controller.abort(),90000);
    try{
     const r=await fetch('/api/ai/analyze',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/json'},signal:controller.signal,body:JSON.stringify({report:verified?benchmarkPrompt():QUALITY_FIXTURE,question:verified?BENCHMARK_INSTRUCTION:QUALITY_QUESTION,model:requested})});
     if(!r.ok||!(r.headers.get('content-type')||'').includes('application/json'))throw new Error('HTTP '+r.status+' — تحقق من الجلسة وموارد النموذج');
     const answer=parseReview(await r.json(),requested);
     const elapsed=Math.round(performance.now()-start);
     const grade=verified?gradeBenchmark(answer.analysis):undefined;
     setResults(previous=>[...previous,{requested,...answer,elapsed,grade}]);
     if(grade&&remember)updateMemory(appendRun(memoryRef.current,{model:answer.model as ModelId,at:new Date().toISOString(),ms:elapsed,version:grade.version,correct:grade.correct,total:5,complete:grade.complete}));
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
  <label><input type="checkbox" disabled={busy} checked={remember} onChange={e=>setRemember(e.target.checked)}/> حفظ نتائج التقييم في سجل هذا المتصفح</label>
  <button type="button" disabled={busy} onClick={()=>void compare(true)}>اختبار التوافق المرجعي — 5 أسئلة لكل نموذج</button>
  <small>الدرجة تخص هذه المجموعة الثابتة فقط. لا تثبت جودة النموذج العامة؛ الإجابات الغامضة أو المكررة غير قابلة للتقييم.</small>
  <p role="status">{results.length} / 2 استجابة مكتملة — لا يعني نجاح الاستجابة صحة التحليل أو تنفيذ اختبارات.</p>
  {errors.map((e,i)=><p key={i} role="alert" className="ai-error">{e}</p>)}
  <div className="ai-grid">{results.map(r=><article className="ai-panel" key={r.requested}><h2 dir="auto">{r.model}</h2><p>{r.elapsed} ms · زمن الطلب من المتصفح، وليس سرعة توليد الرموز</p>{r.grade&&<div role="status"><h3>{r.grade.correct} / {r.grade.total} إجابات صحيحة</h3><p>{r.grade.complete?"التقييم مكتمل":"بعض الإجابات غير قابلة للتقييم"} · {r.grade.version}</p>{r.grade.details.map(d=><p key={d.id} dir="auto">{d.question} — {d.status==="correct"?"صحيح":d.status==="incorrect"?"خطأ":"غير قابل للتقييم"} ({d.answer??"—"} / {d.expected}) {d.reference&&<a href={d.reference} target="_blank" rel="noopener noreferrer">مرجع</a>}</p>)}</div>}<pre dir="auto" className="ai-source-view">{r.analysis}</pre></article>)}</div>
  <label className="ai-upload">استيراد تقرير GPU JSON محلياً<input type="file" accept=".json,application/json" onChange={e=>void importReport(e.target.files?.[0])}/></label>
  <small>لا يُرفع الملف إلى أي خادم. التقرير المستورد إفادة غير موقعة وليس دليلاً مستقلاً على التشغيل.</small>
  {importError&&<p className="ai-error" role="alert">{importError}</p>}
  {report&&<div className="ai-result" role="status"><p dir="auto">النموذج: {report.model}</p><p>الزمن: {report.elapsed_seconds} s</p><p>Tokens/s: {report.tokens_per_second??'غير متاح'}</p><p>نتائج الفحص الثابت: {report.findings.length}</p>{report.findings.map((f,i)=><p key={i} dir="ltr">{f.rule} — line {f.line}</p>)}<p>الكود المولّد لم يُنفّذ.</p></div>}
  <ProjectWorkspacePanel/>
  <RepositoryIntelligencePanel/>
  <EngineeringMemoryPanel memory={memory} onChange={updateMemory} storageError={storageError}/>
 </section>;
}
