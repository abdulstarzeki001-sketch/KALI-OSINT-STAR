// Deterministic diagnosis of local build logs. Never returns raw matched text.
export const MAX_DEBUG_LOG=96000;
type Rule={id:string;family:string;priority:'error'|'notice';pattern:RegExp;advice:string;reference:string};
const RULES:Rule[]=[
 {id:'PY_IMPORT',family:'Python',priority:'error',pattern:/\b(?:ModuleNotFoundError|ImportError):/,advice:'تحقق من بيئة Python النشطة وتوافق التبعيات والاستيراد مع إصدار المكتبة.',reference:'https://docs.python.org/3/library/exceptions.html#ImportError'},
 {id:'PY_SYNTAX',family:'Python',priority:'error',pattern:/\b(?:SyntaxError|IndentationError|TabError):/,advice:'راجع الملف والسطر المشار إليهما في traceback وتحقق من المسافات وبنية الشيفرة.',reference:'https://docs.python.org/3/tutorial/errors.html'},
 {id:'PY_PYDANTIC',family:'Python',priority:'error',pattern:/PydanticImportError|BaseSettings.*(?:has moved|pydantic-settings)/i,advice:'راجع دليل ترحيل Pydantic v2 وتبعيات pydantic-settings.',reference:'https://docs.pydantic.dev/latest/migration/'},
 {id:'PY_TEST',family:'Python',priority:'error',pattern:/^\s*FAILED\s+.*::|\b(?:AssertionError|FAILED \(failures=)/,advice:'راجع الاختبار الفاشل وقارن النتيجة المتوقعة بالفعلية قبل تعديل التنفيذ.',reference:'https://docs.pytest.org/en/stable/how-to/assert.html'},
 {id:'TS_COMPILE',family:'TypeScript',priority:'error',pattern:/\berror\s+TS\d{4,5}\b/i,advice:'افتح تشخيص TypeScript في الملف المشار إليه وراجع الأنواع وtsconfig؛ لا تعطل فحص الأنواع لإخفاء الخطأ.',reference:'https://www.typescriptlang.org/docs/'},
 {id:'NPM_RESOLVE',family:'Node.js',priority:'error',pattern:/\bERESOLVE\b|unable to resolve dependency tree/i,advice:'راجع peerDependencies وتوافق الإصدارات وملف القفل، ولا تتجاوز التعارض بالقوة.',reference:'https://docs.npmjs.com/cli/v11/configuring-npm/package-json#peerdependencies'},
 {id:'NODE_MODULE',family:'Node.js',priority:'error',pattern:/\b(?:ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND)\b|Cannot find (?:module|package)\b/,advice:'راجع مسارات الاستيراد والتبعيات المثبتة ونسخة Node ونظام ESM/CommonJS.',reference:'https://nodejs.org/api/errors.html'},
 {id:'BUILD_VITE',family:'Vite',priority:'error',pattern:/\[vite\].*(?:error|failed)|vite.*build failed|RollupError:/i,advice:'راجع أول خطأ في سجل Vite ومسارات الاستيراد وإعدادات البناء.',reference:'https://vite.dev/guide/troubleshooting'},
 {id:'RESOURCE_LIMIT',family:'Build',priority:'error',pattern:/JavaScript heap out of memory|\bENOSPC\b|OutOfMemoryError|exit(?:ed)? (?:with )?code 137\b/i,advice:'تحقق من الذاكرة ومساحة القرص وحدود الحاوية؛ الرمز 137 وحده لا يثبت نفاد الذاكرة.',reference:'https://nodejs.org/api/cli.html'},
 {id:'PERMISSION',family:'Environment',priority:'error',pattern:/\b(?:EACCES|EPERM|PermissionError)\b|permission denied/i,advice:'راجع ملكية الملف وهوية المستخدم وصلاحيات المسار. لا تستخدم صلاحيات root كحل افتراضي.',reference:'https://docs.python.org/3/library/exceptions.html#PermissionError'},
 {id:'NETWORK',family:'Environment',priority:'error',pattern:/\b(?:ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN)\b/,advice:'تحقق من توافر الخدمة وDNS والشبكة في بيئتك قبل إعادة المحاولة.',reference:'https://nodejs.org/api/errors.html'},
 {id:'DEPRECATION',family:'Compatibility',priority:'notice',pattern:/DeprecationWarning|deprecated\b/i,advice:'راجع التوثيق لتحديد مسار الترحيل. التحذير وحده لا يثبت فشل البناء أو وجود ثغرة.',reference:'https://docs.python.org/3/library/warnings.html'}
];
export function diagnoseLog(input:string){
 if(typeof input!=='string'||!input.trim()||new TextEncoder().encode(input).length>MAX_DEBUG_LOG||input.includes('\u0000'))throw Error('Invalid or oversized log');
 const lines=input.replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g,'').split(/\r?\n/);
 if(lines.length>3000)throw Error('Too many lines');
 const findings=RULES.flatMap(rule=>{
  const matches:number[]=[];
  for(let i=0;i<lines.length;i++)if(rule.pattern.test(lines[i]))matches.push(i+1);
  return matches.length?[{id:rule.id,family:rule.family,priority:rule.priority,count:matches.length,lines:matches.slice(0,12),advice:rule.advice,reference:rule.reference}]:[];
 });
 return {schema:1,source:'local-log-heuristics',linesAnalyzed:lines.length,findings,testsExecuted:false,limitations:'Pattern matches only; no root-cause confirmation, source execution, vulnerability scan or remote verification.'};
}
