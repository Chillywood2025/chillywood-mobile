import assert from 'node:assert/strict';
import test from 'node:test';
import { makePreferenceFixture, ids, sessionId } from './helpers/notification-preference-sql-fixture.mjs';

const op = n => `78000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
test('actual notification preference migration enforces intent CAS, incarnation fences and session authority', async t => {
  const h = await makePreferenceFixture();
  t.after(() => h.db.close());
  const { db, snapshot, mutate, user, as } = h;
  let baseline, first, sameValue, stale;

  await t.test('read atomically initializes revision zero and never resets existing preferences', async () => {
    baseline = await snapshot(ids.owner);
    assert.equal(baseline.revision, '0'); assert.equal(baseline.preferences.revision, '0');
    assert.equal(baseline.preferences.user_id, ids.owner);
    assert.equal(baseline.preferences.incarnation, baseline.incarnation);
    assert.equal(baseline.preferences.push_enabled, true);
    assert.equal(baseline.preferences.view_summary_push_enabled, false);
    assert.deepEqual(await snapshot(ids.owner), baseline);
    await db.query('insert into public.notification_preferences(user_id,push_enabled) values($1,false)', [ids.outsider]);
    assert.equal((await snapshot(ids.outsider)).preferences.push_enabled, false);
  });
  await t.test('same-value newer intent advances once and prevents stale undo across runtimes', async () => {
    first = await mutate(ids.owner, op(1), baseline.incarnation, '0', { push_enabled: false });
    assert.equal(first.status, 'applied'); assert.equal(first.revision, '1');
    assert.deepEqual(await mutate(ids.owner, op(1), baseline.incarnation, '0', { push_enabled: false }), first);
    sameValue = await mutate(ids.owner, op(2), baseline.incarnation, '1', { push_enabled: false });
    assert.equal(sameValue.revision, '2');
    stale = await mutate(ids.owner, op(3), baseline.incarnation, '1', { push_enabled: true });
    assert.equal(stale.status, 'conflict'); assert.equal(stale.revision, '2');
    assert.equal(stale.preferences.push_enabled, false);
    assert.equal((await snapshot(ids.owner)).revision, '2');
    assert.equal((await mutate(ids.owner, op(4), baseline.incarnation, '2', {})).revision, '3');
  });
  await t.test('lost acknowledgment retry returns conflict current state if a later intent already won', async () => {
    const replay = await mutate(ids.owner, op(1), baseline.incarnation, '0', { push_enabled: false });
    const replayConflict = await mutate(ids.owner, op(3), baseline.incarnation, '1', { push_enabled: true });
    assert.equal(replay.status, 'conflict'); assert.equal(replay.revision, '3');
    assert.equal(replayConflict.status, 'conflict'); assert.equal(replayConflict.revision, '3');
    assert.equal((await snapshot(ids.owner)).revision, '3');
    assert.equal((await db.query('select count(*)::int n from private.notification_preference_operation_receipts')).rows[0].n, 4);
  });
  await t.test('operation UUID binds exact payload, revision and incarnation, not a newly fetched baseline', async () => {
    for (const [incarnation, revision, patch] of [
      [baseline.incarnation, '0', { push_enabled: true }],
      [baseline.incarnation, '3', { push_enabled: false }],
      [op(99), '0', { push_enabled: false }],
    ]) await assert.rejects(mutate(ids.owner, op(1), incarnation, revision, patch),
      e => e.code === '22023' && e.message.includes('notification_preference_operation_key_conflict'));
  });
  await t.test('strict known fields reject ownership, generation and coercible input before receipt write', async () => {
    const count = (await db.query('select count(*)::int n from private.notification_preference_operation_receipts')).rows[0].n;
    for (const patch of [null, [], true, { push_enabled: 'false' }, { push_enabled: null }, { revision: '3' },
      { incarnation: op(99) }, { user_id: ids.outsider }, { updated_at: '2027-01-01' }, { unknown: true },
      { chilly_chat_call_sound_key: 'unknown' }, { chilly_chat_call_custom_in_app_sound_uri: 42 },
      { chilly_chat_call_custom_in_app_sound_uri: 'x'.repeat(2049) }]) {
      await assert.rejects(mutate(ids.owner, op(20), baseline.incarnation, '3', patch), e => e.code === '22023');
    }
    for (const revision of ['-1', '01', '1.0', '9223372036854775808', 'garbage', null]) {
      await assert.rejects(mutate(ids.owner, op(20), baseline.incarnation, revision, {}), e => e.code === '22023');
    }
    await assert.rejects(mutate(ids.owner, op(20), null, '3', {}), e => e.code === '22023');
    assert.equal((await db.query('select count(*)::int n from private.notification_preference_operation_receipts')).rows[0].n, count);
    const sound = await mutate(ids.owner, op(21), baseline.incarnation, '3', {
      chilly_chat_call_sound_key: 'quiet_buzz', chilly_chat_call_custom_in_app_sound_uri: null,
    });
    assert.equal(sound.revision, '4'); assert.equal(sound.preferences.chilly_chat_call_custom_in_app_sound_uri, null);
  });
  await t.test('service updates cannot forge revisions or incarnation and invalidate stale clients', async () => {
    await as('service_role', null, `update public.notification_preferences set push_enabled=true,revision=0,incarnation='${op(98)}' where user_id='${ids.owner}'`);
    const current = await snapshot(ids.owner);
    assert.equal(current.revision, '5'); assert.equal(current.incarnation, baseline.incarnation);
    assert.equal((await mutate(ids.owner, op(22), baseline.incarnation, '4', { push_enabled: false })).status, 'conflict');
    await assert.rejects(as('service_role', null, `update public.notification_preferences set user_id='${ids.follower}' where user_id='${ids.owner}'`),
      e => e.code === '22023' && e.message.includes('notification_preference_subject_immutable'));
  });
  await t.test('service delete/recreate and truncate/recreate cannot reset CAS or replay prior success', async () => {
    for (const remove of [`delete from public.notification_preferences where user_id='${ids.owner}'`, 'truncate public.notification_preferences']) {
      const old = await snapshot(ids.owner);
      await as('service_role', null, remove);
      await as('service_role', null, `insert into public.notification_preferences(user_id,revision,incarnation) values('${ids.owner}',999,'${old.incarnation}')`);
      const fresh = await snapshot(ids.owner);
      assert.equal(fresh.revision, '0'); assert.notEqual(fresh.incarnation, old.incarnation);
      const oldAttempt = await mutate(ids.owner, op(30), old.incarnation, '0', { push_enabled: false }).catch(e => e);
      // A changed request cannot reuse the first iteration's operation UUID.
      if (oldAttempt instanceof Error) assert.equal(oldAttempt.message, 'notification_preference_operation_key_conflict');
      else { assert.equal(oldAttempt.status, 'conflict'); assert.equal(oldAttempt.incarnation, fresh.incarnation); }
      const replay = await mutate(ids.owner, op(1), baseline.incarnation, '0', { push_enabled: false });
      assert.equal(replay.status, 'conflict'); assert.equal(replay.incarnation, fresh.incarnation);
      assert.equal((await snapshot(ids.owner)).revision, '0');
      assert.equal((await snapshot(ids.owner)).preferences.push_enabled, true);
    }
  });
  await t.test('own-row reads survive, direct writes close, private receipts and RPCs remain least-privilege', async () => {
    for (const sql of [
      `insert into public.notification_preferences(user_id) values('${ids.owner}')`,
      'update public.notification_preferences set push_enabled=true', 'delete from public.notification_preferences',
      'truncate public.notification_preferences',
    ]) await assert.rejects(user(ids.owner, sql), e => e.code === '42501');
    for (const role of ['anon', 'authenticated']) for (const privilege of ['INSERT', 'UPDATE']) {
      assert.equal((await db.query("select has_any_column_privilege($1,'public.notification_preferences',$2) allowed", [role, privilege])).rows[0].allowed, false);
    }
    const other = await snapshot(ids.outsider);
    assert.notEqual(other.incarnation, (await snapshot(ids.owner)).incarnation);
    assert.deepEqual((await user(ids.owner, 'select user_id::text from public.notification_preferences')).rows, [{ user_id: ids.owner }]);
    assert.equal((await mutate(ids.outsider, op(1), other.incarnation, '0', { push_enabled: false })).status, 'applied');
    assert.deepEqual((await db.query("select * from pg_policies where tablename='notification_preferences' order by policyname")).rows, h.policiesBefore);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await assert.rejects(as(role, null, 'select * from private.notification_preference_operation_receipts'), e => e.code === '42501');
      assert.equal((await db.query("select has_table_privilege($1,'private.notification_preference_operation_receipts','INSERT') allowed", [role])).rows[0].allowed, false);
    }
    for (const role of ['anon', 'service_role']) await assert.rejects(as(role, ids.owner, 'select public.read_my_notification_preferences()'), e => e.code === '42501');
    assert.ok((await db.query("select relrowsecurity and relforcerowsecurity yes from pg_class where oid='private.notification_preference_operation_receipts'::regclass")).rows[0].yes);
  });
  await t.test('wrong-subject session, revoked/expired/restricted and restore-only callers fail closed', async () => {
    const checkDenied = async () => {
      await assert.rejects(snapshot(ids.owner), e => e.code === '42501');
      await assert.rejects(mutate(ids.owner, op(1), baseline.incarnation, '0', { push_enabled: false }), e => e.code === '42501');
    };
    await db.query('update auth.sessions set user_id=$2 where id=$1', [sessionId(ids.owner), ids.outsider]);
    await checkDenied();
    await db.query('update auth.sessions set user_id=$2,not_after=clock_timestamp()-interval \'1 second\' where id=$1', [sessionId(ids.owner), ids.owner]);
    await checkDenied();
    await db.query('update auth.sessions set not_after=null where id=$1', [sessionId(ids.owner)]);
    await db.query("update auth.users set banned_until=now()+interval '1 hour' where id=$1", [ids.owner]);
    await checkDenied(); await db.query('update auth.users set banned_until=null where id=$1', [ids.owner]);
    await db.query("insert into public.account_deletion_requests(user_id,status,restore_deadline) values($1,'scheduled',now()+interval '1 day')", [ids.owner]);
    await checkDenied(); await db.query('delete from public.account_deletion_requests where user_id=$1', [ids.owner]);
    await db.query('delete from auth.sessions where id=$1', [sessionId(ids.owner)]);
    await checkDenied(); await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [sessionId(ids.owner), ids.owner]);
  });
  await t.test('authority lost inside the write rolls back preferences and receipt together', async () => {
    const before = await snapshot(ids.owner);
    await db.exec(`create function private.fixture_revoke_preference_session() returns trigger language plpgsql security definer set search_path='' as $$begin
      delete from auth.sessions where id='${sessionId(ids.owner)}';return new;end$$;
      create trigger fixture_revoke_preference_session before update on public.notification_preferences for each row execute function private.fixture_revoke_preference_session();`);
    try {
      await assert.rejects(mutate(ids.owner, op(40), before.incarnation, before.revision, { push_enabled: false }), e => e.code === '42501');
      assert.deepEqual(await snapshot(ids.owner), before);
      assert.equal((await db.query('select count(*)::int n from private.notification_preference_operation_receipts where operation_id=$1', [op(40)])).rows[0].n, 0);
    } finally { await db.exec('drop trigger fixture_revoke_preference_session on public.notification_preferences;drop function private.fixture_revoke_preference_session();'); }
  });
  await t.test('session loss during initial read rolls back newly initialized defaults', async () => {
    await db.exec(`create function private.fixture_revoke_preference_initializer() returns trigger language plpgsql security definer set search_path='' as $$begin
      delete from auth.sessions where id='${sessionId(ids.follower)}';return new;end$$;
      create trigger fixture_revoke_preference_initializer before insert on public.notification_preferences for each row execute function private.fixture_revoke_preference_initializer();`);
    try {
      await assert.rejects(snapshot(ids.follower), e => e.code === '42501');
      assert.equal((await db.query('select count(*)::int n from public.notification_preferences where user_id=$1', [ids.follower])).rows[0].n, 0);
      assert.equal((await db.query('select count(*)::int n from auth.sessions where id=$1', [sessionId(ids.follower)])).rows[0].n, 1);
    } finally { await db.exec('drop trigger fixture_revoke_preference_initializer on public.notification_preferences;drop function private.fixture_revoke_preference_initializer();'); }
  });
  await t.test('retained transaction snapshots cannot initialize/read or mutate', async () => {
    for (const isolation of ['repeatable read', 'serializable']) for (const sql of [
      'select public.read_my_notification_preferences()',
      `select public.mutate_my_notification_preferences('${op(50)}','${baseline.incarnation}','0','{}')`,
    ]) {
      await db.exec(`begin isolation level ${isolation}`);
      try {
        await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ role: 'authenticated', sub: ids.owner, session_id: sessionId(ids.owner) })]);
        await assert.rejects(db.query(sql), e => e.code === '25000' && e.message.includes('notification_preference_requires_read_committed'));
      } finally { await db.exec('rollback'); }
    }
  });
  await t.test('bigint revisions remain decimal text above JS precision and exhaust without wraparound', async () => {
    // Test-only historical row seeding. The public/service API cannot assign
    // these revisions because the production trigger always owns advancement.
    const seedRevision = async revision => {
      await db.exec('alter table public.notification_preferences disable trigger notification_preferences_server_revision;');
      try { await db.query('update public.notification_preferences set revision=$1 where user_id=$2', [revision, ids.owner]); }
      finally { await db.exec('alter table public.notification_preferences enable trigger notification_preferences_server_revision;'); }
    };
    await seedRevision('9007199254740991');
    const before = await snapshot(ids.owner);
    const firstWide = await mutate(ids.owner, op(60), before.incarnation, before.revision, {});
    const secondWide = await mutate(ids.owner, op(61), before.incarnation, firstWide.revision, {});
    assert.equal(firstWide.revision, '9007199254740992');
    assert.equal(secondWide.revision, '9007199254740993');
    assert.equal(secondWide.preferences.revision, '9007199254740993');
    await seedRevision('9223372036854775807');
    await assert.rejects(mutate(ids.owner, op(62), before.incarnation, '9223372036854775807', {}),
      e => e.code === '22003' && e.message.includes('notification_preference_revision_exhausted'));
    assert.equal((await snapshot(ids.owner)).revision, '9223372036854775807');
    assert.equal((await db.query('select count(*)::int n from private.notification_preference_operation_receipts where operation_id=$1', [op(62)])).rows[0].n, 0);
  });
});
