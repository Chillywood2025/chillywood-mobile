import assert from 'node:assert/strict';
import test from 'node:test';
import {loadQualificationModule} from '../../../tests/helpers/r2-qualification-fixture.mjs';
const {createQualificationRunStore,validateQualificationState}=loadQualificationModule('r2-disposable-qualification-store.ts');
const {initialState}=loadQualificationModule('r2-disposable-qualification.ts');
const {RUN_ID,manifestHash}=loadQualificationModule('r2-disposable-qualification-manifest.ts');

test('store construction is inert and missing reads never seed',async()=>{
  const calls=[];const store=createQualificationRunStore(async(name,args)=>{calls.push([name,args]);return {data:null};});
  assert.deepEqual(calls,[]);assert.equal(await store.read(),null);
  assert.deepEqual(calls,[['read_r2_qualification_test_run',{p_run_id:RUN_ID,p_manifest_hash:await manifestHash()}]]);
  assert.deepEqual(Object.keys(store).sort(),['compareAndSwap','read']);
});
test('CAS binds exact run/hash/revision and requires a literal boolean receipt',async()=>{
  const calls=[];let receipt=true;const next={...await initialState(),revision:1,pending:'put_control',requestBudgetReserved:1};
  const store=createQualificationRunStore(async(name,args)=>{calls.push([name,args]);return {data:receipt};});
  assert.equal(await store.compareAndSwap(0,next),true);
  assert.deepEqual(calls[0],['cas_r2_qualification_test_run',{p_run_id:RUN_ID,p_manifest_hash:await manifestHash(),p_expected_revision:0,p_next_state:next}]);
  receipt=false;assert.equal(await store.compareAndSwap(0,next),false);
  for(receipt of ['true',1,null,{},undefined])await assert.rejects(store.compareAndSwap(0,next),/qualification_receipt_invalid/);
});
test('invalid proposed states or revisions never reach RPC',async()=>{
  let calls=0;const store=createQualificationRunStore(async()=>{calls++;return {data:true};});
  const next={...await initialState(),revision:1,pending:'put_control',requestBudgetReserved:1};
  for(const change of [{runId:'wrong'},{manifestHash:'wrong'},{extra:'secret'},{pending:'arbitrary'}])await assert.rejects(store.compareAndSwap(0,{...next,...change}),/qualification_state_invalid/);
  for(const revision of [-1,0.5,99,1])await assert.rejects(store.compareAndSwap(revision,next),/qualification_revision_invalid/);
  assert.equal(calls,0);
});
test('unknown RPC outcomes are sanitized and never retried',async()=>{
  for(const mode of ['error','throw']){
    let calls=0;const store=createQualificationRunStore(async()=>{calls++;if(mode==='throw')throw Error('private provider credentials');return {data:null,error:{message:'private provider credentials'}};});
    await assert.rejects(store.read(),e=>e.message==='qualification_store_unconfirmed');assert.equal(calls,1);
  }
});
test('read validation copies data and rejects extra/private content',async()=>{
  const state=await initialState(),store=createQualificationRunStore(async()=>({data:state}));
  const first=await store.read();first.completed.push('put_control');assert.deepEqual(state.completed,[]);
  state.extra='private data';await assert.rejects(store.read(),/qualification_state_invalid/);
});
test('canonical timestamp validation rejects clock normalization in state and observations',async()=>{
  for(const bad of ['2026-01-01T24:00:00.000Z','2026-10-23T22:00:60.000Z','2026-02-30T00:00:00.000Z']){
    await assert.rejects(validateQualificationState({...await initialState(),updatedAt:bad}),/qualification_state_invalid/);
    await assert.rejects(validateQualificationState({...await initialState(),observations:[{status:404,observedAt:bad}]}),/qualification_state_invalid/);
  }
  await assert.rejects(validateQualificationState({...await initialState(),phase:'cleaned',pending:undefined,
    completed:['put_control','put_target','read','conflict_target','delete_target','delete_control','cleanup_verify']}),/qualification_state_invalid/);
});
