// Classification of measured runtime evidence only. This module performs no
// probe, retry, provider operation, provisioning, or authorization decision.
export const CLIP_EXPORT_FAILURE_CODES=Object.freeze({
 hdr_dolby_vision_unqualified:'input_permanent',hdr_color_metadata_unqualified:'input_permanent',hdr_conversion_unavailable:'worker_resource',
 invalid_render_format:'input_permanent',invalid_trim_range:'input_permanent',invalid_watermark_choice:'input_permanent',
 invalid_source_probe:'input_permanent',trim_outside_source:'input_permanent',invalid_watermark_probe:'input_permanent',probe_output_limit:'input_permanent',
 render_canceled:'source_or_cancel',source_changed:'source_or_cancel',clip_export_stale_lease:'source_or_cancel',clip_export_source_changed:'source_or_cancel',
 clip_source_identity_invalid:'source_or_cancel',watermark_bytes_required:'source_or_cancel',
 clip_source_auth_failed:'dependency_auth',worker_rpc_auth_failed:'dependency_auth',clip_origin_configuration_invalid:'dependency_auth',
 clip_source_download_failed:'dependency_storage',worker_rpc_unavailable:'dependency_database',
 clip_worker_disk_full:'worker_resource',clip_worker_filesystem_denied:'worker_resource',media_binary_unavailable:'worker_resource',
 worker_disk_capacity_exhausted:'worker_resource',worker_oom:'worker_resource',
 clip_output_write_unknown:'output_unknown',clip_output_conflict:'output_unknown',clip_output_readback_failed:'output_unknown',
 clip_output_identity_changed:'output_unknown',clip_output_size_mismatch:'output_unknown',clip_output_digest_mismatch:'output_unknown',
 completion_unknown:'output_unknown',output_reconciliation_required:'output_unknown',producer_not_admitted:'output_unknown',output_not_reserved:'output_unknown',output_not_sealed:'output_unknown',
 // A nonzero FFmpeg exit, timeout or invalid probe JSON is not proof of poison
 // media: binaries, resource starvation and host failures can cause the same.
 media_process_failed:'unknown',render_timeout:'unknown',invalid_probe_json:'unknown',render_output_mismatch:'unknown',
 clip_source_download_invalid:'unknown',clip_source_size_mismatch:'unknown',clip_source_size_exceeded:'unknown',
 clip_file_size_invalid:'unknown',clip_file_changed:'unknown',clip_output_changed:'unknown',clip_output_identity_invalid:'unknown',
 immutable_source_required:'unknown',render_output_exists:'unknown',worker_failed:'unknown',
});

export function classifyClipExportFailure(errorCode){
 return typeof errorCode==='string'&&Object.hasOwn(CLIP_EXPORT_FAILURE_CODES,errorCode)?CLIP_EXPORT_FAILURE_CODES[errorCode]:'unknown';
}
export function safeClipExportFailureCode(error){
 const value=typeof error==='string'?error:error?.message;
 if(typeof value==='string'&&Object.hasOwn(CLIP_EXPORT_FAILURE_CODES,value))return value;
 if(['ENOSPC','EDQUOT'].includes(error?.code))return 'clip_worker_disk_full';
 if(['EACCES','EPERM'].includes(error?.code))return 'clip_worker_filesystem_denied';
 return 'worker_failed';
}

const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const identity=value=>typeof value==='string'&&value.length>0&&value.length<=200;
const finite=value=>Number.isFinite(value)&&value>=0;
const DEPENDENCIES=['database','source_storage','output_storage'];
const OPERATIONS={database:['rpc_read','worker_rpc','session_rpc','read_only_probe'],source_storage:['source_get','read_only_probe'],output_storage:['output_readback','read_only_probe']};

/** Inputs are timestamped observations from the worker/queue and read-only
 * dependency probes. A caller-supplied `healthy` or classified `health` object
 * is ignored. `inventory` must be a fresh complete snapshot of registered
 * active worker IDs; worker observations may include historical samples.
 * Actual stage checkpoints count as progress; successful heartbeats do not.
 * A long render with no new checkpoint remains long_running, never invented
 * successful progress. The planner separately requires sizing qualification.
 */
export function deriveClipExportHealth({nowMs,observedAtMs,inventory,workers,outcomes,dependencies,
 maxAgeMs=90000,outcomeWindowMs=300000,longRunningMs=300000}={}){
 const fresh=(at,age=maxAgeMs)=>finite(at)&&at<=nowMs&&nowMs-at<=age;
 const result={classification:'unknown',reason:'fresh_processing_evidence_required',observedAtMs:finite(observedAtMs)?observedAtMs:null,
  progressing:false,saturated:false,healthyWorkerIds:[],isolatedWorkerIds:[],retryBlockedJobIds:[],alerts:[],
  renderAttempts:0,renderFailures:0,permanentInputFailures:0,sourceOrCancelFailures:0,
  completedJobs:0,totalRenderSeconds:0,throughputBasis:'completed-export-wall-time',cpuActivityObserved:false,
  activeJobs:null,capacity:null,dependenciesHealthy:false};
 let staleHeartbeat=false,crashLoop=false;
 const finish=(classification,reason,failureClass=null)=>{
  const status=classification==='systemic_fault'?'systemic-failure':classification==='isolated_worker_fault'?'worker-unhealthy':
   ['healthy_saturated','healthy_idle','long_running'].includes(classification)?'healthy':'unknown';
  return {...result,classification,reason,health:{observedAtMs:result.observedAtMs,status,failureClass,crashLoop,staleHeartbeat,
   progressing:result.progressing,saturated:result.saturated,dependenciesHealthy:result.dependenciesHealthy,
   ...(result.isolatedWorkerIds.length===1?{affectedWorkerId:result.isolatedWorkerIds[0]}:{})}};
 };
 if(!finite(nowMs)||!integer(maxAgeMs,1000,300000)||!integer(outcomeWindowMs,1000,3600000)||!integer(longRunningMs,1000,9000000)
  ||!fresh(observedAtMs)||!inventory||!fresh(inventory.observedAtMs)||!Array.isArray(inventory.workerIds)
  ||inventory.workerIds.length>32||inventory.workerIds.some(id=>!identity(id))||new Set(inventory.workerIds).size!==inventory.workerIds.length
  ||!Array.isArray(workers)||workers.length>10000||!Array.isArray(outcomes)||outcomes.length>10000||!Array.isArray(dependencies)||dependencies.length>1000)return finish('unknown','fresh_processing_evidence_required');
 const ids=new Set(inventory.workerIds),latestDependencies=new Map(),latest=new Map(),previous=new Map();
 let invalidWorkerObservation=false;
 for(const worker of [...workers].sort((a,b)=>(a?.observedAtMs??0)-(b?.observedAtMs??0))){
  if(!worker||!identity(worker.workerId)||!finite(worker.observedAtMs)||worker.observedAtMs>nowMs){invalidWorkerObservation=true;continue;}
  if(!ids.has(worker.workerId))continue;
  if(latest.has(worker.workerId))previous.set(worker.workerId,latest.get(worker.workerId));latest.set(worker.workerId,worker);
 }
 // Inventory counts are independent of health. A dependency error must never
 // turn a busy or unobserved fleet into an invented zero-job idle fleet.
 const completeCounts=!invalidWorkerObservation&&[...ids].every(id=>{
  const worker=latest.get(id);return worker&&fresh(worker.observedAtMs)&&integer(worker.capacity,1,8)&&integer(worker.activeJobs,0,8);
 });
 if(completeCounts){
  result.activeJobs=[...ids].reduce((sum,id)=>sum+latest.get(id).activeJobs,0);
  result.capacity=[...ids].reduce((sum,id)=>sum+latest.get(id).capacity,0);
  result.saturated=result.capacity>0&&result.activeJobs>=result.capacity;
 }
 for(const probe of dependencies){
  if(!probe||!DEPENDENCIES.includes(probe.dependency)||!OPERATIONS[probe.dependency].includes(probe.operation)
   ||!['ok','auth_failed','unavailable','unknown'].includes(probe.outcome)||!finite(probe.observedAtMs)||probe.observedAtMs>nowMs)return finish('unknown','invalid_dependency_observation');
  if((latestDependencies.get(probe.dependency)?.observedAtMs??-1)<probe.observedAtMs)latestDependencies.set(probe.dependency,probe);
 }
 let dependencyFailure=null,dependenciesMissing=false;
 for(const name of DEPENDENCIES){
  const probe=latestDependencies.get(name);
  if(!probe||!fresh(probe.observedAtMs)||probe.outcome==='unknown'){dependenciesMissing=true;continue;}
  if(probe.outcome!=='ok')dependencyFailure=probe.outcome==='auth_failed'?'auth':name==='database'?'dependency':'storage';
 }
 result.dependenciesHealthy=!dependenciesMissing&&!dependencyFailure;
 const events=new Map();
 for(const event of outcomes){
  if(!event||!identity(event.workerId)||!identity(event.jobId)||!finite(event.observedAtMs)||event.observedAtMs>nowMs
   ||!['completed','failed'].includes(event.status))return finish('unknown','invalid_job_outcome');
  if(!fresh(event.observedAtMs,outcomeWindowMs))continue;
  const previous=events.get(event.jobId);if(!previous||previous.observedAtMs<event.observedAtMs)events.set(event.jobId,event);
 }
 let unknownFailure=false;const faultyWorkers=new Set(),workerFaultCounts=new Map();
 for(const event of events.values()){
  result.renderAttempts++;
  if(event.status==='completed'){
   if(integer(event.elapsedMs,1,7800000)){result.completedJobs++;result.totalRenderSeconds+=event.elapsedMs/1000;}
   continue;
  }
  result.renderFailures++;
  const category=classifyClipExportFailure(event.errorCode);
  if(category==='input_permanent'){result.permanentInputFailures++;continue;}
  if(category==='source_or_cancel'){result.sourceOrCancelFailures++;continue;}
  if(category==='dependency_auth')dependencyFailure='auth';
  else if(category==='dependency_database')dependencyFailure='dependency';
  else if(category==='dependency_storage')dependencyFailure='storage';
  else if(category==='worker_resource'){
   if(ids.has(event.workerId))faultyWorkers.add(event.workerId);
   workerFaultCounts.set(event.workerId,(workerFaultCounts.get(event.workerId)??0)+1);
  }else if(category==='output_unknown'){result.retryBlockedJobIds.push(event.jobId);result.alerts.push('output_reconciliation_required');}
  else unknownFailure=true;
 }
 if(dependencyFailure){result.dependenciesHealthy=false;result.alerts.push('dependency_circuit_breaker_required');return finish('systemic_fault','typed_dependency_failure_observed',dependencyFailure);}
 if(result.retryBlockedJobIds.length)return finish('unknown','output_reconciliation_required');
 if(unknownFailure)return finish('unknown','processing_failure_not_classified');
 if(dependenciesMissing)return finish('unknown','fresh_read_only_dependency_evidence_required');
 if(invalidWorkerObservation)return finish('unknown','invalid_worker_observation');
 let incomplete=false,progressing=true,longRunning=false;
 for(const id of ids){
  const worker=latest.get(id);
  if(!worker||!fresh(worker.observedAtMs)||!finite(worker.lastHeartbeatAtMs)||worker.lastHeartbeatAtMs>nowMs){incomplete=true;continue;}
  if(!fresh(worker.lastHeartbeatAtMs)){faultyWorkers.add(id);staleHeartbeat=true;continue;}
  if(!integer(worker.capacity,1,8)||!integer(worker.activeJobs,0,8)||!finite(worker.tempAvailableBytes)){incomplete=true;continue;}
  const memory=worker.workerCgroup;
  if(!memory||memory.available!==true||!fresh(memory.observedAtMs)||memory.scope!=='current-process-cgroup-v2-including-descendants'
   ||!integer(memory.memoryCurrentBytes)||!integer(memory.memoryLimitBytes,1)||!integer(memory.oomEvents?.oomKill)){incomplete=true;continue;}
  const previousWorker=previous.get(id);
  const prior=previousWorker?.sessionId===worker.sessionId?previousWorker?.workerCgroup:null;
  const oomIncreased=prior&&integer(prior.oomEvents?.oomKill)&&memory.oomEvents.oomKill>prior.oomEvents.oomKill;
  // Active jobs already reserved disk before admission; their legitimate input
  // and output files can use that reservation without making the host faulty.
  const diskExhausted=worker.tempAvailableBytes<512*1024**2||(worker.activeJobs===0&&worker.tempAvailableBytes<11*1024**3);
  if(oomIncreased||memory.memoryCurrentBytes/memory.memoryLimitBytes>=0.85||diskExhausted){faultyWorkers.add(id);continue;}
  if(memory.oomEvents.oomKill>0&&!prior){incomplete=true;continue;}
  if(prior&&memory.oomEvents.oomKill<prior.oomEvents?.oomKill){incomplete=true;continue;}
  if(worker.activeJobs>0){
   if(!finite(worker.oldestJobStartedAtMs)||worker.oldestJobStartedAtMs>nowMs||!finite(worker.lastProgressAtMs)
    ||worker.lastProgressAtMs<worker.oldestJobStartedAtMs||worker.lastProgressAtMs>nowMs){incomplete=true;continue;}
   // CPU activity is not proof of successful render/output advancement, even
   // inside an isolated unit. A CPU-burning stuck process must not buy a fleet.
   const cpuAdvanced=prior&&fresh(prior.observedAtMs)&&identity(worker.sessionId)
    &&integer(memory.cpuUsageUsec)&&integer(prior.cpuUsageUsec)&&memory.cpuUsageUsec-prior.cpuUsageUsec>=1000000;
   result.cpuActivityObserved||=Boolean(cpuAdvanced);
   const advanced=fresh(worker.lastProgressAtMs);progressing&&=advanced;
   if(nowMs-worker.oldestJobStartedAtMs>=longRunningMs)longRunning=true;
   else if(!advanced)incomplete=true;
  }
  if(!faultyWorkers.has(id))result.healthyWorkerIds.push(id);
 }
 crashLoop=[...workerFaultCounts.values()].some(count=>count>=3);
 result.isolatedWorkerIds=[...faultyWorkers];result.progressing=result.activeJobs>0&&progressing;
 if(faultyWorkers.size){result.alerts.push('worker_qualification_review_required');
  return faultyWorkers.size===1?finish('isolated_worker_fault','measured_worker_fault','worker'):finish('systemic_fault','multiple_workers_unhealthy','worker');}
 if(incomplete)return finish('unknown','fresh_worker_resources_and_progress_required');
 if(longRunning)return finish('long_running','long_job_has_live_heartbeat_no_invented_progress');
 return result.saturated?finish('healthy_saturated','fresh_measured_saturation'):finish('healthy_idle','fresh_measured_spare_capacity');
}
