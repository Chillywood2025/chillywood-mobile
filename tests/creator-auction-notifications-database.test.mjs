import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';

test('real auction close tick, outbid/winner outbox, stale suppression and dormant scheduling', {timeout:180000}, async()=>{
  const originalNow=Date.now; let offset=0; Date.now=()=>originalNow()+offset;
  const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
  try {
    const rows=async sql=>(await db.query(sql)).rows;
    const one=async sql=>(await rows(sql))[0];
    await db.exec(fs.readFileSync(new URL('./fixtures/event-reservation-authority.sql',import.meta.url),'utf8'));
    await db.exec("update public.creator_events set visibility='public' where id in(select id from event_reservation_fixture.events)");
    await db.exec(fs.readFileSync(new URL('./fixtures/creator-external-payment-authority.sql',import.meta.url),'utf8'));
    const actors=Object.fromEntries((await rows('select * from event_reservation_fixture.actors')).map(a=>[a.kind,a]));
    const event=(await one("select id from event_reservation_fixture.events where name='show1'")).id;
    const lit=v=>`'${String(v).replaceAll("'","''")}'`;
    const rpc=async(who,call)=>{
      const a=actors[who];
      try {const result=await db.exec(`begin;set local role authenticated;set local request.jwt.claims=${lit(JSON.stringify({role:'authenticated',sub:a.user_id,session_id:a.session_id}))};
        set local request.headers='{"x-chillywood-platform":"ios"}';select ${call} as value;commit;`);
        return result.flatMap(r=>r.rows).at(-1).value;
      }catch(e){await db.exec('rollback');throw e;}
    };
    await db.exec(`insert into private.creator_external_payment_capabilities(feature,creator_id,provider_account_id,platform,storefront,storefront_country,route_kind,currency,environment,payment_method,min_amount_minor,max_amount_minor,provider_bounds_evidence,route_approval_evidence,verified_at,expires_at,enabled)
      select f,'${actors.creator.user_id}','acct_fixture','ios','UNITED_STATES','US','external_browser_checkout','usd','test','card',50,100000,'synthetic only','synthetic only',now()-interval '1 minute',now()+interval '4 hours',true from unnest(array['event_auction','room_seat_auction']) f;
      insert into private.creator_external_payment_eligibility(capability_id,buyer_id,session_id,eligibility_evidence,verified_at,expires_at)
      select c.id,a.user_id,a.session_id,'synthetic only',now()-interval '1 minute',now()+interval '10 minutes'
      from private.creator_external_payment_capabilities c cross join event_reservation_fixture.actors a where a.kind like 'buyer%';`);
    const offer=await rpc('creator',`public.configure_paid_creator_event_sale('${event}','Auction notification fixture',99,1,'sandbox','America/New_York',now()-interval '1 hour',now()+interval '1 day')`);
    const eventAuction=await rpc('creator',`public.create_creator_event_auction('${event}','${offer.termsRevisionId}',100,25,now()+interval '1 hour',now()+interval '2 hours','test')`);
    await db.exec(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,join_policy,content_access_rule,is_active,discovery_visibility)
      values('AUCTION-NOTICE','${actors.creator.user_id}','live','open','open',true,'private')`);
    const roomAuction=await rpc('creator',"public.create_creator_room_seat_auction('AUCTION-NOTICE','stage_reserved_seat',100,25,now()+interval '1 hour',now()+interval '2 hours','test',gen_random_uuid(),(public.prepare_creator_room_seat_auction('AUCTION-NOTICE')->>'roomSessionId')::uuid)");
    for(const [family,a] of [['event',eventAuction],['room',roomAuction]]){
      const fn=family==='event'?'place_creator_event_auction_bid':'place_creator_room_seat_auction_bid';
      await rpc('buyer1',`public.${fn}('${a.id}',100,gen_random_uuid(),null)`);
      await rpc('buyer2',`public.${fn}('${a.id}',125,gen_random_uuid(),null)`);
      const outbid=await one(`select *,private.resolve_notification_activity(e) as plan from public.notification_activity_events e where event_kind='auction_outbid' and source_id='${a.id}'`);
      assert.equal(outbid.recipient_user_id,actors.buyer1.user_id);
      assert.equal(outbid.plan.eligible,true);
      assert.equal(JSON.stringify(outbid.plan).includes(actors.buyer2.user_id),false);
      assert.equal(outbid.plan.deep_link,family==='event'?`/event/${event}`:'/watch-party/live-stage/AUCTION-NOTICE');
      const forged=(await one(`select private.resolve_notification_activity(jsonb_populate_record(null::public.notification_activity_events,
        to_jsonb(e)||jsonb_build_object('recipient_user_id','${actors.buyer3.user_id}'))) plan
        from public.notification_activity_events e where id='${outbid.id}'`)).plan;
      assert.equal(forged.eligible,false,'wrong recipient cannot use another buyer bid');
    }
    assert.equal(Number((await one("select count(*) n from cron.job where jobname='creator-auction-lifecycle'")).n),0);
    assert.equal((await one("select has_function_privilege('authenticated','private.tick_creator_auctions(integer)','execute') ok")).ok,false);
    const before=Date.parse((await one('select clock_timestamp() t')).t);
    offset+=61*60000;
    assert.ok(Date.parse((await one('select clock_timestamp() t')).t)-before>60*60000,'only isolated PGlite JS clock advanced');
    const tick=(await one('select private.tick_creator_auctions(20) result')).result;
    assert.equal(tick.processed,2,'no buyer read was required to award either auction');
    const count=async()=>Number((await one("select count(*) n from public.notification_activity_events where event_kind like 'auction_%'")).n);
    assert.equal(await count(),10);
    await db.exec('select private.tick_creator_auctions(20)');assert.equal(await count(),10,'repeat tick creates no duplicate notification');
    for(const a of [eventAuction,roomAuction]){
      const plans=await rows(`select event_kind,recipient_user_id,private.resolve_notification_activity(e) plan from public.notification_activity_events e where source_id='${a.id}'`);
      assert.equal(plans.find(p=>p.event_kind==='auction_outbid').plan.eligible,false,'old outbid alert suppressed after close');
      assert.equal(plans.find(p=>p.event_kind==='auction_won').recipient_user_id,actors.buyer2.user_id);
      assert.equal(plans.find(p=>p.event_kind==='auction_won').plan.eligible,true);
      assert.equal(plans.find(p=>p.event_kind==='auction_creator_award').recipient_user_id,actors.creator.user_id);
    }
    // Existing delivery pipeline materializes only scheduled notifications and
    // returns no fabricated provider receipt; no actual push transport is used.
    const claimed=await rows('select public.claim_notification_activity_batch(10) claim');
    for(const {claim} of claimed) await db.exec(`select public.prepare_notification_activity('${claim.eventId}','${claim.leaseToken}')`);
    assert.equal(Number((await one("select count(*) n from public.notifications where notification_type='auction_won'")).n),2);
    await db.exec(`insert into public.notification_preferences(user_id,event_updates_enabled,seat_activity_enabled)
      values('${actors.buyer2.user_id}',false,false) on conflict(user_id) do update set event_updates_enabled=false,seat_activity_enabled=false`);
    assert.equal((await one(`select private.resolve_notification_activity(e) plan from public.notification_activity_events e
      where source_id='${eventAuction.id}' and event_kind='auction_won'`)).plan.eligible,false,'existing notification preferences honored');
    offset+=60*60000;
    await db.exec('select private.tick_creator_auctions(20)');
    assert.equal((await one(`select state from private.creator_event_auctions where id='${eventAuction.id}'`)).state,'expired');
    assert.equal((await one(`select state from private.creator_room_seat_auctions where id='${roomAuction.id}'`)).state,'expired');
    assert.equal((await one(`select private.resolve_notification_activity(e) plan from public.notification_activity_events e where source_id='${eventAuction.id}' and event_kind='auction_payment_deadline'`)).plan.eligible,false);
  } finally {await db.close();Date.now=originalNow;}
});
