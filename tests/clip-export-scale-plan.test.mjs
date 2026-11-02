// Reconstructed regression coverage, not a byte-exact historical test artifact.
import test from 'node:test';
import assert from 'node:assert/strict';
import {planClipExportCapacity} from '../scripts/lib/clip-export-scale-plan.mjs';

function fixture(){
 const now=1_000_000;
 return {enabled:true,nowMs:now,approvedProfile:{id:'synthetic-only',approved:true,minWorkers:0,maxWorkers:4,
  slotsPerWorker:1,globalSlotLimit:4,workerComputeCostPerHour:1,maxComputeCostPerHour:4,startupProbeApproved:true},
 observation:{observedAtMs:now,queuedJobs:100,oldestQueueAgeSeconds:180,activeWorkers:1,activeJobs:1,
  health:{observedAtMs:now,status:'healthy',failureClass:null,crashLoop:false,staleHeartbeat:false,progressing:true,saturated:true},
  renderAttempts:2,renderFailures:0,permanentInputFailures:0,sourceOrCancelFailures:0,
  qualifiedWorkerMemory:{observedAtMs:now,isolated:true,scope:'current-process-cgroup-v2-including-descendants',currentBytes:100,limitBytes:1000,oomEventsDelta:0},
  windowSeconds:300,arrivalRatePerMinute:10,completedJobs:2,totalRenderSeconds:120},state:{}};
}
function advance(f,ms=31000){
 f.nowMs+=ms;f.observation.observedAtMs=f.nowMs;f.observation.health.observedAtMs=f.nowMs;
 f.observation.qualifiedWorkerMemory.observedAtMs=f.nowMs;
}
function sample(f){const result=planClipExportCapacity(f);if(result.nextState)f.state=result.nextState;return result;}

test('planning is explicitly OFF and never grants execution or a billing guarantee',()=>{
 assert.equal(planClipExportCapacity().action,'disabled');
 const f=fixture();const result=sample(f);
 assert.equal(result.execute,false);assert.equal(result.mode,'recommendation-only');assert.equal(result.billCapGuaranteed,false);
 f.approvedProfile.approved=false;assert.equal(sample(f).action,'blocked');
});

test('invalid budgets, concurrency, timestamps and missing queue evidence fail closed',()=>{
 for(const change of [f=>f.approvedProfile.maxWorkers=33,f=>f.approvedProfile.slotsPerWorker=9,
  f=>f.approvedProfile.globalSlotLimit=0,f=>f.approvedProfile.workerComputeCostPerHour=0,
  f=>f.approvedProfile.minWorkers=5,f=>f.observation.activeJobs=null,f=>f.observation.queuedJobs=-1,
  f=>f.observation.observedAtMs=f.nowMs+1,f=>f.observation.observedAtMs-=60001,
  f=>{f.observation.queuedJobs=0;f.observation.oldestQueueAgeSeconds=1;}]){
  const f=fixture();change(f);assert.equal(sample(f).action,'blocked');
 }
});

test('distinct healthy saturated samples, cooldown and global/cost ceilings bound growth',()=>{
 const f=fixture();f.approvedProfile.globalSlotLimit=3;f.approvedProfile.maxComputeCostPerHour=2;
 assert.equal(sample(f).action,'hold');
 assert.equal(sample(f).reason,'newer_distinct_observation_required');
 advance(f);assert.equal(sample(f).action,'hold');
 advance(f);const up=sample(f);assert.equal(up.action,'recommend-increase');assert.equal(up.desiredWorkers,2);
 assert.equal(up.demandExceedsApprovedCapacity,true);assert.equal(up.estimatedComputeCostPerHour,2);
 advance(f);assert.equal(sample(f).reason,'cooldown');
});

test('five quiet observations retire capacity even with broken processing and no throughput/RAM',()=>{
 const f=fixture();Object.assign(f.observation,{queuedJobs:0,oldestQueueAgeSeconds:0,activeJobs:0,completedJobs:0,totalRenderSeconds:0,
  qualifiedWorkerMemory:null,health:{...f.observation.health,status:'systemic-failure',failureClass:'storage'}});
 for(let n=0;n<5;n++){
  if(n){f.nowMs+=31000;f.observation.observedAtMs=f.nowMs;}
  const result=sample(f);assert.equal(result.action,n===4?'recommend-drain':'hold');
  if(n===4){assert.equal(result.desiredWorkers,0);assert.equal(result.stopMode,'drain-only');}
 }
});

test('reduced approved cap permits drain without waiting for success but unknown active jobs do not invent idle',()=>{
 const f=fixture();f.observation.activeWorkers=4;f.approvedProfile.maxComputeCostPerHour=2;f.observation.health=null;
 const result=sample(f);assert.equal(result.action,'recommend-drain');assert.equal(result.desiredWorkers,2);
 assert.equal(result.stopMode,'drain-only');
 f.observation.activeJobs=null;assert.equal(sample(f).reason,'fresh_queue_and_inventory_required');
});

test('dependency, worker faults, unknown health and absent measured memory never authorize growth',()=>{
 for(const change of [h=>h.status='unknown',h=>h.failureClass='storage',h=>h.crashLoop=true,h=>h.staleHeartbeat=true,
  h=>h.failureClass='worker',h=>h.status='systemic-failure']){
  const f=fixture();change(f.observation.health);assert.equal(sample(f).action,'blocked');
 }
 for(const change of [m=>m.isolated=false,m=>m.scope='host',m=>m.oomEventsDelta=1,m=>m.currentBytes=900,
  m=>m.observedAtMs=1]){
  const f=fixture();change(f.observation.qualifiedWorkerMemory);assert.equal(sample(f).action,'blocked');
 }
});

test('poison/cancellation counts do not represent systemic render failure, but unclassified failures block',()=>{
 const f=fixture();Object.assign(f.observation,{renderAttempts:10,renderFailures:10,permanentInputFailures:5,sourceOrCancelFailures:5});
 assert.equal(sample(f).action,'hold');
 const broken=fixture();Object.assign(broken.observation,{renderAttempts:10,renderFailures:1});
 assert.equal(sample(broken).reason,'systemic_render_failure_rate_requires_review');
});

test('fresh throughput baseline survives a quiet completion window and is profile/concurrency/time bound',()=>{
 const f=fixture();sample(f);assert.equal(f.state.throughputBaseline.completedJobs,2);
 advance(f);f.observation.completedJobs=0;f.observation.totalRenderSeconds=0;
 assert.notEqual(sample(f).reason,'qualified_throughput_baseline_required');
 for(const change of [x=>x.approvedProfile.id='other',x=>x.approvedProfile.slotsPerWorker=2,
  x=>x.state.throughputBaseline.measuredAtMs=x.nowMs-86400001]){
  const copy=structuredClone(f);advance(copy);change(copy);
  assert.equal(sample(copy).reason,'qualified_throughput_baseline_required');
 }
});

test('heartbeats and baseline alone do not imply actual progress or saturation',()=>{
 const f=fixture();f.observation.health.progressing=false;assert.equal(sample(f).reason,'healthy_processing_progress_required');
 const spare=fixture();spare.observation.health.saturated=false;assert.equal(sample(spare).reason,'healthy_processing_saturation_required');
});

test('cold start is a single explicit bounded probe without invented throughput or memory',()=>{
 const f=fixture();Object.assign(f.observation,{activeWorkers:0,activeJobs:0,completedJobs:0,totalRenderSeconds:0,qualifiedWorkerMemory:null});
 const result=sample(f);assert.equal(result.action,'recommend-startup-probe');assert.equal(result.desiredWorkers,1);
 const denied=fixture();denied.observation.activeWorkers=0;denied.observation.activeJobs=0;denied.approvedProfile.startupProbeApproved=false;
 assert.equal(sample(denied).reason,'approved_startup_probe_required');
 const idle=fixture();Object.assign(idle.observation,{activeWorkers:0,activeJobs:0,queuedJobs:0,oldestQueueAgeSeconds:0});
 assert.equal(sample(idle).reason,'idle_at_approved_minimum');
});

test('invalid or future persisted planning state cannot fast-forward hysteresis',()=>{
 for(const state of [{highSamples:4},{lowSamples:6},{lastChangeAtMs:1000001},{lastRecommendationAtMs:NaN}]){
  const f=fixture();f.state=state;assert.equal(sample(f).reason,'invalid_planning_state');
 }
});
