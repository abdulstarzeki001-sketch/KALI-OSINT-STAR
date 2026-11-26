import {safePath,shaOK,applyEdit,encodeText,decodeText,sensitive} from './github-workspace.js';
export const EVENT='star-ai-v2-approved-edit';
export const WORKFLOW='star-ai-developer-v2.yml';
export const uuidOK=s=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s);
export const branchFor=id=>'star-ai/edit-'+id;
export const pathURL=p=>p.split('/').map(encodeURIComponent).join('/');
export const safeV2Path=p=>safePath(p)&&!p.split('/').some(s=>s.startsWith('.'))&&!/(?:^|\/)(?:node_modules|dist|vendor)(?:\/|$)/.test(p);
export const validText=s=>typeof s==='string'&&s.trim().length>0&&s.length<=12000&&!s.includes('\0')&&!sensitive(s);
export function parseTargets(items){
 if(!Array.isArray(items)||items.length<1||items.length>4)throw Error('Select 1–4 files');
 const seen=new Set();
 return items.map(x=>{
  if(!x||!safeV2Path(x.path)||!['modify','create'].includes(x.op)||seen.has(x.path))throw Error('Invalid or duplicate file path');
  seen.add(x.path);return {path:x.path,op:x.op};
 });
}
export function validatePlan(files){
 if(!Array.isArray(files)||files.length<1||files.length>4)throw Error('Select 1–4 files');
 const seen=new Set();
 for(const f of files){
  if(!f||!safeV2Path(f.path)||seen.has(f.path))throw Error('Invalid or duplicate path');seen.add(f.path);
  if(f.op==='create'){if(f.blob!==null||f.before!==null||!validText(f.after))throw Error('Invalid creation');}
  else if(f.op==='modify'){if(!shaOK(f.blob)||!validText(f.before)||!validText(f.after)||f.before===f.after)throw Error('Invalid modification');}
  else if(f.op==='delete'){if(!shaOK(f.blob)||!validText(f.before)||f.after!==null)throw Error('Invalid rollback deletion');}
  else throw Error('Invalid operation');
 }
 return files;
}
export function payloadFor(id,base,files){
 if(!uuidOK(id)||!shaOK(base))throw Error('Invalid plan identity');
 validatePlan(files);
 const payload={id,base,files:files.map(f=>({path:f.path,op:f.op,blob:f.blob,content:f.after===null?null:encodeText(f.after)}))};
 if(JSON.stringify(payload).length>60000)throw Error('Plan exceeds Actions payload budget');
 return payload;
}
export function validatePayload(p){
 if(!p||!uuidOK(p.id)||!shaOK(p.base)||!Array.isArray(p.files)||p.files.length<1||p.files.length>4||JSON.stringify(p).length>60000)throw Error('Invalid dispatch');
 const seen=new Set();
 for(const f of p.files){
  if(!f||!safeV2Path(f.path)||seen.has(f.path)||!['modify','create','delete'].includes(f.op))throw Error('Invalid dispatch file');seen.add(f.path);
  if(f.op==='create'?f.blob!==null:!shaOK(f.blob))throw Error('Invalid expected blob');
  if(f.op==='delete'){if(f.content!==null)throw Error('Invalid deletion');continue;}
  if(typeof f.content!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(f.content))throw Error('Invalid base64');
  const t=decodeText(f.content);if(!validText(t)||encodeText(t)!==f.content)throw Error('Invalid content');
 }
 return p;
}
export function modelEdit(op,before,reply,allowAppend=false){
 if(typeof reply!=='string')throw Error('No model reply');
 if(op==='modify'){
  const raw=reply.trim().replace(/^\x60{3}(?:json)?\s*/i,'').replace(/\s*\x60{3}$/,'');const p=JSON.parse(raw);
  if(allowAppend&&p&&Object.keys(p).length===1&&typeof p.append==='string'&&p.append.trim()&&p.append.length<=3500&&validText(before)){
   const after=before+'\n\n'+p.append.trim()+'\n';if(!validText(after))throw Error('Invalid appended content');return after;
  }
  const after=applyEdit(before,reply);if(!validText(after))throw Error('Invalid model edit');return after;
 }
 const raw=reply.trim().replace(/^\x60{3}(?:json)?\s*/i,'').replace(/\s*\x60{3}$/,'');
 const p=JSON.parse(raw);if(!validText(p?.content))throw Error('Invalid new file');return p.content;
}
export function reversePlan(files,current){
 validatePlan(files);
 return validatePlan(files.map(f=>{
  const c=current[f.path];
  if(f.after===null){if(c!==null)throw Error('Rollback conflict: '+f.path);return {path:f.path,op:'create',blob:null,before:null,after:f.before};}
  if(!c||c.text!==f.after||!shaOK(c.sha))throw Error('Rollback conflict: '+f.path);
  return f.before===null?{path:f.path,op:'delete',blob:c.sha,before:c.text,after:null}:{path:f.path,op:'modify',blob:c.sha,before:c.text,after:f.before};
 }));
}
export function verifyFileList(files,list){
 if(!Array.isArray(list)||list.length!==files.length)return false;
 const status={create:'added',modify:'modified',delete:'removed'};
 return files.every(f=>list.filter(x=>x.filename===f.path&&x.status===status[f.op]).length===1);
}

export function fileCatalog(entries){
 return [...entries.values()].filter(x=>x.type==='blob'&&x.mode==='100644'&&shaOK(x.sha)&&safeV2Path(x.path)&&typeof x.size==='number'&&x.size>0&&x.size<=48000).map(x=>({path:x.path,size:x.size})).sort((a,b)=>a.path.localeCompare(b.path)).slice(0,500);
}
export function smokeFiles(old,id){
 if(!old||!shaOK(old.sha)||!validText(old.text)||!uuidOK(id))throw Error('Invalid smoke fixture');
 return validatePlan([
  {path:'docs/STAR_AUTONOMOUS_DEVELOPER_V2.md',op:'modify',blob:old.sha,before:old.text,after:old.text+'\n\n## Owner-session verification (test only)\n'},
  {path:'docs/v2-owner-check/'+id+'.md',op:'create',blob:null,before:null,after:'# STAR V2 owner-session verification\n\nDocumentation-only isolated integration test. Do not merge.\n'}
 ]);
}
