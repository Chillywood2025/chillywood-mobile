#!/usr/bin/env node
// Retained capture managed fixture: local source proof only; no target or provider authority.
// Source ancestry current-grant managed fixture; prior source ancestry managed-install.native.mjs SHA256 0f6c563db35bc8c67c2a7de40fa0a2d18f5306e0a62be9656360ce64cdac6111.
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
import {spawn,spawnSync} from 'node:child_process';
import {createHash,createHmac,randomUUID,randomBytes} from 'node:crypto';
import {seedV3Qualified,V3_FIXTURE,sqlText,sqlJson,syntheticHash,createV3SourceLoader,createV3CommandApi,legacyAuthoritySnapshot} from './test-store-v3.fixture.mjs';
import {signScanResult} from '../../../ops/isolated-paid-video-worker/scan.mjs';
import {createV3ProviderFixture,providerSources} from './test-store-v3-provider.fixture.mjs';
import {createV3ReceiptFixture,receiptSources} from './test-store-v3-receipts.fixture.mjs';
import {Buffer} from 'node:buffer';
import {loadCapture,environment as captureEnvironment,connection as captureConnectionFixture,request as captureRequest,event as captureEvent,sharedPaths as captureSharedPaths,edgePath as captureEdgePath} from '../../test-store-capture-v1/tests/source-loader.mjs';

assert.equal(process.argv.length,6,'Only --local-bin /absolute/path --v2-reference /absolute/path is accepted');
assert.equal(process.argv[4],'--v2-reference'); const reference=process.argv[5]; assert.ok(path.isAbsolute(reference));
assert.equal(process.argv[2],'--local-bin');
const bin=process.argv[3];assert.ok(path.isAbsolute(bin));
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const ordered=[
 "candidates/paid-video-capture-composed/capture-dependency.sql",
 "core.sql",
 "premium-authority.sql",
 "authority.sql",
 "candidates/paid-video-capture-composed/legacy_commands.sql",
 "receipts.sql",
 "test-store.sql",
 "test-store-offerings-core.sql",
 "test-store-qualification.sql",
 "test-store-offerings-commands.sql",
 "test-store-offerings-provisioning.sql",
 "test-store-offerings-receipts.sql",
 "history.sql",
 "resource-graphs.sql",
 "delivery-authority.sql",
 "paid-video-install-context-v2.sql",
 "paid-video-install-grant-v2.sql",
 "paid-video-media.sql",
 "paid-video-upload.sql",
 "paid-video-commands.sql",
 "paid-video-install-revoke-v2.sql",
 "test-store-paid-video-core.sql",
 "candidates/paid-video-capture-composed/retained-identity.sql",
 "candidates/paid-video-capture-composed/admission.sql",
 "candidates/paid-video-plan-lifecycle/lifecycle.sql",
 "candidates/paid-video-capture-composed/commands.sql",
 "candidates/paid-video-checkout-recovery/abandon.sql",
 "candidates/paid-video-prepared-closure/close.sql",
 "candidates/paid-video-capture-composed/provisioning.sql",
 "candidates/paid-video-capture-composed/receipts.sql",
 "paid-video-install-grant-v2.sql",
 "candidates/paid-video-capture-composed/access.sql",
 "candidates/paid-video-capture-composed/gateway.sql",
 "candidates/paid-video-combined-readiness/media.sql",
 "candidates/paid-video-current-grant/resolve.sql",
 "paid-video-install-grant-v2.sql",
 "../../ops/isolated-paid-video-operations-v2/operations.sql",
 "../../ops/isolated-paid-video-operations-v2/monotonic-removal.sql",
 "candidates/paid-video-capture-composed/reconcile.sql",
 "candidates/paid-video-capture-composed/profile-guard.sql",
 "paid-video-install-revoke-v2.sql",
 "permissions-finalize.sql"
];
const frozen=JSON.parse(fs.readFileSync(path.join(reference,'manifest.json'),'utf8'));
const sourcePath=f=>Object.hasOwn(frozen.files,'isolated-runtime/sandbox-commerce-v1/'+f)?path.join(reference,'isolated-runtime/sandbox-commerce-v1',f):path.join(root,f);
for(const [name,expected] of Object.entries(frozen.files)) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(reference,name))).digest('hex'),expected);
const profileManifestPath=path.join(root,'candidates/paid-video-capture-composed/retained-source-manifest.json');
const profileManifestRaw=fs.readFileSync(profileManifestPath),profileManifest=JSON.parse(profileManifestRaw);
assert.equal(createHash('sha256').update(profileManifestRaw).digest('hex'),'39f259c62d0683c750be6b4fa01d254aa91a8dc3cefb9d74219398c70eb36a37');
for(const entry of profileManifest.executedModules){const key=path.relative('isolated-runtime/sandbox-commerce-v1',entry.path);assert.equal(createHash('sha256').update(fs.readFileSync(sourcePath(key))).digest('hex'),entry.sha256);}
const retainedCaptureSource=fs.readFileSync(path.resolve(root,'../test-store-capture-v1/capture.sql'),'utf8');
assert.equal(createHash('sha256').update(retainedCaptureSource).digest('hex'),'ea98dc0230a1026a40fe8c23e60e97f6c29c13dc19f2bf1b12c94f04a5289e81');
const captureFixtureSourceFiles=[...captureSharedPaths,captureEdgePath,path.resolve(here,'../../test-store-capture-v1/tests/source-loader.mjs')];
const captureFixtureSourceHashes=Object.fromEntries(captureFixtureSourceFiles.map(f=>[f,createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
const files=Object.fromEntries(ordered.map(f=>[f,fs.readFileSync(sourcePath(f),'utf8')]));
const fixtureFiles=['premium-authority.fixture.sql','authority.fixture.sql'];
const fixtures=Object.fromEntries(fixtureFiles.map(f=>[f,fs.readFileSync(path.join(here,f),'utf8')]));
const hash=s=>createHash('sha256').update(s).digest('hex');
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')));
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sandbox-managed-permissions-'));
const socket=fs.mkdtempSync(path.join(fs.realpathSync('/tmp'),'scv1-managed-'));
fs.chmodSync(socket,0o700);
const data=path.join(directory,'data'),port='55460';
const args=(user='fixture_admin',db='permission_fixture')=>['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',socket,'-p',port,'-U',user,'-d',db];
const redact=value=>String(value??'')
 .replace(/\b(?:https?|postgres(?:ql)?):\/\/[^\s"'<>]+/giu,'[redacted URL]')
 .replace(/\b(Bearer|Basic)\s+[^\s"',;]+/giu,'$1 [redacted]')
 .replace(/\b(authorization|password|passfile|access[_-]?token|refresh[_-]?token|secret|api[_-]?key)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu,'$1=[redacted]')
 .replace(/^.*\b(?:STATEMENT|QUERY|CONTEXT):[^\n]*(?:\n(?!\d{4}-\d{2}-\d{2}[ T]|\s*(?:LOG|FATAL|ERROR|HINT|WARNING|DETAIL):)[^\n]*)*/gmu,'[redacted SQL context]');
const bounded=value=>redact(value).slice(-8192),bootstrapCommands=[];
const run=(tool,a,input)=>{
 const r=spawnSync(path.join(bin,tool),a,{env,input,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
 if(['postgres','initdb','pg_ctl'].includes(tool)&&bootstrapCommands.length<12)bootstrapCommands.push({
  tool,operation:a.includes('start')?'start':a.includes('stop')?'stop':a.includes('status')?'status':tool==='initdb'?'initdb':'version',
  status:r.status,signal:r.signal,error:r.error?bounded(r.error.message):null,stdout:bounded(r.stdout),stderr:bounded(r.stderr)});
 return r;
};
const invoke=(tool,a,input)=>{const r=run(tool,a,input);assert.equal(r.status,0,`${tool}: ${bounded(r.error?.message)}\n${bounded(r.stderr)}`);return r.stdout.trim();};
const q=(sql,user='fixture_admin')=>invoke('psql',args(user),sql);
const attempt=sql=>run('psql',args('postgres'),'begin;'+sql+'commit;');
const cases=[];let started=false,startAttempted=false,initializationAttempted=false,initialized=false,report,primaryFailure,cleanupFailure;
let phase='version',startupLog=null;
const children=[];
const cleanup={sessionsClosed:false,clusterStopped:false,clusterNotRunningVerified:false,directoryRemoved:false};
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const seller='11111111-1111-4111-8111-111111111111',sellerSession='22222222-2222-4222-8222-222222222222';
const buyer='66666666-6666-4666-8666-666666666666',buyerSession='77777777-7777-4777-8777-777777777777';
const actor=(user=buyer,session=buyerSession)=>`set role authenticated;set request.jwt.claims=${literal(JSON.stringify({role:'authenticated',sub:user,session_id:session}))};`;
const historyCall=(command='capability.read',payload={})=>`select public.isolated_sandbox_tips_v1(${literal(command)},${literal(JSON.stringify({protocol:'sandbox-commerce-v1',requestId:randomUUID(),...payload}))}::jsonb,'${buyer}','${buyerSession}');`;
let retainedSnapshot=null;
const captureTables=['project_reservations',...['connections','controls','entries','deliveries','exclusions','conflicts'].map(x=>'test_store_qualification_'+x)];
const captureData=()=>Object.fromEntries(captureTables.map(t=>[t,JSON.parse(q(`select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]'::jsonb) from rc_qualification_capture_v1.${t} r;`))]));
const noInstalledObjects=()=>{
 assert.equal(q("select count(*) from pg_namespace where nspname='sandbox_commerce_v1';"),'0');
 assert.equal(q("select count(*) from pg_namespace where nspname='rc_qualification_capture_v1';"),'1');
 if(retainedSnapshot)assert.deepEqual(captureData(),retainedSnapshot);
 assert.equal(q("select count(*) from pg_roles where rolname in('sbx_v1_core_owner','sbx_v1_authority_owner','sbx_v1_operator');"),'0');
 assert.equal(q("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname<>'isolated_test_store_capture_ingest_v1' and (p.proname like 'isolated_sandbox_%' or p.proname like 'isolated_test_store_%' or p.proname like 'isolated_paid_video_%');"),'0');
};
const rejected=(sql,pattern,user='fixture_admin')=>{const r=run('psql',args(user),sql);assert.notEqual(r.status,0);assert.match(r.stderr,pattern);return r;};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function heldSession(sql){
 const child=spawn(path.join(bin,'psql'),args(),{env,stdio:['pipe','pipe','pipe']});children.push(child);
 let stdout='',stderr='';
 child.stdout.on('data',value=>{stdout+=value;});child.stderr.on('data',value=>{stderr+=value;});child.stdin.on('error',()=>{});
 const closed=new Promise(resolve=>child.on('close',(code,signal)=>resolve({code,signal,get stdout(){return stdout;},get stderr(){return stderr;}})));
 child.stdin.write('\\set VERBOSITY verbose\n'+sql+"\nselect 'managed_rpc_returned';\n");
 return {child,closed,ready:async()=>{const end=Date.now()+3000;while(!stdout.includes('managed_rpc_returned')&&child.exitCode===null&&Date.now()<end)await sleep(10);assert.ok(stdout.includes('managed_rpc_returned'),stderr||'RPC never returned');}};
}
const begun=Date.now();
try {
 const version=invoke('postgres',['--version']);assert.match(version,/PostgreSQL\) 17\.6/u);
 phase='initdb';initializationAttempted=true;invoke('initdb',['-D',data,'-U','fixture_admin','--encoding=UTF8','--no-locale','--auth=trust']);initialized=true;
 phase='pg_ctl_start';startAttempted=true;
 invoke('pg_ctl',['-D',data,'-w','-t','15','-l',path.join(directory,'server.log'),'-o',`-c listen_addresses='' -c unix_socket_directories='${socket}' -p ${port} -c autovacuum=off`,'start']);started=true;
 assert.equal(invoke('psql',args('fixture_admin','postgres'),"select current_setting('listen_addresses');"),'');
 assert.equal(invoke('psql',args('fixture_admin','postgres'),"select current_setting('unix_socket_directories');"),socket);
 assert.equal(invoke('psql',args('fixture_admin','postgres'),'select inet_server_addr() is null;'),'t');
 assert.equal(fs.statSync(socket).mode&0o777,0o700);
 phase='cases';
 invoke('psql',args('fixture_admin','postgres'),`create role postgres login createrole bypassrls nosuperuser nocreatedb noinherit;create database permission_fixture owner postgres;`);
 q('create role anon nologin;create role authenticated nologin;create role service_role nologin;');
 q(fixtures['premium-authority.fixture.sql']);
 // Keep only the shared fixture relations. The actual core creates its own
 // declaration table with FORCE RLS, so it must not be replaced by a fixture.
 const declaration=/create table sandbox_commerce_v1\.declarations\([\s\S]*?updated_at timestamptz\);/u;
 assert.match(fixtures['authority.fixture.sql'],declaration);
 assert.ok(fixtures['authority.fixture.sql'].includes('create schema authority_fixture;'));
 q(fixtures['authority.fixture.sql'].replace(declaration,'').replace(/create schema authority_fixture;[\s\S]*/u,''));
 q('create table public.channel_audience_blocks(channel_user_id text,blocked_user_id text);');
 // Explicit synthetic capability assumption for actual runtime calls below:
 // modeled postgres can read/fence only these minimum projected shared tables.
 // BYPASSRLS alone does not grant SELECT or LOCK privileges.
 q(`grant usage on schema auth to postgres;
 do $$declare t record;begin for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('auth','public') and c.relkind='r' loop
 execute format('grant select,maintain on table %I.%I to postgres',t.nspname,t.relname);
 execute format('alter table %I.%I enable row level security',t.nspname,t.relname);
 execute format('alter table %I.%I force row level security',t.nspname,t.relname);end loop;end$$;`);
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

 // Independent capture is committed before any commerce installation. It owns
 // actual authenticated/encrypted synthetic provider evidence and is sealed.
 assert.equal(q("select to_regnamespace('sandbox_commerce_v1') is null;"),'t');
 q('begin;'+retainedCaptureSource+'commit;','postgres');
 const retainedConnection=captureConnectionFixture(),retainedCaptureSchema='rc_qualification_capture_v1';
 q(`set role rcq_v1_operator;select ${retainedCaptureSchema}.configure_capture('${retainedConnection.connectionId}',1,${sqlText(retainedConnection.projectId)},${sqlText(retainedConnection.appId)},${sqlText(retainedConnection.authentication.keyVersion)},${sqlText(retainedConnection.encryption.keyId)});`);
 q(`set role rcq_v1_operator;select ${retainedCaptureSchema}.test_store_qualification_transition('capturing','${retainedConnection.connectionId}',1,32,64,1048576);`);
 const retainedApi=loadCapture(captureEnvironment(),async(url,options)=>{
  assert.equal(String(url),'https://synthetic.invalid/rest/v1/rpc/isolated_test_store_capture_ingest_v1');
  const body=JSON.parse(options.body);
  const result=JSON.parse(q(`set role service_role;set request.jwt.claims='{"role":"service_role"}';select public.isolated_test_store_capture_ingest_v1('${body.p_connection_id}',${body.p_connection_revision},${sqlJson(body.p_envelope)},${sqlJson(body.p_observation)});`));
  return Response.json(result);
 });
 const retainedRaw=JSON.stringify(captureEvent({id:randomUUID()}));
 const retainedResponse=await retainedApi.edge.handler(captureRequest(retainedRaw));assert.equal(retainedResponse.status,200);
 const retainedResult=await retainedResponse.json();assert.equal(retainedResult.authorityGranted,false);assert.equal(retainedResult.economicProjectionAllowed,false);
 const retainedEnvelope=JSON.parse(q(`select envelope from ${retainedCaptureSchema}.test_store_qualification_entries;`));
 assert.equal(new TextDecoder().decode(await retainedApi.qualification.decryptQualificationEnvelope(retainedEnvelope,retainedConnection)),retainedRaw);
 q(`set role rcq_v1_operator;select ${retainedCaptureSchema}.test_store_qualification_transition('sealed');`);
 retainedSnapshot=captureData();assert.equal(retainedSnapshot.test_store_qualification_controls[0].phase,'sealed');
 assert.equal(retainedSnapshot.test_store_qualification_entries.length,1);assert.equal(retainedSnapshot.test_store_qualification_deliveries.length,1);
 assert.ok(retainedSnapshot.test_store_qualification_exclusions.length>=5);
 cases.push({name:'Standalone capture commits authenticated encrypted raw provider fixture evidence, exact decrypt and exclusions, then seals before any commerce objects exist'});

 const captureInstall=files['candidates/paid-video-capture-composed/capture-dependency.sql'];
 const rest=ordered.slice(2).map(f=>files[f]).join('\n');
 const membershipGrant='grant sbx_v1_core_owner,sbx_v1_authority_owner to postgres with inherit true, set true;\n';
 const schemaGrant='grant usage,create on schema sandbox_commerce_v1 to postgres;\n';
 assert.ok(files['core.sql'].includes(membershipGrant));assert.ok(files['core.sql'].includes(schemaGrant));
 const unprivilegedCore=files['core.sql'].replace(membershipGrant,'').replace(schemaGrant,'');
 const base=attempt(captureInstall+unprivilegedCore+rest);
 assert.notEqual(base.status,0);assert.match(base.stderr,/must be able to SET ROLE/u);
 noInstalledObjects();
 cases.push({name:'Negative control removing explicit source installer grants refuses as modeled non-superuser postgres',stderr:base.stderr.trim()});
 const membership='grant sbx_v1_core_owner,sbx_v1_authority_owner to postgres with set true;\n';
 const coreWithMembership=unprivilegedCore.replace('create schema sandbox_commerce_v1 authorization sbx_v1_core_owner;',membership+'create schema sandbox_commerce_v1 authorization sbx_v1_core_owner;');
 const onlyMembership=attempt(captureInstall+coreWithMembership+rest);
 assert.notEqual(onlyMembership.status,0);assert.match(onlyMembership.stderr,/permission denied for schema sandbox_commerce_v1/u);
 noInstalledObjects();
 cases.push({name:'SET-only membership does not supply inherited schema-owner privileges required by source GRANT operations',stderr:onlyMembership.stderr.trim()});

 // Fail after every module has been installed, not just during its first DDL.
 const lateFailure=attempt(captureInstall+files['core.sql']+rest+"do $$begin raise exception 'combined_install_injected_failure';end$$;");
 assert.notEqual(lateFailure.status,0);assert.match(lateFailure.stderr,/combined_install_injected_failure/u);noInstalledObjects();
 cases.push({name:'Late failure after all combined source files rolls back every new schema, role, helper and public wrapper'});

 // This is the unmodified, current combined successor source bundle, with the actual
 // finalizer executed before the same install transaction commits.
 const dependencyFaults=[
  ['missing_function',`drop function rc_qualification_capture_v1.commerce_admission(text,text);`],
  ['changed_function_acl',`grant execute on function rc_qualification_capture_v1.commerce_admission(text,text) to authenticated;`],
  ['changed_function_owner',`alter function rc_qualification_capture_v1.commerce_admission(text,text) owner to fixture_admin;`],
  ['missing_constraint',`alter table rc_qualification_capture_v1.project_reservations drop constraint project_reservations_binding_check;`],
  ['unsafe_owner_membership',`grant rcq_v1_owner to service_role with inherit true,set true;`],
  ['missing_owned_namespace',`drop schema rc_qualification_capture_v1 cascade;`],
 ];
 for(const [name,fault] of dependencyFaults){
  const outcome=run('psql',args(),'begin;'+fault+'set session authorization postgres;'+captureInstall+files['core.sql']+rest+'commit;');
  assert.notEqual(outcome.status,0,name);assert.match(outcome.stderr,/capture_owned_dependency_contract_mismatch|capture_owned_dependency_owner_membership/u,name);
  noInstalledObjects();
 }
 cases.push({name:'Six exact owned-capture dependency corruptions reject before new commerce authority and atomically restore all sealed capture data; no CREATE-collision fallback, replacement or broad shared metadata read',controls:dependencyFaults.map(([name])=>name)});

 const good=attempt(captureInstall+files['core.sql']+rest);assert.equal(good.status,0,`${good.error?.message??''}\n${good.stderr}`);
 assert.deepEqual(captureData(),retainedSnapshot);
 cases.push({name:'Retained standalone capture data/phase/reservations are byte-for-byte unchanged by complete new commerce installation'});
 cases.push({name:'Entire current combined successor source bundle including both Test Store protocols, record-only qualification, history, resource graphs, delivery and finalizer installs atomically without SUPERUSER'});
 assert.equal(q("select rolsuper,rolcreaterole,rolbypassrls,rolinherit from pg_roles where rolname='postgres';"),'f|t|t|f');
 assert.equal(q('select state from sandbox_commerce_v1.lifecycle;'),'disabled');
 assert.equal(q('select count(*) from sandbox_commerce_v1.provider_routes;'),'0');
 assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_connections;'),'0');
 assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_native_profiles;'),'0');
 assert.equal(q('select ingress_enabled,initiation_enabled from sandbox_commerce_v1.test_store_controls;'),'f|f');
 assert.equal(q('select ingress_enabled,provisioning_enabled,initiation_enabled,max_active_plans,requests_per_minute from sandbox_commerce_v1.test_store_v2_controls;'),'f|f|f|0|0');
 assert.equal(q('select phase,max_entries,max_deliveries,max_total_bytes from sandbox_commerce_v1.test_store_qualification_controls;'),'disabled|0|0|0');
 assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_qualification_connections;'),'0');
 for(const table of ['connections','native_profiles','products','customers','plans','allocations','registrations'])
  assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v2_${table};`),'0');
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

 const privateTables=JSON.parse(q(`select json_agg(json_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),
  'rls',c.relrowsecurity,'force',c.relforcerowsecurity) order by c.relname)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='sandbox_commerce_v1' and c.relkind='r';`));
 assert.ok(privateTables.length>=30);for(const table of privateTables){assert.equal(table.owner,'sbx_v1_core_owner',table.name);assert.equal(table.rls,true,table.name);assert.equal(table.force,true,table.name);}
 for(const role of ['anon','authenticated','service_role']){
  assert.equal(q(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='sandbox_commerce_v1' and c.relkind='r'
   and has_table_privilege('${role}',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');`),'0');
  assert.equal(q(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='sandbox_commerce_v1' and c.relkind='S'
   and case when c.relkind='S' then has_sequence_privilege('${role}',c.oid,'SELECT,UPDATE,USAGE') else false end;`),'0');
  assert.equal(q(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='sandbox_commerce_v1'
   and has_function_privilege('${role}',p.oid,'EXECUTE');`),'0');
 }
 cases.push({name:'All combined private tables and sequences retain core ownership, FORCE RLS and zero ordinary runtime table/helper privileges',tableCount:privateTables.length});

 const publicMatrix=[
  ['isolated_paid_video_operations_v1(text,text)','service_role'],
  ['isolated_paid_video_review_v1(text,text)','authenticated'],
  ['isolated_test_store_capture_pending_v3(jsonb,uuid,integer)','service_role'],
  ['isolated_test_store_capture_reconcile_v3(jsonb,uuid)','service_role'],
  ['isolated_test_store_capture_ingest_v1(uuid,integer,jsonb,jsonb)','service_role'],
  ['isolated_sandbox_commerce_v1(text,jsonb,uuid,uuid)','authenticated'],
  ['isolated_sandbox_tips_v1(text,jsonb,uuid,uuid)','authenticated'],
  ['isolated_sandbox_begin_dispatch_v1(text,uuid)',null],
  ['isolated_sandbox_bind_dispatch_v1(text,uuid,text)',null],
  ['isolated_sandbox_ingest_receipt_v1(jsonb)',null],
  ['isolated_test_store_command_v1(uuid,uuid,text,uuid,text,jsonb)',null],
  ['isolated_test_store_ingest_v1(uuid,integer,jsonb,jsonb)',null],
  ['isolated_test_store_command_v2(uuid,uuid,text,uuid,text,jsonb)',null],
  ['isolated_test_store_ingest_v2(uuid,integer,jsonb,jsonb)',null],
  ['isolated_test_store_v2_provisioning_claim_v1(uuid,text,uuid,text)',null],
  ['isolated_test_store_v2_provisioning_record_v1(uuid,jsonb,jsonb)',null],
  ['isolated_test_store_v2_provisioning_next_v1(uuid)',null],
  ['isolated_test_store_v2_provisioning_plan_v1(uuid,uuid)',null],
  ['isolated_test_store_qualification_ingest_v1(uuid,integer,jsonb,jsonb)','service_role'],
  ['isolated_paid_video_v1(text,jsonb,uuid,uuid)',null],
  ['isolated_paid_video_upload_v1(text,uuid,uuid,uuid,uuid,uuid)',null],
  ['isolated_paid_video_worker_v1(text,uuid,uuid,text,text)',null],
  ['isolated_paid_video_access_v3(uuid,uuid,uuid,uuid)',null],
  ['isolated_paid_video_checkout_v3(uuid,uuid,text,uuid,text,jsonb)','service_role'],
  ['isolated_paid_video_abandon_v3(uuid,uuid,text,uuid,text,jsonb)','service_role'],
  ['isolated_paid_video_close_prepared_v3(uuid,uuid,text,uuid,text,jsonb)','service_role'],
  ['isolated_paid_video_resolve_playback_v3(uuid,uuid,text,uuid,text,jsonb)','service_role'],
  ['isolated_paid_video_v2(text,jsonb,uuid,uuid,text)','authenticated'],
  ['isolated_paid_video_upload_v2(text,uuid,uuid,uuid,uuid,uuid,text)','service_role'],
  ['isolated_paid_video_probe_v2(uuid,uuid,uuid,uuid,text)','service_role'],
  ['isolated_paid_video_reconcile_v2(text,text,uuid,uuid)','service_role'],
  ['isolated_paid_video_gateway_access_v2(uuid,uuid,uuid,uuid)','service_role'],
  ['isolated_test_store_command_v3(uuid,uuid,text,uuid,text,jsonb)','service_role'],
  ['isolated_test_store_ingest_v3(uuid,integer,jsonb,jsonb)','service_role'],
  ['isolated_test_store_v3_provisioning_claim_v1(uuid,text,uuid,text)','service_role'],
  ['isolated_test_store_v3_provisioning_record_v1(uuid,jsonb,jsonb)','service_role'],
  ['isolated_test_store_v3_provisioning_next_v1(uuid)','service_role'],
  ['isolated_test_store_v3_provisioning_plan_v1(uuid,uuid)','service_role'],
 ];
 for(const [signature,executor] of publicMatrix){
  const definition=JSON.parse(q(`select json_build_object('owner',pg_get_userbyid(proowner),'definer',prosecdef,'config',proconfig)
   from pg_proc where oid='public.${signature}'::regprocedure;`));
  assert.equal(definition.owner,signature==='isolated_test_store_capture_ingest_v1(uuid,integer,jsonb,jsonb)'?'rcq_v1_owner':'sbx_v1_core_owner');assert.equal(definition.definer,true);
  assert.ok(definition.config.includes('search_path=""'));assert.ok(!definition.config.some(v=>v.startsWith('transaction_timeout=')));
  for(const role of ['anon','authenticated','service_role'])assert.equal(q(`select has_function_privilege('${role}','public.${signature}','EXECUTE');`),role===executor?'t':'f');
 }
 assert.equal(q("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'isolated_sandbox_%' or p.proname like 'isolated_test_store_%' or p.proname like 'isolated_paid_video_%');"),String(publicMatrix.length));
 cases.push({name:'Exact thirty-eight public RPCs have core definer ownership, empty search path, intended authenticated/service ACLs and no timer-restoring SET clause'});
 for(const call of [
  'public.isolated_test_store_command_v1(null,null,null,null,null,null)',
  'public.isolated_test_store_ingest_v1(null,null,null,null)',
  'public.isolated_test_store_command_v2(null,null,null,null,null,null)',
  'public.isolated_test_store_ingest_v2(null,null,null,null)',
  'public.isolated_test_store_v2_provisioning_claim_v1(null,null,null,null)',
  'public.isolated_test_store_v2_provisioning_record_v1(null,null,null)',
  'public.isolated_test_store_v2_provisioning_next_v1(null)',
  'public.isolated_test_store_v2_provisioning_plan_v1(null,null)',
  'public.isolated_test_store_qualification_ingest_v1(null,null,null,null)',
  'public.isolated_paid_video_checkout_v3(null,null,null,null,null,null)',
  'public.isolated_paid_video_abandon_v3(null,null,null,null,null,null)',
  'public.isolated_paid_video_close_prepared_v3(null,null,null,null,null,null)',
  'public.isolated_paid_video_resolve_playback_v3(null,null,null,null,null,null)',
 ].filter(call=>!["isolated_sandbox_commerce_v1", "isolated_sandbox_begin_dispatch_v1", "isolated_sandbox_bind_dispatch_v1", "isolated_sandbox_ingest_receipt_v1", "isolated_test_store_command_v1", "isolated_test_store_ingest_v1", "isolated_test_store_command_v2", "isolated_test_store_ingest_v2", "isolated_test_store_v2_provisioning_claim_v1", "isolated_test_store_v2_provisioning_record_v1", "isolated_test_store_v2_provisioning_next_v1", "isolated_test_store_v2_provisioning_plan_v1"].some(name=>call.startsWith('public.'+name+'('))))rejected(`begin;set local transaction_timeout=8000;set local role service_role;set local request.jwt.claims='{"role":"service_role"}';select ${call};commit;`,/sandbox_timeout_context_invalid/u);
 rejected("begin;set local transaction_timeout=8000;set local role sbx_v1_operator;select sandbox_commerce_v1.test_store_qualification_transition(null);commit;",/sandbox_timeout_context_invalid/u);
 cases.push({name:'All enabled checked Test Store/checkout wrappers and the record-only phase operator reject unknown positive transaction timers before private locks'});

 const postgresHelpers=JSON.parse(q(`select json_agg(p.proname order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='sandbox_commerce_v1' and pg_get_userbyid(p.proowner)='postgres';`));
 const expectedPrivileged=['premium_event_rank','premium_event_is_newer','premium_fresh_authority_allowed','premium_post_quarantine_generation',
  'premium_authority_quarantined','premium_valid_until','premium_current','legal_current','creator_facts_current','assert_authority',
  'creator_capability_read','resource_owner_delivery_deadline'].sort();
 assert.deepEqual(postgresHelpers,expectedPrivileged);
 assert.equal(q("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='sandbox_commerce_v1' and pg_get_userbyid(p.proowner) not in ('postgres','sbx_v1_core_owner');"),'0');
 for(const signature of ['assert_authority(uuid,uuid,text)','creator_capability_read(uuid,uuid)','resource_owner_delivery_deadline(uuid,uuid)'])
  assert.equal(q(`select has_function_privilege('sbx_v1_core_owner','sandbox_commerce_v1.${signature}','EXECUTE');`),'t');
 cases.push({name:'Only the exact twelve source-derived authority helpers transfer to modeled postgres; hostile default EXECUTE never leaks their ACLs'});

 q(fixtures['authority.fixture.sql'].slice(fixtures['authority.fixture.sql'].indexOf('create schema authority_fixture;')));
 // A separate explicitly synthetic qualified V3 fixture now exercises the
 // added public paths with the installed NOSUPERUSER authority/core owners.
 seedV3Qualified(q);
 const declarationResult=JSON.parse(q(actor(seller,sellerSession)+`select public.isolated_sandbox_commerce_v1('creator.declare',${sqlJson({protocol:'sandbox-commerce-v1',requestId:randomUUID(),declared18Plus:true,countryCode:'US',regionCode:'CA',declarationVersion:'adult-us-creator-v1'})},'${seller}','${sellerSession}');`));
 assert.equal(declarationResult.status,'ok');

 const captureSchema='rc_qualification_capture_v1',captureBinding='sandbox-commerce-v1:protocol-3:capture-composed-v1';
 const captureAdmission=project=>q(`begin;set local transaction_timeout='4500ms';set local role sbx_v1_core_owner;select sandbox_commerce_v1.test_store_v3_capture_admitted(${sqlText(project)});commit;`);
 assert.equal(captureAdmission(V3_FIXTURE.projectId),'f');assert.equal(captureAdmission(retainedConnection.projectId),'f');
 assert.deepEqual(captureData(),retainedSnapshot);
 for(const role of ['anon','authenticated','service_role','sbx_v1_core_owner','sbx_v1_operator','rcq_v1_operator'])
  assert.equal(q(`select has_function_privilege('${role}','${captureSchema}.reserve_economic_project(text,text)','EXECUTE');`),'f');
 q(`create role fixture_capture_registrar nologin;grant usage on schema ${captureSchema} to fixture_capture_registrar;
  grant execute on function ${captureSchema}.reserve_economic_project(text,text) to fixture_capture_registrar;`);
 rejected(`set role fixture_capture_registrar;select ${captureSchema}.reserve_economic_project(${sqlText(retainedConnection.projectId)},${sqlText(captureBinding)});`,/duplicate key/u);
 q(`set role fixture_capture_registrar;select ${captureSchema}.reserve_economic_project(${sqlText(V3_FIXTURE.projectId)},${sqlText(captureBinding)});`);
 assert.equal(captureAdmission(V3_FIXTURE.projectId),'t');assert.equal(captureAdmission(retainedConnection.projectId),'f');
 cases.push({name:'Sealed retained capture project remains permanently excluded and cannot be promoted; a distinct fixture-only economic registration is separately required before V3 readiness'});

 const routeId=randomUUID(),workerId=randomUUID(),workerKey=randomBytes(32),verifierId=randomUUID(),verifierKey=randomBytes(32);
 const otherVerifierId=randomUUID(),otherVerifierKey=randomBytes(32),otherRouteId=randomUUID(),combinedCaptures=[];
 q(`insert into sandbox_commerce_v1.paid_video_routes values('${routeId}','s3','synthetic-managed-private-media',${sqlText(syntheticHash('managed-route'))},true);
 insert into sandbox_commerce_v1.paid_video_workers values('${workerId}',decode('${workerKey.toString('hex')}','hex'),${sqlText(syntheticHash('managed-worker'))},true);
 insert into sandbox_commerce_v1.paid_video_verifiers values('${verifierId}',decode('${verifierKey.toString('hex')}','hex'),${sqlText(syntheticHash('managed-verifier'))},true);
 insert into sandbox_commerce_v1.paid_video_verifiers values('${otherVerifierId}',decode('${otherVerifierKey.toString('hex')}','hex'),${sqlText(syntheticHash('managed-other-verifier'))},true);
 update sandbox_commerce_v1.paid_video_gateway_controls set enabled=true,route_id='${routeId}',worker_id='${workerId}',verifier_id='${verifierId}',qualification_sha256=${sqlText(syntheticHash('managed-gateway-qualification'))};`);
 const servicePrefix="set role service_role;set request.jwt.claims='{\"role\":\"service_role\"}';";
 const service=expression=>JSON.parse(q(servicePrefix+'select '+expression+';'));
 const author=(command,values)=>JSON.parse(q(actor(seller,sellerSession)+`select public.isolated_paid_video_v2(${sqlText(command)},${sqlJson({protocol:'isolated-paid-video-v1',requestId:randomUUID(),...values})},'${seller}','${sellerSession}',${sqlText(V3_FIXTURE.configurationDigest)});`));
 const upload=author('upload.reserve',{title:'Synthetic managed permission video',expectedSha256:syntheticHash('managed-bytes'),expectedByteLength:1024}).data.upload;
 const rawUpload=upload.id.slice(12),transferRequest=randomUUID();
 const transfer=service(`public.isolated_paid_video_upload_v2('issue','${rawUpload}','${seller}','${sellerSession}','${transferRequest}',null,${sqlText(V3_FIXTURE.configurationDigest)})`);
 assert.equal(transfer.state,'leased');
 const probe=service(`public.isolated_paid_video_probe_v2('${rawUpload}','${seller}','${sellerSession}','${transferRequest}',${sqlText(V3_FIXTURE.configurationDigest)})`);
 assert.equal(probe.protocol,'scpv-probe-admission-v2');assert.equal(probe.verifierId,verifierId);
 const observation={protocol:'scpv-object-observation-v2',userId:seller,sessionId:sellerSession,uploadId:upload.id,
  requestId:transferRequest,transferId:transfer.transferId,originalSessionId:sellerSession,configurationDigest:V3_FIXTURE.configurationDigest,
  originalConfigurationDigest:V3_FIXTURE.configurationDigest,verifierId,incarnation:upload.incarnation,sha256:syntheticHash('managed-bytes'),byteLength:1024,
  objectVersion:'synthetic-managed-version',checkedAtMs:Date.now(),expiresAtMs:probe.validUntilMs};
 const observationRaw=JSON.stringify(observation),observationSignature=createHmac('sha256',verifierKey).update(observationRaw).digest('hex');
 const receipt=service(`public.isolated_paid_video_reconcile_v2(${sqlText(observationRaw)},${sqlText(observationSignature)},'${seller}','${sellerSession}')`);
 assert.equal(receipt.state,'recorded');assert.equal(receipt.transferId,transfer.transferId);
 combinedCaptures.push({kind:'upload-receipt',transfer,probe,receipt});
 author('upload.finalize',{uploadId:upload.id});
 // Private fixture-only scan ingress. Actual operations HTTP/worker is a separate proof.
 const fixtureScan=expression=>JSON.parse(q("begin;set local transaction_timeout='4500ms';set local role sbx_v1_core_owner;set local request.jwt.claims='{\"role\":\"service_role\"}';select "+expression+';commit;'));
 const ticket=fixtureScan(`sandbox_commerce_v1.paid_video_lease('${upload.id.slice(12)}','${workerId}')`);
 const signed=signScanResult({key:workerKey,ticketId:ticket.ticketId,uploadId:upload.id,incarnation:upload.incarnation,objectVersion:'synthetic-managed-version',result:{
  protocol:'scpv-byte-scan-v1',profile:'scpv-mp4-h264-aac-v1',sha256:syntheticHash('managed-bytes'),byteLength:1024,checkedAt:new Date().toISOString(),
  definitions:{protocol:'scpv-definition-manifest-v1',files:[{filename:'daily.cvd',createdAt:new Date().toISOString()}],manifestSha256:syntheticHash('managed-definitions')},
  moderation:'unreviewed',verdict:'clean',reason:'exact_bytes_scanned',media:{durationMs:1000,width:320,height:180,framesPerSecond:24,videoCodec:'h264',pixelFormat:'yuv420p',audioCodec:null}}});
 fixtureScan(`sandbox_commerce_v1.paid_video_scan_ingest(${sqlText(signed.raw)},${sqlText(signed.signature)})`);
 q(`set role sbx_v1_core_owner;select sandbox_commerce_v1.paid_video_moderate('${upload.id.slice(12)}','clear',${sqlText(syntheticHash('managed-moderation'))});`);
 const offer=author('offer.publish',{uploadId:upload.id,expectedRevision:1,amountMinor:199,currency:'usd'}).data.offer;
 const checkoutExpression=(command,payload,request=randomUUID())=>`public.${command==='abandon'?'isolated_paid_video_abandon_v3':'isolated_paid_video_checkout_v3'}('${buyer}','${buyerSession}',${sqlText(command)},'${request}',${sqlText(V3_FIXTURE.configurationDigest)},${sqlJson(payload)})`;
 const captureCheckout=(command,payload,request,result)=>combinedCaptures.push({kind:'checkout',input:{actor:{userId:buyer,sessionId:buyerSession},request:{protocol:'isolated-paid-video-checkout-v3',command,payload,requestId:request,configurationDigest:V3_FIXTURE.configurationDigest,expectedSessionId:buyerSession}},result});
 const checkout=(command,payload,request=randomUUID())=>{const result=service(checkoutExpression(command,payload,request));captureCheckout(command,payload,request,result);return result;};
 const offered=checkout('offer',{offerId:offer.id});assert.equal(offered.data.preparationAllowed,true);
 const quotedPayload={offerId:offer.id,expectedQuote:offered.data.quote};
 const repo=path.resolve(root,'../..'),edgeFiles=[...new Set([...providerSources(repo),...receiptSources(repo),path.join(repo,'supabase/functions/_shared/isolated-test-store-v3-command.ts')])];
 const edgeHashes=Object.fromEntries(edgeFiles.map(file=>[path.relative(repo,file),hash(fs.readFileSync(file))]));
 const load=createV3SourceLoader(edgeFiles),api=createV3CommandApi(q),provider=createV3ProviderFixture(q,repo,load),receipts=createV3ReceiptFixture(q,api,repo);
 const baselineAuthority=legacyAuthoritySnapshot(q),prepareRequest=randomUUID();
 const prepared=checkout('prepare',quotedPayload,prepareRequest).data.intent;
 const customer=api.call('bind',{installationId:randomUUID()}).result.customer;
 let allocation=api.call('allocate',{customerBindingId:customer.id,intentId:prepared.id,expectedQuote:offered.data.quote}).result.allocation;
 await provider.registerPlan(allocation);allocation=api.call('read',{intentId:prepared.id}).result.allocation;
 const claim=api.call('claim',{intentId:prepared.id,dispatchId:allocation.dispatchId,registrationId:allocation.registration.id,expectedQuote:offered.data.quote}).result;
 assert.equal(claim.dispatchAllowed,true);
 const context={intent:prepared,quote:offered.data.quote,customer,allocation,claim},purchase=receipts.event(context),evidence=await receipts.evidence(purchase);
 const captureRowLock=heldSession(`begin;select project_id from ${captureSchema}.project_reservations where project_id=${sqlText(V3_FIXTURE.projectId)} for update;`);await captureRowLock.ready();
 const deferred=receipts.ingestEvidence(evidence);assert.equal(deferred.status,'recorded');
 assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v3_effects where ingress_id='${deferred.receiptId}';`),'0');
 captureRowLock.child.stdin.end('rollback;\n');assert.equal((await captureRowLock.closed).code,0);
 const identity=JSON.parse(q('select row_to_json(i) from sandbox_commerce_v1.test_store_v3_capture_identity i;'));
 assert.equal(identity.source_sha256,profileManifest.installationSourceSha256);
 assert.notEqual(identity.source_sha256,'09c284aa0b56536f6975ef3debb86d1b29f157f04c3b1a1593fec8e7b8d5e563');
 const target={protocol:'scv3-capture-recovery-target-v1',installationId:identity.installation_id,sourceSha256:identity.source_sha256,
  consumerBinding:captureBinding,projectId:V3_FIXTURE.projectId,connectionId:receipts.connection.connectionId,connectionRevision:1,
  providerConfigurationDigest:receipts.connection.providerConfigurationDigest};
 const pending=service(`public.isolated_test_store_capture_pending_v3(${sqlJson(target)},null,16)`);assert.equal(pending.rows[0].ingressId,deferred.receiptId);
 const deliveries=q('select count(*) from sandbox_commerce_v1.test_store_v3_deliveries;');
 rejected(servicePrefix+`select public.isolated_test_store_capture_reconcile_v3(${sqlJson({...target,sourceSha256:'09c284aa0b56536f6975ef3debb86d1b29f157f04c3b1a1593fec8e7b8d5e563'})},'${deferred.receiptId}');`,/test_store_v3_capture_recovery_target_mismatch/u);
 assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v3_deliveries;'),deliveries);
 const providerCalls=provider.calls.length;
 const reconciled=service(`public.isolated_test_store_capture_reconcile_v3(${sqlJson(target)},'${deferred.receiptId}')`);
 assert.equal(reconciled.result.receiptId,deferred.receiptId);assert.equal(receipts.effect(deferred.receiptId).projection.state,'verified');
 assert.equal(provider.calls.length,providerCalls);
 assert.equal(service(`public.isolated_test_store_capture_reconcile_v3(${sqlJson(target)},'${deferred.receiptId}')`).result.status,'duplicate');
 const receiptId=receipts.effect(deferred.receiptId).projection.receiptId;
 const grantId=q(`select id from sandbox_commerce_v1.resource_grants where receipt_id='${receiptId}';`);
 const access=service(`public.isolated_paid_video_gateway_access_v2('${buyer}','${buyerSession}','${offer.resourceId.slice(14)}','${grantId}')`);
 assert.equal(access.grantId,'scv1_grant_'+grantId);assert.equal(access.media.assetId,offered.data.quote.asset.id);
 assert.equal(checkout('recover',{originalRequestId:prepareRequest}).data.intent.state,'verified');
 assert.equal((await receipts.ingest(purchase)).status,'duplicate');
 const refunded=await receipts.ingest({...purchase,id:randomUUID(),type:'CANCELLATION',cancel_reason:'CUSTOMER_SUPPORT',price_in_purchased_currency:-1.99,event_timestamp_ms:Date.now()});
 assert.equal(receipts.effect(refunded.receiptId).projection.state,'refunded');
 rejected(servicePrefix+`select public.isolated_paid_video_gateway_access_v2('${buyer}','${buyerSession}','${offer.resourceId.slice(14)}','${grantId}');`,/paid_video_current_receipt_required/u);
 assert.equal(legacyAuthoritySnapshot(q),baselineAuthority);assert.equal(q(`select count(*) from public.user_entitlements where user_id='${buyer}';`),'0');
 cases.push({name:'Exact retained profile supports public authoring/upload receipts, provider fixture registration, one-use claim, deferred encrypted purchase, target-bound stored reconciliation, grant/current access and raw refund; bootstrap witness cannot adopt retained mode and local reconciliation sends no provider work'});
 const finalCapture=captureData();
 for(const table of captureTables){
  if(table==='project_reservations'){
   assert.equal(finalCapture[table].length,retainedSnapshot[table].length+1);
   assert.deepEqual(finalCapture[table].filter(row=>row.project_id!==V3_FIXTURE.projectId),retainedSnapshot[table]);
  }else assert.deepEqual(finalCapture[table],retainedSnapshot[table]);
 }
 assert.equal(new TextDecoder().decode(await retainedApi.qualification.decryptQualificationEnvelope(JSON.parse(q(`select envelope from ${retainedCaptureSchema}.test_store_qualification_entries;`)),retainedConnection)),retainedRaw);
 for(const file of captureFixtureSourceFiles)assert.equal(hash(fs.readFileSync(file)),captureFixtureSourceHashes[file]);
 for(const file of edgeFiles)assert.equal(hash(fs.readFileSync(file)),edgeHashes[path.relative(repo,file)]);
 for(const f of ordered)assert.equal(hash(fs.readFileSync(sourcePath(f),'utf8')),hash(files[f]),`Source changed during test: ${f}`);
 cases.push({name:'After complete economic flow every preexisting sealed capture row and original encrypted bytes remain identical; the only added capture-owned data is the distinct explicitly registered synthetic economic reservation'});
 report={status:'passed',engine:version,scope:'Retained independent capture plus fresh V3 local PG17.6 managed installation/integration; no hosted target, provider activation or release',
  assumptions:['Modeled postgres is NOSUPERUSER CREATEROLE BYPASSRLS NOINHERIT; fixture administrator supplies synthetic shared projections',
   'Capture metadata verification reads only the exact newly owned namespace, roles and one public ingest RPC inside this disposable database; no denied broad production read',
   'Actual capture Edge encryption/parser and SQL ingest produce retained evidence; provider bytes and credentials are synthetic',
   'Public authoring/upload HMAC receipt and V3 source worker/parser/SQL run against synthetic object/provider fixtures; private core scanner/moderation fixture calls do not qualify operations HTTP or an actual scanner',
   'The retained mode has its own source witness; direct synthetic registrar authority is absent from product installation',
   'No actual RevenueCat/device/provider, production permission or deployment-readiness claim'],
  caseCount:cases.length,cases,combinedCaptures,edgeHashes,installationSourceSha256:profileManifest.installationSourceSha256,
  profileManifestSha256:hash(profileManifestRaw),orderedModules:profileManifest.executedModules,
  retainedCaptureDataSha256:hash(JSON.stringify(retainedSnapshot)),retainedCaptureCounts:Object.fromEntries(captureTables.map(t=>[t,retainedSnapshot[t].length])),
  captureFixtureSourceHashes,retainedCaptureSourceSha256:hash(retainedCaptureSource),
  sourceHashes:Object.fromEntries(ordered.map(f=>[f,hash(files[f])])),fixtureHashes:Object.fromEntries(fixtureFiles.map(f=>[f,hash(fixtures[f])])),
  harnessHash:hash(fs.readFileSync(fileURLToPath(import.meta.url)))};

} catch(error) {
 primaryFailure=error;
 if(startAttempted&&!started){
  let fd;
  try{const file=path.join(directory,'server.log');fd=fs.openSync(file,'r');const size=fs.fstatSync(fd).size,bytes=Buffer.alloc(Math.min(size,32768));
   fs.readSync(fd,bytes,0,bytes.length,Math.max(0,size-bytes.length));startupLog={path:file,available:true,truncated:size>bytes.length,text:bounded(bytes.toString('utf8'))};
  }catch(error){startupLog={available:false,error:bounded(error.code??error.name)};}finally{if(fd!==undefined)fs.closeSync(fd);}
 }
} finally {
 try {
 for(const child of children)if(child.exitCode===null){child.stdin.end('rollback;\n');child.kill('SIGTERM');}
 cleanup.sessionsClosed=children.every(child=>child.exitCode!==null||child.signalCode!==null);
 assert.ok(!initializationAttempted||initialized,'Failed bootstrap may have delayed descendants; preserve directory');
 if(startAttempted){let s=run('pg_ctl',['-D',data,'status']);if(s.status===0){invoke('pg_ctl',['-D',data,'-m','immediate','-w','-t','15','stop']);cleanup.clusterStopped=true;s=run('pg_ctl',['-D',data,'status']);}else if(started&&s.status===3)cleanup.clusterStopped=true;assert.equal(s.status,3,'Local status uncertain; preserve data');assert.ok(started,'Uncertain start: preserve data');cleanup.clusterNotRunningVerified=true;}else {cleanup.clusterStopped=true;cleanup.clusterNotRunningVerified=true;}
 cleanup.sessionsClosed=cleanup.clusterNotRunningVerified;
 fs.rmSync(directory,{recursive:true});cleanup.directoryRemoved=true;
 fs.rmSync(socket,{recursive:true});
 } catch(error){cleanupFailure=error;}
}
if(primaryFailure||cleanupFailure){
 process.stderr.write('MANAGED_BOOTSTRAP_DIAGNOSTICS '+JSON.stringify({phase,directory,socketDirectory:socket,
  directoryPreserved:fs.existsSync(directory),socketDirectoryPreserved:fs.existsSync(socket),initializationAttempted,initialized,
  startAttempted,started,commands:bootstrapCommands,serverLog:startupLog,cleanup,
  primaryFailure:primaryFailure?{name:primaryFailure.name,message:bounded(primaryFailure.message)}:null,
  cleanupFailure:cleanupFailure?{name:cleanupFailure.name,message:bounded(cleanupFailure.message)}:null})+'\n');
 throw primaryFailure??cleanupFailure;
}
assert.ok(report);process.stdout.write(JSON.stringify({...report,durationMs:Date.now()-begun,cleanup},null,2)+'\n');
