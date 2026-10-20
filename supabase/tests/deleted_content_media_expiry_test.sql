-- Synthetic aged state in a full migrated rollback-only database. No provider IO.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select ok(not (select media_expiry_enabled from private.deleted_content_retention_settings),'media expiry starts disabled');
select ok(not has_table_privilege('service_role','private.deleted_content_media_expiry_claims','INSERT'),'service cannot forge claims directly');
select ok(not has_function_privilege('authenticated','public.read_deleted_content_media_expiry_claim(uuid)','EXECUTE'),'consumer cannot resolve private deletion bindings');
-- Explicit capture enable arms the permanent retention fence before fixtures.
update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,media_staging_enabled=true;
update private.deleted_content_retention_settings set capture_enabled=false,media_staging_enabled=false;
insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
values('c3100000-0000-4000-8000-000000000001','retention-media@example.test',now(),false,false);
insert into public.media_upload_reservations(id,owner_user_id,surface_type,storage_provider,storage_bucket,storage_object_key,
 expected_mime_type,expected_size_bytes,status,expires_at,observed_mime_type,observed_size_bytes,verified_at,attached_record_id,attached_at)
values('c4100000-0000-4000-8000-000000000001','c3100000-0000-4000-8000-000000000001','creator_video','cloudflare_r2','chillywood-media-origin',
 'c3100000-0000-4000-8000-000000000001/c5100000-0000-4000-8000-000000000001/source.mp4',
 'video/mp4',1024,'verified',now()-interval '30 days','video/mp4',1024,now()-interval '31 days','c5100000-0000-4000-8000-000000000001',now()-interval '31 days');
insert into public.videos(id,owner_id,title,visibility,moderation_status,storage_provider,storage_bucket,storage_object_key,storage_path,mime_type,file_size_bytes)
values('c5100000-0000-4000-8000-000000000001','c3100000-0000-4000-8000-000000000001','Synthetic aged original','draft','clean','cloudflare_r2','chillywood-media-origin',
 'c3100000-0000-4000-8000-000000000001/c5100000-0000-4000-8000-000000000001/source.mp4',
 'c3100000-0000-4000-8000-000000000001/c5100000-0000-4000-8000-000000000001/source.mp4','video/mp4',1024);
insert into private.deleted_content_media_stages(id,target_type,target_id,author,provider,bucket,object_key,reservation_id)
values('c6100000-0000-4000-8000-000000000001','creator_video','c5100000-0000-4000-8000-000000000001','c3100000-0000-4000-8000-000000000001',
 'cloudflare_r2','chillywood-media-origin','c3100000-0000-4000-8000-000000000001/c5100000-0000-4000-8000-000000000001/source.mp4','c4100000-0000-4000-8000-000000000001');
insert into private.deleted_content_records(id,target_type,target_id,author,content,deletion_kind,deleted_at,expires_at)
values('c7100000-0000-4000-8000-000000000001','creator_video','c5100000-0000-4000-8000-000000000001','c3100000-0000-4000-8000-000000000001',
 '{"title":"Synthetic expired title"}','hard',now()-interval '31 days',now()-interval '1 day');
update private.deleted_content_media_stages set deletion_id='c7100000-0000-4000-8000-000000000001' where id='c6100000-0000-4000-8000-000000000001';
update private.deleted_content_retention_settings set activation_ready=true,capture_enabled=true,media_staging_enabled=true,media_expiry_enabled=true;
select is(public.claim_deleted_content_media_expiry('c6100000-0000-4000-8000-000000000001')->>'status','unsupported_or_live_reference','live source blocks claim');
-- Capture is disabled only while constructing the already-deleted aged fixture.
update private.deleted_content_retention_settings set capture_enabled=false,media_staging_enabled=false,media_expiry_enabled=false;
delete from public.videos where id='c5100000-0000-4000-8000-000000000001';
update public.media_scan_jobs set status='clean' where target_table='videos' and target_id='c5100000-0000-4000-8000-000000000001';
update private.deleted_content_retention_settings set capture_enabled=true,media_staging_enabled=true,media_expiry_enabled=true;
insert into public.legal_holds(target_type,target_id,reason,status)
values('creator_video','c5100000-0000-4000-8000-000000000001','Synthetic preservation','active');
select is(public.claim_deleted_content_media_expiry('c6100000-0000-4000-8000-000000000001')->>'status','held','actual backed legal hold prevents media claim');
update public.legal_holds set status='released',released_at=clock_timestamp(),release_reason='Synthetic release' where target_id='c5100000-0000-4000-8000-000000000001';
select is(public.claim_deleted_content_media_expiry('c6100000-0000-4000-8000-000000000001')->>'status','claimed','hard-deleted supported original can claim');
select is((select count(*) from private.deleted_content_media_expiry_claims),1::bigint,'one durable irreversible claim');
select is(public.claim_deleted_content_media_expiry('c6100000-0000-4000-8000-000000000001')->>'status','claimed','retry idempotent');
select ok((select content is null from private.deleted_content_records where id='c7100000-0000-4000-8000-000000000001'),'expired description is cleared');
select throws_ok($$insert into public.legal_holds(target_type,target_id,reason,status) values('creator_video','c5100000-0000-4000-8000-000000000001','Synthetic late preservation','active')$$,
 '55000','retention_preservation_unavailable_deletion_already_claimed','claim before hold cannot promise preservation');
select is(public.read_deleted_content_media_expiry_claim((select id from private.deleted_content_media_expiry_claims))->>'status','authorized','worker rechecks proof before provider IO');
select is(public.record_deleted_content_media_expiry_result((select id from private.deleted_content_media_expiry_claims),'observed_absent')->>'permanentlyAbsent','false','404 is observation, not permanent physical absence');
-- Parent aliases are the same legal scope, including room attachments.
insert into private.deleted_content_records(id,target_type,target_id,author,parent_type,parent_id,content,deletion_kind,deleted_at,expires_at)
values('c8100000-0000-4000-8000-000000000001','social_attachment','c8100000-0000-4000-8000-000000000001','c3100000-0000-4000-8000-000000000001',
 'watch_party_room_message','c9100000-0000-4000-8000-000000000001',null,'hard',now()-interval '31 days',now()-interval '1 day');
insert into private.deleted_content_media_stages(id,target_type,target_id,author,provider,bucket,object_key,reservation_id,deletion_id)
values('c8100000-0000-4000-8000-000000000001','social_attachment','c8100000-0000-4000-8000-000000000001','c3100000-0000-4000-8000-000000000001',
 'cloudflare_r2','chillywood-media-origin','synthetic-room-key','c4100000-0000-4000-8000-000000000001','c8100000-0000-4000-8000-000000000001');
insert into public.legal_holds(target_type,target_id,reason,status)
values('room_message','c9100000-0000-4000-8000-000000000001','Synthetic parent preservation','active');
select is(public.claim_deleted_content_media_expiry('c8100000-0000-4000-8000-000000000001')->>'status','held','canonical room parent hold protects hard-deleted attachment');
update public.legal_holds set status='released',released_at=clock_timestamp(),release_reason='Synthetic release' where target_id='c9100000-0000-4000-8000-000000000001';
-- Synthetic durable claim tests the opposite serialization order without provider IO.
insert into private.deleted_content_media_expiry_claims(stage_id,deletion_id,target_type,target_id,author,parent_type,parent_id,provider,bucket,object_key)
values('c8100000-0000-4000-8000-000000000001','c8100000-0000-4000-8000-000000000001','social_attachment','c8100000-0000-4000-8000-000000000001','c3100000-0000-4000-8000-000000000001',
 'watch_party_room_message','c9100000-0000-4000-8000-000000000001','cloudflare_r2','chillywood-media-origin','synthetic-room-key');
select throws_ok($$insert into public.legal_holds(target_type,target_id,reason,status) values('room_message','c9100000-0000-4000-8000-000000000001','Synthetic late parent preservation','active')$$,
 '55000','retention_preservation_unavailable_deletion_already_claimed','late canonical parent hold cannot falsely promise preservation');
select * from finish();
rollback;
