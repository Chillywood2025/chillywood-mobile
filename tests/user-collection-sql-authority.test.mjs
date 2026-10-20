import assert from 'node:assert/strict';
import test from 'node:test';
import { makeCollectionFixture, ids, sessionId } from './helpers/user-collection-sql-fixture.mjs';

const op = n => `79000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const saved = id => ({ id });
const watch = (positionMillis, extra = {}) => ({ positionMillis, completed: false, ...extra });

test('production collection SQL enforces revisions, receipts, tombstones and exact account authority', async t => {
  const h = await makeCollectionFixture();
  t.after(() => h.db.close());
  const { db, mutate, snapshot, user, as } = h;

  await t.test('legacy projections appear as revision zero, including completed progress', async () => {
    await db.query("insert into public.user_list values($1,'legacy','2026-01-02T00:00:00Z')", [ids.owner]);
    await db.query("insert into public.watch_history(user_id,title_id,play_count,completed) values($1,'legacy',5,true)", [ids.owner]);
    const rows = await snapshot(ids.owner, 'saved');
    assert.deepEqual(rows, [{ title_id: 'legacy', revision: '0', value: { id: 'legacy', savedAt: 1767312000000 } }]);
    assert.equal((await snapshot(ids.owner, 'watch'))[0].value.completed, true);
    assert.equal((await snapshot(ids.owner, 'watch'))[0].value.playCount, 5);
    assert.equal((await db.query('select count(*)::int n from private.user_collection_states')).rows[0].n, 0);
  });

  let first;
  await t.test('server time and durable removal revision reject an older save', async () => {
    first = await mutate(ids.owner, 'saved', 'film', op(1), '0', saved('film'));
    assert.equal(first.status, 'applied'); assert.equal(first.revision, '1');
    assert.ok(first.value.savedAt > 1);
    const removed = await mutate(ids.owner, 'saved', 'film', op(2), '1', null);
    assert.deepEqual(removed, { status: 'applied', revision: '2', value: null });
    assert.deepEqual(await mutate(ids.owner, 'saved', 'film', op(3), '0', saved('film')),
      { status: 'conflict', revision: '2', value: null });
    assert.equal((await user(ids.owner, "select * from public.user_list where title_id='film'")).rows.length, 0);
    assert.deepEqual((await snapshot(ids.owner, 'saved')).find(r => r.title_id === 'film'),
      { title_id: 'film', revision: '2', value: null });
  });

  await t.test('exact old retry returns its receipt without reverting a later removal', async () => {
    assert.deepEqual(await mutate(ids.owner, 'saved', 'film', op(1), '0', saved('film')), first);
    assert.equal((await snapshot(ids.owner, 'saved')).find(r => r.title_id === 'film').value, null);
    assert.equal((await db.query('select count(*)::int n from private.user_collection_operation_receipts')).rows[0].n, 3);
  });

  await t.test('same operation cannot change payload, title, collection or expected revision', async () => {
    for (const args of [
      ['saved', 'film', '0', null],
      ['saved', 'other', '0', saved('other')],
      ['watch', 'film', '0', watch(10)],
      ['saved', 'film', '2', saved('film')],
    ]) {
      await assert.rejects(mutate(ids.owner, args[0], args[1], op(1), args[2], args[3]),
        e => e.code === '22023' && e.message.includes('collection_operation_key_conflict'));
    }
    assert.equal((await snapshot(ids.owner, 'saved')).find(r => r.title_id === 'film').revision, '2');
  });

  await t.test('actor-bound receipts and reads cannot leak or mutate another account', async () => {
    assert.deepEqual(await snapshot(ids.outsider, 'saved'), []);
    const other = await mutate(ids.outsider, 'saved', 'film', op(1), '0', saved('film'));
    assert.equal(other.status, 'applied');
    assert.equal((await snapshot(ids.owner, 'saved')).find(r => r.title_id === 'film').value, null);
    assert.deepEqual((await user(ids.owner, 'select distinct user_id::text from public.user_list')).rows, [{ user_id: ids.owner }]);
  });

  await t.test('CAS winner is explicit; a stale completion/progress cannot be acknowledged as applied', async () => {
    const started = await mutate(ids.owner, 'watch', 'film', op(10), '0', watch(50, { durationMillis: 100 }));
    assert.equal(started.revision, '1');
    const complete = await mutate(ids.owner, 'watch', 'film', op(11), '1', watch(0, { completed: true }));
    const stale = await mutate(ids.owner, 'watch', 'film', op(12), '1', watch(60));
    assert.equal(stale.status, 'conflict'); assert.deepEqual(stale.value, complete.value);
    const rewatch = await mutate(ids.owner, 'watch', 'film', op(13), '2', watch(0));
    assert.equal(rewatch.status, 'applied'); assert.equal(rewatch.value.completed, false);
    assert.equal((await mutate(ids.owner, 'watch', 'film', op(12), '1', watch(60))).status, 'conflict');
    assert.equal((await snapshot(ids.owner, 'watch')).find(r => r.title_id === 'film').revision, '3');
  });

  await t.test('play counts increment inside accepted CAS exactly once, including late retry', async () => {
    const start = watch(0, { incrementPlayCount: true });
    const result = await mutate(ids.owner, 'watch', 'legacy', op(20), '0', start);
    assert.equal(result.value.playCount, 6);
    assert.deepEqual(await mutate(ids.owner, 'watch', 'legacy', op(20), '0', start), result);
    assert.equal((await mutate(ids.owner, 'watch', 'legacy', op(21), '0', start)).status, 'conflict');
    const second = await mutate(ids.owner, 'watch', 'legacy', op(22), '1', start);
    assert.equal(second.value.playCount, 7);
    assert.deepEqual(await mutate(ids.owner, 'watch', 'legacy', op(20), '0', start), result);
    assert.equal((await snapshot(ids.owner, 'watch')).find(r => r.title_id === 'legacy').value.playCount, 7);
    const progress = await mutate(ids.owner, 'watch', 'legacy', op(23), '2', watch(20));
    assert.equal(progress.value.playCount, 7);
    assert.equal(progress.value.incrementPlayCount, undefined);
  });

  await t.test('pages retain tombstones, stable cursor order and legacy rows', async () => {
    const all = await snapshot(ids.owner, 'saved');
    const paged = []; let cursor = '';
    for (;;) {
      const page = await snapshot(ids.owner, 'saved', cursor, 1);
      if (!page.length) break;
      paged.push(...page); cursor = page[0].title_id;
    }
    assert.deepEqual(paged, all);
    assert.ok(paged.some(row => row.value === null));
  });

  await t.test('legacy writes and direct private receipt access fail closed while SELECT policies survive', async () => {
    for (const table of ['user_list', 'watch_history']) {
      for (const sql of [
        `insert into public.${table}(user_id,title_id) values('${ids.owner}','bypass')`,
        `update public.${table} set updated_at=now()`, `delete from public.${table}`, `truncate public.${table}`,
      ]) await assert.rejects(user(ids.owner, sql), e => e.code === '42501');
      assert.equal((await user(ids.owner, `select count(*)::int n from public.${table}`)).rows.length, 1);
    }
    for (const role of ['anon', 'authenticated', 'service_role']) {
      assert.equal((await db.query("select has_table_privilege($1,'private.user_collection_states','SELECT') allowed", [role])).rows[0].allowed, false);
      assert.equal((await db.query("select has_table_privilege($1,'private.user_collection_operation_receipts','INSERT') allowed", [role])).rows[0].allowed, false);
    }
    const policies = (await db.query("select schemaname,tablename,policyname,qual,with_check from pg_policies where tablename in ('user_list','watch_history') order by tablename,policyname")).rows;
    assert.deepEqual(policies, h.policiesBefore);
    const flags = (await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid in ('private.user_collection_states'::regclass,'private.user_collection_operation_receipts'::regclass)")).rows;
    assert.ok(flags.every(r => r.relrowsecurity && r.relforcerowsecurity));
  });

  await t.test('expired, revoked, restricted and restore-only sessions cannot read, write or replay receipts', async () => {
    const checkDenied = async () => {
      await assert.rejects(snapshot(ids.owner, 'saved'), e => e.code === '42501');
      await assert.rejects(mutate(ids.owner, 'saved', 'film', op(1), '0', saved('film')), e => e.code === '42501');
      assert.equal((await user(ids.owner, 'select * from public.user_list')).rows.length, 0);
    };
    await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [sessionId(ids.owner)]);
    await checkDenied();
    await db.query('update auth.sessions set not_after=null where id=$1', [sessionId(ids.owner)]);
    await db.query("update auth.users set banned_until=now()+interval '1 hour' where id=$1", [ids.owner]);
    await checkDenied();
    await db.query('update auth.users set banned_until=null where id=$1', [ids.owner]);
    await db.query("insert into public.account_deletion_requests(user_id,status,restore_deadline) values($1,'scheduled',now()+interval '1 day')", [ids.owner]);
    await checkDenied();
    await db.query('delete from public.account_deletion_requests where user_id=$1', [ids.owner]);
    await db.query('delete from auth.sessions where id=$1', [sessionId(ids.owner)]);
    await checkDenied();
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [sessionId(ids.owner), ids.owner]);
    assert.deepEqual(await mutate(ids.owner, 'saved', 'film', op(1), '0', saved('film')), first);
    for (const role of ['anon', 'service_role']) {
      await assert.rejects(as(role, ids.owner, "select * from public.read_my_collection_state('saved')"), e => e.code === '42501');
    }
  });

  await t.test('malformed revision/value input fails without state or receipt writes', async () => {
    const before = (await db.query('select count(*)::int n from private.user_collection_operation_receipts')).rows[0].n;
    for (const revision of ['-1', '01', '1.0', '9223372036854775807', 'garbage']) {
      await assert.rejects(mutate(ids.owner, 'saved', 'bad', op(100), revision, saved('bad')), e => e.code === '22023');
    }
    for (const title of ['__proto__', 'prototype', 'constructor']) {
      await assert.rejects(mutate(ids.owner, 'saved', title, op(104), '0', saved(title)), e => e.code === '22023');
      await assert.rejects(mutate(ids.owner, 'watch', title, op(105), '0', watch(1)), e => e.code === '22023');
    }
    for (const value of [watch(-1), watch(0.5), watch(1, { durationMillis: -1 }), watch(1, { completed: 'false' }), watch(1, { incrementPlayCount: 'true' })]) {
      await assert.rejects(mutate(ids.owner, 'watch', 'bad', op(101), '0', value), e => e.code === '22023');
    }
    for (const value of [{ id: 'bad', posterUrl: 'https://example.test/private' }, { id: 'bad', savedAt: 1 }, { id: 'bad', other: 'x'.repeat(5000) }]) {
      await assert.rejects(mutate(ids.owner, 'saved', 'bad', op(102), '0', value), e => e.code === '22023');
    }
    for (const value of [watch(1, { updatedAt: 1 }), watch(1, { playCount: 99 }), watch(1, { url: 'https://example.test/private' })]) {
      await assert.rejects(mutate(ids.owner, 'watch', 'bad', op(103), '0', value), e => e.code === '22023');
    }
    assert.equal((await db.query('select count(*)::int n from private.user_collection_operation_receipts')).rows[0].n, before);
  });

  await t.test('authority lost during the projection mutation rolls back projection, revision and receipt', async () => {
    await db.exec(`create function private.fixture_revoke_collection_session() returns trigger
      language plpgsql security definer set search_path='' as $$begin
        delete from auth.sessions where id='${sessionId(ids.owner)}';return new;end$$;
      create trigger fixture_revoke_collection_session before insert on public.user_list
        for each row execute function private.fixture_revoke_collection_session();`);
    try {
      await assert.rejects(mutate(ids.owner, 'saved', 'rolled-back', op(110), '0', saved('rolled-back')),
        e => e.code === '42501' && e.message.includes('collection_current_session_required'));
      assert.equal((await db.query("select count(*)::int n from public.user_list where title_id='rolled-back'")).rows[0].n, 0);
      assert.equal((await db.query("select count(*)::int n from private.user_collection_states where title_id='rolled-back'")).rows[0].n, 0);
      assert.equal((await db.query('select count(*)::int n from private.user_collection_operation_receipts where operation_id=$1', [op(110)])).rows[0].n, 0);
      assert.equal((await db.query('select count(*)::int n from auth.sessions where id=$1', [sessionId(ids.owner)])).rows[0].n, 1);
    } finally {
      await db.exec('drop trigger fixture_revoke_collection_session on public.user_list;drop function private.fixture_revoke_collection_session();');
    }
  });

  await t.test('repeatable snapshots cannot retain authority through a lock wait', async () => {
    for (const isolation of ['repeatable read', 'serializable']) {
      await db.exec(`begin isolation level ${isolation};`);
      try {
        await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ role: 'authenticated', sub: ids.owner, session_id: sessionId(ids.owner) })]);
        await assert.rejects(db.query('select public.mutate_my_collection_state($1,$2,$3::uuid,$4,$5::jsonb)',
          ['saved', 'isolation', op(111), '0', JSON.stringify(saved('isolation'))]),
        e => e.code === '25000' && e.message.includes('collection_requires_read_committed'));
      } finally { await db.exec('rollback'); }
    }
  });
});
