import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {classifyClipExportFailure,deriveClipExportHealth,safeClipExportFailureCode} from '../scripts/lib/clip-export-health.mjs';
import {downloadClipSource} from '../scripts/lib/clip-export-transport.mjs';
import {runClipScaleControllerTick} from '../scripts/lib/clip-export-scale-controller.mjs';
import {emptyClipScaleLedger} from '../scripts/lib/clip-export-scale-ledger.mjs';
import {syntheticClipHealthEvidence} from './helpers/clip-export-health-fixture.mjs';

const now=10000000;
const evidence=options=>syntheticClipHealthEvidence(now,options);
const derive=raw=>deriveClipExportHealth({...raw,nowMs:now});
const failed=(errorCode,jobId='job-fixture',workerId='worker-fixture')=>({workerId,jobId,observedAtMs:now,status:'failed',errorCode});

test('safe failure taxonomy never infers poison media from generic FFmpeg failure or raw diagnostics',()=>{
 for(const code of ['media_process_failed','render_timeout','invalid_probe_json','anything private'])assert.equal(classifyClipExportFailure(code),'unknown');
 assert.equal(classifyClipExportFailure('invalid_source_probe'),'input_permanent');
 assert.equal(classifyClipExportFailure('render_canceled'),'source_or_cancel');
 assert.equal(classifyClipExportFailure('clip_source_auth_failed'),'dependency_auth');
 assert.equal(classifyClipExportFailure('clip_source_download_failed'),'dependency_storage');
 assert.equal(classifyClipExportFailure('worker_rpc_unavailable'),'dependency_database');
 assert.equal(classifyClipExportFailure('clip_output_write_unknown'),'output_unknown');
 assert.equal(safeClipExportFailureCode(new Error('private source URL and diagnostic')),'worker_failed');
 assert.equal(safeClipExportFailureCode({code:'ENOSPC',message:'private path'}),'clip_worker_disk_full');
 assert.equal(safeClipExportFailureCode({code:'EACCES',message:'private path'}),'clip_worker_filesystem_denied');
});

test('health requires fresh timestamped inventory, worker resources/progress and all read-only dependencies',()=>{
 const healthy=derive(evidence());assert.equal(healthy.classification,'healthy_saturated');assert.equal(healthy.health.status,'healthy');
 assert.equal(healthy.saturated,true);assert.equal(healthy.progressing,true);assert.equal(healthy.dependenciesHealthy,true);
 assert.equal(derive(evidence({activeJobs:0})).classification,'healthy_idle');
 assert.equal(derive(evidence({workerIds:[]})).classification,'healthy_idle','zero healthy inventory is not an automatic provisioning permit');
 for(const alter of [e=>delete e.inventory,e=>e.inventory.observedAtMs=1,e=>e.dependencies.pop(),
  e=>e.dependencies[0].observedAtMs=1,e=>e.dependencies[0].operation='paid_create',e=>e.workers[0].workerCgroup=null,
  e=>e.workers[0].workerCgroup.memoryLimitBytes=null,e=>e.workers[0].lastProgressAtMs=null,
  e=>e.workers[0].observedAtMs=now+1]){
  const raw=evidence();alter(raw);assert.equal(derive({...raw,healthy:true,health:{status:'healthy'}}).classification,'unknown');
 }
 assert.equal(deriveClipExportHealth({nowMs:now,healthy:true,health:{status:'healthy'}}).classification,'unknown');
});

test('known input rejection and source/cancel outcomes do not masquerade as systemic failures',()=>{
 const raw=evidence();raw.outcomes=[failed('invalid_source_probe','poison-1'),failed('trim_outside_source','poison-2'),
  failed('render_canceled','cancel-1'),failed('source_changed','source-1')];
 const health=derive(raw);assert.equal(health.classification,'healthy_saturated');assert.equal(health.health.failureClass,null);
 assert.equal(health.renderAttempts,4);assert.equal(health.renderFailures,4);assert.equal(health.permanentInputFailures,2);assert.equal(health.sourceOrCancelFailures,2);
 raw.outcomes.push({...raw.outcomes[0]});assert.equal(derive(raw).renderAttempts,4,'duplicate delivery is not another failed job');
});

test('typed dependency failures, read-only probe errors and unknown output each stop unsafe growth',()=>{
 for(const [code,kind] of [['clip_source_auth_failed','auth'],['clip_source_download_failed','storage'],['worker_rpc_unavailable','dependency']]){
  const raw=evidence();raw.outcomes=[failed(code)];const health=derive(raw);
  assert.equal(health.classification,'systemic_fault');assert.equal(health.health.failureClass,kind);assert.equal(health.dependenciesHealthy,false);
 }
 const probe=evidence();probe.dependencies[0].outcome='unavailable';assert.equal(derive(probe).classification,'systemic_fault');
 assert.equal(derive(probe).activeJobs,1,'dependency failure cannot invent idle work count');
 probe.workers=[];assert.equal(derive(probe).activeJobs,null,'unobserved worker count remains unknown, never zero');
 for(const code of ['clip_output_write_unknown','clip_output_readback_failed','completion_unknown']){
  const raw=evidence();raw.outcomes=[failed(code)];const health=derive(raw);
  assert.equal(health.classification,'unknown');assert.equal(health.reason,'output_reconciliation_required');
  assert.deepEqual(health.retryBlockedJobIds,['job-fixture']);assert.ok(health.alerts.includes('output_reconciliation_required'));
 }
 const unknown=evidence();unknown.outcomes=[failed('media_process_failed')];assert.equal(derive(unknown).classification,'unknown');
});

test('isolated measured faults are distinguished from fleet failures and unavailable measurements',()=>{
 const stale=evidence({workerIds:['bad','good']});stale.workers[0].lastHeartbeatAtMs=now-120000;
 const isolated=derive(stale);assert.equal(isolated.classification,'isolated_worker_fault');assert.equal(isolated.health.affectedWorkerId,'bad');assert.equal(isolated.health.dependenciesHealthy,true);
 stale.workers[1].lastHeartbeatAtMs=now-120000;assert.equal(derive(stale).classification,'systemic_fault');
 const oom=evidence();const old=structuredClone(oom.workers[0]);old.observedAtMs-=10000;old.workerCgroup.observedAtMs-=10000;
 oom.workers[0].workerCgroup.oomEvents.oomKill=1;oom.workers.unshift(old);assert.equal(derive(oom).classification,'isolated_worker_fault');
 const missingBaseline=evidence();missingBaseline.workers[0].workerCgroup.oomEvents.oomKill=1;assert.equal(derive(missingBaseline).classification,'unknown');
 const disk=evidence();disk.workers[0].tempAvailableBytes=4*1024**3;assert.equal(derive(disk).classification,'healthy_saturated','active work may consume already-reserved disk');
 disk.workers[0].activeJobs=0;assert.equal(derive(disk).classification,'isolated_worker_fault');
 const broken=evidence();broken.outcomes=[1,2,3].map(n=>failed('media_binary_unavailable',`binary-${n}`));assert.equal(derive(broken).health.crashLoop,true);
});

test('long rendering is not falsely called stalled or progressing from heartbeats/shared-host CPU',()=>{
 const raw=evidence();raw.workers[0].oldestJobStartedAtMs=now-1200000;raw.workers[0].lastProgressAtMs=now-1100000;
 let health=derive(raw);assert.equal(health.classification,'long_running');assert.equal(health.health.progressing,false);assert.equal(health.health.status,'healthy');
 const prior=structuredClone(raw.workers[0]);prior.observedAtMs-=10000;prior.workerCgroup.observedAtMs-=10000;prior.workerCgroup.cpuUsageUsec=1000000;
 raw.workers.unshift(prior);health=derive(raw);assert.equal(health.progressing,false,'unqualified/shared cgroup CPU is not render progress');
 raw.workers[1].workerCgroup.isolationVerified=true;health=derive(raw);assert.equal(health.classification,'long_running');assert.equal(health.cpuActivityObserved,true);
 assert.equal(health.progressing,false,'CPU activity is not a successful output checkpoint even in an isolated unit');
 raw.workers[1].sessionId='restarted-process';assert.equal(derive(raw).cpuActivityObserved,false,'CPU counter from another process incarnation is not progress');
});

test('throughput is measured only from deduplicated completed outcomes with valid elapsed duration',()=>{
 const raw=evidence();raw.outcomes=[{workerId:'worker-fixture',jobId:'timed',observedAtMs:now,status:'completed',elapsedMs:12000},
  {workerId:'worker-fixture',jobId:'untimed',observedAtMs:now,status:'completed'},failed('invalid_source_probe')];
 raw.outcomes.push({...raw.outcomes[0]});const health=derive(raw);
 assert.equal(health.completedJobs,1);assert.equal(health.totalRenderSeconds,12);assert.equal(health.renderAttempts,3);
 assert.equal(derive({...raw,outcomes:[]}).completedJobs,0);assert.equal(derive({...raw,outcomes:[]}).totalRenderSeconds,0);
});

test('real local HTTP auth/storage failures flow through transport, classifier and default controller without spending',{timeout:30000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'clip-health-http-'));let gets=0;
 const server=createServer((request,response)=>{gets++;response.writeHead(Number(request.url.slice(1))).end('fixture');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const source={storage_provider:'cloudflare_r2',storage_bucket:'fixture-private',storage_object_key:'fixture/source.mp4',file_size_bytes:7};
 try{
  for(const [status,code,classification] of [[401,'clip_source_auth_failed','dependency_auth'],[403,'clip_source_auth_failed','dependency_auth'],[503,'clip_source_download_failed','dependency_storage']]){
   let actual;
   try{await downloadClipSource({source,file:path.join(dir,`source-${status}`),signer:async()=>`http://127.0.0.1:${server.address().port}/${status}`});assert.fail('HTTP error must not produce source bytes');}
   catch(error){actual=safeClipExportFailureCode(error);assert.equal(actual,code);}
   assert.equal(classifyClipExportFailure(actual),classification);
   const raw=evidence();raw.outcomes=[failed(actual)];const derived=derive(raw);assert.equal(derived.classification,'systemic_fault');
   const backing={state:emptyClipScaleLedger()};let creates=0;
   const ledger={atomicDurable:true,async transact(_pool,change){const state=structuredClone(backing.state),result=change(state);backing.state=state;return result;}};
   const profile={approvalId:'SYNTHETIC LOCAL HTTP ONLY',poolId:'fixture_http',profileId:'fixture-profile',provider:'synthetic',purpose:'clip-render',managedEphemeral:true,
    ownershipNamespace:'fixture-owned-ephemeral',region:'fixture',machineType:'fixture-host',currency:'USD',minWorkers:0,maxWorkers:2,slotsPerWorker:1,globalSlotLimit:2,
    maxHourlyMicros:1000000,maxWorkerHourlyMicros:500000,expiresAtMs:now+3600000};
   const executor={capabilities:async()=>({...profile,qualified:true,checkedAtMs:now,expiresAtMs:now+60000,workerHourlyMicros:500000,inventoryComplete:true,untrackedResourceCount:0,
    idempotentCreate:true,reconcileCreate:true,reconcileDelete:true,conditionalDrainedDelete:true}),create:async()=>{creates++;throw Error('must not dispatch');}};
   const result=await runClipScaleControllerTick({enabled:true,executionEnabled:true,profile,ledger,executor,clock:()=>now,
    telemetry:{observedAtMs:now,queuedJobs:1000,oldestQueueAgeSeconds:500,activeWorkers:0,activeJobs:0,
     healthEvidence:raw,health:{...derived.health,status:'healthy',failureClass:null}}});
   assert.equal(result.action,'hold');assert.equal(creates,0);assert.equal(backing.state.healthState,'technical_delay');assert.equal(backing.state.breaker.status,'open');
   assert.equal(backing.state.resources.length,0,'auth/storage faults cannot be bought away with new hosts');
  }
  assert.equal(gets,3,'each source failure was one local read, not an automatic retry');
 }finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});
