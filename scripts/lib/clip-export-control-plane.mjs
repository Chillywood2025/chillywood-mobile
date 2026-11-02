import {setTimeout as delay} from 'node:timers/promises';
import {deriveClipExportHealth,safeClipExportFailureCode} from './clip-export-health.mjs';
import {planClipExportCapacity} from './clip-export-scale-plan.mjs';
import {createPostgresClipScaleLedger,emptyClipScaleLedger} from './clip-export-scale-ledger.mjs';
import {runClipScaleControllerTick} from './clip-export-scale-controller.mjs';

const POOL=/^[a-z][a-z0-9_-]{0,63}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const SCOPE='current-process-cgroup-v2-including-descendants';
const WINDOW_MS=300000;
const TERMINAL=new Set(['deleted','absent']);
const number=value=>value===null||value===undefined?null:Number(value);
const timestamp=value=>value===null||value===undefined?null:typeof value==='number'?value:new Date(value).getTime();
const integer=(value,min,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const fresh=(at,now,max=60000)=>Number.isFinite(at)&&at<=now&&now-at<=max;
const PROFILE_KEYS=['approvalId','poolId','profileId','provider','purpose','managedEphemeral','ownershipNamespace','region','machineType',
 'currency','minWorkers','maxWorkers','slotsPerWorker','globalSlotLimit','maxHourlyMicros','maxWorkerHourlyMicros','expiresAtMs',
 'retireProfileIds','startupProbeApproved','replacementProbeApproved','startupTimeoutMs',
 'maxStartupStartsPer24Hours','maxStartupReservationMicrosPer24Hours'];

export function currentClipControlProfile(value,now,{allowExpired=false}={}){
 if(!value||!POOL.test(value.poolId??'')||!POOL.test(value.ownershipNamespace??'')
  ||!['approvalId','profileId','provider','region','machineType'].every(key=>typeof value[key]==='string'&&value[key].length>0&&value[key].length<=200)
  ||value.purpose!=='clip-render'||value.managedEphemeral!==true||!/^[A-Z]{3}$/u.test(value.currency??'')
  ||!integer(value.minWorkers,0,32)||!integer(value.maxWorkers,1,32)||value.minWorkers>value.maxWorkers
  ||!integer(value.slotsPerWorker,1,8)||!integer(value.globalSlotLimit,1,32)||value.maxWorkers*value.slotsPerWorker>value.globalSlotLimit
  ||!integer(value.maxHourlyMicros,1)||!integer(value.maxWorkerHourlyMicros,1,value.maxHourlyMicros)
  ||!Number.isFinite(value.expiresAtMs)||value.expiresAtMs<=0||(!allowExpired&&value.expiresAtMs<=now)
  ||(value.startupTimeoutMs!==undefined&&!integer(value.startupTimeoutMs,60000,900000))
  ||(value.maxStartupStartsPer24Hours!==undefined&&!integer(value.maxStartupStartsPer24Hours,1,24))
  ||(value.maxStartupReservationMicrosPer24Hours!==undefined&&!integer(value.maxStartupReservationMicrosPer24Hours,1))
  ||(value.retireProfileIds!==undefined&&(!Array.isArray(value.retireProfileIds)||value.retireProfileIds.length>100
   ||value.retireProfileIds.some(id=>typeof id!=='string'||!id||id.length>200))))return null;
 // Profile snapshots never carry adapter credentials or arbitrary payloads.
 return Object.fromEntries(PROFILE_KEYS.filter(key=>Object.hasOwn(value,key)).map(key=>[key,structuredClone(value[key])]));
}

export const CLIP_CONTROL_SQL=Object.freeze({
 clock:'select floor(extract(epoch from clock_timestamp())*1000)::bigint as observed_at_ms',
 config:'select scale_pool_id,max_active_jobs,enabled,scale_zero_admission_enabled,controller_admission_ready from private.creator_clip_export_worker where singleton',
 ledger:'select revision,state from private.creator_clip_scale_ledger where pool_id=$1',
 queue:`select count(*) filter(where status='queued')::integer as queued_jobs,
 count(*) filter(where status='rendering' and lease_until>clock_timestamp())::integer as active_jobs,
 coalesce(extract(epoch from clock_timestamp()-min(created_at) filter(where status='queued')),0)::double precision as oldest_queue_age_seconds
 from private.creator_clip_export_jobs where status in('queued','rendering')`,
 arrivals:'select count(*)::integer as arrivals from private.creator_clip_export_jobs where created_at>=to_timestamp($1/1000.0) and created_at<=to_timestamp($2/1000.0)',
 workers:`select w.id,w.session_id,w.capacity,w.enabled,w.draining,w.last_heartbeat_at,w.lease_until,
 (select count(*)::integer from private.creator_clip_export_jobs j where j.worker_id=w.id and j.status='rendering' and j.lease_until>clock_timestamp()) as active_jobs,
 (select min(started_at) from private.creator_clip_export_jobs j where j.worker_id=w.id and j.status='rendering' and j.lease_until>clock_timestamp()) as oldest_job_started_at
 from private.creator_clip_export_workers w where w.enabled or w.lease_until>clock_timestamp() or w.id=any($1::uuid[])
 or exists(select 1 from private.creator_clip_export_jobs j where j.worker_id=w.id and j.status='rendering' and j.lease_until>clock_timestamp()) order by w.id limit 33`,
 outcomes:`select id,worker_id,worker_session,status,error_code,started_at,updated_at from private.creator_clip_export_jobs
 where status in('ready','failed','canceled','stale') and worker_id is not null
 and updated_at>=to_timestamp($1/1000.0) and updated_at<=to_timestamp($2/1000.0) order by updated_at desc,id limit 10001`,
});

/** No query here mutates data. The SQL snapshot closes before any dependency or
 * host adapter call. The DB connection is an explicit trusted operator adapter,
 * not a runtime service-role credential or an arbitrary database URL. */
export async function readClipControlSnapshot({connect,profile,signal,allowCapacityMismatch=false}={}){
 if(signal?.aborted)throw new Error('clip_control_stopped');
 const client=await connect({signal,readOnly:true});let committed=false;
 try{
  await client.query('begin isolation level repeatable read read only');
  await client.query("set local statement_timeout='10s'");await client.query("set local lock_timeout='2s'");
  const observedAtMs=number((await client.query(CLIP_CONTROL_SQL.clock)).rows[0]?.observed_at_ms);
  const config=(await client.query(CLIP_CONTROL_SQL.config)).rows[0];
  if(config?.scale_pool_id!==profile.poolId)throw new Error('clip_control_pool_binding_required');
  if(number(config.max_active_jobs)!==profile.globalSlotLimit&&!allowCapacityMismatch)throw new Error('clip_control_capacity_binding_mismatch');
  const saved=(await client.query(CLIP_CONTROL_SQL.ledger,[profile.poolId])).rows[0];
  const ledger=saved?.state??emptyClipScaleLedger();
  if(ledger.version!==1||!Array.isArray(ledger.resources)||ledger.resources.length>10000)throw new Error('clip_control_ledger_invalid');
  const live=ledger.resources.filter(resource=>!TERMINAL.has(resource.status));
  if(live.length>32)throw new Error('clip_control_inventory_exceeds_bound');
  const knownIds=live.map(resource=>resource.workerId).filter(Boolean);
  if(knownIds.some(id=>!UUID.test(id)))throw new Error('clip_control_worker_identity_invalid');
  const queue=(await client.query(CLIP_CONTROL_SQL.queue)).rows[0];
  const arrivals=number((await client.query(CLIP_CONTROL_SQL.arrivals,[observedAtMs-WINDOW_MS,observedAtMs])).rows[0]?.arrivals);
  const workers=(await client.query(CLIP_CONTROL_SQL.workers,[knownIds])).rows;
  const rows=(await client.query(CLIP_CONTROL_SQL.outcomes,[observedAtMs-WINDOW_MS,observedAtMs])).rows;
  if(workers.length>32||rows.length>10000)throw new Error('clip_control_telemetry_limit_exceeded');
  const queuedJobs=number(queue?.queued_jobs),activeJobs=number(queue?.active_jobs),oldestQueueAgeSeconds=number(queue?.oldest_queue_age_seconds);
  if(!Number.isSafeInteger(observedAtMs)||!integer(queuedJobs,0)||!integer(activeJobs,0,32)||!integer(arrivals,0)
   ||!Number.isFinite(oldestQueueAgeSeconds)||oldestQueueAgeSeconds<0)throw new Error('clip_control_snapshot_invalid');
  const outcomes=rows.map(row=>({workerId:row.worker_id,jobId:row.id,sessionId:row.worker_session,observedAtMs:timestamp(row.updated_at),
   status:row.status==='ready'?'completed':'failed',errorCode:row.status==='ready'?null:safeClipExportFailureCode(row.status==='canceled'?'render_canceled':row.status==='stale'?'source_changed':row.error_code),
   elapsedMs:row.status==='ready'&&row.started_at?Math.round(timestamp(row.updated_at)-timestamp(row.started_at)):null}));
  await client.query('commit');committed=true;
  return {observedAtMs,config,ledger,ledgerRevision:number(saved?.revision??0),workers,outcomes,
   queue:{queuedJobs,activeJobs,oldestQueueAgeSeconds,arrivalRatePerMinute:arrivals/5,windowSeconds:300}};
 }finally{if(!committed)await client.query('rollback').catch(()=>{});await client.release();}
}

function memoryQualification(workers,qualifications,profile,now){
 if(!Array.isArray(qualifications)||qualifications.length>32||!workers.length)return null;
 const ids=[...new Set(workers.map(worker=>worker.workerId))];let worst=null,oomEventsDelta=0,observedAtMs=now;
 for(const id of ids){
  const samples=workers.filter(worker=>worker.workerId===id).sort((a,b)=>b.observedAtMs-a.observedAtMs);
  const latest=samples[0],current=latest.workerCgroup;
  const previousSample=samples.find(sample=>sample.observedAtMs<latest.observedAtMs&&sample.sessionId===latest.sessionId);
  const previous=previousSample?.workerCgroup;
  const proof=qualifications.find(item=>item?.workerId===id&&item.sessionId===latest.sessionId&&item.profileId===profile.profileId);
  if(!proof||proof.isolated!==true||proof.scope!==SCOPE||!fresh(proof.checkedAtMs,now)||!Number.isFinite(proof.expiresAtMs)||proof.expiresAtMs<=now
   ||!fresh(latest.observedAtMs,now)||!fresh(previousSample?.observedAtMs,now)
   ||current?.available!==true||current.scope!==SCOPE||!fresh(current.observedAtMs,now)||current.observedAtMs>latest.observedAtMs
   ||previous?.available!==true||previous.scope!==SCOPE||!fresh(previous.observedAtMs,now)
   ||previous.observedAtMs>previousSample.observedAtMs||previous.observedAtMs>=current.observedAtMs
   ||!integer(current.memoryCurrentBytes,0)||!integer(current.memoryLimitBytes,1)
   ||!integer(current.oomEvents?.oomKill,0)||!integer(previous?.oomEvents?.oomKill,0)
   ||current.oomEvents.oomKill<previous.oomEvents.oomKill)return null;
  oomEventsDelta+=current.oomEvents.oomKill-previous.oomEvents.oomKill;observedAtMs=Math.min(observedAtMs,current.observedAtMs);
  if(!worst||current.memoryCurrentBytes/current.memoryLimitBytes>worst.memoryCurrentBytes/worst.memoryLimitBytes)worst=current;
 }
 return {observedAtMs,currentBytes:worst.memoryCurrentBytes,limitBytes:worst.memoryLimitBytes,oomEventsDelta,isolated:true,scope:SCOPE,workersMeasured:ids.length};
}

export async function collectClipExportTelemetry({adapter,profile,signal,clock=Date.now}={}){
 const snapshot=await readClipControlSnapshot({connect:adapter.connect,profile,signal,
  allowCapacityMismatch:Number.isFinite(profile.expiresAtMs)&&profile.expiresAtMs<=clock()});
 const workerIds=snapshot.workers.map(worker=>worker.id);
 // These explicitly read-only adapters are separately qualified. A successful
 // privileged SQL snapshot is NOT proof that render-worker RPC auth is healthy.
 const observations=await Promise.allSettled([
  adapter.readWorkerSamples({workerIds,observedSinceMs:snapshot.observedAtMs-WINDOW_MS,limit:10000,signal}),
  adapter.probeDependencies({profile,signal}),
  typeof adapter.readWorkerQualifications==='function'?adapter.readWorkerQualifications({workerIds,profile,signal}):[],
 ]);
 const [raw,dependencies,qualifications]=observations.map(result=>result.status==='fulfilled'?result.value:[]);
 if(!Array.isArray(raw)||raw.length>10000||!Array.isArray(dependencies)||dependencies.length>1000)throw new Error('clip_control_telemetry_limit_exceeded');
 const now=clock(),registry=new Map(snapshot.workers.map(worker=>[worker.id,worker]));
 const workers=raw.flatMap(sample=>{
  const known=registry.get(sample?.workerId);
  if(!known||!known.session_id||sample.sessionId!==known.session_id||!fresh(sample.observedAtMs,now)
   ||(sample.workerCgroup&&(!fresh(sample.workerCgroup.observedAtMs,now)||sample.workerCgroup.observedAtMs>sample.observedAtMs)))return [];
  return [{workerId:known.id,sessionId:known.session_id,observedAtMs:sample.observedAtMs,
   lastHeartbeatAtMs:timestamp(known.last_heartbeat_at),capacity:number(known.capacity),activeJobs:number(known.active_jobs),
   oldestJobStartedAtMs:timestamp(known.oldest_job_started_at),lastProgressAtMs:sample.lastProgressAtMs,
   tempAvailableBytes:sample.tempAvailableBytes,workerCgroup:sample.workerCgroup}];
 });
 for(const known of snapshot.workers){
  const samples=workers.filter(worker=>worker.workerId===known.id).sort((a,b)=>b.observedAtMs-a.observedAtMs);
  // Do not refresh a host sample's timestamp using the DB clock. In particular,
  // old disk headroom cannot become fresh because a nested RAM sample is newer.
  // A missing host sample contributes ONLY fresh authoritative inventory counts.
  if(!samples.length)workers.push({workerId:known.id,sessionId:known.session_id,observedAtMs:snapshot.observedAtMs,
   lastHeartbeatAtMs:timestamp(known.last_heartbeat_at),capacity:number(known.capacity),activeJobs:number(known.active_jobs),
   oldestJobStartedAtMs:timestamp(known.oldest_job_started_at),lastProgressAtMs:null,tempAvailableBytes:null,workerCgroup:null});
 }
 const healthEvidence={observedAtMs:snapshot.observedAtMs,inventory:{observedAtMs:snapshot.observedAtMs,workerIds},
  workers,outcomes:snapshot.outcomes,dependencies};
 const measured=deriveClipExportHealth({...healthEvidence,nowMs:now});
 const qualifiedWorkerMemory=workers.length&&new Set(workers.map(worker=>worker.workerId)).size===workerIds.length
  ?memoryQualification(workers,qualifications,profile,now):null;
 return {snapshot,telemetry:{observedAtMs:snapshot.observedAtMs,...snapshot.queue,healthEvidence,qualifiedWorkerMemory},measured};
}

function dryPlan({profile,snapshot,telemetry,measured,clock,planningState}){
 const live=snapshot.ledger.resources.filter(resource=>!TERMINAL.has(resource.status));
 const expected=live.map(resource=>resource.workerId).filter(Boolean).sort();
 const actual=[...telemetry.healthEvidence.inventory.workerIds].sort();
 const health=JSON.stringify(expected)===JSON.stringify(actual)?measured.health:{...measured.health,status:'unknown',failureClass:null,progressing:false,saturated:false};
 return planClipExportCapacity({enabled:true,nowMs:clock(),approvedProfile:{id:profile.profileId,approved:true,
  minWorkers:profile.minWorkers,maxWorkers:profile.maxWorkers,slotsPerWorker:profile.slotsPerWorker,globalSlotLimit:profile.globalSlotLimit,
  workerComputeCostPerHour:profile.maxWorkerHourlyMicros/1e6,maxComputeCostPerHour:profile.maxHourlyMicros/1e6,startupProbeApproved:profile.startupProbeApproved===true},
  observation:{...telemetry,...measured,health,activeWorkers:live.length},state:{...(planningState??snapshot.ledger.planningState),lastChangeAtMs:snapshot.ledger.lastScaleAtMs}});
}

/** Composed control loop. Default dry-run is physically read-only, including
 * its ledger access; no provider factory is invoked. Execution requires a fresh
 * explicit profile and a separately enabled, qualified provider adapter. */
export async function runClipExportControlPlane({enabled=false,executionEnabled=false,once=true,pollMs=30000,
 adapter,executorFactory,signal,onSummary=()=>{},clock=Date.now,wait=delay}={}){
 if(enabled!==true)return {enabled:false,mode:'disabled',ticks:0};
 if(!integer(pollMs,1000,60000)||!adapter||!['connect','readApprovedProfile','readWorkerSamples','probeDependencies'].every(key=>typeof adapter[key]==='function'))throw new Error('clip_control_adapter_configuration_required');
 if(executionEnabled&&typeof executorFactory!=='function')throw new Error('clip_control_executor_factory_required');
 let ticks=0,last=null,planningState,planningProfile;
 try{
  while(!signal?.aborted){
   try{
    // A structurally valid expired original profile permits only the controller's
    // original-scope read-only reconciliation. It never renews mutation authority.
    const profile=currentClipControlProfile(await adapter.readApprovedProfile({signal}),clock(),{allowExpired:executionEnabled});
    if(!profile)throw new Error('clip_control_current_approved_profile_required');
    if(planningProfile!==profile.profileId){planningState=undefined;planningProfile=profile.profileId;}
    let collected=await collectClipExportTelemetry({adapter,profile,signal,clock});
    if(signal?.aborted)break;
    let decision;
    if(executionEnabled){
     // Provider code is not even loaded until every read-only precondition above
     // passed and the current profile still authorizes this execution path.
     if(collected.snapshot.config.enabled!==true&&profile.expiresAtMs>clock())throw new Error('clip_control_worker_gate_disabled');
     if(!currentClipControlProfile(profile,clock(),{allowExpired:true}))throw new Error('clip_control_current_approved_profile_required');
     const provider=await executorFactory({profile,signal});let observationCalls=0;
     const executor=new Proxy(provider,{get(target,key){
      const value=Reflect.get(target,key);
      if(key==='observe'&&typeof value==='function')return async action=>{
       if(observationCalls>=32)throw new Error('clip_control_observation_budget_exhausted');
       observationCalls++;return value.call(target,action);
      };
      return typeof value==='function'?value.bind(target):value;
     }});
     const ledger=createPostgresClipScaleLedger({connect:()=>adapter.connect({signal,readOnly:false})});
     // Avoid a 30-second delay for each of 32 read-only observations. Stop after
     // the first non-observe action, so this cannot become a burst of paid creates.
     for(let observations=0;observations<=32&&!signal?.aborted;observations++){
      if(collected.snapshot.config.enabled!==true&&profile.expiresAtMs>clock())throw new Error('clip_control_worker_gate_disabled');
      const before=observationCalls;
      decision=await runClipScaleControllerTick({enabled:true,executionEnabled:true,profile,executor,ledger,telemetry:collected.telemetry,clock});
      if(!['observe','observeBatch'].includes(decision.action))break;
      if(observationCalls===before)break;
      collected=await collectClipExportTelemetry({adapter,profile,signal,clock});
     }
    }else{
     decision=collected.snapshot.config.enabled===true?dryPlan({...collected,profile,clock,planningState})
      :{action:'blocked',reason:'clip_control_worker_gate_disabled',desiredWorkers:null};planningState=decision.nextState??planningState;
    }
    ticks++;
    const reserved=collected.snapshot.ledger.resources.filter(resource=>!TERMINAL.has(resource.status));
    const reservedHourlyMicros=reserved.every(resource=>resource.currency===profile.currency&&integer(resource.hourlyMicros,0))
     ?reserved.reduce((sum,resource)=>sum+resource.hourlyMicros,0):null;
    last={enabled:true,mode:executionEnabled?'execute':'dry-run',observedAtMs:collected.snapshot.observedAtMs,completedAtMs:clock(),action:decision?.action??'hold',
     reason:decision?.reason??null,executed:decision?.executed===true,desiredWorkers:decision?.desiredWorkers??null,
     queuedJobs:collected.snapshot.queue.queuedJobs,activeJobs:collected.snapshot.queue.activeJobs,
     processingClassification:collected.measured.classification,snapshotLedgerRevision:collected.snapshot.ledgerRevision,
     snapshotReservedHourlyMicros:Number.isSafeInteger(reservedHourlyMicros)&&reservedHourlyMicros>=0?reservedHourlyMicros:null,
     currency:profile.currency,actualProviderBillKnown:false};
   }catch(error){
    if(signal?.aborted)break;ticks++;
    const reason=/^clip_control_[a-z_]+$/u.test(error?.message??'')?error.message:'clip_control_observation_unavailable';
    last={enabled:true,mode:executionEnabled?'execute':'dry-run',observedAtMs:clock(),action:'hold',reason,executed:false};
   }
   try{onSummary(last);}catch{/* No observability callback can grant execution. */}
   if(once||signal?.aborted)break;
   try{await wait(pollMs,undefined,{signal});}catch(error){if(signal?.aborted)break;throw error;}
  }
 }finally{if(typeof adapter.close==='function')await adapter.close();}
 return {enabled:true,mode:executionEnabled?'execute':'dry-run',ticks,last};
}
