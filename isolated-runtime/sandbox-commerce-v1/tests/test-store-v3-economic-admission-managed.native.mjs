#!/usr/bin/env node
// Final economic admission managed fixture; prior source ancestry managed-install.native.mjs SHA256 0f6c563db35bc8c67c2a7de40fa0a2d18f5306e0a62be9656360ce64cdac6111.
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

assert.equal(process.argv.length,6,'Only --local-bin /absolute/path --v2-reference /absolute/path is accepted');
assert.equal(process.argv[4],'--v2-reference'); const reference=process.argv[5]; assert.ok(path.isAbsolute(reference));
assert.equal(process.argv[2],'--local-bin');
const bin=process.argv[3];assert.ok(path.isAbsolute(bin));
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const ordered=['core.sql','premium-authority.sql','authority.sql','commands.sql','receipts.sql','test-store.sql',
 'test-store-offerings-core.sql','test-store-qualification.sql','test-store-offerings-commands.sql','test-store-offerings-provisioning.sql','test-store-offerings-receipts.sql',
 'history.sql','resource-graphs.sql','delivery-authority.sql',
 'paid-video-install-context-v2.sql','paid-video-install-grant-v2.sql','paid-video-media.sql','paid-video-upload.sql','paid-video-commands.sql','paid-video-install-revoke-v2.sql','test-store-paid-video-core.sql',
 'candidates/paid-video-plan-lifecycle/lifecycle.sql','candidates/paid-video-combined-readiness/commands.sql','candidates/paid-video-checkout-recovery/abandon.sql',
 'candidates/paid-video-combined-readiness/provisioning.sql','test-store-paid-video-receipts.sql','paid-video-install-grant-v2.sql','paid-video-access.sql','candidates/paid-video-combined-readiness/gateway.sql','candidates/paid-video-combined-readiness/media.sql','paid-video-install-revoke-v2.sql','permissions-finalize.sql'];
const frozen=JSON.parse(fs.readFileSync(path.join(reference,'manifest.json'),'utf8'));
const sourcePath=f=>Object.hasOwn(frozen.files,'isolated-runtime/sandbox-commerce-v1/'+f)?path.join(reference,'isolated-runtime/sandbox-commerce-v1',f):path.join(root,f);
for(const [name,expected] of Object.entries(frozen.files)) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(reference,name))).digest('hex'),expected);
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
const noInstalledObjects=()=>{
 assert.equal(q("select count(*) from pg_namespace where nspname='sandbox_commerce_v1';"),'0');
 assert.equal(q("select count(*) from pg_roles where rolname in('sbx_v1_core_owner','sbx_v1_authority_owner','sbx_v1_operator');"),'0');
 assert.equal(q("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'isolated_sandbox_%' or p.proname like 'isolated_test_store_%' or p.proname like 'isolated_paid_video_%');"),'0');
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

 const rest=ordered.slice(1).map(f=>files[f]).join('\n');
 const membershipGrant='grant sbx_v1_core_owner,sbx_v1_authority_owner to postgres with inherit true, set true;\n';
 const schemaGrant='grant usage,create on schema sandbox_commerce_v1 to postgres;\n';
 assert.ok(files['core.sql'].includes(membershipGrant));assert.ok(files['core.sql'].includes(schemaGrant));
 const unprivilegedCore=files['core.sql'].replace(membershipGrant,'').replace(schemaGrant,'');
 const base=attempt(unprivilegedCore+rest);
 assert.notEqual(base.status,0);assert.match(base.stderr,/must be able to SET ROLE/u);
 noInstalledObjects();
 cases.push({name:'Negative control removing explicit source installer grants refuses as modeled non-superuser postgres',stderr:base.stderr.trim()});
 const membership='grant sbx_v1_core_owner,sbx_v1_authority_owner to postgres with set true;\n';
 const coreWithMembership=unprivilegedCore.replace('create schema sandbox_commerce_v1 authorization sbx_v1_core_owner;',membership+'create schema sandbox_commerce_v1 authorization sbx_v1_core_owner;');
 const onlyMembership=attempt(coreWithMembership+rest);
 assert.notEqual(onlyMembership.status,0);assert.match(onlyMembership.stderr,/permission denied for schema sandbox_commerce_v1/u);
 noInstalledObjects();
 cases.push({name:'SET-only membership does not supply inherited schema-owner privileges required by source GRANT operations',stderr:onlyMembership.stderr.trim()});

 // Fail after every module has been installed, not just during its first DDL.
 const lateFailure=attempt(files['core.sql']+rest+"do $$begin raise exception 'combined_install_injected_failure';end$$;");
 assert.notEqual(lateFailure.status,0);assert.match(lateFailure.stderr,/combined_install_injected_failure/u);noInstalledObjects();
 cases.push({name:'Late failure after all combined source files rolls back every new schema, role, helper and public wrapper'});

 // This is the unmodified, current combined successor source bundle, with the actual
 // finalizer executed before the same install transaction commits.
 const good=attempt(files['core.sql']+rest);assert.equal(good.status,0,`${good.error?.message??''}\n${good.stderr}`);
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
  ['isolated_sandbox_commerce_v1(text,jsonb,uuid,uuid)','authenticated'],
  ['isolated_sandbox_tips_v1(text,jsonb,uuid,uuid)','authenticated'],
  ['isolated_sandbox_begin_dispatch_v1(text,uuid)','service_role'],
  ['isolated_sandbox_bind_dispatch_v1(text,uuid,text)','service_role'],
  ['isolated_sandbox_ingest_receipt_v1(jsonb)','service_role'],
  ['isolated_test_store_command_v1(uuid,uuid,text,uuid,text,jsonb)','service_role'],
  ['isolated_test_store_ingest_v1(uuid,integer,jsonb,jsonb)','service_role'],
  ['isolated_test_store_command_v2(uuid,uuid,text,uuid,text,jsonb)','service_role'],
  ['isolated_test_store_ingest_v2(uuid,integer,jsonb,jsonb)','service_role'],
  ['isolated_test_store_v2_provisioning_claim_v1(uuid,text,uuid,text)','service_role'],
  ['isolated_test_store_v2_provisioning_record_v1(uuid,jsonb,jsonb)','service_role'],
  ['isolated_test_store_v2_provisioning_next_v1(uuid)','service_role'],
  ['isolated_test_store_v2_provisioning_plan_v1(uuid,uuid)','service_role'],
  ['isolated_test_store_qualification_ingest_v1(uuid,integer,jsonb,jsonb)','service_role'],
  ['isolated_paid_video_v1(text,jsonb,uuid,uuid)',null],
  ['isolated_paid_video_upload_v1(text,uuid,uuid,uuid,uuid,uuid)',null],
  ['isolated_paid_video_worker_v1(text,uuid,uuid,text,text)','service_role'],
  ['isolated_paid_video_access_v3(uuid,uuid,uuid,uuid)',null],
  ['isolated_paid_video_checkout_v3(uuid,uuid,text,uuid,text,jsonb)','service_role'],
  ['isolated_paid_video_abandon_v3(uuid,uuid,text,uuid,text,jsonb)','service_role'],
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
  assert.equal(definition.owner,'sbx_v1_core_owner');assert.equal(definition.definer,true);
  assert.ok(definition.config.includes('search_path=""'));assert.ok(!definition.config.some(v=>v.startsWith('transaction_timeout=')));
  for(const role of ['anon','authenticated','service_role'])assert.equal(q(`select has_function_privilege('${role}','public.${signature}','EXECUTE');`),role===executor?'t':'f');
 }
 assert.equal(q("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'isolated_sandbox_%' or p.proname like 'isolated_test_store_%' or p.proname like 'isolated_paid_video_%');"),String(publicMatrix.length));
 cases.push({name:'Exact thirty-one public RPCs have core definer ownership, empty search path, intended authenticated/service ACLs and no timer-restoring SET clause'});
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
 ])rejected(`begin;set local transaction_timeout=8000;set local role service_role;set local request.jwt.claims='{"role":"service_role"}';select ${call};commit;`,/sandbox_timeout_context_invalid/u);
 rejected("begin;set local transaction_timeout=8000;set local role sbx_v1_operator;select sandbox_commerce_v1.test_store_qualification_transition(null);commit;",/sandbox_timeout_context_invalid/u);
 cases.push({name:'All eleven checked Test Store/checkout wrappers and the record-only phase operator reject unknown positive transaction timers before private locks'});

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

 // Seed the same minimum authority projections after finalization as fixture_admin.
 // The actual app/public/private functions still execute under their modeled
 // NOSUPERUSER owners; this fixture setup does not grant an application shortcut.
 q(fixtures['authority.fixture.sql'].slice(fixtures['authority.fixture.sql'].indexOf('create schema authority_fixture;')));
 q(`select authority_fixture.reset();insert into auth.users(id,email_confirmed_at,raw_app_meta_data)values('${buyer}',clock_timestamp(),'{}');
  insert into auth.sessions values('${buyerSession}','${buyer}',clock_timestamp()+interval '1 hour');
  insert into public.wave1_legal_acceptances select '${buyer}','${buyerSession}',document_key,version,market,capability,'member',null
  from public.wave1_legal_document_versions where capability='account';`);
 const capability=JSON.parse(q(actor()+historyCall()));assert.equal(capability.status,'ok');assert.equal(capability.actor.userId,buyer);
 assert.equal(capability.data.generationState,'disabled');assert.equal(capability.data.canAuthor,false);assert.equal(capability.data.canReadHistory,true);
 const history=JSON.parse(q(actor()+historyCall('history.read',{role:'buyer',cursor:null,limit:2})));assert.equal(history.status,'ok');
 cases.push({name:'Actual finalized history and capability RPCs execute through the non-super authority owner for a free buyer while generation remains disabled'});

 q('revoke select on auth.users from postgres;');
 rejected(actor()+historyCall(),/permission denied for table users/u);
 q('grant select on auth.users to postgres;');
 assert.equal(JSON.parse(q(actor()+historyCall())).status,'ok');
 cases.push({name:'Removing a required modeled shared-table SELECT fails closed; BYPASSRLS alone cannot fabricate authority'});

 const rId=randomUUID(),catalogId=randomUUID(),offerId=randomUUID(),intentId=randomUUID(),receiptId=randomUUID(),assetId=randomUUID(),incarnation=randomUUID();
 const objectKey=`sandbox-commerce-v1/${seller}/scv1_resource_${rId}/scv1_asset_${assetId}/bytes.mp4`;
 q(`insert into sandbox_commerce_v1.resources(id,creator_id,kind,title,status)values('${rId}','${seller}','paid_content','Synthetic combined video','published');
 insert into sandbox_commerce_v1.resource_versions(resource_id,revision,creator_id,kind,title,price_minor,currency)values('${rId}',1,'${seller}','paid_content','Synthetic combined video',99,'usd');
 insert into sandbox_commerce_v1.catalog values('${catalogId}','paid_content','stripe','synthetic-managed-scope','stripe','synthetic-managed-video',99,'usd');
 insert into sandbox_commerce_v1.offers(id,resource_id,resource_revision,catalog_id)values('${offerId}','${rId}',1,'${catalogId}');
 insert into sandbox_commerce_v1.intents(id,buyer_id,buyer_session_id,offer_id,offer_revision,resource_id,resource_revision,creator_id,kind,provider,scope_key,store,product_id,amount_minor,currency,state)
 values('${intentId}','${buyer}','${buyerSession}','${offerId}',1,'${rId}',1,'${seller}','paid_content','stripe','synthetic-managed-scope','stripe','synthetic-managed-video',99,'usd','verified');
 insert into sandbox_commerce_v1.receipts values('${receiptId}','${intentId}','stripe','synthetic-managed-scope','stripe','synthetic-managed-video','synthetic-transaction','synthetic-transaction','verified',clock_timestamp()-interval '1 second',null,clock_timestamp());
 insert into sandbox_commerce_v1.delivery_assets(id,resource_id,resource_revision,owner_id,purpose,provider,bucket,object_key,object_version,incarnation,sha256,byte_length,state,moderation)
 values('${assetId}','${rId}',1,'${seller}','video','s3','synthetic-private',${literal(objectKey)},'immutable-1','${incarnation}',repeat('a',64),123,'retained','clear');
 insert into sandbox_commerce_v1.delivery_asset_scans values('${assetId}','${incarnation}','s3','synthetic-private',${literal(objectKey)},'immutable-1',repeat('a',64),123,'clean','synthetic-scanner',clock_timestamp()-interval '1 second');
 insert into sandbox_commerce_v1.video_terms values('${rId}',1,'${assetId}','paid');`);
 assert.equal(JSON.parse(q(`select sandbox_commerce_v1.settle_resource_receipt('${receiptId}');`)).status,'settled');
 const deliver=`select sandbox_commerce_v1.authorize_resource_delivery('${buyer}','${buyerSession}','${rId}',1,'${rId}',1,'play_video');`;
 const delivery=JSON.parse(q(deliver));assert.equal(delivery.eligibleForIssuer,true);assert.equal(delivery.authorizationProof,false);assert.equal(delivery.grantsAccess,false);
 cases.push({name:'Actual combined grant settlement and retained media fact authorization execute after finalization under restricted owners using explicitly synthetic receipt/scan rows'});

 const freeWriter=()=>q('begin;lock table auth.users in row exclusive mode nowait;rollback;');
 rejected('begin;set local transaction_timeout=8000;'+actor()+historyCall()+'commit;',/sandbox_timeout_context_invalid/u);assert.equal(freeWriter(),'');
 cases.push({name:'Actual history public RPC rejects unknown positive transaction timer before shared locks'});
 const idle=heldSession('begin;'+actor()+historyCall());await idle.ready();
 rejected('begin;lock table auth.users in row exclusive mode nowait;rollback;',/could not obtain lock/u);
 await sleep(5250);assert.equal(freeWriter(),'');if(idle.child.exitCode===null)idle.child.stdin.end('select 1;\n');
 const idleResult=await idle.closed;assert.notEqual(idleResult.code,0);assert.match(idleResult.stderr,/25P04.*transaction timeout/u);
 cases.push({name:'Actual combined history RPC retains its post-return transaction timer and releases modeled shared authority fences on timeout',sqlstate:'25P04'});
 const committed=q('begin;'+actor()+historyCall()+'commit;reset role;select current_setting(\'transaction_timeout\');');
 assert.match(committed,/\n0$/u);assert.equal(freeWriter(),'');
 cases.push({name:'Successful combined history RPC commit resets the connection timer and releases authority fences'});

 q("grant sbx_v1_operator to postgres with set true;set role sbx_v1_operator;select sandbox_commerce_v1.transition('disabled','retired');reset role;grant sbx_v1_operator to postgres with set false;",'postgres');
 assert.equal(q('select state from sandbox_commerce_v1.lifecycle;'),'retired');
 const original=JSON.parse(q(actor()+historyCall()));assert.equal(original.data.generationState,'retired');assert.equal(original.data.canReadHistory,true);
 const createPayload={protocol:'sandbox-commerce-v1',requestId:randomUUID(),kind:'creator_tip',title:'Must remain retired'};
 rejected(actor(seller,sellerSession)+`select public.isolated_sandbox_commerce_v1('resource.create',${literal(JSON.stringify(createPayload))}::jsonb,'${seller}','${sellerSession}');`,/sandbox_generation_inactive/u);
 q(`delete from public.user_entitlements where user_id='${seller}';`);assert.equal(JSON.parse(q(deliver)).eligibleForIssuer,true);
 assert.equal(q('select count(*) from sandbox_commerce_v1.provider_routes;'),'0');
 assert.equal(q("select string_agg(state,',' order by key) from public.platform_money_kill_switches;"),'off,off,off');
 cases.push({name:'Combined irreversible retirement blocks initiation while owner history and retained receipt delivery survive seller Premium loss; all live money controls remain off'});
 // A separate explicitly synthetic qualified V3 fixture now exercises the
 // added public paths with the installed NOSUPERUSER authority/core owners.
 seedV3Qualified(q);
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
 const ticket=service(`public.isolated_paid_video_worker_v1('lease','${upload.id.slice(12)}','${workerId}',null,null)`);
 const signed=signScanResult({key:workerKey,ticketId:ticket.ticketId,uploadId:upload.id,incarnation:upload.incarnation,objectVersion:'synthetic-managed-version',result:{
  protocol:'scpv-byte-scan-v1',profile:'scpv-mp4-h264-aac-v1',sha256:syntheticHash('managed-bytes'),byteLength:1024,checkedAt:new Date().toISOString(),
  definitions:{protocol:'scpv-definition-manifest-v1',files:[{filename:'daily.cvd',createdAt:new Date().toISOString()}],manifestSha256:syntheticHash('managed-definitions')},
  moderation:'unreviewed',verdict:'clean',reason:'exact_bytes_scanned',media:{durationMs:1000,width:320,height:180,framesPerSecond:24,videoCodec:'h264',pixelFormat:'yuv420p',audioCodec:null}}});
 service(`public.isolated_paid_video_worker_v1('result',null,null,${sqlText(signed.raw)},${sqlText(signed.signature)})`);
 q(`set role sbx_v1_operator;select sandbox_commerce_v1.paid_video_moderate('${upload.id.slice(12)}','clear',${sqlText(syntheticHash('managed-moderation'))});`);
 const offer=author('offer.publish',{uploadId:upload.id,expectedRevision:1,amountMinor:199,currency:'usd'}).data.offer;
 const checkoutExpression=(command,payload,request=randomUUID())=>`public.${command==='abandon'?'isolated_paid_video_abandon_v3':'isolated_paid_video_checkout_v3'}('${buyer}','${buyerSession}',${sqlText(command)},'${request}',${sqlText(V3_FIXTURE.configurationDigest)},${sqlJson(payload)})`;
 const captureCheckout=(command,payload,request,result)=>combinedCaptures.push({kind:'checkout',input:{actor:{userId:buyer,sessionId:buyerSession},request:{protocol:'isolated-paid-video-checkout-v3',command,payload,requestId:request,configurationDigest:V3_FIXTURE.configurationDigest,expectedSessionId:buyerSession}},result});
 const checkout=(command,payload,request=randomUUID())=>{const result=service(checkoutExpression(command,payload,request));captureCheckout(command,payload,request,result);return result;};
 const offered=checkout('offer',{offerId:offer.id});assert.equal(offered.data.preparationAllowed,true);
 const quotedPayload={offerId:offer.id,expectedQuote:offered.data.quote};
 q(`insert into sandbox_commerce_v1.paid_video_routes values('${otherRouteId}','s3','synthetic-managed-other-route',${sqlText(syntheticHash('managed-other-route'))},true);`);
 const corruptedRaw=JSON.stringify({...observation,incarnation:randomUUID()});
 const corruptedSignature=createHmac('sha256',verifierKey).update(corruptedRaw).digest('hex');
 const faultControls=[
  {name:'gateway_disabled',sql:'update sandbox_commerce_v1.paid_video_gateway_controls set enabled=false;'},
  {name:'verifier_retired',sql:`update sandbox_commerce_v1.paid_video_verifiers set active=false where id='${verifierId}';`},
  {name:'current_verifier_mismatch',sql:`update sandbox_commerce_v1.paid_video_gateway_controls set verifier_id='${otherVerifierId}';`},
  {name:'current_route_mismatch',sql:`update sandbox_commerce_v1.paid_video_gateway_controls set route_id='${otherRouteId}';`},
  {name:'scanner_retired',sql:`update sandbox_commerce_v1.paid_video_workers set active=false where id='${workerId}';`},
  {name:'missing_receipt',sql:`delete from sandbox_commerce_v1.paid_video_object_receipts where upload_id='${rawUpload}';`,inject:true},
  {name:'receipt_signature_tampered',sql:`update sandbox_commerce_v1.paid_video_object_receipts set signature='${'0'.repeat(64)}' where upload_id='${rawUpload}';`,inject:true},
  {name:'valid_hmac_wrong_exact_incarnation',sql:`update sandbox_commerce_v1.paid_video_object_receipts set observation_raw=${sqlText(corruptedRaw)},signature=${sqlText(corruptedSignature)} where upload_id='${rawUpload}';`,inject:true},
  {name:'receipt_verifier_mismatch',sql:`update sandbox_commerce_v1.paid_video_object_receipts set verifier_id='${otherVerifierId}' where upload_id='${rawUpload}';`,inject:true},
  {name:'receipt_version_mismatch',sql:`update sandbox_commerce_v1.paid_video_object_receipts set object_version='synthetic-wrong-version' where upload_id='${rawUpload}';`,inject:true},
  {name:'scan_signature_tampered',sql:`update sandbox_commerce_v1.paid_video_scan_results set signature='${'0'.repeat(64)}' where ticket_id='${ticket.ticketId}';`,inject:true},
 ];
 for(const fault of faultControls){
  if(fault.inject) rejected('begin;'+fault.sql+'rollback;',/sandbox_resource_identity_immutable/u);
  // Explicit administrative negative-state injection inside a local rollback
  // transaction only. Product triggers are restored BEFORE the actual RPC.
  const prefix='begin;'+(fault.inject?'set local session_replication_role=replica;':'')+fault.sql+(fault.inject?'set local session_replication_role=origin;':'');
  const request=randomUUID(),failed=JSON.parse(q(prefix+servicePrefix+'select '+checkoutExpression('offer',{offerId:offer.id},request)+';rollback;'));
  assert.equal(failed.data.preparationAllowed,false,fault.name);captureCheckout('offer',{offerId:offer.id},request,failed);
  rejected(prefix+servicePrefix+'select '+checkoutExpression('prepare',quotedPayload)+';commit;',/paid_video_verified_media_required/u);
  assert.equal(checkout('offer',{offerId:offer.id}).data.preparationAllowed,true,'Rollback restores exact prior facts: '+fault.name);
 }
 assert.equal(q('select count(*) from sandbox_commerce_v1.intents where provider=\'revenuecat\' and store=\'test_store\';'),'0');
 cases.push({name:'Eleven independent current gateway/verifier/route/scanner/receipt fault controls deny offer readiness and actual preparation, including valid-HMAC wrong tuple; immutable writes reject normally and administrative fault injections roll back',controls:faultControls.map(f=>f.name)});
 const finishHeld=async held=>{held.child.stdin.end('commit;\n');const finished=await held.closed;assert.equal(finished.code,0,finished.stderr);};
 for(const [name,mutation] of [
  ['gateway','update sandbox_commerce_v1.paid_video_gateway_controls set enabled=false;'],
  ['verifier',`update sandbox_commerce_v1.paid_video_verifiers set active=false where id='${verifierId}';`],
 ]){
  const retiring=heldSession("begin;set local idle_in_transaction_session_timeout='5s';"+mutation);await retiring.ready();
  rejected(servicePrefix+'select '+checkoutExpression('prepare',quotedPayload)+';',/could not obtain lock/u);
  retiring.child.stdin.end('rollback;\n');assert.equal((await retiring.closed).code,0);
  const preparing=heldSession('begin;'+servicePrefix+'select '+checkoutExpression('prepare',quotedPayload)+';');await preparing.ready();
  rejected("begin;set local lock_timeout='50ms';"+mutation+'commit;',/lock timeout/u);
  await finishHeld(preparing);
  assert.equal(checkout('offer',{offerId:offer.id}).data.preparationAllowed,true,name+' remains current after refused retirement');
 }
 cases.push({name:'Both gateway and verifier retirement serialize against actual preparation: retirement-first denies without waiting; prepare-first retains SHARE fences until commit so concurrent retirement cannot commit inside the authority window'});
 const preparedRequest=randomUUID(),prepared=checkout('prepare',{offerId:offer.id,expectedQuote:offered.data.quote},preparedRequest);
 const closure=checkout('abandon',{originalRequestId:preparedRequest,originalSessionId:buyerSession,intentId:prepared.data.intent.id,expectedQuote:offered.data.quote});
 assert.equal(closure.data.intent.state,'expired');assert.equal(closure.data.closure.allocationAbsent,true);assert.equal(closure.data.closure.dispatchAbsent,true);
 assert.equal(q("select rolsuper from pg_roles where rolname='postgres';"),'f');
 assert.equal(q(`select count(*) from public.user_entitlements where user_id='${buyer}';`),'0');
 assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v3_allocations;'),'0');
 assert.equal(q('select count(*) from sandbox_commerce_v1.dispatch_attempts;'),'0');
 assert.equal(q('select count(*) from sandbox_commerce_v1.test_store_v3_abandonments;'),'1');
 const repo=path.resolve(root,'../..'),edgeFiles=[...new Set([...providerSources(repo),...receiptSources(repo),path.join(repo,'supabase/functions/_shared/isolated-test-store-v3-command.ts')])];
 const edgeHashes=Object.fromEntries(edgeFiles.map(file=>[path.relative(repo,file),hash(fs.readFileSync(file))]));
 const load=createV3SourceLoader(edgeFiles),api=createV3CommandApi(q),provider=createV3ProviderFixture(q,repo,load),receipts=createV3ReceiptFixture(q,api,repo);
 const commandContract=load(path.join(repo,'supabase/functions/_shared/isolated-test-store-v3-command.ts')),rawCall=api.call;
 api.call=(command,payload,requestId=randomUUID())=>{const result=rawCall(command,payload,requestId);
  const input={actor:{userId:buyer,sessionId:buyerSession},request:{protocol:'isolated-test-store-v3',command,payload,requestId,expectedSessionId:buyerSession,configurationDigest:V3_FIXTURE.configurationDigest}};
  commandContract.validateTestStoreV3CommandResult(result,input,Date.now());combinedCaptures.push({kind:'provider-command',input,result});return result;};
 const newContext=()=>{const requestId=randomUUID(),intent=checkout('prepare',quotedPayload,requestId).data.intent;
  const customer=api.call('bind',{installationId:randomUUID()}).result.customer;return{intent,quote:offered.data.quote,requestId,customer,rawIntentId:intent.id.slice(12)};};
 const allocatePayload=context=>({customerBindingId:context.customer.id,intentId:context.intent.id,expectedQuote:context.quote});
 const allocateSql=context=>servicePrefix+'select '+api.expression('allocate',allocatePayload(context))+';';
 const postSql=plan=>servicePrefix+`select public.isolated_test_store_v3_provisioning_claim_v1('${plan}','create_offering','${randomUUID()}',null);`;
 const rollbackHeld=async held=>{held.child.stdin.end('rollback;\n');assert.equal((await held.closed).code,0);};
 const economicsAuthority=legacyAuthoritySnapshot(q),contexts=[];
 for(const [gate,mutation] of [
  ['gateway','update sandbox_commerce_v1.paid_video_gateway_controls set enabled=false;'],
  ['verifier',`update sandbox_commerce_v1.paid_video_verifiers set active=false where id='${verifierId}';`],
 ]){
  const context=newContext();
  rejected('begin;'+mutation+allocateSql(context)+'commit;',/paid_video_verified_media_required/u);
  const retiring=heldSession("begin;set local idle_in_transaction_session_timeout='5s';"+mutation);await retiring.ready();
  rejected(allocateSql(context),/could not obtain lock/u);await rollbackHeld(retiring);
  const allocating=heldSession('begin;'+allocateSql(context));await allocating.ready();
  rejected("begin;set local lock_timeout='50ms';"+mutation+'commit;',/lock timeout/u);await finishHeld(allocating);
  const allocated=api.call('read',{intentId:context.intent.id}).result;context.allocation=allocated.allocation;context.plan=provider.planFor(context.allocation);
  q(mutation);
  assert.equal((await provider.runStep(context.plan,'list_offerings')).status,'recorded','GET remains possible after '+gate+' retirement');
  const transportCount=provider.calls.length;
  assert.equal((await provider.runStep(context.plan,'create_offering')).status,'outcome_unknown');
  assert.equal(provider.calls.length,transportCount,'A refused consumed-ticket RPC must not cause any provider transport');
  rejected(postSql(context.plan),/paid_video_verified_media_required/u);
  assert.equal(q(`select count(*) from sandbox_commerce_v1.test_store_v3_tickets where plan_id='${context.plan}' and operation='create_offering';`),'0');
  q(gate==='gateway'?'update sandbox_commerce_v1.paid_video_gateway_controls set enabled=true;':`update sandbox_commerce_v1.paid_video_verifiers set active=true where id='${verifierId}';`);
  await provider.runStep(context.plan,'list_offerings');
  const retiringPost=heldSession("begin;set local idle_in_transaction_session_timeout='5s';"+mutation);await retiringPost.ready();
  rejected(postSql(context.plan),/could not obtain lock/u);await rollbackHeld(retiringPost);
  const admittingPost=heldSession('begin;'+postSql(context.plan));await admittingPost.ready();
  rejected("begin;set local lock_timeout='50ms';"+mutation+'commit;',/lock timeout/u);
  // This lease is never sent outside this fixture; rollback avoids pretending
  // that a provider operation can be undone after actual network dispatch.
  await rollbackHeld(admittingPost);
  await provider.registerPlan(context.allocation);
  context.allocation=api.call('read',{intentId:context.intent.id}).result.allocation;
  const claimPayload={intentId:context.intent.id,dispatchId:context.allocation.dispatchId,registrationId:context.allocation.registration.id,expectedQuote:context.quote};
  const claimSql=()=>servicePrefix+'select '+api.expression('claim',claimPayload)+';';
  rejected('begin;'+mutation+claimSql()+'commit;',/paid_video_verified_media_required/u);
  const retiringClaim=heldSession("begin;set local idle_in_transaction_session_timeout='5s';"+mutation);await retiringClaim.ready();
  rejected(claimSql(),/could not obtain lock/u);await rollbackHeld(retiringClaim);
  const admittingClaim=heldSession('begin;'+claimSql());await admittingClaim.ready();
  rejected("begin;set local lock_timeout='50ms';"+mutation+'commit;',/lock timeout/u);await rollbackHeld(admittingClaim);
  const claimRequest=randomUUID();context.claim=api.call('claim',claimPayload,claimRequest).result;assert.equal(context.claim.dispatchAllowed,true);
  const purchase=receipts.event(context);q(mutation);
  assert.equal(api.call('claim',claimPayload,claimRequest).result.dispatchAllowed,false,'Exact claim replay cannot redispatch');
  assert.equal((await provider.runStep(context.plan,'read_offering')).status,'recorded');
  const captured=await receipts.ingest(purchase),effect=receipts.effect(captured.receiptId);
  assert.equal(effect.projection.state,'verified');
  const grant=q(`select id from sandbox_commerce_v1.resource_grants where receipt_id='${effect.projection.receiptId}';`);assert.match(grant,/^[a-f0-9-]{36}$/u);
  // Two synthetic purchases intentionally share this exact video. Delivery's
  // current-grant selector is independent of which retained receipt was newest.
  const deliveryGrant=q(`select (sandbox_commerce_v1.current_resource_grant('${buyer}','${context.quote.resourceId.slice(14)}',${context.quote.resourceRevision})).id;`);
  assert.equal((await receipts.ingest(purchase)).status,'duplicate');
  assert.equal(checkout('recover',{originalRequestId:context.requestId}).data.intent.state,'verified');
  rejected(servicePrefix+`select public.isolated_paid_video_gateway_access_v2('${buyer}','${buyerSession}','${context.quote.resourceId.slice(14)}','${deliveryGrant}');`,/paid_video_verified_media_required/u);
  q(gate==='gateway'?'update sandbox_commerce_v1.paid_video_gateway_controls set enabled=true;':`update sandbox_commerce_v1.paid_video_verifiers set active=true where id='${verifierId}';`);
  assert.equal(service(`public.isolated_paid_video_gateway_access_v2('${buyer}','${buyerSession}','${context.quote.resourceId.slice(14)}','${deliveryGrant}')`).protocol,'scpv-current-access-gateway-v2');
  assert.equal(provider.states.get(context.plan).postCounts.create_offering,1);contexts.push(context);
 }
 assert.equal(legacyAuthoritySnapshot(q),economicsAuthority);assert.equal(q(`select count(*) from public.user_entitlements where user_id='${buyer}';`),'0');
 for(const file of edgeFiles)assert.equal(hash(fs.readFileSync(file)),edgeHashes[path.relative(repo,file)],'Edge source changed during proof');
 cases.push({name:'Prepared intents cannot newly allocate, obtain provider POST permits or SDK claims after gateway/verifier retirement; each boundary holds current SHARE fences in both race orders. GET evidence, exact claim replay without dispatch, raw receipt settlement/duplicates and historical recovery survive; current delivery remains denied until readiness returns',providerFixtures:'Synthetic API/credentials and receipts; actual source encryption/parser/projection and SQL admission used',plans:contexts.length});
 q("set role sbx_v1_operator;select sandbox_commerce_v1.transition('active','retired');");
 assert.equal(checkout('offer',{offerId:offer.id}).data.preparationAllowed,false);
 assert.equal(checkout('recover',{originalRequestId:preparedRequest}).data.intent.state,'expired');
 cases.push({name:'Actual public v2 reserve/issue/probe/HMAC reconcile/finalize/synthetic scan/moderate/publish produces the retained upload receipt required by shared media readiness; public preparation/closure and inactive history execute under managed non-superuser owners while buyer remains free'});
 for(const f of ordered)assert.equal(hash(fs.readFileSync(sourcePath(f),'utf8')),hash(files[f]),`Source changed during test: ${f}`);
 report={status:'passed',engine:version,scope:'Combined verified-media readiness local non-super installer, finalized ACL and actual public SQL authority/receipt/availability proof on minimum synthetic projections; no hosted target, actual origin-byte/provider HTTP or release attestation',
  assumptions:['PostgreSQL 17.6 task-selected local binaries','Synthetic database owned by modeled postgres LOGIN CREATEROLE BYPASSRLS NOSUPERUSER NOINHERIT','Separate fixture_admin superuser performs fixture setup and verification; runtime functions execute as actual source owners','Explicit SELECT+MAINTAIN on only synthetic shared projections models required authority-reader capabilities; production privileges are not inferred','Synthetic channel_audience_blocks projection supplies exact owner/viewer columns; no real block data read','Fresh module names and ordinary local event-trigger/catalog behavior','Direct synthetic receipt/scan rows prove lifecycle permission composition, not provider verification or signing','No assertion about actual managed target roles, shared Auth access, deployment eligibility or provider configuration','Public v2 SQL creates the HMAC-bound upload receipt from synthetic object observations. Actual origin bytes/HTTP and actual scanner execution are not exercised; gateway is enabled only in this disposable fixture.'],
  caseCount:cases.length,cases,combinedCaptures,edgeHashes,sourceHashes:Object.fromEntries(ordered.map(f=>[f,hash(files[f])])),
  fixtureHashes:Object.fromEntries([...fixtureFiles.map(f=>[f,hash(fixtures[f])]),
   ['test-store-v3.fixture.mjs',hash(fs.readFileSync(path.join(here,'test-store-v3.fixture.mjs')))],
   ['paid-video-scan.mjs',hash(fs.readFileSync(path.resolve(here,'../../../ops/isolated-paid-video-worker/scan.mjs')))]]),harnessHash:hash(fs.readFileSync(fileURLToPath(import.meta.url)))};
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
