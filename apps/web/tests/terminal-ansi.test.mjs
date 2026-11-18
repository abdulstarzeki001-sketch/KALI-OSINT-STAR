import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import headless from '@xterm/headless';
const {Terminal}=headless;

function feed(terminal,data){
  return new Promise(resolve=>terminal.write(data,resolve));
}
function visible(terminal){
  const buffer=terminal.buffer.active;
  const lines=[];
  for(let i=0;i<buffer.length;i++){
    const line=buffer.getLine(i);
    if(line)lines.push(line.translateToString(true));
  }
  return lines.join('\n');
}

test('real terminal parses screenshot ANSI colors, cursor escapes and bracketed paste',async()=>{
  const terminal=new Terminal({cols:115,rows:16,scrollback:40,allowProposedApi:true});
  try {
    const fixture='\x1b[?2004h\x1b[1;38;2;73;174;230m┌──(\x1b[1;38;2;94;189;171mtuser@railway\x1b[0m)-[~]\r\n'
      +'\x1b[1;38;2;94;189;171m└─$\x1b[0m sudo apt update\r\n'
      +'Reading package lists... Done\r\n';
    await feed(terminal,fixture);
    const displayed=visible(terminal);
    assert.match(displayed,/tuser@railway/);
    assert.match(displayed,/sudo apt update/);
    assert.match(displayed,/Reading package lists\.\.\. Done/);
    assert.doesNotMatch(displayed,/\x1b|38;2;|\?2004h|\[0m/);
  } finally {terminal.dispose();}
});

test('carriage returns overwrite progress in the viewport rather than printing raw control characters',async()=>{
  const terminal=new Terminal({cols:100,rows:8,allowProposedApi:true});
  try {
    await feed(terminal,'Reading state information... 0%\rReading state information... 100%\r\n');
    const text=visible(terminal);
    assert.match(text,/Reading state information\.\.\. 100%/);
    assert.doesNotMatch(text,/\r/);
  }finally{terminal.dispose();}
});

test('native terminal renders PTY output with xterm, fits dimensions and preserves keyboard controls',()=>{
  const src=readFileSync(new URL('../src/CloudTerminalPanel.tsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/cloud-terminal.css',import.meta.url),'utf8');
  assert.match(src,/import \{Terminal\} from '@xterm\/xterm'/);
  assert.match(src,/import \{FitAddon\} from '@xterm\/addon-fit'/);
  assert.match(src,/terminalRef\.current\?\.write\(data\)/);
  assert.match(src,/new Terminal\(/);
  assert.match(src,/new FitAddon\(/);
  assert.match(src,/addon\.fit\(\)/);
  assert.match(src,/term\.onData\(data=>/);
  assert.match(src,/data:command\+'\\r'/);
  assert.match(src,/type:'resize',cols:term\.cols,rows:term\.rows/);
  assert.match(src,/term\.selectAll\(\)/);
  assert.match(src,/term\.getSelection\(\)/);
  assert.match(css,/\.star-terminal-output \.xterm-viewport/);
  assert.doesNotMatch(src,/<pre ref=\{outputElement\}/);
  assert.doesNotMatch(src,/setOutput\(/);
});
