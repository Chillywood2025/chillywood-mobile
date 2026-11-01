import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';

test('historical observer protocol replays forward into current tax-held financial boundaries', {timeout:180000}, async()=>{
  const realDateNow=Date.now;
  // Positive legacy protocol assertions below are explicitly historical, not
  // current payout eligibility. Replay every successor before current controls.
  const migrationDir=new URL('../supabase/migrations/',import.meta.url);
  const successors=fs.readdirSync(migrationDir).filter(name=>name.endsWith('.sql')&&name>='20261031033642_').sort();
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false,excludeMigrations:successors});
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

    const read=(who='creator',after='null',limit=20)=>rpc(who,`public.list_creator_auction_held_earnings(${after},${limit})`);
    let page=await read();assert.equal(page.entries.length,1);assert.equal(page.entries[0].id,claim.settlementContractId);
    assert.equal(page.entries[0].creatorMinor,null);assert.equal(page.entries[0].netMinor,null);assert.equal(page.entries[0].recoveryObligationMinor,null);
    assert.ok(page.entries[0].holdReasons.includes('provider_costs_unverified'));assert.ok(page.entries[0].holdReasons.includes('fulfillment_or_qualification_review'));
    assert.equal(page.financialAuthority,false);assert.equal(page.notPayable,true);assert.equal(page.entries[0].notPayable,true);
    assert.equal(page.entries[0].buyerId,undefined);assert.equal(page.entries[0].recipientAccountId,undefined);
    assert.deepEqual((await read('buyer1')).entries,[]);
    await assert.rejects(read('buyer1',lit(claim.settlementContractId)),/creator_earnings_unavailable/);
    await assert.rejects(read('creator',lit(randomUUID())),/creator_earnings_unavailable/);
    for(const role of ['anon','service_role'])await assert.rejects(rpc('creator','public.list_creator_auction_held_earnings()',role),/permission denied/);
    const session=actors.creator.session_id;actors.creator.session_id=randomUUID();await assert.rejects(read(),/creator_earnings_unavailable/);actors.creator.session_id=session;
    await observe({provider_fee_minor:237});page=await read();assert.equal(page.entries[0].netMinor,0);assert.equal(page.entries[0].creatorMinor,0,'known zero is not missing evidence');
    assert.ok(page.entries[0].holdReasons.includes('not_payable_source_only'));
    const other=await configure('show3','buyer3');await rpc('buyer3',other.call,'service_role');
    page=await read('creator','null',1);assert.equal(page.entries.length,1);assert.equal(page.nextCursor,page.entries[0].id);
    const next=await read('creator',lit(page.nextCursor),1);assert.equal(next.entries.length,1);assert.notEqual(next.entries[0].id,page.entries[0].id);assert.equal(next.nextCursor,null);
    assert.equal((await read('creator',lit(next.entries[0].id),1)).entries.length,0);
    const worker=expression=>rpc('buyer1',expression,'service_role');
    assert.equal((await worker('public.claim_auction_observation_batch()')).claimed,false);
    await db.exec('update private.auction_observer_control set enabled=true');
    const batch=await worker('public.claim_auction_observation_batch()');assert.equal(batch.jobs.length,1,'pending checkout is not observed');assert.equal(batch.jobs[0].contract_id,claim.settlementContractId);
    assert.equal((await worker('public.claim_auction_observation_batch()')).claimed,false);
    const job=batch.jobs[0],finish=(lease=job.lease,complete=true,status='held')=>worker(`public.complete_auction_observation('${job.contract_id}','${lease}',${complete},'${status}')`);
    assert.equal((await finish(randomUUID())).stale,true);
    await db.exec(`update private.auction_observer_jobs set lease_until=null where contract_id='${job.contract_id}'`);assert.equal((await finish()).stale,true);
    await db.exec(`update private.auction_observer_jobs set lease_until=clock_timestamp()+interval '5 minutes' where contract_id='${job.contract_id}'`);
    assert.equal((await worker(`public.qualify_auction_event_release_from_domain('${job.contract_id}')`)).status,'held');
    assert.equal((await finish()).stale,false);assert.equal((await finish()).stale,true);assert.equal((await read()).entries[0].providerRefreshStatus,'fresh');
    await db.exec(`update private.auction_observer_jobs set last_success_at=clock_timestamp()-interval '2 hours',next_attempt_at='-infinity';update private.auction_observer_control set next_run_at='-infinity',lease_until='-infinity'`);
    assert.equal((await read()).entries[0].providerRefreshStatus,'stale');
    const retry=(await worker('public.claim_auction_observation_batch()')).jobs[0];assert.notEqual(retry.lease,job.lease);assert.equal((await finish()).stale,true);
    assert.equal((await finish(retry.lease,false,'unknown')).stale,false);assert.equal((await read()).entries[0].providerRefreshStatus,'stale');
    await db.exec(`update private.auction_platform_qualifications set revoked_at=clock_timestamp() where capability_id='${cap}'`);
    assert.ok((await read()).entries[0].holdReasons.includes('recipient_qualification_required'));
    const refund={...evidence,eventId:'evt_ObserverRefund',eventType:'charge.refunded',objectId:'ch_Platform',checkoutSessionId:null,outcome:'refunded',refundedAmountMinor:100};
    assert.equal((await receive(refund)).status,'refunded');
    assert.ok((await read()).entries[0].holdReasons.includes('payment_or_dispute_reconciliation'),'late refund never exposes old estimate as releasable');
    await db.exec("update private.auction_observer_jobs set next_attempt_at='-infinity';update private.auction_observer_control set next_run_at='-infinity',lease_until='-infinity'");
    const revoked=(await worker('public.claim_auction_observation_batch()')).jobs;assert.equal(revoked.length,1);assert.equal(revoked[0].contract_id,job.contract_id,'revoked payment still receives provider reconciliation');
    assert.equal((await worker(`public.qualify_auction_event_release_from_domain('${job.contract_id}')`)).status,'held','refund cannot qualify release');

    for(const role of ['anon','authenticated','service_role']){
      await assert.rejects(db.exec(`begin;set local role ${role};select * from private.auction_observer_jobs;commit`),/permission denied/);await db.exec('rollback');
    }
    for(const table of ['auction_transfer_operations','auction_transfer_plans','auction_transfer_result_observations'])assert.equal((await rows(`select count(*)::int n from private.${table}`))[0].n,0);
    assert.equal((await rows('select count(*)::int n from public.creator_earnings_ledger'))[0].n,0);
    for(const file of successors)await db.exec(fs.readFileSync(new URL(file,migrationDir),'utf8'));
    // Current resumable observer continuation uses the real auction contract,
    // private checkpoint and durable queue; it does not clear the refund/tax hold.
    await assert.rejects(worker(`public.begin_stripe_cost_history('auction','${claim.settlementContractId}','acct_wrong')`),/source_account_mismatch/);
    const history=await worker(`public.begin_stripe_cost_history('auction','${claim.settlementContractId}','acct_platform')`);
    const progressLease=randomUUID();
    await db.exec(`update private.auction_observer_jobs set lease='${progressLease}',lease_until=clock_timestamp()+interval '5 minutes',consecutive_failures=3 where contract_id='${claim.settlementContractId}'`);
    const beforeProgress=(await rows(`select last_success_at from private.auction_observer_jobs where contract_id='${claim.settlementContractId}'`))[0].last_success_at;
    const checkpoint={version:1,phase:'collect',cursor:1,verificationStartedAt:null,entries:[{path:'/v1/account',facts:{id:'acct_platform',object:'account'},status:200,observedAt:Date.now()}]};
    const saved=await worker(`public.save_stripe_cost_history('auction','${claim.settlementContractId}','${history.generation}','${history.lease}',${lit(JSON.stringify(checkpoint))}::jsonb,null)`);
    assert.equal(saved.status,'history_pending');
    assert.equal((await worker(`public.continue_auction_cost_history_refresh('${claim.settlementContractId}','${progressLease}')`)).historyProgress,true);
    const continued=(await rows(`select consecutive_failures,last_success_at,domain_status,next_attempt_at between clock_timestamp()+interval '14 minutes' and clock_timestamp()+interval '16 minutes' timely from private.auction_observer_jobs where contract_id='${claim.settlementContractId}'`))[0];
    assert.equal(continued.consecutive_failures,3);assert.equal(continued.last_success_at?.getTime(),beforeProgress?.getTime());assert.equal(continued.domain_status,'unknown');assert.equal(continued.timely,true);
    assert.equal((await rows('select count(*)::int n from private.stripe_cost_history_receipts'))[0].n,0);
    const current=await worker(`public.reserve_auction_test_transfer('${claim.settlementContractId}')`);
    assert.equal(current.status,'held');assert.equal(current.reason,'tax_service_fee_unverified');
    assert.ok((await read()).entries[0].holdReasons.includes('tax_service_fee_unverified'));
    assert.equal((await rows('select count(*)::int n from private.commerce_tax_qualifications'))[0].n,0);
    assert.equal((await rows('select count(*)::int n from private.auction_transfer_operations'))[0].n,0);
  }finally{Date.now=realDateNow;await db.close();}
});
