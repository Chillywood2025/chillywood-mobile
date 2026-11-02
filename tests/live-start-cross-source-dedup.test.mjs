import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {seedLiveRoomAuthority,liveFixtureActors as actors,liveFixtureTitle,withLiveRoomActor} from './helpers/live-room-authority-fixture.mjs';
import {createNotificationActivityHandler} from '../supabase/functions/_shared/notification-activity-worker.mjs';

test('actual two-source start delivery is per recipient and bound room generation, not a transport or creator', {timeout:240000},async t=>{
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
 const as=(actor,fn,role='authenticated')=>withLiveRoomActor(db,actor,fn,role);
 const rpc=async(name,args)=>{
  const result=await as(actors.host,()=>db.query(`select public.${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) value`,Object.values(args)),'service_role');
  return name==='claim_notification_activity_batch'?result.rows.map(r=>r.value):result.rows[0].value;
 };
 const row=party=>one('select * from public.watch_party_rooms where party_id=$1',[party]);
 const events=async party=>(await db.query('select e.*,b.source_type,b.room_generation from public.notification_activity_events e join private.room_start_notification_bindings b on b.event_id=e.id where b.party_id=$1 order by e.scheduled_at,e.id',[party])).rows;
 const notices=async party=>(await db.query('select n.*,b.source_type,b.room_generation from public.notifications n join private.room_start_notification_bindings b on b.event_id::text=n.source_id where b.party_id=$1',[party])).rows;
 const receipts=async party=>(await db.query('select * from private.room_start_notification_deliveries where party_id=$1',[party])).rows;
 const settings=async(party,{paused=false,visibility, publish=false}={})=>{
  const r=await row(party);
  return as(actors.host,()=>db.query('select public.set_watch_party_room_host_settings($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11)',
   [party,r.room_generation,r.host_settings_revision,actors.host.session,r.join_policy,visibility??r.discovery_visibility,r.discovery_title,
    r.room_type==='title'?'platform_title':r.source_type,r.room_type==='title'?liveFixtureTitle:r.source_id,publish,paused]));
 };
 const publish=async party=>{
  const r=await row(party);await settings(party,{publish:true});
  if(r.room_type==='live'){
   const current=await row(party);
   assert.equal((await as(actors.host,()=>one('select public.publish_live_stage_discovery_current($1,$2,$3,$4,$5) value',
    [party,actors.host.id,actors.host.session,current.room_generation,current.host_settings_revision]),'service_role')).value,true);
  }
 };
 const create=async(party,type='live',doPublish=true)=>{
  const insert=()=>db.query(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,content_access_rule,discovery_visibility,discovery_title,title_id,source_type,source_id)
   values($1,$2,$3,$4,'public','Same selected caption',$5,$6,$5)`,[party,actors.host.id,type,type==='title'?'premium':'open',type==='title'?liveFixtureTitle:null,type==='title'?'platform_title':null]);
  const attempts=await one("select count(*)::int n from public.abuse_rate_limit_events where actor_user_id=$1 and action_key='watch_party_room_create' and target_key=$2 and created_at>now()-interval '10 minutes'",[actors.host.id,type]);
  if(attempts.n>=5){
   await assert.rejects(insert,/rate_limited/);
   await db.query("update public.abuse_rate_limit_events set created_at=now()-interval '11 minutes' where actor_user_id=$1 and action_key='watch_party_room_create' and target_key=$2",[actors.host.id,type]);
  }
  await insert();await as(actors.host,()=>db.query('select public.join_watch_party_room_session($1)',[party]));
  if(doPublish)await publish(party);
 };
 const broadcast=async(party,extra={})=>{
  const id=randomUUID(),playback=randomUUID();
  await db.query(`insert into public.room_broadcast_sessions(id,source_type,source_room_id,host_user_id,channel_user_id,broadcast_status,hls_playback_url,
   playback_url_status,rights_status,access_type,is_publicly_watchable,is_spectator_playback_enabled,requires_premium,requires_ticket,metadata,
   creator_event_id,notification_room_id,notification_room_generation,notification_room_host)
   values($1,'watch_party_room',$2,$3,$3,'active_later','https://example.invalid/approved.m3u8','public_safe_available','creator_owned','public_free',true,true,false,false,
   '{"d7f_public_safe_approved":true}',$4,'FORGED-ROOM',$5,$6)`,[id,party,actors.host.id,extra.eventId??null,randomUUID(),actors.stranger.id]);
  await db.query(`insert into public.spectator_hls_playback_records(id,broadcast_session_id,source_room_id,host_user_id,visibility,playback_status,playlist_path,
   rights_status,access_type,is_publicly_watchable,is_spectator_playback_enabled,requires_premium,requires_ticket)
   values($1,$2,$3,$4,'public','live','fixture/index.m3u8','creator_owned','public_free',true,true,false,false)`,[playback,id,party,actors.host.id]);
  const bound=await one('select notification_room_id,notification_room_generation,notification_room_host from public.room_broadcast_sessions where id=$1',[id]);
  assert.deepEqual(bound,{notification_room_id:party,notification_room_generation:(await row(party)).room_generation,notification_room_host:actors.host.id},'server overwrites caller-proposed binding');
  return id;
 };
 const globals=async(inApp,push)=>as(actors.friend,async()=>{
  const current=(await one('select public.read_my_notification_preferences() value')).value;
  const changed=(await one('select public.mutate_my_notification_preferences($1,$2,$3,$4) value',
   [randomUUID(),current.incarnation,current.revision,{in_app_enabled:inApp,push_enabled:push}])).value;
  assert.equal(changed.status,'applied');
 });
 let outcome='ok',beforeReserve=null;const sent=[];
 const handler=createNotificationActivityHandler({adminClient:{async rpc(name,args){
  if(name==='reserve_notification_activity_push'&&beforeReserve){const callback=beforeReserve;beforeReserve=null;await callback();}
  return{data:await rpc(name,args),error:null};
 }},fetchImpl:async(_url,options)=>{
  sent.push(JSON.parse(options.body));
  if(outcome==='unknown')return new Response('{}',{status:503});
  return new Response(JSON.stringify({data:outcome==='ok'?{status:'ok',id:`dedup-${sent.length}`}:{status:'error',details:{error:outcome}}}));
 }});
 const run=async()=>{
  await db.exec("update public.notification_activity_events set status='suppressed',completed_at=now() where event_kind not in ('followed_creator_live','circle_friend_live') and status='pending'");
  const response=await handler(new Request('https://fixture.invalid/activity',{method:'POST',headers:{'x-chillywood-activity-token':'dedup-worker'}}));
  assert.equal(response.status,200);return response.json();
 };
 try{
  await seedLiveRoomAuthority(db);await db.query('delete from public.channel_followers where follower_user_id=$1',[actors.follower.id]);
  await db.query("update public.user_profiles set profile_access_visibility='public',display_name='Exact single creator',username='dedup_creator' where user_id=$1",[actors.host.id]);
  await db.exec("insert into public.notification_activity_worker_config(singleton,enabled,token_sha256) values(true,true,encode(extensions.digest('dedup-worker','sha256'),'hex')) on conflict(singleton) do update set enabled=excluded.enabled,token_sha256=excluded.token_sha256");
  await globals(true,false);
  for(const type of ['live','title'])for(const first of ['room','broadcast']){
   const party=`DEDUP-${type}-${first}`.toUpperCase();await create(party,type,first!=='broadcast');await broadcast(party);
   if(first==='broadcast')await publish(party);
   assert.equal((await events(party)).length,2,'both actual source producers retain their independent candidates');
   await db.query("update public.notification_activity_events e set scheduled_at=now()-case when (context->>'sourceType'='broadcast')=$2 then interval '2 seconds' else interval '1 second' end where id in(select event_id from private.room_start_notification_bindings where party_id=$1)",[party,first==='broadcast']);
   await run();const delivered=await notices(party);assert.equal(delivered.length,1);
   assert.equal(delivered[0].source_type,first==='broadcast'?'broadcast':type==='live'?'live_stage':'party_room');
   assert.equal(delivered[0].title,'Exact single creator (@dedup_creator) is live');
   assert.equal(delivered[0].read_at,null,'unread still means a materialized announcement was delivered');
   await run();assert.equal((await notices(party)).length,1);assert.equal((await receipts(party)).length,1);
  }
  await create('DEDUP-PREDECESSOR');await broadcast('DEDUP-PREDECESSOR');
  const priorEvents=await events('DEDUP-PREDECESSOR');
  await db.exec(`begin;create function pg_temp.prior_start_prepare(p_id uuid,p_lease uuid) returns jsonb
   language sql security definer set search_path='' as $$select public.prepare_notification_activity_pre_room_start(p_id,p_lease)$$;
   grant execute on function pg_temp.prior_start_prepare(uuid,uuid) to service_role;`);
  await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.role','service_role',true)",
   [JSON.stringify({role:'service_role',sub:actors.host.id,session_id:actors.host.session})]);
  await db.exec('set local role service_role');
  const priorClaims=(await db.query('select public.claim_notification_activity_batch(10) value')).rows.map(r=>r.value);
  for(const e of priorEvents){
   const claim=priorClaims.find(c=>c.eventId===e.id);assert.ok(claim);
   assert.equal((await one('select pg_temp.prior_start_prepare($1,$2) value',[e.id,claim.leaseToken])).value.eligible,true);
  }
  await db.exec('reset role');assert.equal((await notices('DEDUP-PREDECESSOR')).length,2,'actual retained predecessor materializes both eligible sources without the new delivery boundary');
  await db.exec('rollback');await run();assert.equal((await notices('DEDUP-PREDECESSOR')).length,1,'negative control is rolled back; the current handler still emits exactly one');
  await globals(false,false);await create('DEDUP-NO-CHANNEL');await run();
  assert.equal((await receipts('DEDUP-NO-CHANNEL')).length,0);
  await globals(true,false);await broadcast('DEDUP-NO-CHANNEL');await run();
  assert.equal((await notices('DEDUP-NO-CHANNEL'))[0].source_type,'broadcast','undelivered earlier candidate cannot consume the room');
  await as(actors.friend,()=>db.query('select public.set_person_notification_preferences($1,false,true,false,0)',[actors.host.id]));
  await create('DEDUP-PERSON-OFF');await broadcast('DEDUP-PERSON-OFF');await run();
  assert.equal((await notices('DEDUP-PERSON-OFF'))[0].source_type,'broadcast','Live Off does not suppress separately enabled current Watch-Party source');
  await as(actors.friend,()=>db.query('select public.set_person_notification_preferences($1,null,null,false,1)',[actors.host.id]));
  await create('DEDUP-QUEUED-PRIVACY');await broadcast('DEDUP-QUEUED-PRIVACY');await settings('DEDUP-QUEUED-PRIVACY',{paused:true});await run();
  assert.equal((await notices('DEDUP-QUEUED-PRIVACY')).length,0);assert.equal((await receipts('DEDUP-QUEUED-PRIVACY')).length,0);
  await settings('DEDUP-QUEUED-PRIVACY',{paused:false});await publish('DEDUP-QUEUED-PRIVACY');await broadcast('DEDUP-QUEUED-PRIVACY');await run();
  assert.equal((await notices('DEDUP-QUEUED-PRIVACY')).length,1,'previously suppressed queued sources cannot block later authorized delivery');
  await globals(false,true);await create('DEDUP-NO-TOKEN');await run();assert.equal((await receipts('DEDUP-NO-TOKEN')).length,0);
  await db.query(`insert into public.wave1_push_installation_ownership(platform,install_id,user_id,account_id,session_generation,ownership_state,revocation_credential_hash,last_operation_key,last_reason)
   values('ios','dedup-fixture',$1,$1,$2,'ACCOUNT_BOUND',repeat('a',64),'fixture','fixture')`,[actors.friend.id,actors.friend.session]);
  await db.query(`insert into public.user_push_tokens(user_id,platform,provider,token,token_hash,token_fingerprint,install_id,session_generation,ownership_state)
   values($1,'ios','expo','ExponentPushToken[dedup]','dedup-fixture','dedup-fixture','dedup-fixture',$2,'ACCOUNT_BOUND')`,[actors.friend.id,actors.friend.session]);
  let before=sent.length;await broadcast('DEDUP-NO-TOKEN');await run();assert.equal(sent.length-before,1);
  for(const providerResult of ['MessageTooBig','unknown']){
   const party=`DEDUP-PUSH-${providerResult}`.toUpperCase();await create(party);outcome=providerResult;await run();
   assert.equal((await notices(party)).length,0);before=sent.length;outcome='ok';await broadcast(party);await run();
   assert.equal(sent.length-before,providerResult==='unknown'?0:1,'only retained definite no-send evidence can release a push-only winner');
   assert.equal((await receipts(party)).length,1);
  }
  // Both sources can prepare before either sends when in-app is disabled.
  await create('DEDUP-RESERVATIONS');await broadcast('DEDUP-RESERVATIONS');
  const candidates=await events('DEDUP-RESERVATIONS');const claims=await rpc('claim_notification_activity_batch',{p_limit:10});
  const exact=candidates.map(e=>({e,claim:claims.find(c=>c.eventId===e.id)}));assert.ok(exact.every(x=>x.claim));
  const fences=exact.map(x=>({p_event_id:x.e.id,p_lease_token:x.claim.leaseToken}));
  const plans=[];for(const fence of fences)plans.push(await rpc('prepare_notification_activity',fence));
  const token=plans[0].tokenIds[0];assert.ok(token);assert.equal(plans[1].tokenIds[0],token);
  assert.equal((await rpc('reserve_notification_activity_push',{...fences[0],p_push_token_id:token})).eligible,true);
  assert.equal((await rpc('reserve_notification_activity_push',{...fences[1],p_push_token_id:token})).reason,'room_start_delivery_pending');
  assert.equal((await one('select status from public.notification_activity_events where id=$1',[fences[1].p_event_id])).status,'pending');
  await rpc('complete_notification_activity_push',{...fences[0],p_push_token_id:token,p_status:'failed',p_provider_message_id:null,p_error_code:'MessageTooBig'});
  await rpc('finish_notification_activity',fences[0]);
  await db.query("update public.notification_activity_events set scheduled_at=now()-interval '1 second' where id=$1",[fences[1].p_event_id]);
  before=sent.length;await run();assert.equal(sent.length-before,1,'pending competitor remains usable after the first proven no-send');
  await globals(true,true);await create('DEDUP-PAUSE');await broadcast('DEDUP-PAUSE');
  before=sent.length;beforeReserve=()=>settings('DEDUP-PAUSE',{paused:true});await run();assert.equal(sent.length,before);
  assert.equal((await notices('DEDUP-PAUSE')).length,1,'materialization happened before the privacy race');
  assert.equal((await as(actors.friend,()=>one("select count(*)::int n from public.notifications where target_entity_id='DEDUP-PAUSE'"))).n,0);
  await settings('DEDUP-PAUSE',{paused:false});await publish('DEDUP-PAUSE');await broadcast('DEDUP-PAUSE');await run();
  assert.equal(sent.length,before,'already materialized unread start is not permission to send a second transport announcement');
  await globals(true,false);await create('DEDUP-RESTART');const oldBroadcast=await broadcast('DEDUP-RESTART');const old=(await row('DEDUP-RESTART')).room_generation;
  await db.exec("update public.watch_party_rooms set is_active=false where party_id='DEDUP-RESTART';update public.watch_party_rooms set is_active=true where party_id='DEDUP-RESTART'");
  await as(actors.host,()=>db.exec("select public.join_watch_party_room_session('DEDUP-RESTART')"));await publish('DEDUP-RESTART');
  assert.notEqual((await row('DEDUP-RESTART')).room_generation,old);
  await db.query("update public.room_broadcast_sessions set metadata=metadata||'{\"provider_refresh\":true}'::jsonb,creator_event_id=$2 where id=$1",[oldBroadcast,randomUUID()]);
  assert.equal((await one("select private.discovery_notification_source_pre_room_start_binding('broadcast',$1) value",[oldBroadcast])).value.eligible,true,'predecessor accepts a stale qualified provider row; a bare event tag is not a prepared-event exemption');
  assert.equal((await one("select private.discovery_notification_source('broadcast',$1) value",[oldBroadcast])).value.eligible,false,'stale provider row cannot move into a new room lifecycle');
  await assert.rejects(db.query('update public.room_broadcast_sessions set notification_room_generation=$2 where id=$1',[oldBroadcast,(await row('DEDUP-RESTART')).room_generation]),/binding_immutable/);
  await run();assert.equal((await notices('DEDUP-RESTART')).length,1,'queued old generation did not consume or announce the new one');
  await broadcast('DEDUP-RESTART',{eventId:randomUUID()});await run();assert.equal((await notices('DEDUP-RESTART')).length,1,'arbitrary event tag creates no separate generic start identity');
  await db.exec("update public.watch_party_rooms set is_active=false where party_id='DEDUP-RESTART';update public.watch_party_rooms set is_active=true where party_id='DEDUP-RESTART'");
  await as(actors.host,()=>db.exec("select public.join_watch_party_room_session('DEDUP-RESTART')"));await publish('DEDUP-RESTART');await run();
  assert.equal((await notices('DEDUP-RESTART')).length,2,'a genuinely new room generation can announce again');
  for(const role of ['anon','authenticated','service_role']){
   assert.equal((await one("select has_table_privilege($1,'private.room_start_notification_deliveries','insert') value",[role])).value,false);
   assert.equal((await one("select has_function_privilege($1,'public.prepare_notification_activity_pre_room_start(uuid,uuid)','execute') value",[role])).value,false);
  }
  t.diagnostic('Actual producer+HTTP worker, canonical sessions/preferences, provider outcome transport double only. Native multi-connection schedules are a separate required proof.');
 }finally{await db.close();}
});
