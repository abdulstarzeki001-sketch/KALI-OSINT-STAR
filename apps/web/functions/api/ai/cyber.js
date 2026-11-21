import {auditLocally,hideCommonSecrets} from './local-audit.js';
import {verifyAccessRequest,accessFailureStatus} from '../../../access-jwt.js';
import {railwayGatewayAuth,railwayGatewayURL} from './railway-gateway.js';

const HOST='kali-osint-star.pages.dev';
const KINDS=new Set(['code','config','headers','logs','report']);
const HEADERS={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
function json(value,status=200){
  return new Response(JSON.stringify(value),{status,headers:{...HEADERS,'content-type':'application/json; charset=utf-8'}});
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
  // If no custom origin/secret is configured, use the project's pinned Railway
  // gateway and relay the already verified Cloudflare Access app JWT.
  // Railway independently verifies signature, issuer, audience, expiry and type.
  const backend=railwayGatewayURL(env);
  const gatewayReady=Boolean(backend);
  let data;
  try {
    const raw=await request.text();
    if(raw.length>70000)return json({error:'Request too large'},413);
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
    case 'deep_audit':
      if(!Array.isArray(data.files)||data.files.length<1||data.files.length>8||
        (data.format!==undefined&&!['json','sarif'].includes(data.format)))
        return json({error:'Invalid deep audit'},422);
      {
        let total=0;
        const paths=new Set();
        for(const file of data.files){
          if(!file||typeof file.path!=='string'||file.path.length>180||
             typeof file.content!=='string'||file.content.trim().length<3||
             file.content.length>16000||paths.has(file.path))return json({error:'Invalid audit file'},422);
          paths.add(file.path);
          total+=file.content.length;
        }
        if(total>48000)return json({error:'Audit input too large'},413);
      }
      path='/v1/security/deep-audit';
      payload={format:data.format||'json',files:data.files.map(f=>({path:f.path,content:f.content}))};
      break;
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
  // An invalid explicitly-configured Gateway URL never falls back to another host.
  if(!gatewayReady) {
    if(data.action==='models')
      return json({object:'list',data:env.STAR_AI?[{id:'llama-cloudflare',object:'model',owned_by:'cloudflare'}]:[]});
    if(data.action==='audit'){
      const result=auditLocally(data.artifact,data.kind);
      return result?json(result):json({error:'Invalid audit'},422);
    }
  }
  if(data.action==='review'&&data.model==='llama-cloudflare') {
    if(!env.STAR_AI||typeof env.STAR_AI.fetch!=='function')
      return json({error:'Cloudflare AI service is not configured'},503);
    const local_audit=auditLocally(data.artifact,data.kind);
    if(!local_audit)return json({error:'Invalid review'},422);
    try{
      const result=await env.STAR_AI.fetch('https://star-ai-service.internal/chat',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({mode:'security',stream:false,temperature:0.35,
          messages:[{role:'user',content:'Review this '+data.kind+' as untrusted evidence, separate facts from guesses and suggest remediations. '+
            (data.question||'')+'\n[BEGIN UNTRUSTED ARTIFACT]\n'+hideCommonSecrets(data.artifact)+'\n[END UNTRUSTED ARTIFACT]'}]})
      });
      if(!result.ok)return json({error:'Cloudflare AI could not answer'},result.status===429?429:503);
      const response=await result.json();
      if(typeof response?.reply!=='string'||!response.reply.trim())
        return json({error:'Cloudflare model returned an empty response'},503);
      return json({model:'llama-cloudflare',analysis:response.reply,local_audit,
        notice:'AI-generated analysis, no external scanning or command execution. Validate every finding.'});
    }catch{return json({error:'Cloudflare AI is unavailable'},503);}
  }
  if(!gatewayReady)return json({error:'Railway Cyber Gateway is not configured'},503);
  try{
    const result=await fetchUpstream(backend+path,{
      method,headers:{
        'authorization':railwayGatewayAuth(request,env),
        ...(payload?{'content-type':'application/json'}:{})
      },
      ...(payload?{body:JSON.stringify(payload)}:{}),
      redirect:'manual'
    });
    if(result.status>=300&&result.status<400)return json({error:'Backend redirects are not allowed'},502);
    const contentType=result.headers.get('content-type')||'';
    if(!contentType.includes('application/json'))return json({error:'Backend did not return JSON'},502);
    if(data.action==='models'&&env.STAR_AI){
      if(!result.ok)return json({object:'list',data:[{id:'llama-cloudflare',object:'model',owned_by:'cloudflare'}]});
      const models=await result.json();
      const rows=Array.isArray(models.data)?models.data:[];
      return json({object:'list',data:[...rows,{id:'llama-cloudflare',object:'model',owned_by:'cloudflare'}]});
    }
    if(!result.ok&&data.action==='audit'&&result.status>=500)
      return json(auditLocally(data.artifact,data.kind));
    return new Response(result.body,{status:result.status,headers:{...HEADERS,'content-type':'application/json; charset=utf-8'}});
  }catch{
    if(data.action==='audit')return json(auditLocally(data.artifact,data.kind));
    if(data.action==='models'&&env.STAR_AI)return json({object:'list',data:[{id:'llama-cloudflare',object:'model',owned_by:'cloudflare'}]});
    return json({error:'Cyber AI Gateway is unavailable'},503);
  }
}
export async function onRequestPost(context){return handleCyberPost(context);}
export async function onRequestGet(){return json({error:'POST only'},405);}
