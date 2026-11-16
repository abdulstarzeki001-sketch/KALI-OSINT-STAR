import {useCallback, useEffect, useState} from 'react';
import './tooling.css';

type CatalogTool = {id:string;title:string;group:string;installed:boolean;binary:string|null;actions:string[];help_available:boolean;note:string};
type ToolJob = {id:string;tool_id:string;action:string;status:string;reason:string|null;result:Record<string,unknown>|null;created_at:string};
type Action = 'approve'|'run'|'cancel';
type Body = Record<string,unknown>;

async function api<T>(path:string, operator:string, method='GET', body?:Body, approver?:string):Promise<T>{
  const headers:Record<string,string>={'Authorization':`Bearer ${operator}`,'Accept':'application/json'};
  if(body)headers['Content-Type']='application/json';
  if(approver)headers['X-STAR-APPROVAL']=approver;
  let response:Response;
  try {response=await fetch('/api/v1/tooling/'+path,{method,headers,credentials:'omit',cache:'no-store',body:body?JSON.stringify(body):undefined});}
  catch{throw new Error('اتصال FastAPI المحلي غير متاح. تأكد من تشغيل الخادم.');}
  if(!response.ok){
    const payload:unknown=await response.json().catch(()=>null);
    const detail=payload&&typeof payload==='object'&&'detail' in payload
      ? JSON.stringify((payload as {detail:unknown}).detail):'Request failed';
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }
  return response.json() as Promise<T>;
}

const groupNames:Record<string,string>={'C2':'محاكاة الخصوم','Identity':'الهوية وWindows','Network':'الشبكات','Reverse engineering':'الهندسة العكسية','Fuzzing':'اكتشاف الأعطال','Simulation':'المحاكاة'};
const statusNames:Record<string,string>={pending_approval:'بانتظار الموافقة',approved:'معتمد',queued:'بالطابور',running:'قيد التنفيذ',completed:'مكتمل',failed:'فشل',cancelled:'ملغى'};

export function ToolingPanel({token}:{token:string}){
  const [tools,setTools]=useState<CatalogTool[]>([]);
  const [jobs,setJobs]=useState<ToolJob[]>([]);
  const [helpEnabled,setHelpEnabled]=useState(false);
  const [selected,setSelected]=useState('mythic');
  const [filter,setFilter]=useState('all');
  const [search,setSearch]=useState('');
  const [approval,setApproval]=useState('');
  const [reason,setReason]=useState('مختبر محلي مملوك ومصرّح بفحص الأدوات المتوفرة داخله');
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [ready,setReady]=useState(false);

  const load=useCallback(async()=>{
    if(!token)return;
    const [catalog,result]=await Promise.all([
      api<{tools:CatalogTool[];help_enabled:boolean}>('catalog',token),
      api<{jobs:ToolJob[]}>('jobs?limit=50',token)
    ]);
    setTools(catalog.tools);setHelpEnabled(catalog.help_enabled);setJobs(result.jobs);setReady(true);
  },[token]);

  useEffect(()=>{
    let active=true;
    void load().catch(e=>{if(active)setError(e instanceof Error?e.message:'فشل قراءة الأدوات');});
    return()=>{active=false;};
  },[load]);

  useEffect(()=>{
    if(!jobs.some(j=>['queued','running'].includes(j.status)))return;
    const handle=window.setInterval(()=>{void load().catch(()=>{});},1500);
    return()=>window.clearInterval(handle);
  },[jobs,load]);

  async function act(fn:()=>Promise<void>,label:string){
    setBusy(true);setError('');setMessage('');
    try{await fn();await load();setMessage(label);}catch(e){setError(e instanceof Error?e.message:'تعذّر تنفيذ الإجراء');}
    finally{setBusy(false);}
  }
  function create(toolId:string,action:'inspect'|'help'){
    void act(async()=>{await api('jobs',token,'POST',{tool_id:toolId,action});},'تم إنشاء الطلب؛ لا يتم التنفيذ قبل الموافقة.');
  }
  function update(job:ToolJob,verb:Action){
    void act(async()=>{
      if(verb==='approve'&&(!confirmed||reason.trim().length<12||approval.length<32))throw new Error('أدخل رمز الموافقة، السبب، وتأكيد النطاق.');
      await api('jobs/'+encodeURIComponent(job.id)+'/'+verb,token,'POST',
        verb==='approve'?{reason:reason.trim(),scope_confirmed:true}:undefined,verb==='approve'?approval:undefined);
      if(verb==='approve'){setApproval('');setConfirmed(false);}
    },verb==='approve'?'تم الاعتماد؛ اضغط تشغيل للبدء.':verb==='run'?'بدأت المهمة؛ تظهر النتيجة عند اكتمالها.':'تم إلغاء المهمة.');
  }
  const chosen=tools.find(t=>t.id===selected);
  const visible=tools.filter(t=>(filter==='all'||(filter==='installed'?t.installed:t.group===filter))&&
    (t.title.toLowerCase().includes(search.toLowerCase())||t.id.includes(search.toLowerCase())));
  return <section className="tooling" aria-label="تشغيل أدوات Kali المحدودة" dir="rtl">
    <div className="tooling-title"><div><span className="ops-eyebrow">STAR KALI TOOL REGISTRY / 15</span><h2>مركز الأدوات الفعلية</h2><p>فحص التثبيت ومساعدة CLI محلية ضمن قائمة أوامر ثابتة. لا فحوص أهداف ولا Shell أو C2.</p></div><button className="ops-secondary" disabled={busy} onClick={()=>void act(load,'تحدّثت حالة الأدوات')}>تحديث الحالة</button></div>
    {error&&<p className="ops-error" role="alert">{error}</p>}
    {message&&<p className="ops-success" role="status">{message}</p>}
    {!ready?<p>جاري جلب قائمة الأدوات من Kali المحلي...</p>:<>
      <div className="tooling-summary"><span><strong>{tools.length}</strong> أداة مرتبطة بالكتالوج</span><span><strong>{tools.filter(t=>t.installed).length}</strong> مكتشفة محلياً</span><span><strong>{jobs.filter(j=>j.status==='completed').length}</strong> مهمة مكتملة</span><span className={helpEnabled?'tooling-on':'tooling-off'}>{helpEnabled?'مساعدة CLI مسموحة':'مساعدة CLI معطّلة افتراضياً'}</span></div>
      <div className="tooling-filter"><input aria-label="البحث عن أداة" placeholder="ابحث عن أداة..." value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="تصفية الأدوات" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">كل المجالات</option><option value="installed">الأدوات المثبتة</option>{Object.entries(groupNames).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></div>
      <div className="tooling-layout"><div className="tooling-cards">{visible.map(t=><button className={'tooling-card '+(selected===t.id?'active':'')} key={t.id} onClick={()=>setSelected(t.id)} aria-pressed={selected===t.id}><span className="tooling-card-main"><b>{t.title}</b><small>{groupNames[t.group]||t.group}</small></span><span className={'tooling-dot '+(t.installed?'found':'')}>{t.installed?'مثبت':'غير مكتشف'}</span></button>)}{visible.length===0&&<p>لا توجد أدوات تطابق البحث.</p>}</div>
      <div className="tooling-detail">{chosen&&<><span className="tooling-label">TOOL / {chosen.id.toUpperCase()}</span><h3>{chosen.title}</h3><p>{chosen.note}</p><div className="tooling-facts"><span>الحالة: <strong>{chosen.installed?'موجود في PATH':'غير موجود في PATH'}</strong></span><span>الملف: <code dir="ltr">{chosen.binary||'—'}</code></span><span>التنفيذ: <strong>{chosen.help_available?'مساعدة CLI فقط':'جرد وجود الملف فقط'}</strong></span></div><div className="tooling-actions"><button disabled={busy} onClick={()=>create(chosen.id,'inspect')}>إنشاء مهمة فحص التثبيت</button><button className="ops-secondary" disabled={busy||!chosen.installed||!chosen.actions.includes('help')} onClick={()=>create(chosen.id,'help')}>طلب تشغيل Help</button></div>{chosen.help_available&&!helpEnabled&&<small>لتفعيل أوامر Help الثابتة محلياً فقط: ضع STAR_ENABLE_TOOL_HELP=true في .env.local ثم أعد تشغيل FastAPI.</small>}</>}</div></div>
      <div className="tooling-consent"><h3>اعتماد منفصل للمهام</h3><div className="tooling-consent-fields"><label>رمز الموافقة المستقل<input type="password" autoComplete="off" value={approval} onChange={e=>setApproval(e.target.value)} placeholder="STAR_APPROVAL_TOKEN"/></label><label>سبب الطلب<input value={reason} minLength={12} maxLength={250} onChange={e=>setReason(e.target.value)}/></label></div><label className="tooling-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>أؤكد أن هذه الاختبارات محلية ومصرّح بها.</label></div>
      <div className="tooling-history"><div className="ops-headline"><h3>مركز المهام والنتائج</h3><button className="ops-secondary" disabled={busy} onClick={()=>void act(load,'تم تحديث المهام')}>تحديث</button></div>{jobs.length===0?<p>أنشئ أول مهمة من بطاقة الأداة.</p>:jobs.map(job=><article className="tooling-job" key={job.id}><div className="tooling-job-header"><div><strong>{tools.find(t=>t.id===job.tool_id)?.title||job.tool_id}</strong><small>{job.action==='inspect'?'فحص التثبيت':'مساعدة CLI'} · {job.id.slice(0,8)}</small></div><span className={'tooling-state '+job.status}>{statusNames[job.status]||job.status}</span></div><div className="tooling-job-buttons">{job.status==='pending_approval'&&<button disabled={busy||approval.length<32||!confirmed||reason.trim().length<12} onClick={()=>update(job,'approve')}>اعتماد</button>}{job.status==='approved'&&<button disabled={busy} onClick={()=>update(job,'run')}>تشغيل</button>}{['pending_approval','approved','queued'].includes(job.status)&&<button className="ops-secondary" disabled={busy} onClick={()=>update(job,'cancel')}>إلغاء</button>}</div>{job.result&&<pre dir="ltr" tabIndex={0}>{JSON.stringify(job.result,null,2)}</pre>}</article>)}</div>
    </>}
  </section>;
}
