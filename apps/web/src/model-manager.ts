export type InstalledModel={name:string;sizeBytes:number|null;parameterSize:string|null;quantization:string|null};
export type LoadedModel={name:string;sizeBytes:number|null;vramBytes:number|null};
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
function text(v:unknown,max:number,nullable=false):string|null{
 if(nullable&&v===null)return null;
 if(typeof v!=='string'||!v.trim()||v.length>max||/[\u0000-\u001f\u007f]/.test(v))throw Error('Invalid model metadata');
 return v;
}
export function parseInstalledModels(input:unknown):InstalledModel[]|null{
 if(input===undefined||input===null)return null;
 if(!Array.isArray(input)||input.length>100)throw Error('Invalid inventory');
 const names=new Set<string>();
 return input.map(m=>{
  if(!obj(m))throw Error('Invalid model');
  const name=text(m.name,160)!;
  if(names.has(name))throw Error('Duplicate model');
  names.add(name);
  if(m.sizeBytes!==null&&(!Number.isSafeInteger(m.sizeBytes)||Number(m.sizeBytes)<0))throw Error('Invalid size');
  return {name,sizeBytes:m.sizeBytes as number|null,parameterSize:text(m.parameterSize,80,true),quantization:text(m.quantization,80,true)};
 });
}
export function modelInventory(installed:InstalledModel[]|null,loaded:LoadedModel[]|null){
 if(installed===null&&loaded===null)return null;
 const entries=new Map<string,{name:string;diskBytes:number|null;loadedBytes:number|null;vramBytes:number|null;parameterSize:string|null;quantization:string|null;installed:boolean|null;loaded:boolean|null}>();
 for(const m of installed??[])entries.set(m.name,{name:m.name,diskBytes:m.sizeBytes,loadedBytes:null,vramBytes:null,parameterSize:m.parameterSize,quantization:m.quantization,installed:true,loaded:loaded===null?null:false});
 for(const m of loaded??[]){
  const previous=entries.get(m.name);
  entries.set(m.name,{name:m.name,diskBytes:previous?.diskBytes??null,loadedBytes:m.sizeBytes,vramBytes:m.vramBytes,parameterSize:previous?.parameterSize??null,quantization:previous?.quantization??null,installed:previous?true:installed===null?null:false,loaded:true});
 }
 return [...entries.values()].sort((a,b)=>Number(b.loaded===true)-Number(a.loaded===true)||a.name.localeCompare(b.name));
}
