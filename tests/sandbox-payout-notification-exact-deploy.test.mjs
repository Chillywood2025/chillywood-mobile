import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {loadBundle, classifyState, buildApplySql, deploy, sourceBinding,
  readbackSql, lockTables, requireWriteCapabilities, safeError, EXECUTION_CONTRACT, CLOSURE, VERSION, NAME, HASH, TOOL, MANIFEST, MIGRATION}
  from '../scripts/sandbox-payout-notification-exact-deploy.mjs';

const bundle = loadBundle();
const context = () => ({currentPostgres: false, currentReadOnly: true,
  sessionPostgres: false, sessionReadOnly: true, sessionAdmin: false, transactionReadOnly: true});
const ready = () => ({...structuredClone(bundle.manifest.baseline),
  context: context(), serverVersion: '17.6', historyCount: bundle.manifest.baselineHistory.count,
  priorHistorySHA256: bundle.manifest.baselineHistory.sha256, observerHistory: [],
  catalog: structuredClone(bundle.beforeCatalog), invariantsSha256: bundle.manifest.baselineInvariantsSha256,
  hooksSha256: bundle.manifest.baselineHooksSha256,
  cronReadCapability: true,
  writeCapabilities: lockTables(bundle).map(table => ({table, canLock: true}))});
const applied = () => ({...ready(), historyCount: bundle.manifest.baselineHistory.count + 1,
  observerHistory: [{version: VERSION, name: NAME, statementsSHA256: bundle.statementsSha256}],
  catalog: structuredClone(bundle.afterCatalog)});

test('immutable exact target plans read-only and cannot consume a different migration', async () => {
  assert.equal(VERSION, '20261105010859');
  assert.equal(NAME, 'sandbox_cashout_status_notifications');
  assert.equal(HASH, '032e549b053e368eef177e23579cd2f6a6db6bce34a908b68ba6ac82b4edb0dc');
  assert.equal(bundle.body, fs.readFileSync(MIGRATION, 'utf8'));
  assert.equal(classifyState(bundle, ready()), 'ready');
  assert.equal(classifyState(bundle, applied()), 'applied');
  const calls = [];
  const result = await deploy({bundle, query: async (sql, readOnly) => {
    calls.push({sql, readOnly}); return ready();
  }});
  assert.equal(result.status, 'plan_ready');
  assert.equal(result.wrote, false);
  assert.deepEqual(calls, [{sql: readbackSql(bundle), readOnly: true}]);
  assert.throws(() => buildApplySql(bundle, applied()));
});

test('history, catalog, controls, partial target and read authority drift prevent every write', async () => {
  const mutations = [
    state => {state.historyCount--;},
    state => {state.priorHistorySHA256 = '0'.repeat(64);},
    state => {state.hooksSha256 = '0'.repeat(64);},
    state => {state.context.transactionReadOnly = false;},
    state => {state.sandboxEnabled = true;},
    state => {state.sandboxExecutions = 1;},
    state => {state.sandboxQualifications = 1;},
    state => {state.workerEnabled = false;},
    state => {state.workerSchedule[0].schedule = '1 minute';},
    state => {state.workerConfigSHA256 = '0'.repeat(64);},
    state => {state.moneySwitches.payouts_enabled = 'on';},
    state => {state.discovery.primaryDeliveryEnabled = false;},
    state => {state.sandboxPredecessor.statementsSHA256 = '0'.repeat(64);},
    state => {state.catalog.functions.pop();},
    state => {state.catalog.tables[0].anonSelect = !state.catalog.tables[0].anonSelect;},
    state => {state.catalog.executionTriggers = structuredClone(bundle.afterCatalog.executionTriggers);},
    state => {state.catalog = structuredClone(bundle.afterCatalog);},
    state => {state.observerHistory = applied().observerHistory;},
  ];
  for (const mutate of mutations) {
    const state = ready(); mutate(state); let writes = 0;
    await assert.rejects(deploy({bundle, apply: true, query: async (_sql, readOnly) => {
      if (!readOnly) writes++; return state;
    }}));
    assert.equal(writes, 0);
  }
  for (const key of ['version', 'name', 'statementsSHA256']) {
    const state = applied(); state.observerHistory[0][key] = 'wrong';
    assert.throws(() => classifyState(bundle, state));
  }
});

test('exact already-applied state reconciles without a write', async () => {
  for (const apply of [false, true]) {
    let writes = 0;
    const result = await deploy({bundle, apply, query: async (_sql, readOnly) => {
      if (!readOnly) writes++; return applied();
    }});
    assert.equal(result.status, 'already_applied_verified');
    assert.equal(result.wrote, false); assert.equal(writes, 0);
  }
});

test('strict complete writer capability inventory gates absent target only', async () => {
  assert.equal(lockTables(bundle).length, 26);
  assert.equal(lockTables(bundle).includes('cron.job'), false);
  assert.deepEqual(lockTables(bundle), [...new Set(lockTables(bundle))].sort());
  const locked = buildApplySql(bundle, ready()).match(/lock table ([^;]+) in share row exclusive mode;/u)?.[1].split(',');
  assert.deepEqual(locked, lockTables(bundle), 'apply SQL locks exactly the reviewed 26 relations and not cron');
  requireWriteCapabilities(bundle, ready());
  const cases = [
    [s => {delete s.writeCapabilities;}, 'WRITE_CAPABILITY_READBACK_INVALID'],
    [s => {s.writeCapabilities.pop();}, 'WRITE_CAPABILITY_READBACK_INVALID'],
    [s => {s.writeCapabilities.reverse();}, 'WRITE_CAPABILITY_READBACK_INVALID'],
    [s => {s.writeCapabilities[0].canLock = 'true';}, 'WRITE_CAPABILITY_READBACK_INVALID'],
    [s => {s.writeCapabilities[0].extra = true;}, 'WRITE_CAPABILITY_READBACK_INVALID'],
    [s => {s.writeCapabilities[1] = s.writeCapabilities[0];}, 'WRITE_CAPABILITY_READBACK_INVALID'],
    [s => {s.cronReadCapability = false;}, 'CRON_JOB_READ_CAPABILITY_REQUIRED'],
    [s => {s.writeCapabilities[0].canLock = false;}, 'WRITE_LOCK_CAPABILITY_REQUIRED'],
  ];
  for (const [mutate, code] of cases) {
    const state = ready(); mutate(state);
    for (const apply of [false, true]) {
      let writes = 0;
      await assert.rejects(deploy({bundle, apply, query: async (_sql, readOnly) => {
        if (!readOnly) writes++; return state;
      }}), {message: code});
      assert.equal(writes, 0);
    }
    const after = applied(); mutate(after);
    assert.equal((await deploy({bundle, apply: true, query: async (_sql, readOnly) => {
      assert.equal(readOnly, true); return after;
    }})).status, 'already_applied_verified');
  }
});

test('uncertain write diagnostics expose only exact allowlisted codes and never resend', async () => {
  for (const [writeError, readError, expectedWrite, expectedRead] of [
    ['CRON_JOB_READ_CAPABILITY_REQUIRED', 'WRITE_LOCK_CAPABILITY_REQUIRED', 'CRON_JOB_READ_CAPABILITY_REQUIRED', 'WRITE_LOCK_CAPABILITY_REQUIRED'],
    ['private database detail secret_canary', 'private response secret_canary', 'PAYOUT_NOTIFICATION_DEPLOY_BLOCKED', 'PAYOUT_NOTIFICATION_DEPLOY_BLOCKED'],
    ['CRON_JOB_READ_CAPABILITY_REQUIRED\nsecret_canary', 'WRITE_LOCK_CAPABILITY_REQUIRED secret_canary', 'PAYOUT_NOTIFICATION_DEPLOY_BLOCKED', 'PAYOUT_NOTIFICATION_DEPLOY_BLOCKED'],
  ]) {
    const calls = [];
    const result = await deploy({bundle, apply: true, query: async (_sql, readOnly) => {
      calls.push(readOnly);
      if (calls.length === 1) return ready();
      throw Error(readOnly ? readError : writeError);
    }});
    assert.deepEqual(calls, [true, false, true]);
    assert.equal(result.status, 'apply_unconfirmed');
    assert.equal(result.writeFailureCode, expectedWrite);
    assert.equal(result.readbackFailureCode, expectedRead);
    assert.doesNotMatch(JSON.stringify(result), /secret_canary/);
  }
  assert.equal(safeError({code: '42501', message: 'private SQL details'}), 'PAYOUT_NOTIFICATION_DEPLOY_BLOCKED');
  let calls = 0;
  const reconciled = await deploy({bundle, apply: true, query: async (_sql, readOnly) => {
    calls++;
    if (calls === 1) return ready();
    if (!readOnly) throw Error('CRON_JOB_READ_CAPABILITY_REQUIRED');
    return applied();
  }});
  assert.equal(reconciled.status, 'applied_verified');
  assert.equal(reconciled.writeFailureCode, 'CRON_JOB_READ_CAPABILITY_REQUIRED');
  assert.equal(reconciled.readbackFailureCode, undefined);
  assert.equal(calls, 3);
});

test('confirmed and unknown writes receive exact readback once, never automatic resubmission', async () => {
  for (const responseConfirmed of [false, true]) {
    for (const observation of [applied(), ready(),
      {...applied(), invariantsSha256: 'f'.repeat(64)}, null]) {
      const calls = []; let rechecks = 0;
      const result = await deploy({bundle, apply: true, recheckSource: () => rechecks++,
        query: async (sql, readOnly) => {
          calls.push({sql, readOnly});
          if (calls.length === 1) return ready();
          if (!readOnly) {if (!responseConfirmed) throw Error('private-transport-canary'); return;}
          if (!observation) throw Error('private-read-canary');
          return observation;
        }});
      assert.equal(rechecks, 1); assert.equal(calls.length, 3);
      assert.deepEqual(calls.map(call => call.readOnly), [true, false, true]);
      const exact = observation && observation.observerHistory.length === 1 &&
        observation.invariantsSha256 === ready().invariantsSha256;
      assert.equal(result.status, exact ? 'applied_verified' : 'apply_unconfirmed');
      assert.equal(result.responseConfirmed, responseConfirmed);
      assert.doesNotMatch(JSON.stringify(result), /private-(transport|read)-canary/);
    }
  }
  let writes = 0;
  await assert.rejects(deploy({bundle, apply: true, recheckSource: () => {throw Error('changed-source');},
    query: async (_sql, readOnly) => {if (!readOnly) writes++; return ready();}}), /changed-source/);
  assert.equal(writes, 0);
});

function sourceFixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'payout-observer-source-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const git = (...args) => execFileSync('git', args, {cwd: dir, encoding: 'utf8', stdio: 'pipe'}).trim();
  git('init'); git('config', 'user.name', 'Synthetic fixture');
  git('config', 'user.email', 'fixture@example.invalid'); git('config', 'commit.gpgsign', 'false');
  for (const file of CLOSURE) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
    fs.copyFileSync(file, path.join(dir, file));
  }
  git('add', '.'); git('commit', '-m', 'synthetic committed closure');
  return {dir, git, source: git('rev-parse', 'HEAD')};
}

test('source binding rejects dirty, missing, and untracked tool substitution', t => {
  const {dir, git, source} = sourceFixture(t);
  assert.equal(sourceBinding(dir, source).source, source);
  assert.equal(loadBundle(dir, source).body, bundle.body);
  assert.throws(() => sourceBinding(dir, 'main'));
  assert.throws(() => sourceBinding(dir, '0'.repeat(40)));
  for (const file of [MIGRATION, TOOL, MANIFEST]) {
    fs.appendFileSync(path.join(dir, file), '\n// synthetic modified bytes\n');
    assert.throws(() => sourceBinding(dir, source));
    if (file === MIGRATION) assert.throws(() => loadBundle(dir));
    fs.copyFileSync(file, path.join(dir, file));
  }
  fs.unlinkSync(path.join(dir, TOOL));
  assert.throws(() => sourceBinding(dir, source));
  fs.symlinkSync(path.resolve(TOOL), path.join(dir, TOOL));
  assert.throws(() => sourceBinding(dir, source), 'even byte-identical symlink substitution is refused');
  fs.unlinkSync(path.join(dir, TOOL));
  fs.copyFileSync(TOOL, path.join(dir, TOOL));
  git('rm', '--cached', '--', TOOL); git('commit', '-m', 'synthetic missing tool');
  assert.throws(() => sourceBinding(dir, git('rev-parse', 'HEAD')));
});

test('CLI rejects alternate migration, force, and baseline substitutions before network', t => {
  const {dir, source} = sourceFixture(t);
  fs.symlinkSync(path.resolve('node_modules'), path.join(dir, 'node_modules'), 'dir');
  const guard = path.join(dir, 'deny-network.mjs');
  fs.writeFileSync(guard, "globalThis.fetch=async()=>{process.stderr.write('NETWORK_CALLED');throw Error('forbidden');};\n");
  const run = (...args) => spawnSync(process.execPath, ['--import', guard, TOOL, ...args], {
    cwd: dir, encoding: 'utf8', env: {...process.env, SUPABASE_ACCESS_TOKEN: 'synthetic-secret-canary'},
  });
  assert.equal(run('--help').status, 0);
  const offline = run('--source', source);
  assert.equal(offline.status, 0);
  const packet = JSON.parse(offline.stdout);
  assert.equal(packet.status, 'offline_review_only');
  assert.equal(packet.wrote, false);
  assert.equal(packet.source, source);
  assert.equal(packet.version, VERSION);
  assert.equal(packet.sha256, HASH);
  assert.equal(packet.readbackSql, readbackSql(bundle));
  assert.deepEqual(packet.executionContract, EXECUTION_CONTRACT);
  assert.equal(EXECUTION_CONTRACT.applicationAndHistoryLocks, 26);
  assert.equal(EXECUTION_CONTRACT.cron, 'observed_not_locked');
  assert.equal(EXECUTION_CONTRACT.independentCronEditsExcluded, false);
  assert.equal(EXECUTION_CONTRACT.freshDeploymentApprovalRequired, true);
  assert.doesNotMatch(offline.stdout + offline.stderr, /NETWORK_CALLED|synthetic-secret-canary/);
  for (const extra of [['--migration', 'other.sql'], ['--version', '20261106000000'], ['--baseline', 'x.json'],
    ['--force'], ['--apply', '--apply'], ['--source', source]]) {
    const result = run('--source', source, ...extra);
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout + result.stderr, /NETWORK_CALLED|synthetic-secret-canary/);
  }
});
