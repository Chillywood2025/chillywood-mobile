import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {seedCashoutExecutionFixture} from '../helpers/cashout-execution-fixture.mjs';
import {assertSandboxEdgeRecoveryFromSql} from '../helpers/sandbox-cashout-edge-recovery-proof.mjs';

test('sandbox cashout uses provider-backed test sources without opening live money or payable ledgers', {timeout:240000}, async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true});
 try {
  const f=await seedCashoutExecutionFixture(db,{reserveInitialRequest:false});
  const {scalar,creator,claims,rpc}=f;
  const buyer='b2000000-0000-4000-8000-000000000001';
  await db.query("insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values($1,'sandbox-buyer@example.test',now(),false,false)",[buyer]);
  await db.query("insert into public.sandbox_monetization_testers(user_id,email,status,expires_at) values($1,$2,'active',now()+interval '1 day')",[creator,`cashout-${creator}@example.test`]);
  await db.exec("update public.platform_money_kill_switches set state='off' where key in ('live_money_enabled','payouts_enabled','cashout_enabled'); update public.platform_money_kill_switches set state='sandbox_only' where key in ('stripe_connect_enabled','creator_monetization_enabled','provider_webhooks_enabled')");
  await db.query("insert into public.creator_payout_accounts(creator_user_id,provider,provider_environment,provider_account_id,country) values($1,'stripe_connect','test','acct_sandboxCreator','US')",[creator]);
  const q=await scalar(`insert into private.sandbox_cashout_qualifications(creator_id,platform_account_id,account_id,destination_id,payout_type,source_type,
   provider_fee_bps,provider_fee_fixed_minor,settlement_policy_version,simulated_tax_bps,simulated_platform_bps,simulated_provider_bps,simulated_provider_fixed_minor,
   manual_schedule_verified,exclusive_writer_verified,zero_additional_application_fee_verified,platform_fee_payer_verified,test_mode_verified,provider_evidence_reference,verified_at,expires_at)
   values($1,'acct_sandboxPlatform','acct_sandboxCreator','ba_sandboxDestination','instant','card',0,0,'synthetic-test-policy-v1',0,1000,0,0,
   true,true,true,true,true,'SYNTHETIC DISPOSABLE TEST ONLY',now()-interval '1 minute',now()+interval '1 day') returning id`,[creator]);
  const pe=await scalar("insert into public.provider_events(provider,provider_event_id,user_id,environment,event_type,status,idempotency_key) values('revenuecat_app_store','evt_sandboxPurchase',$1,'sandbox','INITIAL_PURCHASE','processed','evt_sandboxPurchase') returning id",[buyer]);
  const source=await scalar(`insert into public.money_access_ledger_events(user_id,creator_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type,metadata)
   values($1,$2,$3,'INITIAL_PURCHASE',10000,'usd','sandbox','not_payable','sandbox_only','tip','{"original_transaction_id":"sandboxOriginal"}') returning id`,[buyer,creator,pe]);
  const user=async(sql,args=[])=>{await claims('authenticated');await db.exec('set role authenticated');try{return await scalar(sql,args);}finally{await db.exec('reset role');}};
  assert.equal((await user("select public.preview_sandbox_creator_cashout(9000,'instant')")).reason,'sandbox_payout_execution_disabled');
  await db.exec('update private.sandbox_cashout_control set enabled=true');
  const quote=await user("select public.preview_sandbox_creator_cashout(9000,'instant')");
  assert.equal(quote.ready,true); assert.equal(quote.appFeeMinor,180);assert.equal(quote.bankMinor,8820);
  assert.equal(quote.earningsBasis,'sandbox_fixture_deductions_not_actual_fees');
  assert.equal((await user("select public.preview_sandbox_creator_cashout(9001,'instant')")).reason,'sandbox_earnings_insufficient');
  const request=async(operation=quote.operationId)=>user('select public.request_sandbox_creator_cashout($1,$2,$3,$4,$5,$6,$7)',[9000,'instant',q,operation,180,0,8820]);
  const record=await request(); assert.equal(record.environment,'test');assert.equal(record.bankPaid,false);
  assert.equal((await request()).requestId,record.requestId,'operation replay does not reserve twice');
  assert.equal(await scalar('select count(*)::int from private.sandbox_cashout_allocations'),1);
  await assert.rejects(user('select public.get_my_sandbox_creator_cashout_execution($1)',[f.request?.id??'b3000000-0000-4000-8000-000000000001']),/sandbox_cashout_not_found/);
  await claims('authenticated');await db.exec('set role authenticated');
  await assert.rejects(db.query('select public.claim_sandbox_creator_cashout_dispatch($1,$2)',[record.requestId,'funding']),/permission denied/);
  await assert.rejects(db.query('select * from private.sandbox_cashout_qualifications'),/permission denied/);
  await db.exec('reset role');
  const context=await rpc('select public.get_sandbox_creator_cashout_execution_context($1)',[record.requestId]);
  assert.equal(context.environment,'test');assert.equal(context.dispatchKey,`cw-cashout-${record.requestId}`);
  const claim=stage=>rpc('select public.claim_sandbox_creator_cashout_dispatch($1,$2)',[record.requestId,stage]);
  const observe=(facts,token=null)=>rpc('select public.record_sandbox_creator_cashout_observation($1,$2,$3)',[record.requestId,token,JSON.stringify(facts)]);
  const first=await claim('funding');assert.equal(first.claimed,true);assert.equal((await claim('funding')).claimed,false);
  await assertSandboxEdgeRecoveryFromSql({rpc,user,requestId:record.requestId,phase:'funding_unknown'});
  // Actual SQL context, not a hand-written timestamp fixture, flows through
  // the production shared recovery engine into Stripe's epoch-second filter.
  const unknown=await rpc('select public.get_sandbox_creator_cashout_execution_context($1)',[record.requestId]);
  const runtime={exports:{},URLSearchParams,Response,TextDecoder,Uint8Array,AbortSignal,setTimeout,clearTimeout};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/_shared/creator-cashout-execution.ts','utf8'),
   {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,runtime);
  let recoveryQuery=null;
  const recovered=await runtime.exports.runCreatorCashout(record.requestId,{read:async()=>unknown,claim:async()=>assert.fail('unknown dispatch may not POST'),observe:async()=>assert.fail('empty GET is not evidence')},
   'rk_test_synthetic',async(url,options)=>{assert.equal(options.method,'GET');const parsed=new URL(url);
    if(parsed.pathname==='/v1/account')return Response.json({object:'account',id:unknown.platformAccountId});
    assert.equal(parsed.pathname,'/v1/transfers');recoveryQuery=parsed.searchParams.get('created[gte]');return Response.json({object:'list',data:[],has_more:false});});
  assert.equal(recovered.status,'funding_unknown');
  assert.equal(Number(recoveryQuery),unknown.dispatchedAt-120);
  assert.ok(Math.abs(unknown.dispatchedAt-Math.floor(Date.now()/1000))<10,'SQL and recovery use epoch seconds, not milliseconds');
  const transfer={kind:'transfer',objectId:'tr_sandboxFunding',amountMinor:8820,reversedMinor:0,fullyReversed:false,accountId:context.accountId,environment:'test'};
  await assert.rejects(observe({...transfer,environment:'live'},first.token),/sandbox_observation_binding_invalid/);
  assert.equal((await observe(transfer,first.token)).status,'funded');
  const bank=await claim('payout');assert.equal(bank.claimed,true);
  await assertSandboxEdgeRecoveryFromSql({rpc,user,requestId:record.requestId,phase:'payout_unknown'});
  const payout={kind:'payout',objectId:'po_sandboxBank',status:'paid',amountMinor:8820,accountId:context.accountId,destinationId:context.destinationId,environment:'test'};
  const paid=await observe(payout,bank.token);assert.equal(paid.providerTestPaid,true);assert.equal(paid.bankPaid,false);
  await assert.rejects(observe({...payout,status:'pending'}),/sandbox_payout_regression/);
  assert.equal(await scalar('select payable_state from public.money_access_ledger_events where id=$1',[source]),'not_payable');
  assert.deepEqual((await db.query("select state from public.platform_money_kill_switches where key in ('live_money_enabled','payouts_enabled','cashout_enabled')")).rows.map(x=>x.state),['off','off','off']);
  assert.equal(await scalar('select count(*)::int from private.creator_cashout_executions'),0);
  assert.equal((await observe({...payout,status:'failed',returnedMinor:8820,returnTransactionId:'txn_sandboxReturn'})).status,'return_confirmed');
  assert.equal((await observe({...payout,status:'failed'})).status,'return_confirmed','late incomplete observation cannot erase full return proof');
  const reversal=await claim('reversal');assert.equal(reversal.claimed,true);
  assert.equal((await observe({kind:'reversal',objectId:'trr_sandboxReturn',transferId:transfer.objectId,amountMinor:8820,accountId:context.accountId,environment:'test'},reversal.token)).status,'returned');
  assert.equal(await scalar('select sum(released_minor)::integer from private.sandbox_cashout_simulated_return_accounting'),9000);
  assert.equal((await user("select public.preview_sandbox_creator_cashout(9000,'instant')")).ready,true,'test principal and app fee can be reserved again under explicitly simulated economics');
  const returnedProof={kind:'reversal',objectId:'trr_sandboxReturn',transferId:transfer.objectId,amountMinor:8820,accountId:context.accountId,environment:'test'};
  assert.equal((await observe(returnedProof,reversal.token)).status,'returned');
  assert.equal(await scalar('select count(*)::int from private.sandbox_cashout_simulated_return_accounting'),1,'duplicate terminal observation does not release twice');
  await assert.rejects(db.query("update private.sandbox_cashout_qualifications set settlement_policy_version='rewritten' where id=$1",[q]),/immutable/);
  await assert.rejects(user("select public.preview_sandbox_creator_cashout($1,'instant')",['1.5']),/invalid input syntax/);
  await assert.rejects(user("select public.preview_sandbox_creator_cashout($1,'instant')",['2147483648']),/out of range/);
  await assert.rejects(user("select public.preview_sandbox_creator_cashout(-1,'instant')"),/cashout_input_invalid/);

  // A second independently observed purchase supplies the second allocation.
  // Ceil(10% * 333) = 34, not a floating-point or truncation-based 33.
  const pe2=await scalar("insert into public.provider_events(provider,provider_event_id,user_id,environment,event_type,status,idempotency_key) values('revenuecat_app_store','evt_sandboxPurchase2',$1,'sandbox','INITIAL_PURCHASE','processed','evt_sandboxPurchase2') returning id",[buyer]);
  const source2=await scalar(`insert into public.money_access_ledger_events(user_id,creator_id,provider_event_id,event_type,amount_minor,currency,environment,payable_state,status,source_type,metadata)
   values($1,$2,$3,'INITIAL_PURCHASE',333,'usd','sandbox','not_payable','sandbox_only','tip','{"original_transaction_id":"sandboxOriginal2"}') returning id`,[buyer,creator,pe2]);
  assert.equal((await scalar('select private.sandbox_cashout_source($1,$2)',[source2,q])).netMinor,299);
  await db.query("update public.money_access_ledger_events set currency='eur' where id=$1",[source2]);
  assert.equal(await scalar('select private.sandbox_cashout_source($1,$2)',[source2,q]),null,'EUR source cannot fund USD test cashout');
  await db.query("update public.money_access_ledger_events set currency='usd' where id=$1",[source2]);
  const q2=await scalar(`insert into private.sandbox_cashout_qualifications select
   gen_random_uuid(),creator_id,platform_account_id,account_id,destination_id,environment,payout_type,source_type,
   0,25,'synthetic-test-policy-v2',simulated_tax_bps,simulated_platform_bps,simulated_provider_bps,simulated_provider_fixed_minor,
   manual_schedule_verified,exclusive_writer_verified,zero_additional_application_fee_verified,platform_fee_payer_verified,test_mode_verified,
   provider_evidence_reference,clock_timestamp(),expires_at from private.sandbox_cashout_qualifications where id=$1 returning id`,[q]);
  const quote2=await user("select public.preview_sandbox_creator_cashout(9200,'instant')");
  assert.equal(quote2.ready,true);assert.equal(quote2.expectedProviderFeeMinor,25);assert.equal(quote2.bankMinor,8991);
  const request2=async(op)=>user("select public.request_sandbox_creator_cashout(9200,'instant',$1,$2,184,25,8991)",[q2,op]);
  const cancelBefore=await request2(quote2.operationId);
  assert.equal(await scalar('select count(*)::int from private.sandbox_cashout_allocations where execution_id=$1',[cancelBefore.requestId]),2);
  assert.equal((await user('select public.cancel_undispatched_sandbox_creator_cashout($1)',[cancelBefore.requestId])).status,'canceled');
  assert.equal((await user("select public.preview_sandbox_creator_cashout(9200,'instant')")).ready,true,'cancel before dispatch releases test reservation');
  const requestAfterCancel=await request2((await user("select public.preview_sandbox_creator_cashout(9200,'instant')")).operationId);
  const claim2=stage=>rpc('select public.claim_sandbox_creator_cashout_dispatch($1,$2)',[requestAfterCancel.requestId,stage]);
  const observe2=(facts,token=null)=>rpc('select public.record_sandbox_creator_cashout_observation($1,$2,$3)',[requestAfterCancel.requestId,token,JSON.stringify(facts)]);
  // Rolled-back durable claims cannot leave external-dispatch authority behind.
  await db.exec('begin');assert.equal((await claim2('funding')).claimed,true);await db.exec('rollback');
  assert.equal((await rpc('select public.get_sandbox_creator_cashout_execution_context($1)',[requestAfterCancel.requestId])).phase,'prepared');
  const claim2fund=await claim2('funding');
  await observe2({...transfer,objectId:'tr_sandboxFunding2',amountMinor:8991},claim2fund.token);
  const canceledFunded=await user('select public.cancel_undispatched_sandbox_creator_cashout($1)',[requestAfterCancel.requestId]);
  assert.equal(canceledFunded.status,'funding_return_pending');assert.equal(canceledFunded.bankPaid,false);
  assert.equal((await claim2('payout')).claimed,false,'funded cancellation forever fences bank dispatch');
  const return2=await claim2('funding_return');assert.equal(return2.claimed,true);assert.equal((await claim2('funding_return')).claimed,false);
  const fundingReturn={kind:'funding_return',objectId:'trr_sandboxFundingReturn2',transferId:'tr_sandboxFunding2',amountMinor:8991,
   accountId:context.accountId,platformAccountId:context.platformAccountId,environment:'test',
   fundingBalance:{transactionId:'txn_funding2',sourceId:'tr_sandboxFunding2',amountMinor:-8991,feeMinor:0,netMinor:-8991,currency:'usd',status:'available',type:'transfer'},
   returnBalance:{transactionId:'txn_return2',sourceId:'trr_sandboxFundingReturn2',amountMinor:8991,feeMinor:0,netMinor:8991,currency:'usd',status:'available',type:'transfer_refund'}};
  await assert.rejects(observe2({...fundingReturn,amountMinor:9200}),/sandbox_observation_binding_invalid/);
  assert.equal((await observe2(fundingReturn)).status,'returned');
  assert.equal((await observe2(fundingReturn)).status,'returned');
  const totals=await scalar('select jsonb_build_object(\'released\',sum(released_minor),\'retained\',sum(retained_fixture_cost_minor),\'rows\',count(*)) from private.sandbox_cashout_simulated_return_accounting where execution_id=$1',[requestAfterCancel.requestId]);
  assert.deepEqual(totals,{released:9175,retained:25,rows:2});
  assert.equal((await user("select public.preview_sandbox_creator_cashout(9275,'instant')")).availableMinor,9274,'nonzero fixture cost retained exactly once across both allocations');
  const reReserveQuote=await user("select public.preview_sandbox_creator_cashout(9200,'instant')");
  const reReserved=await request2(reReserveQuote.operationId);
  await db.query("update public.money_access_ledger_events set payable_state='refunded',status='refunded' where id=$1",[source]);
  assert.equal((await user('select public.get_my_sandbox_creator_cashout_execution($1)',[record.requestId])).sourceHeld,true);
  assert.equal((await user('select public.get_my_sandbox_creator_cashout_execution($1)',[reReserved.requestId])).sourceHeld,true,'refund after release and re-reservation holds the new execution too');
  await assert.rejects(rpc("select public.claim_sandbox_creator_cashout_dispatch($1,'funding')",[reReserved.requestId]),/sandbox_source_reconciliation_required/);
  await user('select public.cancel_undispatched_sandbox_creator_cashout($1)',[reReserved.requestId]);
  await assert.rejects(user("select public.request_sandbox_creator_cashout(1,'instant',$1,gen_random_uuid(),1,0,0)",[q]),/sandbox_source_reconciliation_required/);
  await db.query("update public.sandbox_monetization_testers set status='revoked' where user_id=$1",[creator]);
  await assert.rejects(user('select public.list_my_sandbox_creator_cashout_executions()'),/sandbox_current_tester_required/);
 } finally {await db.close();}
});
