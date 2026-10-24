import assert from 'node:assert/strict';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {createSyntheticQualificationR2,assertRestoredQualificationFence} from '../../../tests/helpers/r2-qualification-r2-fixture.mjs';
import {loadQualificationModule,fixtureNow,fixtureProposalSQL} from '../../../tests/helpers/r2-qualification-fixture.mjs';
const {initialState,runQualification}=loadQualificationModule('r2-disposable-qualification.ts');
const {createQualificationRunStore}=loadQualificationModule('r2-disposable-qualification-store.ts');
const {MUTATION_RECEIPTS,RECEIPT_PROTECTION,OBJECTS,DEADLINE,RUN_APPROVED,CLEANUP_APPROVED}=loadQualificationModule('r2-disposable-qualification-manifest.ts');
const mutations=['put_control','put_target','conflict_target','delete_target','delete_control'];
const copy=value=>structuredClone(value);
async function runner(provider,snapshot) {
  let state=copy(snapshot??await initialState());const snapshots=[copy(state)];
  const store={read:async()=>copy(state),compareAndSwap:async(revision,next)=>{
    if(state.revision!==revision)return false;state=copy(next);snapshots.push(copy(state));return true;
  }};
  const deps={store,origin:provider.newOrigin(),now:()=>Date.parse(fixtureNow),cleanupApproved:false};
  return {deps,snapshots,state:()=>copy(state),run:action=>runQualification(action,deps)};
}
async function qualify(f){for(const action of ['prepare','read','conflict'])await f.run(action);assert.equal(f.state().phase,'conflict_verified');}
const count=(p,op)=>p.protectedMutations.filter(r=>r.op===op).length;

test('exact five permanent receipts are disjoint, hash-bound fixed inputs, never cleanup targets',()=>{
  assert.equal(RUN_APPROVED,true);assert.equal(CLEANUP_APPROVED,false);
  assert.deepEqual(Object.keys(MUTATION_RECEIPTS),mutations);
  const protectedDirectory=OBJECTS.control.key.slice(0,OBJECTS.control.key.lastIndexOf('/'));
  assert.equal(OBJECTS.target.key.slice(0,OBJECTS.target.key.lastIndexOf('/')),protectedDirectory);
  assert.equal(RECEIPT_PROTECTION.prefix,`${protectedDirectory}/receipts/`);
  assert.equal(new Set(Object.values(MUTATION_RECEIPTS).map(r=>r.key)).size,5);
  for(const [op,r]of Object.entries(MUTATION_RECEIPTS)){
    assert.equal(r.key,`${RECEIPT_PROTECTION.prefix}${op}.txt`);assert.ok(r.payload.includes(op));
    assert.ok(!Object.values(OBJECTS).some(o=>o.key===r.key||o.key.startsWith(RECEIPT_PROTECTION.prefix)));
  }
  assert.equal(RECEIPT_PROTECTION.condition,'Indefinite');
});
test('concrete signed origin acquires fresh receipt immediately before each protected operation',async()=>{
  const p=createSyntheticQualificationR2();
  for(const op of mutations)await p.origin(op);
  assert.deepEqual(p.requests.map(r=>r.op),mutations.flatMap(op=>[`receipt_${op}`,op]));
  assert.equal(p.protectedMutations.length,5);
  for(const op of mutations)assert.equal(p.objects.get(MUTATION_RECEIPTS[op].key),MUTATION_RECEIPTS[op].payload);
  for(const op of ['receipt_put_control','get_receipt','delete_receipt','constructor','__proto__',MUTATION_RECEIPTS.put_control.key])
    await assert.rejects(p.origin(op),/operation_not_allowlisted/);
  assert.equal(p.requests.length,10);
});
for(const op of mutations)test(`${op}: no protected dispatch on any non-200 receipt or transport uncertainty`,async()=>{
  for(const status of [201,204,301,403,409,412,500]){
    const p=createSyntheticQualificationR2();p.before=()=>new Response(null,{status});
    await assert.rejects(p.origin(op),/qualification_fence_not_acquired/);
    assert.equal(p.protectedMutations.length,0);assert.equal(p.requests.length,1);
  }
  const p=createSyntheticQualificationR2();p.before=()=>{throw Error('synthetic private failure');};
  await assert.rejects(p.origin(op),e=>e.message==='qualification_origin_unconfirmed');assert.equal(p.protectedMutations.length,0);
});
test('receipt collision 412 cannot masquerade as the expected target conflict 412',async()=>{
  const p=createSyntheticQualificationR2({locked:false}),f=await runner(p);
  await f.run('prepare');await f.run('read');
  p.objects.set(MUTATION_RECEIPTS.conflict_target.key,MUTATION_RECEIPTS.conflict_target.payload);
  await assert.rejects(f.run('conflict'),/qualification_fence_not_acquired/);
  assert.equal(f.state().pending,'conflict_target');assert.equal(f.state().phase,'read_verified');
  assert.equal(count(p,'conflict_target'),0);
});
test('receipt and protected budgets are reserved before either request; happy cleanup preserves all receipts',async()=>{
  const p=createSyntheticQualificationR2(),f=await runner(p);
  p.before=r=>{if(r.receipt){assert.equal(f.state().pending,r.op.slice(8));assert.ok(f.state().requestBudgetReserved>=2);}};
  await qualify(f);assert.equal(f.state().requestBudgetReserved,10);
  f.deps.cleanupApproved=true;await f.run('cleanup');
  assert.equal(f.state().phase,'cleaned');assert.equal(f.state().requestBudgetReserved,16);assert.equal(p.requests.length,16);
  assert.equal(p.objects.size,5);for(const r of Object.values(MUTATION_RECEIPTS))assert.ok(p.objects.has(r.key));
  for(const o of Object.values(OBJECTS))assert.equal(p.objects.has(o.key),false);
  const before=p.requests.length;for(const action of ['prepare','read','conflict','cleanup'])await f.run(action);
  assert.equal(p.requests.length,before);
});
test('fresh source/isolate factory and restored initial/prefix state cannot recreate after cleanup',async()=>{
  const p=createSyntheticQualificationR2(),f=await runner(p);await qualify(f);f.deps.cleanupApproved=true;await f.run('cleanup');
  for(const snapshot of f.snapshots){
    const restored=await runner(p,snapshot);restored.deps.cleanupApproved=true;
    for(const action of ['prepare','read','conflict','cleanup'])await restored.run(action).catch(e=>assert.match(e.message,/qualification_fence_not_acquired/));
    for(const o of Object.values(OBJECTS))assert.equal(p.objects.has(o.key),false);
  }
  for(const op of mutations)assert.equal(count(p,op),1);
});
test('two divergent restored ledgers share external receipts, not a CAS row or in-memory permit',async()=>{
  const p=createSyntheticQualificationR2(),a=await runner(p),b=await runner(p);
  const outcomes=await Promise.allSettled([a.run('prepare'),b.run('prepare')]);
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(count(p,'put_control'),1);assert.equal(count(p,'put_target'),1);
});
for(const op of mutations){
  test(`${op}: applied receipt with lost acknowledgment never permits dispatch or adoption`,async()=>{
    const p=createSyntheticQualificationR2();let lost=true;
    p.after=r=>{if(r.receipt&&lost){lost=false;throw Error('lost receipt acknowledgment');}};
    await assert.rejects(p.origin(op),/qualification_origin_unconfirmed/);
    await assert.rejects(p.newOrigin()(op),/qualification_fence_not_acquired/);
    assert.equal(count(p,op),0);assert.equal(p.objects.has(MUTATION_RECEIPTS[op].key),true);
  });
  test(`${op}: lost protected outcome consumes receipt permanently across a new factory`,async()=>{
    const p=createSyntheticQualificationR2();p.after=r=>{if(!r.receipt)throw Error('lost protected result');};
    await assert.rejects(p.origin(op),/qualification_origin_unconfirmed/);
    await assert.rejects(p.newOrigin()(op),/qualification_fence_not_acquired/);assert.equal(count(p,op),1);
  });
  test(`${op}: a delayed acquisition loses to the other acknowledged winner`,async()=>{
    const p=createSyntheticQualificationR2();let release,entered,first=true;
    const barrier=new Promise(resolve=>release=resolve),seen=new Promise(resolve=>entered=resolve);
    p.before=async r=>{if(r.receipt&&first){first=false;entered();await barrier;}};
    const late=p.origin(op);await seen;await p.newOrigin()(op);release();
    await assert.rejects(late,/qualification_fence_not_acquired/);assert.equal(count(p,op),1);
  });
}
test('unknown receipt that never committed may be reacquired after restore, but protected dispatch is still once',async()=>{
  const p=createSyntheticQualificationR2();let unknown=true;
  p.before=r=>{if(r.receipt&&unknown){unknown=false;throw Error('request never committed');}};
  await assert.rejects(p.origin('put_control'),/qualification_origin_unconfirmed/);
  await p.newOrigin()('put_control');await assert.rejects(p.newOrigin()('put_control'),/qualification_fence_not_acquired/);
  assert.equal(count(p,'put_control'),1);assert.equal(p.requests.filter(r=>r.receipt).length,3);
});
test('delayed protected PUT survives a negative read; stale restoration cannot replay it or start cleanup',async()=>{
  const p=createSyntheticQualificationR2(),original=await runner(p);let release,entered,first=true;
  const barrier=new Promise(resolve=>release=resolve),seen=new Promise(resolve=>entered=resolve);
  p.before=async r=>{if(r.op==='put_control'&&first){first=false;entered();await barrier;}};
  const pending=original.run('prepare');await seen;
  const restored=await runner(p);restored.deps.cleanupApproved=true;
  await assert.rejects(restored.run('prepare'),/qualification_fence_not_acquired/);
  assert.equal((await restored.run('reconcile')).status,'write_or_delete_outcome_unresolved');
  assert.ok(restored.state().observations.every(o=>o.status===404));
  assert.equal((await restored.run('cleanup')).status,'pending_reconcile_required');
  assert.equal(count(p,'put_control'),1);assert.equal(count(p,'delete_target'),0);
  release();assert.equal((await pending).status,'prepared');
  assert.equal((await restored.run('reconcile')).status,'write_or_delete_outcome_unresolved');
  assert.ok(restored.state().observations.every(o=>o.status===200));
  assert.equal((await restored.run('prepare')).status,'pending_reconcile_required');
  assert.equal((await restored.run('cleanup')).status,'pending_reconcile_required');
  assert.equal(count(p,'put_control'),1);assert.equal(count(p,'delete_target'),0);
});
test('acknowledged receipt cannot bypass the protected request deadline',async()=>{
  let now=Date.parse(fixtureNow);const p=createSyntheticQualificationR2({now:()=>now});
  p.after=r=>{if(r.receipt)now=Date.parse(DEADLINE);};
  await assert.rejects(p.origin('put_control'),/deadline_passed/);
  assert.equal(p.protectedMutations.length,0);assert.equal(p.objects.size,1);
});
test('lock model preserves fence when conditional-header enforcement is broken; does not claim provider proof',async()=>{
  const p=createSyntheticQualificationR2({conditional:false});await p.origin('put_control');
  await assert.rejects(p.newOrigin()('put_control'),/qualification_fence_not_acquired/);assert.equal(count(p,'put_control'),1);
  const broken=createSyntheticQualificationR2({conditional:false,locked:false});
  await broken.origin('put_control');await broken.newOrigin()('put_control');assert.equal(count(broken,'put_control'),2);
});
test('negative control: removing protected receipts plus stale restore defeats the guarantee',async()=>{
  const p=createSyntheticQualificationR2(),f=await runner(p);await qualify(f);f.deps.cleanupApproved=true;await f.run('cleanup');
  // Deliberately break the independently protected-state assumption. Never a
  // live cleanup or reset capability, and never a success claim for this case.
  p.locked=false;p.objects.clear();const restored=await runner(p);await restored.run('prepare');
  assert.equal(count(p,'put_control'),2);assert.equal(count(p,'put_target'),2);
});
test('actual SQL adapter plus PGlite data-directory restores cannot reuse the external mutation receipts', {timeout:60000},async()=>{
  const p=createSyntheticQualificationR2(),db=new PGlite(),snapshots=[];
  const depsFor=database=>({origin:p.newOrigin(),now:()=>Date.parse(fixtureNow),cleanupApproved:true,
    store:createQualificationRunStore(async(name,args)=>{
      assert.ok(['read_r2_qualification_test_run','cas_r2_qualification_test_run'].includes(name));
      const values=[args.p_run_id,args.p_manifest_hash];
      if(name.startsWith('cas_'))values.push(args.p_expected_revision,args.p_next_state);
      return {data:(await database.query(`select public.${name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) v`,values)).rows[0].v};
    })});
  try{
    await db.exec('create role anon;create role authenticated;create role service_role;');await db.exec(fixtureProposalSQL);
    await db.query("insert into r2_qualification_test_private.run(state,setup_approval_ref) values($1,'approved:offline-restore-fence')",[await initialState()]);
    await db.exec('set role service_role');const deps=depsFor(db);
    const snapshot=async(cleanupApproved=false)=>({bytes:await db.dumpDataDir(),state:await deps.store.read(),cleanupApproved});
    snapshots.push(await snapshot());
    await runQualification('prepare',deps);snapshots.push(await snapshot());
    await runQualification('read',deps);snapshots.push(await snapshot());
    await runQualification('conflict',deps);
    await db.exec("reset role;update r2_qualification_test_private.run set cleanup_approval_ref='approved:offline-restore-cleanup';set role service_role;");
    snapshots.push(await snapshot(true));await runQualification('cleanup',deps);
    assert.equal((await deps.store.read()).phase,'cleaned');assert.equal(p.protectedMutations.length,5);
  }finally{await db.close();}
  for(const saved of snapshots){
    const restored=new PGlite({loadDataDir:saved.bytes});
    try{
      assert.equal((await restored.query('select cleanup_approval_ref is not null v from r2_qualification_test_private.run')).rows[0].v,saved.cleanupApproved);
      await restored.exec('set role service_role');const deps=depsFor(restored);
      assert.deepEqual(await deps.store.read(),saved.state);
      await assertRestoredQualificationFence({provider:p,state:saved.state,run:action=>runQualification(action,deps),cleanupApproved:saved.cleanupApproved});
      assert.equal(p.protectedMutations.length,5);
      for(const o of Object.values(OBJECTS))assert.equal(p.objects.has(o.key),false);
      assert.equal(p.objects.size,5);
    }finally{await restored.close();}
  }
  assert.equal(snapshots.length,4);
});
