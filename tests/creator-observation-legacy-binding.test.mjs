import assert from 'node:assert/strict';
import test from 'node:test';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedQualifiedCommerceCreator} from './helpers/automatic-commerce-fixture.mjs';

test('corrupt legacy binding rows cannot poison a healthy observation batch',{timeout:180000},async t=>{
 const {db}=await createDatabase({implicitApiGrants:false});
 const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0].value;
 try {
  const actors=[];
  for(let i=0;i<3;i++)actors.push(await seedQualifiedCommerceCreator(db));
  const accounts=[];
  for(const actor of actors)accounts.push(await scalar('select id value from public.creator_payout_accounts where creator_user_id=$1',[actor.id]));
  const name='creator_connect_mode_binding_history_immutable';
  const trigger=()=>scalar("select pg_get_triggerdef(oid) value from pg_trigger where tgrelid='private.creator_connect_mode_bindings'::regclass and tgname=$1",[name]);
  const originalTrigger=await trigger();
  await assert.rejects(db.query('delete from private.creator_connect_mode_bindings where payout_account_id=$1',[accounts[0]]),/connect_binding_history_immutable/u);
  const snapshot=()=>scalar(`select jsonb_build_object(
   'accounts',(select jsonb_agg(to_jsonb(a) order by id) from public.creator_payout_accounts a),
   'bindings',(select jsonb_agg(to_jsonb(b) order by payout_account_id) from private.creator_connect_mode_bindings b),
   'jobs',(select jsonb_agg(to_jsonb(j) order by account_id) from private.creator_provider_observation_jobs j),
   'grants',(select jsonb_agg(to_jsonb(g) order by id) from public.access_grants g)) value`);
  const before=await snapshot();
  await db.exec('begin');
  try {
   // Deliberately corrupt legacy state in this rollback-only database. Restore
   // the exact original immutable trigger BEFORE invoking production claim.
   // No binding is fabricated or production guard disabled during the action.
   await db.exec(`drop trigger ${name} on private.creator_connect_mode_bindings`);
   await db.query('delete from private.creator_connect_mode_bindings where payout_account_id=$1',[accounts[0]]);
   await db.query("update private.creator_connect_mode_bindings set provider_account_id='acct_corruptLegacyMismatch' where payout_account_id=$1",[accounts[1]]);
   await db.exec(originalTrigger);
   assert.equal(await trigger(),originalTrigger);
   await db.exec("update private.creator_provider_observation_control set enabled=true,last_claimed_at=null;update private.creator_provider_observation_jobs set due_at=clock_timestamp()-interval '1 minute';");
   const malformed=await scalar('select jsonb_agg(to_jsonb(j) order by account_id) value from private.creator_provider_observation_jobs j where account_id=any($1::uuid[])',[accounts.slice(0,2)]);
   await db.exec("set local request.jwt.claims='{\"role\":\"service_role\"}';set local request.jwt.claim.role='service_role'");
   const claimed=await scalar('select public.claim_creator_provider_observations() value');
   assert.equal(claimed.length,1);assert.equal(claimed[0].account_id,accounts[2]);
   assert.deepEqual(await scalar('select jsonb_agg(to_jsonb(j) order by account_id) value from private.creator_provider_observation_jobs j where account_id=any($1::uuid[])',[accounts.slice(0,2)]),malformed);
   assert.equal(await scalar('select count(*)::int value from private.creator_connect_mode_bindings where payout_account_id=$1',[accounts[0]]),0,'claim does not invent missing binding');
   assert.equal(await scalar('select provider_account_id value from private.creator_connect_mode_bindings where payout_account_id=$1',[accounts[1]]),'acct_corruptLegacyMismatch','claim does not repair identity history');
  }finally{await db.exec('rollback');}
  assert.equal(await trigger(),originalTrigger);assert.deepEqual(await snapshot(),before);
  t.diagnostic('Malformed-state SQL/batch proof only. Fixture DML already owns the gate; native SKIP LOCKED controls separately prove the lease exception is nonblocking.');
 }finally{await db.close();}
});
