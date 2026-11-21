import {useRef,useState} from 'react';
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
 async function check(){
  if(lock.current)return;lock.current=true;setBusy(true);setResults(initial());
  try{
   for(const model of MODELS){
    setResults(old=>({...old,[model]:{state:'running'}}));
    const start=performance.now();const controller=new AbortController();
    const timer=window.setTimeout(()=>controller.abort(),90000);
    try{
     const response=await fetch('/api/ai/analyze',{method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({model,report:'SYNTHETIC connectivity test only. A sample Python function adds two numbers. No source files, credentials or real targets.',question:'Explain in one short sentence how to verify a simple addition function with a unit test. Never claim execution.'})});
     if(!response.ok||!(response.headers.get('content-type')||'').includes('application/json'))throw Error('HTTP '+response.status);
     const result=parseConnection(await response.json(),model,performance.now()-start);
     setResults(old=>({...old,[model]:result}));
    }catch(e){setResults(old=>({...old,[model]:{state:'failed',detail:e instanceof Error?e.message:'تعذر التحقق'}}))}
    finally{window.clearTimeout(timer)}
   }
   setCheckedAt(new Date().toISOString());
  }finally{lock.current=false;setBusy(false)}
 }
 return <section className="ai-panel" aria-label="Model connectivity">
  <h2>حالة الخدمات والنماذج</h2>
  <small>الفحص يرسل طلب استدلال مصطنع لكل نموذج من جلستك الحالية عند الضغط فقط؛ قد تُحتسب رسوم الاستدلال. الاستجابة لا تثبت صحة التحليل أو سلامة جميع خدمات الخادم.</small>
  <div className="ai-grid">{MODELS.map(model=>{const r=results[model];return <article className="ai-panel" key={model}><strong>{labels[model]}</strong><p role="status">{r.state==='idle'?'لم يُختبر':r.state==='running'?'جارٍ الفحص':r.state==='responded'?'استجابة مكتملة':'لم يتحقق الاتصال'}</p>{r.elapsedMs!==undefined&&<p>{r.elapsedMs} ms · زمن الطلب</p>}{r.detail&&<p className="ai-error">{r.detail}</p>}</article>})}</div>
  <button type="button" disabled={busy} onClick={()=>void check()}>اختبار اتصال النموذجين الآن</button>
  {checkedAt&&<small dir="ltr">Last check: {checkedAt}</small>}
  <div className="ai-control-links"><a href="https://railway.com/project/9fdb180f-dd25-413a-9681-f3d37f08b159" target="_blank" rel="noopener noreferrer">إدارة Railway</a><a href="https://github.com/abdulstarzeki001-sketch/KALI-OSINT-STAR/actions" target="_blank" rel="noopener noreferrer">سجل GitHub Actions</a></div>
  <small>حالة البنية التحتية تُراجع من لوحات الإدارة؛ لا يتم افتراض أنها متصلة من نتيجة النموذج وحدها.</small>
 </section>
}
