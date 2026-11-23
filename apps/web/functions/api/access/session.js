import {verifyAccessRequest,accessFailureStatus} from '../../../access-jwt.js';

const HOST='kali-osint-star.pages.dev';
const HEADERS={
  'cache-control':'private, no-store, max-age=0',
  'content-type':'application/json; charset=utf-8',
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  'x-frame-options':'DENY'
};
function json(body,status=200){
 return new Response(JSON.stringify(body),{status,headers:HEADERS});
}
export async function onRequestGet({request,env}){
 const u=new URL(request.url);
 if(u.hostname!==HOST||u.protocol!=='https:')return json({authenticated:false,code:'INVALID_HOST'},403);
 const token=request.headers.get('Cf-Access-Jwt-Assertion');
 if(!token)return json({authenticated:false,code:'ACCESS_REQUIRED'},401);
 const session=await verifyAccessRequest(request,env);
 if(!session.ok)return json({authenticated:false,code:session.reason},accessFailureStatus(session.reason));
 // Intentionally return no email, JWT, session ID or issuer to the browser.
 return json({authenticated:true,provider:'cloudflare-access',jwt_verified:true});
}
