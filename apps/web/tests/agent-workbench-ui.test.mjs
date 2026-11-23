import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const panel=readFileSync(new URL('../src/AgentRunnerPanel.tsx',import.meta.url),'utf8');
test('agent workbench can open existing owner tasks, validates 24-hex id',()=>{
 assert.match(panel,/function loadTask\(\)/);
 assert.match(panel,/\^\[a-f0-9\]\{24\}\$/);
 assert.match(panel,/requestAgent\('tasks\/'\+encodeURIComponent\(id\)\)/);
 assert.match(panel,/id="runner-task-lookup"/);
});
test('Minis key identity is not confused with Access owner identity',()=>{
 assert.match(panel,/مهام Minis المستقلة/);
 assert.match(panel,/star-agent-runner-production\.up\.railway\.app/);
 assert.doesNotMatch(panel,/STAR_AGENT_API_KEY|STAR_AGENT_MODEL_KEY/);
});
test('verified model probe is displayed, not inferred from HTTP health alone',()=>{
 assert.match(panel,/live_inference_tested/);
 assert.match(panel,/model_probe\?\.state/);
});
test('critical agent changes still require per-action approval',()=>{
 assert.match(panel,/current\.pending/);
 assert.match(panel,/void decide\(true\)/);
 assert.match(panel,/void decide\(false\)/);
});
