#!/usr/bin/env node
import {createBrandGuardCloneRestorer} from './lib/brand-guard-clone-restore.mjs';
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
const cloneGuardRestore = createBrandGuardCloneRestorer({container});
const database=`legacy_retention_queue_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}`;
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
 ok(dump,'read-only dump');ok(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database], cloneGuardRestore.prepare(dump.stdout, database), null),'restore clone');
 assert.equal(query('select not capture_enabled from private.deleted_content_retention_settings;'),'t');
 assert.equal(query('select not armed from private.deleted_media_reference_fence;'),'t');
 query(readFileSync('tests/fixtures/deleted-content-local-qualification.sql','utf8'));
 query(`create table public.retirement_inactive_consumer(id uuid primary key default gen_random_uuid(),metadata jsonb);
 create trigger zzz_deleted_media_reference_guard before insert or update on public.retirement_inactive_consumer
 for each row execute function private.guard_deleted_media_references();
 create trigger zzz_platform_brand_retention_reference before insert or update on public.retirement_inactive_consumer
 for each row execute function private.guard_platform_brand_retention_references();`);

 const owner=randomUUID();query(`insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
 values(${lit(owner)},${lit(`legacy-retention-${owner}@example.test`)},now(),false,false);`);
 function fixture(){
  const target=randomUUID(),key=`originals/legacy-${target}.mp4`;
  query(`insert into private.media_object_storage_migration_audit(migration_id,batch_id,table_name,row_id,source_type,source_id,new_storage_provider,new_storage_bucket,new_storage_object_key,status)
   values('disposable',${lit(target)},'videos',${lit(target)},'creator_video',${lit(target)},'cloudflare_r2','chillywood-media-origin',${lit(key)},'updated');
   insert into videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes)
   values(${lit(target)},${lit(owner)},'Synthetic legacy concurrency','draft','clean','cloudflare_r2','chillywood-media-origin',${lit(key)},${lit(key)},'video/mp4',1024);
   update private.media_object_storage_migration_audit a set row_before=to_jsonb(v),row_after=to_jsonb(v)
    from videos v where a.row_id=v.id::text and v.id=${lit(target)};
   update media_scan_jobs set status='clean',completed_at=clock_timestamp() where target_table='videos' and target_id=${lit(target)};`);
  const binding=JSON.parse(query(`select private.read_deleted_media_legacy_source('creator_video',${lit(target)})::text`));
  const evidence={binding,scanResult:'clean',scanOriginSha256:'a'.repeat(64),originSha256:'a'.repeat(64),ownershipEvidenceSha256:'b'.repeat(64),originSizeBytes:1024,scanEvidenceSha256:'c'.repeat(64),writerDrainEvidenceSha256:'d'.repeat(64),reviewedBy:'disposable native PostgreSQL fixture'};
  const enroll=`select private.enroll_deleted_media_legacy_provenance('creator_video',${lit(target)},${lit(JSON.stringify(binding))}::jsonb,${lit(JSON.stringify(evidence))}::jsonb)`;
  return {target,key,binding,evidence,enroll,change:`update videos set created_at=created_at+interval '1 second' where id=${lit(target)}`,
   remove:`delete from videos where id=${lit(target)}`};
 }
 for(const rollback of [false,true]){
  const f=fixture();
  await ordered(f.change,f.enroll,r=>{
   if(rollback)assert.equal(r.code,0,r.stderr);
   else {assert.notEqual(r.code,0);assert.match(r.stderr,/legacy_provenance_source_changed/);}
  },{rollback});query(f.remove);
 }
 {
  const f=fixture();
  await ordered(f.enroll,f.change,r=>{assert.notEqual(r.code,0);assert.match(r.stderr,/legacy_provenance_binding_immutable/);
   assert.equal(query(`select private.deleted_media_legacy_source_supported('creator_video',to_jsonb(v)) from videos v where id=${lit(f.target)}`),'t');});
  query(f.remove);
 }
 {
  const f=fixture();await ordered(f.remove,f.enroll,r=>{assert.notEqual(r.code,0);assert.match(r.stderr,/legacy_provenance_live_source_required/);});
 }
 for(const rollback of [false,true]){
  const f=fixture();await ordered(f.enroll,f.enroll,r=>{assert.equal(r.code,0,r.stderr);
   assert.equal(query(`select count(*) from private.deleted_media_legacy_provenance where target_id=${lit(f.target)}`),'1');},{rollback});query(f.remove);
 }
 {
  const f=fixture();const other=f.enroll.replace('disposable native PostgreSQL fixture','different review');
  await ordered(f.enroll,other,r=>{assert.notEqual(r.code,0);assert.match(r.stderr,/legacy_provenance_enrollment_conflict/);});query(f.remove);
 }
 // Exact provider-free expired fixture. Real registration, revocation and
 // finalization run; only its archive clock is synthetic to avoid a 30-day wait.
 const f=fixture();query(f.enroll);
 query(`update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,media_staging_enabled=true,media_expiry_enabled=true;
 select private.stage_deleted_content_media_internal('creator_video',${lit(f.target)},'cloudflare_r2','chillywood-media-origin',${lit(f.key)},${lit(owner)});`);
 const stage=query(`select id from private.deleted_content_media_stages where target_id=${lit(f.target)}`);
 const deletion=randomUUID();
 query(`select private.revoke_deleted_media_legacy_delivery(${lit(stage)});
 insert into private.deleted_content_records(id,target_type,target_id,author,source_created_at,deletion_kind,deleted_at,expires_at,media_disposition)
 values(${lit(deletion)},'creator_video',${lit(f.target)},${lit(owner)},${lit(f.binding.createdAt)}::timestamptz,'hard',now()-interval '31 days',now()-interval '1 day','retained_original');
 update private.deleted_content_media_stages set deletion_id=${lit(deletion)} where id=${lit(stage)};
 update private.deleted_content_retention_settings set capture_enabled=false,media_staging_enabled=false,media_expiry_enabled=false,text_expiry_enabled=false;
 ${f.remove};
 update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,media_staging_enabled=true,media_expiry_enabled=true;`);
 const claim=`select public.claim_deleted_content_media_expiry(${lit(stage)})::text`;
 const hold=`insert into legal_holds(target_type,target_id,reason,status) values('creator_video',${lit(f.target)},'Synthetic legacy ordering','active')`;
 await ordered(hold,claim,r=>{assert.equal(r.code,0,r.stderr);assert.match(r.stdout,/"status": "held"/);});
 query(`delete from legal_holds where target_type='creator_video' and target_id=${lit(f.target)}`);
 await ordered(claim,hold,r=>{assert.notEqual(r.code,0);assert.match(r.stderr,/claimed|irreversible|retirement/i);});
 assert.equal(query(`select count(*) from media_upload_reservations where storage_object_key=${lit(f.key)}`),'0');
 assert.equal(JSON.parse(query(`select public.check_deleted_media_retirement('cloudflare_r2','chillywood-media-origin',${lit(f.key)},'upload')`)).allowed,false);
 console.log(`Legacy retention native PostgreSQL: ${checks} competing-transaction checks passed; no provider operations.`);
}finally{
  try {
 if(cloned)ok(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop generated clone');
 if(before!==undefined)assert.equal(query(fingerprint,'postgres'),before,'local source unchanged');
  } finally { cloneGuardRestore.assertSourceUnchanged(); }
}
