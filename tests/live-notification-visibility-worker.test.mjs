import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabase } from './helpers/database-runtime-authority-fixture.mjs';
import { seedLiveRoomAuthority, liveFixtureActors as actors, liveFixtureTitle, withLiveRoomActor } from './helpers/live-room-authority-fixture.mjs';
import { createNotificationActivityHandler } from '../supabase/functions/_shared/notification-activity-worker.mjs';

test('actual worker/full schema rechecks live privacy at delivery, inbox/count and ended-history boundaries', { timeout: 180000 }, async t => {
  const { db } = await createDatabase({ includeHeldStudio: true, applyRepair: true, repairInMigrationOrder: true, implicitApiGrants: false });
  const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
  const as=(actor,fn,role='authenticated')=>withLiveRoomActor(db,actor,fn,role);
  const events=party=>db.query('select * from public.notification_activity_events where source_id=$1 order by recipient_user_id',[party]);
  const inbox=actor=>as(actor,()=>db.query("select id,title,body,target_entity_id from public.notifications where notification_type in ('followed_creator_live','circle_friend_live') order by id"));
  const count=actor=>as(actor,()=>one("select count(*)::int n from public.notifications where notification_type in ('followed_creator_live','circle_friend_live') and read_at is null and dismissed_at is null"));
  const footprint=actor=>as(actor,async()=>(await one('select public.read_my_live_notification_hint_footprint() value')).value);
  const display=(actor,ids)=>as(actor,async()=>(await one('select public.read_my_notification_display_context($1) value',[ids])).value);
  const publish=async party=> {
    const r=await one('select * from public.watch_party_rooms where party_id=$1',[party]);
    if(r.room_type==='title') return as(actors.host,()=>db.query('select public.set_watch_party_room_host_settings($1,$2,$3,$4,$5,$6,$7,$8,$9,true)',
      [party,r.room_generation,r.host_settings_revision,actors.host.session,r.join_policy,r.discovery_visibility,r.discovery_title,'platform_title',liveFixtureTitle]));
    const value=await as(actors.host,()=>one('select public.publish_live_stage_discovery_current($1,$2,$3,$4,$5) value',
      [party,actors.host.id,actors.host.session,r.room_generation,r.host_settings_revision]),'service_role');
    assert.equal(value.value,true,'real exact-session canonical publisher');
  };
  const scenarioInsert=async(type,insert)=> {
    const attempts=await one("select count(*)::int n from public.abuse_rate_limit_events where actor_user_id=$1 and action_key='watch_party_room_create' and target_key=$2 and created_at>now()-interval '10 minutes'",[actors.host.id,type]);
    if(attempts.n>=5){
      await assert.rejects(insert,/rate_limited/,'real rate limiter remains active between independent scenarios');
      // Advance only this synthetic fixture's old request timestamps; do not
      // replace a gate, alter a policy, or disable its trigger for the tests.
      await db.query("update public.abuse_rate_limit_events set created_at=now()-interval '11 minutes' where actor_user_id=$1 and action_key='watch_party_room_create' and target_key=$2",[actors.host.id,type]);
    }
    await insert();
  };
  const create=async(party,type='live',visibility='public')=> {
    await scenarioInsert(type,()=>db.query(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,join_policy,content_access_rule,discovery_visibility,discovery_title,title_id,source_type,source_id)
      values($1,$2,$3,'open',$4,$5,$6,$7,$8,$7)`,[party,actors.host.id,type,type==='title'?'premium':'open',visibility,`${party} title`,type==='title'?liveFixtureTitle:null,type==='title'?'platform_title':null]));
    assert.equal((await events(party)).rows.length,0,'mere room creation never announces live');
    await as(actors.host,()=>db.query('select public.join_watch_party_room_session($1)',[party]));
    await publish(party);
  };
  const setVisibility=async(party,visibility)=> {
    const r=await one('select * from public.watch_party_rooms where party_id=$1',[party]);
    return as(actors.host,()=>db.query('select public.set_watch_party_room_host_settings($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [party,r.room_generation,r.host_settings_revision,actors.host.session,r.join_policy,visibility,r.discovery_title,
        r.room_type==='title'?'platform_title':r.source_type,r.room_type==='title'?liveFixtureTitle:r.source_id]));
  };
  let beforeReserve=null, provider='ok'; const sent=[],calls=[];
  const rpcNames=new Set(['authorize_notification_activity_worker','claim_notification_activity_batch','prepare_notification_activity',
    'reserve_notification_activity_push','complete_notification_activity_push','finish_notification_activity']);
  const handler=createNotificationActivityHandler({ deadlineMs:10000,adminClient:{async rpc(name,args) {
    assert.ok(rpcNames.has(name));calls.push(name);
    if(name==='reserve_notification_activity_push' && beforeReserve){const f=beforeReserve;beforeReserve=null;await f();}
    try {
      const rows=await as(actors.host,()=>db.query(`select public.${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')}) value`,Object.values(args)),'service_role');
      return {data:name==='claim_notification_activity_batch'?rows.rows.map(r=>r.value):rows.rows[0].value,error:null};
    } catch(error){t.diagnostic(`${name}: ${error.message}`);throw new Error(`${name}: ${error.message}`,{cause:error});}
  }},fetchImpl:async(_url,options)=> {
    sent.push(JSON.parse(options.body));
    return new Response(JSON.stringify({data:provider==='ok'?{status:'ok',id:`ticket-${sent.length}`}:{status:'error',details:{error:provider}}}));
  }});
  const run=async()=>{
    // Isolate this lane from synthetic setup Follow/Circle notices. Their
    // real producers still ran; their delivery is covered by separate suites.
    await db.exec("update public.notification_activity_events set status='suppressed',completed_at=now() where event_kind not in ('followed_creator_live','circle_friend_live') and status='pending'");
    const response=await handler(new Request('https://fixture.invalid/activity',{method:'POST',headers:{'x-chillywood-activity-token':'fixture-worker'}}));assert.equal(response.status,200);return response.json();
  };
  try {
    await seedLiveRoomAuthority(db);
    for(const [name,actor] of Object.entries(actors)) await db.query(`insert into public.user_profiles(user_id,display_name,username) values($1,$2,$3)
      on conflict(user_id) do update set display_name=excluded.display_name,username=excluded.username`,[actor.id,name==='host'?'Exact Host':name,`exact_${name}`]);
    await db.exec("update public.notification_activity_events set status='suppressed',completed_at=now() where event_kind not in ('followed_creator_live','circle_friend_live')");
    await db.exec("insert into public.notification_activity_worker_config(singleton,enabled,token_sha256) values(true,true,encode(extensions.digest('fixture-worker','sha256'),'hex')) on conflict(singleton) do update set enabled=excluded.enabled,token_sha256=excluded.token_sha256");
    for(const [name,actor] of Object.entries(actors).filter(([key])=>['friend','follower'].includes(key))){
      await db.query(`insert into public.wave1_push_installation_ownership(platform,install_id,user_id,account_id,session_generation,ownership_state,revocation_credential_hash,last_operation_key,last_reason)
        values('ios',$1,$2,$2,$3,'ACCOUNT_BOUND',repeat('a',64),'fixture','fixture')`,[`live-${name}`,actor.id,actor.session]);
      await db.query(`insert into public.user_push_tokens(user_id,platform,provider,token,token_hash,token_fingerprint,install_id,session_generation,ownership_state)
        values($1,'ios','expo',$2,$3,$3,$4,$5,'ACCOUNT_BOUND')`,[actor.id,`ExponentPushToken[${name}]`,`live-${name}`,`live-${name}`,actor.session]);
    }
    for(const [party,type] of [['LIVE-SENT','live'],['PARTY-SENT','title']]){
      await create(party,type);const before=sent.length;const outcome=await run();assert.equal(sent.length-before,2,JSON.stringify({party,outcome,calls,events:(await events(party)).rows}));
      assert.ok(sent.slice(before).every(p=>p.title==='Exact Host (@exact_host) is live' && p.body===`${party} title. Open to check access.`));
      await run();assert.equal(sent.length-before,2,'repeated worker cannot duplicate provider delivery');
      const notice=(await inbox(actors.follower)).rows.find(n=>n.body===`${party} title. Open to check access.`);assert.ok(notice);
      const label=(await display(actors.follower,[notice.id])).items[0];
      assert.equal(label.creatorName,'Exact Host (@exact_host)');
      const projection=await one('select discovery_hint_key from public.discovery_feed_items where source_id=$1',[party]);
      assert.equal(label.discoveryHintKey,projection.discovery_hint_key,'canonical display correlation uses the actual authorized projection key');
      const currentFootprint=await footprint(actors.follower);
      assert.ok(currentFootprint.keys.includes(label.discoveryHintKey));
      const actualUnread=await as(actors.follower,()=>one('select count(*)::int n from public.notifications where read_at is null and dismissed_at is null'));
      assert.equal(currentFootprint.unreadCount,actualUnread.n,'same canonical visibility backs the atomic key/count snapshot');
      await setVisibility(party,'private');
      assert.ok(!(await inbox(actors.follower)).rows.some(n=>n.id===notice.id),'raw authenticated SELECT hides newly Off source');
      assert.ok(!(await footprint(actors.follower)).keys.includes(label.discoveryHintKey),'hidden-source footprint cannot disclose its opaque key');
      assert.equal((await display(actors.follower,[notice.id])).items[0].resolution,'unavailable','definer label read cannot bypass the new audience');
      assert.equal((await one('select count(*)::int n from public.notifications where id=$1',[notice.id])).n,1,'audit row is retained');
    }
    assert.equal((await count(actors.follower)).n,0,'unread counts cannot reveal hidden materialized live notices');
    // Negative control executes the old owner-only row policy, then rolls back.
    await db.exec('begin; drop policy notifications_live_current_audience on public.notifications');
    await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:actors.follower.id,session_id:actors.follower.session})]);
    await db.exec('set local role authenticated');
    assert.equal((await one("select count(*)::int n from public.notifications where notification_type='followed_creator_live'")).n,2,'old policy exposes both newly private room announcements');
    await db.exec('rollback');assert.equal((await count(actors.follower)).n,0);

    await create('LIVE-ENDED');await run();
    const ended=(await inbox(actors.follower)).rows.find(n=>n.target_entity_id==='LIVE-ENDED');assert.ok(ended);
    await db.exec("update public.watch_party_rooms set is_active=false where party_id='LIVE-ENDED'");
    assert.ok((await inbox(actors.follower)).rows.some(n=>n.id===ended.id),'already delivered public history is not deleted merely because it ended');
    assert.equal((await display(actors.follower,[ended.id])).items[0].liveState,'ended');

    for(const [party,type] of [['LIVE-RACE','live'],['PARTY-RACE','title']]){
      await create(party,type);const before=sent.length;beforeReserve=()=>setVisibility(party,'private');await run();
      assert.equal(sent.length,before,'privacy changed after materialization but before reservation: no provider disclosure');
      assert.ok(!(await inbox(actors.follower)).rows.some(n=>n.target_entity_id===party));
      assert.ok((await events(party)).rows.some(e=>e.notification_id),'race really crossed materialization, not a no-op fixture');
    }
    for(const [party,mutate,visibility] of [
      ['LIVE-OFF',()=>setVisibility('LIVE-OFF','private'),'public'],
      ['LIVE-CIRCLE',()=>setVisibility('LIVE-CIRCLE','circle'),'public'],
      ['LIVE-STOP',()=>db.exec("update public.watch_party_rooms set is_active=false where party_id='LIVE-STOP'"),'public'],
      ['LIVE-LOST-CIRCLE',()=>db.exec("update public.user_friendships set status='pending'"),'circle'],
    ]){
      await create(party,'live',visibility);const before=sent.length;await mutate();await run();assert.equal(sent.length,before,party);
      assert.ok((await events(party)).rows.every(e=>e.notification_id===null),'queued hidden event cannot materialize in app');
    }
    await db.exec("update public.user_friendships set status='active'");
    await create('LIVE-CIRCLE-SENT','live','circle');
    let circleBefore=sent.length;await run();assert.equal(sent.length-circleBefore,1,'only the current Circle member receives the named start');
    const circleNotice=(await inbox(actors.friend)).rows.find(n=>n.target_entity_id==='LIVE-CIRCLE-SENT');assert.ok(circleNotice);
    await db.exec("update public.user_friendships set status='removed'");
    assert.ok(!(await inbox(actors.friend)).rows.some(n=>n.id===circleNotice.id),'removing Circle membership hides already materialized private-audience text');
    assert.equal((await display(actors.friend,[circleNotice.id])).items[0].resolution,'unavailable');
    assert.equal((await one('select count(*)::int n from public.notifications where id=$1',[circleNotice.id])).n,1,'membership loss retains audit evidence');
    await db.exec("update public.user_friendships set status='active'");
    await setVisibility('LIVE-CIRCLE-SENT','private');circleBefore=sent.length;await run();assert.equal(sent.length,circleBefore,'membership restoration does not replay a delivered lifecycle');
    await as(actors.follower,()=>db.query('select public.set_person_notification_preferences($1,false,true,false,0)',[actors.host.id]));
    await create('LIVE-PREF');let before=sent.length;await run();assert.equal(sent.length-before,1,'per-creator Live OFF suppresses only its follower');
    await create('PARTY-PREF','title');before=sent.length;await run();assert.equal(sent.length-before,2,'independent Watch-Party ON remains effective');
    assert.deepEqual(sent.slice(before).map(p=>[p.to,p.badge]).sort(),[['ExponentPushToken[follower]',2],['ExponentPushToken[friend]',3]].sort(),'service-role badge equals recipient-visible unread history, not all retained audit rows');
    // Definite provider rejection can retry, but preferences are read again at
    // the later lease. Unknown acceptance must never be blindly retried.
    await create('PARTY-RETRY','title');provider='MessageRateExceeded';await run();provider='ok';
    await as(actors.follower,()=>db.query('select public.set_person_notification_preferences($1,false,false,false,1)',[actors.host.id]));
    await setVisibility('PARTY-RETRY','private');
    await db.exec("update public.notification_activity_pushes set retry_after=now()-interval '1 second' where status='retryable'; update public.notification_activity_events set scheduled_at=now()-interval '1 second' where status='pending'");
    before=sent.length;await run();assert.equal(sent.length,before,'retry cannot bypass newer privacy or creator preference');
    // A stale public provider projection must not override its backing room.
    await create('BROADCAST-BACKING');
    await db.query(`insert into public.room_broadcast_sessions(id,source_type,source_room_id,host_user_id,channel_user_id,broadcast_status,hls_playback_url,
      playback_url_status,rights_status,access_type,is_publicly_watchable,is_spectator_playback_enabled,requires_premium,requires_ticket,metadata)
      values('ac519000-0000-4000-8000-000000000001','watch_party_room','BROADCAST-BACKING',$1,$1,'active_later','https://example.invalid/stream.m3u8',
      'public_safe_available','creator_owned','public_free',true,true,false,false,'{"d7f_public_safe_approved":true}')`,[actors.host.id]);
    await db.query(`insert into public.spectator_hls_playback_records(id,broadcast_session_id,source_room_id,host_user_id,visibility,playback_status,playlist_path,
      rights_status,access_type,is_publicly_watchable,is_spectator_playback_enabled,requires_premium,requires_ticket)
      values('ac519001-0000-4000-8000-000000000001','ac519000-0000-4000-8000-000000000001','BROADCAST-BACKING',$1,'public','live','fixture/index.m3u8',
      'creator_owned','public_free',true,true,false,false)`,[actors.host.id]);
    await setVisibility('BROADCAST-BACKING','private');
    const pausedBroadcastRoom=await one("select discovery_visibility,discovery_paused from public.watch_party_rooms where party_id='BROADCAST-BACKING'");
    assert.deepEqual(pausedBroadcastRoom,{discovery_visibility:'public',discovery_paused:true},'legacy Off pauses listing without changing the backing admission audience');
    assert.equal((await one("select private.discovery_notification_source_pre_room_visibility('broadcast','ac519000-0000-4000-8000-000000000001') value")).value.eligible,true,'negative control reproduces stale provider projection authority');
    assert.equal((await one("select private.discovery_notification_source('broadcast','ac519000-0000-4000-8000-000000000001') value")).value.eligible,false);
    before=sent.length;await run();assert.equal(sent.length,before);
    // Existing followers are retained solely as a fixture relationship. The
    // owner opt-in creates no follower/Circle edges and exposes no profile.
    await db.query("insert into public.platform_role_memberships(user_id,role,status) values($1,'owner','active')",[actors.host.id]);
    await db.query("update public.user_profiles set display_name='PRIVATE OWNER PROFILE',username='private_owner',profile_access_visibility='private' where user_id=$1",[actors.host.id]);
    await scenarioInsert('live',()=>db.query("insert into public.watch_party_rooms(party_id,host_user_id,room_type,content_access_rule,discovery_visibility,discovery_title) values('OWNER-LIVE',$1,'live','open','public','Selected Owner Room')",[actors.host.id]));
    await as(actors.host,()=>db.exec("select public.join_watch_party_room_session('OWNER-LIVE','Room-only Owner')"));
    let ownerRoom=await one("select * from public.watch_party_rooms where party_id='OWNER-LIVE'");
    const ownerPublish=()=>as(actors.host,()=>one("select public.publish_live_stage_discovery_current('OWNER-LIVE',$1,$2,$3,$4) value",
      [actors.host.id,actors.host.session,ownerRoom.room_generation,ownerRoom.host_settings_revision]),'service_role');
    assert.equal((await ownerPublish()).value,false,'owner remains hidden without exact room opt-in');
    assert.equal((await events('OWNER-LIVE')).rows.length,0,'no historical/default owner fanout');
    await as(actors.host,()=>db.query("select public.set_watch_party_room_host_settings('OWNER-LIVE',$1,$2,$3,'open','public','Selected Owner Room',null,null,true,true)",
      [ownerRoom.room_generation,ownerRoom.host_settings_revision,actors.host.session]));
    ownerRoom=await one("select * from public.watch_party_rooms where party_id='OWNER-LIVE'");
    assert.equal((await ownerPublish()).value,true);
    before=sent.length;await run();assert.equal(sent.length-before,1,'opt-in does not override follower-specific Live OFF');
    assert.equal(sent.at(-1).title,'Room-only Owner is live');assert.equal(sent.at(-1).body,'Selected Owner Room. Open to check access.');
    assert.doesNotMatch(JSON.stringify(sent.at(-1)),/PRIVATE OWNER PROFILE|private_owner/);
    const ownerNotice=(await inbox(actors.friend)).rows.find(n=>n.target_entity_id==='OWNER-LIVE');assert.ok(ownerNotice);
    assert.equal((await display(actors.friend,[ownerNotice.id])).items[0].creatorName,'Room-only Owner');
    assert.equal((await as(actors.friend,()=>db.query('select display_name,username from public.user_profiles where user_id=$1',[actors.host.id]))).rows.length,0,'room opt-in does not expose owner Profile through its actual RLS reader');
    const ownerSettings=async(paused,consent=false)=>{
      ownerRoom=await one("select * from public.watch_party_rooms where party_id='OWNER-LIVE'");
      await as(actors.host,()=>db.query("select public.set_watch_party_room_host_settings('OWNER-LIVE',$1,$2,$3,'open','public','Selected Owner Room',null,null,true,$4,$5)",
        [ownerRoom.room_generation,ownerRoom.host_settings_revision,actors.host.session,consent,paused]));
      ownerRoom=await one("select * from public.watch_party_rooms where party_id='OWNER-LIVE'");
    };
    await ownerSettings(true);
    assert.ok(!(await inbox(actors.friend)).rows.some(n=>n.id===ownerNotice.id),'pause immediately removes the selected owner-room notice');
    await ownerSettings(false);
    assert.equal((await ownerPublish()).value,false,'resume cannot inherit owner disclosure consent revoked by pause');
    assert.equal((await display(actors.friend,[ownerNotice.id])).items[0].resolution,'unavailable');
    await ownerSettings(false,true);assert.equal((await ownerPublish()).value,true);
    assert.equal((await display(actors.friend,[ownerNotice.id])).items[0].creatorName,'Room-only Owner');
    before=sent.length;await run();assert.equal(sent.length,before,'new exact owner consent does not resend the same lifecycle announcement');
    await db.exec("update public.watch_party_rooms set is_active=false where party_id='OWNER-LIVE'");
    assert.ok(!(await inbox(actors.friend)).rows.some(n=>n.id===ownerNotice.id),'owner opt-in never becomes a permanent ended-history disclosure grant');
    await db.exec("update public.watch_party_rooms set is_active=true where party_id='OWNER-LIVE'");
    assert.ok(!(await inbox(actors.friend)).rows.some(n=>n.id===ownerNotice.id),'same-code restart cannot inherit owner notification consent');
    await setVisibility('OWNER-LIVE','private');
    assert.ok(!(await inbox(actors.friend)).rows.some(n=>n.id===ownerNotice.id));
    assert.equal((await display(actors.friend,[ownerNotice.id])).items[0].resolution,'unavailable');
    await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[actors.follower.session]);
    assert.equal((await count(actors.follower)).n,0,'retired viewer session cannot read live history');
    for(const role of ['anon','authenticated','service_role']) {
      assert.equal((await one("select has_function_privilege($1,'private.live_notification_read_context(uuid,uuid)','execute') value",[role])).value,false);
      assert.equal((await one("select has_function_privilege($1,'public.reserve_notification_activity_push_pre_live_visibility(uuid,uuid,uuid)','execute') value",[role])).value,false);
    }
    t.diagnostic('Full immutable migration chain, actual Edge handler and actual role-bound SQL; provider transport only is a double. Negative controls prove both old private-row leak and stale broadcast visibility. No OS-delivery/recall claim.');
  } finally { await db.close(); }
});
