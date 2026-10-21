-- Forward-only legacy R2 original provenance adapter. No enrollment, rollout
-- qualification, settings change, schedule, provider read/write or deletion.
-- Retained legacy inspection stays unavailable. Unsupported providers and
-- uncovered secondary/brand media remain activation blockers.
begin;

-- BEGIN LEGACY PROVENANCE
create table private.deleted_media_legacy_provenance (
 id uuid primary key default gen_random_uuid(),
 target_type text not null check(target_type in ('creator_video','social_attachment')),
 target_id uuid not null, author uuid not null, source_created_at text not null,
 parent_type text, parent_id uuid,
 provider text not null check(provider='cloudflare_r2'),
 bucket text not null check(bucket='chillywood-media-origin'),
 object_key text not null check(length(object_key) between 1 and 1024),
 source_binding jsonb not null,
 migration_audit_id bigint not null, migration_audit_binding jsonb not null,
 ownership_evidence_sha256 text not null check(ownership_evidence_sha256 ~ '^[a-f0-9]{64}$'),
 origin_sha256 text not null check(origin_sha256 ~ '^[a-f0-9]{64}$'),
 origin_size_bytes bigint not null check(origin_size_bytes>0),
 scan_evidence_sha256 text not null check(scan_evidence_sha256 ~ '^[a-f0-9]{64}$'),
 writer_drain_evidence_sha256 text not null check(writer_drain_evidence_sha256 ~ '^[a-f0-9]{64}$'),
 reviewed_by text not null check(length(btrim(reviewed_by)) between 1 and 256),
 enrolled_at timestamptz not null default clock_timestamp(),
 unique(provider,bucket,object_key),
 unique(target_type,target_id,source_created_at),
 check((target_type='creator_video' and parent_type is null and parent_id is null)
   or (target_type='social_attachment' and parent_type in ('profile_post','profile_post_comment','creator_video_comment','chat_message','watch_party_room_message','room_message') and parent_id is not null))
);
alter table private.deleted_media_legacy_provenance enable row level security;
alter table private.deleted_media_legacy_provenance force row level security;
revoke all on private.deleted_media_legacy_provenance from public,anon,authenticated,service_role;
-- No source/account foreign key: deleting either must not erase evidence.
create function private.preserve_deleted_media_legacy_provenance() returns trigger
language plpgsql set search_path='' set timezone='UTC' as $$ begin
 raise exception 'legacy_provenance_permanent' using errcode='55000';
end $$;
create trigger preserve_deleted_media_legacy_provenance before update or delete
 on private.deleted_media_legacy_provenance for each row
 execute function private.preserve_deleted_media_legacy_provenance();
create trigger preserve_deleted_media_legacy_provenance_truncate before truncate
 on private.deleted_media_legacy_provenance for each statement
 execute function private.preserve_deleted_media_legacy_provenance();

-- Binding includes parent and every source locator, but never title/body or
-- other private content. A change of locator or incarnation invalidates it.
create function private.deleted_media_legacy_source_binding(p_type text,p_source jsonb) returns jsonb
language sql immutable set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('type',p_type,'id',p_source->>'id',
 'author',coalesce(p_source->>'owner_id',p_source->>'owner_user_id'),
 'createdAt',case when p_type='social_attachment' and nullif(p_source->>'created_at','') is not null
   then (to_jsonb((p_source->>'created_at')::timestamptz at time zone 'UTC') #>> '{}')||'+00:00'
   else p_source->>'created_at' end,'parentType',p_source->>'surface_type',
 'parentId',p_source->>'surface_id','provider',p_source->>'storage_provider',
 'bucket',p_source->>'storage_bucket','objectKey',coalesce(nullif(p_source->>'storage_object_key',''),p_source->>'storage_path'),
 'storagePath',p_source->>'storage_path','thumbnailPath',p_source->>'thumb_storage_path',
 'thumbnailUrl',p_source->>'thumb_url','playbackUrl',p_source->>'playback_url')
$$;

-- Read current binding under a row lock. This is deliberately not an authority
-- fallback when a source is absent. The future retirement snapshot owns that.
create function private.read_deleted_media_legacy_source(p_type text,p_target uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare s jsonb;
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'legacy_provenance_requires_read_committed' using errcode='25000'; end if;
 if p_type='creator_video' then
  select to_jsonb(v) into s from public.videos v where id=p_target for update;
 elsif p_type='social_attachment' then
  select to_jsonb(a) into s from public.social_attachments a where id=p_target for update;
 else raise exception 'legacy_provenance_unsupported_target'; end if;
 if s is null or nullif(s->>'created_at','') is null or nullif(s->>'deleted_at','') is not null then
  raise exception 'legacy_provenance_live_source_required'; end if;
 return private.deleted_media_legacy_source_binding(p_type,s);
end $$;

create function private.enroll_deleted_media_legacy_provenance(
 p_type text,p_target uuid,p_expected_binding jsonb,p_evidence jsonb
) returns uuid language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare b jsonb; k text; result uuid; existing private.deleted_media_legacy_provenance; audit_id bigint; audit_binding jsonb; audit_count bigint;
begin
 b:=private.read_deleted_media_legacy_source(p_type,p_target);
 if b is distinct from p_expected_binding then raise exception 'legacy_provenance_source_changed'; end if;
 k:=b->>'objectKey';
 if b->>'provider' is distinct from 'cloudflare_r2' or b->>'bucket' is distinct from 'chillywood-media-origin'
  or k is null or k='' or length(k)>1024 or left(k,1)='/' or position('..' in k)>0
  or k !~ '^[A-Za-z0-9_./-]+$' or k like 'backups/%' or k like 'playback/%' then raise exception 'legacy_provenance_locator_unsupported'; end if;
 if (nullif(b->>'storagePath','') is not null and b->>'storagePath'<>k)
  or nullif(b->>'thumbnailPath','') is not null or nullif(b->>'thumbnailUrl','') is not null
  or nullif(b->>'playbackUrl','') is not null then raise exception 'legacy_provenance_secondary_media_uncovered'; end if;
 -- Anchor reviewed assertions to one actual, still-updated migration receipt.
 -- Snapshot only identity/locator evidence, never body/title or credentials.
 select count(*) into audit_count from private.media_object_storage_migration_audit a
 where a.table_name=case p_type when 'creator_video' then 'videos' else 'social_attachments' end
  and a.row_id=p_target::text and a.status='updated'
  and a.new_storage_provider=b->>'provider' and a.new_storage_bucket=b->>'bucket' and a.new_storage_object_key=k
  and private.deleted_media_legacy_source_binding(p_type,a.row_after)=b
  and a.row_before->>'id'=b->>'id' and private.deleted_media_legacy_source_binding(p_type,a.row_before)->>'createdAt'=b->>'createdAt'
  and coalesce(a.row_before->>'owner_id',a.row_before->>'owner_user_id')=b->>'author'
  and (a.row_before->>'surface_type',a.row_before->>'surface_id') is not distinct from (b->>'parentType',b->>'parentId');
 if audit_count<>1 then raise exception 'legacy_provenance_unique_migration_receipt_required'; end if;
 select a.id,jsonb_build_object('auditId',a.id,'binding',b,'copiedVerifiedAt',a.copied_verified_at)
  into strict audit_id,audit_binding from private.media_object_storage_migration_audit a
 where a.table_name=case p_type when 'creator_video' then 'videos' else 'social_attachments' end
  and a.row_id=p_target::text and a.status='updated'
  and a.new_storage_provider=b->>'provider' and a.new_storage_bucket=b->>'bucket' and a.new_storage_object_key=k
  and private.deleted_media_legacy_source_binding(p_type,a.row_after)=b
  and a.row_before->>'id'=b->>'id' and private.deleted_media_legacy_source_binding(p_type,a.row_before)->>'createdAt'=b->>'createdAt'
  and coalesce(a.row_before->>'owner_id',a.row_before->>'owner_user_id')=b->>'author'
  and (a.row_before->>'surface_type',a.row_before->>'surface_id') is not distinct from (b->>'parentType',b->>'parentId')
 for share nowait;
 if audit_id is null then raise exception 'legacy_provenance_unique_migration_receipt_required'; end if;
 -- Caller must not replace a real upload reservation with an asserted ledger.
 if exists(select 1 from public.media_upload_reservations r where r.storage_provider=b->>'provider'
  and r.storage_bucket=b->>'bucket' and r.storage_object_key=k) then
  raise exception 'legacy_provenance_reservation_conflict'; end if;
 if exists(select 1 from private.deleted_media_key_retirements r where r.object_key=k) then
  raise exception 'legacy_provenance_retirement_conflict'; end if;
 if exists(select 1 from public.legal_holds h where h.status='active'
  and private.deleted_content_hold_matches(h.target_type,h.target_id,p_type,p_target::text,
   b->>'author',b->>'parentType',b->>'parentId')) then raise exception 'legacy_provenance_legal_hold'; end if;
 -- Null-safe exact evidence binding. Digests are not signatures, clean-scan
 -- authority or a substitute for the separately approved provider review.
 if p_evidence->'binding' is distinct from b or p_evidence->>'scanResult' is distinct from 'clean'
  or p_evidence->>'scanOriginSha256' is distinct from p_evidence->>'originSha256'
  or p_evidence->>'scanOriginSha256' is null then raise exception 'legacy_provenance_evidence_mismatch'; end if;
 -- Exact retries reuse evidence; they never mutate or refresh it. Concurrent
 -- first insertions may raise a uniqueness conflict, then retry in a fresh txn.
 select * into existing from private.deleted_media_legacy_provenance
  where provider=b->>'provider' and bucket=b->>'bucket' and object_key=k;
 if existing.id is not null then
  if existing.source_binding=b and existing.migration_audit_id=audit_id and existing.migration_audit_binding=audit_binding
   and existing.ownership_evidence_sha256=p_evidence->>'ownershipEvidenceSha256'
   and existing.origin_sha256=p_evidence->>'originSha256'
   and existing.origin_size_bytes=(p_evidence->>'originSizeBytes')::bigint
   and existing.scan_evidence_sha256=p_evidence->>'scanEvidenceSha256'
   and existing.writer_drain_evidence_sha256=p_evidence->>'writerDrainEvidenceSha256'
   and existing.reviewed_by=p_evidence->>'reviewedBy' then return existing.id; end if;
  raise exception 'legacy_provenance_enrollment_conflict';
 end if;
 insert into private.deleted_media_legacy_provenance(target_type,target_id,author,source_created_at,parent_type,parent_id,
  provider,bucket,object_key,source_binding,migration_audit_id,migration_audit_binding,ownership_evidence_sha256,origin_sha256,origin_size_bytes,
  scan_evidence_sha256,writer_drain_evidence_sha256,reviewed_by)
 values(p_type,p_target,(b->>'author')::uuid,b->>'createdAt',b->>'parentType',(b->>'parentId')::uuid,
  b->>'provider',b->>'bucket',k,b,audit_id,audit_binding,p_evidence->>'ownershipEvidenceSha256',p_evidence->>'originSha256',
  (p_evidence->>'originSizeBytes')::bigint,p_evidence->>'scanEvidenceSha256',p_evidence->>'writerDrainEvidenceSha256',
  p_evidence->>'reviewedBy') returning id into result;
 return result;
end $$;

-- Negative-only evidence diagnostic; the finalized retirement owns claim authority. Ledger existence alone never
-- authorizes a stage or provider operation, including after source deletion.
create function private.validate_deleted_media_legacy_provenance(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare r private.deleted_media_legacy_provenance; b jsonb;
begin
 select * into r from private.deleted_media_legacy_provenance where id=p_id;
 if r.id is null then return jsonb_build_object('supported',false,'reason','legacy_provenance_missing'); end if;
 b:=private.read_deleted_media_legacy_source(r.target_type,r.target_id);
 if b is distinct from r.source_binding then
  return jsonb_build_object('supported',false,'reason','legacy_provenance_source_changed'); end if;
 return jsonb_build_object('supported',false,'reason','claim_requires_finalized_retirement',
  'bindingMatches',true,'physicalDeletionAllowed',false);
end $$;
revoke all on function private.preserve_deleted_media_legacy_provenance(),
 private.deleted_media_legacy_source_binding(text,jsonb),private.read_deleted_media_legacy_source(text,uuid),
 private.enroll_deleted_media_legacy_provenance(text,uuid,jsonb,jsonb),private.validate_deleted_media_legacy_provenance(uuid)
 from public,anon,authenticated,service_role;

-- BEGIN LEGACY RUNTIME
alter table private.deleted_content_media_stages alter column reservation_id drop not null,
 add column legacy_provenance_id uuid,
 add constraint deleted_content_stage_provenance_tag check((reservation_id is not null) <> (legacy_provenance_id is not null));
alter table private.deleted_media_key_retirements alter column reservation_id drop not null,
 alter column verified_at drop not null, alter column attached_at drop not null,
 add column legacy_provenance_id uuid,
 add constraint deleted_media_retirement_provenance_tag check(
  (reservation_id is not null and legacy_provenance_id is null and verified_at is not null and attached_at is not null)
  or (reservation_id is null and legacy_provenance_id is not null and verified_at is null and attached_at is null));

create function private.deleted_media_legacy_source_supported(p_type text,p_source jsonb) returns boolean
language plpgsql volatile security definer set search_path='' set timezone='UTC' as $$
declare l private.deleted_media_legacy_provenance; current_source jsonb;
begin
 select * into l from private.deleted_media_legacy_provenance
  where target_type=p_type and target_id::text=p_source->>'id'
   and source_binding=private.deleted_media_legacy_source_binding(p_type,p_source);
 if l.id is null or not private.deleted_media_reference_coverage_ready() then return false; end if;
 if p_type='creator_video' then select to_jsonb(v) into current_source from public.videos v where id=l.target_id;
 else select to_jsonb(v) into current_source from public.social_attachments v where id=l.target_id; end if;
 if current_source is null or private.deleted_media_legacy_source_binding(p_type,current_source) is distinct from l.source_binding then return false; end if;
 -- Enrollment is not a substitute for the existing exact migration provenance.
 -- A staged retirement preserves identity after atomic delivery revocation.
 return (exists(select 1 from private.media_object_storage_migration_audit a where a.id=l.migration_audit_id and a.status='updated'
    and private.deleted_media_legacy_source_binding(p_type,a.row_after)=l.source_binding
    and jsonb_build_object('auditId',a.id,'binding',l.source_binding,'copiedVerifiedAt',a.copied_verified_at)=l.migration_audit_binding)
    and public.has_verified_legacy_media_object_provenance(case p_type when 'creator_video' then 'videos' else 'social_attachments' end,
   l.target_id::text,l.provider,l.bucket,l.object_key))
  or exists(select 1 from private.deleted_media_key_retirements r
    join private.deleted_media_legacy_delivery_revocations receipt on receipt.stage_id=r.stage_id
     and receipt.legacy_provenance_id=l.id and receipt.source_binding=l.source_binding
     and receipt.provider=l.provider and receipt.bucket=l.bucket and receipt.object_key=l.object_key
    where r.legacy_provenance_id=l.id and r.status='staged' and r.reservation_id is null
     and r.target_type=l.target_type and r.target_id=l.target_id::text and r.author=l.author::text
     and r.provider=l.provider and r.bucket=l.bucket and r.object_key=l.object_key and r.source_created_at=l.source_created_at);
end $$;
revoke all on function private.deleted_media_legacy_source_supported(text,jsonb) from public,anon,authenticated,service_role;

create or replace function private.deleted_content_original_rendition_alias(p_alias jsonb,p_source jsonb) returns boolean
language sql volatile security definer set search_path='' set timezone='UTC' as $$
 select coalesce((private.deleted_media_legacy_source_supported('creator_video',p_source)
   and p_alias->>'quality_label'='original'
   and p_alias->>'video_id'=p_source->>'id' and p_alias->>'owner_id'=p_source->>'owner_id'
   and p_alias->>'storage_bucket'=p_source->>'storage_bucket'
   and p_alias->>'storage_path'=coalesce(nullif(p_source->>'storage_object_key',''),p_source->>'storage_path')
   and not exists(select 1 from jsonb_each(private.deleted_media_locator_document(p_alias,'public.video_renditions'::regclass)) x(k,v)
     where k<>'storage_path' and v not in ('null'::jsonb,'""'::jsonb))) or coalesce(
   p_alias->>'quality_label'='original'
   and p_source->>'storage_provider'='cloudflare_r2'
   and p_source->>'storage_bucket'='chillywood-media-origin'
   and p_alias->>'video_id'=p_source->>'id' and p_alias->>'owner_id'=p_source->>'owner_id'
   and p_alias->>'storage_bucket'=p_source->>'storage_bucket'
   and p_alias->>'storage_path'=coalesce(nullif(p_source->>'storage_object_key',''),p_source->>'storage_path')
   and left(p_alias->>'storage_path',length((p_source->>'owner_id')||'/'||(p_source->>'id')||'/source.'))
     =(p_source->>'owner_id')||'/'||(p_source->>'id')||'/source.'
   and substr(p_alias->>'storage_path',length((p_source->>'owner_id')||'/'||(p_source->>'id')||'/source.')+1) ~ '^[a-z0-9]{1,10}$'
   and nullif(p_source->>'created_at','') is not null
   and not exists(select 1 from jsonb_each(private.deleted_media_locator_document(p_alias,'public.video_renditions'::regclass)) x(k,v)
     where k<>'storage_path' and v not in ('null'::jsonb,'""'::jsonb))
   and exists(select 1 from public.media_upload_reservations r
     where r.surface_type='creator_video' and r.owner_user_id::text=p_source->>'owner_id'
       and r.attached_record_id=p_source->>'id' and r.storage_provider='cloudflare_r2'
       and r.storage_bucket='chillywood-media-origin' and r.storage_object_key=p_alias->>'storage_path'
       and r.verified_at is not null and r.attached_at is not null
       and (r.status='verified' or (r.status='deleted' and exists(
         select 1 from private.deleted_media_key_retirements registry
         where registry.reservation_id=r.id and registry.status='staged'
           and registry.target_type='creator_video' and registry.target_id=p_source->>'id'
           and registry.author=p_source->>'owner_id' and registry.provider=r.storage_provider
           and registry.bucket=r.storage_bucket and registry.object_key=r.storage_object_key
           and registry.verified_at=r.verified_at and registry.attached_at=r.attached_at
           and registry.source_created_at is not distinct from p_source->>'created_at'
       )))),false),false)
$$;

create or replace function private.deleted_content_source_coverage(p_type text,p_source jsonb) returns text
language plpgsql volatile security definer set search_path='' set timezone='UTC' as $$
declare k text:=coalesce(nullif(p_source->>'storage_object_key',''),p_source->>'storage_path');
 a text:=coalesce(p_source->>'owner_id',p_source->>'owner_user_id');
 target text:=p_source->>'id'; prefix text;
begin
 if nullif(p_source->>'created_at','') is null then return 'unproven_source_incarnation'; end if;
 if p_type='creator_video' and (
   exists(select 1 from public.video_renditions r where r.video_id::text=target
     and not private.deleted_content_original_rendition_alias(to_jsonb(r),p_source))
   or exists(select 1 from public.media_renditions r where r.video_id::text=target
     or (r.source_type='creator_video' and r.source_id=target))
   or exists(select 1 from public.media_transcode_jobs j where j.source_type='creator_video' and j.source_id=target)
 ) then return 'secondary_media_uncovered'; end if;
 -- Empty drafts have no object to retain. Once any locator is assigned, the
 -- whole canonical original contract is required; remote URLs are not ignored.
 if not exists(select 1 from unnest(array['storage_object_key','storage_path','thumb_storage_path','thumb_url','playback_url']) c
   where nullif(btrim(p_source->>c),'') is not null) then return 'metadata_only'; end if;
 if p_source->>'storage_provider' is distinct from 'cloudflare_r2' then return 'unsupported_provider'; end if;
 if p_source->>'storage_bucket' is distinct from 'chillywood-media-origin' then return 'unsupported_bucket'; end if;
 -- Deliberately distinct from eligible_r2_original: the admission trigger must
 -- never treat an already-retained object as permission to create a new source.
 if p_type='social_attachment' and exists(
   select 1 from private.deleted_content_records d join private.deleted_media_key_retirements registry on registry.deletion_id=d.id
   where d.target_type=p_type and d.target_id=target and d.author=a
     and d.source_created_at=(p_source->>'created_at')::timestamptz
     and d.parent_type=p_source->>'surface_type' and d.parent_id=p_source->>'surface_id'
     and registry.provider=p_source->>'storage_provider' and registry.bucket=p_source->>'storage_bucket'
     and registry.object_key=k and registry.source_created_at=private.deleted_media_legacy_source_binding(p_type,p_source)->>'createdAt'
     and private.deleted_content_soft_media_coverage(d.id)
 ) then return 'retained_r2_original'; end if;
 if private.deleted_media_legacy_source_supported(p_type,p_source) then
   if (nullif(p_source->>'storage_path','') is not null and p_source->>'storage_path'<>k)
     or exists(select 1 from unnest(array['thumb_storage_path','thumb_url','playback_url']) c
       where nullif(btrim(p_source->>c),'') is not null) then return 'secondary_media_uncovered'; end if;
   return 'eligible_r2_original';
 end if;
 if a is null or a !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or target is null or target !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or k is null then return 'unproven_original_key'; end if;
 if p_type='creator_video' then prefix:=a||'/'||target||'/source.';
 elsif p_type='social_attachment' then
   if coalesce(p_source->>'surface_type','') !~ '^[a-z_]+$'
     or coalesce(p_source->>'surface_id','') !~ '^[0-9a-f-]{36}$' then return 'unproven_original_key'; end if;
   prefix:=a||'/'||(p_source->>'surface_type')||'/'||(p_source->>'surface_id')||'/'||target||'.';
 else return 'unsupported_target'; end if;
 if left(k,length(prefix))<>prefix or substr(k,length(prefix)+1)!~'^[a-z0-9]{1,10}$' then
   return 'unproven_original_key';
 end if;
 if nullif(p_source->>'storage_path','') is not null and p_source->>'storage_path'<>k then
   return 'secondary_media_uncovered';
 end if;
 if exists(select 1 from unnest(array['thumb_storage_path','thumb_url','playback_url']) c
   where nullif(btrim(p_source->>c),'') is not null) then return 'secondary_media_uncovered'; end if;
 if not exists(select 1 from public.media_upload_reservations r
   where r.surface_type=p_type and r.owner_user_id::text=a and r.attached_record_id=target
     and r.storage_provider='cloudflare_r2' and r.storage_bucket='chillywood-media-origin'
     and r.storage_object_key=k and r.verified_at is not null and r.attached_at is not null
     and (r.status='verified' or (r.status='deleted' and exists(
       select 1 from private.deleted_media_key_retirements registry
       where registry.reservation_id=r.id and registry.status='staged'
         and registry.target_type=p_type and registry.target_id=target and registry.author=a
         and registry.provider=r.storage_provider and registry.bucket=r.storage_bucket and registry.object_key=k
         and registry.verified_at=r.verified_at and registry.attached_at=r.attached_at
         and registry.source_created_at is not distinct from p_source->>'created_at'
     )))) then
   return 'unverified_original_binding';
 end if;
 return 'eligible_r2_original';
end $$;

create or replace function private.guard_deleted_content_source_coverage() returns trigger
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare reason text;
begin
 perform private.deleted_media_reference_fence_armed();
 if tg_op='INSERT' and exists(select 1 from private.deleted_media_legacy_provenance l
   where l.target_id::text=to_jsonb(new)->>'id'
     and l.target_type=case tg_table_name when 'videos' then 'creator_video' else 'social_attachment' end) then
   raise exception 'legacy_provenance_cannot_admit_new_source' using errcode='55000'; end if;
 if tg_op='UPDATE' and exists(select 1 from private.deleted_media_legacy_provenance l
   where l.target_type=case tg_table_name when 'videos' then 'creator_video' else 'social_attachment' end
    and l.object_key=coalesce(nullif(to_jsonb(new)->>'storage_object_key',''),to_jsonb(new)->>'storage_path')
    and (l.source_binding is distinct from private.deleted_media_legacy_source_binding(l.target_type,to_jsonb(new))
      or l.source_binding is distinct from private.deleted_media_legacy_source_binding(l.target_type,to_jsonb(old)))) then
   raise exception 'legacy_provenance_binding_immutable' using errcode='55000'; end if;

 if not exists(select 1 from private.deleted_content_retention_settings where capture_enabled) then return new; end if;
 if tg_op='UPDATE' and
   private.deleted_media_locator_document(to_jsonb(new),tg_relid)=private.deleted_media_locator_document(to_jsonb(old),tg_relid)
   and private.deleted_media_reference_identity(to_jsonb(new))=private.deleted_media_reference_identity(to_jsonb(old))
   and (to_jsonb(new)->>'storage_provider') is not distinct from (to_jsonb(old)->>'storage_provider')
   and (to_jsonb(new)->>'storage_bucket') is not distinct from (to_jsonb(old)->>'storage_bucket') then
   return new;
 end if;
 reason:=private.deleted_content_source_coverage(case tg_table_name when 'videos' then 'creator_video' else 'social_attachment' end,to_jsonb(new));
 if reason not in ('eligible_r2_original','metadata_only') then
   raise exception 'retention_source_coverage_required: %',reason using errcode='55000';
 end if;
 return new;
end $$;

create or replace function private.stage_deleted_content_media_internal(
  p_type text,p_target text,p_provider text,p_bucket text,p_object_key text,p_actor uuid default null
) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v jsonb; r public.media_upload_reservations%rowtype; s private.deleted_content_media_stages%rowtype; registered boolean:=false; stage_id uuid; legacy_id uuid;
begin
  if not exists(select 1 from private.deleted_content_retention_settings where media_staging_enabled) then
    return jsonb_build_object('decision','delete_now','retention','disabled');
  end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'retention_requires_read_committed' using errcode='25000';
  end if;
  if p_provider<>'cloudflare_r2' or p_bucket<>'chillywood-media-origin'
    or to_regclass('private.deleted_media_key_retirements') is null then
    return jsonb_build_object('decision','delete_now','retention','unsupported_provider');
  end if;
  -- Lock ordering: source row, then stage. DELETE's trigger uses that same order.
  if p_type='creator_video' then
    select to_jsonb(x) into v from public.videos x where x.id::text=p_target for update;
  elsif p_type='social_attachment' then
    select to_jsonb(x) into v from public.social_attachments x where x.id::text=p_target for update;
  else raise exception 'deleted_content_unsupported_target'; end if;
  select * into s from private.deleted_content_media_stages where provider=p_provider and bucket=p_bucket and object_key=p_object_key for update;
  if s.id is not null then
    if s.target_type<>p_type or s.target_id<>p_target then raise exception 'deleted_content_binding_conflict'; end if;
    execute 'select exists(select 1 from private.deleted_media_key_retirements where stage_id=$1)' into registered using s.id;
    if not registered then return jsonb_build_object('decision','delete_now','retention','unsupported_key_class'); end if;
    -- Expired or abandoned stages never authorize physical destruction. Their
    -- reconciliation remains blocked until the hold-safe worker is implemented.
    return jsonb_build_object('decision','defer','retention',case when s.deletion_id is null then 'staged' else 'deleted' end);
  end if;
  if v is null or coalesce(v->>'storage_provider','')<>p_provider
    or coalesce(v->>'storage_bucket','')<>p_bucket
    or p_object_key not in (coalesce(nullif(v->>'storage_object_key',''),v->>'storage_path',''),coalesce(v->>'thumb_storage_path','')) then
    return jsonb_build_object('decision','delete_now','retention','detached_or_unattached');
  end if;
  select * into r from public.media_upload_reservations
    where surface_type=p_type and storage_provider=p_provider and storage_bucket=p_bucket
      and storage_object_key=p_object_key and attached_record_id=p_target
      and owner_user_id::text=coalesce(v->>'owner_id',v->>'owner_user_id')
      and status='verified' and verified_at is not null and attached_at is not null
    for update;
  if r.id is null then
    if not private.deleted_media_legacy_source_supported(p_type,v) then
      return jsonb_build_object('decision','delete_now','retention','unverified_binding'); end if;
    select id into legacy_id from private.deleted_media_legacy_provenance
      where target_type=p_type and target_id::text=p_target
       and source_binding=private.deleted_media_legacy_source_binding(p_type,v);
    if legacy_id is null then raise exception 'legacy_provenance_missing'; end if;
  end if;
  insert into private.deleted_content_media_stages(target_type,target_id,author,provider,bucket,object_key,reservation_id,legacy_provenance_id)
    values(p_type,p_target,coalesce(v->>'owner_id',v->>'owner_user_id'),p_provider,p_bucket,p_object_key,r.id,legacy_id) returning id into stage_id;
  execute 'select exists(select 1 from private.deleted_media_key_retirements where stage_id=$1)' into registered using stage_id;
  if not registered then
    delete from private.deleted_content_media_stages where id=stage_id;
    return jsonb_build_object('decision','delete_now','retention','unsupported_key_class');
  end if;
  insert into private.deleted_content_retention_events(operation,target_type,target_id,actor)
    values('stage',p_type,p_target,p_actor::text);
  return jsonb_build_object('decision','defer','retention','staged');
end $$;

create or replace function private.register_deleted_media_retirement() returns trigger
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare r public.media_upload_reservations%rowtype; v jsonb; d private.deleted_content_records%rowtype;
 k text; prefix text; proof jsonb; staged_proof jsonb; l private.deleted_media_legacy_provenance;
begin
 if new.provider<>'cloudflare_r2' or new.bucket<>'chillywood-media-origin' then return new; end if;
 if not private.deleted_media_reference_fence_armed() then raise exception 'retirement_fence_not_armed'; end if;
 perform pg_catalog.pg_advisory_xact_lock(176214,30);
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'retirement_read_committed_required' using errcode='25000'; end if;
 if tg_op='INSERT' then
   if new.target_type='creator_video' then select to_jsonb(t) into v from public.videos t where id::text=new.target_id;
   elsif new.target_type='social_attachment' then select to_jsonb(t) into v from public.social_attachments t where id::text=new.target_id;
   else return new; end if;
   k:=coalesce(nullif(v->>'storage_object_key',''),v->>'storage_path');
   -- Exact original, never thumbnail, migration source alias, URL or prefix guess.
   if k is distinct from new.object_key or v->>'storage_provider'<>'cloudflare_r2'
      or v->>'storage_bucket'<>'chillywood-media-origin'
      or new.author !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or new.target_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(v->>'owner_id',v->>'owner_user_id') is distinct from new.author then return new; end if;
   if new.legacy_provenance_id is null then
   if new.target_type='creator_video' then
     prefix:=new.author||'/'||new.target_id||'/source.';
     if left(k,length(prefix))<>prefix or substr(k,length(prefix)+1)!~'^[a-z0-9]{1,10}$' then return new; end if;
   else
     if coalesce(v->>'surface_type','') !~ '^[a-z_]+$' or coalesce(v->>'surface_id','') !~ '^[0-9a-f-]{36}$' then return new; end if;
     prefix:=new.author||'/'||(v->>'surface_type')||'/'||(v->>'surface_id')||'/'||new.target_id||'.';
     if left(k,length(prefix))<>prefix or substr(k,length(prefix)+1)!~'^[a-z0-9]{1,10}$' then return new; end if;
   end if;
   end if;
   if new.legacy_provenance_id is not null then
     select * into l from private.deleted_media_legacy_provenance where id=new.legacy_provenance_id;
     if new.reservation_id is not null or l.id is null
       or l.source_binding is distinct from private.deleted_media_legacy_source_binding(new.target_type,v)
       or not private.deleted_media_legacy_source_supported(new.target_type,v) then
       raise exception 'legacy_provenance_stage_mismatch'; end if;
     insert into private.deleted_media_key_retirements(stage_id,provider,bucket,object_key,target_type,target_id,author,
       legacy_provenance_id,source_created_at)
      values(new.id,new.provider,new.bucket,k,new.target_type,new.target_id,new.author,l.id,l.source_created_at);
   else
   select * into r from public.media_upload_reservations where id=new.reservation_id
    and storage_provider=new.provider and storage_bucket=new.bucket and storage_object_key=k
    and owner_user_id::text=new.author and surface_type=new.target_type and attached_record_id=new.target_id
    and status='verified' and verified_at is not null and attached_at is not null for update;
   if r.id is null then return new; end if;
   -- Capture only while the exact reservation is still verified. Gateway
   -- revocation happens after staging; its intentional transition is validated
   -- at finalization rather than relaxing ordinary inspection authority.
   if to_regprocedure('private.content_inspection_media_binding(text,uuid)') is not null then
     execute 'select private.content_inspection_media_binding($1,$2)' into staged_proof using new.target_type,new.target_id::uuid;
     if staged_proof->>'provider' is distinct from new.provider or staged_proof->>'bucket' is distinct from new.bucket
       or staged_proof->>'objectKey' is distinct from k or staged_proof->>'reservationId' is distinct from r.id::text then staged_proof:=null; end if;
   end if;
   insert into private.deleted_media_key_retirements(stage_id,provider,bucket,object_key,target_type,target_id,author,
      reservation_id,verified_at,attached_at,source_created_at,staged_inspection_proof)
   values(new.id,new.provider,new.bucket,k,new.target_type,new.target_id,new.author,r.id,r.verified_at,r.attached_at,v->>'created_at',staged_proof);
   end if;
 elsif new.deletion_id is not null and old.deletion_id is null then
   -- Capture runs BEFORE source deletion. A staged key that was replaced in
   -- between is edit history, not this content's deleted original. Do not adopt
   -- it into retention merely because the target ID eventually gets deleted.
   if new.target_type='creator_video' then select to_jsonb(t) into v from public.videos t where id::text=new.target_id;
   else select to_jsonb(t) into v from public.social_attachments t where id::text=new.target_id; end if;
   if v is null or coalesce(nullif(v->>'storage_object_key',''),v->>'storage_path') is distinct from new.object_key
      or v->>'storage_provider' is distinct from new.provider or v->>'storage_bucket' is distinct from new.bucket
      or coalesce(v->>'owner_id',v->>'owner_user_id') is distinct from new.author
      or not exists(select 1 from private.deleted_media_key_retirements registry where registry.stage_id=new.id
         and registry.source_created_at is not distinct from v->>'created_at') then return new; end if;
   select * into d from private.deleted_content_records where id=new.deletion_id
    and target_type=new.target_type and target_id=new.target_id and author=new.author;
   if d.id is null then raise exception 'retirement_deletion_binding_mismatch'; end if;
   -- The later inspection contract owns full fresh source/scan/parent proof
   -- validation. Missing validator/proof means unavailable, never fabrication.
   select registry.staged_inspection_proof into staged_proof from private.deleted_media_key_retirements registry where registry.stage_id=new.id;
   if new.legacy_provenance_id is null and d.deletion_kind='hard' and staged_proof is not null
      and to_regprocedure('private.finalize_deleted_media_inspection_proof(uuid,jsonb)') is not null then
     execute 'select private.finalize_deleted_media_inspection_proof($1,$2)' into proof using new.id,staged_proof;
   end if;
   update private.deleted_media_key_retirements set inspection_proof=proof,
     inspection_proof_fingerprint=case when proof is not null then md5(proof::text) end,status='retained',deletion_id=d.id,deleted_at=d.deleted_at,expires_at=d.expires_at
    where stage_id=new.id and status='staged';
 end if;
 return new;
end $$;

create or replace function private.deleted_media_has_live_reference(p_stage_id uuid) returns boolean
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare r private.deleted_media_key_retirements%rowtype; t record; found_ref boolean; predicate text;
begin
 if not private.deleted_media_reference_fence_armed() then return true; end if;
 perform pg_catalog.pg_advisory_xact_lock(176214,30);
 select * into r from private.deleted_media_key_retirements where stage_id=p_stage_id;
 if r.id is null or not private.deleted_media_reference_coverage_ready() then return true; end if;
 for t in select c.oid,c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and cardinality(private.deleted_media_locator_columns(c.oid))>0 loop
   predicate:='true';
   -- Reservations are provenance, not delivery references. Only the EXACT
   -- registered reservation is excluded; competing reservations block cleanup.
   if t.relname='media_upload_reservations' and r.reservation_id is not null then predicate:=format('id::text<>%L',r.reservation_id::text); end if;
   -- Historical terminal scan receipts cannot publish content by themselves.
   if t.relname='media_scan_jobs' then predicate:='coalesce(to_jsonb(x)->>''status'','''') not in (''clean'',''malware_detected'',''quarantined'')'; end if;
   execute format('select exists(select 1 from public.%I x where %s and private.deleted_media_mentions(private.deleted_media_locator_document(to_jsonb(x),%s::oid),$1))',t.relname,predicate,t.oid)
     into found_ref using r.object_key;
   if found_ref then return true; end if;
 end loop;
 return false;
end $$;

create or replace function public.reconcile_deleted_content_stage(p_stage_id uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare s private.deleted_content_media_stages%rowtype; r private.deleted_media_key_retirements%rowtype;
 c private.deleted_content_stage_cleanup_claims%rowtype; v jsonb; parent_kind text; parent_key text;
begin
 if not exists(select 1 from private.deleted_content_retention_settings where media_expiry_enabled) then
   return jsonb_build_object('status','disabled'); end if;
 if current_setting('transaction_isolation')<>'read committed' then
   raise exception 'retention_requires_read_committed' using errcode='25000'; end if;
 if not private.deleted_media_reference_fence_armed() then raise exception 'retirement_fence_not_armed'; end if;
 perform pg_advisory_xact_lock(176214,30);
 begin
   select * into s from private.deleted_content_media_stages where id=p_stage_id for update nowait;
   select * into r from private.deleted_media_key_retirements where stage_id=p_stage_id for update nowait;
 exception when lock_not_available then return jsonb_build_object('status','source_busy');
 end;
 if s.id is null then return jsonb_build_object('status','absent'); end if;
 if r.id is null or (r.provider,r.bucket,r.object_key,r.reservation_id,r.legacy_provenance_id,r.target_type,r.target_id,r.author)
   is distinct from (s.provider,s.bucket,s.object_key,s.reservation_id,s.legacy_provenance_id,s.target_type,s.target_id,s.author) then
   return jsonb_build_object('status','original_provenance_required'); end if;
 -- Stage.deletion_id alone is not finalization: old versions linked replaced
 -- keys to a later parent deletion even though the registry correctly refused.
 if r.status in ('retained','claimed') then return jsonb_build_object('status','finalized'); end if;
 select * into c from private.deleted_content_stage_cleanup_claims where stage_id=s.id;
 if r.status='cleanup_claimed' then
   if c.id is null then raise exception 'cleanup_claim_missing'; end if;
   return jsonb_build_object('status','claimed','claimId',c.id);
 end if;
 if s.reconcile_after>clock_timestamp() then return jsonb_build_object('status','not_due'); end if;
 -- Lock writers hold source before advisory. NOWAIT prevents inverse-order
 -- deadlocks and lets their commit/rollback determine the next bounded retry.
 begin
   if s.target_type='creator_video' then
     select to_jsonb(x) into v from public.videos x where id::text=s.target_id for update nowait;
   else
     select to_jsonb(x) into v from public.social_attachments x where id::text=s.target_id for update nowait;
   end if;
 exception when lock_not_available then return jsonb_build_object('status','source_busy');
 end;
 if v is not null and private.deleted_media_mentions(v,s.object_key) then
   return jsonb_build_object('status','attached_requires_explicit_content_delete','retainedContent',false,'automaticRepairAllowed',false);
 end if;
 -- Canonical social keys were validated at registration against the original
 -- parent. Decode only that immutable exact key, never the replacement row.
 if r.target_type='social_attachment' and r.legacy_provenance_id is not null then
   select l.parent_type,l.parent_id::text into parent_kind,parent_key from private.deleted_media_legacy_provenance l
     where l.id=r.legacy_provenance_id and l.target_type=r.target_type and l.target_id::text=r.target_id
      and l.author::text=r.author and l.object_key=r.object_key and l.provider=r.provider and l.bucket=r.bucket
      and l.source_created_at=r.source_created_at;
   if parent_kind is null or parent_key is null then
     return jsonb_build_object('status','original_parent_provenance_required'); end if;
 elsif r.target_type='social_attachment' then
   parent_kind:=split_part(r.object_key,'/',2); parent_key:=split_part(r.object_key,'/',3);
   if split_part(r.object_key,'/',1)<>r.author or parent_kind !~ '^[a-z_]+$'
     or parent_key !~ '^[0-9a-f-]{36}$'
     or r.object_key !~ ('^'||r.author||'/'||parent_kind||'/'||parent_key||'/'||r.target_id||'\.[a-z0-9]{1,10}$') then
     return jsonb_build_object('status','original_parent_provenance_required');
   end if;
 end if;
 if exists(select 1 from public.legal_holds h where h.status='active' and
   private.deleted_content_hold_matches(h.target_type,h.target_id,r.target_type,r.target_id,r.author,parent_kind,parent_key)) then
   return jsonb_build_object('status','held'); end if;
 if not private.deleted_media_reference_coverage_ready() or private.deleted_media_has_live_reference(s.id) then
   return jsonb_build_object('status','unsupported_or_live_reference'); end if;
 update private.deleted_media_key_retirements set status='cleanup_claimed',claimed_at=clock_timestamp() where id=r.id;
 insert into private.deleted_content_stage_cleanup_claims(stage_id,retirement_id,target_type,target_id,author,parent_type,parent_id,provider,bucket,object_key)
   values(s.id,r.id,r.target_type,r.target_id,r.author,parent_kind,parent_key,r.provider,r.bucket,r.object_key) returning * into c;
 insert into private.deleted_content_retention_events(operation,target_type,target_id,actor)
   values('reconcile',r.target_type,r.target_id,'service:stage_cleanup_claim');
 return jsonb_build_object('status','claimed','claimId',c.id,'retainedContent',false);
end $$;

create or replace function private.deleted_content_soft_media_coverage(p_deletion_id uuid) returns boolean
language plpgsql volatile security definer set search_path='' set timezone='UTC' as $$
declare d private.deleted_content_records%rowtype; registry private.deleted_media_key_retirements%rowtype;
 source jsonb; parent jsonb; parent_kind text; parent_table text;
begin
 select * into d from private.deleted_content_records where id=p_deletion_id;
 if d.id is null or d.target_type<>'social_attachment' or d.deletion_kind<>'soft'
   or to_jsonb(d)->>'media_disposition' is distinct from 'retained_original'
   or d.source_created_at is null then return false; end if;
 select r.* into registry from private.deleted_media_key_retirements r
 join private.deleted_content_media_stages s on s.id=r.stage_id and s.deletion_id=d.id
 where r.deletion_id=d.id and r.status in ('retained','claimed')
   and r.target_type=d.target_type and r.target_id=d.target_id and r.author=d.author
   and r.source_created_at::timestamptz=d.source_created_at
   and r.deleted_at=d.deleted_at and r.expires_at=d.expires_at
   and s.target_type=r.target_type and s.target_id=r.target_id and s.author=r.author
   and s.provider=r.provider and s.bucket=r.bucket and s.object_key=r.object_key and (s.reservation_id,s.legacy_provenance_id) is not distinct from (r.reservation_id,r.legacy_provenance_id);
 if registry.id is null then return false; end if;
 select to_jsonb(a) into source from public.social_attachments a where a.id::text=d.target_id;
 -- A completed metadata cleanup needs no further source deletion authority.
 -- Its permanent registry governs retries even if account removal cascades
 -- through the mutable upload reservation.
 if source is null then return true; end if;
 -- Retained provenance is the immutable registry's verified/attached tuple.
 -- Reservation removal cannot reopen that authority or make worker restart
 -- depend on an account row that may have been deleted.
 if registry.status<>'retained'
   or (source->>'created_at')::timestamptz is distinct from d.source_created_at
   or source->>'owner_user_id' is distinct from d.author
   or source->>'surface_type' is distinct from d.parent_type or source->>'surface_id' is distinct from d.parent_id
   or source->>'storage_provider' is distinct from registry.provider
   or source->>'storage_bucket' is distinct from registry.bucket
   or coalesce(nullif(source->>'storage_object_key',''),source->>'storage_path') is distinct from registry.object_key
   or (nullif(source->>'storage_path','') is not null and source->>'storage_path'<>registry.object_key) then return false; end if;
 parent_kind:=case d.parent_type when 'watch_party_room_message' then 'room_message' else d.parent_type end;
 parent_table:=case parent_kind when 'profile_post' then 'profile_posts'
   when 'profile_post_comment' then 'profile_post_comments' when 'creator_video_comment' then 'creator_video_comments'
   when 'chat_message' then 'chat_messages' when 'room_message' then 'watch_party_room_messages' end;
 if parent_table is null or d.parent_id is null then return false; end if;
 execute format('select to_jsonb(p) from public.%I p where id::text=$1',parent_table) into parent using d.parent_id;
 if parent is not null and parent->>'deleted_at' is null then return false; end if;
 return exists(select 1 from private.deleted_content_records p
   where p.target_type=parent_kind and p.target_id=d.parent_id and p.deleted_at<=d.deleted_at
     and (parent is null or (p.deletion_kind='soft'
       and (parent->>'created_at')::timestamptz is not distinct from p.source_created_at)));
end $$;

create or replace function private.deleted_media_retirement_binding(p_stage_id uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare r private.deleted_media_key_retirements%rowtype;
begin
 select * into r from private.deleted_media_key_retirements where stage_id=p_stage_id;
 if current_setting('transaction_isolation')<>'read committed' or r.id is null
   or r.status not in ('retained','claimed') or not private.deleted_media_reference_coverage_ready() then
   return jsonb_build_object('supported',false,'reason','unfinalized_or_uncovered_key_class'); end if;
 if r.legacy_provenance_id is not null and not exists(select 1 from private.deleted_media_legacy_delivery_revocations v
   where v.legacy_provenance_id=r.legacy_provenance_id and v.stage_id=r.stage_id
     and v.target_type=r.target_type and v.target_id::text=r.target_id and v.author::text=r.author
     and v.provider=r.provider and v.bucket=r.bucket and v.object_key=r.object_key
     and v.source_created_at=r.source_created_at) then
   return jsonb_build_object('supported',false,'reason','legacy_revocation_required'); end if;
 if r.legacy_provenance_id is not null and not exists(select 1 from private.deleted_media_legacy_provenance l
   join private.deleted_content_media_stages s on s.id=r.stage_id
   where l.id=r.legacy_provenance_id and s.legacy_provenance_id=l.id and s.reservation_id is null
     and r.reservation_id is null and l.target_type=r.target_type and l.target_id::text=r.target_id
     and l.author::text=r.author and l.provider=r.provider and l.bucket=r.bucket and l.object_key=r.object_key
     and l.source_created_at=r.source_created_at) then
   return jsonb_build_object('supported',false,'reason','legacy_provenance_mismatch'); end if;
 return jsonb_build_object('supported',true,'provider',r.provider,'bucket',r.bucket,'objectKey',r.object_key,
  'targetType',r.target_type,'targetId',r.target_id,'author',r.author,'retirementId',r.id,'status',r.status,
  'expiresAt',r.expires_at,'deletionId',r.deletion_id,'guarantee','logical_key_retirement_best_effort_physical_cleanup');
end $$;

create or replace function private.capture_deleted_content_row(p_type text,v jsonb,p_soft boolean default false) returns uuid
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare d uuid; a text; b jsonb; k text; t timestamptz:=clock_timestamp();
 stage_id uuid; decision jsonb; revoked jsonb; original_key text; coverage text; disposition text:='text_only';
begin
 perform private.deleted_media_reference_fence_armed();
 if not exists(select 1 from private.deleted_content_retention_settings where capture_enabled) then return null; end if;
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'retention_requires_read_committed' using errcode='25000';
 end if;
 k:=coalesce(v->>'id',v->>'owner_user_id');
 a:=coalesce(v->>'user_id',v->>'sender_user_id',v->>'owner_id',v->>'owner_user_id');
 if k is null or a is null then raise exception 'deleted_content_missing_identity'; end if;
 select id into d from private.deleted_content_records where target_type=p_type and target_id=k
  and deletion_kind='soft' and source_created_at is not distinct from nullif(v->>'created_at','')::timestamptz
  order by deleted_at desc,id limit 1;
 if d is not null then
  if p_type in ('creator_video','social_attachment') and not (
   exists(select 1 from private.deleted_content_records x where x.id=d and x.media_disposition='metadata_only')
    and private.deleted_content_source_coverage(p_type,v)='metadata_only'
   or exists(select 1 from private.deleted_content_records x join private.deleted_media_key_retirements r on r.deletion_id=x.id
    join private.deleted_content_media_stages s on s.id=r.stage_id and s.deletion_id=x.id
    where x.id=d and x.media_disposition='retained_original' and r.status='retained'
     and r.target_type=p_type and r.target_id=k and r.author=a
     and r.provider=v->>'storage_provider' and r.bucket=v->>'storage_bucket'
     and r.object_key=coalesce(nullif(v->>'storage_object_key',''),v->>'storage_path')
     and r.source_created_at is not distinct from private.deleted_media_legacy_source_binding(p_type,v)->>'createdAt')
  ) then raise exception 'deleted_content_existing_media_proof_required' using errcode='55000'; end if;
  return d;
 end if;
 if p_type in ('creator_video','social_attachment') then
  coverage:=private.deleted_content_source_coverage(p_type,v);
  if coverage='metadata_only' then disposition:='metadata_only';
  elsif coverage<>'eligible_r2_original' then
   raise exception 'deleted_content_original_retention_unavailable: %',coverage using errcode='55000';
  else
  disposition:='retained_original';
  original_key:=coalesce(nullif(v->>'storage_object_key',''),v->>'storage_path');
  if not exists(select 1 from private.deleted_content_retention_settings where media_staging_enabled)
   or v->>'storage_provider' is distinct from 'cloudflare_r2'
   or v->>'storage_bucket' is distinct from 'chillywood-media-origin'
   or nullif(original_key,'') is null then
   raise exception 'deleted_content_original_retention_unavailable' using errcode='55000';
  end if;
  decision:=private.stage_deleted_content_media_internal(p_type,k,v->>'storage_provider',v->>'storage_bucket',original_key,auth.uid());
  select r.stage_id into stage_id from private.deleted_media_key_retirements r
   where r.target_type=p_type and r.target_id=k and r.author=a
    and r.provider=v->>'storage_provider' and r.bucket=v->>'storage_bucket' and r.object_key=original_key
    and r.source_created_at is not distinct from private.deleted_media_legacy_source_binding(p_type,v)->>'createdAt' and r.status='staged';
  if decision->>'decision' is distinct from 'defer' or stage_id is null then
   raise exception 'deleted_content_original_retention_unavailable' using errcode='55000';
  end if;
  if exists(select 1 from private.deleted_content_media_stages s where s.id=stage_id and s.legacy_provenance_id is not null) then
    revoked:=private.revoke_deleted_media_legacy_delivery(stage_id);
  else
  revoked:=public.revoke_media_object_delivery(p_type,v->>'storage_provider',v->>'storage_bucket',
   original_key,a::uuid,k,null,null);
  end if;
  if revoked->>'revoked' is distinct from 'true' then
   raise exception 'deleted_content_delivery_revocation_required' using errcode='55000';
  end if;
  end if;
 end if;
 case p_type
  when 'profile_post','profile_post_comment','creator_video_comment','chat_message' then b:=jsonb_build_object('body',v->'body');
  when 'room_message' then b:=jsonb_build_object('body',v->'text');
  when 'creator_video' then b:=jsonb_build_object('title',v->'title','description',v->'description');
  when 'social_attachment','platform_brand_asset' then b:=null;
  when 'platform_brand_profile' then return null;
  else raise exception 'deleted_content_unsupported_target';
 end case;
 insert into private.deleted_content_records(target_type,target_id,author,owner_protected,content,source_updated_at,source_created_at,parent_type,parent_id,deletion_kind,deleted_at,expires_at,media_disposition)
 values(p_type,k,a,exists(select 1 from public.platform_role_memberships where user_id=a and role='owner'),b,
  nullif(v->>'updated_at','')::timestamptz,nullif(v->>'created_at','')::timestamptz,v->>'surface_type',v->>'surface_id',
  case when p_soft then 'soft' else 'hard' end,t,t+interval '720 hours',disposition) returning id into d;
 -- Only this exact deleted original belongs to this deletion. A replaced stage
 -- stays abandoned, even if a later incarnation or replacement is deleted.
 update private.deleted_content_media_stages set deletion_id=d where id=stage_id and deletion_id is null;
 insert into private.deleted_content_retention_events(operation,target_type,target_id,deletion_id,actor)
 values('capture',p_type,k,d,auth.uid()::text);
 return d;
end $$;

create or replace function public.check_deleted_media_retirement(p_provider text,p_bucket text,p_object_key text,p_purpose text)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare r private.deleted_media_key_retirements%rowtype;
begin
 if p_purpose='upload' and exists(select 1 from private.deleted_media_legacy_provenance l where l.object_key=p_object_key) then
   return jsonb_build_object('allowed',false); end if;
 if not private.deleted_media_reference_fence_armed() then
   return jsonb_build_object('allowed',coalesce(p_purpose in ('upload','read','inspection','publish'),false));
 end if;
 perform pg_catalog.pg_advisory_xact_lock(176214,30);
 if current_setting('transaction_isolation')<>'read committed' then return jsonb_build_object('allowed',false); end if;
 if p_purpose not in ('upload','read','inspection','publish') then return jsonb_build_object('allowed',false); end if;
 select * into r from private.deleted_media_key_retirements
   where object_key=p_object_key and status in ('retained','claimed','cleanup_claimed') limit 1;
 if r.id is null then return jsonb_build_object('allowed',true); end if;
 if p_provider is distinct from r.provider or p_bucket is distinct from r.bucket or r.status in ('claimed','cleanup_claimed') then
   return jsonb_build_object('allowed',false); end if;
 return jsonb_build_object('allowed',p_purpose='inspection' and clock_timestamp()<r.expires_at,'expiresAt',r.expires_at);
end $$;

-- BEGIN LEGACY REVOCATION
create table private.deleted_media_legacy_delivery_revocations (
 legacy_provenance_id uuid primary key,
 stage_id uuid not null unique,
 target_type text not null check(target_type in ('creator_video','social_attachment')),
 target_id uuid not null, author uuid not null, source_created_at text not null,
 provider text not null check(provider='cloudflare_r2'),
 bucket text not null check(bucket='chillywood-media-origin'),
 object_key text not null, source_binding jsonb not null,
 revoked_at timestamptz not null default clock_timestamp(),
 unique(provider,bucket,object_key)
);
alter table private.deleted_media_legacy_delivery_revocations enable row level security;
alter table private.deleted_media_legacy_delivery_revocations force row level security;
revoke all on private.deleted_media_legacy_delivery_revocations from public,anon,authenticated,service_role;
create function private.preserve_deleted_media_legacy_delivery_revocation() returns trigger
language plpgsql set search_path='' set timezone='UTC' as $$ begin
 raise exception 'legacy_delivery_revocation_permanent' using errcode='55000';
end $$;
create trigger preserve_deleted_media_legacy_delivery_revocation before update or delete
 on private.deleted_media_legacy_delivery_revocations for each row
 execute function private.preserve_deleted_media_legacy_delivery_revocation();
create trigger preserve_deleted_media_legacy_delivery_revocation_truncate before truncate
 on private.deleted_media_legacy_delivery_revocations for each statement
 execute function private.preserve_deleted_media_legacy_delivery_revocation();

-- A deny-only predicate. Matching a retired logical key under another claimed
-- provider/bucket must not launder that key back into delivery authority.
create function private.deleted_media_legacy_delivery_revoked(p_provider text,p_bucket text,p_object_key text)
returns boolean language sql stable security definer set search_path='' set timezone='UTC' as $$
 select nullif(btrim(p_provider),'') is null or nullif(btrim(p_bucket),'') is null
  or nullif(btrim(p_object_key),'') is null
  or exists(select 1 from private.deleted_media_legacy_delivery_revocations r where r.object_key=btrim(p_object_key))
$$;
create function public.check_legacy_media_delivery_revocation(p_provider text,p_bucket text,p_object_key text)
returns jsonb language sql stable security definer set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('revoked',private.deleted_media_legacy_delivery_revoked(p_provider,p_bucket,p_object_key))
$$;
revoke all on function public.check_legacy_media_delivery_revocation(text,text,text) from public,anon,authenticated;
grant execute on function public.check_legacy_media_delivery_revocation(text,text,text) to service_role;

-- Called only inside actual content capture, after exact legacy staging and
-- before source removal. No application role can invoke this function.
create function private.revoke_deleted_media_legacy_delivery(p_stage_id uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare s private.deleted_content_media_stages; r private.deleted_media_key_retirements;
 p private.deleted_media_legacy_provenance; receipt private.deleted_media_legacy_delivery_revocations;
 b jsonb;
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'legacy_provenance_requires_read_committed' using errcode='25000'; end if;
 if not private.deleted_media_reference_fence_armed() then
  raise exception 'retirement_fence_not_armed' using errcode='55000'; end if;
 select * into s from private.deleted_content_media_stages where id=p_stage_id;
 select * into r from private.deleted_media_key_retirements where stage_id=p_stage_id;
 select * into p from private.deleted_media_legacy_provenance where id=s.legacy_provenance_id;
 if s.id is null or r.id is null or p.id is null or s.reservation_id is not null or r.reservation_id is not null
  or r.legacy_provenance_id is distinct from p.id
  or (s.target_type,s.target_id,s.author,s.provider,s.bucket,s.object_key)
    is distinct from (p.target_type,p.target_id::text,p.author::text,p.provider,p.bucket,p.object_key)
  or (r.target_type,r.target_id,r.author,r.provider,r.bucket,r.object_key,r.source_created_at)
    is distinct from (p.target_type,p.target_id::text,p.author::text,p.provider,p.bucket,p.object_key,p.source_created_at) then
  raise exception 'legacy_delivery_revocation_binding_required' using errcode='55000'; end if;
 select * into receipt from private.deleted_media_legacy_delivery_revocations where legacy_provenance_id=p.id;
 if receipt.legacy_provenance_id is not null then
  if (receipt.stage_id,receipt.target_type,receipt.target_id,receipt.author,receipt.source_created_at,
    receipt.provider,receipt.bucket,receipt.object_key,receipt.source_binding)
    is distinct from (s.id,p.target_type,p.target_id,p.author,p.source_created_at,p.provider,p.bucket,p.object_key,p.source_binding) then
   raise exception 'legacy_delivery_revocation_identity_conflict' using errcode='55000'; end if;
  return jsonb_build_object('revoked',true,'source','legacy_provenance','alreadyRevoked',true);
 end if;
 -- Source before advisory matches capture's ordering. The source lock prevents
 -- source replacement while the immutable snapshot is bound to this revoke.
 b:=private.read_deleted_media_legacy_source(p.target_type,p.target_id);
 if b is distinct from p.source_binding then
  raise exception 'legacy_provenance_source_changed' using errcode='55000'; end if;
 perform pg_catalog.pg_advisory_xact_lock(176214,30);
 select * into s from private.deleted_content_media_stages where id=p_stage_id;
 select * into r from private.deleted_media_key_retirements where stage_id=p_stage_id;
 if s.id is null or r.id is null or s.deletion_id is not null or r.status<>'staged'
  or s.reservation_id is not null or r.reservation_id is not null
  or s.legacy_provenance_id is distinct from p.id or r.legacy_provenance_id is distinct from p.id
  or (s.target_type,s.target_id,s.author,s.provider,s.bucket,s.object_key)
    is distinct from (p.target_type,p.target_id::text,p.author::text,p.provider,p.bucket,p.object_key)
  or (r.target_type,r.target_id,r.author,r.provider,r.bucket,r.object_key,r.source_created_at)
    is distinct from (p.target_type,p.target_id::text,p.author::text,p.provider,p.bucket,p.object_key,p.source_created_at)
  or exists(select 1 from public.media_upload_reservations u
    where u.storage_provider=p.provider and u.storage_bucket=p.bucket and u.storage_object_key=p.object_key) then
  raise exception 'legacy_delivery_revocation_staged_binding_required' using errcode='55000'; end if;
 -- Audit-only revocation does not lock the source. Keep the exact still-active
 -- historical receipt locked through first revocation; NOWAIT avoids inversion
 -- with migration writers. A durable exact retry above needs no mutable audit.
 perform a.id from private.media_object_storage_migration_audit a
 where a.id=p.migration_audit_id and a.status='updated'
  and a.table_name=case p.target_type when 'creator_video' then 'videos' else 'social_attachments' end
  and a.row_id=p.target_id::text and a.new_storage_provider=p.provider
  and a.new_storage_bucket=p.bucket and a.new_storage_object_key=p.object_key
  and private.deleted_media_legacy_source_binding(p.target_type,a.row_after)=p.source_binding
  and jsonb_build_object('auditId',a.id,'binding',p.source_binding,'copiedVerifiedAt',a.copied_verified_at)=p.migration_audit_binding
 for share nowait;
 if not found then raise exception 'legacy_delivery_revocation_active_audit_required' using errcode='55000'; end if;
 insert into private.deleted_media_legacy_delivery_revocations(legacy_provenance_id,stage_id,target_type,target_id,
  author,source_created_at,provider,bucket,object_key,source_binding)
 values(p.id,s.id,p.target_type,p.target_id,p.author,p.source_created_at,p.provider,p.bucket,p.object_key,p.source_binding)
 on conflict(legacy_provenance_id) do nothing;
 select * into receipt from private.deleted_media_legacy_delivery_revocations where legacy_provenance_id=p.id;
 if receipt.stage_id is distinct from s.id or receipt.source_binding is distinct from p.source_binding
  or (receipt.provider,receipt.bucket,receipt.object_key) is distinct from (p.provider,p.bucket,p.object_key) then
  raise exception 'legacy_delivery_revocation_identity_conflict' using errcode='55000'; end if;
 return jsonb_build_object('revoked',true,'source','legacy_provenance','alreadyRevoked',false);
end $$;
revoke all on function private.preserve_deleted_media_legacy_delivery_revocation(),
 private.deleted_media_legacy_delivery_revoked(text,text,text),private.revoke_deleted_media_legacy_delivery(uuid)
 from public,anon,authenticated,service_role;

-- Keep the existing audited legacy rules, adding only a permanent denial. The
-- enrollment ledger never becomes an alternate affirmative delivery source.
create or replace function public.has_verified_legacy_media_object_provenance(
 p_table_name text,p_row_id text,p_provider text,p_bucket text,p_object_key text
) returns boolean language sql stable security definer set search_path='' set timezone='UTC' as $$
 select not private.deleted_media_legacy_delivery_revoked(p_provider,p_bucket,p_object_key)
  and btrim(coalesce(p_table_name,'')) in ('videos','social_attachments','video_renditions')
  and nullif(btrim(coalesce(p_row_id,'')),'') is not null
  and lower(btrim(coalesce(p_provider,'')))='cloudflare_r2'
  and btrim(coalesce(p_bucket,''))<>'' and btrim(coalesce(p_object_key,''))<>''
  and exists(select 1 from private.media_object_storage_migration_audit audit
    where audit.table_name=btrim(p_table_name) and audit.row_id=btrim(p_row_id) and audit.status='updated'
      and lower(btrim(audit.new_storage_provider))=lower(btrim(p_provider))
      and audit.new_storage_bucket=btrim(p_bucket) and audit.new_storage_object_key=btrim(p_object_key))
$$;
create or replace function public.has_verified_legacy_video_object_provenance(
 p_video_id uuid,p_provider text,p_bucket text,p_object_key text
) returns boolean language sql stable security definer set search_path='' set timezone='UTC' as $$
 select not private.deleted_media_legacy_delivery_revoked(p_provider,p_bucket,p_object_key)
  and lower(btrim(coalesce(p_provider,'')))='cloudflare_r2' and btrim(coalesce(p_bucket,''))<>''
  and (p_object_key like 'originals/%' or p_object_key like 'uploads/%' or p_object_key like 'source/%'
    or p_object_key like 'processing/%' or p_object_key like 'quarantine/%')
  and exists(select 1 from private.media_object_storage_migration_audit audit
    join public.videos video on video.id=p_video_id
    where audit.table_name='videos' and audit.row_id=p_video_id::text and audit.status='updated'
      and lower(btrim(audit.new_storage_provider))=lower(btrim(p_provider))
      and audit.new_storage_bucket=p_bucket and audit.new_storage_object_key=p_object_key
      and lower(btrim(coalesce(video.storage_provider,'')))=lower(btrim(p_provider))
      and video.storage_bucket=p_bucket
      and (coalesce(nullif(video.storage_object_key,''),video.storage_path)=p_object_key or video.thumb_storage_path=p_object_key))
$$;
revoke all on function public.has_verified_legacy_media_object_provenance(text,text,text,text,text),
 public.has_verified_legacy_video_object_provenance(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.has_verified_legacy_media_object_provenance(text,text,text,text,text),
 public.has_verified_legacy_video_object_provenance(uuid,text,text,text) to service_role;

commit;
