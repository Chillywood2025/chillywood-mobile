import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabase } from './helpers/database-runtime-authority-fixture.mjs';
import { seedLiveRoomActor, withLiveRoomActor } from './helpers/live-room-authority-fixture.mjs';

test('real live-start outbox distinguishes creation, current public/Circle audience, duplicates and ended rooms', { timeout: 180000 }, async () => {
  const { db } = await createDatabase({ includeHeldStudio: true, applyRepair: true, repairInMigrationOrder: true, implicitApiGrants: false });
  const host = 'ed210000-0000-4000-8000-000000000001';
  const follower = 'ed210000-0000-4000-8000-000000000002';
  const friend = 'ed210000-0000-4000-8000-000000000003';
  const stranger = 'ed210000-0000-4000-8000-000000000004';
  const hostActor = { id: host, session: 'ed211000-0000-4000-8000-000000000001' };
  const publish = async party => {
    await withLiveRoomActor(db, hostActor, () => db.query('select public.join_watch_party_room_session($1)', [party]));
    const r=(await db.query('select room_generation,host_settings_revision from public.watch_party_rooms where party_id=$1',[party])).rows[0];
    const result=await withLiveRoomActor(db,hostActor,()=>db.query('select public.publish_live_stage_discovery_current($1,$2,$3,$4,$5) value',
      [party,host,hostActor.session,r.room_generation,r.host_settings_revision]),'service_role');
    assert.equal(result.rows[0].value,true);
  };
  const rows = async (source = 'LIVE-START-TEST') => (await db.query(`select recipient_user_id,event_kind,private.resolve_notification_activity(e) as plan
    from public.notification_activity_events e where source_id=$1 order by recipient_user_id`, [source])).rows;
  try {
    for (const [id, name] of [[host, 'Exact Host'], [follower, 'Follower'], [friend, 'Circle Member'], [stranger, 'Stranger']]) {
      await db.query('insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at) values($1,false,false,now())', [id]);
      await db.query('insert into public.user_profiles(user_id,display_name,username) values($1,$2,$3) on conflict(user_id) do update set display_name=excluded.display_name,username=excluded.username', [id, name, name.toLowerCase().replaceAll(' ', '_')]);
    }
    await seedLiveRoomActor(db, hostActor);
    await db.query('insert into public.channel_followers(channel_user_id,follower_user_id) values($1,$2),($1,$3)', [host, follower, friend]);
    await db.query(`insert into public.user_friendships(user_low_id,user_high_id,requested_by_user_id,status,responded_at,actioned_by_user_id)
      values($1,$2,$1,'active',now(),$1)`, [host, friend]);
    await db.query(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,discovery_visibility,discovery_title)
      values('LIVE-START-TEST',$1,'live','public','Exact Live')`, [host]);
    assert.equal((await rows()).length, 0, 'created/waiting room is not actually live');
    await db.exec("update public.watch_party_rooms set discovery_started_at=now() where party_id='LIVE-START-TEST'");
    assert.equal((await rows()).length, 0, 'forged/old started timestamp alone is not current publication authority');
    await publish('LIVE-START-TEST');
    let notices = await rows();
    assert.equal(notices.length, 2);
    assert.equal(notices.find(n => n.recipient_user_id === friend).event_kind, 'circle_friend_live', 'friend and follower is one recipient, not two');
    assert.equal(notices.find(n => n.recipient_user_id === follower).event_kind, 'followed_creator_live');
    assert.ok(notices.every(n => n.plan.eligible && n.plan.title === 'Exact Host (@exact_host) is live' && n.plan.body === 'Exact Live. Open to check access.'));
    assert.ok(notices.every(n => n.recipient_user_id !== stranger && n.recipient_user_id !== host));
    await db.query('insert into public.person_notification_preferences(user_id,actor_user_id,live_starts_enabled,watch_party_starts_enabled) values($1,$2,false,true)', [follower, host]);
    assert.equal((await rows()).find(n => n.recipient_user_id === follower).plan.eligible, false, 'per-person Live OFF overrides existing Follow default');
    await db.query('update public.person_notification_preferences set live_starts_enabled=true,watch_party_starts_enabled=false where user_id=$1', [follower]);
    assert.equal((await rows()).find(n => n.recipient_user_id === follower).plan.eligible, true, 'Watch-Party OFF does not disable a separate Live-start choice');
    await db.query('delete from public.person_notification_preferences where user_id=$1', [follower]);
    await db.exec("select private.enqueue_discovery_notification_source('live_stage','LIVE-START-TEST')");
    assert.equal((await rows()).length, 2, 'same start generation is idempotent');
    await db.query('insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id) values($1,$2,$1)', [follower, host]);
    assert.equal((await rows()).find(n => n.recipient_user_id === follower).plan.eligible, false, 'current block suppresses queued notice');
    await db.query('delete from public.channel_audience_blocks where channel_user_id=$1', [follower]);
    await db.exec("update public.watch_party_rooms set discovery_visibility='circle' where party_id='LIVE-START-TEST'");
    notices = (await rows()).filter(n => n.plan.eligible);
    assert.ok(notices.every(n => n.recipient_user_id === friend), 'Circle audience never notifies a follower-only recipient');
    await db.exec("update public.watch_party_rooms set discovery_visibility='private' where party_id='LIVE-START-TEST'");
    assert.equal((await rows()).filter(n => n.plan.eligible).length, 0, 'private room attendance is not broadcast');
    await db.exec("update public.watch_party_rooms set discovery_visibility='public',is_active=false where party_id='LIVE-START-TEST'");
    assert.equal((await rows()).filter(n => n.plan.eligible).length, 0, 'late worker cannot announce an ended room');
    await db.query(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,discovery_visibility,discovery_title)
      values('CIRCLE-START-TEST',$1,'live','circle','Circle Live')`, [host]);
    await db.exec("update public.watch_party_rooms set discovery_started_at=now() where party_id='CIRCLE-START-TEST'");
    await publish('CIRCLE-START-TEST');
    const circleNotices = await rows('CIRCLE-START-TEST');
    assert.equal(circleNotices.length, 1);
    assert.equal(circleNotices[0].recipient_user_id, friend);
    assert.equal(circleNotices[0].plan.eligible, true, 'current Circle host start reaches exactly the Circle friend');
  } finally { await db.close(); }
});
