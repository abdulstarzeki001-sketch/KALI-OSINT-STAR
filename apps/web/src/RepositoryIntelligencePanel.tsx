import {useRef,useState} from 'react';
import {analyzeManifest,MAX_MANIFEST_SIZE} from './repository-intelligence';
import type {ManifestKind} from './repository-intelligence';
type Result={file:ManifestKind;report:ReturnType<typeof analyzeManifest>};
const allowed=['package.json','requirements.txt','requirements-dev.txt'];
export default function RepositoryIntelligencePanel(){
 const [results,setResults]=useState<Result[]>([]);
 const [errors,setErrors]=useState<string[]>([]);
 const [busy,setBusy]=useState(false);
 const lock=useRef(false);
 async function inspect(files:FileList|null){
  if(!files||lock.current)return;
  const selected=Array.from(files);
  setErrors([]);setResults([]);
  if(selected.length>12){setErrors(['الحد الأقصى 12 ملفاً لكل فحص.']);return}
  lock.current=true;setBusy(true);
  try{
   const next:Result[]=[];const failed:string[]=[];
   for(const f of selected){
    if(!allowed.includes(f.name)||f.size>MAX_MANIFEST_SIZE){failed.push('تم رفض ملف غير مدعوم أو كبير الحجم.');continue}
    try{const file=f.name as ManifestKind;next.push({file,report:analyzeManifest(file,await f.text())})}
    catch{failed.push(f.name+': صيغة غير صالحة أو تجاوز حد التحليل.')}
   }
   setResults(next);setErrors(failed);
  }finally{lock.current=false;setBusy(false)}
 }
 function download(){
  const data={schema:1,source:'local-manifest-inspection',createdAt:new Date().toISOString(),results};
  const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=u;a.download='star-repository-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
 }
 return <section className="ai-panel" aria-label="STAR AI Repository Intelligence">
  <h2>STAR AI — تحليل تبعيات المشروع</h2>
  <small>اختر ملفات package.json أو requirements.txt أو requirements-dev.txt من مشروع تملكه. التحليل يتم محلياً دون إرسالها أو تثبيت التبعيات أو تشغيل أي سكربت. لا يجري فحص CVE ولا يتحقق من المستودع عن بعد.</small>
  <label className="ai-upload">{busy?'جارٍ التحليل...':'اختيار ملفات التبعيات'}<input type="file" multiple accept=".json,.txt" disabled={busy} onChange={e=>{void inspect(e.target.files);e.currentTarget.value=''}}/></label>
  {errors.map((error,i)=><p role="alert" key={i} className="ai-error">{error}</p>)}
  <p role="status">{results.length} ملف محلل محلياً</p>
  {results.map(({file,report},i)=><article key={i} className="ai-panel">
   <h3 dir="ltr">{file}</h3>
   <p>التبعيات: {report.counts.total} · إصدارات محددة: {report.counts.exact} · غير محددة بدقة: {report.counts.nonExact}</p>
   <p>عدد السكربتات المعلنة: {report.counts.scripts}</p>
   {report.findings.map((f,j)=><p key={j} dir="auto">{f.priority} · {f.code}{f.line?' · line '+f.line:''} — {f.message}</p>)}
   <details><summary>عرض جرد التبعيات</summary>{report.dependencies.map((d,j)=><p key={j} dir="ltr">{d.name} · {d.kind} · {d.pinned?'exact':'non-exact'}</p>)}</details>
   <small>عدم وجود تنبيه لا يعني خلو المشروع من الثغرات.</small>
  </article>)}
  {results.length>0&&<button type="button" onClick={download}>تصدير تقرير التبعيات JSON</button>}
 </section>
}
