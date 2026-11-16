import {useState} from 'react';
import './star-ai.css';

type Answer = {status?:string;model?:string;analysis?:string;notice?:string;error?:string};
const MAX_REPORT = 18000;
export default function StarAIPanel() {
  const [report,setReport]=useState('');
  const [question,setQuestion]=useState('');
  const [analysis,setAnalysis]=useState('');
  const [model,setModel]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [filename,setFilename]=useState('');
  async function readFile(file:File|undefined) {
    if(!file)return;
    if(file.size>60000){setError('الملف أكبر من الحد المسموح؛ الصق مقتطفاً بدون أسرار.');return;}
    try {const contents=await file.text();if(contents.length>MAX_REPORT)throw new Error('المحتوى كبير؛ الحد 18,000 حرف.');setReport(contents);setFilename(file.name);setError('');}
    catch(e){setError(e instanceof Error?e.message:'تعذر قراءة الملف');}
  }
  async function analyze(){
    if(report.trim().length<30||report.length>MAX_REPORT){setError('أدخل تقريراً من 30 إلى 18,000 حرف.');return;}
    setLoading(true);setError('');setAnalysis('');
    try {
      const response=await fetch('/api/ai/analyze',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify({report:report.trim(),question:question.trim()})});
      const contentType=response.headers.get('content-type')||'';
      if(!contentType.includes('application/json'))throw new Error('خدمة التحليل غير مهيأة لهذا العنوان. استخدم النسخة المحمية على Cloudflare.');
      const result:Answer=await response.json();
      if(!response.ok||typeof result.analysis!=='string')throw new Error(result.error||'تعذر تحليل التقرير');
      setAnalysis(result.analysis);setModel(result.model||'Workers AI');
    }catch(e){setError(e instanceof Error?e.message:'تعذر الاتصال بخدمة التحليل');}
    finally{setLoading(false);}
  }
  function exportReport(){
    if(!analysis)return;
    const blob=new Blob(['# STAR AI — Defensive Report Analysis\n\n'+analysis+'\n\nGenerated analysis; verify against original evidence.'],{type:'text/markdown;charset=utf-8'});
    const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='STAR-AI-analysis.md';a.click();URL.revokeObjectURL(u);
  }
  return <section className="star-ai page-animate" dir="rtl">
    <header className="ai-heading"><div><span className="eyebrow">CLOUDFLARE WORKERS AI / DEFENSIVE ANALYSIS</span><h1>STAR AI <span>Security Analyst</span></h1><p>حلّل تقارير مختبراتك، سجلات الدفاع، ومخرجات الأدوات. التحليل اقتراحات مبنية على النص المُرسل وليس اختباراً حقيقياً لأي هدف.</p></div><span className="ai-chip">AI ASSISTANT</span></header>
    <div className="ai-notice">خصوصية البيانات: النص الذي تُرسله سيُعالَج عبر Cloudflare Workers AI. لا تُرسل كلمات مرور، ملفات اعتماد، رموز API، بيانات شخصية أو تقارير حكومية غير مصرح بمشاركتها. لا يُحفظ النص في localStorage داخل هذه الصفحة.</div>
    <div className="ai-grid">
      <div className="ai-panel"><h2>01 — التقرير</h2><label htmlFor="star-ai-report">محتوى التقرير أو سجل التدريب</label><textarea id="star-ai-report" dir="auto" rows={13} value={report} maxLength={MAX_REPORT} onChange={e=>setReport(e.target.value)} placeholder="ألصق هنا تقرير المختبر أو مخرجات منقحة من بيانات حساسة..."/><div className="ai-toolbar"><label className="ai-upload">تحميل ملف TXT / JSON / MD / LOG<input type="file" accept=".txt,.json,.md,.log,text/plain,application/json" onChange={e=>void readFile(e.target.files?.[0])}/></label><span>{filename?filename+' · ':''}{report.length} / {MAX_REPORT}</span></div><label htmlFor="star-ai-question">سؤال تحليلي إضافي (اختياري)</label><input id="star-ai-question" type="text" maxLength={500} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="مثلاً: رتّب المخاطر حسب الأولوية وكيفية المعالجة"/><button className="ai-submit" onClick={()=>void analyze()} disabled={loading||report.trim().length<30}>{loading?'جارٍ التحليل...':'تحليل التقرير بواسطة STAR AI'}</button></div>
      <div className="ai-panel"><div className="ai-result-head"><h2>02 — النتائج والتحسينات الدفاعية</h2><button type="button" disabled={!analysis} onClick={exportReport}>تنزيل Markdown</button></div>{error&&<p className="ai-error" role="alert">{error}</p>}{analysis?<><p className="ai-model">تم إنشاء الإجابة بواسطة {model} · راجع الأدلة يدوياً</p><pre className="ai-result" dir="auto">{analysis}</pre></>:<div className="ai-empty">النتائج تظهر هنا بعد إرسال تقرير حقيقي. لن نولّد نتائج افتراضية أو ندّعي أن أدوات Kali فحصت جهازك.</div>}</div>
    </div>
  </section>;
}
