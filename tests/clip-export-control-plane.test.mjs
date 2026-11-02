import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {CLIP_CONTROL_SQL,currentClipControlProfile,collectClipExportTelemetry,runClipExportControlPlane} from '../scripts/lib/clip-export-control-plane.mjs';
import {emptyClipScaleLedger} from '../scripts/lib/clip-export-scale-ledger.mjs';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';

// Explicit SQL adapter test double. Production code still executes its real SQL
// collector + real durable-ledger adapter + real classifier/planner/controller.
// This does not substitute for the separate native PostgreSQL contention runner.
function fixture(){
 const f={now:1_000_000,queries:[],mutations:0,inTransaction:0,providerCalls:[],factoryCalls:0,summaries:[],workers:[],outcomes:[],state:emptyClipScaleLedger(),revision:0,closed:0};
 f.profile={approvalId:'synthetic-approval',poolId:'clip-fixture',profileId:'profile-v1',provider:'synthetic',purpose:'clip-render',managedEphemeral:true,
  ownershipNamespace:'fixture-owned',region:'fixture',machineType:'fixture',currency:'USD',minWorkers:0,maxWorkers:4,slotsPerWorker:1,
  globalSlotLimit:4,maxHourlyMicros:4_000_000,maxWorkerHourlyMicros:1_000_000,expiresAtMs:20_000_000,startupProbeApproved:true};
 f.config={scale_pool_id:f.profile.poolId,max_active_jobs:4,enabled:true,scale_zero_admission_enabled:false,controller_admission_ready:false};
 f.queue={queued_jobs:1000,active_jobs:0,oldest_queue_age_seconds:180};
 f.connect=async()=>{
  let transaction=false,readOnly=false,pending,revision;
  return {async query(sql,args=[]){
   f.queries.push({sql,args});const command=sql.toLowerCase();
   if(command.startsWith('begin')){transaction=true;readOnly=command.includes('read only');pending=structuredClone(f.state);revision=f.revision;f.inTransaction++;return {rows:[]};}
   if(command==='commit'||command==='rollback'){
    if(command==='commit'&&!readOnly){f.state=pending;f.revision=revision;}
    if(transaction)f.inTransaction--;transaction=false;return {rows:[]};
   }
   if(command.startsWith('set local')||command.startsWith('select pg_advisory_xact_lock'))return {rows:[]};
   if(command.startsWith('insert ')||command.startsWith('update ')){
    assert.equal(readOnly,false,'dry-run SQL connection cannot write');f.mutations++;
    if(command.startsWith('update private.creator_clip_scale_ledger')){pending=JSON.parse(args[1]);revision++;}
    return {rows:[]};
   }
   if(sql===CLIP_CONTROL_SQL.clock)return {rows:[{observed_at_ms:f.now}]};
   if(sql===CLIP_CONTROL_SQL.config)return {rows:[structuredClone(f.config)]};
   if(command.startsWith('select revision,state from private.creator_clip_scale_ledger'))return {rows:[{revision:transaction?revision:f.revision,state:structuredClone(transaction?pending:f.state)}]};
   if(sql===CLIP_CONTROL_SQL.queue)return {rows:[structuredClone(f.queue)]};
   if(sql===CLIP_CONTROL_SQL.arrivals){assert.deepEqual(args,[f.now-300000,f.now]);return {rows:[{arrivals:10}]};}
   if(sql===CLIP_CONTROL_SQL.workers)return {rows:structuredClone(f.workers)};
   if(sql===CLIP_CONTROL_SQL.outcomes)return {rows:structuredClone(f.outcomes)};
   throw Error(`Unexpected synthetic SQL: ${sql}`);
  },async release(){assert.equal(transaction,false,'all connections leave the transaction before release');}};
 };
 f.samples=()=>f.workers.flatMap(worker=>[1500,500].map(age=>({workerId:worker.id,sessionId:worker.session_id,observedAtMs:f.now-age,
  capacity:99,activeJobs:99,lastHeartbeatAtMs:1,lastProgressAtMs:f.now-200,tempAvailableBytes:30*1024**3,
  workerCgroup:{observedAtMs:f.now-age,available:true,scope:'current-process-cgroup-v2-including-descendants',isolationVerified:false,
   memoryCurrentBytes:100,memoryLimitBytes:1000,oomEvents:{oomKill:0},cpuUsageUsec:10000000-age}})));
 f.adapter={connect:f.connect,async readApprovedProfile(){return f.profile;},async readWorkerSamples(){assert.equal(f.inTransaction,0);return f.samples();},
  async probeDependencies(){assert.equal(f.inTransaction,0);return ['database','source_storage','output_storage'].map(dependency=>({dependency,operation:'read_only_probe',outcome:'ok',observedAtMs:f.now}));},
  async readWorkerQualifications(){return f.workers.map(worker=>({workerId:worker.id,sessionId:worker.session_id,profileId:f.profile.profileId,
   checkedAtMs:f.now,expiresAtMs:f.now+60000,isolated:true,scope:'current-process-cgroup-v2-including-descendants'}));},
  async close(){f.closed++;}};
 f.ownership=id=>({operationId:id,purpose:'clip-render',managedEphemeral:true,ownershipNamespace:f.profile.ownershipNamespace});
 f.executor={async capabilities(){return {...f.profile,qualified:true,checkedAtMs:f.now,expiresAtMs:f.now+60000,workerHourlyMicros:500000,
  inventoryComplete:true,untrackedResourceCount:0,idempotentCreate:true,reconcileCreate:true,reconcileDelete:true,conditionalDrainedDelete:true};},
  async create(action){
   f.providerCalls.push(action);const workerId=randomUUID(),resourceId=`synthetic-${action.operationId}`;
   f.workers.push({id:workerId,session_id:randomUUID(),capacity:1,enabled:true,draining:false,last_heartbeat_at:new Date(f.now),lease_until:new Date(f.now+120000),active_jobs:0,oldest_job_started_at:null});
   return {outcome:'present',settled:true,workerId,resourceId,ownershipProof:f.ownership(action.operationId),billableAssets:[{id:resourceId,kind:'compute',owned:true,shared:false}]};
  },async observe(action){f.providerCalls.push(action);return {resourceId:action.resourceId,workerId:action.workerId,ready:true,claimingDisabled:false,
   workerStopped:false,activeJobs:0,observedAtMs:f.now,ownershipProof:f.ownership(action.operationId)};},
  async drain(action){f.providerCalls.push(action);return {draining:true};},
 };
 f.run=overrides=>runClipExportControlPlane({enabled:true,once:true,adapter:f.adapter,clock:()=>f.now,onSummary:value=>f.summaries.push(value),
  executorFactory:async()=>{f.factoryCalls++;return f.executor;},...overrides});
 f.seed=()=>{
  const workerId=randomUUID(),sessionId=randomUUID(),id=`${f.profile.poolId}:1`;
  f.workers=[{id:workerId,session_id:sessionId,capacity:1,enabled:true,draining:false,last_heartbeat_at:new Date(f.now),lease_until:new Date(f.now+120000),active_jobs:1,oldest_job_started_at:new Date(f.now-10000)}];
  f.queue.active_jobs=1;
  f.state.sequence=1;f.state.resources=[{id,profileId:f.profile.profileId,profileSnapshot:structuredClone(f.profile),currency:'USD',purpose:'clip-render',managedEphemeral:true,
   ownershipNamespace:f.profile.ownershipNamespace,hourlyMicros:1000000,status:'ready',resourceId:'synthetic-existing',workerId,createdAtMs:f.now-100000,observation:null}];
  f.outcomes=[{id:randomUUID(),worker_id:workerId,worker_session:sessionId,status:'ready',error_code:null,started_at:new Date(f.now-65000),updated_at:new Date(f.now-5000)}];
 };
 return f;
}

test('CLI default OFF and --help load neither adapter nor credentials nor network',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'clip-control-off-')),marker=path.join(dir,'loaded'),module=path.join(dir,'adapter.mjs');
 try{
  await writeFile(module,`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'loaded');throw Error('must not import');`);
  for(const args of [['--once'],['--loop','--execute'],['--help']]){
   const result=spawnSync(process.execPath,['scripts/clip-export-control-plane-cli.mjs',...args],{encoding:'utf8',env:{PATH:process.env.PATH,
    CLIP_EXPORT_TELEMETRY_ADAPTER:module,CLIP_EXPORT_PROVIDER_ADAPTER:module}});
   assert.equal(result.status,0,result.stderr);await assert.rejects(access(marker));
  }
  const help=spawnSync(process.execPath,['scripts/clip-export-control-plane-cli.mjs','--help'],{encoding:'utf8',env:{PATH:process.env.PATH,CLIP_EXPORT_CONTROL_PLANE_ENABLED:'true',CLIP_EXPORT_TELEMETRY_ADAPTER:module}});
  assert.equal(help.status,0);await assert.rejects(access(marker));
  const telemetry=path.join(dir,'telemetry.mjs');
  await writeFile(telemetry,'export function createClipExportTelemetryAdapter(){return {connect(){throw Error("unused");},readApprovedProfile(){return null;},readWorkerSamples(){return [];},probeDependencies(){return [];}}}');
  const dry=spawnSync(process.execPath,['scripts/clip-export-control-plane-cli.mjs','--once'],{encoding:'utf8',env:{PATH:process.env.PATH,
   CLIP_EXPORT_CONTROL_PLANE_ENABLED:'true',CLIP_EXPORT_TELEMETRY_ADAPTER:telemetry,CLIP_EXPORT_PROVIDER_ADAPTER:module}});
  assert.equal(dry.status,1);assert.match(dry.stdout,/"mode":"dry-run"/u);await assert.rejects(access(marker));
 }finally{await rm(dir,{recursive:true,force:true});}
 assert.deepEqual(await runClipExportControlPlane(),{enabled:false,mode:'disabled',ticks:0});
});

test('collector composes bound DB inventory, actual outcome timing and qualified raw samples, never caller healthy/capacity flags',async()=>{
 const f=fixture();f.seed();const result=await collectClipExportTelemetry({adapter:f.adapter,profile:f.profile,clock:()=>f.now});
 assert.equal(result.telemetry.healthEvidence.workers[0].capacity,1);assert.equal(result.telemetry.healthEvidence.workers[0].activeJobs,1);
 assert.equal(result.measured.completedJobs,1);assert.equal(result.measured.totalRenderSeconds,60);assert.equal(result.measured.classification,'healthy_saturated');
 assert.equal(result.telemetry.arrivalRatePerMinute,2);assert.equal(result.telemetry.qualifiedWorkerMemory.isolated,true);
 assert.equal(result.telemetry.healthEvidence.outcomes[0].elapsedMs,60000);assert.equal(f.mutations,0);
 assert.ok(f.queries.some(query=>query.sql==='begin isolation level repeatable read read only'));
 assert.ok(f.queries.every(query=>!/(?:source_snapshot|owner_id|storage_object_key|signed_url)/u.test(query.sql)));
});

test('default dry-run advances only ephemeral recommendations and never writes ledger or loads provider',async()=>{
 const f=fixture();f.seed();const stop=new AbortController();let waits=0;
 const result=await f.run({once:false,signal:stop.signal,wait:async()=>{f.now+=10000;if(++waits===3)stop.abort();}});
 assert.equal(result.ticks,3);assert.equal(result.last.action,'recommend-increase');assert.equal(f.factoryCalls,0);assert.equal(f.providerCalls.length,0);assert.equal(f.mutations,0);
 assert.equal(f.state.sequence,1);assert.deepEqual(f.state.planningState,{});
 assert.doesNotMatch(JSON.stringify(f.summaries),/workerId|jobId|source|ownershipNamespace|profileSnapshot|password|token/u);
});

test('current binding, worker gate, bounded snapshot and unknown telemetry all fail closed before provider factory',async()=>{
 for(const setup of [f=>f.config.scale_pool_id=null,f=>f.config.max_active_jobs=1,f=>f.config.enabled=false,f=>f.profile.expiresAtMs=NaN]){
  const f=fixture();setup(f);const result=await f.run({executionEnabled:true});assert.equal(result.last.executed,false);assert.equal(f.factoryCalls,0);assert.equal(f.mutations,0);
 }
 const f=fixture();f.seed();f.adapter.readWorkerSamples=async()=>[];
 const result=await f.run();assert.equal(result.last.processingClassification,'unknown');assert.notEqual(result.last.action,'recommend-increase');
 const g=fixture();g.workers=Array.from({length:33},()=>({id:randomUUID()}));assert.equal((await g.run()).last.reason,'clip_control_telemetry_limit_exceeded');
});

test('actual 31-second composed polls refresh observations before consuming real planner growth and idle hysteresis',async()=>{
 for(const idle of [false,true]){
  const f=fixture();f.seed();
  if(idle){f.queue={queued_jobs:0,active_jobs:0,oldest_queue_age_seconds:0};f.workers[0].active_jobs=0;f.outcomes=[];}
  const stop=new AbortController();let waits=0;
  const result=await f.run({executionEnabled:true,once:false,signal:stop.signal,wait:async()=>{
   f.now+=31000;for(const worker of f.workers){worker.last_heartbeat_at=new Date(f.now);worker.lease_until=new Date(f.now+120000);}
   if(++waits===(idle?5:3))stop.abort();
  }});
  assert.equal(result.last.action,idle?'drain':'create');
  assert.equal(f.providerCalls.filter(action=>action.kind===(idle?'drain':'create')).length,1);
  assert.equal(f.providerCalls.filter(action=>action.kind==='observe').length,idle?5:3);
 }
});

test('one tick bounds failed physical observation attempts and never creates from unknown observations',async()=>{
 const f=fixture();f.seed();f.executor.observe=async action=>{f.providerCalls.push(action);return null;};
 const result=await f.run({executionEnabled:true});
 assert.equal(f.providerCalls.filter(action=>action.kind==='observe').length,32);
 assert.equal(f.providerCalls.some(action=>['create','drain','delete'].includes(action.kind)),false);
 assert.notEqual(result.last.action,'create');
});

test('fresh disable during observation prevents the follow-on mutation and preserves genuine metric timestamps',async()=>{
 const f=fixture();f.seed();f.state.planningState={workersSeen:1,highSamples:2,lowSamples:0,lastObservationAtMs:f.now-31000};
 const observe=f.executor.observe;
 f.executor.observe=async action=>{const result=await observe(action);f.config.enabled=false;return result;};
 const stopped=await f.run({executionEnabled:true});
 assert.equal(stopped.last.reason,'clip_control_worker_gate_disabled');
 assert.deepEqual(f.providerCalls.map(action=>action.kind),['observe']);
 const g=fixture();g.seed();const probes=g.adapter.probeDependencies;
 g.adapter.probeDependencies=async options=>{g.now+=25;return probes(options);};
 const start=g.now,result=await g.run();
 assert.equal(result.last.observedAtMs,start);assert.equal(result.last.completedAtMs,start+25);
 assert.equal(result.last.snapshotReservedHourlyMicros,1000000);assert.equal(result.last.actualProviderBillKnown,false);
 assert.equal(result.last.snapshotLedgerRevision,0);
});

test('expired structurally valid approval reconciles original scope read-only but cannot mutate infrastructure',async()=>{
 const f=fixture();f.executor.create=async action=>{f.providerCalls.push(action);return {outcome:'unknown',settled:false};};
 assert.equal((await f.run({executionEnabled:true})).last.action,'create');
 const originalExpiry=f.profile.expiresAtMs;f.profile.expiresAtMs=f.now-1;f.config.enabled=false;f.config.max_active_jobs=1;
 f.executor.reconcileCreate=async action=>{f.providerCalls.push(action);return {outcome:'unknown',settled:false};};
 assert.equal((await f.run({executionEnabled:true})).last.action,'reconcileCreate');
 assert.equal(f.state.resources[0].status,'unknown_create');assert.equal(f.state.resources[0].hourlyMicros,1000000);
 f.executor.reconcileCreate=async action=>{
  f.providerCalls.push(action);assert.equal(action.profile.expiresAtMs,originalExpiry);
  return {outcome:'absent',settled:true,absenceProof:{...f.ownership(action.operationId),observedAtMs:f.now,
   computeAbsent:true,ownedIPv4Absent:true,otherOwnedBillableAssetsAbsent:true}};
 };
 assert.equal((await f.run({executionEnabled:true})).last.action,'reconcileCreate');
 assert.equal((await f.run({executionEnabled:true})).last.executed,false);
 assert.deepEqual(f.providerCalls.map(action=>action.kind),['create','reconcileCreate','reconcileCreate']);
});

test('stale host envelopes, inconsistent nested clocks and unproven memory qualifications never become fresh',async()=>{
 for(const change of [
  sample=>{sample.observedAtMs-=120000;},
  sample=>{sample.workerCgroup.observedAtMs=sample.observedAtMs+1;},
 ]){
  const f=fixture();f.seed();const samples=f.samples();samples.forEach(change);f.samples=()=>samples;
  const result=await collectClipExportTelemetry({adapter:f.adapter,profile:f.profile,clock:()=>f.now});
  assert.equal(result.telemetry.qualifiedWorkerMemory,null);assert.equal(result.measured.classification,'unknown');
  assert.equal(result.measured.activeJobs,1,'fresh database inventory must not invent zero busy jobs');
  assert.equal(result.telemetry.healthEvidence.workers[0].tempAvailableBytes,null);
 }
 for(const change of [proof=>delete proof.expiresAtMs,proof=>proof.expiresAtMs=NaN,proof=>proof.expiresAtMs=0]){
  const f=fixture();f.seed();const original=f.adapter.readWorkerQualifications;f.adapter.readWorkerQualifications=async()=>{
   const proofs=await original();proofs.forEach(change);return proofs;};
  assert.equal((await collectClipExportTelemetry({adapter:f.adapter,profile:f.profile,clock:()=>f.now})).telemetry.qualifiedWorkerMemory,null);
 }
 const f=fixture();f.seed();const samples=f.samples();samples[0].workerCgroup.observedAtMs-=120000;f.samples=()=>samples;
 assert.equal((await collectClipExportTelemetry({adapter:f.adapter,profile:f.profile,clock:()=>f.now})).telemetry.qualifiedWorkerMemory,null);
});

test('composed execution uses durable adapter, preserves reservations across restart and does not repeat startup create',async()=>{
 const f=fixture();const first=await f.run({executionEnabled:true});assert.equal(first.last.action,'create');
 assert.equal(f.state.resources.length,1);assert.equal(f.state.resources[0].status,'booting');assert.ok(f.revision>=2);
 f.now+=1000;
 const restarted=await f.run({executionEnabled:true});assert.equal(restarted.last.executed,false);
 assert.equal(f.state.resources[0].status,'ready');assert.equal(f.providerCalls.filter(action=>action.kind==='create').length,1);
 assert.ok(f.providerCalls.some(action=>action.kind==='observe'));assert.equal(f.closed,2);
});

test('startup limits survive profile sanitation and missing qualification never becomes trusted isolated RAM',async()=>{
 const f=fixture();f.profile.startupTimeoutMs=60000;f.profile.maxStartupStartsPer24Hours=2;f.profile.maxStartupReservationMicrosPer24Hours=2000000;
 const profile=currentClipControlProfile({...f.profile,providerSecret:'never-copy'},f.now);
 assert.equal(profile.startupTimeoutMs,60000);assert.equal(profile.maxStartupStartsPer24Hours,2);assert.equal(profile.maxStartupReservationMicrosPer24Hours,2000000);assert.equal(profile.providerSecret,undefined);
 f.seed();delete f.adapter.readWorkerQualifications;
 const result=await collectClipExportTelemetry({adapter:f.adapter,profile:f.profile,clock:()=>f.now});assert.equal(result.telemetry.qualifiedWorkerMemory,null);
 assert.equal((await f.run()).last.action,'blocked');
});

test('collector SQL executes against the actual full migration fixture (not native contention)',{timeout:240000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true});const f=fixture();
 try{
  await db.query('update private.creator_clip_export_worker set scale_pool_id=$1,max_active_jobs=4,enabled=false where singleton',[f.profile.poolId]);
  f.adapter.connect=async()=>({query:(sql,args)=>db.query(sql,args),release:async()=>{}});
  const result=await f.run();assert.equal(result.last.reason,'clip_control_worker_gate_disabled');assert.equal(f.factoryCalls,0);
  await db.query('update private.creator_clip_export_worker set enabled=true where singleton');
  // Exercise the complete collector and planner with the gate on as well. Only
  // this disposable local fixture is changed; no provider adapter is loaded.
  const active=await collectClipExportTelemetry({adapter:f.adapter,profile:f.profile,clock:Date.now});
  assert.equal(active.snapshot.queue.queuedJobs,0);assert.equal(active.snapshot.workers.length,0);assert.equal(active.snapshot.outcomes.length,0);
  assert.equal(f.factoryCalls,0);
  assert.equal((await db.query('select count(*)::integer as n from private.creator_clip_scale_ledger')).rows[0].n,0,'dry-run never creates a ledger row');
 }finally{await db.close();}
});
