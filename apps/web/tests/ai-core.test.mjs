import {test} from 'node:test';
import assert from 'node:assert/strict';
import core from '../../../cloudflare/ai-core/worker.mjs';
function request(report,question='حلل التقرير'){
 return new Request('https://star-ai-service.internal/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({report,question})});
}
const ci='CI GitHub Actions: Vite build succeeded, pytest 14 passed, JS bundle 539.96 kB, and no vulnerability scanner output.';
test('CI outputs a deterministic evidence disclaimer and the model is constrained',async()=>{
 let calls=0;
 const AI={run:async(model,payload)=>{calls++;assert.match(model,/70b/);assert.match(payload.messages[0].content,/لا تساو نجاح اختبار CI/);return {response:'## أدلة مؤكدة\nنجح البناء، وحجم JS أكبر من الميزانية، والتحسين يحتاج تحقق من نتائج الأداء.'}}};
 const r=await core.fetch(request(ci),{AI});
 assert.equal(r.status,200);assert.equal(calls,1);
 const j=await r.json();assert.equal(j.status,'completed');assert.match(j.analysis,/ليس تقرير فحص ثغرات/);
 assert.match(j.analysis,/## أدلة مؤكدة/);assert.equal(r.headers.get('cache-control'),'no-store');
});
test('secrets are rejected before inference',async()=>{
 let calls=0;const AI={run:async()=>{calls++;return {response:'unexpected'}}};
 const r=await core.fetch(request('CI log Authorization: Bearer '+('x'.repeat(40))+' build success.'),{AI});
 assert.equal(r.status,422);assert.equal(calls,0);
});
test('invalid JSON or method fails closed',async()=>{
 const AI={run:async()=>({response:'unused'})};
 const invalid=await core.fetch(new Request('https://internal.example/analyze',{method:'POST',headers:{'content-type':'application/json'},body:'{broken'}),{AI});
 assert.equal(invalid.status,400);
 const get=await core.fetch(new Request('https://internal.example/analyze'),{AI});
 assert.equal(get.status,404);
});
test('missing AI binding fails closed',async()=>{
 const r=await core.fetch(request(ci),{});
 assert.equal(r.status,503);
});
