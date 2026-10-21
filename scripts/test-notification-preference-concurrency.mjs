#!/usr/bin/env node
// Independent native PostgreSQL transactions, not simulated promise ordering.
// Uses only a disposable database inside the already-running LOCAL Supabase
// Docker instance. The normal migrated pgTAP suite separately covers full schema.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { sqlFunction } from '../tests/helpers/studio-authority-fixture.mjs';
import { preferenceSchema, preferenceMigration } from '../tests/helpers/notification-preference-sql-fixture.mjs';

if (process.argv.includes('--help')) {
  console.log('Requires LOCAL Supabase Docker. Creates/drops only a generated isolated fixture database. No remote URL or credentials accepted.');
  process.exit(0);
}
assert.equal(process.argv.length, 2);
const project = readFileSync('supabase/config.toml', 'utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"/m)?.[1];
assert.ok(project);
const container = process.env.SUPABASE_DB_CONTAINER || `supabase_db_${project}`;
assert.match(container, /^supabase_db_[A-Za-z0-9_.-]{1,200}$/);
const database = `notification_cas_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const lit = value => `'${String(value).replaceAll("'", "''")}'`;
const docker = (args, input) => spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
const checked = (result, label) => {
  assert.equal(result.status, 0, `${label}: ${result.error?.message || result.stderr}`);
  return result.stdout;
};
const args = (db = database) => ['exec', '-i', container, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db];
const query = (sql, db = database) => checked(docker(args(db), `${db === 'postgres' ? 'set default_transaction_read_only=on;' : ''}set statement_timeout='15s';${sql}`), 'local SQL').trim();
const actor = '8e000000-0000-4000-8000-000000000001';
const other = '8e000000-0000-4000-8000-000000000002';
const sessionA = '8f000000-0000-4000-8000-000000000001';
const sessionB = '8f000000-0000-4000-8000-000000000002';
const op = n => `89000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const auth = (session = sessionA) => `select set_config('request.jwt.claims',${lit(JSON.stringify({ role: 'authenticated', sub: actor, session_id: session }))},true);set local role authenticated;`;
const read = 'select public.read_my_notification_preferences();';
const mutate = (operation, incarnation, revision, patch) => `select public.mutate_my_notification_preferences(${lit(op(operation))}::uuid,${lit(incarnation)}::uuid,${lit(revision)},${lit(JSON.stringify(patch))}::jsonb);`;
const snapshot = () => JSON.parse(query(`begin;${auth()}${read}commit;`).split('\n').at(-1));
const receiptCount = operation => query(`select count(*) from private.notification_preference_operation_receipts where operation_id=${lit(op(operation))};`);
const parse = result => {
  assert.equal(result.code, 0, result.stderr);
  return JSON.parse(result.stdout.trim().split('\n').at(-1));
};
let created = false, checks = 0, sourceFingerprint;
const fingerprint = "select md5(jsonb_build_object('users',(select count(*) from auth.users),'preferences',(select count(*) from public.notification_preferences))::text);";
const active = new Set();
function session(name, sql, finish = false) {
  const child = spawn('docker', args(), { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', value => { stdout += value; });
  child.stderr.on('data', value => { stderr += value; });
  child.stdin.on('error', () => {});
  const done = new Promise(resolve => {
    child.on('error', error => resolve({ code: -1, stdout, stderr: error.message }));
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
  const handle = { child, done, name, output: () => stdout };
  active.add(handle);
  child.stdin.write(`set application_name=${lit(name)};begin isolation level read committed;set local statement_timeout='35s';set local idle_in_transaction_session_timeout='45s';${sql};\n`);
  if (finish) child.stdin.end('commit;\n\\q\n');
  return handle;
}
async function until(predicate, label, sessions) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    for (const item of sessions) if (item.child.exitCode !== null) {
      const result = await item.done;
      throw new Error(`${label}: backend exited before expected lock state: ${result.stderr}`);
    }
    await delay(25);
  }
  throw new Error(`Timed out observing ${label}`);
}
async function ordered(label, first, second, verify, { rollback = false, afterQueue } = {}) {
  const holderName = `preferences-holder-${checks}-${process.pid}`;
  const waiterName = `preferences-waiter-${checks}-${process.pid}`;
  const holder = session(holderName, `${first};select 'HOLDER_READY';`);
  await until(() => holder.output().includes('HOLDER_READY'), 'holder ready', [holder]);
  const waiter = session(waiterName, second, true);
  await until(() => query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${lit(holderName)}
    where w.datname=current_database() and w.application_name=${lit(waiterName)} and w.wait_event_type='Lock'
      and h.pid=any(pg_blocking_pids(w.pid));`) === '1', 'independent backend lock queue', [holder, waiter]);
  if (afterQueue) await afterQueue();
  holder.child.stdin.end(`${rollback ? 'rollback' : 'commit'};\n\\q\n`);
  const [a, b] = await Promise.all([holder.done, waiter.done]);
  active.delete(holder); active.delete(waiter);
  assert.equal(a.code, 0, a.stderr); verify(b); checks += 1;
  console.log(`PASS ${label}`);
}
try {
  if (process.env.DOCKER_HOST) assert.match(process.env.DOCKER_HOST, /^(unix|npipe):\/\//);
  assert.match(checked(docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']), 'local Docker context required').trim(), /^(unix|npipe):\/\//);
  assert.ok(checked(docker(['ps', '--filter', 'label=com.supabase.cli.project', '--format', '{{.Names}}']), 'local Supabase discovery').split('\n').includes(container));
  sourceFingerprint = query(fingerprint, 'postgres');
  checked(docker(['exec', container, 'createdb', '-U', 'postgres', '-T', 'template0', database]), 'create isolated fixture database');
  created = true;
  query(`alter database ${database} set timezone='UTC';`);
  query(`set time zone 'UTC';create schema auth;create schema private;
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz,banned_until timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
    create table public.account_deletion_requests(user_id uuid,status text,restore_deadline timestamptz,delete_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    create function auth.role() returns text language sql stable as $$select auth.jwt()->>'role'$$;
    grant usage on schema auth to anon,authenticated,service_role;`);
  for (const [file, name] of [
    ['20260824034109_creator_money_authority_integrity_closeout.sql', 'is_account_access_restricted'],
    ['20260603014500_self_service_account_deletion_30_day_restore.sql', 'is_account_deletion_scheduled'],
    ['20260826055737_exact_current_session_not_after_authority.sql', 'wave1_session_authority_readback'],
    ['202608250001_chilly_chat_room_authority_closure.sql', 'whole_app_exact_current_session_authority_internal'],
  ]) query(sqlFunction(`supabase/migrations/${file}`, name));
  query(preferenceSchema()); query(readFileSync(preferenceMigration, 'utf8'));
  query(`insert into auth.users(id,email_confirmed_at) values(${lit(actor)},now()),(${lit(other)},now());
    insert into auth.sessions(id,user_id) values(${lit(sessionA)},${lit(actor)}),(${lit(sessionB)},${lit(actor)});`);

  await ordered('competing initial reads create one unchanged default row', auth() + read, auth(sessionB) + read, result => {
    const value = parse(result); assert.equal(value.revision, '0'); assert.deepEqual(snapshot(), value);
    assert.equal(query('select count(*) from public.notification_preferences;'), '1');
  });
  let current = snapshot();
  await ordered('newer disable wins over delayed same-baseline enable',
    auth() + mutate(1, current.incarnation, current.revision, { push_enabled: false }),
    auth(sessionB) + mutate(2, current.incarnation, current.revision, { push_enabled: true }), result => {
      assert.equal(parse(result).status, 'conflict'); assert.equal(snapshot().preferences.push_enabled, false);
      assert.equal(snapshot().revision, '1');
    });
  current = snapshot();
  await ordered('same-value newer intent fences a stale opposite write',
    auth() + mutate(3, current.incarnation, current.revision, { push_enabled: false }),
    auth(sessionB) + mutate(4, current.incarnation, current.revision, { push_enabled: true }), result => {
      assert.equal(parse(result).status, 'conflict'); assert.equal(snapshot().revision, '2');
    });
  current = snapshot();
  await ordered('concurrent exact retry applies once',
    auth() + mutate(5, current.incarnation, current.revision, { in_app_enabled: false }),
    auth(sessionB) + mutate(5, current.incarnation, current.revision, { in_app_enabled: false }), result => {
      assert.equal(parse(result).status, 'applied'); assert.equal(snapshot().revision, '3'); assert.equal(receiptCount(5), '1');
    });
  current = snapshot();
  await ordered('same operation changed request cannot pass after waiting',
    auth() + mutate(6, current.incarnation, current.revision, {}),
    auth(sessionB) + mutate(6, current.incarnation, current.revision, { in_app_enabled: true }), result => {
      assert.notEqual(result.code, 0); assert.match(result.stderr, /notification_preference_operation_key_conflict/);
      assert.equal(snapshot().preferences.in_app_enabled, false); assert.equal(snapshot().revision, '4');
    });
  current = snapshot();
  await ordered('rollback leaves retry able to apply once',
    auth() + mutate(7, current.incarnation, current.revision, { push_enabled: true }),
    auth(sessionB) + mutate(7, current.incarnation, current.revision, { push_enabled: true }), result => {
      assert.equal(parse(result).status, 'applied'); assert.equal(snapshot().revision, '5'); assert.equal(receiptCount(7), '1');
    }, { rollback: true });
  current = snapshot();
  await ordered('direct service update invalidates stale captured revision',
    `set local role service_role;update public.notification_preferences set push_enabled=false,revision=0 where user_id=${lit(actor)};`,
    auth(sessionB) + mutate(8, current.incarnation, current.revision, { push_enabled: true }), result => {
      assert.equal(parse(result).status, 'conflict'); assert.equal(snapshot().revision, '6'); assert.equal(snapshot().preferences.push_enabled, false);
    });
  current = snapshot();
  await ordered('old receipt retry after competing newer intent returns current conflict',
    auth() + mutate(9, current.incarnation, current.revision, { push_enabled: true }),
    auth(sessionB) + mutate(5, current.incarnation, '2', { in_app_enabled: false }), result => {
      const value = parse(result); assert.equal(value.status, 'conflict'); assert.equal(value.revision, '7');
      assert.equal(value.preferences.push_enabled, true); assert.equal(snapshot().revision, '7');
    });
  const originalIncarnation = current.incarnation;
  for (const [label, removal, operation] of [
    ['delete/recreate', `delete from public.notification_preferences where user_id=${lit(actor)};`, 10],
    ['truncate/recreate', 'truncate public.notification_preferences;', 11],
  ]) {
    current = snapshot();
    await ordered(`${label} rejects stale generation even at revision zero`,
      `set local role service_role;${removal}insert into public.notification_preferences(user_id,revision,incarnation) values(${lit(actor)},99,${lit(current.incarnation)});`,
      auth(sessionB) + mutate(operation, current.incarnation, '0', { push_enabled: false }), result => {
        const value = parse(result); assert.equal(value.status, 'conflict'); assert.equal(value.revision, '0');
        assert.notEqual(value.incarnation, current.incarnation); assert.equal(snapshot().preferences.push_enabled, true);
      });
  }
  const oldReplay = JSON.parse(query(`begin;${auth()}${mutate(5, originalIncarnation, '2', { in_app_enabled: false })}commit;`).split('\n').at(-1));
  assert.equal(oldReplay.status, 'conflict'); assert.equal(oldReplay.incarnation, snapshot().incarnation);

  const userLock = `select pg_advisory_xact_lock(hashtextextended(${lit(`notification-preference-user:${actor}`)},0));`;
  const rowLock = `select user_id from public.notification_preferences where user_id=${lit(actor)} for update;`;
  const restoreSession = () => query(`insert into auth.sessions(id,user_id,not_after) values(${lit(sessionB)},${lit(actor)},null)
    on conflict(id) do update set user_id=excluded.user_id,not_after=null;`);
  for (const [label, lock, operation, action] of [
    ['revoked session after advisory wait', userLock, 20, 'revoke'],
    ['wrong-subject session after row wait', rowLock, 21, 'reassign'],
    ['expired session after row wait', rowLock, 22, 'expire'],
  ]) {
    restoreSession(); current = snapshot();
    await ordered(label, lock, auth(sessionB) + mutate(operation, current.incarnation, current.revision, {}), result => {
      assert.notEqual(result.code, 0); assert.match(result.stderr, /notification_preference_current_session_required/);
      assert.equal(receiptCount(operation), '0'); assert.deepEqual(snapshot(), current);
    }, { afterQueue: async () => {
      if (action === 'revoke') query(`delete from auth.sessions where id=${lit(sessionB)};`);
      if (action === 'reassign') query(`update auth.sessions set user_id=${lit(other)} where id=${lit(sessionB)};`);
      if (action === 'expire') {
        query(`update auth.sessions set not_after=clock_timestamp()+interval '100 milliseconds' where id=${lit(sessionB)};`);
        const deadline = Date.now() + 5000;
        while (query(`select clock_timestamp()>not_after from auth.sessions where id=${lit(sessionB)};`) !== 't') {
          assert.ok(Date.now() < deadline); await delay(25);
        }
      }
    } });
  }
  restoreSession();
  const receiptLock = `select pg_advisory_xact_lock(hashtextextended(${lit(`notification-preference-operation:${actor}:${op(5)}`)},0));`;
  await ordered('receipt replay rechecks revoked session after operation lock wait', receiptLock,
    auth(sessionB) + mutate(5, originalIncarnation, '2', { in_app_enabled: false }), result => {
      assert.notEqual(result.code, 0); assert.match(result.stderr, /notification_preference_current_session_required/);
      assert.equal(receiptCount(5), '1');
    }, { afterQueue: () => query(`delete from auth.sessions where id=${lit(sessionB)};`) });
  restoreSession();
  await ordered('read rechecks session after waiting', userLock, auth(sessionB) + read, result => {
    assert.notEqual(result.code, 0); assert.match(result.stderr, /notification_preference_current_session_required/);
  }, { afterQueue: () => query(`delete from auth.sessions where id=${lit(sessionB)};`) });
  for (const role of ['anon', 'authenticated']) for (const privilege of ['INSERT', 'UPDATE']) {
    assert.equal(query(`select has_any_column_privilege(${lit(role)},'public.notification_preferences',${lit(privilege)});`), 'f');
  }
  const legacyWrite = docker(args(), `begin;${auth()}update public.notification_preferences set push_enabled=false;rollback;`);
  assert.notEqual(legacyWrite.status, 0); assert.match(legacyWrite.stderr, /permission denied for table notification_preferences/);
  console.log('PASS native table/column ACL and actual legacy-write denial');
  console.log(`PASS ${checks} observed native PostgreSQL lock-queue schedules; source database unchanged, no production/provider connection.`);
} finally {
  for (const item of active) {
    if (created) query(`select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and application_name=${lit(item.name)} and pid<>pg_backend_pid();`);
    item.child.kill('SIGTERM'); await item.done;
  }
  if (created) checked(docker(['exec', container, 'dropdb', '-U', 'postgres', '--if-exists', '--force', database]), 'drop isolated fixture database');
  if (sourceFingerprint !== undefined) assert.equal(query(fingerprint, 'postgres'), sourceFingerprint, 'local source unchanged');
}
