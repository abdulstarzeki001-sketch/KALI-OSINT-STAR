import {useEffect,useState} from 'react';
type Kind='instruction'|'note'|'task'|'chat';
type Entry={id:string;kind:Kind;body:string;state:string;room:string;created:number;updated:number};
const labels:Record<Kind,string>={instruction:'تعليمات دائمة',note:'ذاكرة المشروع',task:'مهمة',chat:'أرشيف المحادثات'};
export async function memoryWrite(method:string,data:object){
 const response=await fetch('/api/ai/memory',{method,credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
 if(!response.ok)throw Error('تعذر حفظ البيانات السحابية (HTTP '+response.status+')');
}
export default function DurableMemoryPanel({enabled,onEnabled,onUse}:{enabled:boolean;onEnabled:(v:boolean)=>void;onUse:(s:string)=>void}){
 const [open,setOpen]=useState(false),[items,setItems]=useState<Entry[]>([]),[kind,setKind]=useState<Exclude<Kind,'chat'>>('instruction'),[filter,setFilter]=useState<Kind|'all'>('all'),[body,setBody]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[next,setNext]=useState<number|null>(null);
 async function load(offset=0,chosen=filter){
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/ai/memory?offset='+offset+(chosen==='all'?'':'&kind='+chosen),{credentials:'same-origin',cache:'no-store'});
   if(!r.ok)throw Error('تعذر قراءة الذاكرة. تحقق من تسجيل الدخول وربط D1.');
   const d=await r.json() as {items:Entry[];next:number|null};
   setItems(old=>offset?[...old,...d.items]:d.items);setNext(d.next);
  }catch(e){setError(e instanceof Error?e.message:'تعذر الاتصال');}finally{setBusy(false);}
 }
 useEffect(()=>{if(open)void load(0,filter);},[open,filter]);
 async function change(method:string,data:object){
  setBusy(true);setError('');
  try{await memoryWrite(method,data);if(method==='POST')setBody('');await load(0,filter);}
  catch(e){setError(e instanceof Error?e.message:'تعذر الحفظ');setBusy(false);}
 }
 return <div className="agent-tool-drawer" dir="rtl">
 <button type="button" className="agent-tool-toggle" onClick={()=>setOpen(v=>!v)} aria-expanded={open}><strong>✦ STAR Memory — الذاكرة والتعليمات والمهام</strong><span>{open?'إخفاء −':'فتح ＋'}</span></button>
 <div className="agent-tool-body">
 <label><input type="checkbox" checked={enabled} onChange={e=>onEnabled(e.target.checked)}/> حفظ الرسائل الجديدة سحابياً واستدعاء التعليمات والذاكرة في الدردشة</label>
 <p className="agent-footnote">عند التفعيل تُرسل الذاكرة المختصرة للنموذج المختار، بما فيه البديل إذا اخترت التوجيه التلقائي. لا تحفظ مفاتيح أو كلمات مرور. المهام المحفوظة ليست موافقة على تنفيذ أوامر.</p>
 {open&&<>
 <form onSubmit={e=>{e.preventDefault();if(body.trim())void change('POST',{id:crypto.randomUUID(),kind,body:body.trim()});}}>
 <label>نوع السجل <select value={kind} onChange={e=>setKind(e.target.value as Exclude<Kind,'chat'>)}>{(['instruction','note','task'] as const).map(k=><option key={k} value={k}>{labels[k]}</option>)}</select></label>
 <textarea aria-label="نص الذاكرة أو التعليمات" rows={4} dir="auto" value={body} maxLength={2000} onChange={e=>setBody(e.target.value)} placeholder="اكتب تعليمات ثابتة أو مهمة أو معلومات المشروع"/>
 <button className="agent-primary" disabled={busy||!body.trim()} type="submit">حفظ سحابي</button>
 </form>
 <label>عرض <select disabled={busy} value={filter} onChange={e=>setFilter(e.target.value as Kind|'all')}><option value="all">الكل</option>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 <button type="button" disabled={busy} onClick={()=>void load()}>تحديث</button>
 {error&&<p className="agent-alert" role="alert">{error}</p>}
 {busy&&<p role="status">جارٍ الاتصال...</p>}
 {items.map(x=><article key={x.id} className="agent-tool-body"><strong>{labels[x.kind]} · {x.state}</strong><p dir="auto" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{x.body}</p><small>{new Date(x.updated).toLocaleString('ar-IQ')}</small><div className="agent-tool-row"><button type="button" onClick={()=>onUse(x.body.slice(0,2300))}>استدعاء في الدردشة</button>{x.kind==='task'&&<><button type="button" disabled={busy} onClick={()=>void change('PATCH',{id:x.id,state:x.state==='done'?'pending':'done'})}>{x.state==='done'?'إعادة فتح':'تحديد مكتملة يدوياً'}</button><a href="#runtime">وكيل التنفيذ</a></>}<button type="button" disabled={busy} onClick={()=>{if(window.confirm('حذف هذا السجل السحابي نهائياً؟'))void change('DELETE',{id:x.id});}}>حذف</button></div></article>)}
 {next!==null&&<button type="button" disabled={busy} onClick={()=>void load(next)}>عرض أقدم</button>}
 </>}
 </div></div>;
}
