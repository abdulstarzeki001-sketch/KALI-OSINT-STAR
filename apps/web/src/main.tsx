import React, {useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ReactLenis} from 'lenis/react';
import {gsap} from 'gsap';
import {useGSAP} from '@gsap/react';
import './styles.css';
import './operations.css';
import './github-unified.css';
import {OperationsPanel} from './OperationsPanel';
// Defer the Markdown renderer to the STAR AI screen.
const StarAIPanel = React.lazy(() => import('./StarAIPanel'));
const AgentChatPanel = React.lazy(() => import('./AgentChatPanel'));
const CloudTerminalPanel = React.lazy(() => import('./CloudTerminalPanel'));
const TrainingPanel = React.lazy(() => import('./TrainingPanel'));
const ToolOpsController = React.lazy(() => import('./ToolOpsController'));
import type {TrainingSummary} from './TrainingPanel';

gsap.registerPlugin(useGSAP);
type Page = 'dashboard'|'tools'|'platforms'|'labs'|'workflows'|'roadmap'|'reports'|'operations'|'terminal'|'ai'|'agent'|'settings';
type Tool = {name:string, group:string, desc:string, repo:string, command:string};
type Lab = {id:number,platform:string,target:string,title:string,status:'جديد'|'قيد العمل'|'مكتمل'};
const links: {id:Page,label:string,ico:string}[] = [
{id:'dashboard',label:'نظرة عامة',ico:'▦'},{id:'tools',label:'مكتبة الأدوات',ico:'◈'},
{id:'platforms',label:'منصات التدريب',ico:'⌖'},{id:'labs',label:'المختبرات',ico:'⌬'},
{id:'workflows',label:'مسارات العمل',ico:'↬'},{id:'reports',label:'التقارير',ico:'▤'},
{id:'roadmap',label:'التدريب الموثق',ico:'◉'},{id:'operations',label:'مركز العمليات',ico:'◇'},
{id:'terminal',label:'الترمنال',ico:'⌘'},{id:'ai',label:'STAR AI',ico:'✧'},
{id:'agent',label:'AI Agent',ico:'✳'},{id:'settings',label:'الإعدادات',ico:'⚙'}];
const toolList:Tool[]=[
{name:'Mythic C2',group:'Red Team',desc:'تنظيم اختبارات محاكاة الخصوم في مختبر معزول',repo:'https://github.com/its-a-feature/Mythic',command:'./mythic-cli health'},
{name:'Sliver C2',group:'Red Team',desc:'محاكاة الاتصال بخادم قيادة وتحكم مصرح به',repo:'https://github.com/BishopFox/sliver',command:'sliver-server version'},
{name:'Havoc',group:'Red Team',desc:'دراسة أطر محاكاة ما بعد الوصول',repo:'https://github.com/HavocFramework/Havoc',command:'./havoc server --help'},
{name:'MITRE CALDERA',group:'Purple Team',desc:'قياس تغطية الرصد وفق ATT&CK',repo:'https://github.com/apache/caldera',command:'python3 server.py --help'},
{name:'BloodHound CE',group:'Identity',desc:'تمثيل مسارات الامتيازات في Active Directory التجريبي',repo:'https://github.com/SpecterOps/BloodHound',command:'bloodhound --help'},
{name:'Certipy',group:'Identity',desc:'مراجعة إعدادات شهادات AD CS',repo:'https://github.com/ly4k/Certipy',command:'certipy-ad -h'},
{name:'Impacket',group:'Windows',desc:'تحليل بروتوكولات SMB وKerberos وRPC',repo:'https://github.com/fortra/impacket',command:'impacket-lookupsid -h'},
{name:'NetExec',group:'Windows',desc:'جرد صلاحيات وخدمات Windows المختبرية',repo:'https://github.com/Pennyw0rth/NetExec',command:'nxc --help'},
{name:'Rubeus',group:'Windows',desc:'أبحاث جلسات Kerberos في Windows VM',repo:'https://github.com/GhostPack/Rubeus',command:'Rubeus.exe currentluid'},
{name:'Mimikatz',group:'Windows',desc:'دراسة حماية الاعتماد ضمن بيئة تدريب',repo:'https://github.com/gentilkiwi/mimikatz',command:'standard::version'},
{name:'Ligolo-ng',group:'Network',desc:'دراسة العزل والشبكات والأنفاق المحلية',repo:'https://github.com/nicocha30/ligolo-ng',command:'./proxy -h'},
{name:'Frida',group:'Reverse',desc:'تحليل التطبيقات أثناء التنفيذ',repo:'https://github.com/frida/frida',command:'frida-ps -al'},
{name:'Ghidra',group:'Reverse',desc:'هندسة عكسية للبرامج التجريبية',repo:'https://github.com/NationalSecurityAgency/ghidra',command:'ghidra'},
{name:'AFL++',group:'Research',desc:'اختبار Fuzzing واكتشاف أعطال قابلة للإعادة',repo:'https://github.com/AFLplusplus/AFLplusplus',command:'afl-fuzz -h'},
{name:'Syzkaller',group:'Research',desc:'تحليل أخطاء النواة داخل QEMU',repo:'https://github.com/google/syzkaller',command:'./bin/syz-manager -h'}];
const providers=[
{name:'PortSwigger Academy',type:'Web Security',link:'https://portswigger.net/web-security'},
{name:'Hack The Box',type:'Machines / AD',link:'https://app.hackthebox.com'},
{name:'TryHackMe',type:'Guided Labs',link:'https://tryhackme.com'},
{name:'PentesterLab',type:'Web App Security',link:'https://pentesterlab.com'},
{name:'Root-Me',type:'CTF / Reverse',link:'https://www.root-me.org'},
{name:'OverTheWire',type:'Linux / Shell',link:'https://overthewire.org/wargames'},
{name:'picoCTF',type:'CTF',link:'https://picoctf.org'},
{name:'VulnHub',type:'Offline VM',link:'https://www.vulnhub.com'},
{name:'CyberDefenders',type:'DFIR / Blue Team',link:'https://cyberdefenders.org'},
{name:'Blue Team Labs Online',type:'SOC / IR',link:'https://blueteamlabs.online'}];
const weeks=[
'بيئة Kali والمختبر المعزول',
'Identity: BloodHound وCertipy',
'Windows: Impacket وNetExec وKerberos',
'Red Team: Mythic وSliver وHavoc',
'CALDERA وتقسيم الشبكة',
'Frida والتحليل الديناميكي',
'Ghidra وAFL++',
'Syzkaller والتقرير النهائي'];
function stored<T>(key:string, initial:T):[T,React.Dispatch<React.SetStateAction<T>>]{
 const [value,setValue]=useState<T>(()=>{try {const s=localStorage.getItem(key);return s?JSON.parse(s) as T:initial;}catch{return initial;}});
 useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}},[key,value]);
 return [value,setValue];
}
function safeTarget(value:string):boolean{
 const s=value.trim();if(s.length<3||s.length>250)return false;
 const deny=['portswigger.net','hackthebox.com','tryhackme.com','pentesterlab.com','root-me.org','overthewire.org','picoctf.org','vulnhub.com','cyberdefenders.org','blueteamlabs.online'];
 let hostname=s.toLowerCase();
 try {if(/^https?:\/\//.test(s))hostname=new URL(s).hostname.toLowerCase();else hostname=s.split('/')[0].split(':')[0].toLowerCase();}catch{return false;}
 return !deny.some(x=>hostname===x||hostname.endsWith('.'+x));
}
function readPageFromHash(): Page {
  const candidate = window.location.hash.slice(1);
  return links.some(link => link.id === candidate) ? candidate as Page : 'dashboard';
}
function App(){
 const [page,setPage]=useState<Page>(readPageFromHash);
 const [search,setSearch]=useState('');
 const [filter,setFilter]=useState('الكل');
 const [labs,setLabs]=stored<Lab[]>('kos-labs',[]);
 const [trainingProgress,setTrainingProgress]=useState<TrainingSummary|null>(null);
 const [favorites,setFavorites]=stored<string[]>('kos-favorites',[]);
 const [target,setTarget]=useState('');
 const [labTitle,setLabTitle]=useState('');
 const [provider,setProvider]=useState('Hack The Box');
 const [modal,setModal]=useState<Tool|null>(null);
 const [menu,setMenu]=useState(false);
 const [api,setApi]=useState<'offline'|'online'>('offline');
 const [message,setMessage]=useState('');
 const root=useRef<HTMLDivElement>(null);
  // iPhone: keep section URLs shareable and support Safari Back/Forward.
  const navigate = (next: Page) => {
    setPage(next);
    if (window.location.hash !== '#'+next) window.location.hash = next;
  };
  useEffect(() => {
    const onHashChange = () => { setPage(readPageFromHash()); setMenu(false); };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
 useGSAP(()=>{gsap.fromTo('.page-animate',{opacity:0,y:18},{opacity:1,y:0,duration:.52,stagger:.035,ease:'power2.out',clearProps:'transform,opacity'});},{scope:root,dependencies:[page],revertOnUpdate:true});
 useEffect(()=>{const ctrl=new AbortController();fetch('/api/v1/health',{signal:ctrl.signal}).then(x=>x.ok?x.json():null).then(x=>setApi(x?.status==='ok'?'online':'offline')).catch(()=>setApi('offline'));return()=>ctrl.abort();},[]);
 useEffect(()=>{const ctrl=new AbortController();
   fetch('/api/terminal/training/status',{method:'POST',credentials:'same-origin',
     cache:'no-store',signal:ctrl.signal,headers:{'Content-Type':'application/json'},body:'{}'})
     .then(r=>r.ok?r.json():null).then(data=>{
       if(!ctrl.signal.aborted&&data?.summary?.schema===1)setTrainingProgress(data.summary as TrainingSummary);
     }).catch(()=>{});
   return()=>ctrl.abort();
 },[]);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();navigate('tools');window.setTimeout(()=>document.getElementById('tool-search')?.focus(),80);}if(e.key==='Escape'){setModal(null);setMenu(false)}};addEventListener('keydown',onKey);return()=>removeEventListener('keydown',onKey)},[]);
 const show=(text:string)=>{setMessage(text);window.setTimeout(()=>setMessage(''),2800);};
 const copy=(s:string)=>{navigator.clipboard?.writeText(s).then(()=>show('تم النسخ')).catch(()=>show('تعذر النسخ'))};
 const visible=useMemo(()=>toolList.filter(t=>(filter==='الكل'||t.group===filter)&&(t.name+' '+t.group+' '+t.desc).toLowerCase().includes(search.toLowerCase())),[filter,search]);
 const percent=trainingProgress?.percent;
 const verifiedWeeks=trainingProgress?.weeks.filter(x=>x.verified)||[];
 function addLab(e:React.FormEvent){e.preventDefault();if(!safeTarget(target)){show('سجّل عنوان المختبر المخصص لك، وليس الموقع الرئيسي للمنصة');return;}setLabs(x=>[{id:Date.now(),platform:provider,title:labTitle.trim()||'مختبر جديد',target:target.trim(),status:'جديد'},...x]);setLabTitle('');setTarget('');show('تم حفظ المختبر محلياً');}
 function exportReport(){const content=['# KALI-OSINT-STAR','التاريخ: '+new Date().toISOString(),'الأسابيع الموثقة على Railway: '+(trainingProgress?trainingProgress.completed+'/'+weeks.length:'غير متاح'),'المختبرات: '+labs.length,'','## إثبات الإنجاز','المصدر: مصحح Railway، لا علامات صح محلية',...verifiedWeeks.map(w=>w.id+' | VERIFIED | '+w.verifiedAt),'','## المختبرات',...labs.map(x=>'- '+x.title+' | '+x.platform+' | '+x.status)].join('\n');const blob=new Blob([content],{type:'text/markdown;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='kali-osint-star-report.md';a.click();URL.revokeObjectURL(a.href);}
 return <ReactLenis root options={{lerp:0.09,smoothWheel:true}}><div className={"app app-github-theme "+(page==="terminal"?"terminal-page":"")} ref={root} dir="rtl">
 <aside className={'sidebar '+(menu?'visible':'')} id="primary-sidebar">
  <button type="button" className="identity" onClick={()=>{navigate('dashboard');setMenu(false)}} aria-label="العودة إلى نظرة عامة">
    <span className="brand-mark" aria-hidden="true">◈<span className="brand-spark"/></span>
    <span className="brand-type"><strong>STAR<span> / </span>CYBER</strong><small>RANGE OPERATIONS</small></span>
  </button>
  <div className="section-label">WORKSPACE <span>01</span></div>
  <nav aria-label="الصفحات الرئيسية">{links.slice(0,5).map(x=><button key={x.id} type="button" className={'nav '+(page===x.id?'active':'')} aria-current={page===x.id?'page':undefined} onClick={()=>{navigate(x.id);setMenu(false);window.scrollTo({top:0,behavior:'smooth'})}}><span className="navico" aria-hidden="true">{x.ico}</span><span>{x.label}</span>{x.id==='tools'&&<span className="nav-count">15</span>}{page===x.id&&<span className="nav-active-dot" aria-hidden="true"/>}</button>)}</nav>
  <div className="section-label section-label-secondary">OPERATIONS</div>
  <nav aria-label="الأدوات والخدمات السحابية">{links.slice(5).map(x=><button key={x.id} type="button" className={'nav '+(page===x.id?'active':'')} aria-current={page===x.id?'page':undefined} onClick={()=>{navigate(x.id);setMenu(false);window.scrollTo({top:0,behavior:'smooth'})}}><span className="navico" aria-hidden="true">{x.ico}</span><span>{x.label}</span>{page===x.id&&<span className="nav-active-dot" aria-hidden="true"/>}</button>)}</nav>
  <div className="sidebar-bottom">
    <div className="side-promo"><span className="side-promo-tag">✧ LEARNING PATH</span><strong>رحلتك الأمنية تبدأ هنا.</strong><p>ثمانية أسابيع من التدريب المتحقق منه عبر Railway.</p><button type="button" onClick={()=>{navigate('roadmap');setMenu(false)}}>ابدأ التدريب ←</button></div>
    <div className="runtime"><span className={'dot '+(api==='online'?'live':'')}/><div><strong>{api==='online'?'API متصل':'مساحة عمل محمية'}</strong><small>الترمنال السحابي متاح من تبويبه بعد المصادقة</small></div></div>
    <a href="https://github.com/abdulstarzeki001-sketch/KALI-OSINT-STAR" target="_blank" rel="noreferrer">↗ GitHub Repository</a>
  </div>
 </aside>
 <div className="shell"><header className="topbar">
  <button type="button" className="mobile-toggle" aria-label={menu?'إغلاق القائمة':'فتح القائمة'} aria-expanded={menu} aria-controls="primary-sidebar" onClick={()=>setMenu(x=>!x)}>☰</button>
  <div className="breadcrumb"><span>WORKSPACE</span><b aria-hidden="true">/</b><strong>{links.find(x=>x.id===page)?.label}</strong></div>
  <div className="top-right">
    <button className="topbar-search" type="button" onClick={()=>{navigate('tools');setMenu(false);window.setTimeout(()=>document.getElementById('tool-search')?.focus(),80)}}><span>⌕</span><span>البحث في الأدوات</span><kbd>⌘ K</kbd></button>
    <span className="status-label"><span className={'dot '+(api==='online'?'live':'')}/>{api==='online'?'API ONLINE':'STAR CLOUD'}</span>
    <span className="avatar" aria-label="STAR CYBER">SK</span>
  </div>
 </header>
 <main>
 {page==='dashboard'&&<>
 <div className="page-meta page-animate"><span>— SECURITY TRAINING OPERATIONS</span><span>2026 — CYBER RANGE</span></div>
 <div className="welcome-line page-animate"><div><h1>مركز العمليات <span>السيبرانية<span className="h1-period">.</span></span></h1><p>كل أدواتك. كل مختبراتك. مسار واحد نحو احتراف الأمن السيبراني.</p></div><span className="training-pill">● SECURE WORKSPACE</span></div>
 <section className="hero page-animate" aria-label="منصة STAR CYBER">
  <div className="hero-grid" aria-hidden="true"/>
  <div className="hero-content"><div className="hero-super">STAR SECURITY ACADEMY <span>V 1.0</span></div>
   <h2>من المعرفة إلى<br/><span className="shiny-text">القدرة الفعلية.</span></h2>
   <p>منصة تجمع التدريب العملي والتحليل الدفاعي وSTAR AI وترمنال Linux سحابي معزول، مع الحفاظ على نطاقات العمل المصرح بها.</p>
   <div className="hero-actions"><button className="primary" onClick={()=>navigate('terminal')}>فتح STAR Terminal ←</button><button className="ghost" onClick={()=>navigate('tools')}>مكتبة الأدوات ↗</button><button className="ghost" onClick={()=>navigate('labs')}>المختبرات</button></div>
  </div>
  <div className="hero-art" aria-hidden="true"><div className="radar-ring ring-one"/><div className="radar-ring ring-two"/><div className="radar-ring ring-three"/><div className="radar-center">◈</div><div className="radar-label radar-label-a">[ SECURE ZONE ]</div><div className="radar-label radar-label-b">15 MODULES</div><div className="radar-cross"/></div>
  <div className="hero-bottom"><span>● LAB ISOLATED</span><span>DESIGNED TO DEFEND ↗</span></div>
 </section>
 <div className="stat-grid page-animate">
  <div className="stat"><div className="stat-top">الأدوات المتاحة <span className="stat-icon">◈</span></div><strong>15</strong><small>مكتبة أدوات مرتبطة بمركز التنفيذ</small></div>
  <div className="stat"><div className="stat-top">المختبرات المسجلة <span className="stat-icon violet">⌬</span></div><strong>{labs.length}</strong><small>محفوظة في هذا المتصفح</small></div>
  <div className="stat"><div className="stat-top">منصات التدريب <span className="stat-icon amber">↬</span></div><strong>10</strong><small>مصادر التعلّم المصرّح بها</small></div>
  <div className="stat"><div className="stat-top">التقدم الموثق <span className="stat-icon blue">◉</span></div><strong>{percent===undefined?'—':percent+'%'}</strong><small>يُقرأ من نتائج Railway بعد الدخول</small></div>
 </div>
 <section className="terminal-launch page-animate" aria-label="STAR Terminal المدمج">
   <div className="terminal-launch-details">
     <div className="terminal-launch-name"><span className="terminal-launch-icon" aria-hidden="true">⌘</span><div><span className="eyebrow">SECURE CLOUD TERMINAL</span><h2>STAR Terminal <small>داخل KALI-OSINT-STAR</small></h2></div></div>
     <p>ترمنال حقيقي لبرامج Linux وSTAR KALI، مع مساعد STAR AI وإدارة النسخ المحفوظة. يعمل داخل Railway وليس على اللابتوب أو الآيفون.</p>
     <div className="terminal-launch-tags"><span>Cloudflare Access</span><span>WebSocket محمي</span><span>ملفات دائمة</span></div>
   </div>
   <div className="terminal-launch-actions">
     <button className="primary" type="button" onClick={()=>navigate('terminal')}>فتح الترمنال المدمج <span aria-hidden="true">←</span></button>
     <span>بعد فتحه اضغط «اتصال» لإنشاء جلسة آمنة.</span>
     <code dir="ltr">star-kali health</code>
   </div>
 </section>
 <div className="section-head page-animate"><h2>مجالات التدريب</h2><button onClick={()=>navigate('roadmap')}>المسار الكامل ←</button></div><div className="feature-grid page-animate"><div className="feature"><i>01 / RESEARCH</i><h3>OSINT & Recon</h3><p>جمع المعلومات العامة وتحليل المؤشرات ضمن قواعد الخصوصية ونطاقك.</p><button onClick={()=>navigate('platforms')}>استعرض المنصات ←</button></div><div className="feature"><i>02 / IDENTITY</i><h3>Active Directory</h3><p>تحليل علاقات الثقة ومراجعة إعدادات شهادات Windows في مختبرك.</p><button onClick={()=>{navigate('tools');setFilter('Identity')}}>استعرض الأدوات ←</button></div><div className="feature"><i>03 / DEFENSE</i><h3>Purple Team</h3><p>قياس الرصد والاستجابة وتوثيق الثغرات والتوصيات الدفاعية.</p><button onClick={()=>navigate('reports')}>إنشاء تقرير ←</button></div></div></>}
 {page==='tools'&&<>
  <div className="page-title page-animate"><span className="eyebrow">TOOLS LIBRARY / LIVE RAILWAY</span>
    <h1>مكتبة الأدوات <em>15</em></h1>
    <p>حالة تثبيت حقيقية، فحوص محددة ونتائج داخل كل بطاقة؛ الوصول للتنفيذ عبر Cloudflare Access وRailway. الفحص لا يعني تشغيل كل وظيفة هجومية.</p></div>
  <div className="toolbar page-animate">
    <input id="tool-search" value={search} onChange={e=>setSearch(e.target.value)}
      placeholder="ابحث عن أداة أو تخصص..." aria-label="بحث الأدوات"/>
    <div className="chips">{['الكل','Red Team','Purple Team','Identity','Windows','Network','Reverse','Research'].map(x=>
      <button className={filter===x?'selected':''} key={x} onClick={()=>setFilter(x)}>{x}</button>)}</div>
  </div>
  <React.Suspense fallback={<div className="empty" role="status">جارٍ تحميل مركز الأدوات الفعلي...</div>}>
   <ToolOpsController tools={visible} favorites={favorites}
      onToggleFavorite={name=>setFavorites(old=>old.includes(name)?old.filter(x=>x!==name):[...old,name])}
      onDetails={setModal} onOpenTerminal={()=>navigate('terminal')}/>
  </React.Suspense>
  {visible.length===0&&<div className="empty">لا توجد أدوات تطابق البحث.</div>}
 </>}
 {page==='platforms'&&<>
 <div className="page-meta page-animate"><span>AUTHORIZED PLATFORMS / TRAINING TARGETS</span><span>02 / 05</span></div>
 <div className="page-title page-animate"><span className="eyebrow">TRAINING PROVIDERS</span><h1>منصات التدريب <em>10</em></h1><p>تُستخدم الآلات والمختبرات التي خُصصت لك من المنصة. مواقع المنصات الرئيسية ليست أهداف اختبار.</p></div>
 <div className="scope-banner page-animate"><span aria-hidden="true">◎</span><div><strong>نطاق الاختبار المصرح به</strong><p>افتح منصة التدريب، ثم استخدم فقط هدف المختبر المخصص لحسابك وأضفه من صفحة «المختبرات».</p></div><button className="ghost" type="button" onClick={()=>navigate('labs')}>إدارة المختبرات ←</button></div>
 <div className="platform-grid page-animate">{providers.map((x,i)=><article className="platform-card" key={x.name}>
  <div className="platform-top"><span className="platform-order">/{String(i+1).padStart(2,'0')}</span><span className="platform-kind">TRAINING</span></div>
  <div className="platform-emblem" aria-hidden="true">{['◈','◇','⌬','◉','✣','⌘','✦','▣','◎','⬡'][i]}</div>
  <h3>{x.name}</h3><small>{x.type}</small><p>مختبرات تدريب وتحديات عملية لتطوير مهارات الأمن السيبراني ضمن قواعد المنصة.</p>
  <div className="platform-scope">✓ الوصول إلى أهداف التدريب المخصصة فقط</div>
  <a className="platform-open" href={x.link} target="_blank" rel="noopener noreferrer">فتح المنصة الرسمية ↗</a>
 </article>)}</div>
 </>}
 {page==='labs'&&<><div className="page-title page-animate"><span className="eyebrow">AUTHORIZED WORKSPACE</span><h1>إدارة المختبرات</h1><p>أضف عنوان مختبرك المخصص لأغراض التوثيق فقط، بدون أي اتصال أو فحص تلقائي.</p></div><form className="lab-form page-animate" onSubmit={addLab}><label>منصة المختبر<select value={provider} onChange={e=>setProvider(e.target.value)}>{providers.map(x=><option key={x.name}>{x.name}</option>)}</select></label><label>اسم التمرين<input value={labTitle} onChange={e=>setLabTitle(e.target.value)} placeholder="مثال: Linux privilege audit" /></label><label>عنوان الهدف المخصص لك<input value={target} onChange={e=>setTarget(e.target.value)} required placeholder="مثال: 10.10.10.10 أو رابط Lab معين"/></label><button className="primary" type="submit">إضافة المختبر +</button></form><div className="lab-list page-animate">{labs.map(x=><article key={x.id} className="lab-row"><div><b>{x.title}</b><p>{x.platform} · <code>{x.target}</code></p></div><div className="lab-buttons"><select value={x.status} onChange={e=>setLabs(a=>a.map(y=>y.id===x.id?{...y,status:e.target.value as Lab['status']}:y))}><option>جديد</option><option>قيد العمل</option><option>مكتمل</option></select><button onClick={()=>setLabs(a=>a.filter(y=>y.id!==x.id))} aria-label="حذف">حذف</button></div></article>)}{labs.length===0&&<div className="empty">لا توجد مختبرات مسجلة بعد.</div>}</div></>}
 {page==='roadmap'&&<React.Suspense fallback={<div className="report-panel" role="status">جارٍ تحميل المختبرات الموثقة...</div>}><TrainingPanel onProgress={setTrainingProgress} onOpenTerminal={()=>navigate('terminal')}/></React.Suspense>}
 {page==='workflows'&&<>
 <div className="page-meta page-animate"><span>BLUEPRINTS / PRESET FLOWS</span><span>03 / 05</span></div>
 <div className="page-title page-animate"><span className="eyebrow">OPERATION BLUEPRINTS</span><h1>مسارات العمل</h1><p>مسارات تحليل وتدريب دفاعي: اختر مجالاً لتصفية الأدوات، ولا تبدأ أي عملية تنفيذ تلقائية.</p></div>
 <div className="workflow-grid page-animate">
 {[
 {title:'مراجعة هوية المؤسسة',tag:'IDENTITY',group:'Identity',symbol:'◇',desc:'مراجعة العلاقات والصلاحيات وإعدادات شهادات Active Directory.'},
 {title:'قياس الرصد والاستجابة',tag:'PURPLE TEAM',group:'Purple Team',symbol:'◎',desc:'تنظيم قياس تغطية الكشف والاستجابة داخل المختبر المعزول.'},
 {title:'دورة أبحاث الثغرات',tag:'RESEARCH',group:'Research',symbol:'✣',desc:'تحليل عينات واختبارات سلامة داخل بيئة بحثية مفوضة.'}
 ].map((x,i)=><article className="workflow-card" key={x.tag}><span className="workflow-order">0{i+1} / BLUEPRINT</span><span className="workflow-symbol">{x.symbol}</span><span className="eyebrow">{x.tag}</span><h3>{x.title}</h3><p>{x.desc}</p><button className="ghost" type="button" onClick={()=>{setFilter(x.group);navigate('tools')}}>عرض الأدوات المناسبة ←</button></article>)}
 </div><p className="workflow-note">هذه مخططات تدريب لا تقوم بفحص أهداف أو تنفيذ أوامر تلقائياً.</p>
 </>}
 {page==='reports'&&<><div className="page-title page-animate"><span className="eyebrow">REPORTING CENTER</span><h1>تقارير التدريب</h1><p>أنشئ تقرير Markdown يعكس بياناتك المحفوظة محلياً، ولا يدّعي تنفيذ فحوص.</p></div><div className="report-panel page-animate"><h2>تقرير STAR OSINT</h2><p>عدد المختبرات: <b>{labs.length}</b></p><p>الأسابيع الموثقة: <b>{trainingProgress?trainingProgress.completed+'/'+weeks.length:'تعذّر التحقق'}</b></p><p>الأدوات المفضلة: <b>{favorites.length}</b></p><button className="primary" onClick={exportReport}>↓ تصدير Markdown</button></div></>}
 {page==='operations'&&<OperationsPanel/>}
 {page==='terminal'&&<React.Suspense fallback={<div className="report-panel" role="status">جارٍ تحميل الترمنال...</div>}><CloudTerminalPanel/></React.Suspense>}
 {page==='ai'&&<React.Suspense fallback={<div role="status" className="report-panel" aria-live="polite">جارٍ تحميل STAR AI...</div>}><StarAIPanel/></React.Suspense>}
 {page==='agent'&&<React.Suspense fallback={<div role="status" className="report-panel" aria-live="polite">جارٍ تجهيز AI Agent...</div>}><AgentChatPanel/></React.Suspense>}
  {page==='settings'&&<><div className="page-title page-animate"><span className="eyebrow">SYSTEM SETTINGS</span><h1>إعدادات مساحة العمل</h1><p>المختبرات والمفضلة محفوظة في المتصفح؛ أما نتائج التدريب المصححة فتحفظ على Railway وتُقرأ عند تسجيل الدخول.</p></div><div className="settings-panel page-animate"><div><strong>حالة API المحلية</strong><p>{api==='online'?'الاتصال بخادم FastAPI ناجح':'لم يتصل المتصفح بخادم FastAPI'}</p></div><div><strong>STAR Terminal</strong><p>ترمنال حقيقي داخل Railway، يتطلب Cloudflare Access والضغط على اتصال. نتائج التمارين تُصحّح في الخادم.</p></div><div><strong>حفظ البيانات</strong><p>localStorage داخل المتصفح الحالي</p></div><button className="danger-action" onClick={()=>{if(confirm('حذف المختبرات والمفضلة المحلية فقط؟ نتائج التدريب الموثقة في Railway لن تُحذف.')){setLabs([]);setFavorites([]);show('تم مسح البيانات المحلية فقط')}}}>مسح البيانات المحلية</button></div></>}
 </main><footer>© KALI-OSINT-STAR · AUTHORIZED LABS ONLY · BUILT FOR DEFENSIVE RESEARCH</footer></div>
 {menu&&<button type="button" className="sidebar-backdrop" aria-label="إغلاق القائمة" onClick={()=>setMenu(false)}/>}
 <div className="mobile-nav" aria-label="الأقسام السريعة على الآيفون">{links.filter(x=>['dashboard','tools','terminal','operations','agent'].includes(x.id)).map(x=><button key={x.id} className={page===x.id?'selected':''} onClick={()=>navigate(x.id)}><span>{x.ico}</span><small>{x.label}</small></button>)}</div>
 {modal&&<div className="modal-backdrop" onMouseDown={()=>setModal(null)}><div className="modal" role="dialog" aria-modal="true" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setModal(null)}>✕</button><span className="eyebrow">{modal.group} / TOOL DETAIL</span><h2>{modal.name}</h2><p>{modal.desc}</p><div className="command"><code>{modal.command}</code><button onClick={()=>copy(modal.command)}>نسخ</button></div><small>أمر مرجعي فقط: يتطلب تثبيت الأداة وبيئة مصرح بها.</small><a href={modal.repo} target="_blank" rel="noreferrer" className="modal-link">فتح المستودع الرسمي ↗</a></div></div>}
 {message&&<div className="toast" role="status">{message}</div>}
 </div></ReactLenis>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
