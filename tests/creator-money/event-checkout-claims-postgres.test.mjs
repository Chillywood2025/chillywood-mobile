import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

test('event checkout claims preserve unknown-payment and current-authority boundaries through full SQL replay',{timeout:600_000},async t=>{
  let stdout;
  try{({stdout}=await promisify(execFile)(process.execPath,['scripts/test-event-checkout-claims-native-postgres.mjs','--pglite'],{timeout:590_000,maxBuffer:8*1024*1024}));}
  catch(error){throw new Error(`${error.stdout??''}\n${error.stderr??error.message}`);}
  assert.match(stdout,/Event checkout claims: \d+ assertions passed; embedded sequential SQL/);
  t.diagnostic(stdout.trim().split('\n').at(-1));
});
