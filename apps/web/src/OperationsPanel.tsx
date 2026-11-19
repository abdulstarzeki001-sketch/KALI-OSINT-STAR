import { useState } from 'react';
import './operations.css';
import {ToolingPanel} from './ToolingPanel';
import {RangePanel} from './RangePanel';

type Job = { id:string; kind:string; target:string|null; port:number|null; status:string; result:unknown; created_at:string };
type Audit = { id:number; time:string; action:string; detail:string; job_id:string };
type JsonMap = Record<string,unknown>;
const names:Record<string,string> = {system_inventory:'معلومات النظام المحلي',tool_inventory:'الأدوات المثبتة',lab_port_check:'منفذ TCP داخل المختبر'};
const ports=[22,80,443,8000,8080,8443];

async function request<T>(url:string, token:string, method='GET', data?:JsonMap, approval?:string):Promise<T> {
  const headers:Record<string,string> = {'Authorization':'Bearer '+token,'Accept':'application/json'};
  if(data)headers['Content-Type']='application/json';
  if(approval)headers['X-STAR-APPROVAL']=approval;
  let response:Response;
  try {
    response=await fetch('/api/v1/'+url,{method,headers,credentials:'omit',cache:'no-store',body:data?JSON.stringify(data):undefined});
  } catch {throw new Error('تعذر الاتصال بـFastAPI المحلي. شغّل الخادم على 127.0.0.1:8000');}
  if(!response.ok) {
    const error:unknown=await response.json().catch(()=>null);
    const detail=error&&typeof error==='object'&&'detail' in error?String(error.detail):'غير معروف';
    throw new Error('HTTP '+response.status+' — '+detail);
  }
  return response.json() as Promise<T>;
}

export function OperationsPanel() {
  // Secrets live in React memory only. Never save them to localStorage.
  const [operator,setOperator]=useState('');
  const [approver,setApprover]=useState('');
  const [connected,setConnected]=useState(false);
  const [section,setSection]=useState<'tools'|'jobs'|'range'>('range');
  const [jobs,setJobs]=useState<Job[]>([]);
  const [audit,setAudit]=useState<Audit[]>([]);
  const [kind,setKind]=useState('tool_inventory');
  const [target,setTarget]=useState('');
  const [port,setPort]=useState(443);
  const [reason,setReason]=useState('');
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  async function refresh() {
    const results=await Promise.all([
      request<{jobs:Job[]}>('jobs?limit=30',operator),
      request<{events:Audit[]}>('audit?limit=30',operator)
    ]);
    setJobs(results[0].jobs);setAudit(results[1].events);setConnected(true);
  }
  async function perform(task:()=>Promise<void>,success:string) {
    setError('');setMessage('');setBusy(true);
    try {await task();setMessage(success);} catch(e){setError(e instanceof Error?e.message:'فشل غير متوقع');}
    finally {setBusy(false);}
  }
  function leave() {
    setOperator('');setApprover('');setJobs([]);setAudit([]);setConnected(false);setError('');setMessage('');
  }
  function create() {
    void perform(async()=>{
      const payload:JsonMap={kind};
      if(kind==='lab_port_check'){payload.target=target.trim();payload.port=port;}
      await request('jobs',operator,'POST',payload);
      await refresh();
    },'أُنشئ الطلب معلّقاً. يلزم الاعتماد ثم التشغيل الصريح.');
  }
  function action(job:Job,verb:'approve'|'run'|'cancel') {
    void perform(async()=>{
      if(verb==='approve'&&(!confirmed||reason.trim().length<12))throw new Error('يجب تأكيد النطاق وذكر السبب (12 حرفاً على الأقل).');
      await request('jobs/'+encodeURIComponent(job.id)+'/'+verb,operator,'POST',
        verb==='approve'?{reason:reason.trim(),scope_confirmed:confirmed}:undefined,
        verb==='approve'?approver:undefined);
      if(verb==='approve'){setApprover('');setReason('');setConfirmed(false);}
      await refresh();
    },verb==='approve'?'تم الاعتماد. يلزم ضغط تشغيل الآن.':verb==='run'?'انتهى التنفيذ وسُجلت النتيجة.':'تم إلغاء الطلب.');
  }
  if (typeof window!=='undefined' && !['127.0.0.1','localhost'].includes(window.location.hostname)) return <section className="ops" dir="rtl">
    <header className="ops-header"><div><span className="ops-eyebrow">STAR CLOUD OPERATIONS</span><h1>مركز العمليات السحابي</h1><p>الترمنال الحقيقي صار جزءاً من KALI-OSINT-STAR، يعمل عبر Cloudflare Access وWormstar وRailway.</p></div><span className="ops-status connected">● بوابة محمية</span></header>
    <div className="ops-panel">
      <h2>ترمنال STAR داخل المشروع</h2>
      <p>افتح صفحة الترمنال المدمجة لتشغيل أدوات الحاوية، ومراجعة نتائج STAR KALI، واستخدام مساعد STAR AI. الواجهة لا تحفظ كلمات المرور ولا تكشف منفذ Railway.</p>
      <div className="ops-flex"><a href="#terminal" className="ops-secondary ops-terminal-entry">فتح الترمنال المدمج</a><a href="https://wormstar-ai-lab.abdulstarzeki001.workers.dev/terminal/" target="_blank" rel="noopener noreferrer" className="ops-secondary ops-terminal-entry">بوابة Wormstar الاحتياطية ↗</a></div>
      <p>أوامر الفحص الآمن: <code dir="ltr">star-kali health</code> و <code dir="ltr">persist check</code>. اختبر فقط الأنظمة التي تملكها أو لديك إذن صريح بفحصها.</p>
    </div>
  </section>;
  return <section className="ops" dir="rtl">
    <header className="ops-header"><div><span className="ops-eyebrow">SECURE LOCAL CONTROL PLANE</span><h1>مركز عمليات Kali</h1><p>وظائف محددة، اعتماد صريح، نتائج حقيقية، وسجل تدقيق محلي.</p></div><span className={'ops-status '+(connected?'connected':'')}>{connected?'● مصادقة ناجحة':'○ غير متصل'}</span></header>
    <div className="ops-warning"><b>حدود الأمان:</b> واجهة تشغيل محلية فقط. لا أوامر Shell عشوائية، ولا استهداف بوابات التدريب الرئيسية. لا تُنشر رموز المصادقة على GitHub أو Cloudflare Pages.</div>
    <div className="ops-panel"><h2>الاتصال الآمن</h2><div className="ops-flex"><input type="password" autoComplete="off" spellCheck={false} value={operator} onChange={e=>setOperator(e.target.value)} placeholder="رمز STAR_OPERATOR_TOKEN (يبقى في الذاكرة)" aria-label="رمز المشغل"/><button disabled={busy||operator.length<32} onClick={()=>void perform(refresh,'تم التحقق من الاتصال وقراءة السجلات')}>اتصال وتحديث</button><button className="ops-secondary" onClick={leave}>إنهاء الجلسة</button></div><small>شغّل FastAPI محلياً، ثم ألصق رمز المشغل من ملف .env.local الذي أنشأته على جهازك. لا تحفظه في المتصفح.</small></div>
    {error&&<div role="alert" className="ops-error">{error}</div>}
    {message&&<div role="status" className="ops-success">{message}</div>}
    {connected&&<nav className="ops-tabs" aria-label="أقسام مركز العمليات"><button type="button" aria-pressed={section==='range'} onClick={()=>setSection('range')}>ساحة التدريب</button><button type="button" aria-pressed={section==='tools'} onClick={()=>setSection('tools')}>مركز الأدوات الـ15</button><button type="button" aria-pressed={section==='jobs'} onClick={()=>setSection('jobs')}>المهام الأساسية</button></nav>}
    {connected&&section==='range'&&<RangePanel token={operator}/>}
    {connected&&section==='tools'&&<ToolingPanel token={operator}/>}
    {connected&&section==='jobs'&&<>
      <div className="ops-columns">
        <div className="ops-panel"><h2>01 — طلب مهمة جديدة</h2><label>نوع المهمة<select value={kind} onChange={e=>setKind(e.target.value)}>{Object.keys(names).map(key=><option value={key} key={key}>{names[key]}</option>)}</select></label>{kind==='lab_port_check'&&<><label>IPv4 خاص بالمختبر<input dir="ltr" autoComplete="off" placeholder="192.168.56.10" value={target} onChange={e=>setTarget(e.target.value)}/></label><label>منفذ من القائمة الآمنة<select value={port} onChange={e=>setPort(Number(e.target.value))}>{ports.map(p=><option value={p} key={p}>{p}</option>)}</select></label></>}<p>إنشاء الطلب لا يطلق أي اتصال أو مهمة قبل الاعتماد.</p><button onClick={create} disabled={busy||(kind==='lab_port_check'&&!target.trim())}>إنشاء طلب بانتظار الموافقة</button></div>
        <div className="ops-panel"><h2>02 — اعتماد مستقل</h2><label>رمز الموافقة الثاني<input type="password" autoComplete="off" spellCheck={false} value={approver} onChange={e=>setApprover(e.target.value)} placeholder="STAR_APPROVAL_TOKEN"/></label><label>سبب الموافقة<input maxLength={250} value={reason} onChange={e=>setReason(e.target.value)} placeholder="مثال: مختبر مملوك لي ضمن النطاق المصرّح"/></label><label className="ops-agree"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>أؤكد أن المهمة ضمن نطاق مختبر أملكه أو مصرح لي باختباره.</label><p>الاعتماد والتشغيل خطوتان منفصلتان.</p></div>
      </div>
      <div className="ops-panel"><div className="ops-headline"><h2>03 — سجل المهام</h2><button className="ops-secondary" disabled={busy} onClick={()=>void perform(refresh,'تم تحديث القائمة')}>تحديث</button></div>{jobs.length===0?<p>لم تُنشئ أي مهمة بعد. ابدأ بجرد الأدوات المحلية.</p>:<div className="ops-jobs">{jobs.map(job=><div className="ops-job" key={job.id}><div><strong>{names[job.kind]||job.kind}</strong><span className="ops-job-meta">{job.status} · {job.target?job.target+':'+job.port+' · ':''}{job.id.slice(0,8)}</span></div><div className="ops-actions">{job.status==='pending_approval'&&<button disabled={busy||approver.length<32||!confirmed||reason.trim().length<12} onClick={()=>action(job,'approve')}>اعتماد</button>}{job.status==='approved'&&<button disabled={busy} onClick={()=>action(job,'run')}>تشغيل</button>}{(job.status==='pending_approval'||job.status==='approved')&&<button className="ops-secondary" disabled={busy} onClick={()=>action(job,'cancel')}>إلغاء</button>}</div>{job.result!==null&&<pre dir="ltr">{JSON.stringify(job.result,null,2)}</pre>}</div>)}</div>}</div>
      <div className="ops-panel"><h2>04 — سجل التدقيق</h2><div className="ops-audit">{audit.map(row=><div key={row.id}><time>{row.time}</time><b>{row.action}</b><span>{row.detail}</span></div>)}</div><small>هذه سجلات SQLite محلية قابلة للتعديل من مالك الجهاز؛ ليست سجلات غير قابلة للعبث على مستوى المؤسسات.</small></div>
    </>}
  </section>;
}
