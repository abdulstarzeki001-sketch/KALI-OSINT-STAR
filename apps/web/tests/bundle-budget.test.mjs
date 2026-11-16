import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import path from 'node:path';
test('deferred STAR AI code stays out of the large initial bundle',()=>{
  const html=readFileSync('dist/index.html','utf8');
  const match=html.match(/src="\/assets\/([^"]+\.js)"/);
  assert.ok(match,'Vite entry is missing');
  const entry=path.join('dist','assets',match[1]);
  const size=statSync(entry).size;
  assert.ok(size<500000,'Entry chunk exceeds 500 kB: '+size);
  const chunks=readdirSync('dist/assets').filter(x=>x.endsWith('.js'));
  assert.ok(chunks.length>=2,'Expected split JS chunks, got: '+chunks.join(','));
});
