import {useMemo,useState} from 'react';
import {modelInventory} from './model-manager';
import type {InstalledModel,LoadedModel} from './model-manager';
const size=(value:number|null)=>value===null?'غير متاح':(value/1073741824).toFixed(2)+' GiB';
const status=(value:boolean|null)=>value===null?'غير معروف':value?'نعم':'لا';
export default function ModelManagerPanel({installed,loaded}:{installed:InstalledModel[]|null;loaded:LoadedModel[]|null}){
 const inventory=useMemo(()=>modelInventory(installed,loaded),[installed,loaded]);
 const [filter,setFilter]=useState<'all'|'loaded'>('all');
 const [task,setTask]=useState<'coding'|'review'|'general'>('coding');
 return <section className="ai-panel" aria-label="STAR AI Model Manager">
  <h2>STAR AI — إدارة النماذج</h2>
  <small>جرد من تقرير Ollama المستورد وليس اتصالاً حياً. حجم النموذج على القرص ليس متطلب VRAM ولا يثبت ملاءمة التشغيل. لا توجد عمليات تنزيل أو إيقاف أو حذف تلقائية.</small>
  <label>المهمة<select value={task} onChange={e=>setTask(e.target.value as typeof task)}><option value="coding">البرمجة</option><option value="review">مراجعة مستقلة</option><option value="general">التحليل العام</option></select></label>
  <p>المسار المقترح من إعدادات المشروع: {task==='coding'?'Qwen3-Coder · Vast': 'Llama · Cloudflare'}</p>
  <small>اقتراح مبني على الدور المخصص للنموذج، وليس اختبار تفوق أو تحقق اتصال. اختر النموذج من قسم التحليل أو افحص الاتصال والأداء قبل الاستخدام.</small>
  <p>مثبتة: {installed?.length??'غير معروف'} · محملة: {loaded?.length??'غير معروف'}</p>
  <label>عرض النماذج<select value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="all">كل النماذج في التقرير</option><option value="loaded">المحمّلة فقط</option></select></label>
  {inventory===null?<p>الجرد غير متاح. استخرج تقرير GPU جديداً على خادم Ollama.</p>:inventory.filter(m=>filter==='all'||m.loaded===true).map(m=><article key={m.name} className="ai-panel"><strong dir="auto">{m.name}</strong><p>مثبت: {status(m.installed)} · محمّل: {status(m.loaded)}</p><p dir="auto">Parameters: {m.parameterSize??'—'} · Quantization: {m.quantization??'—'}</p><p>حجم القرص: {size(m.diskBytes)} · الحجم المبلغ عنه للنموذج المحمّل: {size(m.loadedBytes)} · VRAM: {size(m.vramBytes)}</p></article>)}
  {inventory!==null&&!inventory.some(m=>filter==='all'||m.loaded===true)&&<p>لا توجد نماذج مطابقة في التقرير المستورد.</p>}
 </section>
}
