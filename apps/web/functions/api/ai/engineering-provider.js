import {providerOK} from '../../../engineering-v3.js';
import {sensitive} from '../../../github-workspace.js';
import {requestPrivateCompletion,PRIVATE_MODEL} from './railway-gateway.js';
const CLOUD='llama-cloudflare';
export async function engineeringCompletion(request,env,messages,selected=CLOUD,fetchUpstream=globalThis.fetch,options={}){
 if(!providerOK(selected))throw Error('Invalid provider');
 if(messages.some(m=>sensitive(m.content)))throw Error('Potential credential in model context');
 const probe=options.probe===true;
 const body={messages,mode:'code',stream:false,temperature:0.1};
 const attempts=selected==='star-ai-auto'?[PRIVATE_MODEL,CLOUD]:[selected];
 let lastStatus=503;
 const started=Date.now();
 for(const model of attempts){
  if(request.signal.aborted)return {ok:false,status:499,ms:Date.now()-started};
  const start=Date.now();
  const defaultMs=probe?20000:model===PRIVATE_MODEL?(selected==='star-ai-auto'?20000:40000):25000;
  const controller=new AbortController();
  const cancel=()=>controller.abort();
  request.signal.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(cancel,options.timeoutMs??defaultMs);
  try{
   // Bound both response headers and body parsing; abort the in-flight request.
   const work=async()=>{
    let response;
    if(model===PRIVATE_MODEL){
     response=await requestPrivateCompletion(request,env,{...body,max_tokens:probe?64:1200},(url,init)=>fetchUpstream(url,{...init,signal:controller.signal}));
    }else if(env.STAR_AI){
     response=await env.STAR_AI.fetch('https://star-ai-service.internal/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
    }
    if(!response)return {ok:false,status:503};
    if(!response.ok)return {ok:false,status:response.status};
    const v=await response.json();
    const reply=model===PRIVATE_MODEL?v?.choices?.[0]?.message?.content:v?.reply;
    if(typeof reply!=='string'||!reply.trim()||reply.length>24000)return {ok:false,status:503};
    return {ok:true,reply,model,ms:Date.now()-start};
   };
   const aborted=new Promise(resolve=>{if(controller.signal.aborted)resolve({ok:false,status:504});else controller.signal.addEventListener('abort',()=>resolve({ok:false,status:504}),{once:true});});
   const result=await Promise.race([work(),aborted]);
   if(request.signal.aborted)return {ok:false,status:499,ms:Date.now()-started};
   if(result.ok)return result;
   lastStatus=result.status;
   if(![429,502,503,504].includes(lastStatus))break;
  }catch{lastStatus=controller.signal.aborted?504:503;}
  finally{clearTimeout(timer);request.signal.removeEventListener('abort',cancel);}
 }
 return {ok:false,status:lastStatus,ms:Date.now()-started};
}
