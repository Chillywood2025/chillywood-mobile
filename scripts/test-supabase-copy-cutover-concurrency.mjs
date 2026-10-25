#!/usr/bin/env node
// Native PostgreSQL backends against a generated local clone. No provider
// traffic, remote URL, deployment, caller credential or production mutation.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
if(process.argv.includes('--help')){console.log('After local Supabase reset: exact copy-cutover contention, rollback and duplicate proof in a disposable native PostgreSQL clone.');process.exit(0)}
assert.equal(process.argv.length,2,'no URL or arguments accepted');
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_.-]+)"/m)?.[1];assert.ok(project);
const container=process.env.SUPABASE_DB_CONTAINER||`supabase_db_${project}`;assert.match(container,/^supabase_db_[A-Za-z0-9_.-]+$/);
const database=`copy_cutover_${process.pid}_${randomUUID().replaceAll('-','').slice(0,12)}`;
const lit=x=>`'${String(x).replaceAll("'","''")}'`;
const redact=x=>String(x).replaceAll(/[A-Za-z0-9_-]{40,}/g,'<redacted>');
const docker=(args,input,encoding='utf8')=>spawnSync('docker',args,{input,encoding,maxBuffer:256*1024*1024,timeout:120000});
const ok=(r,label)=>{assert.equal(r.status,0,`${label}: ${redact(r.error?.message||r.stderr)}`);return r.stdout};
const args=(db=database)=>['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db];
const claims=`set request.jwt.claims='{"role":"service_role"}';set request.jwt.claim.role='service_role';set timezone='UTC';`;
const query=(sql,db=database)=>ok(docker(args(db),`${db==='postgres'?'set default_transaction_read_only=on;':claims}set statement_timeout='15s';${sql}`),'local SQL').trim();
const admin=(command,input,encoding='utf8')=>docker(['exec',...(input===undefined?[]:['-i']),container,'sh','-lc','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','copy-cutover-admin',...command],input,encoding);
const tables=['auth.users','public.videos','public.social_attachments','public.media_scan_jobs','public.legal_holds','storage.objects','private.supabase_original_copy_receipts','private.supabase_original_copy_cutovers','private.supabase_copy_scan_observations','private.supabase_copy_scan_receipts','private.deleted_media_legacy_provenance','private.deleted_content_retention_settings','private.deleted_media_reference_fence'];
const fingerprint=`select jsonb_build_object(${tables.map(t=>`${lit(t)},(select md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' order by md5(to_jsonb(x)::text)),'')) from ${t} x)`).join(',')})::text`;
let cloned=false,before,checks=0;
function session(sql){
 const child=spawn('docker',args(),{stdio:['pipe','pipe','pipe']});let out='',err='';
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',s=>out+=s);child.stderr.on('data',s=>err+=s);
 const done=new Promise(resolve=>{child.on('close',code=>resolve({code,out,err}));child.on('error',e=>resolve({code:-1,out,err:e.message}))});child.stdin.on('error',()=>{});
 child.stdin.write(`${claims}begin;set local statement_timeout='15s';set local idle_in_transaction_session_timeout='25s';${sql};select 'HOLDER_READY';\n`);
 return{child,done,output:()=>out,error:()=>err};
}
async function concurrent(holderSQL,contenderSQL,{rollback=false,pattern=/could not obtain lock|copy_cutover_/}={}){
 const h=session(holderSQL);
 try{
  const until=Date.now()+15000;
  while(!h.output().includes('HOLDER_READY')){
   assert.equal(h.child.exitCode,null,redact(h.error()));assert.ok(Date.now()<until,'holder readiness timeout');await delay(20);
  }
  // The real other backend must fail promptly on NOWAIT, not silently commit
  // from a stale snapshot. A timeout/deadlock does not satisfy this assertion.
  const contender=docker(args(),`${claims}set statement_timeout='3s';${contenderSQL};`);
  assert.notEqual(contender.status,0);assert.match(String(contender.stderr),pattern);
  assert.doesNotMatch(String(contender.stderr),/statement timeout|deadlock detected/);
  h.child.stdin.end(`${rollback?'rollback':'commit'};\n\\q\n`);
  const result=await h.done;assert.equal(result.code,0,redact(result.err));checks++;
 }finally{if(h.child.exitCode===null){h.child.stdin.end('rollback;\n\\q\n');await h.done}}
}
try{
 if(process.env.DOCKER_HOST)assert.match(process.env.DOCKER_HOST,/^(unix|npipe):\/\//);
 assert.match(ok(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),'local Docker').trim(),/^(unix|npipe):\/\//);
 assert.ok(ok(docker(['ps','--filter','label=com.supabase.cli.project','--format','{{.Names}}']),'local CLI').split('\n').includes(container));
 before=query(fingerprint,'postgres');
 ok(docker(['exec',container,'createdb','-U','postgres','-T','template0',database]),'create clone');cloned=true;
 ok(docker(args(),'create schema vault;create extension supabase_vault with schema vault;'),'clone vault');
 const dump=admin(['pg_dump','-U','supabase_admin','--exclude-extension=pg_cron','--exclude-extension=supabase_vault','--exclude-extension=pg_graphql','--exclude-schema=cron','--exclude-schema=realtime','--exclude-schema=_realtime','--exclude-schema=vault','--exclude-schema=graphql','--exclude-schema=graphql_public','postgres'],undefined,null);
 ok(dump,'read local dump');ok(admin(['psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],dump.stdout,null),'restore clone');
 assert.equal(query('select not capture_enabled from private.deleted_content_retention_settings'),'t');
 const heldGuard=query("select md5(pg_get_functiondef('private.guard_deleted_content_secondary_coverage()'::regprocedure))");
 const owner=randomUUID();query(`insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous) values(${lit(owner)},${lit(`cutover-${owner}@example.test`)},now(),false,false)`);
 const sha='a'.repeat(64);
 function fixture(){
  const id=randomUUID(),receipt=randomUUID(),source=`${owner}/${id}/source.mp4`,target=`originals/supabase-migration/${receipt}/videos/${id}`;
  query(`insert into videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes)
    values(${lit(id)},${lit(owner)},'Synthetic cutover','draft','clean','supabase','creator-videos',${lit(source)},${lit(source)},'video/mp4',12);
   update videos set scan_status='clean',scan_provider='clamav',scan_result='clean',scanned_at='2026-01-02Z' where id=${lit(id)};
   update media_scan_jobs set status='clean',completed_at='2026-01-02Z' where target_table='videos' and target_id=${lit(id)};
   insert into storage.objects(bucket_id,name,version) values('creator-videos',${lit(source)},'generation-one');
   select public.record_supabase_original_copy_receipt(${lit(receipt)},'videos',${lit(id)},(select to_jsonb(v) from videos v where id=${lit(id)}),${lit(target)},${lit(sha)},12,
    jsonb_build_object('protocol','supabase-original-copy-v1','sourceSha256',${lit(sha)},'targetSha256',${lit(sha)},'sourceSizeBytes',12,'targetSizeBytes',12,'createOnly',true,'independentReadback',true));`);
  const r=JSON.parse(query(`select public.read_supabase_original_copy_cutover(${lit(receipt)})`));
  const proof={protocol:'supabase-copy-cutover-v1',sourceSha256:sha,targetSha256:sha,sourceSizeBytes:12,targetSizeBytes:12,independentReadback:true,sourcePreserved:true};
  const commit=`select public.commit_supabase_original_copy_cutover(${lit(receipt)},${lit(r.sourceStorageId)},'generation-one',${lit(JSON.stringify(proof))}::jsonb)`;
  return{id,receipt,source,target,commit};
 }
 for(const rollback of [false,true]){
  const f=fixture();await concurrent(`update videos set title='concurrent change' where id=${lit(f.id)}`,f.commit,{rollback});
  if(rollback)assert.equal(JSON.parse(query(f.commit)).state,'committed');
  else assert.match(String(docker(args(),claims+f.commit).stderr),/preflight_blocked/);
 }
 for(const rollback of [false,true]){
  const f=fixture();await concurrent(f.commit,f.commit,{rollback});
  const retry=JSON.parse(query(f.commit));assert.equal(retry.alreadyCommitted,!rollback);
  assert.equal(query(`select count(*) from private.supabase_original_copy_cutovers where id=${lit(f.receipt)}`),'1');
  assert.equal(query(`select count(*) from media_scan_jobs where storage_object_key=${lit(f.target)}`),'1');
 }
 {
  const f=fixture();await concurrent(`update storage.objects set version='generation-two' where bucket_id='creator-videos' and name=${lit(f.source)}`,f.commit);
  assert.match(String(docker(args(),claims+f.commit).stderr),/source_generation_changed/);
 }
 {
  const f=fixture();await concurrent(`insert into legal_holds(target_type,target_id,reason,status) values('creator_video',${lit(f.id)},'synthetic race','active')`,f.commit);
  assert.match(String(docker(args(),claims+f.commit).stderr),/preflight_blocked/);
 }
 {
  const f=fixture();await concurrent(`insert into media_transcode_jobs(source_type,source_id,creator_id,input_provider,input_bucket,input_path,output_provider,output_bucket,output_prefix)
    values('creator_video',${lit(f.id)},${lit(owner)},'supabase_storage','creator-videos',${lit(f.source)},'cloudflare_r2','chillywood-media-origin',${lit('synthetic/'+f.id)})`,f.commit);
  assert.match(String(docker(args(),claims+f.commit).stderr),/preflight_blocked/);
 }
 const f=fixture(),result=JSON.parse(query(f.commit)),job=result.scanJobId;
 query(`update media_scan_jobs set status='scanning',claimed_by='copy-fixture',claimed_at=clock_timestamp(),attempt_count=1 where id=${lit(job)}`);
 const observe=`select public.begin_supabase_copy_scan_observation(${lit(job)},'copy-fixture',1)`;
 const observation=query(observe);
 await concurrent(`update media_scan_jobs set attempt_count=2 where id=${lit(job)}`,observe);
 assert.match(String(docker(args(),claims+observe).stderr),/claim_stale/);
 assert.ok(observation);assert.equal(query(`select count(*) from storage.objects where name=${lit(f.source)}`),'1');
 assert.equal(query("select md5(pg_get_functiondef('private.guard_deleted_content_secondary_coverage()'::regprocedure))"),heldGuard,'held guard unchanged');
 console.log(`PASS ${checks} native PostgreSQL competing-transaction cases; originals preserved, no provider operations`);
}finally{
 if(cloned)ok(docker(['exec',container,'dropdb','-U','postgres','--if-exists','--force',database]),'drop generated clone');
 if(before!==undefined)assert.equal(query(fingerprint,'postgres'),before,'local source unchanged');
}
