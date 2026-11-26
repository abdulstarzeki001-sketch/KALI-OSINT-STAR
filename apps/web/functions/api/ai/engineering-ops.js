import {verifyAccessRequest,accessFailureStatus} from '../../../access-jwt.js';
import {ownerKey} from '../../../durable-memory.js';
import {REPO,sensitive} from '../../../github-workspace.js';
const HOST='https://kali-osint-star.pages.dev';
const json=(v,s=200)=>Response.json(v,{status:s,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const categories=['decision','failure','fix','note'];
const repoOK=s=>typeof s==='string'&&/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(s)&&!s.endsWith('/.')&&!s.endsWith('/..');
const noteOK=s=>typeof s==='string'&&s.trim().length>0&&s.length<=1500&&!s.includes('\0')&&!sensitive(s);
export async function publicProject(repo,fetcher=(url,init)=>fetch(url,init)){
 if(!repoOK(repo))throw Error('Invalid repository');
 const r=await fetcher('https://api.github.com/repos/'+repo,{method:'GET',redirect:'manual',headers:{accept:'application/vnd.github+json','user-agent':'STAR-V3-Registry'}});
 if(!r.ok)throw Error('Public GitHub repository unavailable (HTTP '+r.status+')');
 const v=await r.json();
 if(v.private!==false||!repoOK(v.full_name)||v.full_name.toLowerCase()!==repo.toLowerCase()||typeof v.default_branch!=='string')throw Error('Repository identity mismatch');
 return {repo:v.full_name,description:typeof v.description==='string'?v.description.slice(0,300):'',branch:v.default_branch.slice(0,100),checked:Date.now()};
}
export async function handleOps({request,env},verify=verifyAccessRequest,fetcher=(url,init)=>fetch(url,init)){
 const u=new URL(request.url),origin=request.headers.get('origin');
 if(u.origin!==HOST||(origin&&origin!==HOST)||request.method==='POST'&&origin!==HOST)return json({error:'Forbidden origin'},403);
 if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed'},405);
 const auth=await verify(request,env);if(!auth.ok)return json({error:'Access required'},accessFailureStatus(auth.reason));
 const db=env.STAR_MEMORY;if(!db)return json({error:'Storage unavailable'},503);
 const owner=await ownerKey(auth.identity);
 try{
  if(request.method==='GET'){
   const [notes,probes,projects,observations,heartbeat]=await Promise.all([
    db.prepare('SELECT id,category,note,created FROM star_v3_notes WHERE owner=? ORDER BY created DESC LIMIT 100').bind(owner).all(),
    db.prepare('SELECT provider,ok,ready,ms,http_status,created FROM star_v3_model_probes WHERE owner=? ORDER BY created DESC LIMIT 50').bind(owner).all(),
    db.prepare('SELECT repo,description,branch,checked FROM star_v3_projects WHERE owner=? ORDER BY checked DESC LIMIT 10').bind(owner).all(),
    db.prepare("SELECT o.job_id,o.checked,o.executor_id,o.executor_status,o.executor_conclusion,o.pr,o.head,o.observation,j.state FROM star_v3_observation o JOIN star_developer_v2 j ON j.owner=o.owner AND j.id=o.job_id WHERE o.owner=? ORDER BY o.checked DESC LIMIT 20").bind(owner).all(),
    db.prepare('SELECT checked,status FROM star_v3_monitor_heartbeat WHERE id=1').first()
   ]);
   return json({notes:notes.results||[],probes:probes.results||[],projects:projects.results||[],observations:observations.results||[],heartbeat,writeRepo:REPO});
  }
  if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'JSON required'},415);
  const reader=request.body?.getReader();if(!reader)return json({error:'Missing body'},400);
  const parts=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8000){await reader.cancel();return json({error:'Body too large'},413);}parts.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}let d;try{d=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'Invalid JSON'},400);}
  if(d?.action==='note'){
   if(!categories.includes(d.category)||!noteOK(d.note))return json({error:'Invalid note or possible credential'},422);
   const id=crypto.randomUUID(),created=Date.now();const saved=await db.prepare('INSERT INTO star_v3_notes(owner,id,category,note,created) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM star_v3_notes WHERE owner=?)<100').bind(owner,id,d.category,d.note.trim(),created,owner).run();
   if(!saved.meta?.changes)return json({error:'Note limit reached'},409);return json({id,created},201);
  }
  if(d?.action==='delete_note'){
   if(typeof d.id!=='string'||!/^[a-f0-9-]{36}$/.test(d.id)||d.confirm!==true)return json({error:'Explicit note deletion required'},422);
   const result=await db.prepare('DELETE FROM star_v3_notes WHERE owner=? AND id=?').bind(owner,d.id).run();
   return result.meta?.changes?json({deleted:true}):json({error:'Note not found'},404);
  }
  if(d?.action==='remove_project'){
   if(!repoOK(d.repo)||d.confirm!==true)return json({error:'Explicit registry removal required'},422);
   const result=await db.prepare('DELETE FROM star_v3_projects WHERE owner=? AND repo=?').bind(owner,d.repo).run();
   return result.meta?.changes?json({removed:true}):json({error:'Registry entry not found'},404);
  }
  if(d?.action==='project'){
   if(!repoOK(d.repo))return json({error:'Use owner/repository'},422);
   let project;try{project=await publicProject(d.repo,fetcher);}catch{return json({error:'Public repository could not be verified'},503);}
   const saved=await db.prepare('INSERT INTO star_v3_projects(owner,repo,description,branch,checked) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM star_v3_projects WHERE owner=?)<10 OR EXISTS(SELECT 1 FROM star_v3_projects WHERE owner=? AND repo=?) ON CONFLICT(owner,repo) DO UPDATE SET description=excluded.description,branch=excluded.branch,checked=excluded.checked').bind(owner,project.repo,project.description,project.branch,project.checked,owner,owner,project.repo).run();
   if(!saved.meta?.changes)return json({error:'Project limit reached'},409);return json({...project,writeAllowed:project.repo===REPO},201);
  }
  return json({error:'Invalid action'},422);
 }catch{return json({error:'Operations storage unavailable'},503);}
}
export const onRequest=handleOps;
