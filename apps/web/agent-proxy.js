import {verifyAccessRequest,accessFailureStatus} from './access-jwt.js';

// Owner JWT required at Pages and independently on Railway. No user-supplied
// target URL or command can reach the execution API.
const ORIGIN='https://star-agent-runner-production.up.railway.app';
const SITE='kali-osint-star.pages.dev';
const HEADERS={'cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY'};
function json(value,status=200){
 return new Response(JSON.stringify(value),{status,headers:{...HEADERS,'content-type':'application/json; charset=utf-8'}});
}
export async function handleAgent({request,env,params={}},action,fetchImpl=globalThis.fetch){
 const url=new URL(request.url);
 if(url.hostname!==SITE)return json({error:'Restricted host'},403);
 const origin=request.headers.get('origin');
 if(origin&&origin!==url.origin)return json({error:'Cross-origin request denied'},403);
 const token=request.headers.get('Cf-Access-Jwt-Assertion');
 if(!token)return json({error:'Cloudflare Access required'},401);
 const auth=await verifyAccessRequest(request,env);
 if(!auth.ok)return json({error:'Invalid Access session'},accessFailureStatus(auth.reason));
 const isGet=action==='health'||action==='status';
 if(request.method!==(isGet?'GET':'POST'))return json({error:'Invalid HTTP method'},405);
 let path;
 if(action==='health')path='/health';
 else if(action==='submit')path='/api/tasks';
 else if(action==='status'||action==='decide'){
  const id=typeof params.id==='string'?params.id:'';
  if(!/^[a-f0-9]{24}$/.test(id))return json({error:'Invalid task identifier'},422);
  path='/api/tasks/'+id+(action==='decide'?'/decide':'');
 }else return json({error:'Unknown agent action'},404);
 let payload;
 if(!isGet){
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
   return json({error:'JSON required'},415);
  try{
   const raw=await request.text();
   if(raw.length>5100)return json({error:'Body too large'},413);
   const data=JSON.parse(raw);
   if(!data||typeof data!=='object')return json({error:'Invalid body'},422);
   if(action==='submit'){
    if(typeof data.prompt!=='string'||!data.prompt.trim()||data.prompt.length>4000)
     return json({error:'Invalid prompt'},422);
    payload={prompt:data.prompt};
   }else{
    if(typeof data.approve!=='boolean')return json({error:'Approval must be boolean'},422);
    payload={approve:data.approve};
   }
  }catch{return json({error:'Invalid JSON'},400);}
 }
 try{
  const result=await fetchImpl(ORIGIN+path,{
   method:isGet?'GET':'POST',redirect:'manual',
   headers:{authorization:'Bearer '+token,accept:'application/json',
    ...(!isGet?{'content-type':'application/json'}:{})},
   ...(!isGet?{body:JSON.stringify(payload)}:{})
  });
  if(result.status>=300&&result.status<400)return json({error:'Agent redirect refused'},502);
  if(!(result.headers.get('content-type')||'').includes('application/json'))
   return json({error:'Invalid agent content type'},502);
  const body=await result.text();
  if(body.length>105000)return json({error:'Agent response too large'},502);
  let data;
  try{data=JSON.parse(body);}catch{return json({error:'Invalid agent JSON'},502);}
  return json(data,result.status);
 }catch{return json({error:'Agent backend not reachable'},503);}
}
