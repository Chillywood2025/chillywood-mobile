import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {observe,order,fixture} from './merch-cost-observation-edge.test.mjs';

test('accepted known-cost snapshots bind real observations, deduplicate fees and invalidate on late evidence',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const root=()=>db.exec('reset role');
 const service=()=>db.exec(`reset role; select set_config('request.jwt.claims','{"role":"service_role"}',false); select set_config('request.jwt.claim.role','service_role',false); set role service_role;`);
 try {
  await db.query(`insert into public.merch_orders(id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id)
   values($1,$2,'e7100000-0000-4000-8000-000000000003','stripe_physical_goods','sandbox','paid','not_started','paid',1000,1000,'usd','cs_test_merch','pi_merch')`,[order.id,order.buyer_id]);
  const f=fixture(),facts=JSON.parse(JSON.stringify(await observe(order,'sk_test_synthetic','acct_fixture',f.transport)));
  await service();await one('select public.record_merch_provider_cost_observation($1,$2)',[order.id,JSON.stringify(facts)]);
  const context=await one('select public.get_merch_fee_report_import_context($1)',[order.id]);
  const row={feeTransactionId:'fee_Processing',incurredBy:context.chargeId,incurredByType:'charge',amountMinor:30,taxMinor:0,currency:'usd',product:'Payments',suite:'Payments',featureName:'Processing',pricingTier:'',settledVia:'balance',balanceTransactionId:'txn_sale'};
  const evidence={schemaVersion:1,accountId:context.accountId,environment:'test',reportRunId:'frr_Known',fileId:'file_Known',reportType:'all_fees.incurred_at.itemized.2',intervalStart:100,intervalEnd:200,
   chargeId:context.chargeId,refundIds:[],rows:[row],unattributedRows:0,observedRowCount:1,totalFeeMinor:null,taxServiceFeeMinor:null,completeness:'unverified',financialAuthority:false,settlementReady:false,
   holdReasons:['fee_report_coverage_unverified','tax_service_fee_unverified'],providerBinding:'authenticated_report',contentSha256:'a'.repeat(64),reportSucceededAt:300};
  const save=(patch={})=>one('select public.record_merch_fee_report_observation($1,$2,$3)',[order.id,context.sourceObservationId,JSON.stringify({...evidence,...patch})]);
  const reconcile=()=>one("select public.reconcile_commerce_known_costs('physical_merch',$1)",[order.id]);
  await assert.rejects(reconcile(),/acceptance_required/);
  await root();
  // Test-only explicit acceptance fixture; production acceptance is exercised
  // through its authenticated RPC in creator-fee-policy-postgres.test.mjs.
  await db.query(`insert into private.commerce_creator_fee_acceptances(creator_id,policy_version,terms_sha256,session_id)
   values('e7100000-0000-4000-8000-000000000003','known_costs_future_unpaid_adjustments_v1',encode(extensions.digest(private.commerce_known_cost_terms(),'sha256'),'hex'),gen_random_uuid())`);
  await service();await assert.rejects(reconcile(),/qualification_required/);
  await root();await db.query(`insert into private.commerce_fee_semantic_qualifications(account_id,environment,semantics,evidence_reference,verified_at,expires_at,balance_attribution_verified)
   values('acct_fixture','test','all_fees.incurred_at.itemized.2:amount_excludes_tax_v1','synthetic independent qualification',now(),now()+interval '1 hour',true)`);
  await service();await assert.rejects(reconcile(),/current_fee_report_required/);await save();
  let s=await reconcile();assert.equal(Number(s.fee_minor),30);assert.equal(Number(s.creator_minor),783);assert.equal(s.finalFees,false);
  assert.equal((await reconcile()).id,s.id,'same evidence creates one immutable successor');
  await root();assert.equal(await one("select private.commerce_tax_fee_settlement_ready('physical_merch',$1)",[order.id]),true);
  assert.equal(await one('select count(*)::int from private.merch_held_net_allocations where order_id=$1',[order.id]),2);
  assert.ok((await one('select hold_reasons from private.merch_held_net_allocations where fee_snapshot_id=$1',[s.id])).includes('sandbox_not_payable'));
  await service();await save({reportRunId:'frr_Late',rows:[{...row,feeTransactionId:'fee_Tax',product:'Tax',featureName:'Automatic tax',amountMinor:5,taxMinor:1,balanceTransactionId:'txn_tax'}]});
  await root();assert.equal(await one("select private.commerce_tax_fee_settlement_ready('physical_merch',$1)",[order.id]),false);
  await service();s=await reconcile();assert.equal(Number(s.fee_minor),36);assert.equal(Number(s.creator_minor),778);
  await save({reportRunId:'frr_Overlap',contentSha256:'b'.repeat(64)});s=await reconcile();assert.equal(Number(s.fee_minor),36);
  await save({reportRunId:'frr_Credit',rows:[{...row,feeTransactionId:'fee_Credit',amountMinor:-3,balanceTransactionId:'txn_credit'}]});s=await reconcile();assert.equal(Number(s.fee_minor),33);
  await save({reportRunId:'frr_OverCredit',rows:[{...row,feeTransactionId:'fee_OverCredit',amountMinor:-100,balanceTransactionId:'txn_overcredit'}]});await assert.rejects(reconcile(),/overcredit/);
  await root();assert.equal(await one("select private.commerce_tax_fee_settlement_ready('physical_merch',$1)",[order.id]),false);
  const zeroId='e7100000-0000-4000-8000-000000000004';
  await db.query(`insert into public.merch_orders(id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id)
   values($1,$2,'e7100000-0000-4000-8000-000000000003','stripe_physical_goods','sandbox','paid','not_started','paid',1000,1000,'usd','cs_test_zero','pi_zero')`,[zeroId,order.buyer_id]);
  await service();await one('select public.record_merch_provider_cost_observation($1,$2)',[zeroId,JSON.stringify({...facts,order_id:zeroId,
   checkout_id:'cs_test_zero',payment_intent_id:'pi_zero',charge_id:'ch_zero',balance_id:'txn_zero',provider_fee_minor:0,charge_net_minor:1000})]);
  const zeroContext=await one('select public.get_merch_fee_report_import_context($1)',[zeroId]);
  await assert.rejects(one("select public.reconcile_commerce_known_costs('physical_merch',$1)",[zeroId]),/current_fee_report_required/);
  await one('select public.record_merch_fee_report_observation($1,$2,$3)',[zeroId,zeroContext.sourceObservationId,JSON.stringify({...evidence,
   reportRunId:'frr_Zero',fileId:'file_Zero',chargeId:'ch_zero',rows:[],observedRowCount:0})]);
  const zero=await one("select public.reconcile_commerce_known_costs('physical_merch',$1)",[zeroId]);
  assert.equal(Number(zero.fee_minor),0,'explicit verified inline zero is known zero, not inferred from absent data');
  assert.equal(Number(zero.creator_minor),810);assert.equal(zero.finalFees,false);assert.equal(zero.futureAdjustmentsPossible,true);
  await root();
  await assert.rejects(db.exec('delete from private.commerce_known_cost_snapshots'),/immutable/);
 }finally{await db.close();}
});
