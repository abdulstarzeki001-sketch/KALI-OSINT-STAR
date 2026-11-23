import {useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import SafeMarkdown from './SafeMarkdown';
import './cyber-ai.css';

type Kind='code'|'config'|'headers'|'logs'|'report';
type Finding={id:string;severity:string;line:number;recommendation:string; evidence:string};
type Audit={kind:string;lines_analyzed:number;findings:Finding[];counts:Record<string,number>;limitation:string};
type Review={analysis:string;model:string;local_audit:Audit;notice:string};
type SourceFile={path:string;content:string};
type DeepFinding={id:string;title:string;severity:string;cwe:string;confidence:string;path:string;line:number;recommendation:string};
type DeepAudit={schema:number;engine:string;summary:{
  files_analyzed:number;lines_analyzed:number;rules_available:number;findings:number;
  risk_priority_score:number;counts:Record<string,number>;truncated:boolean
};findings:DeepFinding[];limitation:string};
type ApiError={error?:string|{code?:string;message?:string}};
const KINDS:{id:Kind;label:string}[]=[
  {id:'code',label:'شيفرة برمجية'}, {id:'config',label:'إعدادات أمنية'},
  {id:'headers',label:'HTTP Headers'}, {id:'logs',label:'سجلات النظام'},
  {id:'report',label:'تقرير فحص'}
];
async function invoke(action:string,payload:Record<string,unknown>={}) {
  const res=await fetch('/api/ai/cyber',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    // Security review can depend on a temporarily unavailable GPU provider.
    // Fail with an actionable error rather than leaving the iPhone UI pending indefinitely.
    ...(action==='review'?{signal:AbortSignal.timeout(75000)}:{}),
    headers:{'content-type':'application/json'},
    body:JSON.stringify({action,...payload})
  });
  const data=await res.json() as Record<string,unknown>&ApiError;
  if(!res.ok){
    const message=typeof data.error==='string'?data.error:data.error?.code||'Request failed';
    throw Error(message+' (HTTP '+res.status+')');
  }
  return data;
}
function saveReport(name:string, data:unknown){
  const content=JSON.stringify(data,null,2);
  const link=URL.createObjectURL(new Blob([content],{type:'application/json;charset=utf-8'}));
  const a=document.createElement('a');a.href=link;a.download=name;a.click();
  window.setTimeout(()=>URL.revokeObjectURL(link),1000);
}

function saveMarkdownReport(report:DeepAudit){
  // Export findings only; never include source code, log contents or credentials.
  const lines=['# STAR Cyber Deep Audit', '',
    'Engine: '+report.engine,
    'Files analyzed: '+report.summary.files_analyzed,
    'Rules available: '+report.summary.rules_available,
    'Findings (heuristic, not confirmed vulnerabilities): '+report.summary.findings,
    'Results truncated: '+(report.summary.truncated?'yes':'no'),'',
    '## Findings', ''];
  for(const finding of report.findings){
    lines.push('### '+finding.id+' — '+finding.title,
      '- Severity: '+finding.severity,
      '- CWE: '+finding.cwe,
      '- Confidence: '+finding.confidence,
      '- Location: '+finding.path+':'+finding.line,
      '- Recommendation: '+finding.recommendation,'');
  }
  lines.push('## Limitations',report.limitation,
    'Validate every result before treating it as a confirmed vulnerability.');
  const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/markdown;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download='star-cyber-deep-audit.md';anchor.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export default function CyberAIPanel(){
  const [kind,setKind]=useState<Kind>('code');
  const [artifact,setArtifact]=useState('');
  const [question,setQuestion]=useState('');
  const [models,setModels]=useState<string[]>([]);
  const [model,setModel]=useState('');
  const [audit,setAudit]=useState<Audit|null>(null);
  const [review,setReview]=useState<Review|null>(null);
  const [error,setError]=useState('');
  const [availability,setAvailability]=useState('جاري فحص الاتصال المحمي...');
  const [running,setRunning]=useState<'audit'|'review'|null>(null);
  const [filePath,setFilePath]=useState('snippet.js');
  const [uploadedFiles,setUploadedFiles]=useState<SourceFile[]>([]);
  const [deepReport,setDeepReport]=useState<DeepAudit|null>(null);
  const [scannedFiles,setScannedFiles]=useState<SourceFile[]>([]);
  const [deepRunning,setDeepRunning]=useState<'scan'|'export'|'explain'|null>(null);
  const [deepError,setDeepError]=useState('');
  const [deepFeedback,setDeepFeedback]=useState('');
  const [severityFilter,setSeverityFilter]=useState('all');
  const [findingQuery,setFindingQuery]=useState('');
  const deepInputCount=uploadedFiles.length+(artifact.trim().length>=3?1:0);
  const severities=Array.from(new Set(deepReport?.findings.map(f=>f.severity)||[])).sort();
  const visibleFindings=(deepReport?.findings||[]).filter(f=>{
    if(severityFilter!=='all'&&f.severity!==severityFilter)return false;
    const query=findingQuery.trim().toLowerCase();
    return !query||[f.id,f.title,f.cwe,f.path,f.recommendation].some(v=>v.toLowerCase().includes(query));
  });
  useEffect(()=>{
    let alive=true;
    invoke('models').then(data=>{
      if(!alive)return;
      const ids=Array.isArray(data.data)?data.data.map(x=>typeof x?.id==='string'?x.id:'').filter(Boolean):[];
      setModels(ids);setModel(ids[0]||'');
      setAvailability(ids.length?'تتوفر نماذج AI مهيأة للاستخدام':'لا توجد نماذج API مهيأة حالياً. التدقيق المحلي مستقل عن النموذج.');
    }).catch(err=>{if(alive)setAvailability('خدمة Gateway غير مهيأة أو لا يمكن الوصول إليها: '+String(err.message));});
    return ()=>{alive=false;};
  },[]);
  async function execute(action:'audit'|'review',event:FormEvent){
    event.preventDefault();
    if(running)return;
    setRunning(action);setError('');
    if(action==='review')setReview(null);else setAudit(null);
    try{
      const data=await invoke(action,{kind,artifact, ...(action==='review'?{model,question}:{})});
      if(action==='audit')setAudit(data as unknown as Audit);
      else {const result=data as unknown as Review;setReview(result);setAudit(result.local_audit);}
    }catch(err){
      const detail=err instanceof Error?err.message:'فشل طلب التدقيق';
      const providerProblem=action==='review'&&model!=='llama-cloudflare'&&
        /HTTP (?:429|502|503|504)|provider_|unavailable|timeout|AbortError|TimeoutError|network/i.test(detail);
      setError(providerProblem?
        detail+' — تعذرت مراجعة Qwen السحابية. الفحص النصي المحلي مستقل ويمكن تشغيله الآن. إذا رغبت، اختر llama-cloudflare يدوياً وأعد المحاولة؛ ستُرسل الشيفرة بعد تنقيح الأنماط المعروفة من الأسرار إلى ذلك المزود.':
        detail);
    }
    finally{setRunning(null);}
  }
  async function readSources(input:FileList|null){
    if(!input?.length)return;
    setDeepError('');setDeepFeedback('');
    try{
      const files=Array.from(input);
      if(files.length>8)throw Error('الحد الأقصى 8 ملفات في الطلب الواحد');
      const parsed:SourceFile[]=[];
      for(const file of files){
        if(file.size>35000)throw Error('الملف '+file.name+' كبير، الحد 16000 حرف');
        const content=await file.text();
        if(content.includes('\\0')||content.trim().length<3||content.length>16000)
          throw Error('ملف غير نصي أو يتجاوز الحد: '+file.name);
        parsed.push({path:file.name,content});
      }
      if(parsed.reduce((sum,f)=>sum+f.content.length,0)>48000)
        throw Error('مجموع الملفات أكبر من 48000 حرف');
      if(new Set(parsed.map(f=>f.path)).size!==parsed.length)
        throw Error('هناك ملفات بنفس الاسم. غيّر اسم أحد الملفات');
      setUploadedFiles(parsed);
      setDeepFeedback('تم تحميل '+parsed.length+' ملفات في ذاكرة الصفحة فقط');
    }catch(e){setDeepError(e instanceof Error?e.message:'تعذر فتح الملفات');}
  }
  function sourceInputs():SourceFile[]{
    const items=[...uploadedFiles];
    if(artifact.trim().length>=3)items.push({path:filePath.trim(),content:artifact});
    if(items.length<1||items.length>8)throw Error('اختر بين ملف واحد وثمانية ملفات');
    if(items.some(f=>!f.path||f.content.length>16000))
      throw Error('اسم الملف مطلوب وحجم كل ملف لا يتجاوز 16000 حرف');
    if(items.reduce((n,f)=>n+f.content.length,0)>48000)
      throw Error('مجموع النصوص يتجاوز 48000 حرف');
    if(new Set(items.map(f=>f.path)).size!==items.length)throw Error('تكرار اسم ملف');
    return items;
  }
  async function runDeep(){
    if(deepRunning)return;
    setDeepRunning('scan');setDeepError('');setDeepReport(null);
    try{
      const files=sourceInputs();
      const data=await invoke('deep_audit',{files,format:'json'});
      if(data.schema!==1||!Array.isArray(data.findings))throw Error('استجابة Deep Audit غير صالحة');
      setScannedFiles(files);
      setDeepReport(data as unknown as DeepAudit);
    }catch(e){setDeepError(e instanceof Error?e.message:'فشل التدقيق');}
    finally{setDeepRunning(null);}
  }
  async function exportSarif(){
    if(!scannedFiles.length||!deepReport||deepRunning)return;
    setDeepRunning('export');setDeepError('');
    try{
      const data=await invoke('deep_audit',{files:scannedFiles,format:'sarif'});
      if(data.version!=='2.1.0')throw Error('صيغة SARIF غير مدعومة');
      saveReport('star-cyber-deep-audit.sarif',data);
    }catch(e){setDeepError(e instanceof Error?e.message:'تعذر توليد SARIF');}
    finally{setDeepRunning(null);}
  }
  async function explainDeep(){
    if(!deepReport||!model||deepRunning)return;
    setDeepRunning('explain');setDeepError('');setReview(null);
    try{
      const summary=[
        'This is a heuristic static analysis report, not confirmed vulnerabilities.',
        JSON.stringify(deepReport.summary),
        ...deepReport.findings.slice(0,30).map(f=>
          f.path+':'+f.line+' '+f.id+' '+f.cwe+' '+f.severity+' — '+f.recommendation)
      ].join('\\n').slice(0,15000);
      const data=await invoke('review',{kind:'report',artifact:summary,model,
        question:question||'رتب الأولويات، اشرح المخاطر بدقة، واقترح طريقة تحقق وإصلاح بدون افتراض أن الثغرة مؤكدة'});
      setReview(data as unknown as Review);
    }catch(e){setDeepError(e instanceof Error?e.message:'فشل تفسير التقرير بواسطة AI');}
    finally{setDeepRunning(null);}
  }
  return <section className="cyber-ai-page page-animate" dir="rtl">
    <header className="cyber-heading">
      <span className="eyebrow">STAR AI / AUTHORIZED SECURITY REVIEW</span>
      <h1>المحلل السيبراني <span>STAR AI Cyber</span></h1>
      <p>مراجعة أكواد وتكوينات وسجلات وأنظمة حماية بناءً على الأدلة التي تزودنا بها، بدون إجراء مسح على أي هدف أو تشغيل أوامر غير مصرح بها.</p>
    </header>
    <div className="cyber-notice" role="status">{availability}</div>

    <section className="cyber-deep cyber-pane" aria-label="فحص أمني عميق متعدد الملفات">
      <div className="cyber-deep-head">
        <div><span className="eyebrow">STAR DEEP AUDIT / OFFLINE ENGINE</span>
          <h2>فحص سيبراني معمّق لـ26 قاعدة أمنية</h2>
          <p>افحص ملفات مشروعك بشكل محلي على خادم Railway، مع CWE وأرقام الأسطر ونتائج قابلة للتصدير إلى GitHub SARIF. لا يحتاج نموذج AI أو GPU.</p>
        </div>
        <span className="cyber-deep-tag">SAST / SARIF</span>
      </div>
      <div className="cyber-deep-controls">
        <label className="cyber-upload" htmlFor="cyber-deep-files">
          اختر حتى 8 ملفات نصية
          <input id="cyber-deep-files" type="file" multiple
            onChange={e=>{const files=e.currentTarget.files;void readSources(files);e.currentTarget.value='';}}/>
        </label>
        <div className="cyber-deep-path"><label htmlFor="cyber-source-name">اسم النص الملصوق بالأسفل</label>
          <input id="cyber-source-name" value={filePath} maxLength={180}
            onChange={e=>setFilePath(e.target.value)} dir="ltr" placeholder="src/app.py"/>
        </div>
        <button type="button" className="cyber-main-btn"
          disabled={!!deepRunning||deepInputCount===0||deepInputCount>8} onClick={()=>void runDeep()}>
          {deepRunning==='scan'?'جارٍ فحص الملفات...':'شغّل Deep Audit'}
        </button>
      </div>
      {uploadedFiles.length>0&&<div className="cyber-file-list" aria-label="الملفات المختارة">
        {uploadedFiles.map(f=><div className="cyber-file" key={f.path}>
          <span dir="ltr">{f.path} · {f.content.length} حرف</span>
          <button type="button" aria-label={'حذف '+f.path} onClick={()=>setUploadedFiles(old=>old.filter(x=>x.path!==f.path))}>×</button>
        </div>)}
      </div>}
      <small>النص الموجود في خانة «الكود / السجل / التقرير» أدناه يُضاف كملف مستقل إذا لم يكن فارغاً. لا ترسل أسراراً حقيقية أو ملفات إنتاج حساسة.</small>
      {deepFeedback&&<p role="status" className="cyber-deep-feedback">{deepFeedback}</p>}
      {deepError&&<p role="alert" className="cyber-error">{deepError}</p>}
      {deepReport&&<div className="cyber-deep-output" aria-live="polite">
        <div className="cyber-deep-metrics">
          <div><strong>{deepReport.summary.findings}</strong><span>مؤشر أمني</span></div>
          <div><strong>{deepReport.summary.files_analyzed}</strong><span>ملفات</span></div>
          <div><strong>{deepReport.summary.risk_priority_score}/100</strong><span>أولوية داخلية وليست CVSS</span></div>
          <div><strong>{deepReport.summary.rules_available}</strong><span>قواعد فحص</span></div>
        </div>
        <div className="cyber-deep-actions">
          <button type="button" onClick={()=>saveReport('star-cyber-deep-audit.json',deepReport)}>تنزيل JSON</button>
          <button type="button" onClick={()=>saveMarkdownReport(deepReport)}>تنزيل تقرير Markdown</button>
          <button type="button" disabled={!!deepRunning} onClick={()=>void exportSarif()}>
            {deepRunning==='export'?'جارٍ التصدير...':'تنزيل SARIF لـGitHub'}
          </button>
          <button type="button" disabled={!!deepRunning||!model} onClick={()=>void explainDeep()}>
            {deepRunning==='explain'?'جارٍ التحليل...':'شرح المؤشرات بواسطة STAR AI'}
          </button>
        </div>
        {deepReport.summary.truncated&&<p className="cyber-error">النتائج وصلت إلى الحد الأقصى 100 مؤشر؛ قلل الملفات أو قسم الفحص.</p>}
        <div className="cyber-findings-controls">
          <label htmlFor="cyber-severity-filter">درجة الخطورة
           <select id="cyber-severity-filter" value={severityFilter} onChange={e=>setSeverityFilter(e.target.value)}>
            <option value="all">الكل</option>
            {severities.map(value=><option key={value} value={value}>{value}</option>)}
           </select>
          </label>
          <label htmlFor="cyber-findings-search">بحث في النتائج
           <input id="cyber-findings-search" value={findingQuery} maxLength={120}
            onChange={e=>setFindingQuery(e.target.value)} placeholder="CWE أو اسم الملف أو القاعدة"/>
          </label>
          <span role="status">عرض {visibleFindings.length} من {deepReport.findings.length} مؤشر</span>
        </div>
        <div className="cyber-deep-findings">
          {visibleFindings.length?visibleFindings.map((f,i)=><article className="cyber-finding" key={f.id+f.path+f.line+i}>
            <div><strong dir="ltr">{f.id} · {f.cwe}</strong><span>{f.severity} · {f.confidence}</span></div>
            <div className="cyber-location" dir="ltr">{f.path}:{f.line} — {f.title}</div>
            <p>{f.recommendation}</p>
          </article>):<p>{deepReport.findings.length?'لا توجد نتائج مطابقة للبحث أو الفلتر.':'لا توجد مؤشرات تطابق القواعد المستخدمة. هذا لا يثبت خلو الملفات من الثغرات.'}</p>}
        </div>
        <small>{deepReport.limitation}</small>
      </div>}
    </section>

    <div className="cyber-grid">
      <form className="cyber-pane" onSubmit={e=>void execute('audit',e)}>
        <h2>01 — البيانات المراد تدقيقها</h2>
        <label htmlFor="cyber-kind">نوع البيانات</label>
        <select id="cyber-kind" value={kind} onChange={e=>setKind(e.target.value as Kind)}>
          {KINDS.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <label htmlFor="cyber-artifact">الكود / السجل / التقرير</label>
        <textarea id="cyber-artifact" dir="auto" rows={13} maxLength={16000}
          value={artifact} onChange={e=>setArtifact(e.target.value)}
          placeholder="الصق ملفاً أو مقتطفاً من مشروع تملكه. احذف المفاتيح وكلمات المرور والبيانات الشخصية أولاً."/>
        <div className="cyber-meta">{artifact.length} / 16000 حرف</div>
        <button className="cyber-main-btn" type="submit" disabled={!!running||artifact.trim().length<3}>
          {running==='audit'?'جارٍ التدقيق...':'فحص الأنماط الأمنية'}
        </button>
        <label htmlFor="cyber-model">النموذج السحابي للمراجعة</label>
        <select id="cyber-model" value={model} onChange={e=>setModel(e.target.value)} disabled={!models.length}>
          {models.length?models.map(x=><option key={x} value={x}>{x}</option>):<option value="">لا يوجد نموذج مهيأ</option>}
        </select>
        <label htmlFor="cyber-question">سؤال أو تعليمات التحليل</label>
        <input id="cyber-question" value={question} maxLength={500} onChange={e=>setQuestion(e.target.value)}
          placeholder="رتّب المخاطر وأعطني توصيات إصلاح" />
        <button type="button" className="cyber-secondary-btn"
          disabled={!!running||!model||artifact.trim().length<3}
          onClick={e=>void execute('review',e as unknown as FormEvent)}>
          {running==='review'?'جارٍ استدعاء النموذج...':'مراجعة معمقة بواسطة AI'}
        </button>
        <p className="cyber-disclaimer">تنبيه: التدقيق النصي لا يثبت وجود ثغرة. قد يُرسل النص إلى مزوّد AI عند استخدام المراجعة المعمقة؛ لا تُرسل أسراراً أو بيانات حساسة.</p>
      </form>
      <div className="cyber-pane cyber-results" aria-live="polite">
        <h2>02 — النتائج والأدلة</h2>
        {error&&<p role="alert" className="cyber-error">{error}</p>}
        {audit?<div className="cyber-audit">
          <div className="cyber-audit-summary">
            <strong>{audit.findings?.length||0} مؤشرات تحتاج مراجعة</strong>
            <span>{audit.lines_analyzed} أسطر محللة</span>
          </div>
          {audit.findings?.length?audit.findings.map((f,i)=><article className="cyber-finding" key={f.id+'-'+f.line+'-'+i}>
            <div><strong dir="ltr">{f.id}</strong><span>{f.severity} · السطر {f.line}</span></div>
            <p>{f.recommendation}</p>
          </article>):<p className="cyber-empty">لم تطابق البيانات قواعد التدقيق المحدودة. هذا لا يعني خلوها من الثغرات.</p>}
          <small>{audit.limitation}</small>
        </div>:<div className="cyber-empty">نتائج التدقيق تظهر هنا بعد إرسال نص فعلي. لا توجد نتائج وهمية.</div>}
        {review?.analysis&&<div className="cyber-review">
          <h3>مراجعة نموذج {review.model}</h3>
          <SafeMarkdown source={review.analysis}/>
          <small>{review.notice}</small>
        </div>}
      </div>
    </div>
  </section>;
}
