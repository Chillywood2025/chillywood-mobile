#!/usr/bin/env node
// Native mode uses only a generated disposable clone of local Supabase.
// --bootstrap checks the same fixture SQL with real migrated functions in PGlite;
// it is deliberately NOT evidence of independent backend contention.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {PGlite} from '@electric-sql/pglite';
import {installByteReceiptFixture} from '../tests/helpers/media-scan-byte-receipt-fixture.mjs';
const bootstrap=process.argv.includes('--bootstrap');
const negativeControl=process.argv.includes('--negative-control');
if(process.argv.includes('--help')) {console.log('Run after local Supabase reset: disposable LOCAL clone only. --bootstrap validates fixture SQL in PGlite, not concurrency. --negative-control removes NOWAIT only inside the generated clone and requires the held-lock deadline to reject it.');process.exit(0);}
assert.deepEqual(process.argv.slice(2),bootstrap?['--bootstrap']:negativeControl?['--negative-control']:[]);
const lit=x=>`'${String(x).replaceAll("'","''")}'`;
const claims=`set request.jwt.claims='{"role":"service_role"}';set request.jwt.claim.role='service_role';`;
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"/m)?.[1];
assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER||`supabase_db_${project}`;
assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/);
const database=`scan_byte_queue_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}`;
const docker=(args,input,encoding='utf8')=>spawnSync('docker',args,{input,encoding,maxBuffer:256*1024*1024,timeout:120000});
const ok=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message||String(r.stderr).replaceAll(/[A-Za-z0-9_-]{40,}/g,'<redacted>')}`);return r.stdout;};
const args=(db=database)=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db];
const native=(sql,db=database)=>ok(docker(args(db),`${db==='postgres'?'set default_transaction_read_only=on;':claims}set statement_timeout='15s';${sql}`),'local query').trim();
const admin=(command,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','scan-byte-admin',...command],input,encoding);
const fingerprint=`select jsonb_build_object('jobs',(select count(*) from public.media_scan_jobs),'receipts',(select count(*) from private.media_scan_byte_receipts),'observations',(select count(*) from private.media_scan_byte_observations),'assets',(select count(*) from public.platform_brand_assets),'beginDefinition',md5(pg_get_functiondef('public.begin_media_scan_byte_observation(uuid,text,integer)'::regprocedure)))::text;`;
let db,cloned=false,before,checks=0;
const exec=async sql=>{if(db)await db.exec(sql);else native(sql);};
const scalar=async sql=>db?String(Object.values((await db.query(sql)).rows[0])[0]):native(sql);
async function fixture() {
 const id=randomUUID(),key=`scan_byte_disposable_owner/logo/${id}.png`;
 await exec(`insert into storage.objects(id,bucket_id,name,version,metadata) values(gen_random_uuid(),'platform-brand-assets',${lit(key)},${lit(randomUUID())},'{"size":23}');
 insert into public.platform_brand_assets(id,owner_user_id,asset_type,storage_object_key,storage_path,mime_type,file_size_bytes)
 values(${lit(id)},'scan_byte_disposable_owner','logo',${lit(key)},${lit(key)},'image/png',23);`);
 const job=await scalar(`select id from public.media_scan_jobs where target_table='platform_brand_assets' and target_id=${lit(id)} order by created_at desc limit 1`);
 assert.match(job,/^[0-9a-f-]{36}$/);
 await exec(`update public.media_scan_jobs set priority=-2147483648 where id=${lit(job)};select * from public.claim_media_scan_jobs(1,'byte-native-worker');`);
 assert.equal(await scalar(`select status from public.media_scan_jobs where id=${lit(job)}`),'scanning');
 const attempt=Number(await scalar(`select attempt_count from public.media_scan_jobs where id=${lit(job)}`));
 return {id,key,job,attempt};
}
const begin=f=>`select public.begin_media_scan_byte_observation(${lit(f.job)},'byte-native-worker',${f.attempt})`;
const complete=f=>`select public.complete_media_scan_job(${lit(f.job)},'clean','clamav','ClamAV native fixture','daily/fixture',null,null,1)`;
const record=f=>`select public.record_media_scan_byte_receipt(${lit(f.observation)},${lit(f.job)},'byte-native-worker',repeat('a',64),23)`;
const match=f=>`select private.platform_brand_scan_byte_receipt_matches(${lit(f.receipt)},(select binding from private.media_scan_byte_observations where id=${lit(f.observation)}),repeat('a',64),23)`;
async function completed(f) {
 await exec(complete(f));
 assert.equal(await scalar(`select status from public.media_scan_jobs where id=${lit(f.job)}`),'clean');
 assert.equal(await scalar(`select scan_status from public.platform_brand_assets where id=${lit(f.id)}`),'clean');
}
function session(name,sql,finish=false) {
 const child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
 child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.stdin.on('error',()=>{});
 const done=new Promise(resolve=>{child.on('error',e=>resolve({code:-1,stdout,stderr:e.message}));child.on('close',code=>resolve({code,stdout,stderr}));});
 child.stdin.write(`${claims}set application_name=${lit(name)};begin;set local statement_timeout='10s';set local idle_in_transaction_session_timeout='30s';${sql};\n`);
 if(finish)child.stdin.end('commit;\n\\q\n');
 return {child,done,output:()=>stdout};
}
async function terminate(name,s) {
 if(!s||s.child.exitCode!==null)return;
 native(`select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and application_name=${lit(name)} and pid<>pg_backend_pid()`);
 s.child.kill('SIGTERM');await Promise.race([s.done,delay(1000)]);
}
async function contended(holderSql,waiterSql,verify,holderFinish='',expectBlocked=false) {
 const hn=`byte-holder-${process.pid}-${checks}`,wn=`byte-waiter-${process.pid}-${checks}`;let h,w;
 try {
  h=session(hn,`${holderSql};select 'HOLDER_READY'`);
  const end=Date.now()+15000;
  while(!h.output().includes('HOLDER_READY')) {assert.equal(h.child.exitCode,null,'holder exited before acquiring lock');assert.ok(Date.now()<end,'holder readiness timeout');await delay(25);}
  // Independent backend owns its row lock before the receipt transaction starts.
  assert.equal(native(`select count(*) from pg_stat_activity where datname=current_database() and application_name=${lit(hn)} and state='idle in transaction'`),'1');
  w=session(wn,waiterSql,true);
  let timer,result;
  const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{try {
   // The negative control must demonstrate an actual row-lock wait, not a slow
   // process launch or unrelated timeout. Both backends remain clone-local.
   if(expectBlocked)assert.equal(native(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${lit(hn)} where w.datname=current_database() and h.datname=current_database() and w.application_name=${lit(wn)} and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid))`),'1','negative control must observe the actual holder blocking the receipt');
   reject(Error('NOWAIT receipt blocked behind held row lock'));
  } catch(error) {reject(error);} },4000);});
  try {result=await Promise.race([w.done,deadline]);} finally {clearTimeout(timer);}
  verify(result);
  assert.equal(h.child.exitCode,null,'holder must remain open through receipt rejection');
  h.child.stdin.end(`${holderFinish};commit;\n\\q\n`);
  const holder=await h.done;assert.equal(holder.code,0,holder.stderr);checks++;
 } finally {await terminate(wn,w);await terminate(hn,h);}
}
try {
 if(bootstrap) {
  db=new PGlite();
  await db.exec(`create schema private;create schema auth;create schema storage;create role anon;create role authenticated;create role service_role;
   create function auth.jwt() returns jsonb language sql as $$select current_setting('request.jwt.claims')::jsonb$$;
   create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role')$$;
   ${claims}
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,version text,metadata jsonb);
   create table platform_brand_assets(id uuid primary key,owner_user_id text,asset_type text,created_at timestamptz default now(),deleted_at timestamptz,
    storage_provider text default 'supabase',storage_bucket text default 'platform-brand-assets',storage_object_key text,storage_path text,
    mime_type text,file_size_bytes bigint,moderation_status text,moderation_reason text,moderated_at timestamptz,updated_at timestamptz);`);
  await installByteReceiptFixture(db);
  const sql=readFileSync('supabase/migrations/20260530191115_media_malware_scanning_pipeline.sql','utf8');
  for(const name of ['enqueue_media_scan_job','enqueue_platform_brand_asset_scan']) {
   const start=sql.indexOf(`create or replace function public."${name}"(`);assert.ok(start>=0);
   await db.exec(sql.slice(start,sql.indexOf('$$;',start)+3));
  }
  await db.exec('create unique index fixture_scan_unique on media_scan_jobs(target_table,target_column,target_id,storage_bucket,storage_object_key); create trigger fixture_enqueue after insert on platform_brand_assets for each row execute function public.enqueue_platform_brand_asset_scan();');
 } else {
  if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//);
  assert.match(ok(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker required').trim(),/^(unix|npipe):\/\//);
  assert.ok(ok(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'local CLI discovery').split('\n').includes(container));
  before=native(fingerprint,'postgres');
  ok(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create generated clone');cloned=true;
  ok(docker(args(),'create schema vault;create extension supabase_vault with schema vault;'),'initialize clone');
  const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql','--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
  ok(dump,'read-only dump');ok(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],dump.stdout,null),'restore clone');
 }
 // Basic fixture is identical in both modes. Each query commits independently.
 const baseline=await fixture();baseline.observation=await scalar(begin(baseline));await completed(baseline);
 baseline.receipt=await scalar(record(baseline));assert.match(baseline.receipt,/^[0-9a-f-]{36}$/);
 assert.equal(await scalar(match(baseline)),bootstrap?'true':'t');
 if(negativeControl) {
  assert.equal(cloned,true,'negative control requires a generated disposable clone');
  assert.equal(db,undefined,'negative control requires independent native backends');
  const f=await fixture();
  const original=native("select pg_get_functiondef('public.begin_media_scan_byte_observation(uuid,text,integer)'::regprocedure)");
  assert.match(original,/for share nowait/i);
  try {
   // Native defaults route exclusively to `database`, never source postgres.
   native(original.replace(/for share nowait/gi,'for share'));
   assert.doesNotMatch(native("select pg_get_functiondef('public.begin_media_scan_byte_observation(uuid,text,integer)'::regprocedure)"),/for share nowait/i);
   await assert.rejects(contended(
    `select id from public.media_scan_jobs where id=${lit(f.job)} for update`,begin(f),
    ()=>assert.fail('missing NOWAIT unexpectedly passed before held-lock deadline'),'',true
   ),/^Error: NOWAIT receipt blocked behind held row lock$/);
  } finally {native(original);}
  assert.equal(native("select pg_get_functiondef('public.begin_media_scan_byte_observation(uuid,text,integer)'::regprocedure)"),original,'clone definition restored');
  assert.equal(await scalar(`select count(*) from private.media_scan_byte_observations where job_id=${lit(f.job)}`),'0');
  await completed(f);
  console.log('Negative control passed: removed NOWAIT caused an observed independent-backend row-lock wait and was rejected at the held-lock deadline. Clone function restored; original completion unaffected.');
 }
 if(!bootstrap&&!negativeControl) {
  for(const target of ['job','source','storage']) for(const phase of ['begin','record','match']) {
   const f=await fixture();
   if(phase!=='begin'){f.observation=await scalar(begin(f));await completed(f);}
   if(phase==='match')f.receipt=await scalar(record(f));
   const lock=target==='job'?`select id from public.media_scan_jobs where id=${lit(f.job)} for update`:
    target==='source'?`select id from public.platform_brand_assets where id=${lit(f.id)} for update`:
     `select id from storage.objects where bucket_id='platform-brand-assets' and name=${lit(f.key)} for update`;
   const operation=phase==='begin'?begin(f):phase==='record'?record(f):match(f);
   await contended(lock,operation,r=>{
    if(phase==='match'){assert.equal(r.code,0,r.stderr);assert.equal(r.stdout.trim(),'f');}
    else {assert.notEqual(r.code,0);assert.match(r.stderr,target==='job'?/could not obtain lock/:phase==='begin'?/binding_unavailable/:/result_stale/);}
   },phase==='begin'?complete(f):'');
   // Rejection never changes or strands the existing completion result.
   assert.equal(await scalar(`select status from media_scan_jobs where id=${lit(f.job)}`),'clean');
   assert.equal(await scalar(`select scan_status from platform_brand_assets where id=${lit(f.id)}`),'clean');
   if(phase==='begin')assert.equal(await scalar(`select count(*) from private.media_scan_byte_observations where job_id=${lit(f.job)}`),'0');
   if(phase==='record'){assert.equal(await scalar(`select count(*) from private.media_scan_byte_receipts where observation_id=${lit(f.observation)}`),'0');f.receipt=await scalar(record(f));}
   if(phase!=='begin')assert.equal(await scalar(match(f)),'t');
  }
 }
 // Observe a still-valid claim, then complete in a different committed session
 // after its exact lease expires. Existing completion still succeeds, receipt does not.
 const expired=await fixture();
 await exec(`update media_scan_jobs set claimed_at=clock_timestamp()-interval '19 minutes 59 seconds' where id=${lit(expired.job)}`);
 expired.observation=await scalar(begin(expired));await delay(1200);await completed(expired);
 if(bootstrap)await assert.rejects(exec(record(expired)),/result_stale/);
 else {
  const r=docker(args(),`${claims}${record(expired)};`);assert.notEqual(r.status,0);assert.match(r.stderr,/result_stale/);
 }
 assert.equal(await scalar(`select count(*) from private.media_scan_byte_receipts where observation_id=${lit(expired.observation)}`),'0');
 console.log(bootstrap?'Scanner receipt bootstrap and real expiry rejection passed in PGlite; native multi-session cases NOT RUN.':negativeControl?'Native negative control and lease expiry passed; positive nine-case suite is a separate command. No provider operations.':`Scanner receipt native PostgreSQL: ${checks} NOWAIT competing-transaction cases plus real lease expiry passed. No provider operations.`);
} finally {
 if(db)await db.close();
 if(cloned)ok(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop generated clone');
 if(before!==undefined)assert.equal(native(fingerprint,'postgres'),before,'local source unchanged');
}
