#!/usr/bin/env node
// Real declaration SQL on disposable source-derived fixtures, never a target DB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { SELLER, SELLER_SESSION, BUYER, BUYER_SESSION, fixtureApi, installSql, sqlJson, sqlText } from './receipts.fixture.mjs';

assert.equal(process.argv.length, 4); assert.equal(process.argv[2], '--local-bin');
const bin = process.argv[3]; assert.ok(path.isAbsolute(bin));
const here = path.dirname(fileURLToPath(import.meta.url)), install = installSql(here);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-declarations-native-'));
const data = path.join(work, 'data'), port = '55452', db = 'declaration_' + randomUUID().replaceAll('-', '');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
const args = database => ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', database];
const run = (tool, toolArgs, input) => spawnSync(path.join(bin, tool), toolArgs,
  { input, encoding: 'utf8', env, timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
const invoke = (tool, toolArgs, input) => {
  const out = run(tool, toolArgs, input);
  assert.equal(out.status, 0, `${tool}: ${out.stderr}\n${out.error?.message ?? ''}`);
  return out.stdout.trim();
};
const q = sql => invoke('psql', args(db), sql), runQuery = sql => run('psql', args(db), sql);
const api = fixtureApi(q, runQuery);
const payload = (patch = {}) => ({ protocol: 'sandbox-commerce-v1', requestId: randomUUID(), declared18Plus: true,
  countryCode: 'US', regionCode: 'CA', declarationVersion: 'adult-us-creator-v1', ...patch });
const commandSql = (body, user = SELLER, session = SELLER_SESSION) => api.actorPrefix(user, session)
  + `select public.isolated_sandbox_commerce_v1('creator.declare',${sqlJson(body)},${sqlText(user)},${sqlText(session)});`;
const declare = (...a) => JSON.parse(q(commandSql(...a)));
const reject = (sql, pattern) => { const out = runQuery(sql); assert.notEqual(out.status, 0, out.stdout); assert.match(out.stderr, pattern); return out; };
const state = (user = SELLER) => JSON.parse(q(`select jsonb_build_object(
  'latest',(select to_jsonb(d) from sandbox_commerce_v1.declarations d where user_id='${user}'),
  'history',(select coalesce(jsonb_agg(to_jsonb(h) order by id),'[]'::jsonb) from sandbox_commerce_v1.declaration_history h where user_id='${user}'),
  'requests',(select count(*) from sandbox_commerce_v1.requests where user_id='${user}'));`));
const reset = () => { api.reset(); q('delete from sandbox_commerce_v1.declarations;'); };
// Privileged synthetic past evidence is inserted, never produced by the API or
// disguised as provider/current target state. It exercises the real cutoff.
const seedHistory = (count, age = '1 hour', user = SELLER, session = SELLER_SESSION) => q(`
  insert into sandbox_commerce_v1.declaration_history(user_id,session_id,request_id,declared_18_plus,country_code,region_code,declaration_version,declared_at)
  select '${user}','${session}',gen_random_uuid(),true,'US','NY','adult-us-creator-v1',clock_timestamp()-interval '${age}' from generate_series(1,${count});`);
const cases = [], clients = [];
const record = (name, fn) => { fn(); cases.push(name); };
const waitFor = async (test, description) => {
  const end = Date.now() + 3000;
  while (!test() && Date.now() < end) await delay(10);
  assert.ok(test(), description + '\n' + clients.map(c => c.stderr).join('\n'));
};
const heldSession = async sql => {
  const child = spawn(path.join(bin, 'psql'), args(db), { env, stdio: ['pipe', 'pipe', 'pipe'] });
  const s = { child, stdout: '', stderr: '', closed: false, code: null }; clients.push(s);
  child.stdout.on('data', b => { s.stdout += b; }); child.stderr.on('data', b => { s.stderr += b; });
  child.on('error', e => { s.stderr += e.message; }); child.stdin.on('error', e => { s.stderr += e.message; });
  child.on('close', code => { s.closed = true; s.code = code; });
  child.stdin.write("set statement_timeout='3s';set idle_in_transaction_session_timeout='8s';begin;" + sql + "select 'DECLARATION_HELD';\n");
  await waitFor(() => s.stdout.includes('DECLARATION_HELD'), 'Local transaction did not reach held marker');
  return s;
};
const finish = async s => { s.child.stdin.end('commit;\n'); await waitFor(() => s.closed, 'Local transaction did not commit'); assert.equal(s.code, 0, s.stderr); };
let startAttempted = false, started = false, initializationAttempted = false, initialized = false, report;
const cleanup = { sessionsClosed: false, clusterStopped: false, clusterNotRunningVerified: false, directoryRemoved: false };
const began = Date.now();
try {
  const engine = invoke('postgres', ['--version']); assert.match(engine, /PostgreSQL\) 17\.6/u);
  initializationAttempted = true;
  invoke('initdb', ['-D', data, '-U', 'postgres', '--encoding=UTF8', '--no-locale', '--auth=trust']); initialized = true;
  startAttempted = true;
  invoke('pg_ctl', ['-D', data, '-w', '-t', '15', '-l', path.join(work, 'server.log'), '-o',
    `-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port} -c max_prepared_transactions=0 -c autovacuum=off`, 'start']); started = true;
  invoke('psql', args('postgres'), `create database ${db};`); q(install.sql);

  record('First accepted declaration records exact authenticated subject/session/request and one positive history entry.', () => {
    reset(); const p = payload(); assert.equal(declare(p).data.eligible, true);
    const s = state(); assert.equal(s.history.length, 1); assert.equal(s.history[0].positive_declaration, true);
    assert.equal(s.history[0].user_id, SELLER); assert.equal(s.history[0].session_id, SELLER_SESSION);
    assert.equal(s.history[0].request_id, p.requestId); assert.equal(s.history[0].declared_at, s.latest.updated_at);
    assert.equal(s.requests, 1);
  });
  record('Same current tuple and exact request replay do not append or charge, including a new valid session.', () => {
    const before = state(), p = payload(), rotated = '33333333-3333-4333-8333-333333333333';
    declare(p); declare(p);
    q(`insert into auth.sessions values('${rotated}','${SELLER}',clock_timestamp()+interval '1 hour');
      insert into public.wave1_legal_acceptances select user_id,'${rotated}',document_key,document_version,market,capability,role_key,invalidated_at
      from public.wave1_legal_acceptances where user_id='${SELLER}' and session_generation='${SELLER_SESSION}';`);
    assert.equal(declare(payload(), SELLER, rotated).data.eligible, true);
    const after = state(); assert.deepEqual(after.history, before.history); assert.deepEqual(after.latest, before.latest);
    assert.equal(after.requests, before.requests + 2);
  });
  record('Exactly ten changed positive tuples are accepted; eleventh rejects atomically while same tuple still succeeds.', () => {
    reset(); for (let i = 0; i < 10; i++) declare(payload({ regionCode: i % 2 ? 'NY' : 'CA' }));
    const before = state(); assert.equal(before.history.length, 10);
    reject(commandSql(payload({ regionCode: 'WA' })), /sandbox_creator_declaration_rate_limited/u);
    assert.deepEqual(state(), before); declare(payload({ regionCode: 'NY' })); assert.equal(state().history.length, 10);
  });
  record('New negatives of every supported form persist after quota, never consume positive quota, and veto creator eligibility.', () => {
    const negativeForms = [{ declared18Plus: false }, { countryCode: 'CA', regionCode: 'ON' }, { regionCode: null }, { regionCode: 'ZZ' }];
    for (const patch of negativeForms) {
      assert.equal(declare(payload(patch)).data.eligible, false);
      const s = state(); assert.equal(s.history.at(-1).positive_declaration, false);
      assert.equal(s.history.filter(h => h.positive_declaration).length, 10);
    }
    const before = state(); reject(commandSql(payload({ regionCode: 'NY' })), /sandbox_creator_declaration_rate_limited/u);
    assert.deepEqual(state(), before);
    reject(api.actorPrefix(SELLER, SELLER_SESSION) + `select public.isolated_sandbox_commerce_v1('resource.create',${sqlJson({ protocol: 'sandbox-commerce-v1', requestId: randomUUID(), kind: 'creator_tip', title: 'Must remain denied' })},'${SELLER}','${SELLER_SESSION}');`, /sandbox_creator_authority_required/u);
  });
  record('Alternating negative and positive evidence cannot reset quota; replay of old positive never restores it.', () => {
    reset(); const oldPositive = payload(); declare(oldPositive);
    for (let i = 1; i <= 10; i++) {
      declare(payload({ declared18Plus: false }));
      if (i < 10) declare(payload());
    }
    const before = state(); assert.equal(before.history.length, 20);
    assert.equal(declare(oldPositive).data.eligible, false); assert.deepEqual(state(), before);
    reject(commandSql(payload()), /sandbox_creator_declaration_rate_limited/u); assert.deepEqual(state(), before);
  });
  record('Rolling cutoff counts recent positives only and keeps older and negative evidence intact.', () => {
    reset(); seedHistory(9); seedHistory(1, '24 hours 1 second');
    declare(payload({ declared18Plus: false })); assert.equal(declare(payload()).data.eligible, true);
    const s = state(); assert.equal(s.history.length, 12);
    reject(commandSql(payload({ regionCode: 'NY' })), /sandbox_creator_declaration_rate_limited/u); assert.deepEqual(state(), s);
    reset(); seedHistory(10, '23 hours 59 minutes');
    reject(commandSql(payload()), /sandbox_creator_declaration_rate_limited/u);
    assert.equal(state().latest, null); assert.equal(state().requests, 0);
  });
  record('Quota is per subject; a free buyer may attest without gaining Premium or creator authority.', () => {
    declare(payload(), BUYER, BUYER_SESSION);
    assert.equal(state(BUYER).history.length, 1); assert.equal(state(BUYER).history[0].positive_declaration, true);
    assert.equal(declare(payload(), BUYER, BUYER_SESSION).data.eligible, false);
    assert.equal(q(`select count(*) from public.user_entitlements where user_id='${BUYER}';`), '0');
  });
  record('Spoofed timestamps, owner/session/quota fields and invalid types produce no current or historical writes.', () => {
    reset(); const before = state();
    for (const patch of [{ declaredAt: '2000-01-01' }, { userId: BUYER }, { sessionId: BUYER_SESSION },
      { positiveDeclaration: false }, { declared18Plus: 'true' }, { countryCode: null },
      { regionCode: 42 }, { declarationVersion: 'other' }]) {
      reject(commandSql(payload(patch)), /sandbox_(command_payload|declaration)_invalid/u); assert.deepEqual(state(), before);
    }
    declare(payload()); const p = payload({ declared18Plus: false }); declare(p);
    reject(commandSql({ ...p, declared18Plus: true }), /sandbox_idempotency_conflict/u);
    assert.equal(state().latest.declared_18_plus, false);
  });
  record('History rejects UPDATE/DELETE even by owner; runtime roles cannot read, mutate, truncate or allocate history IDs.', () => {
    const before = state();
    reject('set role sbx_v1_core_owner;update sandbox_commerce_v1.declaration_history set country_code=country_code;', /sandbox_declaration_history_immutable/u);
    reject('set role sbx_v1_core_owner;delete from sandbox_commerce_v1.declaration_history;', /sandbox_declaration_history_immutable/u);
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const sql of ['select * from sandbox_commerce_v1.declaration_history',
        'insert into sandbox_commerce_v1.declaration_history default values',
        'update sandbox_commerce_v1.declaration_history set country_code=country_code',
        'delete from sandbox_commerce_v1.declaration_history', 'truncate sandbox_commerce_v1.declaration_history',
        "select nextval('sandbox_commerce_v1.declaration_history_id_seq')"])
        reject(`set role ${role};${sql};`, /permission denied/u);
    }
    assert.equal(q("select relrowsecurity and relforcerowsecurity from pg_class where oid='sandbox_commerce_v1.declaration_history'::regclass;"), 't');
    assert.equal(q("select count(*) from pg_constraint where conrelid='sandbox_commerce_v1.declaration_history'::regclass and contype='f';"), '0');
    assert.deepEqual(state(), before);
  });
  reset();
  const holder = await heldSession(`select pg_advisory_xact_lock(hashtextextended('sandbox-declaration:${SELLER}',683));`);
  reject(commandSql(payload()), /sandbox_declaration_busy/u);
  assert.equal(state().history.length, 0); assert.equal(state().requests, 0); await finish(holder);
  cases.push('Per-subject advisory contention fails immediately without recording a declaration or request.');

  seedHistory(9);
  const tenth = await heldSession(commandSql(payload()));
  const eleventh = payload({ regionCode: 'NY' });
  reject("set statement_timeout='2s';" + commandSql(eleventh), /could not obtain lock|sandbox_declaration_busy/u);
  await finish(tenth);
  reject(commandSql(eleventh), /sandbox_creator_declaration_rate_limited/u);
  assert.equal(state().history.length, 10); assert.equal(state().requests, 1);
  cases.push('Concurrent tenth and eleventh positive changes cannot exceed quota; loser fails NOWAIT then sees committed quota.');

  record('A failed final persistence step rolls back both history and latest declaration atomically.', () => {
    reset(); const before = state();
    q("create function authority_fixture.reject_declaration_request()returns trigger language plpgsql as $$begin raise exception 'fixture_final_request_rejected';end$$;create trigger fixture_reject before insert on sandbox_commerce_v1.requests for each row execute function authority_fixture.reject_declaration_request();");
    reject(commandSql(payload()), /fixture_final_request_rejected/u); assert.deepEqual(state(), before);
    q('drop trigger fixture_reject on sandbox_commerce_v1.requests;drop function authority_fixture.reject_declaration_request();');
  });
  report = { status: 'passed', engine, caseCount: cases.length, cases, sourceHashes: install.sourceHashes,
    fixtureAdaptation: install.fixtureAdaptation,
    scope: 'Actual source SQL/ACLs on disposable synthetic minimum tables. Privileged fixture resets/past-history inserts are not runtime APIs, retention policy, deployed-schema or provider proof.',
    tradeoff: 'Ten accepted positive tuple changes per rolling 24h; negative changes have no rate cap and may grow history. Valid current account/session/legal/active generation remain required. No runtime history purge is provided.' };
} finally {
  for (const s of clients) if (!s.closed && !s.child.stdin.writableEnded) s.child.stdin.end('rollback;\n');
  assert.ok(!initializationAttempted || initialized, 'Failed bootstrap may have delayed descendants; preserve directory');
  if (startAttempted) {
    let status = run('pg_ctl', ['-D', data, 'status']);
    if (status.status === 0) {
      invoke('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '15', 'stop']); cleanup.clusterStopped = true;
      status = run('pg_ctl', ['-D', data, 'status']);
    } else if (started && status.status === 3) cleanup.clusterStopped = true;
    assert.equal(status.status, 3, 'Local cluster status uncertain; preserve directory');
    assert.ok(started, 'Failed start may have delayed descendants; preserve directory'); cleanup.clusterNotRunningVerified = true;
  } else { cleanup.clusterStopped = true; cleanup.clusterNotRunningVerified = true; }
  await waitFor(() => clients.every(s => s.closed), 'Local clients did not close'); cleanup.sessionsClosed = true;
  fs.rmSync(work, { recursive: true }); cleanup.directoryRemoved = true;
}
assert.ok(report); process.stdout.write(JSON.stringify({ ...report, durationMs: Date.now() - began, cleanup }, null, 2) + '\n');
