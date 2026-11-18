import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleTerminalFunction} from '../terminal-bridge.js';

const origin='https://kali-osint-star.pages.dev';
const secret='test-only-very-long-internal-bridge-secret-0123456';
function request(path,method='POST',headers={}){
 return new Request(origin+'/api/terminal/'+path,{method,headers});
}
function context(req, fetcher, otherEnv={}){
 return {request:req,env:{
   KALI_TERMINAL_BRIDGE_SECRET:secret,
   WORMSTAR_TERMINAL:{fetch:fetcher},
   ...otherEnv
 }};
}
const jwt={'Cf-Access-Jwt-Assertion':'owner-access-test-assertion',Origin:origin};

test('Cloudflare Access is required before Pages touches private Worker binding',async()=>{
 let called=false;
 const fetcher=async()=>{called=true;return new Response('{}');};
 assert.equal((await handleTerminalFunction(context(request('session'),fetcher),'session')).status,401);
 assert.equal(called,false);
 assert.equal((await handleTerminalFunction(context(request('session','GET',jwt),fetcher),'session')).status,405);
 assert.equal((await handleTerminalFunction(context(request('session','POST',{...jwt,Origin:'https://evil.example'}),fetcher),'session')).status,403);
 assert.equal(called,false);
 const alt=new Request('https://evil.example/api/terminal/session',{method:'POST',headers:jwt});
 assert.equal((await handleTerminalFunction(context(alt,fetcher),'session')).status,403);
 assert.equal((await handleTerminalFunction(context(request('session','POST',jwt),fetcher,{WORMSTAR_TERMINAL:null}),'session')).status,503);
 assert.equal(called,false);
});

test('Pages issues same-origin owner ticket through service binding with secret only upstream',async()=>{
 let received=null;
 const fetcher=async req=>{
   received=req;
   return new Response(JSON.stringify({ticket:'test',expiresInSeconds:20}),{status:200,headers:{'content-type':'application/json'}});
 };
 const response=await handleTerminalFunction(context(request('session','POST',jwt),fetcher),'session');
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{ticket:'test',expiresInSeconds:20});
 assert.equal(received.url,'https://wormstar-ai-lab.abdulstarzeki001.workers.dev/api/integrations/kali/terminal/session');
 assert.equal(received.headers.get('X-Kali-Terminal-Bridge'),secret);
 assert.equal(response.headers.get('X-Kali-Terminal-Bridge'),null);
 assert.equal(response.headers.get('cache-control'),'private, no-store, max-age=0');
});

test('WebSocket requires same-origin browser, Access assertion and signed ticket protocol',async()=>{
 const protocol='wormstar-terminal, ticket.'+'a'.repeat(82);
 let sent=null;
 const fetcher=async req=>{sent=req;return new Response(null,{status:204});};
 const req=headers=>request('ws','GET',headers);
 assert.equal((await handleTerminalFunction(context(req({...jwt,Upgrade:'websocket','Sec-WebSocket-Protocol':protocol,Origin:'https://evil.example'}),fetcher),'ws')).status,403);
 assert.equal((await handleTerminalFunction(context(req({...jwt,Upgrade:'websocket','Sec-WebSocket-Protocol':'bad'}),fetcher),'ws')).status,401);
 assert.equal((await handleTerminalFunction(context(req({...jwt,'Sec-WebSocket-Protocol':protocol}),fetcher),'ws')).status,426);
 assert.equal(sent,null);
 const ok=await handleTerminalFunction(context(req({...jwt,Upgrade:'websocket','Sec-WebSocket-Protocol':protocol}),fetcher),'ws');
 assert.equal(ok.status,204);
 assert.equal(sent.headers.get('Upgrade'),'websocket');
 assert.equal(sent.headers.get('Sec-WebSocket-Protocol'),protocol);
 assert.equal(sent.headers.get('X-Kali-Terminal-Bridge'),secret);
 assert.equal(sent.headers.get('Cf-Access-Jwt-Assertion'),null);
});

test('Backup bytes are only forwarded for bounded, expected .tgz attachments',async()=>{
 const name='star-home-20261118T183000Z-456.tgz';
 const req=request('backup/latest','POST',jwt);
 let response=await handleTerminalFunction(context(req,async()=>
   new Response(new Uint8Array([31,139,8]),{status:200,headers:{
     'Content-Disposition':'attachment; filename="'+name+'"','Content-Length':'3'
   }})),'backup/latest');
 assert.equal(response.status,200);
 assert.equal(response.headers.get('Content-Disposition'),'attachment; filename="'+name+'"');
 assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[31,139,8]);
 response=await handleTerminalFunction(context(req,async()=>
   new Response('abc',{status:200,headers:{
     'Content-Disposition':'attachment; filename="../../etc/passwd"','Content-Length':'3'
   }})),'backup/latest');
 assert.equal(response.status,502);
});

test('Dashboard opens same-origin protected xterm without a separate Railway tab',()=>{
  const root=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
  assert.match(root,/className="terminal-launch page-animate"/);
  assert.match(root,/فتح الترمنال المدمج/);
  assert.match(root,/onClick=\{\(\)=>navigate\('terminal'\)\}/);
  assert.match(root,/STAR CLOUD/);
  assert.match(root,/الترمنال السحابي متاح من تبويبه/);
  assert.match(css,/\.terminal-launch\{/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(root,/<CloudTerminalPanel\/>/);
  assert.doesNotMatch(root,/<iframe/);
  assert.doesNotMatch(root,/https:\/\/terminal-production-fb16bd35\.up\.railway\.app/);
});

test('native React terminal is linked to hash navigation, not a public Railway iframe',()=>{
 const root=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
 const cloud=readFileSync(new URL('../src/CloudTerminalPanel.tsx',import.meta.url),'utf8');
 const ops=readFileSync(new URL('../src/OperationsPanel.tsx',import.meta.url),'utf8');
 assert.match(root,/id:'terminal',label:'الترمنال'/);
 assert.match(root,/<CloudTerminalPanel\/>/);
 assert.match(ops,/href="#terminal"/);
 assert.match(cloud,/new WebSocket\(url\.toString\(\)/);
 assert.match(cloud,/\/api\/terminal/);
 assert.doesNotMatch(cloud,/<iframe/);
 assert.doesNotMatch(cloud,/TERMINAL_RAILWAY_PASSWORD/);
 for(const path of ['session.js','ws.js','diagnose.js','backup/latest.js']){
   const data=readFileSync(new URL('../functions/api/terminal/'+path,import.meta.url),'utf8');
   assert.match(data,/handleTerminalFunction/);
 }
});

test('training status and grading use Access-bound same-origin Pages Functions',async()=>{
 const payload=JSON.stringify({week:'W02',answers:{a:'3',b:'AdminTo'}});
 const trainingReq=new Request(origin+'/api/terminal/training/verify',{
   method:'POST',headers:{...jwt,'Content-Type':'application/json'},body:payload
 });
 let upstream=null;
 const fetcher=async req=>{
   upstream=req;
   return new Response(JSON.stringify({passed:true,score:100,summary:{schema:1,completed:1,total:8}}),{status:200});
 };
 assert.equal((await handleTerminalFunction(context(request('training/status'),fetcher),'training/status')).status,401);
 assert.equal(upstream,null);
 const denied=new Request(origin+'/api/terminal/training/verify',{method:'POST',body:payload});
 assert.equal((await handleTerminalFunction(context(denied,fetcher),'training/verify')).status,401);
 assert.equal(upstream,null);
 const result=await handleTerminalFunction(context(trainingReq,fetcher),'training/verify');
 assert.equal(result.status,200);
 assert.equal((await result.json()).score,100);
 assert.equal(upstream.url,'https://wormstar-ai-lab.abdulstarzeki001.workers.dev/api/integrations/kali/terminal/training/verify');
 assert.equal(await upstream.text(),payload);
 assert.equal(upstream.headers.get('X-Kali-Terminal-Bridge'),secret);
 assert.equal(result.headers.get('X-Kali-Terminal-Bridge'),null);
 const status=await handleTerminalFunction(context(request('training/status','POST',jwt),fetcher),'training/status');
 assert.equal(status.status,200);
 assert.equal(upstream.url,'https://wormstar-ai-lab.abdulstarzeki001.workers.dev/api/integrations/kali/terminal/training/status');
});
test('training routes reject oversized, cross-origin and invalid JSON submissions',async()=>{
 let called=false;
 const fetcher=async()=>{called=true;return new Response('{}');};
 const req=(body,headers=jwt)=>new Request(origin+'/api/terminal/training/verify',{
   method:'POST',headers,body
 });
 assert.equal((await handleTerminalFunction(context(req('{invalid-json'),fetcher),'training/verify')).status,400);
 assert.equal((await handleTerminalFunction(context(req('X'.repeat(2500)),fetcher),'training/verify')).status,413);
 assert.equal((await handleTerminalFunction(context(req('{}',{...jwt,Origin:'https://evil.example'}),fetcher),'training/verify')).status,403);
 assert.equal(called,false);
 const src=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
 const panel=readFileSync(new URL('../src/TrainingPanel.tsx',import.meta.url),'utf8');
 assert.match(src,/<TrainingPanel onProgress=\{setTrainingProgress\}/);
 assert.doesNotMatch(src,/setDone\(/);
 assert.doesNotMatch(src,/stored<number\[\]>\('kos-weeks'/);
 assert.match(panel,/star-training/);
 assert.match(panel,/TRAINING_RUNTIME_NOT_READY/);
 assert.match(panel,/score:100|score:number/);
 for(const name of ['status.js','verify.js']){
   assert.match(readFileSync(new URL('../functions/api/terminal/training/'+name,import.meta.url),'utf8'),/handleTerminalFunction/);
 }
});
