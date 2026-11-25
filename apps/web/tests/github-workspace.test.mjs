import {test} from 'node:test';import assert from 'node:assert/strict';
import {safePath,applyEdit,encodeText,decodeText,github,sensitive} from '../github-workspace.js';
import {handleGitHub} from '../functions/api/ai/github.js';
test('restrict paths to allowed repo files',()=>{assert.ok(safePath('apps/web/src/main.tsx'));for(const p of ['../README.md','.github/workflows/ci.yml','apps/web/src/.env','apps/web/src/secret.ts','services/agent/main.py','apps/web/src/../main.tsx'])assert.equal(safePath(p),false);});
test('requires exact unique edit and valid JSON',()=>{assert.equal(applyEdit('a b c','{"old":"b","new":"x"}'),'a x c');assert.throws(()=>applyEdit('b b','{"old":"b","new":"x"}'));assert.throws(()=>applyEdit('abc','not json'));});
test('UTF8 and credential pattern',()=>{const s='مرحبا 😀';assert.equal(decodeText(encodeText(s)),s);assert.equal(sensitive('-----BEGIN PRIVATE KEY-----'),true);});
test('writes fail without server token',async()=>{await assert.rejects(github({},'/git/refs','POST',{},()=>{throw Error('unexpected fetch')}),/token not configured/);});
test('route denies anonymous and cross origin',async()=>{const base='https://kali-osint-star.pages.dev/api/ai/github';assert.equal((await handleGitHub({request:new Request(base),env:{}},async()=>({ok:false,reason:'ACCESS_REQUIRED'}))).status,401);assert.equal((await handleGitHub({request:new Request(base,{method:'POST',headers:{origin:'https://evil.example'}}),env:{}},async()=>({ok:true}))).status,403);});
