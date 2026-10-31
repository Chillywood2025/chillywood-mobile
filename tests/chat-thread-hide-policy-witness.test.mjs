import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

const guard=fs.readFileSync('scripts/proof-chat-thread-hide-from-inbox.mjs','utf8').replace(/^#!.*\n/u,'').replace(/^import .*;\n/gmu,'');
function evaluate(from,to){
  const messages=[];
  const filesystem={...fs,readFileSync(file,...args){
    const source=fs.readFileSync(file,...args);
    if(String(file).endsWith('/_lib/chat.ts')&&from){assert.ok(source.includes(from));return source.replace(from,to);}
    return source;
  }};
  let exitCode=0;
  try{vm.runInNewContext(guard,{fs:filesystem,path,process:{cwd:()=>process.cwd(),exit(code){exitCode=code;throw new Error('guard-exit');}},console:{error:m=>messages.push(m),log(){}}});}
  catch(error){if(error.message!=='guard-exit')throw error;}
  return {exitCode,messages};
}
test('hide guard accepts current meaningful microsecond boundary',()=>assert.equal(evaluate().exitCode,0));
for(const [from,to] of [
  ['compareChatActivityTimestamps(lastMessageAt, hiddenAt) <= 0','Date.parse(lastMessageAt) <= hiddenTime'],
  ['compareChatActivityTimestamps(lastMessageAt, hiddenAt) <= 0','compareChatActivityTimestamps(lastMessageAt, hiddenAt) >= 0'],
  ['const lastMessageAt = toText(thread.displayLastActivityAt);','const lastMessageAt = toText(thread.lastMessageAt);'],
])test(`hide guard rejects broken boundary: ${to}`,()=>assert.equal(evaluate(from,to).exitCode,1));
