import {useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import SafeMarkdown from './SafeMarkdown';
import './cyber-ai.css';

type Kind='code'|'config'|'headers'|'logs'|'report';
type Finding={id:string;severity:string;line:number;recommendation:string; evidence:string};
type Audit={kind:string;lines_analyzed:number;findings:Finding[];counts:Record<string,number>;limitation:string};
type Review={analysis:string;model:string;local_audit:Audit;notice:string};
type ApiError={error?:string|{code?:string;message?:string}};
const KINDS:{id:Kind;label:string}[]=[
  {id:'code',label:'شيفرة برمجية'}, {id:'config',label:'إعدادات أمنية'},
  {id:'headers',label:'HTTP Headers'}, {id:'logs',label:'سجلات النظام'},
  {id:'report',label:'تقرير فحص'}
];
async function invoke(action:string,payload:Record<string,unknown>={}) {
  const res=await fetch('/api/ai/cyber',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({action,...payload})
  });
  const data=await res.json() as Record<string,unknown>&ApiError;
  if(!res.ok){
    const message=typeof data.error==='string'?data.error:data.error?.code||'Request failed';
    throw Error(message+' (HTTP '+res.status+')');
  }
  return data;
}
export default function CyberAIPanel(){
  const [kind,setKind]=useState<Kind>('code');
  const [artifact,setArtifact]=useState('');
  const [question,setQuestion]=useState('');
  const [models,setModels]=useState<string[]>([]);
  const [model,setModel]=useState('');
  const [audit,setAudit]=useState<Audit|null>(null);
  const [review,setReview]=useState<Review|null>(null);
  const [error,setError]=useState('');
  const [availability,setAvailability]=useState('جاري فحص الاتصال المحمي...');
  const [running,setRunning]=useState<'audit'|'review'|null>(null);
  useEffect(()=>{
    let alive=true;
    invoke('models').then(data=>{
      if(!alive)return;
      const ids=Array.isArray(data.data)?data.data.map(x=>typeof x?.id==='string'?x.id:'').filter(Boolean):[];
      setModels(ids);setModel(ids[0]||'');
      setAvailability(ids.length?'تتوفر نماذج AI مهيأة للاستخدام':'لا توجد نماذج API مهيأة حالياً. التدقيق المحلي مستقل عن النموذج.');
    }).catch(err=>{if(alive)setAvailability('خدمة Gateway غير مهيأة أو لا يمكن الوصول إليها: '+String(err.message));});
    return ()=>{alive=false;};
  },[]);
  async function execute(action:'audit'|'review',event:FormEvent){
    event.preventDefault();
    if(running)return;
    setRunning(action);setError('');
    if(action==='review')setReview(null);else setAudit(null);
    try{
      const data=await invoke(action,{kind,artifact, ...(action==='review'?{model,question}:{})});
      if(action==='audit')setAudit(data as unknown as Audit);
      else {const result=data as unknown as Review;setReview(result);setAudit(result.local_audit);}
    }catch(err){setError(err instanceof Error?err.message:'فشل طلب التدقيق');}
    finally{setRunning(null);}
  }
  return <section className="cyber-ai-page page-animate" dir="rtl">
    <header className="cyber-heading">
      <span className="eyebrow">STAR AI / AUTHORIZED SECURITY REVIEW</span>
      <h1>المحلل السيبراني <span>STAR AI Cyber</span></h1>
      <p>مراجعة أكواد وتكوينات وسجلات وأنظمة حماية بناءً على الأدلة التي تزودنا بها، بدون إجراء مسح على أي هدف أو تشغيل أوامر غير مصرح بها.</p>
    </header>
    <div className="cyber-notice" role="status">{availability}</div>
    <div className="cyber-grid">
      <form className="cyber-pane" onSubmit={e=>void execute('audit',e)}>
        <h2>01 — البيانات المراد تدقيقها</h2>
        <label htmlFor="cyber-kind">نوع البيانات</label>
        <select id="cyber-kind" value={kind} onChange={e=>setKind(e.target.value as Kind)}>
          {KINDS.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <label htmlFor="cyber-artifact">الكود / السجل / التقرير</label>
        <textarea id="cyber-artifact" dir="auto" rows={13} maxLength={16000}
          value={artifact} onChange={e=>setArtifact(e.target.value)}
          placeholder="الصق ملفاً أو مقتطفاً من مشروع تملكه. احذف المفاتيح وكلمات المرور والبيانات الشخصية أولاً."/>
        <div className="cyber-meta">{artifact.length} / 16000 حرف</div>
        <button className="cyber-main-btn" type="submit" disabled={!!running||artifact.trim().length<3}>
          {running==='audit'?'جارٍ التدقيق...':'فحص الأنماط الأمنية'}
        </button>
        <label htmlFor="cyber-model">النموذج السحابي للمراجعة</label>
        <select id="cyber-model" value={model} onChange={e=>setModel(e.target.value)} disabled={!models.length}>
          {models.length?models.map(x=><option key={x} value={x}>{x}</option>):<option value="">لا يوجد نموذج مهيأ</option>}
        </select>
        <label htmlFor="cyber-question">سؤال أو تعليمات التحليل</label>
        <input id="cyber-question" value={question} maxLength={500} onChange={e=>setQuestion(e.target.value)}
          placeholder="رتّب المخاطر وأعطني توصيات إصلاح" />
        <button type="button" className="cyber-secondary-btn"
          disabled={!!running||!model||artifact.trim().length<3}
          onClick={e=>void execute('review',e as unknown as FormEvent)}>
          {running==='review'?'جارٍ استدعاء النموذج...':'مراجعة معمقة بواسطة AI'}
        </button>
        <p className="cyber-disclaimer">تنبيه: التدقيق النصي لا يثبت وجود ثغرة. قد يُرسل النص إلى مزوّد AI عند استخدام المراجعة المعمقة؛ لا تُرسل أسراراً أو بيانات حساسة.</p>
      </form>
      <div className="cyber-pane cyber-results" aria-live="polite">
        <h2>02 — النتائج والأدلة</h2>
        {error&&<p role="alert" className="cyber-error">{error}</p>}
        {audit?<div className="cyber-audit">
          <div className="cyber-audit-summary">
            <strong>{audit.findings?.length||0} مؤشرات تحتاج مراجعة</strong>
            <span>{audit.lines_analyzed} أسطر محللة</span>
          </div>
          {audit.findings?.length?audit.findings.map((f,i)=><article className="cyber-finding" key={f.id+'-'+f.line+'-'+i}>
            <div><strong dir="ltr">{f.id}</strong><span>{f.severity} · السطر {f.line}</span></div>
            <p>{f.recommendation}</p>
          </article>):<p className="cyber-empty">لم تطابق البيانات قواعد التدقيق المحدودة. هذا لا يعني خلوها من الثغرات.</p>}
          <small>{audit.limitation}</small>
        </div>:<div className="cyber-empty">نتائج التدقيق تظهر هنا بعد إرسال نص فعلي. لا توجد نتائج وهمية.</div>}
        {review?.analysis&&<div className="cyber-review">
          <h3>مراجعة نموذج {review.model}</h3>
          <SafeMarkdown source={review.analysis}/>
          <small>{review.notice}</small>
        </div>}
      </div>
    </div>
  </section>;
}
