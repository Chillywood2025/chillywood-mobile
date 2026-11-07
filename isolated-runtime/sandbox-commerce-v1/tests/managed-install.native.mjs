#!/usr/bin/env node
// Local installer permission proof, never a target/environment probe.
// Usage: node managed-install.native.mjs --local-bin /path/to/postgresql-17.6/bin
// The initdb superuser is fixture_admin. Modeled postgres is deliberately
// NOSUPERUSER LOGIN CREATEROLE BYPASSRLS NOINHERIT and owns this fixture database.
// These explicit assumptions are NOT an attestation of managed production roles.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

assert.equal(process.argv.length,4,'Only --local-bin /absolute/path is accepted');
assert.equal(process.argv[2],'--local-bin');
const bin=process.argv[3];assert.ok(path.isAbsolute(bin));
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const ordered=['core.sql','premium-authority.sql','authority.sql','commands.sql','receipts.sql','permissions-finalize.sql'];
const files=Object.fromEntries(ordered.map(f=>[f,fs.readFileSync(path.join(root,f),'utf8')]));
const fixtureFiles=['premium-authority.fixture.sql','authority.fixture.sql'];
const fixtures=Object.fromEntries(fixtureFiles.map(f=>[f,fs.readFileSync(path.join(here,f),'utf8')]));
const hash=s=>createHash('sha256').update(s).digest('hex');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')));
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sandbox-managed-permissions-'));
const data=path.join(directory,'data'),port='55451';
const args=(user='fixture_admin',db='permission_fixture')=>['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U',user,'-d',db];
const run=(tool,a,input)=>spawnSync(path.join(bin,tool),a,{env,input,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
const invoke=(tool,a,input)=>{const r=run(tool,a,input);assert.equal(r.status,0,`${tool}: ${r.error?.message??''}\n${r.stderr??''}`);return r.stdout.trim();};
const q=(sql,user='fixture_admin')=>invoke('psql',args(user),sql);
const attempt=sql=>run('psql',args('postgres'),'begin;'+sql+'commit;');
const cases=[];let started=false,startAttempted=false,report;
const cleanup={clusterStopped:false,clusterNotRunningVerified:false,directoryRemoved:false};
const begun=Date.now();
try {
 const version=invoke('postgres',['--version']);assert.match(version,/PostgreSQL\) 17\.6/u);
 invoke('initdb',['-D',data,'-U','fixture_admin','--encoding=UTF8','--no-locale','--auth=trust']);
 startAttempted=true;
 invoke('pg_ctl',['-D',data,'-w','-t','15','-l',path.join(directory,'server.log'),'-o',`-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port} -c autovacuum=off`,'start']);started=true;
 invoke('psql',args('fixture_admin','postgres'),`create role postgres login createrole bypassrls nosuperuser nocreatedb noinherit;create database permission_fixture owner postgres;`);
 q('create role anon nologin;create role authenticated nologin;create role service_role nologin;');
 q(fixtures['premium-authority.fixture.sql']);
 // Keep only the shared fixture relations. The actual core creates its own
 // declaration table with FORCE RLS, so it must not be replaced by a fixture.
 const declaration=/create table sandbox_commerce_v1\.declarations\([\s\S]*?updated_at timestamptz\);/u;
 assert.match(fixtures['authority.fixture.sql'],declaration);
 assert.ok(fixtures['authority.fixture.sql'].includes('create schema authority_fixture;'));
 q(fixtures['authority.fixture.sql'].replace(declaration,'').replace(/create schema authority_fixture;[\s\S]*/u,''));
 q('alter default privileges for role postgres grant execute on functions to authenticated;');

 // Isolate ALTER OWNER's schema CREATE rule from the larger bundle.
 q(`create role fixture_function_owner nologin;grant fixture_function_owner to postgres with inherit true,set true;
 create schema ownership_fixture;grant usage,create on schema ownership_fixture to fixture_function_owner;`);
 q('set role fixture_function_owner;create function ownership_fixture.example() returns integer language sql as $$select 1$$;','postgres');
 q('revoke create on schema ownership_fixture from fixture_function_owner;');
 const noCreate=run('psql',args('postgres'),'alter function ownership_fixture.example() owner to postgres;');
 assert.notEqual(noCreate.status,0);assert.match(noCreate.stderr,/permission denied for schema ownership_fixture/u);
 cases.push({name:'Non-super ALTER OWNER rejects when proposed new owner lacks schema CREATE despite inherited function ownership',stderr:noCreate.stderr.trim()});
 q('grant usage,create on schema ownership_fixture to postgres;');
 q('alter function ownership_fixture.example() owner to postgres;','postgres');
 cases.push({name:'Explicit CREATE on only the new schema permits ownership transfer'});

 const rest=ordered.slice(1).map(f=>files[f]).join('\n');
 const membershipGrant='grant sbx_v1_core_owner,sbx_v1_authority_owner to postgres with inherit true, set true;\n';
 const schemaGrant='grant usage,create on schema sandbox_commerce_v1 to postgres;\n';
 assert.ok(files['core.sql'].includes(membershipGrant));assert.ok(files['core.sql'].includes(schemaGrant));
 const unprivilegedCore=files['core.sql'].replace(membershipGrant,'').replace(schemaGrant,'');
 const base=attempt(unprivilegedCore+rest);
 assert.notEqual(base.status,0);assert.match(base.stderr,/must be able to SET ROLE/u);
 cases.push({name:'Negative control removing explicit source installer grants refuses as modeled non-superuser postgres',stderr:base.stderr.trim()});
 const membership='grant sbx_v1_core_owner,sbx_v1_authority_owner to postgres with set true;\n';
 const coreWithMembership=unprivilegedCore.replace('create schema sandbox_commerce_v1 authorization sbx_v1_core_owner;',membership+'create schema sandbox_commerce_v1 authorization sbx_v1_core_owner;');
 const onlyMembership=attempt(coreWithMembership+rest);
 assert.notEqual(onlyMembership.status,0);assert.match(onlyMembership.stderr,/permission denied for schema sandbox_commerce_v1/u);
 cases.push({name:'SET-only membership does not supply inherited schema-owner privileges required by source GRANT operations',stderr:onlyMembership.stderr.trim()});

 // This is the unmodified, current SIX-file source bundle, with the actual
 // finalizer executed before the same install transaction commits.
 const good=attempt(files['core.sql']+rest);assert.equal(good.status,0,`${good.error?.message??''}\n${good.stderr}`);
 cases.push({name:'Entire current six-file source bundle including finalizer installs atomically without SUPERUSER'});
 assert.equal(q("select rolsuper,rolcreaterole,rolbypassrls,rolinherit from pg_roles where rolname='postgres';"),'f|t|t|f');
 assert.equal(q('select state from sandbox_commerce_v1.lifecycle;'),'disabled');
 assert.equal(q('select count(*) from sandbox_commerce_v1.provider_routes;'),'0');
 assert.equal(q("select has_function_privilege('authenticated','sandbox_commerce_v1.assert_authority(uuid,uuid,text)','EXECUTE'),has_function_privilege('service_role','sandbox_commerce_v1.assert_authority(uuid,uuid,text)','EXECUTE'),has_schema_privilege('sbx_v1_core_owner','public','CREATE');"),'f|f|f');
 cases.push({name:'Generation remains disabled with no provider routes; protected API stays closed and temporary public CREATE is revoked'});
 assert.equal(q('begin;set local row_security=off;lock table sandbox_commerce_v1.declarations in share mode nowait;select count(*) from sandbox_commerce_v1.declarations;rollback;','postgres'),'0');
 assert.equal(q("select has_table_privilege('postgres','sandbox_commerce_v1.declarations','UPDATE'),has_table_privilege('postgres','sandbox_commerce_v1.declarations','SELECT'),has_table_privilege('postgres','sandbox_commerce_v1.declarations','MAINTAIN'),has_schema_privilege('postgres','sandbox_commerce_v1','CREATE');"),'f|t|t|f');
 const cannotSet=run('psql',args('postgres'),'set role sbx_v1_core_owner;');assert.notEqual(cannotSet.status,0);assert.match(cannotSet.stderr,/permission denied to set role/u);
 assert.equal(q("select has_function_privilege('postgres','sandbox_commerce_v1.transition(text,text)','EXECUTE'),has_table_privilege('postgres','sandbox_commerce_v1.catalog','SELECT');"),'f|f');
 assert.equal(q("select count(distinct m.roleid) from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member where r.rolname in ('sbx_v1_core_owner','sbx_v1_authority_owner','sbx_v1_operator') and u.rolname='postgres' and m.admin_option;"),'3');
 assert.equal(q("select count(*) from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member where r.rolname in ('sbx_v1_core_owner','sbx_v1_authority_owner','sbx_v1_operator') and u.rolname='postgres' and (m.inherit_option or m.set_option);"),'0');
 cases.push({name:'Actual finalizer leaves ADMIN-only memberships without SET/inherited table or activation authority; explicit new-declaration SELECT+MAINTAIN retains its read fence'});
 const later=q('grant sbx_v1_operator to postgres with set true;set role sbx_v1_operator;select current_user;reset role;grant sbx_v1_operator to postgres with set false;','postgres');assert.equal(later,'sbx_v1_operator');
 const noOperator=run('psql',args('postgres'),'set role sbx_v1_operator;');assert.notEqual(noOperator.status,0);assert.match(noOperator.stderr,/permission denied to set role/u);
 assert.equal(q('select state from sandbox_commerce_v1.lifecycle;'),'disabled');
 cases.push({name:'Retained ADMIN supports a deliberate future operator SET grant and its removal without activating this generation'});
 for(const f of ordered)assert.equal(hash(fs.readFileSync(path.join(root,f),'utf8')),hash(files[f]),`Source changed during test: ${f}`);
 report={status:'passed',engine:version,scope:'Local installer permission proof, not product execution or target attestation',
  assumptions:['PostgreSQL 17.6 task-selected local binaries','Synthetic database owned by modeled postgres LOGIN CREATEROLE BYPASSRLS NOSUPERUSER NOINHERIT','Separate fixture_admin superuser performs fixture setup only','Fresh module names and ordinary local event-trigger/catalog behavior','No assertion about actual managed target roles, shared Auth access, deployment eligibility or provider configuration'],
  caseCount:cases.length,cases,sourceHashes:Object.fromEntries(ordered.map(f=>[f,hash(files[f])])),
  fixtureHashes:Object.fromEntries(fixtureFiles.map(f=>[f,hash(fixtures[f])])),harnessHash:hash(fs.readFileSync(fileURLToPath(import.meta.url)))};
} finally {
 if(startAttempted){let s=run('pg_ctl',['-D',data,'status']);if(s.status===0){invoke('pg_ctl',['-D',data,'-m','immediate','-w','-t','15','stop']);cleanup.clusterStopped=true;s=run('pg_ctl',['-D',data,'status']);}else if(started&&s.status===3)cleanup.clusterStopped=true;assert.equal(s.status,3,'Local status uncertain; preserve data');assert.ok(started,'Uncertain start: preserve data');cleanup.clusterNotRunningVerified=true;}else {cleanup.clusterStopped=true;cleanup.clusterNotRunningVerified=true;}
 fs.rmSync(directory,{recursive:true});cleanup.directoryRemoved=true;
}
assert.ok(report);process.stdout.write(JSON.stringify({...report,durationMs:Date.now()-begun,cleanup},null,2)+'\n');
