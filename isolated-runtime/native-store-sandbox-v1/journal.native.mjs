#!/usr/bin/env node
// Actual SQL + authenticated encrypted intake in a disposable local PostgreSQL
// 17.6 cluster. No remote URL, provider credentials, deployment or real purchase.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID, webcrypto } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
globalThis.crypto ??= webcrypto;
assert.equal(process.argv.length, 4); assert.equal(process.argv[2], '--local-bin');
const bin = process.argv[3]; assert.ok(path.isAbsolute(bin));
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..'), ts = createRequire(import.meta.url)('typescript'), cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const result = {}; cache.set(name, result);
  const source = fs.readFileSync(path.join(root, 'supabase/functions/_shared', name), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  new Function('exports', 'require', compiled.outputText)(result, specifier => load(specifier.replace(/^\.\//u, '')));
  return result;
}
const { prepareNativeStoreSandboxIntakeV1: prepare, persistNativeStoreSandboxIntakeV1: persist } = load('native-store-sandbox-bridge-v1.ts');
const { decryptLosslessRouterEnvelope: decrypt } = load('revenuecat-lossless-envelope.ts');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'native-store-journal-'));
const data = path.join(work, 'data'), port = '55489';
const db = 'journal_' + randomUUID().replaceAll('-', '');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
const args = database => ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', database];
const run = (tool, argv, input) => spawnSync(path.join(bin, tool), argv, { input, encoding: 'utf8', env, timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
const invoke = (tool, argv, input) => { const result = run(tool, argv, input); assert.equal(result.status, 0, result.stderr || result.error?.message); return result.stdout.trim(); };
const q = sql => invoke('psql', args(db), sql);
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
const sql = intake => `set role service_role; select public.native_store_sandbox_journal_v1(${literal(JSON.stringify(intake))}::jsonb);`;
const reject = (statement, pattern) => { const result = run('psql', args(db), statement); assert.notEqual(result.status, 0); assert.match(result.stderr, pattern); };
const c = { bridgeProtocol: 'native-store-sandbox-v1', connectionId: '11111111-1111-4111-8111-111111111111', connectionRevision: 1,
  projectId: 'synthetic-project', appId: 'synthetic-app', store: 'APP_STORE', environment: 'SANDBOX',
  authentication: { method: 'shared_secret', keyVersion: 'v1', secret: 'synthetic-secret-not-real-'.repeat(2) },
  encryption: { keyId: 'synthetic-key', key: new Uint8Array(32).fill(17) } };
const event = patch => ({ api_version: '1.0', event: { id: 'synthetic-event', type: 'NON_RENEWING_PURCHASE', app_id: c.appId,
  store: c.store, environment: 'SANDBOX', event_timestamp_ms: 1794139200000, app_user_id: 'synthetic-buyer', original_app_user_id: 'synthetic-buyer',
  aliases: [], product_id: 'synthetic-product', transaction_id: 'synthetic-tx', original_transaction_id: 'synthetic-chain', ...patch } });
const request = raw => new Request('https://local.invalid', { method: 'POST', body: raw, headers: { authorization: c.authentication.secret } });
const intake = raw => prepare(request(raw), c);
const callback = async value => JSON.parse(q(sql(value)));
const closed = result => { assert.equal(result.durable, true); for (const key of ['acknowledgementAllowed', 'dispatchAllowed', 'grantsAccess', 'financialAuthority']) assert.equal(result[key], false); };
let started = false; const children = []; let cases = 0;
try {
  assert.match(invoke('postgres', ['--version']), /PostgreSQL\) 17\.6/u);
  invoke('initdb', ['-D', data, '-U', 'postgres', '--encoding=UTF8', '--no-locale', '--auth=trust']);
  invoke('pg_ctl', ['-D', data, '-w', '-t', '15', '-l', path.join(work, 'server.log'), '-o', `-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port} -c autovacuum=off`, 'start']); started = true;
  invoke('psql', args('postgres'), `create database ${db};`);
  q('create role anon nologin; create role authenticated nologin; create role service_role nologin; alter default privileges for role postgres grant execute on functions to authenticated;');
  q('begin;' + fs.readFileSync(path.join(here, 'journal.sql'), 'utf8') + 'commit;');
  const raw = JSON.stringify(event({})), initial = await intake(raw);
  reject(sql(initial), /native_store_journal_disabled/u); cases++;
  for (const role of ['anon', 'authenticated']) {
    reject(`set role ${role}; select public.native_store_sandbox_journal_v1('{}');`, /permission denied/u);
    reject(`set role ${role}; select * from native_store_sandbox_v1.receipts;`, /permission denied/u);
  }
  reject('set role service_role; select * from native_store_sandbox_v1.receipts;', /permission denied/u);
  assert.equal(q("select count(*) from pg_class where relnamespace='native_store_sandbox_v1'::regnamespace and relkind='r' and (not relrowsecurity or not relforcerowsecurity);"), '0'); cases++;
  // Synthetic fixture configuration only; no production configuration API.
  q(`insert into native_store_sandbox_v1.connections values('${c.connectionId}',1,${literal(c.projectId)},${literal(c.appId)},'APP_STORE','SANDBOX','v1','synthetic-key'); update native_store_sandbox_v1.control set enabled=true;`);
  const first = await persist(request(raw), c, callback); closed(first); assert.equal(first.status, 'recorded');
  assert.equal(q('select count(*) from native_store_sandbox_v1.consumer_dispositions;'), '1'); cases++;
  const stored = JSON.parse(q(`select envelope from native_store_sandbox_v1.receipts where id='${first.receiptId}';`));
  assert.equal(new TextDecoder().decode(await decrypt(stored, c)), raw); cases++;
  const duplicate = await persist(request(raw), c, callback); closed(duplicate); assert.equal(duplicate.status, 'duplicate');
  assert.equal(duplicate.receiptId, first.receiptId); assert.equal(q('select count(*) from native_store_sandbox_v1.deliveries;'), '2'); cases++;
  const conflicting = await persist(request(JSON.stringify(event({ app_user_id: 'another-buyer' }))), c, callback);
  closed(conflicting); assert.equal(conflicting.status, 'conflict'); assert.notEqual(conflicting.receiptId, first.receiptId);
  assert.equal((await persist(request(raw), c, callback)).status, 'conflict'); cases++;
  const invalid = await persist(request('not json'), c, callback); closed(invalid); assert.equal(invalid.status, 'recorded'); cases++;
  for (const patch of [{ scopeKey: JSON.stringify(['native-store-sandbox-v1', 'revenuecat', c.projectId, 'wrong-app', c.store, 'SANDBOX']) },
    { projectId: 'wrong-project' }, { connectionRevision: 2 }, { grantsAccess: true }, { durable: true }, { disposition: null }]) {
    reject(sql({ ...initial, ...patch }), /native_store_(connection_unavailable|intake_invalid)/u);
  }
  const tampered = structuredClone(initial); tampered.envelope.observation.userId = 'changed-with-same-hash';
  reject(sql(tampered), /native_store_hash_observation_conflict/u); cases++;
  for (const table of ['connections', 'receipts', 'events', 'deliveries', 'consumer_dispositions']) {
    reject(`delete from native_store_sandbox_v1.${table};`, /native_store_journal_immutable/u);
    reject(`truncate native_store_sandbox_v1.${table} cascade;`, /native_store_journal_immutable/u);
  }
  reject(`update native_store_sandbox_v1.connections set app_id='changed';`, /native_store_journal_immutable/u); cases++;
  q(`insert into native_store_sandbox_v1.revocations(connection_id,connection_revision,reason) values('${c.connectionId}',1,'synthetic-revocation');`);
  reject(sql(initial), /native_store_connection_unavailable/u); cases++;
  q(`insert into native_store_sandbox_v1.connections values('${c.connectionId}',2,${literal(c.projectId)},${literal(c.appId)},'APP_STORE','SANDBOX','v1','synthetic-key');`);
  const c2 = { ...c, connectionRevision: 2 };
  const rotationDuplicate = await persist(request(raw), c2, callback); assert.equal(rotationDuplicate.receiptId, first.receiptId);
  assert.equal(rotationDuplicate.connectionRevision, 2); closed(rotationDuplicate); cases++;
  const raceRaw = JSON.stringify(event({ id: 'synthetic-race', transaction_id: 'synthetic-race-tx' }));
  const race = await prepare(request(raceRaw), c2);
  let output = '', errors = '';
  const child = spawn(path.join(bin, 'psql'), args(db), { env, stdio: ['pipe', 'pipe', 'pipe'] }); children.push(child);
  child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { errors += value; });
  const exited = new Promise(resolve => child.once('exit', resolve));
  // Keep the transaction open until the competing call has actually observed
  // contention. A fixed pg_sleep can expire before a slow runner reaches it.
  child.stdin.write('begin;' + sql(race) + '\n');
  const until = Date.now() + 10000; while (!output.includes('native-store-sandbox-journal-result-v1') && Date.now() < until) await delay(10);
  assert.ok(output.includes('native-store-sandbox-journal-result-v1'), errors);
  const before = Date.now(); reject(sql(race), /native_store_journal_busy/u); assert.ok(Date.now() - before < 1500);
  child.stdin.end('commit;\n');
  assert.equal(await exited, 0, errors);
  assert.equal(JSON.parse(q(sql(race))).status, 'duplicate'); cases++;

  // These sessions use explicit output rendezvous, never a timed holder sleep.
  const hold = async (statement, marker) => {
    let out = '', err = '';
    const process = spawn(path.join(bin, 'psql'), args(db), { env: { ...env, PGAPPNAME: marker }, stdio: ['pipe', 'pipe', 'pipe'] });
    children.push(process);
    process.stdout.on('data', value => { out += value; }); process.stderr.on('data', value => { err += value; });
    const done = new Promise(resolve => process.once('exit', resolve));
    process.stdin.write(`begin;${statement}select ${literal(marker)};\n`);
    const deadline = Date.now() + 10000;
    while (!out.includes(marker) && process.exitCode === null && Date.now() < deadline) await delay(10);
    assert.ok(out.includes(marker), err || 'holder rendezvous not reached');
    return { process, done, errors: () => err };
  };
  const expiry = await prepare(request(JSON.stringify(event({ id: 'synthetic-expiry', transaction_id: 'expiry-tx' }))), c2);
  const counts = () => q(`select jsonb_build_array((select count(*) from native_store_sandbox_v1.receipts),
    (select count(*) from native_store_sandbox_v1.events),(select count(*) from native_store_sandbox_v1.deliveries),
    (select count(*) from native_store_sandbox_v1.consumer_dispositions));`);
  const beforeExpiry = counts();
  const expired = await hold(sql(expiry), 'native_store_expiry_holder');
  assert.equal(counts(), beforeExpiry, 'uncommitted evidence must not be visible');
  // Observe actual server termination, rather than assuming a five-second sleep
  // proves the transaction budget was armed. A live holder after 9s is failure.
  const expiryDeadline = Date.now() + 9000;
  while (q("select count(*) from pg_stat_activity where application_name='native_store_expiry_holder';") !== '0' && Date.now() < expiryDeadline) await delay(50);
  assert.equal(q("select count(*) from pg_stat_activity where application_name='native_store_expiry_holder';"), '0', 'transaction budget did not terminate the holder');
  expired.process.stdin.end('commit;\n');
  assert.notEqual(await expired.done, 0);
  assert.match(expired.errors(), /transaction timeout|server closed the connection/u);
  assert.equal(counts(), beforeExpiry, 'expired transaction must roll back all journal rows'); cases++;

  const disabled = await hold('update native_store_sandbox_v1.control set enabled=false;', 'native_store_disable_holder');
  reject(sql(race), /could not obtain lock on row/u);
  disabled.process.stdin.end('commit;\n'); assert.equal(await disabled.done, 0, disabled.errors());
  reject(sql(race), /native_store_journal_disabled/u);
  q('update native_store_sandbox_v1.control set enabled=true;'); cases++;

  const revocation = `insert into native_store_sandbox_v1.revocations(connection_id,connection_revision,reason) values('${c.connectionId}',2,'synthetic-concurrent-revocation');`;
  const admitted = await hold(sql(race), 'native_store_admitted_holder');
  reject(`set lock_timeout='200ms';${revocation}`, /canceling statement due to lock timeout/u);
  reject("set lock_timeout='200ms';update native_store_sandbox_v1.control set enabled=false;", /canceling statement due to lock timeout/u);
  assert.equal(q(`select count(*) from native_store_sandbox_v1.revocations where connection_id='${c.connectionId}' and connection_revision=2;`), '0');
  assert.equal(q('select enabled from native_store_sandbox_v1.control;'), 't');
  admitted.process.stdin.end('commit;\n'); assert.equal(await admitted.done, 0, admitted.errors()); cases++;
  const beforeRevocation = counts();
  const revocationHolder = await hold(revocation, 'native_store_revoke_holder');
  reject(sql(race), /could not obtain lock on relation/u);
  assert.equal(counts(), beforeRevocation, 'rejected intake must not append delivery evidence');
  revocationHolder.process.stdin.end('commit;\n'); assert.equal(await revocationHolder.done, 0, revocationHolder.errors());
  reject(sql(race), /native_store_connection_unavailable/u); cases++;
  q('update native_store_sandbox_v1.control set enabled=false;');
  reject(sql(race), /native_store_journal_disabled/u); cases++;
  console.log(JSON.stringify({ protocol: 'native-store-sandbox-local-journal-proof-v1', cases, passed: cases, providerQualified: false, grantsAccess: false }));
} finally {
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  if (started) invoke('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
  fs.rmSync(work, { recursive: true, force: true });
}
