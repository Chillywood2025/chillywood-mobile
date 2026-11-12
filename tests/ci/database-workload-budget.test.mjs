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
const videoCommand='SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-creator-video-engagement-concurrency.mjs';
const profileCommand='SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-profile-engagement-concurrency.mjs';
const socialDeployCommand='SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-social-engagement-exact-deploy-postgres.mjs';
const capacityCommand='SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-paid-party-capacity-concurrency-postgres.mjs';
const tipCommand='SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-tip-cross-rail-concurrency-postgres.mjs';
const currentTipCommand=`TIP_SCHEMA_EXPECTATION=current ${tipCommand}`;
const historicalTipBlock=`# Preserve historical Stripe admission/gate races on a genuine schema
# boundary. Never disable current admission triggers to seed old tips.
# This is one additional local DB reset, not a second Product suite.
supabase db reset --local --version 20261112041003
node scripts/with-local-ci-cron-paused.mjs <<'HISTORICAL_TIP_PROOFS'
TIP_SCHEMA_EXPECTATION=historical ${tipCommand}
HISTORICAL_TIP_PROOFS`;
const contractHash=contract=>createHash('sha256').update(JSON.stringify(contract)).digest('hex');
const rebuildStep=job=>job.steps.find(step=>step.name==='Rebuild and test the local database');
const assertJob=job=>{
 // Review the new historical/current schema boundary independently, then
 // recover the unchanged prior contract rather than replacing its fingerprint.
 const allLines=job.steps.flatMap(step=>(step.run??'').split('\n'));
 assert.equal(allLines.filter(line=>line===`TIP_SCHEMA_EXPECTATION=historical ${tipCommand}`).length,1);
 assert.equal(allLines.filter(line=>line===currentTipCommand).length,1);
 assert.equal(allLines.filter(line=>line===tipCommand).length,0);
 const tipsNormalized=structuredClone(job),tipStep=rebuildStep(tipsNormalized);
 assert.equal(tipStep.run.split(historicalTipBlock).length,2);
 assert.ok(tipStep.run.includes('SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-chat-activity-upgrade-postgres.mjs\n'+historicalTipBlock+'\nsupabase migration up --local\n'));
 assert.ok(tipStep.run.includes('SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-auction-transfer-concurrency-postgres.mjs\n'+currentTipCommand+'\nSUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-merch-tracking-concurrency-postgres.mjs'));
 tipStep.run=tipStep.run.replace(historicalTipBlock+'\n','').replace(currentTipCommand,tipCommand);
 job=tipsNormalized;
 assert.equal(job.steps.flatMap(step=>(step.run??'').split('\n')).filter(line=>line===capacityCommand).length,1);
 const capacityNormalized=structuredClone(job),capacityStep=rebuildStep(capacityNormalized),capacityLines=capacityStep.run.split('\n');
 const capacityPosition=capacityLines.indexOf(capacityCommand);
 assert.ok(capacityPosition>0);
 assert.equal(capacityLines[capacityPosition-1],'SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-room-seat-auction-concurrency-postgres.mjs');
 assert.equal(capacityLines[capacityPosition+1],'SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-auction-transfer-concurrency-postgres.mjs');
 capacityLines.splice(capacityPosition,1);capacityStep.run=capacityLines.join('\n');job=capacityNormalized;
 assert.equal(job.steps.flatMap(step=>(step.run??'').split('\n')).filter(line=>line===socialDeployCommand).length,1);
 const socialNormalized=structuredClone(job),socialStep=rebuildStep(socialNormalized),socialLines=socialStep.run.split('\n');
 const socialPosition=socialLines.indexOf(socialDeployCommand);
 assert.ok(socialPosition>0);
 assert.equal(socialLines[socialPosition-1],precedingCommand);
 assert.equal(socialLines[socialPosition+1],cutoverCommand);
 socialLines.splice(socialPosition,1);socialStep.run=socialLines.join('\n');job=socialNormalized;
 // Assert the added proof independently, then prove the entire prior contract
 // remains byte-for-byte unchanged. Do not bless a replacement baseline hash.
 assert.equal(job.steps.flatMap(step=>(step.run??'').split('\n')).filter(line=>line===videoCommand).length,1);
 const normalized=structuredClone(job),videoStep=rebuildStep(normalized),videoLines=videoStep.run.split('\n');
 const videoPosition=videoLines.indexOf(videoCommand);
 assert.ok(videoPosition>0);
 assert.equal(videoLines[videoPosition-1],profileCommand);
 videoLines.splice(videoPosition,1);videoStep.run=videoLines.join('\n');
 job=normalized;
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

test('native-only tip phases preserve prior workload and reject missing or weakened schema proofs',()=>{
 assertJob(workflow.jobs.database);
 for(const mutate of [
  job=>{rebuildStep(job).run=rebuildStep(job).run.replace(historicalTipBlock+'\n','');},
  job=>{rebuildStep(job).run=rebuildStep(job).run.replace('20261112041003','20261112091500');},
  job=>{rebuildStep(job).run=rebuildStep(job).run.replace('TIP_SCHEMA_EXPECTATION=historical','TIP_SCHEMA_EXPECTATION=current');},
  job=>{rebuildStep(job).run=rebuildStep(job).run.replace(currentTipCommand,currentTipCommand+' || true');},
  job=>{rebuildStep(job).run=rebuildStep(job).run.replace(currentTipCommand,currentTipCommand+'\n'+currentTipCommand);},
  job=>{rebuildStep(job).run=rebuildStep(job).run.replace(currentTipCommand,tipCommand);},
  job=>{rebuildStep(job).run=rebuildStep(job).run.replace(historicalTipBlock+'\n','')+historicalTipBlock+'\n';},
 ]){const mutant=structuredClone(workflow.jobs.database);mutate(mutant);assert.throws(()=>assertJob(mutant),assert.AssertionError);}
});

test('paid-party capacity concurrency proof is mandatory, singular and preserves prior contract',()=>{
 assertJob(workflow.jobs.database);
 for(const mutate of [
  job=>{const step=rebuildStep(job);step.run=step.run.replace(capacityCommand+'\n','');},
  job=>{const step=rebuildStep(job);step.run=step.run.replace(capacityCommand,capacityCommand+' || true');},
  job=>{const step=rebuildStep(job);step.run=step.run.replace(capacityCommand,capacityCommand+'\n'+capacityCommand);},
  job=>{const step=rebuildStep(job);step.run=step.run.replace(capacityCommand+'\n','')+capacityCommand+'\n';},
 ]){const mutant=structuredClone(workflow.jobs.database);mutate(mutant);assert.throws(()=>assertJob(mutant),assert.AssertionError);}
});

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

test('creator video concurrency proof is mandatory, singular and beside the existing profile proof',()=>{
 for(const mutate of [
  job=>{const step=rebuildStep(job);step.run=step.run.replace(videoCommand+'\n','');},
  job=>{const step=rebuildStep(job);step.run=step.run.replace(videoCommand,videoCommand+' || true');},
  job=>{const step=rebuildStep(job);step.run=step.run.replace(videoCommand,videoCommand+'\n'+videoCommand);},
  job=>{const step=rebuildStep(job);step.run=step.run.replace(videoCommand+'\n','')+videoCommand+'\n';},
  job=>{const step=rebuildStep(job);step.run=step.run.replace(videoCommand+'\n','');job.steps.push({run:videoCommand});},
 ]){const mutant=structuredClone(workflow.jobs.database);mutate(mutant);assert.throws(()=>assertJob(mutant),assert.AssertionError);}
});

test('exact social deployment proof is mandatory and preserves the prior complete contract',()=>{
 for(const mutate of [
  job=>{const step=rebuildStep(job);step.run=step.run.replace(socialDeployCommand+'\n','');},
  job=>{const step=rebuildStep(job);step.run=step.run.replace(socialDeployCommand,socialDeployCommand+' || true');},
  job=>{const step=rebuildStep(job);step.run=step.run.replace(socialDeployCommand,socialDeployCommand+'\n'+socialDeployCommand);},
  job=>{const step=rebuildStep(job);step.run=step.run.replace(socialDeployCommand+'\n','')+socialDeployCommand+'\n';},
  job=>{const step=rebuildStep(job);step.run=step.run.replace(socialDeployCommand+'\n','');job.steps.push({run:socialDeployCommand});},
 ]){const mutant=structuredClone(workflow.jobs.database);mutate(mutant);assert.throws(()=>assertJob(mutant),assert.AssertionError);}
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
