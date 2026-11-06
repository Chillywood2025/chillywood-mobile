import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import {parse} from 'yaml';
import {computeValidationPlan,evaluateRun,expectedJobs} from '../../scripts/ci/required-validation.mjs';

const workflow=parse(fs.readFileSync('.github/workflows/required-validation.yml','utf8'));
// Exact parsed Database contract from published 5dabb, excluding only the
// aggregate budget. An intentional command addition requires explicit review
// of this binding, never silently dropping/skipping a proof to meet a budget.
const contractSha256='f5d2994c71cf3749dc29f8760aceb56fdf59990eed66d5bb8e5dde15a4f4fc71';
const assertJob=job=>{
 const {'timeout-minutes':budget,...contract}=job;
 assert.equal(budget,65);
 assert.equal(createHash('sha256').update(JSON.stringify(contract)).digest('hex'),contractSha256,
  'only the aggregate budget changes; complete required Database contract stays intact');
};

test('Database budget follows measured aggregate workload without changing any mandatory command',()=>{
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
