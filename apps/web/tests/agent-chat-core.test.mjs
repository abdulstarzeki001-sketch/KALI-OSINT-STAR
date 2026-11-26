import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../../cloudflare/ai-core/worker.mjs';
const URL='https://star-ai-service.internal/chat';
const history=[{role:'user',content:'كيف أبني تطبيق Node.js؟'},{role:'assistant',content:'استخدم Express أو Fastify'},{role:'user',content:'كيف اختبر API؟'}];
function request(data,method='POST'){return new Request(URL,{method,headers:{'Content-Type':'application/json'},body:method==='POST'?JSON.stringify(data):undefined});}
test('four modes accept multiple turns with genuine model response, without tools',async()=>{
 let count=0;
 const AI={run:async(model,p)=>{
  count++;assert.match(model,/70b/);
  assert.equal(p.messages.length,4);
  assert.equal(p.messages.at(-1).role,'user');
  assert.equal(p.messages[0].role,'system');
  assert.equal(p.max_tokens,2100);
  assert.equal(p.stream,undefined);
  return {response:'إجابة نموذج حقيقية من اختبار محاكاة الاستدلال.'};
 }};
 for(const mode of ['general','code','security','agent']){
  const r=await worker.fetch(request({mode,messages:history,temperature:0.4,stream:false}),{AI});
  assert.equal(r.status,200);
  const j=await r.json();assert.equal(j.status,'completed');assert.match(j.reply,/إجابة نموذج/);
 }
 assert.equal(count,4);
});
test('stream returns actual SSE chunks with no caching',async()=>{
 let invoked=0;
 const AI={run:async(_model,p)=>{
  invoked++;
  assert.equal(p.stream,true);
  return new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: {"response":"streamed"}\n\ndata: [DONE]\n\n'));c.close();}});
 }};
 const r=await worker.fetch(request({mode:'agent',messages:history,stream:true}),{AI});
 assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/event-stream/);
 assert.equal(r.headers.get('cache-control'),'no-store');
 assert.match(await r.text(),/streamed/);assert.equal(invoked,1);
});
test('fail closed for secrets, invalid messages, and missing model binding',async()=>{
 let count=0;const AI={run:async()=>{count++;return {response:'should not run'}}};
 for(const data of [
 {mode:'general',messages:[{role:'user',content:'Authorization: Bearer '+('x'.repeat(40))}],stream:false},
 {mode:'general',messages:[{role:'system',content:'not allowed'}],stream:false},
 {mode:'general',messages:[{role:'user',content:'hello'},{role:'assistant',content:'not a user'}],stream:false},
 {mode:'general',messages:[],stream:false}
 ]){
  const r=await worker.fetch(request(data),{AI});assert.equal(r.status,422);
 }
 assert.equal(count,0);
 assert.equal((await worker.fetch(request({mode:'general',messages:history,stream:false}),{})).status,503);
 assert.equal((await worker.fetch(request({},'GET'),{AI})).status,405);
});
test('existing analyzer remains compatible',async()=>{
 const AI={run:async(_model,p)=>{assert.equal(p.max_tokens,1050);return {response:'## ملخص\nالنص يحتاج تحقق مستقل قبل أي إجراء.'};}};
 const r=await worker.fetch(new Request('https://star-ai-service.internal/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({report:'This is a synthetic lab record. Build succeeded but no vulnerability scan was run.',question:'حلل النتائج'})}),{AI});
 assert.equal(r.status,200);assert.equal((await r.json()).status,'completed');
});

test('normalizes real provider reply shapes including structured JSON',async()=>{
 const messages=[{role:'user',content:'Return JSON only'}];
 for(const [result,expected] of [
  [{response:{append:'فقرة جديدة'}},'{"append":"فقرة جديدة"}'],
  [{response:{old:'old',new:'new'},choices:[{message:{content:'{"old":"old","new":"new"}'}}]},'{"old":"old","new":"new"}'],
  [{choices:[{message:{content:'valid choices text'}}]},'valid choices text'],
  [{output:[{content:'legacy output'}]},'legacy output']
 ]){
  const res=await worker.fetch(request({mode:'code',messages,stream:false}),{AI:{run:async()=>result}});
  assert.equal(res.status,200);assert.equal((await res.json()).reply,expected);
 }
 const empty=await worker.fetch(request({mode:'code',messages,stream:false}),{AI:{run:async()=>({response:{}})}});
 assert.equal(empty.status,503);
});
