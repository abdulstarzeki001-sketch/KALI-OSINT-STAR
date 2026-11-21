import test from 'node:test';
import assert from 'node:assert/strict';
import {deepAudit,toSarif,deepAuditLimits} from '../deep-audit.mjs';
import {createGateway} from '../gateway.mjs';

const SECRET='top-secret-long-password-value';
const TOKEN='a-valid-test-gateway-token-at-least-32-chars';
const ENV={STAR_GATEWAY_TOKEN:TOKEN,STAR_MODELS_JSON:'[]'};

test('multi-file audit provides line, CWE and remediation but no secret-bearing snippets',()=>{
  const result=deepAudit([
    {path:'src/app.js',content:'const password="'+SECRET+'";\neval(input);\ndocument.querySelector("#output").innerHTML = requestHtml;'},
    {path:'src/check.py',content:'import subprocess\nsubprocess.run(cmd, shell=True)\nyaml.load(data)'},
    {path:'Dockerfile',content:'FROM node:22\nUSER root\nRUN chmod 777 /app'},
    {path:'.github/workflows/security.yml',content:'name: security\non:\n  pull_request_target:\n'}
  ]);
  assert.equal(result.summary.files_analyzed,4);
  assert.equal(result.summary.rules_available,26);
  assert.ok(result.summary.findings>=6);
  assert.ok(result.findings.some(x=>x.id==='STAR-001'&&x.path==='src/app.js'&&x.line===1));
  assert.ok(result.findings.some(x=>x.id==='STAR-004'&&x.path==='src/check.py'&&x.line===2));
  assert.ok(result.findings.some(x=>x.id==='STAR-015'&&x.path==='Dockerfile'&&x.line===2));
  assert.ok(result.findings.every(x=>x.cwe.startsWith('CWE-')&&x.recommendation));
  assert.equal(JSON.stringify(result).includes(SECRET),false);
  assert.ok(result.summary.risk_priority_score>0);
  assert.equal(deepAuditLimits.ruleCount,26);
});

test('SARIF 2.1.0 contains stable relative paths, line numbers, rules and no source secrets',()=>{
  const report=deepAudit([{path:'src/app.py',content:'password="'+SECRET+'"\nyaml.load(source)'}]);
  const sarif=toSarif(report);
  assert.equal(sarif.version,'2.1.0');
  assert.ok(sarif.runs[0].tool.driver.rules.length>=1);
  assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri,'src/app.py');
  assert.ok(sarif.runs[0].results[0].partialFingerprints.primaryLocationLineHash);
  assert.equal(JSON.stringify(sarif).includes(SECRET),false);
});

test('rejects traversal, secret file, duplicate and excessive input before scanning',()=>{
 for(const files of [
  [{path:'../etc/passwd',content:'content'}],
  [{path:'.env',content:'password="'+SECRET+'"'}],
  [{path:'same.js',content:'eval(x)'},{path:'same.js',content:'eval(y)'}],
  [{path:'too-big.py',content:'z'.repeat(16001)}],
  Array.from({length:9},(_,i)=>({path:'src/'+i+'.js',content:'eval(a)'}))
 ])assert.throws(()=>deepAudit(files));
});

test('comments are excluded, findings are stable across repeated scans',()=>{
 const files=[{path:'main.ts',content:'// eval("ignored")\nconst data=eval(request)\n'}];
 const a=deepAudit(files),b=deepAudit(files);
 assert.deepEqual(a,b);
 assert.equal(a.findings.filter(x=>x.id==='STAR-003').length,1);
 assert.equal(a.findings.find(x=>x.id==='STAR-003').line,2);
});

test('authenticated Railway gateway produces genuine JSON or SARIF without an LLM',async()=>{
 let providers=0;
 const handler=createGateway({env:ENV,fetchImpl:async()=>{providers++;throw Error('No provider should be used');}});
 function req(payload,key=TOKEN){
  return new Request('http://localhost:8080/v1/security/deep-audit',{
   method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},
   body:JSON.stringify(payload)
  });
 }
 const files=[{path:'src/unsafe.py',content:'yaml.load(user_input)'}];
 const json=await handler(req({files}));
 assert.equal(json.status,200);
 assert.ok((await json.json()).findings.some(x=>x.id==='STAR-025'));
 const sarif=await handler(req({files,format:'sarif'}));
 assert.equal((await sarif.json()).version,'2.1.0');
 assert.equal((await handler(req({files},'wrong'))).status,401);
 assert.equal((await handler(req({files:[{path:'../../.env',content:'a b c'}]}))).status,422);
 assert.equal(providers,0);
});

test('capabilities advertise verified limits but no unconfigured inference models',async()=>{
 const handler=createGateway({env:ENV,fetchImpl:async()=>{throw Error('No inference');}});
 const req=new Request('http://localhost:8080/v1/security/capabilities',{headers:{authorization:'Bearer '+TOKEN}});
 const r=await handler(req);
 assert.equal(r.status,200);
 const info=await r.json();
 assert.equal(info.deep_audit,true);
 assert.equal(info.limits.files,8);
});
