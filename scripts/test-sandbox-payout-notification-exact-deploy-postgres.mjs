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
import {nativeDriftCases,injectBefore,eventHookDriftSql,notificationLockHolderSQL,observerBarrierKey,observerBarrierSql} from '../tests/helpers/payout-wrapper-native-drift-fixture.mjs';

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
const adminClone=sql=>admin(['psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],sql);
const fail=(sql,pattern,label='failure injection',privileged=false)=>{const r=privileged?adminClone(sql):docker(args(),sql);assert.notEqual(r.status,0,`${label}: expected rejection, not successful apply`);assert.match(r.stderr,pattern,`${label}: expected guard rejection`);};
// Test-only independent advisory barrier; production SQL gets no pause/sleep.
async function pauseApply(statement,anchor,{outsideDo=false}={}){
 const key=observerBarrierKey;
 const holder=start(`begin;select pg_advisory_xact_lock(${key});select 'HOLDING';`);
 await until(()=>holder.output().includes('HOLDING'),'test barrier holder not ready');
 const application=start(observerBarrierSql(statement,anchor,{outsideDo}));application.child.stdin.end();
 await until(()=>blocked(holder,application),'wrapper did not reach test-only barrier');
 return {application,release:async()=>{holder.child.stdin.end('rollback;\n');assert.equal((await holder.done).code,0);return application.done;}};
}
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
 const reverseObserverSQL=`begin;
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
 commit;`;
 query(reverseObserverSQL);
 // Model production's platform-owned SELECT-only cron catalog. These grants
 // affect only the generated clone, never cluster roles or the source DB.
 success(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],`
 create schema cron authorization supabase_admin;
 create table cron.job(jobid bigint primary key,jobname text,schedule text,command text,active boolean);
 insert into cron.job values(1,'notification-activity-worker','10 seconds','select 1',true);
 revoke all on cron.job from public,postgres;
 grant usage on schema cron to postgres;
 grant select on cron.job to postgres;
 select vault.create_secret('synthetic-native-observer-fixture-only','notification_activity_worker_token','Disposable clone test only');
 `),'create production-like SELECT-only cron fixture');
 const cronAuthority=parse(query(`select jsonb_build_object('owner',c.relowner::regrole::text,'superuser',r.rolsuper,
 'inheritsOwner',pg_has_role('postgres',c.relowner,'USAGE'),'select',has_table_privilege('postgres',c.oid,'SELECT'),
 'write',has_table_privilege('postgres',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,MAINTAIN'))
 from pg_class c join pg_roles r on r.rolname='postgres' where c.oid='cron.job'::regclass;`));
 assert.deepEqual(cronAuthority,{owner:'supabase_admin',superuser:false,inheritsOwner:false,select:true,write:false},
  'fixture must reproduce platform-owned SELECT-only cron without changing cluster roles');
 assert.equal(query("select exists(select 1 from vault.decrypted_secrets where name='notification_activity_worker_token' and decrypted_secret='synthetic-native-observer-fixture-only');"),'t',
  'postgres must see the existing synthetic clone token before canonical contention');
 let before=read();
 bundle.beforeCatalog=before.catalog;
 bundle.manifest.baselineHistory={count:before.historyCount,sha256:before.priorHistorySHA256};
 bundle.manifest.baseline=Object.fromEntries(Object.keys(bundle.manifest.baseline).map(k=>[k,before[k]]));
 bundle.manifest.baselineInvariantsSha256=before.invariantsSha256;
 bundle.manifest.baselineHooksSha256=before.hooksSha256;
 // Expected postconditions come from independent rolled-back body execution,
 // not the wrapper's eventual response or a successful history write.
 bundle.afterCatalog=parse(query(`begin;${bundle.body}${readbackSql(bundle)}rollback;`)).catalog;
 assert.equal(before.cronReadCapability,true);
 assert.equal(before.writeCapabilities.length,26);
 assert.ok(before.writeCapabilities.every(c=>c.table!=='cron.job'));
 assert.equal(classifyState(bundle,read()),'ready');
 const sql=buildApplySql(bundle,before);
 const stable=state=>{const {observedAt,...rest}=state;return rest;};
 const unchanged=()=>assert.deepEqual(stable(read()),stable(before),'failed attempts leave all observed state unchanged');
 fail(injectBefore(sql,'insert into supabase_migrations.schema_migrations','perform 1/0; '),/division by zero/,'mid-apply execution failure');unchanged();
 fail(injectBefore(sql,'insert into supabase_migrations.schema_migrations','alter table public.notifications add column observer_unrelated integer; '),/observer_postcheck_failed/,'unrelated catalog postcheck');unchanged();
 // Independently prove every negative fixture changes its intended contract.
 // In particular GRANT is a no-op when the local CLI already grants anon SELECT.
 // Each probe and rejection rolls back; nothing changes the source database.
 for(const {label,mutation,observe} of nativeDriftCases(before)){
  const privileged=label==='activity worker cron';
  const prefix=mutation+';'+(privileged?'set local role postgres;':'');
  const probe=`begin;${prefix}${readbackSql(bundle)}rollback;`;
  const drift={...parse(privileged?success(adminClone(probe),'admin clone cron drift probe'):query(probe)),context};
  assert.notDeepEqual(observe(drift),observe(before),`${label}: fixture must change the intended baseline`);
  assert.throws(()=>classifyState(bundle,drift),undefined,`${label}: read-only preflight must reject drift`);
  unchanged();
  console.log(`CHECK native drift rejection: ${label}`);
  fail(injectBefore(sql,'do $payout_observer_apply$',prefix),/observer_baseline_changed/,label,privileged);unchanged();
 }
 // Event-trigger creation requires the local platform superuser. Its only
 // target is this owned clone; the wrapper itself still runs as postgres.
 const hookDrift=eventHookDriftSql(sql);
 const hookResult=admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],hookDrift);
 assert.notEqual(hookResult.status,0,'event hook drift must reject apply');assert.match(hookResult.stderr,/observer_baseline_changed/,'event hook drift must reach baseline guard');unchanged();
 // Actual canonical configure/disable calls wait on the guarded config table.
 // Configure reads Vault before that lock: its synthetic token already exists.
 // This proves serialization before config/cron writes, NOT before Vault reads.
 assert.ok(sql.endsWith('commit;'));
 const rollbackSql=sql.slice(0,-'commit;'.length)+'rollback;';
 const canonical=await pauseApply(rollbackSql,'preserved_data:=');
 for(const call of ["public.configure_notification_activity_worker('https://bmkkhihfbmsnnmcqkoly.supabase.co')",'public.disable_notification_activity_worker()']){
  const operation=start(`begin;set local lock_timeout='5s';select ${call};rollback;`);operation.child.stdin.end();
  await until(()=>blocked(canonical.application,operation),'canonical config operation did not block on deployment');
  const result=await operation.done;assert.notEqual(result.code,0);assert.match(result.stderr,/lock timeout/);
 }
 assert.equal((await canonical.release()).code,0);unchanged();
 console.log('PASS canonical configure/disable config writes blocked; existing synthetic Vault token only, no pre-Vault serialization claim');
 // An independent administrator can edit cron despite application locks. An
 // edit committed before the postcheck observation is detected and rolls back.
 const visible=await pauseApply(sql,'insert into supabase_migrations.schema_migrations');
 success(adminClone("update cron.job set schedule='1 minute' where jobname='notification-activity-worker';"),'independent cron edit before postcheck');
 const rejected=await visible.release();assert.notEqual(rejected.code,0);assert.match(rejected.stderr,/observer_postcheck_failed/);
 assert.equal(read().observerHistory.length,0,'visible cron drift rolls observer DDL/history back');
 success(adminClone("update cron.job set schedule='10 seconds' where jobname='notification-activity-worker';"),'restore clone cron baseline');unchanged();
 // Explicit limitation: an administrator editing AFTER the final observation
 // but BEFORE commit is not excluded. Both commits succeed; later readback
 // reports drift. This is a contract counterexample, not a serialization claim.
 const late=await pauseApply(sql,"notify pgrst,'reload schema';",{outsideDo:true});
 success(adminClone("update cron.job set schedule='1 minute' where jobname='notification-activity-worker';"),'independent cron edit after final observation');
 assert.equal((await late.release()).code,0,'late independent cron edit does not prevent observer commit');
 const lateState=read();assert.equal(lateState.observerHistory.length,1);assert.equal(lateState.historyCount,before.historyCount+1);
 assert.deepEqual(parse(query(`select jsonb_build_object('version',version,'name',name,'statements',statements) from supabase_migrations.schema_migrations where version=${lit(VERSION)};`)),{version:VERSION,name:NAME,statements:[bundle.body]});
 assert.equal(lateState.workerSchedule[0].schedule,'1 minute');assert.throws(()=>classifyState(bundle,lateState),/BASELINE_CONTRACT_MISMATCH/);
 console.log('PASS explicit limitation: independent cron edit after final observation and observer deployment both commit; readback detects drift');
 // Restore only this owned clone to the pre-target checkpoint for the existing
 // notification-table lock timeout/release schedules below.
 query(reverseObserverSQL);
 success(adminClone("update cron.job set schedule='10 seconds' where jobname='notification-activity-worker';"),'restore clone after late-edit counterexample');unchanged();
 // A real notification-worker table lock blocks deployment. Observe the lock
 // relationship before accepting timeout as proof, then verify atomic rollback.
 const holder=start(notificationLockHolderSQL);
 await until(()=>holder.output().includes('HOLDING'),'worker lock holder not ready');
 const waiter=start(sql);waiter.child.stdin.end();
 await until(()=>blocked(holder,waiter),'deployment did not wait on worker table lock');
 const timedOut=await waiter.done;assert.notEqual(timedOut.code,0);assert.match(timedOut.stderr,/lock timeout/);
 holder.child.stdin.end('rollback;\n');assert.equal((await holder.done).code,0);unchanged();
 // Release-before-timeout schedule must complete without disabling worker cron.
 const fresh=read();assert.equal(classifyState(bundle,fresh),'ready');
 const retrySql=buildApplySql(bundle,fresh);
 const holder2=start(notificationLockHolderSQL);
 await until(()=>holder2.output().includes('HOLDING'),'second worker lock holder not ready');
 const waiter2=start(retrySql);waiter2.child.stdin.end();
 await until(()=>blocked(holder2,waiter2),'second deployment did not wait on worker');
 holder2.child.stdin.end('rollback;\n');assert.equal((await holder2.done).code,0);
 assert.equal((await waiter2.done).code,0);
 const after=read();assert.equal(classifyState(bundle,after),'applied');assert.equal(after.invariantsSha256,before.invariantsSha256);
 assert.equal(after.historyCount,before.historyCount+1);assert.equal(after.priorHistorySHA256,before.priorHistorySHA256);
 assert.deepEqual(parse(query(`select jsonb_build_object('version',version,'name',name,'statements',statements) from supabase_migrations.schema_migrations where version=${lit(VERSION)};`)),{version:VERSION,name:NAME,statements:[bundle.body]});
 // Already-applied reconciliation remains read-only with SELECT-only cron.
 assert.equal(query("select has_table_privilege('postgres','cron.job','UPDATE,DELETE,TRUNCATE,MAINTAIN');"),'f');
 let writes=0;assert.equal((await deploy({bundle,apply:true,query:async(_sql,readOnly)=>{if(!readOnly)writes++;assert.equal(readOnly,true);return read();}})).status,'already_applied_verified');assert.equal(writes,0);
 restore.assertSourceUnchanged();
 console.log('PASS native observer wrapper with SELECT-only admin-owned cron: exact history/body, atomic rollback, visible cron drift rejection, explicit late cron-edit counterexample, canonical config-write barriers, notification-table lock timeout/release and read-only reconciliation. Original database unchanged; independent cron edits are not serialized.');
}finally{
 for(const s of sessions)if(s.child.exitCode===null){s.child.stdin.end();s.child.kill('SIGTERM');}
 await Promise.allSettled(sessions.map(s=>s.done));
 if(cloned)success(docker(['exec',container,'dropdb','-U','postgres','--force',database]),'drop owned clone');
}
