import {handleAgent} from '../../../../../agent-proxy.js';
export async function onRequestPost(context){return handleAgent(context,'decide');}
