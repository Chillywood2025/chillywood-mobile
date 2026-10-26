#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {brandReferenceNativeContainer,brandNativePreflight} from './helpers/brand-reference-native-target.mjs';
import {createInstallerPsqlAdapter} from './helpers/brand-reference-installer-psql.mjs';
import {runBrandReferenceIndexInstaller,quoteLiteral as lit,quoteIdentifier as ident} from '../scripts/brand-reference-index-installer.mjs';

assert.equal(process.argv.length,2);
const prior=JSON.parse(readFileSync(new URL('../../brand-reference-index-native-guards.json',import.meta.url),'utf8'));
assert.equal(prior.status,'passed');const {container,database}=prior;
brandReferenceNativeContainer(container);assert.match(database,/^brand_guard_[0-9]+_[0-9a-f]{12}$/);
brandNativePreflight(container);
const evidence=new URL('../../brand-reference-index-installer-native.json',import.meta.url);assert.ok(!existsSync(evidence));
const sha=value=>createHash('sha256').update(value).digest('hex');
const migration='supabase/migrations/20261025141347_platform_brand_reference_candidate_indexes.sql';
assert.equal(prior.sourceHashes[migration],sha(readFileSync(new URL('../'+migration,import.meta.url))));
const report={status:'running',database,container,syntheticOnly:true,sourceSHA256:sha(readFileSync(new URL('../scripts/brand-reference-index-installer.mjs',import.meta.url))),
 checks:[],plans:[],limitations:['Synthetic PostgreSQL 17.6 multi-session construction proof; not production coverage, latency or a deployment receipt.','Invalid test indexes are retained until the owning synthetic tables are removed in final cleanup.']};
const save=()=>writeFileSync(evidence,JSON.stringify(report,null,2)+'\n');
const pass=label=>{report.checks.push(label);save();console.log('PASS '+label);};
let delayedDispatch=false,heartbeatSamples=0,observer,loseGuardOnDispatch=false,loseCommitResponse=false;
const adapter=createInstallerPsqlAdapter({container,database,
 onQuery:async({purpose,sql})=>{if(purpose==='builder'&&/^create index concurrently/.test(sql)){
  if(!delayedDispatch){delayedDispatch=true;await delay(6500);}
  if(loseGuardOnDispatch){loseGuardOnDispatch=false;const result=await observer.query("select pg_terminate_backend(pid) as terminated from pg_stat_activity where datname=current_database() and application_name='brand_index_guard';");assert.deepEqual(result.rows,[{terminated:true}]);}
 }},
 afterQuery:async({purpose,sql})=>{
  if(purpose==='guard'&&sql==='commit;'&&loseCommitResponse){loseCommitResponse=false;throw new Error('TEST_LOST_COMMIT_RESPONSE');}
  if(purpose==='guard'&&sql==="set local idle_in_transaction_session_timeout='15s';"){
  const result=await observer.query("select count(*)=1 and bool_and(backend_xmin is null) as value from pg_stat_activity where application_name='brand_index_guard' and datname=current_database();");
  assert.equal(result.rows[0].value,true);heartbeatSamples++;
 }},
});
const control=await adapter.connect({purpose:'control',applicationName:'brand_installer_test_control'});
observer=await adapter.connect({purpose:'observer',applicationName:'brand_installer_snapshot_observer'});
const scalar=async sql=>(await control.query(sql)).rows[0].value;
const prefix='brand_cic_'+randomUUID().replaceAll('-','').slice(0,12);
const tables=[prefix+'_writer',prefix+'_cancel',prefix+'_collision',prefix+'_drift',prefix+'_commit',prefix+'_guard'];
const state={};const checkpoint=async({plan,journal})=>{state.plan=plan;state.journal=journal;report.lastCheckpoint={plan,journal};save();};
const until=async(fn,label)=>{const end=Date.now()+15000;while(Date.now()<end){if(await fn())return;await delay(25);}throw new Error('WAIT_TIMEOUT_'+label);};
let writer, running;
try{
 for(const name of tables){await control.query(`create table public.${ident(name)} (id bigint, dropped text, "Odd URL 雪" text, metadata jsonb);alter table public.${ident(name)} drop column dropped;
   insert into public.${ident(name)} select n,'synthetic/'||n,jsonb_build_object('url','synthetic/'||n) from generate_series(1,3000) n;
   grant select,insert,update,delete on public.${ident(name)} to service_role;`);}
 const ids=await scalar(`select jsonb_object_agg(relname,oid::bigint) as value from pg_class where relnamespace='public'::regnamespace and relname=any(array[${tables.map(lit).join(',')}]);`);
 const plan=async name=>{const result=await runBrandReferenceIndexInstaller({adapter,targetOids:[ids[name]],checkpoint});report.plans.push(result.plan);return result;};
 const apply=(extra={})=>runBrandReferenceIndexInstaller({adapter,mode:'apply',plan:state.plan,journal:state.journal,checkpoint,...extra});
 await plan(tables[0]);assert.equal(await scalar(`select private.platform_brand_index_expression_v1(${ids[tables[0]]}) is null as value;`),true);
 writer=await adapter.connect({purpose:'writer',applicationName:'brand_installer_test_writer'});
 await writer.query(`begin;set local role service_role;insert into public.${ident(tables[0])} values(9001,'writer/commit','{}');`);
 running=apply();let observedError;running.catch(error=>{observedError=error;});
 await until(async()=>await scalar(`select exists(select 1 from pg_index where indrelid=${ids[tables[0]]} and not indisvalid) as value;`),'CIC_WAIT');
 const ddl=await adapter.connect({purpose:'ddl',applicationName:'brand_installer_test_ddl'});
 await ddl.query("set lock_timeout='200ms';");
 await assert.rejects(ddl.query(`alter table public.${ident(tables[0])} rename to ${ident(tables[0]+'_replaced')};`),error=>error.sqlstate==='55P03');await ddl.end();
 const second=await adapter.connect({purpose:'writer',applicationName:'brand_installer_second_writer'});
 await second.query(`begin;set local role service_role;insert into public.${ident(tables[0])} values(9002,'writer/rollback','{}');rollback;
   begin;set local role service_role;insert into public.${ident(tables[0])} values(9003,'writer/second','{}');commit;`);await second.end();
 // Two real production-interval heartbeats ran while command dispatch was
 // deliberately delayed, with the temp-DDL guard transaction/XID alive. Actual
 // CIC writer waits remain below the unchanged two-second lock deadline.
 assert.ok(heartbeatSamples>=2);
 assert.equal(observedError,undefined);await writer.query('commit;');await writer.end();writer=null;
 assert.equal((await running).status,'complete');running=null;
 assert.equal(await scalar(`select private.platform_brand_index_expression_v1(${ids[tables[0]]}) is not null as value;`),true);
 assert.deepEqual(await scalar(`select jsonb_agg(id order by id) as value from public.${ident(tables[0])} where id>=9001;`),[9001,9003]);
 const count=await scalar(`select count(*)::int as value from pg_index where indrelid=${ids[tables[0]]};`);assert.equal((await apply()).status,'complete');
 assert.equal(await scalar(`select count(*)::int as value from pg_index where indrelid=${ids[tables[0]]};`),count);
 pass('standalone concurrent build admits writer commit/rollback, blocks identity rename, holds no old snapshot through heartbeats and resumes without duplicate');
 const expression=state.plan.targets[0].spec.scan_expression;
 assert.equal(await scalar(`select bool_and(private.platform_brand_retention_row_mentions(to_jsonb(t),private.deleted_media_locator_columns(${ids[tables[0]]}),'writer/commit','absent')
   is not distinct from ((${expression} like '%writer/commit%' or ${expression} like '%absent%' or ${expression}='!brand-reference-exact-fallback-v1!')
   and private.platform_brand_retention_row_mentions(to_jsonb(t),private.deleted_media_locator_columns(${ids[tables[0]]}),'writer/commit','absent'))) as value from public.${ident(tables[0])} t;`),true);
 pass('registered candidate and prior exact matcher agree after concurrent writes');

 await plan(tables[1]);writer=await adapter.connect({purpose:'writer',applicationName:'brand_installer_cancel_writer'});
 await writer.query(`begin;insert into public.${ident(tables[1])} values(9001,'held','{}');`);
 running=apply();running.catch(()=>{});
 await until(async()=>await scalar(`select exists(select 1 from pg_index where indrelid=${ids[tables[1]]} and not indisvalid) as value;`),'CANCEL_BUILD');
 await control.query("select pg_cancel_backend(pid) as cancelled from pg_stat_activity where datname=current_database() and application_name='brand_index_builder';");
 await assert.rejects(running);running=null;await writer.query('rollback;');await writer.end();writer=null;
 const invalid=state.journal.tables[ids[tables[1]]].attempts[0];assert.equal(invalid.state,'invalid');assert.ok(invalid.indexOid);
 assert.equal(await scalar(`select private.platform_brand_index_expression_v1(${ids[tables[1]]}) is null as value;`),true);
 await assert.rejects(apply(),/INVALID_INDEX_REQUIRES_EXPLICIT_RESUME/);
 assert.equal((await apply({resumeInvalid:true})).status,'complete');
 const attempts=state.journal.tables[ids[tables[1]]].attempts;assert.equal(attempts.length,2);assert.equal(attempts[0].retainedInvalid,true);assert.notEqual(attempts[0].indexOid,attempts[1].indexOid);
 assert.equal(await scalar(`select not indisvalid as value from pg_index where indexrelid=${invalid.indexOid};`),true);
 pass('cancelled CIC remains invalid and unregistered; default resume rejects; explicit reconciled resume uses fresh name without deleting prior artifact');

 await plan(tables[2]);const collision=`brand_reference_v1_${ids[tables[2]]}_${state.plan.id.replaceAll('-','').slice(0,12)}_0`;
 await control.query(`create index ${ident(collision)} on public.${ident(tables[2])}(id);`);
 const collisionOid=await scalar(`select ${lit('public.'+ident(collision))}::regclass::oid as value;`);
 await assert.rejects(apply(),/FOREIGN_INDEX_NAME_COLLISION/);
 assert.equal(await scalar(`select ${lit('public.'+ident(collision))}::regclass::oid as value;`),collisionOid);
 pass('foreign name collision rejects without adopting, replacing or deleting the foreign object');
 await plan(tables[3]);await control.query(`alter table public.${ident(tables[3])} add column new_url text;`);
 await assert.rejects(apply(),/TARGET_IDENTITY_OR_SPEC_DRIFT/);
 assert.equal(await scalar(`select count(*)::int as value from pg_index where indrelid=${ids[tables[3]]};`),0);
 pass('target schema drift rejects before any real index build');

 await plan(tables[4]);loseCommitResponse=true;
 await assert.rejects(apply(),/TEST_LOST_COMMIT_RESPONSE/);
 const committed=state.journal.tables[ids[tables[4]]].attempts[0];assert.ok(committed.indexOid);assert.equal(committed.state,'built');
 assert.equal(await scalar(`select index_oid::bigint as value from private.platform_brand_reference_indexes_v1 where table_oid=${ids[tables[4]]};`),committed.indexOid);
 assert.equal((await apply()).status,'complete');
 assert.equal(await scalar(`select count(*)::int as value from pg_index where indrelid=${ids[tables[4]]};`),1);
 pass('lost COMMIT response resumes exact durable index identity and existing registration without duplicate construction');

 await plan(tables[5]);loseGuardOnDispatch=true;
 await assert.rejects(apply());
 assert.equal(await scalar(`select count(*)::int as value from private.platform_brand_reference_indexes_v1 where table_oid=${ids[tables[5]]};`),0);
 assert.equal(await scalar(`select private.platform_brand_index_expression_v1(${ids[tables[5]]}) is null as value;`),true);
 await assert.rejects(apply({resumeInvalid:true}),/UNCERTAIN_PRIOR_BUILD_REQUIRES_RECONCILIATION/);
 pass('lost identity guard cannot register; unobserved build outcome remains exact fallback and blocks automatic resume');
 report.status='passed';
}catch(error){report.status='failed';report.error=error.message;throw error;}
finally{
 if(writer){await writer.query('rollback;').catch(()=>{});await writer.end();}
 if(running)await running.catch(()=>{});
 for(const table of tables)await control.query(`delete from private.platform_brand_reference_indexes_v1 where table_oid=to_regclass(${lit('public.'+ident(table))});drop table if exists public.${ident(table)};`);
 await adapter.closeAll();save();
}
