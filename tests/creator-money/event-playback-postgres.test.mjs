import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('exact event playback uses actual purchase, original terms, current session and protected source SQL', {timeout:240_000}, async t=>{
  const {db}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false});
  let step='fixture';let checks=0;
  const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const eq=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++;};
  const claim=async(actor)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.headers','{\"x-chillywood-platform\":\"ios\"}',false)",
    [JSON.stringify({role:'authenticated',sub:actor.user_id,session_id:actor.session_id})]);await db.exec('set role authenticated');};
  const service=async()=>{await db.exec('reset role');await db.exec("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");};
  const isolate=async(fn)=>{await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}};
  try {
    await db.exec(fs.readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
    const actors=(await db.query('select * from event_reservation_fixture.actors')).rows;
    const host=actors.find(a=>a.kind==='creator'),buyer=actors.find(a=>a.kind==='buyer16'),other=actors.find(a=>a.kind==='buyer17');
    const event=await one("select id from event_reservation_fixture.events where name='show16'");
    await service();
    await db.query("update public.creator_events set starts_at=now()-interval '1 hour',ends_at=now()+interval '1 hour',visibility='public',replay_policy='until_expiration',replay_available_at=now()-interval '1 hour',replay_expires_at=now()+interval '2 hours' where id=$1",[event]);
    await claim(host);
    const offer=await one("select public.configure_paid_creator_event_sale($1,'Live show and finite replay',99,3,'sandbox','America/New_York',now()-interval '2 hours',now()+interval '30 minutes')",[event]);
    await claim(buyer);
    const intent=await one('select public.create_reserved_creator_event_purchase_intent($1,$2)',[offer.id,offer.termsRevisionId]);
    await service();
    const receipt=await one("select public.process_revenuecat_app_store_event_atomic('playback-paid','NON_RENEWING_PURCHASE',$1,$2,'sandbox',now(),null,99,'usd',repeat('e',64),'playback-original',null,$3)",[buyer.user_id,intent.providerProductId,intent.createdAt]);
    eq(receipt.status,'processed',JSON.stringify(receipt));
    eq(await one('select count(*)::integer from public.paid_creator_event_passes where creator_event_id=$1 and buyer_id=$2 and status=\'active\'',[event,buyer.user_id]),1,'real provider projection issued exact ticket');
    const resolve=async(actor=buyer)=>{await claim(actor);return await one('select public.resolve_creator_event_destination($1)',[event]);};
    eq((await resolve()).reason,'waiting_for_show','advance ticket opens waiting room before verified start');
    await claim(host);
    for (const status of ['draft','ended','expired']) {
      await assert.rejects(db.query('update public.creator_events set status=$1 where id=$2',[status,event]),
        /purchased_event_lifecycle_management_required/,
        `an authenticated creator cannot bypass lifecycle control with ${status}`);
      checks++;
    }
    await service();
    const broadcast=await one(`insert into public.room_broadcast_sessions(source_type,source_room_id,creator_event_id,host_user_id,channel_user_id,
      broadcast_status,egress_provider,egress_id,egress_status,hls_playback_url,playback_url_status,rights_status,access_type,
      is_publicly_watchable,is_spectator_playback_enabled,requires_premium,requires_ticket,metadata)
      values('creator_event',$1,$1,$2,$2,'active_later','livekit_egress_later','synthetic-event-egress','active_later',
      'https://media.example/playback/index.m3u8','event_ticketed_available','creator_owned','ticketed',false,true,false,true,
      '{"event_ticketed_approved":true}') returning id`,[event,host.user_id]);
    const record=await one(`insert into public.spectator_hls_playback_records(broadcast_session_id,source_room_id,creator_event_id,host_user_id,
      channel_user_id,visibility,playback_status,playlist_path,rights_status,access_type,is_publicly_watchable,
      is_spectator_playback_enabled,requires_premium,requires_ticket) values($1,$2,$2,$3,$3,'private','live','playback/index.m3u8',
      'creator_owned','ticketed',false,true,false,true) returning id`,[broadcast,event,host.user_id]);
    step='live source';
    await claim(host);
    await one("select public.manage_creator_event_lifecycle($1,'start',(select updated_at from public.creator_events where id=$1))",[event]);
    eq((await resolve()).allowed,true,'verified source plus purchased pass permits exact show');
    eq((await resolve(other)).allowed,false,'another account cannot inherit ticket');
    const destination=await resolve();eq(destination.itemId,event);eq(destination.kind,'live');
    assert.doesNotMatch(JSON.stringify(destination),/sourceUrl|media\.example|broadcastId|recordId/);checks++;
    await assert.rejects(db.query('select public.read_creator_event_playback_source($1,$2,$3)',[event,buyer.user_id,buyer.session_id]),/permission denied/);checks++;
    await service();
    const source=await one('select public.read_creator_event_playback_source($1,$2,$3)',[event,buyer.user_id,buyer.session_id]);
    eq(source.allowed,true);eq(source.recordId,record);eq(source.broadcastId,broadcast);
    eq(source.sourceUrl,'https://media.example/playback/index.m3u8');
    eq((await one('select public.read_creator_event_playback_source($1,$2,$3)',[event,buyer.user_id,other.session_id])).allowed,false);
    for (const [sql,args] of [
      ['update auth.sessions set not_after=now()-interval \'1 second\' where id=$1',[buyer.session_id]],
      ["update public.paid_creator_event_passes set status='revoked',revoked_at=now() where creator_event_id=$1",[event]],
      ["update public.spectator_hls_playback_records set host_user_id=$1 where id=$2",[other.user_id,record]],
      ["update public.spectator_hls_playback_records set creator_event_id=$1 where id=$2",[other.user_id,record]],
      ["update public.spectator_hls_playback_records set playlist_path='wrong/index.m3u8' where id=$1",[record]],
      ["update public.room_broadcast_sessions set is_spectator_playback_enabled=false where id=$1",[broadcast]],
    ]) await isolate(async()=>{await service();await db.query(sql,args);eq((await resolve()).allowed,false,sql);});
    step='replay';
    await service();
    await db.query("update public.room_broadcast_sessions set broadcast_status='ended',ended_at=now() where id=$1",[broadcast]);
    await db.query("update public.spectator_hls_playback_records set playback_status='ended' where id=$1",[record]);
    await db.query(`insert into public.creator_replay_library_items(owner_user_id,source_type,source_room_id,title,visibility,rights_status,save_status,playback_record_id,broadcast_session_id,moderation_status,money_status)
      values($1,'creator_event',$4,'Captured show','ticketed','creator_owned','ready',$2,$3,'clean','paid')`,[host.user_id,record,broadcast,event]);
    await claim(host);await one("select public.manage_creator_event_lifecycle($1,'end',(select updated_at from public.creator_events where id=$1))",[event]);
    await assert.rejects(db.query("update public.creator_replay_library_items set visibility='public',money_status='free' where playback_record_id=$1",[record]),/event_replay_identity_immutable/);checks++;
    eq((await resolve()).kind,'replay','explicit purchased finite replay is available after end');
    await isolate(async()=>{await service();await db.query("update public.creator_replay_library_items set visibility='public' where playback_record_id=$1",[record]);eq((await resolve()).allowed,false,'paid replay cannot alias public delivery');});
    // Advance only the immutable fixture clock fields; production mutation
    // permissions remain enforced in independent quote/lifecycle tests.
    await isolate(async()=>{await service();await db.exec('set session_replication_role=replica');
      await db.query("update public.creator_event_offer_revisions set terms=jsonb_set(terms,'{replayExpiresAt}',to_jsonb((now()-interval '1 second')::text)) where id=$1",[offer.termsRevisionId]);
      await db.exec('set session_replication_role=origin');eq((await resolve()).allowed,false,'purchase-bound replay expiry denies access');});
    await isolate(async()=>{await service();await db.exec('set session_replication_role=replica');
      await db.query("update public.creator_event_offer_revisions set terms=jsonb_set(terms,'{replayPolicy}','\"none\"') where id=$1",[offer.termsRevisionId]);
      await db.exec('set session_replication_role=origin');eq((await resolve()).allowed,false,'current replay availability cannot upgrade a live-only purchase');});
    await isolate(async()=>{await service();await db.exec('set session_replication_role=replica');
      await db.query('delete from public.event_ticket_reservations where purchase_intent_id=$1',[intent.id]);
      await db.exec('set session_replication_role=origin');eq((await resolve()).allowed,false,'legacy absent captured replay contract remains unavailable');});
    step='circle lane';
    await service();
    const helperSQL=fs.readFileSync('supabase/migrations/20261026165859_creator_event_protected_playback.sql','utf8');
    assert.match(helperSQL,/event\.visibility='circle'/); // Executed negative control below removes this predicate.
    await isolate(async()=>{await service();await db.exec('set session_replication_role=replica');
      await db.query('delete from public.paid_creator_event_passes where creator_event_id=$1',[event]);
      await db.query('delete from public.paid_creator_events where creator_event_id=$1',[event]);
      await db.query("update public.room_broadcast_sessions set broadcast_status='active_later',ended_at=null,access_type='circle',requires_ticket=false,playback_url_status='circle_safe_available',metadata='{\"circle_spectator_approved\":true}' where id=$1",[broadcast]);
      await db.query("update public.spectator_hls_playback_records set playback_status='live',access_type='circle',requires_ticket=false,visibility='circle' where id=$1",[record]);
      await db.query("update public.creator_events set status='live_now',visibility='public' where id=$1",[event]);
      await db.exec('set session_replication_role=origin');
      eq((await resolve(other)).allowed,false,'public event cannot expose Circle-private media');
      await service();
      const start=helperSQL.indexOf('create function public.creator_event_broadcast_ready_internal');
      const end=helperSQL.indexOf('revoke all on function public.creator_event_broadcast_ready_internal');
      const mutant=helperSQL.slice(start,end).replace('create function','create or replace function').replace("and event.visibility='circle'",'');
      await db.exec(mutant);eq((await resolve(other)).allowed,true,'negative control detects missing Circle lane binding');
    });
    t.diagnostic(`${checks} production SQL checks; actual intent/provider/grant chain; synthetic approved media only, no provider stream or charge`);
  } catch(error){error.message=`${step}: ${error.message}`;throw error;}
  finally {await db.close();}
});
