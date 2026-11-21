const DEFAULT_GATEWAY='https://star-ai-cyber-gateway-production.up.railway.app';
export const PRIVATE_MODEL='qwen3-coder-vast';

export function railwayGatewayURL(env) {
  if(!Object.hasOwn(env,'STAR_CYBER_GATEWAY_URL'))return DEFAULT_GATEWAY;
  try {
    const url=new URL(env.STAR_CYBER_GATEWAY_URL);
    if(url.protocol!=='https:'||! /^[a-z0-9-]+\.up\.railway\.app$/.test(url.hostname)||
       url.port||url.username||url.password||url.search||url.hash||url.pathname!=='/')return null;
    return url.origin;
  }catch{return null;}
}

export function railwayGatewayAuth(request,env) {
  const token=env.STAR_CYBER_GATEWAY_TOKEN;
  const bearer=typeof token==='string'&&token.length>=32?token:request.headers.get('Cf-Access-Jwt-Assertion');
  return 'Bearer '+bearer;
}

export async function requestPrivateCompletion(request,env,body,fetchUpstream) {
  const backend=railwayGatewayURL(env);
  if(!backend)return null;
  return fetchUpstream(backend+'/v1/chat/completions',{
    method:'POST',redirect:'manual',signal:request.signal,
    headers:{
      'authorization':railwayGatewayAuth(request,env),
      'content-type':'application/json',
      'accept':body.stream?'text/event-stream':'application/json'
    },
    body:JSON.stringify({...body,model:PRIVATE_MODEL})
  });
}
