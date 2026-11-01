import {migrationsFrom} from '../helpers/historical-migration-boundary.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {load} from './stripe-connect-observed-fixture.mjs';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
const migration='20261030184536_creator_instant_cashout_fee.sql';
const switchMigration='20261030185416_creator_instant_cashout_switch_off.sql';
test('actual authenticated cash-out reservations charge instant 2%, standard zero, and preserve accepted fees', {timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,excludeMigrations:migrationsFrom(migration)});
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 try{
  const creator='a1000000-0000-4000-8000-000000000001';
  const old=await scalar(`insert into public.creator_payout_requests(creator_id,amount_cents,currency,payout_type,instant_fee_cents,status) values($1,10000,'usd','instant',150,'requested') returning id`,[creator]);
  const switches=await scalar('select jsonb_agg(to_jsonb(s) order by key) from public.platform_money_kill_switches s');
  const prior=await scalar(`select pg_get_functiondef('public.create_creator_payout_request_safe(integer,text)'::regprocedure)`);
  await db.exec(fs.readFileSync(`supabase/migrations/${migration}`,'utf8'));
  assert.equal(await scalar('select instant_cashout_fee_bps from public.monetization_system_settings'),200);
  for(const [amount,fee] of [[1,1],[49,1],[50,1],[51,2],[99,2],[100,2],[101,3],[10000,200],[2147483647,42949673]]){
   const q=await scalar("select public.preview_creator_cashout_fees($1,'instant')",[amount]);
   assert.equal(q.appFeeCents,fee);assert.equal(q.netAfterAppFeeCents,amount-fee);assert.equal(q.providerFeeCents,null);assert.equal(q.netAfterAllFeesCents,null);assert.equal(q.financialAuthority,false);
   assert.deepEqual(await scalar("select public.preview_creator_cashout_fees($1,'instant')",[amount]),q,'repeat quote has same integercent terms');
   assert.equal((await scalar("select public.preview_creator_cashout_fees($1,'scheduled')",[amount])).appFeeCents,0);
  }
  for(const args of [[0,'instant'],[-1,'instant'],[null,'instant'],[100,'tip'],[100,null]])await assert.rejects(db.query('select public.preview_creator_cashout_fees($1,$2)',args),/cashout_fee_quote_input_invalid/);
  assert.equal(await scalar('select instant_fee_cents from public.creator_payout_requests where id=$1',[old]),150);
  await assert.rejects(db.query('update public.creator_payout_requests set instant_fee_cents=200 where id=$1',[old]),/accepted_payout_fee_terms_immutable/);
  for(const status of ['failed','requested','canceled']){await db.query('update public.creator_payout_requests set status=$2 where id=$1',[old,status]);assert.equal(await scalar('select instant_fee_cents from public.creator_payout_requests where id=$1',[old]),150);}
  const now=await scalar(`select pg_get_functiondef('public.create_creator_payout_request_safe(integer,text)'::regprocedure)`);
  assert.ok(prior.includes('ceil(p_amount_cents * 0.015)::integer'));assert.ok(now.includes('public.calculate_creator_instant_cashout_fee(p_amount_cents)'));
  const expected=prior.replace('ceil(p_amount_cents * 0.015)::integer','public.calculate_creator_instant_cashout_fee(p_amount_cents)').replace("'providerMutationPerformed',false\n", "'appFeeCents',v_request.\"instant_fee_cents\",'providerFeeCents',null,\n    'providerFeeStatus','unknown','netAfterAppFeeCents',v_request.\"amount_cents\"-v_request.\"instant_fee_cents\",\n    'netAfterAllFeesCents',null,'providerMutationPerformed',false\n");
  assert.equal(now,expected,'all existing payout admission and allocation statements remain byte-identical');
  assert.ok(now.includes('creator_recovery_obligation_pending'));assert.ok(now.includes('payout_execution_disabled'));assert.ok(now.includes('payout_allocation_incomplete'));
  assert.deepEqual(await scalar('select jsonb_agg(to_jsonb(s) order by key) from public.platform_money_kill_switches s'),switches);
  assert.equal(await scalar('select count(*)::int from public.creator_payout_requests'),1,'quotes never create payout requests or refunds');
  await assert.rejects(db.exec("insert into public.platform_money_kill_switches(key,state,display_label) values('cashout_enabled','off','Synthetic fixture')"),/platform_money_kill_switches_key_check/,'pre-fix catalog cannot represent the required instant switch');
  await db.exec(fs.readFileSync(`supabase/migrations/${switchMigration}`,'utf8'));
  assert.deepEqual(await scalar("select jsonb_agg(to_jsonb(s) order by key) from public.platform_money_kill_switches s where key<>'cashout_enabled'"),switches,'forward switch repair leaves every prior switch unchanged');
  assert.equal(await scalar("select state from public.platform_money_kill_switches where key='cashout_enabled'"),'off');
  await assert.rejects(db.exec("insert into public.platform_money_kill_switches(key,state,display_label) values('unrecognized_switch','off','Synthetic fixture')"),/platform_money_kill_switches_key_check/);
  await assertAuthenticatedReservations(db);
  // The byte-identical historical assertion above remains at its actual era.
  // Now replay every later dependency and verify accepted fees stay immutable.
  await db.exec("reset role;select set_config('request.jwt.claims','{}',false),set_config('request.jwt.claim.role','',false)");
  for(const file of migrationsFrom(switchMigration,{inclusive:false}))await db.exec(fs.readFileSync(`supabase/migrations/${file}`,'utf8'));
  assert.equal(await scalar('select instant_fee_cents from public.creator_payout_requests where id=$1',[old]),150);
  await assert.rejects(db.query('update public.creator_payout_requests set instant_fee_cents=200 where id=$1',[old]),/accepted_payout_fee_terms_immutable/);
 }finally{await db.close();}
});

test('actual client fee preview matches 2% integer ceiling and distinguishes unknown provider fees/final net',()=>{
 const monetization=load('_lib/creatorMonetization.ts',{'./supabase':{},'./entitlementAuthority':{},'./accountBoundSupabaseMutation':{}});
 const payouts=load('_lib/creatorPayouts.ts',{'./supabase':{},'./creatorMonetization':monetization});
 assert.equal(monetization.CREATOR_PAID_CONTENT_PLATFORM_SHARE_BPS,2000);assert.equal(monetization.CREATOR_TIP_CREATOR_SHARE_BPS,10000);
 const summary=payouts.createEmptyCreatorPayoutDashboardReadModel();
 for(const [amount,fee] of [[1,1],[50,1],[51,2],[10000,200]])for(const payoutType of ['scheduled','instant']){
  const q=payouts.previewCreatorPayoutPreproductionWorkflow(summary,{amountCents:amount,payoutType});
  assert.equal(q.appFeeCents,payoutType==='instant'?fee:0);assert.equal(q.providerFeeCents,null);assert.equal(q.totalFeeCents,null);assert.equal(q.netAfterAllFeesCents,null);assert.equal(q.canExecuteProductionPayout,false);
 }
});


// Isolated in-memory SQL fixtures model already-imported observations and matured
// earnings. They are NOT receipts from a real provider or proof of live readiness.
// No triggers, constraints, RLS or application functions are replaced/disabled.
async function assertAuthenticatedReservations(db) {
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const creator='a2000000-0000-4000-8000-000000000001';
 const session='a2000000-0000-4000-8000-000000000002';
 await db.query("insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values($1,'cashout-fixture@example.test',now(),false,false)",[creator]);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,creator]);
 await db.exec(`insert into public.wave1_legal_document_versions(document_key,version,market,capability,effective_at) values('payout_terms','synthetic-fixture-v1','UNITED_STATES','payout',now()-interval '1 day') on conflict do nothing`);
 await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
 select $1::uuid,public.wave1_sha256($1::text),document_key,version,market,'member',capability,$2,'service_reconciliation'
 from public.wave1_legal_document_versions where active and market='UNITED_STATES'`,[creator,session]);
 await db.query(`insert into public.wave1_creator_eligibility(creator_user_id,state,account_status,age_18_plus,legal_accepted,creator_role,moderation_state,market,rollout_eligible,platform_capability,provider_eligible,kyc_complete,tax_complete,sanctions_clear,payout_eligible,authority_source,last_operation_key)
 values($1,'VERIFIED','ACTIVE',true,true,true,'CLEAR','UNITED_STATES',true,true,true,true,true,true,true,'synthetic_sql_fixture','cashout-fixture')`,[creator]);
 const create=async(amount,type)=>{
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:creator,session_id:session})]);
  await db.exec('set role authenticated');
  try{return await scalar('select public.create_creator_payout_request_safe($1,$2)',[amount,type]);}
  finally{await db.exec('reset role');}
 };
 await assert.rejects(create(10000,'instant'),/payout_execution_disabled/);
 await assert.rejects(db.exec("update public.platform_money_kill_switches set state='on' where key='cashout_enabled'"),/owner_required_for_high_risk_money_activation/,'activation trigger denies non-owner authenticated claims');
 // Only this disposable database's switches change; there is no provider transport.
 await db.exec("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false); set role service_role; select set_config('request.jwt.claim.role','service_role',false)");
 await db.exec("update public.platform_money_kill_switches set state='on' where key in ('live_money_enabled','payouts_enabled','stripe_connect_enabled','cashout_enabled')");
 await db.exec("reset role; select set_config('request.jwt.claim.role','',false)");
 await assert.rejects(create(10000,'scheduled'),/fresh_live_payout_provider_proof_required/);
 const account=await scalar(`insert into public.creator_payout_accounts(creator_user_id,provider,provider_environment,provider_account_id,country,status,payouts_enabled,details_submitted,transfers_capability_status,onboarding_status,kyc_status,tax_status,last_provider_sync_at,metadata)
 values($1,'stripe_connect','live','acct_synthetic_cashout_fixture','US','eligible',true,true,'active','ready_for_payouts','verified','verified',now(),'{"last_provider_sync_source":"stripe-connect-account-sync","synthetic_fixture":true}') returning id`,[creator]);
 const audit=await scalar(`insert into public.platform_admin_audit_logs(action,action_category,target_type,target_id,target_user_id,metadata)
 values('stripe_connect_account_synced','payout','creator_payout_account',$1,$2,'{"synthetic_fixture":true}') returning id`,[account,creator]);
 await db.query('update public.creator_payout_accounts set last_platform_admin_audit_log_id=$2 where id=$1',[account,audit]);
 await assert.rejects(create(10000,'scheduled'),/insufficient_available_balance/);
 const provider=await scalar(`insert into public.provider_events(provider,provider_event_id,user_id,environment,event_type,status,idempotency_key,metadata)
 values('stripe_connect','evt_synthetic_cashout_fixture',$1,'production','synthetic_settlement','processed','synthetic_cashout_fixture','{"synthetic_fixture":true}') returning id`,[creator]);
 const money=await scalar(`insert into public.money_access_ledger_events(user_id,creator_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type,metadata)
 values($1,$1,$2,'synthetic_settlement',30000,'usd','production','payable','verified','tip','{"payout_readiness_proved":true,"live_money_enabled_at_verification":true,"synthetic_fixture":true}') returning id`,[creator,provider]);
 const earning=await scalar(`insert into public.creator_earnings_ledger(creator_id,source_type,gross_amount_cents,net_creator_amount_cents,ledger_status,money_ledger_event_id,provider_event_id,settlement_started_at,normal_eligible_at,reserve_amount_cents,reserve_release_at,settlement_policy_version,metadata)
 values($1,'tip',30000,30000,'available',$2,$3,now()-interval '30 days',now()-interval '1 day',10000,now()+interval '7 days','2026-08-31-v1','{"synthetic_fixture":true}') returning id`,[creator,money,provider]);
 assert.equal(await scalar('select public.creator_earnings_withdrawable_cents_internal($1,now())',[earning]),20000);
 await assert.rejects(create(20001,'scheduled'),/insufficient_available_balance/,'reserve cannot be spent');
 const before=await scalar('select count(*)::int from public.creator_payout_requests');
 await db.query(`insert into public.creator_money_recovery_obligations(creator_id,money_ledger_event_id,earnings_ledger_id,amount_cents,reason) values($1,$2,$3,1,'refund_after_payout')`,[creator,money,earning]);
 await assert.rejects(create(1,'instant'),/creator_recovery_obligation_pending/);
 assert.equal(await scalar('select count(*)::int from public.creator_payout_requests'),before,'denial does not insert a request');
 await db.query("update public.creator_money_recovery_obligations set state='recovered' where earnings_ledger_id=$1",[earning]);
 const quote=await scalar("select public.preview_creator_cashout_fees(10001,'instant')");
 const instant=await create(10001,'instant');
 assert.equal(instant.appFeeCents,quote.appFeeCents);assert.equal(instant.netAfterAppFeeCents,quote.netAfterAppFeeCents);
 assert.equal(instant.appFeeCents,201);assert.equal(instant.instantFeeCents,201);assert.equal(instant.netAfterAppFeeCents,9800);
 assert.equal(instant.providerFeeCents,null);assert.equal(instant.providerFeeStatus,'unknown');assert.equal(instant.netAfterAllFeesCents,null);assert.equal(instant.providerMutationPerformed,false);
 const scheduled=await create(9999,'scheduled');
 assert.equal(scheduled.appFeeCents,0);assert.equal(scheduled.instantFeeCents,0);assert.equal(scheduled.netAfterAppFeeCents,9999);assert.equal(scheduled.providerFeeCents,null);assert.equal(scheduled.providerFeeStatus,'unknown');assert.equal(scheduled.netAfterAllFeesCents,null);assert.equal(scheduled.providerMutationPerformed,false);
 for(const request of [instant,scheduled]){
  const row=(await db.query('select * from public.creator_payout_requests where id=$1',[request.id])).rows[0];
  assert.equal(row.creator_id,creator);assert.equal(row.amount_cents,request.amountCents);assert.equal(row.instant_fee_cents,request.appFeeCents);
  assert.equal(await scalar("select sum(amount_cents)::int from public.creator_payout_allocations where payout_request_id=$1 and state='reserved'",[request.id]),request.amountCents);
 }
 await assert.rejects(create(1,'scheduled'),/insufficient_available_balance/,'accepted allocations cannot be spent twice');
 for(const status of ['failed','requested','canceled']){
  await db.query('update public.creator_payout_requests set status=$2 where id=$1',[instant.id,status]);
  assert.equal(await scalar('select instant_fee_cents from public.creator_payout_requests where id=$1',[instant.id]),201);
 }
 for(const assignment of ['instant_fee_cents=150','amount_cents=10000',"currency='eur'","payout_type='scheduled'",`creator_id='a2000000-0000-4000-8000-000000000099'`]){
  await assert.rejects(db.query(`update public.creator_payout_requests set ${assignment} where id=$1`,[instant.id]),/accepted_payout_fee_terms_immutable/);
 }
}
