// One bounded inference test after Tailscale enrollment. No secrets, URLs,
// raw provider responses, or prompts are ever written to the deployment logs.
export async function qwenStartupProbe({env,fetchImpl,timeoutMs=100_000}){
  if(env.STAR_TAILNET_STATE!=='enrolled'||!env.STAR_TAILNET_OLLAMA_URL){
    return 'skipped';
  }
  const endpoint=env.STAR_TAILNET_OLLAMA_URL.replace(/\/$/,'')+'/chat/completions';
  const body={
    model:'qwen3-coder:30b',
    messages:[{role:'user',content:'Health check: respond with STAR_QWEN_ONLINE.'}],
    stream:false,
    temperature:0,
    max_tokens:64
  };
  try{
    const response=await fetchImpl(endpoint,{
      method:'POST',
      headers:{'content-type':'application/json','authorization':'Bearer ollama'},
      body:JSON.stringify(body),
      signal:AbortSignal.timeout(timeoutMs),
      redirect:'error'
    });
    if(!response.ok)return 'http_'+response.status;
    if(!(response.headers.get('content-type')||'').includes('application/json'))
      return 'invalid_content_type';
    const data=await response.json();
    const answer=data?.choices?.[0]?.message?.content;
    return typeof answer==='string'&&answer.trim()?'ok':'no_answer';
  }catch(error){
    return error?.name==='TimeoutError'||error?.name==='AbortError'?'timeout':'network_error';
  }
}

// Separate network/catalog reachability from generation. Never log upstream URLs or model lists.
export async function qwenConnectivityProbe({env,fetchImpl,timeoutMs=12000}){
 if(env.STAR_TAILNET_STATE!=='enrolled'||!env.STAR_TAILNET_OLLAMA_URL)return 'skipped';
 const endpoint=env.STAR_TAILNET_OLLAMA_URL.replace(/\/$/,'')+'/models';
 try{
  const response=await fetchImpl(endpoint,{method:'GET',headers:{accept:'application/json',authorization:'Bearer ollama'},signal:AbortSignal.timeout(timeoutMs),redirect:'error'});
  if(!response.ok)return 'http_'+response.status;
  if(!(response.headers.get('content-type')||'').includes('application/json'))return 'invalid_content_type';
  const data=await response.json();
  if(!Array.isArray(data?.data))return 'invalid_catalog';
  return data.data.some(x=>x?.id==='qwen3-coder:30b')?'model_present':'model_missing';
 }catch(error){
  return error?.name==='TimeoutError'||error?.name==='AbortError'?'timeout':'network_error';
 }
}
export async function qwenReleaseProbe(config,report){
 const start=Date.now();
 const connectivity=await qwenConnectivityProbe(config);
 report('catalog',connectivity,Date.now()-start);
 if(connectivity!=='model_present'){report('inference','skipped',0);return;}
 const inferenceStart=Date.now();
 const outcome=await qwenStartupProbe(config);
 report('inference',outcome,Date.now()-inferenceStart);
}
