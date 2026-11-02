import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabase } from './helpers/database-runtime-authority-fixture.mjs';
import { seedLiveRoomActor } from './helpers/live-room-authority-fixture.mjs';

test('per-person preferences and confirmed join notices enforce opt-in, identity, current audience and session', { timeout: 180000 }, async () => {
  const { db } = await createDatabase({ includeHeldStudio: true, applyRepair: true, repairInMigrationOrder: true, implicitApiGrants: false });
  const user = n => `ed310000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const session = n => `ed311000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const host = user(1), actor = user(2), friend = user(3), follower = user(4), outsider = user(5);
  const as = async n => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(n ? { role: 'authenticated', sub: user(n), session_id: session(n) } : { role: 'service_role' })]); await db.exec(n ? 'set role authenticated' : 'reset role'); };
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const read = async () => (await one('select public.read_person_notification_preferences($1) value', [actor])).value;
  const save = async (live, party, joined, revision) => (await one('select public.set_person_notification_preferences($1,$2,$3,$4,$5) value', [actor, live, party, joined, revision])).value;
  const notices = async () => { await as(0); await db.exec('set role service_role'); const result = (await db.query("select e.*,pg_temp.resolve_join_fixture(e.id) plan from public.notification_activity_events e where event_kind='live_room_member_joined' order by recipient_user_id,created_at")).rows; await as(0); return result; };
  const publish = async party => {
    await as(0); const r=await one('select room_generation,host_settings_revision from public.watch_party_rooms where party_id=$1',[party]);
    assert.equal((await one('select public.publish_live_stage_discovery_current($1,$2,$3,$4,$5) value',[party,host,session(1),r.room_generation,r.host_settings_revision])).value,true);
  };
  try {
    await as(0);
    // Test-only invocation bridge retains the real worker's configured role;
    // no production resolver grants or authorization functions are changed.
    await db.exec(`create function pg_temp.resolve_join_fixture(p_id uuid) returns jsonb language sql security definer set search_path='' as $$
      select private.resolve_notification_activity(e) from public.notification_activity_events e where e.id=p_id $$;
      grant execute on function pg_temp.resolve_join_fixture(uuid) to service_role;`);
    for (let n = 1; n <= 5; n++) {
      await db.query("insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at,aud,role) values($1,false,false,now(),'authenticated','authenticated')", [user(n)]);
      await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [session(n), user(n)]);
      await db.query('insert into public.user_profiles(user_id,username,display_name) values($1,$2,$3) on conflict(user_id) do update set username=excluded.username,display_name=excluded.display_name', [user(n), `member_${n}`, n === 2 ? 'Exact Member' : `Person ${n}`]);
      await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
        select $1::uuid,public.wave1_sha256($1::text),document_key,version,market,'member',capability,$2,'service_reconciliation'
        from public.wave1_legal_document_versions where active and market='UNITED_STATES' and capability='account'`, [user(n), session(n)]);
    }
    await seedLiveRoomActor(db,{id:host,session:session(1)});
    await db.query(`insert into public.user_friendships(user_low_id,user_high_id,requested_by_user_id,status,responded_at,actioned_by_user_id)
      values($1,$2,$1,'active',now(),$1)`, [actor, friend]);
    await db.query('insert into public.channel_followers(channel_user_id,follower_user_id) values($1,$2)', [actor, follower]);
    await as(3);
    assert.deepEqual(await read(), { actorUserId: actor, liveStarts: null, watchPartyStarts: null, joinedLive: false, revision: 0, following: false, circle: true });
    let saved = await save(false, true, true, 0);
    assert.equal(saved.revision, 1); assert.equal(saved.joinedLive, true);
    await assert.rejects(save(true, true, false, 0), /person_notification_conflict/);
    assert.equal((await read()).joinedLive, true, 'stale update cannot overwrite newer preference');
    await assert.rejects(db.query('update public.person_notification_preferences set joined_live_enabled=false'), /permission denied/);
    await as(4);
    await assert.rejects(db.query('select * from public.person_notification_preferences'), /permission denied/, 'no direct table reads can expose another viewer preferences');
    await save(null, null, true, 0);
    await as(1); await save(null, null, true, 0);
    await as(0);
    await db.query(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,is_active,join_policy,content_access_rule,discovery_visibility,discovery_title,created_at,started_at,discovery_started_at)
      values('PERSON-JOIN',$1,'live',true,'open','open','public','Exact Room',now()-interval '1 minute',now()-interval '1 minute',now()-interval '1 minute')`, [host]);
    await as(1); await db.exec("select public.join_watch_party_room_session('PERSON-JOIN','Exact Host')");
    await publish('PERSON-JOIN');
    await as(2); await db.exec("select public.join_watch_party_room_session('PERSON-JOIN','Exact Member')");
    await new Promise(resolve=>setTimeout(resolve,11000));
    assert.equal((await notices()).length, 0, 'insert alone is not confirmed attendance');
    await as(0);
    await db.exec(`create function pg_temp.reject_join_enqueue() returns trigger language plpgsql as $$
      begin raise exception 'fixture_enqueue_failure'; end $$;
      create trigger fixture_reject_join before insert on public.notification_activity_events
        for each row when(new.event_kind='live_room_member_joined') execute function pg_temp.reject_join_enqueue();`);
    await as(2);
    await assert.rejects(db.exec("select public.heartbeat_watch_party_room_session('PERSON-JOIN','active',false,false)"), /fixture_enqueue_failure/);
    await as(0);
    assert.equal((await one('select count(*)::int n from private.live_room_join_qualifications')).n, 0, 'failed fanout rolls back qualification atomically');
    await db.exec('drop trigger fixture_reject_join on public.notification_activity_events');
    await as(2); await db.exec("select public.heartbeat_watch_party_room_session('PERSON-JOIN','active',false,false)");
    let rows = (await notices()).filter(n => n.plan.eligible);
    assert.deepEqual(rows.map(n => n.recipient_user_id), [host, friend], 'host opted in; accepted Circle opted in; follower-only opt-in cannot disclose attendance');
    assert.ok(rows.every(n => n.plan.title.includes('Exact Member (@member_2)') && n.plan.body === 'Exact Room'));
    assert.ok(rows.every(n => n.plan.target_entity_id === 'PERSON-JOIN'));
    assert.ok(!rows.some(n => n.recipient_user_id === outsider));
    await as(0);
    assert.equal((await one('select count(*)::int n from private.live_room_join_qualifications')).n, 1, 'successful retry consumes one lifecycle qualification');
    await db.exec(`create trigger fixture_reject_join before insert on public.notification_activity_events
      for each row when(new.event_kind='live_room_member_joined') execute function pg_temp.reject_join_enqueue();`);
    await db.query(`insert into public.user_friendships(user_low_id,user_high_id,requested_by_user_id,status,responded_at,actioned_by_user_id)
      values($1,$2,$1,'active',now(),$1)`, [actor, outsider]);
    await as(5); await save(null, null, true, 0);
    await as(2);
    await assert.rejects(db.exec('delete from private.live_room_join_qualifications'), /permission denied/, 'caller cannot clear qualification to replay old attendance');
    await assert.rejects(db.query('insert into private.live_room_join_qualifications(generation,publication_hash,actor_user_id) values(gen_random_uuid(),\'forged\',$1)', [actor]), /permission denied/, 'caller cannot forge a qualification');
    await db.exec("select public.heartbeat_watch_party_room_session('PERSON-JOIN','active',false,false)");
    await db.exec("select public.heartbeat_watch_party_room_session('PERSON-JOIN','reconnecting',false,false)");
    await db.exec("select public.heartbeat_watch_party_room_session('PERSON-JOIN','active',false,false)");
    await db.exec("select public.heartbeat_watch_party_room_session('PERSON-JOIN','active',false,false)");
    assert.equal((await notices()).length, 2, 'repeat/reconnect heartbeats do not attempt fanout or notify newly opted-in Circle members');
    await as(0); await db.exec('drop trigger fixture_reject_join on public.notification_activity_events');
    await db.query('delete from public.person_notification_preferences where user_id=$1', [outsider]);
    await db.query('delete from public.user_friendships where user_low_id=$1 and user_high_id=$2', [actor, outsider]);
    await as(0); await db.exec('set role service_role');
    for (const claim of (await db.query('select public.claim_notification_activity_batch(50) value')).rows) {
      await db.query('select public.prepare_notification_activity($1,$2)', [claim.value.eventId, claim.value.leaseToken]);
    }
    await as(0);
    const materialized = await one("select id from public.notifications where user_id=$1 and notification_type='live_room_member_joined'", [friend]);
    assert.ok(materialized, 'actual worker preparation materializes exact attendance inbox item');
    await as(3);
    let display = (await one('select public.read_my_notification_display_context($1) value', [[materialized.id]])).value;
    assert.equal(display.items[0].creatorName, 'Exact Member (@member_2)', 'hydration identifies joining member, never substitutes room host');
    assert.equal(display.items[0].targetTitle, 'Exact Room');
    await as(1); let hostSetting = await read(); hostSetting = await save(null, null, false, hostSetting.revision);
    assert.deepEqual((await notices()).filter(n => n.plan.eligible).map(n => n.recipient_user_id), [friend], 'host has no opt-in override');
    await as(1); await save(null, null, true, hostSetting.revision);
    await as(0); await db.query('insert into public.notification_preferences(user_id,circle_activity_enabled) values($1,false) on conflict(user_id) do update set circle_activity_enabled=false', [friend]);
    assert.deepEqual((await notices()).filter(n => n.plan.eligible).map(n => n.recipient_user_id), [host], 'global Circle switch remains authoritative over per-person ON');
    await db.query('update public.notification_preferences set circle_activity_enabled=true where user_id=$1', [friend]);
    await db.query("update public.user_friendships set status='pending' where user_low_id=$1 and user_high_id=$2", [actor, friend]);
    assert.deepEqual((await notices()).filter(n => n.plan.eligible).map(n => n.recipient_user_id), [host], 'pending friendship is not attendance authorization');
    await db.query("update public.user_friendships set status='active' where user_low_id=$1 and user_high_id=$2", [actor, friend]);
    await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [session(2)]);
    assert.equal((await notices()).filter(n => n.plan.eligible).length, 0, 'revoked actor session suppresses dispatch');
    await db.query('update auth.sessions set not_after=null where id=$1', [session(2)]);
    await as(2); await db.exec("select public.heartbeat_watch_party_room_session('PERSON-JOIN','active',false,false)");
    assert.equal((await notices()).length, 2, 'repeated heartbeat cannot create another candidate for the same opt-in and generation');
    await as(3); saved = await save(false, true, false, saved.revision);
    assert.equal((await notices()).filter(n => n.plan.eligible).length, 1, 'opt-out is rechecked at dispatch');
    await as(3); await save(false, true, true, saved.revision);
    await as(0); await db.exec("update public.watch_party_rooms set discovery_visibility='private' where party_id='PERSON-JOIN'");
    rows = (await notices()).filter(n => n.plan.eligible);
    assert.deepEqual(rows.map(n => n.recipient_user_id), [host], 'private room excludes Circle friend who is not a member');
    await as(3);
    display = (await one('select public.read_my_notification_display_context($1) value', [[materialized.id]])).value;
    assert.equal(display.items[0].resolution, 'unavailable', 'historical labels disappear when current private room audience denies access');
    assert.equal(display.items[0].creatorName, null); assert.equal(display.items[0].targetTitle, null);
    await as(0);
    await db.query(`insert into public.watch_party_room_memberships(party_id,user_id,role,stage_role,membership_state,joined_at,last_seen_at,mic_enabled,camera_enabled)
      values('PERSON-JOIN',$1,'viewer','listener','active',now(),now(),false,false)`, [friend]);
    await db.query("update public.user_profiles set profile_access_visibility='private' where user_id=$1", [actor]);
    assert.deepEqual((await notices()).filter(n => n.plan.eligible).map(n => n.recipient_user_id), [host, friend], 'authorized private-room member and accepted Circle can receive private-profile attendance; host uses authorized roster');
    await as(3);
    display = (await one('select public.read_my_notification_display_context($1) value', [[materialized.id]])).value;
    assert.equal(display.items[0].resolution, 'unavailable', 'current renewed eligibility cannot resurrect a terminally withdrawn attendance receipt');
    assert.equal(display.items[0].creatorName, null); assert.equal(display.items[0].targetTitle, null);
    await as(0); await db.query("update public.user_profiles set profile_access_visibility='public' where user_id=$1", [actor]);
    await db.query("delete from public.watch_party_room_memberships where party_id='PERSON-JOIN' and user_id=$1", [friend]);
    await db.query('insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id) values($1,$2,$1)', [host, actor]);
    assert.equal((await notices()).filter(n => n.plan.eligible).length, 0, 'current block suppresses host notice');
    await db.query('delete from public.channel_audience_blocks where channel_user_id=$1', [host]);
    await db.exec("update public.watch_party_rooms set is_active=false where party_id='PERSON-JOIN'");
    assert.equal((await notices()).filter(n => n.plan.eligible).length, 0, 'ended generation cannot deliver');
    const ended = await one("select notification_join_generation,notification_join_started_at from public.watch_party_rooms where party_id='PERSON-JOIN'");
    await db.exec("update public.watch_party_rooms set notification_join_generation=gen_random_uuid(),notification_join_started_at=now()-interval '1 year' where party_id='PERSON-JOIN'");
    assert.deepEqual(await one("select notification_join_generation,notification_join_started_at from public.watch_party_rooms where party_id='PERSON-JOIN'"), ended, 'server trigger ignores caller-supplied generation and cutoff');
    await db.exec("update public.watch_party_rooms set is_active=true,started_at=now() where party_id='PERSON-JOIN'");
    await as(1); await db.exec("select public.join_watch_party_room_session('PERSON-JOIN','Exact Host')");
    // The restarted room deliberately remains private: authorized host/member
    // attendance is separate from public discovery publication.
    await as(2); await db.exec("select public.heartbeat_watch_party_room_session('PERSON-JOIN','active',false,false)");
    assert.equal((await notices()).length, 2, 'fresh old membership after restart is not a new attendance event');
    await as(0);
    await db.query("delete from public.watch_party_room_memberships where party_id='PERSON-JOIN' and user_id=$1", [actor]);
    await db.query(`insert into public.watch_party_room_memberships(party_id,user_id,role,stage_role,membership_state,joined_at,last_seen_at,mic_enabled,camera_enabled,display_name)
      values('PERSON-JOIN',$1,'viewer','listener','active',now(),now(),false,false,'Exact Member')`, [actor]);
    await as(2); await db.exec("select public.heartbeat_watch_party_room_session('PERSON-JOIN','active',false,false)");
    assert.equal((await notices()).length, 2, 'new generation still waits for sustained authenticated membership');
    await new Promise(resolve => setTimeout(resolve, 11000));
    await as(2); await db.exec("select public.heartbeat_watch_party_room_session('PERSON-JOIN','active',false,false)");
    rows = await notices();
    assert.equal(rows.length, 4, 'genuine subsequent room lifecycle can notify again without a forever room+actor lockout');
    assert.equal(new Set(rows.map(n => n.context.generation)).size, 2);
    assert.equal((await one('select count(*)::int n from private.live_room_join_qualifications')).n, 2, 'new lifecycle owns a new qualification');
    await db.query('update public.person_notification_preferences set joined_live_enabled=false where actor_user_id=$1', [actor]);
    await db.query(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,is_active,join_policy,content_access_rule,discovery_visibility,created_at,started_at,discovery_started_at)
      values('PERSON-NO-AUDIENCE',$1,'live',true,'open','open','public',now()-interval '1 minute',now()-interval '1 minute',now()-interval '1 minute')`, [host]);
    await as(1); await db.exec("select public.join_watch_party_room_session('PERSON-NO-AUDIENCE','Exact Host')");
    await publish('PERSON-NO-AUDIENCE');
    await as(2); await db.exec("select public.join_watch_party_room_session('PERSON-NO-AUDIENCE','Exact Member')");
    await new Promise(resolve=>setTimeout(resolve,11000));
    await as(2); await db.exec("select public.heartbeat_watch_party_room_session('PERSON-NO-AUDIENCE','active',false,false)");
    await as(0);
    assert.equal((await one('select count(*)::int n from private.live_room_join_qualifications')).n, 3, 'zero-recipient attendance is still consumed');
    await db.query('update public.person_notification_preferences set joined_live_enabled=true where actor_user_id=$1', [actor]);
    await as(2); await db.exec("select public.heartbeat_watch_party_room_session('PERSON-NO-AUDIENCE','active',false,false)");
    assert.equal((await notices()).length, 4, 'opting in after zero-audience qualification does not announce old attendance');
    // Positive and negative public Party access: discovery metadata alone must
    // never substitute for the recipient's own current Premium entitlement.
    await db.exec(`create function pg_temp.join_recipient_fixture(p_party text,p_actor uuid,p_recipient uuid)
      returns boolean language sql security definer set search_path='' as $$
      select private.live_room_join_recipient_allowed(r,p_actor,p_recipient) from public.watch_party_rooms r where party_id=p_party $$;
      grant execute on function pg_temp.join_recipient_fixture(text,uuid,uuid) to service_role;
      update public.platform_money_kill_switches set state='sandbox_only' where key in ('revenuecat_google_play_enabled','provider_webhooks_enabled');
      insert into public.titles(id,title,video_url,is_published,status) values('ed312000-0000-4000-8000-000000000001','Party Source','https://example.invalid/source.mp4',true,'published');`);
    const premium = async n => {
      const result = await one(`select public.process_revenuecat_premium_event_atomic('revenuecat_google_play',$1,'INITIAL_PURCHASE',$2,
        p.provider_product_id,p.provider_base_plan_id,'sandbox','active',now()-interval '1 minute',now()+interval '1 day',now(),999,'usd',$3,
        'NORMAL','google_play','android',null,p.id,$4) value from public.monetization_products p
        where p.provider='revenuecat_google_play' and p.environment='sandbox' and p.product_type='premium_subscription' and p.status='sandbox'
        order by p.created_at,p.id limit 1`, [`person-join-premium-${n}`, user(n), String(n).repeat(64), `person-join-original-${n}`]);
      assert.equal(result.value.status, 'processed');
    };
    await premium(1);
    await as(1);
    await db.query(`insert into public.watch_party_rooms(party_id,host_user_id,title_id,source_type,source_id,room_type,content_access_rule)
      values('PERSON-PARTY',$1,'ed312000-0000-4000-8000-000000000001','platform_title','ed312000-0000-4000-8000-000000000001','title','premium')`, [host]);
    await db.query("select public.set_party_room_discovery('PERSON-PARTY','public','Exact Party','platform_title','ed312000-0000-4000-8000-000000000001',$1)", [session(1)]);
    await db.exec("select public.join_watch_party_room_session('PERSON-PARTY')");
    const partySetting=await one("select room_generation,host_settings_revision,discovery_title from public.watch_party_rooms where party_id='PERSON-PARTY'");
    await db.query("select public.set_watch_party_room_host_settings('PERSON-PARTY',$1,$2,$3,'open','public',$4,'platform_title','ed312000-0000-4000-8000-000000000001',true)",
      [partySetting.room_generation,partySetting.host_settings_revision,session(1),partySetting.discovery_title]);
    const allowed = async () => { await as(0); await db.exec('set role service_role'); const result = await one("select pg_temp.join_recipient_fixture('PERSON-PARTY',$1,$2) value", [actor, friend]); await as(0); return result.value; };
    assert.equal(await allowed(), false, 'public Party metadata does not bypass missing recipient entitlement');
    await premium(3);
    assert.equal(await allowed(), true, 'same exact source admits opted-in Circle recipient with current finite entitlement');
    await db.query("update public.user_entitlements set expires_at=now()-interval '1 second' where user_id=$1 and entitlement_key='premium'", [friend]);
    assert.equal(await allowed(), false, 'current revoked/expired recipient entitlement suppresses Party attendance');
    const sweep = async () => {
      await as(0); await db.exec('set role service_role');
      await db.exec('select public.claim_notification_activity_batch(1)');
      await as(0);
      return (await one('select count(*)::int n from private.live_room_join_qualifications')).n;
    };
    assert.equal(await sweep(), 2, 'existing worker retires obsolete generation but preserves both current qualifications');
    await db.exec("update private.live_room_join_qualifications set qualified_at=now()-interval '1 year'");
    assert.equal(await sweep(), 2, 'age never expires an active generation and re-enables late opt-in');
    await as(2); await db.exec("select public.heartbeat_watch_party_room_session('PERSON-NO-AUDIENCE','active',false,false)");
    assert.equal((await notices()).length, 4, 'cleanup does not reopen active attendance fanout');
    await db.exec("delete from public.watch_party_rooms where party_id='PERSON-NO-AUDIENCE'");
    assert.equal(await sweep(), 1, 'deleted room loses its orphan qualification');
    await db.exec("update public.watch_party_rooms set is_active=false where party_id='PERSON-JOIN'");
    assert.equal(await sweep(), 0, 'closed room qualification is retired');
    const partyClaim = async id => db.query(`insert into private.live_room_join_qualifications(generation,publication_hash,actor_user_id,party_id)
      select r.notification_join_generation,md5(jsonb_build_array(p.publication_id,p.started_at,p.retired_at)::text),$1,r.party_id
      from public.watch_party_rooms r join private.party_room_discovery_publications p using(party_id) where r.party_id='PERSON-PARTY'`, [id]);
    await partyClaim(actor);
    await db.query("update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}')||'{\"accountDeidentified\":true}'::jsonb where id=$1", [actor]);
    assert.equal(await sweep(), 0, 'canonical account purge/de-identification removes retained actor identity');
    await db.query("insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values($1,false,false,now())", [user(6)]);
    await partyClaim(user(6));
    await db.query('delete from auth.users where id=$1', [user(6)]);
    assert.equal(await sweep(), 0, 'deleted auth account leaves no qualification history');
    await premium(4); await as(4);
    await db.exec("select public.join_watch_party_room_session('PERSON-PARTY')");
    await new Promise(resolve => setTimeout(resolve, 11000));
    await db.exec("select public.heartbeat_watch_party_room_session('PERSON-PARTY','active',false,false)");
    await as(0);
    assert.equal((await one('select count(*)::int n from private.live_room_join_qualifications')).n, 1, 'actual confirmed Party attendee qualifies before retirement');
    await as(1);
    await db.query('select public.set_person_notification_preferences($1,null,null,true,0)', [follower]);
    for (const visibility of ['circle', 'private']) {
      await as(1);
      const setting=await one("select room_generation,host_settings_revision from public.watch_party_rooms where party_id='PERSON-PARTY'");
      await db.query("select public.set_watch_party_room_host_settings('PERSON-PARTY',$1,$2,$3,'open',$4,'Exact Party','platform_title','ed312000-0000-4000-8000-000000000001')", [setting.room_generation,setting.host_settings_revision,session(1),visibility]);
      assert.equal(await sweep(), 1, `${visibility} visibility preserves the existing active qualification`);
      await as(4); await db.exec("select public.heartbeat_watch_party_room_session('PERSON-PARTY','active',false,false)");
      assert.equal((await notices()).length, 4, `${visibility} transition does not replay attendance to a late host opt-in`);
    }
    await db.exec("update private.party_room_discovery_publications set publication_id=gen_random_uuid() where party_id='PERSON-PARTY'");
    assert.equal(await sweep(), 0, 'replaced publication retires the old exact publication claim');
    await partyClaim(follower);
    await db.exec("update private.party_room_discovery_publications set retired_at=now() where party_id='PERSON-PARTY'");
    assert.equal(await sweep(), 0, 'retired publication no longer retains attendance claims');
    await as(4); await db.exec("select public.heartbeat_watch_party_room_session('PERSON-PARTY','active',false,false)");
    await as(0);
    assert.equal((await one('select count(*)::int n from private.live_room_join_qualifications')).n, 0, 'retired publication cannot recreate a pruned claim on heartbeat');
    await db.query(`insert into private.live_room_join_qualifications(generation,publication_hash,actor_user_id,party_id)
      select gen_random_uuid(),'obsolete',$1,'deleted-fixture-room' from generate_series(1,105)`, [follower]);
    assert.equal(await sweep(), 5, 'worker cleanup is bounded to one hundred obsolete claims per batch');
    assert.equal(await sweep(), 0, 'later existing worker batch drains remaining obsolete claims');
    await as(0); await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [session(3)]); await as(3);
    await assert.rejects(read(), /person_notification_access_required/);
    await as(0);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal((await one("select has_function_privilege($1,'private.enqueue_confirmed_live_room_join()','execute') allowed", [role])).allowed, false);
      assert.equal((await one("select has_table_privilege($1,'public.person_notification_preferences','select') allowed", [role])).allowed, false);
      assert.equal((await one("select has_table_privilege($1,'private.live_room_join_qualifications','select,insert,update,delete') allowed", [role])).allowed, false);
    }
  } finally { await db.close(); }
});
