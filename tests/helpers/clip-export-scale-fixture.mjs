// Synthetic serialized ledger and provider only. Not native PostgreSQL, billing,
// machine qualification, or permission to call a real infrastructure provider.
import {emptyClipScaleLedger} from '../../scripts/lib/clip-export-scale-ledger.mjs';
import {runClipScaleControllerTick} from '../../scripts/lib/clip-export-scale-controller.mjs';
import {syntheticClipHealthEvidence} from './clip-export-health-fixture.mjs';

export const increase=n=>()=>({action:'recommend-increase',desiredWorkers:n});
export const decrease=n=>()=>({action:'recommend-drain',reason:'sustained_idle_inventory',desiredWorkers:n,stopMode:'drain-only'});
export const hold=()=>({action:'hold'});
export const startup=()=>({action:'recommend-startup-probe',desiredWorkers:1});
export function fixtureLedger(backing={state:emptyClipScaleLedger(),tail:Promise.resolve()}){
 return {atomicDurable:true,backing,async transact(_pool,change){
  const prior=backing.tail;let release;backing.tail=new Promise(resolve=>{release=resolve;});await prior;
  try{const state=structuredClone(backing.state),result=change(state);backing.state=state;return result;}finally{release();}
 }};
}
export function scaleFixture(){
 const f={now:1_000_000,ledger:fixtureLedger(),calls:[],activeJobs:0,ready:true,workerStopped:true,claimingDisabled:true};
 f.profile={approvalId:'synthetic-only-approval',poolId:'clip-test',profileId:'fixture-profile',provider:'synthetic',
  purpose:'clip-render',managedEphemeral:true,ownershipNamespace:'fixture-owned',region:'fixture',machineType:'fixture-host',
  currency:'USD',minWorkers:0,maxWorkers:4,slotsPerWorker:1,globalSlotLimit:4,
  maxHourlyMicros:4_000_000,maxWorkerHourlyMicros:1_000_000,expiresAtMs:f.now+10_000_000};
 f.capabilities=()=>({...f.profile,qualified:true,checkedAtMs:f.now,expiresAtMs:f.now+60000,workerHourlyMicros:500000,
  inventoryComplete:true,untrackedResourceCount:0,idempotentCreate:true,reconcileCreate:true,reconcileDelete:true,conditionalDrainedDelete:true});
 f.ownership=operationId=>({operationId,purpose:'clip-render',managedEphemeral:true,ownershipNamespace:f.profile.ownershipNamespace});
 f.present=action=>({outcome:'present',settled:true,resourceId:`r-${action.operationId}`,workerId:`w-${action.operationId}`,
  ownershipProof:f.ownership(action.operationId),billableAssets:[{id:`r-${action.operationId}`,kind:'compute',owned:true,shared:false}]});
 f.absent=action=>({outcome:'absent',settled:true,absenceProof:{...f.ownership(action.operationId),observedAtMs:f.now,
  computeAbsent:true,ownedIPv4Absent:true,otherOwnedBillableAssetsAbsent:true}});
 f.evidence=(activeJobs=1)=>syntheticClipHealthEvidence(f.now,{activeJobs,
  workerIds:f.ledger.backing.state.resources.filter(r=>!['absent','deleted'].includes(r.status)&&r.workerId).map(r=>r.workerId)});
 f.telemetry=(idle=false)=>{
  const healthEvidence=f.evidence(idle?0:1);
  if(healthEvidence.inventory.workerIds.length&&!idle)healthEvidence.outcomes=[{workerId:healthEvidence.inventory.workerIds[0],
   jobId:`completed-${f.now}`,status:'completed',elapsedMs:60000,observedAtMs:f.now}];
  return {observedAtMs:f.now,queuedJobs:idle?0:100,oldestQueueAgeSeconds:idle?0:180,windowSeconds:300,arrivalRatePerMinute:10,
   healthEvidence,qualifiedWorkerMemory:{observedAtMs:f.now,isolated:true,scope:'current-process-cgroup-v2-including-descendants',
    currentBytes:100,limitBytes:1000,oomEventsDelta:0}};
 };
 f.fault=()=>{const evidence=f.evidence();evidence.dependencies[0].outcome='unavailable';return {healthEvidence:evidence};};
 f.executor={async capabilities(){return f.capabilities();},
  async create(action){f.calls.push(action);return f.present(action);},
  async observe(action){f.calls.push(action);return {resourceId:action.resourceId,workerId:action.workerId,ready:f.ready,
   claimingDisabled:f.claimingDisabled,workerStopped:f.workerStopped,activeJobs:f.activeJobs,observedAtMs:f.now,
   ownershipProof:f.ownership(action.operationId),drainReceipt:'synthetic-only-drain'};},
  async drain(action){f.calls.push(action);return {draining:true};},
  async delete(action){f.calls.push(action);return f.absent(action);},
  async reconcileCreate(action){f.calls.push(action);return {outcome:'unknown',settled:false};},
  async reconcileDelete(action){f.calls.push(action);return {outcome:'unknown',settled:false};},
  async probe(action){f.calls.push(action);return {readOnly:true,healthEvidence:f.evidence()};},
 };
 f.tick=(overrides={})=>runClipScaleControllerTick({enabled:true,executionEnabled:true,profile:f.profile,ledger:f.ledger,
  executor:f.executor,clock:()=>f.now,plan:increase(1),telemetry:{healthEvidence:f.evidence()},...overrides});
 return f;
}
export async function ready(f,n=1){
 for(let count=1;count<=n;count++){await f.tick({plan:increase(count)});await f.tick({plan:hold});}
}
