#!/usr/bin/env node
// Native multi-backend proof against source-replayed managed-service doubles.
// Never connects to an existing Supabase project, transport, scanner or origin.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {brandReferenceNativeContainer,brandNativeSpawnSync,brandNativeSpawn,brandNativePreflight} from './helpers/brand-reference-native-target.mjs';
import {createDatabase,repairMigrationPath} from './helpers/database-runtime-authority-fixture.mjs';

if(process.argv.includes('--help')){
 console.log('BRAND_REFERENCE_TEST_CONTAINER=brand-ref-perf-* node tests/brand-reference-guards-native.mjs [--benchmark] [--keep-fixture]. Requires a fresh disposable PostgreSQL cluster in a network-disabled container with no mounts and socket /tmp. Source migrations intentionally reject pre-existing cognitive runtime roles, so a new database in a previously replayed cluster is insufficient. Replays source schema with managed-service doubles into a newly generated database. Optional benchmark adds 429749 synthetic audit rows and times complete clearance calls. --keep-fixture retains the exact printed database for follow-up; otherwise it is dropped. No provider/scanner evidence.');
 process.exit(0);
}
const benchmark=process.argv.includes('--benchmark');
const keepFixture=process.argv.includes('--keep-fixture');
for(const flag of process.argv.slice(2))assert.ok(['--benchmark','--keep-fixture'].includes(flag));
assert.equal(new Set(process.argv.slice(2)).size,process.argv.length-2);
const container=brandReferenceNativeContainer();
const database=`brand_guard_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}`;
const root=fileURLToPath(new URL('../',import.meta.url));
const lit=value=>`'${String(value).replaceAll("'","''")}'`;
const docker=(args,input,timeout=180000)=>brandNativeSpawnSync(args,{input,encoding:'utf8',maxBuffer:64*1024*1024,timeout});
const ok=(result,label)=>{assert.equal(result.status,0,`${label}: ${result.error?.message??''}\n${result.stderr.slice(-8000)}`);return result.stdout.trim();};
const args=()=>['exec','-i',container,'psql','-X','-q','-A','-t','-h','/tmp','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'];
const prefix=`set request.jwt.claims='{"role":"service_role"}';set request.jwt.claim.role='service_role';set statement_timeout='30s';`;
const q=(sql,timeout=180000)=>ok(docker(args(),prefix+sql,timeout),'synthetic local query');
const labels=[];
const tapResults=[];
const reportPath=fileURLToPath(new URL('../../brand-reference-index-native-guards.json',import.meta.url));
const sha=value=>createHash('sha256').update(value).digest('hex');
const report={status:'running',startedAt:new Date().toISOString(),container,database,benchmark,keepFixture,
 sourceHashes:Object.fromEntries(['tests/brand-reference-guards-native.mjs','tests/helpers/database-runtime-authority-fixture.mjs',
 'tests/helpers/database-managed-request-context.mjs',
 'supabase/migrations/20261025121430_platform_brand_reference_scan_performance.sql',
 'supabase/migrations/20261025141347_platform_brand_reference_candidate_indexes.sql'].map(file=>[file,sha(readFileSync(root+file))])),
 checks:labels,pgtap:tapResults,syntheticOnly:true};
const checkpoint=phase=>{report.phase=phase;report.updatedAt=new Date().toISOString();writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(`${report.updatedAt} ${phase}`);};
const check=(condition,label)=>{assert.ok(condition,label);labels.push(label);checkpoint(`PASS ${label}`);};
let created=false;

// Capture the existing source-only fixture's SQL rather than inventing another
// migration replay policy. It supplies empty auth/storage catalog shapes and
// explicit cron/vault/realtime doubles; no snapshot overlay or data is loaded.
async function fixtureSQL(){
 const nativeStatements=[];
 class CaptureDatabase {async exec(sql){nativeStatements.push(sql);} async close(){}}
 const {replayReport}=await createDatabase({includeHeldStudio:true,applyRepair:true,
  databaseFactory:async()=>new CaptureDatabase()});
 assert.ok(repairMigrationPath,'runtime authority repair source is required');
 replayReport.files.push(repairMigrationPath.split('/').at(-1));
 let sql=nativeStatements.join('\n');
 // Roles are cluster-scoped and may already belong to the sibling synthetic
// benchmark. Do not alter or drop them; only create missing fixture roles.
 sql=sql.replace(/create role (anon|authenticated|service_role|supabase_admin|supabase_auth_admin|supabase_storage_admin)( bypassrls)?;/g,
  (_,role,options='')=>`do $$ begin create role ${role}${options}; exception when duplicate_object then null; end $$;`);
 return {sql,replayReport};
}
function session(name,sql){
 const child=brandNativeSpawn(args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
 child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);child.stdin.on('error',()=>{});
 const done=new Promise(resolve=>{child.on('error',e=>resolve({code:-1,stdout,stderr:e.message}));child.on('close',code=>resolve({code,stdout,stderr}));});
 child.stdin.write(`${prefix}set application_name=${lit(name)};begin;set local idle_in_transaction_session_timeout='45s';${sql};\n`);
 return {child,done,output:()=>stdout,error:()=>stderr};
}
async function until(predicate,label,sessions=[]){
 const deadline=Date.now()+20000;
 while(Date.now()<deadline){
  if(predicate())return;
  for(const s of sessions)assert.equal(s.child.exitCode,null,`${label}: backend exited: ${s.error()}`);
  await delay(25);
 }
 throw Error(`timeout: ${label}`);
}
async function ordered(holderSQL,waiterSQL,verify,{rollback=false,releaseAfterWaiter=false}={}){
 const suffix=randomUUID().slice(0,8),hn=`brand_holder_${suffix}`,wn=`brand_waiter_${suffix}`;
 let holder,waiter;
 try{
  holder=session(hn,`${holderSQL};select 'HOLDER_READY'`);
  await until(()=>holder.output().includes('HOLDER_READY'),'holder ready',[holder]);
  waiter=session(wn,waiterSQL);waiter.child.stdin.end('commit;\n\\q\n');
  await until(()=>q(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${lit(hn)} where w.datname=current_database() and w.application_name=${lit(wn)} and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid));`)==='1','independent backend blocked',[holder,waiter]);
  if(releaseAfterWaiter)await waiter.done;
  holder.child.stdin.end(`${rollback?'rollback':'commit'};\n\\q\n`);
  const [a,b]=await Promise.all([holder.done,waiter.done]);assert.equal(a.code,0,a.stderr);verify(b);
 }finally{
  for(const [name,s] of [[hn,holder],[wn,waiter]])if(s&&s.child.exitCode===null){q(`select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and application_name=${lit(name)} and pid<>pg_backend_pid();`);await s.done;}
 }
}
try{
 checkpoint('verify fresh isolated native cluster');
 report.runtime=brandNativePreflight(container);
 const existingRuntimeRole=ok(docker(['exec','-i',container,'psql','-X','-q','-A','-t','-h','/tmp','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],"select exists(select 1 from pg_roles where rolname='cognitive_product_baseline_executor');"),'fresh fixture cluster preflight');
 assert.equal(existingRuntimeRole,'f','A fresh disposable cluster is required: source migration 20260724134631 rejects pre-existing cognitive runtime roles. Reuse a retained successful fixture for bounded follow-ups instead of replaying this cluster.');
 const {sql,replayReport}=await fixtureSQL();
 report.replay={migrationFiles:replayReport.files.length,sqlSHA256:sha(sql),skipped:replayReport.skipped,qualification:replayReport.infrastructure};
 console.log(`Replaying ${replayReport.files.length} source migrations into new synthetic database ${database}.`);
 ok(docker(['exec',container,'createdb','-h','/tmp','-U','postgres','-T','template0',database]),'create isolated database');created=true;
 checkpoint('replay complete source chain into fresh database');
 const replay=ok(docker(args(),`${sql}\nselect 'BRAND_SOURCE_REPLAY_COMPLETE';`,600000),'replay complete source chain with managed-service doubles');
 assert.ok(replay.includes('BRAND_SOURCE_REPLAY_COMPLETE'),'native replay reached final source statement');
 assert.equal(q("select to_regnamespace('private') is not null;"),'t','native source private schema persisted');
 report.nativeVersion=q('select version();');
 report.indexRegistry=JSON.parse(q("select jsonb_build_object('registered',count(*),'available',count(*) filter(where private.platform_brand_index_expression_v1(table_oid) is not null)) from private.platform_brand_reference_indexes_v1;"));
 checkpoint('source replay complete; begin native guard and pgTAP checks');
 console.log(JSON.stringify({nativeVersion:q('select version();'),migrationFiles:replayReport.files.length,skipped:replayReport.skipped.length,qualification:replayReport.infrastructure}));
 check(q("select position('platform_brand_retention_row_mentions' in pg_get_functiondef('private.platform_brand_retention_references_clear(uuid)'::regprocedure))>0;")==='t','native complete clearance uses the new matcher');
 const matcher='private.platform_brand_retention_row_mentions(jsonb,text[],text,text)';
 const attributes=JSON.parse(q(`select jsonb_build_object('volatility',provolatile,'securityDefiner',prosecdef,'strict',proisstrict) from pg_proc where oid=${lit(matcher)}::regprocedure;`));
 assert.deepEqual(attributes,{volatility:'i',securityDefiner:false,strict:false});
 for(const role of ['anon','authenticated','service_role'])assert.equal(q(`select has_function_privilege(${lit(role)},${lit(matcher)},'EXECUTE');`),'f');
 assert.equal(q(`select count(*) from pg_proc p,lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=${lit(matcher)}::regprocedure and acl.grantee=0 and acl.privilege_type='EXECUTE';`),'0');
 check(true,'native matcher remains immutable invoker, non-STRICT, and private to authorized callers');

 // Existing SQL files execute unchanged and each rolls back its own fixtures.
 // The lifecycle file specifically asserts managed Storage's native 42501
 // statement-level delete protection, absent from these source-only doubles;
 // it is deliberately not relabeled as passing through a substitute guard.
 q('create extension pgtap with schema extensions;');
 for(const file of ['platform_brand_archived_verification_test.sql','platform_brand_expiry_transport_test.sql','platform_brand_global_retention_test.sql']){
  checkpoint(`run unchanged pgTAP ${file}`);
  const sql=readFileSync(new URL('../supabase/tests/'+file,import.meta.url),'utf8');
  const expected=Number(sql.match(/select plan\((\d+)\)/i)?.[1]);assert.ok(expected>0);
  const output=q(`set search_path=public,extensions;${sql}`);
  assert.doesNotMatch(output,/^\s*(not ok\b|Bail out!|# (Looks like|Failed))/mi,`${file}: ${output}`);
  const plans=[...output.matchAll(/^1\.\.(\d+)\s*$/gm)].map(match=>Number(match[1]));
  const passes=[...output.matchAll(/^ok (\d+)\b/gm)].map(match=>Number(match[1]));
  assert.deepEqual(plans,[expected],`${file} declared plan`);
  assert.deepEqual(passes,Array.from({length:expected},(_,i)=>i+1),`${file} complete TAP result`);
  tapResults.push({file,passed:expected});checkpoint(`PASS unchanged pgTAP ${file}: ${expected}`);
 }

 const guard='create trigger zzz_platform_brand_retention_reference before insert or update on public.brand_reference_native_consumer for each row execute function private.guard_platform_brand_retention_references();';
 q(`create table public.brand_reference_native_consumer(id uuid primary key default gen_random_uuid(),media_url text,metadata jsonb default '{}');${guard}`);
 const fixture=()=>{
  const id=randomUUID(),key=`brand-native-fixture/logo/${id}.png`;
  // A historical no-job asset is deliberate synthetic setup. Restore both
  // enqueue triggers before every tested operation; reference guards stay on.
  q(`alter table public.platform_brand_assets disable trigger queue_platform_brand_asset_scan_before;alter table public.platform_brand_assets disable trigger enqueue_platform_brand_asset_scan_after;
   insert into storage.objects(id,bucket_id,name,version,metadata) values(gen_random_uuid(),'platform-brand-assets',${lit(key)},'fixture-v1','{"size":23}');
   insert into public.platform_brand_assets(id,owner_user_id,asset_type,storage_object_key,storage_path,mime_type,file_size_bytes) values(${lit(id)},'brand-native-fixture','logo',${lit(key)},${lit(key)},'image/png',23);
   alter table public.platform_brand_assets enable trigger queue_platform_brand_asset_scan_before;alter table public.platform_brand_assets enable trigger enqueue_platform_brand_asset_scan_after;`);
  return {id,key};
 };
 const remove=f=>`update public.platform_brand_assets set deleted_at=clock_timestamp(),asset_state='archived' where id=${lit(f.id)}`;
 const clear=f=>`select private.platform_brand_retention_references_clear(${lit(f.id)})`;
 const insert=f=>`insert into public.brand_reference_native_consumer(media_url) values(${lit('https://fixture.invalid/'+f.key)})`;

 for(const rollback of [false,true]){
  const f=fixture();
  await ordered(insert(f),`${remove(f)};${clear(f)}`,r=>{assert.equal(r.code,0,r.stderr);check(r.stdout.trim()===(rollback?'t':'f'),`pre-existing writer ${rollback?'rollback clears':'commit blocks'} after lock wait`);},{rollback});
 }
 for(const rollback of [false,true]){
  const f=fixture();
  await ordered(`${remove(f)};${clear(f)}`,insert(f),r=>{
   if(rollback){assert.equal(r.code,0,r.stderr);check(true,'retirement rollback releases waiting writer');}
   else{assert.notEqual(r.code,0);check(/brand_retained_reference_forbidden/.test(r.stderr),'retirement commit rejects waiting writer');}
  },{rollback});
 }
 const f=fixture();q(remove(f));
 check(q(clear(f))==='t','baseline absence clears under complete guards');
 q('create table public.brand_reference_future(id uuid,media_url text)');
 check(q(clear(f))==='f','unknown unguarded locator table blocks even when empty');
 q('drop table public.brand_reference_future');
 q('alter table public.brand_reference_native_consumer disable trigger zzz_platform_brand_retention_reference');
 check(q(clear(f))==='f','disabled coverage trigger blocks');
 q(`insert into public.brand_reference_native_consumer(metadata) values(jsonb_build_object('nested',${lit(f.key)}));alter table public.brand_reference_native_consumer enable trigger zzz_platform_brand_retention_reference;`);
 check(q(clear(f))==='f','nested pre-existing metadata remains blocking');
 q('truncate public.brand_reference_native_consumer');
 q('alter table public.brand_reference_native_consumer add column "new URL" text');
 q(`alter table public.brand_reference_native_consumer disable trigger zzz_platform_brand_retention_reference;insert into public.brand_reference_native_consumer("new URL") values(${lit(f.key)});alter table public.brand_reference_native_consumer enable trigger zzz_platform_brand_retention_reference;`);
 check(q(clear(f))==='f','new locator column is discovered on next clearance');
 q('truncate public.brand_reference_native_consumer');
 for(const isolation of ['repeatable read','serializable']){
  const result=docker(args(),`begin isolation level ${isolation};${clear(f)};`);
  check(result.status!==0&&/brand_retention_read_committed_required/.test(result.stderr),`${isolation} rejects clearance`);
 }
 // A timeout is an error, never a successful absence result.
 await ordered('select private.platform_brand_retention_lock()',`set local lock_timeout='2s';${clear(f)}`,r=>check(r.code!==0&&/lock timeout/.test(r.stderr),'lock timeout propagates as error'),{releaseAfterWaiter:true});
 if(benchmark){
  console.log('Loading 429749 synthetic audit rows for complete-reference clearance timing.');
  q(`set statement_timeout='180s';
   create unlogged table public.brand_reference_synthetic_audit(id uuid primary key default gen_random_uuid(),event_type text not null,server_id uuid,app_room_id text,livekit_room_name text,actor_user_id text,reason text not null,metadata jsonb not null,created_at timestamptz not null);
   create index brand_reference_synthetic_audit_created_at on public.brand_reference_synthetic_audit(created_at);
   insert into public.brand_reference_synthetic_audit(event_type,reason,app_room_id,metadata,created_at)
   select 'heartbeat_received','Synthetic local routing fixture','unrelated-'||n,
    jsonb_build_object('status','routed','route','primary','transport','webrtc','session','synthetic-'||n,'latencyMs',n%90,'attempt',1,'region','local','details',repeat('synthetic routing status ',3)),
    timestamptz '2026-01-01 00:00:00+00'+n*interval '1 second'
   from generate_series(1,429749) n;
   create trigger zzz_platform_brand_retention_reference before insert or update on public.brand_reference_synthetic_audit for each row execute function private.guard_platform_brand_retention_references();
   vacuum analyze public.brand_reference_synthetic_audit;`);
  const fixtureStats=JSON.parse(q(`select jsonb_build_object('rows',count(*),'totalBytes',pg_total_relation_size('public.brand_reference_synthetic_audit'),'meanMetadataBytes',round(avg(pg_column_size(metadata)),2),'locatorColumns',private.deleted_media_locator_columns('public.brand_reference_synthetic_audit'::regclass),'indexes',(select jsonb_agg(indexdef order by indexname) from pg_indexes where schemaname='public' and tablename='brand_reference_synthetic_audit'),'persistence','unlogged synthetic fixture') from public.brand_reference_synthetic_audit;`));
  assert.equal(fixtureStats.rows,429749);assert.deepEqual(fixtureStats.locatorColumns,['metadata']);assert.equal(fixtureStats.indexes.length,2);
  // This is the actual complete VOLATILE function and all its catalog/coverage
  // checks, not a matcher-only projection or cached/reused clearance result.
  q(`create function private.native_measure_brand_clearance(p_asset uuid,p_calls integer) returns jsonb language plpgsql as $$
   declare started timestamptz:=clock_timestamp();n integer;result boolean;
   begin
    for n in 1..p_calls loop
     result:=private.platform_brand_retention_references_clear(p_asset);
     if result is distinct from true then raise exception 'synthetic clearance did not return true';end if;
    end loop;
    return jsonb_build_object('calls',p_calls,'elapsedMs',extract(epoch from clock_timestamp()-started)*1000,'allClear',true);
   end $$;`);
  const timings=[];
  for(const calls of [1,3]){
   console.log(`Timing ${calls} complete references_clear calls in one transaction.`);
   const started=performance.now();
   try{
    const timing=JSON.parse(q(`set track_functions='none';set statement_timeout='30s';select private.native_measure_brand_clearance(${lit(f.id)},${calls});`,45000));
    timings.push({...timing,completed:true,rpcBudgetMs:30000,withinRpcBudget:timing.elapsedMs<30000});
   }catch(error){
    timings.push({calls,completed:false,elapsedAtFailureMs:performance.now()-started,rpcBudgetMs:30000,withinRpcBudget:false,error:String(error.message)});
    process.exitCode=1;
   }
   console.log(JSON.stringify({completeClearanceTiming:timings.at(-1)}));
   if(!timings.at(-1).completed)break;
  }
  console.log(JSON.stringify({completeClearanceBenchmark:{fixture:fixtureStats,timings,scope:'Synthetic local native PostgreSQL full references_clear, including every catalog and trigger coverage check; three calls share one transaction. Not a complete archive RPC or production latency guarantee.'}},null,2));
 }
 console.log(JSON.stringify({passed:labels.length,checks:labels,pgtap:tapResults,pgtapNotRun:[{file:'platform_brand_retention_lifecycle_test.sql',reason:'Requires managed native Storage statement-level delete protection, which is intentionally absent from source-only managed-service doubles.'}],scope:'Native source-replayed SQL guards and writer ordering. Managed-service doubles; no scanner/provider/HTTP or production runtime claim.'},null,2));
 report.status=process.exitCode?'failed':'passed';checkpoint('native guard run complete');
}catch(error){
 report.status='failed';report.error=String(error.message);checkpoint('native guard run failed; preserve exact completed stages');throw error;
}finally{
 if(created){
  if(keepFixture){report.retainedSyntheticFixture={container,database,socket:'/tmp',noProductionData:true};console.log(JSON.stringify({retainedSyntheticFixture:report.retainedSyntheticFixture}));}
  else ok(docker(['exec',container,'dropdb','-h','/tmp','-U','postgres','--force',database]),'drop own disposable database');
 }
 writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
}
