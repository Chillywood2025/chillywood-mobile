import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { createDatabase } from './helpers/database-runtime-authority-fixture.mjs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const migrationName = '20261022204956_message_realtime_replica_identity.sql';
const migration = read(`supabase/migrations/${migrationName}`);
const targets = ['chat_messages', 'watch_party_room_messages'];
const preserved = ['chat_thread_members', 'chat_threads', 'communication_room_memberships',
  'user_content_relationships', 'user_profiles', 'watch_party_room_memberships'];
const allEight = [...targets, ...preserved].sort();
const identities = `select c.relname,c.relreplident::text from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') order by c.relname`;
const authority = `select c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relowner,c.relacl
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') order by c.relname`;
const policies = 'select * from pg_policies where schemaname=\'public\' order by tablename,policyname';
const publications = 'select * from pg_publication_tables order by pubname,schemaname,tablename';

test('forward migration changes exactly the two deployed message identities', () => {
  const statements = migration.replace(/--[^\n]*/gu, '').split(';').map(sql => sql.trim()).filter(Boolean);
  assert.deepEqual(statements, targets.map(table => `alter table public.${table} replica identity full`));
  const chat = read('_lib/chat.ts');
  assert.match(chat, /table: CHAT_MESSAGES_TABLE,\s*filter: `thread_id=eq\.\$\{normalizedThreadId\}`/u);
  for (const path of ['app/player/[id].tsx', 'app/watch-party/live-stage/[partyId].tsx']) {
    const source = read(path);
    assert.match(source, /table: "watch_party_room_messages",\s*filter: `party_id=eq\.\$\{/u);
    assert.match(source, /payload\.old/u, 'message deletion handlers still depend on delivered old keys');
  }
});

test('actual full replay preserves all unrelated identity, RLS, policy, ACL and publication state', { timeout: 120_000 }, async () => {
  const { db, replayReport } = await createDatabase({ applyRepair: true, includeHeldStudio: true, excludeMigrations: [migrationName] });
  const snapshot = async () => Object.fromEntries(await Promise.all(
    Object.entries({ identities, authority, policies, publications }).map(async ([key, query]) => [key, (await db.query(query)).rows]),
  ));
  try {
    assert.equal(replayReport.files.includes(migrationName), false, 'start before the actual forward migration');
    assert.equal(replayReport.files.length + 2, fs.readdirSync(new URL('supabase/migrations/', root)).filter(name => name.endsWith('.sql')).length,
      'every source migration accounted for, with the runtime repair applied separately and only the new migration excluded');
    const before = await snapshot();
    assert.deepEqual(before.identities.filter(row => allEight.includes(row.relname)),
      allEight.map(relname => ({ relname, relreplident: 'd' })), 'fresh baseline exposes the preserved source/production mismatch');
    await db.exec('begin');
    await db.exec(migration);
    assert.deepEqual((await db.query(identities)).rows.filter(row => targets.includes(row.relname)),
      targets.map(relname => ({ relname, relreplident: 'f' })));
    await db.exec('rollback');
    assert.deepEqual(await snapshot(), before, 'the complete DDL change rolls back atomically');

    await db.exec(migration);
    await db.exec(migration);
    assert.deepEqual(await snapshot(), { ...before, identities: before.identities.map(row =>
      targets.includes(row.relname) ? { ...row, relreplident: 'f' } : row) },
    'two applications change only the two named identity flags');

    // Production already has FULL on all eight. This is a synthetic local
    // overlay, not a connection to or mutation of the production database.
    for (const table of preserved) await db.exec(`alter table public.${table} replica identity full`);
    const deployedShape = await snapshot();
    await db.exec(migration);
    await db.exec(migration);
    assert.deepEqual(await snapshot(), deployedShape, 'production-shaped identity state is a no-op; six other FULL flags stay preserved');
  } finally { await db.close(); }
});

test('captured managed filter rejects PK-only message deletes but accepts full routing fields', async () => {
  const db = new PGlite();
  try {
    await db.exec('create schema realtime');
    await db.exec(read('tests/fixtures/realtime-delete-filter-production-20261022.sql'));
    const filter = async (columns, column, value) => (await db.query(`select realtime.is_visible_through_filters(
      array(select jsonb_populate_record(null::realtime.wal_column, entry) from jsonb_array_elements($1::jsonb) entry),
      array[jsonb_populate_record(null::realtime.user_defined_filter, $2::jsonb)]) visible`,
    [JSON.stringify(columns), JSON.stringify({ column_name: column, op: 'eq', value, negate: false })])).rows[0].visible;
    const column = (name, value, is_pkey = false) => ({ name, type_name: 'text', value, is_pkey, is_selectable: true });
    for (const [table, routingColumn] of [['chat_messages', 'thread_id'], ['watch_party_room_messages', 'party_id']]) {
      const primaryKey = column('id', 'synthetic-message', true);
      assert.equal(await filter([primaryKey], routingColumn, 'synthetic-room'), false, `${table}: DEFAULT loses the non-PK delete route`);
      const full = [primaryKey, column(routingColumn, 'synthetic-room')];
      assert.equal(await filter(full, routingColumn, 'synthetic-room'), true, `${table}: FULL retains the matching route`);
      assert.equal(await filter(full, routingColumn, 'different-room'), false, `${table}: a different room is not routed`);
    }
    for (const routingColumn of ['thread_id', 'party_id', 'id']) {
      assert.equal(await filter([column(routingColumn, 'synthetic-room', true)], routingColumn, 'synthetic-room'), true,
        'a key-based filter alone does not establish a FULL requirement for the other tables');
    }
  } finally { await db.close(); }
});
