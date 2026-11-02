import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedLiveRoomAuthority,liveFixtureActors as a,withLiveRoomActor,liveFixtureClaims} from './helpers/live-room-authority-fixture.mjs';
import {approvedOrdinaryBroadcastSQL} from './helpers/ordinary-broadcast-discovery-fixture.mjs';

test('ordinary spectator discovery obeys actual room audience and pause before publication or hints', {timeout:180000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
 const scalar=async(sql,p=[])=>(Object.values((await db.query(sql,p)).rows[0]??{}))[0];
 const auth=(actor,fn,role='authenticated')=>withLiveRoomActor(db,actor,fn,role);
 const id='ORDINARY-PAUSE',broadcast='ac520000-0000-4000-8000-000000000001',playback='ac520001-0000-4000-8000-000000000001';
 const room=async()=>(await db.query('select * from public.watch_party_rooms where party_id=$1',[id])).rows[0];
 const save=async(visibility,paused)=>{const r=await room();return auth(a.host,()=>scalar(
  'select public.set_watch_party_room_host_settings($1,$2,$3,$4,$5,$6,$7,$8,$9,false,false,$10)',
  [id,r.room_generation,Number(r.host_settings_revision),a.host.session,'open',visibility,'Ordinary current broadcast',r.source_type,r.source_id,paused]));};
 const reset=()=>db.exec('truncate realtime.fixture_outbox,realtime.messages');
 const topics=async()=>(await db.query('select distinct topic from realtime.fixture_outbox order by topic')).rows.map(r=>r.topic);
 const view=id=>`discovery:v1:viewer:${id}`;
 const count=(table,actor=a.friend)=>auth(actor,()=>scalar(`select count(*)::int from public.${table} where source_type='watch_party_room' and source_id=$1`,[id]));
 try{
  await seedLiveRoomAuthority(db);
  await db.exec(`create or replace function realtime.send(jsonb,text,text,boolean) returns void language plpgsql as $$begin
    insert into realtime.messages(extension,topic,payload,event,private,inserted_at,updated_at)
      values('broadcast',$3,$1,$2,$4,clock_timestamp(),clock_timestamp());
    insert into realtime.fixture_outbox values($1,$2,$3,$4);end$$;
    update private.discovery_invalidation_worker_config set collecting=true,enabled=true,token_sha256=repeat('a',64);`);
  await auth(a.host,()=>db.query("insert into public.watch_party_rooms(party_id,host_user_id,room_type,content_access_rule) values($1,$2,'live','open'),('ORDINARY-PRIVATE',$2,'live','open')",[id,a.host.id]));
  await auth(a.host,()=>db.query("select public.join_watch_party_room_session($1,'Actual broadcast host')",[id]));
  await db.exec(approvedOrdinaryBroadcastSQL({partyId:'ORDINARY-PRIVATE',hostId:a.host.id,broadcastId:'ac520000-0000-4000-8000-000000000002',playbackId:'ac520001-0000-4000-8000-000000000002'}));
  assert.deepEqual(await topics(),[],'ordinary default/private room cannot be published by provider transport flags alone');
  await save('public',false);
  await db.exec(approvedOrdinaryBroadcastSQL({partyId:id,hostId:a.host.id,broadcastId:broadcast,playbackId:playback}));
  assert.equal(await count('discovery_feed_items',a.stranger),1,'explicit Public plus approved matching HLS produces canonical spectator card');
  await reset();await save('public',true);
  assert.ok((await topics()).includes('discovery:v1:surface:home'),'old Public withdrawal is immediate');
  assert.equal(await count('discovery_feed_items',a.stranger),0);
  await reset();await db.query("update public.room_broadcast_sessions set metadata=metadata||'{\"provider_frame\":1}'::jsonb where id=$1",[broadcast]);
  assert.deepEqual(await topics(),[],'a later provider refresh cannot expose even a new public key for a paused room');

  // Restore the genuine predecessor projection in a rollback: restrictive
  // reads must still suppress a stale public flag, not rely on client filters.
  await db.exec('begin');await db.query('select public.sync_spectator_broadcast_discovery_pre_listing_pause($1)',[broadcast]);
  assert.equal(await scalar("select is_publicly_discoverable from public.discovery_feed_items where source_type='watch_party_room' and source_id=$1",[id]),true);
  await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.role','authenticated',true)",[liveFixtureClaims(a.stranger)]);await db.exec('set local role authenticated');
  assert.equal(await scalar("select count(*)::int from public.discovery_feed_items where source_type='watch_party_room' and source_id=$1",[id]),0);
  await db.exec('reset role;drop policy spectator_listing_unpaused_public on public.discovery_feed_items;set local role authenticated');
  assert.equal(await scalar("select count(*)::int from public.discovery_feed_items where source_type='watch_party_room' and source_id=$1",[id]),1,
   'negative control: removing only restrictive listing guard exposes the actual stale projection');
  await db.exec('rollback');
  await save('public',false);assert.equal(await count('discovery_feed_items',a.stranger),1);
  await reset();await save('circle',false);
  assert.equal(await count('discovery_feed_items',a.stranger),0,'Public HLS cannot override a narrower actual Circle room');
  assert.equal(await count('circle_spectator_feed_items'),0,'mismatched HLS is hidden, not relabeled into authorized playback');
  await reset();await db.exec(`begin;
    update public.room_broadcast_sessions set playback_url_status='circle_safe_available',access_type='circle',is_publicly_watchable=false,
      metadata=(metadata-'d7f_public_safe_approved')||'{"circle_spectator_approved":true}'::jsonb where id='${broadcast}';
    update public.spectator_hls_playback_records set visibility='circle',access_type='circle',is_publicly_watchable=false where id='${playback}';commit;`);
  assert.equal(await count('circle_spectator_feed_items'),1);
  assert.equal(await count('circle_spectator_feed_items',a.follower),0);
  assert.deepEqual(await topics(),[view(a.host.id),view(a.friend.id)].sort(),'genuine Circle spectator start reaches only its actual eligible own-viewer topics');
  await reset();await save('circle',true);
  assert.equal(await count('circle_spectator_feed_items'),0);
  assert.deepEqual(await topics(),[view(a.host.id),view(a.friend.id)].sort(),'paused Circle spectator withdrawal is primary, not a public hint or30-second poll');
  await reset();await db.query("update public.spectator_hls_playback_records set metadata=metadata||'{\"provider_frame\":2}'::jsonb where id=$1",[playback]);
  assert.deepEqual(await topics(),[],'later private provider activity never re-notifies former Circle spectators');
  assert.equal(await scalar("select has_schema_privilege('authenticated','private','USAGE')"),false,'private RLS helper is not an arbitrary room-code oracle');
 }finally{await db.close();}
});
