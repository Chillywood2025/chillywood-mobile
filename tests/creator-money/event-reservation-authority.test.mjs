import test from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
test('scheduled event reservation authority through the complete migration chain', {timeout:600_000}, async()=>{
  let stdout;
  try {({stdout}=await promisify(execFile)(process.execPath,['scripts/test-event-reservations-native-postgres.mjs','--pglite'],
    {timeout:590_000,maxBuffer:8*1024*1024}));}
  catch(error){throw new Error(`${error.stdout??''}\n${error.stderr??error.message}`);}
  assert.match(stdout,/scheduled-event reservations: \d+ assertions passed/);
});
