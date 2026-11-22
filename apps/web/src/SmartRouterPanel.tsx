import {useState} from 'react';
import {recommendModel} from './smart-router';
import type {RouteTask,Probes} from './smart-router';
import type {Run} from './engineering-memory';
import type {AIModel} from './ai-models';
const labels:Record<AIModel,string>={'qwen3-coder-vast':'Qwen3-Coder 30B · Vast','llama-cloudflare':'Llama 3.3 70B · Cloudflare'};
const reasons={role:'الدور المخصص للمهمة؛ الأدلة المقارنة غير كافية أو لا تستدعي تغييراً',connectivity:'النموذج الآخر استجاب حديثاً لاختبار الاتصال',benchmark:'درجة أفضل في الاختبار المرجعي المحدود',latency:'زمن اختبار اتصال أقل مع تقارب درجات الاختبار', 'no-confirmed-route':'تعذر اتصال المسار المفضل ولم يستجب مسار بديل حديثاً'};
export default function SmartRouterPanel({runs,probes,current,onChoose,disabled}:{runs:Run[];probes:Probes;current:AIModel;onChoose:(m:AIModel)=>void;disabled:boolean}){
 const [task,setTask]=useState<RouteTask>('coding');
 const [decision,setDecision]=useState<ReturnType<typeof recommendModel>|null>(null);
 function preview(){setDecision(recommendModel(task,runs,probes,Date.now()))}
 function apply(){
  const latest=recommendModel(task,runs,probes,Date.now());
  if(!decision||latest.model!==decision.model||latest.reason!==decision.reason){setDecision(latest);return}
  if(latest.model)onChoose(latest.model);
  setDecision(latest);
 }
 return <section className="ai-panel" aria-label="STAR AI Smart Router">
  <h2>STAR AI — اختيار النموذج الذكي</h2>
  <small>التوصية محلية دون إرسال التقرير. تستفيد من فحوص الاتصال خلال 15 دقيقة ومن 3 إلى 10 اختبارات مرجعية مكتملة لكل نموذج خلال 7 أيام (عند حفظ السجل اختيارياً). هذه مؤشرات محدودة وغير موقّعة، وليست قياساً شاملاً للجودة أو التكلفة.</small>
  <label>نوع المهمة<select value={task} disabled={disabled} onChange={e=>{setTask(e.target.value as RouteTask);setDecision(null)}}><option value="coding">برمجة وصيانة</option><option value="review">مراجعة مستقلة</option><option value="general">تحليل عام</option></select></label>
  <p>المسار المختار حالياً: {labels[current]}</p>
  <button type="button" disabled={disabled} onClick={preview}>احسب التوصية</button>
  {decision&&<>
   <p role="status">المقترح: {decision.model?labels[decision.model]:'لا يوجد مسار مؤكد'}</p>
   <p>{reasons[decision.reason]}</p>
   {decision.evidence.map(e=><article key={e.model}><strong>{labels[e.model]}</strong><p>الاتصال: {e.connection==='responded'?'استجابة حديثة':e.connection==='failed'?'تعذر الاتصال حديثاً':'غير معروف'} · زمن الطلب: {e.latencyMs??'—'} ms</p><p>الاختبارات المكتملة: {e.benchmarkCount} · الدرجة: {e.averageScore===null?'أدلة غير كافية':e.averageScore.toFixed(2)+' / 5'}</p></article>)}
   <button type="button" disabled={disabled||!decision.model} onClick={apply}>اعتماد المسار المقترح دون إرسال التقرير</button>
   <small>إذا تغيرت التوصية عند الاعتماد، تُعرض النتيجة الجديدة أولاً. لا يُعاد إرسال أي تقرير تلقائياً عند تعطل مزود، ولا تُستنتج تكلفة غير معروفة.</small>
  </>}
 </section>
}
