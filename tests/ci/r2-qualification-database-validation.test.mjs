import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import test from 'node:test';
import {parse} from 'yaml';
import {computeValidationPlan} from '../../scripts/ci/required-validation.mjs';
import {loadQualificationModule,fixtureProposalSQL,proposalSource,assertProposalUnchanged,
  qualificationMigrationName,qualificationMigrationSource,fixtureAdmissionClockSQL} from '../helpers/r2-qualification-fixture.mjs';
import {splitSQL} from '../helpers/database-runtime-authority-fixture.mjs';
const workflow=parse(readFileSync('.github/workflows/required-validation.yml','utf8'));
const command='SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-r2-qualification-ledger-concurrency.mjs';
function assertGate(candidate) {
  const job=candidate.jobs.database;
  assert.equal(job.if,"needs.plan.outputs.database == 'true'");assert.equal(job['continue-on-error'],undefined);
  const steps=job.steps.filter(s=>s.run?.split('\n').includes(command));assert.equal(steps.length,1);
  const step=steps[0];assert.equal(step.if,undefined);assert.equal(step['continue-on-error'],undefined);
  const commands=step.run.split('\n'),start=commands.indexOf('supabase start'),reset=commands.indexOf('supabase db reset'),tap=commands.indexOf('supabase test db');
  assert.ok(start>=0&&start<reset&&reset<tap&&tap<commands.indexOf(command));
  assert.ok(commands.includes('node scripts/test-r2-qualification-ledger-postgres.mjs'));
  assert.ok(commands.includes('node --test supabase/functions/_shared/r2-disposable-qualification.test.mjs supabase/functions/_shared/r2-disposable-qualification-store.test.mjs'));
  assert.ok(commands.includes('node --test supabase/functions/_shared/r2-disposable-qualification-fence.test.mjs'));
}
test('qualification native commissioning is required after full local schema/pgTAP without new CI policy',()=>{
  assertGate(workflow);
  assert.equal(computeValidationPlan(['supabase/proposals/r2-qualification-test-ledger.sql']).categories.database,true);
});
test('existing Sensitive job checks the exact commissioned entrypoint without weakening its Deno command',()=>{
  const job=workflow.jobs.sensitive;
  assert.equal(job.if,"needs.plan.outputs.sensitive == 'true'");assert.equal(job['continue-on-error'],undefined);
  const expected='DENO_NO_PACKAGE_JSON=1 deno check --node-modules-dir=none --no-lock supabase/functions/admin-content-inspection/index.ts supabase/functions/deleted-content-retention-expiry/index.ts supabase/functions/platform-brand-retention-expiry/index.ts supabase/functions/_shared/brand-retention-origin.ts supabase/functions/r2-disposable-qualification/index.ts';
  const steps=job.steps.filter(step=>step.run?.split('\n').includes(expected));assert.equal(steps.length,1);
  assert.equal(steps[0].if,undefined);assert.equal(steps[0]['continue-on-error'],undefined);
});
test('qualification gate rejects omission, optionality, swallowed failure, wrong target and wrong order',()=>{
  for(const mode of ['omit','omit-fence','skip','swallow','wrong-target','before-reset']){
    const changed=structuredClone(workflow),step=changed.jobs.database.steps.find(s=>s.run?.includes(command));
    if(mode==='omit')step.run=step.run.replace(command,'');
    if(mode==='omit-fence')step.run=step.run.replace('node --test supabase/functions/_shared/r2-disposable-qualification-fence.test.mjs','');
    if(mode==='skip')step.if='false';
    if(mode==='swallow')step['continue-on-error']=true;
    if(mode==='wrong-target')step.run=step.run.replace(command,command.replace('supabase_db_chillywood-mobile','supabase_db_other'));
    if(mode==='before-reset')step.run=`${command}\n${step.run.replace(command,'')}`;
    assert.throws(()=>assertGate(changed),assert.AssertionError);
  }
});
test('test clock adaptation changes no gate, deadline or canonical proposal and loader is bounded',()=>{
  const manifest=loadQualificationModule('r2-disposable-qualification-manifest.ts');
  assert.equal(manifest.RUN_APPROVED,true);assert.equal(manifest.CLEANUP_APPROVED,false);
  assert.equal(manifest.DEADLINE,'2026-10-24T20:00:00.000Z');
  assert.equal(proposalSource.includes('clock_timestamp()'),true);assert.equal(fixtureProposalSQL.includes('clock_timestamp()'),false);
  assertProposalUnchanged();assert.throws(()=>loadQualificationModule('../deleted-content-retention-expiry/index.ts'));
  assert.deepEqual(readdirSync('supabase/functions').filter(n=>/r2.*qualification/.test(n)),['r2-disposable-qualification']);
  const config=readFileSync('supabase/config.toml','utf8');
  assert.match(config,/\[functions\.r2-disposable-qualification\]\nverify_jwt = true/);
});
test('exact canonical ledger is discovered once, unseeded, with only its two service RPC grants',()=>{
  assert.deepEqual(readdirSync('supabase/migrations').filter(n=>/r2.*qualification|qualification.*ledger/.test(n)),[qualificationMigrationName]);
  assert.equal(qualificationMigrationSource,proposalSource);
  assert.match(qualificationMigrationName,/^20261024[0-9]{6}_r2_qualification_test_ledger\.sql$/);
  assert.ok(qualificationMigrationName>'20261024093048_deleted_content_reviewed_external_reference.sql');
  const statements=splitSQL(qualificationMigrationSource).map(s=>s.replace(/--[^\n]*/g,'').trim()).filter(Boolean);
  assert.equal(statements.filter(s=>/^create schema r2_qualification_test_private;/i.test(s)).length,1);
  assert.equal(statements.filter(s=>/^create table /i.test(s)).length,1);
  assert.equal(statements.filter(s=>/^create function public\./i.test(s)).length,2);
  assert.ok(!statements.some(s=>/^(insert|update|delete|truncate|drop|alter role|alter default privileges|create policy)\b/i.test(s)),'no seed, cleanup approval, broad grants, drops or role changes');
  assert.deepEqual(statements.filter(s=>/^grant /i.test(s)),[
    'grant execute on function public.read_r2_qualification_test_run(text,text),\n  public.cas_r2_qualification_test_run(text,text,integer,jsonb) to service_role;',
  ]);
  assert.ok(statements.includes('alter table r2_qualification_test_private.run enable row level security;'));
  assert.ok(statements.includes('alter table r2_qualification_test_private.run force row level security;'));
  assert.ok(statements.includes('revoke all on schema r2_qualification_test_private from public, anon, authenticated, service_role;'));
  assert.ok(statements.includes('revoke all on r2_qualification_test_private.run from public, anon, authenticated, service_role;'));
  assert.ok(statements.some(s=>/^revoke all on function public\.read_r2_qualification_test_run\(text,text\),\s+public\.cas_r2_qualification_test_run\(text,text,integer,jsonb\) from public,anon,authenticated,service_role;$/.test(s)));
  assertProposalUnchanged();
});
test('full replay and native clones never reinstall the ledger or bypass canonical migration validation',()=>{
  const postgres=readFileSync('scripts/test-r2-qualification-ledger-postgres.mjs','utf8');
  const native=readFileSync('scripts/test-r2-qualification-ledger-concurrency.mjs','utf8');
  assert.ok(postgres.includes('excludeMigrations:[qualificationMigrationName]'));
  assert.equal(postgres.split('await full.exec(qualificationMigrationSource)').length,2,'full baseline applies exact target once');
  assert.ok(postgres.includes('qualificationCatalogFingerprintSQL'));
  assert.ok(native.includes('query(canonicalDB,qualificationMigrationSource)'));
  assert.ok(native.includes('query(baseline,qualificationCatalogFingerprintSQL),query(canonicalDB,qualificationCatalogFingerprintSQL)'));
  assert.ok(native.includes('query(baseline,fixtureAdmissionClockSQL)'));
  assert.doesNotMatch(native,/query\(baseline,(?:fixtureProposalSQL|qualificationMigrationSource)\)/);
  assert.doesNotMatch(postgres+native,/drop schema|drop table|disable trigger|disable row level security/i);
  const statements=splitSQL(fixtureAdmissionClockSQL);
  assert.equal(statements.length,1);
  assert.match(statements[0],/^create or replace function r2_qualification_test_private\.guard_run\(\)/);
  assert.equal(statements[0].replace('create or replace function ','create function ')
    .replace("old.cleanup_approval_ref is not null,'2026-10-23T22:00:00.000Z'::timestamptz)",
      'old.cleanup_approval_ref is not null,clock_timestamp())'),
    proposalSource.match(/create function r2_qualification_test_private\.guard_run\(\)[\s\S]*?end; \$\$;/)[0]);
  assert.ok(native.includes("assert.equal(snapshots.length,17"));
  assert.ok(native.includes("'original local source unchanged'"));
});
