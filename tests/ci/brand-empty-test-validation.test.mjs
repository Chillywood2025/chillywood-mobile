import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {parse} from 'yaml';
import {computeValidationPlan} from '../../scripts/ci/required-validation.mjs';

const workflow = parse(readFileSync('.github/workflows/required-validation.yml', 'utf8'));
const project = readFileSync('supabase/config.toml', 'utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]+)"/m)?.[1];
assert.ok(project);
const script = 'scripts/test-brand-empty-test-concurrency.mjs';
const command = `SUPABASE_DB_CONTAINER=supabase_db_${project} node ${script}`;
const existing = `SUPABASE_DB_CONTAINER=supabase_db_${project} node scripts/test-brand-expiry-dispatch-concurrency.mjs`;
const unit = 'node --test tests/brand-empty-test-disposition.test.mjs tests/brand-empty-test-origin.test.mjs';
const commands = [unit, command, `${command} --negative-control`, existing, `${existing} --negative-control`];

function assertNativeGate(candidate) {
  const job = candidate.jobs.database;
  assert.equal(job.if, "needs.plan.outputs.database == 'true'");
  assert.equal(job['continue-on-error'], undefined);
  for (const invocation of commands) {
    const matches = job.steps.filter(step => step.run?.split('\n').includes(invocation));
    assert.equal(matches.length, 1, 'each additive and unchanged native proof must execute exactly once');
    const step = matches[0];
    assert.equal(step.if, undefined);
    assert.equal(step['continue-on-error'], undefined);
    const lines = step.run.split('\n');
    assert.equal(lines.filter(line => line === invocation).length, 1);
    const start = lines.indexOf('supabase start'), reset = lines.indexOf('supabase db reset'), tap = lines.indexOf('supabase test db');
    assert.ok(start >= 0 && start < reset && reset < tap && tap < lines.indexOf(invocation),
      'complete local migration reset and pgTAP precede every empty-evidence proof');
    assert.ok(lines.indexOf(unit) < lines.indexOf(command), 'synthetic lifecycle and trusted transport regressions precede native contention');
    for (const positive of [command, existing]) {
      assert.ok(lines.indexOf(positive) >= 0 && lines.indexOf(positive) < lines.indexOf(`${positive} --negative-control`),
        'both positive native suites precede their mandatory mutation controls');
    }
  }
}

test('empty-evidence lifecycle and native mutation controls are additive mandatory Database gates', () => {
  assertNativeGate(workflow);
  for (const path of ['supabase/migrations/20261025114152_platform_brand_empty_test_disposition.sql',
    'supabase/functions/_shared/brand-empty-test-origin.ts', 'supabase/functions/media-object-storage-migration/index.ts',
    'tests/brand-empty-test-disposition.test.mjs', 'tests/brand-empty-test-origin.test.mjs', script,
    'tests/ci/brand-empty-test-validation.test.mjs']) {
    assert.equal(computeValidationPlan([path]).categories.database, true, path);
  }
});

test('empty-evidence gates reject missing, skipped, duplicate, swallowed, wrong-target or premature proofs', () => {
  for (const invocation of commands) {
    for (const mode of ['omit', 'duplicate', 'duplicate-line', 'skip-job', 'skip-step', 'swallow-job',
      'swallow-step', 'shell-swallow', 'wrong-target', 'before-reset', 'before-pgtap']) {
      const changed = structuredClone(workflow), job = changed.jobs.database;
      const step = job.steps.find(value => value.run?.split('\n').includes(invocation));
      assert.ok(step);
      const remove = () => { step.run = step.run.split('\n').filter(line => line !== invocation).join('\n'); };
      if (mode === 'omit') remove();
      if (mode === 'duplicate') job.steps.push({run: invocation});
      if (mode === 'duplicate-line') step.run += `\n${invocation}`;
      if (mode === 'skip-job') job.if = 'false';
      if (mode === 'skip-step') step.if = 'false';
      if (mode === 'swallow-job') job['continue-on-error'] = true;
      if (mode === 'swallow-step') step['continue-on-error'] = true;
      if (mode === 'shell-swallow') step.run = step.run.split('\n').map(line => line === invocation ? `${line} || true` : line).join('\n');
      if (mode === 'wrong-target') {
        step.run = step.run.split('\n').map(line => line === invocation
          ? line === unit ? line.replace('brand-empty-test-origin.test.mjs', 'brand-retention-origin.test.mjs')
            : line.replace(`supabase_db_${project}`, 'supabase_db_other') : line).join('\n');
      }
      if (mode === 'before-reset') { remove(); step.run = `${invocation}\n${step.run}`; }
      if (mode === 'before-pgtap') { remove(); step.run = step.run.replace('supabase test db', `${invocation}\nsupabase test db`); }
      assert.throws(() => assertNativeGate(changed), assert.AssertionError, `${invocation}: ${mode}`);
    }
  }
});

test('native empty fixture is clone-only, intent-before-Owner-receipt, and independently observes contention', () => {
  const source = readFileSync(script, 'utf8');
  for (const required of ['default_transaction_read_only=on', 'schema_migrations', 'complete reset checkout schema required',
    'context\',\'inspect', 'com.supabase.cli.project', 'brand_empty_queue_', "'createdb'", "'dropdb'", 'finally',
    'pg_blocking_pids', "w.wait_event_type='Lock'", "begin isolation level ${isolation}",
    'HOLDER_READY', 'local source unchanged', 'public.remove_platform_brand_empty_test_asset', 'set local role authenticated',
    'server_observed_removal', "interval '720 hours'", "interval '721 hours'", "interval '722 hours'",
    'private.platform_brand_empty_intent_snapshot', 'private.platform_brand_empty_snapshot', 'public.begin_platform_brand_empty_observation',
    'private.platform_brand_empty_owner_removals', 'private.platform_brand_empty_owner_receipt_matches',
    'all global flags are off before bootstrap', 'no invented global capture, delegation or capture audit',
    'or legacy_object_deletes_blocked', 'legacy_object_delete_gate_open', 'consumer_rollout_not_qualified',
    'EXPLICIT DISPOSABLE-SQL TIME WARP', 'not actual elapsed 720-hour evidence',
    'public.record_platform_brand_empty_disposition',
    'private.platform_brand_empty_claim_evidence', "e.evidence_kind='archived_empty_test'",
    "for(const rollback of [false,true])", 'sidecar binds exact disposition digest and original generation',
    'preservation_unavailable', 'brand_empty_history_permanent', 'no fabricated clean receipt']) {
    assert.ok(source.includes(required), required);
  }
  assert.doesNotMatch(source, /fetch\s*\(|https:\/\/[^'"\s]+\/storage\/|set\s+session_replication_role/i,
    'native SQL fixture cannot contact a provider or bypass every trigger');
  assert.ok(source.indexOf('insert into private.platform_brand_empty_authorizations') < source.indexOf('select public.remove_platform_brand_empty_test_asset'),
    'active immutable intent precedes genuine Owner wrapper');
  assert.ok(source.indexOf('enable trigger empty_evidence_immutable') < source.indexOf('const observation=JSON.parse'),
    'synthetic maturity restores immutable guards before byte observation');
  assert.doesNotMatch(source,/update private\.deleted_content_retention_settings set .*?(?:activation_ready|capture_enabled)=true/,
    'native bootstrap does not enable global flags to manufacture capture');
  assert.doesNotMatch(source,/deleted-content-local-qualification\.sql/,
    'native capture-off bootstrap must not alter global qualification or remove unrelated inventory');
  assert.ok(source.includes('await ordered(target.remove,target.remove'),'Owner receipt commit and rollback contention is additive');
});

test('the mandatory unsafe dispatch mutant is rejected by the same competing-backend oracle', () => {
  const source = readFileSync(script, 'utf8');
  for (const required of ["if(negative)", "assert.equal(cloned,true)", 'create or replace function public.prepare_platform_brand_retention_dispatch',
    'on conflict do nothing', "return checked||jsonb_build_object('status','dispatch_authorized')", 'await ordered(prepare,prepare',
    "assert.equal(authorizations,1,'empty_marker_replay_allowed')", "error.code!=='ERR_ASSERTION'",
    "error.message.includes('empty_marker_replay_allowed')", "assert.equal(rejected,true", 'query(originalDispatch)',
    "'observe_only','uncertain dispatch cannot replay'"]) assert.ok(source.includes(required), required);
  assert.equal((source.match(/await ordered\(prepare,prepare/g) ?? []).length, 1,
    'positive and unsafe dispatch must share one actual contention oracle');
});

test('native harness help is non-mutating and states source-only evidence limits', () => {
  const result = spawnSync(process.execPath, [script, '--help'], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /generated disposable clone/);
  assert.match(result.stdout, /no remote URLs or providers/);
  assert.match(result.stdout, /negative-control/);
});
