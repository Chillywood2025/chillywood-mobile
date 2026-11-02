import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedLiveRoomActor} from './helpers/live-room-authority-fixture.mjs';

test('a genuine paid reserved Live seat never overrides current Circle admission', {timeout:180000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
 try{
  for(const name of ['event-reservation-authority','creator-external-payment-authority'])
   await db.exec(fs.readFileSync(new URL(`./fixtures/${name}.sql`,import.meta.url),'utf8'));
  const rows=async s=>(await db.query(s)).rows;
  const actors=Object.fromEntries((await rows('select * from event_reservation_fixture.actors')).map(a=>[a.kind,a]));
  await seedLiveRoomActor(db,{id:actors.creator.user_id,session:actors.creator.session_id});
  const lit=x=>x==null?'null':`'${String(x).replaceAll("'","''")}'`;
  const as=async(who,sql,role='authenticated')=>{
   const a=actors[who];
   try{const r=await db.exec(`begin;set local role ${role};set local request.jwt.claims=${lit(JSON.stringify({role,sub:a.user_id,session_id:a.session_id}))};
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
   values('circle_reserved_fixture','room_seat_pass','Synthetic Circle reserved spot','stripe_room_auction','prod_CircleReserved',
   'sandbox','sandbox',false,false) returning id`))[0].id;
  await db.exec(`insert into private.creator_room_auction_product_bindings values('${cap}','${product}','synthetic fixture only',now())`);
  await as('creator',`insert into public.watch_party_rooms(party_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)
   values('CIRCLE-RESERVED','${actors.creator.user_id}','live','open','open',true,'private')`);
  await rpc('creator',"public.join_watch_party_room_session('CIRCLE-RESERVED','Circle reservation host')");
  const setup=await rpc('creator',"public.prepare_creator_room_seat_auction('CIRCLE-RESERVED')");
  const auction=await rpc('creator',`public.create_creator_room_seat_auction('CIRCLE-RESERVED','stage_reserved_seat',237,1,
   clock_timestamp()+interval '1 second',now()+interval '1 hour','test','${randomUUID()}','${setup.roomSessionId}')`);
  await rpc('buyer1',`public.place_creator_room_seat_auction_bid('${auction.id}',237,'${randomUUID()}',null)`);
  await new Promise(r=>setTimeout(r,1100));
  const quote=await rpc('buyer1',`public.create_creator_room_seat_auction_award_quote('${auction.id}',null)`);
  await rpc('buyer1',`public.prepare_creator_room_auction_checkout('${quote.id}','${actors.buyer1.user_id}','${actors.buyer1.session_id}','${randomUUID()}')`,'service_role');
  const evidence={eventId:'evt_CircleReserved',eventType:'checkout.session.completed',occurredAt:new Date().toISOString(),
   accountId:'acct_fixture',environment:'test',objectId:'cs_test_CircleReserved',paymentIntentId:'pi_CircleReserved',checkoutSessionId:'cs_test_CircleReserved',
   quoteId:quote.id,buyerId:actors.buyer1.user_id,creatorId:actors.creator.user_id,auctionId:auction.id,
   amountMinor:237,currency:'usd',outcome:'paid',refundedAmountMinor:null,providerProductId:'prod_CircleReserved'};
  const paid=await rpc('buyer1',`public.process_stripe_room_auction_receipt(${lit(JSON.stringify(evidence))}::jsonb,'${createHash('sha256').update(JSON.stringify(evidence)).digest('hex')}')`,'service_role');
  assert.equal(paid.status,'fulfilled');
  const token=()=>rpc('buyer1',`public.resolve_watch_party_livekit_viewer_authority('CIRCLE-RESERVED','${actors.buyer1.user_id}','${actors.buyer1.session_id}')`,'service_role');
  assert.equal((await token()).allowed,true,'real paid claim grants ordinary private/open Live entry before audience narrows');
  await rpc('buyer1',"public.join_watch_party_room_session('CIRCLE-RESERVED','Paid current member')");
  const room=(await rows("select * from public.watch_party_rooms where party_id='CIRCLE-RESERVED'"))[0];
  const saved=await rpc('creator',`public.set_watch_party_room_host_settings('CIRCLE-RESERVED',${lit(room.room_generation)},${Number(room.host_settings_revision)},
   ${lit(actors.creator.session_id)},'open','circle','Current Circle',${lit(room.source_type)},${lit(room.source_id)},false,false)`);
  assert.equal(saved.visibility,'circle');
  assert.equal((await rows(`select public.is_active_chilly_circle_member('${actors.creator.user_id}','${actors.buyer1.user_id}') allowed`))[0].allowed,false);
  assert.equal((await rows(`select private.creator_room_seat_payment_verified('${auction.claimId}') valid`))[0].valid,true,
   'audience narrowing does not erase payment evidence or manufacture a refund');
  assert.equal((await token()).allowed,false,'current Circle admission must precede the reserved-seat fast allow, even for a previously current member');
  await assert.rejects(rpc('buyer1',"public.join_watch_party_room_session('CIRCLE-RESERVED')"),/circle|audience|viewer_authority|unavailable/i);
  const signature='public.resolve_watch_party_livekit_viewer_authority(text,uuid,uuid)';
  const definition=(await rows(`select pg_get_functiondef('${signature}'::regprocedure) body`))[0].body;
  const circleGuard=/  if r\.discovery_visibility='circle'[\s\S]*?  end if;\n/g;
  assert.equal([...definition.matchAll(circleGuard)].length,1);
  await db.exec('begin');await db.exec(definition.replace(circleGuard,''));
  await db.exec(`set local role service_role;set local request.jwt.claims=${lit(JSON.stringify({role:'service_role',sub:actors.buyer1.user_id,session_id:actors.buyer1.session_id}))}`);
  const old=(await rows(`select public.resolve_watch_party_livekit_viewer_authority('CIRCLE-RESERVED','${actors.buyer1.user_id}','${actors.buyer1.session_id}') value`))[0].value;
  assert.equal(old.allowed,true,'negative control: removing only outer Circle guard reproduces the real reserved-seat bypass');
  await db.exec('rollback');
  assert.equal((await rows(`select pg_get_functiondef('${signature}'::regprocedure) body`))[0].body,definition);
  const relation=await rpc('creator',`(public.request_friendship('${actors.buyer1.user_id}')).status`);
  if(relation==='pending')assert.equal(await rpc('buyer1',`(public.respond_to_friendship('${actors.creator.user_id}','accept')).status`),'active');
  else assert.equal(relation,'active');
  assert.equal((await token()).allowed,true,'the real current Circle member retains its genuine reserved-seat right');
  await rpc('buyer1',`public.respond_to_friendship('${actors.creator.user_id}','remove')`);
  const current=(await rows("select * from public.watch_party_rooms where party_id='CIRCLE-RESERVED'"))[0];
  const paused=await rpc('creator',`public.set_watch_party_room_host_settings('CIRCLE-RESERVED',${lit(current.room_generation)},${Number(current.host_settings_revision)},
   ${lit(actors.creator.session_id)},'open','circle','Current Circle',${lit(current.source_type)},${lit(current.source_id)},false,false,true)`);
  assert.equal(paused.discoveryPaused,true);assert.equal(paused.visibility,'circle');
  assert.equal((await token()).allowed,false,'paused listing cannot resurrect a removed Circle reserved-seat viewer');
 }finally{await db.close();}
});
