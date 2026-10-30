import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';

// Entire production migration chain, real RPCs and grants. No payment transport,
// replaced SQL functions, privileged client writes, or provider qualification.
test('single-ticket auction authority, bids, inventory, and award claims', {timeout: 180000}, async () => {
  const {db} = await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true});
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
    const configure=(name,capacity=1)=>rpc('creator',`public.configure_paid_creator_event_sale('${events[name]}','One live-only virtual admission',99,${capacity},'sandbox','America/New_York',now()-interval '1 hour',now()+interval '1 day')`);
    const create=(name,offer,close="now()+interval '1 hour'",deadline="now()+interval '2 hours'")=>rpc('creator',
      `public.create_creator_event_auction('${events[name]}','${offer.termsRevisionId}',100,25,${close},${deadline},'test')`);
    const bid=(buyer,a,amount,request)=>rpc(buyer,`public.place_creator_event_auction_bid('${a.id}',${amount},'${request}',null)`);
    const read=(buyer,a)=>rpc(buyer,`public.read_creator_event_auction('${a.id}')`);
    const count=async table=>Number((await query(`select count(*) as n from ${table}`))[0].n);
    const inventory=async name=>Number((await query(`select public.event_ticket_inventory_internal('${events[name]}') as n`))[0].n);

    const offer=await configure('show1');
    const boundsOffer=await configure('show7');
    for(const deadline of ["now()+interval '1 hour 31 minutes'","now()+interval '25 hours 1 second'"])
      await rejected('creator',`public.create_creator_event_auction('${events.show7}','${boundsOffer.termsRevisionId}',100,25,now()+interval '1 hour',${deadline},'test')`,'auction_terms_invalid');
    const maxWindow=await create('show7',boundsOffer,"now()+interval '1 hour'","now()+interval '25 hours'");
    assert.equal(Date.parse(maxWindow.paymentDeadline)-Date.parse(maxWindow.closesAt),86400000,'provider-supported maximum is24 hours after close');
    assert.equal(Date.parse(maxWindow.paymentDeadline)-Date.parse(maxWindow.latestCheckoutStartAt),1860000,'latest checkout start leaves31 minutes');
    const auction=await create('show1',offer);
    assert.equal(auction.state,'open');assert.equal(auction.nextBidAmountMinor,100);
    assert.equal(auction.terms.attendance,'virtual');assert.equal(auction.terms.replayPolicy,'none');
    assert.equal(await inventory('show1'),1,'auction holds the one shared ticket');
    await rejected('buyer1',`public.create_reserved_creator_event_purchase_intent('${offer.id}','${offer.termsRevisionId}')`,'event_sold_out');
    await rejected('creator',`public.configure_paid_creator_event_sale('${events.show1}','Same show',99,0,'sandbox','America/New_York',now()-interval '1 hour',now()+interval '1 day')`,'event_capacity_below_committed');
    await rejected('creator',`public.place_creator_event_auction_bid('${auction.id}',100,gen_random_uuid(),null)`,'auction_owner_cannot_bid');
    await rejected('buyer1',`public.place_creator_event_auction_bid('${auction.id}',100,gen_random_uuid(),null)`,'external_payment_capability_unavailable');
    assert.equal((await rpc('buyer1',`public.read_creator_event_auction_bid_eligibility('${auction.id}',100)`)).available,false);
    await rejected('buyer1',`public.create_creator_event_auction('${events.show1}','${offer.termsRevisionId}',100,25,now()+interval '1 hour',now()+interval '2 hours','test')`,'creator|event_creator_required');
    await rejected('creator',`public.create_creator_event_auction(gen_random_uuid(),'${offer.termsRevisionId}',100,25,now()+interval '1 hour',now()+interval '2 hours','test')`,'event_creator_required');
    assert.equal(await count('public.access_grants'),0,'authoring/denied bids cannot grant access');
    await assert.rejects(()=>as('buyer1','select * from private.creator_event_auction_bids'),/permission denied/);
    await assert.rejects(()=>as('creator',`update private.creator_event_auctions set state='fulfilled' where id='${auction.id}'`),/permission denied/);

    // Synthetic trusted qualification ONLY in this disposable fixture. The
    // production migration seeds no approval or eligible account.
    await db.exec(fs.readFileSync(new URL('./fixtures/creator-external-payment-authority.sql',import.meta.url),'utf8'));
    const cap=(await query(`insert into private.creator_external_payment_capabilities(feature,creator_id,provider_account_id,
      platform,storefront,storefront_country,route_kind,currency,environment,payment_method,min_amount_minor,max_amount_minor,
      provider_bounds_evidence,route_approval_evidence,verified_at,expires_at,enabled)
      values('event_auction','${actors.creator.user_id}','acct_fixture','ios','UNITED_STATES','US','external_browser_checkout','usd','test','card',50,100000,
      'synthetic fixture only','synthetic fixture only',now()-interval '1 minute',now()+interval '1 hour',true) returning id`))[0].id;
    await db.exec(`insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
      select '${cap}',user_id,session_id,'synthetic fixture only',now()-interval '1 minute',now()+interval '10 minutes'
      from event_reservation_fixture.actors where kind like 'buyer%';`);
    const request1='11111111-1111-4111-8111-111111111111';
    const request2='22222222-2222-4222-8222-222222222222';
    assert.equal((await bid('buyer1',auction,100,request1)).isHighestBidder,true);
    assert.equal((await bid('buyer1',auction,100,request1)).highestAmountMinor,100,'retry is idempotent');
    assert.equal(await count('private.creator_event_auction_bids'),1);
    await rejected('buyer1',`public.place_creator_event_auction_bid('${auction.id}',125,'${request1}',null)`,'auction_bid_replay_mismatch');
    await rejected('buyer2',`public.place_creator_event_auction_bid('${auction.id}',100,gen_random_uuid(),null)`,'auction_bid_below_minimum');
    await rejected('buyer2',`public.place_creator_event_auction_bid('${auction.id}',124,gen_random_uuid(),null)`,'auction_bid_below_minimum');
    assert.equal((await bid('buyer2',auction,125,request2)).isHighestBidder,true);
    const view=await read('buyer1',auction);
    assert.equal(view.isHighestBidder,false);assert.equal(view.myBidAmountMinor,100);assert.equal(view.nextBidAmountMinor,150);
    assert.equal(JSON.stringify(view).includes(actors.buyer2.user_id),false,'bidder identity stays private');
    assert.equal(await count('public.access_grants'),0,'a leading bid is not access');
    await rejected('buyer2',`public.create_creator_event_auction_award_quote('${auction.id}',null)`,'auction_winner_required');
    await assert.rejects(()=>db.exec(`update private.creator_event_auctions set starting_amount_minor=1 where id='${auction.id}'`),/auction_terms_immutable/);

    // A short real deadline exercises hard close without modifying frozen terms.
    const shortOffer=await configure('show2');
    const short=await create('show2',shortOffer,"clock_timestamp()+interval '1 second'","clock_timestamp()+interval '1 hour'");
    await bid('buyer1',short,100,'33333333-3333-4333-8333-333333333333');
    await new Promise(resolve=>setTimeout(resolve,1100));
    const awarded=await read('buyer1',short);assert.equal(awarded.state,'awarded');assert.equal(awarded.isWinner,true);
    await rejected('buyer2',`public.place_creator_event_auction_bid('${short.id}',150,gen_random_uuid(),null)`,'auction_bidding_closed');
    await rejected('buyer2',`public.create_creator_event_auction_award_quote('${short.id}',null)`,'auction_winner_required');
    let quote=await rpc('buyer1',`public.create_creator_event_auction_award_quote('${short.id}',null)`);
    assert.equal(quote.amountMinor,100);assert.equal(quote.currency,'usd');
    assert.equal((await rpc('buyer1',`public.create_creator_event_auction_award_quote('${short.id}',null)`)).id,quote.id);
    const oldQuote=quote;
    actors.buyer1new={...actors.buyer1,session_id:'77777777-7777-4777-8777-777777777777'};
    await db.exec(`insert into auth.sessions(id,user_id) values('${actors.buyer1new.session_id}','${actors.buyer1.user_id}');
      insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
      select '${actors.buyer1.user_id}',public.wave1_sha256('${actors.buyer1.user_id}'),document_key,version,market,'member',capability,
        '${actors.buyer1new.session_id}','service_reconciliation' from public.wave1_legal_document_versions where active and market='UNITED_STATES' and capability='account';
      insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
      values('${cap}','${actors.buyer1.user_id}','${actors.buyer1new.session_id}','synthetic new login',now()-interval '1 minute',now()+interval '10 minutes');`);
    quote=await rpc('buyer1new',`public.create_creator_event_auction_award_quote('${short.id}',null)`);
    assert.notEqual(quote.id,oldQuote.id,'unstarted quote recovers into a new immutable session-bound row');
    assert.equal((await query(`select superseded_at is not null as superseded from private.creator_event_auction_quotes where id='${oldQuote.id}'`))[0].superseded,true);
    assert.equal(await count('private.creator_event_auction_quotes'),2,'obsolete quote history remains');
    await rejected('buyer1',`public.claim_creator_event_auction_checkout('${oldQuote.id}','${actors.buyer1.user_id}','${actors.buyer1.session_id}',gen_random_uuid())`,'auction_quote_not_found','service_role');
    const attempt='44444444-4444-4444-8444-444444444444';
    const claimCall=`public.claim_creator_event_auction_checkout('${quote.id}','${actors.buyer1.user_id}','${actors.buyer1new.session_id}','${attempt}')`;
    await rejected('buyer1',claimCall,'permission denied');
    const authorizedClaim=await rpc('buyer1',claimCall,'service_role');
    assert.equal(authorizedClaim.startAuthorized,true);
    assert.equal(authorizedClaim.routeKind,'external_browser_checkout');assert.equal(authorizedClaim.platform,'ios');
    assert.equal(authorizedClaim.storefrontCountry,'US','launch route comes from trusted capability, not caller assertion');
    const repeatedClaim=await rpc('buyer1',claimCall,'service_role');
    assert.equal(repeatedClaim.startAuthorized,false,'lost reply cannot authorize another SDK dispatch');
    assert.equal(repeatedClaim.routeKind,null,'duplicate claim has no new launch authorization');
    await rejected('buyer1',`public.create_creator_event_auction_award_quote('${short.id}',null)`,'auction_quote_session_changed');
    assert.equal((await read('buyer1',short)).state,'payment_pending');
    assert.equal(await inventory('show2'),1);assert.equal(await count('public.access_grants'),0,'checkout start is not paid access');
    assert.equal(await count('public.money_purchase_intents'),0,'engine does not manufacture native intents');

    const emptyOffer=await configure('show3');
    const empty=await create('show3',emptyOffer,"clock_timestamp()+interval '100 milliseconds'","clock_timestamp()+interval '1 hour'");
    await new Promise(resolve=>setTimeout(resolve,150));
    assert.equal((await read('buyer1',empty)).state,'expired');assert.equal(await inventory('show3'),0);

    const staleOffer=await configure('show4');const stale=await create('show4',staleOffer);
    await rpc('creator',`public.configure_paid_creator_event_sale('${events.show4}','Changed offer',299,1,'sandbox','America/New_York',now()-interval '1 hour',now()+interval '1 day')`);
    assert.equal((await read('buyer1',stale)).state,'canceled','changed terms never silently migrate auction bids');
    assert.equal(await inventory('show4'),0);

    const unpaidOffer=await configure('show5');
    // Explicit historical fixture: do not mutate frozen auction terms or mock
    // production clock/functions merely to avoid waiting a real 31-minute window.
    const unpaid={id:'88888888-8888-4888-8888-888888888888'};
    await db.exec(`insert into private.creator_event_auctions(id,event_id,offer_id,revision_id,creator_id,starting_amount_minor,min_increment_minor,currency,environment,closes_at,payment_deadline)
      values('${unpaid.id}','${events.show5}','${unpaidOffer.id}','${unpaidOffer.termsRevisionId}','${actors.creator.user_id}',100,25,'usd','test',now()-interval '2 hours',now()-interval '1 hour');
      insert into private.creator_event_auction_bids(id,auction_id,buyer_id,amount_minor,request_id,created_at)
      values('99999999-9999-4999-8999-999999999999','${unpaid.id}','${actors.buyer2.user_id}',100,'55555555-5555-4555-8555-555555555555',now()-interval '3 hours');
      update private.creator_event_auctions set highest_bid_id='99999999-9999-4999-8999-999999999999' where id='${unpaid.id}';`);
    assert.equal((await read('buyer2',unpaid)).state,'expired','unstarted unpaid award expires without charging or reoffering');
    assert.equal((await read('buyer2',unpaid)).isWinner,true,'expired award retains its highest-bid winner history');
    assert.equal(await inventory('show5'),0);
    const pendingOffer=await configure('show6');
    const pending={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
    await db.exec(`insert into private.creator_event_auctions(id,event_id,offer_id,revision_id,creator_id,starting_amount_minor,min_increment_minor,currency,environment,closes_at,payment_deadline,state,winner_id,award_amount_minor)
      values('${pending.id}','${events.show6}','${pendingOffer.id}','${pendingOffer.termsRevisionId}','${actors.creator.user_id}',100,25,'usd','test',now()-interval '2 hours',now()-interval '1 hour','payment_pending','${actors.buyer1.user_id}',100);`);
    assert.equal((await read('buyer1',pending)).state,'payment_pending','expired historical uncertain dispatch never self-releases');
    assert.equal(await inventory('show6'),1,'uncertain historical payment retains its inventory hold');

    await db.exec(`update private.creator_external_payment_capabilities set revoked_at=clock_timestamp() where id='${cap}'`);
    await rejected('buyer1',`public.place_creator_event_auction_bid('${auction.id}',150,gen_random_uuid(),null)`,'external_payment_capability_unavailable');
    assert.equal(await count('private.creator_event_auction_bids'),4);
  } finally { await db.close(); }
});
