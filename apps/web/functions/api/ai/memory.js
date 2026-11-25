import {verifyAccessRequest,accessFailureStatus} from '../../../access-jwt.js';
import {ownerKey} from '../../../durable-memory.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const kinds=new Set(['instruction','note','task','chat']);
const idOK=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(x);
async function boundedJSON(request){
 const reader=request.body?.getReader();if(!reader)throw Error('missing body');
 const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144){await reader.cancel();throw Error('too large');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
export async function handleMemory({request,env},verify=verifyAccessRequest){
 const url=new URL(request.url),origin=request.headers.get('origin');
 if(url.hostname!=='kali-osint-star.pages.dev'||url.protocol!=='https:'||(origin&&origin!==url.origin))return json({error:'Forbidden origin'},403);
 if(!['GET','POST','PATCH','DELETE'].includes(request.method))return json({error:'Method not allowed'},405);
 if(request.method!=='GET'&&origin!==url.origin)return json({error:'Same origin required'},403);
 const auth=await verify(request,env);
 if(!auth.ok)return json({error:'Access required'},accessFailureStatus(auth.reason));
 const db=env.STAR_MEMORY;if(!db)return json({error:'Memory storage not configured'},503);
 try{
  const owner=await ownerKey(auth.identity);
  if(request.method==='GET'){
   const offset=Number(url.searchParams.get('offset')||0);
   if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)return json({error:'Invalid offset'},422);
   const kind=url.searchParams.get('kind')||'';
   if(kind&&!kinds.has(kind))return json({error:'Invalid kind'},422);
   const q=await db.prepare('SELECT id,kind,body,state,room,created,updated FROM star_memory WHERE owner=? AND (?=\'\' OR kind=?) ORDER BY updated DESC,id DESC LIMIT 51 OFFSET ?').bind(owner,kind,kind,offset).all();
   const rows=q.results||[];return json({items:rows.slice(0,50),next:rows.length>50?offset+50:null});
  }
  if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'JSON required'},415);
  let data;try{data=await boundedJSON(request);}catch{return json({error:'Invalid or oversized JSON'},400);}
  if(!data||!idOK(data.id))return json({error:'Invalid id'},422);
  if(request.method==='DELETE'){
   await db.prepare('DELETE FROM star_memory WHERE owner=? AND id=?').bind(owner,data.id).run();return json({ok:true});
  }
  if(request.method==='PATCH'){
   if(!['pending','done'].includes(data.state))return json({error:'Invalid task state'},422);
   const result=await db.prepare("UPDATE star_memory SET state=?,updated=? WHERE owner=? AND id=? AND kind='task'").bind(data.state,Date.now(),owner,data.id).run();
   return result.meta?.changes?json({ok:true}):json({error:'Task not found'},404);
  }
  if(!kinds.has(data.kind)||typeof data.body!=='string'||!data.body.trim()||data.body.length>(data.kind==='chat'?60000:2000))return json({error:'Invalid or oversized memory'},422);
  const room=data.kind==='chat'&&idOK(data.room)?data.room:'';
  if(data.kind==='chat'&&!room)return json({error:'Invalid room'},422);
  const state=data.kind==='task'?'pending':data.kind==='chat'&&data.partial===true?'partial':'saved';
  const now=Date.now();
  const result=await db.prepare('INSERT INTO star_memory(owner,id,kind,body,state,room,created,updated) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(owner,id) DO NOTHING').bind(owner,data.id,data.kind,data.body,state,room,now,now).run();
  if(!result.meta?.changes)return json({error:'Entry already exists'},409);
  return json({ok:true,id:data.id},201);
 }catch{return json({error:'Memory storage unavailable'},503);}
}
export const onRequest=handleMemory;
