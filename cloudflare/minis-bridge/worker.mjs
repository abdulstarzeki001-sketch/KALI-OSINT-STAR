// KALI-OSINT-STAR -> Minis OpenAI-compatible gateway.
// Deploy as a SEPARATE public Cloudflare Worker with STAR_AI service binding.
// NEVER expose the existing private kali-osint-star-ai-core Worker directly.
const MODEL='star-ai-kali';
const INTERNAL_CHAT='https://star-ai-service.internal/chat';
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const encoder=new TextEncoder();
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
const failure=(status,code,message)=>json({error:{type:'api_error',code,message}},status);
const bytes=s=>encoder.encode(s).length;

async function allowed(request,expected){
  if(typeof expected!=='string'||expected.length<32)return false;
  const candidate=/^Bearer ([^\s]{32,256})$/i.exec(request.headers.get('authorization')||'')?.[1];
  if(!candidate)return false;
  const pair=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(candidate)),crypto.subtle.digest('SHA-256',encoder.encode(expected))]);
  const a=new Uint8Array(pair[0]),b=new Uint8Array(pair[1]);
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  return diff===0;
}
function normalizeMessages(input){
  if(!Array.isArray(input)||input.length<1||input.length>24)return null;
  const messages=[];
  let size=0;
  for(const m of input){
    if(!m||!['system','developer','user','assistant'].includes(m.role))return null;
    // System/developer roles from external clients must never overwrite
    // the private core's own system instructions. They are ignored.
    if(m.role==='system'||m.role==='developer')continue;
    let content=m.content;
    if(Array.isArray(content)){
      if(content.some(p=>p?.type!=='text'||typeof p.text!=='string'))return null;
      content=content.map(p=>p.text).join('\n');
    }
    if(typeof content!=='string'||!content.trim()||content.length>5000)return null;
    size+=content.length;
    messages.push({role:m.role,content});
  }
  if(!messages.length||size>24000||messages.at(-1)?.role!=='user')return null;
  return messages;
}
function completion(id,text,stream){
  const base={id,model:MODEL,created:Math.floor(Date.now()/1000)};
  if(!stream)return json({...base,object:'chat.completion',choices:[{index:0,message:{role:'assistant',content:text},finish_reason:'stop'}]});
  // The private STAR_AI endpoint returns a complete text response in this
  // adapter. SSE is OpenAI-compatible, but buffered (not token-by-token).
  const chunks=[
    {...base,object:'chat.completion.chunk',choices:[{index:0,delta:{role:'assistant',content:text},finish_reason:null}]},
    {...base,object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:'stop'}]}
  ];
  return new Response(chunks.map(x=>'data: '+JSON.stringify(x)+'\n\n').join('')+'data: [DONE]\n\n',{
    status:200,headers:{...HEADERS,'content-type':'text/event-stream; charset=utf-8','x-accel-buffering':'no'}
  });
}
export default {
 async fetch(request,env){
   const path=new URL(request.url).pathname;
   if(path!=='/v1/models'&&path!=='/v1/chat/completions')return failure(404,'not_found','Endpoint not found');
   if(!env?.STAR_AI||typeof env.STAR_AI.fetch!=='function'||!env?.MINIS_RATE_LIMITER||typeof env.MINIS_RATE_LIMITER.limit!=='function')
     return failure(503,'backend_not_configured','Private AI binding or rate limiter missing');
   if(!await allowed(request,env.MINIS_API_KEY))return failure(401,'invalid_api_key','Invalid STAR AI Minis key');
   // Cloudflare Workers native Rate Limiting binding; shared across isolates.
   try{
     const limited=await env.MINIS_RATE_LIMITER.limit({key:'minis-account'});
     if(!limited.success)return failure(429,'rate_limit_exceeded','STAR AI request limit reached');
   }catch(_){return failure(503,'rate_limit_unavailable','Rate limiter unavailable');}
   if(path==='/v1/models'){
     if(request.method!=='GET')return failure(405,'method_not_allowed','GET required');
     return json({object:'list',data:[{id:MODEL,object:'model',created:0,owned_by:'kali-osint-star'}]});
   }
   if(request.method!=='POST')return failure(405,'method_not_allowed','POST required');
   if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
     return failure(415,'unsupported_media_type','JSON required');
   let data;
   try{
     const raw=await request.text();
     if(bytes(raw)>30000)return failure(413,'request_too_large','Request body too large');
     data=JSON.parse(raw);
   }catch(_){return failure(400,'invalid_json','Invalid request JSON');}
   if(data?.model!==MODEL)return failure(400,'model_not_found','Use model ID star-ai-kali');
   const messages=normalizeMessages(data.messages);
   if(!messages)return failure(422,'invalid_messages','Only text user/assistant messages within limits are supported');
   // Client-defined function tools are NOT executed here. This adapter
   // supports text chat; use authorized project tooling separately.
   const coreBody={mode:'general',stream:false,messages,temperature:0.5};
   let core;
   try{
     core=await env.STAR_AI.fetch(INTERNAL_CHAT,{
       method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(coreBody)
     });
   }catch(_){return failure(502,'ai_gateway_unavailable','Private STAR AI binding failed');}
   if(!core.ok)return failure(core.status===429?429:503,'ai_model_unavailable','Cloudflare Workers AI could not answer');
   let result;
   try{result=await core.json();}catch(_){return failure(502,'invalid_backend_reply','Backend did not return JSON');}
   if(typeof result?.reply!=='string'||!result.reply.trim())
     return failure(502,'empty_backend_reply','Backend returned no response');
   return completion('chatcmpl-'+crypto.randomUUID(),result.reply.slice(0,24000),data.stream===true);
 }
};
export {normalizeMessages,allowed,MODEL};
