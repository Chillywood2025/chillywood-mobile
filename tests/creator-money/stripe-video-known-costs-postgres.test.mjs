import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {seedCommerceBuyer,seedQualifiedCommerceCreator} from '../helpers/automatic-commerce-fixture.mjs';

test('verified video costs append exact nonpayable held earnings and immutable later deltas',{timeout:1200000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const buyer={id:randomUUID(),session:randomUUID()},creator={id:randomUUID(),session:randomUUID()},video=randomUUID(),order=randomUUID();
 try{
  await db.exec(`set request.jwt.claim.role='service_role';set request.jwt.claims='{"role":"service_role"}'`);
  await seedCommerceBuyer(db,buyer);await seedQualifiedCommerceCreator(db,creator);
  await db.query(`insert into private.stripe_paid_video_orders(id,buyer_id,session_id,video_id,creator_id,price_id,price_revision,amount_minor,currency,stripe_account_id,stripe_product_id,request_id,status,checkout_session_id,payment_intent_id,charge_id,expires_at)
   values($1,$2,$3,$4,$5,$6,1,1000,'usd','acct_test','prod_video',$7,'checkout_ready','cs_test_cost','pi_cost','ch_cost',now()+interval '1 hour')`,[order,buyer.id,buyer.session,video,creator.id,randomUUID(),randomUUID()]);
  const facts={livemode:false,accountId:'acct_test',checkoutSessionId:'cs_test_cost',orderId:order,buyerId:buyer.id,videoId:video,productId:'prod_video',currency:'usd',amountMinor:1000,paymentStatus:'paid',paymentIntentStatus:'succeeded',platformHeld:true,chargePaid:true,paymentIntentId:'pi_cost',chargeId:'ch_cost',refundAmountMinor:0};
  await one('select public.observe_stripe_sandbox_video_payment($1,$2,$3::jsonb)',[order,'evt_cost',JSON.stringify(facts)]);
  const descriptor={reportRunId:'frr_first',fileId:'file_first',intervalStart:100,intervalEnd:200};
  const component={feeTransactionId:'fee_one',incurredBy:'ch_cost',incurredByType:'charge',amountMinor:40,taxMinor:0,currency:'usd',product:'payments',suite:'payments',featureName:'card',pricingTier:'',settledVia:'balance',balanceTransactionId:'txn_charge'};
  const input={policyVersion:'known_costs_future_unpaid_adjustments_v1',feeSemantics:'all_fees.incurred_at.itemized.2:amount_excludes_tax_v1',accountId:'acct_test',environment:'test',chargeId:'ch_cost',currency:'usd',grossMinor:1000,taxMinor:100,refundedMinor:0,taxReversalMinor:0,platformBps:2000,
   balances:[{id:'txn_charge',objectId:'ch_cost',feeMinor:40}],reports:[{...descriptor,accountId:'acct_test',environment:'test',chargeId:'ch_cost',refundIds:[],rows:[component],providerBinding:'authenticated_report',reportType:'all_fees.incurred_at.itemized.2',contentSha256:'a'.repeat(64),reportSucceededAt:201}]};
  const record=async(value=input,reports=[descriptor])=>one('select public.record_stripe_video_known_costs($1,$2::jsonb,$3::jsonb)',[order,JSON.stringify(value),JSON.stringify(reports)]);
  await assert.rejects(record(),/creator_fee_policy_acceptance_required/);
  await db.query(`insert into private.commerce_creator_fee_acceptances(creator_id,policy_version,terms_sha256,session_id) values($1,'known_costs_future_unpaid_adjustments_v1',encode(extensions.digest(private.commerce_known_cost_terms(),'sha256'),'hex'),$2)`,[creator.id,creator.session]);
  await assert.rejects(record(),/fee_semantics_qualification_required/);
  const qualification=await one(`insert into private.commerce_fee_semantic_qualifications(account_id,environment,semantics,evidence_reference,verified_at,expires_at,balance_attribution_verified) values('acct_test','test','all_fees.incurred_at.itemized.2:amount_excludes_tax_v1','synthetic test only',now(),now()+interval '1 hour',true) returning id`);
  const initial=await record();assert.equal(initial.creatorTargetMinor,688);assert.equal(initial.deltaMinor,688);assert.equal(initial.payoutCreated,false);
  assert.equal((await record()).replayed,true);
  const earning=(await db.query('select * from public.creator_earnings_ledger where id=$1',[initial.earningsId])).rows[0];
  assert.equal(earning.net_creator_amount_cents,688);assert.equal(earning.platform_fee_cents,172);assert.equal(earning.provider_fee_cents,40);assert.equal(earning.tax_cents,100);assert.equal(earning.ledger_status,'held');
  assert.equal(await one('select public.creator_earnings_withdrawable_cents_internal($1,now())',[initial.earningsId]),0);
  // A newly observed standalone fee changes the existing held balance by a
  // signed delta, never a second full-sale credit.
  const second=structuredClone(input),next={reportRunId:'frr_next',fileId:'file_next',intervalStart:100,intervalEnd:250};
  second.reports.push({...second.reports[0],...next,contentSha256:'b'.repeat(64),reportSucceededAt:251,rows:[{...component,feeTransactionId:'fee_two',amountMinor:10,balanceTransactionId:'txn_standalone'}]});
  const changed=await record(second,[descriptor,next]);assert.equal(changed.creatorTargetMinor,680);assert.equal(changed.deltaMinor,-8);
  assert.equal(await one(`select sum(net_creator_amount_cents)::int from public.creator_earnings_ledger where metadata->>'stripe_video_order_id'=$1`,[order]),680);
  const altered=structuredClone(second);altered.reports[0].rows[0].amountMinor=41;
  await assert.rejects(record(altered,[descriptor,next]),/historical_component_missing_or_changed/);
  await assert.rejects(record({...second,taxMinor:null},[descriptor,next]),/amount_unknown_or_stale/);
  await assert.rejects(record({...second,environment:'live'},[descriptor,next]),/identity_mismatch/);
  await assert.rejects(one("select public.release_commerce_known_earnings('paid_video',$1)",[order]),/fee_feature_invalid/);
  await one('select public.observe_stripe_sandbox_video_payment($1,$2,$3::jsonb)',[order,'evt_cost_refund',JSON.stringify({...facts,refundAmountMinor:100})]);
  const refunded=structuredClone(second);refunded.refundedMinor=100;refunded.taxReversalMinor=10;
  refunded.balances.push({id:'txn_refund',objectId:'re_one',feeMinor:0});
  refunded.reports.forEach(r=>{r.refundIds=['re_one'];});
  const refundResult=await record(refunded,[descriptor,next]);assert.equal(refundResult.creatorTargetMinor,608);assert.equal(refundResult.deltaMinor,-72);
  assert.equal(await one(`select sum(net_creator_amount_cents)::int from public.creator_earnings_ledger where metadata->>'stripe_video_order_id'=$1`,[order]),608);
  assert.equal((await record(refunded,[descriptor,next])).replayed,true);
  await db.query(`insert into private.commerce_fee_qualification_revocations(qualification_kind,qualification_id,evidence_reference) values('semantics',$1,'synthetic revoked')`,[qualification]);
  await assert.rejects(record(refunded,[descriptor,next]),/fee_semantics_qualification_required/);
  await db.exec('set role authenticated');await assert.rejects(record(),/permission denied/);await db.exec('reset role');
  await assert.rejects(db.exec('delete from private.stripe_video_cost_evidence'),/immutable/);
 }finally{await db.close();}
});
