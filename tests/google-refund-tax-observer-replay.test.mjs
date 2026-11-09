import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {createHistoricalDeploymentDatabase} from './helpers/historical-deployment-schema-fixture.mjs';
import {databaseFactory as nativeDatabaseFactory} from './helpers/native-deployment-database.mjs';
import {loadBundle,probeSql,readbackSql,classifyProbe,classifyState,buildApplySql,deploy,addedCatalogHashSQL,PROJECT,MIGRATION,PREDECESSORS} from '../scripts/google-refund-tax-observer-exact-deploy.mjs';

test('local PostgreSQL replay preserves exact social catalog across refund install, rollback and lost response', {timeout:300000},async t=>{
  const bundle=loadBundle(),paths=[...PREDECESSORS.map(p=>`supabase/migrations/${p.version}_${p.name}.sql`),...bundle.social.map(p=>p.path)];
  const excluded=[MIGRATION,...paths,'supabase/migrations/20261105010859_sandbox_cashout_status_notifications.sql',
    'supabase/migrations/20261102093836_creator_clip_export_bounded_pool.sql','supabase/migrations/20261102094308_creator_clip_scale_lifecycle_ledger.sql'].map(p=>path.basename(p));
  const {db}=await createHistoricalDeploymentDatabase({implicitApiGrants:false,excludeMigrations:excluded,
    ...(process.env.NATIVE_DEPLOYMENT_PG_BIN ? {databaseFactory:nativeDatabaseFactory} : {})});t.after(()=>db.close());
  if(db.nativeVersion)t.diagnostic(`Owned disposable replay: ${db.nativeVersion}; Unix socket only; database postgres`);
  await db.exec(`set search_path=pg_catalog,public;
    create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
    insert into supabase_migrations.schema_migrations values('20261101215711','synthetic_fixture_predecessor',array['select 1;']);
    update public.platform_money_kill_switches set state=case when key in ('live_money_enabled','payouts_enabled','cashout_enabled') then 'off' else 'sandbox_only' end
      where key in ('live_money_enabled','payouts_enabled','cashout_enabled','stripe_connect_enabled','tips_enabled','creator_monetization_enabled','provider_webhooks_enabled','revenuecat_app_store_enabled','revenuecat_google_play_enabled');
    update private.discovery_invalidation_worker_config set enabled=true,collecting=true,primary_delivery_enabled=true,token_sha256=repeat('0',64);
    create role supabase_read_only_user bypassrls;grant usage on schema public,private,auth,supabase_migrations to supabase_read_only_user;
    grant select on all tables in schema public,private,auth,supabase_migrations to supabase_read_only_user;`);
  const read=async(sql=readbackSql())=>{await db.exec('set session authorization supabase_read_only_user;');
    try{return (await db.exec(sql)).find(r=>r.rows?.[0]?.state)?.rows[0].state;}finally{await db.exec('rollback;set session authorization postgres;');}};
  const original=await read(probeSql());
  for(const [i,p] of [...bundle.predecessors,...bundle.social].entries()){
    const body=fs.readFileSync(paths[i],'utf8');await db.exec(body);
    await db.query('insert into supabase_migrations.schema_migrations values($1,$2,$3)',[p.version,p.name,[body]]);
  }
  await db.exec('grant select on all tables in schema public,private,auth,supabase_migrations to supabase_read_only_user;');
  const before=await read(),local={...bundle,manifest:{...bundle.manifest,originalHistory:{count:1,maximum:'20261101215711',sha256:original.originalHistorySha256}}};
  await db.exec(`set chillywood.refund_readback='{"readbackProtocol":"refund589-bounded-readback-v1","injected":true}'`);
  assert.deepEqual(await read(),before,'stale session payload cannot bypass initialized readback stages');
  await db.exec('reset chillywood.refund_readback');
  assert.equal(before.socialCatalogSha256,bundle.manifest.socialCatalogSha256,'social target matches separately frozen source catalog');
  assert.equal(classifyProbe(local,before),'post_observer_requires_independent_requalification');assert.ok(before.holds);
  local.manifest.qualification='independently_reviewed_observer_successor';
  local.manifest.postPredecessorBaseline={historyCount:7,historyMaximum:'20261107191000',historySha256:before.priorHistorySha256,
    catalogSha256:before.catalogSha256,dataSha256:before.dataSha256,socialCatalogSha256:before.socialCatalogSha256,observedAt:'2026-11-08T00:00:00Z',
    revenuecat:{project:PROJECT,status:'ACTIVE',name:'revenuecat-webhook',version:94,verifyJwt:false,files:bundle.revenuecatExpected.files}};
  const sql=buildApplySql(local,before);
  await db.exec('begin');
  try{
    await db.exec(bundle.body);
    const inspected=(await db.exec(`select ${addedCatalogHashSQL} as hash`)).at(-1).rows[0].hash;
    if(inspected!==bundle.manifest.addedCatalogSha256)t.diagnostic(JSON.stringify({actualAddedCatalogSha256:inspected,
      constraints:(await db.exec("select contype,conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid='private.google_refund_tax_history'::regclass order by contype,conname")).at(-1).rows}));
    assert.equal(inspected,bundle.manifest.addedCatalogSha256,'immutable refund source produces the expected target catalog on this engine');
  }finally{await db.exec('rollback');}
  if(db.withConnection)await db.withConnection(async holder=>{
    // Real concurrent transaction: a stale apply must wait on migration history,
    // then reject the changed history after the holder commits. This receipt is
    // synthetic and remains exclusively inside this owned disposable cluster.
    await holder.query('begin');
    await holder.query("insert into supabase_migrations.schema_migrations values('99999999999999','synthetic_concurrent_receipt',array['select 1;'])");
    const pending=db.exec(sql).then(()=>({error:null}),error=>({error}));
    try{
      let waiting=false;
      for(let i=0;i<100;i++){
        await holder.query('select pg_stat_clear_snapshot()');
        const result=await holder.query('select pg_backend_pid()=any(pg_blocking_pids($1)) blocked_by_holder',[db.backendPid]);
        if(result.rows[0]?.blocked_by_holder){waiting=true;break;}
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      assert.equal(waiting,true,'apply actually waits on the other history transaction');
      await holder.query('commit');
      const outcome=await pending;assert.match(outcome.error?.message??'',/refund_deploy_baseline_changed/);
    }finally{
      await holder.query('rollback');await pending;await db.exec('rollback');
      await holder.query("delete from supabase_migrations.schema_migrations where version='99999999999999'");
    }
    assert.deepEqual(await read(),before);
    t.diagnostic('Native two-session history-lock wait and stale-plan rejection passed');
  });
  await db.exec('begin;revoke execute on function public.read_comment_likes_batch(text,uuid[]) from anon;');
  await assert.rejects(db.exec(sql),/refund_deploy_baseline_changed/);await db.exec('rollback');assert.deepEqual(await read(),before);
  await db.exec('begin;grant execute on function private.sandbox_cashout_notification_state(text) to anon;');
  await assert.rejects(db.exec(sql),/refund_deploy_baseline_changed/);await db.exec('rollback');assert.deepEqual(await read(),before);
  const malformed=sql.replace(local.manifest.addedCatalogSha256,'f'.repeat(64));assert.notEqual(malformed,sql);
  await assert.rejects(db.exec(malformed),/refund_deploy_postcheck_failed/);await db.exec('rollback');assert.deepEqual(await read(),before);
  let writes=0,writeFailure=null;
  const result=await deploy({bundle:local,apply:true,recheckSource:()=>{},verifyPrerequisiteEdge:async()=>local.manifest.postPredecessorBaseline.revenuecat,
    query:async(statement,readOnly)=>{if(readOnly)return read(statement);writes++;
      try{await db.exec(statement);}catch(error){writeFailure=error;throw error;}
      throw Error('lost transport response');}});
  assert.equal(writeFailure,null,'the simulated lost response must follow a successful local commit');
  assert.equal(result.status,'applied_verified');assert.equal(result.responseConfirmed,false);assert.equal(writes,1);
  const after=await read();assert.equal(classifyState(local,after),'applied');
  for(const key of ['catalogSha256','socialCatalogSha256','dataSha256','priorHistorySha256','originalHistorySha256'])assert.equal(after[key],before[key],key);
  assert.equal(after.historyCount,8);assert.equal(after.historyMaximum,'20261107191000');
});
