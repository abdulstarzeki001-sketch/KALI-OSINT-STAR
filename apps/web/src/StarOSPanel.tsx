import {useCallback,useEffect,useState} from 'react';
import './star-os.css';

export type OSDestination='agent'|'runtime'|'terminal'|'cyber'|'ai'|'operations';
type ServiceState='checking'|'online'|'login'|'error';
type Service={state:ServiceState;note:string};
type Checks={agent:Service;models:Service};
const CHECKING:Service={state:'checking',note:'جارٍ الفحص'};
const STATUS:Record<ServiceState,string>={
 checking:'جارٍ التحقق',online:'متصل',login:'المصادقة مطلوبة',error:'تعذر الاتصال'
};
const REPO='https://github.com/abdulstarzeki001-sketch/KALI-OSINT-STAR';
const destinations:{id:OSDestination;number:string;icon:string;title:string;body:string;hint:string}[]=[
 {id:'agent',number:'01',icon:'✧',title:'STAR AI Chat',body:'دردشة الذكاء الاصطناعي من خلال Cloudflare Access.',hint:'محادثة'},
 {id:'runtime',number:'02',icon:'⚡',title:'Agent Runner',body:'مهام GitHub ضمن حاوية Railway مع طلب الموافقة قبل التعديل.',hint:'مهام وموافقات'},
 {id:'terminal',number:'03',icon:'⌘',title:'Cloud Terminal',body:'ترمنال سحابي معزول؛ تبدأ الجلسة فقط عند طلب الاتصال.',hint:'Linux معزول'},
 {id:'cyber',number:'04',icon:'⛨',title:'Cyber Center',body:'تدقيق أكواد وتكوينات وسجلات مع تقارير JSON وSARIF.',hint:'تدقيق دفاعي'},
 {id:'ai',number:'05',icon:'◈',title:'Multi-model',body:'استكشاف النماذج والتوجيه والاختبارات الموجودة بالمشروع.',hint:'نماذج وخيارات'},
 {id:'operations',number:'06',icon:'↬',title:'CI & Operations',body:'إدارة العمليات المسموحة ومتابعة حالة الأدوات.',hint:'اختبارات ونشر'}
];
async function checkResponse(url:string,signal:AbortSignal,init?:RequestInit):Promise<Response>{
 return fetch(url,{credentials:'same-origin',cache:'no-store',...init,signal});
}
function classify(response:Response):Service|null{
 if(response.status===401||response.status===403)return {state:'login',note:'يلزم الدخول عبر Cloudflare Access'};
 if(!response.ok)return {state:'error',note:'HTTP '+response.status};
 return null;
}
export default function StarOSPanel({navigate}:{navigate:(page:OSDestination)=>void}){
 const [checks,setChecks]=useState<Checks>({agent:CHECKING,models:CHECKING});
 const [updated,setUpdated]=useState<string>('');
 const [refreshing,setRefreshing]=useState(false);
 const refresh=useCallback(async (signal:AbortSignal)=>{
  setRefreshing(true);
  setChecks({agent:CHECKING,models:CHECKING});
  const [agent,models]=await Promise.all([
   (async ():Promise<Service>=>{
    try{
     const response=await checkResponse('/api/agent/health',signal);
     const denied=classify(response);if(denied)return denied;
     const body=await response.json();
     if(body?.ok!==true)return {state:'error',note:'استجابة صحة غير صالحة'};
     const live=body.live_inference_tested===true;
     const probe=body.model_probe?.state;
     return {state:'online',note:live?'الوكيل والنموذج اختُبرا فعلياً':'الخادم يستجيب؛ حالة النموذج: '+(typeof probe==='string'?probe:'غير مؤكدة')};
    }catch(e){return {state:'error',note:e instanceof Error&&e.name==='AbortError'?'أُلغي الفحص':'تعذر قراءة صحة الوكيل'};}
   })(),
   (async ():Promise<Service>=>{
    try{
     const response=await checkResponse('/api/ai/cyber',signal,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'models'})
     });
     const denied=classify(response);if(denied)return denied;
     const body=await response.json();
     if(!Array.isArray(body?.data))return {state:'error',note:'قائمة النماذج غير صالحة'};
     return {state:'online',note:'النماذج المُعلنة: '+body.data.filter((x:unknown)=>typeof (x as {id?:unknown})?.id==='string').length+' (لا تثبت صلاحية الاستدلال)'};
    }catch(e){return {state:'error',note:e instanceof Error&&e.name==='AbortError'?'أُلغي الفحص':'تعذر جلب قائمة النماذج'};}
   })()
  ]);
  if(!signal.aborted){setChecks({agent,models});setUpdated(new Date().toLocaleTimeString('ar-IQ'));setRefreshing(false);}
 },[]);
 useEffect(()=>{const controller=new AbortController();void refresh(controller.signal);return ()=>controller.abort();},[refresh]);
 return <section className="star-os page-animate" dir="rtl" aria-label="STAR AI OS">
  <header className="star-os-header">
   <div><span className="eyebrow">STAR AI OS / UNIFIED CONSOLE</span>
    <h1>مركز قيادة <span>STAR AI OS</span></h1>
    <p>كل أدوات المشروع في مكان واحد. الروابط تفتح وظائفها الأصلية؛ مؤشرات الاتصال تأتي من الخوادم وليست بيانات عرض تجريبية.</p>
   </div>
   <button type="button" className="star-os-refresh" disabled={refreshing}
    onClick={()=>{const controller=new AbortController();void refresh(controller.signal);}}>
    {refreshing?'جارٍ الفحص...':'↻ إعادة فحص الاتصال'}
   </button>
  </header>
  <div className="star-os-health" aria-live="polite">
   <article className={'star-os-pulse '+checks.agent.state}>
    <div className="star-os-pulse-top"><strong>Railway Agent</strong><span>{STATUS[checks.agent.state]}</span></div>
    <p>{checks.agent.note}</p>
   </article>
   <article className={'star-os-pulse '+checks.models.state}>
    <div className="star-os-pulse-top"><strong>Cloud AI Catalog</strong><span>{STATUS[checks.models.state]}</span></div>
    <p>{checks.models.note}</p>
   </article>
   <article className="star-os-pulse manual">
    <div className="star-os-pulse-top"><strong>Cloud Terminal</strong><span>يدوي</span></div>
    <p>لا يُفتح اتصال Linux تلقائياً؛ استخدم لوحة الترمنال وابدأ جلسة مصادقاً عليها.</p>
   </article>
  </div>
  <div className="star-os-section-head"><div><span className="eyebrow">LIVE MODULES</span><h2>وحدات التحكم الست</h2></div><small>{updated?'آخر فحص: '+updated:'لم يكتمل التحقق بعد'}</small></div>
  <div className="star-os-grid">
   {destinations.map(item=><button type="button" key={item.id} className="star-os-module" onClick={()=>navigate(item.id)}>
    <div className="star-os-module-top"><span className="star-os-module-icon" aria-hidden="true">{item.icon}</span><span className="star-os-number">{item.number}</span></div>
    <strong dir="auto">{item.title}</strong><p>{item.body}</p>
    <div className="star-os-module-foot"><span>{item.hint}</span><span aria-hidden="true">←</span></div>
   </button>)}
  </div>
  <aside className="star-os-safety">
   <div><strong>حدود الوصول</strong><p>الدردشة لا تنفذ أوامر Linux مباشرة. الوكيل يعمل في حاوية معزولة ويتطلب موافقة منفصلة على التعديلات والاختبارات. لا تعني حالة Online نجاح مهمة فعلية.</p></div>
   <a href={REPO+'/actions'} target="_blank" rel="noopener noreferrer">فحوصات GitHub Actions ↗</a>
  </aside>
 </section>;
}
