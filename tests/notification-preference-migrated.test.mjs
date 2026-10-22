import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createDatabase, splitSQL } from './helpers/database-runtime-authority-fixture.mjs';
import { preferenceMigration } from './helpers/notification-preference-sql-fixture.mjs';

test('preference CAS applies over the full fresh-schema migration chain without grant or policy widening', { timeout: 120000 }, async t => {
  const migrationName = preferenceMigration.split('/').at(-1);
  const { db, replayReport } = await createDatabase({ implicitApiGrants: false, applyRepair: true,
    includeHeldStudio: true, excludeMigrations: [migrationName] });
  t.after(() => db.close());
  const actor = '88000000-0000-4000-8000-000000000001';
  const session = '87000000-0000-4000-8000-000000000001';
  const operation = '86000000-0000-4000-8000-000000000001';
  await db.query('insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values($1,$2,now(),false,false)', [actor, 'migrated-preference@example.test']);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [session, actor]);
  await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
    select $1::uuid,public.wave1_sha256($1::text),document_key,version,market,'member',capability,$2,'service_reconciliation'
    from public.wave1_legal_document_versions where active and market='UNITED_STATES' and capability='account'`, [actor, session]);
  await db.query('insert into public.notification_preferences(user_id,push_enabled,messages_enabled) values($1,false,false)', [actor]);
  const policies = async () => (await db.query("select * from pg_policies where tablename='notification_preferences' order by policyname")).rows;
  const serviceAcl = async () => (await db.query(`select privilege,has_table_privilege('service_role','public.notification_preferences',privilege) allowed
    from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege order by privilege`)).rows;
  const beforePolicies = await policies(), beforeService = await serviceAcl();
  const rlsFlags = async () => (await db.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='public.notification_preferences'::regclass")).rows;
  const beforeRls = await rlsFlags();
  await db.exec('grant insert(user_id),update(push_enabled) on public.notification_preferences to authenticated;');
  const migration = fs.readFileSync(preferenceMigration, 'utf8');
  const transactionBody = splitSQL(migration).filter(statement =>
    !/^(begin|commit);$/iu.test(statement.replace(/--[^\n]*/gu, '').trim())).join('\n');
  await db.exec('begin');
  try { await db.exec(transactionBody); } finally { await db.exec('rollback'); }
  assert.equal((await db.query("select to_regclass('private.notification_preference_operation_receipts') receipt_table")).rows[0].receipt_table, null);
  assert.equal((await db.query("select count(*)::int n from pg_attribute where attrelid='public.notification_preferences'::regclass and attname in ('revision','incarnation') and not attisdropped")).rows[0].n, 0);
  assert.equal((await db.query("select has_any_column_privilege('authenticated','public.notification_preferences','UPDATE') allowed")).rows[0].allowed, true);
  assert.deepEqual(await policies(), beforePolicies); assert.deepEqual(await serviceAcl(), beforeService);
  await db.exec(migration);
  assert.deepEqual(await policies(), beforePolicies);
  assert.deepEqual(await serviceAcl(), beforeService);
  assert.deepEqual(await rlsFlags(), beforeRls);
  for (const role of ['anon', 'authenticated']) for (const privilege of ['INSERT', 'UPDATE']) {
    assert.equal((await db.query("select has_any_column_privilege($1,'public.notification_preferences',$2) allowed", [role, privilege])).rows[0].allowed, false);
  }
  const invoke = async (sql, parameters = []) => {
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'authenticated', sub: actor, session_id: session })]);
    await db.exec('set role authenticated');
    try { return (await db.query(sql, parameters)).rows[0].result; } finally { await db.exec('reset role'); }
  };
  const baseline = await invoke('select public.read_my_notification_preferences() result');
  assert.equal(baseline.revision, '0'); assert.equal(baseline.preferences.push_enabled, false);
  assert.equal(baseline.preferences.messages_enabled, false);
  const applied = await invoke('select public.mutate_my_notification_preferences($1,$2,$3,$4) result',
    [operation, baseline.incarnation, baseline.revision, JSON.stringify({ push_enabled: false })]);
  assert.equal(applied.status, 'applied'); assert.equal(applied.revision, '1');
  const conflict = await invoke('select public.mutate_my_notification_preferences($1,$2,$3,$4) result',
    ['86000000-0000-4000-8000-000000000002', baseline.incarnation, baseline.revision, JSON.stringify({ push_enabled: true })]);
  assert.equal(conflict.status, 'conflict'); assert.equal(conflict.preferences.push_enabled, false);
  await db.query('delete from auth.sessions where id=$1', [session]);
  await assert.rejects(invoke('select public.read_my_notification_preferences() result'), e => e.code === '42501');
  const allMigrations = fs.readdirSync('supabase/migrations').filter(name => name.endsWith('.sql'));
  assert.equal(replayReport.files.length + 2, allMigrations.length, 'all source migrations, with runtime repair and preference CAS separately applied');
  t.diagnostic(`${replayReport.files.length} historical migrations plus runtime repair and the new migration executed as actual SQL; managed infrastructure doubles, not native concurrency or deployed proof.`);
});
