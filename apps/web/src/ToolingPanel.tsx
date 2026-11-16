import {useEffect,useState} from 'react';
type Tool={id:string;title:string;group:string;installed:boolean;actions:string[];binary:string|null};
type Job={id:string;tool_id:string;action:string;status:string;result:unknown};
async function req<T>(path:string,token:string,method='GET',body?:object,approval?:string):Promise<T>{
  const headers:Record<string,string>={Authorization:'Bearer '+token,'Accept':'application/json'};
  if(body)headers['Content-Type']='application/json';
  if(approval)headers['X-STAR-APPROVAL']=approval;
  const r=await fetch('/api/v1/tooling/'+path,{method,headers,cache:'no-store',credentials:'omit',body:body?JSON.stringify(body):undefined});
  if(!r.ok){const v=await r.json().catch(()=>({detail:'Error'}));throw new Error('HTTP '+r.status+' '+JSON.stringify(v.detail));}
  return r.json() as Promise<T>;
}
export function ToolingPanel({token}:{token:string}){
  const [tools,setTools]=useState<Tool[]>([]),[jobs,setJobs]=useState<Job[]>([]);
  const [selected,setSelected]=useState('mythic'),[query,setQuery]=useState('');
  const [approver,setApprover]=useState(''),[reason,setReason]=useState('اختبار محلي مصرح به في مختبر معزول');
  const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[message,setMessage]=useState('');
  const [allowHelp,setAllowHelp]=useState(false);
  async function refresh(){
    const [a,b]=await Promise.all([req<{tools:Tool[];help_enabled:boolean}>('catalog',token),req<{jobs:Job[]}>('jobs',token)]);
    setTools(a.tools);setJobs(b.jobs);setAllowHelp(a.help_enabled);
  }
  useEffect(()=>{if(!token)return;void refresh().catch(e=>setError(String(e)));},[token]);
  useEffect(()=>{if(!jobs.some(j=>j.status==='running'||j.status==='queued'))return;
    const id=setInterval(()=>void refresh().catch(()=>{}),1500);return()=>clearInterval(id);
  },[jobs,token]);
  async function act(fn:()=>Promise<unknown>,msg:string){
    setBusy(true);setError('');setMessage('');
    try{await fn();await refresh();setMessage(msg);}catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  const choose=tools.find(t=>t.id===selected);
  return <section className="ops-panel" style={{marginBottom:18}} dir="rtl" aria-label="مركز أدوات Kali الخمسة عشر">
    <div className="ops-headline"><div><h2>لوحة الأدوات الـ15 — Local Tool Console</h2><p>تثبيت حقيقي، إجراءات محددة، اعتماد وتسجيل. لا Shell عشوائي ولا إطلاق C2.</p></div>
      <button className="ops-secondary" disabled={busy} onClick={()=>void act(refresh,'تم التحديث')}>تحديث</button></div>
    <p>{tools.length} أدوات مدرجة · {tools.filter(t=>t.installed).length} مثبتة محلياً · Help {allowHelp?'مفعّل':'معطّل'}</p>
    <input aria-label="البحث عن أداة" placeholder="بحث بين أدوات Kali..." value={query} onChange={e=>setQuery(e.target.value)}/>
    <div className="star-tool-layout">
      <div className="star-tool-grid">{tools.filter(t=>t.title.toLowerCase().includes(query.toLowerCase())||t.id.includes(query.toLowerCase())).map(t=>
        <button key={t.id} className={'ops-secondary star-tool-card '+(selected===t.id?'active':'')} onClick={()=>setSelected(t.id)}>
        <strong>{t.title}</strong><small>{t.group} · {t.installed?'مثبت':'غير مكتشف'}</small></button>)}</div>
      {choose&&<div className="star-tool-detail">
        <h3>{choose.title}</h3><p>{choose.installed?'ملف التشغيل موجود في PATH':'ملف التشغيل غير مكتشف في PATH'} · {choose.binary||'—'}</p>
        <p>{choose.actions.includes('help')?'تشغيل Help المحلي متاح بعد الموافقة':'جرد التثبيت فقط؛ التنفيذ الهجومي معطّل'}</p>
        <div className="ops-actions"><button disabled={busy} onClick={()=>void act(()=>req('jobs',token,'POST',{tool_id:choose.id,action:'inspect'}),'طلب فحص التثبيت أُنشئ')}>طلب جرد التثبيت</button>
        <button className="ops-secondary" disabled={busy||!choose.installed||!choose.actions.includes('help')} onClick={()=>void act(()=>req('jobs',token,'POST',{tool_id:choose.id,action:'help'}),'طلب Help أُنشئ')}>طلب Help</button></div></div>}
    </div>
    <div className="star-tool-consent">
      <label>رمز الموافقة الثاني<input type="password" autoComplete="off" value={approver} onChange={e=>setApprover(e.target.value)}/></label>
      <label>سبب الاعتماد<input value={reason} minLength={12} maxLength={250} onChange={e=>setReason(e.target.value)}/></label>
      <label className="ops-agree"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> أؤكد النطاق المصرح به</label>
    </div>
    {error&&<div role="alert" className="ops-error">{error}</div>}
    {message&&<div role="status" className="ops-success">{message}</div>}
    <h3>سجل المهام</h3>
    <div className="ops-jobs">{jobs.length===0?<p>أنشئ أول طلب فحص.</p>:jobs.map(j=><article className="ops-job" key={j.id}>
      <div><strong>{tools.find(t=>t.id===j.tool_id)?.title||j.tool_id}</strong><small>{j.action} · {j.status} · {j.id.slice(0,8)}</small></div>
      <div className="ops-actions">
        {j.status==='pending_approval'&&<button disabled={busy||approver.length<32||reason.trim().length<12||!confirmed} onClick={()=>void act(async()=>{
          await req('jobs/'+j.id+'/approve',token,'POST',{reason:reason.trim(),scope_confirmed:true},approver);
          setApprover('');setConfirmed(false);},'تم الاعتماد')}>اعتماد</button>}
        {j.status==='approved'&&<button disabled={busy} onClick={()=>void act(()=>req('jobs/'+j.id+'/run',token,'POST'),'المهمة دخلت الطابور')}>تشغيل</button>}
        {['pending_approval','approved','queued'].includes(j.status)&&<button className="ops-secondary" disabled={busy} onClick={()=>void act(()=>req('jobs/'+j.id+'/cancel',token,'POST'),'تم الإلغاء')}>إلغاء</button>}
      </div>
      {j.result!=null&&<pre dir="ltr">{JSON.stringify(j.result,null,2)}</pre>}
    </article>)}</div>
  </section>;
}
