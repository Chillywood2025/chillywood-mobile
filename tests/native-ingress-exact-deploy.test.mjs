import * as historicalTool from '../scripts/native-ingress-exact-deploy.mjs';
import {loadHistoricalBundle,materializeHistoricalBundle,readPinnedHistoricalSource} from './helpers/historical-revenuecat-closure.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHistoricalDeploymentDatabase} from './helpers/historical-deployment-schema-fixture.mjs';
import {loadBundle,readbackSql,classifyState,buildApplySql,deploy,sourceBinding,safeError,MANIFEST,MIGRATION,VERSION,NAME,HASH,EDGE_FILES} from '../scripts/native-ingress-exact-deploy.mjs';
import {MIGRATION as TIP_MIGRATION,VERSION as TIP_VERSION,NAME as TIP_NAME} from '../scripts/native-tip-exact-deploy.mjs';

const bundle=loadHistoricalBundle(historicalTool);
const context={currentPostgres:false,currentReadOnly:true,sessionPostgres:false,sessionReadOnly:true,sessionAdmin:false,transactionReadOnly:true};
const ready=()=>({schema:1,database:'postgres',context:{...context},priorHistorySha256:bundle.manifest.baselineHistory.sha256,historyCount:584,historyMaximum:TIP_VERSION,invariantsSha256:bundle.manifest.invariantsSha256,dataSha256:bundle.manifest.dataSha256,holds:true,tipPrerequisite:true,baselineDispatch:true,finalDispatch:false,addedAbsent:true,addedPresent:false,addedCatalogSha256:'0'.repeat(64),targets:[]});
const applied=()=>({...ready(),historyCount:585,baselineDispatch:false,finalDispatch:true,addedAbsent:false,addedPresent:true,addedCatalogSha256:bundle.manifest.addedCatalogSha256,targets:[{version:VERSION,name:NAME,statementsSha256:bundle.statementsSha256}]});

test('immutable schema and seven-file Edge source closure; no generic replacement',t=>{
  assert.equal(bundle.manifest.migration.sha256,HASH);assert.equal(EDGE_FILES.length,7);
  assert.equal(bundle.body,fs.readFileSync(MIGRATION,'utf8'));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-ingress-deploy-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:'pipe'}).trim();
  git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
  materializeHistoricalBundle(dir,historicalTool);
  git('add','.');git('commit','-m','synthetic source closure');const source=git('rev-parse','HEAD');
  assert.equal(sourceBinding(dir,source).source,source);assert.equal(loadBundle(dir,source).body,bundle.body);
  assert.throws(()=>sourceBinding(dir,'0'.repeat(40)),/SOURCE_HEAD_MISMATCH/);
  fs.appendFileSync(path.join(dir,MIGRATION),'\n-- dirty');
  assert.throws(()=>sourceBinding(dir,source),/TRACKED_SOURCE_DIRTY/);assert.throws(()=>loadBundle(dir),/MIGRATION_HASH_MISMATCH/);
  fs.writeFileSync(path.join(dir,MIGRATION),bundle.body);
  fs.appendFileSync(path.join(dir,EDGE_FILES[0]),'\n// dirty');
  assert.throws(()=>loadBundle(dir),/EDGE_HASH_MISMATCH/);
  fs.writeFileSync(path.join(dir,EDGE_FILES[0]),readPinnedHistoricalSource(EDGE_FILES[0]));
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,MANIFEST),'utf8'));manifest.migration.version='20261103005001';fs.writeFileSync(path.join(dir,MANIFEST),JSON.stringify(manifest));
  assert.throws(()=>loadBundle(dir),/MANIFEST_INVALID/);
  assert.equal(safeError(Error('ARBITRARY_SECRET')),'NATIVE_INGRESS_DEPLOY_BLOCKED');
});

test('read-only plan requires exact tip prerequisite, absence, context and complete frozen baseline',async()=>{
  let writes=0;const query=async(_sql,readOnly)=>{if(!readOnly)writes++;return ready();};
  assert.equal((await deploy({bundle,query})).status,'plan_ready');assert.equal(writes,0);
  assert.equal((await deploy({bundle,apply:true,query:async(_sql,readOnly)=>{assert.equal(readOnly,true);return applied();}})).status,'already_applied_verified');
  for(const bad of [
    {...ready(),holds:false},{...ready(),tipPrerequisite:false},{...ready(),historyCount:583},
    {...ready(),historyMaximum:VERSION},{...ready(),priorHistorySha256:'a'.repeat(64)},
    {...ready(),invariantsSha256:'a'.repeat(64)},{...ready(),dataSha256:'a'.repeat(64)},
    {...ready(),baselineDispatch:false},{...ready(),addedAbsent:false},{...ready(),addedPresent:true},
    {...ready(),context:{...context,transactionReadOnly:false}},
    {...applied(),targets:[{...applied().targets[0],name:'wrong_name'}]},
    {...applied(),targets:[{...applied().targets[0],statementsSha256:'b'.repeat(64)}]},
    {...applied(),finalDispatch:false},{...applied(),baselineDispatch:true},{...applied(),addedPresent:false},
    {...applied(),addedAbsent:true},{...applied(),addedCatalogSha256:'c'.repeat(64)},
  ])await assert.rejects(deploy({bundle,apply:true,query:async(_sql,readOnly)=>{assert.equal(readOnly,true);return bad;}}));
  assert.throws(()=>buildApplySql(bundle,applied()),/APPLY_REQUIRES_ABSENT_TARGETS/);
  const sql=buildApplySql(bundle,ready());
  assert.match(sql,/lock_timeout='5s'/);assert.match(sql,/statement_timeout='45s'/);
  assert.equal((sql.match(/insert into supabase_migrations.schema_migrations/gu)??[]).length,1);
  for(const excluded of ['20261102093836','20261102094308','20261102194000'])assert.equal(sql.includes(excluded),false);
  assert.equal(sql.includes('deploy_edge_function'),false);
});

test('uncertain write is reconciled without retry or new provider operation',async()=>{
  for(const after of [ready(),applied(),null,{...applied(),holds:false}]){
    let calls=0,writes=0,rechecks=0;
    const result=await deploy({bundle,apply:true,recheckSource:()=>rechecks++,query:async(_sql,readOnly)=>{
      calls++;if(!readOnly){writes++;throw Error('private provider failure');}
      if(calls===1)return ready();if(after===null)throw Error('read failed');return after;
    }});
    assert.equal(writes,1);assert.equal(rechecks,1);assert.equal(calls,3);
    assert.equal(result.status,after?.finalDispatch&&after?.holds?'applied_verified':'apply_unconfirmed');
    assert.equal(result.responseConfirmed,false);
  }
  let writes=0;await assert.rejects(deploy({bundle,apply:true,recheckSource:()=>{throw Error('dirty');},query:async(_sql,readOnly)=>{if(!readOnly)writes++;return ready();}}),/dirty/);assert.equal(writes,0);
});

test('historical live-era then exact tip: native-only atomic transaction, rollback, grants and immutable history',{timeout:300000},async t=>{
  const excluded=[path.basename(MIGRATION),path.basename(TIP_MIGRATION),'20261102093836_creator_clip_export_bounded_pool.sql','20261102094308_creator_clip_scale_lifecycle_ledger.sql','20261102194000_sandbox_creator_cashout_execution.sql'];
  excluded.push('20261105010859_sandbox_cashout_status_notifications.sql'); // Depends on the intentionally absent sandbox execution.
  const {db}=await createHistoricalDeploymentDatabase({implicitApiGrants:false,excludeMigrations:excluded});t.after(()=>db.close());
  await db.exec(`create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
    insert into supabase_migrations.schema_migrations values('20261101215711','synthetic_fixture_predecessor',array['select 1;']);
    update public.platform_money_kill_switches set state=case when key in ('live_money_enabled','payouts_enabled','cashout_enabled') then 'off' else 'sandbox_only' end
      where key in ('live_money_enabled','payouts_enabled','cashout_enabled','stripe_connect_enabled','tips_enabled','creator_monetization_enabled','provider_webhooks_enabled','revenuecat_app_store_enabled','revenuecat_google_play_enabled');
    create role supabase_read_only_user bypassrls;
    grant usage on schema public,private,supabase_migrations to supabase_read_only_user;
    grant select on all tables in schema public,private,supabase_migrations to supabase_read_only_user;`);
  const read=async()=>{
    await db.exec('set session authorization supabase_read_only_user;begin read only;');
    try{return (await db.exec(readbackSql(bundle))).at(-1).rows[0].state;}
    finally{await db.exec('rollback;set session authorization postgres;');}
  };
  const preTip=await read();assert.equal(preTip.tipPrerequisite,false);assert.equal(preTip.baselineDispatch,true);assert.equal(preTip.addedAbsent,true);
  assert.throws(()=>classifyState(bundle,preTip),/EXACT_TIP_PREREQUISITE_REQUIRED/);
  // Only the exact already-reviewed tip migration is added before native. The
  // unrelated clip/sandbox successors are absent throughout this rehearsal.
  await db.exec(bundle.tip.body);
  await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[TIP_VERSION,TIP_NAME,[bundle.tip.body]]);
  const before=await read();assert.equal(before.tipPrerequisite,true);assert.equal(before.holds,true);
  assert.equal(before.invariantsSha256,preTip.invariantsSha256,'tip bodies are independently exact-checked while all their metadata remains guarded');
  const local={...bundle,manifest:{...bundle.manifest,baselineHistory:{count:1,maximum:'20261101215711',sha256:before.priorHistorySha256},invariantsSha256:before.invariantsSha256,dataSha256:before.dataSha256}};
  assert.equal(classifyState(local,before),'ready');
  const sql=buildApplySql(local,before);
  const indexDefinition=(await db.query("select pg_get_indexdef('public.creator_money_checkout_attempt_unique'::regclass) as definition")).rows[0].definition;
  await db.exec('drop index public.creator_money_checkout_attempt_unique');
  const indexDrift=await read();assert.throws(()=>classifyState(local,indexDrift),/BASELINE_CONTRACT_MISMATCH/);
  await assert.rejects(db.exec(sql),/native_ingress_baseline_changed/);await db.exec('rollback');
  await db.exec(indexDefinition);assert.equal(classifyState(local,await read()),'ready');
  await db.exec("update public.platform_money_kill_switches set state='off' where key='tips_enabled'");
  await assert.rejects(db.exec(sql),/native_ingress_baseline_changed/);await db.exec('rollback');
  await db.exec("update public.platform_money_kill_switches set state='sandbox_only' where key='tips_enabled'");
  const refreshed=await read();local.manifest.dataSha256=refreshed.dataSha256;
  const freshSQL=buildApplySql(local,refreshed);
  const altered=freshSQL.replace('force row level security','disable row level security');
  await assert.rejects(db.exec(altered),/native_ingress_postcheck_failed/);await db.exec('rollback');
  assert.equal(classifyState(local,await read()),'ready','postcheck failure rolls back new relations, dispatch patch and ledger entry');
  await db.exec(freshSQL);
  const after=await read();assert.equal(classifyState(local,after),'applied');
  assert.equal(after.historyMaximum,TIP_VERSION,'older immutable native version does not replace the tip maximum');
  assert.equal(after.invariantsSha256,refreshed.invariantsSha256);assert.equal(after.dataSha256,refreshed.dataSha256);
  assert.equal(after.addedCatalogSha256,bundle.manifest.addedCatalogSha256,'new functions, grants, RLS, constraints, indexes and triggers match exact expected catalog');
  const ledger=(await db.query('select version,name,statements from supabase_migrations.schema_migrations where version=$1',[VERSION])).rows[0];
  assert.deepEqual(ledger,{version:VERSION,name:NAME,statements:[bundle.body]});
  for(const name of ['qualifications','revocations','observations'])assert.equal((await db.query(`select count(*)::int as count from private.native_production_ingress_${name}`)).rows[0].count,0);
  let writes=0;assert.equal((await deploy({bundle:local,apply:true,query:async(_sql,readOnly)=>{if(!readOnly)writes++;return read();}})).status,'already_applied_verified');assert.equal(writes,0);
  await db.exec('grant select on private.native_production_ingress_qualifications to service_role');
  const changedGrant=await read();assert.throws(()=>classifyState(local,changedGrant),/FINAL_CATALOG_MISMATCH/);
  await db.exec('revoke select on private.native_production_ingress_qualifications from service_role');
  assert.equal(classifyState(local,await read()),'applied');
  // Portable catalog normalization must retain actual nullability and real
  // constraints, rather than merely ignoring every NOT NULL/constraint row.
  for(const mutation of [
    'alter table private.native_production_ingress_observations alter column event_type drop not null',
    'alter table private.native_production_ingress_observations add constraint fixture_event_type_nonempty check(length(event_type)>0)',
  ]){
    await db.exec('begin;');
    try{
      await db.exec(mutation);
      const drift=(await db.exec(readbackSql(bundle))).at(-1).rows[0].state;
      drift.context={...context};
      assert.throws(()=>classifyState(local,drift),/FINAL_CATALOG_MISMATCH/);
    }finally{await db.exec('rollback;');}
    assert.equal(classifyState(local,await read()),'applied');
  }
  await db.query("update supabase_migrations.schema_migrations set statements=array['changed tip'] where version=$1",[TIP_VERSION]);
  const changedTip=await read();assert.throws(()=>classifyState(local,changedTip),/EXACT_TIP_PREREQUISITE_REQUIRED/);
  await db.query('update supabase_migrations.schema_migrations set statements=$2 where version=$1',[TIP_VERSION,[bundle.tip.body]]);
  await db.exec("update supabase_migrations.schema_migrations set statements=array['tampered predecessor'] where version='20261101215711'");
  const changedHistory=await read();assert.throws(()=>classifyState(local,changedHistory),/HISTORY_INVENTORY_MISMATCH/);
});
