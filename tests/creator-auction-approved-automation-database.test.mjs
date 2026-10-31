import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';

test('approved automatic auction source stays off, scopes renewal and hard-blocks unknown tax fees', {timeout:180000}, async()=>{
  const realDateNow=Date.now;
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
  try {
    await db.exec(fs.readFileSync(new URL('./fixtures/event-reservation-authority.sql',import.meta.url),'utf8'));
    await db.exec(fs.readFileSync(new URL('./fixtures/creator-external-payment-authority.sql',import.meta.url),'utf8'));
    await db.exec("update public.creator_events set visibility='public' where id in(select id from event_reservation_fixture.events)");
    const rows=async s=>(await db.query(s)).rows;
    const actors=Object.fromEntries((await rows('select * from event_reservation_fixture.actors')).map(a=>[a.kind,a]));
    const events=Object.fromEntries((await rows('select * from event_reservation_fixture.events')).map(a=>[a.name,a.id]));
    const lit=x=>`'${String(x).replaceAll("'","''")}'`;
    const rpc=async(actor,expression,role='authenticated')=>{
      const a=actors[actor];
      try {const r=await db.exec(`begin;set local role ${role};set local request.jwt.claims=${lit(JSON.stringify({role,sub:a.user_id,session_id:a.session_id}))};
        set local request.headers='{"x-chillywood-platform":"ios"}'; select ${expression} result;commit;`);
        return r.flatMap(x=>x.rows).at(-1).result;
      }catch(e){await db.exec('rollback');throw e;}
    };
    const cap=(await rows(`insert into private.creator_external_payment_capabilities(feature,creator_id,provider_account_id,
      platform,storefront,storefront_country,route_kind,currency,environment,payment_method,min_amount_minor,max_amount_minor,
      provider_bounds_evidence,route_approval_evidence,verified_at,expires_at,enabled)
      values('event_auction','${actors.creator.user_id}','acct_fixture','ios','UNITED_STATES','US','external_browser_checkout','usd','test','card',50,100000,
        'synthetic test only','synthetic test only',now(),now()+interval '2 hours',true) returning id`))[0].id;
    await db.exec(`insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
      select '${cap}',user_id,session_id,'synthetic test only',now(),now()+interval '10 minutes'
      from event_reservation_fixture.actors where kind like 'buyer%';`);
    const product=(await rows(`insert into public.monetization_products(product_key,product_type,display_name,provider,
      provider_product_id,environment,status,is_android_digital,is_physical_good)
      values('auction_fixture_only','event_pass','Synthetic auction event','stripe_event_auction','prod_AuctionFixture',
        'sandbox','sandbox',false,false) returning id`))[0].id;
    await db.exec(`insert into private.creator_event_auction_product_bindings values('${cap}','${product}','synthetic test only',now())`);

    const configure = async(name,buyer='buyer1')=>{
      const offer=await rpc('creator',`public.configure_paid_creator_event_sale('${events[name]}','Virtual show',99,1,'sandbox',
        'America/New_York',now()-interval '1 hour',least(now()+interval '1 day',(select starts_at from public.creator_events where id='${events[name]}')))`);
      const auction=await rpc('creator',`public.create_creator_event_auction('${events[name]}','${offer.termsRevisionId}',237,1,
        clock_timestamp()+interval '600 milliseconds',now()+interval '1 hour','test')`);
      await rpc(buyer,`public.place_creator_event_auction_bid('${auction.id}',237,'${randomUUID()}',null)`);
      await new Promise(r=>setTimeout(r,650));
      const quote=await rpc(buyer,`public.create_creator_event_auction_award_quote('${auction.id}',null)`);
      const attempt=randomUUID();
      return {auction,quote,attempt,buyer,call:`public.prepare_creator_event_auction_platform_checkout('${quote.id}','${actors[buyer].user_id}','${actors[buyer].session_id}','${attempt}')`};
    };
    // Synthetic reviewed checkout tax scope only. Settlement fee readiness is
    // NOT overridden: the production hard-false fee gate remains in force.
    await db.exec(`insert into private.commerce_tax_qualifications(feature,product_id,account_id,environment,permitted_scope,platform_scope,
     professional_basis_reference,coverage_evidence_reference,full_permitted_scope_reviewed,collection_mode,liability_type,tax_code,tax_behavior,
     registration_evidence_reference,provider_settings_evidence_reference,provider_product_evidence_reference,provider_verified_at,provider_expires_at,expires_at,enabled)
     values('event_auction','prod_AuctionFixture','acct_platform','test','worldwide','all_supported_platforms','SYNTHETIC ONLY','SYNTHETIC ONLY',true,
      'automatic','self','txcd_99999999','inclusive','SYNTHETIC ONLY','SYNTHETIC ONLY','SYNTHETIC ONLY',clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '1 hour',true)`);
    const s=await configure('show1');
    await assert.rejects(()=>rpc('buyer1',s.call),/permission denied/);
    await assert.rejects(()=>rpc('buyer1',s.call,'service_role'),/platform_qualification_required/);
    assert.equal((await rows(`select checkout_started_at from private.creator_event_auction_quotes where id='${s.quote.id}'`))[0].checkout_started_at,null);
    await db.exec(`insert into private.auction_platform_qualifications(capability_id,platform_account_id,recipient_account_id,
      product_id,platform_product_id,evidence_reference,recipient_transfer_capability,enabled,verified_at,expires_at)
      values('${cap}','acct_platform','acct_fixture','${product}','prod_AuctionFixture','synthetic platform-owned product verification','active',true,now(),now()+interval '10 minutes')`);
    const claim=await rpc('buyer1',s.call,'service_role');
    assert.equal(claim.providerAccountId,'acct_platform');assert.equal(claim.recipientAccountId,'acct_fixture');
    assert.equal(claim.chargePattern,'platform_separate_transfer');assert.equal(claim.financialAuthority,false);
    assert.equal((await rpc('buyer1',s.call,'service_role')).startAuthorized,false);
    assert.equal((await rows("select count(*) n from private.auction_platform_settlement_contracts"))[0].n,1);
    const bind=(account='acct_platform')=>rpc('buyer1',`public.bind_creator_event_auction_checkout('${s.quote.id}','${s.attempt}',
      'cs_test_Platform','pi_Platform','${account}',237,'usd')`,'service_role');
    await assert.rejects(()=>bind('acct_fixture'),/checkout_response_mismatch/);await bind();
    const recover=`public.recover_creator_event_auction_platform_checkout('${s.quote.id}','${actors.buyer1.user_id}','${actors.buyer1.session_id}','${s.attempt}')`;
    assert.equal((await rpc('buyer1',recover,'service_role')).providerCheckoutSessionId,'cs_test_Platform');
    const evidence={eventId:'evt_Platform',eventType:'checkout.session.completed',occurredAt:new Date().toISOString(),
      accountId:'acct_platform',environment:'test',objectId:'cs_test_Platform',paymentIntentId:'pi_Platform',
      checkoutSessionId:'cs_test_Platform',quoteId:s.quote.id,buyerId:actors.buyer1.user_id,
      creatorId:actors.creator.user_id,auctionId:s.auction.id,amountMinor:237,currency:'usd',
      outcome:'paid',refundedAmountMinor:null,providerProductId:'prod_AuctionFixture',
      settlementContractId:claim.settlementContractId,settlementPolicy:claim.settlementPolicy};
    const receive=e=>rpc('buyer1',`public.process_stripe_event_auction_receipt(${lit(JSON.stringify(e))}::jsonb,
      '${createHash('sha256').update(JSON.stringify(e)).digest('hex')}')`,'service_role');
    assert.equal((await receive({...evidence,eventId:'evt_Wrong',accountId:'acct_fixture'})).status,'reconciliation_required');
    assert.equal((await receive(evidence)).status,'fulfilled');
    assert.equal((await receive({...evidence,eventId:'evt_WrongContract',settlementContractId:randomUUID()})).status,'reconciliation_required');
    assert.equal((await rpc('buyer1',`public.resolve_paid_creator_event_pass_access('${events.show1}')`)).allowed,true);
    const facts={account_id:'acct_platform',environment:'test',currency:'usd',charge_id:'ch_Platform',
      payment_intent_id:'pi_Platform',balance_id:'txn_Platform',balance_status:'available',disputed:false,
      financial_authority:false,gross_minor:237,provider_fee_minor:37,tax_minor:0,store_fee_minor:0,
      refunded_minor:0,refund_net_minor:0,tax_reversal_minor:0,refunds:[]};
    const observe=(patch={})=>rpc('buyer1',`public.record_auction_platform_cost_observation('${claim.settlementContractId}',
      ${lit(JSON.stringify({...facts,...patch}))}::jsonb)`,'service_role');


    const worker=expression=>rpc('buyer1',expression,'service_role');
    assert.deepEqual(await worker('public.claim_auction_automation_batch()'),[]);
    const anchor=(await rows(`select id from private.auction_platform_qualifications where capability_id='${cap}' order by verified_at desc,id desc limit 1`))[0].id;
    const approval=(await rows(`insert into private.auction_automation_approvals(qualification_id,capability_id,creator_id,platform_account_id,recipient_account_id,product_id,platform_product_id,max_transfer_minor,daily_limit_minor,owner_approval_reference,approved_by,contract_created_after,expires_at,enabled)
     values('${anchor}','${cap}','${actors.creator.user_id}','acct_platform','acct_fixture','${product}','prod_AuctionFixture',1000,10000,'SYNTHETIC TEST APPROVAL ONLY','${actors.creator.user_id}',(select created_at from private.auction_platform_settlement_contracts where id='${claim.settlementContractId}'),clock_timestamp()+interval '1 hour',true) returning id`))[0].id;
    assert.deepEqual(await worker('public.claim_auction_automation_batch()'),[],'approval does not activate controls');
    for(const role of ['anon','authenticated'])await assert.rejects(rpc('buyer1','public.claim_auction_automation_batch()',role),/permission denied/);
    await db.exec('update private.auction_automation_controls set observe_enabled=true,renew_enabled=true,dispatch_enabled=true');
    const jobs=await worker('public.claim_auction_automation_batch()');assert.equal(jobs.length,1);const job=jobs[0];assert.equal(job.contract_id,claim.settlementContractId);
    assert.deepEqual(await worker('public.claim_auction_automation_batch()'),[],'duplicate scheduler cannot get another lease');
    const qualify=f=>worker(`public.record_auction_automation_qualification('${job.lease}',${lit(JSON.stringify(f))}::jsonb)`);
    const qfacts={platform_account_id:'acct_platform',recipient_account_id:'acct_fixture',platform_product_id:'prod_AuctionFixture',environment:'test',provider_ready:true,complete:true,financial_authority:false};
    await assert.rejects(qualify({...qfacts,recipient_account_id:'acct_other'}),/facts_invalid/);
    await assert.rejects(qualify({...qfacts,complete:false}),/facts_invalid/);
    const qualified=await qualify(qfacts);assert.ok(qualified.qualificationId);assert.equal((await qualify(qfacts)).qualificationId,qualified.qualificationId);
    assert.equal((await rows(`select count(*)::int n from private.auction_automation_qualification_reads`))[0].n,1);
    await observe();
    await assert.rejects(worker(`public.reserve_auction_test_transfer_before_fee_gate('${job.contract_id}')`),/permission denied/);
    await assert.rejects(worker(`public.claim_auction_test_transfer_dispatch_before_fee_gate('${randomUUID()}')`),/permission denied/);
    assert.equal((await worker(`public.get_auction_automation_preflight('${job.lease}')`)).status,'held','future event cannot qualify just because account is enabled');
    assert.equal((await worker(`public.reserve_auction_test_transfer('${job.contract_id}')`)).reason,'tax_service_fee_unverified','manual authoritative reservation cannot bypass final fee hold');
    const outcome=await worker(`public.claim_auction_automation_dispatch('${job.lease}','{}'::jsonb)`);
    assert.equal(outcome.dispatchAuthorized,false);assert.equal(outcome.reason,'tax_service_fee_unverified','actual current schema never authorizes incomplete net settlement');
    for(const table of ['auction_transfer_operations','auction_transfer_result_observations','auction_automation_transfer_bindings'])assert.equal((await rows(`select count(*)::int n from private.${table}`))[0].n,0);
    for(const role of ['anon','authenticated','service_role']){
     for(const table of ['auction_automation_approvals','auction_automation_controls','auction_automation_jobs','auction_automation_attempts','auction_automation_qualification_reads','auction_automation_transfer_bindings']){
      await assert.rejects(db.exec(`begin;set local role ${role};select * from private.${table};commit`),/permission denied/);await db.exec('rollback');
     }
    }
    await assert.rejects(db.exec(`update private.auction_automation_approvals set daily_limit_minor=999999 where id='${approval}'`),/immutable/);
    await assert.rejects(db.exec('delete from private.auction_automation_qualification_reads'),/append_only/);
    await db.exec(`update private.auction_automation_approvals set revoked_at=clock_timestamp() where id='${approval}'`);
    await assert.rejects(qualify(qfacts),/authority_unavailable/);
    await assert.rejects(worker(`public.claim_auction_automation_dispatch('${job.lease}','{}'::jsonb)`),/authority_stale/);
    const finish=await worker(`public.complete_auction_automation_job('${job.lease}',false)`);assert.equal(finish.stale,false);
    assert.equal((await worker(`public.complete_auction_automation_job('${job.lease}',true)`)).stale,true);
    // An explicitly approved successor may reauthorize an unattempted contract
    // inside its own cutoff; it cannot adopt any reserved/dispatched operation.
    const successor=(await rows(`insert into private.auction_automation_approvals(qualification_id,capability_id,creator_id,platform_account_id,recipient_account_id,product_id,platform_product_id,max_transfer_minor,daily_limit_minor,owner_approval_reference,approved_by,contract_created_after,expires_at,enabled)
     select qualification_id,capability_id,creator_id,platform_account_id,recipient_account_id,product_id,platform_product_id,max_transfer_minor,daily_limit_minor,'SYNTHETIC SUCCESSOR ONLY',approved_by,contract_created_after,clock_timestamp()+interval '1 hour',true from private.auction_automation_approvals where id='${approval}' returning id`))[0].id;
    await db.exec("update private.auction_automation_jobs set next_attempt_at='-infinity';update private.auction_automation_controls set next_run_at='-infinity'");
    const next=await worker('public.claim_auction_automation_batch()');assert.equal(next.length,1);assert.equal(next[0].approval_id,successor);assert.notEqual(next[0].lease,job.lease);
    assert.equal((await worker(`public.complete_auction_automation_job('${job.lease}',true)`)).stale,true);
    assert.equal((await rows('select count(*)::int n from public.creator_earnings_ledger'))[0].n,0);
  }finally{Date.now=realDateNow;await db.close();}
});
