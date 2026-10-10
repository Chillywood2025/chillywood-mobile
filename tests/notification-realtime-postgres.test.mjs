import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const read = name => fs.readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const initial = read('202604200002_create_notifications_and_event_reminders.sql');
const activity = read('202605120003_d9_notifications_activity_production.sql');
const publication = read('20261010105413_notifications_realtime_publication.sql');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const policies = `select policyname, roles, cmd, qual, with_check from pg_policies
  where schemaname='public' and tablename='notifications' order by policyname`;
const metadata = `select relrowsecurity,relforcerowsecurity,relreplident,relacl
  from pg_class where oid='public.notifications'::regclass`;
const membership = `select tablename from pg_publication_tables where pubname='supabase_realtime'
  and schemaname='public' order by tablename`;

test('actual forward publication SQL preserves notification owner RLS, grants, transactions and reversible membership', async () => {
  const db = new PGlite();
  try {
    // External auth boundary only. Notification schema, policies and grants
    // below execute the actual checked-in SQL, not a replacement policy model.
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated;`);
    const end = initial.indexOf('create table public."event_reminders"');
    assert.ok(end > 0); await db.exec(initial.slice(0, end));
    const activityEnd = activity.indexOf('create table if not exists public."notification_preferences"');
    assert.ok(activityEnd > 0); await db.exec(activity.slice(0, activityEnd));
    const beforeMetadata = (await db.query(metadata)).rows;
    const beforePolicies = (await db.query(policies)).rows;
    await db.exec(publication); // absent publication stays absent
    assert.deepEqual((await db.query(membership)).rows, []);
    await db.exec('create table unrelated(id integer primary key); create publication supabase_realtime for table unrelated;');
    await db.exec('begin'); await db.exec(publication);
    assert.deepEqual((await db.query(membership)).rows, [{ tablename: 'notifications' }, { tablename: 'unrelated' }]);
    await db.exec('rollback');
    assert.deepEqual((await db.query(membership)).rows, [{ tablename: 'unrelated' }], 'DDL rolls back atomically');
    await db.exec(publication); await db.exec(publication);
    assert.deepEqual((await db.query(membership)).rows, [{ tablename: 'notifications' }, { tablename: 'unrelated' }], 'duplicate execution is idempotent and preserves unrelated members');
    assert.deepEqual((await db.query(metadata)).rows, beforeMetadata, 'RLS/FORCE RLS/replica identity/grants remain byte-for-byte equivalent in catalog');
    assert.deepEqual((await db.query(policies)).rows, beforePolicies);
    await db.query('insert into auth.users values($1),($2)', [A, B]);
    await db.query(`insert into notifications(user_id,category,notification_type,title,target_route)
      values($1,'reply_comment','reply_comment','A activity','/channel-settings'),
      ($2,'reply_comment','reply_comment','B activity','/channel-settings')`, [A, B]);
    await db.exec('set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [A]);
    assert.deepEqual((await db.query('select title from notifications')).rows, [{ title: 'A activity' }]);
    assert.equal((await db.query('update notifications set read_at=now() where user_id=$1 returning id', [B])).rows.length, 0);
    assert.equal((await db.query('update notifications set read_at=now() where user_id=$1 returning id', [A])).rows.length, 1);
    await assert.rejects(db.query('update notifications set user_id=$1 where user_id=$2', [B, A]), { code: '42501' });
    await assert.rejects(db.query(`insert into notifications(user_id,category,notification_type,title,target_route)
      values($1,'reply_comment','reply_comment','forged','/channel-settings')`, [A]), { code: '42501' });
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [B]);
    assert.deepEqual((await db.query('select title,read_at from notifications')).rows, [{ title: 'B activity', read_at: null }]);
    await db.exec("reset role; set role anon; select set_config('request.jwt.claim.sub','',false)");
    assert.equal((await db.query('select * from notifications')).rows.length, 0);
    await db.exec('reset role');
    await db.exec('begin');
    await db.query(`insert into notifications(user_id,category,notification_type,title,target_route)
      values($1,'reply_comment','reply_comment','rolled back','/channel-settings')`, [A]);
    await db.exec('rollback');
    assert.equal((await db.query('select count(*)::integer as count from notifications')).rows[0].count, 2);
    await db.exec('alter publication supabase_realtime drop table notifications');
    assert.deepEqual((await db.query(membership)).rows, [{ tablename: 'unrelated' }]);
    assert.equal((await db.query('select count(*)::integer as count from notifications')).rows[0].count, 2);
    assert.deepEqual((await db.query(metadata)).rows, beforeMetadata);
  } finally { await db.close(); }
});
