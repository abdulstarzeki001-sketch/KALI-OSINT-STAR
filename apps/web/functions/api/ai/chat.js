import {verifyAccessRequest,accessFailureStatus} from '../../../access-jwt.js';
import {PRIVATE_MODEL,requestPrivateCompletion} from './railway-gateway.js';

// Cloudflare Access authenticates the caller. STAR_AI is a private service
// binding: no API key, model credential, or direct Worker URL reaches the browser.
const HOST='kali-osint-star.pages.dev';
const MODES=new Set(['general','code','security','agent']);
const HEADERS={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY'};
function json(value,status=200){
 return new Response(JSON.stringify(value),{status,headers:{...HEADERS,'content-type':'application/json; charset=utf-8'}});
}
async function railwayChat(request,env,body,fetchUpstream){
 const response=await requestPrivateCompletion(request,env,body,fetchUpstream);
 if(!response)return json({error:'Private model gateway is not configured'},503);
 if(!response.ok){
  if(response.status===429)return json({error:'Private model request limit reached'},429);
  return json({error:'Private model did not respond'},503);
 }
 const type=response.headers.get('content-type')||'';
 if(body.stream){
  if(!response.body||!type.includes('text/event-stream'))return json({error:'Private model stream unavailable'},503);
  return new Response(response.body,{headers:{...HEADERS,'content-type':'text/event-stream; charset=utf-8','x-accel-buffering':'no'}});
 }
 if(!type.includes('application/json'))return json({error:'Private model reply unavailable'},503);
 const result=await response.json();
 const reply=result?.choices?.[0]?.message?.content;
 if(typeof reply!=='string'||!reply.trim())return json({error:'Private model reply unavailable'},503);
 return json({reply,model:PRIVATE_MODEL});
}
export async function handleChatPost({request,env},fetchUpstream=globalThis.fetch){
 const url=new URL(request.url);
 if(url.hostname!==HOST)return json({error:'Restricted host'},403);
 const origin=request.headers.get('origin');
 if(origin&&origin!==url.origin)return json({error:'Cross-origin request denied'},403);
 if(!request.headers.get('Cf-Access-Jwt-Assertion'))return json({error:'Cloudflare Access login required'},401);
 const access=await verifyAccessRequest(request,env);
 if(!access.ok)return json({error:'Cloudflare Access verification failed',code:access.reason},accessFailureStatus(access.reason));
 if(!request.headers.get('content-type')?.toLowerCase().includes('application/json'))return json({error:'JSON request required'},415);
 let data;
 try{
  const text=await request.text();
  if(text.length>30000)return json({error:'Conversation exceeds request limit'},413);
  data=JSON.parse(text);
 }catch{return json({error:'Invalid JSON'},400);}
 if(!data||!Array.isArray(data.messages)||data.messages.length<1||data.messages.length>24||
    !MODES.has(data.mode)||typeof data.stream!=='boolean')
  return json({error:'Invalid conversation or mode'},422);
 if(data.model!==undefined&&data.model!==PRIVATE_MODEL&&data.model!=='llama-cloudflare')
  return json({error:'Invalid model'},422);
 let total=0;
 for(const message of data.messages){
  if(!message||!['user','assistant'].includes(message.role)||typeof message.content!=='string'||
     message.content.trim().length<1||message.content.length>5000)
   return json({error:'Invalid message'},422);
  total+=message.content.length;
 }
 if(total>24000||data.messages.at(-1).role!=='user')return json({error:'Conversation history too long or final message is not from user'},422);
 if(data.temperature!==undefined && (typeof data.temperature!=='number'||!Number.isFinite(data.temperature)||data.temperature<0||data.temperature>1))
  return json({error:'Invalid creativity setting'},422);
 // Explicitly permit informational questions; NEVER accept an arbitrary shell,
 // executable command, target address or tool invocation in the API schema.
 const body={
  messages:data.messages.map(({role,content})=>({role,content})),
  mode:data.mode,stream:data.stream,temperature:data.temperature??0.5
 };
 try{
  if(data.model===PRIVATE_MODEL)return await railwayChat(request,env,body,fetchUpstream);
  if(!env.STAR_AI)return json({error:'Private AI service binding unavailable'},503);
  const result=await env.STAR_AI.fetch('https://star-ai-service.internal/chat',{
   method:'POST',headers:{'content-type':'application/json','accept':data.stream?'text/event-stream':'application/json'},
   body:JSON.stringify(body)
  });
  const ct=result.headers.get('content-type')||'';
  const safeType=result.ok && data.stream && ct.includes('text/event-stream')
   ?'text/event-stream; charset=utf-8':'application/json; charset=utf-8';
  if(result.ok&&data.stream&&!ct.includes('text/event-stream'))return json({error:'AI streaming backend is not available'},503);
  return new Response(result.body,{status:result.status,headers:{...HEADERS,'content-type':safeType,...(safeType.startsWith('text/event-stream')?{'x-accel-buffering':'no'}:{})}});
 }catch{return json({error:'AI inference gateway unavailable'},503);}
}
export async function onRequestPost(context){return handleChatPost(context);}
export async function onRequestGet(){return json({error:'POST only'},405);}
