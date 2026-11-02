import assert from 'node:assert/strict';
import test from 'node:test';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedLiveRoomAuthority,liveFixtureActors as actors,liveFixtureTitle,withLiveRoomActor} from './helpers/live-room-authority-fixture.mjs';
import {createNotificationActivityHandler} from '../supabase/functions/_shared/notification-activity-worker.mjs';

test('actual listing pause withdraws invitations without broadening Circle admission or private attendance', {timeout:180000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
 const as=(actor,fn,role='authenticated')=>withLiveRoomActor(db,actor,fn,role);
 const row=party=>one('select * from public.watch_party_rooms where party_id=$1',[party]);
 const hints=async()=>(await db.query('select * from realtime.fixture_outbox')).rows;
 const clearHints=()=>db.exec('delete from realtime.fixture_outbox; delete from realtime.messages; delete from private.discovery_invalidation_outbox');
 const visible=async(viewer,party)=>{
  const bound=(await db.query('select notification_id from public.notification_activity_events where source_id=$1 and notification_id is not null',[party])).rows;
  return as(viewer,()=>db.query('select id,notification_type from public.notifications where id=any($1::uuid[])',[bound.map(r=>r.notification_id)]));
 };
 const context=(viewer,ids)=>as(viewer,async()=>(await one('select public.read_my_notification_display_context($1) value',[ids])).value);
 const settings=async(party,paused,publish=false)=>{
  const r=await row(party);
  return as(actors.host,async()=>(await one('select public.set_watch_party_room_host_settings($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11) value',
   [party,r.room_generation,r.host_settings_revision,actors.host.session,r.join_policy,r.discovery_visibility,r.discovery_title,
    r.room_type==='title'?'platform_title':r.source_type,r.room_type==='title'?liveFixtureTitle:r.source_id,publish,paused])).value);
 };
 const publish=async party=>{
  const r=await row(party);
  if(r.room_type==='title')return settings(party,false,true);
  await settings(party,false);
  const current=await row(party);
  const result=await as(actors.host,()=>one('select public.publish_live_stage_discovery_current($1,$2,$3,$4,$5) value',
   [party,actors.host.id,actors.host.session,current.room_generation,current.host_settings_revision]),'service_role');
  assert.equal(result.value,true,'actual current-session publisher establishes the live source');
 };
 const create=async(party,type,audience)=>{
  await db.query(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,join_policy,content_access_rule,discovery_visibility,discovery_title,title_id,source_type,source_id)
   values($1,$2,$3,'open',$4,$5,$6,$7,$8,$7)`,[party,actors.host.id,type,type==='title'?'premium':'open',audience,
    `${party} selected title`,type==='title'?liveFixtureTitle:null,type==='title'?'platform_title':null]);
  await as(actors.host,()=>db.query('select public.join_watch_party_room_session($1)',[party]));
 };
 try{
  await seedLiveRoomAuthority(db);
  for(const [name,actor] of Object.entries(actors))await db.query("update public.user_profiles set display_name=$2,username=$3,profile_access_visibility='public' where user_id=$1",[actor.id,`Pause ${name}`,`pause_${name}`]);
  // Managed Realtime is the transport double; SQL authority, receipts, actual
  // HTTP worker and durable realtime.messages confirmation are unchanged.
  await db.exec(`create or replace function realtime.send(jsonb,text,text,boolean) returns void language plpgsql as $$begin
   insert into realtime.messages(extension,topic,payload,event,private,inserted_at,updated_at) values('broadcast',$3,$1,$2,$4,clock_timestamp(),clock_timestamp());
   insert into realtime.fixture_outbox values($1,$2,$3,$4);end$$;
   update private.discovery_invalidation_worker_config set collecting=true,enabled=true,token_sha256=repeat('a',64);
   insert into public.notification_activity_worker_config(singleton,enabled,token_sha256) values(true,true,encode(extensions.digest('pause-worker','sha256'),'hex'))
    on conflict(singleton) do update set enabled=excluded.enabled,token_sha256=excluded.token_sha256;
   create schema pause_notification_fixture;grant usage on schema pause_notification_fixture to authenticated;
   create function pause_notification_fixture.prior_context(p_notice uuid) returns jsonb language sql security definer set search_path='' as $$
    select private.live_notification_read_context_pre_listing_pause(p_notice,auth.uid())$$;
   grant execute on function pause_notification_fixture.prior_context(uuid) to authenticated;`);
  const handler=createNotificationActivityHandler({adminClient:{async rpc(name,args){
   const result=await as(actors.host,()=>db.query(`select public.${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) value`,Object.values(args)),'service_role');
   return {data:name==='claim_notification_activity_batch'?result.rows.map(r=>r.value):result.rows[0].value,error:null};
  }},fetchImpl:async()=>{throw new Error('no fixture push token; provider delivery is not authorized');}});
  const run=async()=>{
   await db.exec("update public.notification_activity_events set status='suppressed',completed_at=now() where event_kind not in ('followed_creator_live','circle_friend_live','live_room_member_joined') and status='pending'");
   const result=await handler(new Request('https://fixture.invalid/activity',{method:'POST',headers:{'x-chillywood-activity-token':'pause-worker'}}));
   assert.equal(result.status,200);return result.json();
  };
  for(const type of ['live','title'])for(const audience of ['public','circle']){
   const party=`PAUSE-${type.toUpperCase()}-${audience.toUpperCase()}`;
   await create(party,type,audience);await publish(party);await run();
   const notices=(await db.query("select n.id,n.user_id from public.notifications n join public.notification_activity_events e on e.notification_id=n.id where e.source_id=$1 and n.notification_type in ('followed_creator_live','circle_friend_live')",[party])).rows;
   assert.deepEqual(notices.map(n=>n.user_id).sort(),(audience==='public'?[actors.friend.id,actors.follower.id]:[actors.friend.id]).sort());
   const notice=notices.find(n=>n.user_id===actors.friend.id);
   const previous=(await context(actors.friend,[notice.id])).items[0];assert.equal(previous.liveState,'live');
   await clearHints();const changed=await settings(party,true);
   assert.equal(changed.visibility,audience);assert.equal(changed.discoveryPaused,true);
   assert.equal((await visible(actors.friend,party)).rows.length,0,'pause removes materialized join invitations from the actual RLS inbox');
   assert.equal((await context(actors.friend,[notice.id])).items[0].resolution,'unavailable');
   const footprint=await as(actors.friend,async()=>(await one('select public.read_my_live_notification_hint_footprint() value')).value);
   assert.ok(!footprint.keys.includes(previous.discoveryHintKey),'the same paused source is excluded from badge authority');
   const changes=await hints();assert.ok(changes.some(h=>h.payload.keys?.includes(previous.discoveryHintKey)),'primary hint fences the formerly visible source');
   assert.ok(changes.every(h=>Object.keys(h.payload).every(k=>['id','keys'].includes(k))));
   assert.doesNotMatch(JSON.stringify(changes),new RegExp(`${party}|Pause host|selected title`));
   if(audience==='circle'){
    assert.ok(changes.every(h=>h.topic.startsWith('discovery:v1:viewer:')),'Circle pause emits no broad public hint');
    await assert.rejects(as(actors.follower,()=>db.query('select public.join_watch_party_room_session($1)',[party])),/circle|audience|forbidden|access|authority/i,
     'Off must not turn a known Circle code into admission for its former nonmember follower');
    await as(actors.friend,()=>db.query('select public.join_watch_party_room_session($1)',[party]));
   }
   await publish(party);await run();
   assert.equal((await one("select count(*)::int n from public.notifications n join public.notification_activity_events e on e.notification_id=n.id where e.source_id=$1 and n.notification_type in ('followed_creator_live','circle_friend_live')",[party])).n,notices.length,
    'resume keeps one delivery identity for the same actual lifecycle, not a new mass resend');
   await settings(party,true);
   await db.query('update public.watch_party_rooms set is_active=false where party_id=$1',[party]);
   assert.equal((await visible(actors.friend,party)).rows.length,0,'ending a paused room must not resurrect its hidden join invitation');
   if(audience==='public'){
    const prior=await as(actors.friend,()=>one('select pause_notification_fixture.prior_context($1) value',[notice.id]));
    assert.equal(prior.value.allowed,true,'negative control executes the prior ended-history predicate under the real recipient session and reproduces paused→end revival');
   }
   assert.equal((await one('select count(*)::int n from public.notifications where id=$1',[notice.id])).n,1,'historical audit evidence remains stored');
  }
  // Paused attendance remains explicitly opted in and current-members-only.
  // A Circle friend of the actor who never entered is not a private subscriber.
  for(const pair of [[actors.host,actors.follower],[actors.friend,actors.follower],[actors.follower,actors.stranger]]){
   const [low,high]=pair.map(a=>a.id).sort();
   await db.query("insert into public.user_friendships(user_low_id,user_high_id,requested_by_user_id,status) values($1,$2,$1,'active')",[low,high]);
  }
  for(const viewer of [actors.host,actors.friend,actors.stranger])await as(viewer,()=>db.query('select public.set_person_notification_preferences($1,null,null,true,0)',[actors.follower.id]));
  for(const [type,audience,loss] of [['live','public','membership'],['live','circle','circle'],['title','circle','premium']]){
   const party=`PAUSED-ATTENDANCE-${loss.toUpperCase()}`;
   await create(party,type,audience);await settings(party,true);
   for(const actor of [actors.friend,actors.follower])await as(actor,()=>db.query('select public.join_watch_party_room_session($1)',[party]));
   await new Promise(resolve=>setTimeout(resolve,11000));
   await as(actors.follower,()=>db.query("select public.heartbeat_watch_party_room_session($1,'active',false,false)",[party]));
   await run();
   const notices=(await db.query("select id,user_id,title from public.notifications where target_entity_id=$1 and notification_type='live_room_member_joined'",[party])).rows;
   assert.deepEqual(notices.map(n=>n.user_id).sort(),[actors.host.id,actors.friend.id].sort());
   assert.ok(notices.every(n=>n.title.includes('Pause follower')),'actual actor is named only to its opted-in authorized recipients');
   await clearHints();
   if(loss==='membership')await as(actors.friend,()=>db.query("select public.heartbeat_watch_party_room_session($1,'left',false,false)",[party]));
   else if(loss==='circle')await db.query("update public.user_friendships set status='removed' where user_low_id=$1 and user_high_id=$2",[actors.host.id,actors.friend.id]);
   else{
    const expired=await one(`select public.process_revenuecat_premium_event_atomic('revenuecat_google_play','pause-premium-expired','EXPIRATION',$1::uuid,
     p.provider_product_id,p.provider_base_plan_id,'sandbox','expired',now()-interval '1 day',now()-interval '1 second',now(),999,'usd',repeat('a',64),
     'NORMAL','google_play','android',null,p.id,$2) value from public.monetization_products p
     where p.provider='revenuecat_google_play' and p.environment='sandbox' and p.product_type='premium_subscription' and p.status='sandbox'
     order by p.created_at,p.id limit 1`,[actors.friend.id,`live-authority-original-${actors.friend.id}`]);
    assert.equal(expired.value.status,'processed');
    assert.equal((await one('select public.premium_subject_has_finite_authority_internal($1) value',[actors.friend.id])).value,false);
   }
   const withdrawn=await hints();
   assert.ok(withdrawn.some(h=>h.topic===`discovery:v1:viewer:${actors.friend.id}`));
   assert.ok(withdrawn.every(h=>h.topic.startsWith('discovery:v1:viewer:')));
   assert.equal((await visible(actors.friend,party)).rows.length,0);
   await clearHints();
   const r=await row(party);
   await as(actors.host,()=>db.query('select public.set_watch_party_room_host_settings($1,$2,$3,$4,$5,$6,$7,$8,$9,false,false,true)',
    [party,r.room_generation,r.host_settings_revision,actors.host.session,r.join_policy,r.discovery_visibility,'Later unlisted edit',
     type==='title'?'platform_title':r.source_type,type==='title'?liveFixtureTitle:r.source_id]));
   await db.query('update public.watch_party_rooms set is_active=false where party_id=$1',[party]);
   assert.ok(!(await hints()).some(h=>h.topic===`discovery:v1:viewer:${actors.friend.id}`),'retired attendance is not a future private activity subscription');
   assert.equal((await one('select count(*)::int n from private.room_attendance_hint_receipts where party_id=$1',[party])).n,0);
   if(loss==='circle')await db.query("update public.user_friendships set status='active' where user_low_id=$1 and user_high_id=$2",[actors.host.id,actors.friend.id]);
  }
 }finally{await db.close();}
});
