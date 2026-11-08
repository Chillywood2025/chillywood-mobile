import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const harness = path.join(repo, 'isolated-runtime/receipt-router-v1/tests/legacy-source-bridge.native.mjs');
const prefix = 'LEGACY_BOOTSTRAP_DIAGNOSTICS ';

// These shims exercise the actual harness's failure/cleanup code. They do not
// execute PostgreSQL or establish any native database qualification.
function failedBootstrap(t, scenario) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-bootstrap-regression-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin'), audit = path.join(root, 'audit.jsonl');
  fs.mkdirSync(bin);
  const program = `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2), tool = path.basename(process.argv[1]);
const operation = args.includes('start') ? 'start' : args.includes('stop') ? 'stop' : args.includes('status') ? 'status' : tool;
fs.appendFileSync(process.env.NATIVE_BOOTSTRAP_AUDIT, JSON.stringify({ tool, operation, args }) + '\\n');
if (tool === 'postgres') { console.log('postgres (PostgreSQL) 17.6'); process.exit(0); }
if (tool === 'initdb') {
  fs.mkdirSync(args[args.indexOf('-D') + 1], { recursive: true });
  if (process.env.NATIVE_BOOTSTRAP_SCENARIO === 'initdb') { console.error('PRIMARY_INITDB_FAILURE'); process.exit(7); }
  console.log('INITDB_STDOUT_RETAINED'); process.exit(0);
}
if (tool === 'pg_ctl' && operation === 'start') {
  fs.writeFileSync(args[args.indexOf('-l') + 1], [
    '2026-11-07 00:00:00 UTC [1] FATAL: STARTUP_LOG_RETAINED',
    '2026-11-07 00:00:00 UTC [1] DETAIL: authorization=Bearer SYNTHETIC_CREDENTIAL',
    '2026-11-07 00:00:00 UTC [1] DETAIL: https://fixture.invalid/path?token=SYNTHETIC_SIGNED_URL',
    '2026-11-07 00:00:00 UTC [1] STATEMENT: select SYNTHETIC_PRIVATE_SQL;',
    '  SYNTHETIC_PRIVATE_SQL_CONTINUATION',
    '2026-11-07 00:00:01 UTC [1] LOG: STARTUP_LOG_END_RETAINED',
    ''
  ].join('\\n'));
  console.log('PG_CTL_START_STDOUT_RETAINED');
  console.error('PRIMARY_START_FAILURE password=SYNTHETIC_PASSWORD Bearer SYNTHETIC_STDERR_CREDENTIAL');
  process.exit(8);
}
if (tool === 'pg_ctl' && operation === 'status') process.exit(process.env.NATIVE_BOOTSTRAP_SCENARIO === 'stop' ? 0 : 3);
if (tool === 'pg_ctl' && operation === 'stop') { console.error('SECONDARY_STOP_FAILURE'); process.exit(9); }
console.error('UNEXPECTED_TOOL_OPERATION'); process.exit(99);
`;
  for (const tool of ['postgres', 'initdb', 'pg_ctl', 'psql']) {
    fs.writeFileSync(path.join(bin, tool), program, { mode: 0o700 });
  }
  const result = spawnSync(process.execPath, [harness, '--local-bin', bin], {
    cwd: repo,
    env: { ...process.env, TMPDIR: root, TMP: root, TEMP: root, NATIVE_BOOTSTRAP_AUDIT: audit, NATIVE_BOOTSTRAP_SCENARIO: scenario },
    encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
  });
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.equal(result.signal, null);
  const lines = result.stderr.split('\n').filter(line => line.startsWith(prefix));
  assert.equal(lines.length, 1, result.stderr);
  const proof = JSON.parse(lines[0].slice(prefix.length));
  assert.equal(path.dirname(proof.socketDirectory), fs.realpathSync('/tmp'));
  assert.match(path.basename(proof.socketDirectory), /^rclb-[A-Za-z0-9]+$/u);
  t.after(() => fs.rmSync(proof.socketDirectory, { recursive: true, force: true }));
  assert.equal(proof.socketDirectoryPreserved, true);
  assert.equal(fs.statSync(proof.socketDirectory).mode & 0o777, 0o700);
  assert.ok(proof.socketDirectory.length < 50, 'Unix socket path must remain short on macOS and Linux');
  const operations = fs.readFileSync(audit, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const directories = fs.readdirSync(root).filter(name => name.startsWith('receipt-legacy-bridge-'));
  assert.equal(directories.length, 1, 'uncertain cluster directory must remain for inspection');
  const cluster = path.join(root, directories[0]);
  assert.equal(proof.directoryPreserved, true);
  assert.equal(proof.cleanup.directoryRemoved, false);
  assert.equal(proof.cleanup.clusterNotRunningVerified, false);
  assert.equal(proof.cleanup.sessionsClosed, true);
  assert.equal(fs.existsSync(path.join(cluster, 'data')), true);
  assert.doesNotMatch(result.stdout, /"status"\s*:\s*"passed"/u);
  assert.ok(operations.every(entry => entry.tool !== 'psql'), 'failed bootstrap must not run database fixtures');
  for (const entry of operations.filter(entry => entry.tool === 'pg_ctl')) {
    assert.equal(entry.args[entry.args.indexOf('-D') + 1], path.join(cluster, 'data'));
    if (entry.operation === 'start') {
      const options = entry.args[entry.args.indexOf('-o') + 1];
      assert.ok(options.includes("listen_addresses=''"));
      assert.ok(options.includes(`unix_socket_directories='${proof.socketDirectory}'`));
      assert.doesNotMatch(options, /127\.0\.0\.1/u);
    }
  }
  return { result, proof, operations, cluster };
}

test('actual legacy harness preserves startup failure, redacts diagnostics, and retains an uncertain cluster', t => {
  const { result, proof, operations, cluster } = failedBootstrap(t, 'start');
  assert.equal(proof.phase, 'pg_ctl_start');
  assert.equal(proof.started, false);
  assert.equal(proof.initialized, true);
  assert.match(proof.primaryFailure.message, /PRIMARY_START_FAILURE/u);
  assert.match(proof.cleanupFailure.message, /Uncertain local cluster; preserved/u);
  assert.match(result.stderr.slice(result.stderr.indexOf('\n') + 1), /AssertionError[^]*PRIMARY_START_FAILURE/u);
  const start = proof.commands.find(entry => entry.operation === 'start');
  assert.equal(start.status, 8);
  assert.match(start.stdout, /PG_CTL_START_STDOUT_RETAINED/u);
  assert.match(start.stderr, /PRIMARY_START_FAILURE/u);
  assert.equal(proof.serverLog.path, path.join(cluster, 'server.log'));
  assert.equal(proof.serverLog.available, true);
  assert.match(proof.serverLog.text, /STARTUP_LOG_RETAINED/u);
  assert.match(proof.serverLog.text, /STARTUP_LOG_END_RETAINED/u);
  assert.doesNotMatch(result.stderr, /SYNTHETIC_(?:CREDENTIAL|SIGNED_URL|PRIVATE_SQL|PASSWORD|STDERR_CREDENTIAL)/u);
  assert.equal(operations.some(entry => entry.operation === 'stop'), false);
});

test('actual legacy harness retains initdb failure when initialization cleanup is uncertain', t => {
  const { result, proof, operations } = failedBootstrap(t, 'initdb');
  assert.equal(proof.phase, 'initdb');
  assert.equal(proof.initialized, false);
  assert.equal(proof.startAttempted, false);
  assert.equal(proof.serverLog, null);
  assert.match(proof.primaryFailure.message, /PRIMARY_INITDB_FAILURE/u);
  assert.match(proof.cleanupFailure.message, /Uncertain local initialization; preserved/u);
  assert.match(result.stderr.slice(result.stderr.indexOf('\n') + 1), /AssertionError[^]*PRIMARY_INITDB_FAILURE/u);
  assert.equal(operations.some(entry => entry.tool === 'pg_ctl'), false);
});

test('actual legacy harness records failed exact-cluster stop without replacing the startup error', t => {
  const { result, proof, operations } = failedBootstrap(t, 'stop');
  assert.match(proof.primaryFailure.message, /PRIMARY_START_FAILURE/u);
  assert.match(proof.cleanupFailure.message, /SECONDARY_STOP_FAILURE/u);
  assert.match(result.stderr.slice(result.stderr.indexOf('\n') + 1), /AssertionError[^]*PRIMARY_START_FAILURE/u);
  assert.equal(proof.cleanup.clusterStopped, false);
  const stops = operations.filter(entry => entry.operation === 'stop');
  assert.equal(stops.length, 1);
  assert.deepEqual(stops[0].args.slice(-6), ['-m', 'immediate', '-w', '-t', '15', 'stop']);
  assert.equal(proof.commands.find(entry => entry.operation === 'stop').status, 9);
});
