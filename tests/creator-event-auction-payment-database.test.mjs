import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';

test('synthetic verified Stripe auction receipts preserve exact paid access and financial history', {timeout:180000}, async()=>{
  const realDateNow=Date.now; let clockOffset=0;
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true});
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
    const prepare=async(name,buyer='buyer1')=>{
      const offer=await rpc('creator',`public.configure_paid_creator_event_sale('${events[name]}','Virtual show',99,1,'sandbox',
        'America/New_York',now()-interval '1 hour',least(now()+interval '1 day',(select starts_at from public.creator_events where id='${events[name]}')))`);
      const auction=await rpc('creator',`public.create_creator_event_auction('${events[name]}','${offer.termsRevisionId}',237,1,
        clock_timestamp()+interval '600 milliseconds',now()+interval '1 hour','test')`);
      await rpc(buyer,`public.place_creator_event_auction_bid('${auction.id}',237,'${randomUUID()}',null)`);
      await new Promise(r=>setTimeout(r,650));
      const quote=await rpc(buyer,`public.create_creator_event_auction_award_quote('${auction.id}',null)`);
      const attempt=randomUUID();
      const call=`public.prepare_creator_event_auction_checkout('${quote.id}','${actors[buyer].user_id}','${actors[buyer].session_id}','${attempt}')`;
      await assert.rejects(()=>rpc(buyer,call),/permission denied/);
      const claim=await rpc(buyer,call,'service_role');
      assert.equal(claim.startAuthorized,true);
      assert.equal((await rpc(buyer,call,'service_role')).startAuthorized,false,'lost dispatch response never authorizes a second call');
      return {offer,auction,quote,claim,buyer,name};
    };
    const evidence=(s,suffix,extra={})=>({eventId:`evt_${suffix}`,eventType:'checkout.session.completed',
      occurredAt:new Date(Date.now()).toISOString(),accountId:'acct_fixture',environment:'test',objectId:`cs_test_${suffix}`,
      paymentIntentId:`pi_${suffix}`,checkoutSessionId:`cs_test_${suffix}`,quoteId:s.quote.id,
      buyerId:actors[s.buyer].user_id,creatorId:actors.creator.user_id,auctionId:s.auction.id,
      amountMinor:237,currency:'usd',outcome:'paid',refundedAmountMinor:null,providerProductId:'prod_AuctionFixture',...extra});
    const receive=(e,hash=createHash('sha256').update(JSON.stringify(e)).digest('hex'))=>rpc('buyer1',
      `public.process_stripe_event_auction_receipt(${lit(JSON.stringify(e))}::jsonb,'${hash}')`,'service_role');
    const count=async(table,where='true')=>Number((await rows(`select count(*) n from ${table} where ${where}`))[0].n);
    const s=await prepare('show1');
    await assert.rejects(()=>db.exec(`update public.monetization_products set provider_product_id='wrong' where id='${product}'`),/bound_auction_product_identity_immutable/);
    assert.equal(await count('public.access_grants'),0,'winner and checkout claim are not paid access');
    const good=evidence(s,'Success');
    await rpc('buyer1',`public.bind_creator_event_auction_checkout('${s.quote.id}','${s.claim.checkoutAttemptId}',
      'cs_test_Success',null,'acct_fixture',237,'usd')`,'service_role');
    const releaseCall=`public.revalidate_creator_event_auction_checkout('${s.quote.id}','${actors.buyer1.user_id}',
      '${actors.buyer1.session_id}','${s.claim.checkoutAttemptId}')`;
    assert.equal(await rpc('buyer1',releaseCall,'service_role'),true,'exact current quote can release its bound Checkout URL');
    await rpc('buyer1',`public.bind_creator_event_auction_checkout('${s.quote.id}','${s.claim.checkoutAttemptId}',
      'cs_test_Success','pi_Success','acct_fixture',237,'usd')`,'service_role');
    await assert.rejects(()=>rpc('buyer1',`public.bind_creator_event_auction_checkout('${s.quote.id}','${s.claim.checkoutAttemptId}',
      'cs_test_Replacement','pi_Success','acct_fixture',237,'usd')`,'service_role'),/checkout_response_mismatch/);
    await assert.rejects(()=>rpc('buyer1',`public.bind_creator_event_auction_checkout('${s.quote.id}','${s.claim.checkoutAttemptId}',
      'cs_test_Success','pi_Replacement','acct_fixture',237,'usd')`,'service_role'),/checkout_response_mismatch/);
    const recoverCall=`public.recover_creator_event_auction_checkout('${s.quote.id}','${actors.buyer1.user_id}','${actors.buyer1.session_id}','${s.claim.checkoutAttemptId}')`;
    await assert.rejects(()=>rpc('buyer1',recoverCall),/permission denied/);
    const recovered=await rpc('buyer1',recoverCall,'service_role');
    assert.equal(recovered.startAuthorized,false);assert.equal(recovered.recoveryAuthorized,true);
    assert.equal(recovered.providerCheckoutSessionId,'cs_test_Success');
    assert.equal(await rpc('buyer1',`public.recover_creator_event_auction_checkout('${s.quote.id}',
      '${actors.buyer2.user_id}','${actors.buyer2.session_id}','${s.claim.checkoutAttemptId}')`,'service_role'),null);
    await db.exec("update public.platform_money_kill_switches set state='off' where key='digital_sales_enabled'");
    assert.equal(await rpc('buyer1',releaseCall,'service_role'),false,'kill-switch withdrawal during provider IO blocks URL release');
    await db.exec("update public.platform_money_kill_switches set state='sandbox_only' where key='digital_sales_enabled'");
    await db.exec(`update public.monetization_products set status='disabled' where id='${product}'`);
    assert.equal(await rpc('buyer1',releaseCall,'service_role'),false,'disabled qualified product blocks Checkout URL exposure');
    await db.exec(`update public.monetization_products set status='sandbox' where id='${product}'`);
    for(const [key,value] of [['buyerId',actors.buyer2.user_id],['creatorId',actors.buyer2.user_id],['amountMinor',238],
      ['currency','eur'],['accountId','acct_wrong'],['environment','live'],['auctionId',randomUUID()],['providerProductId','prod_Wrong']]) {
      const bad={...good,eventId:`evt_Bad${key}`,paymentIntentId:`pi_Bad${key}`,[key]:value};
      assert.equal((await receive(bad)).status,'reconciliation_required',key);
      assert.equal(await count('public.access_grants'),0,key+' cannot grant');
    }
    const paid=await receive(good);assert.equal(paid.status,'fulfilled');
    assert.equal(await count('public.access_grants'),1);
    assert.equal(await count('public.paid_creator_event_passes'),1);
    assert.equal((await rpc('buyer1',`public.resolve_paid_creator_event_pass_access('${events.show1}')`)).allowed,true);
    assert.equal((await rpc('buyer2',`public.resolve_paid_creator_event_pass_access('${events.show1}')`)).allowed,false);
    const library=await rpc('buyer1','public.read_my_creator_purchases()');
    const item=library.items.find(x=>x.purchaseIntentId===s.claim.purchaseIntentId);
    assert.equal(item.amountMinor,237);assert.equal(item.provider,'stripe_event_auction');assert.equal(item.terms.replayPolicy,'none');
    assert.ok(item.receipt);assert.equal(item.status,'upcoming');
    assert.equal((await receive(good)).duplicate,true);
    await assert.rejects(()=>receive(good,'f'.repeat(64)),/auction_provider_replay_mismatch/);
    assert.equal((await receive({...good,eventId:'evt_DuplicateSuccess'})).duplicate,true);
    assert.equal(await count('public.money_access_ledger_events'),1,'second paid event is not a second sale');
    await assert.rejects(()=>db.exec(`update private.creator_event_auction_receipts set reason='tampered'`),/event_ticket_terms_immutable/);
    const refund={...good,eventId:'evt_RefundPartial',eventType:'charge.refunded',objectId:'ch_Refund',checkoutSessionId:null,
      outcome:'refunded',refundedAmountMinor:100};
    await db.exec(`update public.monetization_products set status='disabled' where id='${product}'`);
    assert.equal((await receive(refund)).status,'refunded');
    assert.equal((await rpc('buyer1',`public.resolve_paid_creator_event_pass_access('${events.show1}')`)).allowed,false);
    assert.equal(await count('public.money_access_ledger_events'),2,'purchase remains and reversal appends');
    await receive({...refund,eventId:'evt_RefundFull',refundedAmountMinor:237});
    await receive({...refund,eventId:'evt_OlderPartial'});
    assert.equal(Number((await rows(`select sum(amount_minor) n from public.money_access_ledger_events where event_type='REFUND'`))[0].n),237,
      'cumulative full/partial and out-of-order refunds never overcount');
    await db.exec(`update public.monetization_products set status='sandbox' where id='${product}'`);
    assert.equal((await rpc('buyer1','public.read_my_creator_purchases()')).items.find(x=>x.id===item.id).status,'refunded');
    await receive({...good,eventId:'evt_DelayedSuccess'});
    assert.equal(await count('public.access_grants',"status in('active','sandbox_only')"),0,'late success cannot resurrect refunded access');

    const canceled=await prepare('show2','buyer2');
    const updated=(await rows(`select updated_at from public.creator_events where id='${events.show2}'`))[0].updated_at;
    await rpc('creator',`public.manage_creator_event_lifecycle('${events.show2}','cancel','${new Date(updated).toISOString()}',null,null,null,'Show canceled',false)`);
    assert.equal((await receive(evidence(canceled,'Canceled'))).status,'reconciliation_required');
    assert.equal(await count('public.access_grants',"status in('active','sandbox_only')"),0);
    assert.equal(await count('public.creator_event_purchase_remedies',`purchase_intent_id='${canceled.claim.purchaseIntentId}' and reason='event_canceled'`),1);
    assert.equal((await rpc('buyer2','public.read_my_creator_purchases()')).items.find(x=>x.id===canceled.claim.purchaseIntentId).status,'paid_unfulfilled');

    const disputed=await prepare('show3','buyer3');const third=evidence(disputed,'Third');
    await receive(third);
    await receive({...third,eventId:'evt_Dispute',eventType:'charge.dispute.created',outcome:'disputed',objectId:'dp_Dispute',checkoutSessionId:null});
    assert.equal((await rpc('buyer3',`public.resolve_paid_creator_event_pass_access('${events.show3}')`)).allowed,false);
    assert.equal((await rpc('buyer3','public.read_my_creator_purchases()')).items.find(x=>x.id===disputed.claim.purchaseIntentId).status,'disputed');

    const abandoned=await prepare('show4','buyer4');
    const expiration={...evidence(abandoned,'Abandoned'),eventType:'checkout.session.expired',paymentIntentId:null};
    const expireCall=`public.process_stripe_event_auction_no_payment(${lit(JSON.stringify(expiration))}::jsonb,'${'d'.repeat(64)}')`;
    await assert.rejects(()=>rpc('buyer4',expireCall),/permission denied/);
    assert.equal((await rpc('buyer4',expireCall,'service_role')).status,'canceled');
    assert.equal((await rpc('buyer4',expireCall,'service_role')).duplicate,true);
    assert.equal(Number((await rows(`select public.event_ticket_inventory_internal('${events.show4}') n`))[0].n),0,
      'signed exact no-payment expiration releases only its own inventory hold');
    assert.equal((await rpc('buyer4','public.read_my_creator_purchases()')).items.find(x=>x.id===abandoned.claim.purchaseIntentId).status,'canceled');
    assert.equal((await receive(evidence(abandoned,'ConflictingPaid'))).status,'reconciliation_required',
      'conflicting paid-after-expired event is preserved, not silently re-admitted');

    const reversed=await prepare('show5','buyer5'); const late=evidence(reversed,'Reversed');
    assert.equal((await receive({...late,eventId:'evt_EarlyRefund',eventType:'charge.refunded',outcome:'refunded',
      objectId:'ch_Early',checkoutSessionId:null,refundedAmountMinor:237})).status,'reconciliation_required');
    assert.equal((await receive(late)).status,'reconciliation_required','refund-before-paid cannot create access');
    assert.equal((await rpc('buyer5',`public.resolve_paid_creator_event_pass_access('${events.show5}')`)).allowed,false);
    assert.equal(await count('public.money_access_ledger_events',"payable_state in('payable','paid')"),0);
    assert.equal(await count('public.creator_earnings_ledger'),0,'a webhook never creates earnings or payout authority');

    // Isolated WASM clock only, not the OS clock or a replacement SQL function.
    // Every production trigger and RLS guard remains installed/enabled. This
    // proves temporal SQL behavior, not native wall-clock/concurrency timing.
    const oldReplayEvent=events.show6;events.show6=randomUUID();
    await db.exec(`insert into public.creator_events select (jsonb_populate_record(null::public.creator_events,
      to_jsonb(e)||jsonb_build_object('id','${events.show6}'))).* from public.creator_events e where id='${oldReplayEvent}'`);
    await db.exec(`update public.creator_events set starts_at=now()+interval '2 hours',ends_at=now()+interval '3 hours',
      replay_policy='until_expiration',replay_available_at=now()+interval '3 hours',replay_expires_at=now()+interval '4 hours'
      where id='${events.show6}'`);
    const replay=await prepare('show6','buyer6'); const replayPaid=evidence(replay,'Replay');
    assert.equal((await receive(replayPaid)).status,'fulfilled');
    const replayTerms=(await rpc('buyer6','public.read_my_creator_purchases()')).items.find(x=>x.id===replay.claim.purchaseIntentId).terms;
    assert.equal(replayTerms.replayPolicy,'until_expiration');
    await assert.rejects(()=>db.exec(`update public.creator_events set replay_policy='none',replay_available_at=null,replay_expires_at=null
      where id='${events.show6}'`),/purchased_event_lifecycle_management_required|purchased_event_replay_terms_immutable/);
    const lateCase=await prepare('show7','buyer7');
    const before=Number((await rows('select extract(epoch from clock_timestamp())*1000 as n'))[0].n);
    clockOffset=61*60*1000;Date.now=()=>realDateNow()+clockOffset;
    const after=Number((await rows('select extract(epoch from clock_timestamp())*1000 as n'))[0].n);
    assert.ok(after-before>=clockOffset,'PGlite clock_timestamp actually advances with the isolated JS clock');
    assert.equal((await rpc('buyer7','public.wave1_session_authority_readback()')).state,'ACTIVE','fixture session survives real authority checks after clock advance');
    assert.equal((await receive(evidence(lateCase,'LateButAvailable'))).status,'fulfilled','D1 late exact award reclaims its own still-available seat');
    assert.equal(Number((await rows(`select public.event_ticket_inventory_internal('${events.show7}') n`))[0].n),1,'late fulfillment never double-counts reservation and auction hold');

    const premium=(await rows("select * from public.monetization_products where product_type='premium_subscription' and provider='revenuecat_google_play' and environment='sandbox' order by id limit 1"))[0];
    assert.equal((await rpc('creator',`public.process_revenuecat_premium_event_atomic('revenuecat_google_play','auction-host-premium',
      'INITIAL_PURCHASE','${actors.creator.user_id}','${premium.provider_product_id}',${premium.provider_base_plan_id?lit(premium.provider_base_plan_id):'null'},
      'sandbox','active',now()-interval '1 minute',now()+interval '1 day',now(),999,'usd',repeat('a',64),'NORMAL',
      'google_play','android',null,'${premium.id}','auction-host-original')`,'service_role')).status,'processed');
    clockOffset=121*60*1000;
    const broadcast=await rpc('creator',`public.prepare_creator_event_broadcast('${events.show6}')`);
    await db.exec(`insert into private.creator_event_broadcast_approvals(creator_id,creator_event_id,rights_status,max_minutes,expires_at,
      private_origin,approved_by,approved_session_id) values('${actors.creator.user_id}','${events.show6}','creator_owned',120,
      now()+interval '2 hours','https://private.example.test','${actors.buyer19.user_id}','${actors.buyer19.session_id}');
      insert into public.livekit_servers(server_id,display_name,provider,region,public_ws_url,status)
      values('auction-replay-fixture','Synthetic auction replay','other','test','wss://live.example.test','active');
      insert into public.livekit_room_assignments(app_room_id,livekit_room_name,assigned_server_id,assignment_reason,room_type)
      select '${broadcast.roomId}','${broadcast.roomId}',id,'synthetic auction replay','live_stage' from public.livekit_servers where server_id='auction-replay-fixture';`);
    await rpc('creator','public.heartbeat_creator_event_broadcast_worker()','service_role');
    const source=await rpc('creator',`public.claim_creator_event_broadcast_start('${events.show6}','${actors.creator.user_id}','${actors.creator.session_id}')`,'service_role');
    assert.equal(source.claimed,true);
    const producer=status=>rpc('creator',`public.record_creator_event_broadcast_provider('${events.show6}','${actors.creator.user_id}',
      '${actors.creator.session_id}','${source.attemptId}','EG_auction_replay','${status}',
      '${source.privateOrigin}/${source.outputPrefix}/${status==='ACTIVE'?'live':'index'}.m3u8',
      '${source.outputPrefix}/${status==='ACTIVE'?'live':'index'}.m3u8',true,true)`,'service_role');
    await producer('ACTIVE');
    const lifecycle=async action=>{
      const t=(await rows(`select updated_at from public.creator_events where id='${events.show6}'`))[0].updated_at;
      return rpc('creator',`public.manage_creator_event_lifecycle('${events.show6}','${action}','${new Date(t).toISOString()}')`);
    };
    await lifecycle('start');
    const live=await rpc('buyer6',`public.resolve_creator_event_destination('${events.show6}')`);
    assert.equal(live.allowed,true);assert.equal(live.kind,'live');
    assert.equal((await rpc('buyer8',`public.resolve_creator_event_destination('${events.show6}')`)).allowed,false);
    clockOffset=181*60*1000;
    await producer('COMPLETE'); await lifecycle('end');
    const destination=await rpc('buyer6',`public.resolve_creator_event_destination('${events.show6}')`);
    assert.equal(destination.allowed,true);assert.equal(destination.kind,'replay','D3 paid award follows original explicit replay contract');
    const playback=await rpc('buyer6',`public.read_creator_event_playback_source('${events.show6}','${actors.buyer6.user_id}','${actors.buyer6.session_id}')`,'service_role');
    assert.equal(playback.allowed,true);assert.match(playback.sourceUrl,/index\.m3u8$/);
    clockOffset=241*60*1000;
    assert.equal((await rpc('buyer6',`public.resolve_creator_event_destination('${events.show6}')`)).allowed,false,'replay expires at original purchased boundary');
    assert.equal((await rpc('buyer6','public.read_my_creator_purchases()')).items.find(x=>x.id===replay.claim.purchaseIntentId).status,'expired');
  }finally{Date.now=realDateNow;await db.close();}
});
