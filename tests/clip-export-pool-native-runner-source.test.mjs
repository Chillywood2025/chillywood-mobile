import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {parse} from 'yaml';
import {assertDatabaseUpgradeCI} from './helpers/assert-database-upgrade-ci.mjs';
import {computeValidationPlan} from '../scripts/ci/required-validation.mjs';

// These guards prove mandatory wiring, not native PostgreSQL behavior. The
// runner itself must execute successfully to establish contention evidence.
const path='scripts/test-clip-export-pool-concurrency-postgres.mjs';
const source=readFileSync(path,'utf8');
const ledgerProof=readFileSync('tests/helpers/clip-export-pool-native-ledger.mjs','utf8');
const command=`SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node ${path}`;
const guard='node --test tests/clip-export-pool-native-runner-source.test.mjs';
const workflow=parse(readFileSync('.github/workflows/required-validation.yml','utf8'));
function assertGate(candidate){
 const job=candidate.jobs.database;
 assert.equal(job.if,"needs.plan.outputs.database == 'true'");assert.equal(job['continue-on-error'],undefined);
 assert.equal(job['timeout-minutes'],65,'database_reviewed_budget');
 const steps=job.steps.filter(step=>step.run?.split('\n').includes(command));assert.equal(steps.length,1,'clip_pool_command_exactly_once');
 const step=steps[0];assert.equal(step.if,undefined,'clip_pool_step_required');assert.equal(step['continue-on-error'],undefined,'clip_pool_failure_must_propagate');
 assertDatabaseUpgradeCI(step.run);
 const commands=step.run.split('\n');
 assert.equal(commands.filter(line=>line===guard).length,1,'clip_pool_guard_exactly_once');
 assert.ok(commands.indexOf('supabase test db')<commands.indexOf(guard),'clip_pool_guard_after_pgtap');
 assert.ok(commands.indexOf(guard)<commands.indexOf(command),'clip_pool_runner_after_guard');
 assert.ok(commands.includes('SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-clip-export-concurrency-postgres.mjs'));
}
test('bounded Clip pool native runner rejects remote arguments and provides offline help',()=>{
 const help=spawnSync(process.execPath,[path,'--help'],{encoding:'utf8'});
 assert.equal(help.status,0);assert.match(help.stdout,/owned disposable clone/);
 const remote=spawnSync(process.execPath,[path,'postgres://remote.invalid/forbidden'],{encoding:'utf8'});
 assert.notEqual(remote.status,0);assert.match(remote.stderr,/no remote URL or positional arguments accepted/);
});
test('bounded Clip pool contention is mandatory after full migrations and existing pgTAP',()=>{
 assertGate(workflow);
 assert.equal(computeValidationPlan([path]).categories.database,true);
});
test('pool gate rejects omission, optionality, swallowed failure, wrong target and wrong order',()=>{
 assertGate(workflow); // Mutants must not pass because the unchanged baseline already fails.
 const expected={omit:'clip_pool_command_exactly_once','omit-guard':'clip_pool_guard_exactly_once',
  optional:'clip_pool_step_required',swallow:'clip_pool_failure_must_propagate','wrong-target':'clip_pool_command_exactly_once',
  'before-reset':'clip_pool_runner_after_guard','stale-budget':'database_reviewed_budget','changed-budget':'database_reviewed_budget'};
 for(const [mode,reason] of Object.entries(expected)){
  const changed=structuredClone(workflow),step=changed.jobs.database.steps.find(s=>s.run?.includes(command));
  if(mode==='omit')step.run=step.run.replace(command,'');
  if(mode==='omit-guard')step.run=step.run.replace(guard,'');
  if(mode==='optional')step.if='false';
  if(mode==='swallow')step['continue-on-error']=true;
  if(mode==='wrong-target')step.run=step.run.replace(command,command.replace('supabase_db_chillywood-mobile','supabase_db_other'));
  if(mode==='before-reset')step.run=`${command}\n${step.run.replace(command,'')}`;
  if(mode==='stale-budget')changed.jobs.database['timeout-minutes']=50;
  if(mode==='changed-budget')changed.jobs.database['timeout-minutes']=66;
  assert.throws(()=>assertGate(changed),error=>error instanceof assert.AssertionError&&error.message.split('\n')[0]===reason,
   `${mode} must fail its intended invariant, not an unrelated earlier assertion`);
 }
});
test('native pool proof observes actual lock edges and preserves production boundaries',()=>{
 for(const marker of ['pg_blocking_pids','wait_event_type',"same job cannot be claimed twice",'global capacity cannot overshoot','per-worker capacity cannot overshoot',
  'capacity reduction drains existing claims','admission cap serializes concurrent creators','creator fairness survives an older backlog',
  'worker restart cannot steal a live session','expired lease cannot complete or heartbeat','unauthorized capacity configuration',
  'admission rechecks session after waiting for configuration','unknown PUT remains reconciliation-only',
  'proveNativeClipScaleLedger({container,database,query,until})','assert.equal(checks,20',
  'restore.assertSourceUnchanged()',"'--force',database"]){assert.ok(source.includes(marker),marker);}
 assert.doesNotMatch(source,/disable trigger|session_replication_role|create or replace function|fetch\(/iu);
 assert.doesNotMatch(source,/select\s+(?:pg_advisory_xact_lock|.*for update)/iu,'only real API mutations may establish contention barriers');
 for(const marker of ['createPostgresClipScaleLedger({connect:transport.connect})','runClipScaleControllerTick','pg_blocking_pids','wait_event_type',
  'createCalls,1','unknown_create','reconcileCalls,1','profile.maxHourlyMicros','releaseHolder.resolve()'])assert.ok(ledgerProof.includes(marker),marker);
 assert.doesNotMatch(ledgerProof,/select\s+(?:pg_advisory_xact_lock|.*for update)/iu,'ledger proof must use actual production adapter locks');
 assert.doesNotMatch(ledgerProof,/fetch\(|https?:\/\/|disable trigger|session_replication_role/iu);
});
