import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {createFeeReportAuctionFixture} from '../helpers/fee-report-auction-fixture.mjs';
import {observe,order,fixture} from './merch-cost-observation-edge.test.mjs';

test('fee components bind real merch and auction observations; overlap never duplicates costs or creates authority', {timeout:240000}, async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const root=()=>db.exec('reset role');
 const service=()=>db.exec(`reset role; select set_config('request.jwt.claims','{"role":"service_role"}',false); select set_config('request.jwt.claim.role','service_role',false); set role service_role;`);
 try {
  await db.query(`insert into public.merch_orders(id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id)
   values($1,$2,'e7100000-0000-4000-8000-000000000003','stripe_physical_goods','sandbox','paid','not_started','paid',1000,1000,'usd','cs_test_merch','pi_merch')`,[order.id,order.buyer_id]);
  const f=fixture(), facts=JSON.parse(JSON.stringify(await observe(order,'sk_test_synthetic','acct_fixture',f.transport)));
  await service();
  await one('select public.record_merch_provider_cost_observation($1,$2)',[order.id,JSON.stringify(facts)]);
  const context=await one('select public.get_merch_fee_report_import_context($1)',[order.id]);
  assert.equal(context.orderId,order.id);assert.equal(context.environment,'test');
  const evidence={schemaVersion:1,accountId:context.accountId,environment:'test',reportRunId:'frr_Merch',fileId:'file_Merch',reportType:'all_fees.incurred_at.itemized.2',intervalStart:100,intervalEnd:200,
   chargeId:context.chargeId,refundIds:[],rows:[{feeTransactionId:'fee_One',incurredBy:context.chargeId,incurredByType:'charge',amountMinor:10,taxMinor:1,currency:'usd',product:'Tax',suite:'Revenue',featureName:'Automatic tax',pricingTier:'',settledVia:'balance'}],
   unattributedRows:0,observedRowCount:1,totalFeeMinor:null,taxServiceFeeMinor:null,completeness:'unverified',financialAuthority:false,settlementReady:false,
   holdReasons:['fee_report_coverage_unverified','tax_service_fee_unverified'],providerBinding:'authenticated_report',contentSha256:'a'.repeat(64),reportSucceededAt:300};
  const save=(patch={},source=context.sourceObservationId)=>one('select public.record_merch_fee_report_observation($1,$2,$3)',[order.id,source,JSON.stringify({...evidence,...patch})]);
  const summary=()=>one('select public.get_commerce_fee_component_summary(null,$1)',[order.id]);
  assert.equal((await summary()).componentCount,0);
  assert.equal((await summary()).totalFeeMinor,null,'empty archive is not zero fee proof');
  await root();
  for(const role of ['anon','authenticated','service_role']) {
   await db.exec(`set role ${role}`);
   for(const table of ['commerce_fee_components','commerce_fee_component_sources'])
    await assert.rejects(db.query(`select * from private.${table}`),/permission denied/);
   if(role!=='service_role'){await assert.rejects(save(),/permission denied/);await assert.rejects(summary(),/permission denied/);}
   await root();
  }
  await service();
  const first=await save();assert.equal(first.status,'observed_only');
  assert.equal((await save()).observationId,first.observationId);
  await save({reportRunId:'frr_Overlap',fileId:'file_Overlap',contentSha256:'b'.repeat(64)});
  let s=await summary();assert.equal(s.reportCount,2);assert.equal(s.componentCount,1);
  assert.equal(s.groups[0].observedAmountMinor,'10');assert.equal(s.groups[0].observedTaxMinor,'1');
  assert.equal(s.totalFeeMinor,null);assert.equal(s.finalNetMinor,null);assert.equal(s.financialAuthority,false);
  await assert.rejects(save({reportRunId:'frr_Conflict',rows:[{...evidence.rows[0],amountMinor:11}]}),/fee_component_conflicting/);
  await assert.rejects(save({reportRunId:'frr_RouteChanged',rows:[{...evidence.rows[0],settledVia:'credit'}]}),/fee_component_conflicting/);
  assert.equal((await summary()).reportCount,2,'conflict rolls report and component changes back together');
  await save({reportRunId:'frr_Adjustment',fileId:'file_Adjustment',rows:[{...evidence.rows[0],feeTransactionId:'fee_Adjustment',amountMinor:-3,taxMinor:-1}]});
  s=await summary();assert.equal(s.componentCount,2);assert.equal(s.groups[0].observedAmountMinor,'7');assert.equal(s.groups[0].observedTaxMinor,'0');
  await save({reportRunId:'frr_OverCredit',fileId:'file_OverCredit',rows:[{...evidence.rows[0],feeTransactionId:'fee_OverCredit',amountMinor:-100,taxMinor:0}]});
  s=await summary();assert.equal(s.groups[0].observedAmountMinor,'-93');assert.equal(s.settlementReady,false,'negative observed costs cannot manufacture payable money');
  for(const patch of [{environment:'live'},{accountId:'acct_other'},{chargeId:'ch_other'},{refundIds:['re_unbound']},{rows:[{...evidence.rows[0],currency:'eur'}]},
   {rows:[evidence.rows[0],evidence.rows[0]],observedRowCount:2},{financialAuthority:true},{totalFeeMinor:0},{rawCsv:'private'}])await assert.rejects(save(patch));
  await root();
  for(const table of ['commerce_fee_components','commerce_fee_component_sources']){
   await assert.rejects(db.query(`delete from private.${table}`),/immutable/);
   assert.equal(await one('select relrowsecurity and relforcerowsecurity from pg_class where oid=$1::regclass',[`private.${table}`]),true);
  }
  assert.equal(await one('select private.commerce_tax_fee_settlement_ready(\'physical_merch\',$1)',[order.id]),false);
  // Same row belongs to one sale, never two sources/cross-lane recipients.
  await db.exec(`reset request.jwt.claim.role; reset request.jwt.claims;`);
  const auction=await createFeeReportAuctionFixture(db);
  await service();
  const a=await one('select public.get_commerce_fee_report_import_context($1)',[auction.contract]);
  await one('select public.record_commerce_fee_report_observation($1,$2,$3)',[auction.contract,a.sourceObservationId,JSON.stringify({...evidence,accountId:a.accountId,
   chargeId:a.chargeId,reportRunId:'frr_Auction',rows:[{...evidence.rows[0],incurredBy:a.chargeId}]})]);
  const as=await one('select public.get_commerce_fee_component_summary($1,null)',[auction.contract]);
  assert.equal(as.componentCount,1);assert.equal(as.financialAuthority,false);
  // New refund invalidates old source ingestion, without rewriting fee history.
  const partial={...facts,refunded_minor:500,tax_reversal_minor:null,refunds:[{id:'re_new',balance_id:'txn_new',amount:500,fee:0,net:-500,status:'available'}]};
  await one('select public.record_merch_provider_cost_observation($1,$2)',[order.id,JSON.stringify(partial)]);
  await assert.rejects(save({reportRunId:'frr_Stale'}),/fee_source_observation_stale/);
  await root();assert.equal(await one('select count(*)::int from public.creator_earnings_ledger'),0);
 } finally {await db.close();}
});
