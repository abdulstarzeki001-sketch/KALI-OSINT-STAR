import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectService,runHealthChecks,markdownSummary,SERVICES} from '../../../scripts/check-star-health.mjs';

const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
const agent={ok:true,service:'star-agent-cpu',live_inference_tested:true,model_probe:{state:'ok'}};
const gateway={status:'ok',service:'star-ai-minis-v2'};

test('checks pinned endpoints with no credentials or redirects',async()=>{
 const seen=[];
 const result=await runHealthChecks(async(url,opts)=>{
  seen.push({url,opts});
  return json(url.includes('star-agent-runner')?agent:gateway);
 },0);
 assert.equal(result.ok,true);
 assert.equal(seen.length,2);
 for(const call of seen){
  assert.equal(call.opts.method,'GET');
  assert.equal(call.opts.redirect,'manual');
  assert.equal(call.opts.headers.authorization,undefined);
  assert.ok(SERVICES.some(s=>s.url===call.url));
 }
 assert.match(markdownSummary(result),/PASS/);
});
test('an agent health response without verified inference fails',async()=>{
 const result=await inspectService(SERVICES[0],async()=>json({...agent,live_inference_tested:false,model_probe:{state:'failed'}}));
 assert.equal(result.ok,false);
 assert.equal(result.reason,'agent_model_probe_not_verified');
});
test('403, redirects and non-JSON cannot appear healthy',async()=>{
 for(const status of [302,403,502]){
  const result=await inspectService(SERVICES[1],async()=>new Response('',{status}));
  assert.equal(result.ok,false);
  assert.equal(result.reason,'http_'+status);
 }
 const bad=await inspectService(SERVICES[1],async()=>new Response('<html>login</html>',{
  status:200,headers:{'content-type':'text/html'}
 }));
 assert.equal(bad.ok,false);
 assert.equal(bad.reason,'non_json');
});
test('log output never leaks exception messages or credentials',async()=>{
 const bad=await runHealthChecks(async()=>{throw Error('Bearer PRODUCTION_SECRET');},0);
 assert.equal(bad.ok,false);
 assert.doesNotMatch(markdownSummary(bad),/Bearer|PRODUCTION_SECRET/);
});
