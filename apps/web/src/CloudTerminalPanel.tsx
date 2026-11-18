import {useCallback,useEffect,useRef,useState} from 'react';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './cloud-terminal.css';

type TerminalStatus='idle'|'connecting'|'ready'|'error';
type TerminalMessage={type?:string;data?:string;text?:string;message?:string;reason?:string;code?:string;ready?:boolean;aiEnabled?:boolean};

const TERM_PATH='/api/terminal';
const RECEIVED_LIMIT=65536;

function errorText(code:string):string {
 const names:Record<string,string>={
  ACCESS_REQUIRED:'سجّل دخولك عبر Cloudflare Access أولاً',
  TERMINAL_BRIDGE_NOT_CONFIGURED:'ربط الترمنال الداخلي غير مهيّأ على Cloudflare',
  TERMINAL_BRIDGE_UNAVAILABLE:'تعذّر الاتصال بين KALI وWormstar',
  TERMINAL_CONFIGURATION_INVALID:'إعدادات بوابة Wormstar غير مكتملة',
  TICKET_REQUIRED:'تذكرة الاتصال مفقودة',
  BACKUP_NOT_FOUND:'لا توجد نسخة احتياطية. شغّل persist backup أولاً',
  BACKUP_CORRUPT:'النسخة المحفوظة لا تجتاز فحص السلامة',
  FORBIDDEN:'الوصول إلى الترمنال غير مسموح'
 };
 return names[code]||code;
}
export default function CloudTerminalPanel(){
 const socket=useRef<WebSocket|null>(null);
 const outputElement=useRef<HTMLDivElement|null>(null);
 const terminalRef=useRef<Terminal|null>(null);
 const fitAddonRef=useRef<FitAddon|null>(null);
 const readyRef=useRef(false);
 const shellElement=useRef<HTMLDivElement|null>(null);
 const [status,setStatus]=useState<TerminalStatus>('idle');
 const [message,setMessage]=useState('جاهز للاتصال بترمنال Railway المحمي');
 const [command,setCommand]=useState('');
 const [busy,setBusy]=useState(false);
 const [aiOpen,setAiOpen]=useState(false);
 const [aiPrompt,setAiPrompt]=useState('');
 const [aiAnswer,setAiAnswer]=useState('');
 const [aiPending,setAiPending]=useState(false);
 const [backupBusy,setBackupBusy]=useState(false);
 const [moreOpen,setMoreOpen]=useState(false);

 // Let xterm interpret the PTY stream. Rendering raw ESC[... as plain text
 // was the cause of the corrupted prompt and bracketed-paste sequences on iOS.
 const display=(data:string)=>{terminalRef.current?.write(data);};
 const resize=useCallback(()=>{
   const term=terminalRef.current;
   const addon=fitAddonRef.current;
   const area=outputElement.current;
   if(!term||!addon||!area||area.clientWidth<40||area.clientHeight<40)return;
   try{addon.fit();}catch{return;}
   const ws=socket.current;
   if(readyRef.current&&ws?.readyState===WebSocket.OPEN){
     ws.send(JSON.stringify({type:'resize',cols:term.cols,rows:term.rows}));
   }
 },[]);

 useEffect(()=>{
   const area=outputElement.current;
   if(!area)return;
   const term=new Terminal({
     cols:80,rows:24,scrollback:2500,convertEol:false,
     fontSize:13,lineHeight:1.3,letterSpacing:0,
     fontFamily:'SFMono-Regular, Menlo, Consolas, monospace',
     cursorBlink:true,allowProposedApi:false,
     theme:{background:'#06131b',foreground:'#acf6d9',cursor:'#7bf2ce'}
   });
   const addon=new FitAddon();
   term.loadAddon(addon);
   term.open(area);
   terminalRef.current=term;
   fitAddonRef.current=addon;
   term.write('STAR TERMINAL  /  SECURE CLOUD SHELL\r\nاضغط اتصال لبدء الجلسة.\r\n\r\n');
   const input=term.onData(data=>{
     const ws=socket.current;
     if(readyRef.current&&ws?.readyState===WebSocket.OPEN&&data.length<=4096){
       ws.send(JSON.stringify({type:'input',data}));
     }
   });
   const observer=typeof ResizeObserver!=='undefined'
     ?new ResizeObserver(()=>resize()):null;
   observer?.observe(area);
   window.addEventListener('resize',resize,{passive:true});
   const vv=window.visualViewport;
   vv?.addEventListener('resize',resize,{passive:true});
   const animationFrame=window.requestAnimationFrame(()=>resize());
   return()=>{
     window.cancelAnimationFrame(animationFrame);
     observer?.disconnect();
     window.removeEventListener('resize',resize);
     vv?.removeEventListener('resize',resize);
     readyRef.current=false;
     socket.current?.close(1000,'VIEW_CLOSED');
     socket.current=null;
     input.dispose();
     terminalRef.current=null;
     fitAddonRef.current=null;
     term.dispose();
   };
 },[resize]);

 async function beginConnection(){
   if(busy||status==='connecting'||status==='ready')return;
   setBusy(true);setStatus('connecting');setMessage('جارٍ إنشاء تذكرة اتصال آمنة...');
   try{
     const r=await fetch(TERM_PATH+'/session',{
       method:'POST',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
     });
     const result:Record<string,unknown>=await r.json().catch(()=>({}));
     if(!r.ok)throw Error(errorText(String(result.code||'SESSION_FAILED'))+' (HTTP '+r.status+')');
     const ticket=result.ticket;
     if(typeof ticket!=='string'||!/^\d{13}\.[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{43}$/.test(ticket))
       throw Error('استجابة التذكرة غير صالحة');
     const url=new URL(TERM_PATH+'/ws',window.location.origin);
     url.protocol=window.location.protocol==='https:'?'wss:':'ws:';
     const ws=new WebSocket(url.toString(),['wormstar-terminal','ticket.'+ticket]);
     socket.current=ws;
     ws.onopen=()=>{setMessage('تم فتح القناة، جارٍ توثيق Railway...');};
     ws.onmessage=(event:MessageEvent)=>{
       if(typeof event.data!=='string'||event.data.length>RECEIVED_LIMIT)return;
       let data:TerminalMessage;
       try{data=JSON.parse(event.data) as TerminalMessage;}catch{return;}
       if(data.type==='ready'){
         readyRef.current=true;
         setStatus('ready');setMessage('متصل بحاوية Railway');setBusy(false);
         display('\r\n✓ STAR Terminal متصل\r\n');
         window.setTimeout(resize,0);
       }else if(data.type==='output'&&typeof data.data==='string')display(data.data);
       else if(data.type==='info'&&typeof data.data==='string')display('\r\n'+data.data+'\r\n');
       else if(data.type==='error'){
         setStatus('error');
         setMessage(errorText(String(data.code||data.message||'AUTH_FAILED')));
         display('\r\n[خطأ المصادقة / الاتصال]\r\n');
       }else if(data.type==='ai_reply'&&typeof data.text==='string'){
         setAiAnswer(data.text.slice(0,8000));setAiPending(false);
       }else if(data.type==='ai_error'){
         setAiAnswer(String(data.message||'فشل تحليل STAR AI'));setAiPending(false);
       }else if(data.type==='ai_status'){
         setAiAnswer(data.ready?'STAR AI جاهز':'STAR AI غير جاهز: '+String(data.reason||''));
       }
     };
     ws.onclose=event=>{
       readyRef.current=false;
       if(socket.current===ws)socket.current=null;
       setStatus(prev=>prev==='error'?'error':'idle');
       setBusy(false);setAiPending(false);
       setMessage(event.wasClean?'انتهى اتصال الترمنال':'انقطع الاتصال — يمكنك إعادة المحاولة');
     };
     ws.onerror=()=>{readyRef.current=false;setStatus('error');setMessage('فشل WebSocket. تحقق من جلسة Cloudflare Access');setBusy(false);};
   }catch(e){
     readyRef.current=false;
     setStatus('error');setBusy(false);setMessage(e instanceof Error?e.message:'تعذّر الاتصال');
   }
 }
 async function diagnose(){
   if(busy)return;
   setBusy(true);setMessage('جارٍ فحص الاتصال من Cloudflare إلى Railway...');
   try{
     const response=await fetch(TERM_PATH+'/diagnose',{method:'POST',credentials:'same-origin',cache:'no-store'});
     const result:Record<string,unknown>=await response.json().catch(()=>({}));
     setMessage(response.ok&&result.ok===true?'نجح فحص الاتصال والتوثيق':errorText(String(result.code||'DIAGNOSE_FAILED')));
   }catch{setMessage('تعذّر تنفيذ فحص الاتصال');}
   finally{setBusy(false);}
 }
 function sendCommand(event?:React.FormEvent){
   event?.preventDefault();
   const ws=socket.current;
   if(!ws||status!=='ready'||ws.readyState!==WebSocket.OPEN)return;
   if(!command.trim())return;
   ws.send(JSON.stringify({type:'input',data:command+'\r'}));
   setCommand('');
 }
 function sendCtrlC(){
   const ws=socket.current;
   if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'input',data:'\u0003'}));
 }
 function disconnect(){
   readyRef.current=false;
   socket.current?.close(1000,'USER_DISCONNECTED');
   socket.current=null;setStatus('idle');setMessage('تم قطع الاتصال');
 }
 function copyTerminalOutput(){
   const term=terminalRef.current;
   if(!term)return;
   // Stable public xterm selection API; no experimental buffer access.
   term.selectAll();
   const text=term.getSelection().slice(-160000).trimEnd();
   term.clearSelection();
   if(!text){setMessage('ماكو مخرجات لنسخها');return;}
   void navigator.clipboard.writeText(text)
     .then(()=>setMessage('تم نسخ المخرجات بدون رموز ANSI'))
     .catch(()=>setMessage('تعذر النسخ. جرّب تحديد النص داخل الترمنال.'));
 }
 function clearTerminalOutput(){
   terminalRef.current?.clear();
 }
 function sendAi(event:React.FormEvent){
   event.preventDefault();
   if(!aiPrompt.trim()||aiPrompt.length>4000||status!=='ready'||socket.current?.readyState!==WebSocket.OPEN)return;
   setAiPending(true);setAiAnswer('');
   socket.current.send(JSON.stringify({type:'ai_chat',prompt:aiPrompt.trim()}));
 }
 async function downloadBackup(){
   if(backupBusy)return;
   setBackupBusy(true);
   try{
     const r=await fetch(TERM_PATH+'/backup/latest',{method:'POST',credentials:'same-origin',cache:'no-store'});
     if(!r.ok){
       const j:Record<string,unknown>=await r.json().catch(()=>({}));
       throw Error(errorText(String(j.code||'BACKUP_UNAVAILABLE')));
     }
     const match=(r.headers.get('Content-Disposition')||'').match(/^attachment; filename="(star-home-[0-9]{8}T[0-9]{6}Z-[0-9]+\.tgz)"$/);
     if(!match)throw Error('اسم النسخة غير صالح');
     const blob=await r.blob();
     if(blob.size<1||blob.size>80*1024*1024)throw Error('حجم النسخة غير صالح');
     const url=URL.createObjectURL(blob);
     const a=document.createElement('a');a.href=url;a.download=match[1];document.body.appendChild(a);a.click();a.remove();
     window.setTimeout(()=>URL.revokeObjectURL(url),60000);
     setMessage('تم تجهيز تنزيل النسخة. احفظها في ملفات الآيفون خارج Railway.');
   }catch(e){setMessage(e instanceof Error?e.message:'تعذّر تنزيل النسخة');}
   finally{setBackupBusy(false);}
 }
 return <section className="star-cloud-terminal page-animate" dir="rtl" aria-label="ترمنال سحابي مدمج">
   <div className="star-terminal-heading">
     <div className="star-terminal-brand"><span aria-hidden="true">⌘</span><div><strong>STAR Terminal</strong><small>WORMSTAR / RAILWAY / KALI</small></div></div>
     <span role="status" aria-live="polite" className={'star-terminal-chip '+status}>{status==='ready'?'● متصل':status==='connecting'?'◌ يتصل':status==='error'?'● خطأ':'○ غير متصل'}</span>
   </div>
   <div className="star-terminal-meta" role="status" aria-live="polite">{message}</div>
   <div ref={shellElement} className="star-terminal-frame">
     <div className="star-terminal-toolbar" role="toolbar" aria-label="أوامر التحكم">
       <button type="button" onClick={()=>void beginConnection()} disabled={busy||status==='connecting'||status==='ready'} title="اتصال آمن">▶ <span>اتصال</span></button>
       <button type="button" onClick={()=>void diagnose()} disabled={busy} title="فحص الاتصال">⌕ <span>فحص</span></button>
       <button type="button" onClick={sendCtrlC} disabled={status!=='ready'} title="Ctrl+C">⌃C <span>إيقاف</span></button>
       <button type="button" onClick={copyTerminalOutput} title="نسخ المخرجات">⧉ <span>نسخ</span></button>
       <button type="button" onClick={clearTerminalOutput} title="مسح الشاشة">⌫ <span>مسح</span></button>
       <button type="button" onClick={disconnect} disabled={status==='idle'} title="قطع الاتصال">⏻ <span>قطع</span></button>
     </div>
     <div ref={outputElement} className="star-terminal-output" dir="ltr" aria-label="مخرجات الطرفية"/>
     <form className="star-terminal-input" onSubmit={sendCommand} autoComplete="off">
       <span aria-hidden="true">$</span>
       <input type="text" aria-label="أدخل أمر الترمنال" placeholder={status==='ready'?'مثال: sudo apt update':'اضغط اتصال أولاً'} value={command} maxLength={4096} spellCheck={false} autoComplete="off" autoCapitalize="none" autoCorrect="off" dir="ltr" disabled={status!=='ready'} onChange={e=>setCommand(e.target.value)}/>
       <button type="submit" disabled={status!=='ready'||!command.trim()}>إرسال</button>
     </form>
   </div>
   <div className="star-terminal-extra">
     <button type="button" aria-expanded={aiOpen} onClick={()=>setAiOpen(x=>!x)}>✧ STAR AI {aiOpen?'▴':'▾'}</button>
     <button type="button" aria-expanded={moreOpen} onClick={()=>setMoreOpen(x=>!x)}>▣ النسخ والإعدادات {moreOpen?'▴':'▾'}</button>
   </div>
   {aiOpen&&<form className="star-terminal-ai" onSubmit={sendAi}>
     <label htmlFor="term-ai-prompt">مساعد STAR AI داخل الجلسة</label>
     <div><input id="term-ai-prompt" type="text" value={aiPrompt} maxLength={4000} placeholder="اسأل عن نتائج الأوامر أو تحليل السجلات..." disabled={status!=='ready'||aiPending} onChange={e=>setAiPrompt(e.target.value)}/><button type="submit" disabled={status!=='ready'||!aiPrompt.trim()||aiPending}>{aiPending?'جارٍ التحليل':'اسأل'}</button></div>
     {aiAnswer&&<pre dir="auto">{aiAnswer}</pre>}
   </form>}
   {moreOpen&&<div className="star-terminal-extras">
     <button type="button" onClick={()=>void downloadBackup()} disabled={backupBusy}>{backupBusy?'جارٍ التنزيل':'تنزيل آخر نسخة محفوظة'}</button>
     <small>نفّذ <code dir="ltr">persist backup</code> أولاً. لا تحفظ بيانات حساسة في نسخ عامة.</small>
     <a href="https://wormstar-ai-lab.abdulstarzeki001.workers.dev/terminal/" target="_blank" rel="noopener noreferrer">فتح بوابة Wormstar الأصلية كمسار احتياطي ↗</a>
   </div>}
   <p className="star-terminal-foot">الاتصال محمي عبر Cloudflare Access وService Binding. الترمنال يعمل داخل حاوية Railway السحابية، وليس على جهازك.</p>
 </section>;
}
