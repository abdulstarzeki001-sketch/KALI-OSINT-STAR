import {handleTerminalFunction} from '../../../terminal-bridge.js';
export async function onRequestGet(context){return handleTerminalFunction(context,'ws');}
