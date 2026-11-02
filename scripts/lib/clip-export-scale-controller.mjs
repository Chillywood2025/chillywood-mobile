import {randomUUID} from 'node:crypto';
import {planClipExportCapacity} from './clip-export-scale-plan.mjs';
import {deriveClipExportHealth} from './clip-export-health.mjs';

export const CLIP_SCALE_OPERATION_LEASE_MS=60_000;
export const CLIP_SCALE_OBSERVATION_MAX_AGE_MS=30_000;
export const CLIP_SCALE_HEALTH_COOLDOWN_MS=300_000;
export const CLIP_SCALE_MAX_RECOVERY_PROBES=3;
export const CLIP_SCALE_OBSERVATION_BATCH_MAX=32;
const STARTUP_WINDOW_MS=86_400_000;
const TERMINAL=new Set(['deleted','absent']);
const LIVE_STATES=new Set(['creating','unknown_create','booting','ready','draining','deleting','unknown_delete']);
const validInteger=(value,min,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const fresh=(value,now,maxAge)=>Number.isFinite(value)&&value<=now&&now-value<=maxAge;
const hold=reason=>({action:'hold',reason,executed:false});

/** There deliberately is no built-in paid provider adapter. Supplying a real
 * adapter and enabling it is a separate, explicitly approved qualification.
 * This object performs no network request even if invoked accidentally. */
export const disabledClipScaleExecutor=Object.freeze({
 async capabilities(){return {qualified:false};},
});

function approved(profile,now,allowExpired=false) {
 return profile&&typeof profile.approvalId==='string'&&profile.approvalId.length>0
  &&/^[a-z][a-z0-9_-]{0,63}$/u.test(profile.poolId??'')
  &&['profileId','provider','region','machineType'].every(key=>typeof profile[key]==='string'&&profile[key].length>0)
  &&profile.purpose==='clip-render'&&profile.managedEphemeral===true
  &&typeof profile.ownershipNamespace==='string'&&/^[a-z][a-z0-9_-]{0,63}$/u.test(profile.ownershipNamespace)
  &&(profile.retireProfileIds===undefined||(Array.isArray(profile.retireProfileIds)&&profile.retireProfileIds.length<=100
   &&profile.retireProfileIds.every(id=>typeof id==='string'&&id.length>0)))
  &&(profile.startupTimeoutMs===undefined||validInteger(profile.startupTimeoutMs,60_000,900_000))
  &&(profile.maxStartupStartsPer24Hours===undefined||validInteger(profile.maxStartupStartsPer24Hours,1,24))
  &&(profile.maxStartupReservationMicrosPer24Hours===undefined||validInteger(profile.maxStartupReservationMicrosPer24Hours,1))
  &&/^[A-Z]{3}$/u.test(profile.currency??'')
  &&validInteger(profile.minWorkers,0,32)&&validInteger(profile.maxWorkers,1,32)
  &&profile.minWorkers<=profile.maxWorkers&&validInteger(profile.slotsPerWorker,1,8)
  &&validInteger(profile.globalSlotLimit,1,32)&&profile.maxWorkers*profile.slotsPerWorker<=profile.globalSlotLimit
  &&validInteger(profile.maxHourlyMicros,1)&&validInteger(profile.maxWorkerHourlyMicros,1)
  &&profile.maxWorkerHourlyMicros<=profile.maxHourlyMicros
  &&Number.isFinite(profile.expiresAtMs)&&(allowExpired||profile.expiresAtMs>now);
}

function sameExecutorScope(capability,profile) {
 return capability?.qualified===true
  &&['provider','region','currency','purpose','managedEphemeral','ownershipNamespace'].every(key=>capability[key]===profile[key]);
}

function qualified(capability,profile,now,spending=true) {
 return sameExecutorScope(capability,profile)
  &&(!spending||['profileId','machineType'].every(key=>capability[key]===profile[key]))
  &&fresh(capability.checkedAtMs,now,CLIP_SCALE_OBSERVATION_MAX_AGE_MS)
  &&Number.isFinite(capability.expiresAtMs)&&capability.expiresAtMs>now
  &&(!spending||validInteger(capability.workerHourlyMicros,1,profile.maxWorkerHourlyMicros))
  &&capability.inventoryComplete===true&&capability.untrackedResourceCount===0
  &&['idempotentCreate','reconcileCreate','reconcileDelete','conditionalDrainedDelete'].every(key=>capability[key]===true);
}

function validateState(state) {
 if(state?.version!==1||!validInteger(state.sequence,0)||!Array.isArray(state.resources))throw new Error('clip_scale_ledger_invalid');
 const ids=new Set();
 for(const resource of state.resources){
  if(!resource||typeof resource.id!=='string'||ids.has(resource.id)
   ||(!LIVE_STATES.has(resource.status)&&!TERMINAL.has(resource.status))
   ||!validInteger(resource.hourlyMicros,1)||typeof resource.profileId!=='string'
   ||resource.purpose!=='clip-render'||resource.managedEphemeral!==true||typeof resource.ownershipNamespace!=='string'
   ||!/^[A-Z]{3}$/u.test(resource.currency??''))throw new Error('clip_scale_ledger_invalid');
  ids.add(resource.id);
 }
}

function owns(proof,resource) {
 return proof?.operationId===resource.id&&proof.purpose==='clip-render'&&proof.managedEphemeral===true
  &&proof.ownershipNamespace===resource.ownershipNamespace;
}

function ownedAssets(assets,resourceId) {
 return Array.isArray(assets)&&assets.length>=1&&assets.length<=16
  &&assets.some(asset=>asset.kind==='compute'&&asset.id===resourceId)
  &&new Set(assets.map(asset=>asset.id)).size===assets.length
  &&assets.every(asset=>typeof asset.id==='string'&&asset.id.length>0
   &&['compute','ipv4','ephemeral-volume'].includes(asset.kind)&&asset.owned===true&&asset.shared===false);
}

function absenceVerified(proof,resource,now) {
 return owns(proof,resource)&&fresh(proof.observedAtMs,now,CLIP_SCALE_OBSERVATION_MAX_AGE_MS)
  &&proof.computeAbsent===true&&proof.ownedIPv4Absent===true&&proof.otherOwnedBillableAssetsAbsent===true;
}

function observationReady(observation,resource,now) {
 return observation?.resourceId===resource.resourceId&&observation.workerId===resource.workerId
  &&owns(observation.ownershipProof,resource)
  &&fresh(observation.observedAtMs,now,CLIP_SCALE_OBSERVATION_MAX_AGE_MS)
  &&typeof observation.ready==='boolean'&&typeof observation.claimingDisabled==='boolean'
  &&typeof observation.workerStopped==='boolean'&&validInteger(observation.activeJobs,0,32);
}

function canDelete(resource,now) {
 const observation=resource.observation;
 return resource.status==='draining'&&observationReady(observation,resource,now)
  &&observation.claimingDisabled&&observation.workerStopped&&observation.activeJobs===0
  &&typeof observation.drainReceipt==='string'&&observation.drainReceipt.length>0;
}

function operation(resource,kind,now,token) {
 resource.operation={kind,token,leaseUntilMs:now+CLIP_SCALE_OPERATION_LEASE_MS};
 if(kind==='observe')resource.lastObservationAttemptAtMs=now;
 return {kind,token,recordId:resource.id,operationId:resource.id,resourceId:resource.resourceId,
  workerId:resource.workerId,drainReceipt:resource.observation?.drainReceipt,
  ownershipProof:resource.ownershipProof,billableAssets:resource.billableAssets,resourceProfile:resource.profileSnapshot};
}

function reserve(state,{profile,desiredWorkers,allowScaleOut,allowScaleDown,mutationsAllowed=true,retireRecordId,
 retirementReason,healthyRetirement=false,now,token}) {
 validateState(state);
 const live=state.resources.filter(resource=>!TERMINAL.has(resource.status));
 const scopeMismatch=live.some(resource=>resource.currency!==profile.currency||resource.ownershipNamespace!==profile.ownershipNamespace
  ||(resource.profileId!==profile.profileId&&!profile.retireProfileIds?.includes(resource.profileId)));
 const exposure=live.reduce((sum,resource)=>sum+resource.hourlyMicros,0);
 if(!Number.isSafeInteger(exposure))return hold('cost_exposure_invalid');
 // A lost response or controller restart cannot issue a second create/delete.
 // Once the persisted operation lease ends, only reconciliation may run.
 for(const resource of live){
  if(resource.operation){
   if(resource.operation.leaseUntilMs>now)return hold('operation_in_flight');
   if(resource.operation.kind==='create')resource.status='unknown_create';
   if(resource.operation.kind==='delete')resource.status='unknown_delete';
   resource.operation=null;
  }
  if(resource.status==='unknown_create')return operation(resource,'reconcileCreate',now,token);
  if(resource.status==='unknown_delete')return operation(resource,'reconcileDelete',now,token);
 }
 // Observe every admitted resource before spending or deleting. Unknown host
 // health/capacity fails closed rather than being treated as free capacity.
 const stale=live.filter(resource=>!observationReady(resource.observation,resource,now))
  .sort((a,b)=>(a.lastObservationAttemptAtMs??-Infinity)-(b.lastObservationAttemptAtMs??-Infinity)||a.createdAtMs-b.createdAtMs)
  .slice(0,CLIP_SCALE_OBSERVATION_BATCH_MAX);
 if(stale.length===1)return operation(stale[0],'observe',now,token);
 if(stale.length>1)return {kind:'observeBatch',actions:stale.map(resource=>operation(resource,'observe',now,`${token}:${resource.id}`))};
 if(scopeMismatch)return hold('existing_profile_requires_reconciliation');
 if(!mutationsAllowed)return hold('current_mutation_authority_required');
 for(const resource of live){
  if(canDelete(resource,now)){resource.status='deleting';return operation(resource,'delete',now,token);}
  if(resource.status==='draining'&&resource.observation.claimingDisabled===false)return operation(resource,'drain',now,token);
 }
 const timedOut=live.find(resource=>resource.status==='booting'&&now-resource.createdAtMs>=(profile.startupTimeoutMs??300_000));
 if(timedOut){
  timedOut.status='draining';timedOut.retirementReason='startup_timeout';timedOut.healthyRetirement=false;
  openCircuit(state,'startup_probe_timeout',null,now,profile.poolId);
  return operation(timedOut,'drain',now,token);
 }
 if(live.some(resource=>resource.status==='draining'))return hold('lifecycle_in_progress');
 if(live.length<desiredWorkers){
  if(live.some(resource=>resource.status==='booting'))return hold('lifecycle_in_progress');
  if(!allowScaleOut)return hold('healthy_capacity_evidence_required');
  if(live.length>=profile.maxWorkers||exposure+profile.maxWorkerHourlyMicros>profile.maxHourlyMicros)return hold('approved_capacity_or_cost_cap');
  if(state.resources.length>=10000)return hold('ledger_audit_rotation_required');
  state.sequence++;
  const resource={id:`${profile.poolId}:${state.sequence}`,profileId:profile.profileId,currency:profile.currency,
   profileSnapshot:structuredClone(profile),
   purpose:profile.purpose,managedEphemeral:true,ownershipNamespace:profile.ownershipNamespace,
   hourlyMicros:profile.maxWorkerHourlyMicros,status:'creating',resourceId:null,workerId:null,observation:null,createdAtMs:now};
  state.resources.push(resource);state.lastScaleAtMs=now;
  return operation(resource,'create',now,token);
 }
 if(live.length>desiredWorkers){
  if(!allowScaleDown)return hold('fresh_scale_recommendation_required');
  const resource=retireRecordId?live.find(item=>item.id===retireRecordId):[...live].sort((a,b)=>(a.status==='booting'?0:1)-(b.status==='booting'?0:1)
   ||a.observation.activeJobs-b.observation.activeJobs||a.createdAtMs-b.createdAtMs)[0];
  if(!resource)return hold('replacement_identity_missing');
  resource.status='draining';resource.observation=null;resource.retirementReason=retirementReason??'approved_capacity_reduction';
  resource.healthyRetirement=healthyRetirement;state.lastScaleAtMs=now;
  return operation(resource,'drain',now,token);
 }
 return hold(live.some(resource=>resource.status==='booting')?'lifecycle_in_progress':'desired_capacity_reserved');
}

function startupAllowed(state,profile,now) {
 const starts=(state.startupStarts??[]).filter(start=>start.atMs>now-STARTUP_WINDOW_MS);
 state.startupStarts=starts;
 return starts.length<(profile.maxStartupStartsPer24Hours??4)
  &&starts.reduce((sum,start)=>sum+start.hourlyMicros,0)+profile.maxWorkerHourlyMicros
   <=(profile.maxStartupReservationMicrosPer24Hours??profile.maxHourlyMicros);
}

function recordSuccessfulQualification(state,raw,health,now) {
 if(health?.status!=='healthy'||!Array.isArray(raw?.outcomes))return;
 for(const resource of state.resources){
  if(!resource.startupProbe||TERMINAL.has(resource.status)||!resource.workerId)continue;
  const completed=raw.outcomes.find(event=>event.workerId===resource.workerId&&event.status==='completed'
   &&validInteger(event.elapsedMs,1,7_800_000)&&fresh(event.observedAtMs,now,300_000)
   &&event.observedAtMs>=resource.createdAtMs);
  if(completed)resource.qualificationSucceededAtMs=completed.observedAtMs;
 }
}

function retireStartupQualification(state,resource,now) {
 if(resource.startupProbe&&resource.healthyRetirement===true&&Number.isFinite(resource.qualificationSucceededAtMs)
  &&['sustained_idle_inventory','above_approved_capacity'].includes(resource.retirementReason)
  &&state.startupProbeRecordId===resource.id){
  state.lastQualifiedStartupRetirement={recordId:resource.id,atMs:now,approvalId:resource.startupApprovalId};
  state.startupProbeApprovalId=null;state.startupProbeRecordId=null;
 }
}

function validHealth(health,now) {
 return health&&fresh(health.observedAtMs,now,60_000)
  &&['healthy','systemic-failure','worker-unhealthy','unknown'].includes(health.status)
  &&['dependency','storage','auth','input-permanent','worker',null].includes(health.failureClass)
  &&['crashLoop','staleHeartbeat','progressing','saturated'].every(key=>typeof health[key]==='boolean');
}

function measureHealth(state,raw,now) {
 const measured=deriveClipExportHealth({...raw,nowMs:now});
 const expected=state.resources.filter(resource=>!TERMINAL.has(resource.status)&&resource.workerId).map(resource=>resource.workerId).sort();
 const observed=Array.isArray(raw?.inventory?.workerIds)?[...raw.inventory.workerIds].sort():null;
 if(!observed||JSON.stringify(expected)!==JSON.stringify(observed)){
  // A complete empty inventory cannot erase a known paid worker. Genuine typed
  // dependency failures still trip the circuit; all other mismatches are unknown.
  if(measured.health.status!=='systemic-failure')return {...measured,classification:'unknown',reason:'ledger_inventory_mismatch',activeJobs:null,capacity:null,
   health:{...measured.health,status:'unknown',failureClass:null,progressing:false,saturated:false}};
  return {...measured,activeJobs:null,capacity:null};
 }
 return measured;
}

function openCircuit(state,reason,health,now,poolId) {
 const old=state.breaker??{probeAttempts:0};
 const continuing=old.status==='open';
 state.breaker={...old,status:'open',reason,openedAtMs:continuing?old.openedAtMs:now,
  nextProbeAtMs:old.status==='open'?old.nextProbeAtMs:now+CLIP_SCALE_HEALTH_COOLDOWN_MS};
 state.healthState='technical_delay';state.healthObservedAtMs=health?.observedAtMs??now;
 if(!continuing||!state.alert){
  state.incidentSequence=(state.incidentSequence??0)+1;
  state.alert={alertId:`${poolId}:processing-incident:${state.incidentSequence}`,code:reason,requiresOperator:true,
   firstObservedAtMs:health?.observedAtMs??now,lastObservedAtMs:health?.observedAtMs??now};
 }else state.alert.lastObservedAtMs=Math.max(state.alert.lastObservedAtMs,health?.observedAtMs??state.alert.lastObservedAtMs);
}

function assessHealth(state,{profile,telemetry,now}) {
 const health=validHealth(telemetry?.health,now)?telemetry.health
  :validHealth(state.recoveryHealth,now)?state.recoveryHealth:null;
 state.healthState=health?.status==='healthy'?'healthy':'unknown';state.healthObservedAtMs=health?.observedAtMs??null;
 if(health?.status==='systemic-failure'||health?.crashLoop
  ||['dependency','storage','auth'].includes(health?.failureClass))openCircuit(state,'systemic_processing_failure',health,now,profile.poolId);
 if(health?.status==='worker-unhealthy'||health?.staleHeartbeat){
  openCircuit(state,'worker_health_requires_review',health,now,profile.poolId);
  const live=state.resources.filter(resource=>!TERMINAL.has(resource.status));
  const failed=live.find(resource=>resource.workerId===health.affectedWorkerId);
  if(profile.replacementProbeApproved===true&&health.status==='worker-unhealthy'&&health.failureClass==='worker'
   &&health.dependenciesHealthy===true&&!health.crashLoop&&failed
   &&state.replacement?.approvalId!==profile.approvalId){
   state.replacement={approvalId:profile.approvalId,oldRecordId:failed.id,targetWorkers:live.length,phase:'draining'};
  }
 }
 if(state.breaker?.status==='open')state.healthState='technical_delay';
 return {health,growthAllowed:health?.status==='healthy'&&!health.crashLoop&&!health.staleHeartbeat
  &&!['dependency','storage','auth'].includes(health.failureClass)&&state.breaker?.status!=='open'};
}

function recoveryProbe(state,{profile,now,token}) {
 const breaker=state.breaker;
 if(breaker?.status!=='open')return hold('healthy_capacity_evidence_required');
 if(breaker.operation){
  if(breaker.operation.leaseUntilMs>now)return hold('recovery_probe_in_flight');
  breaker.operation=null;breaker.nextProbeAtMs=now+CLIP_SCALE_HEALTH_COOLDOWN_MS;
 }
 if(breaker.probeAttempts>=CLIP_SCALE_MAX_RECOVERY_PROBES)return {...hold('recovery_probe_limit'),alert:state.alert};
 if(now<breaker.nextProbeAtMs)return {...hold('processing_circuit_cooldown'),alert:state.alert};
 if(state.replacement?.phase==='draining')return {...hold('replacement_waits_for_safe_retirement'),alert:state.alert};
 breaker.probeAttempts++;breaker.operation={token,leaseUntilMs:now+CLIP_SCALE_OPERATION_LEASE_MS};
 return {kind:'probe',token,operationId:`${profile.poolId}:health-probe:${breaker.probeAttempts}`,mode:'read-only-recovery'};
}

function completeProbe(state,action,result,now,approvalCurrent) {
 const breaker=state.breaker;
 if(breaker?.operation?.token!==action.token)return hold('stale_operation_response');
 const timely=breaker.operation.leaseUntilMs>now;breaker.operation=null;
 const health=measureHealth(state,result?.healthEvidence,now).health;
 if(timely&&approvalCurrent&&result?.readOnly===true&&validHealth(health,now)&&health.status==='healthy'
  &&health.failureClass===null&&!health.crashLoop&&!health.staleHeartbeat){
  breaker.status='closed';state.recoveryHealth=health;state.healthState='healthy';state.healthObservedAtMs=health.observedAtMs;
  state.lastResolvedAlert=state.alert?{...state.alert,resolvedAtMs:now}:state.lastResolvedAlert;state.alert=null;
  return {action:'probe',executed:true,recovered:true};
 }
 breaker.nextProbeAtMs=now+CLIP_SCALE_HEALTH_COOLDOWN_MS;state.healthState='technical_delay';
 return {action:'probe',executed:true,recovered:false,alert:state.alert};
}

function complete(state,action,result,now,approvalCurrent=true) {
 validateState(state);
 if(action.kind==='observeBatch'){
  for(let index=0;index<action.actions.length;index++)complete(state,action.actions[index],result?.[index],now,approvalCurrent);
  return {action:'observeBatch',executed:true,observed:action.actions.length};
 }
 if(action.kind==='probe')return completeProbe(state,action,result,now,approvalCurrent);
 const resource=state.resources.find(item=>item.id===action.recordId);
 if(!resource||resource.operation?.token!==action.token)return hold('stale_operation_response');
 const timely=resource.operation.leaseUntilMs>now;resource.operation=null;
 if(!timely||!approvalCurrent)result={outcome:'unknown',settled:false};
 if(action.kind==='create'||action.kind==='reconcileCreate'){
  if(result?.outcome==='present'&&result.settled===true&&typeof result.resourceId==='string'&&result.resourceId
   &&typeof result.workerId==='string'&&result.workerId&&owns(result.ownershipProof,resource)&&ownedAssets(result.billableAssets,result.resourceId)){
   resource.resourceId=result.resourceId;resource.workerId=result.workerId;resource.status='booting';resource.observation=null;
   resource.ownershipProof=result.ownershipProof;resource.billableAssets=result.billableAssets;
  }else if(result?.outcome==='absent'&&result.settled===true&&absenceVerified(result.absenceProof,resource,now))resource.status='absent';
  else resource.status='unknown_create';
 }else if(action.kind==='delete'||action.kind==='reconcileDelete'){
  if(result?.outcome==='absent'&&result.settled===true&&absenceVerified(result.absenceProof,resource,now)){
   resource.status='deleted';retireStartupQualification(state,resource,now);
  }
  else if(action.kind==='reconcileDelete'&&result?.outcome==='present'&&result.settled===true&&result.operationNotApplied===true
   &&owns(result.ownershipProof,resource)){
   resource.status='draining';resource.observation=null;
  }else resource.status='unknown_delete';
 }else if(action.kind==='observe'){
  if(observationReady(result,resource,now)){
   resource.observation=result;
   if(resource.status==='booting'&&result.ready)resource.status='ready';
  }else resource.observation=null;
 }else if(action.kind==='drain'){
  // Even a successful request is not proof of stopped work. Observe next tick.
  resource.status='draining';resource.observation=null;
 }
 resource.updatedAtMs=now;
 if(['unknown_create','unknown_delete'].includes(resource.status)
  ||state.resources.every(item=>TERMINAL.has(item.status)))state.admissionReady=false;
 return {action:action.kind,executed:true,status:resource.status,reservedHourlyMicros:resource.hourlyMicros};
}

/** One restart-safe automatic control tick. plan receives authoritative ledger
 * currentWorkers/lastScaleAtMs; its result never grants execution authority.
 * All dependencies are trusted control-plane adapters, not browser inputs.
 * No adapter/credential is passed to the renderer. Default activation is OFF. */
export async function runClipScaleControllerTick({enabled=false,executionEnabled=false,profile,ledger,
 executor=disabledClipScaleExecutor,plan=planClipExportCapacity,telemetry,clock=Date.now,token=randomUUID()}={}) {
 if(enabled!==true)return hold('controller_disabled');
 if(executionEnabled!==true)return hold('provisioning_disabled');
 const now=clock();
 if(!approved(profile,now,true))return hold('explicit_current_budget_profile_required');
 if(ledger?.atomicDurable!==true||typeof ledger.transact!=='function')return hold('durable_atomic_ledger_required');
 if(typeof plan!=='function')return hold('scale_plan_required');
 const unavailable=async reason=>{
  await ledger.transact(profile.poolId,state=>{
   validateState(state);state.admissionReady=false;state.healthState='unknown';state.healthObservedAtMs=null;
  });
  return hold(reason);
 };
 let capability;
 try{capability=await executor.capabilities(profile);}catch{return unavailable('provider_capabilities_unknown');}
 if(!sameExecutorScope(capability,profile))return unavailable('qualified_current_provider_capabilities_required');
 const action=await ledger.transact(profile.poolId,state=>{
  const now=clock();
  const mutationsAllowed=approved(profile,now)&&qualified(capability,profile,now,false);
  const spendingAllowed=mutationsAllowed&&qualified(capability,profile,now);
  validateState(state);
  const measured=measureHealth(state,telemetry?.healthEvidence,now);
  const evidence={...telemetry,health:measured.health,renderAttempts:measured.renderAttempts,
   renderFailures:measured.renderFailures,permanentInputFailures:measured.permanentInputFailures,
   sourceOrCancelFailures:measured.sourceOrCancelFailures,activeJobs:measured.activeJobs,
   completedJobs:measured.completedJobs,totalRenderSeconds:measured.totalRenderSeconds};
  // Never trust a caller's healthy flag or classified failure counts. Only the
  // timestamped worker outcomes/resources and dependency probe classifier feeds
  // the breaker/planner. Collection itself belongs to the trusted control plane.
  state.processingClassification=measured.classification;
  state.retryBlockedJobIds=measured.retryBlockedJobIds;
  const health=assessHealth(state,{profile,telemetry:evidence,now});
  recordSuccessfulQualification(state,telemetry?.healthEvidence,health.health,now);
  const currentWorkers=state.resources.filter(resource=>!TERMINAL.has(resource.status)).length;
  state.admissionReady=spendingAllowed&&health.growthAllowed
   &&!state.resources.some(resource=>['unknown_create','unknown_delete'].includes(resource.status))
   &&(currentWorkers>0||(profile.startupProbeApproved===true&&state.startupProbeApprovalId!==profile.approvalId&&startupAllowed(state,profile,now)));
  const priorPlanningState=structuredClone(state.planningState??{}),priorTargetWorkers=state.targetWorkers;
  const recommendation=plan({enabled:true,nowMs:now,approvedProfile:{id:profile.profileId,approved:true,
   minWorkers:profile.minWorkers,maxWorkers:profile.maxWorkers,slotsPerWorker:profile.slotsPerWorker,
   globalSlotLimit:profile.globalSlotLimit,workerComputeCostPerHour:profile.maxWorkerHourlyMicros/1_000_000,
   maxComputeCostPerHour:profile.maxHourlyMicros/1_000_000,startupProbeApproved:profile.startupProbeApproved===true},
   observation:{...evidence,health:health.health,activeWorkers:currentWorkers},
   state:{...state.planningState,lastChangeAtMs:state.lastScaleAtMs}});
  if(recommendation?.nextState)state.planningState=recommendation.nextState;
  // A hold recommendation still permits safe reconciliation/drain completion,
  // but cannot cause a new capacity change.
  const startup=recommendation?.action==='recommend-startup-probe';
  const changes=recommendation?.action==='recommend-increase'||recommendation?.action==='recommend-drain'||startup;
  if(changes){
   if(!validInteger(recommendation.desiredWorkers,startup?0:profile.minWorkers,profile.maxWorkers)
    ||(recommendation.action==='recommend-drain'&&recommendation.stopMode!=='drain-only'))return hold('scale_plan_outside_approval');
   if(startup&&(profile.startupProbeApproved!==true||state.startupProbeApprovalId===profile.approvalId||currentWorkers!==0
    ||recommendation.desiredWorkers!==1))return hold('startup_probe_already_used_or_unapproved');
   if(startup&&!startupAllowed(state,profile,now))return hold('startup_window_capacity_or_budget_exhausted');
   state.targetWorkers=recommendation.desiredWorkers;
  }else state.targetWorkers=currentWorkers;
  const targetValid=validInteger(state.targetWorkers,profile.minWorkers,profile.maxWorkers)||(startup&&state.targetWorkers===1);
  // A historical target is not current demand. Generic hold/blocked decisions
  // never start another paid resource or another drain, even during cooldown.
  const allowCapacityChange=targetValid&&changes;
  let desiredWorkers=targetValid?state.targetWorkers:currentWorkers;
  let allowScaleOut=allowCapacityChange&&health.growthAllowed&&spendingAllowed,allowScaleDown=allowCapacityChange,retireRecordId;
  const replacement=state.replacement;
  if(replacement?.approvalId===profile.approvalId){
   const old=state.resources.find(resource=>resource.id===replacement.oldRecordId);
   if(replacement.phase==='draining'&&old&&TERMINAL.has(old.status))replacement.phase='awaiting-probe';
   if(replacement.phase==='draining'){
    desiredWorkers=currentWorkers-1;allowScaleOut=false;allowScaleDown=true;retireRecordId=replacement.oldRecordId;
   }else if(replacement.phase==='awaiting-probe'&&health.growthAllowed){
    desiredWorkers=replacement.targetWorkers;allowScaleOut=spendingAllowed;allowScaleDown=false;
   }
  }
  const reserved=reserve(state,{profile,desiredWorkers,allowScaleOut,allowScaleDown,mutationsAllowed,retireRecordId,
   retirementReason:recommendation?.reason,healthyRetirement:health.growthAllowed,now,token});
  if(['observe','observeBatch'].includes(reserved.kind)
   ||(changes&&!['create','drain'].includes(reserved.kind))){
   // Read-only preflight must not consume a sample/recommendation or start its
   // cooldown before the capacity decision can run. A concurrent in-flight
   // operation also cannot consume a new recommendation it did not execute.
   // Follow-on ticks re-evaluate current raw evidence; no target is replayed.
   state.planningState=priorPlanningState;state.targetWorkers=priorTargetWorkers;
  }
  if(reserved.kind==='create'){
   if(currentWorkers===0)state.admissionReady=false;
   if(startup){
    state.startupProbeApprovalId=profile.approvalId;state.startupProbeRecordId=reserved.recordId;
    state.startupStarts.push({atMs:now,hourlyMicros:profile.maxWorkerHourlyMicros});
    const resource=state.resources.find(item=>item.id===reserved.recordId);resource.startupProbe=true;resource.startupApprovalId=profile.approvalId;
   }
   if(replacement?.phase==='awaiting-probe'){
    replacement.phase='replacement-reserved';state.startupProbeApprovalId=profile.approvalId;
   }
  }
  if(reserved.action==='hold'&&state.breaker?.status==='open')return recoveryProbe(state,{profile,now,token});
  return reserved;
 });
 if(action.action==='hold')return action;
 let result;
 const readOnly=['observe','observeBatch','reconcileCreate','reconcileDelete','probe'].includes(action.kind);
 try {
  if(!readOnly&&(!approved(profile,clock())||!qualified(capability,profile,clock(),action.kind==='create')))
   throw new Error('clip_scale_authority_expired_before_dispatch');
  if(action.kind==='observeBatch'){
   if(typeof executor.observe!=='function')throw new Error('clip_scale_executor_operation_unavailable');
   result=await Promise.all(action.actions.map(async item=>{
    try{return await executor.observe({...item,profile:item.resourceProfile??profile});}catch{return {outcome:'unknown',settled:false};}
   }));
  }else{
   if(typeof executor[action.kind]!=='function')throw new Error('clip_scale_executor_operation_unavailable');
   result=await executor[action.kind]({...action,profile:readOnly?action.resourceProfile??profile:profile});
  }
 }catch{
  // Dispatch might have reached the provider. Persist uncertainty; never repeat
  // a create/delete in this catch path or release its reserved cost/capacity.
  result={outcome:'unknown',settled:false};
 }
 return ledger.transact(profile.poolId,state=>complete(state,action,result,clock(),readOnly
  ||(approved(profile,clock())&&qualified(capability,profile,clock(),action.kind==='create'))));
}
