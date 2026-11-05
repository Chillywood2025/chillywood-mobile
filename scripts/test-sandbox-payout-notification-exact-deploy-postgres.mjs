#!/usr/bin/env node
// Native PostgreSQL proof, ONLY in a generated clone of a local CLI database.
// No provider transport, remote target, source DB writes or production evidence.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';
import {loadBundle,readbackSql,buildApplySql,classifyState,deploy,VERSION,NAME} from './sandbox-payout-notification-exact-deploy.mjs';

if(process.argv.includes('--help')){console.log('Prove exact observer deployment and actual lock barriers in an owned local Supabase CLI clone only.');process.exit(0);}
assert.equal(process.argv.length,2,'no arbitrary target arguments');
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]+)"/mu)?.[1];assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER??`supabase_db_${project}`;assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/u);
const database=`runtime_authority_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}_payout_wrapper`;
const restore=createBrandGuardCloneRestorer({container}),bundle=structuredClone(loadBundle());
const lit=x=>`'${String(x).replaceAll("'","''")}'`;
const args=(db=database)=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db];
const docker=(a,input,encoding='utf8')=>spawnSync('docker',a,{encoding,input,maxBuffer:256*1024*1024,timeout:120000});
const success=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message??r.stderr??''}`);return r.stdout;};
const query=(sql,db)=>success(docker(args(db),`set statement_timeout='30s';${sql}`),'local clone SQL').trim();
const admin=(a,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','observer-fixture-admin',...a],input,encoding);
const parse=text=>JSON.parse(text.trim().split('\n').at(-1));
// The native SQL is read-only as postgres. Managed transport identity validation
// is tested separately; this adapter supplies its explicit synthetic context.
const context={currentPostgres:false,currentReadOnly:true,sessionPostgres:false,sessionReadOnly:true,sessionAdmin:false,transactionReadOnly:true};
const read=()=>({...parse(query(`begin read only;${readbackSql(bundle)}rollback;`)),context});
const sessions=[];let cloned=false;
function start(sql){
 const name=`observer-${randomUUID()}`,child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));});
 child.stdin.write(`set application_name=${lit(name)};set statement_timeout='20s';${sql}\n`);
 const s={name,child,done,output:()=>stdout};sessions.push(s);return s;
}
async function until(fn,label){const deadline=Date.now()+15000;while(Date.now()<deadline){if(fn())return;await delay(25);}throw Error(label);}
const blocked=(holder,waiter)=>query(`select exists(select 1 from pg_stat_activity h,pg_stat_activity w where h.datname=current_database() and w.datname=current_database() and h.application_name=${lit(holder.name)} and w.application_name=${lit(waiter.name)} and h.pid=any(pg_blocking_pids(w.pid)));`)==='t';
const fail=(sql,pattern)=>{const r=docker(args(),sql);assert.notEqual(r.status,0);assert.match(r.stderr,pattern);};
try{
 if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//u);
 assert.match(success(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker').trim(),/^(unix|npipe):\/\//u);
 assert.ok(success(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'CLI discovery').trim().split('\n').includes(container));
 assert.equal(query(`select exists(select 1 from supabase_migrations.schema_migrations where version=${lit(VERSION)});`,'postgres'),'t','local reset must contain observer');
 success(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create owned clone');cloned=true;
 query('create schema vault;create extension supabase_vault with schema vault;');
 const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql','--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
 success(dump,'read-only source export');success(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],restore.prepare(dump.stdout,database),null),'restore owned clone');
 // This reverse setup is test-only and never reaches the original database.
 query(`begin;
 drop trigger sandbox_cashout_status_notification on private.sandbox_cashout_executions;
 drop function private.enqueue_sandbox_cashout_notification();
 drop function private.sandbox_cashout_notification_state(text);
 drop function private.resolve_account_notification_activity(public.notification_activity_events);
 alter function private.resolve_account_notification_before_sandbox_cashout(public.notification_activity_events) rename to resolve_account_notification_activity;
 drop function public.reserve_notification_activity_push(uuid,uuid,uuid);
 alter function public.reserve_notification_activity_push_before_sandbox_cashout(uuid,uuid,uuid) rename to reserve_notification_activity_push;
 grant execute on function public.reserve_notification_activity_push(uuid,uuid,uuid) to service_role;
 alter table public.notifications drop constraint notifications_notification_type_check;
 alter table public.notifications add constraint notifications_notification_type_check ${bundle.beforeCatalog.typeConstraint};
 delete from supabase_migrations.schema_migrations where version=${lit(VERSION)};
 create schema cron;create table cron.job(jobid bigint primary key,jobname text,schedule text,command text,active boolean);
 insert into cron.job values(1,'notification-activity-worker','10 seconds','select 1',true);
 commit;`);
 const before=read();
 bundle.beforeCatalog=before.catalog;
 bundle.manifest.baselineHistory={count:before.historyCount,sha256:before.priorHistorySHA256};
 bundle.manifest.baseline=Object.fromEntries(Object.keys(bundle.manifest.baseline).map(k=>[k,before[k]]));
 bundle.manifest.baselineInvariantsSha256=before.invariantsSha256;
 bundle.manifest.baselineHooksSha256=before.hooksSha256;
 // Expected postconditions come from independent rolled-back body execution,
 // not the wrapper's eventual response or a successful history write.
 bundle.afterCatalog=parse(query(`begin;${bundle.body}${readbackSql(bundle)}rollback;`)).catalog;
 assert.equal(classifyState(bundle,read()),'ready');
 const sql=buildApplySql(bundle,before);
 const stable=state=>{const {observedAt,...rest}=state;return rest;};
 const unchanged=()=>assert.deepEqual(stable(read()),stable(before),'failed attempts leave all observed state unchanged');
 fail(sql.replace('insert into supabase_migrations.schema_migrations','perform 1/0; insert into supabase_migrations.schema_migrations'),/division by zero/);unchanged();
 fail(sql.replace('insert into supabase_migrations.schema_migrations','alter table public.notifications add column observer_unrelated integer; insert into supabase_migrations.schema_migrations'),/observer_postcheck_failed/);unchanged();
 // Rollback-only drift transactions cannot affect other schedules.
 for(const mutation of [
  "update supabase_migrations.schema_migrations set name=name||'_drift' where version=(select min(version) from supabase_migrations.schema_migrations)",
  "alter table supabase_migrations.schema_migrations alter column name set default 'unexpected'",
  'create trigger observer_ledger_drift before insert on supabase_migrations.schema_migrations for each row execute function pg_catalog.suppress_redundant_updates_trigger()',
  'create rule observer_ledger_rule as on insert to supabase_migrations.schema_migrations do also select 1',
  'grant select on public.notifications to anon',
  "update cron.job set schedule='1 minute'",
 ]){
  fail(sql.replace('do $payout_observer_apply$',`${mutation};do $payout_observer_apply$`),/observer_baseline_changed/);unchanged();
 }
 // Event-trigger creation requires the local platform superuser. Its only
 // target is this owned clone; the wrapper itself still runs as postgres.
 const hookDrift=sql.replace('do $payout_observer_apply$',
  'create function extensions.observer_fixture_hook() returns event_trigger language plpgsql as $$begin return;end$$;create event trigger observer_fixture_hook on ddl_command_end execute function extensions.observer_fixture_hook();set local role postgres;do $payout_observer_apply$');
 const hookResult=admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],hookDrift);
 assert.notEqual(hookResult.status,0);assert.match(hookResult.stderr,/observer_baseline_changed/);unchanged();
 // A real notification-worker table lock blocks deployment. Observe the lock
 // relationship before accepting timeout as proof, then verify atomic rollback.
 const holder=start("begin;update public.notification_activity_events set attempts=attempts where false;select 'HOLDING';");
 await until(()=>holder.output().includes('HOLDING'),'worker lock holder not ready');
 const waiter=start(sql);waiter.child.stdin.end();
 await until(()=>blocked(holder,waiter),'deployment did not wait on worker table lock');
 const timedOut=await waiter.done;assert.notEqual(timedOut.code,0);assert.match(timedOut.stderr,/lock timeout/);
 holder.child.stdin.end('rollback;\n');assert.equal((await holder.done).code,0);unchanged();
 // Release-before-timeout schedule must complete without disabling worker cron.
 const fresh=read();assert.equal(classifyState(bundle,fresh),'ready');
 const retrySql=buildApplySql(bundle,fresh);
 const holder2=start("begin;update public.notification_activity_events set attempts=attempts where false;select 'HOLDING';");
 await until(()=>holder2.output().includes('HOLDING'),'second worker lock holder not ready');
 const waiter2=start(retrySql);waiter2.child.stdin.end();
 await until(()=>blocked(holder2,waiter2),'second deployment did not wait on worker');
 holder2.child.stdin.end('rollback;\n');assert.equal((await holder2.done).code,0);
 assert.equal((await waiter2.done).code,0);
 const after=read();assert.equal(classifyState(bundle,after),'applied');assert.equal(after.invariantsSha256,before.invariantsSha256);
 assert.equal(after.historyCount,before.historyCount+1);assert.equal(after.priorHistorySHA256,before.priorHistorySHA256);
 assert.deepEqual(parse(query(`select jsonb_build_object('version',version,'name',name,'statements',statements) from supabase_migrations.schema_migrations where version=${lit(VERSION)};`)),{version:VERSION,name:NAME,statements:[bundle.body]});
 let writes=0;assert.equal((await deploy({bundle,apply:true,query:async(_sql,readOnly)=>{if(!readOnly)writes++;assert.equal(readOnly,true);return read();}})).status,'already_applied_verified');assert.equal(writes,0);
 restore.assertSourceUnchanged();
 console.log('PASS native observer wrapper: exact history/body, independent catalog postcondition, midapply/postcheck rollback, history/ACL/cron drift, observed worker lock timeout and release schedules, already-applied reconciliation. Original database unchanged.');
}finally{
 for(const s of sessions)if(s.child.exitCode===null){s.child.stdin.end();s.child.kill('SIGTERM');}
 await Promise.allSettled(sessions.map(s=>s.done));
 if(cloned)success(docker(['exec',container,'dropdb','-U','postgres','--force',database]),'drop owned clone');
}
