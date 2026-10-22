#!/usr/bin/env node
// Independent native PostgreSQL transactions, not simulated promise ordering.
// Uses only a disposable database inside the already-running LOCAL Supabase
// Docker instance. The normal migrated pgTAP suite separately covers full schema.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { sqlFunction, table } from '../tests/helpers/studio-authority-fixture.mjs';
import { splitSQL } from '../tests/helpers/database-runtime-authority-fixture.mjs';
const migration = 'supabase/migrations/20261022205003_notification_registration_revision_authority.sql';
const legacy = 'supabase/migrations/202608140001_wave1_identity_entitlement_authority.sql';
const negative = process.argv.includes('--negative-control');

if (process.argv.includes('--help')) {
  console.log('Requires LOCAL Supabase Docker. Creates/drops only a generated isolated fixture database. No remote URL or credentials accepted.');
  process.exit(0);
}
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && negative));
const project = readFileSync('supabase/config.toml', 'utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"/m)?.[1];
assert.ok(project);
const container = process.env.SUPABASE_DB_CONTAINER || `supabase_db_${project}`;
assert.match(container, /^supabase_db_[A-Za-z0-9_.-]{1,200}$/);
const database = `registration_cas_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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
const credential = 'a'.repeat(64);
const subject = (install = 'fixture', provider = 'expo') => `${lit(actor)}::uuid,${lit(actor)}::uuid,${lit(sessionA)},'android',${lit(provider)},${lit(install)}`;
const read = (install = 'fixture', provider = 'expo') => `select public.read_my_push_registration_intent(${subject(install,provider)},${lit(credential)});`;
const mutate = (operation, baseline, token = 'ExpoPushToken[accepted]', install = 'fixture', provider = 'expo') =>
  `select public.register_my_push_token(${subject(install,provider)},${lit(token)},${lit(credential)},${lit('register:'+op(operation))},'granted',null,null,'{}'::jsonb,${lit(op(operation))}::uuid,${lit(baseline.incarnation)}::uuid,${lit(baseline.revision)});`;
const snapshot = (install = 'fixture', provider = 'expo') => JSON.parse(query(`begin;${auth()}${read(install,provider)}commit;`).split('\n').at(-1));
const receiptCount = operation => query(`select count(*) from private.notification_registration_receipts where operation_id=${lit(op(operation))};`);
const revoke = (install = 'fixture') => `set local role service_role;select public.wave1_revoke_push_ownership(${lit(actor)}::uuid,${lit(actor)}::uuid,${lit(sessionA)},'android',${lit(install)},${lit(credential)},'revoke:fixture','user_request');`;
const parse = result => {
  assert.equal(result.code, 0, result.stderr);
  return JSON.parse(result.stdout.trim().split('\n').at(-1));
};
let created = false, checks = 0, sourceFingerprint;
const fingerprint = "select md5(jsonb_build_object('users',(select count(*) from auth.users),'tokens',(select count(*) from public.user_push_tokens))::text);";
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
  const holderName = `registration-holder-${checks}-${process.pid}`;
  const waiterName = `registration-waiter-${checks}-${process.pid}`;
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
  query(`set check_function_bodies=false;create schema auth;create schema private;create schema extensions;create extension pgcrypto with schema extensions;
    create table auth.users(id uuid primary key,banned_until timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
    create table public.account_deletion_requests(user_id uuid,status text,restore_deadline timestamptz,delete_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema auth to authenticated;
    ${table('supabase/migrations/202605120003_d9_notifications_activity_production.sql','user_push_tokens')}
    create unique index user_push_tokens_provider_token_hash_unique on public.user_push_tokens(provider,token_hash);
    ${table(legacy,'wave1_push_installation_ownership')}
    ${table(legacy,'wave1_authority_audit_events')}`);
  for (const statement of splitSQL(readFileSync(legacy,'utf8')).filter(s=>/^alter table public\."user_push_tokens"/iu.test(s.trim()))) query(statement);
  for (const [file,name] of [
    ['20260824034109_creator_money_authority_integrity_closeout.sql','is_account_access_restricted'],
    ['20260603014500_self_service_account_deletion_30_day_restore.sql','is_account_deletion_scheduled'],
    ['20260826055737_exact_current_session_not_after_authority.sql','wave1_session_authority_readback'],
  ]) query(sqlFunction(`supabase/migrations/${file}`,name));
  for (const name of ['wave1_sha256','wave1_register_push_token','wave1_revoke_push_ownership','wave1_push_ownership_readback']) query(sqlFunction(legacy,name));
  query(`revoke all on function public.wave1_revoke_push_ownership(uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
    grant execute on function public.wave1_revoke_push_ownership(uuid,uuid,text,text,text,text,text,text) to service_role;
    insert into auth.users(id) values(${lit(actor)}),(${lit(other)});
    insert into auth.sessions(id,user_id) values(${lit(sessionA)},${lit(actor)}),(${lit(sessionB)},${lit(actor)});`);
  let repair = readFileSync(migration,'utf8');
  if (negative) {
    const weakened=repair.replace('if stream.incarnation is distinct from p_expected_incarnation or stream.revision<>expected then','if false then -- isolated negative control: intentionally remove CAS');
    assert.notEqual(weakened,repair,'negative control must remove exactly the intended guard');repair=weakened;
  }
  query(repair);
  await ordered('concurrent initial reads create one immutable stream',auth()+read(),auth()+read(),r=>{
    assert.equal(parse(r).revision,'0');assert.equal(query('select count(*) from private.notification_registration_streams;'),'1');
  });
  let current=snapshot();
  if (negative) {
    await ordered('negative control detects stale overwrite when CAS predicate is removed',auth()+mutate(1,current),auth()+mutate(2,current,'ExpoPushToken[delayed]'),r=>{
      assert.equal(parse(r).status,'registered');assert.equal(snapshot().revision,'2');
      assert.throws(()=>assert.equal(parse(r).status,'conflict'),assert.AssertionError);
    });
  } else {
    await ordered('same-baseline delayed registration conflicts after accepted registration',auth()+mutate(1,current),auth()+mutate(2,current,'ExpoPushToken[delayed]'),r=>{
      assert.equal(parse(r).status,'conflict');assert.equal(snapshot().revision,'1');
    });
    current=snapshot();
    await ordered('same-token no-op advances stream and fences stale replacement',auth()+mutate(3,current),auth()+mutate(4,current,'ExpoPushToken[stale-after-noop]'),r=>{
      assert.equal(parse(r).status,'conflict');assert.equal(snapshot().revision,'2');
    });
    current=snapshot();
    await ordered('exact concurrent retry applies once',auth()+mutate(5,current),auth()+mutate(5,current),r=>{
      assert.equal(parse(r).status,'registered');assert.equal(snapshot().revision,'3');assert.equal(receiptCount(5),'1');
    });
    current=snapshot();
    await ordered('same operation changed payload fails after receipt wait',auth()+mutate(6,current),auth()+mutate(6,current,'ExpoPushToken[changed-payload]'),r=>{
      assert.notEqual(r.code,0);assert.match(r.stderr,/operation_key_conflict/);assert.equal(snapshot().revision,'4');
    });
    current=snapshot();
    await ordered('rolled-back first contender does not consume revision or receipt',auth()+mutate(7,current),auth()+mutate(7,current),r=>{
      assert.equal(parse(r).status,'registered');assert.equal(snapshot().revision,'5');assert.equal(receiptCount(7),'1');
    },{rollback:true});
    const beforeRevoke=snapshot();
    await ordered('held revoke still wins before fresh captured registration, which re-enables',revoke(),auth()+mutate(8,beforeRevoke),r=>{
      assert.equal(parse(r).status,'registered');assert.equal(snapshot().registered,true);
    });
    const beforeOldRevoke=snapshot();
    await ordered('held delayed revoke still disables a newer accepted registration',auth()+mutate(9,beforeOldRevoke),revoke(),r=>{
      assert.equal(parse(r).status,'revoked');assert.equal(snapshot().registered,false);
    });
    current=snapshot();
    query(`begin;${auth()}${mutate(10,current)}commit;`);
    const applied=snapshot();
    await ordered('receipt replay after held revoke is retired and cannot reapply',revoke(),auth()+mutate(10,current),r=>{
      assert.equal(parse(r).status,'retired');assert.equal(snapshot().revision,applied.revision);assert.equal(snapshot().registered,false);
    });
    const globalLock="select pg_advisory_xact_lock(hashtextextended('wave1-push-authority',0));";
    current=snapshot();
    await ordered('mutation rechecks deleted exact session after global lock wait',globalLock,auth()+mutate(11,current),r=>{
      assert.notEqual(r.code,0);assert.match(r.stderr,/current_session_required/);assert.equal(receiptCount(11),'0');
    },{afterQueue:()=>query(`delete from auth.sessions where id=${lit(sessionA)};`)});
    query(`insert into auth.sessions(id,user_id) values(${lit(sessionA)},${lit(actor)});`);
    await ordered('read rechecks deleted session after global lock wait',globalLock,auth()+read(),r=>{
      assert.notEqual(r.code,0);assert.match(r.stderr,/current_session_required/);
    },{afterQueue:()=>query(`delete from auth.sessions where id=${lit(sessionA)};`)});
    query(`insert into auth.sessions(id,user_id) values(${lit(sessionA)},${lit(actor)});`);
    await ordered('replay rechecks deleted session before returning receipt',globalLock,auth()+mutate(10,current),r=>{
      assert.notEqual(r.code,0);assert.match(r.stderr,/current_session_required/);
    },{afterQueue:()=>query(`delete from auth.sessions where id=${lit(sessionA)};`)});
    query(`insert into auth.sessions(id,user_id) values(${lit(sessionA)},${lit(actor)});`);
    current=snapshot();
    const rowLock="select 1 from private.notification_registration_streams where install_id='fixture' for update;";
    await ordered('mutation rechecks deleted session after stream-row wait',rowLock,auth()+mutate(12,current),r=>{
      assert.notEqual(r.code,0);assert.match(r.stderr,/current_session_required/);assert.equal(receiptCount(12),'0');
    },{afterQueue:()=>query(`delete from auth.sessions where id=${lit(sessionA)};`)});
    query(`insert into auth.sessions(id,user_id) values(${lit(sessionA)},${lit(actor)});`);
    await ordered('read rechecks deleted session after stream-row wait',rowLock,auth()+read(),r=>{
      assert.notEqual(r.code,0);assert.match(r.stderr,/current_session_required/);
    },{afterQueue:()=>query(`delete from auth.sessions where id=${lit(sessionA)};`)});
    query(`insert into auth.sessions(id,user_id,not_after) values(${lit(sessionA)},${lit(actor)},clock_timestamp()+interval '3 seconds');`);
    await ordered('wall-clock expiry during lock wait cannot use transaction-start time',globalLock,auth()+read(),r=>{
      assert.notEqual(r.code,0);assert.match(r.stderr,/current_session_required/);
    },{afterQueue:()=>delay(3100)});
    assert.equal(query("select has_function_privilege('authenticated','public.wave1_register_push_token(uuid,uuid,text,text,text,text,text,text,text,text,text,text,jsonb)','EXECUTE');"),'f');
    console.log('PASS legacy unfenced registration ACL closed; revoke ACL retained');
  }
  console.log(`PASS ${checks} observed native PostgreSQL lock-queue schedules; ${negative?'negative control only':'registration-only source repair'}; no production/provider connection.`);
} finally {
  for (const item of active) {
    if (created) query(`select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and application_name=${lit(item.name)} and pid<>pg_backend_pid();`);
    item.child.kill('SIGTERM');await item.done;
  }
  if (created) checked(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop isolated fixture database');
  if (sourceFingerprint!==undefined) assert.equal(query(fingerprint,'postgres'),sourceFingerprint,'local source unchanged');
}
