#!/usr/bin/env node
// Own disposable PG17.6 cluster only. Modeled managed postgres is NOSUPERUSER;
// fixture_admin supplies explicit synthetic shared dependencies, never a target.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import process from 'node:process';
import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {nativeStoreInstallProfile} from './install-profile.mjs';
assert.equal(process.argv.length,4);assert.equal(process.argv[2],'--local-bin');const bin=process.argv[3];assert.ok(path.isAbsolute(bin));
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
 const probe=fs.readFileSync(path.join(here,'dependency-probe.sql'),'utf8');
 const dependencies=JSON.parse(q('begin read only;'+probe+'rollback;'));
 assert.equal(dependencies.transactionReadOnly,'on');assert.equal(dependencies.relations.length,21);
 assert.ok(dependencies.relations.every(r=>r.present&&r.missingColumns.length===0&&r.postgresSelect&&r.postgresMaintain));cases++;
 const missing=JSON.parse(q('begin;alter table auth.sessions rename column not_after to fixture_missing;'+probe+'rollback;'));
 assert.deepEqual(missing.relations.find(r=>r.relation==='auth.sessions').missingColumns,['not_after']);cases++;
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
 const result=attempt(profile.sql);assert.equal(result.status,0,result.stderr);cases++;
 assert.equal(q('select state from sandbox_commerce_v1.lifecycle;'),'disabled');
 assert.equal(q('select enabled from sandbox_commerce_v1.paid_video_gateway_controls;'),'f');
 assert.equal(q('select preparation_enabled from sandbox_commerce_v1.native_store_quote_controls;'),'f');
 assert.equal(q('select enabled from native_store_sandbox_v1.control;'),'f');
 for(const role of ['sbx_v1_core_owner','sbx_v1_authority_owner','sbx_v1_operator','native_store_sandbox_v1_owner']){
  assert.equal(q(`select has_schema_privilege('${role}','public','CREATE');`),'f');
  assert.equal(q(`select pg_has_role('postgres','${role}','SET'),pg_has_role('postgres','${role}','USAGE');`),'f|f');
 }cases++;
 for(const schema of ['native_store_sandbox_v1','sandbox_commerce_v1'])assert.equal(q(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='${schema}' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity);`),'0');
 for(const table of ['native_store_sandbox_v1.connections','native_store_sandbox_v1.receipts','sandbox_commerce_v1.native_store_catalog_bindings','sandbox_commerce_v1.native_store_selections','sandbox_commerce_v1.native_store_claims'])assert.equal(q('select count(*) from '+table+';'),'0');cases++;
 for(const role of ['anon','authenticated']){
  const r=run('psql',args(),`set role ${role};select public.native_store_sandbox_claim_read_v1(gen_random_uuid());`);assert.notEqual(r.status,0);assert.match(r.stderr,/permission denied/u);
 }
 assert.equal(q("set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}';select public.native_store_sandbox_claim_read_v1(gen_random_uuid()) is null;"),'t');cases++;
 console.log(JSON.stringify({protocol:'native-store-managed-install-proof-v1',cases,passed:cases,sourceDigest:profile.sourceDigest,modules:profile.files.length,hostedQualified:false,dispatchAllowed:false}));
}finally{if(started)invoke('pg_ctl',['-D',data,'-m','immediate','-w','stop']);fs.rmSync(directory,{recursive:true,force:true});}
