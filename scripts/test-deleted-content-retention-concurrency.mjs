#!/usr/bin/env node
// Two real PostgreSQL backends. Only a generated disposable LOCAL clone changes.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
if(process.argv.includes('--help')){console.log('Run after local Supabase reset. Uses a disposable clone of local supabase_db_* only; no remote URLs.');process.exit(0);}
assert.equal(process.argv.length,2);
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]{1,200})"/m)?.[1];
assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER || `supabase_db_${project}`;
assert.match(container,/^supabase_db_[A-Za-z0-9_.-]{1,200}$/);
const database=`retention_queue_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}`;
const lit=x=>`'${String(x).replaceAll("'","''")}'`;
const docker=(args,input,encoding='utf8')=>spawnSync('docker',args,{input,encoding,maxBuffer:256*1024*1024,timeout:120000});
const ok=(r,label)=>{assert.equal(r.status,0,`${label}: ${r.error?.message || String(r.stderr).replaceAll(/[A-Za-z0-9_-]{40,}/g,'<redacted>')}`);return r.stdout;};
const args=(db=database)=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db];
const query=(sql,db=database)=>ok(docker(args(db),`${db==='postgres'?'set default_transaction_read_only=on;':''}set statement_timeout='15s';${sql}`),'local query').trim();
const admin=(command,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','retention-admin',...command],input,encoding);
const fingerprint="select jsonb_build_object('users',(select count(*) from auth.users),'records',(select count(*) from private.deleted_content_records),'claims',(select count(*) from private.deleted_content_expiry_claims),'settings',(select jsonb_agg(to_jsonb(s)) from private.deleted_content_retention_settings s))::text;";
let cloned=false,before,checks=0;
function session(name,sql,finish=false,isolation='read committed'){
 const child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);
 const done=new Promise(resolve=>{child.on('error',e=>resolve({code:-1,stderr:e.message,stdout}));child.on('close',code=>resolve({code,stderr,stdout}));});
 child.stdin.on('error',()=>{});
 // Each supplied batch must be complete before COMMIT or a later stdin write.
 // Callers intentionally need not provide a final statement separator.
 child.stdin.write(`set application_name=${lit(name)};begin isolation level ${isolation};set local statement_timeout='35s';set local idle_in_transaction_session_timeout='45s';${sql};\n`);
 if(finish)child.stdin.end('commit;\n\\q\n');
 return{child,done,output:()=>stdout,status:()=>({code:child.exitCode,stdout,stderr})};
}
async function until(fn,label,sessions=[]){
 const end=Date.now()+20000;
 while(Date.now()<end){
  if(fn())return;
  for(const s of sessions){
   const result=s.status();
   if(result.code!==null){
    const diagnostic=result.stderr.replaceAll(/[A-Za-z0-9_-]{40,}/g,'<redacted>')
     .replaceAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,'<synthetic-id>').slice(-2000);
    throw Error(`${label}: backend exited (${result.code}) before the required state: ${diagnostic}`);
   }
  }
  await delay(25);
 }
 throw Error(`timeout ${label}`);
}
async function terminate(name,s){if(!s || s.child.exitCode!==null)return;query(`select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and application_name=${lit(name)} and pid<>pg_backend_pid();`);s.child.kill('SIGTERM');await Promise.race([s.done,delay(1000)]);}
async function ordered(first,second,verify,{rollback=false,afterQueue=''}={}){
 const hn=`retention-holder-${checks}-${process.pid}`,wn=`retention-waiter-${checks}-${process.pid}`;let h,w;
 try{
  h=session(hn,`${first};select 'HOLDER_READY';`);await until(()=>h.output().includes('HOLDER_READY'),'holder ready',[h]);
  w=session(wn,second,true);
  await until(()=>query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${lit(hn)} where w.datname=current_database() and w.application_name=${lit(wn)} and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid));`)==='1','observed independent backend lock queue',[h,w]);
  h.child.stdin.end(`${afterQueue};${rollback?'rollback':'commit'};\n\\q\n`);const [a,b]=await Promise.all([h.done,w.done]);assert.equal(a.code,0,a.stderr);verify(b);checks++;
 }finally{await terminate(hn,h);await terminate(wn,w);}
}
try{
 if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//);
 assert.match(ok(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker required').trim(),/^(unix|npipe):\/\//);
 assert.ok(ok(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'local CLI discovery').split('\n').includes(container));
 before=query(fingerprint,'postgres');
 ok(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create generated clone');cloned=true;
 ok(docker(args(),'create schema vault;create extension supabase_vault with schema vault;'),'initialize clone');
 const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql','--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
 ok(dump,'read-only dump');ok(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],dump.stdout,null),'restore clone');
 assert.equal(query('select not capture_enabled from private.deleted_content_retention_settings;'),'t');
 assert.equal(query('select not armed from private.deleted_media_reference_fence;'),'t');
 query(readFileSync('tests/fixtures/deleted-content-local-qualification.sql','utf8'));
 query(`create table public.retirement_inactive_consumer(id uuid primary key default gen_random_uuid(),metadata jsonb);
 create trigger zzz_deleted_media_reference_guard before insert or update on public.retirement_inactive_consumer
 for each row execute function private.guard_deleted_media_references();`);
 // Actual PostgreSQL isolation, not a mock of the snapshot/row-lock behavior.
 for(const isolation of ['repeatable read','serializable']){
  assert.equal(query(`begin isolation level ${isolation};insert into public.retirement_inactive_consumer(metadata) values('{"unrelated":true}');
   update public.retirement_inactive_consumer set metadata='{"unrelated":"updated"}';
   insert into public.legal_holds(target_type,target_id,reason,status) values('room_message',gen_random_uuid()::text,'Synthetic inactive hold','active');
   update public.legal_holds set reason='Synthetic inactive hold updated' where reason='Synthetic inactive hold';
   select not exists(select 1 from pg_locks where pid=pg_backend_pid() and locktype='advisory' and classid=176214 and objid=30);commit;`),'t');checks++;
  // An uncommitted enable that rolls back must not strand writers or arm them.
  await ordered('update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true',
   `set transaction isolation level ${isolation};insert into public.retirement_inactive_consumer(metadata) values('{"rollback":true}')`,
   r=>{assert.equal(r.code,0,r.stderr);assert.equal(query('select not armed from private.deleted_media_reference_fence;'),'t');},{rollback:true});
 }
 const author=randomUUID();query(`insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values(${lit(author)},${lit(`retention-${author}@example.test`)},now(),false,false);`);
 const textOnlyTarget=randomUUID(),textOnlyDeletion=randomUUID();
 query(`insert into private.deleted_content_records(id,target_type,target_id,author,content,deletion_kind,deleted_at,expires_at)
 values(${lit(textOnlyDeletion)},'room_message',${lit(textOnlyTarget)},${lit(author)},'{"body":"synthetic text-only"}','hard',now()-interval '31 days',now()-interval '1 day');`);
 await ordered(`update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,text_expiry_enabled=true;
  select public.expire_deleted_content_text(${lit(textOnlyDeletion)})`,
  `insert into public.legal_holds(target_type,target_id,reason,status) values('room_message',${lit(textOnlyTarget)},'Synthetic text-only preservation','active')`,
  r=>{assert.equal(r.code,0,r.stderr);assert.equal(query('select not armed from private.deleted_media_reference_fence;'),'t');
   assert.equal(query(`select count(*) from private.deleted_content_expiry_claims where deletion_id=${lit(textOnlyDeletion)};`),'0');
   assert.equal(query(`select count(*) from private.deleted_content_records where id=${lit(textOnlyDeletion)};`),'1');
  },{rollback:true});
 const firstTarget=randomUUID(),firstReservation=randomUUID(),firstStage=randomUUID(),firstDeletion=randomUUID(),firstKey=`${author}/${firstTarget}/source.mp4`;
 query(`insert into media_upload_reservations(id,owner_user_id,surface_type,storage_provider,storage_bucket,storage_object_key,expected_mime_type,expected_size_bytes,status,expires_at,verified_at,attached_record_id,attached_at)
  values(${lit(firstReservation)},${lit(author)},'creator_video','cloudflare_r2','chillywood-media-origin',${lit(firstKey)},'video/mp4',1024,'verified',now()-interval '30 days',now()-interval '31 days',${lit(firstTarget)},now()-interval '31 days');
  insert into videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes)
  values(${lit(firstTarget)},${lit(author)},'Synthetic first registry','draft','clean','cloudflare_r2','chillywood-media-origin',${lit(firstKey)},${lit(firstKey)},'video/mp4',1024);`);
 const enable='update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,media_staging_enabled=true';
 const firstStageSql=`insert into private.deleted_content_media_stages(id,target_type,target_id,author,provider,bucket,object_key,reservation_id)
  values(${lit(firstStage)},'creator_video',${lit(firstTarget)},${lit(author)},'cloudflare_r2','chillywood-media-origin',${lit(firstKey)},${lit(firstReservation)})`;
 const alias=`insert into public.retirement_inactive_consumer(metadata) values(jsonb_build_object('key',${lit(firstKey)}))`;
 await ordered(`${enable};${firstStageSql}`,alias,r=>{
  assert.equal(r.code,0,r.stderr);assert.equal(query('select not armed from private.deleted_media_reference_fence;'),'t');
  assert.equal(query('select count(*) from private.deleted_media_key_retirements;'),'0');
 },{rollback:true});
 query('delete from public.retirement_inactive_consumer;');
 // Establish stale snapshots before arming without acquiring a barrier lock.
 const stale=[];
 try{
  for(const isolation of ['repeatable read','serializable']){
   const name=`retention-stale-${isolation.replaceAll(' ','-')}-${process.pid}`;
   const s=session(name,"select count(*) from private.deleted_media_reference_fence;select 'SNAPSHOT_READY';",false,isolation);
   stale.push({name,s});await until(()=>s.output().includes('SNAPSHOT_READY'),'stale snapshot established',[s]);
  }
  // The first armer must wait for every pre-arm writer before taking source or
  // global locks. The holder can still update the source while arming waits.
  await ordered(alias,`${enable};${firstStageSql};
   insert into private.deleted_content_records(id,target_type,target_id,author,content,deletion_kind,deleted_at,expires_at)
   values(${lit(firstDeletion)},'creator_video',${lit(firstTarget)},${lit(author)},'{}','hard',now()-interval '31 days',now()-interval '1 day');
   update private.deleted_content_media_stages set deletion_id=${lit(firstDeletion)} where id=${lit(firstStage)};
   update private.deleted_content_retention_settings set capture_enabled=false,media_staging_enabled=false;
   delete from videos where id=${lit(firstTarget)};
   update media_scan_jobs set status='clean' where target_table='videos' and target_id=${lit(firstTarget)};
   select private.claim_deleted_media_retirement(${lit(firstStage)});`,r=>{
    assert.equal(r.code,0,r.stderr);assert.match(r.stdout,/(^|\n)f(\n|$)/);
    assert.equal(query('select armed from private.deleted_media_reference_fence;'),'t');
    assert.equal(query(`select status from private.deleted_media_key_retirements where stage_id=${lit(firstStage)};`),'retained');
   },{afterQueue:`update videos set title='Writer finished before arming' where id=${lit(firstTarget)}`});
  for(const {s} of stale){
   s.child.stdin.end(`${alias};commit;\n\\q\n`);const r=await s.done;
   assert.notEqual(r.code,0);assert.match(r.stderr,/could not serialize access due to concurrent update/);checks++;
  }
 }finally{for(const {name,s} of stale)await terminate(name,s);}
 query('delete from public.retirement_inactive_consumer;');
 assert.equal(query(`select private.claim_deleted_media_retirement(${lit(firstStage)});`),'t');checks++;
 query('update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,text_expiry_enabled=true,media_staging_enabled=false;');
 for(const editFirst of [true,false]){
  const target=randomUUID();query(`insert into profile_posts(id,user_id,body,visibility,moderation_status) values(${lit(target)},${lit(author)},'before','draft','clean');`);
  const edit=`update profile_posts set body='after' where id=${lit(target)}`,del=`delete from profile_posts where id=${lit(target)}`;
  await ordered(editFirst?edit:del,`${editFirst?del:edit};`,r=>{assert.equal(r.code,0,r.stderr);assert.equal(query(`select content->>'body' from private.deleted_content_records where target_id=${lit(target)};`),editFirst?'after':'before');assert.equal(query(`select count(*) from profile_posts where id=${lit(target)};`),'0');});
 }
 for(const holdFirst of [true,false]){
  const target=randomUUID(),deletion=randomUUID();
  query(`insert into private.deleted_content_records(id,target_type,target_id,author,content,deletion_kind,deleted_at,expires_at) values(${lit(deletion)},'room_message',${lit(target)},${lit(author)},'{"body":"synthetic"}','hard',now()-interval '31 days',now()-interval '1 day');`);
  const hold=`insert into public.legal_holds(target_type,target_id,reason,status) values('room_message',${lit(target)},'Synthetic legal preservation','active')`;
  const purge=`select public.expire_deleted_content_text(${lit(deletion)})::text`;
  await ordered(holdFirst?hold:purge,`${holdFirst?purge:hold};`,r=>{
   if(holdFirst){assert.equal(r.code,0,r.stderr);assert.ok(r.stdout.includes('held'));assert.equal(query(`select count(*) from private.deleted_content_records where id=${lit(deletion)};`),'1');}
   else{assert.notEqual(r.code,0);assert.match(r.stderr,/retention_preservation_unavailable_deletion_already_claimed/);assert.equal(query(`select count(*) from public.legal_holds where target_id=${lit(target)};`),'0');}
  });
 }
 query('update private.deleted_content_retention_settings set media_staging_enabled=true;');
 for(const holdFirst of [true,false]){
  const target=randomUUID(),reservation=randomUUID(),stage=randomUUID(),deletion=randomUUID(),key=`${author}/${target}/source.mp4`;
  query(`insert into media_upload_reservations(id,owner_user_id,surface_type,storage_provider,storage_bucket,storage_object_key,expected_mime_type,expected_size_bytes,status,expires_at,verified_at,attached_record_id,attached_at)
   values(${lit(reservation)},${lit(author)},'creator_video','cloudflare_r2','chillywood-media-origin',${lit(key)},'video/mp4',1024,'verified',now()-interval '30 days',now()-interval '31 days',${lit(target)},now()-interval '31 days');
   insert into videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes)
   values(${lit(target)},${lit(author)},'Synthetic media','draft','clean','cloudflare_r2','chillywood-media-origin',${lit(key)},${lit(key)},'video/mp4',1024);
   insert into private.deleted_content_media_stages(id,target_type,target_id,author,provider,bucket,object_key,reservation_id)
   values(${lit(stage)},'creator_video',${lit(target)},${lit(author)},'cloudflare_r2','chillywood-media-origin',${lit(key)},${lit(reservation)});
   insert into private.deleted_content_records(id,target_type,target_id,author,content,deletion_kind,deleted_at,expires_at)
   values(${lit(deletion)},'creator_video',${lit(target)},${lit(author)},'{"title":"synthetic expired"}','hard',now()-interval '31 days',now()-interval '1 day');
   update private.deleted_content_media_stages set deletion_id=${lit(deletion)} where id=${lit(stage)};
   update private.deleted_content_retention_settings set capture_enabled=false,media_staging_enabled=false,text_expiry_enabled=false,media_expiry_enabled=false;
   delete from videos where id=${lit(target)};
   update media_scan_jobs set status='clean' where target_table='videos' and target_id=${lit(target)};
   update private.deleted_content_retention_settings set capture_enabled=true,media_staging_enabled=true,text_expiry_enabled=true,media_expiry_enabled=true;`);
  const hold=`insert into public.legal_holds(target_type,target_id,reason,status) values('creator_video',${lit(target)},'Synthetic media preservation','active')`;
  const claim=`select public.claim_deleted_content_media_expiry(${lit(stage)})::text`;
  await ordered(holdFirst?hold:claim,`${holdFirst?claim:hold};`,r=>{
   if(holdFirst){assert.equal(r.code,0,r.stderr);assert.ok(r.stdout.includes('held'));assert.equal(query(`select count(*) from private.deleted_content_media_expiry_claims where stage_id=${lit(stage)};`),'0');}
   else{assert.notEqual(r.code,0);assert.match(r.stderr,/retention_preservation_unavailable_deletion_already_claimed/);assert.equal(query(`select count(*) from private.deleted_content_media_expiry_claims where stage_id=${lit(stage)};`),'1');}
  });
 }
 assert.equal(checks,16);
 // Historical object-only requests are constructed as aged stages against real
 // verified source/reservation rows. They are never whole-content delete intent.
 const recoveryFixture=()=>{
  const target=randomUUID(),reservation=randomUUID(),stage=randomUUID(),replacementReservation=randomUUID();
  const key=`${author}/${target}/source.mp4`,replacement=`${author}/${target}/source.mov`;
  query(`insert into media_upload_reservations(id,owner_user_id,surface_type,storage_provider,storage_bucket,storage_object_key,expected_mime_type,expected_size_bytes,status,expires_at,verified_at,attached_record_id,attached_at)
   values(${lit(reservation)},${lit(author)},'creator_video','cloudflare_r2','chillywood-media-origin',${lit(key)},'video/mp4',1024,'verified',now()+interval '1 hour',now(),${lit(target)},now()),
    (${lit(replacementReservation)},${lit(author)},'creator_video','cloudflare_r2','chillywood-media-origin',${lit(replacement)},'video/quicktime',1024,'verified',now()+interval '1 hour',now(),${lit(target)},now());
   insert into videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes)
   values(${lit(target)},${lit(author)},'Synthetic recovery','draft','clean','cloudflare_r2','chillywood-media-origin',${lit(key)},${lit(key)},'video/mp4',1024);
   update media_scan_jobs set status='clean' where target_table='videos' and target_id=${lit(target)};
   insert into private.deleted_content_media_stages(id,target_type,target_id,author,provider,bucket,object_key,reservation_id,staged_at,reconcile_after)
   values(${lit(stage)},'creator_video',${lit(target)},${lit(author)},'cloudflare_r2','chillywood-media-origin',${lit(key)},${lit(reservation)},clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour');`);
  return {target,stage,key,replacement,
   replace:`update videos set storage_object_key=${lit(replacement)},storage_path=${lit(replacement)},mime_type='video/quicktime' where id=${lit(target)};
    update media_scan_jobs set status='clean' where target_table='videos' and target_id=${lit(target)}`,
   reconcile:`select public.reconcile_deleted_content_stage(${lit(stage)})::text`,
   hold:`insert into public.legal_holds(target_type,target_id,reason,status) values('creator_video',${lit(target)},'Synthetic orphan preservation','active')`,
   alias:`insert into public.retirement_inactive_consumer(metadata) values(jsonb_build_object('key',${lit(key)}))`};
 };
 for(const holdFirst of [true,false]){
  const f=recoveryFixture();query(f.replace);
  await ordered(holdFirst?f.hold:f.reconcile,holdFirst?f.reconcile:f.hold,r=>{
   if(holdFirst){
    assert.equal(r.code,0,r.stderr);assert.match(r.stdout,/"status": "held"/);
    assert.equal(query(`select count(*) from private.deleted_content_stage_cleanup_claims where stage_id=${lit(f.stage)}`),'0');
   }else{
    assert.notEqual(r.code,0);assert.match(r.stderr,/retention_preservation_unavailable_deletion_already_claimed/);
    assert.equal(query(`select count(*) from private.deleted_content_stage_cleanup_claims where stage_id=${lit(f.stage)}`),'1');
   }
  });
 }
 for(const referenceFirst of [true,false]){
  const f=recoveryFixture();query(f.replace);
  await ordered(referenceFirst?f.alias:f.reconcile,referenceFirst?f.reconcile:f.alias,r=>{
   if(referenceFirst){assert.equal(r.code,0,r.stderr);assert.match(r.stdout,/"status": "unsupported_or_live_reference"/);}
   else{assert.notEqual(r.code,0);assert.match(r.stderr,/media_key_retired_reference_forbidden/);}
  });
  query(`delete from public.retirement_inactive_consumer where private.deleted_media_mentions(metadata,${lit(f.key)});`);
 }
 {
  const f=recoveryFixture();
  const beforeStage=query(`select (staged_at,reconcile_after)::text from private.deleted_content_media_stages where id=${lit(f.stage)}`);
  await ordered(f.replace,f.reconcile,r=>{
   assert.equal(r.code,0,r.stderr);assert.match(r.stdout,/"status": "attached_requires_explicit_content_delete"/);
   assert.equal(query(`select count(*) from private.deleted_content_records where target_id=${lit(f.target)}`),'0');
   assert.equal(query(`select (staged_at,reconcile_after)::text from private.deleted_content_media_stages where id=${lit(f.stage)}`),beforeStage);
  },{rollback:true});
  // Metadata delete rollback cannot become retention or orphan cleanup intent.
  await ordered(`delete from videos where id=${lit(f.target)}`,f.reconcile,r=>{
   assert.equal(r.code,0,r.stderr);assert.match(r.stdout,/"status": "attached_requires_explicit_content_delete"/);
   assert.equal(query(`select count(*) from private.deleted_content_records where target_id=${lit(f.target)}`),'0');
  },{rollback:true});
  query(f.replace);
 }
 {
  const f=recoveryFixture();query(f.replace);
  await ordered(f.reconcile,f.hold,r=>{
   assert.equal(r.code,0,r.stderr);
   assert.equal(query(`select status from private.deleted_media_key_retirements where stage_id=${lit(f.stage)}`),'staged');
   assert.equal(query(`select count(*) from private.deleted_content_stage_cleanup_claims where stage_id=${lit(f.stage)}`),'0');
  },{rollback:true});
 }
 {
  const f=recoveryFixture();query(f.replace);
  await ordered(f.reconcile,f.reconcile,r=>{
   assert.equal(r.code,0,r.stderr);const claim=JSON.parse(r.stdout.trim());
   assert.equal(claim.status,'claimed');
   assert.equal(query(`select id::text from private.deleted_content_stage_cleanup_claims where stage_id=${lit(f.stage)}`),claim.claimId);
   assert.equal(query(`select count(*) from private.deleted_content_stage_cleanup_claims where stage_id=${lit(f.stage)}`),'1');
  });
 }
 // Existing writer lock order is source -> stage -> advisory. The cleanup
 // worker must yield at either row lock, never invert that order and deadlock.
 for(const lockStage of [false,true]){
  const f=recoveryFixture(),hn=`retention-source-busy-${checks}-${process.pid}`;
  let h;
  try{
   h=session(hn,`select 1 from videos where id=${lit(f.target)} for update;
    ${lockStage?`select 1 from private.deleted_content_media_stages where id=${lit(f.stage)} for update;`:''}
    select 'HOLDER_READY';`);
   await until(()=>h.output().includes('HOLDER_READY'),'source writer held real row locks',[h]);
   assert.equal(JSON.parse(query(f.reconcile)).status,'source_busy');
   h.child.stdin.end('commit;\n\\q\n');assert.equal((await h.done).code,0);
   assert.equal(query(`select count(*) from private.deleted_content_stage_cleanup_claims where stage_id=${lit(f.stage)}`),'0');
   checks++;
  }finally{await terminate(hn,h);}
  query(f.replace);
 }
 assert.equal(checks,26);
 {
  const f=recoveryFixture();query(f.replace);
  assert.equal(JSON.parse(query(f.reconcile)).status,'claimed');
  const {verifyDeletedContentWorkerTransport}=await import('./lib/deleted-content-worker-transport.mjs');
  const parameters={
   list_deleted_content_stage_cleanup_work:[],
   reconcile_deleted_content_stage:['p_stage_id'],
   read_deleted_content_stage_cleanup_claim:['p_claim_id'],
   record_deleted_content_stage_cleanup_result:['p_claim_id','p_result'],
  };
  const rpc=async(name,args)=>{
   assert.ok(Object.hasOwn(parameters,name),'real PostgreSQL RPC allowlist');
   const values=parameters[name].map(key=>{assert.equal(typeof args[key],'string');return lit(args[key]);});
   return {data:JSON.parse(query(`select public.${name}(${values.join(',')})::text`)),error:null};
  };
  const resetDispatch=async()=>{
   // Controlled time advancement only in this generated clone. Other
   // synthetic scenarios must not consume the bounded transport worker batch.
   query(`insert into private.deleted_content_work_dispatch(kind,work_id,next_attempt_at)
    select 'stage',id,clock_timestamp()+interval '1 hour' from private.deleted_content_media_stages
    on conflict(kind,work_id) do update set next_attempt_at=excluded.next_attempt_at;
    update private.deleted_content_work_dispatch set next_attempt_at=clock_timestamp()-interval '1 second'
     where kind='stage' and work_id=${lit(f.stage)};
    update private.deleted_content_stage_cleanup_claims set next_check_at=clock_timestamp()-interval '1 second'
     where stage_id=${lit(f.stage)};`);
  };
  const transport=await verifyDeletedContentWorkerTransport({rpc,stageId:f.stage,resetDispatch});
  assert.equal(transport.scope,'local_tls_and_real_postgres_not_live_r2');
  console.log(`Retention worker transport: ${transport.checks} real PostgreSQL/local TLS checks passed; live R2 remains unqualified.`);
 }
 console.log(`Retention native PostgreSQL: ${checks} isolation and real two-backend ordering checks passed.`);
}finally{
 if(cloned)ok(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop generated clone');
 if(before!==undefined)assert.equal(query(fingerprint,'postgres'),before,'local source unchanged');
}
