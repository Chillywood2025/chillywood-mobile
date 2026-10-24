import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {parse} from 'yaml';
import {computeValidationPlan} from '../../scripts/ci/required-validation.mjs';

const workflow = parse(readFileSync('.github/workflows/required-validation.yml', 'utf8'));
const project = readFileSync('supabase/config.toml', 'utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]+)"/m)?.[1];
assert.ok(project);
const command = `SUPABASE_DB_CONTAINER=supabase_db_${project} node scripts/test-brand-global-retention-concurrency.mjs`;
function assertNativeGate(candidate) {
  const job = candidate.jobs.database;
  assert.equal(job.if, "needs.plan.outputs.database == 'true'");
  assert.equal(job['continue-on-error'], undefined);
  const steps = job.steps.filter(step => step.run?.split('\n').includes(command));
  assert.equal(steps.length, 1, 'native concurrency must execute exactly once');
  const step = steps[0];
  assert.equal(step.if, undefined, 'Brand/global native proof cannot be optional');
  assert.equal(step['continue-on-error'], undefined, 'native failure must fail required validation');
  const commands = step.run.split('\n');
  assert.equal(commands.filter(value => value === command).length, 1, 'one shell block cannot duplicate the native run');
  const start = commands.indexOf('supabase start'), reset = commands.indexOf('supabase db reset'), tap = commands.indexOf('supabase test db');
  assert.ok(start >= 0 && start < reset && reset < tap && tap < commands.indexOf(command),
    'native concurrency runs after full migration replay and pgTAP');
}

test('Brand/global retention native proof is required after the complete migrated local schema', () => {
  assertNativeGate(workflow);
  for (const path of ['supabase/migrations/20261024171258_platform_brand_global_retention_integration.sql',
    'scripts/test-brand-global-retention-concurrency.mjs', 'tests/ci/brand-global-retention-validation.test.mjs']) {
    assert.equal(computeValidationPlan([path]).categories.database, true, path);
  }
});

test('Brand/global gate rejects missing, duplicate, skipped, swallowed, wrong-target or prematurely run proof', () => {
  for (const mode of ['omit', 'duplicate', 'duplicate-line', 'skip-job', 'skip-step', 'swallow-job', 'swallow-step', 'shell-swallow', 'wrong-target', 'before-reset', 'before-pgtap']) {
    const changed = structuredClone(workflow);
    const job = changed.jobs.database, step = job.steps.find(value => value.run?.split('\n').includes(command));
    if (mode === 'omit') step.run = step.run.replace(command, '');
    if (mode === 'duplicate') job.steps.push({run: command});
    if (mode === 'duplicate-line') step.run += `\n${command}`;
    if (mode === 'skip-job') job.if = 'false';
    if (mode === 'skip-step') step.if = 'false';
    if (mode === 'swallow-job') job['continue-on-error'] = true;
    if (mode === 'swallow-step') step['continue-on-error'] = true;
    if (mode === 'shell-swallow') step.run = step.run.replace(command, `${command} || true`);
    if (mode === 'wrong-target') step.run = step.run.replace(command, command.replace(`supabase_db_${project}`, 'supabase_db_other'));
    if (mode === 'before-reset') step.run = `${command}\n${step.run.replace(command, '')}`;
    if (mode === 'before-pgtap') step.run = step.run.replace(command, '').replace('supabase test db', `${command}\nsupabase test db`);
    assert.throws(() => assertNativeGate(changed), assert.AssertionError, mode);
  }
});

test('native harness is clone-only with observed queues, cleanup and no guard/provider qualification substitute', () => {
  const source = readFileSync('scripts/test-brand-global-retention-concurrency.mjs', 'utf8');
  const migration = readFileSync('supabase/migrations/20261024171258_platform_brand_global_retention_integration.sql', 'utf8');
  const drain = 'lock table public.platform_brand_assets in access exclusive mode;';
  assert.ok(source.includes(drain), 'native drain control uses the actual migration lock mode');
  const drainIndex = migration.indexOf(drain);
  assert.ok(drainIndex >= 0);
  for (const afterDrain of ['create or replace function private.platform_brand_retention_lock()',
    'insert into private.deleted_content_brand_delegations(', 'alter table private.deleted_content_records']) {
    assert.ok(migration.indexOf(afterDrain) > drainIndex, 'drain source writers before adoption and trigger/catalog changes');
  }
  for (const required of ['pg_blocking_pids', "l.classid=176214 and l.objid=30", "l.locktype='advisory'",
    'default_transaction_read_only=on', 'complete source row fingerprints unchanged', 'schema_migrations',
    'tests/fixtures/deleted-content-local-qualification.sql', 'source secondary definitions unchanged',
    "['activation', 'reenable']", 'FOR SHARE NOWAIT', 'public.remove_platform_brand_asset',
    'public.begin_media_scan_byte_observation', 'public.record_media_scan_byte_receipt',
    'public.record_platform_brand_retention_proof', 'public.deleted_content_expiry_readiness',
    'platformBrandMissingCurrentScanProofCount', 'brand_proof_fresh_bound_scan_required',
    "exception when sqlstate '55P03'", "l.mode='AccessExclusiveLock'", 'DRAIN_REMOVAL_VISIBLE:true',
    'removal versus advisory-queued source writer', 'registration versus advisory-queued Storage writer',
    'owner removal source-row NOWAIT', 'registration Storage-row NOWAIT',
    'initial activation before pending Brand upload', "'dropdb'", 'finally']) assert.ok(source.includes(required), required);
  assert.doesNotMatch(source, /disable\s+trigger|set\s+session_replication_role|create\s+(?:or\s+replace\s+)?function/i,
    'native proof must never replace functions or pause existing safety hooks');
  assert.doesNotMatch(source, /version_delete_verified\s*=\s*true|provider_origin\s*=|batch_enabled\s*=\s*true|fetch\s*\(/i,
    'lock proof must not manufacture Brand provider qualification or contact a provider');
});
