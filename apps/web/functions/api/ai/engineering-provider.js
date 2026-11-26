import {providerOK} from '../../../engineering-v3.js';
import {sensitive} from '../../../github-workspace.js';
import {requestPrivateCompletion,PRIVATE_MODEL} from './railway-gateway.js';
const CLOUD='llama-cloudflare';
export async function engineeringCompletion(request,env,messages,selected=CLOUD,fetchUpstream=globalThis.fetch){
 if(!providerOK(selected))throw Error('Invalid provider');
 if(messages.some(m=>sensitive(m.content)))throw Error('Potential credential in model context');
 const body={messages,mode:'code',stream:false,temperature:0.1};
 const attempts=selected==='star-ai-auto'?[PRIVATE_MODEL,CLOUD]:[selected];
 let lastStatus=503;
 for(const model of attempts){
  const start=Date.now();
  let response;
  try{
   if(model===PRIVATE_MODEL){
    // Only the existing private gateway; never send the GitHub PAT to a model.
    response=await requestPrivateCompletion(request,env,body,(url,init)=>fetchUpstream(url,init));
   }else if(env.STAR_AI){
    response=await env.STAR_AI.fetch('https://star-ai-service.internal/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
   }
   if(!response){lastStatus=503;continue;}
   lastStatus=response.status;
   if(!response.ok){if(![429,502,503,504].includes(lastStatus))break;continue;}
   const v=await response.json();
   const reply=model===PRIVATE_MODEL?v?.choices?.[0]?.message?.content:v?.reply;
   if(typeof reply!=='string'||!reply.trim()||reply.length>24000){lastStatus=503;continue;}
   return {ok:true,reply,model,ms:Date.now()-start};
  }catch{lastStatus=503;}
 }
 return {ok:false,status:lastStatus};
}
