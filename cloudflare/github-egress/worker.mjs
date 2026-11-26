// Private service binding only. No public routes, no stored token, no arbitrary upstream.
const REPO='/repos/abdulstarzeki001-sketch/KALI-OSINT-STAR';
const allowedPath=p=>p===REPO||p.startsWith(REPO+'/');
const json=(value,status)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
export default {async fetch(request){
 const u=new URL(request.url);
 if(u.origin!=='https://star-github-egress.internal'||!allowedPath(u.pathname)||!['GET','POST','PUT'].includes(request.method))return json({error:'Restricted bridge'},403);
 const suffix=u.pathname.slice(REPO.length);
 const contents=/^\/contents\/(?:README\.md|(?:apps\/web\/(?:src|tests)|docs)\/[A-Za-z0-9_.%/-]+)$/;
 const safeContents=contents.test(suffix)&&!suffix.split('/').some(x=>x==='..'||x==='.')&&!/(secret|credential|token|password|private.key|\.env|%2f|%5c|%2e)/i.test(suffix);
 const readOK=/^\/actions\/runs\/\d+\/jobs$/.test(suffix)||suffix===''||suffix==='/git/ref/heads/main'||/^\/git\/trees\/[a-f0-9]{40}$/.test(suffix)||safeContents||(suffix==='/pulls'&&u.searchParams.get('state')==='open'&&u.searchParams.get('base')==='main'&&/^abdulstarzeki001-sketch:star-ai\/edit-[a-f0-9-]{36}$/.test(u.searchParams.get('head')||''))||/^\/pulls\/\d+(?:\/files)?$/.test(suffix)||/^\/actions\/workflows\/(?:ci|star-ai-quality|star-ai-edit|star-ai-developer-v2)\.yml\/runs$/.test(suffix);
 const writeOK=request.method==='POST'?(suffix==='/git/refs'||suffix==='/pulls'||suffix==='/dispatches'):(safeContents||/^\/pulls\/\d+\/merge$/.test(suffix));
 if(request.method==='GET'?!readOK:!writeOK)return json({error:'Restricted operation'},403);
 const auth=request.headers.get('authorization')||'';
 if(auth&&!/^Bearer (?:github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]+)$/.test(auth))return json({error:'Invalid credential format'},400);
 if(request.method!=='GET'&&!auth)return json({error:'Credential required'},401);
 let body;
 if(request.method!=='GET'){body=await request.text();if(body.length>160000)return json({error:'Body too large'},413);if(suffix==='/dispatches'){let d;try{d=JSON.parse(body);}catch{return json({error:'Invalid dispatch'},400);}if(!['star-ai-approved-edit','star-ai-v2-approved-edit'].includes(d.event_type)||!d.client_payload||!(/^[a-f0-9-]{36}$/).test(d.client_payload.id||''))return json({error:'Restricted dispatch'},403);}}
 try{
  const target='https://api.github.com'+u.pathname+u.search;
  const res=await fetch(target,{method:request.method,redirect:'manual',headers:{'accept':'application/vnd.github+json','user-agent':'STAR-AI-Workspace','x-github-api-version':'2022-11-28',...(auth?{authorization:auth}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body}:{})});
  if(res.status>=300&&res.status<400)return json({error:'Upstream redirect refused'},res.status);
  return new Response(res.body,{status:res.status,headers:{'content-type':res.headers.get('content-type')||'application/json','cache-control':'no-store'}});
 }catch(e){
  const m=String(e?.message||'').toLowerCase();
  const category=m.includes('illegal invocation')?'illegal_invocation':m.includes('dns')?'dns':m.includes('timeout')?'timeout':m.includes('network connection lost')?'connection_lost':m.includes('tls')||m.includes('certificate')?'tls':'other';
  return Response.json({error:'GitHub network failure',category},{status:502,headers:{'cache-control':'no-store','x-star-egress-error':category}});
 }
}};
