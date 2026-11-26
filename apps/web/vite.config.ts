import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react(),{name:'star-deployment-evidence',generateBundle(){
 const env=(globalThis as {process?:{env?:Record<string,string|undefined>}}).process?.env||{};
 const sha=env.CF_PAGES_COMMIT_SHA||'';
 const valid=/^[a-f0-9]{40}$/.test(sha);
 this.emitFile({type:'asset',fileName:'star-deployment.json',source:JSON.stringify({source:valid?'cloudflare-pages':'unknown',sha:valid?sha:null})});
}}],server:{host:'127.0.0.1',port:5173,proxy:{'/api':'http://127.0.0.1:8000'}}});
