#!/usr/bin/env node
// Actual resource/delivery SQL on a disposable PostgreSQL 17.6 cluster.
// Fixture receipts, scans and provider records are synthetic, never provider proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { installResourceSql, runResourceGraphCases } from './resource-graphs.fixture.mjs';

assert.equal(process.argv.length, 4); assert.equal(process.argv[2], '--local-bin');
const bin = process.argv[3]; assert.ok(path.isAbsolute(bin));
const here = path.dirname(fileURLToPath(import.meta.url));
const install = installResourceSql(here);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-resource-native-'));
const data = path.join(work, 'data'), port = '55459', db = `resource_${randomUUID().replaceAll('-', '')}`;
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
const args = database => ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', database];
const run = (tool, toolArgs, input) => spawnSync(path.join(bin, tool), toolArgs,
  { input, encoding: 'utf8', env, timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
const invoke = (tool, toolArgs, input) => {
  const result = run(tool, toolArgs, input);
  assert.equal(result.status, 0, `${tool}: ${result.stderr}\n${result.error?.message ?? ''}`);
  return result.stdout.trim();
};
const q = sql => invoke('psql', args(db), sql);
const runQuery = sql => run('psql', args(db), sql);
let initialized = false, initializationAttempted = false, started = false, startAttempted = false, report;
const cleanup = { sessionsClosed: false, clusterStopped: false, clusterNotRunningVerified: false, directoryRemoved: false };
const began = Date.now();
try {
  const engine = invoke('postgres', ['--version']); assert.match(engine, /PostgreSQL\) 17\.6/u);
  initializationAttempted = true;
  invoke('initdb', ['-D', data, '-U', 'postgres', '--encoding=UTF8', '--no-locale', '--auth=trust']); initialized = true;
  startAttempted = true;
  invoke('pg_ctl', ['-D', data, '-w', '-t', '15', '-l', path.join(work, 'server.log'), '-o',
    `-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port} -c max_prepared_transactions=0 -c autovacuum=off`, 'start']); started = true;
  invoke('psql', args('postgres'), `create database ${db};`);
  q(install.sql);
  q(`do $$declare t regclass;begin foreach t in array array['auth.users'::regclass,'auth.sessions'::regclass,
    'public.wave1_legal_acceptances'::regclass,'public.user_entitlements'::regclass] loop
    execute format('alter table %s enable row level security',t);
    execute format('alter table %s force row level security',t);end loop;end$$;`);
  const result = await runResourceGraphCases({ q, runQuery, bin, args: args(db), env });
  assert.ok(result.cases.length > 0, 'Missing resource cases cannot pass');
  report = { status: 'passed', engine, caseCount: result.cases.length, ...result,
    sourceHashes: install.sourceHashes, fixtureAdaptation: install.fixtureAdaptation,
    scope: 'Actual local resource/delivery SQL with synthetic receipt, asset scan, room and provider fixtures. No real provider authentication, signing, playback, app UI, Supabase gateway, production or release proof.',
    fixtureLifecycleReset: 'Only privileged disposable-fixture resets reactivate the lifecycle between independent cases; the product transition remains forward-only.' };
} finally {
  assert.ok(!initializationAttempted || initialized, 'Failed bootstrap may have delayed descendants; preserve directory');
  if (startAttempted) {
    let status = run('pg_ctl', ['-D', data, 'status']);
    if (status.status === 0) {
      invoke('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '15', 'stop']); cleanup.clusterStopped = true;
      status = run('pg_ctl', ['-D', data, 'status']);
    } else if (started && status.status === 3) cleanup.clusterStopped = true;
    assert.equal(status.status, 3, 'Local cluster state uncertain; preserve directory');
    assert.ok(started, 'Failed start may have delayed descendants; preserve directory');
    cleanup.clusterNotRunningVerified = true;
  } else { cleanup.clusterStopped = true; cleanup.clusterNotRunningVerified = true; }
  cleanup.sessionsClosed = cleanup.clusterNotRunningVerified;
  fs.rmSync(work, { recursive: true }); cleanup.directoryRemoved = true;
}
assert.ok(report); process.stdout.write(JSON.stringify({ ...report, durationMs: Date.now() - began, cleanup }, null, 2) + '\n');
