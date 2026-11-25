import {useEffect,useRef,useState} from 'react';
import type {FormEvent,KeyboardEvent} from 'react';
import DurableMemoryPanel,{memoryWrite} from './DurableMemoryPanel';
import SafeMarkdown from './SafeMarkdown';
import {CHAT_MODELS,AUTO_MODEL,CLOUD_MODEL,PRIVATE_MODEL} from './ai-models';
import type {ChatModel} from './ai-models';
import './agent-chat.css';

type Mode='general'|'code'|'security'|'agent';
type Role='user'|'assistant';
type ChatMessage={id:string;role:Role;content:string;created:number;error?:boolean};
type ChatRoom={id:string;title:string;mode:Mode;model:ChatModel;messages:ChatMessage[];updated:number};
type Attachment={name:string;content:string};
const SESSION_KEY='star-agent-chat-session-v1';
const PERSIST_KEY='star-agent-chat-persistent-v1';
const OPT_IN_KEY='star-agent-save-opt-in';
const MODES:{id:Mode;label:string;description:string}[]=[
 {id:'general',label:'محادثة عامة',description:'أسئلة عامة وتقنية وكتابة'},
 {id:'code',label:'مهندس برمجيات',description:'برمجة ومراجعة أكواد'},
 {id:'security',label:'محلل سيبراني',description:'تحليل تقارير وأمن معلومات'},
 {id:'agent',label:'AI Agent',description:'تخطيط المهام وخطوات التنفيذ'}
];
const SUGGESTIONS=[
 'صمّم لي معمارية آمنة لمنصة OSINT سحابية',
 'راجع كود TypeScript واقترح تحسينات للأداء',
 'اشرح لي سجل Nginx وكيف أميز الأخطاء',
 'أنشئ خطة تنفيذ لمشروع مع اختبارات قبول'
];
function uid(){return typeof crypto!=='undefined'&&'randomUUID' in crypto?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);}
function newRoom():ChatRoom{return {id:uid(),title:'محادثة جديدة',mode:'general',model:PRIVATE_MODEL,messages:[],updated:Date.now()};}
function readRooms():ChatRoom[]{
 try{
  const isSaved=localStorage.getItem(OPT_IN_KEY)==='yes';
  const raw=(isSaved?localStorage:sessionStorage).getItem(isSaved?PERSIST_KEY:SESSION_KEY);
  const parsed=raw?JSON.parse(raw):[];
  if(!Array.isArray(parsed))return [newRoom()];
  const checked=parsed.filter(x=>x&&typeof x.id==='string'&&typeof x.title==='string'&&MODES.some(m=>m.id===x.mode)&&Array.isArray(x.messages))
   .slice(0,16).map(x=>({...x,model:x.model===AUTO_MODEL?AUTO_MODEL:x.model===PRIVATE_MODEL?PRIVATE_MODEL:CLOUD_MODEL,
    messages:x.messages.filter((m:ChatMessage)=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string').slice(-32)})) as ChatRoom[];
  return checked.length?checked:[newRoom()];
 }catch{return [newRoom()];}
}
function download(name:string,contents:string,mime='text/markdown;charset=utf-8'){
 const url=URL.createObjectURL(new Blob([contents],{type:mime}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();
 setTimeout(()=>URL.revokeObjectURL(url),500);
}
function apiError(data:{error?:string;code?:string},status:number,model?:ChatModel){
 if(status===401||status===403)return 'جلسة Cloudflare Access غير صالحة. سجّل الدخول ثم أعد المحاولة.';
 if(status===429)return 'تم بلوغ حد الطلبات. جرّب مرة أخرى.';
 if(status===503)return model===PRIVATE_MODEL
  ?'نموذج Vast.ai غير متاح الآن. تحقق من تشغيل خادم GPU واتصال Tailscale.'
  :'الخدمة غير متاحة الآن. جرّب مرة أخرى.';
 return data.error||data.code||'فشل اتصال الذكاء (HTTP '+status+').';
}
function conversationHistory(messages:ChatMessage[]){
 const out:{role:Role;content:string}[]=[];
 let budget=0;
 for(const item of [...messages].reverse()){
  const content=item.content.trim();
  if(!content||item.error)continue;
  if(budget+content.length>22000||out.length>=20)break;
  out.unshift({role:item.role,content});
  budget+=content.length;
 }
 return out;
}
export default function AgentChatPanel(){
 const [rooms,setRooms]=useState<ChatRoom[]>(readRooms);
 const [activeId,setActiveId]=useState(()=>rooms[0].id);
 const [persist,setPersist]=useState(()=>{try{return localStorage.getItem(OPT_IN_KEY)==='yes';}catch{return false;}});
 const [cloudMemory,setCloudMemory]=useState(()=>{try{return localStorage.getItem('star-cloud-memory-opt-in')==='yes';}catch{return false;}});
 const [memoryError,setMemoryError]=useState('');
 const [draft,setDraft]=useState('');
 const [attachment,setAttachment]=useState<Attachment|null>(null);
 const [busy,setBusy]=useState(false);
 const [connected,setConnected]=useState(false);
 const [usedModel,setUsedModel]=useState('');
 const [error,setError]=useState('');
 const [toolPrompt,setToolPrompt]=useState('');
 const [toolBusy,setToolBusy]=useState(false);
 const [toolResult,setToolResult]=useState('');
 const [toolError,setToolError]=useState('');
 const [showTools,setShowTools]=useState(false);
 const [showHistory,setShowHistory]=useState(false);
 const [creativity,setCreativity]=useState(0.5);
 const abortRef=useRef<AbortController|null>(null);
 const scrollRef=useRef<HTMLDivElement|null>(null);
 const selected=rooms.find(x=>x.id===activeId)||rooms[0];
 const mode=MODES.find(m=>m.id===selected.mode)||MODES[0];

 useEffect(()=>{
  try{
   const data=JSON.stringify(rooms.slice(0,16).map(r=>({...r,messages:r.messages.slice(-32)})));
   if(persist){localStorage.setItem(OPT_IN_KEY,'yes');localStorage.setItem(PERSIST_KEY,data);sessionStorage.removeItem(SESSION_KEY);}
   else{localStorage.removeItem(OPT_IN_KEY);localStorage.removeItem(PERSIST_KEY);sessionStorage.setItem(SESSION_KEY,data);}
  }catch{ /* Browsers may disable storage; the active in-memory chat still works. */ }
 },[rooms,persist]);
 useEffect(()=>{scrollRef.current?.scrollTo({top:scrollRef.current.scrollHeight,behavior:'smooth'});},[selected.messages.length,selected.messages.at(-1)?.content]);
 useEffect(()=>()=>{abortRef.current?.abort();},[]);

 function patchMessage(roomId:string,messageId:string,update:(m:ChatMessage)=>ChatMessage){
  setRooms(prev=>prev.map(r=>r.id===roomId?{...r,updated:Date.now(),messages:r.messages.map(m=>m.id===messageId?update(m):m)}:r));
 }
 function newChat(){
  abortRef.current?.abort();setBusy(false);setConnected(false);setUsedModel('');setError('');setDraft('');setAttachment(null);
  const room=newRoom();setRooms(prev=>[room,...prev].slice(0,16));setActiveId(room.id);setShowHistory(false);
 }
 function selectRoom(id:string){abortRef.current?.abort();setBusy(false);setConnected(false);setUsedModel('');setError('');setActiveId(id);setShowHistory(false);}
 function deleteRoom(id:string){
  if(rooms.length===1){const room=newRoom();setRooms([room]);setActiveId(room.id);return;}
  const next=rooms.filter(r=>r.id!==id);if(id===activeId){abortRef.current?.abort();setBusy(false);setActiveId(next[0].id);}
  setRooms(next);
 }
 function setMode(mode:Mode){setRooms(prev=>prev.map(r=>r.id===activeId?{...r,mode}:r));}
 function setModel(model:ChatModel){
  setConnected(false);setUsedModel('');
  setRooms(prev=>prev.map(r=>r.id===activeId?{...r,model}:r));
 }
 async function readAttachment(file:File|undefined){
  if(!file)return;
  if(file.size>16000){setError('الحد الأقصى للملف 16KB. يمكنك إرفاق مقتطف منه.');return;}
  try{
   const content=(await file.text()).slice(0,2200);
   setAttachment({name:file.name.replace(/[^a-zA-Z0-9._\u0600-\u06FF-]/g,'_').slice(0,70),content});
   setError('');
  }catch{setError('تعذر قراءة الملف');}
 }
 async function send(e?:FormEvent){
  e?.preventDefault();
  if(busy)return;
  const body=draft.trim();
  if(!body&&!attachment)return;
  const text=(body||'حلّل المرفق')+(attachment?'\n\n[مقتطف ملف '+attachment.name+']\n'+attachment.content+'\n[/مقتطف]':'');
  if(text.length>5000){setError('النص والملف أكبر من حد الرسالة؛ اختصر المحتوى.');return;}
  const roomId=selected.id;
  const user:ChatMessage={id:uid(),role:'user',content:text,created:Date.now()};
  const assistant:ChatMessage={id:uid(),role:'assistant',content:'',created:Date.now()};
  const context=conversationHistory([...selected.messages,user]);
  const conversationMode=selected.mode;
  const conversationModel=selected.model;
  setRooms(prev=>prev.map(r=>r.id===roomId?{
   ...r,title:r.messages.length?r.title:body.slice(0,42)||attachment?.name||'محادثة جديدة',
   updated:Date.now(),messages:[...r.messages,user,assistant].slice(-32)
  }:r));
  setDraft('');setAttachment(null);setBusy(true);setError('');
  const controller=new AbortController();abortRef.current=controller;
  let accumulated='';
  let completed=false;
  try{
   if(cloudMemory){setMemoryError('');try{await memoryWrite('POST',{id:user.id,kind:'chat',room:roomId,body:'أنت: '+text});}catch{setMemoryError('لم تُحفظ رسالتك سحابياً؛ تحقق من اتصال الذاكرة.');}}
   const response=await fetch('/api/ai/chat',{
    method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,
    headers:{'Content-Type':'application/json','Accept':'text/event-stream'},
    body:JSON.stringify({messages:context,mode:conversationMode,model:conversationModel,stream:true,temperature:creativity,memory:cloudMemory})
   });
   if(!response.ok){
    let details:{error?:string;code?:string}={};
    try{details=await response.json();}catch{}
    throw Error(apiError(details,response.status,conversationModel));
   }
   const realProvider=response.headers.get('x-star-used-model')||conversationModel;
   setUsedModel(realProvider);
   if(!(response.headers.get('content-type')||'').includes('text/event-stream')||!response.body)
    throw Error('الخدمة لم ترجع تدفقاً حقيقياً من نموذج الذكاء.');
   const reader=response.body.getReader(),decoder=new TextDecoder();
   let buffer='';
   let done=false;
   while(!done){
    const chunk=await reader.read();
    if(chunk.done)break;
    buffer+=decoder.decode(chunk.value,{stream:true});
    const lines=buffer.split(/\r?\n/);buffer=lines.pop()||'';
    for(const line of lines){
     if(!line.startsWith('data:'))continue;
     const payload=line.slice(5).trim();
     if(payload==='[DONE]'){done=true;break;}
     if(!payload)continue;
     let event:{response?:string;error?:string;choices?:{delta?:{content?:string}}[]}={};
     try{event=JSON.parse(payload);}catch{continue;}
     if(event.error)throw Error(event.error);
     const privatePart=event.choices?.[0]?.delta?.content;
     const cloudPart=event.response;
     const part=typeof privatePart==='string'?privatePart:cloudPart;
     if(typeof part!=='string'||!part)continue;
     accumulated=typeof privatePart==='string'?accumulated+part:
       part.startsWith(accumulated)?part:accumulated+part;
     patchMessage(roomId,assistant.id,m=>({...m,content:accumulated}));
    }
   }
   if(!done&&realProvider===PRIVATE_MODEL)throw Error('انقطع رد نموذج Vast.ai قبل أن يكتمل.');
   if(!accumulated.trim())throw Error('النموذج لم يُرجع نصاً. أعد المحاولة.');
   completed=true;
   setConnected(true);
  }catch(err){
   const stopped=controller.signal.aborted;
   const reason=stopped?'تم إيقاف التوليد':err instanceof Error?err.message:'فشل توليد الإجابة';
   patchMessage(roomId,assistant.id,m=>({...m,content:accumulated||reason,error:!accumulated}));
   if(!stopped)setError(reason);
  }finally{
   if(cloudMemory&&accumulated.trim()){
    try{if(accumulated.length>59990)throw Error('archive limit');await memoryWrite('POST',{id:assistant.id,kind:'chat',room:roomId,body:'STAR AI: '+accumulated,partial:!completed});}catch{setMemoryError('لم يُحفظ الرد سحابياً أو تجاوز حد الأرشفة؛ صدّر المحادثة محلياً.');}
   }
   if(abortRef.current===controller){abortRef.current=null;setBusy(false);}
  }
 }
 async function inspectTool(e:FormEvent){
  e.preventDefault();
  if(!toolPrompt.trim()||toolBusy)return;
  setToolBusy(true);setToolError('');setToolResult('');
  try{
   const r=await fetch('/api/terminal/tools/assistant',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify({prompt:toolPrompt.trim().slice(0,400)})
   });
   if(!r.ok){let data:{code?:string;error?:string}={};try{data=await r.json();}catch{}throw Error(apiError(data,r.status));}
   const data=await r.json() as {result?:{tool_id:string;installed:boolean;executed:boolean;outcome:string;stdout?:string;stderr?:string};explanation?:string};
   if(!data.result)throw Error('لم يرجع الخادم نتيجة جرد أدوات');
   setToolResult([data.explanation||'',
    'Tool: '+data.result.tool_id,'Installed: '+data.result.installed,
    'Executed: '+data.result.executed,'Outcome: '+data.result.outcome,
    (data.result.stdout||data.result.stderr||'').slice(0,1800)].join('\n'));
  }catch(err){setToolError(err instanceof Error?err.message:'تعذر فحص الأداة');}
  finally{setToolBusy(false);}
 }
 function exportChat(){
  const out=['# STAR AI Agent — '+selected.title,'','Mode: '+mode.label,'',
   ...selected.messages.map(m=>(m.role==='user'?'## أنت':'## STAR AI')+'\n\n'+m.content+'\n')].join('\n');
  download('star-agent-'+selected.id.slice(0,8)+'.md',out);
 }
 return <section className="agent-page page-animate" dir="rtl">
  <header className="agent-head">
   <div><span className="eyebrow">STAR / INTELLIGENCE OPERATIONS</span>
    <h1><span className="agent-glow">✳</span> STAR AI <em>Agent</em></h1>
    <p>دردشة سحابية حقيقية للبرمجة والتحليل والتخطيط، مع محادثات متعددة ووضع فحص أدوات منفصل بموافقتك.</p>
   </div>
   <div className="agent-head-actions">
    <span className={'agent-status '+(connected?'is-live':'')}>{connected?'استجاب النموذج في هذه الجلسة':'متصل عبر Cloudflare Access عند تسجيل الدخول'}</span>
    <button type="button" className="agent-secondary" onClick={()=>setShowHistory(s=>!s)}>☷ المحادثات</button>
    <button type="button" className="agent-primary" onClick={newChat}>＋ محادثة جديدة</button>
   </div>
  </header>
  <DurableMemoryPanel enabled={cloudMemory} onEnabled={v=>{setCloudMemory(v);try{localStorage.setItem('star-cloud-memory-opt-in',v?'yes':'no');}catch{}}} onUse={setDraft}/>
  {memoryError&&<p role="alert" className="agent-alert">{memoryError}</p>}
  <div className="agent-layout">
   <aside className={'agent-history '+(showHistory?'is-open':'')} aria-label="سجل المحادثات">
    <div className="agent-history-title"><strong>المحادثات</strong><span>{rooms.length} / 16</span></div>
    <div className="agent-rooms">{[...rooms].sort((a,b)=>b.updated-a.updated).map(room=><div key={room.id} className={'agent-room '+(room.id===activeId?'chosen':'')}>
     <button type="button" onClick={()=>selectRoom(room.id)} aria-current={room.id===activeId?'page':undefined}>
      <strong>{room.title}</strong><small>{MODES.find(x=>x.id===room.mode)?.label||room.mode} · {room.messages.length} رسالة</small>
     </button>
     <button className="agent-delete" type="button" title="حذف المحادثة" aria-label={'حذف '+room.title} onClick={()=>deleteRoom(room.id)}>×</button>
    </div>)}</div>
    <label className="agent-persist">
     <input type="checkbox" checked={persist} onChange={e=>setPersist(e.target.checked)}/>
     <span>حفظ المحادثات على هذا الجهاز</span>
    </label>
    <p className="agent-privacy">بدون تفعيل الحفظ، تبقى المحادثات في جلسة المتصفح فقط. يمكن حذفها من هنا. لا تُرسل مفاتيح API أو كلمات المرور إلى النموذج.</p>
    <button type="button" className="agent-export" disabled={!selected.messages.length} onClick={exportChat}>↓ تصدير المحادثة Markdown</button>
   </aside>
   <main className="agent-chat" aria-label="دردشة STAR AI Agent">
    <div className="agent-chat-top">
     <div><span className="agent-brand-dot">✦</span><strong>{mode.label}</strong><small>{mode.description}</small></div>
     <label className="agent-mode-picker"><span>الوضع</span><select aria-label="وضع المساعد" value={selected.mode} disabled={busy} onChange={e=>setMode(e.target.value as Mode)}>
      {MODES.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
     </select></label>
     <label className="agent-mode-picker"><span>النموذج</span>
      <select aria-label="نموذج الدردشة" value={selected.model} disabled={busy} onChange={e=>setModel(e.target.value as ChatModel)}>
       {CHAT_MODELS.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
     </label>
    </div>
    {selected.model===AUTO_MODEL&&<p className="agent-auto-note" role="note">
      الوضع التلقائي يحاول Qwen أولاً؛ عند تعذره قبل بدء البث قد تُرسل رسائلك إلى Cloudflare Llama.
      اختر نموذجاً محدداً إذا كانت سياسة خصوصية مشروعك تمنع تبديل المزوّد.
    </p>}
    {usedModel&&<p className="agent-auto-used" role="status">النموذج المستخدم في آخر استجابة: <strong dir="ltr">{usedModel}</strong></p>}
    <div className="agent-messages" ref={scrollRef} role="log" aria-live="polite" aria-relevant="additions text">
     {!selected.messages.length?<div className="agent-welcome">
      <div className="agent-orb">✳</div><span className="agent-welcome-label">PRIVATE · CLOUD AI</span>
      <h2>شنو تريد نبني اليوم؟</h2>
      <p>اسأل عن الكود، تحليل نتائج المختبر، بناء أدواتك، أو اطلب خطة من AI Agent. الإجابات تأتي من نموذج حقيقي، وليست ردوداً تجريبية.</p>
      <div className="agent-suggestions">{SUGGESTIONS.map(q=><button key={q} type="button" onClick={()=>setDraft(q)}>{q}<span aria-hidden="true">↗</span></button>)}</div>
     </div>:selected.messages.map(m=><article className={'agent-message '+m.role+(m.error?' failed':'')} key={m.id}>
      <div className="agent-avatar">{m.role==='user'?'أنت':'✳'}</div>
      <div className="agent-bubble">
       <div className="agent-message-meta"><strong>{m.role==='user'?'أنت':'STAR AI'}</strong><time>{new Date(m.created).toLocaleTimeString('ar-IQ',{hour:'2-digit',minute:'2-digit'})}</time></div>
       {m.content?<div className="agent-message-body">{m.role==='assistant'&&!m.error?<SafeMarkdown source={m.content}/>:<p dir="auto">{m.content}</p>}</div>:<span className="agent-thinking">جارٍ التفكير وكتابة الإجابة <i/><i/><i/></span>}
       {m.role==='assistant'&&m.content&&!m.error&&<button type="button" className="agent-copy" onClick={()=>void navigator.clipboard?.writeText(m.content)}>نسخ الإجابة</button>}
      </div>
     </article>)}
    </div>
    <div className="agent-composer-area">
     {error&&<div className="agent-alert" role="alert">{error}</div>}
     {attachment&&<div className="agent-attachment">📄 {attachment.name}<button type="button" onClick={()=>setAttachment(null)} aria-label="إزالة الملف">×</button></div>}
     <form className="agent-composer" onSubmit={e=>void send(e)}>
      <textarea aria-label="أرسل رسالة إلى STAR AI" dir="auto" rows={2} maxLength={2300} value={draft}
       disabled={busy} onChange={e=>setDraft(e.target.value)}
       onKeyDown={(e:KeyboardEvent<HTMLTextAreaElement>)=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void send();}}}
       placeholder="اكتب سؤالك أو مهمتك...  Ctrl+Enter للإرسال" />
      <div className="agent-composer-footer">
       <div className="agent-input-actions">
        <label className="agent-file-button" title="إرفاق ملف نصي">📎 ملف<input type="file" accept=".txt,.log,.json,.md,.csv,text/plain" onChange={e=>{void readAttachment(e.target.files?.[0]);e.target.value='';}}/></label>
        <label className="agent-creativity">الإبداع <input type="range" min="0" max="1" step="0.1" value={creativity} onChange={e=>setCreativity(Number(e.target.value))} aria-label="درجة إبداع النموذج"/><span>{Math.round(creativity*100)}%</span></label>
       </div>
       <div className="agent-send-buttons">
        {busy&&<button type="button" className="agent-stop" onClick={()=>abortRef.current?.abort()}>■ إيقاف</button>}
        <button className="agent-primary" disabled={busy||(!draft.trim()&&!attachment)} type="submit">إرسال <span>↑</span></button>
       </div>
      </div>
     </form>
     <p className="agent-footnote">تُرسل المحادثة إلى النموذج المختار. فحص الأدوات يحتاج ضغطاً صريحاً.</p>
    </div>
   </main>
  </div>
  <div className="agent-tool-drawer">
   <button type="button" className="agent-tool-toggle" aria-expanded={showTools} onClick={()=>setShowTools(s=>!s)}>
    <strong>⌘ أداة AI Agent: جرد أدوات Railway</strong><span>{showTools?'إخفاء −':'فتح ＋'}</span>
   </button>
   {showTools&&<form className="agent-tool-body" onSubmit={e=>void inspectTool(e)}>
    <p>هذا فحص حقيقي عبر مسار Railway المحمي؛ لا تُنفّذ أوامر Shell أو فحوص أهداف من رسالة الدردشة.</p>
    <div className="agent-tool-row"><input dir="auto" value={toolPrompt} maxLength={400} onChange={e=>setToolPrompt(e.target.value)} placeholder="مثال: افحص Ghidra أو اعرض إصدار Frida" aria-label="طلب جرد أداة"/><button className="agent-primary" disabled={toolBusy||!toolPrompt.trim()} type="submit">{toolBusy?'جارٍ الفحص...':'فحص الأداة'}</button></div>
    {toolError&&<p className="agent-alert" role="alert">{toolError}</p>}
    {toolResult&&<pre className="agent-tool-output" dir="auto">{toolResult}</pre>}
   </form>}
  </div>
 </section>;
}
