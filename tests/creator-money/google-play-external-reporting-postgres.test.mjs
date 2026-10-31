import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {loadPureTypeScriptModule} from '../helpers/pure-typescript-module.mjs';
const {googlePrice}=loadPureTypeScriptModule('supabase/functions/_shared/google-play-external-reporting.ts');

test('private Google obligations lease/reconcile idempotently without financial authority or fabricated tax', {timeout:240000}, async()=>{
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
  const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  try {
    await db.exec(fs.readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
    await db.exec(fs.readFileSync('tests/fixtures/creator-external-payment-capabilities.sql','utf8'));
    await db.exec(fs.readFileSync('tests/fixtures/creator-external-payment-authority.sql','utf8'));
    const actors=(await db.query('select * from event_reservation_fixture.actors')).rows;
    const buyer=actors.find(a=>a.kind==='buyer1'), other=actors.find(a=>a.kind==='buyer2'),creator=actors.find(a=>a.kind==='creator');
    const cap=randomUUID();
    await db.query(`insert into private.creator_external_payment_capabilities
      select (jsonb_populate_record(null::private.creator_external_payment_capabilities,to_jsonb(c)||$1::jsonb)).*
      from private.creator_external_payment_capabilities c limit 1`,[JSON.stringify({id:cap,platform:'android',route_kind:'android_external_content_link'})]);
    assert.equal(await one('select private.google_play_external_program_ready($1)',[cap]),false,'no setup seed');
    const program=await one(`insert into private.google_play_external_program_config(package_name,environment,enrollment_evidence,
      license_test_qualification_evidence,tax_configuration_evidence,reporter_configuration_evidence,native_build_qualification_evidence,verified_at,expires_at,enabled)
      values('com.chillywood.mobile','test','synthetic only','synthetic only','synthetic only','synthetic only','synthetic only',now(),now()+interval '1 hour',true) returning id`);
    await db.query('insert into private.google_play_external_capability_program_bindings(capability_id,program_id) values($1,$2)',[cap,program]);
    await db.exec(`insert into private.google_play_external_program_config(package_name,environment,enrollment_evidence,
      license_test_qualification_evidence,tax_configuration_evidence,reporter_configuration_evidence,native_build_qualification_evidence,verified_at,expires_at,enabled)
      values('com.unrelated.app','test','synthetic only','synthetic only','synthetic only','synthetic only','synthetic only',clock_timestamp(),clock_timestamp()+interval '1 hour',true)`);
    assert.equal(await one('select private.google_play_external_program_ready($1)',[cap]),true);
    const request=randomUUID(),tip=randomUUID(),nativeToken='synthetic-sdk-'+randomUUID();
    const setBuyer=who=>db.query("select set_config('request.jwt.claims',$1,false)",
      [JSON.stringify({role:'authenticated',sub:who.user_id,session_id:who.session_id})]);
    const admit=(amount=237)=>one('select public.admit_google_play_external_session($1,$2,$3,$4,$5,1)',
      ['creator_tip',creator.user_id,amount,request,nativeToken]);
    await setBuyer(buyer);
    const admitted=await admit();assert.equal(admitted.verification,'native_sdk_observation_unverified');
    assert.equal(await one('select program_id from private.google_play_external_admissions where id=$1',[admitted.admissionId]),program,'newer unrelated global proof cannot replace exact bound program');
    assert.equal(admitted.financialAuthority,false);assert.equal((await admit()).admissionId,admitted.admissionId);
    await assert.rejects(()=>admit(238),/token_reused/);
    await setBuyer(other);await assert.rejects(()=>admit(),/token_reused/);await setBuyer(buyer);
    assert.equal((await one("select private.resolve_creator_external_payment_capability($1,$2,'creator_tip',$3,237,'usd','test',$4)",
      [buyer.user_id,buyer.session_id,creator.user_id,cap])).platform,'android');
    await assert.rejects(()=>one("select private.resolve_creator_external_payment_capability($1,$2,'creator_tip',$3,238,'usd','test',$4)",
      [buyer.user_id,buyer.session_id,creator.user_id,cap]),/capability_unavailable/);
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);
    const q={tipId:tip,creatorId:creator.user_id,amountCents:237,currency:'usd',providerAccountId:'acct_fixture',capabilityId:cap,body:{
      client_reference_id:tip,'metadata[chillywood_tip_id]':tip,'metadata[fan_user_id]':buyer.user_id,
      'metadata[creator_user_id]':creator.user_id,'line_items[0][price_data][currency]':'usd',
      'line_items[0][price_data][unit_amount]':237,'payment_intent_data[transfer_data][destination]':'acct_fixture',
      'payment_method_types[0]':'card',mode:'payment',expires_at:Math.floor(Date.now()/1000)+3600}};
    const reserved=await one('select public.reserve_creator_tip_checkout_attempt($1,$2,$3,$4)',[buyer.user_id,buyer.session_id,request,q]);
    assert.equal(reserved.body['automatic_tax[enabled]'],true,'server-selected Android route freezes automatic tax');
    assert.equal(reserved.body['line_items[0][price_data][tax_behavior]'],'inclusive','chosen amount remains the exact total');
    assert.equal(reserved.body.billing_address_collection,'required');
    const retried=await one('select public.reserve_creator_tip_checkout_attempt($1,$2,$3,$4)',
      [buyer.user_id,buyer.session_id,request,{...q,body:{...q.body,'automatic_tax[enabled]':false}}]);
    assert.deepEqual(retried.body,reserved.body,'retry cannot change tax calculation or provider idempotency terms');
    const binding=await one('select public.bind_google_play_external_checkout($1,$2,$3,$4,$5,1)',
      [buyer.user_id,buyer.session_id,'creator_tip',tip,nativeToken]);
    assert.equal(binding.routeKind,'android_external_content_link');assert.equal(JSON.stringify(binding).includes(nativeToken),false);
    await assert.rejects(()=>one('select public.bind_google_play_external_checkout($1,$2,$3,$4,$5,1)',
      [buyer.user_id,buyer.session_id,'creator_tip',tip,'different-token']),/admission_required/);
    await assert.rejects(()=>one('select public.bind_google_play_external_checkout($1,$2,$3,$4,$5,1)',
      [buyer.user_id,other.session_id,'creator_tip',randomUUID(),'synthetic-unverified']),/buyer_authority_required/);
    await assert.rejects(()=>one('select public.bind_google_play_external_checkout($1,$2,$3,$4,$5,1)',
      [buyer.user_id,buyer.session_id,'creator_tip',randomUUID(),'synthetic-unverified']),/quote_unavailable/);
    await db.query('update private.google_play_external_program_config set revoked_at=clock_timestamp() where id=$1',[program]);
    assert.equal(await one('select private.google_play_external_program_ready($1)',[cap]),false,'program revocation blocks new authority');
    // The rest of this suite still executes real enqueue/claim/acknowledgement
    // and refunds against the historical binding after its program is revoked.
    for(const table of ['google_play_external_launch_bindings','google_play_external_report_outbox','google_play_external_transactions']){
      await assert.rejects(async()=>{
        try {await db.exec(`begin;set local role authenticated;select * from private.${table};commit;`);}
        catch(e){await db.exec('rollback');throw e;}
      },/permission denied/);
    }
    await db.exec('begin');
    try {
      await one('select public.record_creator_tip_checkout_session($1,$2,$3,$4,$5)',
        [buyer.user_id,buyer.session_id,request,'cs_test_googleTip','pi_googleTip']);
      const facts={event_livemode:false,event_account:null,object_livemode:false,amount_cents:237,currency:'usd',
        payment_intent_id:'pi_googleTip',metadata_tip_id:tip,metadata_sender_id:buyer.user_id,
        metadata_creator_id:creator.user_id,provider_occurred_at:'2026-10-30T12:00:00Z'};
      const project=async(type,extra)=>{
        const event='evt_'+randomUUID().replaceAll('-',''),lease=randomUUID();
        await one('select public.reserve_stripe_tip_webhook_event($1,$2,$3,$4)',[event,type,'a'.repeat(64),lease]);
        return one("select public.process_stripe_tip_webhook_lifecycle($1,$2,$3,$4,'{}','{}')",
          [event,lease,tip,{...facts,...extra}]);
      };
      const intent={object_type:'payment_intent',object_id:'pi_googleTip',object_status:'succeeded',amount_received_cents:237};
      assert.equal((await project('payment_intent.succeeded',intent)).updated,true);
      assert.equal(await one("select state from private.google_play_external_report_outbox"),'blocked_tax',
        'actual paid projection and missing-tax obligation commit atomically');
      const checkout={object_type:'checkout.session',object_id:'cs_test_googleTip',client_reference_id:tip,
        object_status:'complete',checkout_mode:'payment',payment_status:'paid',
        google_play_tax:{provenance:'stripe_checkout_automatic_tax_complete',countryCode:'US',preTaxAmountMinor:218,taxAmountMinor:19}};
      assert.equal((await project('checkout.session.completed',checkout)).updated,true);
      assert.equal(await one("select state from private.google_play_external_report_outbox"),'pending',
        'later signed Checkout tax facts repair the same durable obligation');
      assert.equal(await one('select count(*)::integer from private.google_play_external_report_outbox'),1);
      assert.equal((await project('checkout.session.completed',{...checkout,amount_cents:238})).updated,false);
      assert.equal(await one('select count(*)::integer from private.google_play_external_report_events'),2,
        'rejected provider economics do not invent another reporting receipt');
    } finally {await db.exec('rollback');}
    const seed=async()=>{
      const quote=randomUUID(),token='synthetic-'+randomUUID();
      await db.query(`insert into private.google_play_external_launch_bindings(feature,quote_id,buyer_id,session_id,
        capability_id,program_id,amount_minor,currency,external_transaction_token,token_hash)
        values('creator_tip',$1,$2,$3,$4,$5,237,'usd',$6,$7)`,
      [quote,buyer.user_id,buyer.session_id,cap,program,token,createHash('sha256').update(token).digest('hex')]);
      return quote;
    };
    const evidence=(patch={})=>({eventId:'evt_'+randomUUID().replaceAll('-',''),outcome:'paid',
      occurredAt:'2026-10-30T12:00:00.000Z',amountMinor:237,currency:'usd',
      googlePlayTax:{provenance:'stripe_checkout_automatic_tax_complete',countryCode:'US',preTaxAmountMinor:237,taxAmountMinor:0},...patch});
    const enqueue=(quote,e,hash='a'.repeat(64))=>db.query('select private.enqueue_google_play_external_report($1,$2,$3,$4)',
      ['creator_tip',quote,e,hash]);
    const claim=()=>one('select public.claim_google_play_external_report($1)',[randomUUID()]);
    const finish=(job,result)=>one('select public.finish_google_play_external_report($1,$2,$3)',[job.outboxId,job.leaseId,result]);
    const receipt=r=>({packageName:r.packageName,externalTransactionId:r.externalTransactionId,testPurchase:{},
      transactionTime:r.transactionTime,transactionState:r.operation==='refund'&&r.remainingPreTaxMinor===0?'TRANSACTION_CANCELED':'TRANSACTION_REPORTED',
      userTaxAddress:{regionCode:'US'},externalContentLinkDetails:{linkType:'LINK_TO_DIGITAL_CONTENT_OFFER'},
      originalPreTaxAmount:googlePrice(r.originalPreTaxMinor),originalTaxAmount:googlePrice(r.originalTaxMinor),
      currentPreTaxAmount:googlePrice(r.operation==='refund'?r.remainingPreTaxMinor:r.originalPreTaxMinor),
      currentTaxAmount:googlePrice(r.operation==='refund'?r.remainingTaxMinor:r.originalTaxMinor)});
    const quote=await seed(),paid=evidence();
    await enqueue(quote,paid);await enqueue(quote,paid);
    await assert.rejects(()=>enqueue(quote,paid,'b'.repeat(64)),/event_conflict/);
    assert.equal(await one('select count(*)::integer from private.google_play_external_report_outbox'),1);
    let job=await claim();assert.equal(job.report.originalTaxMinor,0);
    assert.equal(await claim(),null,'parallel worker cannot claim same transaction');
    await assert.rejects(()=>finish(job,{status:'reported',reason:'fake_ack'}),/receipt_required/);
    await finish(job,{status:'unknown',reason:'synthetic_lost_response'});
    await db.exec("update private.google_play_external_report_outbox set next_attempt_at=now()-interval '1 second'");
    const retry=await claim();assert.equal(retry.report.externalTransactionId,job.report.externalTransactionId);
    assert.equal(await finish(job,{status:'reported',receipt:receipt(job.report)}),false,'stale lease cannot ACK');
    await assert.rejects(()=>finish(retry,{status:'reported',receipt:{...receipt(retry.report),currentTaxAmount:null}}),/receipt_required/);
    await assert.rejects(()=>finish(retry,{status:'reported',receipt:{...receipt(retry.report),transactionState:'TRANSACTION_CANCELED'}}),/receipt_required/);
    await finish(retry,{status:'reported',reason:'synthetic_fixture_only',receipt:{...receipt(retry.report),
      unexpectedPrivateValue:'must-not-retain',testPurchase:{nestedPrivateValue:'must-not-retain'}}});
    assert.equal(await one("select canonical_receipt::text like '%must-not-retain%' from private.google_play_external_report_outbox where id=$1",[retry.outboxId]),false,
      'database receipt allowlist removes unexpected nested provider data');
    await enqueue(quote,evidence({outcome:'refunded',refundedAmountMinor:100}));
    job=await claim();assert.equal(job.report.refundPreTaxMinor,100);assert.equal(job.report.remainingPreTaxMinor,137);
    await finish(job,{status:'reported',reason:'synthetic_fixture_only',receipt:receipt(job.report)});
    await enqueue(quote,evidence({outcome:'refunded',refundedAmountMinor:237}));
    job=await claim();assert.equal(job.report.refundPreTaxMinor,137);assert.equal(job.report.remainingPreTaxMinor,0);
    await finish(job,{status:'reported',reason:'synthetic_fixture_only',receipt:receipt(job.report)});
    const unknownTax=await seed();await enqueue(unknownTax,evidence({googlePlayTax:null}));
    assert.equal(await claim(),null,'missing tax is durable obligation, not fabricated zero');
    assert.equal(await one("select count(*)::integer from private.google_play_external_report_outbox where state='blocked_tax'"),1);
    const taxed=await seed();await enqueue(taxed,evidence({googlePlayTax:{provenance:'stripe_checkout_automatic_tax_complete',countryCode:'US',preTaxAmountMinor:218,taxAmountMinor:19}}));
    job=await claim();await finish(job,{status:'reported',reason:'synthetic_fixture_only',receipt:receipt(job.report)});
    await enqueue(taxed,evidence({outcome:'refunded',refundedAmountMinor:100}));
    assert.equal(await claim(),null,'taxed partial refund must not guess allocation');
    assert.equal(await one('select count(*)::integer from public.access_grants'),0,'opaque token/report does not grant access');
    assert.equal(await one("select count(*)::integer from public.creator_tip_transactions where payment_status<>'pending'"),0,'report cannot invent a paid charge');
    await assert.rejects(()=>db.query("update private.google_play_external_launch_bindings set external_transaction_token='changed'"),/immutable/);
  } finally {await db.close();}
});
