#!/usr/bin/env node
// Own disposable PG17.6 cluster only. Modeled managed postgres is NOSUPERUSER;
// fixture_admin supplies explicit synthetic shared dependencies, never a target.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import process from 'node:process';
import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {nativeStoreAtomicInstallSQL} from './install-atomic.mjs';
import {prepareEnvelopeNativeProof} from './install-envelope.native-cases.mjs';
import {nativeStoreInstallProfile} from './install-profile.mjs';
import {installEventTriggerParity} from './event-trigger-parity.fixture.mjs';
import {readbackSQL,validateSnapshot} from '../../scripts/native-store-install-prepare.mjs';
import {deltaSnapshotSQL,describeNativeInstallDelta,verifyNativeInstallDelta,normalizeAdded} from './install-delta.mjs';
assert.ok(process.argv.length>=4&&process.argv.length<=7);assert.equal(process.argv[2],'--local-bin');const bin=process.argv[3];assert.ok(path.isAbsolute(bin));
const flags=process.argv.slice(4);assert.equal(new Set(flags).size,flags.length);assert.ok(flags.every(f=>['--event-trigger-parity','--oid-padding','--generate-local-pins','--envelope-proof'].includes(f)));
if(flags.includes('--envelope-proof'))assert.ok(flags.includes('--event-trigger-parity')&&!flags.includes('--generate-local-pins'));
const triggerParity=flags.includes('--event-trigger-parity'),oidPadding=flags.includes('--oid-padding');
const here=path.dirname(fileURLToPath(import.meta.url)),base=path.resolve(here,'../sandbox-commerce-v1'),profile=nativeStoreInstallProfile();
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'native-managed-')),data=path.join(directory,'data'),port='55491';
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')));
const args=(user='fixture_admin',db='permission_fixture')=>['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U',user,'-d',db];
const run=(tool,a,input)=>spawnSync(path.join(bin,tool),a,{env,input,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
const invoke=(tool,a,input)=>{const r=run(tool,a,input);assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();};
const q=(sql,user='fixture_admin')=>invoke('psql',args(user),sql);
const attempt=sql=>run('psql',args('postgres'),sql);
const absent=()=>{assert.equal(q("select count(*) from pg_namespace where nspname in('sandbox_commerce_v1','native_store_sandbox_v1');"),'0');
 assert.equal(q("select count(*) from pg_roles where rolname in('sbx_v1_core_owner','sbx_v1_authority_owner','sbx_v1_operator','native_store_sandbox_v1_owner');"),'0');};
const reject=(sql,pattern)=>{const r=attempt(sql);assert.notEqual(r.status,0);assert.match(r.stderr,pattern);};
const beforeCommit=extra=>profile.sql.replace(/commit;\s*$/u,extra+'\ncommit;');
let started=false,cases=0;
try{
 assert.match(invoke('postgres',['--version']),/PostgreSQL\) 17\.6/u);
 invoke('initdb',['-D',data,'-U','fixture_admin','--encoding=UTF8','--no-locale','--auth=trust']);
 invoke('pg_ctl',['-D',data,'-w','-t','15','-l',path.join(directory,'server.log'),'-o',`-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port} -c autovacuum=off`,'start']);started=true;
 invoke('psql',args('fixture_admin','postgres'),'create role postgres login createrole bypassrls nosuperuser nocreatedb noinherit;create database permission_fixture owner postgres;');
 q('create role anon nologin;create role authenticated nologin;create role service_role nologin;');
 // Only synthetic relation projections, outside install closure. No fixture
 // user, entitlement, route, catalog, receipt or account decision is seeded.
 const fixture=name=>fs.readFileSync(path.join(base,'tests',name),'utf8');
 q(fixture('premium-authority.fixture.sql').split('create schema premium_fixture;')[0]);
 const authority=fixture('authority.fixture.sql').split('create schema authority_fixture;')[0];
 q(authority.replace(/create table sandbox_commerce_v1\.declarations\([\s\S]*?updated_at timestamptz\);/u,''));
 q('create table public.channel_audience_blocks(channel_user_id text,blocked_user_id text);grant usage on schema auth to postgres;');
 q(`do $$declare t record;begin for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('auth','public') and c.relkind='r' loop
 execute format('grant select,maintain on table %I.%I to postgres',t.nspname,t.relname);
 execute format('alter table %I.%I enable row level security',t.nspname,t.relname);execute format('alter table %I.%I force row level security',t.nspname,t.relname);end loop;end$$;
 alter default privileges for role postgres grant execute on functions to authenticated;`);
 assert.equal(q("select rolsuper,rolcreaterole,rolbypassrls,rolinherit from pg_roles where rolname='postgres';"),'f|t|t|f');cases++;
 if(oidPadding){q(`create schema fixture_oid_padding;do $$begin for i in 1..64 loop execute format('create table fixture_oid_padding.padding_%s(id integer)',i);end loop;end$$;drop schema fixture_oid_padding cascade;`);cases++;}
 const probe=fs.readFileSync(path.join(here,'dependency-probe.sql'),'utf8');
 const dependencies=JSON.parse(q('begin read only;'+probe+'rollback;'));
 assert.equal(dependencies.transactionReadOnly,'on');assert.equal(dependencies.relations.length,21);
 assert.ok(dependencies.relations.every(r=>r.present&&r.missingColumns.length===0&&r.postgresSelect&&r.postgresMaintain));cases++;
 const missing=JSON.parse(q('begin;alter table auth.sessions rename column not_after to fixture_missing;'+probe+'rollback;'));
 assert.deepEqual(missing.relations.find(r=>r.relation==='auth.sessions').missingColumns,['not_after']);cases++;
 if(triggerParity){
  installEventTriggerParity(q);
  q('create role fixture_ddl_owner nologin;create schema fixture_ddl authorization fixture_ddl_owner;grant fixture_ddl_owner to postgres with set true;');
  assert.equal(q("select has_schema_privilege('fixture_ddl_owner','extensions','USAGE'),has_function_privilege('fixture_ddl_owner','extensions.guard_platform_brand_index_helper_ddl_v1()','EXECUTE');"),'f|f');
  q('set role fixture_ddl_owner;create table fixture_ddl.example(id integer);create function fixture_ddl.example() returns integer language sql as $$select 1$$;drop function fixture_ddl.example();drop table fixture_ddl.example;','postgres');cases++;
  const denied=run('psql',args('postgres'),'set role fixture_ddl_owner;select extensions.guard_platform_brand_index_helper_ddl_v1();');assert.notEqual(denied.status,0);assert.match(denied.stderr,/permission denied for schema extensions/u);cases++;
  const guard=run('psql',args('postgres'),'alter function private.platform_brand_index_jsonb_bytes_v1(jsonb) cost 101;');assert.notEqual(guard.status,0);assert.match(guard.stderr,/brand_index_helper_immutable/u);cases++;
  const catalog=run('psql',args(),'begin;revoke select on pg_catalog.pg_proc from public;set local role fixture_ddl_owner;create table fixture_ddl.should_fail(id integer);commit;');
  assert.notEqual(catalog.status,0);assert.match(catalog.stderr,/permission denied for table pg_proc/u);assert.equal(q("select has_table_privilege('fixture_ddl_owner','pg_catalog.pg_proc','SELECT');"),'t');cases++;
  // Concrete snapshot SQL + unchanged production transport guard, using an
  // explicitly modeled read-only session identity, never a role-name override.
  q(`create role supabase_read_only_user login nosuperuser nocreaterole nocreatedb bypassrls;
   create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text,name text,statements text[]);
   insert into supabase_migrations.schema_migrations values('20260101000000','synthetic_fixture',array['synthetic only']);
   insert into public.platform_money_kill_switches select k,case when k in('live_money_enabled','payouts_enabled','cashout_enabled') then 'off' else 'sandbox_only' end from unnest(array['live_money_enabled','payouts_enabled','cashout_enabled','stripe_connect_enabled','tips_enabled','creator_monetization_enabled','provider_webhooks_enabled','revenuecat_app_store_enabled','revenuecat_google_play_enabled']) k;
   grant usage on schema auth,public,supabase_migrations to supabase_read_only_user;grant select on all tables in schema auth,public,supabase_migrations to supabase_read_only_user;
   grant usage on schema supabase_migrations to postgres;grant select on supabase_migrations.schema_migrations to postgres;`);
  const snapshot=JSON.parse(invoke('psql',args('supabase_read_only_user'),'begin read only;'+readbackSQL()+'rollback;'));
  assert.equal(validateSnapshot(snapshot).status,'snapshot_observed_unqualified');assert.equal(validateSnapshot(snapshot).deploymentAllowed,false);cases++;
  const wrongIdentity=JSON.parse(q('begin read only;'+readbackSQL()+'rollback;','postgres'));
  assert.throws(()=>validateSnapshot(wrongIdentity),/MANAGEMENT_READ_CONTEXT_MISMATCH/u);cases++;
 }
 reject(profile.sql.replace('grant usage,create on schema public to native_store_sandbox_v1_owner;',''),/permission denied for schema public/u);absent();cases++;
 reject(profile.sql.replace('revoke create on schema public from native_store_sandbox_v1_owner;',''),/native_store_install_finalization_required/u);absent();cases++;
 reject(profile.sql.replace(profile.files.at(-1).sql,''),/native_store_install_finalization_required/u);absent();cases++;
 reject(beforeCommit("grant native_store_sandbox_v1_owner to postgres with inherit true,set true;set local role native_store_sandbox_v1_owner;update native_store_sandbox_v1.control set enabled=true;reset role;"),/native_store_install_finalization_required/u);absent();cases++;
 reject(beforeCommit("grant sbx_v1_core_owner to postgres with inherit true,set true;set local role sbx_v1_core_owner;update sandbox_commerce_v1.native_store_quote_controls set preparation_enabled=true;reset role;"),/native_store_install_finalization_required/u);absent();cases++;
 reject(beforeCommit("do $$begin raise exception 'native_install_late_failure';end$$;"),/native_install_late_failure/u);absent();cases++;
 reject(beforeCommit("set local statement_timeout='1ms';select pg_sleep(0.05);"),/statement timeout/u);absent();cases++;
 q('create role native_store_sandbox_v1_owner nologin;');reject(profile.sql,/already exists/u);
 assert.equal(q("select count(*) from pg_namespace where nspname='sandbox_commerce_v1';"),'0');q('drop role native_store_sandbox_v1_owner;');absent();cases++;
 q('create schema native_store_sandbox_v1;');reject(profile.sql,/already exists/u);
 assert.equal(q("select count(*) from pg_roles where rolname='native_store_sandbox_v1_owner';"),'0');q('drop schema native_store_sandbox_v1;');absent();cases++;
 const beforeInstall=JSON.parse(q(deltaSnapshotSQL));
 if(flags.includes('--generate-local-pins')){
  // Explicit source maintenance only, never hosted qualification or an atomic
  // verification pass. Normal/CI paths below still require existing exact pins.
  const installed=attempt(profile.sql);assert.equal(installed.status,0,installed.stderr);
  const after=JSON.parse(q(deltaSnapshotSQL)),delta=describeNativeInstallDelta(beforeInstall,after);
  const old=new Set(beforeInstall.rows.map(r=>JSON.stringify(r)));
  const rows=after.rows.filter(r=>!old.has(JSON.stringify(r))&&!(r[0]==='schema'&&r[1]==='public')).map(r=>normalizeAdded(r,after.acls,after.bootstrapSuperuser));
  fs.writeFileSync(path.join(here,'install-delta.json'),JSON.stringify(delta,null,2)+'\n');
  fs.writeFileSync(path.join(here,'install-atomic-rows.json.gz'),gzipSync(JSON.stringify({sourceDigest:profile.sourceDigest,addedCatalogSha256:delta.addedCatalogSha256,rows})+'\n',{level:9}));
  console.log(JSON.stringify({protocol:'native-store-local-pin-generation-v1',sourceDigest:profile.sourceDigest,addedCatalogSha256:delta.addedCatalogSha256,atomicVerified:false,deploymentAllowed:false}));
 }else{
 const envelopeProof=flags.includes('--envelope-proof')?await prepareEnvelopeNativeProof({q,run,args,bin,env,attempt,absent}):null;
 const atomic=envelopeProof?.sql??nativeStoreAtomicInstallSQL();
 for(const [mutation,reason] of [
  ['create function public.atomic_unexpected() returns integer language sql as $$select 1$$;','native_atomic_existing_catalog_changed'],
  ['grant create on schema public to native_store_sandbox_v1_owner;','native_store_install_finalization_required'],
  ['alter role native_store_sandbox_v1_owner login;','native_atomic_added_catalog_changed'],
  ['alter default privileges for role postgres grant execute on functions to service_role;','native_atomic_existing_catalog_changed']
 ]){reject(atomic.replace('-- Force the original',()=>mutation+'\n-- Force the original'),new RegExp(reason,'u'));absent();assert.deepEqual(JSON.parse(q(deltaSnapshotSQL)),beforeInstall);cases++;}
 reject(atomic.replace('select snapshot into strict b from native_atomic_before;',()=>"select snapshot into strict b from native_atomic_before; expected_rows:=expected_rows||jsonb_build_array(expected_rows->0);"),/native_atomic_added_catalog_changed/u);absent();assert.deepEqual(JSON.parse(q(deltaSnapshotSQL)),beforeInstall);cases++;
 const result=attempt(atomic);assert.equal(result.status,0,result.stderr);cases++;
 const afterInstall=JSON.parse(q(deltaSnapshotSQL));
 const sourceDelta=verifyNativeInstallDelta(beforeInstall,afterInstall);cases++;
 if(envelopeProof)envelopeProof.verifyCommitted();
 if(process.env.NATIVE_ATOMIC_PIN_GENERATE==='local-fixture-only'){
 const old=new Set(beforeInstall.rows.map(r=>JSON.stringify(r)));
 const rows=afterInstall.rows.filter(r=>!old.has(JSON.stringify(r))&&!(r[0]==='schema'&&r[1]==='public')).map(r=>normalizeAdded(r,afterInstall.acls,afterInstall.bootstrapSuperuser));
 fs.writeFileSync(path.join(here,'install-atomic-rows.json.gz'),gzipSync(JSON.stringify({sourceDigest:profile.sourceDigest,addedCatalogSha256:sourceDelta.addedCatalogSha256,rows})+'\n',{level:9}));
 }

 for(const [mutation,reason] of [
  ['alter table auth.sessions add column unexpected text;','native_delta_existing_catalog_changed'],
  ['create function public.unexpected_native_delta() returns integer language sql as $$select 1$$;','native_delta_existing_catalog_changed'],
  ['grant create on schema public to sbx_v1_core_owner;','native_delta_public_acl_changed'],
  ['grant sbx_v1_core_owner to authenticated;','native_delta_membership_changed'],
  ['alter role native_store_sandbox_v1_owner login;','native_delta_role_authority_changed'],
  ['alter default privileges for role postgres grant execute on functions to service_role;','native_delta_existing_catalog_changed'],
  ['alter default privileges for role sbx_v1_core_owner grant execute on functions to service_role;','native_delta_default_acl_added'],
  ['alter function native_store_sandbox_v1.immutable() cost 101;','native_delta_added_catalog_mismatch'],
  ['grant select on native_store_sandbox_v1.control to service_role;','native_delta_added_catalog_mismatch'],
  ['drop function public.native_store_sandbox_claim_read_v1(uuid);','native_delta_public_wrapper_missing']
 ]){
  const changed=JSON.parse(q('begin;'+mutation+deltaSnapshotSQL+'rollback;'));
  assert.throws(()=>verifyNativeInstallDelta(beforeInstall,changed),e=>e.message===reason);cases++;
 }
 assert.equal(q('select state from sandbox_commerce_v1.lifecycle;'),'disabled');
 assert.equal(q('select enabled from sandbox_commerce_v1.paid_video_gateway_controls;'),'f');
 assert.equal(q('select preparation_enabled from sandbox_commerce_v1.native_store_quote_controls;'),'f');
 assert.equal(q('select enabled from native_store_sandbox_v1.control;'),'f');
 for(const role of ['sbx_v1_core_owner','sbx_v1_authority_owner','sbx_v1_operator','native_store_sandbox_v1_owner']){
  assert.equal(q(`select has_schema_privilege('${role}','public','CREATE');`),'f');
  assert.equal(q(`select pg_has_role('postgres','${role}','SET'),pg_has_role('postgres','${role}','USAGE');`),'f|f');
 }cases++;
 for(const schema of ['native_store_sandbox_v1','sandbox_commerce_v1'])assert.equal(q(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='${schema}' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity);`),'0');
 for(const table of ['native_store_sandbox_v1.connections','native_store_sandbox_v1.receipts','sandbox_commerce_v1.native_store_catalog_bindings','sandbox_commerce_v1.native_store_selections','sandbox_commerce_v1.native_store_claims','sandbox_commerce_v1.native_store_reservations'])assert.equal(q('select count(*) from '+table+';'),'0');cases++;
 for(const role of ['anon','authenticated']){
  const r=run('psql',args(),`set role ${role};select public.native_store_sandbox_claim_read_v1(gen_random_uuid());`);assert.notEqual(r.status,0);assert.match(r.stderr,/permission denied/u);
 }
 assert.equal(q("set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}';select public.native_store_sandbox_claim_read_v1(gen_random_uuid()) is null;"),'t');cases++;
 console.log(JSON.stringify({protocol:'native-store-managed-install-proof-v1',cases,passed:cases,sourceDigest:profile.sourceDigest,addedCatalogSha256:sourceDelta.addedCatalogSha256,modules:profile.files.length,eventTriggerParity:triggerParity,oidPadding,hostedQualified:false,dispatchAllowed:false}));
 }
}finally{if(started)invoke('pg_ctl',['-D',data,'-m','immediate','-w','stop']);fs.rmSync(directory,{recursive:true,force:true});}
