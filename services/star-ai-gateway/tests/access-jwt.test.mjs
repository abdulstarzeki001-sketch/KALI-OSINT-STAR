import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createSign} from 'node:crypto';
import {createAccessVerifier} from '../access-jwt.mjs';
import {createGateway} from '../gateway.mjs';

const TEAM='example-team.cloudflareaccess.com';
const AUD='1'.repeat(64);
const pair=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk=pair.publicKey.export({format:'jwk'});
function signed(claims={},header={}){
  const now=Math.floor(Date.now()/1000);
  const head=Buffer.from(JSON.stringify({alg:'RS256',kid:'test-key',...header})).toString('base64url');
  const payload=Buffer.from(JSON.stringify({
    iss:'https://'+TEAM,aud:[AUD],type:'app',sub:'owner',email:'owner@example.test',
    iat:now,nbf:now,exp:now+900,...claims
  })).toString('base64url');
  const signature=createSign('RSA-SHA256').update(head+'.'+payload).sign(pair.privateKey).toString('base64url');
  return head+'.'+payload+'.'+signature;
}
function fixture(){
  const calls=[];
  const fetchImpl=async(url)=>{
    calls.push(url);
    return new Response(JSON.stringify({keys:[{...jwk,kid:'test-key',use:'sig'}]}),
      {headers:{'content-type':'application/json'}});
  };
  const env={STAR_ACCESS_TEAM_DOMAIN:TEAM,STAR_ACCESS_AUD:AUD,STAR_MODELS_JSON:'[]'};
  return {env,calls,fetchImpl};
}
test('verifies a real RS256 Access app token via a public JWKS and caches keys',async()=>{
  const f=fixture();
  const v=createAccessVerifier({env:f.env,fetchImpl:f.fetchImpl});
  assert.equal(await v(signed()),true);
  assert.equal(await v(signed()),true);
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0],'https://'+TEAM+'/cdn-cgi/access/certs');
});
test('rejects unsigned, wrong-issuer, wrong-aud, expired and login meta tokens',async()=>{
  const f=fixture(),v=createAccessVerifier({env:f.env,fetchImpl:f.fetchImpl});
  for(const bad of ['header.payload.signature',signed({iss:'https://evil.cloudflareaccess.com'}),
   signed({aud:['2'.repeat(64)]}),signed({exp:1}),signed({type:'meta'}),signed({sub:'',email:''})]){
     assert.equal(await v(bad),false);
  }
});
test('rejects tampered tokens and enforces optional owner email allowlist',async()=>{
  const f=fixture();
  const v=createAccessVerifier({env:{...f.env,STAR_ACCESS_ALLOWED_EMAILS:'owner@example.test'},fetchImpl:f.fetchImpl});
  assert.equal(await v(signed()),true);
  assert.equal(await v(signed({email:'attacker@example.test'})),false);
  const token=signed();
  const [h,p,s]=token.split('.');
  assert.equal(await v([h,p,'A'+s.slice(1)].join('.')),false);
});
test('Gateway accepts a verified Access JWT without leaking sensitive routes, but no anonymous traffic',async()=>{
  const f=fixture(),gateway=createGateway({env:f.env,fetchImpl:f.fetchImpl});
  const request=auth=>new Request('http://localhost:8080/v1/models',{headers:auth?{authorization:'Bearer '+auth}:{}});
  assert.equal((await gateway(request(null))).status,401);
  const response=await gateway(request(signed()));
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).data,[]);
});
test('Missing Access config never activates JWT authentication',async()=>{
  const f=fixture(),v=createAccessVerifier({env:{},fetchImpl:f.fetchImpl});
  assert.equal(await v(signed()),false);
  assert.equal(f.calls.length,0);
});
