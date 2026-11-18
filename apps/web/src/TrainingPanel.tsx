import React,{useCallback,useEffect,useMemo,useState} from 'react';
import './training.css';

export type TrainingSummary={
  schema:number;completed:number;total:number;percent:number;
  weeks:{id:string;verified:boolean;verifiedAt:string|null;attempts:number;lastScore:number}[];
};
type Lab={
  id:string;title:string;mode:'live'|'fixture';objective:string;command:string;
  source:string;evidence:string|null;fields:{key:'a'|'b';label:string}[];
};
type TrainingPayload={summary:TrainingSummary;labs:Lab[]};
type Grade={
  week:string;passed:boolean;score:number;
  checks:{key:string;passed:boolean}[];mode:string;verifiedAt:string|null;
  summary:TrainingSummary;
};
type Props={
  onProgress:(summary:TrainingSummary)=>void;
  onOpenTerminal:()=>void;
};

const BASE='/api/terminal/training';
const errorLabels:Record<string,string>={
  ACCESS_REQUIRED:'تسجيل الدخول مطلوب عبر Cloudflare Access.',
  TRAINING_EDGE_UNAVAILABLE:'ربط Railway الخاص بالاختبارات غير جاهز.',
  TRAINING_UPSTREAM_UNAVAILABLE:'خادم التصحيح غير متاح. لا تُحتسب أي نتيجة.',
  TRAINING_RUNTIME_NOT_READY:'بيئة STAR KALI لم تجتز فحص الصحة الحقيقي بعد.',
  TRAINING_RATE_LIMIT:'بلغت الحد اليومي للمحاولات. لا توجد نتيجة جديدة.',
  TRAINING_INPUT_TOO_LARGE:'المدخل أكبر من المسموح.',
  TRAINING_INVALID_ANSWERS:'أدخل إجابتين قصيرتين وصحيحتَي التنسيق.',
  TRAINING_STATE_UNAVAILABLE:'تعذر قراءة سجل الإنجاز الدائم.',
  TRAINING_CHECK_UNAVAILABLE:'تعذر تصحيح التمرين حالياً.',
};
async function post<T>(route:string,body?:unknown):Promise<T>{
  const response=await fetch(BASE+'/'+route,{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Accept':'application/json','Content-Type':'application/json'},
    body:JSON.stringify(body??{})
  });
  const result:unknown=await response.json().catch(()=>null);
  if(!result||typeof result!=='object'){
    throw Error('استجابة غير صالحة. تحقق من جلسة Cloudflare Access.');
  }
  const data=result as Record<string,unknown>;
  if(!response.ok){
    const code=String(data.code||'TRAINING_UPSTREAM_UNAVAILABLE');
    throw Error(errorLabels[code]||code+' (HTTP '+response.status+')');
  }
  return result as T;
}
export function TrainingPanel({onProgress,onOpenTerminal}:Props){
  const [payload,setPayload]=useState<TrainingPayload|null>(null);
  const [selected,setSelected]=useState('W01');
  const [answers,setAnswers]=useState({a:'',b:''});
  const [loading,setLoading]=useState(true);
  const [checking,setChecking]=useState(false);
  const [feedback,setFeedback]=useState<Grade|null>(null);
  const [error,setError]=useState('');
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const result=await post<TrainingPayload>('status');
      if(!Array.isArray(result.labs)||!result.summary?.weeks)
        throw Error('بيانات التدريب غير مكتملة.');
      setPayload(result);
      onProgress(result.summary);
      setError('');
    }catch(e){setError(e instanceof Error?e.message:'فشل تحميل التدريب');}
    finally{setLoading(false);}
  },[onProgress]);
  useEffect(()=>{void refresh();},[refresh]);
  const lab=useMemo(()=>payload?.labs.find(x=>x.id===selected)||payload?.labs[0]||null,[payload,selected]);
  const progress=payload?.summary;
  const selectedProgress=progress?.weeks.find(w=>w.id===lab?.id);
  async function submit(event:React.FormEvent){
    event.preventDefault();if(!lab||checking||!answers.a.trim()||!answers.b.trim())return;
    setChecking(true);setError('');setFeedback(null);
    try{
      const result=await post<Grade>('verify',{week:lab.id,answers});
      setFeedback(result);
      setPayload(previous=>previous?{...previous,summary:result.summary}:previous);
      onProgress(result.summary);
    }catch(e){setError(e instanceof Error?e.message:'فشل التحقق');}
    finally{setChecking(false);}
  }
  function choose(id:string){setSelected(id);setAnswers({a:'',b:''});setFeedback(null);setError('');}
  function exportEvidence(){
    if(!progress)return;
    const lines=[
      '# STAR Cyber Training — Verified Progress',
      'Generated: '+new Date().toISOString(),
      'Source: Railway server-graded progress, not browser checkbox state',
      'Verified weeks: '+progress.completed+'/'+progress.total,
      'Percent: '+progress.percent+'%',
      '',
      ...progress.weeks.map(w=>w.id+': '+(w.verified?'VERIFIED '+w.verifiedAt:'NOT VERIFIED')+
        ' | attempts='+w.attempts+' | lastScore='+w.lastScore),
      '',
      'W01 uses real Linux runtime + STAR KALI health.',
      'W02-W08 use isolated synthetic log/fixture analysis, not real AD/Windows deployment.',
      'This is a training progress record, not a penetration-test certificate.'
    ];
    const data=new Blob([lines.join('\n')],{type:'text/markdown;charset=utf-8'});
    const url=URL.createObjectURL(data);const a=document.createElement('a');
    a.href=url;a.download='star-training-verified.md';document.body.appendChild(a);a.click();
    a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className="star-training" aria-label="التدريب العملي الموثق">
    <header className="star-training-head">
      <div><span className="eyebrow">VERIFIED TRAINING / RAILWAY</span>
        <h1>مختبر التدريب <em>القابل للتحقق</em></h1>
        <p>ماكو علامة «مكتمل» يدوياً. الخادم يصحح إجابتين لكل أسبوع، ويحفظ النجاح في وحدة تخزين Railway الدائمة.</p>
      </div>
      <div className="star-training-score" aria-live="polite">
        <strong>{progress?progress.percent+'%':'—'}</strong><span>{progress?progress.completed+'/8 أسابيع موثقة':'غير متحقق'}</span>
      </div>
    </header>
    <div className="star-training-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={progress?.percent??0} aria-label="نسبة التدريب الموثق">
      <span style={{width:(progress?.percent||0)+'%'}}/>
    </div>
    <div className="star-training-actions">
      <button type="button" onClick={()=>void refresh()} disabled={loading}>{loading?'جارٍ التحديث':'تحديث من الخادم'}</button>
      <button type="button" onClick={onOpenTerminal}>▣ فتح الترمنال الحقيقي</button>
      <button type="button" onClick={exportEvidence} disabled={!progress}>↓ تقرير موثّق</button>
    </div>
    <p className="star-training-notice">W01 فحص فعلي لنظام Railway. أما W02–W08 فهي مختبرات أدلة صناعية معزولة، تُحلّل داخل الترمنال ويصححها الخادم. هذه ليست شهادة بإتقان أدوات هجومية أو اختبار اختراق فعلي.</p>
    {error&&<div role="alert" className="star-training-error">{error}</div>}
    {loading&&!payload&&<p role="status">جارٍ قراءة نتائج Railway...</p>}
    {payload&&<div className="star-training-layout">
      <nav className="star-training-weeks" aria-label="اختر أسبوع التدريب">
        {payload.labs.map(item=>{
          const state=progress?.weeks.find(w=>w.id===item.id);
          return <button key={item.id} type="button" aria-current={lab?.id===item.id?'step':undefined}
            className={'star-training-week '+(lab?.id===item.id?'active ':'')+(state?.verified?'verified':'')}
            onClick={()=>choose(item.id)}>
            <span>{item.id}</span><strong>{item.title}</strong>
            <small>{state?.verified?'✓ موثّق':state?.attempts?'محاولات '+state.attempts:'لم يبدأ'}</small>
          </button>;
        })}
      </nav>
      {lab&&<article className="star-training-exercise">
        <div className="star-training-exercise-title"><div><span className="eyebrow">{lab.id} / {lab.mode==='live'?'LIVE RAILWAY':'ISOLATED CASE'}</span>
          <h2>{lab.title}</h2></div><span className={'star-training-mode '+lab.mode}>
            {lab.mode==='live'?'بيئة حقيقية':'ملف تدريبي'}</span></div>
        <p>{lab.objective}</p>
        {selectedProgress?.verified&&<div className="star-training-verified">✓ تم التحقق من هذا الأسبوع على الخادم بتاريخ {new Date(selectedProgress.verifiedAt!).toLocaleString('ar-IQ')}</div>}
        <div className="star-training-command"><span>افحص باستخدام الترمنال:</span><code dir="ltr">{lab.command}</code>
          <button type="button" onClick={()=>navigator.clipboard?.writeText(lab.command)} title="نسخ الأمر">نسخ</button></div>
        {lab.evidence&&<details className="star-training-evidence"><summary>عرض ملف الأدلة التدريبية هنا</summary><pre dir="ltr">{lab.evidence}</pre></details>}
        <form className="star-training-form" onSubmit={submit}>
          <h3>التحقق العملي — نتيجتان مطلوبتان</h3>
          {lab.fields.map(field=><label key={field.key}>{field.label}<input
            value={answers[field.key]} maxLength={120} autoComplete="off" spellCheck={false}
            onChange={e=>{setAnswers(prev=>({...prev,[field.key]:e.target.value}));setFeedback(null);}}
            placeholder="اكتب النتيجة بعد قراءة المخرجات" dir="ltr" /></label>)}
          <button type="submit" className="primary" disabled={checking||!answers.a.trim()||!answers.b.trim()}>
            {checking?'جارٍ التصحيح في Railway...':'تحقق واحفظ النتيجة'}
          </button>
        </form>
        {feedback&&<div className={'star-training-result '+(feedback.passed?'passed':'failed')} role="status">
          <strong>{feedback.passed?'✓ نجاح موثّق من الخادم':'نتيجة التحقق: '+feedback.score+'/100'}</strong>
          <span>الإجابة الأولى: {feedback.checks[0]?.passed?'صحيحة':'غير صحيحة'} · الثانية: {feedback.checks[1]?.passed?'صحيحة':'غير صحيحة'}</span>
          {!feedback.passed&&<small>راجع الملف أو أوامر الترمنال، ثم أعد المحاولة. لا يتم احتساب الأسبوع حتى تنجح الإجابتان.</small>}
        </div>}
      </article>}
    </div>}
  </section>;
}
