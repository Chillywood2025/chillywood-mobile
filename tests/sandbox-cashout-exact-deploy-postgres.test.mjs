import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';
import {loadBundle,readbackSql,seedReadbackSql,classifyState,buildApplySql,deploy,MANIFEST,MIGRATION,VERSION,NAME,PROJECT} from '../scripts/sandbox-cashout-exact-deploy.mjs';
import {TABLES,FUNCTIONS,TRIGGERS,AUTHENTICATED_FUNCTIONS,SERVICE_FUNCTIONS} from '../scripts/sandbox-cashout-deployment-contract.mjs';
import {VERSION as TIP_VERSION,NAME as TIP_NAME,HASH as TIP_HASH,MIGRATION as TIP_MIGRATION} from '../scripts/native-tip-exact-deploy.mjs';
import {VERSION as INGRESS_VERSION,NAME as INGRESS_NAME,HASH as INGRESS_HASH,MIGRATION as INGRESS_MIGRATION} from '../scripts/native-ingress-exact-deploy.mjs';
import {loadHistoricalCashoutBundle,POST_BASELINE_AUTOMATIC_COMMERCE_MIGRATIONS} from './helpers/sandbox-cashout-historical-deployment-fixture.mjs';

test('synthetic live-era replay proves exact dormant transaction, schema/ACL drift and rollback',{timeout:300000},async t=>{
 const committedBundle=loadHistoricalCashoutBundle(),committedManifestBytes=fs.readFileSync(MANIFEST,'utf8');
 assert.throws(()=>loadBundle(),/EDGE_HASH_MISMATCH/,'historical schema tests cannot qualify the changed working-tree engine');
 t.after(()=>{
  assert.equal(fs.readFileSync(MANIFEST,'utf8'),committedManifestBytes,'synthetic qualification must not change the real manifest');
  assert.deepEqual(loadHistoricalCashoutBundle().manifest,committedBundle.manifest);
 });
 const bundle=structuredClone(committedBundle);
 bundle.manifest.qualification={status:'unqualified',reason:'Synthetic negative-test fixture only.',observedAt:null,baseline:null,predecessorReceipts:[]};
 assert.equal(bundle.manifest.qualification.status,'unqualified');
 const {db,replayReport}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false,excludeMigrations:[
  path.basename(MIGRATION),path.basename(TIP_MIGRATION),path.basename(INGRESS_MIGRATION),
  '20261102093836_creator_clip_export_bounded_pool.sql','20261102094308_creator_clip_scale_lifecycle_ledger.sql',
  '20261104120922_google_refund_tax_history_checkpoints.sql',
  '20261105010859_sandbox_cashout_status_notifications.sql', // Keep this later observer out of the original deployment checkpoint.
  ...POST_BASELINE_AUTOMATIC_COMMERCE_MIGRATIONS, // Depend on the intentionally absent sandbox predecessor.
 ]});t.after(()=>db.close());
 for(const migration of POST_BASELINE_AUTOMATIC_COMMERCE_MIGRATIONS)assert.ok(!replayReport.files.includes(migration),'replay remains at the historical deployment boundary');
 await db.exec(`create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
  insert into supabase_migrations.schema_migrations select (20000000000000+i)::text,'synthetic_predecessor_'||i,array['select 1;'] from generate_series(1,582) i;
  insert into supabase_migrations.schema_migrations values('20261101215711','synthetic_last_predecessor',array['select 1;']);
  update public.platform_money_kill_switches set state=case when key in ('live_money_enabled','payouts_enabled','cashout_enabled') then 'off' else 'sandbox_only' end
   where key in ('live_money_enabled','payouts_enabled','cashout_enabled','stripe_connect_enabled','tips_enabled','creator_monetization_enabled','provider_webhooks_enabled','revenuecat_app_store_enabled','revenuecat_google_play_enabled');
  update private.discovery_invalidation_worker_config set enabled=true,collecting=true,primary_delivery_enabled=true,token_sha256=repeat('a',64);
  create role supabase_read_only_user bypassrls;grant pg_read_all_data to supabase_read_only_user;
  create view public.sandbox_deploy_existing_view as select 1::integer value;
  create role sandbox_fixture_parent;create role sandbox_fixture_child;
  grant sandbox_fixture_parent to sandbox_fixture_child with inherit true,set true;`);
 const read=async(sql=readbackSql(bundle))=>{
  await db.exec('set session authorization supabase_read_only_user;begin read only;');
  try{return (await db.exec(sql)).at(-1).rows[0].state;}
  finally{await db.exec('rollback;set session authorization postgres;');}
 };
 // Synthetic history is never promoted to the production manifest. The test
 // supplies its independently observed local digest directly to exported logic.
 const beforeTip=await read();bundle.originalHistorySha256=beforeTip.originalHistorySha256;
 assert.equal(beforeTip.historyCount,583);assert.equal(beforeTip.controls,true);
 assert.equal(classifyState(bundle,beforeTip),'blocked_until_exact_tip_deployment');
 await db.exec(bundle.ingress.tip.body);
 await db.query('insert into supabase_migrations.schema_migrations values($1,$2,$3)',[TIP_VERSION,TIP_NAME,[bundle.ingress.tip.body]]);
 assert.equal(classifyState(bundle,await read()),'blocked_until_exact_native_ingress_deployment');
 await db.exec(bundle.ingress.body);
 await db.query('insert into supabase_migrations.schema_migrations values($1,$2,$3)',[INGRESS_VERSION,INGRESS_NAME,[bundle.ingress.body]]);
 const before=await read();assert.equal(before.ingress,true);assert.equal(before.tip,true);
 assert.equal(classifyState(bundle,before),'unqualified_post_predecessor_baseline');
 let writes=0;
 await assert.rejects(deploy({bundle,apply:true,query:async(_sql,readOnly)=>{if(!readOnly)writes++;return before;}}),/SANDBOX_BASELINE_UNQUALIFIED/);
 assert.equal(writes,0);

 // Independently execute immutable SQL inside a rolled-back local rehearsal,
 // then verify the concrete catalog rather than treating a name count as proof.
 await db.exec('begin;');await db.exec(bundle.body);
 const probe=(await db.exec(readbackSql(bundle))).at(-1).rows[0].state;
 assert.equal(probe.addedCatalogSha256,bundle.manifest.addedCatalogSha256,'independently measured expected added catalog remains exact');
 assert.equal(probe.addedInventory,true);
 assert.equal(probe.existingCatalogSha256,before.existingCatalogSha256,'only the exact additions, including their FK RI triggers, leave old catalog unchanged');
 assert.equal(probe.sourceDataSha256,before.sourceDataSha256);
 assert.equal(probe.guardedDataSha256,before.guardedDataSha256);
 assert.equal((await db.exec(seedReadbackSql)).at(-1).rows[0].state.dormantSeed,true);
 const tableRows=(await db.query(`select n.nspname||'.'||c.relname name,c.relowner::regrole::text owner,c.relrowsecurity rls,c.relforcerowsecurity force,
  has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') anon_access,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') auth_access,
  has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') service_access
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname like 'sandbox_cashout_%' and c.relkind='r' order by 1`)).rows;
 assert.deepEqual(tableRows.map(x=>x.name).sort(),[...TABLES].sort());
 for(const row of tableRows)assert.deepEqual([row.owner,row.rls,row.force,row.anon_access,row.auth_access,row.service_access],['postgres',true,true,false,false,false]);
 assert.equal((await db.query("select count(*)::int n from pg_index where indrelid in(select oid from pg_class where relnamespace='private'::regnamespace and relname like 'sandbox_cashout_%')")).rows[0].n,17);
 for(const signature of FUNCTIONS){
  const row=(await db.query(`select p.proowner::regrole::text owner,p.proconfig,p.prosecdef,
   has_function_privilege('anon',p.oid,'EXECUTE') anon_access,has_function_privilege('authenticated',p.oid,'EXECUTE') auth_access,has_function_privilege('service_role',p.oid,'EXECUTE') service_access
   from pg_proc p where p.oid=to_regprocedure($1)`,[signature])).rows[0];
  assert.equal(row.owner,'postgres');assert.deepEqual(row.proconfig,['search_path=""']);
  assert.deepEqual([row.anon_access,row.auth_access,row.service_access],[false,AUTHENTICATED_FUNCTIONS.includes(signature),SERVICE_FUNCTIONS.includes(signature)]);
  if(signature.startsWith('public.'))assert.equal(row.prosecdef,true);
 }
 for(const trigger of TRIGGERS)assert.equal((await db.query('select count(*)::int n from pg_trigger where tgrelid=to_regclass($1) and tgname=$2 and not tgisinternal and tgenabled=\'O\'',[trigger.table,trigger.name])).rows[0].n,1);
 await db.exec('rollback;');
 const receipt=(version,name,migrationSha256,appliedAt)=>({project:PROJECT,version,name,migrationSha256,appliedAt,status:'applied_verified',source:'1'.repeat(40),tree:'2'.repeat(40)});
 const local={...bundle,manifest:{...bundle.manifest,addedCatalogSha256:probe.addedCatalogSha256,qualification:{status:'qualified',observedAt:'2026-11-04T12:03:00Z',
  predecessorReceipts:[receipt(TIP_VERSION,TIP_NAME,TIP_HASH,'2026-11-04T12:01:00Z'),receipt(INGRESS_VERSION,INGRESS_NAME,INGRESS_HASH,'2026-11-04T12:02:00Z')],
  baseline:{historyCount:585,historyMaximum:TIP_VERSION,originalHistorySha256:before.originalHistorySha256,predecessorHistorySha256:before.predecessorHistorySha256,existingCatalogSha256:before.existingCatalogSha256,guardedDataSha256:before.guardedDataSha256}}}};
 assert.equal(classifyState(local,before),'ready');
 const sql=buildApplySql(local,before);
 assert.match(sql,/lock_timeout='5s'/);assert.match(sql,/statement_timeout='45s'/);
 assert.match(sql,/lock table [^;]*public\.merch_orders[^;]*public\.money_access_ledger_events/);
 await db.exec('create or replace view public.sandbox_deploy_existing_view as select 2::integer value');
 const viewDrift=await read();assert.throws(()=>classifyState(local,viewDrift),/BASELINE_CONTRACT_MISMATCH/);
 await assert.rejects(db.exec(sql),/sandbox_baseline_changed/);await db.exec('rollback');
 await db.exec('create or replace view public.sandbox_deploy_existing_view as select 1::integer value');
 await db.exec('alter view public.sandbox_deploy_existing_view set (security_invoker=true)');
 const viewSecurityDrift=await read();assert.throws(()=>classifyState(local,viewSecurityDrift),/BASELINE_CONTRACT_MISMATCH/);
 await db.exec('alter view public.sandbox_deploy_existing_view reset (security_invoker)');
 await db.exec('grant sandbox_fixture_parent to sandbox_fixture_child with inherit false');
 const inheritDrift=await read();assert.throws(()=>classifyState(local,inheritDrift),/BASELINE_CONTRACT_MISMATCH/);
 await db.exec('grant sandbox_fixture_parent to sandbox_fixture_child with inherit true,set false');
 const setRoleDrift=await read();assert.throws(()=>classifyState(local,setRoleDrift),/BASELINE_CONTRACT_MISMATCH/);
 await db.exec('grant sandbox_fixture_parent to sandbox_fixture_child with set true');
 await db.exec('alter table public.merch_orders add column fixture_unexpected boolean');
 await assert.rejects(db.exec(sql),/sandbox_baseline_changed/);await db.exec('rollback');
 await db.exec('alter table public.merch_orders drop column fixture_unexpected');
 assert.equal(classifyState(local,await read()),'ready');
 const wrongSource=buildApplySql(local,{...before,sourceDataSha256:'0'.repeat(64)});
 await assert.rejects(db.exec(wrongSource),/sandbox_baseline_changed/);await db.exec('rollback');
 const corrupted=sql.replace('force row level security','disable row level security');
 await assert.rejects(db.exec(corrupted),/sandbox_postcheck_failed/);await db.exec('rollback');
 assert.equal(classifyState(local,await read()),'ready');
 assert.equal((await db.query('select count(*)::int n from supabase_migrations.schema_migrations where version=$1',[VERSION])).rows[0].n,0);
 await db.exec(sql);
 const after=await read();assert.equal(classifyState(local,after),'applied');
 assert.equal(after.historyCount,586);assert.equal(after.historyMaximum,TIP_VERSION);
 assert.equal(after.existingCatalogSha256,before.existingCatalogSha256);assert.equal(after.sourceDataSha256,before.sourceDataSha256);
 assert.equal((await read(seedReadbackSql)).dormantSeed,true);
 const ledger=(await db.query('select version,name,statements from supabase_migrations.schema_migrations where version=$1',[VERSION])).rows[0];
 assert.deepEqual(ledger,{version:VERSION,name:NAME,statements:[bundle.body]});
 const query=async(querySQL,readOnly)=>{assert.equal(readOnly,true);return read(querySQL);};
 assert.equal((await deploy({bundle:local,apply:true,query})).status,'already_applied_verified');
 await db.exec('grant select on private.sandbox_cashout_qualifications to service_role');
 const grantDrift=await read();assert.throws(()=>classifyState(local,grantDrift),/FINAL_CATALOG_MISMATCH/);
 await db.exec('revoke select on private.sandbox_cashout_qualifications from service_role');
 for(const mutation of [
  'alter table private.sandbox_cashout_qualifications alter column verified_at drop not null',
  'alter table private.sandbox_cashout_qualifications add constraint fixture_expiry_finite check(isfinite(expires_at))',
 ]){
  await db.exec('begin;');
  try{
   await db.exec(mutation);
   const drift=(await db.exec(readbackSql(bundle))).at(-1).rows[0].state;
   drift.context={...after.context};
   assert.throws(()=>classifyState(local,drift),/FINAL_CATALOG_MISMATCH/);
  }finally{await db.exec('rollback;');}
  assert.equal(classifyState(local,await read()),'applied');
 }
 const internal=(await db.query("select tgname,tgrelid::regclass::text relation from pg_trigger where tgisinternal and tgconstraint in(select oid from pg_constraint where conrelid='private.sandbox_cashout_allocations'::regclass) order by tgname limit 1")).rows[0];
 await db.exec(`alter table ${internal.relation} disable trigger "${internal.tgname.replaceAll('"','""')}"`);
 const internalDrift=await read();assert.throws(()=>classifyState(local,internalDrift),/FINAL_CATALOG_MISMATCH/);
 await db.exec(`alter table ${internal.relation} enable trigger "${internal.tgname.replaceAll('"','""')}"`);
 assert.equal(classifyState(local,await read()),'applied');
 await db.exec('update private.sandbox_cashout_control set enabled=true');
 await assert.rejects(deploy({bundle:local,query}),/DORMANT_SEED_MISMATCH/);
 await db.exec('update private.sandbox_cashout_control set enabled=false');
 await db.query("update supabase_migrations.schema_migrations set statements=array['tampered'] where version=$1",[VERSION]);
 const historyDrift=await read();assert.throws(()=>classifyState(local,historyDrift),/PARTIAL_OR_DIFFERENT_HISTORY/);
 assert.deepEqual(loadHistoricalCashoutBundle().manifest,committedBundle.manifest,'test qualification must not escape its disposable bundle');
});
