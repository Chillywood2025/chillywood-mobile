import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('exact pause artifact is atomic, fail closed on alternate grants and preserves new wrapper authority',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,includeHeldStudio:true,implicitApiGrants:false});
 const pause=readFileSync('scripts/operations/merch-checkout-admission-pause.sql','utf8');
 const old='public.reserve_merch_checkout_for_actor_with_tracking(uuid,uuid,uuid,integer,uuid,uuid,text,integer,text)';
 const lower='public.reserve_merch_checkout_for_actor(uuid,uuid,uuid,integer,uuid)';
 const replacement='public.reserve_merch_checkout_dispatch(uuid,uuid,uuid,integer,uuid,uuid,text,integer,text)';
 const allowed=async signature=>(await db.query(`select has_function_privilege('service_role',$1,'EXECUTE') as allowed`,[signature])).rows[0].allowed;
 try{
  await db.exec(`grant execute on function ${old} to service_role;`);
  await db.exec('begin;');
  await assert.rejects(db.exec(pause),/new checkout admission already installed/);
  await db.exec('rollback;');assert.equal(await allowed(old),true);
  await db.exec(`revoke execute on function ${replacement} from service_role;`);
  await db.exec(`grant execute on function ${replacement} to authenticated;`);
  await db.exec('begin;');await assert.rejects(db.exec(pause),/checkout admission remains executable/);
  await db.exec('rollback;');assert.equal(await allowed(old),true);
  await db.exec(`revoke execute on function ${replacement} from authenticated;`);
  await db.exec(`begin;${pause}rollback;`);
  assert.equal(await allowed(old),true);
  await db.exec(`grant execute on function ${lower} to authenticated;`);
  await db.exec('begin;');
  await assert.rejects(db.exec(pause),/checkout admission remains executable/);
  await db.exec('rollback;');assert.equal(await allowed(old),true,'revoke rolled back with failed assertion');
  await db.exec(`revoke execute on function ${lower} from authenticated;begin;${pause}commit;`);
  assert.equal(await allowed(old),false);
  assert.equal(await allowed(replacement),false);
  await db.exec(`begin;${pause}commit;`);assert.equal(await allowed(old),false,'safe repeat never reopens admission');
  await db.exec(`grant execute on function ${replacement} to service_role;`);
  assert.equal(await allowed(replacement),true,'forward migration can install only the new authority');
 }finally{await db.close();}
});
