import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('Stripe checkout retry uses real immutable authority and receipt SQL', {timeout:240_000}, async t=>{
  const {db}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false});let checks=0;
  const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
  const deny=async(fn,rx)=>{await assert.rejects(fn,rx);checks++;};
  try {
    await db.exec(fs.readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
    const actors=(await db.query('select * from event_reservation_fixture.actors')).rows;
    const buyer=actors.find(x=>x.kind==='buyer1'),other=actors.find(x=>x.kind==='buyer2'),host=actors.find(x=>x.kind==='creator');
    await db.exec("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");
    const request='ea000000-0000-4000-8000-000000000001',tip='ea000000-0000-4000-8000-000000000002';
    const quote={tipId:tip,creatorId:host.user_id,amountCents:300,currency:'usd',privateNote:null,providerAccountId:'acct_fixture',body:{
      client_reference_id:tip,'metadata[chillywood_tip_id]':tip,'metadata[fan_user_id]':buyer.user_id,
      'metadata[creator_user_id]':host.user_id,'line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':300,
      'payment_intent_data[transfer_data][destination]':'acct_fixture',mode:'payment',success_url:'chillywoodmobile://tip-status?original',expires_at:Math.floor(Date.now()/1000)+3600}};
    const reserve=(id=request,q=quote,actor=buyer)=>one('select public.reserve_creator_tip_checkout_attempt($1,$2,$3,$4)',[actor.user_id,actor.session_id,id,q]);
    const first=await reserve();eq(first.tipId,tip);eq(first.retryAllowed,true);
    const retry=await reserve(request,{...quote,providerAccountId:'acct_changed',body:{...quote.body,success_url:'changed'}});
    eq(retry.body,first.body,'changed destination/body never replaces agreed request');eq(retry.idempotencyKey,first.idempotencyKey);
    eq(await one('select count(*)::integer from public.creator_tip_transactions where sender_id=$1',[buyer.user_id]),1);
    await deny(()=>reserve(request,{...quote,amountCents:499}),/tip_checkout_request_conflict/);
    await deny(()=>reserve('ea000000-0000-4000-8000-000000000003'),/tip_checkout_previous_unresolved/);
    await deny(()=>reserve(request,{...quote,currency:'eur'}),/tip_checkout_quote_invalid/);
    await deny(()=>db.query('update public.creator_tip_transactions set tip_amount_cents=499,total_paid_cents=499 where id=$1',[tip]),/tip_checkout_quote_immutable/);
    await deny(()=>db.query('update private.creator_tip_checkout_attempts set request_body=\'{}\''),/tip_checkout_quote_immutable/);
    await deny(()=>reserve(request,quote,{...buyer,session_id:other.session_id}),/tip_buyer_authority_required/);
    await db.exec('begin');
    await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[buyer.session_id]);
    await deny(()=>reserve(),/tip_buyer_authority_required/);await db.exec('rollback');
    const receipt=()=>one("select public.record_creator_tip_checkout_session($1,$2,$3,'cs_test_fixture','pi_fixture')",[buyer.user_id,buyer.session_id,request]);
    await db.exec('begin');
    await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[buyer.session_id]);
    eq((await receipt()).status,'pending','retired buyer receives no checkout transition');
    eq(await one('select provider_checkout_session_id from public.creator_tip_transactions where id=$1',[tip]),'cs_test_fixture','provider fact survives session loss during IO');
    await db.exec('rollback');
    eq((await receipt()).status,'checkout_started');eq((await receipt()).providerSessionId,'cs_test_fixture');
    await deny(()=>one("select public.record_creator_tip_checkout_session($1,$2,$3,'cs_test_wrong',null)",[buyer.user_id,buyer.session_id,request]),/tip_checkout_receipt_conflict/);
    const webhookAttempt='ea000000-0000-4000-8000-000000000005';
    await db.exec('begin');
    await one("select public.reserve_stripe_tip_webhook_event('evt_retry_failed','payment_intent.payment_failed',repeat('c',64),$1)",[webhookAttempt]);
    await one("select public.process_stripe_tip_webhook_lifecycle('evt_retry_failed',$1,$2,$3,'{\"metadata\":{}}','{}')",
      [webhookAttempt,tip,{object_id:'pi_fixture',payment_intent_id:'pi_fixture'}]);
    eq((await reserve()).status,'failed');
    await db.exec('savepoint failed_attempt_guard');
    await deny(()=>reserve('ea000000-0000-4000-8000-000000000003'),/tip_checkout_previous_unresolved/);
    await db.exec('rollback to savepoint failed_attempt_guard');
    await one("select public.reserve_stripe_tip_webhook_event('evt_retry_expired','checkout.session.expired',repeat('d',64),$1)",[webhookAttempt]);
    await one("select public.process_stripe_tip_webhook_lifecycle('evt_retry_expired',$1,$2,$3,'{\"metadata\":{}}','{}')",
      [webhookAttempt,tip,{object_id:'cs_test_fixture'}]);
    const nextTip='ea000000-0000-4000-8000-000000000006';
    eq((await reserve('ea000000-0000-4000-8000-000000000003',{...quote,tipId:nextTip,
      body:{...quote.body,client_reference_id:nextTip,'metadata[chillywood_tip_id]':nextTip}})).tipId,nextTip,
      'verified provider expiration releases a later distinct attempt');
    await db.exec('rollback');
    await one("select public.reserve_stripe_tip_webhook_event('evt_retry_paid','payment_intent.succeeded',repeat('a',64),$1)",[webhookAttempt]);
    const paid=await one("select public.process_stripe_tip_webhook_lifecycle('evt_retry_paid',$1,$2,$3,'{\"metadata\":{}}','{}')",
      [webhookAttempt,tip,{object_id:'pi_fixture',payment_intent_id:'pi_fixture',amount_cents:300,currency:'usd',
        metadata_tip_id:tip,metadata_sender_id:buyer.user_id,metadata_creator_id:host.user_id}]);
    eq(paid.status,'paid','real payment projector accepts the exact checkout transaction');
    eq((await receipt()).status,'paid','late Edge reply cannot downgrade webhook terminal state');
    await one("select public.reserve_stripe_tip_webhook_event('evt_retry_refund','charge.refunded',repeat('b',64),$1)",[webhookAttempt]);
    await one("select public.process_stripe_tip_webhook_lifecycle('evt_retry_refund',$1,$2,$3,'{\"metadata\":{}}','{}')",
      [webhookAttempt,tip,{object_id:'ch_fixture',payment_intent_id:'pi_fixture',amount_cents:300,amount_refunded_cents:30,refunded:false,currency:'usd',
        metadata_tip_id:tip,metadata_sender_id:buyer.user_id,metadata_creator_id:host.user_id}]);
    eq(await one('select creator_net_cents from public.creator_tip_transactions where id=$1',[tip]),270,'actual verified partial refund still adjusts creator net');
    // Seed an old synthetic receipt through normal INSERT guards. Never disable
    // the immutable quote trigger merely to simulate elapsed provider time.
    const oldTip='ea000000-0000-4000-8000-000000000007',oldRequest='ea000000-0000-4000-8000-000000000008';
    await db.query(`insert into public.creator_tip_transactions(id,sender_id,creator_id,buyer_account_id,buyer_session_generation,
      tip_amount_cents,total_paid_cents,creator_net_cents,currency,provider,provider_environment,provider_account_id,
      idempotency_key,status,payment_status,payout_status,metadata,created_at)
      values($1,$2,$3,$2,$4,300,300,300,'usd','stripe_connect','test','acct_fixture','expired-retry-synthetic',
      'pending','pending','not_payable','{"buyer_authority_bound":true}',now()-interval '25 hours')`,[oldTip,other.user_id,host.user_id,other.session_id]);
    const oldQuote={...quote,tipId:oldTip,body:{...quote.body,client_reference_id:oldTip,'metadata[chillywood_tip_id]':oldTip,'metadata[fan_user_id]':other.user_id}};
    await db.query(`insert into private.creator_tip_checkout_attempts(buyer_id,request_id,session_id,tip_id,request_body,created_at,retry_until)
      values($1,$2,$3,$4,$5,now()-interval '25 hours',now()-interval '2 hours')`,[other.user_id,oldRequest,other.session_id,oldTip,oldQuote.body]);
    eq((await reserve(oldRequest,oldQuote,other)).retryAllowed,false);
    await db.exec('set role authenticated');
    await deny(()=>reserve(),/permission denied/);
    await deny(()=>db.query('select * from private.creator_tip_checkout_attempts'),/permission denied/);
    t.diagnostic(`${checks} real SQL assertions passed`);
  } finally {await db.close();}
});
