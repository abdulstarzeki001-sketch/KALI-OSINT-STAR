import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/CyberAIPanel.tsx',import.meta.url),'utf8');
test('security center supports severity and text finding filters without a new server request',()=>{
 assert.match(source,/severityFilter/);
 assert.match(source,/findingQuery/);
 assert.match(source,/visibleFindings=\(deepReport\?\.findings\|\|\[\]\)\.filter/);
 assert.match(source,/id="cyber-severity-filter"/);
 assert.match(source,/id="cyber-findings-search"/);
 assert.match(source,/visibleFindings\.map/);
});
test('Markdown export contains evidence summaries and does not export raw uploaded source',()=>{
 const start=source.indexOf('function saveMarkdownReport(');
 const end=source.indexOf('export default function CyberAIPanel',start);
 assert.ok(start>=0&&end>start);
 const body=source.slice(start,end);
 assert.match(body,/report\.findings/);
 assert.match(body,/report\.limitation/);
 assert.match(body,/text\/markdown/);
 assert.match(body,/not confirmed vulnerabilities/);
 assert.doesNotMatch(body,/uploadedFiles|scannedFiles|artifact|file\.content/);
});
test('existing JSON and SARIF exports still exist',()=>{
 assert.match(source,/star-cyber-deep-audit\.json/);
 assert.match(source,/star-cyber-deep-audit\.sarif/);
});
