-- Full migrated disposable PostgreSQL, rollback-only current and aged lifecycles.
-- No production predicate/trigger is mocked and no provider request is issued.
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
delete from public.videos where id='6e1c3405-7db8-4cb2-98f3-5a7642e82126'
 and title='Chi''llywood Originals Proof Fixture' and storage_provider='supabase';
delete from public.media_scan_jobs
 where target_table='videos' and target_id='6e1c3405-7db8-4cb2-98f3-5a7642e82126';
-- The gate must close before qualification, just as in the common local
-- fixture. No gateway/provider requests exist in this disposable SQL test.
update private.deleted_content_retention_settings set legacy_object_deletes_blocked=true;
update private.deleted_content_rollout_qualification set source_revision=repeat('0',40),
 client_enforcement_evidence='disposable-local terminal cleanup fixture',
 legacy_delete_drain_evidence='disposable-local fixture: no gateway/provider requests in flight',
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

-- Exercise a current parent deletion through the real capture/stage/revoke
-- chain before introducing aged expiry fixtures. No archive or stage is seeded.
do $$
declare author uuid:='d3400000-0000-4000-8000-000000000001';
 parent uuid:='d3500000-0000-4000-8000-000000000001';
 attachment uuid:='d3600000-0000-4000-8000-000000000001';
 original text:=author||'/profile_post/'||parent||'/'||attachment||'.jpg';
 scan_result jsonb;
begin
 insert into public.profile_posts(id,user_id,body,visibility)
 values(parent,author::text,'Current parent lifecycle','public');
 insert into public.media_upload_reservations(id,owner_user_id,surface_type,storage_provider,storage_bucket,
  storage_object_key,expected_mime_type,expected_size_bytes,status,expires_at,
  observed_mime_type,observed_size_bytes,verified_at)
 values('d3700000-0000-4000-8000-000000000001',author,'social_attachment','cloudflare_r2','chillywood-media-origin',
  original,'image/jpeg',1024,'verified',clock_timestamp()+interval '1 hour','image/jpeg',1024,clock_timestamp());
 -- This privileged source fixture must consume the reservation through the
 -- same real owner-binding API used by the authenticated producer trigger.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',author,'role','authenticated')::text,true);
 if not public.consume_verified_media_upload('social_attachment','cloudflare_r2','chillywood-media-origin',
   original,'image/jpeg',1024,attachment::text) then
  raise exception 'current_attachment_reservation_consume_failed';
 end if;
 perform set_config('request.jwt.claims','{}',true);
 insert into public.social_attachments(id,owner_user_id,surface_type,surface_id,storage_provider,storage_bucket,
  storage_object_key,storage_path,mime_type,size_bytes)
 values(attachment,author::text,'profile_post',parent,'cloudflare_r2','chillywood-media-origin',
  original,original,'image/jpeg',1024);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 select public.complete_media_scan_job(j.id,'clean','clamav','synthetic','synthetic-signatures',null,null,5)
 into strict scan_result from public.media_scan_jobs j
 where j.target_table='social_attachments' and j.target_column='attachment' and j.target_id=attachment::text
  and j.storage_provider='cloudflare_r2' and j.storage_bucket='chillywood-media-origin' and j.storage_object_key=original;
 if scan_result->>'targetPropagationComplete' is distinct from 'true'
  or (select scan_status from public.social_attachments where id=attachment) is distinct from 'clean' then
  raise exception 'current_attachment_scan_projection_failed';
 end if;
 perform set_config('request.jwt.claims','{}',true);
end $$;
select is((select count(*) from private.deleted_content_media_stages
 where target_id='d3600000-0000-4000-8000-000000000001'),0::bigint,
 'current attachment has no retention stage before actual parent deletion');
delete from public.profile_posts where id='d3500000-0000-4000-8000-000000000001';
select ok(exists(select 1 from private.deleted_content_records d
 where d.target_type='profile_post' and d.target_id='d3500000-0000-4000-8000-000000000001'
 and d.deletion_kind='hard' and d.content->>'body'='Current parent lifecycle'),
 'actual parent deletion captures its own hard-deletion evidence');
select is((select count(*) from public.social_attachments a
 join private.deleted_content_media_stages s on s.target_id=a.id::text and s.target_type='social_attachment'
 join private.deleted_media_key_retirements r on r.stage_id=s.id
 join private.deleted_content_records d on d.id=s.deletion_id and d.id=r.deletion_id
 join public.media_upload_reservations u on u.id=s.reservation_id and u.id=r.reservation_id
 where a.id='d3600000-0000-4000-8000-000000000001' and a.deleted_at is null
  and r.status='retained' and r.target_type=s.target_type and r.target_id=s.target_id
  and r.author=a.owner_user_id and d.author=a.owner_user_id
  and r.provider=a.storage_provider and r.bucket=a.storage_bucket and r.object_key=a.storage_object_key
  and s.provider=r.provider and s.bucket=r.bucket and s.object_key=r.object_key
  and r.source_created_at=(to_jsonb(a)->>'created_at') and d.source_created_at=a.created_at
  and d.target_type=s.target_type and d.target_id=s.target_id and d.deletion_kind='soft'
  and d.parent_type=a.surface_type and d.parent_id=a.surface_id::text and d.media_disposition='retained_original'
  and u.status='deleted' and u.attached_record_id=a.id::text
  and u.storage_provider=r.provider and u.storage_bucket=r.bucket and u.storage_object_key=r.object_key
  and r.verified_at=u.verified_at and r.attached_at=u.attached_at
  and r.deleted_at=d.deleted_at and r.expires_at=d.expires_at
  and d.expires_at=d.deleted_at+interval '720 hours' and d.expires_at>clock_timestamp()),1::bigint,
 'real parent deletion retains the child incarnation, exact original and revoked reservation in one fixed window');
select is(public.deleted_content_expiry_readiness()->>'ready','true',
 'actual parent-delete capture leaves retained child coverage ready');
select set_config('test.terminal.current_expiry',expires_at::text,true)
 from private.deleted_content_records where target_id='d3600000-0000-4000-8000-000000000001';
update private.deleted_content_retention_settings
 set activation_ready=false,capture_enabled=false,media_staging_enabled=false,media_expiry_enabled=false,text_expiry_enabled=false;
select public.record_deleted_content_worker_heartbeat();
select lives_ok($$update private.deleted_content_retention_settings
 set activation_ready=true,capture_enabled=true,media_staging_enabled=true,media_expiry_enabled=true,text_expiry_enabled=true$$,
 'actual parent-delete provenance permits a qualified restart after every runtime flag stops');
select is((select public.claim_deleted_content_media_expiry(id)->>'status'
 from private.deleted_content_media_stages where target_id='d3600000-0000-4000-8000-000000000001'),'not_due',
 'restarted worker preserves the new original until its real retention deadline');
select is((select expires_at from private.deleted_content_records
 where target_id='d3600000-0000-4000-8000-000000000001'),current_setting('test.terminal.current_expiry')::timestamptz,
 'stop and restart do not renew the actual captured retention window');

create function pg_temp.terminal_attachment(n integer,shared boolean default false,parent_proof boolean default true)
returns uuid language plpgsql as $$
declare author uuid:='d3400000-0000-4000-8000-000000000001';
 parent uuid:=md5('terminal-parent-'||n)::uuid; attachment uuid:=md5('terminal-attachment-'||n)::uuid;
 stage uuid:=md5('terminal-stage-'||n)::uuid; reservation uuid:=md5('terminal-reservation-'||n)::uuid;
 deletion uuid:=md5('terminal-deletion-'||n)::uuid;
 original text:=author||'/profile_post/'||parent||'/'||attachment||'.jpg';
 created timestamptz:=now()-interval '35 days'; deleted timestamptz:=now()-interval '31 days';
 revoked jsonb;
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
 revoked:=public.revoke_media_object_delivery('social_attachment','cloudflare_r2','chillywood-media-origin',
  original,author,attachment::text,null,null);
 if revoked->>'revoked' is distinct from 'true' then raise exception 'terminal_fixture_revocation_failed'; end if;
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
select is((select status from public.media_upload_reservations where id=md5('terminal-reservation-1')::uuid),
 'deleted','soft parent retention preserves source while revoking original delivery');
-- A text owner ID can leave the attachment present after account cleanup
-- cascades its mutable reservation. Retention authority is already permanent.
delete from public.media_upload_reservations where id=md5('terminal-reservation-1')::uuid;
select ok(not exists(select 1 from public.media_upload_reservations where id=md5('terminal-reservation-1')::uuid),
 'synthetic account-cleanup equivalent removes mutable reservation while source remains held');
select ok(private.deleted_content_soft_media_coverage(md5('terminal-deletion-1')::uuid),
 'extant held source remains covered by exact immutable stage, registry and deletion provenance');
update private.deleted_content_retention_settings
 set activation_ready=false,capture_enabled=false,media_staging_enabled=false,media_expiry_enabled=false,text_expiry_enabled=false;
select is(public.claim_deleted_content_media_expiry(md5('terminal-stage-1')::uuid)->>'status','disabled',
 'stopped worker cannot start cleanup of retained source');
select ok(exists(select 1 from public.legal_holds where target_id=md5('terminal-parent-1')::uuid::text and status='active'),
 'worker stop preserves the actual parent hold');
select public.record_deleted_content_worker_heartbeat();
select lives_ok($$update private.deleted_content_retention_settings
 set activation_ready=true,capture_enabled=true,media_staging_enabled=true,media_expiry_enabled=true,text_expiry_enabled=true$$,
 'qualified restart accepts exact retained soft-source provenance despite revoked delivery reservation');
select is(public.claim_deleted_content_media_expiry(md5('terminal-stage-1')::uuid)->>'status','held',
 'restart preserves hold protection and does not renew or bypass retention');
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
-- The same original reservation is still absent after terminal metadata
-- cleanup. Permanent provenance must continue to govern provider retries.
select ok(private.deleted_content_soft_media_coverage(md5('terminal-deletion-1')::uuid),
 'absent-source cleanup remains covered after mutable reservation removal');
select is(public.claim_deleted_content_media_expiry(md5('terminal-stage-1')::uuid)->>'claimId',
 (select id::text from private.deleted_content_media_expiry_claims where stage_id=md5('terminal-stage-1')::uuid),
 'mutable provenance cleanup does not replace or strand the permanent object claim');

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
select set_config('test.terminal.unsupported_soft_count',
 public.deleted_content_expiry_readiness()->>'unsupportedSoftMediaArchiveCount',true);
update public.profile_posts set deleted_at=null where id=md5('terminal-parent-3')::uuid;
select is(public.claim_deleted_content_media_expiry(md5('terminal-stage-3')::uuid)->>'status','source_live_or_changed',
 'restoring parent prevents attachment cleanup');
select ok(exists(select 1 from public.social_attachments where id=md5('terminal-attachment-3')::uuid),
 'restored parent retains attachment metadata');
select is((public.deleted_content_expiry_readiness()->>'unsupportedSoftMediaArchiveCount')::bigint,
 current_setting('test.terminal.unsupported_soft_count')::bigint+1,
 'restored parent is reported as an unsupported soft-media cleanup instead of ready');

select set_config('test.terminal.unsupported_soft_count',
 public.deleted_content_expiry_readiness()->>'unsupportedSoftMediaArchiveCount',true);
select pg_temp.terminal_attachment(4,false,false);
select is(public.claim_deleted_content_media_expiry(md5('terminal-stage-4')::uuid)->>'status','parent_deletion_unproven',
 'deleted_at or absent parent alone cannot substitute for captured parent deletion');
select ok(exists(select 1 from public.social_attachments where id=md5('terminal-attachment-4')::uuid),
 'unproven parent does not authorize attachment removal');
select is((public.deleted_content_expiry_readiness()->>'unsupportedSoftMediaArchiveCount')::bigint,
 current_setting('test.terminal.unsupported_soft_count')::bigint+1,
 'missing parent deletion proof is included in the readiness blocker count');

select pg_temp.terminal_attachment(5);
select set_config('test.terminal.unsupported_soft_count',
 public.deleted_content_expiry_readiness()->>'unsupportedSoftMediaArchiveCount',true);
update public.profile_posts set created_at=clock_timestamp() where id=md5('terminal-parent-5')::uuid;
select is(public.claim_deleted_content_media_expiry(md5('terminal-stage-5')::uuid)->>'status','parent_deletion_unproven',
 'new parent incarnation cannot inherit old deletion authority');
select ok(exists(select 1 from public.social_attachments where id=md5('terminal-attachment-5')::uuid),
 'new incarnation preserves current attachment source');
select is((public.deleted_content_expiry_readiness()->>'unsupportedSoftMediaArchiveCount')::bigint,
 current_setting('test.terminal.unsupported_soft_count')::bigint+1,
 'reused parent incarnation is included in the readiness blocker count');

select set_config('test.terminal.unsupported_soft_count',
 public.deleted_content_expiry_readiness()->>'unsupportedSoftMediaArchiveCount',true);
insert into private.deleted_content_records(id,target_type,target_id,author,deletion_kind,deleted_at,expires_at,media_disposition)
 values(md5('terminal-soft-empty')::uuid,'social_attachment',md5('terminal-soft-empty-source')::uuid::text,
 'd3400000-0000-4000-8000-000000000001','soft',now()-interval '31 days',now()-interval '1 day','metadata_only');
select is((public.deleted_content_expiry_readiness()->>'unsupportedSoftMediaArchiveCount')::bigint,
 current_setting('test.terminal.unsupported_soft_count')::bigint+1,
 'soft metadata-only archive is honestly blocked until its source cleanup has proof');
select ok((public.deleted_content_expiry_readiness()->'blockers') ? 'unsupported_soft_media_archive_cleanup',
 'unsupported soft-media archives prevent activation readiness');

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
