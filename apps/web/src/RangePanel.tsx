import {useCallback, useEffect, useState} from 'react';
import './range.css';

type Solve = {challenge:string;solved_at:string};
type Attempt = {id:string;lab_id:string;status:string;reason:string|null;started_at:string;updated_at:string;detail:Record<string,unknown>|null;solves:Solve[]};
type Lab = {id:string;title:string;category:string;url:string;flags:boolean;summary:string;running:boolean;attempt:Attempt|null};
type Catalog = {enabled:boolean;docker:boolean;problem:string|null;isolation:string;labs:Lab[]};
type FlagResult = {correct:boolean;challenge:string;duplicate?:boolean;solves?:number};
type Body = Record<string,unknown>;

async function api<T>(path:string, operator:string, method='GET', body?:Body, approver?:string):Promise<T>{
  const headers:Record<string,string>={'Authorization':`Bearer ${operator}`,'Accept':'application/json'};
  if(body)headers['Content-Type']='application/json';
  if(approver)headers['X-STAR-APPROVAL']=approver;
  let response:Response;
  try {response=await fetch('/api/v1/range/'+path,{method,headers,credentials:'omit',cache:'no-store',body:body?JSON.stringify(body):undefined});}
  catch{throw new Error('اتصال FastAPI المحلي غير متاح. تأكد من تشغيل الخادم.');}
  if(!response.ok){
    const payload:unknown=await response.json().catch(()=>null);
    const detail=payload&&typeof payload==='object'&&'detail' in payload
      ? JSON.stringify((payload as {detail:unknown}).detail):'Request failed';
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }
  return response.json() as Promise<T>;
}

const statusNames:Record<string,string>={starting:'قيد التشغيل…',running:'يعمل',failed:'فشل',ended:'انتهى'};
const problemNames:Record<string,string>={disabled:'الساحة معطّلة. ضع STAR_RANGE_ENABLED=true في .env.local ثم أعد تشغيل FastAPI.',docker_unavailable:'Docker غير متاح على هذا الجهاز.',docker_error:'Docker يعمل لكن أمر compose فشل. تحقق من الصلاحيات.'};

export function RangePanel({token}:{token:string}){
  const [catalog,setCatalog]=useState<Catalog|null>(null);
  const [attempts,setAttempts]=useState<Attempt[]>([]);
  const [approval,setApproval]=useState('');
  const [reason,setReason]=useState('ساحة تدريب معزولة على جهاز Kali الخاص بي');
  const [confirmed,setConfirmed]=useState(false);
  const [challenge,setChallenge]=useState('');
  const [flag,setFlag]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  const load=useCallback(async()=>{
    if(!token)return;
    const [labs,history]=await Promise.all([
      api<Catalog>('labs',token),
      api<{attempts:Attempt[]}>('attempts?limit=30',token)
    ]);
    setCatalog(labs);setAttempts(history.attempts);
  },[token]);

  useEffect(()=>{
    let active=true;
    void load().catch(e=>{if(active)setError(e instanceof Error?e.message:'فشل قراءة الساحة');});
    return()=>{active=false;};
  },[load]);

  useEffect(()=>{
    if(!attempts.some(a=>a.status==='starting'))return;
    const handle=window.setInterval(()=>{void load().catch(()=>{});},2000);
    return()=>window.clearInterval(handle);
  },[attempts,load]);

  async function act(fn:()=>Promise<string>){
    setBusy(true);setError('');setMessage('');
    try{const label=await fn();await load();setMessage(label);}catch(e){setError(e instanceof Error?e.message:'تعذّر تنفيذ الإجراء');}
    finally{setBusy(false);}
  }
  const canApprove=approval.length>=32&&confirmed&&reason.trim().length>=12;
  function launch(lab:Lab,verb:'start'|'reset'){
    void act(async()=>{
      if(!canApprove)throw new Error('أدخل رمز الموافقة والسبب وأكّد أن الساحة معزولة.');
      await api('labs/'+encodeURIComponent(lab.id)+'/'+verb,token,'POST',{reason:reason.trim(),scope_confirmed:true},approval);
      setApproval('');setConfirmed(false);
      return verb==='start'?'بدأ تشغيل الهدف. أول تشغيل قد يأخذ دقائق لتنزيل الصورة.':'محاولة جديدة: الحاوية تُنشأ من جديد بمفتاح أعلام جديد.';
    });
  }
  function stop(lab:Lab){
    void act(async()=>{await api('labs/'+encodeURIComponent(lab.id)+'/stop',token,'POST');return 'أُوقف الهدف وحُذفت حاويته.';});
  }
  const flagLab=catalog?.labs.find(l=>l.flags&&l.attempt?.status==='running');
  function submit(){
    const attempt=flagLab?.attempt;
    void act(async()=>{
      if(!attempt)throw new Error('شغّل Juice Shop أولاً.');
      const result=await api<FlagResult>('attempts/'+encodeURIComponent(attempt.id)+'/flags',token,'POST',{challenge:challenge.trim(),flag:flag.trim()});
      if(!result.correct)throw new Error('العلم غير صحيح لهذا التحدي أو لهذه المحاولة.');
      setFlag('');
      return result.duplicate?'هذا التحدي محسوب مسبقاً في هذه المحاولة.':`✓ صحيح! «${result.challenge}» — مجموع التحديات المحلولة: ${result.solves}`;
    });
  }
  const solved=attempts.reduce((n,a)=>n+a.solves.length,0);

  return <section className="range" aria-label="ساحة التدريب المعزولة" dir="rtl">
    <div className="range-title"><div><span className="ops-eyebrow">STAR CYBER RANGE / LOCAL DOCKER</span><h2>ساحة التدريب الحقيقية</h2><p>أهداف ضعيفة عمداً على شبكة Docker معزولة بلا إنترنت. تصل إليها فقط من جهازك عبر 127.0.0.1.</p></div><button className="ops-secondary" disabled={busy} onClick={()=>void act(async()=>'تحدّثت حالة الساحة')}>تحديث</button></div>
    {error&&<p className="ops-error" role="alert">{error}</p>}
    {message&&<p className="ops-success" role="status">{message}</p>}
    {!catalog?<p>جاري قراءة حالة الساحة من Kali المحلي…</p>:<>
      <div className="range-summary">
        <span className={catalog.enabled?'range-ok':'range-off'}>{catalog.enabled?'● الساحة مفعّلة':'○ الساحة معطّلة'}</span>
        <span className={catalog.docker?'range-ok':'range-off'}>{catalog.docker?'● Docker متصل':'○ Docker غير متصل'}</span>
        <span><strong>{catalog.labs.filter(l=>l.running).length}</strong> هدف يعمل</span>
        <span><strong>{solved}</strong> تحدٍّ محلول</span>
      </div>
      {catalog.problem&&<p className="ops-warning">{problemNames[catalog.problem]||catalog.problem}</p>}
      <div className="range-isolation"><b>العزل:</b> الأهداف على شبكة internal بلا خروج للإنترنت، والبوابة تنشر المنافذ على 127.0.0.1 فقط. كل تشغيل أو إعادة ضبط تنشئ الحاوية من الصفر.</div>

      <div className="range-consent"><h3>موافقة التشغيل</h3><div className="range-fields"><label>رمز الموافقة المستقل<input type="password" autoComplete="off" spellCheck={false} value={approval} onChange={e=>setApproval(e.target.value)} placeholder="STAR_APPROVAL_TOKEN"/></label><label>السبب<input value={reason} minLength={12} maxLength={250} onChange={e=>setReason(e.target.value)}/></label></div><label className="range-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>أؤكد أن الساحة تعمل على جهازي فقط وأنني لن أعرض منافذها على الشبكة.</label></div>

      <div className="range-grid">{catalog.labs.map(lab=>{
        const a=lab.attempt;
        const state=a?.status||(lab.running?'running':'');
        return <article className={'range-card '+(state==='running'?'live':'')} key={lab.id}>
          <header><div><span className="range-cat">{lab.category}{lab.flags?' · أعلام ديناميكية':''}</span><h3>{lab.title}</h3></div><span className={'range-state '+(state||'idle')}>{statusNames[state]||'متوقف'}</span></header>
          <p>{lab.summary}</p>
          {state==='running'&&<a className="range-link" href={lab.url} target="_blank" rel="noopener noreferrer" dir="ltr">{lab.url} ↗</a>}
          {a&&<small className="range-meta">محاولة {a.id.slice(0,8)} · {a.solves.length} محلول</small>}
          {a?.status==='failed'&&a.detail&&<pre dir="ltr">{JSON.stringify(a.detail,null,2)}</pre>}
          <div className="range-actions">
            {state!=='running'&&state!=='starting'&&<button disabled={busy||!catalog.enabled||!canApprove} onClick={()=>launch(lab,'start')}>تشغيل</button>}
            {state==='running'&&<button disabled={busy||!canApprove} onClick={()=>launch(lab,'reset')}>إعادة ضبط</button>}
            {(state==='running'||lab.running)&&<button className="ops-secondary" disabled={busy} onClick={()=>stop(lab)}>إيقاف وحذف</button>}
          </div>
        </article>;})}</div>

      <div className="range-flags"><h3>تسليم علم Juice Shop</h3>
        {flagLab?<><p>عند حل تحدٍّ يظهر في إشعار Juice Shop رمز من 40 حرفاً. انسخه مع اسم التحدي كما يظهر في لوحة النقاط (Score Board). الخادم يتحقق منه بمفتاح هذه المحاولة فقط.</p>
          <div className="range-fields"><label>اسم التحدي<input dir="ltr" value={challenge} maxLength={80} onChange={e=>setChallenge(e.target.value)} placeholder="Score Board"/></label><label>العلم<input dir="ltr" value={flag} maxLength={40} autoComplete="off" spellCheck={false} onChange={e=>setFlag(e.target.value)} placeholder="40 hex characters"/></label></div>
          <button disabled={busy||challenge.trim().length<2||!/^[0-9a-fA-F]{40}$/.test(flag.trim())} onClick={submit}>تحقق من العلم</button></>
          :<p>شغّل Juice Shop لتفعيل التحقق من الأعلام.</p>}
      </div>

      <div className="range-history"><h3>سجل المحاولات</h3>{attempts.length===0?<p>لا توجد محاولات بعد.</p>:attempts.map(a=><div className="range-row" key={a.id}><b>{catalog.labs.find(l=>l.id===a.lab_id)?.title||a.lab_id}</b><span>{statusNames[a.status]||a.status}</span><span>{a.solves.length} محلول</span><time dir="ltr">{a.started_at}</time>{a.solves.length>0&&<small>{a.solves.map(s=>s.challenge).join(' · ')}</small>}</div>)}</div>
    </>}
  </section>;
}
