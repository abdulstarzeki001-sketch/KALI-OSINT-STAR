import {useState} from 'react';
import SafeMarkdown from './SafeMarkdown';
import StarQualityPanel from './StarQualityPanel';
import IntelligentDebuggerPanel from './IntelligentDebuggerPanel';
import {AI_MODELS,PRIVATE_MODEL} from './ai-models';
import type {AIModel} from './ai-models';
import './star-ai.css';

type Answer = {status?:string;model?:string;analysis?:string;notice?:string;error?:string};
const MAX_REPORT = 18000;
const SAFE_TEST_REPORT = 'SYNTHETIC TEST ONLY. Authorized offline virtual lab: host 192.168.56.10 has SSH TCP/22 reachable; TCP/8080 unreachable; SSH patch status unknown. No exploitation performed and no credentials processed. Please suggest defensive validation and remediation.';
export default function StarAIPanel() {
  const [toolCommand,setToolCommand]=useState('');
  const [toolWorking,setToolWorking]=useState(false);
  const [toolResponse,setToolResponse]=useState('');
  const [toolOutput,setToolOutput]=useState('');
  const [toolError,setToolError]=useState('');
  const [report,setReport]=useState('');
  const [question,setQuestion]=useState('');
  const [analysis,setAnalysis]=useState('');
  const [model,setModel]=useState('');
  const [reportModel,setReportModel]=useState<AIModel>(PRIVATE_MODEL);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [filename,setFilename]=useState('');
  const [testState,setTestState]=useState<'idle'|'running'|'passed'|'failed'>('idle');
  const [testFeedback,setTestFeedback]=useState('');
  const [resultView,setResultView]=useState<'formatted'|'source'>('formatted');
  const [copyFeedback,setCopyFeedback]=useState('');
  async function executeToolPrompt(){
    if(!toolCommand.trim()||toolCommand.length>400||toolWorking)return;
    setToolWorking(true);setToolError('');setToolResponse('');setToolOutput('');
    try{
      const response=await fetch('/api/terminal/tools/assistant',{method:'POST',
        credentials:'same-origin',cache:'no-store',
        headers:{'Accept':'application/json','Content-Type':'application/json'},
        body:JSON.stringify({prompt:toolCommand.trim()})
      });
      if(!(response.headers.get('content-type')||'').includes('application/json'))
        throw Error('انتهت جلسة Cloudflare Access أو الاستجابة ليست JSON');
      const data=await response.json() as {
        code?:string;result?:{tool_id:string;installed:boolean;executed:boolean;
          outcome:string;stdout:string;stderr:string;exitCode:number|null};
        explanation?:string|null;aiSource?:string;
      };
      if(!response.ok) {
        const errors:Record<string,string>={
          TOOLS_REQUIRES_AUTHORIZED_LAB:'لا يُسمح بالتنفيذ التلقائي لهذا الطلب. يلزم مختبر وموافقة صريحة.',
          TOOLS_NAME_REQUIRED:'اذكر أداة واحدة من مكتبة الأدوات الـ15.',
          TOOLS_AMBIGUOUS:'اختر أداة واحدة، وليس عدة أدوات في طلب واحد.',
          TOOLS_ACTION_NOT_ALLOWED:'الفحص المطلوب غير مسموح تلقائياً لهذه الأداة.',
          TOOLS_RATE_LIMIT:'الطلبات متقاربة جداً، جرّب مجدداً.',
        };
        throw Error(errors[data.code||'']||data.code||'فشل تنفيذ الطلب');
      }
      const r=data.result;
      if(!r)throw Error('النتيجة لا تتضمن فحصاً من Railway');
      setToolResponse((data.explanation||'').trim()||
        (r.installed?'عُثر على الملف داخل Railway. ':'لم يُكتشف ملف الأداة في Railway. ')+
        (r.executed?'تم تشغيل أمر إصدار ثابت.':'أُجري جرد محلي فقط دون تشغيل الأداة.'));
      setToolOutput([
        'Tool: '+r.tool_id,'Installed: '+r.installed,'Executed: '+r.executed,
        'Outcome: '+r.outcome,'Exit code: '+(r.exitCode??'not run'),
        (r.stdout||r.stderr||'').slice(0,2000)
      ].join('\n'));
    }catch(e){setToolError(e instanceof Error?e.message:'تعذّر تنفيذ فحص الأدوات');}
    finally{setToolWorking(false);}
  }
  async function readFile(file:File|undefined) {
    if(!file)return;
    if(file.size>60000){setError('الملف أكبر من الحد المسموح؛ الصق مقتطفاً بدون أسرار.');return;}
    try {const contents=await file.text();if(contents.length>MAX_REPORT)throw new Error('المحتوى كبير؛ الحد 18,000 حرف.');setReport(contents);setFilename(file.name);setError('');}
    catch(e){setError(e instanceof Error?e.message:'تعذر قراءة الملف');}
  }
  // Both controls use the same protected production endpoint; no mock is used in the browser.
  async function submitReport(text:string,prompt:string):Promise<Answer> {
    let response:Response;
    try {
      response=await fetch('/api/ai/analyze',{
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        credentials:'same-origin',
        cache:'no-store',
        body:JSON.stringify({report:text,question:prompt,model:reportModel})
      });
    } catch {
      throw new Error('تعذر الوصول إلى التحليل. تأكد من تسجيل الدخول عبر Cloudflare Access ثم أعد المحاولة.');
    }
    const contentType=response.headers.get('content-type')||'';
    if(!contentType.toLowerCase().includes('application/json'))
      throw new Error('الاستجابة ليست JSON. قد تكون الجلسة منتهية أو الموقع يعرض صفحة تسجيل الدخول.');
    const result:Answer=await response.json().catch(()=>({error:'استجابة JSON غير صالحة'}));
    if(!response.ok)throw new Error('HTTP '+response.status+' — '+(result.error||'تعذر تنفيذ الطلب'));
    if(result.status!=='completed'||typeof result.analysis!=='string'||result.analysis.trim().length<30)
      throw new Error('الخدمة لم تُرجع تحليلاً مكتملًا وقابلاً للقراءة.');
    return result;
  }

  async function analyze(){
    if(report.trim().length<30||report.length>MAX_REPORT){setError('أدخل تقريراً من 30 إلى 18,000 حرف.');return;}
    setLoading(true);setError('');setAnalysis('');setCopyFeedback('');setResultView('formatted');
    try {
      const result=await submitReport(report.trim(),question.trim());
      setAnalysis(result.analysis||'');setModel(result.model||'Workers AI');
    } catch(e){setError(e instanceof Error?e.message:'تعذر تحليل التقرير');}
    finally{setLoading(false);}
  }

  async function testAuthenticatedSession(){
    setTestState('running');setTestFeedback('');setError('');setCopyFeedback('');setResultView('formatted');
    const started=performance.now();
    try{
      const response=await submitReport(SAFE_TEST_REPORT,'Summarize the lab findings in Arabic and recommend defensive validation.');
      const elapsed=Math.round(performance.now()-started);
      setAnalysis(response.analysis||'');setModel(response.model||'Workers AI');
      setTestState('passed');
      setTestFeedback('نجح الاختبار من جلسة المتصفح الحالية: استجابة HTTP ناجحة، حالة completed وتحليل فعلي. الزمن التقريبي '+elapsed+' ms. لا يعني هذا تشغيل أي فحص Kali.');
    }catch(e){
      setTestState('failed');
      setTestFeedback('لم يكتمل اختبار الجلسة: '+(e instanceof Error?e.message:'خطأ غير معروف'));
    }
  }
  async function copyReport(){
    if(!analysis)return;
    try{await navigator.clipboard.writeText(analysis);setCopyFeedback('تم نسخ التقرير إلى الحافظة');}
    catch{setCopyFeedback('تعذر النسخ. استخدم خيار تنزيل Markdown.');}
  }
  function exportReport(){
    if(!analysis)return;
    const blob=new Blob(['# STAR AI — Defensive Report Analysis\n\n'+analysis+'\n\nGenerated analysis; verify against original evidence.'],{type:'text/markdown;charset=utf-8'});
    const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='STAR-AI-analysis.md';a.click();URL.revokeObjectURL(u);
  }
  return <section className="star-ai page-animate" dir="rtl">
    <header className="ai-heading"><div><h1>STAR AI <span>Security Analyst</span></h1><p>حلّل تقارير مختبراتك، سجلات الدفاع، ومخرجات الأدوات.</p></div></header>
    <div className="ai-notice">النص يُعالَج على الخادم الذي تختاره أدناه. أزل كلمات المرور ورموز API والبيانات الحساسة قبل الإرسال.</div>
    <label className="ai-model-picker">
      <span>نموذج تحليل التقارير</span>
      <select value={reportModel} disabled={loading||testState==='running'} onChange={e=>setReportModel(e.target.value as AIModel)}>
        {AI_MODELS.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
    <form className="ai-tool-command" onSubmit={e=>{e.preventDefault();void executeToolPrompt();}}>
      <div><strong>STAR AI → Railway Tool Executor</strong><small>مثال: «افحص Frida» أو «اعرض إصدار NetExec». ينفذ فحصاً محلياً ثابتاً فقط، ولا يرسل أوامر Shell أو يبدأ C2 تلقائياً.</small></div>
      <div className="ai-tool-command-row">
        <input aria-label="طلب استخدام أداة من الذكاء الاصطناعي" value={toolCommand} maxLength={400}
          onChange={e=>setToolCommand(e.target.value)} placeholder="افحص Frida داخل Railway" dir="auto"/>
        <button disabled={toolWorking||!toolCommand.trim()} type="submit">{toolWorking?'جارٍ التنفيذ...':'نفّذ الفحص'}</button>
      </div>
      {toolError&&<p role="alert" className="ai-error">{toolError}</p>}
      {toolResponse&&<div className="ai-tool-command-result" role="status"><p>{toolResponse}</p>
        <pre dir="ltr">{toolOutput}</pre></div>}
    </form>
    <div className="ai-selftest" aria-label="اختبار التحليل من جلسة مستخدم مصادق عليها">
      <div><strong>اختبار التحليل من جلستي المسجّلة</strong><small>يرسل تقريراً وهمياً فقط إلى نفس مسار التحليل المحمي، ويتحقق من الاستجابة الحقيقية. لا يحتاج مشاركة الرمز أو كلمة السر.</small></div>
      <button type="button" disabled={loading||testState==='running'} onClick={()=>void testAuthenticatedSession()}>{testState==='running'?'جارٍ الاختبار...':'اختبار الجلسة والتحليل الآن'}</button>
    </div>
    {testState!=='idle'&&testState!=='running'&&<p className={'ai-test-result '+(testState==='passed'?'ok':'failed')} role={testState==='failed'?'alert':'status'}>{testFeedback}</p>}
    <StarQualityPanel/>
    <IntelligentDebuggerPanel onReport={value=>{setReport(value);setFilename('star-debugger-report.json');setQuestion('راجع تصنيفات أخطاء البناء المرفقة واقترح خطوات تحقق وإصلاح دفاعية دون ادعاء تنفيذ الاختبارات.');setError('');setAnalysis('');}}/>
    <div className="ai-grid">
      <div className="ai-panel"><h2>01 — التقرير</h2><label htmlFor="star-ai-report">محتوى التقرير أو سجل التدريب</label><textarea id="star-ai-report" dir="auto" rows={13} value={report} maxLength={MAX_REPORT} onChange={e=>setReport(e.target.value)} placeholder="ألصق هنا تقرير المختبر أو مخرجات منقحة من بيانات حساسة..."/><div className="ai-toolbar"><label className="ai-upload">تحميل ملف TXT / JSON / MD / LOG<input type="file" accept=".txt,.json,.md,.log,text/plain,application/json" onChange={e=>void readFile(e.target.files?.[0])}/></label><span>{filename?filename+' · ':''}{report.length} / {MAX_REPORT}</span></div><label htmlFor="star-ai-question">سؤال تحليلي إضافي (اختياري)</label><input id="star-ai-question" type="text" maxLength={500} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="مثلاً: رتّب المخاطر حسب الأولوية وكيفية المعالجة"/><button className="ai-submit" onClick={()=>void analyze()} disabled={loading||report.trim().length<30}>{loading?'جارٍ التحليل...':'تحليل التقرير بواسطة STAR AI'}</button></div>
      <div className="ai-panel ai-output-panel">
        <div className="ai-result-head"><div><h2>02 — النتائج والتحسينات الدفاعية</h2><p className="ai-result-subtitle">تقرير قابل للقراءة، مع دعم العربية والأكواد والجداول</p></div></div>
        {analysis&&<div className="ai-actions" aria-label="خيارات عرض التقرير">
          <div className="ai-view-tabs" role="group" aria-label="طريقة العرض">
            <button type="button" aria-pressed={resultView==='formatted'} className={resultView==='formatted'?'active':''} onClick={()=>setResultView('formatted')}>عرض منسق</button>
            <button type="button" aria-pressed={resultView==='source'} className={resultView==='source'?'active':''} onClick={()=>setResultView('source')}>النص الأصلي</button>
          </div>
          <div className="ai-export-actions">
            <button type="button" onClick={()=>void copyReport()}>نسخ</button>
            <button type="button" onClick={exportReport}>تنزيل .md</button>
          </div>
        </div>}
        {copyFeedback&&<p className="ai-copy-feedback" role="status">{copyFeedback}</p>}
        {error&&<p className="ai-error" role="alert">{error}</p>}
        {analysis?<><p className="ai-model">تم إنشاء الإجابة بواسطة {model} · راجع الأدلة يدوياً</p>
          <div className="ai-result ai-rich-output" aria-label="نتيجة تحليل STAR AI" aria-live="polite">
            {resultView==='formatted'?<SafeMarkdown source={analysis}/>:<pre className="ai-source-view" dir="auto">{analysis}</pre>}
          </div>
        </>:<div className="ai-empty">النتائج تظهر هنا بعد إرسال تقرير حقيقي. لن نولّد نتائج افتراضية أو ندّعي أن أدوات Kali فحصت جهازك.</div>}
      </div>
    </div>
  </section>;
}
