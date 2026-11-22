import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseInstalledModels,modelInventory} from '../src/model-manager.ts';
const installed=[{name:'sample:1b',sizeBytes:1000,parameterSize:'1B',quantization:'Q4_K_M'},{name:'other:2b',sizeBytes:2000,parameterSize:'2B',quantization:null}];
const loaded=[{name:'sample:1b',sizeBytes:1200,vramBytes:900}];
test('merge installed and loaded while keeping storage and memory separate',()=>{
 const r=modelInventory(parseInstalledModels(installed),loaded);
 assert.equal(r[0].diskBytes,1000);assert.equal(r[0].loadedBytes,1200);assert.equal(r[0].vramBytes,900);
 assert.equal(r[1].loaded,false);
});
test('unknown inventory is distinct from known empty inventory',()=>{
 assert.equal(modelInventory(null,null),null);
 assert.deepEqual(modelInventory([],[]),[]);
 assert.equal(modelInventory(null,loaded)[0].installed,null);
 assert.equal(modelInventory(installed,null)[0].loaded,null);
});
test('reject invalid and duplicate entries',()=>{
 for(const v of [[...installed,installed[0]],[{...installed[0],sizeBytes:-1}],[{...installed[0],name:'bad\nname'}],[{...installed[0],quantization:3}],Array(101).fill(installed[0])])assert.throws(()=>parseInstalledModels(v));
});
test('do not retain extraneous provider metadata',()=>{
 const r=parseInstalledModels([{...installed[0],token:'not retained'}]);
 assert.equal(Object.hasOwn(r[0],'token'),false);
});
test('loaded-only model remains visible without claiming disk size',()=>{
 const r=modelInventory([],loaded);
 assert.equal(r[0].loaded,true);assert.equal(r[0].diskBytes,null);assert.equal(r[0].installed,false);
});
test('legacy snapshots preserve unknown inventory',()=>{assert.equal(parseInstalledModels(undefined),null)});
