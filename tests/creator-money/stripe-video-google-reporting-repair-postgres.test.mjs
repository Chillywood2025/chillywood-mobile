import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {seedCommerceBuyer,seedQualifiedCommerceCreator} from '../helpers/automatic-commerce-fixture.mjs';

test('separate Google repair preserves committed refund and enriches one existing reporting obligation',{timeout:1200000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const buyer={id:randomUUID(),session:randomUUID()},creator={id:randomUUID(),session:randomUUID()};
 const order=randomUUID(),video=randomUUID(),price=randomUUID(),paidTime='2026-01-01T00:00:00.000Z',refundTime='2026-01-02T00:00:00.000Z';
 try{
  await db.exec(`set request.jwt.claim.role='service_role';set request.jwt.claims='{"role":"service_role"}'`);
  await seedCommerceBuyer(db,buyer);await seedQualifiedCommerceCreator(db,creator);
  const program=await one(`insert into private.google_play_external_program_config(package_name,environment,enrollment_evidence,license_test_qualification_evidence,tax_configuration_evidence,reporter_configuration_evidence,native_build_qualification_evidence,verified_at,expires_at,enabled)
   values('com.chillywood.mobile','test','synthetic','synthetic','synthetic','synthetic','synthetic',now(),now()+interval '1 hour',true) returning id`);
  const route=await one(`insert into private.stripe_video_native_routes(platform,stripe_account_id,stripe_product_id,qualification_reference,native_build_reference,google_program_id,verified_at,expires_at,enabled)
   values('android','acct_test','prod_video','synthetic','synthetic',$1,now(),now()+interval '1 hour',true) returning id`,[program]);
  await db.query(`insert into private.stripe_paid_video_orders(id,buyer_id,session_id,video_id,creator_id,price_id,price_revision,amount_minor,currency,stripe_account_id,stripe_product_id,request_id,status,checkout_session_id,expires_at)
   values($1,$2,$3,$4,$5,$6,2,1000,'usd','acct_test','prod_video',$7,'checkout_ready','cs_test_video',now()+interval '1 hour')`,[order,buyer.id,buyer.session,video,creator.id,price,randomUUID()]);
  const token='synthetic-report-repair-token',hash=createHash('sha256').update(token).digest('hex');
  const admission=await one(`insert into private.stripe_video_native_admissions(order_id,route_id,buyer_id,session_id,video_id,creator_id,price_id,price_revision,amount_minor,currency,platform,token_hash,external_transaction_token,verification,expires_at)
   values($1,$2,$3,$4,$5,$6,$7,2,1000,'usd','android',$8,$9,'native_sdk_observation_unverified',now()+interval '2 minutes') returning id`,[order,route,buyer.id,buyer.session,video,creator.id,price,hash,token]);
  await db.query("update private.stripe_paid_video_orders set checkout_platform='android',native_admission_id=$2 where id=$1",[order,admission]);
  await db.query(`insert into private.google_play_external_launch_bindings(feature,quote_id,buyer_id,session_id,capability_id,paid_video_admission_id,program_id,amount_minor,currency,external_transaction_token,token_hash)
   values('paid_video',$1,$2,$3,null,$4,$5,1000,'usd',$6,$7)`,[order,buyer.id,buyer.session,admission,program,token,hash]);
  const facts={livemode:false,accountId:'acct_test',checkoutSessionId:'cs_test_video',orderId:order,buyerId:buyer.id,videoId:video,
   productId:'prod_video',currency:'usd',amountMinor:1000,paymentStatus:'paid',paymentIntentStatus:'succeeded',platformHeld:true,chargePaid:true,
   paymentIntentId:'pi_video',chargeId:'ch_video',refundAmountMinor:200};
  const repair=(original=null,refund=null,tax=null,amount=200,pi='pi_video',charge='ch_video')=>one(
   'select public.repair_stripe_video_google_reporting($1,$2,$3,$4,$5,$6,$7)',[order,pi,charge,amount,original,refund,tax]);
  await assert.rejects(repair(),/observation_required/);
  // Actual canonical observer commits paid gross and refund BEFORE repair.
  const observed=await one('select public.observe_stripe_sandbox_video_payment($1,$2,$3)',[order,'poll:ch_video:200',facts]);
  assert.equal(observed.status,'refunded');
  const financialCount=await one('select count(*)::int from public.money_access_ledger_events');
  await assert.rejects(repair(null,null,null,201),/observation_required/);
  await assert.rejects(repair(null,null,null,200,'pi_wrong'),/observation_required/);
  const pending=await repair();assert.equal(pending.recorded,true);assert.equal(pending.reportingReady,false);assert.equal(pending.financialAuthority,false);
  const jobs=()=>db.query('select operation,state,reason,occurred_at,lease_id from private.google_play_external_report_outbox where transaction_id=$1 order by operation',[pending.transactionId]);
  assert.deepEqual((await jobs()).rows.map(x=>[x.operation,x.state,x.reason]),[
   ['create','needs_review','verified_transaction_time_required'],['refund','needs_review','verified_refund_time_required']]);
  assert.equal(await one('select public.claim_google_play_external_report($1)',[randomUUID()]),null);
  const tax={provenance:'stripe_checkout_automatic_tax_complete',countryCode:'US',preTaxAmountMinor:1000,taxAmountMinor:0};
  await assert.rejects(repair(paidTime,refundTime,{...tax,countryCode:'CA'}),/tax_invalid/);
  assert.equal(await one('select status from private.stripe_paid_video_orders where id=$1',[order]),'refunded','reporting error cannot roll back committed refund');
  assert.equal(await one('select count(*)::int from public.money_access_ledger_events'),financialCount);
  await db.exec('begin');
  const policy=await one(`insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope)
   values('paid_video','prod_video','acct_test','test','worldwide','all_supported_platforms') returning id`);
  await db.query(`insert into private.commerce_tax_checkout_bindings(feature,identity_id,policy_id,product_id,account_id,environment,permitted_scope)
   values('paid_video',$1,$2,'prod_video','acct_test','test','worldwide')`,[order,policy]);
  await db.query('update private.stripe_paid_video_orders set tax_policy_id=$2 where id=$1',[order,policy]);
  const taxedOriginal={...tax,preTaxAmountMinor:900,taxAmountMinor:100};
  await repair(paidTime,null,taxedOriginal);
  const missingTime=(await jobs()).rows.find(x=>x.operation==='refund');
  assert.equal(missingTime.reason,'verified_refund_time_required');
  assert.equal(await one('select public.claim_google_refund_tax_context()'),null);
  assert.equal((await one("select public.begin_google_refund_tax_history($1,'acct_test')",[pending.transactionId])).eligible,false);
  const refundTaxFacts={account_id:'acct_test',environment:'test',checkout_id:'cs_test_video',payment_intent_id:'pi_video',
   charge_id:'ch_video',currency:'usd',gross_minor:1000,tax_minor:100,refunded_minor:200,tax_reversal_minor:20,
   refunds:[{id:'re_video',amount:200}],refund_tax_evidence:{provenance:'stripe_tax_association_get_v1',association_id:'taxa_video',
    original_tax_transaction_id:'tax_original',payment_intent_id:'pi_video',currency:'usd',gross_minor:1000,original_tax_minor:100,
    refunded_minor:200,tax_reversal_minor:20,refunds:[{refund_id:'re_video',refund_minor:200,tax_reversal_minor:20,tax_transaction_id:'tax_video'}]}};
  assert.equal(await one('select public.record_google_refund_tax_evidence($1,$2)',[pending.transactionId,refundTaxFacts]),false);
  assert.deepEqual((await jobs()).rows.find(x=>x.operation==='refund'),missingTime,
   'real tax reconciliation must not promote an unverified received-at placeholder to provider refund time');
  await repair(paidTime,refundTime,taxedOriginal);
  assert.equal(await one('select public.record_google_refund_tax_evidence($1,$2)',[pending.transactionId,refundTaxFacts]),true);
  const taxReconciled=(await jobs()).rows.find(x=>x.operation==='refund');
  assert.equal(taxReconciled.state,'pending');assert.equal(taxReconciled.reason,null);
  assert.equal(new Date(taxReconciled.occurred_at).toISOString(),refundTime);
  await db.exec('rollback');
  await db.exec('begin');
  const taxed=await repair(paidTime,refundTime,{...tax,preTaxAmountMinor:900,taxAmountMinor:100});
  assert.equal(taxed.reportingReady,false);
  assert.deepEqual((await jobs()).rows.map(x=>[x.operation,x.state,x.reason]),[
   ['create','pending',null],['refund','blocked_tax','verified_refund_tax_provenance_required']]);
  assert.equal(await one('select target_tax_minor from private.google_play_external_report_outbox where transaction_id=$1 and operation=\'refund\'',[pending.transactionId]),null,
   'taxed partial refund never invents a proportional allocation');
  await db.exec('rollback');
  const ready=await repair(paidTime,refundTime,tax);assert.equal(ready.reportingReady,true);assert.equal(ready.observationId,pending.observationId);
  assert.deepEqual((await jobs()).rows.map(x=>[x.operation,x.state,x.reason]),[['create','pending',null],['refund','pending',null]]);
  for(let i=0;i<3;i++)assert.equal((await repair(paidTime,refundTime,tax)).transactionId,pending.transactionId);
  assert.equal(await one('select count(*)::int from private.google_play_external_transactions'),1);
  assert.equal(await one('select count(*)::int from private.google_play_external_report_outbox'),2);
  const events=(await db.query('select provider_event_id from private.google_play_external_report_events')).rows;
  assert.equal(events.length,2);assert.ok(events.every(x=>x.provider_event_id.startsWith('stripe_video_observation:')));
  await assert.rejects(repair('2026-01-01T01:00:00Z',refundTime,tax),/history_conflict/);
  await assert.rejects(repair(paidTime,'2026-01-03T00:00:00Z',tax),/history_conflict/);
  await assert.rejects(repair(paidTime,refundTime,{...tax,preTaxAmountMinor:900,taxAmountMinor:100}),/history_conflict/);
  // A new polling label can deduplicate financially and still repair the same
  // persisted observation, without needing that label to exist in SQL.
  await one('select public.observe_stripe_sandbox_video_payment($1,$2,$3)',[order,'evt_new_delivery_label',facts]);
  assert.equal((await repair(paidTime,refundTime,tax)).observationId,pending.observationId);
  const claim=await one('select public.claim_google_play_external_report($1)',[randomUUID()]);assert.equal(claim.report.operation,'create');
  const leased=(await jobs()).rows[0];await repair(paidTime,refundTime,tax);assert.deepEqual((await jobs()).rows[0],leased);
  await db.query('update private.stripe_video_native_routes set revoked_at=now() where id=$1',[route]);
  assert.equal((await repair(paidTime,refundTime,tax)).transactionId,pending.transactionId,'historical reporting remains repairable after sales revocation');
  assert.equal(await one('select count(*)::int from public.money_access_ledger_events'),financialCount);
  assert.equal(await one('select count(*)::int from public.access_grants where source_id=$1 and status in(\'active\',\'sandbox_only\')',[video]),0);
  for(const role of ['anon','authenticated'])assert.equal(await one("select has_function_privilege($1,'public.repair_stripe_video_google_reporting(uuid,text,text,integer,timestamptz,timestamptz,jsonb)','execute')",[role]),false);
 }finally{await db.close();}
});
