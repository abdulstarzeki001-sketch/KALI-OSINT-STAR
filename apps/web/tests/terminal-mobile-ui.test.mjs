import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const panel=readFileSync(new URL('../src/CloudTerminalPanel.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/cloud-terminal.css',import.meta.url),'utf8');
test('iPhone shell keys exist and cannot run without ready WebSocket',()=>{
 assert.match(panel,/function sendTerminalKey\(data:string\)/);
 assert.match(panel,/!readyRef.current\|\|status!=='ready'/);
 assert.match(panel,/ws\?\.readyState!==WebSocket.OPEN/);
 for(const key of ['Tab','سهم للأعلى','سهم للأسفل','سهم لليسار','سهم لليمين','Escape'])
  assert.ok(panel.includes('aria-label="'+key+'"'));
 assert.match(css,/\.star-terminal-mobile-keys/);
 assert.match(css,/@media\(max-width:900px\)/);
});
test('suggested read-only shell commands only populate input and never auto execute',()=>{
 assert.match(panel,/\['pwd','ls -la','git status --short'\]\.map/);
 assert.match(panel,/onClick=\{\(\)=>setCommand\(cmd\)\}/);
 assert.doesNotMatch(panel,/onClick=\{\(\)=>sendCommand\(cmd\)\}/);
 assert.match(panel,/status!=='ready'/);
});
test('terminal connection still requires explicit session creation',()=>{
 assert.match(panel,/async function beginConnection\(\)/);
 assert.match(panel,/onClick=\{\(\)=>void beginConnection\(\)\}/);
 assert.match(panel,/TERM_PATH\+'\/session'/);
});
