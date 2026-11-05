import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {prepareDormantPlan,preflightSQL,assessPreflight,PROJECT,VERSION,NAME,MIGRATION,TIP_VERSION,TIP_NAME,INGRESS_VERSION,INGRESS_NAME} from '../scripts/sandbox-cashout-dormant-plan.mjs';
const source='404453abd93a6b2546732c21c94ffa4f3fc65833';
const plan=prepareDormantPlan({source});
const before=()=>({database:'postgres',projectExpected:PROJECT,historyCount:583,historyMaximum:'20261101215711',
  priorHistorySha256:plan.baselineBeforeTip.sha256,targets:[],sandboxObjectsAbsent:true,dependenciesPresent:true,
  liveControlsOff:true,sandboxGates:true,discoveryOn:true,preexistingCatalogSha256:'a'.repeat(64)});
const afterTip=()=>({...before(),historyCount:584,historyMaximum:TIP_VERSION,
  targets:[{version:TIP_VERSION,name:TIP_NAME,statementsSha256:plan.tipPredecessor.statementsSha256}]});
const after=()=>({...afterTip(),historyCount:585,targets:[...afterTip().targets,
  {version:INGRESS_VERSION,name:INGRESS_NAME,statementsSha256:plan.ingressPredecessor.statementsSha256}]});

test('offline packet binds exact immutable migration and fixed new endpoint closure',()=>{
  assert.equal(plan.migration.body,fs.readFileSync(MIGRATION,'utf8'));
  assert.equal(plan.migration.version,VERSION);assert.equal(plan.migration.name,NAME);
  assert.equal(plan.deployReady,false);assert.equal(plan.productionExecuted,false);
  assert.equal(plan.credentialsRead,false);assert.equal(plan.activationIncluded,false);
  assert.equal(plan.tables.length,11);assert.equal(plan.functions.length,21);
  assert.deepEqual(plan.endpoints.map(e=>[e.payload.name,e.payload.verify_jwt]),[['sandbox-creator-cashout',true],['sandbox-creator-cashout-webhook',false]]);
  for(const endpoint of plan.endpoints){
    assert.equal(endpoint.payload.project_id,PROJECT);
    assert.equal(endpoint.files.length,4);
    assert.match(endpoint.payload.files.find(f=>f.name.endsWith('/creator-cashout-execution.ts')).content,/void reader.cancel\(\).catch/);
  }
  assert.throws(()=>prepareDormantPlan({source:'main'}),/EXACT_SOURCE_REQUIRED/);
  assert.throws(()=>prepareDormantPlan({source:'a7eb368b802f59c27783711c0857426afb80f99c'}),/TIP_PREDECESSOR_BYTES_CHANGED/);
});

test('tip-first exact identity, drift and controls fail closed; no snapshot is deployment authority',()=>{
  assert.equal(assessPreflight(plan,before()).status,'blocked_until_exact_tip_deployment');
  assert.equal(assessPreflight(plan,afterTip()).status,'blocked_until_exact_native_ingress_deployment');
  assert.deepEqual(assessPreflight(plan,after()),{status:'post_predecessors_snapshot_requires_independent_requalification',deployReady:false,catalogSha256:'a'.repeat(64)});
  for(const changed of [
    {...after(),liveControlsOff:false},{...after(),sandboxGates:false},{...after(),discoveryOn:false},
    {...after(),sandboxObjectsAbsent:false},{...after(),dependenciesPresent:false},
    {...after(),historyCount:586},{...after(),historyMaximum:VERSION},
    {...after(),priorHistorySha256:'f'.repeat(64)},{...after(),preexistingCatalogSha256:'no'},
    {...after(),targets:[{...after().targets[0],name:'wrong'}]},
    {...after(),targets:[{...after().targets[0],statementsSha256:'f'.repeat(64)}]},
    {...after(),targets:[after().targets[0],{...after().targets[1],name:'wrong'}]},
    {...after(),targets:[after().targets[0],{...after().targets[1],statementsSha256:'f'.repeat(64)}]},
    {...after(),targets:[after().targets[1]]},
    {...after(),targets:[...after().targets,{version:'unexpected'}]},
  ])assert.throws(()=>assessPreflight(plan,changed));
  const existing={...after(),targets:[...after().targets,{version:VERSION,name:NAME,statementsSha256:plan.migration.statementsSha256}],sandboxObjectsAbsent:false};
  assert.deepEqual(assessPreflight(plan,existing),{status:'existing_sandbox_requires_full_readback',deployReady:false});
});

test('CLI is offline, refuses apply/overwrites, and writes only review artifacts',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sandbox-dormant-plan-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const script='scripts/sandbox-cashout-dormant-plan.mjs',out=path.join(dir,'packet');
  const run=(...args)=>execFileSync(process.execPath,[script,...args],{encoding:'utf8',stdio:'pipe'});
  assert.match(run('--help'),/Offline only/);
  assert.throws(()=>run('--source',source,'--out',out,'--apply'));
  assert.equal(fs.existsSync(out),false);
  const receipt=JSON.parse(run('--source',source,'--out',out));
  assert.equal(receipt.status,'prepared_not_deployable');
  assert.equal(fs.readdirSync(out).length,5);
  assert.equal(fs.readFileSync(path.join(out,`${VERSION}_${NAME}.sql`),'utf8'),plan.migration.body);
  assert.throws(()=>run('--source',source,'--out',out));
  assert.equal(fs.readdirSync(out).length,5);
  const tool=fs.readFileSync(script,'utf8');
  assert.doesNotMatch(tool,/process\.env|fetch\(|SUPABASE_ACCESS_TOKEN|apply_migration|execute_sql|--include-all/);
});

test('metadata-only preflight executes on live-era schema and keeps existing data unchanged',{timeout:300000},async t=>{
  const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,excludeMigrations:[
    path.basename(MIGRATION),'20261102093836_creator_clip_export_bounded_pool.sql',
    '20261105010859_sandbox_cashout_status_notifications.sql', // Depends on the intentionally absent sandbox execution.
    '20261102094308_creator_clip_scale_lifecycle_ledger.sql','20261103005000_native_production_ingress_observations.sql',
  ]});t.after(()=>db.close());
  await db.exec(`create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
    insert into supabase_migrations.schema_migrations values('20261101215711','synthetic_fixture',array['select 1;']);
    update public.platform_money_kill_switches set state='off' where key in ('live_money_enabled','payouts_enabled','cashout_enabled');
    update public.platform_money_kill_switches set state='sandbox_only' where key in ('stripe_connect_enabled','creator_monetization_enabled','provider_webhooks_enabled');
    update private.discovery_invalidation_worker_config set enabled=true,collecting=true,primary_delivery_enabled=true,token_sha256=repeat('a',64);`);
  const snapshot=async()=>JSON.stringify((await db.query(`select (select jsonb_agg(t) from public.platform_money_kill_switches t) switches,
    (select jsonb_agg(t) from private.discovery_invalidation_worker_config t) discovery,
    (select jsonb_agg(t) from supabase_migrations.schema_migrations t) history`)).rows);
  const initial=await snapshot();
  await db.exec('begin read only;');
  const state=(await db.query(preflightSQL(plan))).rows[0].state;
  await db.exec('rollback;');
  assert.equal(state.sandboxObjectsAbsent,true);assert.equal(state.dependenciesPresent,true);
  assert.equal(state.liveControlsOff,true);assert.equal(state.sandboxGates,true);assert.equal(state.discoveryOn,true);
  assert.match(state.preexistingCatalogSha256,/^[a-f0-9]{64}$/);
  assert.equal(await snapshot(),initial);
  assert.equal((await db.query("select to_regclass('private.sandbox_cashout_control') control")).rows[0].control,null);
  // This test executes the immutable migration only in the disposable local fixture.
  await db.exec(plan.migration.body);
  assert.equal((await db.query(preflightSQL(plan))).rows[0].state.sandboxObjectsAbsent,false);
  assert.equal((await db.query('select enabled from private.sandbox_cashout_control')).rows[0].enabled,false);
  assert.equal((await db.query('select count(*)::int count from private.sandbox_cashout_qualifications')).rows[0].count,0);
  assert.equal((await db.query('select count(*)::int count from private.sandbox_cashout_executions')).rows[0].count,0);
});
