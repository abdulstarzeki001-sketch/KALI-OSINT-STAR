import {useCallback,useEffect,useMemo,useState} from 'react';
import './tool-ops.css';

type LibraryTool={name:string;group:string;desc:string;repo:string;command:string};
type ToolStatus={
 id:string;name:string;group:string;installed:boolean;executable:string|null;
 versionAllowed:boolean;actions:string[];guide:string;mode:string;
};
type ProbeResult={
 tool_id:string;action:string;at:string;installed:boolean;executable:string|null;
 executed:boolean;exitCode:number|null;elapsedMs:number;stdout:string;stderr:string;
 outcome:string;note:string;
};
type Catalog={source:string;checkedAt:string;tools:ToolStatus[];history:ProbeResult[];notice:string};
type InstallPlan={policy:string;method:string;target?:string;readiness?:string;requirements?:string[];canInstall?:boolean;blockedReason?:string|null;package:string|null;command:string|null;compatibility:string;requiresApproval:boolean;executed:boolean;installedByManager:boolean};
type InstallJob={tool_id:string;status:'running'|'interrupted'|'succeeded'|'failed'|'timed_out';startedAt:string|null;finishedAt:string|null;exitCode:number|null;output:string};
type InstallCatalog={pythonVersion?:string|null;tools:Array<ToolStatus & {install:InstallPlan}>;summary:{total:number;installed:number;missing:number;automatedInstallsEnabled:boolean;approvedTools?:string[]};jobs?:Record<string,InstallJob>;busy?:boolean;persistence:{homePersisted:boolean;initialized:boolean;restoration:string}};
type ResultResponse={result:ProbeResult;plan?:{tool_id:string;action:string};
  explanation?:string|null;aiSource?:string;};
type Props={tools:LibraryTool[];favorites:string[];onToggleFavorite:(name:string)=>void;
 onDetails:(tool:LibraryTool)=>void;onOpenTerminal:()=>void;};
const targetLabels:Record<string,string>={
 railway_python_venv:'Railway — بيئة Python دائمة',
 railway_debian_apt:'Railway — حزم Debian',
 isolated_linux_service:'خدمة Linux معزولة مستقلة',
 isolated_linux_vm:'آلة Linux افتراضية معزولة',
 dedicated_container_stack:'حاويات وقاعدة بيانات مستقلة',
 dedicated_kali_vm:'آلة Kali Linux مستقلة',
 windows_vm:'مختبر Windows منفصل',
 isolated_network_range:'شبكة اختبار معزولة',
 dedicated_analysis_vm:'آلة تحليل منفصلة',
 dedicated_kernel_vm:'آلة افتراضية لاختبار النواة'
};
const readinessLabels:Record<string,string>={
 owner_approved:'مؤهلة للتثبيت بعد موافقة المالك',
 separate_environment:'تتطلب موارد وخدمة معزولة',
 manual_review:'تتطلب مراجعة توافق يدوية',
 incompatible_railway_linux:'غير متوافقة مع حاوية Railway الحالية'
};
const BASE='/api/terminal/tools';
const ids:Record<string,string>={
 'Mythic C2':'mythic','Sliver C2':'sliver','Havoc':'havoc','MITRE CALDERA':'caldera',
 'BloodHound CE':'bloodhound','Certipy':'certipy','Impacket':'impacket',
 'NetExec':'netexec','Rubeus':'rubeus','Mimikatz':'mimikatz',
 'Ligolo-ng':'ligolo','Frida':'frida','Ghidra':'ghidra','AFL++':'aflpp','Syzkaller':'syzkaller'};
const issues:Record<string,string>={
 ACCESS_REQUIRED:'سجّل دخولك عبر Cloudflare Access أولاً.',
 TOOLS_EDGE_UNAVAILABLE:'رابط Railway الآمن غير جاهز.',
 TOOLS_UPSTREAM_UNAVAILABLE:'محرك الأدوات في Railway غير متاح.',
 TOOLS_CATALOG_UNAVAILABLE:'تعذّر قراءة حالة الأدوات.',
 TOOLS_EXECUTION_UNAVAILABLE:'تعذّر تنفيذ فحص الأداة.',
 TOOLS_ASSISTANT_UNAVAILABLE:'تعذّر تشغيل مساعد الأدوات.',
 TOOLS_ACTION_NOT_ALLOWED:'هذا البرنامج لا يسمح بالتنفيذ الآلي؛ فحص التثبيت فقط.',
 TOOLS_REQUIRES_AUTHORIZED_LAB:'هذا الطلب يتطلب مختبراً مصرحاً به واعتماداً صريحاً، ولم يُنفذ أي أمر.',
 TOOLS_NAME_REQUIRED:'اذكر اسم أداة واحدة من المكتبة في طلبك.',
 TOOLS_AMBIGUOUS:'اذكر أداة واحدة فقط في كل طلب.',
 TOOLS_RATE_LIMIT:'طلب متكرر بسرعة؛ كرر بعد لحظة.',
 TOOLS_BUSY:'يوجد فحص قيد التنفيذ. حاول بعد انتهائه.',
 TOOLS_INVALID_ACTION:'الفعل المطلوب ليس ضمن الإجراءات المسموحة.',
 TOOLS_INVALID_PROMPT:'أدخل طلباً من 1 إلى 400 حرف.',
 TOOLS_BAD_JSON:'الطلب غير صالح.',
 TOOLS_INPUT_TOO_LARGE:'الطلب أكبر من الحد المسموح.',
 INSTALL_APPROVAL_REQUIRED:'التثبيت يحتاج موافقة صريحة من المالك.',
 INSTALL_TOOL_NOT_APPROVED:'التثبيت التلقائي غير معتمد لهذه الأداة.',
 INSTALL_PERSISTENCE_REQUIRED:'التخزين الدائم غير متصل بالحاوية.',
 INSTALL_TRUSTED_PYTHON_REQUIRED:'بيئة Python الموثوقة غير متاحة.',
 INSTALL_DISK_SPACE_LOW:'مساحة القرص الدائم غير كافية للتثبيت (250MB مطلوبة).',
 INSTALL_ENVIRONMENT_UNAVAILABLE:'تعذّر فحص بيئة تثبيت الأدوات.',
 INSTALL_STATE_UNWRITABLE:'تعذّر حفظ سجل التثبيت على القرص.',
 INSTALL_ALREADY_SUCCEEDED:'تم تثبيت الأداة بواسطة المدير مسبقاً.',
 INSTALL_BUSY:'يوجد تثبيت آخر جارٍ.',
 INSTALL_RATE_LIMIT:'طلب تثبيت متكرر بسرعة.',
 INSTALL_START_FAILED:'تعذّر بدء عملية التثبيت.',
 INSTALL_PYTHON_VERSION_UNSUPPORTED:'Certipy 5.1.0 يتطلب Python 3.12 أو أحدث؛ إصدار Python الموجود على Railway غير متوافق.',
 INSTALL_APT_NOT_READY:'مثبّت AFL++ المعتمد غير متاح.',
 INSTALL_APT_SCRIPT_UNTRUSTED:'ملف تثبيت AFL++ لا يملكه root أو غير موثوق.',
 INSTALL_ROOT_DISK_SPACE_LOW:'قرص نظام Railway لا يملك 750 MiB متاحة للتثبيت.',
 TOOLS_INSTALL_UNAVAILABLE:'خدمة تثبيت الأدوات غير متاحة.',
 TERMINAL_BRIDGE_UNAVAILABLE:'تعذّر الاتصال بالخدمة المحمية.'
};
async function api<T>(route:string,body:unknown={}):Promise<T>{
 const response=await fetch(BASE+'/'+route,{method:'POST',credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body)});
 const type=response.headers.get('content-type')||'';
 if(!type.includes('application/json'))throw Error('انتهت جلسة Cloudflare أو لم تُرجع البوابة JSON.');
 const data:unknown=await response.json();
 if(!data||typeof data!=='object')throw Error('بيانات الخادم غير صالحة');
 if(!response.ok){
  const code=String((data as Record<string,unknown>).code||'TOOLS_EXECUTION_UNAVAILABLE');
  throw Error(issues[code]||code+' — HTTP '+response.status);
 }
 return data as T;
}
function outcomeText(x:ProbeResult):string{
 if(x.outcome==='not_installed')return 'غير مثبت في حاوية Railway';
 if(x.outcome==='found')return 'عُثر على ملف الأداة. لم تُشغّل.';
 if(x.outcome==='completed')return 'اكتمل فحص الإصدار على Linux';
 if(x.outcome==='timeout')return 'انتهت مهلة فحص الإصدار';
 return 'فشل فحص الإصدار؛ راجع المخرجات';
}
export default function ToolOpsController({tools,favorites,onToggleFavorite,onDetails,onOpenTerminal}:Props){
 const [catalog,setCatalog]=useState<Catalog|null>(null);
 const [installCatalog,setInstallCatalog]=useState<InstallCatalog|null>(null);
 const [results,setResults]=useState<Record<string,ProbeResult>>({});
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState('');
 const [installBusy,setInstallBusy]=useState('');
 const [error,setError]=useState('');
 const [prompt,setPrompt]=useState('');
 const [aiAnswer,setAiAnswer]=useState('');
 const [aiMode,setAiMode]=useState('');
 const refresh=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const c=await api<Catalog>('catalog');
   if(!Array.isArray(c.tools)||c.tools.length!==15)throw Error('بيانات جرد الأدوات غير مكتملة.');
   setCatalog(c);
   try { const plans=await api<InstallCatalog>('install/catalog'); setInstallCatalog(plans); } catch { setInstallCatalog(null); }
   setResults(prev=>{
     const byId={...prev};
     for(const item of c.history||[])if(!byId[item.tool_id])byId[item.tool_id]=item;
     return byId;
   });
  }catch(e){setError(e instanceof Error?e.message:'خطأ قراءة الأدوات');}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 const installationRunning=!!installCatalog?.busy || Object.values(installCatalog?.jobs||{}).some(j=>j.status==='running');
 useEffect(()=>{if(!installationRunning)return;const timer=window.setInterval(()=>{void refresh();},5000);return()=>window.clearInterval(timer);},[installationRunning,refresh]);
 const statuses=useMemo(()=>new Map(catalog?.tools.map(x=>[x.id,x])||[]),[catalog]);
 async function run(tool:string,action:'inspect'|'version'){
  if(busy)return;
  setBusy(tool);setError('');setAiAnswer('');
  try{
   const response=await api<ResultResponse>('run',{tool_id:tool,action});
   setResults(prev=>({...prev,[tool]:response.result}));
   void refresh();
  }catch(e){setError(e instanceof Error?e.message:'فشل الفحص');}
  finally{setBusy('');}
 }
 async function useAssistant(){
  if(!prompt.trim()||prompt.length>400||busy)return;
  setBusy('assistant');setError('');setAiAnswer('');setAiMode('');
  try{
   const r=await api<ResultResponse>('assistant',{prompt:prompt.trim()});
   if(r.result?.tool_id)setResults(prev=>({...prev,[r.result.tool_id]:r.result}));
   setAiMode(r.aiSource||'rules');
   setAiAnswer(r.explanation?.trim()||(
    'تم توجيه الطلب إلى فحص محلي محدد فقط. '+(r.result?outcomeText(r.result):'')+
    ' لم تُرسل أوامر غير محددة إلى Bash.'));
   void refresh();
  }catch(e){setError(e instanceof Error?e.message:'فشل التوجيه');}
  finally{setBusy('');}
 }
 async function installTool(toolId:string,name:string){
  if(busy||installBusy||installCatalog?.busy)return;
  const plan=installCatalog?.tools.find(x=>x.id===toolId)?.install;
  if(plan?.canInstall===false){setError(issues[plan.blockedReason||'']||'بيئة التثبيت غير متوافقة مع متطلبات الأداة.');return;}
  const detail=toolId==='aflpp'?'من حزم Debian الموقّعة باستخدام APT، مع حفظ سجل الحزمة. قد يحتاج مساحة كبيرة من قرص النظام.':'داخل Python venv باستخدام PyPI، مع حفظ ملفات الأداة على وحدة التخزين الدائمة.';
  if(!window.confirm('هل توافق على تثبيت '+name+' على Railway؟ سيتم التثبيت '+detail))return;
  setInstallBusy(toolId);setError('');
  try{
   await api<{job:InstallJob}>('install/execute',{tool_id:toolId,approval:'I_APPROVE_RAILWAY_TOOL_INSTALL'});
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'فشل بدء التثبيت');}
  finally{setInstallBusy('');}
 }
 async function copy(text:string){try{await navigator.clipboard.writeText(text);}catch{setError('تعذر النسخ من هذا المتصفح');}}
 const installedCount=catalog?.tools.filter(x=>x.installed).length??null;
 return <section className="star-toolops" aria-label="مركز أدوات Linux الحقيقي">
  <div className="star-toolops-head">
   <div><span className="eyebrow">LIVE RAILWAY TOOL INVENTORY</span><h2>فحص وتشغيل الأدوات داخل Railway</h2>
    <p>هذه قائمة 15 أداة. يظهر الجرد ما هو مثبت فعلياً على Railway؛ أما بقية الأدوات فتحتاج تثبيتاً بموافقتك أو بيئة مختبر منفصلة.</p></div>
   <div className="star-toolops-count"><strong>{installedCount===null?'—':installedCount+'/15'}</strong><span>مثبتة فعلياً من أصل 15. {installCatalog?.summary?.approvedTools?.length??'—'} خيارات تثبيت بموافقتك، وليست أدوات مثبتة</span></div>
  </div>
  <div className="star-toolops-actions"><button type="button" disabled={loading||!!busy} onClick={()=>void refresh()}>{loading?'جارٍ الفحص...':'↻ فحص تثبيت الجميع'}</button>
    <button type="button" onClick={onOpenTerminal}>▣ الترمنال</button>
    {catalog&&<small>آخر جرد: {new Date(catalog.checkedAt).toLocaleString('ar-IQ')}</small>}
  </div>
  <form className="star-toolops-ai" onSubmit={e=>{e.preventDefault();void useAssistant();}}>
    <label htmlFor="star-toolops-prompt"><strong>STAR AI — اطلب استخدام أداة</strong><small>مثال: «افحص Frida» أو «اعرض إصدار NetExec». لا تُشغّل استغلالات أو خوادم C2 تلقائياً.</small></label>
    <div><input id="star-toolops-prompt" value={prompt} onChange={e=>setPrompt(e.target.value)}
     maxLength={400} placeholder="قل: افحص أداة Frida داخل Railway" dir="auto" autoComplete="off" />
      <button className="primary" type="submit" disabled={!prompt.trim()||!!busy}>{busy==='assistant'?'جارٍ الفحص...':'نفّذ الطلب الآمن'}</button></div>
    {aiAnswer&&<div role="status" className="star-toolops-ai-answer"><strong>{aiMode==='gateway'?'تحليل STAR AI':'نتيجة التوجيه الآمن'}</strong><p>{aiAnswer}</p>{aiMode==='gateway_unavailable'&&<small>المزوّد غير متاح؛ الفحص المحلي اكتمل ولكن دون تحليل AI.</small>}</div>}
  </form>
  {error&&<div className="star-toolops-error" role="alert">{error}</div>}
  <div className="tools-grid page-animate star-toolops-grid">{tools.map((tool,i)=>{
   const id=ids[tool.name];const st=statuses.get(id);const result=results[id];const install=installCatalog?.tools.find(x=>x.id===id)?.install;const job=installCatalog?.jobs?.[id];
   return <article className="tool-card star-toolops-card" key={tool.name}>
    <div className="tool-top"><span className="tool-index">{String(i+1).padStart(2,'0')}</span>
     <button title="المفضلة" className={'star '+(favorites.includes(tool.name)?'on':'')}
       onClick={()=>onToggleFavorite(tool.name)} type="button">★</button></div>
    <h3>{tool.name}</h3><span className="pill">{tool.group}</span><p>{tool.desc}</p>
    <div className={'star-toolops-state '+(!st?'unknown':st.installed?'installed':'missing')}>
      <span>{!st?'○ لم يُفحص':st.installed?'● مثبت في Railway':install?.policy==='owner_one_click'?'○ غير مثبت — يمكن تثبيتها بموافقتك':install?.policy==='manual_review'?'○ غير مثبت — يحتاج مراجعة يدوية':'○ غير مثبت — يحتاج بيئة منفصلة'}</span>
      {st?.executable&&<code dir="ltr">{st.executable}</code>}
    </div>
    <details className="star-toolops-guide"><summary>حالة وخطة التثبيت</summary>
      {install?<><p>{install.compatibility}</p><p><strong>بيئة التشغيل:</strong> {targetLabels[install.target||'']||install.target||'غير محددة'}</p><p><strong>الجاهزية:</strong> {readinessLabels[install.readiness||'']||install.readiness||'مراجعة'}</p>{Array.isArray(install.requirements)&&install.requirements.length>0&&<ul>{install.requirements.map((req,index)=><li key={index}>{req}</li>)}</ul>}<p>السياسة: {install.policy==='owner_one_click'?'تثبيت بضغطة واحدة بعد موافقة المالك':install.policy==='owner_terminal_approval'?'تثبيت يدوي بموافقة المالك':install.policy==='manual_review'?'مراجعة يدوية': 'مختبر منفصل'}</p>{install.command&&<div className="star-toolops-command"><code dir="ltr">{install.command}</code><button type="button" onClick={()=>void copy(install.command!)}>نسخ</button></div>}<small>الأوامر مرجعية. التثبيت المباشر لا يُنفّذ إلا بعد موافقتك، وللأدوات المعتمدة فقط.</small>{install.blockedReason==='INSTALL_PYTHON_VERSION_UNSUPPORTED'&&<p role="status">Certipy 5.1.0 غير متوافق حالياً: Python المكتشف {installCatalog?.pythonVersion||'غير معروف'}؛ المطلوب 3.12 أو أحدث. لن يُشغَّل التثبيت قبل تصحيح بيئة Python.</p>}</>:<p>خطة التثبيت غير متاحة من البوابة حالياً.</p>}
      {install?.policy==='owner_one_click'&&!st?.installed&&<button type="button" disabled={!!installBusy||!!busy||!!installCatalog?.busy||job?.status==='running'||install.canInstall===false} onClick={()=>void installTool(id,tool.name)}>
        {installBusy===id?'جارٍ إرسال الطلب...':job?.status==='running'?'التثبيت جارٍ...':install.canInstall===false?'غير متوافق مع Python الحالي':'تثبيت مباشر بموافقتي'}
       </button>}
      {job&&<div className="star-toolops-result" role="status">
        <strong>{job.status==='succeeded'?(st?.installed?'اكتمل التثبيت وتم اكتشاف الأداة':'سجل التثبيت ناجح، لكن الأداة غير مكتشفة حالياً؛ افحص حالتها'):job.status==='running'?'جارٍ تنزيل وتثبيت الأداة':job.status==='timed_out'?'انتهت مهلة التثبيت':job.status==='interrupted'?'توقف التثبيت بعد إعادة تشغيل الخادم':'فشل التثبيت؛ راجع السجل'}</strong>
        {job.output&&<pre dir="ltr">{job.output.slice(-1600)}</pre>}
       </div>}
    </details>
    <details className="star-toolops-guide"><summary>المميزات وطريقة التشغيل</summary>
      <p>{st?.guide||'اعرض حالة التثبيت أولاً. تشغيل الأدوات المتقدمة يحتاج مختبراً مخصصاً.'}</p>
      <div className="star-toolops-command"><code dir="ltr">{tool.command}</code>
       <button type="button" onClick={()=>void copy(tool.command)}>نسخ</button></div>
      <small>الأمر مرجعي فقط. تشغيل الأدوات عالية التأثير يحتاج بيئة مفوضة وتجهيزاتها الخاصة.</small>
    </details>
    <div className="star-toolops-buttons">
      <button type="button" disabled={!!busy||!catalog} onClick={()=>void run(id,'inspect')}>{busy===id?'جارٍ الفحص':'تحقق من التثبيت'}</button>
      <button type="button" disabled={!!busy||!st?.versionAllowed} onClick={()=>void run(id,'version')}>إصدار</button>
      <button type="button" onClick={()=>onDetails(tool)}>تفاصيل</button>
    </div>
    {result&&<div className="star-toolops-result" aria-live="polite">
      <strong>{outcomeText(result)}</strong>
      <small>{result.at?new Date(result.at).toLocaleString('ar-IQ'):''} · {result.executed?'برنامج شُغّل':'جرد فقط'}{result.exitCode!==null?' · exit '+result.exitCode:''}</small>
      {(result.stdout||result.stderr)&&<pre dir="ltr">{(result.stdout||result.stderr).slice(0,2200)}</pre>}
    </div>}
    <div className="tool-actions"><button type="button" onClick={onOpenTerminal}>فتح الترمنال</button>
     <a href={tool.repo} target="_blank" rel="noopener noreferrer">GitHub ↗</a></div>
   </article>;
  })}</div>
 </section>;
}
