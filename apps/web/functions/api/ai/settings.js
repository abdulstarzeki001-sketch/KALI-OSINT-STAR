import {verifyAccessRequest,accessFailureStatus} from '../../../access-jwt.js';
import {ownerKey} from '../../../durable-memory.js';
import {readProfile,splitKnowledge} from '../../../ai-settings.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(x);
async function readJSON(request){
 const reader=request.body?.getReader();if(!reader)throw Error('body required');
 const parts=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144){await reader.cancel();throw Error('body too large');}parts.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.byteLength;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
export async function handleSettings({request,env},verify=verifyAccessRequest){
 const u=new URL(request.url),origin=request.headers.get('origin');
 if(u.origin!=='https://kali-osint-star.pages.dev'||(origin&&origin!==u.origin))return json({error:'Forbidden origin'},403);
 if(!['GET','PUT','POST','DELETE'].includes(request.method))return json({error:'Method not allowed'},405);
 if(request.method!=='GET'&&origin!==u.origin)return json({error:'Same origin required'},403);
 const auth=await verify(request,env);if(!auth.ok)return json({error:'Access required'},accessFailureStatus(auth.reason));
 const db=env.STAR_MEMORY;if(!db)return json({error:'Storage unavailable'},503);
 try{
  const owner=await ownerKey(auth.identity);
  if(request.method==='GET'){
   const id=u.searchParams.get('id');
   if(id!==null){
    if(!validId(id))return json({error:'Invalid document id'},422);
    const doc=await db.prepare('SELECT id,name,chars,created FROM star_knowledge_docs WHERE owner=? AND id=?').bind(owner,id).first();
    if(!doc)return json({error:'Document not found'},404);
    const parts=await db.prepare('SELECT body FROM star_knowledge_chunks WHERE owner=? AND doc=? ORDER BY part').bind(owner,id).all();
    return json({doc,text:(parts.results||[]).map(p=>p.body).join('')});
   }
   const profile=await readProfile(db,owner);
   const result=await db.prepare('SELECT id,name,chars,created FROM star_knowledge_docs WHERE owner=? ORDER BY created DESC LIMIT 50').bind(owner).all();
   return json({profile,docs:result.results||[]});
  }
  if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'JSON required'},415);
  let data;try{data=await readJSON(request);}catch{return json({error:'Invalid or oversized JSON'},400);}
  if(!data||typeof data!=='object'||Array.isArray(data))return json({error:'Invalid body'},422);
  if(request.method==='PUT'){
   if(typeof data.prompt!=='string'||data.prompt.length>1800||typeof data.enabled!=='boolean'||typeof data.knowledge!=='boolean')return json({error:'Invalid profile'},422);
   const now=Date.now();
   await db.prepare('INSERT INTO star_ai_profile(owner,prompt,enabled,knowledge,updated) VALUES(?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET prompt=excluded.prompt,enabled=excluded.enabled,knowledge=excluded.knowledge,updated=excluded.updated').bind(owner,data.prompt,data.enabled?1:0,data.knowledge?1:0,now).run();
   return json({ok:true,updated:now});
  }
  if(!validId(data.id))return json({error:'Invalid document id'},422);
  if(request.method==='DELETE'){
   await db.batch([db.prepare('DELETE FROM star_knowledge_chunks WHERE owner=? AND doc=?').bind(owner,data.id),db.prepare('DELETE FROM star_knowledge_docs WHERE owner=? AND id=?').bind(owner,data.id)]);
   return json({ok:true});
  }
  if(typeof data.name!=='string'||!data.name.trim()||data.name.length>150||/[\u0000-\u001f]/.test(data.name)||typeof data.text!=='string'||!data.text.trim()||data.text.length>48000||data.text.includes('\u0000'))return json({error:'Invalid text file'},422);
  const count=await db.prepare('SELECT count(*) AS n FROM star_knowledge_docs WHERE owner=?').bind(owner).first();
  if(count.n>=50)return json({error:'Document limit reached'},409);
  const parts=splitKnowledge(data.text);
  await db.batch([db.prepare('INSERT INTO star_knowledge_docs(owner,id,name,chars,created) VALUES(?,?,?,?,?)').bind(owner,data.id,data.name,data.text.length,Date.now()),...parts.map((p,i)=>db.prepare('INSERT INTO star_knowledge_chunks(owner,doc,part,body) VALUES(?,?,?,?)').bind(owner,data.id,i,p))]);
  return json({ok:true,id:data.id,parts:parts.length},201);
 }catch{return json({error:'Storage unavailable'},503);}
}
export const onRequest=handleSettings;
