import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {seedQualifiedCommerceMerch} from '../helpers/qualified-commerce-merch-fixture.mjs';
test('full refund accounting avoids double restriction after future-only recovery, without clearing active disputes',{timeout:240000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
 try {
  const {one,root,service,identity,creator,facts,release,evidence,row}=await seedQualifiedCommerceMerch(db);
  await service();const first=await release();
  const full={...facts,refunded_minor:1000,tax_reversal_minor:100,refunds:[{id:'re_Full',balance_id:'txn_full',amount:1000,fee:0,net:-1000,status:'available'}]};
  await one('select public.record_merch_provider_cost_observation($1,$2)',[identity,JSON.stringify(full)]);
  const context=await one('select public.get_merch_fee_report_import_context($1)',[identity]);
  const report=(patch={})=>one('select public.record_merch_fee_report_observation($1,$2,$3)',[identity,context.sourceObservationId,JSON.stringify({...evidence,reportRunId:'frr_Full',refundIds:['re_Full'],...patch})]);
  await report();await root();
  await db.query("update public.merch_orders set fulfillment_status='blocked' where id=$1",[identity]);
  await service();const debt=await release();assert.equal(Number(debt.delta_minor),-813);
  await root();
  assert.equal(await one("select private.creator_fee_recovery_outstanding($1,'usd')",[creator]),true,'debt still blocks actual cashout');
  const credit=await one("select private.record_creator_verified_fee_credit($1,$2,'cashout_fee',gen_random_uuid(),repeat('9',64),813,'acct_fixture','acct_recipient')",[creator,first.earnings_ledger_id]);
  assert.equal(Number(await one("select private.consume_creator_fee_recovery($1,'usd')",[creator])),813);
  assert.equal(await one("select private.creator_fee_recovery_outstanding($1,'usd')",[creator]),false);
  const available=id=>one('select public.creator_earnings_withdrawable_cents_internal($1,clock_timestamp())',[id]);
  assert.equal(await available(credit),0);
  assert.equal(await available(first.earnings_ledger_id),783,'historical delivery hold cannot confiscate the original amount again after exact full-refund debt recovery');
  await db.query(`insert into private.merch_return_evidence(order_id,delivered_at,evidence_reference,delivery_state,return_state,dispute_state)
   values($1,null,'SYNTHETIC active dispute','not_applicable','open','open')`,[identity]);
  assert.equal(await available(first.earnings_ledger_id),0,'independent active dispute remains blocking');
  await db.query(`insert into private.merch_return_evidence(order_id,delivered_at,evidence_reference,delivery_state,return_state,dispute_state)
   values($1,null,'SYNTHETIC resolved dispute','not_applicable','open','resolved')`,[identity]);
  assert.equal(await available(first.earnings_ledger_id),783);
  await service();await report({reportRunId:'frr_FullFeeCredit',rows:[{...row,feeTransactionId:'fee_FullCredit',amountMinor:-30,balanceTransactionId:'txn_FullCredit'}]});
  const correction=await release();assert.equal(Number(correction.delta_minor),30,'late actual fee correction is credited even though historical fulfillment is blocked');
  await root();assert.equal(await available(correction.earnings_ledger_id),30);
  assert.equal(await one('select count(*)::int from public.creator_payout_requests'),0);
 }finally{await db.close();}
});
