import assert from 'node:assert/strict';
import test from 'node:test';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';

test('discovery notification copy resolves exact public creator and subject after real authorization', {timeout:180000}, async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
 const a='ed110000-0000-4000-8000-000000000001',b='ed110000-0000-4000-8000-000000000002',viewer='ed110000-0000-4000-8000-000000000003';
 const v1='ed111000-0000-4000-8000-000000000001',v2='ed111000-0000-4000-8000-000000000002',event='ed112000-0000-4000-8000-000000000001';
 const one=async(sql,params=[])=>(await db.query(sql,params)).rows[0];
 const plans=async(source,kind)=>(await db.query(`select e.id,private.resolve_notification_activity(e) plan,
   private.resolve_discovery_notification_before_subject_context(e) old_plan from public.notification_activity_events e
   where source_id=$1 and event_kind=$2 order by created_at,id`,[source,kind])).rows;
 try {
  await db.exec(`insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values
   ('${a}',false,false,now()),('${b}',false,false,now()),('${viewer}',false,false,now());
   insert into public.user_profiles(user_id,username,display_name) values
   ('${a}','creator_a','Rachi'),('${b}','creator_b','Rachi'),('${viewer}','viewer_c','Viewer') on conflict(user_id) do update set username=excluded.username,display_name=excluded.display_name;
   insert into public.channel_followers(channel_user_id,follower_user_id) values('${a}','${viewer}'),('${b}','${viewer}');`);
  for(const [id,owner,title] of [[v1,a,'Chicago at Night'],[v2,b,'Lakefront Morning']]){
   await db.query(`insert into public.videos(id,owner_id,title,visibility,storage_provider,storage_bucket,
    storage_object_key,storage_path,mime_type,file_size_bytes) values($1,$2,$3,'public','cloudflare_r2',
    'chillywood-media-origin',$4,$4,'video/mp4',1024)`,[id,owner,title,`${owner}/${id}/source.mp4`]);
   await db.query("update public.videos set scan_status='clean',scan_provider='fixture',scanned_at=now() where id=$1",[id]);
  }
  let first=(await plans(v1,'public_upload'))[0],second=(await plans(v2,'public_upload'))[0];
  assert.equal(first.old_plan.title,'New public upload','negative control reproduces screenshot copy');
  assert.equal(first.plan.title,'Rachi (@creator_a) posted a video');
  assert.equal(second.plan.title,'Rachi (@creator_b) posted a video','same display names retain exact handles');
  assert.equal(first.plan.body,'Chicago at Night');assert.equal(second.plan.body,'Lakefront Morning');
  assert.equal(first.plan.target_route,'/player/[id]');assert.equal(first.plan.target_entity_id,v1);
  assert.deepEqual(first.plan.target_context.display_context,{version:1,creator_id:a,creator_display_name:'Rachi (@creator_a)',target_id:v1,subject_title:'Chicago at Night'});
  await db.query(`update public.notification_activity_events set context=context||'{"creator_name":"Forged","content_title":"Forged"}' where id=$1`,[first.id]);
  assert.equal((await plans(v1,'public_upload'))[0].plan.body,'Chicago at Night','untrusted context cannot override database subject');
  await db.query("update public.videos set title=E'Latest\\nTitle' where id=$1",[v1]);
  first=(await plans(v1,'public_upload'))[0];assert.equal(first.plan.body,'Latest Title','delivery uses current eligible source label');
  assert.equal((await plans(v1,'public_upload')).length,1,'copy edits do not enqueue duplicate uploads');
  await db.query("update public.user_profiles set profile_access_visibility='private' where user_id=$1",[a]);
  assert.equal((await plans(v1,'public_upload'))[0].plan.title,'Creator unavailable posted a video','worker does not disclose private profile names');
  await db.query("update public.user_profiles set profile_access_visibility='public',display_name='' where user_id=$1",[a]);
  assert.equal((await plans(v1,'public_upload'))[0].plan.title,'@creator_a posted a video','empty name uses exact public handle');
  await db.query("update public.user_profiles set display_name=E'Rachi\\nNow'||chr(8238) where user_id=$1",[a]);
  assert.equal((await plans(v1,'public_upload'))[0].plan.title,'Rachi Now (@creator_a) posted a video','control and bidi bytes cannot forge a second message');
  await db.query("update public.videos set visibility='draft' where id=$1",[v1]);
  assert.equal((await plans(v1,'public_upload'))[0].plan.eligible,false,'private source is suppressed before copy resolution');
  await db.query("update public.videos set visibility='public' where id=$1",[v1]);
  await db.query('insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id) values($1,$2,$1)',[viewer,a]);
  assert.equal((await plans(v1,'public_upload'))[0].plan.eligible,false,'recipient block still suppresses all identity/title disclosure');
  await db.query('delete from public.channel_audience_blocks where channel_user_id=$1',[viewer]);
  await db.query("update public.user_profiles set display_name='Rachi' where user_id=$1",[a]);
  await db.exec(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,discovery_visibility,discovery_title)
    values('CONTEXT-STAGE','${a}','live','public','Chicago Live');
    update public.watch_party_rooms set discovery_started_at=now() where party_id='CONTEXT-STAGE';`);
  const stage=(await plans('CONTEXT-STAGE','followed_creator_live'))[0].plan;
  assert.equal(stage.title,'Rachi (@creator_a) is live');assert.equal(stage.body,'Chicago Live. Open to check access.');
  assert.equal(stage.target_route,'/watch-party/live-stage/[partyId]');assert.equal(stage.target_entity_id,'CONTEXT-STAGE');
  await db.exec(`insert into public.room_broadcast_sessions(id,source_type,source_room_id,host_user_id,channel_user_id,broadcast_status,
    hls_playback_url,playback_url_status,rights_status,access_type,is_publicly_watchable,is_spectator_playback_enabled,requires_premium,requires_ticket,metadata)
    values('ed117000-0000-4000-8000-000000000001','watch_party_room','CONTEXT-STAGE','${a}','${a}','active_later',
    'https://example.invalid/discovery.m3u8','public_safe_available','creator_owned','public_free',true,true,false,false,'{"d7f_public_safe_approved":true}');
    insert into public.spectator_hls_playback_records(id,broadcast_session_id,source_room_id,host_user_id,visibility,
    playback_status,playlist_path,rights_status,access_type,is_publicly_watchable,is_spectator_playback_enabled,requires_premium,requires_ticket)
    values('ed118000-0000-4000-8000-000000000001','ed117000-0000-4000-8000-000000000001','CONTEXT-STAGE','${a}',
    'public','live','discovery/index.m3u8','creator_owned','public_free',true,true,false,false);`);
  const broadcast=(await plans('ed117000-0000-4000-8000-000000000001','followed_creator_live'))[0].plan;
  assert.equal(broadcast.body,'Chicago Live. Open to check access.');
  assert.equal(broadcast.target_entity_id,'CONTEXT-STAGE');
  await db.exec(`update public.spectator_hls_playback_records set playback_status='ended' where id='ed118000-0000-4000-8000-000000000001';
    insert into public.creator_replay_library_items(id,owner_user_id,source_type,broadcast_session_id,title,visibility,rights_status,save_status,playback_record_id)
    values('ed119000-0000-4000-8000-000000000001','${a}','watch_party_live','ed117000-0000-4000-8000-000000000001',
    'Friday Replay','public','creator_owned','processing_replay','ed118000-0000-4000-8000-000000000001');
    update public.creator_replay_library_items set save_status='ready' where id='ed119000-0000-4000-8000-000000000001';`);
  const replay=(await plans('ed119000-0000-4000-8000-000000000001','replay_later'))[0].plan;
  assert.equal(replay.title,'Rachi (@creator_a) · Replay ready');
  assert.equal(replay.body,'Friday Replay. Open to check playback availability.');
  assert.equal(replay.deep_link,'/player/replay/ed119000-0000-4000-8000-000000000001');
  await db.exec(`insert into public.creator_events(id,host_user_id,event_title,event_type,status,visibility,starts_at,reminder_ready)
   values('${event}','${a}','Friday Premiere','live_first','scheduled','public',now()+interval '10 minutes',true);
   insert into public.event_reminders(event_id,user_id) values('${event}','${viewer}');`);
  const upcoming=(await plans(event,'event_starts_soon')).find(r=>r.plan.eligible).plan;
  assert.equal(upcoming.title,'Starting soon · Rachi (@creator_a)');assert.equal(upcoming.body,'Friday Premiere starts soon.');
  assert.equal(upcoming.target_route,'/event/[eventId]');assert.equal(upcoming.target_entity_id,event);
  await db.query("update public.creator_events set event_title='Updated Premiere' where id=$1",[event]);
  const updates=await plans(event,'creator_event_updated');
  assert.equal(updates.find(r=>r.plan.eligible).plan.body,'Updated Premiere has changed. Open for the latest details.');
  assert.equal((await plans(event,'event_starts_soon')).filter(r=>r.plan.eligible).length,1,'only current revision remains eligible');
  await db.query("update public.creator_events set status='canceled' where id=$1",[event]);
  const cancel=(await plans(event,'creator_event_canceled')).find(r=>r.plan.eligible).plan;
  assert.equal(cancel.body,'Updated Premiere was canceled.');
  assert.equal(cancel.title,'Event canceled · Rachi (@creator_a)');
  await db.query("update public.creator_events set visibility='private' where id=$1",[event]);
  assert.equal((await plans(event,'creator_event_canceled')).filter(r=>r.plan.eligible).length,0);
  const social=async(kind)=>(await one(`select private.resolve_notification_activity(e) plan from public.notification_activity_events e
    where event_kind=$1 and actor_user_id=$2 order by created_at desc limit 1`,[kind,a]))?.plan;
  await db.query('insert into public.channel_followers(channel_user_id,follower_user_id) values($1,$2)',[b,a]);
  let follow=await social('social_follow');
  assert.equal(follow.body,'Rachi (@creator_a) followed your Platform.');
  assert.equal(follow.target_entity_id,a);assert.equal(follow.target_route,'/profile/[userId]');
  await db.exec(`insert into public.user_friendships(user_low_id,user_high_id,requested_by_user_id,status,responded_at,actioned_by_user_id)
    values('${a}','${viewer}','${a}','active',now(),'${a}');
    insert into public.titles(id,title,is_published,status) values('ed113000-0000-4000-8000-000000000001','Circle Premiere',true,'published');
    update public.user_profiles set shares_visibility='public' where user_id='${a}';
    insert into public.user_content_relationships(user_id,title_id,relationship_type)
    values('${a}','ed113000-0000-4000-8000-000000000001','share');`);
  assert.equal((await social('circle_added')).body,"Rachi (@creator_a) added you to their Chi'lly Circle.");
  const shared=await social('content_shared');
  assert.equal(shared.body,'Rachi (@creator_a) shared Circle Premiere.');
  assert.equal(shared.target_entity_id,'ed113000-0000-4000-8000-000000000001');
  await db.exec(`insert into auth.sessions(id,user_id) values('ed116000-0000-4000-8000-000000000001','${a}');
    select set_config('request.jwt.claims','{"role":"authenticated","sub":"${a}","session_id":"ed116000-0000-4000-8000-000000000001"}',false);
    insert into public.chat_threads(id,participant_pair_key,created_by)
    values('ed114000-0000-4000-8000-000000000001','${a}::${viewer}','${a}');
    insert into public.chat_thread_members(thread_id,user_id) values
    ('ed114000-0000-4000-8000-000000000001','${a}'),('ed114000-0000-4000-8000-000000000001','${viewer}');
    insert into public.chat_messages(id,thread_id,sender_user_id,body)
    values('ed115000-0000-4000-8000-000000000001','ed114000-0000-4000-8000-000000000001','${a}','PRIVATE PREVIEW MUST NOT LEAK');`);
  await db.exec("select set_config('request.jwt.claims','{}',false)");
  const chat=await social('chat_message');
  const oldChat=await one(`select private.resolve_social_notification_before_subject_context(e) plan
    from public.notification_activity_events e where event_kind='chat_message' and actor_user_id=$1`,[a]);
  assert.equal(oldChat.plan.body,'You have a new message.','negative control reproduces the obsolete pgTAP copy expectation');
  assert.equal(chat.body,"Rachi (@creator_a) sent you a Chi'lly Chat message.");
  assert.equal(chat.target_entity_id,'ed114000-0000-4000-8000-000000000001');
  assert.equal(chat.target_context.messageId,'ed115000-0000-4000-8000-000000000001');
  assert.ok(!JSON.stringify(chat).includes('PRIVATE PREVIEW'));
  await db.query("update public.user_profiles set profile_access_visibility='private' where user_id=$1",[a]);
  assert.equal((await social('chat_message')).body,"Member unavailable sent you a Chi'lly Chat message.");
  await db.query("update public.user_profiles set profile_access_visibility='public' where user_id=$1",[a]);
  await db.query("update auth.users set banned_until=now()+interval '1 hour' where id=$1",[a]);
  assert.equal((await plans(v1,'public_upload'))[0].plan.eligible,false,'restricted creator suppressed');
  await db.query('update auth.users set banned_until=null where id=$1',[a]);
  await db.query("insert into public.account_deletion_requests(user_id,status,restore_deadline) values($1,'scheduled',now()+interval '1 day')",[a]);
  assert.equal((await plans(v1,'public_upload'))[0].plan.eligible,false,'deleted/scheduled creator suppressed');
  assert.equal((await social('chat_message')).eligible,false,'deleted sender not disclosed');
  await db.query('delete from public.account_deletion_requests where user_id=$1',[a]);
  await db.query('delete from public.user_profiles where user_id=$1',[a]);
  assert.equal((await plans(v1,'public_upload'))[0].plan.title,'Creator unavailable posted a video','missing profile never guesses a display name');
  // Normal outbox materialization, no push transport or provider receipt.
  for(const row of (await db.query('select public.claim_notification_activity_batch(20) claim')).rows){
   await db.query('select public.prepare_notification_activity($1,$2)',[row.claim.eventId,row.claim.leaseToken]);
  }
  const notice=await one('select title,body,target_entity_id from public.notifications where notification_type=$1 and target_entity_id=$2',['public_upload',v2]);
  assert.deepEqual(notice,{title:'Rachi (@creator_b) posted a video',body:'Lakefront Morning',target_entity_id:v2});
  for(const role of ['anon','authenticated','service_role']){
   assert.equal((await one("select has_function_privilege($1,'private.resolve_discovery_notification_before_subject_context(public.notification_activity_events)','EXECUTE') allowed",[role])).allowed,false);
   for(const fn of ['resolve_social_notification_before_subject_context','resolve_seat_notification_before_subject_context']) assert.equal((await one(`select has_function_privilege($1,'private.${fn}(public.notification_activity_events)','EXECUTE') allowed`,[role])).allowed,false);
   assert.equal((await one("select has_function_privilege($1,'private.notification_subject_label(text,integer)','EXECUTE') allowed",[role])).allowed,false);
  }
 } finally {await db.close();}
});
