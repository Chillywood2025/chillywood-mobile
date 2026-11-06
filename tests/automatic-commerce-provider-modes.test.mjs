import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedQualifiedCommerceCreator,seedSyntheticStrictCreatorProvider,withCommerceActor} from './helpers/automatic-commerce-fixture.mjs';

test('live then test accounts retain canonical live projection while each mode proves its own readiness', {timeout:180000}, async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0].value;
 try {
  const creator=await seedQualifiedCommerceCreator(db,undefined,{environment:'production'});
  const common=()=>scalar('select to_jsonb(e) value from public.creator_payout_eligibility_records e where creator_user_id=$1',[creator.id]);
  const original=await common();
  assert.equal(await scalar('select provider_environment value from public.creator_payout_accounts where id=$1',[original.payout_account_id]),'live');
  // Real account/projector triggers run. No test writes the common pointer.
  await seedSyntheticStrictCreatorProvider(db,creator,{environment:'sandbox'});
  assert.deepEqual(await common(),original,'test observation cannot replace the canonical common live projection');
  const ready=mode=>scalar('select private.ordinary_creator_provider_ready($1::uuid,$2) value',[creator.id,mode]);
  assert.equal(await ready('production'),true);assert.equal(await ready('sandbox'),true);
  assert.equal(await scalar("select private.ordinary_commerce_subject_current($1::uuid,$2::uuid,'sandbox') value",[creator.id,creator.session]),true,
   'production Premium can also use its separate qualified test account');
  await db.exec("update public.platform_money_kill_switches set state='off' where key='live_money_enabled'");
  const read=()=>withCommerceActor(db,creator,()=>scalar('select public.wave1_creator_eligibility_readback() value'));
  assert.equal((await read()).canCreateMoneyExposure,true,'switching back to sandbox uses independent test evidence');
  assert.equal((await common()).payout_account_id,original.payout_account_id);

  const mutate=async(sql,args,check)=>{
   await db.exec('begin;select private.lock_ordinary_commerce_authority_gate()');
   try{await db.query(sql,args);await check();}finally{await db.exec('rollback');}
  };
  for(const [label,sql] of [
   ['tax',"update public.creator_payout_accounts set tax_status='not_connected' where creator_user_id=$1 and provider_environment='test'"],
   ['KYC',"update public.creator_payout_accounts set kyc_status='pending' where creator_user_id=$1 and provider_environment='test'"],
   ['payout capability',"update public.creator_payout_accounts set payouts_enabled=false where creator_user_id=$1 and provider_environment='test'"],
   ['configuration',"update public.creator_payout_accounts set provider_configuration_status='unknown' where creator_user_id=$1 and provider_environment='test'"],
   ['provider freshness',"update public.creator_payout_accounts set last_provider_sync_at=clock_timestamp()-interval '16 minutes' where creator_user_id=$1 and provider_environment='test'"],
   ['observation freshness',"update private.creator_provider_observation_jobs set observed_at=clock_timestamp()-interval '16 minutes' where creator_id=$1::uuid and environment='test'"],
   ['observation mode',"update private.creator_provider_observation_jobs set environment='live' where creator_id=$1::uuid and environment='test'"],
  ]) await mutate(sql,[creator.id],async()=>{
   assert.equal(await ready('sandbox'),false,label);
   assert.equal(await ready('production'),true,`${label}: test changes cannot supply or replace live evidence`);
   assert.equal((await common()).payout_account_id,original.payout_account_id);
  });
  await assert.rejects(db.query("delete from private.creator_connect_mode_bindings where creator_id=$1 and environment='test'",[creator.id]),
   /connect_binding_history_immutable/,'canonical mode binding cannot be removed');
  await assert.rejects(db.query("update public.creator_payout_accounts set provider_environment='live' where creator_user_id=$1 and provider_environment='test'",[creator.id]),
   /creator_payout_accounts_configuration_observation_check/,'test configuration cannot be relabeled as live');
  await assert.rejects(db.query("update public.creator_payout_accounts set provider_configuration_status='unknown',provider_account_id='acct_wrongModeBinding' where creator_user_id=$1 and provider_environment='test'",[creator.id]),
   /connect_account_binding_immutable/,'canonical provider account identity cannot change');
  assert.equal(await ready('sandbox'),true);assert.equal(await ready('production'),true);
  await mutate("update public.creator_payout_accounts set tax_status='not_connected' where creator_user_id=$1 and provider_environment='live'",[creator.id],async()=>{
   assert.equal(await ready('production'),false,'test tax must not qualify live account');
   assert.equal(await ready('sandbox'),true);
  });
  for(const change of ['provider_ready=false','kyc_ready=false','payout_account_ready=false','fraud_hold_active=true',
   "eligibility_status='on_hold'","admin_review_status='pending_review'","admin_review_status='rejected'","admin_review_status='on_hold'"]) {
   await mutate(`update public.creator_payout_eligibility_records set ${change} where creator_user_id=$1`,[creator.id],async()=>{
    assert.equal(await ready('sandbox'),false,change);assert.equal(await ready('production'),false,change);
   });
  }
  await db.query('update public.wave1_creator_eligibility set provider_eligible=false where creator_user_id=$1',[creator.id]);
  const denied=await read();
  assert.equal(denied.providerEligible,false,'independent explicit creator disqualification stays false');
  assert.equal(denied.canCreateMoneyExposure,false);
 }finally{await db.close();}
});
