import {useMemo,useRef,useState} from 'react';
import {addFile,editFile,diffLines,workspaceReport,MAX_SOURCE_BYTES,MAX_WORKSPACE_FILES} from './project-workspace';
import type {WorkspaceFile} from './project-workspace';
function save(name:string,text:string,type='text/plain;charset=utf-8'){
 const url=URL.createObjectURL(new Blob([text],{type}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function ProjectWorkspacePanel(){
 const [files,setFiles]=useState<WorkspaceFile[]>([]);
 const [active,setActive]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const lock=useRef(false);
 const [showDiff,setShowDiff]=useState(false);
 const [confirmReset,setConfirmReset]=useState(false);
 const selected=files.find(f=>f.name===active);
 const diff=useMemo(()=>selected&&showDiff?diffLines(selected.original,selected.draft):[],[selected,showDiff]);
 async function openFiles(list:FileList|null){
  if(!list||lock.current)return;
  const batch=Array.from(list);
  if(files.length+batch.length>MAX_WORKSPACE_FILES){setError('الحد الأقصى 12 ملفاً');return;}
  lock.current=true;setBusy(true);setError('');
  try{
   let next=files;
   for(const file of batch){
    if(file.size>MAX_SOURCE_BYTES)throw Error('حجم الملف يتجاوز الحد');
    const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());
    next=addFile(next,file.name,text);
   }
   setFiles(next);if(batch.length)setActive(batch[0].name);
  }catch{setError('لم يتم استيراد الدفعة: اسم مكرر، نوع غير مدعوم، ترميز غير صالح أو تجاوز الحد.')}
  finally{setBusy(false);lock.current=false}
 }
 function update(value:string){
  if(!selected||busy)return;
  try{setFiles(editFile(files,selected.name,value));setError('')}
  catch{setError('تم رفض التعديل لتجاوز حد حجم الملف أو عدد الأسطر.')}
 }
 function remove(){
  if(!selected||busy)return;
  const next=files.filter(f=>f.name!==selected.name);setFiles(next);setActive(next[0]?.name||'');
  setConfirmReset(false);
 }
 return <section className="ai-panel" aria-label="STAR AI Project Workspace">
  <h2>STAR AI — مساحة العمل الهندسية</h2>
  <small>مساحة تحرير محلية مؤقتة لملفاتك المملوكة، حتى 12 ملفاً و600 سطر لكل ملف. لا يُنفّذ الكود ولا تُرسل الملفات أو تُحفظ في الذاكرة الدائمة. لا تستورد بيانات اعتماد أو ملفات حساسة. احفظ التعديلات قبل إغلاق الصفحة.</small>
  <label className="ai-upload">فتح ملفات المشروع<input type="file" multiple disabled={busy} accept=".py,.ts,.tsx,.js,.jsx,.mjs,.json,.md,.txt,.css,.html,.yaml,.yml,.toml" onChange={e=>{void openFiles(e.target.files);e.currentTarget.value=''}}/></label>
  {error&&<p className="ai-error" role="alert">{error}</p>}
  <p role="status">{files.length} / {MAX_WORKSPACE_FILES} ملفات · {files.filter(f=>f.original!==f.draft).length} ملفات معدلة</p>
  {files.length>0&&<>
   <label>الملف الحالي<select value={active} disabled={busy} onChange={e=>{setActive(e.target.value);setConfirmReset(false)}}>{files.map(f=><option key={f.name} value={f.name}>{f.name}{f.original!==f.draft?' *':''}</option>)}</select></label>
   {selected&&<>
    <label>محرر النص البرمجي<textarea dir="ltr" spellCheck={false} autoCorrect="off" autoCapitalize="off" rows={16} disabled={busy} value={selected.draft} onChange={e=>update(e.target.value)}/></label>
    <button type="button" disabled={busy} onClick={()=>save(selected.name,selected.draft)}>تنزيل الملف المعدل</button>
    <button type="button" onClick={()=>setShowDiff(v=>!v)}>{showDiff?'إخفاء المقارنة':'مقارنة النسخة الأصلية والمعدلة'}</button>
    {showDiff&&<div className="ai-panel"><p>+{diff.filter(l=>l.kind==='add').length} / −{diff.filter(l=>l.kind==='remove').length}</p><pre dir="ltr" className="ai-source-view" style={{maxHeight:420,overflow:'auto'}}>{diff.map((l,i)=><div key={i} style={{color:l.kind==='add'?'#16a34a':l.kind==='remove'?'#dc2626':undefined}}>{l.kind==='add'?'+':l.kind==='remove'?'-':' '} {l.oldLine??' '}:{l.newLine??' '} {l.text}</div>)}</pre></div>}
    <label><input type="checkbox" checked={confirmReset} onChange={e=>setConfirmReset(e.target.checked)}/> تأكيد التخلص من تعديلات الملف الحالي</label>
    <button type="button" disabled={!confirmReset||busy} onClick={()=>{update(selected.original);setConfirmReset(false)}}>استعادة الأصل</button>
    <button type="button" disabled={!confirmReset||busy} onClick={remove}>إغلاق الملف دون حفظ</button>
   </>}
   <button type="button" disabled={busy} onClick={()=>save('star-workspace-report.json',JSON.stringify(workspaceReport(files),null,2),'application/json')}>تصدير ملخص التعديلات دون محتوى الكود</button>
  </>}
  <small>المقارنة نصية وليست اختبار تشغيل. استخدم الاختبارات الموثوقة في بيئة تطوير مستقلة للتحقق من التعديلات.</small>
 </section>
}
