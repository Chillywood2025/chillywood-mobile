#!/usr/bin/env node
// Narrow immutable-helper guard component proof. --pglite is supplementary;
// only --native can establish native PostgreSQL event/privilege behavior.
// Never targets the retained large fixture or any network database.
// The migration's checker lives in extensions so it survives private cascades.
// Historical failed private-schema evidence remains separate from this run.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {brandReferenceNativeContainer,brandNativeSpawnSync,brandNativePreflight} from './helpers/brand-reference-native-target.mjs';

const mode=process.argv[2];
assert.ok(['--pglite','--pglite-cascade-repair','--native'].includes(mode));
assert.equal(process.argv.length,3);
const pglite=mode==='--pglite'||mode==='--pglite-cascade-repair';
const root=fileURLToPath(new URL('../',import.meta.url));
const evidence=fileURLToPath(new URL('../../',import.meta.url));
const migration='supabase/migrations/20261025141347_platform_brand_reference_candidate_indexes.sql';
const source=readFileSync(root+migration,'utf8');
const fragmentPath=root+'tests/fixtures/brand-reference-normalized-ddl-guard-candidate.sql';
const guardStart='-- BEGIN immutable normalized helper DDL safeguard';
const guardEnd='-- END immutable normalized helper DDL safeguard';
const guard=source.includes(guardStart)
 ?source.slice(source.indexOf(guardStart),source.indexOf(guardEnd)+guardEnd.length)
 :readFileSync(fragmentPath,'utf8');
const helpers=source.slice(source.indexOf('create function private.platform_brand_index_jsonb_bytes_v1'),
 source.indexOf(source.includes(guardStart)?guardStart:'-- IMMUTABLE_HELPER_GUARD_INSTALLATION'));
assert.ok(helpers.includes('grant execute on function'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const lit=value=>`'${String(value).replaceAll("'","''")}'`;
const reportPath=evidence+`brand-reference-normalized-ddl-${mode.slice(2)}.json`;
assert.ok(!existsSync(reportPath),'Preserve the existing result; reconcile it before a new run.');
const report={status:'running',mode:mode.slice(2),startedAt:new Date().toISOString(),syntheticOnly:true,
 sourceSHA256:sha(source),guardSHA256:sha(guard),harnessSHA256:sha(readFileSync(new URL(import.meta.url))),checks:[],
 guardIntegratedInMigration:source.includes(guardStart),candidateReadiness:'current_source_component_validation',
 limitations:['Component fixture only; no Brand full-schema or end-to-end timing evidence.',
  'The report records current source bytes; component proof alone does not establish publication readiness.',
  'No protection is claimed after privileged removal/disablement of the guard or a cascade including its extensions namespace.',
  'Native writer/DDL concurrency requires separate multi-backend coverage.']};
const checkpoint=phase=>{report.phase=phase;report.updatedAt=new Date().toISOString();writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(`${report.updatedAt} ${phase}`);};
let db;
const container=pglite?null:brandReferenceNativeContainer();
const database=`brand_normalized_ddl_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}`;
const docker=(args,input)=>brandNativeSpawnSync(args,{input,encoding:'utf8',maxBuffer:4*1024*1024,timeout:15000});
const nativeArgs=databaseName=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1',
 '-h','/tmp','-U','postgres','-d',databaseName];
const checkNative=result=>{assert.equal(result.status,0,result.stderr||result.error?.message);return result.stdout.trim();};
const q=async sql=>{
 if(pglite){
  const results=await db.exec(sql);
  return results.flatMap(result=>result.rows??[]).map(row=>String(Object.values(row)[0])).join('\n');
 }
 return checkNative(docker(nativeArgs(database),"set statement_timeout='10s';set lock_timeout='5s';\n"+sql));
};
const snapshot=async()=>JSON.parse(await q(`select coalesce(jsonb_object_agg(p.oid::text,
 (to_jsonb(p)-'proacl')||jsonb_build_object('namespace_name',n.nspname,
 'acl',(select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable)
  order by a.grantor,a.grantee,a.privilege_type,a.is_grantable)
  from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a))),'{}'::jsonb)::text
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where p.oid=any(array[${report.protectedOids?.join(',')??''}]::oid[]);`));
const pass=label=>{report.checks.push(label);checkpoint('PASS '+label);};
const rejects=async(label,sql)=>{
 await q(`do $test$ begin
   begin
     execute ${lit(sql)};
     raise exception using errcode='P0001',message='guard_did_not_reject: ${label.replaceAll("'","''")}';
   exception when sqlstate '55000' then
     if sqlerrm<>'brand_index_helper_immutable' then raise; end if;
   end;
 end $test$;`);
 assert.deepEqual(await snapshot(),report.initialCatalog,`atomic rollback: ${label}`);
 pass(label+' rejected atomically with 55000 / brand_index_helper_immutable');
};

try{
 checkpoint('create small disposable guard component fixture');
 if(pglite){
  db=new PGlite();await db.waitReady;
  report.limitations.push('PGlite/WASM does not establish native server runtime, native concurrency, or managed installer capability.');
 }else{
  assert.match(container??'',/^brand-ref-perf-[a-z0-9-]+$/);
  report.runtime=brandNativePreflight(container);
  checkNative(docker(nativeArgs('postgres'),`create database ${database};`));
  report.fixture={container,database,socket:'/tmp',retained:true};
 }
 await q(`create schema private;create schema extensions;create schema brand_ddl_destination;
 do $$ begin create role anon;exception when duplicate_object then null;end $$;
 do $$ begin create role authenticated;exception when duplicate_object then null;end $$;
 do $$ begin create role service_role;exception when duplicate_object then null;end $$;
 create role brand_ddl_helper_owner;
 ${helpers}
 alter function private.platform_brand_index_jsonb_bytes_v1(jsonb) owner to brand_ddl_helper_owner;
 alter function private.platform_brand_index_normalize_v1(text) owner to brand_ddl_helper_owner;
 ${guard}`);
 report.nativeVersion=await q('select version();');
 report.protectedOids=JSON.parse(await q(`select json_build_array(
 'private.platform_brand_index_jsonb_bytes_v1(jsonb)'::regprocedure::oid,
 'private.platform_brand_index_normalize_v1(text)'::regprocedure::oid)::text;`));
 report.initialCatalog=await snapshot();
 report.installedBodySHA256=Object.fromEntries(Object.values(report.initialCatalog).map(p=>[p.proname,sha(p.prosrc)]));
 report.guardDefinition=JSON.parse(await q(`select to_json(pg_get_functiondef('extensions.guard_platform_brand_index_helper_ddl_v1()'::regprocedure))::text;`));
 report.guardBodySHA256=sha(JSON.parse(await q(`select to_json(prosrc)::text from pg_proc where oid='extensions.guard_platform_brand_index_helper_ddl_v1()'::regprocedure;`)));
 assert.deepEqual(JSON.parse(await q(`select json_build_object('securityDefiner',prosecdef,'volatile',provolatile,'parallel',proparallel,
 'anonExecute',has_function_privilege('anon',oid,'EXECUTE'),
 'authenticatedExecute',has_function_privilege('authenticated',oid,'EXECUTE'),
 'serviceExecute',has_function_privilege('service_role',oid,'EXECUTE'),'config',proconfig)::text
 from pg_proc where oid='extensions.guard_platform_brand_index_helper_ddl_v1()'::regprocedure;`)),
 {securityDefiner:false,volatile:'v',parallel:'u',anonExecute:false,authenticatedExecute:false,serviceExecute:false,config:['search_path=""']});
 assert.equal(await q(`select count(*) from pg_event_trigger where evtfoid='extensions.guard_platform_brand_index_helper_ddl_v1()'::regprocedure and evtenabled='O' and evtevent in ('ddl_command_end','sql_drop');`),'2');
 pass('guard compiles as private invoker/volatile/parallel-unsafe with two enabled events');
 await q(`create table public.brand_ddl_guard_rows(id integer primary key, document text);
 create index brand_ddl_guard_rows_normalized on public.brand_ddl_guard_rows(private.platform_brand_index_normalize_v1(document));
 insert into public.brand_ddl_guard_rows values(1,'x%252Fy');
 create function private.brand_unrelated_ddl_fixture() returns integer language sql immutable as 'select 1';`);
 assert.equal(await q(`select count(*) from public.brand_ddl_guard_rows where private.platform_brand_index_normalize_v1(document)='x/y';`),'1');
 pass('dependent expression index and encoded row are installed under the guard');

 const fn='private.platform_brand_index_normalize_v1(text)';
 for(const [label,sql] of [
  ['replace normalizer body',`create or replace function private.platform_brand_index_normalize_v1(p_text text) returns text language plpgsql immutable security invoker called on null input parallel unsafe cost 100 set search_path='' as $$begin return 'changed';end$$`],
  ['replace size body',`create or replace function private.platform_brand_index_jsonb_bytes_v1(p_value jsonb) returns bigint language plpgsql immutable security invoker called on null input parallel unsafe cost 100 set search_path='' as $$begin return 1;end$$`],
  ['alter volatility',`alter function ${fn} stable`],
  ['alter strictness',`alter function ${fn} strict`],
  ['alter security mode',`alter function ${fn} security definer`],
  ['alter parallel mode',`alter function ${fn} parallel safe`],
  ['alter cost',`alter function ${fn} cost 1`],
  ['alter search path',`alter function ${fn} set search_path='public'`],
  ['rename helper',`alter function ${fn} rename to changed_brand_normalizer`],
  ['move helper schema',`alter function ${fn} set schema brand_ddl_destination`],
  ['change helper owner',`alter function ${fn} owner to authenticated`],
  ['revoke helper PUBLIC execution',`revoke execute on function ${fn} from public`],
  ['batched revoke across private schema',`revoke all on all functions in schema private from public`],
  ['batched explicit grant',`grant execute on function ${fn},private.brand_unrelated_ddl_fixture() to authenticated`],
  ['rename private schema',`alter schema private rename to private_changed`],
  ['drop helper with dependent index',`drop function ${fn} cascade`],
  ['drop helper via DROP ROUTINE',`drop routine ${fn} cascade`],
 ])await rejects(label,sql);

 await rejects('change-write-restore cannot enter changed state',`do $attempt$ begin
  execute 'alter function ${fn} stable';
  insert into public.brand_ddl_guard_rows values(2,'would-be-stale');
  execute 'alter function ${fn} immutable';
 end $attempt$`);
 assert.equal(await q('select count(*) from public.brand_ddl_guard_rows;'),'1');
 pass('rejected helper change leaves rows and dependent index state unchanged');
 await q(`begin;create table public.brand_ddl_unrelated(a text);alter table public.brand_ddl_unrelated add column b jsonb;
 grant select on public.brand_ddl_unrelated to authenticated;revoke select on public.brand_ddl_unrelated from authenticated;
 comment on function ${fn} is 'nonsemantic component comment';drop table public.brand_ddl_unrelated;rollback;
 set role authenticated;create temporary table brand_ddl_auth_temp(a integer);drop table brand_ddl_auth_temp;reset role;`);
 assert.deepEqual(await snapshot(),report.initialCatalog);
 pass('unrelated create/alter/grant/revoke/drop and unprivileged invoker DDL remain usable');

 // ACL fingerprints are identities, not role display names. Renaming the
 // isolated helper owner must not block unrelated DDL or change the snapshot.
 await q(`alter role brand_ddl_helper_owner rename to brand_ddl_helper_owner_renamed;
 create table public.brand_ddl_after_role_rename(id integer);drop table public.brand_ddl_after_role_rename;`);
 assert.deepEqual(await snapshot(),report.initialCatalog);
 pass('helper-owner role rename preserves canonical OID ACL and unrelated DDL');

 const dependentState=async()=>JSON.parse(await q(`select jsonb_build_object(
  'private',to_regnamespace('private')::oid,'destination',to_regnamespace('brand_ddl_destination')::oid,
  'table',to_regclass('public.brand_ddl_guard_rows')::oid,
  'index',to_regclass('public.brand_ddl_guard_rows_normalized')::oid,
  'rows',(select jsonb_agg(to_jsonb(x) order by id) from public.brand_ddl_guard_rows x),
  'events',(select jsonb_agg(jsonb_build_array(oid,evtname,evtfoid,evtenabled) order by oid)
    from pg_event_trigger where evtfoid='extensions.guard_platform_brand_index_helper_ddl_v1()'::regprocedure))::text;`));
 for(const sql of ['drop schema private cascade',
   'drop schema private,brand_ddl_destination cascade',
   'drop schema brand_ddl_destination,private cascade']){
  const before=await dependentState();
  await rejects(sql,sql);
  assert.deepEqual(await dependentState(),before,'cascade rollback restores schemas, index, rows and events');
 }
 pass('private and multi-schema cascades restore all captured dependencies atomically');
 await q('create schema brand_ddl_unrelated_drop;create table brand_ddl_unrelated_drop.rows(id integer);drop schema brand_ddl_unrelated_drop cascade;');
 assert.equal(JSON.parse(await q("select to_json(to_regnamespace('brand_ddl_unrelated_drop') is null)::text;")),true);
 assert.deepEqual(await snapshot(),report.initialCatalog);
 pass('unrelated schema cascade succeeds without blanket DROP SCHEMA rejection');

 // Explicit limitation: a privileged command removing the checker's own
 // namespace removes its events too. Record this in a rolled-back transaction;
 // it is not a passing protection claim for removal of the guard itself.
 const stateBeforeRemoval=await dependentState();
 report.guardRemovalLimitation=JSON.parse(await q(`begin;drop schema extensions,private cascade;
 select jsonb_build_object(
  'privateRemoved',to_regnamespace('private') is null,
  'guardNamespaceRemoved',to_regnamespace('extensions') is null,
  'dependentIndexRemoved',to_regclass('public.brand_ddl_guard_rows_normalized') is null,
  'eventsRemoved',not exists(select 1 from pg_event_trigger where evtname in ('platform_brand_index_helper_ddl_v1','platform_brand_index_helper_drop_v1')))::text;
 rollback;`));
 assert.deepEqual(report.guardRemovalLimitation,{privateRemoved:true,guardNamespaceRemoved:true,dependentIndexRemoved:true,eventsRemoved:true});
 assert.deepEqual(await dependentState(),stateBeforeRemoval,'explicit guard-removal diagnostic rolled back');
 assert.deepEqual(await snapshot(),report.initialCatalog);
 report.status='passed';checkpoint('all immutable-helper DDL component gates passed');
}catch(error){
 report.status='failed';report.error=String(error.message);report.errorCode=error.code??null;
 checkpoint('DDL component gate failed; no native/full-fixture readiness claim');
 throw error;
}finally{
 if(db)await db.close();
 report.completedAt=new Date().toISOString();writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
}
