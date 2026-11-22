import {useState} from 'react';
import ModelManagerPanel from './ModelManagerPanel';
import {parseGpuSnapshot} from './gpu-snapshot';
const gib=(n:number|null)=>n===null?'—':(n/1073741824).toFixed(2)+' GiB';
export default function GpuSnapshotPanel(){
 const [report,setReport]=useState<ReturnType<typeof parseGpuSnapshot>|null>(null);
 const [error,setError]=useState('');
 async function load(file:File|undefined){
  if(!file)return;setReport(null);setError('');
  try{if(file.size>64000)throw Error('size');setReport(parseGpuSnapshot(await file.text()))}catch{setError('تقرير غير صالح أو خارج حدود الحجم والقياسات.')}
 }
 return <section className="ai-panel" aria-label="GPU host snapshot">
  <h2>STAR AI — موارد خادم GPU</h2>
  <small>استخرج القياسات على خادم Linux الذي يشغّل Ollama باستخدام الأداة الموجودة في المستودع. لا تحتاج إلى فتح منفذ. هذا التقرير المحلي غير موقّع وليس بثاً حياً؛ قد تكون القياسات قديمة أو على مستوى المضيف وليس الحاوية.</small>
  <pre dir="ltr" className="ai-source-view">python3 scripts/gpu_snapshot.py &gt; star-gpu-snapshot.json</pre>
  <label className="ai-upload">استيراد تقرير GPU JSON<input type="file" accept=".json,application/json" onChange={e=>{void load(e.target.files?.[0]);e.currentTarget.value=''}}/></label>
  {error&&<p role="alert" className="ai-error">{error}</p>}
  {report&&<>
   <p dir="ltr">Captured: {report.capturedAt}</p>
   <p>GPU: {report.gpus===null?'غير متاح':report.gpus.length}</p>
   {report.gpus?.map((g,i)=><article className="ai-panel" key={i}><strong dir="auto">{g.name}</strong><p>الاستخدام: {g.utilization===null?'—':g.utilization+'%'}</p><p>VRAM: {g.usedMiB??'—'} / {g.totalMiB??'—'} MiB</p><p>الحرارة: {g.temperatureC??'—'} °C</p>{g.utilization!==null&&g.utilization>=95&&<small>ملاحظة: استخدام GPU مرتفع عند أخذ العينة (95% أو أكثر)، وليس تشخيصاً للعطل.</small>}</article>)}
   <p>RAM المتاحة / الكلية: {gib(report.ram?.available??null)} / {gib(report.ram?.total??null)}</p>
   <p>CPU: {report.cpuCount??'—'} · Load average: {report.loadAverage?.join(' / ')??'—'}</p>
   <p>مساحة نظام الملفات الحالي المتاحة / الكلية: {gib(report.storage?.available??null)} / {gib(report.storage?.total??null)}</p>
   <p>نماذج Ollama المحملة: {report.models===null?'غير متاح':report.models.length}</p>
   {report.models?.map((m,i)=><p key={i} dir="auto">{m.name} · VRAM {gib(m.vramBytes)}</p>)}
   <small>سرعة التوليد والتكلفة غير متاحتين في هذا التقرير. لا تُستنتجان من استخدام GPU.</small>
   <ModelManagerPanel installed={report.installedModels} loaded={report.models}/>
   <button type="button" onClick={()=>setReport(null)}>إزالة التقرير</button>
  </>}
 </section>
}
