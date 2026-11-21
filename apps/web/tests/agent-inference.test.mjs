import test from 'node:test';
import assert from 'node:assert/strict';
import {handleInference,onRequestGet} from '../functions/api/agent/inference.js';
import {ownerToken,mint,resetCerts} from './access-test-keys.mjs';
const URL='https://kali-osint-star.pages.dev/api/agent/inference';
const AUD='6a7ac1038d19d450d3d2e269bdf713965ea1652797c3ca89bf64feacdc39b367';
test.beforeEach(resetCerts);
function req(jwt,body={prompt:'Choose a bounded tool action from JSON and provide a plan'}){
 return new Request(URL,{method:'POST',headers:{'content-type':'application/json','Cf-Access-Jwt-Assertion':jwt},
   body:JSON.stringify(body)});
}
test('only independently verified linked-app audience may use private inference',async()=>{
 let calls=0;
 const service={fetch:async()=>{calls++;return new Response(JSON.stringify({reply:'{"action":"finish","message":"OK"}',model:'llama'}),{headers:{'content-type':'application/json'}})}};
 const parent=await handleInference({request:req(ownerToken),env:{}},service);
 assert.equal(parent.status,401);
 assert.equal(calls,0);
 const linked=await mint({aud:[AUD]});
 const accepted=await handleInference({request:req(linked),env:{}},service);
 assert.equal(accepted.status,200);
 const data=await accepted.json();
 assert.match(data.reply,/action/);
 assert.equal(calls,1);
});
test('no binding or malformed text returns failure without fabricated AI reply',async()=>{
 const linked=await mint({aud:[AUD]});
 assert.equal((await handleInference({request:req(linked),env:{}},null)).status,503);
 assert.equal((await handleInference({request:req(linked,{prompt:'x'.repeat(5000)}),env:{}},
   {fetch:async()=>{throw Error('must not call');}})).status,413);
 assert.equal((await onRequestGet()).status,405);
});
