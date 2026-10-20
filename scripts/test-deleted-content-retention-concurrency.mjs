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
function session(name,sql,finish=false){
 const child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',s=>stdout+=s);child.stderr.on('data',s=>stderr+=s);
 const done=new Promise(resolve=>{child.on('error',e=>resolve({code:-1,stderr:e.message,stdout}));child.on('close',code=>resolve({code,stderr,stdout}));});
 child.stdin.on('error',()=>{});
 child.stdin.write(`set application_name=${lit(name)};begin;set local statement_timeout='35s';set local idle_in_transaction_session_timeout='45s';${sql}\n`);
 if(finish)child.stdin.end('commit;\n\\q\n');
 return{child,done,output:()=>stdout};
}
async function until(fn,label){const end=Date.now()+20000;while(Date.now()<end){if(fn())return;await delay(25);}throw Error(`timeout ${label}`);}
async function terminate(name,s){if(!s || s.child.exitCode!==null)return;query(`select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and application_name=${lit(name)} and pid<>pg_backend_pid();`);s.child.kill('SIGTERM');await Promise.race([s.done,delay(1000)]);}
async function ordered(first,second,verify){
 const hn=`retention-holder-${checks}-${process.pid}`,wn=`retention-waiter-${checks}-${process.pid}`;let h,w;
 try{
  h=session(hn,`${first};select 'HOLDER_READY';`);await until(()=>h.output().includes('HOLDER_READY'),'holder ready');
  w=session(wn,second,true);
  await until(()=>query(`select count(*) from pg_stat_activity w join pg_stat_activity h on h.application_name=${lit(hn)} where w.datname=current_database() and w.application_name=${lit(wn)} and w.wait_event_type='Lock' and h.pid=any(pg_blocking_pids(w.pid));`)==='1','observed independent backend lock queue');
  h.child.stdin.end('commit;\n\\q\n');const [a,b]=await Promise.all([h.done,w.done]);assert.equal(a.code,0,a.stderr);verify(b);checks++;
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
 query('update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,text_expiry_enabled=true;');
 const author=randomUUID();query(`insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values(${lit(author)},${lit(`retention-${author}@example.test`)},now(),false,false);`);
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
 assert.equal(checks,6);console.log(`Retention native PostgreSQL: ${checks} real two-backend ordering checks passed.`);
}finally{
 if(cloned)ok(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop generated clone');
 if(before!==undefined)assert.equal(query(fingerprint,'postgres'),before,'local source unchanged');
}
