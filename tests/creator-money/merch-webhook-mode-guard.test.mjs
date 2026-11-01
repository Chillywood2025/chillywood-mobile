import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const guard=readFileSync('scripts/guard-stripe-connect-policy.mjs','utf8')
  .replace(/^#![^\n]*\n/u,'').replace(/^import .*;\n/gmu,'');
const webhook='supabase/functions/stripe-merch-webhook/index.ts';
const migration='supabase/migrations/20261101151506_merch_live_checkout_binding.sql';
function run(file,needle){
  const messages=[];
  const processFixture={cwd:()=>process.cwd(),exitCode:0,
    exit(code=this.exitCode){this.exitCode=code;throw new Error(`guard_exit_${code}`);}};
  const read=(name,...args)=>{
    const text=readFileSync(name,...args);
    return file&&path.resolve(name)===path.resolve(file)?text.replace(needle,'removed_by_negative_control'):text;
  };
  try {
    new Function('readFileSync','path','process','console',guard)(read,path,processFixture,
      {log(){},error(message){messages.push(message);}});
  } catch(error) {
    if(error.message!=='guard_exit_1')throw error;
  }
  return {exitCode:processFixture.exitCode,messages};
}
test('actual Stripe guard accepts exact signed test/live lanes and retains legacy no-entitlement checks',()=>{
  assert.deepEqual(run(),{exitCode:0,messages:[]});
});
for(const [file,needle] of [
  [webhook,'Number(testVerified) + Number(liveVerified) !== 1'],
  [webhook,'event.livemode !== liveVerified'],
  [webhook,'object?.livemode !== liveVerified'],
  [webhook,'const environment = liveVerified ? "production" : "sandbox"'],
  [migration,"p_facts->'object_livemode' is distinct from p_facts->'event_livemode'"],
  [migration,"p_facts->>'verified_environment' is distinct from v_environment"],
  [migration,"b.environment=v_environment and b.account_id=p_facts->>'provider_account_id'"],
])test(`actual guard rejects removal of ${needle}`,()=>{
  assert.ok(readFileSync(file,'utf8').includes(needle));
  const result=run(file,needle);assert.equal(result.exitCode,1);assert.ok(result.messages.length>0);
});
