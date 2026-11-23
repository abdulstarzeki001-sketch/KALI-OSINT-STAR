import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleChatPost} from '../functions/api/ai/chat.js';
import {ownerToken,resetCerts} from './access-test-keys.mjs';

const CHAT_ENDPOINT='https://kali-osint-star.pages.dev/api/ai/chat';
const msgs=[{role:'user',content:'Review this synthetic code snippet for reliability.'}];
function input(model='star-ai-auto'){
 return new Request(CHAT_ENDPOINT,{method:'POST',headers:{'content-type':'application/json','Cf-Access-Jwt-Assertion':ownerToken},
   body:JSON.stringify({model,mode:'code',stream:true,messages:msgs})});
}
test.beforeEach(resetCerts);
test('auto prefers private Qwen and does not forward to Cloudflare on success',async()=>{
 let cloud=0,privateCalls=0;
 const env={STAR_AI:{fetch(){cloud++;throw Error('must not call Cloudflare')}}};
 const r=await handleChatPost({request:input(),env},async()=>{
  privateCalls++;
  return new Response('data: {"choices":[{"delta":{"content":"Qwen"}}]}\n\ndata: [DONE]\n\n',
   {status:200,headers:{'content-type':'text/event-stream'}});
 });
 assert.equal(r.status,200);
 assert.equal(r.headers.get('x-star-used-model'),'qwen3-coder-vast');
 assert.equal(privateCalls,1);assert.equal(cloud,0);
 assert.match(await r.text(),/Qwen/);
});
test('auto transparently falls back to Cloudflare on private 503 before stream',async()=>{
 let cloud=0,privateCalls=0;
 const env={STAR_AI:{async fetch(url,options){
  cloud++;assert.equal(url,'https://star-ai-service.internal/chat');
  const body=JSON.parse(options.body);assert.equal(body.mode,'code');
  return new Response('data: {"response":"Cloud answer"}\n\ndata: [DONE]\n\n',
   {status:200,headers:{'content-type':'text/event-stream'}});
 }}};
 const r=await handleChatPost({request:input(),env},async()=>{
  privateCalls++;return new Response('unavailable',{status:503});
 });
 assert.equal(r.status,200);
 assert.equal(r.headers.get('x-star-used-model'),'llama-cloudflare');
 assert.equal(cloud,1);assert.equal(privateCalls,1);
 assert.match(await r.text(),/Cloud answer/);
});
test('auto still enforces Cloudflare Access and never forwards unsigned requests',async()=>{
 let called=0;
 const req=new Request(CHAT_ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({model:'star-ai-auto',mode:'general',stream:true,messages:msgs})});
 const r=await handleChatPost({request:req,env:{STAR_AI:{fetch(){called++;}}}},async()=>{called++;});
 assert.equal(r.status,401);assert.equal(called,0);
});
test('chat parser handles either stream format and tells user about failover',()=>{
 const client=readFileSync(new URL('../src/AgentChatPanel.tsx',import.meta.url),'utf8');
 assert.match(client,/const privatePart=event\.choices/);
 assert.match(client,/const cloudPart=event\.response/);
 assert.match(client,/x-star-used-model/);
 assert.match(client,/قد تُرسل رسائلك إلى Cloudflare Llama/);
 assert.match(client,/CHAT_MODELS\.map/);
});
