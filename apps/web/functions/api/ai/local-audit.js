// Offline, deterministic text checks for the Cloudflare fallback path.
// No network request and no source line or matched secret is returned.
const RULES=[
 {id:'PRIVATE_KEY',severity:'critical',pattern:/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,recommendation:'Remove and rotate private keys exposed in source.'},
 {id:'HARDCODED_SECRET',severity:'high',pattern:/\b(?:password|api[_-]?key|client_secret|access_token)\s*[:=]\s*['"][^'"\n]{8,}['"]/i,recommendation:'Move credentials to a secrets manager and rotate exposed values.'},
 {id:'UNSAFE_EVAL',severity:'high',pattern:/(?:^|[^\w])eval\s*\(/i,recommendation:'Avoid evaluating untrusted dynamic input.'},
 {id:'SHELL_TRUE',severity:'high',pattern:/\bshell\s*=\s*True\b/i,recommendation:'Avoid shell=True with user-controlled input.'},
 {id:'TLS_VERIFICATION_OFF',severity:'high',pattern:/\bverify\s*=\s*False\b|\brejectUnauthorized\s*:\s*false\b/i,recommendation:'Enable certificate verification and use trusted certificates.'},
 {id:'CORS_WILDCARD',severity:'medium',pattern:/Access-Control-Allow-Origin\s*:\s*\*/i,recommendation:'Review origins for sensitive endpoints.'},
 {id:'DEBUG_MODE',severity:'medium',pattern:/\bDEBUG\s*=\s*True\b|\bdebug\s*:\s*true\b/i,recommendation:'Disable debug mode in production.'}
];
export function auditLocally(artifact,kind){
 if(typeof artifact!=='string'||artifact.length<3||artifact.length>16000||
   !['code','config','headers','logs','report'].includes(kind))return null;
 const lines=artifact.split(/\r?\n/),findings=[],counts={critical:0,high:0,medium:0,low:0};
 for(let i=0;i<lines.length;i++)for(const rule of RULES){
   if(rule.pattern.test(lines[i])&&findings.length<60){
     findings.push({id:rule.id,severity:rule.severity,line:i+1,
       evidence:'Pattern detected, source withheld.',recommendation:rule.recommendation});
     counts[rule.severity]++;
   }
 }
 return {kind,lines_analyzed:lines.length,findings,counts,
   limitation:'Local heuristic audit; no scanning, execution or live target verification.'};
}
export function hideCommonSecrets(text){
 return text.replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi,'[PRIVATE KEY REDACTED]')
   .replace(/(\b(?:password|api[_-]?key|client_secret|access_token|authorization|token)\s*[:=]\s*['"]?)([^\s'",;]{8,})/gi,'$1[REDACTED]');
}
