// Disposable Test Store fixture. Synthetic authenticated bytes are not real
// RevenueCat delivery, store behavior, target qualification or payment proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
export { BUYER, BUYER_SESSION, SELLER, SELLER_SESSION, sqlText, sqlJson, syntheticHash } from './receipts.fixture.mjs';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const fileHash = file => digest(fs.readFileSync(file));

export function installTestStoreSql(here, extraSources = []) {
  const runtime = path.dirname(here), repo = path.resolve(runtime, '../..');
  const files = ['core.sql', 'premium-authority.sql', 'authority.sql', 'commands.sql',
    'receipts.sql', 'test-store.sql', 'permissions-finalize.sql'];
  const sources = Object.fromEntries(files.map(file => [file, fs.readFileSync(path.join(runtime, file), 'utf8')]));
  const fixtures = Object.fromEntries(['premium-authority.fixture.sql', 'authority.fixture.sql']
    .map(file => [file, fs.readFileSync(path.join(here, file), 'utf8')]));
  const declaration = 'create table sandbox_commerce_v1.declarations(user_id uuid primary key,session_id uuid,\n'
    + ' declared_18_plus boolean,country_code text,region_code text,declaration_version text,updated_at timestamptz);';
  assert.equal(fixtures['authority.fixture.sql'].split(declaration).length, 2,
    'Fixture-only declarations CREATE changed; exact adaptation needs review');
  const paths = [...files.map(file => path.join(runtime, file)), ...Object.keys(fixtures).map(file => path.join(here, file)),
    path.join(here, 'test-store.fixture.mjs'), path.join(here, 'test-store.native.mjs'), ...extraSources];
  const sourceHashes = Object.fromEntries(paths.map(file => [path.relative(repo, file), fileHash(file)]));
  return {
    sql: 'begin;create role anon nologin;create role authenticated nologin;create role service_role nologin;'
      + 'alter default privileges for role postgres grant execute on functions to authenticated;'
      + sources['core.sql'] + fixtures['premium-authority.fixture.sql']
      + fixtures['authority.fixture.sql'].replace(declaration, '-- Exact declarations table comes from real core.sql.')
      + sources['premium-authority.sql'] + sources['authority.sql'] + sources['commands.sql']
      + sources['receipts.sql'] + sources['test-store.sql'] + sources['permissions-finalize.sql'] + 'commit;',
    sourceHashes,
    fixtureAdaptation: 'Removed exactly one fixture declarations CREATE; all installed product SQL is unchanged.',
    assertUnchanged() {
      for (const file of paths) assert.equal(fileHash(file), sourceHashes[path.relative(repo, file)],
        'Source changed during native execution: ' + path.relative(repo, file));
    },
  };
}

const redact = value => String(value ?? '')
  .replace(/\b(?:https?|postgres(?:ql)?):\/\/[^\s"'<>]+/giu, '[redacted URL]')
  .replace(/\b(Bearer|Basic)\s+[^\s"',;]+/giu, '$1 [redacted]')
  .replace(/\b(authorization|password|passfile|access[_-]?token|refresh[_-]?token|secret|api[_-]?key)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu, '$1=[redacted]')
  .replace(/^.*\b(?:STATEMENT|QUERY|CONTEXT):[^\n]*(?:\n(?!\d{4}-\d{2}-\d{2}[ T]|\s*(?:LOG|FATAL|ERROR|HINT|WARNING|DETAIL):)[^\n]*)*/gmu,
    '[redacted SQL context]');
const boundedText = value => redact(value).slice(-8192);

export function createTestStoreCluster(bin) {
  assert.ok(path.isAbsolute(bin), 'Only an explicit local PostgreSQL binary directory is accepted');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'isolated-test-store-native-'));
  const data = path.join(work, 'data'), baseDb = 'test_store_' + randomUUID().replaceAll('-', ''), port = '55467';
  let db = baseDb;
  const socket = fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'scv1-ts-'));
  fs.chmodSync(socket, 0o700);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
  const args = database => ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', port,
    '-U', 'postgres', '-d', database];
  const bootstrapCommands = [], sessions = new Set();
  const cleanup = { sessionsClosed: false, clusterStopped: false, clusterNotRunningVerified: false, directoryRemoved: false };
  let phase = 'version', initAttempted = false, initialized = false, startAttempted = false, started = false, failureLog;
  const run = (tool, parameters, input) => {
    const result = spawnSync(path.join(bin, tool), parameters,
      { env, input, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
    if (['postgres', 'initdb', 'pg_ctl'].includes(tool) && bootstrapCommands.length < 12) bootstrapCommands.push({
      tool, operation: parameters.includes('start') ? 'start' : parameters.includes('stop') ? 'stop'
        : parameters.includes('status') ? 'status' : tool === 'initdb' ? 'initdb' : 'version',
      status: result.status, signal: result.signal, error: result.error ? boundedText(result.error.message) : null,
      stdout: boundedText(result.stdout), stderr: boundedText(result.stderr),
    });
    return result;
  };
  const invoke = (tool, parameters, input) => {
    const result = run(tool, parameters, input);
    assert.equal(result.status, 0, `${tool}: ${boundedText(result.stderr)}\n${boundedText(result.error?.message)}`);
    return result.stdout.trim();
  };
  const q = sql => invoke('psql', args(db), sql);
  const runQuery = sql => run('psql', args(db), sql);
  const rejects = (sql, pattern) => {
    const result = runQuery(sql);
    assert.notEqual(result.status, 0, 'Expected rejection; statement unexpectedly committed');
    assert.match(result.stderr, pattern); return result;
  };
  const startupLog = () => {
    const file = path.join(work, 'server.log'); let fd;
    try {
      fd = fs.openSync(file, 'r'); const size = fs.fstatSync(fd).size, bytes = Buffer.alloc(Math.min(size, 32768));
      fs.readSync(fd, bytes, 0, bytes.length, Math.max(0, size - bytes.length));
      const text = redact(bytes.toString('utf8'));
      return { path: file, available: true, truncated: size > bytes.length || text.length > 8192, text: text.slice(-8192) };
    } catch (error) { return { path: file, available: false, error: boundedText(error.code ?? error.name) }; }
    finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* Preserve primary failure. */ } } }
  };
  async function held(sql) {
    const child = spawn(path.join(bin, 'psql'), args(db), { env, stdio: ['pipe', 'pipe', 'pipe'] });
    sessions.add(child); let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.stdin.on('error', () => {});
    const done = new Promise(resolve => child.once('close', code => { sessions.delete(child); resolve({ code, stderr }); }));
    child.stdin.write("set idle_in_transaction_session_timeout='15s';\n" + sql + "\nselect 'test_store_fixture_ready';\n");
    const deadline = Date.now() + 2500;
    while (!stdout.includes('test_store_fixture_ready') && child.exitCode === null && Date.now() < deadline) await delay(10);
    assert.ok(stdout.includes('test_store_fixture_ready'), boundedText(stderr) || 'Session readiness deadline exceeded');
    return { child, done, finish: async ending => {
      child.stdin.end(ending + ';\n'); const result = await done; assert.equal(result.code, 0, boundedText(result.stderr));
    } };
  }
  return {
    q, runQuery, rejects, held, cleanup,
    freshDatabase() {
      assert.equal(sessions.size, 0, 'A case must settle all concurrent sessions before cloning the inactive fixture');
      const next = 'test_case_' + randomUUID().replaceAll('-', '');
      invoke('psql', args('postgres'), `create database ${next} template ${baseDb};`);
      db = next;
    },
    start(sql) {
      const version = invoke('postgres', ['--version']); assert.match(version, /PostgreSQL\) 17\.6/u);
      phase = 'initdb'; initAttempted = true;
      invoke('initdb', ['-D', data, '-U', 'postgres', '--encoding=UTF8', '--no-locale', '--auth=trust']); initialized = true;
      phase = 'pg_ctl_start'; startAttempted = true;
      invoke('pg_ctl', ['-D', data, '-w', '-t', '15', '-l', path.join(work, 'server.log'), '-o',
        `-c listen_addresses='' -c unix_socket_directories='${socket}' -p ${port} -c max_prepared_transactions=0 -c autovacuum=off`, 'start']);
      started = true; phase = 'install'; invoke('psql', args('postgres'), `create database ${db};`); q(sql);
      assert.equal(q("select current_setting('listen_addresses');"), '');
      assert.equal(q("select current_setting('unix_socket_directories');"), socket);
      assert.equal(q('select inet_server_addr() is null;'), 't');
      assert.equal(fs.statSync(socket).mode & 0o777, 0o700); phase = 'cases'; return version;
    },
    captureFailure() { if (!started && startAttempted) failureLog = startupLog(); },
    async close() {
      const children = [...sessions];
      const exits = children.map(child => new Promise(resolve => child.once('close', resolve)));
      for (const child of children) child.kill('SIGTERM');
      if (exits.length) await Promise.all(exits); cleanup.sessionsClosed = true;
      if (startAttempted) {
        const status = run('pg_ctl', ['-D', data, 'status']);
        if (status.status === 0) {
          invoke('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '15', 'stop']); cleanup.clusterStopped = true;
        } else if (status.status !== 3 || !started) throw Error('Uncertain local cluster; preserved ' + work);
        assert.equal(run('pg_ctl', ['-D', data, 'status']).status, 3); cleanup.clusterNotRunningVerified = true;
      } else if (initAttempted && !initialized) throw Error('Uncertain local initialization; preserved ' + work);
      fs.rmSync(work, { recursive: true }); fs.rmSync(socket, { recursive: true }); cleanup.directoryRemoved = true;
    },
    diagnostics(primaryFailure, cleanupFailure) {
      const describe = error => error ? { name: error.name ?? 'Error', message: boundedText(error.message ?? error), code: error.code ?? null } : null;
      return { phase, primaryFailure: describe(primaryFailure), cleanupFailure: describe(cleanupFailure),
        initAttempted, initialized, startAttempted, started, commands: bootstrapCommands, serverLog: failureLog ?? null,
        directoryPreserved: fs.existsSync(work), socketDirectoryPreserved: fs.existsSync(socket), cleanup };
    },
  };
}
