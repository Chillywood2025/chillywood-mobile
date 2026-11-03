import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('canonical test tip reserves only proven connected net and claims payout-only with fresh isolated evidence',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 try {
  for(const name of ['event-reservation-authority','creator-external-payment-authority','creator-external-payment-capabilities']) await db.exec(fs.readFileSync(`tests/fixtures/${name}.sql`,'utf8'));
  const actors=(await db.query('select * from event_reservation_fixture.actors')).rows;
  const buyer=actors.find(x=>x.kind==='buyer1'),creator=actors.find(x=>x.kind==='creator');
  const claims=async(role)=>db.query("select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.role',$2,false)",[JSON.stringify({role,sub:creator.user_id,session_id:creator.session_id}),role]);
  const service=async(sql,args=[])=>{await claims('service_role');await db.exec('set role service_role');try{return await one(sql,args);}finally{await db.exec('reset role');}};
  const user=async(sql,args=[])=>{await claims('authenticated');await db.exec('set role authenticated');try{return await one(sql,args);}finally{await db.exec('reset role');}};
  await claims('service_role');
  const tip=randomUUID(),request=randomUUID(),checkout='cs_test_prefunded',intent='pi_prefunded';
  const quote={tipId:tip,creatorId:creator.user_id,amountCents:1379,currency:'usd',providerAccountId:'acct_fixture',capabilityId:'ef000000-0000-4000-8000-000000000001',body:{client_reference_id:tip,
   'metadata[chillywood_tip_id]':tip,'metadata[fan_user_id]':buyer.user_id,'metadata[creator_user_id]':creator.user_id,
   'line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':1379,
   'payment_intent_data[transfer_data][destination]':'acct_fixture','payment_method_types[0]':'card',mode:'payment',expires_at:Math.floor(Date.now()/1000)+3600}};
  await service('select public.reserve_platform_bound_test_tip_checkout($1,$2,$3,$4,$5)',[buyer.user_id,buyer.session_id,request,quote,'acct_platform']);
  await service('select public.record_creator_tip_checkout_session($1,$2,$3,$4,$5)',[buyer.user_id,buyer.session_id,request,checkout,intent]);
  const event='evt_prefundedCanonical',attempt=randomUUID();
  await service('select public.reserve_stripe_tip_webhook_event($1,$2,$3,$4)',[event,'checkout.session.completed','a'.repeat(64),attempt]);
  const paid=await service("select public.process_stripe_tip_webhook_lifecycle($1,$2,$3,$4,'{}','{}')",[event,attempt,tip,{event_livemode:false,event_account:null,object_livemode:false,amount_cents:1379,currency:'usd',payment_intent_id:intent,metadata_tip_id:tip,metadata_sender_id:buyer.user_id,metadata_creator_id:creator.user_id,object_type:'checkout.session',object_id:checkout,client_reference_id:tip,object_status:'complete',checkout_mode:'payment',payment_status:'paid'}]);
  assert.equal(paid.status,'paid');
  const source=await service('select public.get_sandbox_prefunded_tip_source_context($1)',[tip]);
  assert.equal(source?.amountMinor,1379);
  const facts={...source,kind:'prefunded_destination_tip',chargeId:'ch_prefunded',sourceTransferId:'tr_prefunded',destinationPaymentId:'py_prefunded',connectedCreditTransactionId:'txn_prefunded',creditAmountMinor:1379,creditFeeMinor:29,creditNetMinor:1350,availableOn:Math.floor(Date.now()/1000)-1,refundedMinor:0,reversedMinor:0,disputed:false,observedAt:Math.floor(Date.now()/1000)};
  delete facts.amountMinor;delete facts.canonicalStatus;
  const receipt=async(f=facts)=>service('select public.record_sandbox_prefunded_tip_receipt($1)',[f]);
  await assert.rejects(receipt({...facts,privatePayload:{}}),/unknown_fact/);
  await assert.rejects(receipt({...facts,creditNetMinor:1379}),/receipt_invalid/);
  await assert.rejects(receipt({...facts,creditFeeMinor:'29'}),/receipt_invalid/);
  await assert.rejects(user('select public.record_sandbox_prefunded_tip_receipt($1)',[facts]),/permission denied/);
  const {receiptId}=await receipt();
  await db.exec("update public.platform_money_kill_switches set state='off' where key in ('live_money_enabled','payouts_enabled','cashout_enabled'); update public.platform_money_kill_switches set state='sandbox_only' where key in ('stripe_connect_enabled','creator_monetization_enabled','provider_webhooks_enabled'); update private.sandbox_cashout_control set enabled=true");
  const accountQualification=await one(`insert into private.sandbox_cashout_qualifications(creator_id,platform_account_id,account_id,destination_id,payout_type,source_type,
   provider_fee_bps,provider_fee_fixed_minor,settlement_policy_version,simulated_tax_bps,simulated_platform_bps,simulated_provider_bps,simulated_provider_fixed_minor,
   manual_schedule_verified,exclusive_writer_verified,zero_additional_application_fee_verified,platform_fee_payer_verified,test_mode_verified,provider_evidence_reference,verified_at,expires_at)
   values($1,'acct_platform','acct_fixture','ba_test','scheduled','card',0,999,'SYNTHETIC_NOT_USED',0,0,0,0,true,true,true,true,true,'SYNTHETIC DISPOSABLE',now()-interval '1 minute',now()+interval '1 hour') returning id`,[creator.user_id]);
  await assert.rejects(one("insert into private.sandbox_tip_payout_qualifications(account_qualification_id,connected_payout_fee_minor,platform_billing_treatment,all_fee_attribution_verified,evidence_reference,evidence_sha256,verified_at,expires_at) values($1,10,'platform_absorbed',true,'SYNTHETIC',$2,now()-interval '1 minute',now()+interval '1 hour') returning id",[accountQualification,'a'.repeat(64)]),/null value/);
  const qualification=await one(`insert into private.sandbox_tip_payout_qualifications(account_qualification_id,connected_payout_fee_minor,platform_billing_treatment,all_fee_attribution_verified,
   approved_cost_ownership_policy_reference,approved_cost_ownership_policy_sha256,cost_ownership_approval_authority,cost_ownership_approval_verified,
   evidence_reference,evidence_sha256,verified_at,expires_at) values($1,10,'platform_absorbed',true,'SYNTHETIC APPROVED POLICY',$2,'SYNTHETIC OWNER',true,'SYNTHETIC PROVIDER',$2,now()-interval '1 minute',now()+interval '1 hour') returning id`,[accountQualification,'a'.repeat(64)]);
  const listed=await user('select public.list_my_sandbox_prefunded_tip_sources()');assert.equal(listed[0].status,'eligible_test_cashout');assert.equal(listed[0].bankMinor,1340);assert.equal(listed[0].connectedFeeMinor,10);
  const operation=randomUUID();
  const reserve=()=>user('select public.request_sandbox_prefunded_tip_cashout($1,$2,$3,$4,$5)',[receiptId,qualification,operation,1340,10]);
  const record=await reserve();assert.equal(record.executionKind,'prefunded_destination_tip');assert.equal((await reserve()).requestId,record.requestId);
  const id=record.requestId;
  await db.exec('begin');
  assert.equal((await user('select public.cancel_sandbox_prefunded_tip_cashout($1)',[id])).status,'canceled');
  assert.equal(await one('select private.sandbox_tip_remaining($1)',[tip]),1350);
  await db.exec('rollback');
  await assert.rejects(one(`insert into private.sandbox_cashout_executions(creator_id,originating_session_id,operation_id,qualification_id,gross_minor,app_fee_minor,expected_provider_fee_minor,bank_minor)
   values($1,$2,$3,$4,100,0,0,100) returning id`,[creator.user_id,creator.session_id,randomUUID(),accountQualification]),/sandbox_account_writer_pending/);
  const claim=stage=>service('select public.claim_sandbox_prefunded_tip_cashout_dispatch($1,$2)',[id,stage]);
  for(const stage of ['funding','reversal','funding_return']) await assert.rejects(claim(stage),/stage_forbidden/);
  await assert.rejects(claim('payout'),/fresh_probe_required/);
  await db.exec('begin');await db.query('insert into private.sandbox_tip_payout_revocations(qualification_id) values($1)',[qualification]);
  await claims('service_role');await db.exec('savepoint revoked');
  await assert.rejects(one('select public.claim_sandbox_prefunded_tip_cashout_dispatch($1,$2)',[id,'payout']),/dispatch_authority_required/);await db.exec('rollback');
  const balance={accountId:'acct_fixture',environment:'test',currency:'usd',sourceType:'card',availableMinor:1350,observedAt:Math.floor(Date.now()/1000)};
  await service('select public.prepare_sandbox_prefunded_tip_dispatch($1,$2,$3)',[id,receiptId,balance]);
  const claimed=await claim('payout');assert.equal(claimed.claimed,true);assert.equal((await claim('payout')).claimed,false);
  await assert.rejects(user('select public.cancel_sandbox_prefunded_tip_cashout($1)',[id]),/postclaim_cancel_forbidden/);
  const context=await service('select public.get_sandbox_prefunded_tip_cashout_context($1)',[id]);assert.equal(context.fundingMode,'prefunded_destination');assert.equal(context.transferId,null);assert.equal(context.bankMinor,1340);
  const payout={kind:'payout',objectId:'po_prefunded',status:'paid',amountMinor:1340,accountId:'acct_fixture',destinationId:'ba_test',environment:'test',balanceTransactionId:'txn_debit',failureBalanceTransactionId:null};
  const observe=(f)=>service('select public.record_sandbox_prefunded_tip_cashout_observation($1,$2,$3)',[id,null,f]);
  assert.equal((await observe(payout)).status,'needs_review','paid object alone is not actual debit proof');
  const debit={transactionId:'txn_debit',sourceId:'po_prefunded',amountMinor:-1340,feeMinor:10,netMinor:-1350,currency:'usd',status:'available',type:'payout'};
  assert.equal((await observe({...payout,payoutDebit:debit})).status,'paid');
  const credit={transactionId:'txn_return',sourceId:'po_prefunded',amountMinor:1340,feeMinor:3,netMinor:1337,currency:'usd',status:'available',type:'payout_failure'};
  const returned={...payout,status:'failed',failureBalanceTransactionId:'txn_return',payoutDebit:debit,payoutReturn:credit,returnedMinor:1337,retainedConnectedFeeMinor:13};
  await assert.rejects(observe({...returned,payoutReturn:{...credit,sourceId:'po_other'}}),/return_invalid/);
  assert.equal((await observe(returned)).status,'returned');assert.equal((await observe(returned)).status,'returned');
  assert.equal(await one('select count(*)::int from private.sandbox_tip_prefunded_returns'),1);
  assert.equal(await one('select private.sandbox_tip_remaining($1)',[tip]),1337);
  const refundAttempt=randomUUID();
  await service('select public.reserve_stripe_tip_webhook_event($1,$2,$3,$4)',['evt_prefundedRefund','charge.refunded','b'.repeat(64),refundAttempt]);
  await service("select public.process_stripe_tip_webhook_lifecycle($1,$2,$3,$4,'{}','{}')",['evt_prefundedRefund',refundAttempt,tip,{event_livemode:false,event_account:null,object_livemode:false,amount_cents:1379,currency:'usd',payment_intent_id:intent,metadata_tip_id:tip,metadata_sender_id:buyer.user_id,metadata_creator_id:creator.user_id,object_type:'charge',object_id:'ch_prefunded',amount_refunded_cents:1,refunded:false}]);
  assert.equal((await user('select public.get_my_sandbox_prefunded_tip_cashout($1)',[id])).sourceHeld,true,'canonical partial refund holds original source after return');
  await service('select public.hold_sandbox_prefunded_tip_source($1,$2)',[tip,'provider_source_reconciliation_required']);
  assert.equal((await user('select public.get_my_sandbox_prefunded_tip_cashout($1)',[id])).sourceHeld,true);
  assert.equal(await service('select public.get_sandbox_prefunded_tip_source_context($1)',[tip]),null);
  for(const role of ['anon','authenticated','service_role']) assert.equal(await one("select has_table_privilege($1,'private.sandbox_tip_payout_qualifications','INSERT')",[role]),false);
  assert.equal(await one("select bool_and(relrowsecurity and relforcerowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and relname like 'sandbox_tip_%' and relkind='r'"),true);
 } finally {await db.close();}
});
