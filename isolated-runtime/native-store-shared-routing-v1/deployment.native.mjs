#!/usr/bin/env node
// Disposable local PG17.6 only. No caller connection string, credentials,
// hosted transport, activation, or installation of the old48 bundle.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {randomInt} from 'node:crypto';import {spawnSync,spawn} from 'node:child_process';
import {createDatabase} from '../../tests/helpers/database-runtime-authority-fixture.mjs';
import {here,source,identity,literal,baselineSQL,functionContractSQL,verifyContract,buildLocalFixturePacket,readbackSQL,root,classifyReadback,installed48} from './deployment.mjs';
assert.equal(process.argv.length,4);assert.equal(process.argv[2],'--local-bin');const bin=process.argv[3];assert.ok(path.isAbsolute(bin));
const work=fs.mkdtempSync(path.join(os.tmpdir(),'shared-exclusion-native-')),data=path.join(work,'data'),port=String(randomInt(49152,65536));
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')&&k!=='DATABASE_URL'));
const args=(user='postgres',database='shared_exclusion_fixture')=>['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',port,'-U',user,'-d',database];
const run=(tool,a,input)=>spawnSync(path.join(bin,tool),a,{env,input,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
const invoke=(tool,a,input)=>{const r=run(tool,a,input);assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();};
const q=(sql,user='postgres')=>invoke('psql',args(user),sql);
const attempt=sql=>run('psql',args(),sql);
const rows=sql=>q("set search_path='';select to_jsonb(x) from ("+sql+') x;').split('\n').filter(Boolean).map(x=>JSON.parse(x));
// Exercise separately returned packets, rather than collecting baselineSQL
// through server JSON alone. Raw connector OIDs decode as numbers, whereas
// PostgreSQL to_jsonb(oid) produces strings. Model that observed decoder using
// the actual result type; no normalization of function definitions is allowed.
const packetRows=name=>{
 const text=fs.readFileSync(path.join(here,'deployment-queries',name),'utf8');
 const end=text.indexOf("set local search_path='';\n")+"set local search_path='';\n".length;
 const query=text.slice(end).replace(/;\s*rollback;\s*$/u,'');
 const event=name==='03-event-triggers.sql';
 const projection=event?"jsonb_build_object('row',to_jsonb(x),'oidType',pg_typeof(x.oid)::text)":'to_jsonb(x)';
 return q(text.slice(0,end)+`select ${projection} from (${query}) x;rollback;`,'supabase_read_only_user')
  .split('\n').filter(Boolean).map(line=>{
   const value=JSON.parse(line);if(!event)return value;
   assert.ok(['oid','text'].includes(value.oidType));
   if(value.oidType==='oid')value.row.oid=Number(value.row.oid);
   return value.row;
  });
};
let started=false,startupAttempted=false,cases=0;
const pass=name=>{cases++;process.stdout.write('PASS '+name+'\n');};
const absent=()=>{assert.equal(q("select to_regprocedure('public.revenuecat_native_legacy_exclusion_v1(uuid,text,text)') is null;"),'t');assert.equal(q(`select count(*) from supabase_migrations.schema_migrations where version=${literal(identity.version)};`),'0');};
const reject=(name,sql,pattern)=>{const r=attempt(sql);assert.notEqual(r.status,0);assert.match(r.stderr,pattern);absent();pass(name);};
async function withLock(sql,fn){
 const child=spawn(path.join(bin,'psql'),args('fixture_admin'),{env,stdio:['pipe','pipe','pipe']});let stderr='';child.stderr.on('data',x=>stderr+=x);
 const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('lock fixture startup timed out')),5000);child.stdout.on('data',x=>{if(String(x).includes('LOCK_READY')){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(Error(stderr));});});
 const ended=new Promise(resolve=>child.once('exit',resolve));child.stdin.write('begin;'+sql+";select 'LOCK_READY';\n");
 try{await ready;await fn();}finally{child.stdin.end('rollback;\n');assert.equal(await ended,0,stderr);}
}
try{
 assert.match(invoke('postgres',['--version']),/PostgreSQL\) 17\.6/u);
 invoke('initdb',['-D',data,'-U','fixture_admin','--encoding=UTF8','--no-locale','--auth=trust']);
 startupAttempted=true;invoke('pg_ctl',['-D',data,'-w','-t','15','-l',path.join(work,'server.log'),'-o',`-c listen_addresses=127.0.0.1 -c unix_socket_directories='' -p ${port} -c shared_buffers=32MB -c autovacuum=off`,'start']);started=true;
 invoke('psql',args('fixture_admin','postgres'),'create role postgres login superuser;create database shared_exclusion_fixture owner postgres;');
 // No extension doubles: prove that the same native installation can load
 // both contrib libraries before replaying the complete legacy source chain.
 assert.equal(q(`begin;create schema extension_prerequisite;
  create extension pgcrypto with schema extension_prerequisite;
  create extension pg_trgm with schema extension_prerequisite;
  select encode(extension_prerequisite.digest('abc','sha256'),'hex')='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
   and extension_prerequisite.similarity('legacy replay','legacy replay')=1;
  rollback;`),'t');pass('actual pgcrypto digest and pg_trgm prerequisite libraries load');
 const replay=[];
 const {replayReport}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false,databaseFactory:async()=>({async exec(sql){replay.push(sql);},async close(){}})});
 q(replay.join('\n'));pass(`actual legacy migrations replayed: ${replayReport.files.length} files`);
 q(`create role supabase_read_only_user login nosuperuser nocreaterole nocreatedb noreplication bypassrls;
 create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text,created_by text,idempotency_key text unique,rollback text[]);
 insert into supabase_migrations.schema_migrations(version,name,statements) values('20261109151349','native_store_sandbox_source_bound_48',array['LOCAL SYNTHETIC RECEIPT ONLY; installed48 is not re-executed']);
 grant usage on schema supabase_migrations to supabase_read_only_user;grant select on supabase_migrations.schema_migrations to supabase_read_only_user;
 alter role supabase_read_only_user set default_transaction_read_only=on;alter role supabase_admin superuser;
 create function public.exclusion_retained_probe() returns int language sql as $$select 1$$;`);
 const triggers=JSON.parse(fs.readFileSync(path.join(root,'isolated-runtime/native-store-sandbox-v1/event-trigger.fixture.json'))).triggers;
 for(const t of triggers){const sig=t.definition.match(/FUNCTION (extensions\.\w+\(\))/u)[1];q(t.definition+`;alter function ${sig} owner to supabase_admin;grant execute on function ${sig} to public;create event trigger ${t.evtname} on ${t.evtevent}${t.evttags?' when tag in ('+t.evttags.map(literal).join(',')+')':''} execute function ${sig};alter event trigger ${t.evtname} owner to supabase_admin;`);}
 assert.equal(q('select count(*) from pg_event_trigger;'),'8');
 q('alter role postgres nosuperuser nocreatedb noreplication createrole bypassrls noinherit;','fixture_admin');
 assert.equal(q("select rolsuper from pg_roles where rolname=current_user;"),'f');
 const actor=packetRows('00-actor-health.sql').find(row=>row.kind==='context').metadata;
 assert.equal(actor.current_user,'supabase_read_only_user');assert.equal(actor.session_user,'supabase_read_only_user');assert.equal(actor.transaction_read_only,'on');
 assert.deepEqual(packetRows('01-function-absence.sql'),[]);
 const context={database:actor.current_database,serverVersionNum:Number(actor.server_version_num),databaseStart:actor.database_start};
 const contract=verifyContract(JSON.parse(q("begin;set local search_path='';"+source+functionContractSQL+';rollback;')));
 assert.deepEqual(contract,JSON.parse(fs.readFileSync(path.join(here,'deployment-contract.json'))));pass('exact pinned function body/config/owner/ACL on native PostgreSQL');
 const events=packetRows('03-event-triggers.sql');assert.equal(events.length,8);
 assert.ok(events.every(row=>typeof row.oid==='string'),'Separate event-trigger packet must preserve text OIDs');
 const baseline=[...packetRows('02-defaults-roles.sql'),...events.map(metadata=>({kind:'eventTrigger',metadata})),
  ...packetRows('04-dependencies.sql'),...packetRows('05-history.sql'),...packetRows('06-history-write-boundary.sql')];
 const sorted=values=>values.map(value=>JSON.stringify(value)).sort();
 assert.deepEqual(sorted(baseline),sorted(rows(baselineSQL)));pass('separate genuine-reader packets match server JSON without OID or definition coercion');
 const sql=buildLocalFixturePacket({baseline,contract,context});
 const numericOids=structuredClone(baseline);for(const row of numericOids)if(row.kind==='eventTrigger')row.metadata.oid=Number(row.metadata.oid);
 reject('numeric connector OIDs fail the initial baseline guard without function or receipt',buildLocalFixturePacket({baseline:numericOids,contract,context}),/ERROR:\s+exclusion_baseline_changed\n/u);
 const badRoles=structuredClone(baseline);badRoles.find(r=>r.kind==='role'&&r.metadata.rolname==='postgres').metadata.rolsuper=true;
 assert.throws(()=>buildLocalFixturePacket({baseline:badRoles,contract,context}),/Installer must not be a superuser/u);pass('superuser baseline cannot emit a packet');
 const badReader=structuredClone(baseline);badReader.find(r=>r.kind==='role'&&r.metadata.rolname==='supabase_read_only_user').metadata.rolconfig=null;
 assert.throws(()=>buildLocalFixturePacket({baseline:badReader,contract,context}),/Reader must retain real read-only defaults/u);pass('non-read-only reader baseline cannot emit a packet');
 const newerHistory=structuredClone(baseline);newerHistory.find(r=>r.kind==='historySummary').metadata.latest_version='20990101000000';
 assert.throws(()=>buildLocalFixturePacket({baseline:newerHistory,contract,context}),/Fixed version must be later/u);pass('out-of-order fixed migration version cannot emit a packet');
 q('alter role postgres superuser;','fixture_admin');reject('writer superuser drift is rejected',sql,/exclusion_writer_role_unqualified/u);q('alter role postgres nosuperuser;','fixture_admin');
 reject('wrong actor leaves no residue',sql.replace("current_user='postgres'","current_user='not_postgres'"),/exclusion_writer_identity_mismatch/u);
 reject('stale context leaves no residue',sql.replace(context.databaseStart,'2001-01-01T00:00:00Z'),/exclusion_server_context_mismatch/u);
 reject('stale baseline leaves no residue',sql.replace('"history_count":1','"history_count":2'),/exclusion_baseline_changed/u);
 const mutate=text=>sql.replace('-- END exact source bytes.',()=>text+'\n-- END exact source bytes.');
 reject('unexpected execute grant rolls back',mutate('grant execute on function public.revenuecat_native_legacy_exclusion_v1(uuid,text,text) to authenticated;'),/exclusion_function_contract_mismatch/u);
 reject('wrong function lock timeout rolls back',mutate("alter function public.revenuecat_native_legacy_exclusion_v1(uuid,text,text) set lock_timeout='1s';"),/exclusion_function_contract_mismatch/u);
 reject('wrong body rolls back',sql.replace("'status','held'","'status','forged'"),/exclusion_function_contract_mismatch/u);
 reject('old default mutation rolls back',mutate('alter default privileges for role postgres grant execute on functions to service_role;'),/exclusion_baseline_changed_after_create/u);
 reject('old grant mutation rolls back',mutate('grant update on public.provider_events to anon;'),/exclusion_baseline_changed_after_create/u);
 reject('unexpected added function rolls back',mutate('create function public.exclusion_unexpected() returns int language sql as $$select 1$$;'),/exclusion_retained_catalog_changed/u);
 reject('same-definition old function recreation changes OID and rolls back',mutate('drop function public.exclusion_retained_probe();create function public.exclusion_retained_probe() returns int language sql as $$select 1$$;'),/exclusion_retained_catalog_changed/u);
 reject('old receipt mutation rolls back',mutate("update supabase_migrations.schema_migrations set name='mutated' where version='20261109151349';"),/exclusion_baseline_changed_after_create/u);
 reject('post-receipt new function tamper rolls back',sql.replace('set constraints all immediate;',()=> 'grant execute on function public.revenuecat_native_legacy_exclusion_v1(uuid,text,text) to authenticated;set constraints all immediate;'),/exclusion_function_changed_after_receipt/u);
 await withLock('lock table public.provider_events in access exclusive mode',()=>reject('busy dependency NOWAIT leaves no residue',sql,/could not obtain lock/u));
 reject('deadline rolls back late work',mutate('select pg_sleep(6);'),/statement timeout|transaction timeout/u);
 const tick=performance.now();q(sql);pass(`exact atomic commit (${Math.round(performance.now()-tick)} ms)`);
 const evidence=JSON.parse(q(readbackSQL(contract,baseline),'supabase_read_only_user'));
 assert.equal(evidence.currentUser,'supabase_read_only_user');assert.equal(evidence.sessionUser,'supabase_read_only_user');assert.equal(evidence.readOnly,'on');assert.equal(evidence.retainedRelevantMetadataMatches,true);assert.deepEqual(evidence.functions,[contract]);assert.equal(evidence.migration.length,1);assert.equal(evidence.migration[0].exactSource,true);pass('independent committed readback with genuine read-only session');
 assert.equal(classifyReadback(evidence,{context,contract}).status,'unknown_or_conflicting');
 // Pure classifier control only: the local receipt is intentionally synthetic.
 // This is not a target receipt observation and never permits a retry.
 const modeled={...evidence,installed48:[installed48]};
 assert.equal(classifyReadback(modeled,{context,contract}).status,'exact_function_receipt_and_dependencies_observed_runtime_unqualified');
 for(const changed of [{sessionUser:'postgres'},{retainedRelevantMetadataMatches:false},{functions:[]},{migration:[]}])assert.equal(classifyReadback({...modeled,...changed},{context,contract}).status,'unknown_or_conflicting');
 const changedMicrosecond=modeled.databaseStart.replace(/(\.\d{5})(\d)/u,(_,prefix,digit)=>prefix+((Number(digit)+1)%10));assert.notEqual(changedMicrosecond,modeled.databaseStart);
 assert.equal(classifyReadback({...modeled,databaseStart:changedMicrosecond},{context,contract}).status,'unknown_or_conflicting');
 assert.equal(classifyReadback(modeled,{context,contract}).retryAllowed,false);pass('uncertain/lost-reply classification never authorizes a retry');
 const again=attempt(sql);assert.notEqual(again.status,0);assert.match(again.stderr,/exclusion_function_already_present/u);pass('committed rerun refused');
 const invalid=JSON.parse(q('select public.revenuecat_native_legacy_exclusion_v1(null,null,null);'));assert.equal(invalid.status,'held');assert.equal(invalid.financialAuthority,false);pass('invalid input stays held');
 const call="select public.revenuecat_native_legacy_exclusion_v1('d0000000-0000-4000-8000-000000000001','synthetic-missing',repeat('a',64));";
 assert.equal(JSON.parse(q(call)).status,'held');pass('valid absent legacy evidence stays held');
 await withLock('lock table public.provider_events in row exclusive mode',()=>{const now=performance.now(),r=attempt(call);assert.notEqual(r.status,0);assert.match(r.stderr,/could not obtain lock/u);assert.ok(performance.now()-now<1000);});pass('runtime SHARE NOWAIT fails closed');
 console.log(JSON.stringify({protocol:'shared-exclusion-native-deployment-proof-v1',cases,passed:true,localOnly:true,hostedExecution:false,activationAllowed:false}));
}finally{
 if(startupAttempted&&!started){const status=run('pg_ctl',['-D',data,'status']);assert.ok([0,3,4].includes(status.status),'Uncertain owned-cluster startup; retain '+work);started=status.status===0;}
 if(started){const r=run('pg_ctl',['-D',data,'-m','immediate','-w','-t','15','stop']);assert.equal(r.status,0,r.stderr);}
 fs.rmSync(work,{recursive:true,force:true});
}
