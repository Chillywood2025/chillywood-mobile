#!/usr/bin/env node
// Reduced source-contract schema, actual queue triggers and retention guards.
// Synthetic scanner assertions are NOT production or ClamAV proof.
import assert from 'node:assert/strict';
import {copyCutoverFixture} from '../tests/helpers/supabase-copy-cutover-fixture.mjs';
const db=await copyCutoverFixture();
const q=async(sql,params=[]) => (await db.query(sql,params)).rows[0];
const owner='10000000-0000-4000-8000-000000000001',id='20000000-0000-4000-8000-000000000001',receipt='30000000-0000-4000-8000-000000000001';
const sha='a'.repeat(64), key=`originals/supabase-migration/${receipt}/videos/${id}`;
let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++};
const deny=async(fn,re)=>{await assert.rejects(fn,re);checks++};
const rollback=async fn=>{await db.exec('begin');try{await fn()}finally{await db.exec('rollback')}};
const snapshot=async()=> (await q('select to_jsonb(v) s from videos v where id=$1',[id])).s;
try {
 for(const original of db.historicalBodies){
  check((await q('select prosrc from pg_proc where proname=$1',[original.proname+'_before_copy_cutover'])).prosrc===original.prosrc,'historical body byte-equivalent '+original.proname);
 }
 await db.query('insert into auth.users values($1)',[owner]);
 await db.query(`insert into videos(id,owner_id,title,created_at,storage_provider,storage_bucket,storage_object_key,storage_path,file_size_bytes)
 values($1,$2,'synthetic test','2026-01-01','supabase','creator-videos','legacy/test.mp4','legacy/test.mp4',12)`,[id,owner]);
 await db.exec(`update videos set scan_status='clean',scan_provider='clamav',scan_result='clean',scanned_at='2026-01-02Z';
 update media_scan_jobs set status='clean',completed_at='2026-01-02Z';
 insert into storage.objects(bucket_id,name,version) values('creator-videos','legacy/test.mp4','generation-one');`);
 const copyProof={protocol:'supabase-original-copy-v1',sourceSha256:sha,targetSha256:sha,sourceSizeBytes:12,targetSizeBytes:12,createOnly:true,independentReadback:true};
 for(const mode of ['read','commit']) for(const size of [null,0,11,13]) await rollback(async()=>{
  await db.query('update videos set file_size_bytes=$1 where id=$2',[size,id]);
  await q('select public.record_supabase_original_copy_receipt($1,$2,$3,$4,$5,$6,$7,$8)',[receipt,'videos',id,await snapshot(),key,sha,12,copyProof]);
  const source=(await q("select id from storage.objects where name='legacy/test.mp4'")).id;
  const assertions={protocol:'supabase-copy-cutover-v1',sourceSha256:sha,targetSha256:sha,sourceSizeBytes:12,targetSizeBytes:12,independentReadback:true,sourcePreserved:true};
  await deny(()=>mode==='read'?q('select public.read_supabase_original_copy_cutover($1)',[receipt])
   :q('select public.commit_supabase_original_copy_cutover($1,$2,$3,$4)',[receipt,source,'generation-one',assertions]),/source_size_metadata_mismatch/);
 });
 await q('select public.record_supabase_original_copy_receipt($1,$2,$3,$4,$5,$6,$7,$8)',[receipt,'videos',id,await snapshot(),key,sha,12,copyProof]);
 const read=async()=> (await q('select public.read_supabase_original_copy_cutover($1) r',[receipt])).r;
 const pre=await read();
 check(pre.state==='readback_required','fresh readback required');
 const proof={protocol:'supabase-copy-cutover-v1',sourceSha256:sha,targetSha256:sha,sourceSizeBytes:12,targetSizeBytes:12,independentReadback:true,sourcePreserved:true};
 const commit=(override={})=>q('select public.commit_supabase_original_copy_cutover($1,$2,$3,$4) r',[receipt,pre.sourceStorageId,override.version??pre.sourceStorageVersion,override.proof??proof]);
 await deny(()=>commit({version:'stale'}),/source_generation_changed/);
 await deny(()=>commit({proof:{...proof,targetSha256:'b'.repeat(64)}}),/readback_required/);
 for(const sql of [
  `insert into legal_holds(target_type,target_id,status) values('user','${owner}','active')`,
  `insert into video_renditions(video_id,storage_path) values('${id}','secondary')`,
  `insert into media_renditions(video_id,storage_path) values('${id}','secondary')`,
  `insert into media_transcode_jobs(source_type,source_id) values('creator_video','${id}')`,
  `insert into json_consumers(metadata) values('{"media":"legacy/test.mp4"}')`,
  `insert into json_consumers(metadata) values('{"media":"${key}"}')`,
  `update videos set title='changed after receipt'`,
  `create table unregistered_media_consumer(media_url text)`
 ]) await rollback(async()=>{await db.exec(sql);await deny(()=>commit(),/preflight_blocked|coverage_incomplete/)});
 await rollback(async()=>{await commit();check((await snapshot()).storage_object_key===key,'transaction cutover visible')});
 check((await snapshot()).storage_object_key==='legacy/test.mp4','crash/rollback preserves original locator');
 check((await q('select count(*)::int n from private.supabase_original_copy_cutovers')).n===0,'rollback no ledger');
 const done=(await commit()).r;
 check(done.state==='committed' && !done.oldObjectDeletionAllowed,'committed without original deletion authority');
 check((await commit()).r.alreadyCommitted,'exact commit retry');
 check((await snapshot()).scan_status==='pending_scan','new target remains blocked until genuine scan');
 check((await q('select count(*)::int n from storage.objects')).n===1,'original storage object preserved');
 check((await q('select count(*)::int n from private.media_object_storage_migration_audit')).n===0,'no fabricated historical migration');
 const enroll=scan=>q('select public.enroll_supabase_copy_retention_provenance($1,$2,$3,$4) r',[receipt,scan,'b'.repeat(64),'synthetic reviewer']);
 await deny(()=>enroll(null),/genuine_scan_required/);
 const job=done.scanJobId;
 const observe=()=>q('select public.begin_supabase_copy_scan_observation($1,$2,$3) r',[job,'fixture-worker',1]);
 await deny(observe,/claim_stale/);
 await db.query(`update media_scan_jobs set status='scanning',attempt_count=1,claimed_by='fixture-worker',claimed_at=clock_timestamp() where id=$1`,[job]);
 const obs=(await observe()).r;
 check((await observe()).r===obs,'duplicate observation idempotent');
 const record=(digest=sha)=>q('select public.record_supabase_copy_scan_receipt($1,$2,$3,$4,$5) r',[obs,job,'fixture-worker',digest,12]);
 await deny(()=>record(),/result_stale/);
 await db.query(`update media_scan_jobs set status='clean',completed_at=clock_timestamp(),scanner_provider='clamav',scanner_version='synthetic',signature_version='synthetic',metadata=metadata||'{"targetPropagationComplete":true}'::jsonb where id=$1`,[job]);
 await db.query(`update videos set scan_status='clean',scan_result='clean',scan_provider='clamav',scanned_at=(select completed_at from media_scan_jobs where id=$1) where id=$2`,[job,id]);
 await deny(()=>record('b'.repeat(64)),/result_stale/);
 for(const sql of [`attempt_count=2`,`claimed_by='other'`,`storage_object_key='different'`,`metadata='{}'`,`created_at=created_at+interval '1 second'`,`status='manual_review'`]) {
  await rollback(async()=>{await db.query(`update media_scan_jobs set ${sql} where id=$1`,[job]);await deny(()=>record(),/result_stale/)});
 }
 const scan=(await record()).r;
 check((await record()).r===scan,'duplicate completion receipt idempotent');
 const provenance=(await enroll(scan)).r;
 check((await enroll(scan)).r===provenance,'duplicate enrollment idempotent');
 check((await q('select private.supabase_copy_provenance_current(p) good from private.deleted_media_legacy_provenance p where id=$1',[provenance])).good,'exact immutable chain valid');
 check((await q('select public.has_verified_legacy_video_object_provenance($1,$2,$3,$4) good',[id,'cloudflare_r2','chillywood-media-origin',key])).good,'only fresh proof-backed delivery');
 await rollback(async()=>{await db.query(`update media_scan_jobs set attempt_count=2 where id=$1`,[job]);check(!(await q('select private.supabase_copy_provenance_current(p) good from private.deleted_media_legacy_provenance p where id=$1',[provenance])).good,'stale job cannot reuse proof')});
 for(const table of ['supabase_original_copy_cutovers','supabase_copy_scan_observations','supabase_copy_scan_receipts']) {
  await deny(()=>db.exec(`delete from private.${table}`),/permanent/);
  check((await q(`select relrowsecurity and relforcerowsecurity good from pg_class where oid='private.${table}'::regclass`)).good,'FORCE RLS '+table);
  for(const role of ['anon','authenticated','service_role'])check(!(await q('select has_table_privilege($1,$2,$3) allowed',[role,'private.'+table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'])).allowed,'no direct access '+role);
 }
 await rollback(async()=>{
  const aid='20000000-0000-4000-8000-000000000002',ar='30000000-0000-4000-8000-000000000002';
  const ak=`originals/supabase-migration/${ar}/social_attachments/${aid}`;
  await db.query(`insert into social_attachments(id,owner_user_id,surface_type,surface_id,storage_provider,storage_bucket,storage_object_key,storage_path,size_bytes)
   values($1,$2,'profile_post',$3,'supabase','social-attachments','legacy/social.png','legacy/social.png',12)`,[aid,owner,id]);
  await db.query(`update social_attachments set scan_status='clean',scan_provider='clamav',scan_result='clean',scanned_at='2026-01-02Z' where id=$1;
   `,[aid]);
  await db.query(`update media_scan_jobs set status='clean',completed_at='2026-01-02Z' where target_table='social_attachments' and target_id=$1`,[aid]);
  await db.exec("insert into storage.objects(bucket_id,name,version) values('social-attachments','legacy/social.png','social-generation')");
  const original=(await q('select to_jsonb(a) s from social_attachments a where id=$1',[aid])).s;
  await q('select public.record_supabase_original_copy_receipt($1,$2,$3,$4,$5,$6,$7,$8)',[ar,'social_attachments',aid,original,ak,sha,12,copyProof]);
  const binding=(await q('select public.read_supabase_original_copy_cutover($1) r',[ar])).r;
  const result=(await q('select public.commit_supabase_original_copy_cutover($1,$2,$3,$4) r',[ar,binding.sourceStorageId,binding.sourceStorageVersion,proof])).r;
  const sj=result.scanJobId;
  await db.query(`update media_scan_jobs set status='scanning',claimed_by='fixture-worker',attempt_count=1,claimed_at=clock_timestamp() where id=$1`,[sj]);
  const observation=(await q('select public.begin_supabase_copy_scan_observation($1,$2,$3) r',[sj,'fixture-worker',1])).r;
  await db.query(`update media_scan_jobs set status='clean',completed_at=clock_timestamp(),scanner_provider='clamav',scanner_version='synthetic',signature_version='synthetic',metadata=metadata||'{"targetPropagationComplete":true}'::jsonb where id=$1`,[sj]);
  await db.query(`update social_attachments set scan_status='clean',scan_provider='clamav',scan_result='clean',scanned_at=(select completed_at from media_scan_jobs where id=$1) where id=$2`,[sj,aid]);
  const sr=(await q('select public.record_supabase_copy_scan_receipt($1,$2,$3,$4,$5) r',[observation,sj,'fixture-worker',sha,12])).r;
  const sp=(await q('select public.enroll_supabase_copy_retention_provenance($1,$2,$3,$4) r',[ar,sr,'b'.repeat(64),'synthetic reviewer'])).r;
  check((await q('select private.supabase_copy_provenance_current(p) good from private.deleted_media_legacy_provenance p where id=$1',[sp])).good,'social attachment parent/incarnation proof valid');
  check((await q("select public.has_verified_legacy_media_object_provenance('social_attachments',$1,'cloudflare_r2','chillywood-media-origin',$2) good",[aid,ak])).good,'social attachment delivery proof valid');
  check((await q("select private.deleted_content_source_coverage('social_attachment',to_jsonb(a)) c from social_attachments a where id=$1",[aid])).c==='eligible_r2_original','social retention coverage uses tagged proof');
 });
 await db.exec(`update private.deleted_content_retention_settings set legacy_object_deletes_blocked=true;
 update private.deleted_content_rollout_qualification set source_revision=repeat('0',40),client_enforcement_evidence='synthetic fixture',
 legacy_delete_drain_evidence='synthetic fixture',worker_schedule_evidence='synthetic fixture',origin_cleanup_evidence='synthetic fixture',qualified_at=clock_timestamp();
 select public.record_deleted_content_worker_heartbeat();
 update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,media_staging_enabled=true,media_expiry_enabled=true;`);
 await db.query('delete from videos where id=$1',[id]);
 const retired=await q('select * from private.deleted_media_key_retirements where object_key=$1',[key]);
 check(retired.legacy_provenance_id===provenance && retired.reservation_id===null && retired.status==='retained','real capture finalizes copy proof without reservation');
 check((await q('select private.deleted_media_retirement_binding($1) r',[retired.stage_id])).r.supported,'immutable retirement survives removal of live row');
 check((await q('select public.claim_deleted_content_media_expiry($1) r',[retired.stage_id])).r.status==='not_due','retention deadline unchanged');
 check((await q('select private.revoke_deleted_media_legacy_delivery($1) r',[retired.stage_id])).r.alreadyRevoked,'crash retry uses permanent revocation');
 check((await q('select count(*)::int n from storage.objects')).n===1,'original Supabase remains after source capture');
 check((await q('select public.has_verified_legacy_video_object_provenance($1,$2,$3,$4) good',[id,'cloudflare_r2','chillywood-media-origin',key])).good===false,'revoked copy never reopens delivery');
 console.log(`PASS ${checks} copy-cutover source-contract checks; not provider or native-concurrency evidence`);
} finally {await db.close()}
