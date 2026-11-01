import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {observe,order,fixture} from './merch-cost-observation-edge.test.mjs';

test('dormant production bridge releases qualified net, accounts late fees and restores credits without bank debits',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const root=()=>db.exec('reset role');
 const service=()=>db.exec(`reset role;set request.jwt.claim.role='service_role';set request.jwt.claims='{"role":"service_role"}';set role service_role;`);
 const product=randomUUID(),identity=randomUUID(),creator=randomUUID();
 try {
  await db.query(`insert into public.merch_products(id,display_name,provider,shipping_tracking_mode) values($1,'Synthetic release fixture','stripe_physical_goods','untracked')`,[product]);
  await db.query(`insert into public.merch_orders(id,product_id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id,created_at)
   values($1,$2,$3,$4,'stripe_physical_goods','production','paid','delivered','paid',1000,1000,'usd','cs_live_merch','pi_merch',now()-interval '40 days')`,[identity,product,order.buyer_id,creator]);
  await db.query(`insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope,
   full_permitted_scope_reviewed,professional_basis_reference,coverage_evidence_reference,collection_mode,liability_type,tax_code,tax_behavior,
   registration_evidence_reference,provider_settings_evidence_reference,provider_product_evidence_reference,provider_verified_at,provider_expires_at,expires_at,enabled)
   values('physical_merch',$1,'acct_fixture','production','US_all_destinations','all_supported_platforms',true,'SYNTHETIC only','SYNTHETIC only','automatic','self','txcd_99999999','inclusive',
   'SYNTHETIC only','SYNTHETIC only','SYNTHETIC only',now(),now()+interval '1 hour',now()+interval '1 hour',true)`,[product]);
  await service();assert.equal((await one(`select public.bind_commerce_tax_checkout_policy('physical_merch',$1,$2,'acct_fixture','production','US_all_destinations')`,[identity,product])).ready,true);
  const f=fixture(),facts=JSON.parse(JSON.stringify(await observe(order,'sk_test_synthetic','acct_fixture',f.transport)));
  Object.assign(facts,{order_id:identity,environment:'production',checkout_id:'cs_live_merch'});
  const saveFacts=()=>one('select public.record_merch_provider_cost_observation($1,$2)',[identity,JSON.stringify(facts)]);
  await saveFacts();const context=await one('select public.get_merch_fee_report_import_context($1)',[identity]);
  const release=()=>one("select public.release_commerce_known_earnings('physical_merch',$1)",[identity]);
  await root();
  await db.query(`insert into private.commerce_creator_fee_acceptances(creator_id,policy_version,terms_sha256,session_id)
   values($1,'known_costs_future_unpaid_adjustments_v1',encode(extensions.digest(private.commerce_known_cost_terms(),'sha256'),'hex'),gen_random_uuid())`,[creator]);
  await db.query(`insert into private.commerce_fee_semantic_qualifications(account_id,environment,semantics,evidence_reference,verified_at,expires_at,balance_attribution_verified)
   values('acct_fixture','live','all_fees.incurred_at.itemized.2:amount_excludes_tax_v1','SYNTHETIC only',now(),now()+interval '1 hour',true)`);
  const row={feeTransactionId:'fee_Inline',incurredBy:context.chargeId,incurredByType:'charge',amountMinor:30,taxMinor:0,currency:'usd',product:'Payments',suite:'Payments',featureName:'Processing',pricingTier:'',settledVia:'balance',balanceTransactionId:'txn_sale'};
  const evidence={schemaVersion:1,accountId:'acct_fixture',environment:'live',reportRunId:'frr_Release',fileId:'file_Release',reportType:'all_fees.incurred_at.itemized.2',intervalStart:100,intervalEnd:200,
   chargeId:context.chargeId,refundIds:[],rows:[row],unattributedRows:0,observedRowCount:1,totalFeeMinor:null,taxServiceFeeMinor:null,completeness:'unverified',financialAuthority:false,settlementReady:false,
   holdReasons:['fee_report_coverage_unverified','tax_service_fee_unverified'],providerBinding:'authenticated_report',contentSha256:'a'.repeat(64),reportSucceededAt:300};
  const report=(patch={})=>one('select public.record_merch_fee_report_observation($1,$2,$3)',[identity,context.sourceObservationId,JSON.stringify({...evidence,...patch})]);
  await service();await report();await assert.rejects(release(),/activation_disabled/);
  const drain=()=>one('select public.process_commerce_fee_accounting_jobs(1,$1)',[identity]);
  const blocked=await drain();assert.equal(blocked.outcomes[0].status,'blocked');assert.equal(blocked.outcomes[0].reason,'commerce_earnings_activation_disabled');
  await root();assert.equal(await one('select state from private.commerce_fee_accounting_jobs where source_id=$1',[identity]),'blocked');
  await root();await db.exec("update public.platform_money_kill_switches set state='on' where key in ('live_money_enabled','payouts_enabled','stripe_connect_enabled')");
  await service();await assert.rejects(release(),/clearance_required/);
  await root();
  await db.query(`insert into public.stripe_merch_events(stripe_event_id,event_type,status,linked_order_id,object_id,raw_event_hash,environment)
   values('evt_Purchase','payment_intent.succeeded','processed',$1,'pi_merch',repeat('a',64),'production')`,[identity]);
  await db.query(`insert into private.merch_purchase_time_evidence(order_id,stripe_event_id,stripe_payment_intent_id,succeeded_at,raw_event_hash)
   values($1,'evt_Purchase','pi_merch',clock_timestamp()-interval '31 days',repeat('a',64))`,[identity]);
  await db.query(`insert into private.merch_return_evidence(order_id,delivered_at,evidence_reference,delivery_state,return_state,dispute_state)
   values($1,null,'SYNTHETIC CLEARANCE ONLY','not_applicable','none','none')`,[identity]);
  const state=await one('select private.merch_return_hold_state(o,clock_timestamp()) from public.merch_orders o where id=$1',[identity]);
  assert.equal(state.returnWindowStatus,'elapsed',JSON.stringify(state));
  await service();await assert.rejects(release(),/clearance_required/,'canonical fulfillment receipt is independently required');
  await root();await db.query(`insert into private.commerce_earnings_qualifications(creator_id,platform_account_id,recipient_account_id,environment,currency,platform_held_funding_verified,no_automatic_transfer_verified,evidence_reference,verified_at,expires_at)
   values($1,'acct_fixture','acct_recipient','live','usd',true,true,'SYNTHETIC only',now(),now()+interval '1 hour')`,[creator]);
  await service();await assert.rejects(release(),/clearance_required/,'a status string alone is not canonical fulfillment evidence');
  await root();
  await db.query("update public.merch_orders set fulfillment_status='not_started' where id=$1",[identity]);
  await service();await assert.rejects(release(),/clearance_required/,'elapsed untracked return window cannot fulfill an unshipped order');
  await root();await db.query("update public.merch_orders set fulfillment_status='delivered' where id=$1",[identity]);
  await db.query(`insert into private.merch_fulfillment_receipts(order_id,creator_id,actor_session_id,fulfillment_revision,previous_status,status)
   select id,creator_id,gen_random_uuid(),fulfillment_revision,'processing','shipped' from public.merch_orders where id=$1`,[identity]);
  await service();await assert.rejects(release(),/clearance_required/,'inconsistent receipt and current status cannot release');
  await root();await db.query("update public.merch_orders set fulfillment_status='shipped' where id=$1",[identity]);
  await db.query(`insert into private.merch_fulfillment_receipts(order_id,creator_id,actor_session_id,fulfillment_revision,previous_status,status)
   select id,creator_id,gen_random_uuid(),fulfillment_revision,'processing','shipped' from public.merch_orders where id=$1`,[identity]);
  await service();const first=await release();assert.equal(Number(first.delta_minor),783);assert.ok(first.earnings_ledger_id);assert.equal((await release()).id,first.id);
  await root();const available=id=>one('select public.creator_earnings_withdrawable_cents_internal($1,clock_timestamp())',[id]);
  assert.equal(await available(first.earnings_ledger_id),783);
  await db.query("update public.merch_orders set fulfillment_status='blocked' where id=$1",[identity]);
  assert.equal(await available(first.earnings_ledger_id),0,'post-release fulfillment block prevents cashout');
  await db.query("update public.merch_orders set fulfillment_status='shipped' where id=$1",[identity]);
  assert.equal(await available(first.earnings_ledger_id),0,'restoring status alone does not restore canonical revision evidence');
  await db.query(`insert into private.merch_fulfillment_receipts(order_id,creator_id,actor_session_id,fulfillment_revision,previous_status,status)
   select id,creator_id,gen_random_uuid(),fulfillment_revision,'processing','shipped' from public.merch_orders where id=$1`,[identity]);
  assert.equal(await available(first.earnings_ledger_id),783);
  for (const [returnState,disputeState] of [['open','none'],['none','open'],['resolved','resolved']]) {
   await db.query(`insert into private.merch_return_evidence(order_id,delivered_at,evidence_reference,delivery_state,return_state,dispute_state)
    values($1,null,'SYNTHETIC post-release hold '||$2||' '||$3,'not_applicable',$2,$3)`,[identity,returnState,disputeState]);
   assert.equal(await available(first.earnings_ledger_id),returnState==='resolved'?783:0,'current return/dispute clearance is required after release');
  }
  await db.exec('begin');
  await db.exec("update private.commerce_tax_qualifications set revoked_at=clock_timestamp() where feature='physical_merch'");
  assert.equal(await available(first.earnings_ledger_id),0,'current tax qualification is required after release');
  await db.exec('rollback');
  await service();await report({reportRunId:'frr_Late',rows:[{...row,feeTransactionId:'fee_Late',amountMinor:100,balanceTransactionId:'txn_late'}]});
  await root();assert.equal(await available(first.earnings_ledger_id),0,'stale amount cannot cash out');
  await service();assert.equal((await drain()).outcomes[0].status,'completed');
  const debt=await release();assert.equal(Number(debt.delta_minor),-90);assert.ok(debt.adjustment_id);
  const recovery=await one('select public.reconcile_creator_fee_recovery($1)',[creator]);assert.equal(recovery.offsetMinor,0);assert.equal(recovery.remainingMinor,90);assert.equal(recovery.bankDebitPerformed,false);
  await root();assert.equal(await available(first.earnings_ledger_id),783,'previously recorded earnings are not automatically deducted');
  await service();await report({reportRunId:'frr_Credit',rows:[{...row,feeTransactionId:'fee_Credit',amountMinor:-100,balanceTransactionId:'txn_credit'}]});
  const credit=await release();assert.equal(Number(credit.delta_minor),90);assert.ok(credit.earnings_ledger_id);
  await one('select public.reconcile_creator_fee_recovery($1)',[creator]);
  await root();assert.equal(await available(credit.earnings_ledger_id),0);assert.equal(await available(first.earnings_ledger_id),783);
  assert.equal(await one('select count(*)::int from private.commerce_payable_releases where source_id=$1',[identity]),3);
  // Positive-tax partial refund advances the immutable source. Refund repair
  // stays authoritative even while all money execution switches are OFF.
  const partial={...facts,refunded_minor:500,tax_reversal_minor:50,
   refunds:[{id:'re_Partial',balance_id:'txn_partial',amount:500,fee:0,net:-500,status:'available'}],
   refund_tax_evidence:{provenance:'stripe_tax_association_get_v1',association_id:'taxa_merch',original_tax_transaction_id:'tax_original',
    payment_intent_id:'pi_merch',currency:'usd',gross_minor:1000,original_tax_minor:100,refunded_minor:500,tax_reversal_minor:50,
    refunds:[{refund_id:'re_Partial',refund_minor:500,tax_reversal_minor:50,tax_transaction_id:'tax_refund'}]}};
  await service();await one('select public.record_merch_provider_cost_observation($1,$2)',[identity,JSON.stringify(partial)]);
  await assert.rejects(report({reportRunId:'frr_Stale'}),/source_observation_stale/);
  const updated=await one('select public.get_merch_fee_report_import_context($1)',[identity]);
  await one('select public.record_merch_fee_report_observation($1,$2,$3)',[identity,updated.sourceObservationId,
   JSON.stringify({...evidence,reportRunId:'frr_Partial',refundIds:['re_Partial']})]);
  await root();await db.exec("update public.platform_money_kill_switches set state='off' where key in ('live_money_enabled','payouts_enabled','stripe_connect_enabled')");
  await service();const refundAdjustment=await release();assert.equal(Number(refundAdjustment.delta_minor),-405);
  assert.equal((await release()).id,refundAdjustment.id,'refund replay cannot create another debt');
  await root();assert.equal(await one('select count(*)::int from private.stripe_refund_tax_evidence'),1);
  assert.equal(Number(await one("select private.creator_fee_recovery_amount($1,'usd')",[creator])),405);
  await db.query(`insert into private.commerce_fee_qualification_revocations(qualification_kind,qualification_id,evidence_reference)
   select 'funding',id,'SYNTHETIC revocation' from private.commerce_earnings_qualifications where creator_id=$1`,[creator]);
  assert.equal(await available(first.earnings_ledger_id),0,'revoked funding evidence immediately blocks existing earning dispatch');
  await db.query(`insert into private.commerce_earnings_qualifications(creator_id,platform_account_id,recipient_account_id,environment,currency,platform_held_funding_verified,no_automatic_transfer_verified,evidence_reference,verified_at,expires_at)
   values($1,'acct_fixture','acct_recipient','live','usd',true,true,'SYNTHETIC renewed verification',clock_timestamp(),clock_timestamp()+interval '1 hour')`,[creator]);
  assert.equal(await available(first.earnings_ledger_id),783,'exact fresh funding evidence can restore eligibility, while separate negative balance still blocks cashout');
  await db.query(`insert into private.commerce_fee_qualification_revocations(qualification_kind,qualification_id,evidence_reference)
   select 'semantics',id,'SYNTHETIC semantic revocation' from private.commerce_fee_semantic_qualifications where environment='live'`);
  assert.equal(await one("select private.commerce_tax_fee_settlement_ready('physical_merch',$1)",[identity]),false);
  await service();await assert.rejects(release(),/fee_semantics_qualification_required/);await root();
  await assert.rejects(db.exec('delete from private.commerce_fee_qualification_revocations'),/immutable/);
  assert.equal(await one('select count(*)::int from public.creator_payout_requests'),0,'accounting never creates a provider payout');
 }finally{await db.close();}
});
