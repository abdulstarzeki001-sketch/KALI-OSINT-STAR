import {useEffect,useRef,useState} from 'react';
import {appendSample,parseUsage,remainingCooldown,summarizePerformance} from './performance-engine';
import type {Sample} from './performance-engine';
import {parseConnection} from './control-center';
import type {ConnectionResult} from './control-center';
const MODELS=['qwen3-coder-vast','llama-cloudflare'] as const;
const labels={'qwen3-coder-vast':'Qwen3-Coder 30B','llama-cloudflare':'Llama 3.3 70B'};
const initial=():Record<typeof MODELS[number],ConnectionResult>=>({'qwen3-coder-vast':{state:'idle'},'llama-cloudflare':{state:'idle'}});
export default function ControlHealthPanel(){
 const [results,setResults]=useState(initial);
 const [busy,setBusy]=useState(false);
 const lock=useRef(false);
 const [checkedAt,setCheckedAt]=useState('');
 const [history,setHistory]=useState<Sample[]>([]);
 const [cooldown,setCooldown]=useState(0);
 const lastStart=useRef<number|null>(null);
 useEffect(()=>{if(!cooldown)return;const timer=window.setInterval(()=>setCooldown(remainingCooldown(performance.now(),lastStart.current)),1000);return ()=>window.clearInterval(timer)},[cooldown>0]);
 async function check(){
  if(lock.current||remainingCooldown(performance.now(),lastStart.current)>0)return;
  lastStart.current=performance.now();setCooldown(remainingCooldown(performance.now(),lastStart.current));lock.current=true;setBusy(true);setResults(initial());
  try{
   for(const model of MODELS){
    setResults(old=>({...old,[model]:{state:'running'}}));
    const start=performance.now();const controller=new AbortController();
    const timer=window.setTimeout(()=>controller.abort(),90000);
    let status:Sample['status']='failed';let usage:Sample['usage']=null;
    try{
     const response=await fetch('/api/ai/analyze',{method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({model,report:'SYNTHETIC connectivity test only. A sample Python function adds two numbers. No source files, credentials or real targets.',question:'Explain in one short sentence how to verify a simple addition function with a unit test. Never claim execution.'})});
     if(response.status===429)status='rate-limited';
     if(!response.ok||!(response.headers.get('content-type')||'').includes('application/json'))throw Error('HTTP '+response.status);
     const data=await response.json();
     const result=parseConnection(data,model,performance.now()-start);
     status='responded';usage=parseUsage(data.usage);
     setResults(old=>({...old,[model]:result}));
    }catch(e){if(controller.signal.aborted)status='timeout';setResults(old=>({...old,[model]:{state:'failed',detail:e instanceof Error?e.message:'تعذر التحقق'}}))}
    finally{window.clearTimeout(timer);const elapsedMs=performance.now()-start;setHistory(old=>appendSample(old,{model,status,usage,elapsedMs:Math.min(elapsedMs,300000)}))}
   }
   setCheckedAt(new Date().toISOString());
  }finally{lock.current=false;setBusy(false)}
 }
 return <section className="ai-panel" aria-label="Model connectivity">
  <h2>حالة الخدمات والنماذج</h2>
  <small>الفحص يرسل طلب استدلال مصطنع لكل نموذج من جلستك الحالية عند الضغط فقط؛ قد تُحتسب رسوم الاستدلال. الاستجابة لا تثبت صحة التحليل أو سلامة جميع خدمات الخادم.</small>
  <div className="ai-grid">{MODELS.map(model=>{const r=results[model];return <article className="ai-panel" key={model}><strong>{labels[model]}</strong><p role="status">{r.state==='idle'?'لم يُختبر':r.state==='running'?'جارٍ الفحص':r.state==='responded'?'استجابة مكتملة':'لم يتحقق الاتصال'}</p>{r.elapsedMs!==undefined&&<p>{r.elapsedMs} ms · زمن الطلب</p>}{r.detail&&<p className="ai-error">{r.detail}</p>}</article>})}</div>
  <button type="button" disabled={busy||cooldown>0} onClick={()=>void check()}>{busy?'جارٍ الفحص':cooldown>0?'إعادة الفحص بعد '+Math.ceil(cooldown/1000)+' ثانية':'اختبار اتصال النموذجين الآن'}</button>
  <div className="ai-panel"><h3>أداء فحوصات هذه الجلسة</h3><small>آخر 40 طلب اتصال مصطنع فقط. P50 وP95 لزمن الطلبات المكتملة، وليس سرعة GPU. لا تحفظ النصوص أو المفاتيح.</small>{MODELS.map(model=>{const m=summarizePerformance(history,model);return <article key={model}><strong>{labels[model]}</strong><p>الطلبات: {m.requests} · المكتملة: {m.responded} · غير المكتملة: {m.failed} · 429: {m.rateLimited}</p><p dir="ltr">P50: {m.p50??'—'} ms · P95: {m.p95??'—'} ms</p><p>الرموز المبلّغ عنها: {m.totalTokens??'غير متاحة'} ({m.usageSamples}/{m.responded} استجابة مكتملة)</p></article>})}<button type="button" disabled={busy} onClick={()=>setHistory([])}>مسح سجل الأداء المؤقت</button><small>لا تُحتسب تكلفة أو استهلاك GPU دون بيانات موثوقة من المزود.</small></div>
  {checkedAt&&<small dir="ltr">Last check: {checkedAt}</small>}
  <div className="ai-control-links"><a href="https://railway.com/project/9fdb180f-dd25-413a-9681-f3d37f08b159" target="_blank" rel="noopener noreferrer">إدارة Railway</a><a href="https://github.com/abdulstarzeki001-sketch/KALI-OSINT-STAR/actions" target="_blank" rel="noopener noreferrer">سجل GitHub Actions</a></div>
  <small>حالة البنية التحتية تُراجع من لوحات الإدارة؛ لا يتم افتراض أنها متصلة من نتيجة النموذج وحدها.</small>
 </section>
}
