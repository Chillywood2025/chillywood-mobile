import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {externalReferenceFixture} from './helpers/deleted-content-external-reference-fixture.mjs';
import {createDatabase} from './helpers/database-runtime-authority-fixture.mjs';

const migration='20261023221500_deleted_content_reviewed_external_reference.sql';
const owner='10000000-0000-4000-8000-000000000001';
const other='10000000-0000-4000-8000-000000000002';
const date='2026-01-01T00:00:00Z';
const evidence=b=>({binding:b,subtype:'external_fixture',reviewBasis:'row_specific_creation_record',
  sourceEvidenceSha256:'a'.repeat(64),locatorEvidenceSha256:'b'.repeat(64),reviewedBy:'synthetic-independent-review'});

test('external-reference executable identity, admission, capture and text-only expiry contract', {timeout:120_000},async()=>{
 const db=await externalReferenceFixture();
 const q=async(sql,p=[]) => (await db.query(sql,p)).rows[0];
 const coverage=async id=>(await q("select private.deleted_content_source_coverage('creator_video',to_jsonb(v)) c from videos v where id=$1",[id])).c;
 const binding=async id=>(await q('select private.read_deleted_content_external_reference_source($1) b',[id])).b;
 const enroll=async(id,b,e=evidence(b))=>(await q('select private.record_deleted_content_external_reference($1,$2,$3) id',[id,b,e])).id;
 const isolated=async fn=>{await db.exec('begin');try{await fn();}finally{await db.exec('rollback');}};
 const deny=async(fn,re)=>{await db.exec('savepoint denied_operation');await assert.rejects(fn,re);await db.exec('rollback to denied_operation;release savepoint denied_operation');};
 const insert=async(id=randomUUID())=>{await q(`insert into videos(id,owner_id,title,description,created_at,storage_provider,storage_bucket,
  playback_url,thumb_url,visibility,scan_status) values($1,$2,'Exact title','Exact description','2026-01-01','supabase','creator-videos',
  'https://synthetic.invalid/video.mp4','https://synthetic.invalid/thumb.jpg','draft','quarantined')`,[id,owner]);return id;};
 const endpoint=id=>q("select public.delete_retained_content('creator_video',$1,'supabase','creator-videos',null,$2) r",[id,date]);
 const expire=id=>q('select public.expire_deleted_content_text($1) r',[id]);
 const qualify=()=>db.exec(`update private.deleted_content_retention_settings set legacy_object_deletes_blocked=true;
  update private.deleted_content_rollout_qualification set source_revision=repeat('0',40),client_enforcement_evidence='synthetic',
  legacy_delete_drain_evidence='synthetic',worker_schedule_evidence='synthetic',origin_cleanup_evidence='synthetic',qualified_at=clock_timestamp();
  select public.record_deleted_content_worker_heartbeat();`);
 const enable=()=>db.exec('update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,text_expiry_enabled=true');
 // Only this disposable fixture rewinds a genuine capture clock, with both
 // immutable guards restored before executing the real expiry function.
 const age=async(id,elapsed='721 hours')=>db.exec(`alter table private.deleted_content_records disable trigger deleted_content_immutable;
  alter table private.deleted_content_records disable trigger preserve_external_reference_archive;
  alter table private.deleted_content_external_reference_captures disable trigger preserve_external_reference_capture;
  update private.deleted_content_records set deleted_at=t.d,expires_at=t.d+interval '720 hours'
   from (select clock_timestamp()-interval '${elapsed}' d) t where id='${id}';
  update private.deleted_content_external_reference_captures c set deleted_at=r.deleted_at,expires_at=r.expires_at,
   archive_sha256=private.deleted_content_external_sha256(to_jsonb(r)) from private.deleted_content_records r where c.deletion_id=r.id and r.id='${id}';
  alter table private.deleted_content_records enable trigger deleted_content_immutable;
  alter table private.deleted_content_records enable trigger preserve_external_reference_archive;
  alter table private.deleted_content_external_reference_captures enable trigger preserve_external_reference_capture;`);
 try {
  await db.exec(`insert into auth.users values('${owner}'),('${other}');select set_config('fixture.actor','${owner}',false);select set_config('fixture.session','true',false);`);
  assert.equal((await q('select count(*)::int n from private.deleted_content_external_reference_evidence')).n,0);
  assert.equal((await q('select capture_enabled from private.deleted_content_retention_settings')).capture_enabled,false);
  for(const role of ['anon','authenticated','service_role']) {
   assert.equal((await q("select has_table_privilege($1,'private.deleted_content_external_reference_evidence','SELECT,INSERT,UPDATE,DELETE') allowed",[role])).allowed,false);
   assert.equal((await q("select has_function_privilege($1,'private.record_deleted_content_external_reference(uuid,jsonb,jsonb)','EXECUTE') allowed",[role])).allowed,false);
   assert.equal((await q("select has_table_privilege($1,'private.deleted_content_external_delete_intents','INSERT') allowed",[role])).allowed,false);
  }
  const target=await insert(), b=await binding(target);
  const initial=(await q('select to_jsonb(v) v from videos v where id=$1',[target])).v;
  assert.notEqual(await coverage(target),'reviewed_external_reference');
  await isolated(async()=>{
   for(const patch of [{reviewBasis:'url_pattern'},{reviewBasis:'zero_size'},{reviewBasis:'negative_search'},
     {binding:{...b,author:other}},{sourceEvidenceSha256:''},{locatorEvidenceSha256:''},{reviewedBy:''},{subtype:'owned_original'}])
    await deny(()=>enroll(target,b,{...evidence(b),...patch}),/reviewed_evidence_required/);
   await q("insert into legal_holds(target_type,target_id,status) values('creator_video',$1,'active')",[target]);
   await deny(()=>enroll(target,b),/legal_hold/);
  });
  const eid=await enroll(target,b);
  assert.equal(await enroll(target,b),eid,'exact retry is immutable/idempotent');
  assert.equal(await coverage(target),'reviewed_external_reference');
  assert.deepEqual((await q('select to_jsonb(v) v from videos v where id=$1',[target])).v,initial,'enrollment does not change scan, quarantine, visibility or content');
  const stored=(await q('select to_jsonb(e) e from private.deleted_content_external_reference_evidence e')).e;
  assert.ok(!JSON.stringify(stored).includes('synthetic.invalid'),'no raw locator stored');
  assert.ok(!JSON.stringify(stored).includes('Exact title'),'no source text stored');
  await isolated(async()=>{
   const same=await insert();assert.notEqual(await coverage(same),'reviewed_external_reference','same URL is not row evidence');
   await deny(()=>enroll(same,b),/source_changed/);
   await deny(()=>enroll(target,b,{...evidence(b),reviewedBy:'another-review'}),/evidence_conflict/);
   await deny(()=>q('update private.deleted_content_external_reference_evidence set reviewed_by=$1',['changed']),/permanent/);
   await deny(()=>q('delete from private.deleted_content_external_reference_evidence'),/permanent/);
   await deny(()=>q('truncate private.deleted_content_external_reference_evidence cascade'),/permanent/);
  });
  await isolated(async()=>{
   await q('delete from videos where id=$1',[target]);await insert(target);
   assert.notEqual(await coverage(target),'reviewed_external_reference','same UUID and timestamp cannot resurrect deleted row evidence');
   await deny(()=>enroll(target,b),/incarnation_invalidated/);
  });
  await isolated(async()=>{
   await q('update videos set id=$1 where id=$2',[randomUUID(),target]);await insert(target);
   assert.notEqual(await coverage(target),'reviewed_external_reference','moving old primary key cannot let replacement inherit evidence');
   await deny(()=>enroll(target,b),/incarnation_invalidated/);
  });
  await isolated(async()=>{
   await db.exec('truncate videos');await insert(target);
   assert.notEqual(await coverage(target),'reviewed_external_reference','truncate cannot resurrect evidence');
   await deny(()=>enroll(target,b),/incarnation_invalidated/);
  });
  await db.exec('begin isolation level repeatable read');
  try{await deny(()=>q('delete from videos where id=$1',[target]),/requires_read_committed/);}finally{await db.exec('rollback');}
  await isolated(async()=>{
   const malformed=await insert();await q('update videos set storage_provider=null,storage_bucket=null where id=$1',[malformed]);
   const mb=await binding(malformed);await deny(()=>enroll(malformed,mb),/identity_required/);
  });
  for(const [column,value] of [['owner_id',other],['created_at','2026-01-02'],['storage_provider','cloudflare_r2'],
   ['storage_bucket','other'],['playback_url','https://different.invalid/video'],['thumb_url','https://different.invalid/thumb'],
   ['storage_object_key','owned.mp4'],['storage_path','owned.mp4'],['thumb_storage_path','owned.jpg']]) {
   await isolated(async()=>{
    await q(`update videos set ${column}=$1 where id=$2`,[value,target]);
    assert.notEqual(await coverage(target),'reviewed_external_reference',`dormant ${column} change invalidates`);
    await deny(()=>enroll(target,b),/source_changed/);
   await q(`update videos set ${column}=$1 where id=$2`,[initial[column],target]);
   assert.notEqual(await coverage(target),'reviewed_external_reference',`reverting ${column} cannot revive stale evidence`);
   });
  }
  await isolated(async()=>{
   await db.exec('alter table videos add column unseen_url text');
   assert.notEqual(await coverage(target),'reviewed_external_reference','new null locator column invalidates schema');
   await deny(()=>binding(target).then(x=>enroll(target,x)),/unknown_locator_schema/);
  });
  await isolated(async()=>{
   await db.exec('alter table private.media_object_storage_migration_audit disable trigger zzzz_external_reference_ownership');
   await deny(()=>enroll(target,b),/guard_coverage_required/);
   assert.notEqual(await coverage(target),'reviewed_external_reference');
   assert.ok((await q('select public.deleted_content_expiry_readiness() r')).r.blockers.includes('external_reference_ownership_guard_coverage_incomplete'));
  });
  const blockers=[
   ["insert into media_upload_reservations(id,surface_type,attached_record_id) values(gen_random_uuid(),'creator_video',$1)",'ownership_conflict'],
   ["insert into private.media_object_storage_migration_audit(table_name,row_id,status) values('videos',$1,'updated')",'ownership_conflict'],
   ["insert into private.media_object_storage_migration_audit(table_name,row_id,source_type,source_id,status) values('media_scan_jobs','unrelated','creator_video',$1,'updated')",'ownership_conflict'],
   [`with ids as (select gen_random_uuid() id) insert into private.supabase_original_copy_receipts(id,table_name,row_id,owner_id,source_created_at,
    source_snapshot_sha256,source_binding,old_provider,old_bucket,old_object_key,target_key,sha256,size_bytes,proof_assertions)
    select id,'videos',$1::uuid,'${owner}','2026-01-01',repeat('a',64),'{}','supabase','creator-videos','synthetic-owned.mp4',
    'originals/supabase-migration/'||id::text||'/videos/'||$1,repeat('b',64),1,'{}' from ids`,'ownership_conflict'],
   [`insert into private.deleted_media_legacy_provenance(target_type,target_id,author,source_created_at,provider,bucket,object_key,
    source_binding,migration_audit_id,migration_audit_binding,ownership_evidence_sha256,origin_sha256,origin_size_bytes,
    scan_evidence_sha256,writer_drain_evidence_sha256,reviewed_by) values('creator_video',$1::uuid,'${owner}','2026-01-01',
    'cloudflare_r2','chillywood-media-origin','originals/synthetic-owned.mp4','{}',1,'{}',repeat('a',64),repeat('b',64),1,
    repeat('c',64),repeat('d',64),'synthetic-conflict')`,'ownership_conflict'],
   ["insert into video_renditions(video_id,owner_id,quality_label) values($1::uuid,'10000000-0000-4000-8000-000000000001','original')",'secondary_media_uncovered'],
   ["insert into media_renditions(source_type,source_id) values('creator_video',$1)",'secondary_media_uncovered'],
   ["insert into media_transcode_jobs(source_type,source_id) values('creator_video',$1)",'secondary_media_uncovered'],
  ];
  for(const [sql,reason] of blockers) await isolated(async()=>{
   await q(sql,[target]);assert.equal(await coverage(target),reason==='ownership_conflict'?'external_reference_ownership_conflict':reason);
   await deny(()=>enroll(target,b),new RegExp(reason));
   await qualify();await deny(enable,/activation_blocked/);
  });
  await isolated(async()=>{
   await q('update videos set playback_url=null,thumb_url=null where id=$1',[target]);
   assert.equal(await coverage(target),'metadata_only');
   await qualify();await enable();
   await q("update videos set title='ordinary metadata edit' where id=$1",[target]);
   assert.equal(await coverage(target),'metadata_only','invalidated evidence does not restrict ordinary metadata-only lifecycle');
  });
  await isolated(async()=>{
   await q("insert into media_scan_jobs(id,target_table,status) values(gen_random_uuid(),'videos','pending_scan')");
   assert.equal(await coverage(target),'reviewed_external_reference','evidence never resolves scan work');
   assert.ok((await q('select public.deleted_content_expiry_readiness() r')).r.blockers.includes('outstanding_scan_references_require_resolution'));
  });
  await qualify();await enable();
  assert.equal((await q('select public.deleted_content_expiry_readiness() r')).r.reviewedExternalReferenceSourceCount,1);
  await isolated(async()=>{
   for(const [column,value] of [['owner_id',other],['created_at','2026-01-02'],['storage_provider','cloudflare_r2'],
    ['storage_bucket','other'],['playback_url','https://different.invalid/'],['thumb_url',null],['storage_path','owned']])
    await deny(()=>q(`update videos set ${column}=$1 where id=$2`,[value,target]),/coverage_required/);
   for(const [sql,reason] of blockers) await deny(()=>q(sql,[target]),reason==='ownership_conflict'?/ownership_admission_forbidden/:/secondary_media_coverage_required/);
   await deny(()=>q('update videos set deleted_at=clock_timestamp() where id=$1',[target]),/hard_delete_required|coverage_required|live_source_required/);
   await deny(()=>q('delete from videos where id=$1',[target]),/explicit_hard_delete_required/);
   await deny(()=>q('update videos set id=$1,playback_url=null,thumb_url=null where id=$2',[randomUUID(),target]),/coverage_required/);
   await deny(()=>q("select private.capture_deleted_content_row('creator_video',to_jsonb(v),false) from videos v where id=$1",[target]),/explicit_hard_delete_required/);
   await db.exec("select set_config('fixture.session','false',true)");await deny(()=>endpoint(target),/current_session_required/);
   await db.exec("select set_config('fixture.session','',true)");await deny(()=>endpoint(target),/current_session_required/);
   await db.exec("select set_config('fixture.session','true',true)");
   await db.exec(`select set_config('fixture.actor','${other}',true)`);await deny(()=>endpoint(target),/binding_changed/);
  });
  await isolated(async()=>{
   await db.exec('update private.deleted_content_retention_settings set capture_enabled=false,text_expiry_enabled=false');
   await q("insert into media_transcode_jobs(source_type,source_id) values('creator_video',$1)",[target]);
   await deny(enable,/activation_blocked/);
  });
  await isolated(async()=>{
   await q("update videos set title='Changed exact title' where id=$1",[target]);
   assert.equal(await coverage(target),'reviewed_external_reference');
   assert.equal((await endpoint(target)).r.status,'deleted');
   assert.equal((await q('select count(*)::int n from private.deleted_content_external_delete_intents')).n,0);
   assert.equal((await q('select content from private.deleted_content_records')).content.title,'Changed exact title');
  });
  assert.equal((await q('select count(*)::int n from private.deleted_content_records')).n,0,'capture rollback is atomic');
  await db.exec("set time zone 'America/Los_Angeles'");
  assert.equal((await endpoint(target)).r.status,'deleted');
  await db.exec("set time zone 'UTC'");
  const archive=await q('select *,extract(epoch from expires_at-deleted_at)::int elapsed from private.deleted_content_records');
  assert.equal(archive.elapsed,720*3600,'720 elapsed hours, not calendar days');
  assert.deepEqual(archive.content,{title:'Exact title',description:'Exact description'});
  assert.equal(archive.external_evidence_id,eid);assert.equal(archive.media_disposition,'reviewed_external_reference');
  assert.equal((await q('select private.deleted_content_external_archive_supported($1) b',[archive.id])).b,true);
  assert.equal((await q('select count(*)::int n from private.deleted_content_media_stages')).n,0);
  assert.equal((await q('select count(*)::int n from private.deleted_media_key_retirements')).n,0);
  assert.equal((await endpoint(target)).r.status,'already_deleted');
  assert.equal((await expire(archive.id)).r.status,'not_due');
  await isolated(async()=>{
   await age(archive.id,'719 hours 59 minutes');assert.equal((await expire(archive.id)).r.status,'not_due');
   await age(archive.id,'720 hours');assert.equal((await expire(archive.id)).r.status,'purged','eligible at exactly 720 elapsed hours');
  });
  for(const mutation of ["content='{}'::jsonb","deletion_kind='soft'","author='10000000-0000-4000-8000-000000000002'", "source_created_at='2026-01-02'"])
   await isolated(async()=>{
    await age(archive.id);
    await db.exec(`alter table private.deleted_content_records disable trigger deleted_content_immutable;
     alter table private.deleted_content_records disable trigger preserve_external_reference_archive;
     update private.deleted_content_records set ${mutation} where id='${archive.id}';
     alter table private.deleted_content_records enable trigger deleted_content_immutable;
     alter table private.deleted_content_records enable trigger preserve_external_reference_archive;`);
    if(mutation==="deletion_kind='soft'") await db.exec(`alter table private.deleted_content_external_reference_captures disable trigger preserve_external_reference_capture;
     update private.deleted_content_external_reference_captures c set archive_sha256=private.deleted_content_external_sha256(to_jsonb(r))
      from private.deleted_content_records r where c.deletion_id=r.id and r.id='${archive.id}';
     alter table private.deleted_content_external_reference_captures enable trigger preserve_external_reference_capture;`);
    assert.equal((await expire(archive.id)).r.status,'external_reference_archive_proof_required',mutation);
   });
  for(const mutation of ["archive_sha256=repeat('c',64)","source_binding=jsonb_set(source_binding,'{locatorSha256}',to_jsonb(repeat('d',64)))"])
   await isolated(async()=>{
    await age(archive.id);
    await db.exec(`alter table private.deleted_content_external_reference_captures disable trigger preserve_external_reference_capture;
     update private.deleted_content_external_reference_captures set ${mutation} where deletion_id='${archive.id}';
     alter table private.deleted_content_external_reference_captures enable trigger preserve_external_reference_capture;`);
    assert.equal((await expire(archive.id)).r.status,'external_reference_archive_proof_required',mutation);
    assert.equal((await q('select public.deleted_content_expiry_readiness() r')).r.unprovenMediaArchiveCount,1);
   });
  await isolated(async()=>{
   await deny(()=>insert(target),/captured_source_cannot_return/);
   await deny(()=>q('update private.deleted_content_records set content=null where id=$1',[archive.id]),/immutable/);
   await deny(()=>q('update private.deleted_content_external_reference_captures set archive_sha256=repeat(\'c\',64)'),/permanent/);
   for(const [sql,reason] of blockers.filter(x=>x[1]==='ownership_conflict')) await deny(()=>q(sql,[target]),/ownership_admission_forbidden/);
  });
  await isolated(async()=>{
   await age(archive.id);
   await q("insert into legal_holds(target_type,target_id,status) values('creator_video',$1,'active')",[target]);
   assert.equal((await expire(archive.id)).r.status,'held');
  });
  await isolated(async()=>{
   await age(archive.id);
   assert.equal((await expire(archive.id)).r.status,'purged');
   await deny(()=>q("insert into legal_holds(target_type,target_id,status) values('creator_video',$1,'active')",[target]),/claim|irreversible/);
   assert.equal((await endpoint(target)).r.status,'already_deleted','retry after purge retains exact provenance');
   assert.equal((await expire(archive.id)).r.status,'already_absent');
   assert.equal((await q("select count(*)::int n from private.deleted_content_expiry_claims where kind='text_only' and completed_at is not null")).n,1);
  });
  await isolated(async()=>{
   const fake=randomUUID();
   await q(`insert into private.deleted_content_records(id,target_type,target_id,author,source_created_at,deletion_kind,deleted_at,expires_at,media_disposition,external_evidence_id)
    values($1,'creator_video',$2,$3,'2026-01-01','hard','2026-01-01','2026-01-31','reviewed_external_reference',$4)`,[fake,target,owner,eid]);
   assert.equal((await expire(fake)).r.status,'external_reference_archive_proof_required');
   assert.equal((await q('select public.deleted_content_expiry_readiness() r')).r.unprovenMediaArchiveCount,1);
  });
  await isolated(async()=>{
   const empty=randomUUID();await q("insert into videos(id,owner_id,created_at,title) values($1,$2,'2026-01-01','empty draft')",[empty,owner]);
   assert.equal(await coverage(empty),'metadata_only');await q('delete from videos where id=$1',[empty]);
   assert.equal((await q('select media_disposition from private.deleted_content_records where target_id=$1',[empty])).media_disposition,'metadata_only');
  });
  assert.equal((await q("select count(*)::int n from private.deleted_content_retention_events where operation in ('stage','finalize')")).n,0,'external capture never invokes media transport');
 }finally{await db.close();}
});

test('full immutable migration replay includes empty external contract without changing historical rows or authority', {timeout:180_000},async()=>{
 const {db,replayReport}=await createDatabase({implicitApiGrants:false});
 try {
  assert.ok(replayReport.files.includes(migration));
  const q=async(sql,p=[]) => (await db.query(sql,p)).rows[0];
  assert.equal((await q('select count(*)::int n from private.deleted_content_external_reference_evidence')).n,0);
  assert.equal((await q('select capture_enabled from private.deleted_content_retention_settings')).capture_enabled,false);
  const historical=await q("select *,private.deleted_content_source_coverage('creator_video',to_jsonb(v)) coverage from videos v where id='6e1c3405-7db8-4cb2-98f3-5a7642e82126'");
  assert.ok(historical,'historical fixture preserved by source migration');
  assert.notEqual(historical.coverage,'reviewed_external_reference','migration does not auto-classify real fixture');
  const secondary=(await q("select pg_get_functiondef('private.guard_deleted_content_secondary_coverage()'::regprocedure) d")).d;
  assert.ok(secondary.includes('retention_secondary_media_coverage_required'));
  // Set up an explicitly synthetic historical row, not a production-admission
  // bypass. Only the preexisting INSERT provenance guard is suspended here.
  const target=randomUUID();
  await db.exec(`insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
   values('${owner}','synthetic-external@example.test',now(),false,false);
   begin;alter table public.videos disable trigger zz_guard_creator_video_client_authority;
   insert into public.videos(id,owner_id,title,description,created_at,storage_provider,storage_bucket,playback_url,thumb_url,visibility,scan_status)
   values('${target}','${owner}','Synthetic external fixture','Full replay proof','2026-01-01','supabase','creator-videos',
    'https://synthetic.invalid/video.mp4','https://synthetic.invalid/thumb.jpg','draft','quarantined');
   alter table public.videos enable trigger zz_guard_creator_video_client_authority;commit;`);
  const before=(await q('select to_jsonb(v) v from videos v where id=$1',[target])).v;
  const b=(await q('select private.read_deleted_content_external_reference_source($1) b',[target])).b;
  await q('select private.record_deleted_content_external_reference($1,$2,$3)',[target,b,evidence(b)]);
  assert.equal((await q("select private.deleted_content_source_coverage('creator_video',to_jsonb(v)) c from videos v where id=$1",[target])).c,'reviewed_external_reference');
  assert.deepEqual((await q('select to_jsonb(v) v from videos v where id=$1',[target])).v,before);
  const r=(await q('select public.deleted_content_expiry_readiness() r')).r;
  assert.equal(r.ready,false);assert.equal(r.reviewedExternalReferenceSourceCount,1);
  assert.ok(r.blockers.includes('consumer_rollout_not_qualified'));
  assert.ok(!readFileSync('supabase/migrations/'+migration,'utf8').includes('create or replace function private.guard_deleted_content_secondary_coverage'));
 }finally{await db.close();}
});
