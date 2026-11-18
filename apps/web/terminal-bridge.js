/**
 * KALI-OSINT-STAR first-party terminal transport.
 *
 * Browser -> this Pages Function: Cloudflare Access owner session.
 * Pages -> Wormstar Worker: private Cloudflare Service binding + bridge secret.
 * Wormstar -> Railway: its existing 20-second ticket and private origin gate.
 * Never place Railway passwords or the bridge secret in a frontend bundle.
 */
const CANONICAL_HOST='kali-osint-star.pages.dev';
const WORKER_ORIGIN='https://wormstar-ai-lab.abdulstarzeki001.workers.dev';
const ROUTES={
  session:{method:'POST',upstream:'session'},
  diagnose:{method:'POST',upstream:'diagnose'},
  ws:{method:'GET',upstream:'ws'},
  'backup/latest':{method:'POST',upstream:'backup/latest'}
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
 // Pages production Access enforces the actual owner identity at Cloudflare's
 // edge; this assertion is injected by Access, not accepted as a login token.
 if(!request.headers.get('Cf-Access-Jwt-Assertion'))return json('ACCESS_REQUIRED',401);
 const origin=request.headers.get('Origin');
 if((route==='ws' && origin!==u.origin) || (origin && origin!==u.origin))
   return json('ORIGIN_DENIED',403);
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
 const target=WORKER_ORIGIN+'/api/integrations/kali/terminal/'+spec.upstream;
 let upstream;
 try {
   upstream=await binding.fetch(new Request(target,{
     method:request.method,
     headers,
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
