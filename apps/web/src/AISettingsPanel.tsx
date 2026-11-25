import {useEffect,useState} from 'react';
import './ai-settings.css';
type Profile={prompt:string;enabled:boolean;knowledge:boolean;updated:number};
type Doc={id:string;name:string;chars:number;created:number};
const blank:Profile={prompt:'',enabled:true,knowledge:false,updated:0};
const allowed=/\.(txt|md|csv|json|jsonl|log|yaml|yml|xml|js|ts|tsx|py|sh|html|css|sql|ini|toml)$/i;
async function api(method='GET',data?:object,id?:string){
 const response=await fetch('/api/ai/settings'+(id?'?id='+encodeURIComponent(id):''),{method,credentials:'same-origin',cache:'no-store',...(data?{headers:{'content-type':'application/json'},body:JSON.stringify(data)}:{})});
 if(!response.ok)throw Error('تعذر إتمام العملية (HTTP '+response.status+') — تحقق من جلسة الدخول.');
 return response.json();
}
export default function AISettingsPanel(){
 const [profile,setProfile]=useState<Profile>(blank),[docs,setDocs]=useState<Doc[]>([]),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState(''),[name,setName]=useState(''),[text,setText]=useState('');
 async function load(){
  setBusy(true);setError('');
  try{const data=await api();setProfile(data.profile.updated?data.profile:blank);setDocs(data.docs);setReady(true);}catch(e){setError(e instanceof Error?e.message:'تعذر الاتصال');setReady(false);}finally{setBusy(false);}
 }
 useEffect(()=>{void load();},[]);
 async function action(fn:()=>Promise<void>){setBusy(true);setError('');setStatus('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'تعذرت العملية');}finally{setBusy(false);}}
 async function selectFile(file:File|undefined){
  if(!file)return;
  setError('');
  if(!allowed.test(file.name)||file.size>192000){setError('اختر ملفاً نصياً مدعوماً، بحد 192KB و48 ألف حرف.');return;}
  try{const value=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());if(value.length>48000||value.includes('\u0000'))throw Error('الملف كبير أو غير نصي');setName(file.name.slice(0,150));setText(value);}catch{setError('تعذر قراءة الملف؛ استخدم نص UTF-8.');}
 }
 return <section className="star-settings" dir="rtl" aria-label="إعدادات الذكاء الاصطناعي">
 <header><span className="eyebrow">STAR AI / PERSONALIZATION</span><h2>إعدادات الذكاء الاصطناعي</h2><p>برومبت المالك وملفات المعرفة محفوظة سحابياً لحسابك. لا تضع كلمات مرور أو مفاتيح سرية. التعليمات لا تمنح صلاحية تنفيذ أوامر، والملفات لا تغيّر أوزان النموذج.</p></header>
 {error&&<p role="alert" className="star-settings-error">{error}</p>}
 {status&&<p role="status">{status}</p>}
 {!ready&&<button type="button" disabled={busy} onClick={()=>void load()}>{busy?'جارٍ التحميل...':'إعادة الاتصال'}</button>}
 {ready&&<>
 <form onSubmit={e=>{e.preventDefault();void action(async()=>{const d=await api('PUT',profile);setProfile(p=>({...p,updated:d.updated}));setStatus('تم حفظ إعدادات الذكاء سحابياً');});}}>
 <h3>البرومبت الدائم / Custom Instructions</h3>
 <label><input type="checkbox" checked={profile.enabled} onChange={e=>setProfile(p=>({...p,enabled:e.target.checked}))}/> تطبيق البرومبت على محادثات STAR AI Agent الجديدة والقائمة</label>
 <textarea aria-label="البرومبت الدائم" dir="auto" rows={7} maxLength={1800} value={profile.prompt} onChange={e=>setProfile(p=>({...p,prompt:e.target.value}))} placeholder="حدد شخصية المساعد، طريقة الإجابة، قواعد تطوير المشاريع والتحقق من النتائج."/>
 <small>{profile.prompt.length} / 1800</small>
 <label><input type="checkbox" checked={profile.knowledge} onChange={e=>setProfile(p=>({...p,knowledge:e.target.checked}))}/> استرجاع مقاطع الملفات ذات الصلة أثناء الدردشة</label>
 <p>عند التفعيل، يُرسل البرومبت والمقتطفات ذات الصلة إلى نموذج الدردشة المختار، بما فيه البديل عند اختيار التوجيه التلقائي. الالتزام الحرفي غير مضمون.</p>
 <button type="submit" disabled={busy}>حفظ إعدادات الذكاء</button>
 </form>
 <form onSubmit={e=>{e.preventDefault();void action(async()=>{await api('POST',{id:crypto.randomUUID(),name:name.trim(),text});const data=await api();setDocs(data.docs);setName('');setText('');setStatus('تم حفظ الملف وفهرسة مقاطعه للبحث النصي');});}}>
 <h3>مكتبة المعرفة / Knowledge Base</h3>
 <p>أضف ملفات نصية أو معلومات مباشرة. الحد 50 ملفاً، 48 ألف حرف لكل ملف. البحث بالكلمات وليس تدريباً عصبياً أو بحثاً دلالياً.</p>
 <label>رفع ملف نصي<input type="file" accept=".txt,.md,.csv,.json,.jsonl,.log,.yaml,.yml,.xml,.js,.ts,.tsx,.py,.sh,.html,.css,.sql,.ini,.toml" onChange={e=>{void selectFile(e.target.files?.[0]);e.target.value='';}}/></label>
 <label>اسم الملف أو المعلومة<input dir="auto" required maxLength={150} value={name} onChange={e=>setName(e.target.value)} placeholder="مثال: دليل المشروع.md"/></label>
 <textarea aria-label="نص المعرفة" dir="auto" rows={5} maxLength={48000} value={text} onChange={e=>setText(e.target.value)} placeholder="الصق معلومات أو تعليمات مرجعية هنا"/>
 <small>{text.length} / 48000</small><button type="submit" disabled={busy||!name.trim()||!text.trim()||docs.length>=50}>حفظ وفهرسة المعرفة</button>
 </form>
 <div><h3>الملفات المحفوظة ({docs.length}/50)</h3>{!docs.length&&<p>لا توجد ملفات محفوظة بعد.</p>}
 {docs.map(doc=><article key={doc.id}><strong dir="auto">{doc.name}</strong><small>{doc.chars} حرف · {new Date(doc.created).toLocaleDateString('ar-IQ')}</small><div className="star-settings-actions">
 <button type="button" disabled={busy} onClick={()=>void action(async()=>{const d=await api('GET',undefined,doc.id);const url=URL.createObjectURL(new Blob([d.text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=doc.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);})}>استرجاع الملف</button>
 <button type="button" disabled={busy} onClick={()=>{if(window.confirm('حذف الملف من مكتبة المعرفة؟'))void action(async()=>{await api('DELETE',{id:doc.id});setDocs(old=>old.filter(x=>x.id!==doc.id));setStatus('تم حذف الملف');});}}>حذف</button>
 </div></article>)}</div>
 <p><a href="#agent">فتح الدردشة واختبار البرومبت والمعرفة</a></p>
 </>}
 </section>;
}
