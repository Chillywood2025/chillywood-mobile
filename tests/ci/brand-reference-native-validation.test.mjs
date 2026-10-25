import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {parse} from 'yaml';
import {computeValidationPlan, evaluateRun, evaluateWorkflowSnapshot, expectedJobs} from '../../scripts/ci/required-validation.mjs';

const workflow = parse(readFileSync('.github/workflows/required-validation.yml', 'utf8'));
const policy = JSON.parse(readFileSync('config/ci/required-validation-v1.json', 'utf8'));
const jobId = 'database-brand-native';
const jobName = 'Validation / Brand Native PostgreSQL 17.6';
const command = 'node tests/brand-reference-native-ci.mjs';
const sha = value => value.repeat(40);
const paths = ['supabase/migrations/20261025141347_platform_brand_reference_candidate_indexes.sql'];
const jobs = () => expectedJobs(computeValidationPlan(paths)).map(name => ({name, status: 'completed', conclusion: 'success', headSha: sha('b')}));
const evaluate = runJobs => evaluateRun({baseRef: 'main', baseSha: sha('a'), headSha: sha('b'), paths, jobs: runJobs, author: 'contributor'});

function assertNativeGate(candidate) {
  const job = candidate.jobs[jobId];
  assert.ok(job, 'native qualification belongs to the canonical source workflow');
  assert.equal(job.name, jobName);
  assert.equal(job.if, "needs.plan.outputs.database == 'true'");
  assert.equal(job.needs, 'plan');
  assert.equal(job['runs-on'], 'ubuntu-24.04');
  assert.equal(job['timeout-minutes'], 75);
  assert.equal(job['continue-on-error'], undefined);
  assert.equal(job.permissions, undefined, 'inherit only canonical read permissions');
  const steps = job.steps.filter(step => step.run?.split('\n').includes(command));
  assert.equal(steps.length, 1, 'one native qualification invocation');
  assert.equal(steps[0].run, command, 'no shell fallback or extra modes');
  assert.equal(steps[0].if, undefined);
  assert.equal(steps[0]['continue-on-error'], undefined);
  assert.equal(job.steps.filter(step => step.run === 'npm ci').length, 1);
  assert.ok(job.steps.findIndex(step => step.run === 'npm ci') < job.steps.indexOf(steps[0]));
  for (const step of job.steps) assert.equal(step['continue-on-error'], undefined);
  const upload = job.steps.filter(step => step.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(upload.length, 1);
  assert.equal(upload[0].if, 'always()');
  assert.match(upload[0].uses, /^actions\/upload-artifact@[a-f0-9]{40}$/);
  assert.equal(upload[0].with.path, 'brand-native-evidence', 'artifact v7 requires a workspace path without parent traversal');
  const collectors = job.steps.filter(step => step.run === command + ' --collect-evidence');
  assert.equal(collectors.length, 1, 'failure evidence has an independent collection step');
  assert.equal(collectors[0].if, 'always()');
  assert.ok(job.steps.indexOf(collectors[0]) < job.steps.indexOf(upload[0]));
  assert.equal(candidate.jobs.result.if, 'always()');
  assert.equal(candidate.jobs.result.needs.filter(name => name === jobId).length, 1);
}

test('Brand native qualification is an unconditional database obligation in the canonical workflow', () => {
  assertNativeGate(workflow);
  assert.equal(policy.jobs.brandNative, jobName);
  assert.deepEqual(workflow.permissions, {contents: 'read'});
  assert.ok(workflow.on.pull_request);
  assert.equal(workflow.on.pull_request_target, undefined);
  assert.equal(existsSync('.github/workflows/brand-reference-native-qualification.yml'), false,
    'no separate supplemental workflow can be mistaken for canonical qualification');
  for (const path of [paths[0], 'supabase/tests/platform_brand_global_retention_test.sql',
    'tests/brand-reference-native-ci.mjs', 'tests/brand-reference-normalized-pilot-native.mjs',
    'tests/brand-reference-native-shutdown.test.mjs', 'tests/helpers/brand-reference-native-shutdown.mjs',
    'tests/brand-reference-native-readiness.test.mjs', 'tests/helpers/brand-reference-native-readiness.mjs',
    'tests/helpers/brand-reference-native-target.mjs', 'tests/helpers/brand-reference-scan-corpus.mjs',
    'tests/helpers/database-runtime-authority-fixture.mjs', 'tests/fixtures/database-managed-schema-20261015.json',
    'tests/fixtures/brand-reference-normalized-ddl-guard-candidate.sql', 'package-lock.json']) {
    const plan = computeValidationPlan([path]);
    assert.equal(plan.categories.database, true, path);
    assert.equal(expectedJobs(plan).filter(name => name === jobName).length, 1, path);
    assert.ok(expectedJobs(plan).includes('Validation / Database'), 'retain managed Supabase validation');
  }
  assert.ok(!expectedJobs(computeValidationPlan(['docs/guide.md'])).includes(jobName));
  assert.ok(!expectedJobs(computeValidationPlan(['app/index.tsx'])).includes(jobName));
});

test('native workflow wiring rejects omission, skips, ignored failures and duplicate execution', () => {
  for (const mutation of ['missing-job', 'skip-job', 'skip-step', 'ignore-job', 'ignore-step', 'duplicate', 'shell-swallow', 'missing-result', 'skip-artifact', 'parent-artifact-path', 'skip-collection', 'missing-collection']) {
    const changed = structuredClone(workflow), job = changed.jobs[jobId];
    const step = job.steps.find(value => value.run === command);
    if (mutation === 'missing-job') delete changed.jobs[jobId];
    if (mutation === 'skip-job') job.if = 'false';
    if (mutation === 'skip-step') step.if = 'false';
    if (mutation === 'ignore-job') job['continue-on-error'] = true;
    if (mutation === 'ignore-step') step['continue-on-error'] = true;
    if (mutation === 'duplicate') job.steps.push(structuredClone(step));
    if (mutation === 'shell-swallow') step.run += ' || true';
    if (mutation === 'missing-result') changed.jobs.result.needs = changed.jobs.result.needs.filter(name => name !== jobId);
    if (mutation === 'skip-artifact') job.steps.find(value => value.uses?.startsWith('actions/upload-artifact@')).if = 'success()';
    if (mutation === 'parent-artifact-path') job.steps.find(value => value.uses?.startsWith('actions/upload-artifact@')).with.path = '../brand-reference-*.json';
    if (mutation === 'skip-collection') job.steps.find(value => value.run === command + ' --collect-evidence').if = 'success()';
    if (mutation === 'missing-collection') job.steps = job.steps.filter(value => value.run !== command + ' --collect-evidence');
    assert.throws(() => assertNativeGate(changed), assert.AssertionError, mutation);
  }
});

test('protected publisher rejects absent, unsuccessful, duplicate and wrong-head native jobs', () => {
  assert.equal(evaluate(jobs()).ok, true);
  assert.equal(evaluate(jobs().filter(job => job.name !== jobName)).ok, false);
  for (const conclusion of ['failure', 'cancelled', 'timed_out', 'skipped', 'neutral', 'action_required']) {
    const candidate = jobs();candidate.find(job => job.name === jobName).conclusion = conclusion;
    const result = evaluate(candidate);
    assert.equal(result.ok, false, conclusion);
    assert.ok(result.findings.includes(`VALIDATION_JOB_NOT_SUCCESSFUL:${jobName}`));
  }
  const pending = jobs();pending.find(job => job.name === jobName).status = 'in_progress';
  assert.equal(evaluate(pending).ok, false);
  const stale = jobs();stale.find(job => job.name === jobName).headSha = sha('c');
  assert.ok(evaluate(stale).findings.includes(`VALIDATION_JOB_HEAD_INVALID:${jobName}`));
  assert.ok(evaluate([...jobs(), jobs().find(job => job.name === jobName)]).findings.includes(`VALIDATION_JOB_CARDINALITY_INVALID:${jobName}`));
});

test('a successful source run cannot hide a skipped native job from the protected snapshot evaluator', () => {
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
  snapshot.runJobs.find(job => job.name === jobName).conclusion = 'skipped';
  assert.equal(evaluateWorkflowSnapshot(snapshot).ok, false);
  snapshot.runJobs = snapshot.runJobs.filter(job => job.name !== jobName);
  assert.equal(evaluateWorkflowSnapshot(snapshot).ok, false);
});

test('Results executes failure checks for missing or skipped applicable native qualification', () => {
  const step = workflow.jobs.result.steps.find(value => value.run?.includes('const needs = JSON.parse'));
  assert.ok(step);
  const run = needs => spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', step.run], {
    encoding: 'utf8', env: {PATH: process.env.PATH, NEEDS_JSON: JSON.stringify(needs)},
  });
  const base = {plan: {result: 'success', outputs: {database: 'true'}}, core: {result: 'success'}};
  assert.equal(run({...base, [jobId]: {result: 'success'}}).status, 0);
  for (const result of ['failure', 'cancelled', 'skipped', 'timed_out']) {
    assert.equal(run({...base, [jobId]: {result}}).status, 1, result);
  }
  assert.equal(run(base).status, 1, 'missing applicable job');
  assert.equal(run({...base, plan: {result: 'success', outputs: {database: 'false'}}, [jobId]: {result: 'skipped'}}).status, 0,
    'a non-applicable native job may skip');
});
