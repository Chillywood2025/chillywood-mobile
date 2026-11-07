import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {parse} from 'yaml';
import {computeValidationPlan, evaluateRun, evaluateWorkflowSnapshot, expectedJobs} from '../../scripts/ci/required-validation.mjs';
import {NATIVE_STAGES, validateNativeProof, validateNodeTap} from '../../scripts/ci/isolated-sandbox-native.mjs';

const workflow = parse(readFileSync('.github/workflows/required-validation.yml', 'utf8'));
const policy = JSON.parse(readFileSync('config/ci/required-validation-v1.json', 'utf8'));
const jobId = 'database-isolated-sandbox-native';
const jobName = 'Validation / Isolated Sandbox Native PostgreSQL 17.6';
const command = 'node scripts/ci/isolated-sandbox-native.mjs --local-bin "$RUNNER_TEMP/isolated-sandbox-pg17/install/bin" --output-dir "$GITHUB_WORKSPACE/isolated-sandbox-native-evidence"';
const postgresSha256 = 'e0630a3600aea27511715563259ec2111cd5f4353a4b040e0be827f94cd7a8b0';
const sha = value => value.repeat(40);
const paths = ['isolated-runtime/sandbox-commerce-v1/core.sql'];
const jobs = () => expectedJobs(computeValidationPlan(paths)).map(name => ({name, status: 'completed', conclusion: 'success', headSha: sha('b')}));
const evaluate = runJobs => evaluateRun({baseRef: 'main', baseSha: sha('a'), headSha: sha('b'), paths, jobs: runJobs, author: 'contributor'});

function assertNativeGate(candidate) {
  assert.deepEqual(candidate.permissions, {contents: 'read'});
  assert.ok(candidate.on.pull_request);
  assert.equal(candidate.on.pull_request_target, undefined);
  assert.equal(candidate.on.workflow_run, undefined);
  const job = candidate.jobs[jobId];
  assert.ok(job, 'isolated native proof belongs to the canonical source workflow');
  assert.equal(job.name, jobName);
  assert.equal(job.if, "needs.plan.outputs.database == 'true'");
  assert.equal(job.needs, 'plan');
  assert.equal(job['runs-on'], 'ubuntu-24.04');
  assert.equal(job['timeout-minutes'], 25);
  assert.equal(job['continue-on-error'], undefined);
  assert.equal(job.permissions, undefined, 'inherit only read permissions');
  assert.equal(job.environment, undefined, 'source qualification receives no protected environment');
  assert.equal(job.secrets, undefined);
  assert.doesNotMatch(JSON.stringify(job), /\$\{\{\s*secrets\.|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|EXPO_TOKEN/u);
  const runners = job.steps.filter(step => step.run?.includes('node scripts/ci/isolated-sandbox-native.mjs'));
  assert.equal(runners.length, 1, 'one nonoptional native runner invocation');
  assert.equal(runners[0].run.trim(), command, 'no fallback, shell swallowing or partial mode');
  assert.equal(runners[0].if, undefined);
  for (const step of job.steps) assert.equal(step['continue-on-error'], undefined);
  const checkout = job.steps.filter(step => step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.length, 1);
  assert.equal(checkout[0].with?.['persist-credentials'], false);
  const node = job.steps.filter(step => step.uses?.startsWith('actions/setup-node@'));
  assert.equal(node.length, 1);
  assert.equal(Number(node[0].with?.['node-version']), 20);
  for (const step of job.steps.filter(step => step.uses)) assert.match(step.uses, /^[^@]+@[a-f0-9]{40}$/u);
  const install = job.steps.filter(step => step.run === 'npm ci');
  assert.equal(install.length, 1);
  assert.ok(job.steps.indexOf(install[0]) < job.steps.indexOf(runners[0]));
  const builds = job.steps.filter(step => step.run?.includes(postgresSha256));
  assert.equal(builds.length, 1, 'build the checksum-pinned official PostgreSQL archive');
  assert.equal(builds[0].if, undefined);
  assert.match(builds[0].run, /https:\/\/ftp\.postgresql\.org\/pub\/source\/v17\.6\/postgresql-17\.6\.tar\.(?:bz2|gz)/u);
  assert.match(builds[0].run, /sha256sum\s+(?:-c|--check)\b/u);
  assert.ok(job.steps.indexOf(builds[0]) < job.steps.indexOf(runners[0]));
  const upload = job.steps.filter(step => step.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(upload.length, 1);
  assert.equal(upload[0].if, 'always()');
  assert.equal(upload[0].with.path, 'isolated-sandbox-native-evidence');
  assert.equal(candidate.jobs.result.if, 'always()');
  assert.equal(candidate.jobs.result.needs.filter(name => name === jobId).length, 1);
}

test('isolated native qualification is a credential-free canonical database obligation', () => {
  assertNativeGate(workflow);
  assert.equal(policy.jobs.isolatedSandboxNative, jobName);
  for (const path of [
    ...paths,
    'isolated-runtime/sandbox-commerce-v1/tests/managed-install.native.mjs',
    'isolated-runtime/sandbox-commerce-v1/tests/availability.native.mjs',
    'isolated-runtime/sandbox-commerce-v1/tests/receipts-dispatch.fixture.mjs',
    'scripts/ci/isolated-sandbox-native.mjs',
    'tests/isolated-sandbox-commerce-client.test.mjs',
    'tests/isolated-sandbox-delivery-policy.test.mjs',
    'tests/creator-money/isolated-sandbox-provider.test.mjs',
    'tests/ci/isolated-sandbox-native-validation.test.mjs',
    '.github/workflows/required-validation.yml',
    'config/ci/required-validation-v1.json',
    'package-lock.json',
  ]) {
    const plan = computeValidationPlan([path]);
    assert.equal(plan.categories.database, true, path);
    assert.equal(expectedJobs(plan).filter(name => name === jobName).length, 1, path);
    assert.ok(expectedJobs(plan).includes('Validation / Database'), 'retain managed database validation');
    assert.ok(expectedJobs(plan).includes('Validation / Brand Native PostgreSQL 17.6'), 'retain the independent Brand proof');
  }
  assert.ok(!expectedJobs(computeValidationPlan(['docs/guide.md'])).includes(jobName));
  assert.ok(!expectedJobs(computeValidationPlan(['app/index.tsx'])).includes(jobName));
});

test('isolated native wiring rejects removed, skipped, weakened and credential-bearing work', () => {
  const mutations = {
    'missing job': candidate => { delete candidate.jobs[jobId]; },
    'skip job': candidate => { candidate.jobs[jobId].if = 'false'; },
    'ignore job failure': candidate => { candidate.jobs[jobId]['continue-on-error'] = true; },
    'privileged trigger': candidate => { candidate.on.pull_request_target = {}; },
    'write permission': candidate => { candidate.jobs[jobId].permissions = {contents: 'write'}; },
    'protected environment': candidate => { candidate.jobs[jobId].environment = 'production'; },
    'production secret': candidate => { candidate.jobs[jobId].env = {SECRET: '${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}'}; },
    'missing result dependency': candidate => { candidate.jobs.result.needs = candidate.jobs.result.needs.filter(name => name !== jobId); },
    'skip runner': (candidate, runner) => { runner.if = 'false'; },
    'ignore runner failure': (candidate, runner) => { runner['continue-on-error'] = true; },
    'remove runner': (candidate, runner) => { candidate.jobs[jobId].steps = candidate.jobs[jobId].steps.filter(step => step !== runner); },
    'duplicate runner': (candidate, runner) => { candidate.jobs[jobId].steps.push(structuredClone(runner)); },
    'swallow runner failure': (candidate, runner) => { runner.run += ' || true'; },
    'skip archive verification': candidate => { candidate.jobs[jobId].steps.find(step => step.run?.includes(postgresSha256)).if = 'false'; },
    'mutable action tag': candidate => { candidate.jobs[jobId].steps.find(step => step.uses?.startsWith('actions/checkout@')).uses = 'actions/checkout@v7'; },
    'persist checkout token': candidate => { candidate.jobs[jobId].steps.find(step => step.uses?.startsWith('actions/checkout@')).with['persist-credentials'] = true; },
    'skip failure artifact': candidate => { candidate.jobs[jobId].steps.find(step => step.uses?.startsWith('actions/upload-artifact@')).if = 'success()'; },
    'artifact parent traversal': candidate => { candidate.jobs[jobId].steps.find(step => step.uses?.startsWith('actions/upload-artifact@')).with.path = '../isolated-sandbox-native-evidence'; },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const candidate = structuredClone(workflow);
    const runner = candidate.jobs[jobId].steps.find(step => step.run?.trim() === command);
    assert.ok(runner);
    mutate(candidate, runner);
    assert.throws(() => assertNativeGate(candidate), assert.AssertionError, name);
  }
});

test('the protected publisher rejects missing, non-successful, duplicate and wrong-head isolated native work', () => {
  assert.equal(evaluate(jobs()).ok, true);
  assert.ok(evaluate(jobs().filter(job => job.name !== jobName)).findings.includes(`VALIDATION_JOB_MISSING:${jobName}`));
  for (const conclusion of ['failure', 'cancelled', 'timed_out', 'skipped', 'neutral', 'action_required']) {
    const candidate = jobs(); candidate.find(job => job.name === jobName).conclusion = conclusion;
    assert.ok(evaluate(candidate).findings.includes(`VALIDATION_JOB_NOT_SUCCESSFUL:${jobName}`), conclusion);
  }
  const pending = jobs(); pending.find(job => job.name === jobName).status = 'in_progress';
  assert.equal(evaluate(pending).ok, false);
  const wrongHead = jobs(); wrongHead.find(job => job.name === jobName).headSha = sha('c');
  assert.ok(evaluate(wrongHead).findings.includes(`VALIDATION_JOB_HEAD_INVALID:${jobName}`));
  assert.ok(evaluate([...jobs(), jobs().find(job => job.name === jobName)]).findings.includes(`VALIDATION_JOB_CARDINALITY_INVALID:${jobName}`));
});

test('a successful workflow conclusion cannot conceal skipped isolated work from protected snapshot evaluation', () => {
  const repository = 'Chillywood2025/chillywood-mobile';
  const snapshot = {
    repository,
    repositoryMetadata: {name: 'chillywood-mobile', full_name: repository, default_branch: 'main', owner: {id: 1, login: 'Chillywood2025', type: 'User'}},
    run: {event: 'pull_request', name: policy.workflowName, path: policy.workflowPath, status: 'completed', conclusion: 'success', head_sha: sha('b'),
      pull_requests: [{number: 1, head: {sha: sha('b')}, base: {ref: 'main', sha: sha('a')}}]},
    pull: {number: 1, state: 'open', base: {repo: {full_name: repository}, ref: 'main', sha: sha('a')}, head: {sha: sha('b')}, changed_files: 1, user: {login: 'contributor'}},
    files: [{filename: paths[0]}], runJobs: jobs(), reviews: [],
  };
  assert.equal(evaluateWorkflowSnapshot(snapshot).ok, true);
  for (const conclusion of ['skipped', 'timed_out']) {
    const candidate = structuredClone(snapshot);
    candidate.runJobs.find(job => job.name === jobName).conclusion = conclusion;
    assert.equal(evaluateWorkflowSnapshot(candidate).ok, false, conclusion);
  }
  snapshot.runJobs = snapshot.runJobs.filter(job => job.name !== jobName);
  assert.equal(evaluateWorkflowSnapshot(snapshot).ok, false);
});

test('Results requires isolated native success whenever database qualification applies', () => {
  const step = workflow.jobs.result.steps.find(value => value.run?.includes('const needs = JSON.parse'));
  assert.ok(step);
  const run = needs => spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', step.run], {
    encoding: 'utf8', env: {PATH: process.env.PATH, NEEDS_JSON: JSON.stringify(needs)}, timeout: 10000,
  });
  const base = {plan: {result: 'success', outputs: {database: 'true'}}, core: {result: 'success'}, 'database-brand-native': {result: 'success'}};
  assert.equal(run({...base, [jobId]: {result: 'success'}}).status, 0);
  for (const result of ['failure', 'cancelled', 'skipped', 'timed_out', 'neutral']) {
    assert.equal(run({...base, [jobId]: {result}}).status, 1, result);
  }
  assert.equal(run(base).status, 1, 'missing applicable isolated job');
  assert.equal(run({...base, plan: {result: 'success', outputs: {database: 'false'}}, [jobId]: {result: 'skipped'}}).status, 0);
});

test('the offline runner plan contains every native suite and complete client/provider checks', () => {
  const result = spawnSync(process.execPath, ['scripts/ci/isolated-sandbox-native.mjs', '--plan'], {
    encoding: 'utf8', env: {PATH: process.env.PATH}, timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.postgres.version, '17.6');
  assert.match(plan.postgres.archiveUrl, /^https:\/\/ftp\.postgresql\.org\/pub\/source\/v17\.6\/postgresql-17\.6\.tar\.(?:bz2|gz)$/u);
  assert.equal(plan.postgres.sha256, postgresSha256);
  const nativeFiles = ['managed-install', 'premium-authority', 'authority', 'core', 'declarations', 'receipts', 'availability']
    .map(name => `isolated-runtime/sandbox-commerce-v1/tests/${name}.native.mjs`);
  assert.deepEqual(plan.nativeStages.map(stage => stage.file).sort(), nativeFiles.sort());
  assert.equal(new Set(plan.nativeStages.map(stage => stage.name)).size, nativeFiles.length);
  assert.deepEqual(Object.fromEntries(plan.nativeStages.map(stage => [stage.name, stage.caseCount])), {
    'premium-authority': 46, authority: 20, core: 11, declarations: 12, receipts: 26, 'managed-install': 8, availability: 21,
  });
  for (const stage of plan.nativeStages) {
    assert.match(stage.name, /^[a-z][a-z-]+$/u);
    assert.ok(Number.isInteger(stage.caseCount) && stage.caseCount > 0);
    assert.ok(existsSync(stage.file));
  }
  assert.deepEqual(plan.nodeTests, [
    'tests/isolated-sandbox-commerce-client.test.mjs',
    'tests/isolated-sandbox-delivery-policy.test.mjs',
    'tests/creator-money/isolated-sandbox-provider.test.mjs',
  ]);
  for (const file of plan.nodeTests) assert.ok(existsSync(file), file);
  assert.equal(plan.expectedNodeTests, 52);
  assert.equal(plan.execution, 'sequential/local-only');
});

// These fabricated records exercise the validators only. They never execute a
// native harness or represent a database qualification result.
function validatorFixture(stage) {
  const modulePath = 'isolated-runtime/sandbox-commerce-v1';
  const digest = 'a'.repeat(64);
  const sourceHashes = Object.fromEntries([
    ...(stage.sourceFiles ?? []).map(file => `${modulePath}/${file}`),
    `${modulePath}/premium-authority.sql`,
    `${modulePath}/tests/premium-authority.fixture.sql`,
    `${modulePath}/tests/authority.fixture.sql`,
    stage.file,
  ].map(file => [file, digest]));
  const proof = {
    status: 'passed', engine: 'postgres (PostgreSQL) 17.6', caseCount: stage.caseCount,
    cases: Array.from({length: stage.caseCount}, (_, index) => `synthetic validator case ${index}`),
    cleanup: Object.fromEntries(stage.cleanupKeys.map(key => [key, true])),
    sourceHashes: Object.fromEntries((stage.sourceFiles ?? []).map(file => [file, digest])),
    sourceSha256: digest, fixtureSha256: digest, harnessSha256: digest, harnessHash: digest,
    fixtureHashes: {'premium-authority.fixture.sql': digest, 'authority.fixture.sql': digest},
  };
  return {proof, sourceHashes};
}

test('native proof validator rejects incomplete cases, cleanup and source identity for every stage', () => {
  for (const stage of NATIVE_STAGES) {
    const {proof, sourceHashes} = validatorFixture(stage);
    assert.doesNotThrow(() => validateNativeProof(stage, proof, sourceHashes), stage.name);
    const mutations = {
      'failed status': candidate => { candidate.status = 'failed'; },
      'changed case count': candidate => { candidate.caseCount -= 1; },
      'missing case list': candidate => { delete candidate.cases; },
      'truncated case list': candidate => { candidate.cases.pop(); },
      'non-array case list': candidate => { candidate.cases = 'x'.repeat(stage.caseCount); },
      'wrong engine': candidate => { candidate.engine = 'postgres (PostgreSQL) 17.7'; },
      'missing cleanup': candidate => { delete candidate.cleanup[stage.cleanupKeys[0]]; },
      'failed cleanup': candidate => { candidate.cleanup[stage.cleanupKeys[0]] = false; },
      'additional cleanup failure': candidate => { candidate.cleanup.unverifiedShutdown = false; },
      'wrong source hash': candidate => {
        if (stage.name === 'premium-authority') candidate.sourceSha256 = 'b'.repeat(64);
        else candidate.sourceHashes[stage.sourceFiles[0]] = 'b'.repeat(64);
      },
      'missing source identity': candidate => {
        if (stage.name === 'premium-authority') delete candidate.sourceSha256;
        else delete candidate.sourceHashes;
      },
    };
    if (stage.name !== 'premium-authority') {
      mutations['incomplete source inventory'] = candidate => { delete candidate.sourceHashes[stage.sourceFiles[0]]; };
      mutations['unexpected source inventory'] = candidate => { candidate.sourceHashes['unexpected.sql'] = 'a'.repeat(64); };
    } else {
      mutations['wrong fixture hash'] = candidate => { candidate.fixtureSha256 = 'b'.repeat(64); };
      mutations['wrong harness hash'] = candidate => { candidate.harnessSha256 = 'b'.repeat(64); };
    }
    for (const [name, mutate] of Object.entries(mutations)) {
      const candidate = structuredClone(proof); mutate(candidate);
      assert.throws(() => validateNativeProof(stage, candidate, sourceHashes), assert.AssertionError, `${stage.name}: ${name}`);
    }
  }
});

test('Node TAP validator requires all 52 tests and zero skipped, cancelled, failed or todo work', () => {
  const tap = 'TAP version 13\n1..52\n# tests 52\n# pass 52\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
  assert.deepEqual(validateNodeTap(tap), {tests: 52, pass: 52, fail: 0, cancelled: 0, skipped: 0, todo: 0});
  for (const key of ['fail', 'cancelled', 'skipped', 'todo']) {
    assert.throws(() => validateNodeTap(tap.replace(`# ${key} 0`, `# ${key} 1`)), assert.AssertionError, key);
  }
  for (const key of ['tests', 'pass']) {
    assert.throws(() => validateNodeTap(tap.replace(`# ${key} 52`, `# ${key} 51`)), assert.AssertionError, key);
  }
  for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const line = tap.split('\n').find(value => value.startsWith(`# ${key} `));
    assert.throws(() => validateNodeTap(tap.replace(line + '\n', '')), assert.AssertionError, `missing ${key}`);
    assert.throws(() => validateNodeTap(tap + line + '\n'), assert.AssertionError, `duplicate ${key}`);
  }
});
