import {useCallback,useEffect,useState} from 'react';
import './tools-maintenance.css';

type Diagnostic={
 checkedAt:string;source:string;
 runtime:{node:string;platform:string;uid:number|null;healthy:boolean;code:string};
 persistence:{ready:boolean;freeMiB:number|null;homeOnVolume:boolean;code:string};
 kali:{ready:boolean;code:string};
 aiGateway:{ready:boolean;code:string;liveProviderVerified:boolean};
 access:{ready:boolean;code:string};
};
type InstallPackage={id:string;name:string;package:string;version:string;foundVersion:string|null;
 installed:boolean;executable:boolean;source:string;explanation:string;note:string};
type InstallJob={id:string;tool_id:string;package:string;version:string;status:string;
 startedAt:string;finishedAt:string|null;errorCode:string|null};
type Installer={checkedAt:string;packages:InstallPackage[];freeMiB:number|null;minFreeMiB:number;
 job:InstallJob|null;history:InstallJob[];warning:string};
type Probe={ready:boolean;code:string;durationMs:number;checkedAt:string;retryAfterSec?:number};
const BASE='/api/terminal/tools';
const ERRORS:Record<string,string>={
 ACCESS_REQUIRED:'انتهت جلسة Cloudflare Access؛ سجل الدخول مجدداً.',
 TOOLS_UPSTREAM_UNAVAILABLE:'محرك Railway غير متاح حالياً.',
 DIAGNOSTICS_UNAVAILABLE:'تعذر فحص خدمات Railway.',
 INSTALL_STATUS_UNAVAILABLE:'تعذر قراءة حالة التثبيت.',
 INSTALL_NOT_APPROVED:'الطلب غير معتمد أو الحزمة غير مدعومة.',
 INSTALL_NON_ROOT_REQUIRED:'التثبيت لا يعمل بصلاحية root.',
 INSTALL_STORAGE_LOW:'المساحة المتاحة غير كافية؛ لن يتغير نظامك.',
 INSTALL_STORAGE_UNAVAILABLE:'تعذر التأكد من مساحة التخزين.',
 INSTALL_STATE_UNAVAILABLE:'تعذر قراءة سجل عمليات التثبيت.',
 INSTALL_BUSY:'يوجد تثبيت آخر قيد التشغيل.',
 AI_PROBE_COOLDOWN:'فحص AI الحي مسموح مرة واحدة كل 15 دقيقة فقط.',
 AI_PROBE_BUSY:'يوجد اختبار AI جارٍ الآن.',
 AI_PROBE_CONFIRM_REQUIRED:'مطلوب تأكيد اختبار النموذج الفعلي.',
 AI_PROBE_STATE_UNAVAILABLE:'تعذر قراءة سجل الاختبار.',
 TOOLS_EDGE_UNAVAILABLE:'ربط Railway السري غير جاهز.'
};
async function post<T>(route:string,body:unknown={}):Promise<T>{
 const response=await fetch(BASE+'/'+route,{
  method:'POST',cache:'no-store',credentials:'same-origin',
  headers:{'Content-Type':'application/json','Accept':'application/json'},
  body:JSON.stringify(body)
 });
 if(!(response.headers.get('content-type')||'').includes('application/json'))
  throw Error('الصفحة تحتاج تسجيل دخول Cloudflare Access أو أن الخدمة لم ترجع JSON.');
 const result:unknown=await response.json();
 if(!result||typeof result!=='object')throw Error('استجابة غير صالحة من الخادم.');
 const r=result as Record<string,unknown>;
 if(!response.ok){
  const code=String(r.code||'UNKNOWN');
  const detail=ERRORS[code]||code+' (HTTP '+response.status+')';
  throw Error(r.retryAfterSec?detail+' — جرّب بعد '+Math.ceil(Number(r.retryAfterSec)/60)+' دقيقة.':detail);
 }
 return result as T;
}
const label=(ready:boolean,code:string)=>ready?'جاهز':code==='TERMINAL_NOT_CONFIGURED'?
 'غير مهيأ':code==='KALI_UNREACHABLE'?'غير متصل':'يحتاج فحص';
const jobText=(job:InstallJob|null):string=>{
 if(!job)return 'لا يوجد تثبيت نشط';
 if(job.status==='running')return 'جارٍ تثبيت '+job.package+'@'+job.version+' في Volume...';
 if(job.status==='verified')return 'تم التثبيت والتحقق من '+job.package+'@'+job.version;
 if(job.status==='interrupted')return 'توقف التثبيت بسبب إعادة تشغيل الحاوية؛ يمكن إعادة المحاولة.';
 if(job.status==='failed')return 'فشل التثبيت: '+(job.errorCode||'INSTALL_FAILED');
 return job.status;
};

export default function ToolsMaintenancePanel({onInstalled}:{onInstalled:()=>void}){
 const [diag,setDiag]=useState<Diagnostic|null>(null);
 const [manager,setManager]=useState<Installer|null>(null);
 const [statusBusy,setStatusBusy]=useState(false);
 const [requestBusy,setRequestBusy]=useState('');
 const [problem,setProblem]=useState('');
 const [probe,setProbe]=useState<Probe|null>(null);
 const refresh=useCallback(async()=>{
  setStatusBusy(true);
  const results=await Promise.allSettled([
   post<Diagnostic>('diagnostics'),
   post<Installer>('install/status')
  ]);
  if(results[0].status==='fulfilled')setDiag(results[0].value);
  if(results[1].status==='fulfilled'){
   setManager(results[1].value);
  }
  const failures=results.filter(x=>x.status==='rejected') as PromiseRejectedResult[];
  setProblem(failures.length?failures.map(x=>x.reason instanceof Error?x.reason.message:'خطأ اتصال').join(' · '):'');
  setStatusBusy(false);
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 const ongoing=manager?.job?.status==='running';
 useEffect(()=>{
  if(!ongoing)return;
  const timer=window.setInterval(()=>{
   void post<Installer>('install/status')
     .then(next=>{
       setManager(next);
       if(next.job?.status==='verified')onInstalled();
     }).catch(()=>{setProblem('تعذر متابعة عملية التثبيت؛ اضغط «تحديث الحالة».');});
  },5000);
  return()=>window.clearInterval(timer);
 },[ongoing,onInstalled]);
 async function verifyAI(){
  if(requestBusy)return;
  const proceed=window.confirm('هذا الاختبار يرسل طلب AI حقيقياً واحداً وقد يستهلك جزءاً بسيطاً من رصيد النموذج. هل تريد المتابعة؟');
  if(!proceed)return;
  setRequestBusy('ai');setProblem('');
  try{
   const value=await post<Probe>('live-ai',{confirm:'RUN_ONE_PROVIDER_CHECK'});
   setProbe(value);
  }catch(e){setProblem(e instanceof Error?e.message:'تعذر فحص AI');}
  finally{setRequestBusy('');}
 }
 async function install(pkg:InstallPackage){
  if(requestBusy||ongoing||pkg.installed)return;
  const approve=window.confirm(
   'تثبيت '+pkg.name+' إصدار '+pkg.version+' من PyPI داخل بيئة Python مستقلة على Railway؟\n'+
   'لا يعمل التثبيت بصلاحية root، وقد يستخدم مساحة من Volume والاتصال بالإنترنت. لن يبدأ أي فحص أو هجوم.');
  if(!approve)return;
  setRequestBusy(pkg.id);setProblem('');
  try{
   const result=await post<{job:InstallJob}>('install/start',{
    tool_id:pkg.id,confirm:'INSTALL_CURATED_PINNED'
   });
   setManager(prev=>prev?{...prev,job:result.job}:prev);
  }catch(e){setProblem(e instanceof Error?e.message:'تعذّر بدء التثبيت');}
  finally{setRequestBusy('');}
 }
 const health=[
  {name:'Linux Terminal',ready:!!diag?.runtime.healthy,code:diag?.runtime.code||'NOT_CHECKED',
   more:diag?.runtime.node||'—'},
  {name:'FastAPI / STAR KALI',ready:!!diag?.kali.ready,code:diag?.kali.code||'NOT_CHECKED',
   more:'127.0.0.1:8000'},
  {name:'STAR AI Gateway',ready:!!diag?.aiGateway.ready,code:diag?.aiGateway.code||'NOT_CHECKED',
   more:'فحص الشبكة فقط، لا يثبت رد النموذج'},
  {name:'Persistent Volume',ready:!!diag?.persistence.ready,code:diag?.persistence.code||'NOT_CHECKED',
   more:diag?.persistence.freeMiB===null?'المساحة غير معروفة':diag?.persistence.freeMiB+' MiB متاحة'},
  {name:'Private Origin Gate',ready:!!diag?.access.ready,code:diag?.access.code||'NOT_CHECKED',
   more:'Cloudflare → Wormstar → Railway'}
 ];
 return <section className="star-maint" aria-label="حالة الخدمات ومدير تثبيت الأدوات">
  <div className="star-maint-top">
    <div><span className="eyebrow">PHASE 01 + PHASE 02 / RAILWAY</span>
     <h3>تشخيص الخدمة ومدير الأدوات</h3>
     <p>كل حالة تُقرأ من الخادم عند الطلب. لا يُحتسب اتصال AI كاختبار نموذج حتى تنجح تجربة الاستجابة الفعلية.</p>
    </div>
    <button type="button" disabled={statusBusy||!!requestBusy} onClick={()=>void refresh()}>
     {statusBusy?'جارٍ الفحص...':'↻ تحديث حالة الأنظمة'}
    </button>
  </div>
  <div className="star-maint-health">
   {health.map(h=><div className="star-maint-health-item" key={h.name}>
    <strong>{h.name}</strong><span className={h.ready?'ready':'unready'}>
      {diag?label(h.ready,h.code):'بانتظار الفحص'}</span>
    <small>{h.more}</small></div>)}
  </div>
  <div className="star-maint-ai">
    <div><strong>اختبار استجابة STAR AI الفعلية</strong>
     <small>اختياري — طلب واحد محدود وقد يستهلك رصيد API. يوجد حدّ 15 دقيقة بين المحاولات.</small>
     {probe&&<p className={probe.ready?'passed':'failed'}>{probe.ready?'استجاب النموذج بنجاح':'لم تثبت استجابة النموذج'} — {probe.code} · {probe.durationMs}ms</p>}
    </div>
    <button type="button" disabled={!!requestBusy||!diag?.aiGateway.ready}
      onClick={()=>void verifyAI()}>{requestBusy==='ai'?'جارٍ اختبار النموذج...':'اختبار AI فعلي'}</button>
  </div>
  <div className="star-maint-installs">
    <div className="star-maint-install-header">
      <div><strong>التثبيت الموثّق على Volume</strong>
        <small>حزمتان متوافقتان فقط حالياً. التثبيت اختيارك ولا يبدأ تلقائياً.</small></div>
      <span>{manager?.freeMiB===null?'—':manager?.freeMiB+' MiB'} متاحة</span>
    </div>
    <div className="star-maint-install-grid">
      {manager?.packages.map(pkg=><div key={pkg.id} className="star-maint-package">
        <strong>{pkg.name} <small>v{pkg.version}</small></strong>
        <span className={pkg.installed?'installed':'uninstalled'}>{pkg.installed?'✓ مثبت ومتحقق':'غير مثبت في بيئة المدير'}</span>
        <p>{pkg.explanation}</p>
        <small>{pkg.note}</small>
        <div><button type="button" onClick={()=>void install(pkg)}
          disabled={!!requestBusy||!!ongoing||pkg.installed||manager.freeMiB===null||manager.freeMiB<manager.minFreeMiB}>
            {requestBusy===pkg.id?'بدء التثبيت...':pkg.installed?'تم التثبيت':'تثبيت مع التحقق'}
          </button><a href={pkg.source} target="_blank" rel="noopener noreferrer">مصدر PyPI</a></div>
      </div>)}
    </div>
    <div className="star-maint-job" role="status">
      <strong>سجل العملية الأخيرة:</strong> {jobText(manager?.job||null)}
      {manager?.job?.startedAt&&<small>بدأت: {new Date(manager.job.startedAt).toLocaleString('ar-IQ')}</small>}
    </div>
    <p className="star-maint-foot">البرامج المحفوظة تبقى داخل الـVolume بعد إعادة النشر. حالة التثبيت تتأكد من الإصدار والملف التنفيذي، وليس فقط نجاح pip. لا تثبيت تلقائياً لـC2 أو Windows VM أو برامج النواة.</p>
  </div>
  {problem&&<div className="star-toolops-error" role="alert">{problem}</div>}
 </section>;
}
