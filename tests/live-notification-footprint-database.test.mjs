import assert from 'node:assert/strict';
import test from 'node:test';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedLiveRoomAuthority,liveFixtureActors as actors,withLiveRoomActor} from './helpers/live-room-authority-fixture.mjs';
import {createNotificationActivityHandler} from '../supabase/functions/_shared/notification-activity-worker.mjs';

test('actual canonical inbox footprint covers beyond recent pages and explicitly bounds distinct-key overflow', {timeout:240000},async t=>{
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
 const as=(actor,fn,role='authenticated')=>withLiveRoomActor(db,actor,fn,role);
 const footprint=()=>as(actors.follower,async()=>(await one('select public.read_my_live_notification_hint_footprint() value')).value);
 try {
  await seedLiveRoomAuthority(db);
  await db.exec("update public.user_profiles set profile_access_visibility='public',display_name='Footprint fixture host'");
  await as(actors.friend,()=>db.query('select public.set_person_notification_preferences($1,false,null,false,0)',[actors.host.id]));
  await db.exec("insert into public.notification_activity_worker_config(singleton,enabled,token_sha256) values(true,true,encode(extensions.digest('footprint-worker','sha256'),'hex')) on conflict(singleton) do update set enabled=excluded.enabled,token_sha256=excluded.token_sha256");
  const handler=createNotificationActivityHandler({adminClient:{async rpc(name,args){
   const result=await as(actors.host,()=>db.query(`select public.${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) value`,Object.values(args)),'service_role');
   return{data:name==='claim_notification_activity_batch'?result.rows.map(r=>r.value):result.rows[0].value,error:null};
  }},fetchImpl:async()=>{throw new Error('synthetic fixture has no push token; provider transport must not run');}});
  const run=async()=>{const response=await handler(new Request('https://fixture.invalid/activity',{method:'POST',headers:{'x-chillywood-activity-token':'footprint-worker'}}));assert.equal(response.status,200);};
  for(let index=0;index<257;index++){
   // Preserve the real limiter; separate fixture scenarios simulate expiry of
   // previous request windows, never disable/replace the application gate.
   if(index%5===0)await db.exec("update public.abuse_rate_limit_events set created_at=now()-interval '11 minutes'");
   const room=`FOOTPRINT-${index}`;
   await db.query("insert into public.watch_party_rooms(party_id,host_user_id,room_type,discovery_visibility,join_policy,content_access_rule,discovery_title) values($1,$2,'live','public','open','open','Canonical footprint room')",[room,actors.host.id]);
   await as(actors.host,()=>db.query('select public.join_watch_party_room_session($1)',[room]));
   const r=await one('select room_generation,host_settings_revision from public.watch_party_rooms where party_id=$1',[room]);
   const published=await as(actors.host,()=>one('select public.publish_live_stage_discovery_current($1,$2,$3,$4,$5) value',[room,actors.host.id,actors.host.session,r.room_generation,r.host_settings_revision]),'service_role');
   assert.equal(published.value,true);
   // Deliver while the real current host heartbeat is fresh. No notification,
   // outbox, source marker or source-visibility gate is fabricated for capacity.
   await run();
  }
  // Every source is kept live through its actual authenticated heartbeat RPC.
  for(let index=0;index<257;index++)await as(actors.host,()=>db.query("select public.heartbeat_watch_party_room_session($1,'active',false,false)",[`FOOTPRINT-${index}`]));
  assert.equal((await as(actors.follower,()=>one("select count(*)::int n from public.notifications where notification_type='followed_creator_live'"))).n,257);
  let result=await footprint();assert.equal(result.unreadCount,257);assert.equal(result.hasLiveActivity,true);assert.equal(result.subjectUserId,actors.follower.id);assert.equal(result.keys.length,256);assert.equal(result.complete,false);
  assert.equal(new Set(result.keys).size,256);assert.ok(result.keys.every(k=>/^[0-9a-f-]{36}$/i.test(k)));
  const r=await one("select * from public.watch_party_rooms where party_id='FOOTPRINT-0'");
  await as(actors.host,()=>db.query('select public.set_watch_party_room_host_settings($1,$2,$3,$4,$5,$6,$7,$8,$9)',[r.party_id,r.room_generation,r.host_settings_revision,actors.host.session,r.join_policy,'private',r.discovery_title,r.source_type,r.source_id]));
  result=await footprint();assert.equal(result.unreadCount,256);assert.equal(result.keys.length,256);assert.equal(result.complete,true,'256 is complete, not a truncated recent100 sample');
  const other=await as(actors.stranger,()=>one('select public.read_my_live_notification_hint_footprint() value'));
  assert.deepEqual(other.value.keys,[]);assert.equal(other.value.complete,true,'another current account cannot request the known recipient footprint');
  await assert.rejects(as(actors.follower,()=>db.query('select public.read_my_live_notification_hint_footprint()'),'service_role'),/permission denied/);
  await db.query('delete from auth.sessions where id=$1',[actors.follower.session]);
  await assert.rejects(footprint,/notification_current_session_required/);
  t.diagnostic('257 real host joins + canonical publishes + actual worker deliveries; opaque response bounded256 with explicit incomplete overflow. No provider transport or authority stubs.');
 }finally{await db.close();}
});
