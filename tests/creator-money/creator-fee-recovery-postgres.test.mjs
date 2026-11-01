import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('verified fee debt consumes unpaid earnings once and later fee credits remain withdrawable',{timeout:240000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 try {
  const creator=randomUUID(),source=randomUUID();
  const acceptance=await one(`insert into private.commerce_creator_fee_acceptances(creator_id,policy_version,terms_sha256,session_id)
   values($1,'known_costs_future_unpaid_adjustments_v1',encode(extensions.digest(private.commerce_known_cost_terms(),'sha256'),'hex'),gen_random_uuid()) returning id`,[creator]);
  const provider=await one(`insert into public.provider_events(provider,provider_event_id,user_id,environment,event_type,status,idempotency_key,metadata)
   values('stripe_connect','evt_feeRecovery',$1,'production','synthetic_settlement','processed','feeRecovery','{"synthetic_fixture":true}') returning id`,[creator]);
  const money=await one(`insert into public.money_access_ledger_events(user_id,creator_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type,metadata)
   values($1,$1,$2,'synthetic_settlement',100,'usd','production','payable','verified','tip','{"payout_readiness_proved":true,"live_money_enabled_at_verification":true,"synthetic_fixture":true}') returning id`,[creator,provider]);
  const original=await one(`insert into public.creator_earnings_ledger(creator_id,source_type,gross_amount_cents,net_creator_amount_cents,ledger_status,money_ledger_event_id,provider_event_id,settlement_started_at,normal_eligible_at,reserve_amount_cents,reserve_release_at,settlement_policy_version,metadata)
   values($1,'tip',100,100,'available',$2,$3,now()-interval '30 days',now()-interval '1 day',0,now()-interval '1 day','2026-08-31-v1','{"synthetic_fixture":true}') returning id`,[creator,money,provider]);
  assert.equal(await one('select public.creator_earnings_withdrawable_cents_internal($1,clock_timestamp())',[original]),100);
  await db.query(`insert into private.commerce_creator_fee_adjustments(creator_id,acceptance_id,currency,amount_minor,reason,source_type,source_id,evidence_hash)
   values($1,$2,'usd',150,'later_verified_fee','cashout_fee',$3,$4)`,[creator,acceptance,source,'a'.repeat(64)]);
  const consume=()=>one("select private.consume_creator_fee_recovery($1,'usd')",[creator]);
  assert.equal(Number(await consume()),0,'pre-adjustment earnings cannot be automatically deducted');assert.equal(Number(await consume()),0);
  assert.equal(await one('select public.creator_earnings_withdrawable_cents_internal($1,clock_timestamp())',[original]),100);
  assert.equal(Number(await one("select private.creator_fee_recovery_amount($1,'usd')",[creator])),150);
  const credit=(amount=100,hash='b'.repeat(64))=>one("select private.record_creator_verified_fee_credit($1,$2,'cashout_fee',$3,$4,$5,'acct_platform','acct_recipient')",[creator,original,source,hash,amount]);
  const restored=await credit();assert.equal(await credit(),restored);await assert.rejects(credit(101),/replay_conflict/);
  assert.equal(await one('select public.creator_earnings_withdrawable_cents_internal($1,clock_timestamp())',[restored]),100);
  assert.equal(Number(await consume()),100);assert.equal(Number(await consume()),0);
  assert.equal(await one('select public.creator_earnings_withdrawable_cents_internal($1,clock_timestamp())',[restored]),0);
  assert.equal(Number(await one("select private.creator_fee_recovery_amount($1,'usd')",[creator])),50);
  const second=await credit(100,'c'.repeat(64));assert.equal(Number(await consume()),50);
  assert.equal(await one('select public.creator_earnings_withdrawable_cents_internal($1,clock_timestamp())',[second]),50);
  assert.equal(await one("select private.creator_fee_recovery_outstanding($1,'usd')",[creator]),false);
  assert.equal(await one("select private.commerce_cashout_earning_account_exact($1,'acct_other','acct_recipient')",[restored]),false);
  assert.equal(await one("select private.commerce_cashout_earning_account_exact($1,'acct_platform','acct_recipient')",[restored]),true);
  await db.query(`insert into private.commerce_creator_fee_adjustments(creator_id,acceptance_id,currency,amount_minor,reason,source_type,source_id,evidence_hash,created_at)
   select $1,$2,'usd',50,'later_verified_fee','cashout_fee',$3,$4,created_at from public.creator_earnings_ledger where id=$5`,[creator,acceptance,source,'d'.repeat(64),second]);
  assert.equal(Number(await consume()),0,'equal timestamps are not after the adjustment');
  assert.equal(await one('select public.creator_earnings_withdrawable_cents_internal($1,clock_timestamp())',[second]),50);
  const third=await credit(50,'e'.repeat(64));assert.equal(Number(await consume()),50);
  assert.equal(await one('select public.creator_earnings_withdrawable_cents_internal($1,clock_timestamp())',[third]),0);
  await db.exec('begin');
  await db.query(`insert into private.commerce_creator_fee_adjustments(creator_id,acceptance_id,currency,amount_minor,reason,source_type,source_id,evidence_hash)
   values($1,$2,'usd',25,'later_verified_fee','cashout_fee',$3,$4)`,[creator,acceptance,source,'f'.repeat(64)]);
  const sameTransaction=await credit(25,'1'.repeat(64));
  assert.equal(Number(await consume()),25,'later credit in same transaction uses recording clock, not transaction-start time');
  assert.equal(await one('select public.creator_earnings_withdrawable_cents_internal($1,clock_timestamp())',[sameTransaction]),0);
  await db.exec('commit');
  await db.exec('begin');
  await db.query(`insert into private.commerce_creator_fee_adjustments(creator_id,acceptance_id,currency,amount_minor,reason,source_type,source_id,evidence_hash)
   values($1,$2,'usd',10,'later_verified_fee','cashout_fee',$3,$4)`,[creator,acceptance,source,'2'.repeat(64)]);
  const laterProvider=await one(`insert into public.provider_events(provider,provider_event_id,user_id,environment,event_type,status,idempotency_key,metadata)
   values('stripe_connect','evt_LaterDefaultClock',$1,'production','synthetic_settlement','processed','laterDefaultClock','{"synthetic_fixture":true}') returning id`,[creator]);
  const laterMoney=await one(`insert into public.money_access_ledger_events(user_id,creator_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type,metadata)
   values($1,$1,$2,'synthetic_settlement',10,'usd','production','payable','verified','tip','{"payout_readiness_proved":true,"live_money_enabled_at_verification":true,"synthetic_fixture":true}') returning id`,[creator,laterProvider]);
  const defaultClock=await one(`insert into public.creator_earnings_ledger(creator_id,source_type,gross_amount_cents,net_creator_amount_cents,ledger_status,money_ledger_event_id,provider_event_id,settlement_started_at,normal_eligible_at,reserve_amount_cents,reserve_release_at,settlement_policy_version,metadata)
   values($1,'tip',10,10,'available',$2,$3,clock_timestamp()-interval '30 days',clock_timestamp()-interval '1 day',0,clock_timestamp()-interval '1 day','2026-08-31-v1','{"synthetic_fixture":true}') returning id`,[creator,laterMoney,laterProvider]);
  assert.equal(Number(await consume()),10,'other earning issuers using the default also record actual accrual order');
  assert.equal(await one('select public.creator_earnings_withdrawable_cents_internal($1,clock_timestamp())',[defaultClock]),0);
  await db.exec('commit');
  for(const role of ['anon','authenticated','service_role']){
   await db.exec(`set role ${role}`);await assert.rejects(credit(1,'c'.repeat(64)),/permission denied/);await assert.rejects(consume(),/permission denied/);await db.exec('reset role');
  }
  await assert.rejects(db.exec('delete from private.commerce_creator_fee_offsets'),/immutable/);
  await assert.rejects(db.exec('update private.creator_fee_credit_sources set amount_minor=1'),/immutable/);
 }finally{await db.close();}
});
