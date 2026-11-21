import {handleAgent} from '../../../agent-proxy.js';
export async function onRequestGet(context){return handleAgent(context,'health');}
