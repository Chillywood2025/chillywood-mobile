import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import test from 'node:test';
import {parse} from 'yaml';
import {computeValidationPlan} from '../../scripts/ci/required-validation.mjs';
import {loadQualificationModule,fixtureProposalSQL,proposalSource,assertProposalUnchanged} from '../helpers/r2-qualification-fixture.mjs';
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
  assert.equal(manifest.RUN_APPROVED,false);assert.equal(manifest.CLEANUP_APPROVED,false);
  assert.equal(manifest.DEADLINE,'2026-10-24T20:00:00.000Z');
  assert.equal(proposalSource.includes('clock_timestamp()'),true);assert.equal(fixtureProposalSQL.includes('clock_timestamp()'),false);
  assertProposalUnchanged();assert.throws(()=>loadQualificationModule('../deleted-content-retention-expiry/index.ts'));
  assert.ok(!readdirSync('supabase/migrations').some(n=>/r2.*qualification|qualification.*ledger/.test(n)));
  assert.ok(!readdirSync('supabase/functions').some(n=>/r2.*qualification/.test(n)));
});
