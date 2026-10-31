import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {reservedRoomClient} from './helpers/reserved-room-client-runtime.mjs';

test('paid reserved seat retains same-account admission through host approval and rejoin', {timeout:180000}, async()=>{
  const {db,replayReport}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
  try {
    const oldRepair=replayReport.files.findIndex(name=>name.endsWith('_runtime_authority_forward_repair.sql'));
    const roomRepair=replayReport.files.findIndex(name=>name.endsWith('_creator_room_seat_inventory.sql'));
    assert.ok(oldRepair>=0&&roomRepair>oldRepair,'replay preserves the real chronological forward repair order');
    assert.match((await db.query("select pg_get_functiondef('public.watch_party_room_self_access_allowed_internal(text,text)'::regprocedure) definition")).rows[0].definition,
      /creator_room_paid_seat_claim/,'older repair never overwrites the reserved-admission implementation');
    for(const name of ['event-reservation-authority','creator-external-payment-authority'])
      await db.exec(fs.readFileSync(new URL(`./fixtures/${name}.sql`,import.meta.url),'utf8'));
    const rows=async s=>(await db.query(s)).rows;
    const actors=Object.fromEntries((await rows('select * from event_reservation_fixture.actors')).map(a=>[a.kind,a]));
    const lit=x=>`'${String(x).replaceAll("'","''")}'`;
    const as=async(who,sql,role='authenticated')=>{
      const a=actors[who];
      try {const r=await db.exec(`begin;set local role ${role};set local request.jwt.claims=${lit(JSON.stringify({role,sub:a.user_id,session_id:a.session_id}))};
        set local request.headers='{"x-chillywood-platform":"ios"}';${sql};commit;`);return r.flatMap(x=>x.rows).at(-1);}
      catch(e){await db.exec('rollback');throw e;}
    };
    const rpc=async(who,sql,role)=>(await as(who,`select ${sql} result`,role)).result;
    const cap=(await rows(`insert into private.creator_external_payment_capabilities(feature,creator_id,provider_account_id,
      platform,storefront,storefront_country,route_kind,currency,environment,payment_method,min_amount_minor,max_amount_minor,
      provider_bounds_evidence,route_approval_evidence,verified_at,expires_at,enabled)
      values('room_seat_auction','${actors.creator.user_id}','acct_fixture','ios','UNITED_STATES','US','external_browser_checkout','usd','test','card',50,100000,
      'synthetic fixture only','synthetic fixture only',now(),now()+interval '2 hours',true) returning id`))[0].id;
    await db.exec(`insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
      values('${cap}','${actors.buyer1.user_id}','${actors.buyer1.session_id}','synthetic fixture only',now(),now()+interval '10 minutes')`);
    const product=(await rows(`insert into public.monetization_products(product_key,product_type,display_name,provider,
      provider_product_id,environment,status,is_android_digital,is_physical_good)
      values('room_lifecycle_fixture','room_seat_pass','Synthetic reserved spot','stripe_room_auction','prod_RoomLifecycle',
      'sandbox','sandbox',false,false) returning id`))[0].id;
    await db.exec(`insert into private.creator_room_auction_product_bindings values('${cap}','${product}','synthetic fixture only',now())`);
    await as('creator',`insert into public.watch_party_rooms(party_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)
      values('SEAT-LIFECYCLE','${actors.creator.user_id}','live','open','open',true,'private')`);
    const setup=await rpc('creator',"public.prepare_creator_room_seat_auction('SEAT-LIFECYCLE')");
    const auction=await rpc('creator',`public.create_creator_room_seat_auction('SEAT-LIFECYCLE','stage_reserved_seat',237,1,
      clock_timestamp()+interval '1 second',now()+interval '1 hour','test','${randomUUID()}','${setup.roomSessionId}')`);
    await rpc('buyer1',`public.place_creator_room_seat_auction_bid('${auction.id}',237,'${randomUUID()}',null)`);
    await new Promise(r=>setTimeout(r,1100));
    const quote=await rpc('buyer1',`public.create_creator_room_seat_auction_award_quote('${auction.id}',null)`);
    await rpc('buyer1',`public.prepare_creator_room_auction_checkout('${quote.id}','${actors.buyer1.user_id}','${actors.buyer1.session_id}','${randomUUID()}')`,'service_role');
    const evidence={eventId:'evt_Lifecycle',eventType:'checkout.session.completed',occurredAt:new Date().toISOString(),
      accountId:'acct_fixture',environment:'test',objectId:'cs_test_Lifecycle',paymentIntentId:'pi_Lifecycle',checkoutSessionId:'cs_test_Lifecycle',
      quoteId:quote.id,buyerId:actors.buyer1.user_id,creatorId:actors.creator.user_id,auctionId:auction.id,
      amountMinor:237,currency:'usd',outcome:'paid',refundedAmountMinor:null,providerProductId:'prod_RoomLifecycle'};
    const paid=await rpc('buyer1',`public.process_stripe_room_auction_receipt(${lit(JSON.stringify(evidence))}::jsonb,'${createHash('sha256').update(JSON.stringify(evidence)).digest('hex')}')`,'service_role');
    assert.equal(paid.status,'fulfilled');
    const initialAccess=await rpc('buyer1',"public.resolve_live_watch_party_money_access('SEAT-LIFECYCLE')");
    const parsedAccess=await reservedRoomClient('_lib/liveWatchPartyMoney.ts',initialAccess).readLiveWatchPartyMoneyAccess('SEAT-LIFECYCLE');
    assert.equal(parsedAccess.allowed,true);assert.equal(parsedAccess.seatEligible,true);assert.equal(parsedAccess.seatApproved,false);
    assert.equal(parsedAccess.roomSessionId,setup.roomSessionId);assert.equal(parsedAccess.seatReviewState,'eligible');
    const rawToken=await rpc('buyer1',`public.resolve_watch_party_livekit_viewer_authority('SEAT-LIFECYCLE','${actors.buyer1.user_id}','${actors.buyer1.session_id}')`,'service_role');
    const tokenParser=reservedRoomClient('supabase/functions/_shared/watch-party-livekit-authority.ts',null);
    const token=tokenParser.parseWatchPartyLiveKitAuthority(rawToken);
    assert.equal(token.allowed,true);assert.equal(token.speakerEligible,true);assert.equal(token.hostAuthority,false);
    assert.equal(token.reservedSeatClaimId,auction.claimId);assert.equal(token.roomSessionId,setup.roomSessionId);
    const claim=async()=>(await rows(`select * from private.creator_room_seat_claims where id='${auction.claimId}'`))[0];
    const inventory=async()=>Number((await rows("select private.creator_room_seat_inventory('SEAT-LIFECYCLE','stage_reserved_seat') n"))[0].n);
    await rpc('buyer1',"public.join_watch_party_room_session('SEAT-LIFECYCLE')");
    assert.equal((await claim()).availability_confirmed_at,null,'payment and viewer join alone do not approve a speaking spot');
    const promote=()=>rpc('creator',`public.set_creator_room_participant_authority_service('SEAT-LIFECYCLE','${actors.creator.user_id}',
      '${actors.creator.session_id}','${actors.buyer1.user_id}','speaker',false,'active')`,'service_role');
    await promote();
    assert.ok((await claim()).host_approved_at);assert.equal((await claim()).availability_confirmed_at,null,'host action alone is not buyer availability observation');
    await rpc('buyer1',"public.heartbeat_watch_party_room_session('SEAT-LIFECYCLE','active',false,false,true)");
    const available=await claim();assert.equal(available.state,'available');assert.ok(available.availability_confirmed_at);
    assert.equal(await inventory(),2,'host plus paid guest consumes two slots, not three');
    await rpc('buyer1',"public.heartbeat_watch_party_room_session('SEAT-LIFECYCLE','reconnecting',false,false,true)");
    await rpc('buyer1',"public.join_watch_party_room_session('SEAT-LIFECYCLE')");
    assert.equal((await claim()).id,available.id);assert.equal(await inventory(),2);
    const access=await rpc('buyer1',"public.resolve_live_watch_party_money_access('SEAT-LIFECYCLE')");
    assert.equal(access.allowed,true);assert.equal(access.reservedSeatClaimId,available.id);
    assert.equal((await claim()).availability_confirmed_at.getTime(),available.availability_confirmed_at.getTime());
    await as('creator',"update public.watch_party_rooms set is_active=false where party_id='SEAT-LIFECYCLE'");
    assert.equal((await claim()).state,'ended');
    await as('creator',"update public.watch_party_rooms set is_active=true where party_id='SEAT-LIFECYCLE'");
    assert.equal((await rows(`select (private.creator_room_paid_seat_claim('SEAT-LIFECYCLE','${actors.buyer1.user_id}')).id id`))[0].id,null,
      'paid rights do not carry into a new room incarnation');
    const reopenedStage=await rpc('buyer1',`public.resolve_watch_party_livekit_viewer_authority('SEAT-LIFECYCLE','${actors.buyer1.user_id}','${actors.buyer1.session_id}')`,'service_role');
    assert.notEqual(reopenedStage.reason,'verified_reserved_room_seat','an ended claim is never reused as token authority');

    await db.exec("insert into public.titles(id,title,video_url,is_published,status) values('12121212-1212-4212-8212-121212121212','Synthetic admission title','https://fixture.invalid/title.mp4',true,'published')");
    await as('creator',`insert into public.watch_party_rooms(party_id,title_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)
      values('PARTY-LIFECYCLE','12121212-1212-4212-8212-121212121212','${actors.creator.user_id}','title','open','party_pass',true,'private')`);
    await rpc('creator',"public.set_paid_watch_party_offer('PARTY-LIFECYCLE','Limited entry',99,1,'sandbox')");
    const partySetup=await rpc('creator',"public.prepare_creator_room_seat_auction('PARTY-LIFECYCLE')");
    const partyAuction=await rpc('creator',`public.create_creator_room_seat_auction('PARTY-LIFECYCLE','party_admission',237,1,
      clock_timestamp()+interval '1 second',now()+interval '1 hour','test','${randomUUID()}','${partySetup.roomSessionId}')`);
    await rpc('buyer1',`public.place_creator_room_seat_auction_bid('${partyAuction.id}',237,'${randomUUID()}',null)`);
    await new Promise(r=>setTimeout(r,1100));
    const partyQuote=await rpc('buyer1',`public.create_creator_room_seat_auction_award_quote('${partyAuction.id}',null)`);
    await rpc('buyer1',`public.prepare_creator_room_auction_checkout('${partyQuote.id}','${actors.buyer1.user_id}','${actors.buyer1.session_id}','${randomUUID()}')`,'service_role');
    const partyEvidence={...evidence,eventId:'evt_PartyLifecycle',occurredAt:new Date().toISOString(),
      objectId:'cs_test_PartyLifecycle',paymentIntentId:'pi_PartyLifecycle',checkoutSessionId:'cs_test_PartyLifecycle',
      quoteId:partyQuote.id,auctionId:partyAuction.id};
    assert.equal((await rpc('buyer1',`public.process_stripe_room_auction_receipt(${lit(JSON.stringify(partyEvidence))}::jsonb,'${createHash('sha256').update(JSON.stringify(partyEvidence)).digest('hex')}')`,'service_role')).status,'fulfilled');
    const partyRaw=await rpc('buyer1',"public.resolve_paid_watch_party_ticket_access('PARTY-LIFECYCLE')");
    const partyParsed=await reservedRoomClient('_lib/paidWatchPartyTickets.ts',partyRaw).resolvePaidWatchPartyTicketAccess('PARTY-LIFECYCLE');
    assert.equal(partyParsed.allowed,true);assert.equal(partyParsed.roomSessionId,partySetup.roomSessionId);
    assert.equal(partyParsed.ticketId,null);assert.equal(partyParsed.offer,null,'no synthetic native SKU or ticket');
    const sharedAccess=await db.exec(`begin;set local request.jwt.claims=${lit(JSON.stringify({role:'authenticated',sub:actors.buyer1.user_id,session_id:actors.buyer1.session_id}))};
      select public.watch_party_room_self_access_allowed_internal('PARTY-LIFECYCLE','${actors.buyer1.user_id}') allowed;commit;`);
    assert.equal(sharedAccess.flatMap(x=>x.rows).at(-1).allowed,true,'shared room entitlement recognizes the exact paid reservation');
    await rpc('buyer1',"public.join_watch_party_room_session('PARTY-LIFECYCLE')");
    await rpc('buyer1',"public.heartbeat_watch_party_room_session('PARTY-LIFECYCLE','active',false,false,false)");
    const partyTokenRaw=await rpc('buyer1',`public.resolve_watch_party_livekit_viewer_authority('PARTY-LIFECYCLE','${actors.buyer1.user_id}','${actors.buyer1.session_id}')`,'service_role');
    const partyToken=tokenParser.parseWatchPartyLiveKitAuthority(partyTokenRaw);
    assert.equal(partyToken.allowed,true);assert.equal(partyToken.speakerEligible,false,'Party admission is not Stage speaker eligibility');
    await as('creator',"update public.watch_party_rooms set is_active=false where party_id='PARTY-LIFECYCLE'");
    await as('creator',"update public.watch_party_rooms set is_active=true where party_id='PARTY-LIFECYCLE'");
    const reopenedPartyRaw=await rpc('buyer1',"public.resolve_paid_watch_party_ticket_access('PARTY-LIFECYCLE')");
    assert.notEqual(reopenedPartyRaw.reason,'verified_reserved_room_admission');
    assert.equal((await reservedRoomClient('_lib/paidWatchPartyTickets.ts',reopenedPartyRaw).resolvePaidWatchPartyTicketAccess('PARTY-LIFECYCLE')).allowed,false);
    await assert.rejects(rpc('buyer1',"public.join_watch_party_room_session('PARTY-LIFECYCLE')"),/entitlement_required/);
  }finally{await db.close();}
});
