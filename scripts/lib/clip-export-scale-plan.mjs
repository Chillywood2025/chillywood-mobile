// Pure recommendation logic: no provider SDK, credentials, network, timer,
// executor, provisioning, worker activation or database mutation.
export const CLIP_EXPORT_GLOBAL_HARD_MAX = 32;
const WORKER_SLOTS_HARD_MAX=8;
const POLICY=Object.freeze({telemetryMaxAgeMs:60000,baselineMaxAgeMs:86400000,cooldownMs:300000,highQueueAgeSeconds:120,
 targetUtilization:0.7,upSamples:3,downSamples:5,maxRenderFailureRate:0.1,maxMemoryUseRatio:0.85});
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const finite=(x,min=0)=>Number.isFinite(x)&&x>=min;
const fresh=(at,now,maxAge=POLICY.telemetryMaxAgeMs)=>finite(at)&&at<=now&&now-at<=maxAge;
const throughput=value=>integer(value?.completedJobs,1,Number.MAX_SAFE_INTEGER)&&finite(value.totalRenderSeconds)&&value.totalRenderSeconds>0;

/** Costs are approved compute-only estimates, NOT a billing cap (storage,
 * transfer, taxes, billing increments and draining work are excluded).
 * Hysteresis state and qualified throughput baseline must be durably persisted
 * by a separately authorized controller. Recommendations never execute actions.
 */
export function planClipExportCapacity({enabled=false,nowMs,approvedProfile,observation,state={}}={}){
 const base={mode:'recommendation-only',execute:false,billCapGuaranteed:false};
 const blocked=reason=>({...base,action:'blocked',reason,desiredWorkers:null});
 if(enabled!==true)return {...base,action:'disabled',reason:'explicit_planning_opt_in_required',desiredWorkers:null};
 const p=approvedProfile;
 if(!p||p.approved!==true||typeof p.id!=='string'||!p.id.trim())return blocked('approved_capacity_and_budget_profile_required');
 if(!integer(p.minWorkers,0,CLIP_EXPORT_GLOBAL_HARD_MAX)||!integer(p.maxWorkers,p.minWorkers,CLIP_EXPORT_GLOBAL_HARD_MAX)
  ||!integer(p.slotsPerWorker,1,WORKER_SLOTS_HARD_MAX)||!integer(p.globalSlotLimit,1,CLIP_EXPORT_GLOBAL_HARD_MAX)
  ||!finite(p.workerComputeCostPerHour)||p.workerComputeCostPerHour===0||!finite(p.maxComputeCostPerHour))return blocked('invalid_approved_profile');
 const maxWorkers=Math.min(p.maxWorkers,Math.floor(p.globalSlotLimit/p.slotsPerWorker),Math.floor(p.maxComputeCostPerHour/p.workerComputeCostPerHour));
 if(maxWorkers<p.minWorkers)return blocked('approved_budget_or_slots_below_minimum');
 const o=observation;
 if(!finite(nowMs)||!o||!fresh(o.observedAtMs,nowMs)||!integer(o.queuedJobs,0,Number.MAX_SAFE_INTEGER)
  ||!finite(o.oldestQueueAgeSeconds)||!integer(o.activeWorkers,0,CLIP_EXPORT_GLOBAL_HARD_MAX)
  ||!integer(o.activeJobs,0,CLIP_EXPORT_GLOBAL_HARD_MAX))return blocked('fresh_queue_and_inventory_required');
 if(o.queuedJobs===0&&o.oldestQueueAgeSeconds!==0)return blocked('inconsistent_queue_telemetry');
 if(state.lastObservationAtMs!=null&&(!finite(state.lastObservationAtMs)||o.observedAtMs<=state.lastObservationAtMs))return blocked('newer_distinct_observation_required');
 if((state.lastRecommendationAtMs!=null&&(!finite(state.lastRecommendationAtMs)||state.lastRecommendationAtMs>nowMs))
  ||(state.lastChangeAtMs!=null&&(!finite(state.lastChangeAtMs)||state.lastChangeAtMs>nowMs))
  ||(state.highSamples!=null&&!integer(state.highSamples,0,POLICY.upSamples))
  ||(state.lowSamples!=null&&!integer(state.lowSamples,0,POLICY.downSamples)))return blocked('invalid_planning_state');
 const sameCapacity=state.workersSeen===o.activeWorkers;
 const nextState={lastObservationAtMs:o.observedAtMs,lastRecommendationAtMs:state.lastRecommendationAtMs??null,
  lastChangeAtMs:state.lastChangeAtMs??null,workersSeen:o.activeWorkers,highSamples:0,lowSamples:0,
  throughputBaseline:state.throughputBaseline??null};
 const result={...base,action:'hold',reason:'within_approved_capacity',desiredWorkers:o.activeWorkers,approvedMaxWorkers:maxWorkers,nextState};
 const hold=reason=>({...result,reason});
 const reject=reason=>({...result,action:'blocked',reason,desiredWorkers:null});
 const recommend=(action,reason,desiredWorkers,extra={})=>({...result,action,reason,desiredWorkers,
  estimatedComputeCostPerHour:desiredWorkers*p.workerComputeCostPerHour,...extra,
  nextState:{...nextState,lastRecommendationAtMs:nowMs,highSamples:0,lowSamples:0}});
 const cooling=nowMs-Math.max(state.lastRecommendationAtMs??-Infinity,state.lastChangeAtMs??-Infinity)<POLICY.cooldownMs;

 // Safe drain does not require successful work: a quiet window or broken
 // renderer must not make paid idle capacity impossible to retire. Execution
 // still has to verify drain/zero live leases before deleting an owned worker.
 if(o.activeWorkers>maxWorkers)return recommend('recommend-drain','above_approved_capacity',maxWorkers,{stopMode:'drain-only'});
 const idle=o.queuedJobs===0&&o.activeJobs===0;
 if(idle&&o.activeWorkers>p.minWorkers){
  nextState.lowSamples=Math.min(POLICY.downSamples,(sameCapacity?state.lowSamples??0:0)+1);
  if(cooling)return hold('cooldown');
  if(nextState.lowSamples>=POLICY.downSamples)return recommend('recommend-drain','sustained_idle_inventory',p.minWorkers,{stopMode:'drain-only'});
  return hold('hysteresis_not_reached');
 }
 if(idle&&o.activeWorkers===p.minWorkers)return hold('idle_at_approved_minimum');

 const h=o.health;
 if(!h||!fresh(h.observedAtMs,nowMs)||!['healthy','systemic-failure','worker-unhealthy','unknown'].includes(h.status)
  ||![null,'dependency','storage','auth','input-permanent','worker'].includes(h.failureClass)
  ||['crashLoop','staleHeartbeat','progressing','saturated'].some(key=>typeof h[key]!=='boolean'))return reject('fresh_classified_processing_health_required');
 if(h.status==='systemic-failure'||['dependency','storage','auth'].includes(h.failureClass))return reject('systemic_processing_failure_requires_circuit_breaker');
 if(h.status==='worker-unhealthy'||h.crashLoop||h.staleHeartbeat||h.failureClass==='worker')return reject('worker_replacement_requires_bounded_probe');
 if(h.status!=='healthy')return reject('processing_health_unknown');

 // No previous render or current worker RAM exists at zero workers. The only
 // exception is one explicitly approved startup qualification probe, never a
 // backlog-proportional fleet. Its once/cooldown ledger belongs to the controller.
 if(o.activeWorkers===0){
  if(o.activeJobs>0)return reject('active_leases_without_worker_inventory');
  if(p.startupProbeApproved!==true)return reject('approved_startup_probe_required');
  if(maxWorkers<1)return reject('approved_capacity_exhausted');
  if(cooling)return hold('cooldown');
  return recommend('recommend-startup-probe','bounded_zero_worker_probe',1,{qualificationRequired:true});
 }
 if(!integer(o.renderAttempts,0,Number.MAX_SAFE_INTEGER)||!integer(o.renderFailures,0,o.renderAttempts)
  ||!integer(o.permanentInputFailures,0,o.renderFailures)||!integer(o.sourceOrCancelFailures,0,o.renderFailures-o.permanentInputFailures))return reject('classified_render_failure_telemetry_required');
 const systemicFailureRate=o.renderAttempts?(o.renderFailures-o.permanentInputFailures-o.sourceOrCancelFailures)/o.renderAttempts:0;
 if(systemicFailureRate>=POLICY.maxRenderFailureRate)return reject('systemic_render_failure_rate_requires_review');
 const memory=o.qualifiedWorkerMemory;
 if(!memory||memory.isolated!==true||memory.scope!=='current-process-cgroup-v2-including-descendants'
  ||!fresh(memory.observedAtMs,nowMs)||!integer(memory.currentBytes,0,Number.MAX_SAFE_INTEGER)
  ||!integer(memory.limitBytes,1,Number.MAX_SAFE_INTEGER)||!integer(memory.oomEventsDelta,0,Number.MAX_SAFE_INTEGER))return reject('fresh_isolated_worker_memory_qualification_required');
 if(memory.oomEventsDelta>0)return reject('worker_oom_requires_qualification_review');
 if(memory.currentBytes/memory.limitBytes>=POLICY.maxMemoryUseRatio)return reject('worker_memory_pressure_requires_review');
 if(!finite(o.windowSeconds,60)||!finite(o.arrivalRatePerMinute))return reject('measured_arrival_window_required');
 let measured;
 if(throughput(o)){
  measured=o;
  nextState.throughputBaseline={profileId:p.id,slotsPerWorker:p.slotsPerWorker,measuredAtMs:o.observedAtMs,
   completedJobs:o.completedJobs,totalRenderSeconds:o.totalRenderSeconds};
 }else{
  const prior=state.throughputBaseline;
  if(throughput(prior)&&prior.profileId===p.id&&prior.slotsPerWorker===p.slotsPerWorker
   &&fresh(prior.measuredAtMs,nowMs,POLICY.baselineMaxAgeMs))measured=prior;
 }
 if(!measured)return hold('qualified_throughput_baseline_required');
 if(!h.progressing)return hold('healthy_processing_progress_required');
 const belowMinimum=o.activeWorkers<p.minWorkers;
 if(!h.saturated&&!belowMinimum)return hold('healthy_processing_saturation_required');
 const meanRenderSeconds=measured.totalRenderSeconds/measured.completedJobs;
 const rawDesiredWorkers=Math.ceil((o.arrivalRatePerMinute/60+o.queuedJobs/POLICY.highQueueAgeSeconds)*meanRenderSeconds/POLICY.targetUtilization/p.slotsPerWorker);
 const desiredWorkers=Math.max(p.minWorkers,Math.min(maxWorkers,rawDesiredWorkers));
 result.measuredMeanRenderSeconds=meanRenderSeconds;result.demandExceedsApprovedCapacity=rawDesiredWorkers>maxWorkers;
 const highQueue=o.queuedJobs>0&&o.oldestQueueAgeSeconds>=POLICY.highQueueAgeSeconds&&h.saturated;
 if((highQueue||belowMinimum)&&desiredWorkers>o.activeWorkers){
  nextState.highSamples=Math.min(POLICY.upSamples,(sameCapacity?state.highSamples??0:0)+1);
  if(cooling)return hold('cooldown');
  if(nextState.highSamples>=POLICY.upSamples)return recommend('recommend-increase',highQueue?'sustained_healthy_saturation':'below_approved_minimum',
   highQueue?desiredWorkers:p.minWorkers);
  return hold('hysteresis_not_reached');
 }
 return cooling?hold('cooldown'):result;
}
