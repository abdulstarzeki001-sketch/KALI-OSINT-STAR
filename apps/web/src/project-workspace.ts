export const MAX_SOURCE_BYTES=96000;
export const MAX_WORKSPACE_FILES=12;
export const MAX_LINES=600;
export type WorkspaceFile={name:string;original:string;draft:string};
export type DiffLine={kind:'same'|'add'|'remove';text:string;oldLine?:number;newLine?:number};
const allowed=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}\.(?:py|ts|tsx|js|jsx|mjs|json|md|txt|css|html|yaml|yml|toml)$/i;
export function validateFile(name:string,text:string){
 if(!allowed.test(name)||/^(?:\.env|credentials|secrets?|id_rsa|id_ed25519)(?:[._-]|$)/i.test(name)||/\.(?:pem|key|p12|pfx)(?:\.|$)/i.test(name))throw Error('Unsupported filename');
 if(new TextEncoder().encode(text).length>MAX_SOURCE_BYTES||text.includes('\u0000')||split(text).length>MAX_LINES)throw Error('Source limit exceeded');
}
function split(s:string):string[]{return s===''?[]:s.split('\n');}
export function addFile(files:WorkspaceFile[],name:string,text:string):WorkspaceFile[]{
 validateFile(name,text);
 if(files.length>=MAX_WORKSPACE_FILES||files.some(f=>f.name.toLowerCase()===name.toLowerCase()))throw Error('File limit or duplicate name');
 return [...files,{name,original:text,draft:text}];
}
export function editFile(files:WorkspaceFile[],name:string,draft:string):WorkspaceFile[]{
 validateFile(name,draft);
 if(!files.some(f=>f.name===name))throw Error('Unknown file');
 return files.map(f=>f.name===name?{...f,draft}:f);
}
export function diffLines(original:string,draft:string):DiffLine[]{
 validateFile('source.txt',original);validateFile('source.txt',draft);
 const a=split(original),b=split(draft),w=b.length+1;
 const dp=new Uint16Array((a.length+1)*w);
 for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--){
  dp[i*w+j]=a[i]===b[j]?1+dp[(i+1)*w+j+1]:Math.max(dp[(i+1)*w+j],dp[i*w+j+1]);
 }
 const out:DiffLine[]=[];let i=0,j=0;
 while(i<a.length||j<b.length){
  if(i<a.length&&j<b.length&&a[i]===b[j]){out.push({kind:'same',text:a[i],oldLine:i+1,newLine:j+1});i++;j++;}
  else if(i<a.length&&(j===b.length||dp[(i+1)*w+j]>=dp[i*w+j+1])){out.push({kind:'remove',text:a[i],oldLine:i+1});i++;}
  else{out.push({kind:'add',text:b[j],newLine:j+1});j++;}
 }
 return out;
}
export function summarizeFile(file:WorkspaceFile){
 const lines=diffLines(file.original,file.draft);
 return {name:file.name,changed:file.original!==file.draft,added:lines.filter(l=>l.kind==='add').length,removed:lines.filter(l=>l.kind==='remove').length};
}
export function workspaceReport(files:WorkspaceFile[]){
 return {schema:1,source:'local-workspace-comparison',files:files.map(summarizeFile),testsExecuted:false,limitations:'Line comparison only. No code execution, test execution or remote repository verification.'};
}
