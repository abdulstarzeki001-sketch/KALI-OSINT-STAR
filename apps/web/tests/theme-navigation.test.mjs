import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const main=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
const theme=readFileSync(new URL('../src/github-unified.css',import.meta.url),'utf8');
test('GitHub STAR CYBER design is applied to the Cloudflare React shell',()=>{
 assert.match(main,/app-github-theme/);
 assert.match(main,/STAR<span> \/ <\/span>CYBER/);
 assert.match(theme,/--bg:#080e17/);
 assert.match(theme,/--mint:#69dec7/);
 assert.match(main,/hero-art/);
 assert.match(main,/radar-ring/);
});
test('GitHub navigation sections and Cloudflare functions remain reachable',()=>{
 for(const id of ['dashboard','tools','platforms','labs','workflows','reports','roadmap','operations','terminal','ai','agent','settings']){
  assert.match(main,new RegExp("id:'"+id+"'"));
  assert.match(main,new RegExp("page==='"+id+"'"));
 }
 assert.match(main,/CloudTerminalPanel/);
 assert.match(main,/StarAIPanel/);
 assert.match(main,/AgentChatPanel/);
 assert.match(main,/ToolOpsController/);
 assert.match(main,/aria-expanded={menu}/);
 assert.match(main,/sidebar-backdrop/);
});
test('training links are real external destinations with safe new-tab attributes',()=>{
 assert.match(main,/href={x.link}/);
 assert.match(main,/rel="noopener noreferrer"/);
});
