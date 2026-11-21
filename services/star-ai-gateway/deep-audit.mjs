import {createHash} from 'node:crypto';

// Indicators, not exploit proof: the engine never executes source or contacts targets.
const ALL='all';
const RULES=[
 ['STAR-001','Hardcoded credential','critical','CWE-798',ALL,/\b(?:password|api[_-]?key|client_secret|access_token|secret[_-]?key)\s*[:=]\s*['"][^'"\n]{8,}['"]/i,'Move credentials to a secret manager and rotate any exposed value.'],
 ['STAR-002','Private key in source','critical','CWE-321',ALL,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,'Remove and rotate the private key.'],
 ['STAR-003','Dynamic code evaluation','high','CWE-95','js,ts,py',/(?:^|[^\w.])eval\s*\(|\bnew\s+Function\s*\(/,'Parse data without evaluating executable input.'],
 ['STAR-004','Python shell execution','high','CWE-78','py',/\b(?:subprocess\.\w+|Popen)\s*\(.*\bshell\s*=\s*True\b/,'Use a fixed argv list instead of shell=True.'],
 ['STAR-005','Node shell command execution','high','CWE-78','js,ts',/\b(?:child_process\.)?(?:exec|execSync)\s*\(/,'Prefer execFile or spawn with fixed argv; validate any dynamic arguments.'],
 ['STAR-006','TLS verification disabled','high','CWE-295',ALL,/\bverify\s*=\s*False\b|rejectUnauthorized\s*:\s*false\b|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0\b/i,'Enable certificate and hostname verification.'],
 ['STAR-007','Unrestricted CORS origin','medium','CWE-942',ALL,/Access-Control-Allow-Origin\s*:\s*\*|cors\(\s*\)/i,'Allow only expected browser origins; review credentials.'],
 ['STAR-008','Debug mode enabled','medium','CWE-489',ALL,/\bDEBUG\s*=\s*True\b|\bdebug\s*:\s*true\b/i,'Disable debug diagnostics in production.'],
 ['STAR-009','Untrusted HTML assignment candidate','medium','CWE-79','js,ts',/\.innerHTML\s*=\s*(?!['"]\s*['"]|DOMPurify\.sanitize)/,'Use textContent or sanitize untrusted HTML.'],
 ['STAR-010','React HTML injection candidate','medium','CWE-79','js,ts',/\bdangerouslySetInnerHTML\s*=/,'Verify HTML originates from a trusted sanitized source.'],
 ['STAR-011','JWT decoded without verification candidate','high','CWE-347','js,ts,py',/\b(?:jwt|jsonwebtoken)\.decode\s*\(|ignoreExpiration\s*:\s*true\b/i,'Verify signature, issuer, audience and expiry.'],
 ['STAR-012','Weak hash algorithm','medium','CWE-327','js,ts,py',/createHash\s*\(\s*['"](?:md5|sha1)['"]|hashlib\.(?:md5|sha1)\s*\(/i,'Use a modern collision-resistant hash where required.'],
 ['STAR-013','World-writable file permission','high','CWE-732',ALL,/\bchmod\s+(?:-R\s+)?777\b|os\.chmod\s*\([^,]+,\s*0o?777\b/i,'Apply least-privilege filesystem permissions.'],
 ['STAR-014','Privileged container','critical','CWE-250','docker,yaml',/\bprivileged\s*:\s*true\b/i,'Remove privileged mode and use minimal capabilities.'],
 ['STAR-015','Container runs as root','medium','CWE-250','docker',/^\s*USER\s+root\b/i,'Run the final container stage as an unprivileged user.'],
 ['STAR-016','Host networking in container','high','CWE-250','yaml',/\bnetwork_mode\s*:\s*['"]?host\b/i,'Use a private bridge or overlay network.'],
 ['STAR-017','Untrusted PR workflow trigger','medium','CWE-829','yaml',/\bpull_request_target\s*:/i,'Audit checkout and permissions when running untrusted PR content.'],
 ['STAR-018','Untrusted GitHub event interpolation','high','CWE-78','yaml',/\$\{\{\s*github\.event\.(?:issue|pull_request|comment)[^}]*\}\}/i,'Pass untrusted event properties through bounded environment variables, not shell source.'],
 ['STAR-019','Remote script piped into shell','high','CWE-829',ALL,/\b(?:curl|wget)\b[^\n|;]{0,200}\|\s*(?:ba)?sh\b/i,'Pin and verify a reviewed artifact before execution.'],
 ['STAR-020','Unsafe pickle deserialization','high','CWE-502','py',/\bpickle\.(?:loads?|Unpickler)\s*\(/,'Avoid unpickling untrusted input; prefer a non-executable format.'],
 ['STAR-021','Unvalidated URL from request candidate','medium','CWE-918','js,ts,py',/\b(?:fetch|requests\.(?:get|post)|httpx\.(?:get|post))\s*\(\s*(?:req\.|request\.|params\.|query\.)/i,'Enforce a host allowlist and block private IPs and unsafe redirects.'],
 ['STAR-022','Authentication disabled','high','CWE-306','yaml,config,docker',/\b(?:auth_enabled|authentication_enabled|enable_auth)\s*:\s*false\b/i,'Require authentication for management endpoints.'],
 ['STAR-023','Publicly exposed database port candidate','medium','CWE-668','yaml,docker',/0\.0\.0\.0:(?:2375|5432|6379|9200|27017)[:/]/,'Move databases and Docker API to private networking.'],
 ['STAR-024','Insecure session cookie','medium','CWE-614','js,ts,py',/\bsecure\s*:\s*false\b|\bSESSION_COOKIE_SECURE\s*=\s*False\b/i,'Use Secure, HttpOnly, SameSite session cookies.'],
 ['STAR-025','Unsafe YAML deserialization candidate','high','CWE-502','py',/\byaml\.load\s*\(/,'Prefer yaml.safe_load for untrusted configuration.'],
 ['STAR-026','Static SQL string construction candidate','medium','CWE-89','js,ts,py',/\b(?:SELECT|INSERT|UPDATE|DELETE)\b.+(?:\+\s*\w+|\{[A-Za-z_]\w*\})/i,'Use prepared statements and parameter binding.']
];
const EXT={js:'js',mjs:'js',jsx:'js',ts:'ts',tsx:'ts',py:'py',yaml:'yaml',yml:'yaml',conf:'config',json:'config',sh:'config',txt:'config',log:'config'};
const SORT={critical:0,high:1,medium:2,low:3};
function classify(path){
 if(/(^|\/)Dockerfile(?:\.[^/]+)?$/i.test(path))return 'docker';
 return EXT[path.split('.').pop().toLowerCase()]||'config';
}
export function validateFiles(files){
 if(!Array.isArray(files)||files.length<1||files.length>8)throw Error('invalid_files');
 let length=0;const names=new Set();
 return files.map(f=>{
  if(!f||typeof f.path!=='string'||f.path.length>180||
     !/^[\p{L}\p{N}._/ -]+$/u.test(f.path)||f.path.startsWith('/')||f.path.includes('//')||
     f.path.split('/').some(p=>!p||p==='..'||p==='.'||p.startsWith('.env')||
       /(?:^|[-_.])(secret|credential|token)(?:$|[-_.])/i.test(p))||
     names.has(f.path)||typeof f.content!=='string'||f.content.trim().length<3||f.content.length>16000)
    throw Error('invalid_file');
  names.add(f.path);length+=f.content.length;
  if(length>48000)throw Error('file_limit');
  return {path:f.path,content:f.content};
 });
}
export function deepAudit(files){
 const docs=validateFiles(files),findings=[];let lines=0,truncated=false;
 for(const f of docs){
  const lang=classify(f.path);
  const rows=f.content.split(/\r?\n/);lines+=rows.length;
  for(let index=0;index<rows.length;index++){
   if(/^(?:\/\/|#|\/\*|\*)\s/.test(rows[index].trim()))continue;
   for(const [id,title,severity,cwe,langs,pattern,recommendation] of RULES){
    if(langs!==ALL&&!langs.split(',').includes(lang))continue;
    if(!pattern.test(rows[index]))continue;
    if(findings.length===100){truncated=true;continue;}
    findings.push({id,title,severity,cwe,confidence:severity==='critical'?'high':'medium',
      path:f.path,line:index+1,recommendation,
      evidence:'Pattern detected. Source lines withheld to protect sensitive information.'});
   }
  }
 }
 findings.sort((a,b)=>SORT[a.severity]-SORT[b.severity]||a.path.localeCompare(b.path)||a.line-b.line||a.id.localeCompare(b.id));
 const counts={critical:0,high:0,medium:0,low:0};
 for(const finding of findings)counts[finding.severity]++;
 return {schema:1,engine:'STAR Cyber Deep Audit',version:'1.0.0',
   summary:{files_analyzed:docs.length,lines_analyzed:lines,rules_available:RULES.length,
     findings:findings.length,counts,risk_priority_score:Math.min(100,counts.critical*25+counts.high*12+counts.medium*5+counts.low),truncated},
   findings,limitation:'Heuristic static text review only. No execution, scanning, dependency resolution, or proof of vulnerability. Manual review required.'};
}
export function toSarif(report){
 if(report?.schema!==1||!Array.isArray(report.findings))throw Error('invalid_report');
 const used=new Set(report.findings.map(f=>f.id));
 return {version:'2.1.0',$schema:'https://json.schemastore.org/sarif-2.1.0.json',
  runs:[{tool:{driver:{name:'STAR Cyber Deep Audit',semanticVersion:'1.0.0',
    informationUri:'https://github.com/abdulstarzeki001-sketch/KALI-OSINT-STAR',
    rules:RULES.filter(r=>used.has(r[0])).map(r=>({id:r[0],name:r[1],
      shortDescription:{text:r[1]},fullDescription:{text:r[7]},properties:{tags:['security',r[3]]}}))}},
    originalUriBaseIds:{'%SRCROOT%':{uri:'file:///workspace/'}},
    results:report.findings.map(f=>({ruleId:f.id,
      level:f.severity==='critical'||f.severity==='high'?'error':'warning',
      message:{text:f.title+'. '+f.recommendation},
      locations:[{physicalLocation:{artifactLocation:{uri:f.path,uriBaseId:'%SRCROOT%'},region:{startLine:f.line}}}],
      partialFingerprints:{primaryLocationLineHash:createHash('sha256').update(f.path+'|'+f.id+'|'+f.line).digest('hex').slice(0,24)}})),
    properties:{note:report.limitation}}]};
}
export const deepAuditLimits={files:8,totalCharacters:48000,findings:100,ruleCount:RULES.length};
