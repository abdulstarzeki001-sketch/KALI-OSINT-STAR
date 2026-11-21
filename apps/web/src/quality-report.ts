export const QUALITY_FIXTURE = 'SYNTHETIC Python review exercise only. A draft FastAPI service imports BaseSettings from pydantic, uses synchronous create_engine while claiming async, and uses python-jose jwt.decode options={"require":["exp"]}. No real credentials or production data. No tests have been run.';
export const QUALITY_QUESTION = 'Identify the three compatibility and validation issues; propose defensive corrections and explicit tests. Do not claim that tests ran.';
export const QUALITY_MODELS = ['qwen3-coder-vast','llama-cloudflare'] as const;
export type QualityModel = typeof QUALITY_MODELS[number];
type Obj = Record<string,unknown>;
function object(x:unknown): x is Obj {return typeof x==='object'&&x!==null&&!Array.isArray(x);}
function nonnegative(x:unknown):x is number{return typeof x==='number'&&Number.isFinite(x)&&x>=0;}
export function parseReview(x:unknown, requested:QualityModel){
 const expected=requested==='qwen3-coder-vast'?requested:'@cf/meta/llama-3.3-70b-instruct-fp8-fast';
 if(!object(x)||x.status!=='completed'||x.model!==expected||typeof x.analysis!=='string'||x.analysis.trim().length<30||x.analysis.length>32000)throw new Error('استجابة غير مكتملة أو هوية النموذج غير مطابقة');
 return {model:expected,analysis:x.analysis};
}
export function parseQualityReport(raw:string){
 if(raw.length>256000)throw new Error('حجم التقرير أكبر من الحد');
 const x:unknown=JSON.parse(raw);
 if(!object(x)||typeof x.model!=='string'||x.model.length>160||!nonnegative(x.elapsed_seconds)||!(x.tokens_per_second===null||nonnegative(x.tokens_per_second))||x.executed_generated_code!==false||!Array.isArray(x.static_findings)||x.static_findings.length>1000)throw new Error('صيغة تقرير القياس غير صالحة');
 const findings=x.static_findings.map((f:unknown)=>{
  if(!object(f)||typeof f.rule!=='string'||!(/^[A-Z0-9_]{1,100}$/).test(f.rule)||!nonnegative(f.line)||!Number.isInteger(f.line)||f.line<1)throw new Error('نتيجة فحص غير صالحة');
  return {rule:f.rule,line:f.line};
 });
 return {model:x.model,elapsed_seconds:x.elapsed_seconds,tokens_per_second:x.tokens_per_second,findings};
}
