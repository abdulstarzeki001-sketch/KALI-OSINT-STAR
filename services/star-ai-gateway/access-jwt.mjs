import {createPublicKey, verify} from 'node:crypto';

// Verify Cloudflare Access app JWT independently at the Railway boundary.
// The signing public keys are fetched from the configured Access team.
// Never trust a JWT header, identity or unsigned payload alone.
const B64=/^[A-Za-z0-9_-]+$/;
const ALLOWED_TEAM=/^[a-z0-9-]+\.cloudflareaccess\.com$/;
const ALLOWED_AUD=/^[a-f0-9]{64}$/;
const SKEW=60;
function decode(part){
  if(typeof part!=='string'||part.length>6000||!B64.test(part))throw Error('bad_jwt');
  return JSON.parse(Buffer.from(part,'base64url').toString('utf8'));
}
export function createAccessVerifier({env={},fetchImpl=globalThis.fetch,now=Date.now}={}){
  const team=String(env.STAR_ACCESS_TEAM_DOMAIN||'').trim().toLowerCase();
  const aud=String(env.STAR_ACCESS_AUD||'').trim().toLowerCase();
  const allowed=String(env.STAR_ACCESS_ALLOWED_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(!ALLOWED_TEAM.test(team)||!ALLOWED_AUD.test(aud))return async()=>false;
  const issuer='https://'+team, certsUrl=issuer+'/cdn-cgi/access/certs';
  let cache={until:0,keys:new Map()};
  async function load(force){
    if(!force&&cache.until>now())return cache.keys;
    const r=await fetchImpl(certsUrl,{method:'GET',headers:{accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(7000)});
    if(!r.ok||!(r.headers.get('content-type')||'').includes('application/json'))throw Error('certs_unavailable');
    const data=await r.json(), keys=new Map();
    if(!Array.isArray(data?.keys)||data.keys.length>50)throw Error('certs_invalid');
    for(const k of data.keys){
      if(k?.kty==='RSA'&&typeof k.kid==='string'&&k.kid.length<=128&&
         typeof k.n==='string'&&typeof k.e==='string'&&(!k.use||k.use==='sig')){
        try{keys.set(k.kid,createPublicKey({key:{kty:'RSA',n:k.n,e:k.e},format:'jwk'}));}catch{}
      }
    }
    if(!keys.size)throw Error('certs_empty');
    cache={until:now()+5*60*1000,keys};
    return keys;
  }
  return async function verifyAccessJwt(token){
    if(typeof token!=='string'||token.length>8192||token.length<100)return false;
    const p=token.split('.');
    if(p.length!==3||!p.every(x=>B64.test(x)))return false;
    try{
      const h=decode(p[0]),body=decode(p[1]),sig=Buffer.from(p[2],'base64url');
      if(!h||!body||Array.isArray(body)||h.alg!=='RS256'||typeof h.kid!=='string'||h.kid.length>128)return false;
      const seconds=Math.floor(now()/1000);
      const audiences=Array.isArray(body.aud)?body.aud:[body.aud];
      if(body.iss!==issuer||!audiences.includes(aud)||body.type!=='app'||
         !Number.isFinite(body.exp)||body.exp+SKEW<seconds||
         (Number.isFinite(body.nbf)&&body.nbf-SKEW>seconds)||
         (Number.isFinite(body.iat)&&body.iat-SKEW>seconds))return false;
      const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
      const sub=typeof body.sub==='string'?body.sub.trim():'';
      if(!email&&!sub)return false;
      if(allowed.length&&!allowed.includes(email))return false;
      let keys=await load(false);
      if(!keys.has(h.kid))keys=await load(true);
      const key=keys.get(h.kid);
      if(!key||sig.length<100)return false;
      return verify('RSA-SHA256',Buffer.from(p[0]+'.'+p[1]),key,sig);
    }catch{return false;}
  };
}
