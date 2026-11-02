// Reconstructed coverage of retained controller contracts; synthetic executor only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {runClipScaleControllerTick,CLIP_SCALE_OPERATION_LEASE_MS,CLIP_SCALE_HEALTH_COOLDOWN_MS} from '../scripts/lib/clip-export-scale-controller.mjs';
import {scaleFixture,fixtureLedger,ready,increase,decrease,hold,startup} from './helpers/clip-export-scale-fixture.mjs';

test('controller defaults OFF; planning and missing durable/provider authority cannot execute',async()=>{
 assert.equal((await runClipScaleControllerTick()).reason,'controller_disabled');
 const f=scaleFixture();
 for(const [overrides,reason] of [[{executionEnabled:false},'provisioning_disabled'],[{profile:null},'explicit_current_budget_profile_required'],
  [{ledger:{transact(){throw Error('must not call');}}},'durable_atomic_ledger_required'],[{executor:undefined},'qualified_current_provider_capabilities_required']]){
  assert.equal((await f.tick(overrides)).reason,reason);
 }
 assert.equal(f.calls.length,0);
});

test('invalid budgets, provider scope, inventory and stale quotes cannot buy resources',async()=>{
 for(const change of [p=>p.currency='usd',p=>p.maxWorkers=33,p=>p.globalSlotLimit=0,p=>p.maxHourlyMicros=0,p=>p.expiresAtMs=NaN]){
  const f=scaleFixture();change(f.profile);assert.equal((await f.tick()).action,'hold');assert.equal(f.calls.length,0);
 }
 for(const change of [c=>c.qualified=false,c=>c.currency='EUR',c=>c.inventoryComplete=false,c=>c.untrackedResourceCount=1,
  c=>c.checkedAtMs-=31000,c=>c.workerHourlyMicros=2_000_000,c=>c.idempotentCreate=false,c=>c.conditionalDrainedDelete=false]){
  const f=scaleFixture(),original=f.capabilities;f.capabilities=()=>{const c=original();change(c);return c;};
  assert.equal((await f.tick()).action,'hold');assert.equal(f.calls.length,0);
 }
});

test('two controllers serialize maximum-cost reservation before dispatch and never duplicate create',async()=>{
 const f=scaleFixture();let resolve,started;const entered=new Promise(r=>{started=r;});
 f.executor.create=async action=>{f.calls.push(action);started();return new Promise(r=>{resolve=r;});};
 const pending=f.tick();await entered;
 assert.equal(f.ledger.backing.state.resources[0].hourlyMicros,1_000_000);
 assert.equal((await f.tick()).reason,'operation_in_flight');assert.equal(f.calls.length,1);
 resolve(f.present(f.calls[0]));await pending;assert.equal(f.ledger.backing.state.resources.length,1);
});

test('lost create responses survive restart; settled owned absence is required to release capacity',async()=>{
 const f=scaleFixture();f.executor.create=async action=>{f.calls.push(action);throw Error('unknown delivery');};
 assert.equal((await f.tick()).status,'unknown_create');f.ledger=fixtureLedger(f.ledger.backing);
 f.executor.reconcileCreate=async action=>{f.calls.push(action);return {outcome:'absent',settled:false};};
 assert.equal((await f.tick({plan:increase(4)})).status,'unknown_create');
 assert.equal(f.calls.filter(a=>a.kind==='create').length,1);
 f.executor.reconcileCreate=async action=>f.absent(action);
 assert.equal((await f.tick()).status,'absent');
});

test('expired operation lease fences late create response behind canonical reconciliation',async()=>{
 const f=scaleFixture();let resolve,started;const entered=new Promise(r=>{started=r;});
 f.executor.create=async action=>{f.calls.push(action);started();return new Promise(r=>{resolve=r;});};
 const pending=f.tick();await entered;f.now+=CLIP_SCALE_OPERATION_LEASE_MS+1;
 f.executor.reconcileCreate=async action=>f.present(action);
 assert.equal((await f.tick()).status,'booting');
 resolve({...f.present(f.calls[0]),resourceId:'late'});
 assert.equal((await pending).reason,'stale_operation_response');assert.notEqual(f.ledger.backing.state.resources[0].resourceId,'late');
});

test('approved worker count and full reserved hourly estimate are hard controller ceilings',async()=>{
 const f=scaleFixture();f.profile.maxHourlyMicros=1_000_000;await ready(f);
 assert.equal((await f.tick({plan:increase(4)})).reason,'approved_capacity_or_cost_cap');
 assert.equal((await f.tick({plan:increase(5)})).reason,'scale_plan_outside_approval');
 assert.equal(f.calls.filter(a=>a.kind==='create').length,1);
});

test('drain preserves busy work and delete needs stopped, disabled, zero-active fresh receipt',async()=>{
 const f=scaleFixture();await ready(f);f.activeJobs=1;f.workerStopped=false;
 assert.equal((await f.tick({plan:decrease(0)})).action,'drain');await f.tick({plan:hold});
 assert.equal((await f.tick({plan:hold})).reason,'lifecycle_in_progress');
 f.now+=31000;f.activeJobs=0;await f.tick({plan:hold});
 assert.equal((await f.tick({plan:hold})).reason,'lifecycle_in_progress');
 f.now+=31000;f.workerStopped=true;await f.tick({plan:hold});
 assert.equal((await f.tick({plan:hold})).status,'deleted');
 assert.equal(f.calls.filter(a=>a.kind==='delete').length,1);
 assert.equal(f.calls.find(a=>a.kind==='delete').drainReceipt,'synthetic-only-drain');
});

test('unconfirmed drain retries only after observation and unknown delete only reconciles',async()=>{
 const f=scaleFixture();await ready(f);f.claimingDisabled=false;
 f.executor.drain=async action=>{f.calls.push(action);throw Error('unknown drain');};
 await f.tick({plan:decrease(0)});await f.tick({plan:hold});assert.equal((await f.tick({plan:hold})).action,'drain');
 f.claimingDisabled=true;await f.tick({plan:hold});
 f.executor.delete=async action=>{f.calls.push(action);throw Error('unknown delete');};
 assert.equal((await f.tick({plan:hold})).status,'unknown_delete');
 assert.equal((await f.tick({plan:increase(4)})).action,'reconcileDelete');
 assert.equal(f.ledger.backing.state.resources[0].hourlyMicros,1_000_000);
 assert.equal(f.calls.filter(a=>a.kind==='delete').length,1);
});

test('ownership and complete billable asset absence bind creation and deletion evidence',async()=>{
 for(const change of [r=>r.ownershipProof.ownershipNamespace='other',r=>r.billableAssets[0].shared=true,r=>r.billableAssets=[]]){
  const f=scaleFixture();f.executor.create=async action=>{const r=f.present(action);change(r);return r;};
  assert.equal((await f.tick()).status,'unknown_create');
 }
 const f=scaleFixture();await ready(f);await f.tick({plan:decrease(0)});await f.tick({plan:hold});
 f.executor.delete=async action=>{const r=f.absent(action);r.absenceProof.ownedIPv4Absent=false;return r;};
 assert.equal((await f.tick({plan:hold})).status,'unknown_delete');
});

test('systemic failures persist circuit and incident identity across restart; healthy flags cannot bypass it',async()=>{
 const f=scaleFixture();await f.tick({telemetry:f.fault()});const alert=f.ledger.backing.state.alert.alertId;
 f.ledger=fixtureLedger(f.ledger.backing);await f.tick({telemetry:f.fault()});
 assert.equal(f.ledger.backing.state.alert.alertId,alert);
 assert.equal((await f.tick()).reason,'processing_circuit_cooldown');
 f.now+=CLIP_SCALE_HEALTH_COOLDOWN_MS;
 assert.equal((await f.tick()).recovered,true);assert.equal(f.ledger.backing.state.alert,null);
 assert.equal(f.calls.filter(a=>a.kind==='create').length,0);
 await f.tick({telemetry:f.fault()});assert.notEqual(f.ledger.backing.state.alert.alertId,alert);
});

test('recovery probes are persisted and bounded even when every read-only attempt fails',async()=>{
 const f=scaleFixture();await f.tick({telemetry:f.fault()});
 f.executor.probe=async action=>{f.calls.push(action);return {readOnly:true,healthEvidence:f.fault().healthEvidence};};
 for(let n=0;n<3;n++){f.now+=CLIP_SCALE_HEALTH_COOLDOWN_MS;assert.equal((await f.tick()).recovered,false);f.ledger=fixtureLedger(f.ledger.backing);}
 f.now+=CLIP_SCALE_HEALTH_COOLDOWN_MS;assert.equal((await f.tick()).reason,'recovery_probe_limit');
 assert.equal(f.calls.filter(a=>a.kind==='probe').length,3);assert.equal(f.calls.filter(a=>a.kind==='create').length,0);
});

test('unknown raw telemetry, fake healthy flags, and inventory mismatch never authorize capacity',async()=>{
 for(const make of [()=>({health:{status:'healthy'}}),()=>({healthEvidence:undefined}),f=>{
  const raw=f.evidence();raw.inventory.workerIds=['untracked'];return {healthEvidence:raw};
 }]){
  const f=scaleFixture();assert.equal((await f.tick({telemetry:make(f)})).action,'hold');assert.equal(f.calls.length,0);
 }
 const f=scaleFixture();await ready(f);const raw=f.evidence();raw.inventory.workerIds=[];raw.workers=[];
 assert.equal((await f.tick({plan:increase(4),telemetry:{healthEvidence:raw}})).action,'hold');
 assert.equal(f.calls.filter(a=>a.kind==='create').length,1);
});

test('bounded startup failure cannot rearm through restart, absence or rolling-window expiry',async()=>{
 const f=scaleFixture();f.profile.startupProbeApproved=true;f.profile.expiresAtMs=f.now+3*86400000;
 f.executor.create=async action=>f.absent(action);await f.tick({plan:startup});f.ledger=fixtureLedger(f.ledger.backing);
 f.now+=86400001;assert.equal((await f.tick({plan:startup})).reason,'startup_probe_already_used_or_unapproved');
 assert.equal(f.ledger.backing.state.resources.length,1);
});

test('never-ready startup may retire on idle intent or timeout but never rearms qualification',async()=>{
 for(const timeout of [false,true]){
  const f=scaleFixture();f.profile.startupProbeApproved=true;f.profile.startupTimeoutMs=60000;f.ready=false;
  await f.tick({plan:startup});await f.tick({plan:hold});
  if(timeout){f.now+=60001;await f.tick({plan:hold});}
  assert.equal((await f.tick({plan:timeout?hold:decrease(0)})).action,'drain');await f.tick({plan:hold});
  assert.equal((await f.tick({plan:hold})).status,'deleted');
  assert.equal(f.ledger.backing.state.startupProbeApprovalId,f.profile.approvalId);
 }
});

test('fresh idle hold cannot replay high target; returning demand cannot replay old low target',async()=>{
 const f=scaleFixture();await ready(f,2);f.ledger.backing.state.targetWorkers=4;
 assert.equal((await f.tick({plan:undefined,telemetry:f.telemetry(true)})).action,'hold');
 assert.equal(f.calls.filter(a=>a.kind==='create').length,2);
 await f.tick({plan:decrease(0)});await f.tick({plan:hold});await f.tick({plan:hold});
 f.now++;const drains=f.calls.filter(a=>a.kind==='drain').length;
 await f.tick({plan:undefined,telemetry:f.telemetry()});assert.equal(f.calls.filter(a=>a.kind==='drain').length,drains);
});

test('all32 stale resources observe concurrently once; no one-host cadence starvation',async()=>{
 const f=scaleFixture();Object.assign(f.profile,{maxWorkers:32,globalSlotLimit:32,maxHourlyMicros:32_000_000});await ready(f,32);
 let active=0,peak=0;const original=f.executor.observe;
 f.executor.observe=async action=>{active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));try{return await original(action);}finally{active--;}};
 f.now+=31000;const result=await f.tick({plan:hold});assert.equal(result.action,'observeBatch');assert.equal(result.observed,32);assert.equal(peak,32);
 assert.equal((await f.tick({plan:decrease(31)})).action,'drain');
});

test('observation-only preflight preserves real planner samples and recommendations at31-second cadence',async()=>{
 for(const idle of [false,true]){
  const f=scaleFixture();await ready(f);f.now+=300001;
  for(let n=0;n<(idle?5:3);n++){
   f.now+=31000;const telemetry=f.telemetry(idle);
   assert.equal((await f.tick({plan:undefined,telemetry})).action,'observe');
   const result=await f.tick({plan:undefined,telemetry});
   assert.equal(result.action,n===(idle?4:2)?idle?'drain':'create':'hold');
  }
 }
});

test('newer idle observation after preflight cancels old growth and duplicate telemetry does not count twice',async()=>{
 const f=scaleFixture();await ready(f);f.now+=300001;
 for(let n=0;n<2;n++){f.now+=31000;let telemetry=f.telemetry();await f.tick({plan:undefined,telemetry});await f.tick({plan:undefined,telemetry});}
 f.now+=31000;await f.tick({plan:undefined,telemetry:f.telemetry()});
 f.now++;const telemetry=f.telemetry(true);assert.equal((await f.tick({plan:undefined,telemetry})).action,'hold');
 const saved=structuredClone(f.ledger.backing.state.planningState);await f.tick({plan:undefined,telemetry});
 assert.deepEqual(f.ledger.backing.state.planningState,saved);assert.equal(f.calls.filter(a=>a.kind==='create').length,1);
});

test('successful exact-worker qualification and verified retirement rearm startup under rolling caps',async()=>{
 const f=scaleFixture();Object.assign(f.profile,{startupProbeApproved:true,maxStartupStartsPer24Hours:2,maxStartupReservationMicrosPer24Hours:2_000_000});
 for(let n=0;n<2;n++){
  assert.equal((await f.tick({plan:startup})).action,'create');await f.tick({plan:hold});
  await f.tick({plan:hold,telemetry:f.telemetry()});
  await f.tick({plan:decrease(0)});await f.tick({plan:hold});assert.equal((await f.tick({plan:hold})).status,'deleted');
  assert.equal(f.ledger.backing.state.startupProbeApprovalId,null);f.now+=300001;
 }
 assert.equal((await f.tick({plan:startup})).reason,'startup_window_capacity_or_budget_exhausted');
 assert.equal(f.ledger.backing.state.startupStarts.length,2);
});

test('unknown deletion retains successful qualification lock and reservation',async()=>{
 const f=scaleFixture();f.profile.startupProbeApproved=true;await f.tick({plan:startup});await f.tick({plan:hold});
 await f.tick({plan:hold,telemetry:f.telemetry()});await f.tick({plan:decrease(0)});await f.tick({plan:hold});
 f.executor.delete=async()=>({outcome:'unknown',settled:false});
 assert.equal((await f.tick({plan:hold})).status,'unknown_delete');assert.equal(f.ledger.backing.state.startupProbeApprovalId,f.profile.approvalId);
});

test('expired approval permits original-scope reconciliation, not create/drain/delete or billing-stop claims',async()=>{
 const f=scaleFixture();const original=f.profile.expiresAtMs;
 f.executor.create=async()=>({outcome:'unknown',settled:false});await f.tick();f.profile.expiresAtMs=f.now-1;
 f.executor.reconcileCreate=async action=>{assert.equal(action.profile.expiresAtMs,original);return f.present(action);};
 assert.equal((await f.tick()).action,'reconcileCreate');await f.tick({plan:hold});
 assert.equal((await f.tick({plan:decrease(0)})).reason,'current_mutation_authority_required');
 assert.equal(f.calls.some(a=>['drain','delete'].includes(a.kind)),false);
});

test('fresh clocks after capability/provider awaits reject stale authority and late outcomes',async()=>{
 const f=scaleFixture(),cap=f.capabilities;f.executor.capabilities=async()=>{const c=cap();f.now+=31000;return c;};
 assert.equal((await f.tick()).action,'hold');assert.equal(f.calls.length,0);
 const late=scaleFixture();late.executor.create=async action=>{late.now+=CLIP_SCALE_OPERATION_LEASE_MS+1;return late.present(action);};
 assert.equal((await late.tick()).status,'unknown_create');
});

test('zero-worker admission readiness requires live qualification and an unused startup allowance',async()=>{
 const f=scaleFixture();f.profile.startupProbeApproved=true;
 await f.tick({plan:undefined,telemetry:f.telemetry(true)});assert.equal(f.ledger.backing.state.admissionReady,true);
 f.profile.expiresAtMs=f.now-1;await f.tick({plan:hold});assert.equal(f.ledger.backing.state.admissionReady,false);
 f.profile.expiresAtMs=f.now+100000;f.now++;await f.tick({plan:hold});assert.equal(f.ledger.backing.state.admissionReady,true);
 f.executor.capabilities=async()=>{throw Error('unavailable');};await f.tick({plan:hold});
 assert.equal(f.ledger.backing.state.admissionReady,false);assert.equal(f.ledger.backing.state.healthObservedAtMs,null);
});

test('one approved isolated-worker replacement drains before probing and cannot loop replacements',async()=>{
 const f=scaleFixture();f.profile.replacementProbeApproved=true;await ready(f);
 const failed=()=>{const raw=f.evidence();raw.workers[0].tempAvailableBytes=0;return {healthEvidence:raw};};
 assert.equal((await f.tick({telemetry:failed()})).action,'drain');
 assert.equal(f.ledger.backing.state.replacement.phase,'draining');
 await f.tick({plan:hold});assert.equal((await f.tick({plan:hold})).status,'deleted');
 assert.equal((await f.tick({plan:hold})).reason,'processing_circuit_cooldown');
 f.now+=CLIP_SCALE_HEALTH_COOLDOWN_MS;
 assert.equal((await f.tick({plan:hold})).recovered,true);
 assert.equal((await f.tick({plan:hold})).action,'create');await f.tick({plan:hold});
 assert.equal(f.ledger.backing.state.replacement.phase,'replacement-reserved');
 const before=f.calls.filter(a=>a.kind==='drain').length;await f.tick({telemetry:failed()});
 assert.equal(f.calls.filter(a=>a.kind==='drain').length,before);assert.equal(f.calls.filter(a=>a.kind==='create').length,2);
});

test('crash loops never trigger an approved worker replacement or extra paid capacity',async()=>{
 const f=scaleFixture();f.profile.replacementProbeApproved=true;await ready(f);
 const raw=f.evidence();raw.outcomes=[0,1,2].map(n=>({workerId:raw.inventory.workerIds[0],jobId:`crash-${n}`,
  status:'failed',errorCode:'media_binary_unavailable',observedAtMs:f.now}));
 assert.equal((await f.tick({plan:increase(4),telemetry:{healthEvidence:raw}})).action,'hold');
 assert.equal(f.ledger.backing.state.replacement,undefined);assert.equal(f.calls.filter(a=>a.kind==='create').length,1);
});

test('slow observation batch is token-fenced against a concurrent newer batch after lease expiry',async()=>{
 const f=scaleFixture();await ready(f,2);f.now+=31000;
 let release,started;const entered=new Promise(r=>{started=r;}),blocked=new Promise(r=>{release=r;});
 const original=f.executor.observe;let count=0;
 f.executor.observe=async action=>{if(++count===2)started();await blocked;return original(action);};
 const pending=f.tick({plan:hold});await entered;f.now+=CLIP_SCALE_OPERATION_LEASE_MS+1;
 f.executor.observe=original;await f.tick({plan:hold});const observations=f.ledger.backing.state.resources.map(r=>structuredClone(r.observation));
 release();await pending;assert.deepEqual(f.ledger.backing.state.resources.map(r=>r.observation),observations);
});
