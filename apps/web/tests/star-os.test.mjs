import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const main=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
const os=readFileSync(new URL('../src/StarOSPanel.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/star-os.css',import.meta.url),'utf8');
test('OS route is reachable through desktop and iPhone navigation',()=>{
 assert.match(main,/type Page = 'os'\|/);
 assert.match(main,/id:'os',label:'STAR AI OS'/);
 assert.match(main,/page==='os'&&/);
 assert.match(main,/mobile-nav/);
 assert.match(main,/'os','dashboard'/);
});
test('six working modules route to real existing screens',()=>{
 for(const page of ['agent','runtime','terminal','cyber','ai','operations']){
  assert.match(os,new RegExp("id:'"+page+"'"));
  assert.match(main,new RegExp("page==='"+page+"'"));
 }
});
test('read-only probes are same-origin, authenticated, and not a fake online flag',()=>{
 assert.match(os,/fetch\(url,\{credentials:'same-origin',cache:'no-store'/);
 assert.match(os,/\/api\/agent\/health/);
 assert.match(os,/\/api\/ai\/cyber/);
 assert.match(os,/body\?\.ok!==true/);
 assert.match(os,/401\|\|response\.status===403/);
 assert.doesNotMatch(os,/localStorage|Authorization.*Bearer|VITE_.*KEY/);
});
test('mobile layout and accessible status are explicit',()=>{
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(os,/aria-live="polite"/);
 assert.match(os,/aria-label="STAR AI OS"/);
});
