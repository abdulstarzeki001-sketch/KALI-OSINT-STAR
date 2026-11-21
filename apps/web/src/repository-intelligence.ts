export const MAX_MANIFEST_SIZE=128000;
export type ManifestKind='package.json'|'requirements.txt'|'requirements-dev.txt';
type Finding={code:string;priority:'high'|'medium'|'info';message:string;line?:number};
type Dependency={name:string;kind:'runtime'|'development'|'optional'|'python';pinned:boolean};
const isObject=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const npmName=/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i;
const pythonName=/^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const npmExact=/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
export function analyzeManifest(kind:ManifestKind,text:string){
 if(!['package.json','requirements.txt','requirements-dev.txt'].includes(kind)||text.length>MAX_MANIFEST_SIZE)throw Error('Unsupported manifest or size limit');
 const findings:Finding[]=[];
 const dependencies:Dependency[]=[];
 const add=(code:string,priority:Finding['priority'],message:string,line?:number)=>findings.push({code,priority,message,...(line===undefined?{}:{line})});
 let scripts=0;
 let testScript=false;
 if(kind==='package.json'){
  const raw:unknown=JSON.parse(text);
  if(!isObject(raw))throw Error('package.json must be an object');
  const groups=[['dependencies','runtime'],['devDependencies','development'],['optionalDependencies','optional']] as const;
  for(const [key,scope] of groups){
   const group=raw[key];
   if(group===undefined)continue;
   if(!isObject(group))throw Error('Invalid dependency group');
   for(const [name,spec] of Object.entries(group)){
    if(!npmName.test(name)||name.length>214||typeof spec!=='string'||spec.length>1024)throw Error('Invalid dependency entry');
    const pinned=npmExact.test(spec);
    dependencies.push({name,kind:scope,pinned});
    if(/^(?:git\+|git:|https?:|file:|link:|github:|gitlab:|bitbucket:)/i.test(spec))add('NON_REGISTRY_SOURCE','medium','Review external or local dependency source and provenance.');
   }
  }
  if(raw.scripts!==undefined){
   if(!isObject(raw.scripts)||Object.values(raw.scripts).some(x=>typeof x!=='string'))throw Error('Invalid scripts object');
   scripts=Object.keys(raw.scripts).length;
   testScript=Object.hasOwn(raw.scripts,'test')&&typeof raw.scripts.test==='string'&&!!raw.scripts.test.trim();
   if(['preinstall','install','postinstall','prepare'].some(k=>Object.hasOwn(raw.scripts as object,k)))add('LIFECYCLE_SCRIPT','medium','Review lifecycle scripts before installation. Script content was not executed.');
  }
  if(!testScript)add('NO_STANDARD_TEST_SCRIPT','info','No standard npm test script detected; custom test commands may exist.');
 }else{
  for(const [i,raw] of text.split(/\r?\n/).entries()){
   const line=raw.trim();
   if(!line||line.startsWith('#'))continue;
   // No includes, URLs, editable installs, credentials, or package manager execution.
   const m=line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[A-Za-z0-9_,.-]+\])?\s*((?:===|==|~=|!=|<=|>=|<|>)\s*[^;#\s]+(?:\s*,\s*(?:===|==|~=|!=|<=|>=|<|>)\s*[^;#\s]+)*)?\s*(?:;[^#]*)?(?:#.*)?$/);
   if(!m||!pythonName.test(m[1])||m[1].length>214){add('UNPARSED_REQUIREMENT','medium','Requirement not parsed; inspect directives or complex sources manually.',i+1);continue}
   const pinned=/^==\s*[A-Za-z0-9][A-Za-z0-9.+!_-]*$/.test(m[2]||'');
   dependencies.push({name:m[1],kind:'python',pinned});
  }
 }
 if(dependencies.length>1000||findings.length>1000)throw Error('Manifest entry limit exceeded');
 const unpinned=dependencies.filter(d=>!d.pinned).length;
 if(unpinned)add('NON_EXACT_SPEC','info','Some version declarations are not exact; inspect lockfiles and resolved versions for reproducibility.');
 return {schema:1 as const,kind,dependencies,counts:{total:dependencies.length,exact:dependencies.length-unpinned,nonExact:unpinned,scripts},findings,limitations:['Manifest-only inspection; no lockfile resolution or CVE lookup.','No installation, code execution, network scan, or source upload.']};
}
