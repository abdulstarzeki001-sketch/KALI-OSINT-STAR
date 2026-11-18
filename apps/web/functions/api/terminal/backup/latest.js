import {handleTerminalFunction} from '../../../../terminal-bridge.js';
export async function onRequestPost(context){return handleTerminalFunction(context,'backup/latest');}
