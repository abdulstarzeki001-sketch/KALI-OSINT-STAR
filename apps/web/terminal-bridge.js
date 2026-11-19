/**
 * KALI-OSINT-STAR first-party terminal transport.
 *
 * Browser -> this Pages Function: Cloudflare Access owner session.
 * Pages -> Wormstar Worker: private Cloudflare Service binding + bridge secret.
 * Wormstar -> Railway: its existing 20-second ticket and private origin gate.
 * Never place Railway passwords or the bridge secret in a frontend bundle.
 */
import {verifyAccessRequest,accessFailureStatus} from './access-jwt.js';

const CANONICAL_HOST='kali-osint-star.pages.dev';
const WORKER_ORIGIN='https://wormstar-ai-lab.abdulstarzeki001.workers.dev';
const ROUTES={
  session:{method:'POST',upstream:'session'},
  diagnose:{method:'POST',upstream:'diagnose'},
  ws:{method:'GET',upstream:'ws'},
  'backup/latest':{method:'POST',upstream:'backup/latest'},
  'training/status':{method:'POST',upstream:'training/status'},
  'training/verify':{method:'POST',upstream:'training/verify'},
  'tools/catalog':{method:'POST',upstream:'tools/catalog'},
  'tools/install/catalog':{method:'POST',upstream:'tools/install/catalog'},
  'tools/install/execute':{method:'POST',upstream:'tools/install/execute'},
  'tools/run':{method:'POST',upstream:'tools/run'},
  'tools/assistant':{method:'POST',upstream:'tools/assistant'}
};

function json(code,status){
 return new Response(JSON.stringify({code}),{status,headers:{
  'content-type':'application/json;charset=utf-8',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer'
 }});
}
export async function handleTerminalFunction(context,route) {
 const {request,env}=context;
 const u=new URL(request.url);
 const spec=ROUTES[route];
 if(!spec)return json('NOT_FOUND',404);
 if(u.hostname!==CANONICAL_HOST || u.protocol!=='https:')return json('FORBIDDEN_HOST',403);
 if(request.method!==spec.method)return json('METHOD_NOT_ALLOWED',405);
 // Access enforces the owner policy at Cloudflare's edge. This Function also
 // verifies the injected application JWT (signature, iss, aud, type=app, exp)
 // so a misconfigured or bypassed Access policy cannot be exploited with a
 // forged header or with the signed `meta` token from the public login page.
 if(!request.headers.get('Cf-Access-Jwt-Assertion'))return json('ACCESS_REQUIRED',401);
 const origin=request.headers.get('Origin');
 if((route==='ws' && origin!==u.origin) || (origin && origin!==u.origin))
   return json('ORIGIN_DENIED',403);
 const access=await verifyAccessRequest(request,env);
 if(!access.ok)return json(access.reason,accessFailureStatus(access.reason));
 const binding=env?.WORMSTAR_TERMINAL;
 const secret=env?.KALI_TERMINAL_BRIDGE_SECRET;
 if(!binding || typeof binding.fetch!=='function' ||
    typeof secret!=='string' || secret.length<32)
   return json('TERMINAL_BRIDGE_NOT_CONFIGURED',503);
 const headers=new Headers({'X-Kali-Terminal-Bridge':secret});
 if(route==='ws'){
   if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')
     return json('WEBSOCKET_REQUIRED',426);
   const proto=request.headers.get('Sec-WebSocket-Protocol')||'';
   if(!/^wormstar-terminal,\s*ticket\.[A-Za-z0-9_.-]{60,180}$/.test(proto))
     return json('TICKET_REQUIRED',401);
   headers.set('Upgrade','websocket');
   headers.set('Sec-WebSocket-Protocol',proto);
 }
 let trainingBody=null;
 if(route==='training/verify'){
   const declared=Number(request.headers.get('Content-Length')||0);
   if(declared>2048)return json('TRAINING_INPUT_TOO_LARGE',413);
   trainingBody=await request.text();
   if(new TextEncoder().encode(trainingBody).byteLength>2048)
     return json('TRAINING_INPUT_TOO_LARGE',413);
   try{
     const parsed=JSON.parse(trainingBody);
     if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
       return json('TRAINING_BAD_JSON',400);
   }catch(_){return json('TRAINING_BAD_JSON',400);}
   headers.set('Content-Type','application/json');
 }
 if(route==='tools/run'||route==='tools/assistant'||route==='tools/install/execute'){
   const declared=Number(request.headers.get('Content-Length')||0);
   if(declared>2048)return json('TOOLS_INPUT_TOO_LARGE',413);
   trainingBody=await request.text();
   if(new TextEncoder().encode(trainingBody).length>2048)return json('TOOLS_INPUT_TOO_LARGE',413);
   try{
     const parsed=JSON.parse(trainingBody);
     if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return json('TOOLS_BAD_JSON',400);
     if(route==='tools/install/execute' &&
        (Object.keys(parsed).sort().join(',')!=='approval,tool_id' ||
         parsed.approval!=='I_APPROVE_RAILWAY_TOOL_INSTALL'||
         !['certipy','impacket','frida','aflpp'].includes(parsed.tool_id)))
        return json('INSTALL_APPROVAL_REQUIRED',400);
     if(route==='tools/run' &&
        (typeof parsed.tool_id!=='string'||!/^[-a-z0-9]{2,32}$/.test(parsed.tool_id)||
         !['inspect','version'].includes(parsed.action)||
         Object.keys(parsed).some(k=>!['tool_id','action'].includes(k))))
       return json('TOOLS_INVALID_ACTION',400);
     if(route==='tools/assistant' &&
        (typeof parsed.prompt!=='string'||!parsed.prompt.trim()||parsed.prompt.length>400||
         Object.keys(parsed).some(k=>k!=='prompt')))
       return json('TOOLS_INVALID_PROMPT',400);
   }catch(_){return json('TOOLS_BAD_JSON',400);}
   headers.set('Content-Type','application/json');
 }
  const target=WORKER_ORIGIN+'/api/integrations/kali/terminal/'+spec.upstream;
 let upstream;
 try {
   upstream=await binding.fetch(new Request(target,{
     method:request.method,
     headers,
     body:trainingBody,
     redirect:'manual'
   }));
 } catch(_) {return json('TERMINAL_BRIDGE_UNAVAILABLE',503);}
 if(route==='ws'){
   // Preserve the Cloudflare 101 WebSocket object; no credentials are reflected.
   return upstream;
 }
 if(route==='backup/latest' && upstream.status===200){
   const filename=upstream.headers.get('Content-Disposition')||'';
   const size=Number(upstream.headers.get('Content-Length'));
   if(!/^attachment; filename="star-home-[0-9]{8}T[0-9]{6}Z-[0-9]+\.tgz"$/.test(filename) ||
      !Number.isSafeInteger(size) || size<1 || size>80*1024*1024)
     return json('INVALID_BACKUP_RESPONSE',502);
   return new Response(upstream.body,{status:200,headers:{
     'Content-Type':'application/gzip','Content-Length':String(size),
     'Content-Disposition':filename,'Cache-Control':'private, no-store, max-age=0',
     'X-Content-Type-Options':'nosniff'
   }});
 }
 // Strip any internal headers before sending JSON/HTTP status to the browser.
 const status=upstream.status;
 if(status<200 || status>=600)return json('TERMINAL_BRIDGE_BAD_RESPONSE',502);
 return new Response(upstream.body,{status,headers:{
  'Content-Type':'application/json;charset=utf-8',
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff'
 }});
}
export const terminalFunctionContract={CANONICAL_HOST,WORKER_ORIGIN,ROUTES};
