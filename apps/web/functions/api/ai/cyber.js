import {verifyAccessRequest,accessFailureStatus} from '../../../access-jwt.js';

const HOST='kali-osint-star.pages.dev';
const KINDS=new Set(['code','config','headers','logs','report']);
const HEADERS={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
function json(value,status=200){
  return new Response(JSON.stringify(value),{status,headers:{...HEADERS,'content-type':'application/json; charset=utf-8'}});
}
function gatewayURL(env) {
  try{
    const u=new URL(env.STAR_CYBER_GATEWAY_URL);
    if(u.protocol!=='https:'||! /^[a-z0-9-]+\.up\.railway\.app$/.test(u.hostname)||
       u.port||u.username||u.password||u.search||u.hash||u.pathname!=='/')return null;
    return u.origin;
  }catch{return null;}
}
export async function handleCyberPost({request,env},fetchUpstream=globalThis.fetch) {
  const url=new URL(request.url);
  if(url.hostname!==HOST)return json({error:'Restricted host'},403);
  const origin=request.headers.get('origin');
  if(origin&&origin!==url.origin)return json({error:'Cross-origin request denied'},403);
  if(!request.headers.get('Cf-Access-Jwt-Assertion'))return json({error:'Cloudflare Access login required'},401);
  const auth=await verifyAccessRequest(request,env);
  if(!auth.ok)return json({error:'Cloudflare Access verification failed'},accessFailureStatus(auth.reason));
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return json({error:'JSON required'},415);
  const backend=gatewayURL(env);
  const token=env.STAR_CYBER_GATEWAY_TOKEN;
  if(!backend||typeof token!=='string'||token.length<32)
    return json({error:'Cyber AI Gateway is not configured'},503);
  let data;
  try {
    const raw=await request.text();
    if(raw.length>21000)return json({error:'Request too large'},413);
    data=JSON.parse(raw);
  }catch{return json({error:'Invalid JSON'},400);}
  if(!data||typeof data!=='object')return json({error:'Invalid body'},422);
  let path,method='POST',payload;
  switch(data.action) {
    case 'models':
      path='/v1/models';method='GET';break;
    case 'audit':
      if(!KINDS.has(data.kind)||typeof data.artifact!=='string'||data.artifact.length<3||data.artifact.length>16000)
        return json({error:'Invalid audit'},422);
      path='/v1/security/audit';payload={kind:data.kind,artifact:data.artifact};break;
    case 'review':
      if(!KINDS.has(data.kind)||typeof data.artifact!=='string'||data.artifact.length<3||data.artifact.length>16000||
         typeof data.model!=='string'||data.model.length>48||
         (data.question!==undefined&&(typeof data.question!=='string'||data.question.length>500)))
        return json({error:'Invalid AI review'},422);
      path='/v1/security/review';
      payload={kind:data.kind,artifact:data.artifact,model:data.model,question:data.question||''};break;
    default:
      return json({error:'Unknown action'},422);
  }
  try{
    const result=await fetchUpstream(backend+path,{
      method,headers:{
        'authorization':'Bearer '+token,
        ...(payload?{'content-type':'application/json'}:{})
      },
      ...(payload?{body:JSON.stringify(payload)}:{}),
      redirect:'manual'
    });
    if(result.status>=300&&result.status<400)return json({error:'Backend redirects are not allowed'},502);
    const contentType=result.headers.get('content-type')||'';
    if(!contentType.includes('application/json'))return json({error:'Backend did not return JSON'},502);
    return new Response(result.body,{status:result.status,headers:{...HEADERS,'content-type':'application/json; charset=utf-8'}});
  }catch{return json({error:'Cyber AI Gateway is unavailable'},503);}
}
export async function onRequestPost(context){return handleCyberPost(context);}
export async function onRequestGet(){return json({error:'POST only'},405);}
