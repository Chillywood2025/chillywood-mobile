import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import ts from 'typescript';

const purchaseModule = {exports:{}};
new Function('exports','require',ts.transpileModule(fs.readFileSync('_lib/creatorPurchases.ts','utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(purchaseModule.exports,
  name=>{assert.ok(['./accountBoundSupabaseMutation','./accountSessionAuthority','./creatorMoneyPurchaseAuthority','./revenuecat'].includes(name));return {};});
const wallet = purchaseModule.exports;

test('synthetic verified Stripe room auction receipts preserve exact paid access and financial history', {timeout:180000}, async()=>{
  const realDateNow=Date.now; let clockOffset=0;
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true});
  try {
    // The shared SQL fixture historically casts arbitrary MD5 bytes to UUID.
    // Use RFC-shaped fixture identities for the real strict client boundary;
    // creator selection still executes the actual rollout hash predicate.
    await db.exec(`create temporary table room_library_fixture_marker(id integer);
      create function pg_temp.room_library_uuid_hash(text) returns text language sql as
      $$select overlay(overlay(md5($1) placing '4' from 13 for 1) placing '8' from 17 for 1)$$`);
    await db.exec(fs.readFileSync(new URL('./fixtures/event-reservation-authority.sql',import.meta.url),'utf8')
      .replaceAll('md5(', 'pg_temp.room_library_uuid_hash('));
    await db.exec(fs.readFileSync(new URL('./fixtures/creator-external-payment-authority.sql',import.meta.url),'utf8'));
    await db.exec("update public.creator_events set visibility='public' where id in(select id from event_reservation_fixture.events)");
    const rows=async s=>(await db.query(s)).rows;
    const bindBody=(await rows("select pg_get_functiondef('public.bind_creator_room_auction_checkout(uuid,uuid,text,text,text,integer,text)'::regprocedure) body"))[0].body;
    const roomLock=bindBody.indexOf('perform private.lock_creator_room_inventory(a.party_id)');
    const auctionLock=bindBody.indexOf('perform 1 from private.creator_room_seat_auctions where id=a.id for update');
    const quoteLock=bindBody.indexOf('select * into q from private.creator_room_auction_quotes where id=p_quote_id for update');
    assert.ok(roomLock>=0&&auctionLock>roomLock&&quoteLock>auctionLock,'installed binder follows room → auction → quote lock order');
    const actors=Object.fromEntries((await rows('select * from event_reservation_fixture.actors')).map(a=>[a.kind,a]));
    const events=Object.fromEntries((await rows('select * from event_reservation_fixture.events')).map(a=>[a.name,a.id]));
    const lit=x=>`'${String(x).replaceAll("'","''")}'`;
    const rpc=async(actor,expression,role='authenticated',platform='ios')=>{
      const a=actors[actor];
      try {const r=await db.exec(`begin;set local role ${role};set local request.jwt.claims=${lit(JSON.stringify({role,sub:a.user_id,session_id:a.session_id}))};
        set local request.headers=${lit(JSON.stringify({'x-chillywood-platform':platform}))}; select ${expression} result;commit;`);
        return r.flatMap(x=>x.rows).at(-1).result;
      }catch(e){await db.exec('rollback');throw e;}
    };
    const cap=(await rows(`insert into private.creator_external_payment_capabilities(feature,creator_id,provider_account_id,
      platform,storefront,storefront_country,route_kind,currency,environment,payment_method,min_amount_minor,max_amount_minor,
      provider_bounds_evidence,route_approval_evidence,verified_at,expires_at,enabled)
      values('room_seat_auction','${actors.creator.user_id}','acct_fixture','ios','UNITED_STATES','US','external_browser_checkout','usd','test','card',50,100000,
        'synthetic test only','synthetic test only',now(),now()+interval '2 hours',true) returning id`))[0].id;
    await db.exec(`insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
      select '${cap}',user_id,session_id,'synthetic test only',now(),now()+interval '10 minutes'
      from event_reservation_fixture.actors where kind like 'buyer%';`);
    const product=(await rows(`insert into public.monetization_products(product_key,product_type,display_name,provider,
      provider_product_id,environment,status,is_android_digital,is_physical_good)
      values('auction_fixture_only','room_seat_pass','Synthetic auction event','stripe_room_auction','prod_AuctionFixture',
        'sandbox','sandbox',false,false) returning id`))[0].id;
    await db.exec(`insert into private.creator_room_auction_product_bindings values('${cap}','${product}','synthetic test only',now())`);
    const prepare=async(name,buyer='buyer1',platform='ios',sourceKind='stage_reserved_seat')=>{
      if(sourceKind==='party_admission') {
        await db.exec("insert into public.titles(id,title,video_url,is_published,status) values('12121212-1212-4212-8212-121212121212','Synthetic room title','https://fixture.invalid/title.mp4',true,'published')");
        await db.exec(`insert into public.watch_party_rooms(party_id,title_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)
          values('PAYMENT-${name}','12121212-1212-4212-8212-121212121212','${actors.creator.user_id}','title','open','party_pass',true,'private')`);
        await rpc('creator',`public.set_paid_watch_party_offer('PAYMENT-${name}','Limited admission',99,1,'sandbox')`);
      } else await db.exec(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)
       values('PAYMENT-${name}','${actors.creator.user_id}','live','open','open',true,'private')`);
      const setup=await rpc('creator',`public.prepare_creator_room_seat_auction('PAYMENT-${name}')`);
      const auction=await rpc('creator',`public.create_creator_room_seat_auction('PAYMENT-${name}','${sourceKind}',237,1,
        clock_timestamp()+interval '600 milliseconds',now()+interval '1 hour','test','${randomUUID()}','${setup.roomSessionId}')`);
      const token='synthetic-room-native-'+randomUUID();
      if(platform==='android') await rpc(buyer,`public.admit_google_play_external_session('room_seat_auction',
        '${actors.creator.user_id}',237,'${auction.id}','${token}',1)`,'authenticated',platform);
      await rpc(buyer,`public.place_creator_room_seat_auction_bid('${auction.id}',237,'${randomUUID()}',null)`,'authenticated',platform);
      await new Promise(r=>setTimeout(r,650));
      const quote=await rpc(buyer,`public.create_creator_room_seat_auction_award_quote('${auction.id}',null)`,'authenticated',platform);
      const attempt=randomUUID();
      const call=`public.prepare_creator_room_auction_checkout('${quote.id}','${actors[buyer].user_id}','${actors[buyer].session_id}','${attempt}')`;
      await assert.rejects(()=>rpc(buyer,call),/permission denied/);
      const claim=await rpc(buyer,call,'service_role',platform);
      assert.equal(claim.startAuthorized,true);
      assert.equal((await rpc(buyer,call,'service_role')).startAuthorized,false,'lost dispatch response never authorizes a second call');
      return {auction,quote,claim,buyer,name,token};
    };
    const evidence=(s,suffix,extra={})=>({eventId:`evt_${suffix}`,eventType:'checkout.session.completed',
      occurredAt:new Date(Date.now()).toISOString(),accountId:'acct_fixture',environment:'test',objectId:`cs_test_${suffix}`,
      paymentIntentId:`pi_${suffix}`,checkoutSessionId:`cs_test_${suffix}`,quoteId:s.quote.id,
      buyerId:actors[s.buyer].user_id,creatorId:actors.creator.user_id,auctionId:s.auction.id,
      amountMinor:237,currency:'usd',outcome:'paid',refundedAmountMinor:null,providerProductId:'prod_AuctionFixture',...extra});
    const receive=(e,hash=createHash('sha256').update(JSON.stringify(e)).digest('hex'))=>rpc('buyer1',
      `public.process_stripe_room_auction_receipt(${lit(JSON.stringify(e))}::jsonb,'${hash}')`,'service_role');
    const count=async(table,where='true')=>Number((await rows(`select count(*) n from ${table} where ${where}`))[0].n);
    const s=await prepare('PRIMARY');
    assert.equal(await count('public.access_grants'),0);
    const good=evidence(s,'Success');
    for(const [key,value] of [['buyerId',actors.buyer2.user_id],['amountMinor',238],['accountId','acct_wrong'],['environment','live'],['auctionId',randomUUID()]]) {
      assert.equal((await receive({...good,eventId:`evt_Bad${key}`,paymentIntentId:`pi_Bad${key}`,[key]:value})).status,'reconciliation_required');
      assert.equal(await count('public.access_grants'),0);
    }
    const paid=await receive(good);assert.equal(paid.status,'fulfilled');
    assert.equal(await count('public.access_grants'),1);
    assert.equal(await count('public.paid_live_watch_party_passes'),0,'new reserved spot is not a legacy eligibility pass');
    assert.equal(await count('public.paid_creator_event_passes'),0,'room is not a fake event');
    assert.equal((await rows(`select private.creator_room_seat_payment_verified('${s.auction.claimId}') valid`))[0].valid,true);
    const library=await rpc('buyer1','public.read_my_creator_purchases()');
    const item=library.items.find(x=>x.purchaseIntentId===s.claim.purchaseIntentId);
    assert.equal(item.sourceType,'room_seat_auction');assert.equal(item.terms.sourceKind,'stage_reserved_seat');
    assert.equal(item.destination.id,'PAYMENT-PRIMARY');assert.equal(item.amountMinor,237);assert.ok(item.receipt);
    const parsedLibrary=wallet.parseCreatorPurchasePage(library,actors.buyer1.user_id);
    assert.ok(parsedLibrary,`actual SQL room auction projection passes the production purchase parser: ${JSON.stringify(library)}`);
    assert.deepEqual(wallet.creatorPurchaseDestinationRoute(parsedLibrary.items.find(x=>x.id===item.id).destination),
      {pathname:'/watch-party/live-stage/[partyId]',params:{partyId:'PAYMENT-PRIMARY'}});
    assert.equal(wallet.parseCreatorPurchasePage(library,actors.buyer2.user_id),null,'receipt page cannot be rebound to another buyer');
    for(const change of [
      {destination:{kind:'watch_party',id:item.destination.id}}, {productType:'event_pass'}, {sourceId:'wrong'},
      {terms:{...item.terms,sourceKind:'unknown'}}, {terms:{...item.terms,claimId:'wrong'}},
      {terms:{...item.terms,roomSessionId:'wrong'}}, {provider:'revenuecat_google_play'},
    ]) assert.equal(wallet.parseCreatorPurchasePage({...library,items:[{...item,...change}]},actors.buyer1.user_id),null);
    const access=await rpc('buyer1',`public.resolve_live_watch_party_money_access('PAYMENT-PRIMARY')`);
    assert.equal(access.allowed,true);assert.equal(access.seatEligible,true);assert.equal(access.seatApproved,false);
    assert.equal((await receive(good)).duplicate,true);
    assert.equal((await receive({...good,eventId:'evt_DuplicateSuccess'})).duplicate,true);
    assert.equal(await count('public.money_access_ledger_events'),1);
    await assert.rejects(()=>receive(good,'f'.repeat(64)),/auction_provider_replay_mismatch/);
    const refund={...good,eventId:'evt_Refund',eventType:'charge.refunded',objectId:'ch_Refund',checkoutSessionId:null,outcome:'refunded',refundedAmountMinor:100};
    assert.equal((await receive(refund)).status,'refunded');
    assert.equal((await rows(`select private.creator_room_seat_payment_verified('${s.auction.claimId}') valid`))[0].valid,false);
    assert.equal((await receive({...refund,eventId:'evt_OlderRefund',refundedAmountMinor:50})).status,'refunded');
    assert.equal(Number((await rows(`select sum(amount_minor) n from public.money_access_ledger_events where event_type='REFUND'`))[0].n),100);
    const terminalFirst=await prepare('TERMINALFIRST');const lateSuccess=evidence(terminalFirst,'LateSuccess');
    await rpc('buyer1',`public.bind_creator_room_auction_checkout('${terminalFirst.quote.id}','${terminalFirst.claim.checkoutAttemptId}',
      'cs_test_LateSuccess','pi_LateSuccess','acct_fixture',237,'usd')`,'service_role');
    const recover=`public.recover_creator_room_auction_checkout('${terminalFirst.quote.id}','${actors.buyer1.user_id}',
      '${actors.buyer1.session_id}','${terminalFirst.claim.checkoutAttemptId}')`;
    await assert.rejects(()=>rpc('buyer1',recover),/permission denied/);
    const recovered=await rpc('buyer1',recover,'service_role');
    assert.equal(recovered.startAuthorized,false);assert.equal(recovered.recoveryAuthorized,true);
    assert.equal(recovered.providerCheckoutSessionId,'cs_test_LateSuccess');
    assert.equal(await rpc('buyer1',`public.recover_creator_room_auction_checkout('${terminalFirst.quote.id}',
      '${actors.buyer2.user_id}','${actors.buyer2.session_id}','${terminalFirst.claim.checkoutAttemptId}')`,'service_role'),null);
    await assert.rejects(()=>rpc('buyer1',`public.bind_creator_room_auction_checkout('${terminalFirst.quote.id}','${terminalFirst.claim.checkoutAttemptId}',
      'cs_test_Replacement','pi_LateSuccess','acct_fixture',237,'usd')`,'service_role'),/checkout_response_mismatch/);
    await assert.rejects(()=>rpc('buyer1',`public.bind_creator_room_auction_checkout('${terminalFirst.quote.id}','${terminalFirst.claim.checkoutAttemptId}',
      'cs_test_LateSuccess','pi_Replacement','acct_fixture',237,'usd')`,'service_role'),/checkout_response_mismatch/);
    await receive({...lateSuccess,eventId:'evt_RefundBeforeSuccess',eventType:'charge.refunded',outcome:'refunded',refundedAmountMinor:237});
    assert.equal((await receive(lateSuccess)).status,'reconciliation_required');
    assert.equal((await rows(`select private.creator_room_seat_payment_verified('${terminalFirst.auction.claimId}') valid`))[0].valid,false);
    const ended=await prepare('ENDED');
    await db.exec("update public.watch_party_rooms set is_active=false where party_id='PAYMENT-ENDED'");
    assert.equal((await receive(evidence(ended,'Ended'))).status,'reconciliation_required');
    assert.equal((await rows(`select refund_review_eligible from private.creator_room_seat_claims where id='${ended.auction.claimId}'`))[0].refund_review_eligible,true);
    const failed=await prepare('FAILED');
    const none={...evidence(failed,'Failed'),eventType:'checkout.session.expired',paymentIntentId:null};
    assert.equal((await rpc('buyer1',`public.process_stripe_room_auction_no_payment(${lit(JSON.stringify(none))}::jsonb,'${'a'.repeat(64)}')`,'service_role')).status,'canceled');
    assert.equal((await rows(`select state from private.creator_room_seat_claims where id='${failed.auction.claimId}'`))[0].state,'released');
    const disputed=await prepare('DISPUTE');const disputePaid=evidence(disputed,'DisputePaid');await receive(disputePaid);
    assert.equal((await receive({...disputePaid,eventId:'evt_Dispute',eventType:'charge.dispute.created',outcome:'disputed'})).status,'disputed');
    assert.equal((await rows(`select private.creator_room_seat_payment_verified('${disputed.auction.claimId}') valid`))[0].valid,false);
    // Synthetic global qualification is isolated test data, never deployment
    // configuration. Exercise the actual room quote/token/report chain.
    // Advance only this in-process fixture clock past the real five-room rate
    // window. Keep the production abuse trigger and its recorded rows intact.
    const beforeClock=Number((await rows('select extract(epoch from clock_timestamp()) t'))[0].t);
    clockOffset=601000;Date.now=()=>realDateNow()+clockOffset;
    const afterClock=Number((await rows('select extract(epoch from clock_timestamp()) t'))[0].t);
    assert.ok(afterClock-beforeClock>=600,'PGlite fixture clock advances, not OS or SQL guards');
    const androidCap=randomUUID();
    await db.exec(`insert into private.creator_external_payment_capabilities
      select (jsonb_populate_record(null::private.creator_external_payment_capabilities,to_jsonb(c)||
        '{"id":"${androidCap}","platform":"android","route_kind":"android_external_content_link"}'::jsonb)).*
      from private.creator_external_payment_capabilities c where id='${cap}';
      insert into private.creator_room_auction_product_bindings values('${androidCap}','${product}','synthetic only',now());
      insert into private.google_play_external_program_config(package_name,environment,enrollment_evidence,
        license_test_qualification_evidence,tax_configuration_evidence,reporter_configuration_evidence,native_build_qualification_evidence,
        verified_at,expires_at,enabled) values('com.fixture.app','test','synthetic only','synthetic only','synthetic only',
        'synthetic only','synthetic only',now(),now()+interval '1 hour',true)`);
    const android=await prepare('ANDROID','buyer1','android');
    assert.equal(android.claim.routeKind,'android_external_content_link');
    const bind=`public.bind_google_play_external_checkout('${actors.buyer1.user_id}','${actors.buyer1.session_id}',
      'room_seat_auction','${android.quote.id}','${android.token}',1)`;
    assert.equal((await rpc('buyer1',bind,'service_role','android')).routeKind,'android_external_content_link');
    assert.equal(await count('private.google_play_external_report_outbox'),0,'binding is not purchase evidence');
    const androidPaid=evidence(android,'AndroidPaid',{googlePlayTax:{provenance:'stripe_checkout_automatic_tax_complete',
      countryCode:'US',preTaxAmountMinor:217,taxAmountMinor:20}});
    assert.equal((await receive(androidPaid)).status,'fulfilled');
    const obligation=(await rows(`select t.original_pre_tax_minor,t.original_tax_minor,o.state from
      private.google_play_external_transactions t join private.google_play_external_report_outbox o on o.transaction_id=t.id
      where t.feature='room_seat_auction' and t.quote_id='${android.quote.id}'`))[0];
    assert.deepEqual(obligation,{original_pre_tax_minor:217,original_tax_minor:20,state:'pending'});
    await receive(androidPaid);assert.equal(await count('private.google_play_external_report_outbox'),1);
    assert.equal(await count('public.creator_payout_requests'),0,'no payout activation');
    const party=await prepare('PARTY','buyer1','ios','party_admission');
    assert.equal((await receive(evidence(party,'PartyPaid'))).status,'fulfilled');
    const partyLibrary=await rpc('buyer1','public.read_my_creator_purchases()');
    const parsedParty=wallet.parseCreatorPurchasePage(partyLibrary,actors.buyer1.user_id);
    assert.ok(parsedParty,'mixed stage, party and terminal auction receipts preserve the entire library');
    const partyItem=parsedParty.items.find(x=>x.purchaseIntentId===party.claim.purchaseIntentId);
    assert.equal(partyItem.terms.sourceKind,'party_admission');
    assert.deepEqual(wallet.creatorPurchaseDestinationRoute(partyItem.destination),
      {pathname:'/watch-party/[partyId]',params:{partyId:'PAYMENT-PARTY'}});
    assert.equal(wallet.parseCreatorPurchasePage({...partyLibrary,items:[{...partyItem,destination:{...partyItem.destination,kind:'live_stage'}}]},actors.buyer1.user_id),null);
  }finally{Date.now=realDateNow;await db.close();}
});
