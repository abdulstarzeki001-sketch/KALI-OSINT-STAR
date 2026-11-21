export const CONTROL_SECTIONS=['health','analysis','quality','workspace','tests','dependencies','memory','debugger','tools'] as const;
export type ControlSection=typeof CONTROL_SECTIONS[number];
export type ConnectionResult={state:'idle'|'running'|'responded'|'failed';elapsedMs?:number;model?:string;detail?:string};
export const CONTROL_LABELS:Record<ControlSection,string>={health:'حالة الخدمات',analysis:'تحليل التقارير',quality:'جودة النماذج',workspace:'مساحة العمل',tests:'الاختبارات',dependencies:'التبعيات',memory:'ذاكرة المشاريع',debugger:'تشخيص الأخطاء',tools:'فحص الأدوات'};
export function isControlSection(v:unknown):v is ControlSection{return typeof v==='string'&&(CONTROL_SECTIONS as readonly string[]).includes(v)}
export function parseConnection(value:unknown,requested:string,elapsedMs:number):ConnectionResult{
 if(value===null||typeof value!=='object'||Array.isArray(value)||!Number.isFinite(elapsedMs)||elapsedMs<0)throw Error('Invalid response');
 const v=value as Record<string,unknown>;
 const expected=requested==='qwen3-coder-vast'?'qwen3-coder-vast':requested==='llama-cloudflare'?'@cf/meta/llama-3.3-70b-instruct-fp8-fast':null;
 if(!expected||v.model!==expected||v.status!=='completed'||typeof v.analysis!=='string'||v.analysis.trim().length<30)throw Error('Unconfirmed model response');
 return {state:'responded',elapsedMs:Math.round(elapsedMs),model:expected};
}
