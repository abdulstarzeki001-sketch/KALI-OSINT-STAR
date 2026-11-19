import {verifyAccessRequest,accessFailureStatus} from '../../../access-jwt.js';
// Cloudflare Access protects the canonical host before this Function executes;
// the injected application JWT is verified again here (see access-jwt.js).
// This Function does not forward requests to Kali or accept execution commands.
const HOST = 'kali-osint-star.pages.dev';
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}})}
export async function onRequestPost({request,env}){
 const url=new URL(request.url);
 if(url.hostname!==HOST)return json({error:'Restricted host'},403);
 const origin=request.headers.get('origin');
 if(origin && origin!==url.origin)return json({error:'Cross-origin requests denied'},403);
 if(!request.headers.get('Cf-Access-Jwt-Assertion'))return json({error:'Cloudflare Access login required'},401);
 const access=await verifyAccessRequest(request,env);
 if(!access.ok)return json({error:'Cloudflare Access verification failed',code:access.reason},accessFailureStatus(access.reason));
 if(!request.headers.get('content-type')?.toLowerCase().includes('application/json'))return json({error:'JSON request required'},415);
 if(!env.STAR_AI)return json({error:'AI service binding not configured'},503);
 let input;
 try {const raw=await request.text();if(raw.length>19500)return json({error:'Payload too large'},413);input=JSON.parse(raw);}catch{return json({error:'Invalid JSON'},400);}
 if(typeof input?.report!=='string'||input.report.trim().length<30||input.report.length>18000||typeof input.question!=='undefined'&&typeof input.question!=='string')return json({error:'Invalid report'},422);
 try{
   const result=await env.STAR_AI.fetch('https://star-ai-service.internal/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({report:input.report,question:typeof input.question==='string'?input.question.slice(0,500):''})});
   return new Response(result.body,{status:result.status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
 }catch{return json({error:'AI service is temporarily unavailable'},503);}
}
export async function onRequestGet(){return json({error:'POST only'},405)}
