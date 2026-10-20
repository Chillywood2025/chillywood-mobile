#!/usr/bin/env node
// Real, independent PostgreSQL sessions in a disposable LOCAL database only.
// The deterministic PGlite suite does not substitute for this lock-queue proof.
// This isolated protocol fixture loads production session/collection SQL, not
// the full account/legal graph. The migrated pgTAP suite covers that graph.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { sqlFunction, table, sqlPolicy } from '../tests/helpers/studio-authority-fixture.mjs';

if (process.argv.includes('--help')) {
  console.log('Requires a running LOCAL Supabase Docker database. Creates and drops only a generated isolated fixture database. Never accepts a remote URL.');
  process.exit(0);
}
assert.equal(process.argv.length, 2);
const project = readFileSync('supabase/config.toml', 'utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"/m)?.[1];
assert.ok(project);
const container = process.env.SUPABASE_DB_CONTAINER || `supabase_db_${project}`;
assert.match(container, /^supabase_db_[A-Za-z0-9_.-]{1,200}$/);
const database = `collection_revision_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const lit = value => `'${String(value).replaceAll("'", "''")}'`;
const docker = (args, input) => spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
const checked = (result, label) => {
  assert.equal(result.status, 0, `${label}: ${result.error?.message || result.stderr}`);
  return result.stdout;
};
const args = (db = database) => ['exec', '-i', container, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db];
const query = (sql, db = database) => checked(docker(args(db), `${db === 'postgres' ? 'set default_transaction_read_only=on;' : ''}set statement_timeout='15s';${sql}`), 'local SQL').trim();
const actor = '7d000000-0000-4000-8000-000000000001';
const sessionA = '7e000000-0000-4000-8000-000000000001';
const sessionB = '7e000000-0000-4000-8000-000000000002';
const op = n => `7f000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const auth = (session = sessionA) => `select set_config('request.jwt.claims',${lit(JSON.stringify({ role: 'authenticated', sub: actor, session_id: session }))},true);set local role authenticated;`;
const mutate = (collection, title, operation, revision, value) => `select public.mutate_my_collection_state(${lit(collection)},${lit(title)},${lit(op(operation))}::uuid,${lit(revision)},${value === null ? 'null' : `${lit(JSON.stringify(value))}::jsonb`});`;
let created = false; let checks = 0; let sourceFingerprint;
const fingerprint = "select md5(jsonb_build_object('users',(select count(*) from auth.users),'saved',(select count(*) from public.user_list),'watch',(select count(*) from public.watch_history))::text);";
const active = new Set();
function session(name, sql, finish = false) {
  const child = spawn('docker', args(), { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
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
    for (const item of sessions) {
      if (item.child.exitCode !== null) {
        const result = await item.done;
        throw new Error(`${label}: backend exited before the expected lock state: ${result.stderr}`);
      }
    }
    await delay(25);
  }
  throw new Error(`Timed out observing ${label}`);
}
async function ordered(first, second, verify, { rollback = false, afterQueue } = {}) {
  const holderName = `collection-holder-${checks}-${process.pid}`;
  const waiterName = `collection-waiter-${checks}-${process.pid}`;
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
  const baseline = 'supabase/migrations/202604190004_baseline_current_schema_truth.sql';
  for (const name of ['user_list', 'watch_history']) {
    query(`${table(baseline, name)} alter table public.${name} add primary key(user_id,title_id);
      alter table public.${name} enable row level security;grant select,insert,update,delete on public.${name} to authenticated;`);
    for (const action of ['select', 'insert', 'update', 'delete']) query(sqlPolicy(baseline, `${name}_owner_${action}`));
  }
  query(readFileSync('supabase/migrations/20261020223000_user_collection_revision_authority.sql', 'utf8'));
  query(`insert into auth.users(id,email_confirmed_at) values(${lit(actor)},now());
    insert into auth.sessions(id,user_id) values(${lit(sessionA)},${lit(actor)}),(${lit(sessionB)},${lit(actor)});`);

  await ordered(auth() + mutate('saved', 'film', 1, '0', { id: 'film' }),
    auth(sessionB) + mutate('saved', 'film', 2, '0', null), result => {
      assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /"status": "conflict"/);
      assert.equal(query(`select revision from private.user_collection_states where title_id='film';`), '1');
    });
  await ordered(auth() + mutate('saved', 'film', 3, '1', null),
    auth(sessionB) + mutate('saved', 'film', 4, '0', { id: 'film' }), result => {
      assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /"status": "conflict"/);
      assert.equal(query("select revision::text||':'||(value is null)::text from private.user_collection_states where title_id='film';"), '2:true');
    });
  const start = { positionMillis: 0, completed: false, incrementPlayCount: true };
  await ordered(auth() + mutate('watch', 'duplicate', 10, '0', start),
    auth(sessionB) + mutate('watch', 'duplicate', 10, '0', start), result => {
      assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /"status": "applied"/);
      assert.equal(query("select play_count from public.watch_history where title_id='duplicate';"), '1');
      assert.equal(query(`select count(*) from private.user_collection_operation_receipts where operation_id=${lit(op(10))};`), '1');
    });
  await ordered(auth() + mutate('watch', 'competing', 11, '0', start),
    auth(sessionB) + mutate('watch', 'competing', 12, '0', start), result => {
      assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /"status": "conflict"/);
      assert.equal(query("select play_count from public.watch_history where title_id='competing';"), '1');
    });
  await ordered(auth() + mutate('saved', 'key-owner', 20, '0', { id: 'key-owner' }),
    auth(sessionB) + mutate('saved', 'key-other', 20, '0', { id: 'key-other' }), result => {
      assert.notEqual(result.code, 0); assert.match(result.stderr, /collection_operation_key_conflict/);
      assert.equal(query("select count(*) from public.user_list where title_id='key-other';"), '0');
    });
  await ordered(auth() + mutate('saved', 'rollback', 30, '0', { id: 'rollback' }),
    auth(sessionB) + mutate('saved', 'rollback', 30, '0', { id: 'rollback' }), result => {
      assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /"status": "applied"/);
      assert.equal(query("select revision from private.user_collection_states where title_id='rollback';"), '1');
    }, { rollback: true });
  const lock = `select pg_advisory_xact_lock(hashtextextended(${lit(`user-collection-title:${actor}:saved:revoked`)},0));`;
  await ordered(lock, auth(sessionB) + mutate('saved', 'revoked', 40, '0', { id: 'revoked' }), result => {
    assert.notEqual(result.code, 0); assert.match(result.stderr, /collection_current_session_required/);
    assert.equal(query("select count(*) from private.user_collection_states where title_id='revoked';"), '0');
  }, { afterQueue: () => query(`delete from auth.sessions where id=${lit(sessionB)};`) });
  query(`insert into auth.sessions(id,user_id) values(${lit(sessionB)},${lit(actor)});`);
  await ordered(lock, auth(sessionB) + mutate('saved', 'revoked', 41, '0', { id: 'revoked' }), result => {
    assert.notEqual(result.code, 0); assert.match(result.stderr, /collection_current_session_required/);
  }, { afterQueue: async () => {
    query(`update auth.sessions set not_after=clock_timestamp()+interval '100 milliseconds' where id=${lit(sessionB)};`);
    const deadline = Date.now() + 5000;
    while (query(`select clock_timestamp()>not_after from auth.sessions where id=${lit(sessionB)};`) !== 't') {
      assert.ok(Date.now() < deadline, 'server session cutoff must be observed');
      await delay(25);
    }
  } });
  console.log(`PASS ${checks} observed real PostgreSQL lock-queue interleavings. Local source unchanged; no production/provider connection used.`);
} finally {
  for (const item of active) {
    if (created) query(`select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and application_name=${lit(item.name)} and pid<>pg_backend_pid();`);
    item.child.kill('SIGTERM'); await item.done;
  }
  if (created) checked(docker(['exec', container, 'dropdb', '-U', 'postgres', '--if-exists', '--force', database]), 'drop isolated fixture database');
  if (sourceFingerprint !== undefined) assert.equal(query(fingerprint, 'postgres'), sourceFingerprint, 'local source unchanged');
}
