#!/usr/bin/env node
// Actual proposal SQL on disposable local PGlite. No network, live client,
// provider, migration or credentials. NOT a multi-backend concurrency claim.
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PGlite} from '@electric-sql/pglite';
import {loadQualificationModule,fixtureProposalSQL,fixtureNow,assertProposalUnchanged,existingDatabaseFingerprintSQL} from '../tests/helpers/r2-qualification-fixture.mjs';
import {createDatabase} from '../tests/helpers/database-runtime-authority-fixture.mjs';
const {createQualificationRunStore,validateQualificationState}=loadQualificationModule('r2-disposable-qualification-store.ts');
const {initialState,runQualification}=loadQualificationModule('r2-disposable-qualification.ts');
const {DEADLINE,OBJECTS,RUN_ID,manifestHash,sha256}=loadQualificationModule('r2-disposable-qualification-manifest.ts');

const sql=fixtureProposalSQL;
const hash=await manifestHash(), now=()=>Date.parse(fixtureNow);
let checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;};
const denied=async(promise,pattern)=>{await assert.rejects(promise,pattern);checks++;};
async function fixture({disk=false}={}) {
  const directory=disk?await mkdtemp(join(tmpdir(),'r2-qualification-ledger-')):undefined;
  let db=new PGlite(directory);
  await db.exec('create role anon;create role authenticated;create role service_role;');
  await db.exec(sql);
  const owner=async fn=>{await db.exec('reset role');try{return await fn();}finally{await db.exec('set role service_role');}};
  const seed=async()=>owner(async()=>db.query('insert into r2_qualification_test_private.run(state,setup_approval_ref) values($1,$2)',[await initialState(),'approved:offline-synthetic-setup']));
  const approveCleanup=async()=>owner(()=>db.query("update r2_qualification_test_private.run set cleanup_approval_ref='approved:offline-synthetic-cleanup'"));
  const scalar=async(q,args=[])=>(await db.query(q,args)).rows[0]?.v;
  const rpc=async(name,args)=>{
    assert.ok(['read_r2_qualification_test_run','cas_r2_qualification_test_run'].includes(name));
    const params=[args.p_run_id,args.p_manifest_hash];
    if(name.startsWith('cas_'))params.push(args.p_expected_revision,args.p_next_state);
    return {data:await scalar(`select public.${name}(${params.map((_,i)=>'$'+(i+1)).join(',')}) v`,params),error:null};
  };
  const calls=[],objects=new Map();
  const origin=async op=>{
    calls.push(op);const name=op.endsWith('_control')?'control':'target',observedAt=new Date(now()).toISOString();
    if(op.startsWith('get_')) {const payload=objects.get(name);return payload===undefined?{status:404,observedAt}:
      {status:200,observedAt,byteCount:payload.length,sha256:await sha256(new TextEncoder().encode(payload))};}
    if(op.startsWith('delete_')){objects.delete(name);return {status:204,observedAt};}
    if(objects.has(name))return {status:412,observedAt};
    objects.set(name,OBJECTS[name].payload);return {status:200,observedAt};
  };
  const store=createQualificationRunStore(rpc),deps={store,origin,now,cleanupApproved:false};
  await db.exec('set role service_role');
  return {get db(){return db;},owner,seed,approveCleanup,scalar,rpc,calls,objects,store,deps,
    run:action=>runQualification(action,deps),
    reopen:async()=>{assert.ok(directory);await db.close();db=new PGlite(directory);await db.exec('set role service_role');},
    close:async()=>{await db.close();if(directory)await rm(directory,{recursive:true,force:true});}};
}
async function qualified(f){for(const action of ['prepare','read','conflict'])await f.run(action);assert.equal((await f.store.read()).phase,'conflict_verified');}

{
  const f=await fixture();try{
    check(await f.store.read()===null,'schema has no seeded run');
    const initial=await initialState(),next={...initial,revision:1,pending:'put_control',requestBudgetReserved:1};
    check(await f.store.compareAndSwap(0,next)===false,'CAS cannot create a missing row');
    await denied(f.run('prepare'),/durable_run_unavailable/);check(f.calls.length===0,'missing setup has no provider operations');
    await denied(f.scalar('select public.read_r2_qualification_test_run($1,$2) v',['wrong',hash]),/qualification_binding_invalid/);
    await denied(f.scalar('select public.read_r2_qualification_test_run($1,$2) v',[RUN_ID,null]),/qualification_binding_invalid/);
    for(const role of ['anon','authenticated','service_role'])await f.owner(async()=>{
      await f.db.exec(`set role ${role}`);
      await denied(f.db.exec('select * from r2_qualification_test_private.run'),/permission denied/);
      await denied(f.db.query('insert into r2_qualification_test_private.run(state,setup_approval_ref) values($1,$2)',[initial,'approved:forged']),/permission denied/);
      if(role!=='service_role')await denied(f.scalar('select public.read_r2_qualification_test_run($1,$2) v',[RUN_ID,hash]),/permission denied/);
    });
    await f.owner(async()=>{
      check(await f.scalar("select relrowsecurity and relforcerowsecurity v from pg_class where oid='r2_qualification_test_private.run'::regclass"),'RLS and FORCE RLS enabled');
      check(await f.scalar("select count(*)=0 v from pg_policy where polrelid='r2_qualification_test_private.run'::regclass"),'no permissive table policies');
      await denied(f.scalar('select public.read_r2_qualification_test_run($1,$2) v',[RUN_ID,hash]),/qualification_service_required/);
    });
    await f.seed();await denied(f.approveCleanup(),/qualification_run_immutable/);
    await denied(f.seed(),/duplicate key/);
    check((await f.store.read()).revision===0,'single setup seed unchanged');
    await f.db.exec('begin isolation level repeatable read');
    await denied(f.store.compareAndSwap(0,next),/qualification_store_unconfirmed/);await f.db.exec('rollback');
    check(await f.store.compareAndSwap(0,next),'first exact CAS wins');
    check(await f.store.compareAndSwap(0,next)===false,'stale concurrent-equivalent CAS loses');
    check((await f.store.read()).pending==='put_control','durable pending intent precedes any origin request');
  }finally{await f.close();}
}
{
  const f=await fixture({disk:true});try{
    await f.seed();await qualified(f);f.deps.cleanupApproved=true;
    await denied(f.run('cleanup'),/qualification_store_unconfirmed/);
    check(!f.calls.some(c=>c.startsWith('delete_')),'DB independently refuses unapproved cleanup fence');
    check((await f.store.read()).phase==='conflict_verified','denied cleanup leaves proof intact');
    await f.approveCleanup();f.deps.cleanupApproved=false;
    await denied(f.run('cleanup'),/cleanup_not_approved/);
    f.deps.cleanupApproved=true;check((await f.run('cleanup')).status==='cleaned','approved synthetic cleanup completes');
    const count=f.calls.length;await f.reopen();
    check((await f.run('prepare')).status==='cleaned','disk restart retains permanent no-recreate tombstone');
    check(f.calls.length===count,'restart emits no new provider operation');
    const final=await f.store.read();
    await f.owner(async()=>{
      await denied(f.db.exec('delete from r2_qualification_test_private.run'),/qualification_run_permanent/);
      await denied(f.db.exec('truncate r2_qualification_test_private.run'),/qualification_run_permanent/);
      await denied(f.db.exec("update r2_qualification_test_private.run set cleanup_approval_ref=null"),/qualification_run_immutable/);
      await denied(f.db.query('update r2_qualification_test_private.run set state=$1',[{...await initialState(),revision:final.revision+1}]),/qualification_transition_invalid/);
    });
  }finally{await f.close();}
}
{
  const f=await fixture({disk:true});try{
    await f.seed();const original=f.deps.origin;
    f.deps.origin=async op=>{await original(op);throw Error('synthetic lost provider receipt');};
    await denied(f.run('prepare'),/lost provider/);await f.reopen();f.deps.origin=original;
    check((await f.run('prepare')).status==='pending_reconcile_required','restart cannot replay uncertain create');
    for(let i=0;i<3;i++)check((await f.run('reconcile')).status==='write_or_delete_outcome_unresolved','read does not establish late-writer drain');
    await denied(f.run('reconcile'),/reconciliation_limit/);
    check(f.calls.filter(c=>c==='put_control').length===1,'unknown PUT was attempted once only');
    check((await f.store.read()).pending==='put_control','unknown PUT retains permanent intent');
  }finally{await f.close();}
}
for(const lostOn of [1,2]){
  const f=await fixture();try{
    await f.seed();let mutations=0;
    f.deps.store=createQualificationRunStore(async(name,args)=>{
      const result=await f.rpc(name,args);
      if(name.startsWith('cas_')&&++mutations===lostOn)throw Error('synthetic lost committed RPC response');
      return result;
    });
    await denied(f.run('prepare'),/qualification_store_unconfirmed/);
    const durable=await f.store.read();
    f.deps.store=f.store;
    if(lostOn===1){check(durable.pending==='put_control','lost intent ACK leaves permanent pending');await f.run('prepare');check(f.calls.length===0,'uncertain intent ACK dispatches nothing');}
    else{check(durable.completed[0]==='put_control','lost receipt ACK is recovered by readback');await f.run('prepare');check(f.calls.filter(c=>c==='put_control').length===1,'committed completion is never recreated');}
  }finally{await f.close();}
}
{
  const f=await fixture();try{
    await f.seed();const base=await f.store.read();
    for(const change of [{runId:null},{manifestHash:null},{phase:null},{revision:1.5},{pending:'arbitrary'},
      {updatedAt:'2026-01-01T24:00:00.000Z'},{updatedAt:'2026-10-23T22:00:60.000Z'},
      {observations:[{status:404,observedAt:'2026-01-01T24:00:00.000Z'}]},
      {observations:[{status:404,observedAt:'2026-10-23T22:00:60.000Z'}]},
      {completed:['put_target']},{extra:'secret'},{observations:[{status:null,observedAt:base.updatedAt}]},
      {observations:[{status:200,observedAt:base.updatedAt,byteCount:1025,sha256:'a'.repeat(64)}]}]){
      await denied(f.owner(()=>f.db.query('select r2_qualification_test_private.validate_state($1)',[{...base,...change}])),/qualification_state_invalid/);
      await denied(validateQualificationState({...base,...change}),/qualification_state_invalid/);
    }
    const next={...base,revision:1,pending:'put_control',requestBudgetReserved:1};
    check(await f.owner(()=>f.scalar('select r2_qualification_test_private.valid_transition($1,$2,false,$3) v',[base,next,DEADLINE]))===false,'server-side exact deadline blocks new requests');
    check(await f.owner(()=>f.scalar('select r2_qualification_test_private.valid_transition($1,$2,false,$3) v',[base,next,'2026-10-23T22:00:00Z']))===true,'valid pre-deadline operation allowed');
    await denied(f.store.compareAndSwap(0,{...next,requestBudgetReserved:2}),/qualification_store_unconfirmed/);
    await denied(f.store.compareAndSwap(0,{...base,revision:1,phase:'cleanup_started',completed:['put_control','put_target','read','conflict_target']}),/qualification_store_unconfirmed/);
    check((await f.store.read()).revision===0,'invalid transitions leave ledger untouched');
  }finally{await f.close();}
}
{
  const f=await fixture();try{
    await f.seed();await qualified(f);await f.approveCleanup();f.deps.cleanupApproved=true;
    const original=f.deps.origin;let lost=true;
    f.deps.origin=async op=>{const result=await original(op);if(op==='delete_target'&&lost){lost=false;throw Error('lost delete');}return result;};
    await denied(f.run('cleanup'),/lost delete/);
    check((await f.run('reconcile')).status==='delete_absence_reconciled','exact 404 reconciles unknown DELETE under permanent fence');
    check((await f.run('cleanup')).status==='cleaned','remaining approved cleanup finishes');
    check(f.calls.filter(c=>c==='delete_target').length===1,'reconciled DELETE not repeated');
  }finally{await f.close();}
}
// Also replay the repository's entire schema with the established managed-service
// doubles. This is not the native Supabase/pgTAP suite or live migration parity.
const {db:full,replayReport}=await createDatabase({applyRepair:true,includeHeldStudio:true});
try {
  const before=(await full.query(existingDatabaseFingerprintSQL)).rows[0];
  await full.exec(sql);
  check(JSON.stringify((await full.query(existingDatabaseFingerprintSQL)).rows[0])===JSON.stringify(before),'existing migrated schema, ACLs and protected state unchanged');
  check((await full.query('select count(*)::int n from r2_qualification_test_private.run')).rows[0].n===0,'full schema proposal is unseeded');
  for(const role of ['anon','authenticated']){
    await full.exec(`set role ${role}`);
    await denied(full.query('select public.read_r2_qualification_test_run($1,$2)',[RUN_ID,hash]),/permission denied/);
    await full.exec('reset role');
  }
  await full.exec('set role service_role');
  check((await full.query('select public.read_r2_qualification_test_run($1,$2) v',[RUN_ID,hash])).rows[0].v===null,'only intended service RPC remains callable with full default grants');
} finally {await full.close();}
assertProposalUnchanged();
console.log(JSON.stringify({status:'passed',checks,engine:'PGlite actual PostgreSQL',multiBackendConcurrency:false,syntheticClock:true,
  schemaReplayFiles:replayReport.files.length,schemaReplayStatements:replayReport.statements,managedInfrastructureDoubles:true,pgTap:false,networkCalls:0,liveDatabaseWrites:0}));
