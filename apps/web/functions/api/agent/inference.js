import {verifyAccessRequest,accessFailureStatus} from '../../../access-jwt.js';

// Only the Linked App Token policy may authenticate machine-to-machine
// inference. It mints a distinct audience-bound Access app JWT at this path.
const INFERENCE_AUD='6a7ac1038d19d450d3d2e269bdf713965ea1652797c3ca89bf64feacdc39b367';
const HOST='kali-osint-star.pages.dev';
const HEADERS={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
function json(value,status=200){
 return new Response(JSON.stringify(value),{status,headers:{...HEADERS,'content-type':'application/json; charset=utf-8'}});
}
export async function handleInference({request,env},service=env?.STAR_AI){
 const url=new URL(request.url);
 if(url.hostname!==HOST||url.pathname!=='/api/agent/inference')return json({error:'Restricted inference route'},403);
 if(request.method!=='POST')return json({error:'POST required'},405);
 const assertion=request.headers.get('Cf-Access-Jwt-Assertion');
 if(!assertion)return json({error:'Linked Access application assertion required'},401);
 // The parent Owner Access AUD is intentionally not trusted for this separate route.
 const auth=await verifyAccessRequest(request,{...env,ACCESS_AUD:INFERENCE_AUD});
 if(!auth.ok)return json({error:'Linked Access assertion invalid'},accessFailureStatus(auth.reason));
 if(!service||typeof service.fetch!=='function')return json({error:'Private AI service binding unavailable'},503);
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
  return json({error:'JSON required'},415);
 let prompt;
 try{
  const text=await request.text();
  if(text.length>5500)return json({error:'Prompt too large'},413);
  const body=JSON.parse(text);
  if(!body||typeof body.prompt!=='string'||body.prompt.trim().length<5||body.prompt.length>4700)
   return json({error:'Invalid model prompt'},422);
  prompt=body.prompt;
 }catch{return json({error:'Invalid JSON'},400);}
 try{
  const result=await service.fetch('https://star-ai-service.internal/chat',{
   method:'POST',headers:{'content-type':'application/json','accept':'application/json'},
   body:JSON.stringify({mode:'general',stream:false,temperature:0.1,
     messages:[{role:'user',content:prompt}]})
  });
  if(!result.ok)return json({error:'Private inference temporarily unavailable'},result.status===429?429:503);
  if(!(result.headers.get('content-type')||'').includes('application/json'))
   return json({error:'Invalid model response'},502);
  const data=await result.json();
  if(typeof data?.reply!=='string'||!data.reply.trim())
   return json({error:'Model returned no usable reply'},503);
  return json({reply:data.reply.slice(0,10000),model:typeof data.model==='string'?data.model:'cloudflare'});
 }catch{return json({error:'Private inference unavailable'},503);}
}
export async function onRequestPost(context){return handleInference(context);}
export async function onRequestGet(){return json({error:'POST required'},405);}
