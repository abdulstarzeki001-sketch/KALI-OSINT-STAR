import React, {useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ReactLenis} from 'lenis/react';
import {gsap} from 'gsap';
import {useGSAP} from '@gsap/react';
import './styles.css';

gsap.registerPlugin(useGSAP);
type Page = 'dashboard'|'tools'|'platforms'|'labs'|'roadmap'|'reports'|'settings';
type Tool = {name:string, group:string, desc:string, repo:string, command:string};
type Lab = {id:number,platform:string,target:string,title:string,status:'جديد'|'قيد العمل'|'مكتمل'};
const links: {id:Page,label:string,ico:string}[] = [
{id:'dashboard',label:'لوحة التحكم',ico:'◈'},{id:'tools',label:'مكتبة الأدوات',ico:'⌘'},
{id:'platforms',label:'منصات التدريب',ico:'◎'},{id:'labs',label:'المختبرات',ico:'▣'},
{id:'roadmap',label:'مسار التدريب',ico:'↗'},{id:'reports',label:'التقارير',ico:'▤'},{id:'settings',label:'الإعدادات',ico:'⚙'}];
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
function App(){
 const [page,setPage]=useState<Page>('dashboard');
 const [search,setSearch]=useState('');
 const [filter,setFilter]=useState('الكل');
 const [labs,setLabs]=stored<Lab[]>('kos-labs',[]);
 const [done,setDone]=stored<number[]>('kos-weeks',[]);
 const [favorites,setFavorites]=stored<string[]>('kos-favorites',[]);
 const [target,setTarget]=useState('');
 const [labTitle,setLabTitle]=useState('');
 const [provider,setProvider]=useState('Hack The Box');
 const [modal,setModal]=useState<Tool|null>(null);
 const [menu,setMenu]=useState(false);
 const [api,setApi]=useState<'offline'|'online'>('offline');
 const [message,setMessage]=useState('');
 const root=useRef<HTMLDivElement>(null);
 useGSAP(()=>{gsap.fromTo('.page-animate',{opacity:0,y:18},{opacity:1,y:0,duration:.52,stagger:.035,ease:'power2.out',clearProps:'transform,opacity'});},{scope:root,dependencies:[page],revertOnUpdate:true});
 useEffect(()=>{const ctrl=new AbortController();fetch('/api/v1/health',{signal:ctrl.signal}).then(x=>x.ok?x.json():null).then(x=>setApi(x?.status==='ok'?'online':'offline')).catch(()=>setApi('offline'));return()=>ctrl.abort();},[]);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setPage('tools');document.getElementById('tool-search')?.focus();}if(e.key==='Escape')setModal(null)};addEventListener('keydown',onKey);return()=>removeEventListener('keydown',onKey)},[]);
 const show=(text:string)=>{setMessage(text);window.setTimeout(()=>setMessage(''),2800);};
 const copy=(s:string)=>{navigator.clipboard?.writeText(s).then(()=>show('تم النسخ')).catch(()=>show('تعذر النسخ'))};
 const visible=useMemo(()=>toolList.filter(t=>(filter==='الكل'||t.group===filter)&&(t.name+' '+t.group+' '+t.desc).toLowerCase().includes(search.toLowerCase())),[filter,search]);
 const percent=Math.round(done.length/weeks.length*100);
 function addLab(e:React.FormEvent){e.preventDefault();if(!safeTarget(target)){show('سجّل عنوان المختبر المخصص لك، وليس الموقع الرئيسي للمنصة');return;}setLabs(x=>[{id:Date.now(),platform:provider,title:labTitle.trim()||'مختبر جديد',target:target.trim(),status:'جديد'},...x]);setLabTitle('');setTarget('');show('تم حفظ المختبر محلياً');}
 function exportReport(){const content=['# KALI-OSINT-STAR','التاريخ: '+new Date().toISOString(),'الأسابيع المكتملة: '+done.length+'/'+weeks.length,'المختبرات: '+labs.length,'','## المختبرات',...labs.map(x=>'- '+x.title+' | '+x.platform+' | '+x.status)].join('\n');const blob=new Blob([content],{type:'text/markdown;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='kali-osint-star-report.md';a.click();URL.revokeObjectURL(a.href);}
 return <ReactLenis root options={{lerp:0.09,smoothWheel:true}}><div className="app" ref={root} dir="rtl">
 <aside className={'sidebar '+(menu?'visible':'')}>
  <div className="identity"><span className="mark">✳</span><div><b>KALI OSINT STAR</b><small>Cyber Intelligence Platform</small></div></div>
  <div className="section-label">مساحة العمليات</div>
  <nav aria-label="التنقل الرئيسي">{links.map(x=><button key={x.id} className={'nav '+(page===x.id?'active':'')} onClick={()=>{setPage(x.id);setMenu(false);window.scrollTo({top:0,behavior:'smooth'});}}><span className="navico">{x.ico}</span><span>{x.label}</span><span className="nav-arrow">‹</span></button>)}</nav>
  <div className="sidebar-bottom"><div className="runtime"><span className={'dot '+(api==='online'?'live':'')}/><div><strong>{api==='online'?'API متصل':'وضع محلي'}</strong><small>لا يوجد تنفيذ أوامر عن بعد</small></div></div><a href="https://github.com/abdulstarzeki001-sketch/KALI-OSINT-STAR" target="_blank" rel="noreferrer">↗ GitHub Repository</a></div>
 </aside>
 <div className="shell"><header className="topbar"><button className="mobile-toggle" aria-label="القائمة" onClick={()=>setMenu(x=>!x)}>☰</button><div><span className="crumb">WORKSPACE / </span><b>{links.find(x=>x.id===page)?.label}</b></div><div className="top-right"><span className="status-label"><span className={'dot '+(api==='online'?'live':'')}/>{api==='online'?'API ONLINE':'LOCAL MODE'}</span><button className="kbd" onClick={()=>{setPage('tools');setTimeout(()=>document.getElementById('tool-search')?.focus(),40)}}>⌘ K</button><span className="avatar">SK</span></div></header>
 <main>
 {page==='dashboard'&&<><div className="hero page-animate"><div className="eyebrow">CYBER RANGE / OPERATIONAL WORKSPACE</div><h1>مركز العمليات <span>السيبرانية.</span></h1><p>منصتك لتعلّم أدوات Kali Linux وإدارة المختبرات المصرّح بها وتحليل نتائج التدريب — بدون ادعاء تنفيذ اختبارات حقيقية.</p><div className="hero-actions"><button className="primary" onClick={()=>setPage('tools')}>استكشف الأدوات <span>←</span></button><button className="ghost" onClick={()=>setPage('labs')}>إدارة مختبراتي</button></div><div className="hero-glow"/></div>
 <div className="stat-grid page-animate">{[['15','أدوات متقدمة'],['10','منصات تدريب'],[String(labs.length),'مختبراتك'],[percent+'%','تقدم التدريب']].map(([v,l])=><div className="stat" key={l}><strong>{v}</strong><span>{l}</span></div>)}</div>
 <div className="section-head page-animate"><h2>مجالات التدريب</h2><button onClick={()=>setPage('roadmap')}>المسار الكامل ←</button></div><div className="feature-grid page-animate"><div className="feature"><i>01 / RESEARCH</i><h3>OSINT & Recon</h3><p>جمع المعلومات العامة وتحليل المؤشرات ضمن قواعد الخصوصية ونطاقك.</p><button onClick={()=>setPage('platforms')}>استعرض المنصات ←</button></div><div className="feature"><i>02 / IDENTITY</i><h3>Active Directory</h3><p>تحليل علاقات الثقة ومراجعة إعدادات شهادات Windows في مختبرك.</p><button onClick={()=>{setPage('tools');setFilter('Identity')}}>استعرض الأدوات ←</button></div><div className="feature"><i>03 / DEFENSE</i><h3>Purple Team</h3><p>قياس الرصد والاستجابة وتوثيق الثغرات والتوصيات الدفاعية.</p><button onClick={()=>setPage('reports')}>إنشاء تقرير ←</button></div></div></>}
 {page==='tools'&&<><div className="page-title page-animate"><span className="eyebrow">TOOLS LIBRARY</span><h1>مكتبة الأدوات <em>15</em></h1><p>الأوامر هنا تعليمية للقراءة والنسخ؛ لا تُنفَّذ من المتصفح.</p></div><div className="toolbar page-animate"><input id="tool-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث عن أداة أو تخصص..." aria-label="بحث الأدوات"/><div className="chips">{['الكل','Red Team','Purple Team','Identity','Windows','Network','Reverse','Research'].map(x=><button className={filter===x?'selected':''} key={x} onClick={()=>setFilter(x)}>{x}</button>)}</div></div><div className="tools-grid page-animate">{visible.map((x,i)=><article className="tool-card" key={x.name}><div className="tool-top"><span className="tool-index">{String(i+1).padStart(2,'0')}</span><button title="المفضلة" className={'star '+(favorites.includes(x.name)?'on':'')} onClick={()=>setFavorites(y=>y.includes(x.name)?y.filter(t=>t!==x.name):[...y,x.name])}>★</button></div><h3>{x.name}</h3><span className="pill">{x.group}</span><p>{x.desc}</p><div className="tool-actions"><button onClick={()=>setModal(x)}>التفاصيل ←</button><a target="_blank" rel="noreferrer" href={x.repo}>GitHub ↗</a></div></article>)}</div>{visible.length===0&&<div className="empty">لا توجد أدوات مطابقة.</div>}</>}
 {page==='platforms'&&<><div className="page-title page-animate"><span className="eyebrow">TRAINING PROVIDERS</span><h1>منصات التدريب <em>10</em></h1><p>يُسمح بالاختبار على Machines وLabs المخصصة لحسابك فقط — وليس خوادم المنصات نفسها.</p></div><div className="providers page-animate">{providers.map((x,i)=><article className="provider" key={x.name}><div className="provider-number">{String(i+1).padStart(2,'0')}</div><div><h3>{x.name}</h3><p>{x.type}</p></div><a href={x.link} target="_blank" rel="noreferrer">فتح المنصة ↗</a></article>)}</div></>}
 {page==='labs'&&<><div className="page-title page-animate"><span className="eyebrow">AUTHORIZED WORKSPACE</span><h1>إدارة المختبرات</h1><p>أضف عنوان مختبرك المخصص لأغراض التوثيق فقط، بدون أي اتصال أو فحص تلقائي.</p></div><form className="lab-form page-animate" onSubmit={addLab}><label>منصة المختبر<select value={provider} onChange={e=>setProvider(e.target.value)}>{providers.map(x=><option key={x.name}>{x.name}</option>)}</select></label><label>اسم التمرين<input value={labTitle} onChange={e=>setLabTitle(e.target.value)} placeholder="مثال: Linux privilege audit" /></label><label>عنوان الهدف المخصص لك<input value={target} onChange={e=>setTarget(e.target.value)} required placeholder="مثال: 10.10.10.10 أو رابط Lab معين"/></label><button className="primary" type="submit">إضافة المختبر +</button></form><div className="lab-list page-animate">{labs.map(x=><article key={x.id} className="lab-row"><div><b>{x.title}</b><p>{x.platform} · <code>{x.target}</code></p></div><div className="lab-buttons"><select value={x.status} onChange={e=>setLabs(a=>a.map(y=>y.id===x.id?{...y,status:e.target.value as Lab['status']}:y))}><option>جديد</option><option>قيد العمل</option><option>مكتمل</option></select><button onClick={()=>setLabs(a=>a.filter(y=>y.id!==x.id))} aria-label="حذف">حذف</button></div></article>)}{labs.length===0&&<div className="empty">لا توجد مختبرات مسجلة بعد.</div>}</div></>}
 {page==='roadmap'&&<><div className="page-title page-animate"><span className="eyebrow">LEARNING ROADMAP</span><h1>ثمانية أسابيع نحو <span>نتائج قابلة للقياس</span></h1><p>سجّل التقدم الحقيقي لكل أسبوع بعد إنهاء تمارينه وتوثيق النتائج.</p></div><div className="roadmap-track page-animate"><div className="progress"><div style={{width:percent+'%'}}/></div><p>{percent}% مكتمل · {done.length} من {weeks.length} أسابيع</p></div><div className="week-grid page-animate">{weeks.map((x,i)=><label className={'week '+(done.includes(i)?'complete':'')} key={x}><input type="checkbox" checked={done.includes(i)} onChange={e=>setDone(z=>e.target.checked?[...z,i]:z.filter(y=>y!==i))}/><span className="week-number">W{String(i+1).padStart(2,'0')}</span><strong>{x}</strong><span className="checkmark">{done.includes(i)?'✓':'○'}</span></label>)}</div></>}
 {page==='reports'&&<><div className="page-title page-animate"><span className="eyebrow">REPORTING CENTER</span><h1>تقارير التدريب</h1><p>أنشئ تقرير Markdown يعكس بياناتك المحفوظة محلياً، ولا يدّعي تنفيذ فحوص.</p></div><div className="report-panel page-animate"><h2>تقرير STAR OSINT</h2><p>عدد المختبرات: <b>{labs.length}</b></p><p>الأسابيع المكتملة: <b>{done.length}/{weeks.length}</b></p><p>الأدوات المفضلة: <b>{favorites.length}</b></p><button className="primary" onClick={exportReport}>↓ تصدير Markdown</button></div></>}
 {page==='settings'&&<><div className="page-title page-animate"><span className="eyebrow">SYSTEM SETTINGS</span><h1>إعدادات مساحة العمل</h1><p>المعلومات محفوظة داخل متصفحك؛ لا توجد مزامنة سحابية للمختبرات في هذا الإصدار.</p></div><div className="settings-panel page-animate"><div><strong>حالة API المحلية</strong><p>{api==='online'?'الاتصال بخادم FastAPI ناجح':'لم يتصل المتصفح بخادم FastAPI'}</p></div><div><strong>محرك Kali</strong><p>غير متصل. تنفيذ الأوامر عن بعد معطّل لأسباب أمنية.</p></div><div><strong>حفظ البيانات</strong><p>localStorage داخل المتصفح الحالي</p></div><button className="danger-action" onClick={()=>{if(confirm('حذف جميع مختبراتك وتقدمك المحلي؟')){setLabs([]);setDone([]);setFavorites([]);show('تم مسح البيانات المحلية')}}}>مسح البيانات المحلية</button></div></>}
 </main><footer>© KALI-OSINT-STAR · AUTHORIZED LABS ONLY · BUILT FOR DEFENSIVE RESEARCH</footer></div>
 <div className="mobile-nav">{links.slice(0,5).map(x=><button key={x.id} className={page===x.id?'selected':''} onClick={()=>setPage(x.id)}><span>{x.ico}</span><small>{x.label}</small></button>)}</div>
 {modal&&<div className="modal-backdrop" onMouseDown={()=>setModal(null)}><div className="modal" role="dialog" aria-modal="true" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setModal(null)}>✕</button><span className="eyebrow">{modal.group} / TOOL DETAIL</span><h2>{modal.name}</h2><p>{modal.desc}</p><div className="command"><code>{modal.command}</code><button onClick={()=>copy(modal.command)}>نسخ</button></div><small>أمر مرجعي فقط: يتطلب تثبيت الأداة وبيئة مصرح بها.</small><a href={modal.repo} target="_blank" rel="noreferrer" className="modal-link">فتح المستودع الرسمي ↗</a></div></div>}
 {message&&<div className="toast" role="status">{message}</div>}
 </div></ReactLenis>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
