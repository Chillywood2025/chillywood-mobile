import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {seedQualifiedCommerceCreator,assertBuyerHasNoPremium} from '../helpers/automatic-commerce-fixture.mjs';
import {loadPureTypeScriptModule} from '../helpers/pure-typescript-module.mjs';
import {loadGoogleRefundModule,googleRefundFixture,googleHistoryClient,googleVerificationCheckpoint} from '../helpers/google-refund-tax-history-fixture.mjs';
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
    await seedQualifiedCommerceCreator(db,{id:creator.user_id,session:creator.session_id},{providerAccountId:'acct_fixture'});
    for(const actor of [buyer,other])await assertBuyerHasNoPremium(db,{id:actor.user_id});
    const initialPremiumGrantIds=(await db.query("select id from public.access_grants where user_id=$1 and grant_type='premium'",[creator.user_id])).rows.map(row=>row.id);
    assert.ok(initialPremiumGrantIds.length>0,'actual canonical Premium processor supplies only creator membership');
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
    await enqueue(taxed,evidence({outcome:'refunded',refundedAmountMinor:40}));
    await enqueue(taxed,evidence({outcome:'refunded',refundedAmountMinor:100}));
    assert.equal(await claim(),null,'taxed partial refund must not guess allocation');
    await db.query(`insert into public.creator_tip_transactions(id,sender_id,buyer_account_id,buyer_session_generation,creator_id,tip_amount_cents,total_paid_cents,
      creator_net_cents,currency,provider,provider_environment,provider_account_id,provider_checkout_session_id,provider_payment_intent_id,payment_status)
      values($1,$2,$2,$4,$3,237,237,237,'usd','stripe_connect','test','acct_fixture','cs_test_taxed','pi_taxed','pending')`,[taxed,buyer.user_id,creator.user_id,buyer.session_id]);
    const taxContext=await one('select public.claim_google_refund_tax_context()');
    assert.equal(taxContext.quote_id,taxed);assert.equal(taxContext.tax_minor,19);
    assert.equal(await one('select public.claim_google_refund_tax_context()'),null,'fair bounded claim backs off a pending association');
    const taxFacts={account_id:'acct_platform',environment:'test',checkout_id:'cs_test_taxed',payment_intent_id:'pi_taxed',
      charge_id:'ch_taxed',currency:'usd',gross_minor:237,tax_minor:19,refunded_minor:100,tax_reversal_minor:8,
      refunds:[{id:'re_taxed',amount:100}],refund_tax_evidence:{provenance:'stripe_tax_association_get_v1',association_id:'taxa_taxed',
       original_tax_transaction_id:'tax_original',payment_intent_id:'pi_taxed',currency:'usd',gross_minor:237,original_tax_minor:19,
       refunded_minor:100,tax_reversal_minor:8,refunds:[{refund_id:'re_taxed',refund_minor:100,tax_reversal_minor:8,tax_transaction_id:'tax_taxed'}]}};
    const record=facts=>one('select public.record_google_refund_tax_evidence($1,$2)',[taxContext.transaction_id,facts]);
    await assert.rejects(()=>record({...taxFacts,checkout_id:'cs_test_wrong'}),/binding_invalid/);
    await assert.rejects(()=>record({...taxFacts,refund_tax_evidence:null}),/binding_invalid/);
    const beginHistory=(account='acct_platform')=>one('select public.begin_google_refund_tax_history($1,$2)',[taxContext.transaction_id,account]);
    let historyLease=await beginHistory();assert.equal((await beginHistory()).busy,true,'one live history lease per exact transaction');
    const historyFixture=googleRefundFixture({context:taxContext,refunds:[{id:'re_taxed',amount:100,tax:8}],
      charge:'ch_taxed',association:'taxa_taxed',original:'tax_original'});
    const checkpoint=await googleVerificationCheckpoint(historyFixture);
    const saveHistory=(saved=checkpoint,facts=null,lease=historyLease)=>one('select public.save_google_refund_tax_history($1,$2,$3,$4,$5)',
      [taxContext.transaction_id,lease.generation,lease.lease,saved,facts]);
    const evidenceCount=()=>one('select count(*)::int from private.stripe_refund_tax_evidence');
    const blockedCount=()=>one("select count(*)::int from private.google_play_external_report_outbox where transaction_id=$1 and state='blocked_tax'",[taxContext.transaction_id]);
    assert.deepEqual(await saveHistory(),{status:'history_pending',financialAuthority:false});
    assert.equal(await evidenceCount(),0,'partial history never ingests tax proof');assert.equal(await blockedCount(),2);
    assert.equal(await one("select count(*)::int from private.google_play_external_report_outbox where transaction_id=$1 and operation='refund' and canonical_receipt is not null",[taxContext.transaction_id]),0);
    const oldLease=historyLease;historyLease=await beginHistory();
    assert.equal(historyLease.generation,oldLease.generation);assert.notEqual(historyLease.lease,oldLease.lease);
    assert.deepEqual(historyLease.checkpoint,checkpoint,'new lease resumes the durable prefix');
    await assert.rejects(()=>saveHistory(checkpoint,null,oldLease),/stale_lease/);
    const withRollback=async(sql,assertion,args=[])=>{
      await db.exec('begin');try{await db.query(sql,args);await assertion();}finally{await db.exec('rollback');}
    };
    await withRollback("update private.google_refund_tax_history set lease_until=clock_timestamp()-interval '1 second' where transaction_id=$1",
      ()=>assert.rejects(()=>saveHistory(),/source_changed/),[taxContext.transaction_id]);
    for(const change of ["provider_payment_intent_id='pi_changed'","provider_account_id='acct_changed'","provider_environment='live'"]){
      await withRollback(`update public.creator_tip_transactions set ${change} where id=$1`,
        ()=>assert.rejects(()=>saveHistory(),/source_changed|context_required/),[taxed]);
    }
    await assert.rejects(()=>beginHistory('invalid-account'),/account_mismatch/);
    await withRollback('update private.google_refund_tax_history set lease_until=null where transaction_id=$1',async()=>{
      const changed=await beginHistory('acct_other');assert.notEqual(changed.generation,historyLease.generation);
      assert.deepEqual(changed.checkpoint,{});await assert.rejects(()=>saveHistory(),/stale_lease/);
    },[taxContext.transaction_id]);
    await withRollback(`update private.google_refund_tax_history set lease_until=null,
      checkpoint=jsonb_set(checkpoint,'{verificationStartedAt}',to_jsonb(floor(extract(epoch from clock_timestamp()-interval '7 hours')*1000)))
      where transaction_id=$1`,async()=>{
      const expired=await beginHistory();assert.notEqual(expired.generation,historyLease.generation);
      assert.deepEqual(expired.checkpoint,{},'expired verification never resumes with newly fresh completion');
    },[taxContext.transaction_id]);
    await withRollback("update private.google_play_external_report_outbox set state='pending' where transaction_id=$1 and state='blocked_tax'",async()=>{
      assert.equal((await beginHistory()).eligible,false,'history cannot create its own financial refund obligation');
    },[taxContext.transaction_id]);
    const {reconcileGoogleRefundTax}=loadGoogleRefundModule();
    const verified=googleHistoryClient({context:taxContext,checkpoint});
    await reconcileGoogleRefundTax(verified.client,taxContext,'sk_test_synthetic','acct_platform',historyFixture.transport);
    const completeInput=verified.calls.find(call=>call.name==='save_google_refund_tax_history').args;
    assert.deepEqual(completeInput.p_facts,taxFacts);
    const completeCheckpoint=completeInput.p_checkpoint;
    for(const invalid of [
      {...completeCheckpoint,cursor:0},
      {...completeCheckpoint,verificationStartedAt:Date.now()-7*60*60*1000},
      {...completeCheckpoint,entries:completeCheckpoint.entries.map(e=>({...e,observedAt:0}))},
    ])await assert.rejects(()=>saveHistory(invalid,taxFacts),/complete_proof_required/);
    for(const invalid of [{...taxFacts,account_id:'acct_wrong'},{...taxFacts,environment:'live'}])
      await assert.rejects(()=>saveHistory(completeCheckpoint,invalid),/complete_proof_required/);
    await assert.rejects(()=>saveHistory(completeCheckpoint,{...taxFacts,refund_tax_evidence:null}),/binding_invalid/);
    assert.equal(await evidenceCount(),0);assert.equal(await blockedCount(),2);
    // Force a failure after the existing evidence recorder has run, proving the
    // checkpoint completion, immutable evidence and outbox update are atomic.
    await db.exec(`create function public.fixture_reject_google_history_complete() returns trigger language plpgsql as $$
      begin if new.completed then raise exception 'synthetic_history_commit_failure';end if;return new;end $$;
      create trigger fixture_reject_google_history_complete before update on private.google_refund_tax_history
      for each row execute function public.fixture_reject_google_history_complete();`);
    try{await assert.rejects(()=>saveHistory(completeCheckpoint,taxFacts),/synthetic_history_commit_failure/);}
    finally{await db.exec('drop trigger fixture_reject_google_history_complete on private.google_refund_tax_history;drop function public.fixture_reject_google_history_complete()');}
    assert.equal(await evidenceCount(),0,'failed final checkpoint save rolls back evidence');assert.equal(await blockedCount(),2);
    assert.equal(await one('select completed from private.google_refund_tax_history where transaction_id=$1',[taxContext.transaction_id]),false);
    const completion=await saveHistory(completeCheckpoint,taxFacts);
    assert.deepEqual(completion,{status:'history_complete',evidenceRecorded:true,financialAuthority:false});
    assert.deepEqual(await saveHistory(completeCheckpoint,taxFacts),completion,'same completed lease is idempotent');
    assert.equal(await evidenceCount(),1);assert.equal(await blockedCount(),1);
    await assert.rejects(()=>saveHistory(completeCheckpoint,taxFacts,{...historyLease,lease:randomUUID()}),/stale_lease/);
    const security=(await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='private.google_refund_tax_history'::regclass")).rows[0];
    assert.deepEqual(security,{relrowsecurity:true,relforcerowsecurity:true});
    for(const role of ['anon','authenticated','service_role']){
      assert.equal(await one("select has_table_privilege($1,'private.google_refund_tax_history','select')",[role]),false);
      assert.equal(await one("select has_table_privilege($1,'private.google_refund_tax_history','insert')",[role]),false);
      assert.equal(await one("select has_function_privilege($1,'private.lock_google_refund_tax_history_context(uuid)','execute')",[role]),false);
      for(const signature of ['public.begin_google_refund_tax_history(uuid,text)','public.save_google_refund_tax_history(uuid,uuid,uuid,jsonb,jsonb)'])
        assert.equal(await one('select has_function_privilege($1,$2,\'execute\')',[role,signature]),role==='service_role');
    }
    assert.equal(await record(taxFacts),false,'immutable retry does not requeue or multiply reporting obligations');
    assert.equal(await one("select count(*)::int from private.google_play_external_report_outbox where transaction_id=$1 and state='reported' and operation='refund'",[taxContext.transaction_id]),0,'ingestion is not a Google receipt');
    job=await claim();assert.equal(job.report.refundPreTaxMinor,92);assert.equal(job.report.remainingPreTaxMinor,126);assert.equal(job.report.remainingTaxMinor,11);
    await assert.rejects(()=>finish(job,{status:'reported',receipt:{...receipt(job.report),currentTaxAmount:googlePrice(10)}}),/receipt_required/);
    await finish(job,{status:'reported',reason:'synthetic_fixture_only',receipt:receipt(job.report)});
    assert.equal(await one("select reason from private.google_play_external_report_outbox where transaction_id=$1 and cumulative_refund_minor=40",[taxContext.transaction_id]),'covered_by_canonical_cumulative_refund');
    assert.equal(await one("select reported_refund_minor from private.google_play_external_transactions where id=$1",[taxContext.transaction_id]),100);
    assert.equal(await one('select count(*)::integer from public.access_grants where not (id=any($1::uuid[]))',[initialPremiumGrantIds]),0,'opaque token/report does not grant any access beyond the exact initial creator Premium grant');
    assert.equal(await one("select count(*)::integer from public.creator_tip_transactions where payment_status<>'pending'"),0,'report cannot invent a paid charge');
    await assert.rejects(()=>db.query("update private.google_play_external_launch_bindings set external_transaction_token='changed'"),/immutable/);
  } finally {await db.close();}
});
