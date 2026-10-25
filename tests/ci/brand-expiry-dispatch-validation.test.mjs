import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {parse} from 'yaml';
import {computeValidationPlan} from '../../scripts/ci/required-validation.mjs';

const workflow = parse(readFileSync('.github/workflows/required-validation.yml', 'utf8'));
const project = readFileSync('supabase/config.toml', 'utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]+)"/m)?.[1];
assert.ok(project);
const command = `SUPABASE_DB_CONTAINER=supabase_db_${project} node scripts/test-brand-expiry-dispatch-concurrency.mjs`;
const commands = [command, `${command} --negative-control`];
function assertNativeGate(candidate) {
  const job = candidate.jobs.database;
  assert.equal(job.if, "needs.plan.outputs.database == 'true'");
  assert.equal(job['continue-on-error'], undefined);
  for (const invocation of commands) {
    const matches = job.steps.filter(step => step.run?.split('\n').includes(invocation));
    assert.equal(matches.length, 1, 'each native proof must execute exactly once');
    const step = matches[0];
    assert.equal(step.if, undefined); assert.equal(step['continue-on-error'], undefined);
    const lines = step.run.split('\n');
    assert.equal(lines.filter(line => line === invocation).length, 1);
    const start = lines.indexOf('supabase start'), reset = lines.indexOf('supabase db reset'), tap = lines.indexOf('supabase test db');
    assert.ok(start >= 0 && start < reset && reset < tap && tap < lines.indexOf(invocation), 'complete reset and pgTAP precede native proof');
    assert.ok(lines.indexOf(command) < lines.indexOf(`${command} --negative-control`), 'positive native suite precedes the mandatory mutation control');
  }
}

test('expiry dispatch requires positive and mutation-control native PostgreSQL gates', () => {
  assertNativeGate(workflow);
  for (const path of ['supabase/migrations/20261025111212_platform_brand_expiry_observation_recovery.sql',
    'scripts/test-brand-expiry-dispatch-concurrency.mjs',
    'tests/ci/brand-expiry-dispatch-validation.test.mjs']) {
    assert.equal(computeValidationPlan([path]).categories.database, true, path);
  }
});
test('dispatch native gate rejects omitted, duplicate, skipped, swallowed, wrong-target or premature controls', () => {
  for (const invocation of commands) for (const mode of ['omit', 'duplicate', 'duplicate-line', 'skip-job', 'skip-step', 'swallow-job', 'swallow-step', 'shell-swallow', 'wrong-target', 'before-reset', 'before-pgtap']) {
    const changed = structuredClone(workflow), job = changed.jobs.database;
    const step = job.steps.find(value => value.run?.split('\n').includes(invocation));
    assert.ok(step, `required workflow invocation missing: ${invocation}`);
    const remove = () => { step.run = step.run.split('\n').filter(line => line !== invocation).join('\n'); };
    if (mode === 'omit') remove();
    if (mode === 'duplicate') job.steps.push({run: invocation});
    if (mode === 'duplicate-line') step.run += `\n${invocation}`;
    if (mode === 'skip-job') job.if = 'false';
    if (mode === 'skip-step') step.if = 'false';
    if (mode === 'swallow-job') job['continue-on-error'] = true;
    if (mode === 'swallow-step') step['continue-on-error'] = true;
    if (mode === 'shell-swallow') step.run = step.run.split('\n').map(line => line === invocation ? `${line} || true` : line).join('\n');
    if (mode === 'wrong-target') step.run = step.run.split('\n').map(line => line === invocation ? line.replace(`supabase_db_${project}`, 'supabase_db_other') : line).join('\n');
    if (mode === 'before-reset') { remove(); step.run = `${invocation}\n${step.run}`; }
    if (mode === 'before-pgtap') { remove(); step.run = step.run.replace('supabase test db', `${invocation}\nsupabase test db`); }
    assert.throws(() => assertNativeGate(changed), assert.AssertionError, `${invocation}: ${mode}`);
  }
});
