import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGateway} from './gateway.mjs';
import {tailnetProvider} from './tailnet-provider.mjs';
import {qwenStartupProbe} from './qwen-probe.mjs';

let gateway;
let provider;
try {provider=tailnetProvider(process.env);gateway=createGateway(provider);}catch(error) {
  console.error('Gateway configuration invalid:',error.message);
  process.exit(1);
}
const port=Number(process.env.PORT||8080);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
const server=createServer(async(req,res)=>{
  const controller=new AbortController();
  // Incoming request completion is not a disconnect. Abort only on an interrupted body or response socket closure before completion.
  const cancel=()=>controller.abort();
  const close=()=>{if(!res.writableFinished)cancel();};
  req.once('aborted',cancel);res.once('close',close);
  try{
    const method=req.method||'GET';
    const request=new Request('http://localhost:'+port+(req.url||'/'),{
      method,headers:req.headers,signal:controller.signal,
      ...(!['GET','HEAD'].includes(method)?{body:Readable.toWeb(req),duplex:'half'}:{})
    });
    const output=await gateway(request);
    if(controller.signal.aborted||res.destroyed){await output.body?.cancel().catch(()=>{});return;}
    res.writeHead(output.status,Object.fromEntries(output.headers.entries()));
    if(output.body)await pipeline(Readable.fromWeb(output.body),res);
    else res.end();
  }catch{
    if(controller.signal.aborted||res.destroyed)return;
    if(!res.headersSent) {
      res.writeHead(500,{'content-type':'application/json','cache-control':'no-store'});
      res.end('{"error":{"code":"internal_error"}}');
    }else res.destroy();
  }finally{req.removeListener('aborted',cancel);res.removeListener('close',close);}
});
server.listen(port,'0.0.0.0',()=>{
  console.log('STAR AI Cyber Gateway listening on '+port);
  if(provider.env.STAR_TAILNET_STATE==='enrolled'){
    // Does not block the health route or expose private network addresses.
    void qwenStartupProbe(provider)
      .then(status=>console.log('STAR_QWEN_STARTUP_PROBE result='+status))
      .catch(()=>console.log('STAR_QWEN_STARTUP_PROBE result=internal_error'));
  }
});
