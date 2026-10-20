-- Full migrated disposable PostgreSQL, rollback-only aged lifecycle fixtures.
-- No production predicate/trigger is mocked and no provider request is issued.
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
delete from public.videos where id='6e1c3405-7db8-4cb2-98f3-5a7642e82126'
 and title='Chi''llywood Originals Proof Fixture' and storage_provider='supabase';
update private.deleted_content_rollout_qualification set source_revision=repeat('0',40),
 client_enforcement_evidence='disposable-local terminal cleanup fixture',
 worker_schedule_evidence='disposable-local manually driven expiry',
 origin_cleanup_evidence='disposable-local no live provider claim',qualified_at=clock_timestamp();
select public.record_deleted_content_worker_heartbeat();
update private.deleted_content_retention_settings
 set activation_ready=true,capture_enabled=true,media_staging_enabled=true,media_expiry_enabled=true,text_expiry_enabled=true;
insert into auth.users(id,email,email_confirmed_at,is_sso_user,is_anonymous)
 values('d3400000-0000-4000-8000-000000000001','terminal-cleanup@example.test',now(),false,false);
create table public.retention_terminal_alias(id uuid primary key default gen_random_uuid(),object_path text);
create trigger zzz_deleted_media_reference_guard before insert or update on public.retention_terminal_alias
 for each row execute function private.guard_deleted_media_references();

create function pg_temp.terminal_attachment(n integer,shared boolean default false,parent_proof boolean default true)
returns uuid language plpgsql as $$
declare author uuid:='d3400000-0000-4000-8000-000000000001';
 parent uuid:=md5('terminal-parent-'||n)::uuid; attachment uuid:=md5('terminal-attachment-'||n)::uuid;
 stage uuid:=md5('terminal-stage-'||n)::uuid; reservation uuid:=md5('terminal-reservation-'||n)::uuid;
 deletion uuid:=md5('terminal-deletion-'||n)::uuid;
 original text:=author||'/profile_post/'||parent||'/'||attachment||'.jpg';
 created timestamptz:=now()-interval '35 days'; deleted timestamptz:=now()-interval '31 days';
begin
 insert into public.profile_posts(id,user_id,body,visibility,created_at,deleted_at)
 values(parent,author::text,'Synthetic deleted parent','draft',created,deleted);
 insert into public.media_upload_reservations(id,owner_user_id,surface_type,storage_provider,storage_bucket,
  storage_object_key,expected_mime_type,expected_size_bytes,status,expires_at,observed_mime_type,
  observed_size_bytes,verified_at,attached_record_id,attached_at)
 values(reservation,author,'social_attachment','cloudflare_r2','chillywood-media-origin',original,
  'image/jpeg',1024,'verified',created+interval '1 hour','image/jpeg',1024,created,attachment::text,created);
 insert into public.social_attachments(id,owner_user_id,surface_type,surface_id,storage_provider,storage_bucket,
  storage_object_key,storage_path,mime_type,size_bytes,created_at)
 values(attachment,author::text,'profile_post',parent,'cloudflare_r2','chillywood-media-origin',
  original,original,'image/jpeg',1024,created);
 update public.media_scan_jobs set status='clean'
 where target_table='social_attachments' and target_id=attachment::text;
 insert into private.deleted_content_media_stages(id,target_type,target_id,author,provider,bucket,object_key,reservation_id)
 values(stage,'social_attachment',attachment::text,author::text,'cloudflare_r2','chillywood-media-origin',original,reservation);
 if shared then insert into public.retention_terminal_alias(object_path) values(original); end if;
 if parent_proof then
  insert into private.deleted_content_records(target_type,target_id,author,content,source_created_at,
   deletion_kind,deleted_at,expires_at,media_disposition)
  values('profile_post',parent::text,author::text,'{"body":"Synthetic deleted parent"}',created,
   'soft',deleted,deleted+interval '720 hours','text_only');
 end if;
 insert into private.deleted_content_records(id,target_type,target_id,author,source_created_at,
  parent_type,parent_id,deletion_kind,deleted_at,expires_at,media_disposition)
 values(deletion,'social_attachment',attachment::text,author::text,created,'profile_post',parent::text,
  'soft',deleted,deleted+interval '720 hours','retained_original');
 -- Actual finalization checks original, author, incarnation and deletion ID.
 update private.deleted_content_media_stages set deletion_id=deletion where id=stage;
 return stage;
end $$;

select ok(not has_function_privilege('service_role','private.cleanup_expired_deleted_attachment_source(uuid)','EXECUTE'),
 'worker cannot bypass claim/hold boundary to erase attachment metadata');
select pg_temp.terminal_attachment(1);
insert into public.legal_holds(target_type,target_id,reason,status)
 values('profile_post',md5('terminal-parent-1')::uuid::text,'Synthetic parent preservation','active');
select is(public.claim_deleted_content_media_expiry(md5('terminal-stage-1')::uuid)->>'status','held',
 'active parent hold blocks terminal source cleanup before any metadata mutation');
select ok(exists(select 1 from public.social_attachments where id=md5('terminal-attachment-1')::uuid),
 'held attachment metadata remains present');
update public.legal_holds set status='released',released_at=clock_timestamp(),release_reason='Synthetic release'
 where target_id=md5('terminal-parent-1')::uuid::text;
select is(public.claim_deleted_content_media_expiry(md5('terminal-stage-1')::uuid)->>'status','claimed',
 'expired original beneath genuinely deleted parent can retire after hold release');
select ok(not exists(select 1 from public.social_attachments where id=md5('terminal-attachment-1')::uuid),
 'terminal cleanup removes only the exact expired attachment source');
select is((select count(*) from private.deleted_content_records where target_id=md5('terminal-attachment-1')::uuid::text),
 1::bigint,'terminal hard cleanup reuses the first soft deletion without another snapshot');
select ok((select expires_at=deleted_at+interval '720 hours' and expires_at<clock_timestamp()
 from private.deleted_content_records where id=md5('terminal-deletion-1')::uuid),'terminal cleanup never renews retention');
select is(public.claim_deleted_content_media_expiry(md5('terminal-stage-1')::uuid)->>'status','claimed',
 'retry after terminal cleanup is idempotent');
select is((select count(*) from private.deleted_content_media_expiry_claims where stage_id=md5('terminal-stage-1')::uuid),
 1::bigint,'retry keeps one permanent object claim');

select pg_temp.terminal_attachment(2,true);
select is(public.claim_deleted_content_media_expiry(md5('terminal-stage-2')::uuid)->>'status','unsupported_or_live_reference',
 'shared alias blocks irreversible retirement');
select ok(exists(select 1 from public.social_attachments where id=md5('terminal-attachment-2')::uuid),
 'shared-reference rejection rolls terminal metadata deletion back');
select is((select status from private.deleted_media_key_retirements where stage_id=md5('terminal-stage-2')::uuid),
 'retained','shared rejection leaves retirement unclaimed');
delete from public.retention_terminal_alias;
select is(public.claim_deleted_content_media_expiry(md5('terminal-stage-2')::uuid)->>'status','claimed',
 'later retry succeeds after real shared alias is removed');

select pg_temp.terminal_attachment(3);
update public.profile_posts set deleted_at=null where id=md5('terminal-parent-3')::uuid;
select is(public.claim_deleted_content_media_expiry(md5('terminal-stage-3')::uuid)->>'status','source_live_or_changed',
 'restoring parent prevents attachment cleanup');
select ok(exists(select 1 from public.social_attachments where id=md5('terminal-attachment-3')::uuid),
 'restored parent retains attachment metadata');

select pg_temp.terminal_attachment(4,false,false);
select is(public.claim_deleted_content_media_expiry(md5('terminal-stage-4')::uuid)->>'status','parent_deletion_unproven',
 'deleted_at or absent parent alone cannot substitute for captured parent deletion');
select ok(exists(select 1 from public.social_attachments where id=md5('terminal-attachment-4')::uuid),
 'unproven parent does not authorize attachment removal');

select pg_temp.terminal_attachment(5);
update public.profile_posts set created_at=clock_timestamp() where id=md5('terminal-parent-5')::uuid;
select is(public.claim_deleted_content_media_expiry(md5('terminal-stage-5')::uuid)->>'status','parent_deletion_unproven',
 'new parent incarnation cannot inherit old deletion authority');
select ok(exists(select 1 from public.social_attachments where id=md5('terminal-attachment-5')::uuid),
 'new incarnation preserves current attachment source');

insert into private.deleted_content_records(id,target_type,target_id,author,content,deletion_kind,deleted_at,expires_at,media_disposition)
 values(md5('terminal-empty-draft')::uuid,'creator_video',md5('terminal-empty-draft-source')::uuid::text,
 'd3400000-0000-4000-8000-000000000001','{"title":"Empty draft"}','hard',
 now()-interval '31 days',now()-interval '1 day','metadata_only');
select is(public.expire_deleted_content_text(md5('terminal-empty-draft')::uuid)->>'status','purged',
 'capture-time metadata-only draft fact permits text expiry without fabricating an object');
select is(public.expire_deleted_content_text(md5('terminal-empty-draft')::uuid)->>'status','already_absent',
 'metadata-only expiry retries do not create another claim');
select is((select count(*) from private.deleted_content_expiry_claims where deletion_id=md5('terminal-empty-draft')::uuid),
 1::bigint,'metadata-only deletion has one permanent claim');
select * from finish();
rollback;
