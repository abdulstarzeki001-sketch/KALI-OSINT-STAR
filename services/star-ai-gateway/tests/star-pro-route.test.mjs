import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tailnetProvider} from '../tailnet-provider.mjs';

test('private catalog keeps Qwen and registers only the defensive STAR PRO variant', ()=>{
 const env={STAR_TAILNET_OLLAMA_URL:'https://gpu.example.ts.net/v1'};
 const original=JSON.stringify(env);
 const configured=tailnetProvider(env);
 const models=JSON.parse(configured.env.STAR_MODELS_JSON);
 assert.deepEqual(models.map(m=>[m.id,m.upstreamModel]),[
  ['qwen3-coder-vast','qwen3-coder:30b'],
  ['star-pro-vast','star-pro:latest']
 ]);
 assert.equal(models[1].baseUrl,models[0].baseUrl);
 assert.equal(models[1].keyEnv,models[0].keyEnv);
 assert.equal(JSON.stringify(env),original);
});

test('unconfigured private route stays disabled', ()=>{
 const env={};
 assert.equal(tailnetProvider(env).env,env);
});

test('reject non-private provider URL', ()=>{
 assert.throws(()=>tailnetProvider({STAR_TAILNET_OLLAMA_URL:'http://127.0.0.1:11434/v1'}));
});

test('only fixed private model catalog GET and completion POST use the tailnet proxy',async()=>{
 const calls=[];
 const route=tailnetProvider({STAR_TAILNET_OLLAMA_URL:'https://gpu.example.ts.net/v1'},async(url,options)=>{calls.push({url,proxied:!!options.dispatcher});return new Response('{}');});
 await route.fetchImpl('https://gpu.example.ts.net/v1/models',{method:'GET'});
 await route.fetchImpl('https://gpu.example.ts.net/v1/chat/completions',{method:'POST'});
 await route.fetchImpl('https://example.org/v1/models',{method:'GET'});
 assert.deepEqual(calls.map(c=>c.proxied),[true,true,false]);
});
