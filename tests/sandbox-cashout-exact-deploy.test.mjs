import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {
  loadBundle, requireQualification, classifyState, buildApplySql, deploy,
  sourceBinding, safeError, readbackSql, seedReadbackSql, CLOSURE,
  PROJECT, VERSION, NAME, HASH, TOOL, MANIFEST, MIGRATION, EDGE_FILES,
} from '../scripts/sandbox-cashout-exact-deploy.mjs';
import {
  VERSION as TIP_VERSION, NAME as TIP_NAME, HASH as TIP_HASH,
} from '../scripts/native-tip-exact-deploy.mjs';
import {
  VERSION as INGRESS_VERSION, NAME as INGRESS_NAME, HASH as INGRESS_HASH,
} from '../scripts/native-ingress-exact-deploy.mjs';

const bundle = loadBundle();
const committedManifestBytes = fs.readFileSync(MANIFEST, 'utf8');
after(() => {
  assert.equal(fs.readFileSync(MANIFEST, 'utf8'), committedManifestBytes, 'fixtures must not change the real manifest');
  assert.deepEqual(loadBundle().manifest, bundle.manifest);
});
const context = () => ({
  currentPostgres: false, currentReadOnly: true, sessionPostgres: false,
  sessionReadOnly: true, sessionAdmin: false, transactionReadOnly: true,
});
const hash = character => character.repeat(64);

// Refusal tests explicitly remove qualification from an independent bundle.
// Neither fixture can modify the committed, evidence-qualified manifest.
function unqualifiedBundle() {
  const local = structuredClone(bundle);
  local.manifest.qualification = {
    status: 'unqualified', reason: 'Synthetic negative-test fixture only.',
    observedAt: null, baseline: null, predecessorReceipts: [],
  };
  return local;
}

// These fabricated qualified contracts are exclusively transport fixtures.
function qualifiedBundle() {
  const local = structuredClone(bundle);
  local.manifest.addedCatalogSha256 = hash('d');
  local.manifest.qualification = {
    status: 'qualified',
    observedAt: '2026-11-05T03:00:00.000Z',
    baseline: {
      historyCount: 585, historyMaximum: TIP_VERSION,
      originalHistorySha256: local.originalHistorySha256,
      predecessorHistorySha256: hash('a'), existingCatalogSha256: hash('b'),
      guardedDataSha256: hash('c'),
    },
    predecessorReceipts: [
      {version: TIP_VERSION, name: TIP_NAME, migrationSha256: TIP_HASH, appliedAt: '2026-11-05T01:00:00.000Z'},
      {version: INGRESS_VERSION, name: INGRESS_NAME, migrationSha256: INGRESS_HASH, appliedAt: '2026-11-05T02:00:00.000Z'},
    ].map(receipt => ({
      ...receipt, project: PROJECT, status: 'applied_verified',
      source: '1'.repeat(40), tree: '2'.repeat(40),
    })),
  };
  return local;
}

function ready() {
  return {
    schema: 1, database: 'postgres', context: context(),
    historyCount: 585, historyMaximum: TIP_VERSION,
    originalHistorySha256: bundle.originalHistorySha256,
    predecessorHistorySha256: hash('a'), controls: true, tip: true, ingress: true,
    existingCatalogSha256: hash('b'), guardedDataSha256: hash('c'),
    sourceDataSha256: hash('e'), addedAbsent: true, addedInventory: false,
    addedCatalogSha256: hash('0'), targets: [],
  };
}

const beforeTip = () => ({...ready(), historyCount: 583, historyMaximum: '20261101215711', tip: false, ingress: false});
const afterTip = () => ({...ready(), historyCount: 584, ingress: false});
const applied = () => ({
  ...ready(), historyCount: 586, addedAbsent: false, addedInventory: true,
  addedCatalogSha256: hash('d'),
  targets: [{version: VERSION, name: NAME, statementsSha256: bundle.statementsSha256}],
});
const dormant = () => ({context: context(), dormantSeed: true});

function sourceFixture(t, {unqualified = false} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-exact-source-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const git = (...args) => execFileSync('git', args, {cwd: dir, encoding: 'utf8', stdio: 'pipe'}).trim();
  git('init');
  git('config', 'user.name', 'Synthetic fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  for (const file of CLOSURE) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
    fs.copyFileSync(file, path.join(dir, file));
  }
  if (unqualified) fs.writeFileSync(path.join(dir, MANIFEST), JSON.stringify(unqualifiedBundle().manifest, null, 2) + '\n');
  git('add', '.');
  git('commit', '-m', 'synthetic source closure');
  return {dir, git, source: git('rev-parse', 'HEAD')};
}

test('committed dormant baseline matches reviewed evidence and plans without writing', async () => {
  const evidence = JSON.parse(fs.readFileSync('docs/audits/sandbox-cashout-baseline-20261104.json', 'utf8'));
  const qualification = bundle.manifest.qualification;
  assert.equal(qualification.status, 'qualified');
  assert.deepEqual(requireQualification(bundle), evidence.baseline);
  assert.deepEqual(qualification.predecessorReceipts, evidence.predecessorReceipts);
  assert.equal(qualification.observedAt, evidence.observedAt);
  assert.equal(createHash('sha256').update(readbackSql(bundle)).digest('hex'), evidence.baselineArtifact.querySha256);
  assert.deepEqual(Object.keys(qualification.baseline).sort(), [
    'historyCount', 'historyMaximum', 'originalHistorySha256', 'predecessorHistorySha256', 'existingCatalogSha256', 'guardedDataSha256',
  ].sort());
  assert.equal(evidence.baselineReads.identicalStates, true);
  assert.ok(Date.parse(evidence.webhook.observedAt) > Date.parse(qualification.predecessorReceipts[1].appliedAt));
  assert.ok(Date.parse(qualification.observedAt) > Date.parse(evidence.webhook.observedAt));
  const reads = evidence.baselineReads;
  const state = {...ready(), ...evidence.baseline, context: reads.context, tip: reads.tip,
    ingress: reads.ingress, controls: reads.controls, addedAbsent: reads.addedAbsent,
    addedInventory: reads.addedInventory, targets: reads.targets};
  const calls = [];
  const plan = await deploy({bundle, query: async (sql, readOnly) => {calls.push({sql, readOnly}); return state;}});
  assert.equal(plan.status, 'plan_ready');
  assert.equal(plan.wrote, false);
  assert.deepEqual(calls, [{sql: readbackSql(bundle), readOnly: true}]);
  // Source-data observations remain fresh per attempt, never a committed baseline.
  for (const digest of [hash('e'), hash('f')]) assert.ok(buildApplySql(bundle, {...state, sourceDataSha256: digest}).includes(`='${digest}'`));
});

test('explicit unqualified fixture cannot send an apply write', async () => {
  const bundle = unqualifiedBundle();
  assert.equal(bundle.manifest.qualification.status, 'unqualified');
  assert.equal(bundle.manifest.qualification.baseline, null);
  assert.deepEqual(bundle.manifest.qualification.predecessorReceipts, []);
  assert.match(bundle.manifest.addedCatalogSha256, /^[a-f0-9]{64}$/);
  assert.equal(bundle.body, fs.readFileSync(MIGRATION, 'utf8'));
  assert.equal(bundle.manifest.migration.sha256, HASH);
  assert.throws(() => requireQualification(bundle), /SANDBOX_BASELINE_UNQUALIFIED/);
  assert.throws(() => buildApplySql(bundle, ready()), /SANDBOX_BASELINE_UNQUALIFIED/);
  for (const state of [beforeTip(), afterTip(), ready(), applied()]) {
    let reads = 0, writes = 0, rechecks = 0;
    await assert.rejects(deploy({
      bundle, apply: true, recheckSource: () => rechecks++,
      query: async (_sql, readOnly) => {readOnly ? reads++ : writes++; return state;},
    }), /SANDBOX_BASELINE_UNQUALIFIED/);
    assert.equal(reads, 1);
    assert.equal(writes, 0);
    assert.equal(rechecks, 0);
  }
});

test('default operation reports exact prerequisites without qualification or writes', async () => {
  const bundle = unqualifiedBundle();
  for (const [state, expected] of [
    [beforeTip(), 'blocked_until_exact_tip_deployment'],
    [afterTip(), 'blocked_until_exact_native_ingress_deployment'],
    [ready(), 'unqualified_post_predecessor_baseline'],
    [applied(), 'unqualified_post_predecessor_baseline'],
  ]) {
    const calls = [];
    const result = await deploy({bundle, query: async (sql, readOnly) => {calls.push({sql, readOnly}); return state;}});
    assert.equal(result.status, expected);
    assert.equal(result.wrote, false);
    assert.deepEqual(calls, [{sql: readbackSql(bundle), readOnly: true}]);
  }
  for (const state of [
    {...beforeTip(), controls: false}, {...beforeTip(), ingress: true},
    {...afterTip(), historyCount: 585}, {...beforeTip(), addedAbsent: false},
    {...ready(), originalHistorySha256: hash('f')},
    {...ready(), context: {...context(), transactionReadOnly: false}},
  ]) await assert.rejects(deploy({bundle, query: async (_sql, readOnly) => {assert.equal(readOnly, true); return state;}}));
});

test('qualification requires exact ordered applied receipts and complete reviewed contracts', () => {
  const valid = qualifiedBundle();
  assert.equal(requireQualification(valid), valid.manifest.qualification.baseline);
  const invalid = [
    local => {local.manifest.qualification.status = 'unqualified';},
    local => {local.manifest.qualification.baseline.historyCount = 584;},
    local => {local.manifest.qualification.baseline.historyMaximum = VERSION;},
    local => {local.manifest.qualification.baseline.originalHistorySha256 = hash('f');},
    local => {local.manifest.qualification.baseline.existingCatalogSha256 = null;},
    local => {local.manifest.addedCatalogSha256 = null;},
    local => {local.manifest.qualification.predecessorReceipts.reverse();},
    local => {local.manifest.qualification.predecessorReceipts.pop();},
    local => {local.manifest.qualification.predecessorReceipts[0].project = 'other-project';},
    local => {local.manifest.qualification.predecessorReceipts[0].migrationSha256 = hash('f');},
    local => {local.manifest.qualification.predecessorReceipts[1].status = 'plan_ready';},
    local => {local.manifest.qualification.predecessorReceipts[1].source = 'main';},
    local => {local.manifest.qualification.predecessorReceipts[1].tree = '';},
    local => {local.manifest.qualification.predecessorReceipts[1].appliedAt = 'not-a-time';},
    local => {local.manifest.qualification.predecessorReceipts[1].appliedAt = local.manifest.qualification.predecessorReceipts[0].appliedAt;},
    local => {local.manifest.qualification.observedAt = '2026-11-05T01:30:00.000Z';},
  ];
  for (const change of invalid) {
    const local = qualifiedBundle(); change(local);
    assert.throws(() => requireQualification(local));
  }
});

test('qualified transport refuses history, catalog, authority and target drift before a write', async () => {
  const local = qualifiedBundle();
  assert.equal(classifyState(local, ready()), 'ready');
  assert.equal(classifyState(local, applied()), 'applied');
  assert.equal((await deploy({bundle: local, query: async (_sql, readOnly) => {assert.equal(readOnly, true); return ready();}})).status, 'plan_ready');
  const invalid = [
    {...ready(), schema: 2}, {...ready(), database: 'other'}, {...ready(), targets: null},
    {...ready(), controls: false}, {...ready(), historyCount: 584}, {...ready(), historyMaximum: VERSION},
    {...ready(), originalHistorySha256: hash('f')}, {...ready(), predecessorHistorySha256: hash('f')},
    {...ready(), existingCatalogSha256: hash('f')}, {...ready(), guardedDataSha256: hash('f')},
    {...ready(), addedAbsent: false}, {...ready(), addedInventory: true},
    {...ready(), context: {...context(), transactionReadOnly: false}},
    {...applied(), targets: [{...applied().targets[0], name: 'wrong'}]},
    {...applied(), targets: [{...applied().targets[0], statementsSha256: hash('f')}]},
    {...applied(), addedAbsent: true}, {...applied(), addedInventory: false},
    {...applied(), addedCatalogSha256: hash('f')},
  ];
  for (const state of invalid) {
    let writes = 0;
    await assert.rejects(deploy({bundle: local, apply: true, query: async (_sql, readOnly) => {if (!readOnly) writes++; return state;}}));
    assert.equal(writes, 0);
  }
  assert.throws(() => buildApplySql(local, applied()), /APPLY_REQUIRES_ABSENT_TARGETS/);
  assert.throws(() => buildApplySql(local, {...ready(), sourceDataSha256: null}), /READBACK_INVALID/);
});

test('already applied verification remains read-only and requires the dormant seed readback', async () => {
  const local = qualifiedBundle();
  for (const apply of [false, true]) {
    const calls = [];
    const result = await deploy({bundle: local, apply, query: async (sql, readOnly) => {
      calls.push({sql, readOnly});
      return sql === seedReadbackSql ? dormant() : applied();
    }});
    assert.equal(result.status, 'already_applied_verified');
    assert.equal(result.wrote, false);
    assert.deepEqual(calls, [{sql: readbackSql(local), readOnly: true}, {sql: seedReadbackSql, readOnly: true}]);
  }
  for (const seed of [{...dormant(), dormantSeed: false}, {...dormant(), context: {...context(), transactionReadOnly: false}}]) {
    await assert.rejects(deploy({bundle: local, apply: true, query: async (sql, readOnly) => {
      assert.equal(readOnly, true); return sql === seedReadbackSql ? seed : applied();
    }}));
  }
});

test('one uncertain write is reconciled through exact catalog and seed reads, never retried', async () => {
  const local = qualifiedBundle();
  const cases = [
    {after: applied(), seed: dormant(), expected: 'applied_verified', calls: 4},
    {after: ready(), expected: 'apply_unconfirmed', calls: 3},
    {after: null, expected: 'apply_unconfirmed', calls: 3},
    {after: {...applied(), controls: false}, expected: 'apply_unconfirmed', calls: 3},
    {after: {...applied(), sourceDataSha256: hash('f')}, expected: 'apply_unconfirmed', calls: 3},
    {after: applied(), seed: {...dormant(), dormantSeed: false}, expected: 'apply_unconfirmed', calls: 4},
    {after: applied(), seed: null, expected: 'apply_unconfirmed', calls: 4},
    {after: applied(), seed: {...dormant(), context: {...context(), transactionReadOnly: false}}, expected: 'apply_unconfirmed', calls: 4},
  ];
  for (const responseConfirmed of [false, true]) for (const scenario of cases) {
    let reads = 0, writes = 0, rechecks = 0;
    const calls = [];
    const result = await deploy({
      bundle: local, apply: true, recheckSource: () => rechecks++,
      query: async (sql, readOnly) => {
        calls.push({sql, readOnly});
        if (!readOnly) {writes++; if (!responseConfirmed) throw Error('private-write-error-canary'); return undefined;}
        reads++;
        if (reads === 1) return ready();
        const observation = sql === seedReadbackSql ? scenario.seed : scenario.after;
        if (!observation) throw Error('private-read-error-canary');
        return observation;
      },
    });
    assert.equal(writes, 1);
    assert.equal(rechecks, 1);
    assert.equal(calls.length, scenario.calls);
    assert.equal(calls[0].readOnly, true);
    assert.equal(calls[1].readOnly, false);
    assert.equal(calls.slice(2).every(call => call.readOnly), true);
    assert.equal(result.status, scenario.expected);
    assert.equal(result.responseConfirmed, responseConfirmed);
    assert.equal(result.wrote, true);
    assert.doesNotMatch(JSON.stringify(result), /private-(?:read|write)-error-canary/);
  }
  let writes = 0;
  await assert.rejects(deploy({bundle: local, apply: true,
    recheckSource: () => {throw Error('source-changed');},
    query: async (_sql, readOnly) => {if (!readOnly) writes++; return ready();},
  }), /source-changed/);
  assert.equal(writes, 0);
});

test('source closure rejects changed, missing and uncommitted files without accepting endpoint scope drift', t => {
  const {dir, git, source} = sourceFixture(t);
  assert.equal(sourceBinding(dir, source).source, source);
  assert.equal(loadBundle(dir, source).body, bundle.body);
  assert.throws(() => sourceBinding(dir, '0'.repeat(40)), /SOURCE_HEAD_MISMATCH/);
  assert.throws(() => sourceBinding(dir, 'main'), /EXACT_SOURCE_REQUIRED/);
  fs.appendFileSync(path.join(dir, MIGRATION), '\n-- changed fixture\n');
  assert.throws(() => sourceBinding(dir, source), /TRACKED_SOURCE_DIRTY/);
  assert.throws(() => loadBundle(dir), /MIGRATION_HASH_MISMATCH/);
  fs.copyFileSync(MIGRATION, path.join(dir, MIGRATION));

  const edge = EDGE_FILES.find(file => file.endsWith('/creator-cashout-execution.ts'));
  fs.appendFileSync(path.join(dir, edge), '\n// changed fixture\n');
  assert.throws(() => loadBundle(dir), /EDGE_HASH_MISMATCH/);
  fs.copyFileSync(edge, path.join(dir, edge));
  for (const change of [
    manifest => {manifest.edges[0].verify_jwt = false;},
    manifest => {manifest.edges[1].verify_jwt = true;},
    manifest => {manifest.edges[0].name = 'creator-cashout-worker';},
    manifest => {manifest.edges.push(manifest.edges[0]);},
    manifest => {manifest.edges[0].files.pop();},
  ]) {
    const manifest = structuredClone(bundle.manifest); change(manifest);
    fs.writeFileSync(path.join(dir, MANIFEST), JSON.stringify(manifest));
    assert.throws(() => loadBundle(dir), /EDGE_CLOSURE_INVALID/);
  }
  fs.copyFileSync(MANIFEST, path.join(dir, MANIFEST));
  fs.unlinkSync(path.join(dir, edge));
  assert.throws(() => sourceBinding(dir, source));
  assert.throws(() => loadBundle(dir));
  fs.copyFileSync(edge, path.join(dir, edge));

  // A missing tracked closure member must not pass even if an untracked copy
  // happens to exist at the expected path.
  git('rm', '--cached', '--', edge);
  git('commit', '-m', 'synthetic omitted closure member');
  const incompleteSource = git('rev-parse', 'HEAD');
  assert.throws(() => sourceBinding(dir, incompleteSource));
});

test('CLI has no caller qualification or baseline override and unqualified apply cannot contact transport', t => {
  const {dir, source} = sourceFixture(t, {unqualified: true});
  assert.equal(loadBundle(dir, source).manifest.qualification.status, 'unqualified', 'negative fixture must be committed before its source SHA is selected');
  fs.symlinkSync(path.resolve('node_modules'), path.join(dir, 'node_modules'), 'dir');
  const guard = path.join(dir, 'deny-network.mjs');
  fs.writeFileSync(guard, "globalThis.fetch=async()=>{process.stderr.write('NETWORK_CALLED');throw Error('network-call-forbidden');};\n");
  const run = (...args) => spawnSync(process.execPath, ['--import', guard, TOOL, ...args], {
    cwd: dir, encoding: 'utf8', env: {...process.env, SUPABASE_ACCESS_TOKEN: 'synthetic-token-canary'},
  });
  const help = run('--help');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Default read-only/);
  for (const extra of [
    ['--manifest', 'caller.json'], ['--baseline', 'caller.json'],
    ['--snapshot', 'caller.json'], ['--qualify'], ['--force'],
    ['--apply', '--apply'], ['--source', source],
  ]) {
    const result = run('--source', source, ...extra);
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout + result.stderr, /NETWORK_CALLED|synthetic-token-canary/);
  }
  const blocked = run('--source', source, '--apply');
  assert.equal(blocked.status, 1);
  assert.equal(JSON.parse(blocked.stderr).code, 'SANDBOX_BASELINE_UNQUALIFIED');
  assert.doesNotMatch(blocked.stdout + blocked.stderr, /NETWORK_CALLED|synthetic-token-canary/);
});

test('diagnostics expose approved static codes only, never arbitrary provider or credential text', () => {
  assert.equal(safeError(Error('SANDBOX_BASELINE_UNQUALIFIED')), 'SANDBOX_BASELINE_UNQUALIFIED');
  assert.equal(safeError(Error('ORDERED_PREDECESSOR_RECEIPTS_REQUIRED')), 'ORDERED_PREDECESSOR_RECEIPTS_REQUIRED');
  for (const value of ['sk_test_synthetic-secret', 'PRIVATE_DATABASE_ERROR', 'Authorization: Bearer synthetic-token', 'DORMANT_SEED_MISMATCH\nprivate-details']) {
    assert.equal(safeError(Error(value)), 'SANDBOX_DEPLOY_BLOCKED');
  }
  assert.equal(safeError(null), 'SANDBOX_DEPLOY_BLOCKED');
});
