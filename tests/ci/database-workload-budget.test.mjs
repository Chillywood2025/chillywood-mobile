import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import {parse} from 'yaml';
import {computeValidationPlan,evaluateRun,expectedJobs} from '../../scripts/ci/required-validation.mjs';

const workflow=parse(fs.readFileSync('.github/workflows/required-validation.yml','utf8'));
// Pin the complete PR 684 Database contract, excluding only its independently
// asserted budget. Removing exactly the reviewed cutover proof must recover
// the published 5dabb contract; no prior command or protection may change.
const contractSha256='c32571b55613f6cfa521923514e6d0d37b28934a90b75531a5bf54b004d00850';
const priorContractSha256='f5d2994c71cf3749dc29f8760aceb56fdf59990eed66d5bb8e5dde15a4f4fc71';
const cutoverCommand='node ops/automatic-commerce-cutover/run-native.mjs --docker supabase_db_chillywood-mobile';
const precedingCommand='SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-sandbox-payout-notification-exact-deploy-postgres.mjs';
const followingCommand='SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-commerce-fee-concurrency-postgres.mjs';
const contractHash=contract=>createHash('sha256').update(JSON.stringify(contract)).digest('hex');
const rebuildStep=job=>job.steps.find(step=>step.name==='Rebuild and test the local database');
const assertJob=job=>{
 const {'timeout-minutes':budget,...contract}=job;
 assert.equal(budget,65);
 assert.equal(job.steps.filter(step=>step.name==='Rebuild and test the local database').length,1);
 assert.equal(job.steps.flatMap(step=>(step.run??'').split('\n')).filter(line=>line===cutoverCommand).length,1,
  'the exact cutover proof runs once across the entire Database job');
 const priorContract=structuredClone(contract),step=rebuildStep(priorContract),lines=step.run.split('\n');
 const position=lines.indexOf(cutoverCommand);
 assert.ok(position>0,'the cutover proof belongs to the existing rebuild step');
 assert.equal(lines[position-1],precedingCommand,'the cutover proof follows the sandbox payout proof');
 assert.equal(lines[position+1],followingCommand,'the cutover proof precedes the commerce fee proof');
 lines.splice(position,1);step.run=lines.join('\n');
 assert.equal(contractHash(priorContract),priorContractSha256,
  'removing only the exact cutover command preserves the complete prior Database contract');
 assert.equal(contractHash(contract),contractSha256,
  'the complete reviewed Database contract includes the required cutover proof');
};

test('Database keeps its measured aggregate budget and every prior mandatory command with the added cutover proof',()=>{
 const prefix=Date.parse('2026-11-06T11:22:08.962Z')-Date.parse('2026-11-06T10:32:01.735Z');
 const tail=Date.parse('2026-11-05T07:30:31.822Z')-Date.parse('2026-11-05T07:27:25.745Z');
 const projection=prefix+tail;
 assert.ok(projection>50*60_000,'the old job limit is below measured-prefix plus successful-tail projection');
 assert.equal(Math.ceil(projection*1.2/(5*60_000))*5,65,'explicit engineering allowance, not a statistical confidence bound');
 assertJob(workflow.jobs.database);
 for(const mutate of [
  job=>{job['timeout-minutes']=50;},
  job=>{job['timeout-minutes']=75;},
  job=>{job.name='Optional Database';},
  job=>{job.if='false';},
  job=>{job.needs=[];},
  job=>{job['continue-on-error']=true;},
  job=>{job.steps.find(step=>step.run?.includes('supabase test db')).if='false';},
  job=>{job.steps.find(step=>step.run?.includes('supabase test db'))['continue-on-error']=true;},
  job=>{const step=job.steps.find(step=>step.run?.includes('supabase test db'));step.run=step.run.replace('supabase test db','supabase test db || true');},
  job=>{const step=job.steps.find(step=>step.run?.includes('test:cognitive-runtime-login-integration'));step.run=step.run.replace('npm run test:cognitive-runtime-login-integration','');},
  job=>{job.steps[0].with['persist-credentials']=true;},
 ]){
  const mutant=structuredClone(workflow.jobs.database);mutate(mutant);
  assert.throws(()=>assertJob(mutant),assert.AssertionError);
 }
});

test('the cutover proof rejects missing, moved, duplicated or changed commands',()=>{
 for(const [name,mutate] of [
  ['missing',job=>{const step=rebuildStep(job);step.run=step.run.replace(cutoverCommand+'\n','');}],
  ['moved past the following proof',job=>{const step=rebuildStep(job);step.run=step.run.replace(cutoverCommand+'\n'+followingCommand,followingCommand+'\n'+cutoverCommand);}],
  ['moved outside the cron-isolated block',job=>{const step=rebuildStep(job);step.run=step.run.replace(cutoverCommand+'\n','')+cutoverCommand+'\n';}],
  ['moved to a separate step',job=>{const step=rebuildStep(job);step.run=step.run.replace(cutoverCommand+'\n','');job.steps.push({run:cutoverCommand});}],
  ['duplicated within the step',job=>{const step=rebuildStep(job);step.run=step.run.replace(cutoverCommand,cutoverCommand+'\n'+cutoverCommand);}],
  ['duplicated in another step',job=>{job.steps.push({run:cutoverCommand});}],
  ['new proof failure ignored',job=>{const step=rebuildStep(job);step.run=step.run.replace(cutoverCommand,cutoverCommand+' || true');}],
  ['new proof target changed',job=>{const step=rebuildStep(job);step.run=step.run.replace(cutoverCommand,cutoverCommand.replace('supabase_db_chillywood-mobile','another_database'));}],
  ['prior proof removed',job=>{const step=rebuildStep(job);step.run=step.run.replace('supabase test db\n','');}],
  ['prior proof changed',job=>{const step=rebuildStep(job);step.run=step.run.replace('supabase test db\n','supabase test db || true\n');}],
 ]){
  const mutant=structuredClone(workflow.jobs.database);mutate(mutant);
  assert.throws(()=>assertJob(mutant),assert.AssertionError,name);
 }
});

test('a larger aggregate budget never converts an incomplete or wrong-head Database job into required success',()=>{
 const paths=['.github/workflows/required-validation.yml'];
 const head='b'.repeat(40),required=expectedJobs(computeValidationPlan(paths));
 assert.ok(required.includes('Validation / Database'));
 assert.ok(required.includes('Validation / Brand Native PostgreSQL 17.6'));
 const jobs=required.map(name=>({name,status:'completed',conclusion:'success',headSha:head}));
 const check=candidates=>evaluateRun({baseRef:'main',baseSha:'a'.repeat(40),headSha:head,paths,
  jobs:candidates,reviews:[],author:'Chillywood2025',verifiedRepositoryOwnerAuthor:true});
 assert.equal(check(jobs).ok,true,'fixture has all exact-head applicable successes');
 for(const conclusion of ['failure','cancelled','timed_out','skipped'])
  assert.equal(check(jobs.map(job=>job.name==='Validation / Database'?{...job,conclusion}:job)).ok,false,conclusion);
 assert.equal(check(jobs.filter(job=>job.name!=='Validation / Database')).ok,false,'missing');
 assert.equal(check(jobs.map(job=>job.name==='Validation / Database'?{...job,status:'in_progress'}:job)).ok,false,'incomplete');
 assert.equal(check(jobs.map(job=>job.name==='Validation / Database'?{...job,headSha:'c'.repeat(40)}:job)).ok,false,'wrong head');
});
