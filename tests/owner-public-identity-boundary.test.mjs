import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';

// During parallel development this points at the companion full-schema room
// fixture; the integrated branch uses its ordinary local helpers/migrations.
const fixtureRoot = process.env.LIVE_DISCOVERY_AUTHORITY_SOURCE_ROOT;
const helper = name => fixtureRoot ? pathToFileURL(path.join(fixtureRoot, 'tests/helpers', name)).href : new URL(`./helpers/${name}`, import.meta.url).href;
const {createDatabase} = await import('./helpers/database-runtime-authority-fixture.mjs');
const {seedLiveRoomAuthority, seedLiveRoomActor, liveFixtureActors: a, liveFixtureTitle: title, withLiveRoomActor} = await import(helper('live-room-authority-fixture.mjs'));
const {pgtapSQLPreflight} = await import(helper('pgtap-sql-preflight.mjs'));
const migration = '20261101201430_owner_public_identity_boundary.sql';
// Freeze the only missing parallel companion at test start. Never depend on
// another worktree's temporary notification migration symlinks during replay.
const companion = fixtureRoot ? fs.readFileSync(path.join(fixtureRoot, 'supabase/migrations/20261101194927_live_room_host_settings_authority.sql'), 'utf8') : null;

test('full schema: public identity never exposes Owner via RPC fallback, even after exact room opt-in; self/staff workflows remain intact', {timeout: 180000}, async () => {
  const {db, replayReport} = await createDatabase({includeHeldStudio: true, applyRepair: true, repairInMigrationOrder: true,
    implicitApiGrants: false, excludeMigrations: [migration]});
  const auth = (actor, fn, role = 'authenticated') => withLiveRoomActor(db, actor, fn, role);
  const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0] ?? {})[0];
  const anonymous = {id: null, session: null};
  const anotherOwner = {id: 'ac510000-0000-4000-8000-000000000005', session: 'ac510001-0000-4000-8000-000000000005'};
  const readers = ['read_public_channel_profile', 'read_public_platform_identity'];
  const rows = (reader, actor, target = a.host.id, role = 'authenticated') => auth(actor,
    () => db.query(`select user_id,display_name from public.${reader}($1)`, [target]), role);
  try {
    assert.ok(replayReport.files.length > 590, 'complete current schema, not a hand-built authorization substitute');
    if (companion) await db.exec(companion);
    await seedLiveRoomAuthority(db); await seedLiveRoomActor(db, anotherOwner, {premium: false});
    for (const [actor, role, email] of [[a.host, 'owner', 'owner-identity@example.test'], [anotherOwner, 'owner', 'other-owner@example.test'], [a.follower, 'operator', 'operator-identity@example.test']]) {
      await db.query('update auth.users set email=$2 where id=$1', [actor.id, email]);
      await db.query("insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by) values($1,$2,$3,'active','Synthetic identity boundary test','fixture')", [role, actor.id, email]);
    }
    await db.query(`insert into public.user_profiles(user_id,display_name,username) values($1,'Private admin identity','private_owner'),($2,'Ordinary public creator','ordinary_creator')
      on conflict(user_id) do update set display_name=excluded.display_name,username=excluded.username`, [a.host.id, a.friend.id]);
    assert.equal(await scalar('select public.is_platform_owner_user($1)', [a.host.id]), true);
    const outsiders = [[a.friend, 'authenticated'], [a.stranger, 'authenticated'], [a.follower, 'authenticated'], [anotherOwner, 'authenticated'], [anonymous, 'anon']];
    for (const reader of readers) for (const [viewer, role] of outsiders) {
      assert.equal((await rows(reader, viewer, a.host.id, role)).rows.length, 1, `${reader}: pre-fix negative control reproduces actual identity leak`);
    }
    assert.equal(await auth(a.stranger, () => scalar('select count(*)::int from public.user_profiles where user_id=$1', [a.host.id])), 0, 'table RLS was not enough to protect the final public RPC');
    const adminBefore = await auth(a.follower, () => scalar('select public.get_admin_users_read_model($1,10)', [a.host.id]));
    assert.ok(adminBefore.items.some(row => row.userId === a.host.id), 'existing separately authorized staff inspection is a real positive control');
    const definitions = await scalar("select pg_get_functiondef('public.get_admin_users_read_model(text,integer)'::regprocedure)");
    await db.exec(fs.readFileSync(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
    const assertHidden = async () => {
      for (const reader of readers) for (const [viewer, role] of outsiders) for (const target of [a.host.id, `  ${a.host.id}  `]) {
        assert.equal((await rows(reader, viewer, target, role)).rows.length, 0, `${reader}: non-self public identity remains unavailable`);
      }
      for (const reader of readers) assert.equal((await rows(reader, a.host)).rows[0]?.display_name, 'Private admin identity', 'exact Owner self remains available');
    };
    await assertHidden();
    for (const reader of readers) for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal(await scalar('select has_function_privilege($1,$2,\'EXECUTE\')', [role, `public.${reader}_pre_owner_boundary(text)`]), false, 'renamed SECURITY DEFINER helper is not an alternate API');
    }
    await assert.rejects(auth(a.stranger, () => db.query('select * from public.read_public_channel_profile_pre_owner_boundary($1)', [a.host.id])), /permission denied/);
    const adminAfter = await auth(a.follower, () => scalar('select public.get_admin_users_read_model($1,10)', [a.host.id]));
    assert.deepEqual(adminAfter.items, adminBefore.items);
    assert.equal(await scalar("select pg_get_functiondef('public.get_admin_users_read_model(text,integer)'::regprocedure)"), definitions);
    await assert.rejects(auth(a.stranger, () => db.query('select public.get_admin_users_read_model($1,10)', [a.host.id])), /denied/);
    for (const reader of readers) assert.equal((await rows(reader, anonymous, a.friend.id, 'anon')).rows.length, 1, 'ordinary public creator still resolves');
    await db.query("update public.user_profiles set profile_access_visibility='private',platform_access_visibility='public' where user_id=$1", [a.friend.id]);
    assert.equal((await rows(readers[0], a.stranger, a.friend.id)).rows.length, 0, 'personal Profile privacy still applies');
    assert.equal((await rows(readers[1], a.stranger, a.friend.id)).rows.length, 1, 'independent public Platform still resolves');
    await db.query('insert into public.channel_audience_blocks(channel_user_id,blocked_user_id,blocked_by_user_id) values($1,$2,$1)', [a.friend.id, a.stranger.id]);
    assert.equal((await rows(readers[1], a.stranger, a.friend.id)).rows.length, 0, 'ordinary creator block remains effective');
    await db.query('delete from public.channel_audience_blocks where channel_user_id=$1 and blocked_user_id=$2', [a.friend.id, a.stranger.id]);
    await db.query('update auth.users set deleted_at=now() where id=$1', [a.friend.id]);
    for (const reader of readers) assert.equal((await rows(reader, a.stranger, a.friend.id)).rows.length, 0, 'deleted ordinary identity still fails closed');
    await db.query('update auth.users set deleted_at=null where id=$1', [a.friend.id]);
    // Actual user-authorized room publication does not change either identity
    // API. Historical/public flags alone are insufficient to publish this room.
    await auth(a.host, () => db.query(`insert into public.watch_party_rooms(party_id,host_user_id,room_type,title_id,source_type,source_id,content_access_rule,discovery_visibility,discovery_title)
      values('OWNER-IDENTITY-BOUNDARY',$1,'title',$2,'platform_title',$2,'premium','public','Explicit room only')`, [a.host.id, title]));
    await auth(a.host, () => db.query("select * from public.join_watch_party_room_session('OWNER-IDENTITY-BOUNDARY','Chosen room label')"));
    const room = (await db.query("select * from public.watch_party_rooms where party_id='OWNER-IDENTITY-BOUNDARY'")).rows[0];
    const consent = await auth(a.host, () => scalar('select public.set_watch_party_room_host_settings($1,$2,$3,$4,$5,$6,$7,$8,$9,true,true)',
      [room.party_id, room.room_generation, Number(room.host_settings_revision), a.host.session, room.join_policy, 'public', 'Explicit room only', room.source_type, room.source_id]));
    assert.equal(consent.ownerDiscoveryConsent, true); assert.equal(consent.published, true);
    assert.equal(await auth(a.stranger, () => scalar("select count(*)::int from public.discovery_feed_items where source_id='OWNER-IDENTITY-BOUNDARY'")), 1, 'only the explicitly consented current room is listed');
    await assertHidden();
    await db.exec(pgtapSQLPreflight);
    const assertions = await db.exec(fs.readFileSync(new URL('../supabase/tests/owner_public_identity_boundary_test.sql', import.meta.url), 'utf8'));
    assert.equal(assertions.flatMap(result => result.rows ?? []).flatMap(Object.values).filter(value => typeof value === 'string' && value.startsWith('ok ')).length, 10);
    console.log('10 unchanged pgTAP SQL assertions passed via SQL preflight adapter; native pgTAP remains required.');
  } finally { await db.close(); }
});
