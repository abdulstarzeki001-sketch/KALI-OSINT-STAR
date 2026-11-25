export const REPO='abdulstarzeki001-sketch/KALI-OSINT-STAR';
export const safePath=p=>typeof p==='string'&&p.length<=180&&p.split('/').every(s=>/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(s)&&!/(secret|credential|token|password|private.key|\.env)/i.test(s))&&(/^(apps\/web\/src\/|apps\/web\/tests\/|docs\/)/.test(p)||p==='README.md')&&/\.(tsx?|jsx?|mjs|css|md|txt|json|py|html)$/.test(p);
export const shaOK=s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s);
export const idOK=s=>typeof s==='string'&&/^[a-f0-9-]{36}$/.test(s);
export function applyEdit(before,reply){
 const raw=reply.trim().replace(/^\x60{3}(?:json)?\s*/i,'').replace(/\s*\x60{3}$/,'');
 const p=JSON.parse(raw);
 if(!p||typeof p.old!=='string'||typeof p.new!=='string'||!p.old||p.old===p.new||p.old.length>3500||p.new.length>5500)throw Error('Invalid edit');
 const at=before.indexOf(p.old);
 if(at<0||before.indexOf(p.old,at+1)>=0)throw Error('Edit must match exactly once');
 const after=before.slice(0,at)+p.new+before.slice(at+p.old.length);
 if(!after.trim()||after.length>20000)throw Error('Invalid file result');
 return after;
}
export function encodeText(s){const bytes=new TextEncoder().encode(s);let raw='';for(const b of bytes)raw+=String.fromCharCode(b);return btoa(raw);}
export function decodeText(s){return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(s.replace(/\s/g,'')),x=>x.charCodeAt(0)));}
export function sensitive(s){return /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|(?:gh[pousr]_|github_pat_|sk-(?:proj-)?)[A-Za-z0-9_-]{20,}|Authorization\s*:\s*Bearer\s+[A-Za-z0-9._~-]{24,}/i.test(s);}
export async function github(env,path,method='GET',body,fetcher=globalThis.fetch){
 if(method!=='GET'&&!env.STAR_GITHUB_TOKEN)throw Error('GitHub write token not configured');
 const response=await fetcher('https://api.github.com/repos/'+REPO+path,{method,redirect:'error',headers:{accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','user-agent':'STAR-AI-Workspace',...(env.STAR_GITHUB_TOKEN?{authorization:'Bearer '+env.STAR_GITHUB_TOKEN}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(!response.ok)throw Error('GitHub HTTP '+response.status);
 return response.json();
}
export async function verifyChecks(env,head){
 if(!shaOK(head))return false;
 for(const file of ['ci.yml','star-ai-quality.yml']){
  const data=await github(env,'/actions/workflows/'+file+'/runs?event=pull_request&head_sha='+head+'&per_page=10');
  const run=(data.workflow_runs||[]).find(x=>x.head_sha===head&&x.event==='pull_request');
  if(!run||run.status!=='completed'||run.conclusion!=='success')return false;
 }
 return true;
}
