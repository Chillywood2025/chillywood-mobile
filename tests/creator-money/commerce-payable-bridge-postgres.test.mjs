import test from 'node:test';
import assert from 'node:assert/strict';
import {seedQualifiedCommerceMerch} from '../helpers/qualified-commerce-merch-fixture.mjs';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {observe,order,fixture} from './merch-cost-observation-edge.test.mjs';

test('dormant production bridge releases qualified net, accounts late fees and restores credits without bank debits',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const root=()=>db.exec('reset role');
 const service=()=>db.exec(`reset role;set request.jwt.claim.role='service_role';set request.jwt.claims='{"role":"service_role"}';set role service_role;`);
 try {
  const f=fixture();
  const {identity,creator,facts,context,release,report,drain,evidence,row}=await seedQualifiedCommerceMerch(db,await observe(order,'sk_test_synthetic','acct_fixture',f.transport));
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
