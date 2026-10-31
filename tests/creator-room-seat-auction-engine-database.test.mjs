import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';

// Entire production migration chain, real RPCs and grants. No payment transport,
// replaced SQL functions, privileged client writes, or provider qualification.
for (const implicitApiGrants of [true,false]) test(`reserved room-session inventory and typed auction authority (implicit grants ${implicitApiGrants})`, {timeout: 180000}, async () => {
  const {db} = await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants});
  try {
    await db.exec(fs.readFileSync(new URL('./fixtures/event-reservation-authority.sql',import.meta.url),'utf8'));
    await db.exec("update public.creator_events set visibility='public' where id in(select id from event_reservation_fixture.events)");
    const query=async sql=>(await db.query(sql)).rows;
    const actors=Object.fromEntries((await query('select * from event_reservation_fixture.actors')).map(a=>[a.kind,a]));
    const events=Object.fromEntries((await query('select * from event_reservation_fixture.events')).map(e=>[e.name,e.id]));
    const lit=v=>`'${String(v).replaceAll("'","''")}'`;
    const as=async (actor,statement,role='authenticated')=>{
      const a=actors[actor];
      try {
        const result=await db.exec(`begin;set local role ${role};set local request.jwt.claims=${lit(JSON.stringify({role,sub:a.user_id,session_id:a.session_id}))};
          set local request.headers='{"x-chillywood-platform":"ios"}';${statement};commit;`);
        return result.flatMap(r=>r.rows).at(-1);
      } catch(e) { await db.exec('rollback');throw e; }
    };
    const rpc=async(actor,call,role)=>(await as(actor,`select ${call} as value`,role)).value;
    const rejected=(actor,call,reason,role)=>assert.rejects(()=>rpc(actor,call,role),new RegExp(reason));
    const protectedTables=await query(`select c.relname,c.relrowsecurity,c.relforcerowsecurity,
      has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') client_access,
      has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') service_access
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private'
      and c.relname in('creator_room_sessions','creator_room_seat_claims','creator_party_ticket_reservations',
        'creator_room_seat_auctions','creator_room_seat_auction_bids','creator_room_auction_quotes')`);
    assert.equal(protectedTables.length,6);
    for(const table of protectedTables){assert.equal(table.relrowsecurity,true);assert.equal(table.relforcerowsecurity,true);
      assert.equal(table.client_access,false);assert.equal(table.service_access,false);}
    await as('creator',`insert into public.watch_party_rooms(party_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)
      values('RESERVED-STAGE','${actors.creator.user_id}','live','open','open',true,'private'),
      ('RESERVED-STAGE-TWO','${actors.creator.user_id}','live','open','open',true,'private')`);
    const create=(party,close="clock_timestamp()+interval '1 hour'")=>rpc('creator',
      `public.create_creator_room_seat_auction('${party}','stage_reserved_seat',100,25,${close},clock_timestamp()+interval '2 hours','test',gen_random_uuid(),(public.prepare_creator_room_seat_auction('${party}')->>'roomSessionId')::uuid)`);
    const auction=await create('RESERVED-STAGE');
    assert.equal(auction.sourceKind,'stage_reserved_seat');assert.equal(auction.terms.admissionIncluded,true);
    assert.equal(auction.terms.hostControlsMediaAndModeration,true);
    const inventory=async()=>Number((await query("select private.creator_room_seat_inventory('RESERVED-STAGE','stage_reserved_seat') n"))[0].n);
    assert.equal(await inventory(),2,'host and one auction hold');
    await rejected('creator',`public.place_creator_room_seat_auction_bid('${auction.id}',100,gen_random_uuid(),null)`,'auction_owner_cannot_bid');
    await rejected('buyer1',`public.place_creator_room_seat_auction_bid('${auction.id}',100,gen_random_uuid(),null)`,'external_payment_capability_unavailable');
    await rejected('creator',`public.create_creator_room_seat_auction('RESERVED-STAGE','vip',100,25,now()+interval '1 hour',now()+interval '2 hours','test',gen_random_uuid(),'${auction.roomSessionId}')`,'auction_terms_invalid');
    await assert.rejects(()=>as('buyer1','select * from private.creator_room_seat_auction_bids'),/permission denied/);
    // Real free guest approvals share the same three guest slots as holds.
    for(const who of ['buyer1','buyer2','buyer3']) await rpc(who,"public.join_watch_party_room_session('RESERVED-STAGE')");
    const promote=who=>rpc('creator',`public.set_creator_room_participant_authority_service('RESERVED-STAGE','${actors.creator.user_id}','${actors.creator.session_id}','${actors[who].user_id}','speaker',false,'active')`,'service_role');
    await promote('buyer1');await promote('buyer2');assert.equal(await inventory(),4);
    await assert.rejects(()=>promote('buyer3'),/speaker_seats_full/);
    assert.equal((await query(`select stage_role from public.watch_party_room_memberships where party_id='RESERVED-STAGE' and user_id='${actors.buyer3.user_id}'`))[0].stage_role,'listener');
    // Synthetic trusted qualification ONLY in this disposable fixture. The
    // production migration seeds no approval or eligible account.
    await db.exec(fs.readFileSync(new URL('./fixtures/creator-external-payment-authority.sql',import.meta.url),'utf8'));
    const cap=(await query(`insert into private.creator_external_payment_capabilities(feature,creator_id,provider_account_id,
      platform,storefront,storefront_country,route_kind,currency,environment,payment_method,min_amount_minor,max_amount_minor,
      provider_bounds_evidence,route_approval_evidence,verified_at,expires_at,enabled)
      values('room_seat_auction','${actors.creator.user_id}','acct_fixture','ios','UNITED_STATES','US','external_browser_checkout','usd','test','card',50,100000,
      'synthetic fixture only','synthetic fixture only',now()-interval '1 minute',now()+interval '1 hour',true) returning id`))[0].id;
    await db.exec(`insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
      select '${cap}',user_id,session_id,'synthetic fixture only',now()-interval '1 minute',now()+interval '10 minutes'
      from event_reservation_fixture.actors where kind like 'buyer%';`);
    await db.exec("insert into public.titles(id,title,video_url,is_published,status) values('12121212-1212-4212-8212-121212121212','Synthetic room title','https://fixture.invalid/title.mp4',true,'published')");
    await as('creator',`insert into public.watch_party_rooms(party_id,title_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)
      values('RESERVED-PARTY','12121212-1212-4212-8212-121212121212','${actors.creator.user_id}','title','open','party_pass',true,'private')`);
    const partyOffer=await rpc('creator',"public.set_paid_watch_party_offer('RESERVED-PARTY','Limited admission',99,1,'sandbox')");
    const partyAuction=await rpc('creator',"public.create_creator_room_seat_auction('RESERVED-PARTY','party_admission',100,25,now()+interval '1 hour',now()+interval '2 hours','test',gen_random_uuid(),(public.prepare_creator_room_seat_auction('RESERVED-PARTY')->>'roomSessionId')::uuid)");
    assert.equal(partyAuction.sourceKind,'party_admission');
    const nativeProduct=(await query("select product_key from public.monetization_products where product_key='watch_party_live_ticket_sandbox_099' and product_type='watch_party_live_ticket' and environment='sandbox'"))[0];
    const partyOfferId=(await query("select id from public.paid_watch_party_offers where party_id='RESERVED-PARTY'"))[0].id;
    await rejected('buyer1',`public.create_money_purchase_intent('${nativeProduct.product_key}','watch_party_live','${partyOfferId}','{}')`,'room_admission_sold_out');

    assert.equal(Number((await query("select private.creator_room_seat_inventory('RESERVED-PARTY','party_admission') n"))[0].n),1);
    await assert.rejects(()=>rpc('creator',"public.set_paid_watch_party_offer('RESERVED-PARTY','Limited admission',99,null,'sandbox')"),/room_auction_capacity_required/);
    const bid=(who,a,amount)=>rpc(who,`public.place_creator_room_seat_auction_bid('${a.id}',${amount},gen_random_uuid(),null)`);
    await bid('buyer1',auction,100);await bid('buyer2',auction,125);
    const request='bbbbbbbb-1111-4111-8111-111111111111';
    const replayCall=`public.place_creator_room_seat_auction_bid('${auction.id}',150,'${request}',null)`;
    await rpc('buyer1',replayCall);await rpc('buyer1',replayCall);
    assert.equal(Number((await query(`select count(*) n from private.creator_room_seat_auction_bids where request_id='${request}'`))[0].n),1);
    await rejected('buyer1',`public.place_creator_room_seat_auction_bid('${auction.id}',175,'${request}',null)`,'auction_bid_replay_mismatch');
    await assert.rejects(()=>db.exec(`update private.creator_room_seat_auction_bids set amount_minor=200 where request_id='${request}'`),/immutable/);
    await assert.rejects(()=>db.exec(`update private.creator_room_seat_auctions set closes_at=closes_at+interval '1 minute' where id='${auction.id}'`),/auction_terms_immutable/);
    await rejected('buyer1',`public.place_creator_room_seat_auction_bid('${auction.id}',125,gen_random_uuid(),null)`,'auction_bid_below_minimum');
    assert.equal((await query('select count(*) n from public.access_grants'))[0].n,0,'bids never grant access');
    const short=await create('RESERVED-STAGE-TWO',"clock_timestamp()+interval '1 second'");
    await bid('buyer1',short,100);await new Promise(r=>setTimeout(r,1100));
    const won=await rpc('buyer1',`public.read_creator_room_seat_auction('${short.id}')`);
    assert.equal(won.state,'awarded');assert.equal(won.isWinner,true);
    const quote=await rpc('buyer1',`public.create_creator_room_seat_auction_award_quote('${short.id}',null)`);
    const claimed=await rpc('buyer1',`public.claim_creator_room_auction_checkout('${quote.id}','${actors.buyer1.user_id}','${actors.buyer1.session_id}',gen_random_uuid())`,'service_role');
    assert.equal(claimed.sourceKind,'stage_reserved_seat');assert.equal(claimed.startAuthorized,true);
    assert.equal((await query(`select state from private.creator_room_seat_claims where id='${short.claimId}'`))[0].state,'payment_pending');
    await as('creator',"update public.watch_party_rooms set is_active=false where party_id='RESERVED-STAGE-TWO'");
    const ended=(await query(`select * from private.creator_room_seat_claims where id='${short.claimId}'`))[0];
    assert.equal(ended.state,'unfulfilled');assert.match(ended.reason,/availability_unconfirmed/);
    await as('creator',"update public.watch_party_rooms set is_active=true where party_id='RESERVED-STAGE-TWO'");
    assert.equal((await query(`select private.creator_room_session_current('${short.roomSessionId}') valid`))[0].valid,false);
    assert.equal((await query(`select (private.creator_room_paid_seat_claim('RESERVED-STAGE-TWO','${actors.buyer1.user_id}')).id id`))[0].id,null);
    const frozenCreate=`public.create_creator_room_seat_auction('RESERVED-STAGE-TWO','stage_reserved_seat',100,25,
      '${short.closesAt}','${short.paymentDeadline}','test','${short.requestId}','${short.roomSessionId}')`;
    assert.equal((await rpc('creator',frozenCreate)).id,short.id,'lost creation reply recovers original lot after close/reopen');
    await rejected('creator',frozenCreate.replace(',100,25,',',101,25,'),'auction_creation_replay_mismatch');
    await rejected('creator',`public.create_creator_room_seat_auction('RESERVED-STAGE-TWO','stage_reserved_seat',100,25,
      now()+interval '1 hour',now()+interval '2 hours','test',gen_random_uuid(),'${short.roomSessionId}')`,'room_session_changed');
    assert.equal(Number((await query("select count(*) n from private.creator_room_seat_auctions where party_id='RESERVED-STAGE-TWO'"))[0].n),1);
  } finally {await db.close();}
});
