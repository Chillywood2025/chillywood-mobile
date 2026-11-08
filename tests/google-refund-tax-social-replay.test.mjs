import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {createHistoricalDeploymentDatabase} from './helpers/historical-deployment-schema-fixture.mjs';
import {loadBundle,probeSql,readbackSql,classifyProbe,classifyState,buildApplySql,deploy,PROJECT,MIGRATION,PREDECESSORS} from '../scripts/google-refund-tax-social-exact-deploy.mjs';

test('local PostgreSQL replay preserves exact social catalog across refund install, rollback and lost response', {timeout:300000},async t=>{
  const bundle=loadBundle(),paths=[...PREDECESSORS.map(p=>`supabase/migrations/${p.version}_${p.name}.sql`),...bundle.social.map(p=>p.path)];
  const excluded=[MIGRATION,...paths,'supabase/migrations/20261105010859_sandbox_cashout_status_notifications.sql',
    'supabase/migrations/20261102093836_creator_clip_export_bounded_pool.sql','supabase/migrations/20261102094308_creator_clip_scale_lifecycle_ledger.sql'].map(p=>path.basename(p));
  const {db}=await createHistoricalDeploymentDatabase({implicitApiGrants:false,excludeMigrations:excluded});t.after(()=>db.close());
  await db.exec(`set search_path=pg_catalog,public;
    create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
    insert into supabase_migrations.schema_migrations values('20261101215711','synthetic_fixture_predecessor',array['select 1;']);
    update public.platform_money_kill_switches set state=case when key in ('live_money_enabled','payouts_enabled','cashout_enabled') then 'off' else 'sandbox_only' end
      where key in ('live_money_enabled','payouts_enabled','cashout_enabled','stripe_connect_enabled','tips_enabled','creator_monetization_enabled','provider_webhooks_enabled','revenuecat_app_store_enabled','revenuecat_google_play_enabled');
    update private.discovery_invalidation_worker_config set enabled=true,collecting=true,primary_delivery_enabled=true,token_sha256=repeat('0',64);
    create role supabase_read_only_user bypassrls;grant usage on schema public,private,auth,supabase_migrations to supabase_read_only_user;
    grant select on all tables in schema public,private,auth,supabase_migrations to supabase_read_only_user;`);
  const read=async(sql=readbackSql())=>{await db.exec('set session authorization supabase_read_only_user;begin read only;');
    try{return (await db.exec(sql)).at(-1).rows[0].state;}finally{await db.exec('rollback;set session authorization postgres;');}};
  const original=await read(probeSql());
  for(const [i,p] of [...bundle.predecessors,...bundle.social].entries()){
    const body=fs.readFileSync(paths[i],'utf8');await db.exec(body);
    await db.query('insert into supabase_migrations.schema_migrations values($1,$2,$3)',[p.version,p.name,[body]]);
  }
  await db.exec('grant select on all tables in schema public,private,auth,supabase_migrations to supabase_read_only_user;');
  const before=await read(),local={...bundle,manifest:{...bundle.manifest,originalHistory:{count:1,maximum:'20261101215711',sha256:original.originalHistorySha256}}};
  assert.equal(before.socialCatalogSha256,bundle.manifest.socialCatalogSha256,'social target matches separately frozen source catalog');
  assert.equal(classifyProbe(local,before),'post_social_requires_independent_requalification');assert.ok(before.holds);
  local.manifest.qualification='independently_reviewed_social_successor';
  local.manifest.postPredecessorBaseline={historyCount:6,historyMaximum:'20261107191000',historySha256:before.priorHistorySha256,
    catalogSha256:before.catalogSha256,dataSha256:before.dataSha256,socialCatalogSha256:before.socialCatalogSha256,observedAt:'2026-11-08T00:00:00Z',
    revenuecat:{project:PROJECT,status:'ACTIVE',name:'revenuecat-webhook',version:94,verifyJwt:false,files:bundle.revenuecatExpected.files}};
  const sql=buildApplySql(local,before);
  await db.exec('begin;revoke execute on function public.read_comment_likes_batch(text,uuid[]) from anon;');
  await assert.rejects(db.exec(sql),/refund_deploy_baseline_changed/);await db.exec('rollback');assert.deepEqual(await read(),before);
  const malformed=sql.replace(local.manifest.addedCatalogSha256,'f'.repeat(64));assert.notEqual(malformed,sql);
  await assert.rejects(db.exec(malformed),/refund_deploy_postcheck_failed/);await db.exec('rollback');assert.deepEqual(await read(),before);
  let writes=0;
  const result=await deploy({bundle:local,apply:true,recheckSource:()=>{},verifyPrerequisiteEdge:async()=>local.manifest.postPredecessorBaseline.revenuecat,
    query:async(statement,readOnly)=>{if(readOnly)return read(statement);writes++;await db.exec(statement);throw Error('lost transport response');}});
  assert.equal(result.status,'applied_verified');assert.equal(result.responseConfirmed,false);assert.equal(writes,1);
  const after=await read();assert.equal(classifyState(local,after),'applied');
  for(const key of ['catalogSha256','socialCatalogSha256','dataSha256','priorHistorySha256','originalHistorySha256'])assert.equal(after[key],before[key],key);
  assert.equal(after.historyCount,7);assert.equal(after.historyMaximum,'20261107191000');
});
