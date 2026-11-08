import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHistoricalDeploymentDatabase} from './helpers/historical-deployment-schema-fixture.mjs';
import * as legacy from '../scripts/sandbox-payout-notification-exact-deploy.mjs';
import {loadBundle,readbackSql,classifyState,buildApplySql,deploy as rawDeploy,expectedSocialForeignKeys,lockTables,VERSION,NAME,HASH,MIGRATION} from '../scripts/sandbox-payout-notification-social588-deploy.mjs';
import {loadBundle as loadSocial} from '../scripts/social-engagement-exact-deploy.mjs';
const bundle=loadBundle();
// Synthetic query tests supply an explicit source witness, never a production
// default. Missing/rejected source validation is tested on the raw API below.
const deploy=options=>rawDeploy({recheckSource:()=>{},...options});
const context={currentPostgres:false,currentReadOnly:true,sessionPostgres:false,sessionReadOnly:true,sessionAdmin:false,transactionReadOnly:true};
const ready=()=>({...structuredClone(bundle.manifest.baseline),context,
 historyCount:588,priorHistorySHA256:bundle.manifest.baselineHistory.sha256,observerHistory:[],
 catalog:structuredClone(bundle.beforeCatalog),invariantsSha256:bundle.manifest.baselineInvariantsSha256,
 hooksSha256:bundle.manifest.baselineHooksSha256,socialHistory:structuredClone(bundle.socialHistory),
 socialCatalogSha256:bundle.manifest.socialCatalogSha256,socialForeignKeys:expectedSocialForeignKeys(),
 cronReadCapability:true,writeCapabilities:lockTables(bundle).map(table=>({table,canLock:true}))});
const applied=()=>({...ready(),historyCount:589,catalog:structuredClone(bundle.afterCatalog),observerHistory:[{version:VERSION,name:NAME,statementsSHA256:bundle.statementsSha256}]});
test('social588 is an explicit additive successor; immutable observer and legacy586 remain unchanged',()=>{
 assert.equal(bundle.body,legacy.loadBundle().body);assert.equal(HASH,legacy.HASH);
 assert.equal(legacy.loadBundle().manifest.baselineHistory.count,586);
 assert.equal(classifyState(bundle,ready()),'ready');assert.equal(classifyState(bundle,applied()),'applied');
 assert.equal(expectedSocialForeignKeys().length,32);
 assert.equal(lockTables(bundle).length,26);assert.ok(!lockTables(bundle).includes('cron.job'));
 assert.match(buildApplySql(bundle,ready()),/integer=588/);assert.match(buildApplySql(bundle,ready()),/integer=589/);
});
test('old, partial, extra or drifted social state cannot authorize a write',async()=>{
 for(const mutate of [s=>s.historyCount--,s=>s.socialHistory.pop(),s=>s.socialHistory[0].statementsSHA256='0'.repeat(64),
 s=>s.socialCatalogSha256='0'.repeat(64),s=>s.socialForeignKeys[0][5]='D',s=>s.socialForeignKeys.pop(),
 s=>s.invariantsSha256='0'.repeat(64),s=>s.moneySwitches.payouts_enabled='on',s=>s.cronReadCapability=false]){
  const state=ready();mutate(state);let writes=0;
  await assert.rejects(deploy({bundle,apply:true,query:async(_sql,readOnly)=>{if(!readOnly)writes++;return state;}}));assert.equal(writes,0);
 }
});
test('uncertain successor writes reconcile once and never resubmit',async()=>{
 for(const result of [ready(),applied(),null]){const calls=[];
  const outcome=await deploy({bundle,apply:true,query:async(_sql,readOnly)=>{calls.push(readOnly);if(calls.length===1)return ready();if(!readOnly)throw Error('unknown');if(!result)throw Error('read failed');return result;}});
  assert.deepEqual(calls,[true,false,true]);assert.equal(outcome.status,result?.historyCount===589?'applied_verified':'apply_unconfirmed');
 }
 let calls=0;assert.equal((await deploy({bundle,apply:true,query:async(_sql,readOnly)=>{assert.equal(readOnly,true);calls++;return applied();}})).wrote,false);assert.equal(calls,1);
});
test('missing or asynchronously rejected source validation prevents every write',async()=>{
 for(const recheckSource of [undefined,async()=>{await Promise.resolve();throw Error('source changed');}]){
  let writes=0;
  await assert.rejects(rawDeploy({bundle,apply:true,recheckSource,query:async(_sql,readOnly)=>{if(!readOnly)writes++;return ready();}}));
  assert.equal(writes,0);
 }
 const calls=[];
 const outcome=await rawDeploy({bundle,apply:true,recheckSource:async()=>{await Promise.resolve();calls.push('source checked');},query:async(_sql,readOnly)=>{
  calls.push(readOnly?'read':'write');return calls.length===1?ready():applied();
 }});
 assert.deepEqual(calls,['read','source checked','write','read']);assert.equal(outcome.status,'applied_verified');
});
test('actual SQL derives social588 from historical586 without adopting a new production hash', {timeout:300000},async t=>{
 const b=structuredClone(bundle),social=loadSocial();
 const {db}=await createHistoricalDeploymentDatabase({implicitApiGrants:false,excludeMigrations:[MIGRATION.split('/').at(-1)]});t.after(()=>db.close());
 await db.exec(`create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text not null primary key,statements text[],name text,created_by text,idempotency_key text unique,rollback text[]);
 insert into supabase_migrations.schema_migrations(version,name,statements) select (20000000000000+i)::text,'synthetic_'||i,array['select 1;'] from generate_series(1,585) i;
 create role supabase_read_only_user bypassrls;grant pg_read_all_data to supabase_read_only_user;
 grant select on public.notification_preferences to anon;`);
 const predecessor=fs.readFileSync('supabase/migrations/20261102194000_sandbox_creator_cashout_execution.sql','utf8');
 await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',['20261102194000','sandbox_creator_cashout_execution',[predecessor]]);
 const read=async(sql=readbackSql(b))=>{
  await db.exec('set session authorization supabase_read_only_user;begin read only;');
  try{return(await db.exec(sql)).at(-1).rows[0].state;}finally{await db.exec('rollback;set session authorization postgres;');}
 };
 const original=await read(legacy.readbackSql(legacy.loadBundle()));
 // Only this disposable synthetic fixture adopts its independently built586
 // state. Production manifest retains its original reviewed digest unchanged.
 b.manifest.baseline=Object.fromEntries(Object.keys(b.manifest.baseline).map(k=>[k,original[k]]));
 b.manifest.baselineHistory.sha256=original.priorHistorySHA256;
 b.manifest.baselineInvariantsSha256=original.invariantsSha256;b.manifest.baselineHooksSha256=original.hooksSha256;
 b.beforeCatalog=original.catalog;
 for(const migration of social.migrations){await db.exec(migration.body);await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[migration.version,migration.name,[migration.body]]);}
 const before=await read();
 assert.equal(before.historyCount,588);assert.equal(before.priorHistorySHA256,original.priorHistorySHA256);
 assert.equal(before.invariantsSha256,original.invariantsSha256,'exact additive projection recovers original586 invariant, not observed588 hash');
 assert.deepEqual(before.catalog,original.catalog);assert.deepEqual(before.socialForeignKeys,expectedSocialForeignKeys());
 // The social catalog has already been independently qualified by its own
 // deployment tests. Fixture helper definitions may differ from production.
 assert.equal(before.socialCatalogSha256,b.manifest.socialCatalogSha256);
 b.afterCatalog=(await db.exec(`begin;${b.body}${readbackSql(b)}rollback;`)).at(-2).rows?.[0]?.state?.catalog;
 assert.ok(b.afterCatalog);
 assert.equal(classifyState(b,before),'ready');const sql=buildApplySql(b,before);
 for(const mutation of ["alter function public.set_comment_like(text,uuid,boolean) security invoker;",
  'alter table video_engagement_private.likes disable trigger all;',
  "update supabase_migrations.schema_migrations set name='wrong' where version='20261107191000';"]){
  await db.exec('begin;'+mutation);const drift=(await db.exec(readbackSql(b))).at(-1).rows[0].state;drift.context=context;assert.throws(()=>classifyState(b,drift));await db.exec('rollback');
 }
 const failure=sql.replace('insert into supabase_migrations.schema_migrations',"perform 1/0; insert into supabase_migrations.schema_migrations");
 await assert.rejects(db.exec(failure));await db.exec('rollback');assert.equal(classifyState(b,await read()),'ready');
 for(const change of ['alter table video_engagement_private.likes disable trigger all;',
  'alter function public.set_comment_like(text,uuid,boolean) security invoker;']){
  const postDrift=sql.replace('insert into supabase_migrations.schema_migrations',change+' insert into supabase_migrations.schema_migrations');
  await assert.rejects(db.exec(postDrift),/observer_postcheck_failed/);await db.exec('rollback');assert.equal(classifyState(b,await read()),'ready');
 }
 await db.exec(sql);assert.equal(classifyState(b,await read()),'applied');
});
