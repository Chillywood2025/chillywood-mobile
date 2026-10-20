-- Real SQL on the full migrated disposable database; no provider IO or claims
-- about physical deletion. All fixture and qualification changes roll back.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Exact baseline synthetic fixture only; no external or production state.
delete from public.videos where id='6e1c3405-7db8-4cb2-98f3-5a7642e82126'
 and title='Chi''llywood Originals Proof Fixture' and storage_provider='supabase';
delete from public.media_scan_jobs
 where target_table='videos' and target_id='6e1c3405-7db8-4cb2-98f3-5a7642e82126';
update private.deleted_content_retention_settings set legacy_object_deletes_blocked=true;
update private.deleted_content_rollout_qualification set source_revision=repeat('0',40),
 client_enforcement_evidence='disposable-local SQL fixture',
 legacy_delete_drain_evidence='disposable-local fixture: no provider requests in flight',
 worker_schedule_evidence='disposable-local manually driven worker',
 origin_cleanup_evidence='disposable-local no live provider claim',qualified_at=clock_timestamp();
select public.record_deleted_content_worker_heartbeat();
select is(private.deleted_media_normalize_locator('plain/original.mp4'),'plain/original.mp4','unencoded locator fast path preserves exact bytes');
select is(private.deleted_media_normalize_locator('日本語/%zz/%00/%C3%A9'),'日本語/%zz/%00/%C3%A9',
 'Unicode, invalid escapes, control bytes and non-ASCII escapes remain unchanged');
select is(private.deleted_media_normalize_locator('%25252Fsource%2Emp4'),'/source.mp4','nested ASCII encodings remain conservatively decoded');
select is(private.deleted_media_normalize_locator('%252525252F'),'%2F','decoder retains its exact four-pass bound');
select is(private.deleted_media_normalize_locator(null),'','null locator stays empty');

select ok(not has_table_privilege('service_role','private.deleted_content_stage_cleanup_claims','INSERT'),
 'worker cannot forge orphan cleanup claims');
select ok(not has_function_privilege('authenticated','public.reconcile_deleted_content_stage(uuid)','EXECUTE'),
 'consumer cannot turn object intent into cleanup authority');
select ok(not has_function_privilege('authenticated','public.read_deleted_content_stage_cleanup_claim(uuid)','EXECUTE'),
 'consumer cannot resolve private original locators');
select is(public.list_deleted_content_stage_cleanup_work()->>'enabled','false','worker starts disabled');
update private.deleted_content_retention_settings
 set activation_ready=true,capture_enabled=true,media_staging_enabled=true,media_expiry_enabled=true;
insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
 values('d3100000-0000-4000-8000-000000000001','retention-recovery@example.test',now(),false,false);

create function pg_temp.legacy_stage(n integer) returns uuid language plpgsql as $$
declare target uuid:=md5('recovery-target-'||n)::uuid;
 reservation uuid:=md5('recovery-reservation-'||n)::uuid;
 stage uuid:=md5('recovery-stage-'||n)::uuid;
 author uuid:='d3100000-0000-4000-8000-000000000001';
 object_key text:=author||'/'||target||'/source.mp4';
begin
 insert into public.media_upload_reservations(id,owner_user_id,surface_type,storage_provider,storage_bucket,
  storage_object_key,expected_mime_type,expected_size_bytes,status,expires_at,verified_at,attached_record_id,attached_at)
 values(reservation,author,'creator_video','cloudflare_r2','chillywood-media-origin',object_key,'video/mp4',1024,
  'verified',now()+interval '1 hour',now(),target::text,now());
 insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,
  storage_object_key,storage_path,mime_type,file_size_bytes)
 values(target,author,'Synthetic recovery original','draft','clean','cloudflare_r2','chillywood-media-origin',
  object_key,object_key,'video/mp4',1024);
 update public.media_scan_jobs set status='clean' where target_table='videos' and target_id=target::text;
 -- A historical object-delete request, deliberately predating content intent.
 insert into private.deleted_content_media_stages(id,target_type,target_id,author,provider,bucket,object_key,reservation_id,staged_at,reconcile_after)
 values(stage,'creator_video',target::text,author::text,'cloudflare_r2','chillywood-media-origin',object_key,reservation,
  clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour');
 return stage;
end $$;
create function pg_temp.replace_original(n integer) returns void language plpgsql as $$
declare target uuid:=md5('recovery-target-'||n)::uuid;
 author uuid:='d3100000-0000-4000-8000-000000000001';
 replacement text:=author||'/'||target||'/source.mov';
begin
 insert into public.media_upload_reservations(id,owner_user_id,surface_type,storage_provider,storage_bucket,
  storage_object_key,expected_mime_type,expected_size_bytes,status,expires_at,verified_at,attached_record_id,attached_at)
 values(md5('recovery-replacement-'||n)::uuid,author,'creator_video','cloudflare_r2','chillywood-media-origin',
  replacement,'video/quicktime',1024,'verified',now()+interval '1 hour',now(),target::text,now());
 update public.videos set storage_object_key=replacement,storage_path=replacement,mime_type='video/quicktime'
 where id=target;
 update public.media_scan_jobs set status='clean' where target_table='videos' and target_id=target::text;
end $$;
select pg_temp.legacy_stage(1);
select is(public.reconcile_deleted_content_stage(md5('recovery-stage-1')::uuid)->>'status',
 'attached_requires_explicit_content_delete','an old object request never deletes its attached parent');
select is((select count(*) from private.deleted_content_records),0::bigint,'staging is not edit history');
select is((select count(*) from public.videos where id=md5('recovery-target-1')::uuid),1::bigint,
 'attached parent remains present');
select pg_temp.replace_original(1);
select is(public.reconcile_deleted_content_stage(md5('recovery-stage-1')::uuid)->>'status','claimed',
 'replacement detaches only the proven original and permits cleanup');
select is((select count(*) from private.deleted_content_records),0::bigint,'replacement cleanup creates no deletion snapshot');
select is((select status from private.deleted_media_key_retirements where stage_id=md5('recovery-stage-1')::uuid),
 'cleanup_claimed','old logical key is permanently retired');
select is(public.reconcile_deleted_content_stage(md5('recovery-stage-1')::uuid)->>'claimId',
 (select id::text from private.deleted_content_stage_cleanup_claims where stage_id=md5('recovery-stage-1')::uuid),
 'reconciliation retries reuse the same irreversible claim');
select is((select storage_object_key from public.videos where id=md5('recovery-target-1')::uuid),
 'd3100000-0000-4000-8000-000000000001/'||md5('recovery-target-1')::uuid||'/source.mov','replacement remains live');
select is(public.check_deleted_media_retirement('cloudflare_r2','chillywood-media-origin',
 'd3100000-0000-4000-8000-000000000001/'||md5('recovery-target-1')::uuid||'/source.mp4','upload')->>'allowed',
 'false','old-key upload cannot resume');
select throws_ok($$insert into public.legal_holds(target_type,target_id,reason,status)
 values('creator_video',md5('recovery-target-1')::uuid::text,'Synthetic late preservation','active')$$,
 '55000','retention_preservation_unavailable_deletion_already_claimed','late hold cannot falsely promise preservation');
select is(public.read_deleted_content_stage_cleanup_claim(
 (select id from private.deleted_content_stage_cleanup_claims where stage_id=md5('recovery-stage-1')::uuid))->>'status',
 'authorized','worker rechecks permanent claim and live references');
select is(public.record_deleted_content_stage_cleanup_result(
 (select id from private.deleted_content_stage_cleanup_claims where stage_id=md5('recovery-stage-1')::uuid),'failed')->>'status',
 'failed','failed provider attempt preserves claim for retry');
select is(public.record_deleted_content_stage_cleanup_result(
 (select id from private.deleted_content_stage_cleanup_claims where stage_id=md5('recovery-stage-1')::uuid),'observed_absent')->>'permanentlyAbsent',
 'false','404 is a time-bound observation');
select ok((select next_check_at>clock_timestamp()+interval '23 hours' from private.deleted_content_stage_cleanup_claims
 where stage_id=md5('recovery-stage-1')::uuid),'observed absence schedules another local eligibility time');
update private.deleted_content_retention_settings set media_expiry_enabled=false;
select is(public.read_deleted_content_stage_cleanup_claim(
 (select id from private.deleted_content_stage_cleanup_claims where stage_id=md5('recovery-stage-1')::uuid))->>'status',
 'disabled','stopping worker prevents new cleanup authorization');
update private.deleted_content_retention_settings set media_expiry_enabled=true;
select is(public.read_deleted_content_stage_cleanup_claim(
 (select id from private.deleted_content_stage_cleanup_claims where stage_id=md5('recovery-stage-1')::uuid))->>'status',
 'authorized','restart resumes the original durable claim');
select is((select count(*) from private.deleted_content_stage_cleanup_claims),1::bigint,'restart never creates a fresh claim');

-- Exercise restart before adding the deliberately unproven historical archive
-- below: that separate archive correctly blocks every later activation.
select pg_temp.legacy_stage(3);
select pg_temp.replace_original(3);
-- Stopped capture simulates an older client whose metadata commit was missed.
update private.deleted_content_retention_settings
 set capture_enabled=false,media_staging_enabled=false,media_expiry_enabled=false;
delete from public.videos where id=md5('recovery-target-3')::uuid;
update public.media_scan_jobs set status='clean' where target_table='videos' and target_id=md5('recovery-target-3')::uuid::text;
update private.deleted_content_retention_settings
 set capture_enabled=true,media_staging_enabled=true,media_expiry_enabled=true;
select is(public.reconcile_deleted_content_stage(md5('recovery-stage-3')::uuid)->>'status','claimed',
 'missing content commit permits orphan cleanup without fabricating retained content');
select is((select count(*) from private.deleted_content_records where target_id=md5('recovery-target-3')::uuid::text),
 0::bigint,'missing commit cannot be reconstructed as a deletion archive');
select throws_ok($$delete from private.deleted_content_stage_cleanup_claims where stage_id=md5('recovery-stage-3')::uuid$$,
 'P0001','cleanup_claim_permanent','orphan cleanup proof cannot be removed');

select pg_temp.legacy_stage(2);
select pg_temp.replace_original(2);
-- Older capture linked every target stage to a later deletion record. The exact
-- original registry rejected that finalization, so deletion_id is insufficient.
insert into private.deleted_content_records(id,target_type,target_id,author,content,deletion_kind,deleted_at,expires_at)
 values(md5('recovery-unrelated-deletion')::uuid,'creator_video',md5('recovery-target-2')::uuid::text,
 'd3100000-0000-4000-8000-000000000001','{"title":"Later replacement"}','hard',now(),now()+interval '720 hours');
update private.deleted_content_media_stages set deletion_id=md5('recovery-unrelated-deletion')::uuid
 where id=md5('recovery-stage-2')::uuid;
select is((select status from private.deleted_media_key_retirements where stage_id=md5('recovery-stage-2')::uuid),
 'staged','unrelated deletion ID cannot finalize a replaced original');
insert into public.legal_holds(target_type,target_id,reason,status)
 values('creator_video',md5('recovery-target-2')::uuid::text,'Synthetic preserve before cleanup','active');
select is(public.reconcile_deleted_content_stage(md5('recovery-stage-2')::uuid)->>'status','held',
 'backed preexisting hold blocks abandoned replacement cleanup');
select is((select count(*) from private.deleted_content_stage_cleanup_claims where stage_id=md5('recovery-stage-2')::uuid),
 0::bigint,'held object has no irreversible cleanup claim');
update public.legal_holds set status='released',released_at=clock_timestamp(),release_reason='Synthetic release'
 where target_id=md5('recovery-target-2')::uuid::text;

-- A source-independent live alias must block until removed. The real admission
-- guard must also reject a new alias after the claim commits.
create table public.retention_recovery_alias(id uuid primary key default gen_random_uuid(),object_path text);
create trigger zzz_deleted_media_reference_guard before insert or update on public.retention_recovery_alias
 for each row execute function private.guard_deleted_media_references();
insert into public.retention_recovery_alias(object_path)
 values('d3100000-0000-4000-8000-000000000001/'||md5('recovery-target-2')::uuid||'/source.mp4');
select is(public.reconcile_deleted_content_stage(md5('recovery-stage-2')::uuid)->>'status','unsupported_or_live_reference',
 'shared object alias blocks cleanup');
delete from public.retention_recovery_alias;
select is(public.reconcile_deleted_content_stage(md5('recovery-stage-2')::uuid)->>'status','claimed',
 'removed alias allows a later bounded retry');
select is((select count(*) from private.deleted_content_media_expiry_claims where stage_id=md5('recovery-stage-2')::uuid),
 0::bigint,'replaced stage uses orphan cleanup, never retained-content expiry');
select throws_ok($$insert into public.retention_recovery_alias(object_path)
 values('d3100000-0000-4000-8000-000000000001/'||md5('recovery-target-2')::uuid||'/source.mp4')$$,
 '55000','media_key_retired_reference_forbidden','permanent retirement blocks alias resurrection');
select ok((public.deleted_content_expiry_readiness()->'blockers') ? 'historical_media_provenance_requires_resolution',
 'unproven historical archive remains an explicit activation blocker after orphan cleanup');

-- Reparenting/replacement cannot switch the hold scope of an old object request.
do $$
declare author uuid:='d3100000-0000-4000-8000-000000000001';
 original_parent uuid:=md5('recovery-parent-original')::uuid;
 replacement_parent uuid:=md5('recovery-parent-replacement')::uuid;
 attachment uuid:=md5('recovery-attachment')::uuid;
 original_key text:=author||'/profile_post/'||original_parent||'/'||attachment||'.jpg';
 replacement_key text:=author||'/profile_post/'||replacement_parent||'/'||attachment||'.jpg';
begin
 insert into public.profile_posts(id,user_id,body,visibility)
 values(original_parent,author::text,'Synthetic original parent','draft'),
  (replacement_parent,author::text,'Synthetic replacement parent','draft');
 insert into public.media_upload_reservations(id,owner_user_id,surface_type,storage_provider,storage_bucket,
  storage_object_key,expected_mime_type,expected_size_bytes,status,expires_at,verified_at,attached_record_id,attached_at)
 values(md5('recovery-attachment-original-reservation')::uuid,author,'social_attachment','cloudflare_r2','chillywood-media-origin',
  original_key,'image/jpeg',1024,'verified',now()+interval '1 hour',now(),attachment::text,now()),
  (md5('recovery-attachment-replacement-reservation')::uuid,author,'social_attachment','cloudflare_r2','chillywood-media-origin',
  replacement_key,'image/jpeg',1024,'verified',now()+interval '1 hour',now(),attachment::text,now());
 insert into public.social_attachments(id,owner_user_id,surface_type,surface_id,storage_provider,storage_bucket,
  storage_object_key,storage_path,mime_type,size_bytes)
 values(attachment,author::text,'profile_post',original_parent,'cloudflare_r2','chillywood-media-origin',
  original_key,original_key,'image/jpeg',1024);
 update public.media_scan_jobs set status='clean' where target_table='social_attachments' and target_id=attachment::text;
 insert into private.deleted_content_media_stages(id,target_type,target_id,author,provider,bucket,object_key,reservation_id,staged_at,reconcile_after)
 values(md5('recovery-attachment-stage')::uuid,'social_attachment',attachment::text,author::text,
  'cloudflare_r2','chillywood-media-origin',original_key,md5('recovery-attachment-original-reservation')::uuid,
  clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour');
 update public.social_attachments set surface_id=replacement_parent,storage_object_key=replacement_key,storage_path=replacement_key
  where id=attachment;
 update public.media_scan_jobs set status='clean' where target_table='social_attachments' and target_id=attachment::text;
end $$;
insert into public.legal_holds(target_type,target_id,reason,status)
 values('profile_post',md5('recovery-parent-original')::uuid::text,'Synthetic original parent hold','active');
select is(public.reconcile_deleted_content_stage(md5('recovery-attachment-stage')::uuid)->>'status','held',
 'immutable original parent protects replaced attachment bytes');
update public.legal_holds set status='released',released_at=clock_timestamp(),release_reason='Synthetic release'
 where target_id=md5('recovery-parent-original')::uuid::text;
insert into public.legal_holds(target_type,target_id,reason,status)
 values('profile_post',md5('recovery-parent-replacement')::uuid::text,'Synthetic unrelated replacement hold','active');
select is(public.reconcile_deleted_content_stage(md5('recovery-attachment-stage')::uuid)->>'status','claimed',
 'replacement parent does not silently replace original provenance');
select is((select parent_id from private.deleted_content_stage_cleanup_claims where stage_id=md5('recovery-attachment-stage')::uuid),
 md5('recovery-parent-original')::uuid::text,'claim freezes original parent identity');
select throws_ok($$insert into public.legal_holds(target_type,target_id,reason,status)
 values('profile_post',md5('recovery-parent-original')::uuid::text,'Synthetic late original-parent hold','active')$$,
 '55000','retention_preservation_unavailable_deletion_already_claimed','late original parent hold cannot promise preservation');
select is((select surface_id::text from public.social_attachments where id=md5('recovery-attachment')::uuid),
 md5('recovery-parent-replacement')::uuid::text,'replacement attachment and its parent remain intact');
select * from finish();
rollback;
