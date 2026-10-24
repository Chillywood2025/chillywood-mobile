-- SOURCE ONLY. Empty reviewed evidence, no enrollment, flags, provider calls,
-- inspection/scan authority or grants. This retains application text, NOT bytes
-- hosted by third parties. Secondary producer hooks deliberately stay unchanged.
begin;

create function private.deleted_content_external_sha256(p_value jsonb) returns text
language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(p_value::text,'UTF8')),'hex')
$$;

create table private.deleted_content_external_reference_evidence (
 id uuid primary key default gen_random_uuid(),
 target_id uuid not null,
 author uuid not null,
 source_created_at text not null,
 source_binding jsonb not null,
 subtype text not null check(subtype in ('external_fixture','placeholder')),
 review_basis text not null check(review_basis='row_specific_creation_record'),
 source_evidence_sha256 text not null check(source_evidence_sha256 ~ '^[a-f0-9]{64}$'),
 locator_evidence_sha256 text not null check(locator_evidence_sha256 ~ '^[a-f0-9]{64}$'),
 reviewed_by text not null check(length(btrim(reviewed_by)) between 1 and 200),
 recorded_at timestamptz not null default clock_timestamp(),
 unique(target_id,source_created_at),
 check(source_binding->>'id'=target_id::text and source_binding->>'author'=author::text
   and source_binding->>'createdAt'=source_created_at)
);
comment on table private.deleted_content_external_reference_evidence is
 'Privileged, independently reviewed row-specific creation/locator evidence. Hashes bind every locator, reference identity and schema without storing URLs, tokens or content. Assertions are not verified by SQL and are never clean-scan or external-byte deletion authority.';

-- A disabled-period DELETE cannot make another row with reused UUID/created_at
-- inherit the old row's review. This tombstone is deny-only, never admission.
create table private.deleted_content_external_reference_invalidations (
 evidence_id uuid primary key references private.deleted_content_external_reference_evidence(id),
 invalidated_at timestamptz not null default clock_timestamp()
);
alter table private.deleted_content_external_reference_invalidations enable row level security;
alter table private.deleted_content_external_reference_invalidations force row level security;
revoke all on private.deleted_content_external_reference_invalidations from public,anon,authenticated,service_role;

-- A private capability is created and consumed in the same source-delete
-- transaction. No caller-settable session GUC can impersonate delete intent.
create table private.deleted_content_external_delete_intents (
 transaction_id bigint not null,
 backend_id integer not null,
 target_id uuid not null,
 author uuid not null,
 source_binding jsonb not null,
 primary key(transaction_id,backend_id,target_id)
);
create table private.deleted_content_external_reference_captures (
 deletion_id uuid primary key,
 evidence_id uuid not null references private.deleted_content_external_reference_evidence(id),
 target_id uuid not null unique,
 author uuid not null,
 source_created_at timestamptz not null,
 source_binding jsonb not null,
 archive_sha256 text not null check(archive_sha256 ~ '^[a-f0-9]{64}$'),
 deleted_at timestamptz not null,
 expires_at timestamptz not null,
 check(expires_at=deleted_at+interval '720 hours')
);
-- No FK to the source, account or archive: exact retry proof survives deletion
-- and text expiry without keeping the title/description or any URL.
alter table private.deleted_content_external_reference_evidence enable row level security;
alter table private.deleted_content_external_reference_evidence force row level security;
alter table private.deleted_content_external_delete_intents enable row level security;
alter table private.deleted_content_external_delete_intents force row level security;
alter table private.deleted_content_external_reference_captures enable row level security;
alter table private.deleted_content_external_reference_captures force row level security;
revoke all on private.deleted_content_external_reference_evidence,
 private.deleted_content_external_delete_intents,private.deleted_content_external_reference_captures
 from public,anon,authenticated,service_role;

create function private.preserve_deleted_content_external_reference() returns trigger
language plpgsql set search_path='' as $$ begin
 raise exception 'external_reference_evidence_permanent' using errcode='55000';
end $$;
create trigger preserve_external_reference_evidence before update or delete
 on private.deleted_content_external_reference_evidence for each row
 execute function private.preserve_deleted_content_external_reference();
create trigger preserve_external_reference_evidence_truncate before truncate
 on private.deleted_content_external_reference_evidence for each statement
 execute function private.preserve_deleted_content_external_reference();
create trigger preserve_external_reference_capture before update or delete
 on private.deleted_content_external_reference_captures for each row
 execute function private.preserve_deleted_content_external_reference();
create trigger preserve_external_reference_capture_truncate before truncate
 on private.deleted_content_external_reference_captures for each statement
 execute function private.preserve_deleted_content_external_reference();
create trigger preserve_external_reference_invalidation before update or delete
 on private.deleted_content_external_reference_invalidations for each row
 execute function private.preserve_deleted_content_external_reference();
create trigger preserve_external_reference_invalidation_truncate before truncate
 on private.deleted_content_external_reference_invalidations for each statement
 execute function private.preserve_deleted_content_external_reference();

create function private.invalidate_deleted_content_external_source() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and private.deleted_content_external_reference_binding(to_jsonb(new))
   =private.deleted_content_external_reference_binding(to_jsonb(old)) then return new; end if;
 -- Even while disabled, a stale RR snapshot could miss evidence recorded while
 -- DELETE waited on the source lock. Fail closed instead of losing tombstones.
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'external_reference_requires_read_committed' using errcode='25000'; end if;
 perform private.deleted_media_reference_fence_armed();
 perform pg_advisory_xact_lock(176214,30);
 if tg_op='TRUNCATE' then
  if exists(select 1 from private.deleted_content_retention_settings where capture_enabled) then
   raise exception 'external_reference_explicit_hard_delete_required' using errcode='55000'; end if;
  insert into private.deleted_content_external_reference_invalidations(evidence_id)
  select e.id from private.deleted_content_external_reference_evidence e
  where not exists(select 1 from private.deleted_content_external_reference_captures c where c.target_id=e.target_id)
  on conflict(evidence_id) do nothing;
  return null;
 end if;
 if not exists(select 1 from private.deleted_content_external_reference_captures c where c.target_id=old.id) then
  insert into private.deleted_content_external_reference_invalidations(evidence_id)
  select e.id from private.deleted_content_external_reference_evidence e where e.target_id=old.id
  on conflict(evidence_id) do nothing;
 end if;
 if tg_op='UPDATE' then return new; end if;
 return old;
end $$;
create trigger zzzz_external_reference_source_deleted after delete on public.videos
 for each row execute function private.invalidate_deleted_content_external_source();
create trigger zzzz_external_reference_source_changed after update on public.videos
 for each row execute function private.invalidate_deleted_content_external_source();
create trigger zzzz_external_reference_source_truncated before truncate on public.videos
 for each statement execute function private.invalidate_deleted_content_external_source();

create function private.deleted_content_external_reference_binding(p_source jsonb) returns jsonb
language sql stable security definer set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('id',p_source->>'id','author',p_source->>'owner_id',
  'createdAt',p_source->>'created_at','provider',p_source->>'storage_provider','bucket',p_source->>'storage_bucket',
  'schemaSha256',private.deleted_content_external_sha256((select jsonb_agg(
    jsonb_build_array(a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attgenerated)
    order by a.attnum) from pg_catalog.pg_attribute a
    where a.attrelid='public.videos'::regclass and a.attnum>0 and not a.attisdropped)),
  'locatorSha256',private.deleted_content_external_sha256(private.deleted_media_locator_document(p_source,'public.videos'::regclass)),
  'referenceSha256',private.deleted_content_external_sha256(private.deleted_media_reference_identity(p_source)))
$$;

-- This diagnostic is always fresh. Dormant evidence does not prohibit writes:
-- changes while capture is off invalidate coverage instead of acquiring lasting
-- admission authority. The caller takes the shared latch and ownership fence.
create function private.deleted_content_external_reference_blocker(p_source jsonb) returns text
language plpgsql volatile security definer set search_path='' set timezone='UTC' as $$
declare target text:=p_source->>'id';
begin
 if exists(select 1 from public.video_renditions r where r.video_id::text=target)
  or exists(select 1 from public.media_renditions r where r.video_id::text=target
    or (r.source_type='creator_video' and r.source_id=target))
  or exists(select 1 from public.media_transcode_jobs j where j.source_type='creator_video' and j.source_id=target)
 then return 'secondary_media_uncovered'; end if;
 if coalesce(target,'') !~ '^[a-f0-9-]{36}$' or coalesce(p_source->>'owner_id','') !~ '^[a-f0-9-]{36}$'
  or nullif(p_source->>'created_at','') is null then return 'external_reference_identity_required'; end if;
 if nullif(btrim(p_source->>'storage_provider'),'') is null or nullif(btrim(p_source->>'storage_bucket'),'') is null
 then return 'external_reference_identity_required'; end if;
 if nullif(p_source->>'deleted_at','') is not null or nullif(p_source->>'hard_deleted_at','') is not null
 then return 'external_reference_live_source_required'; end if;
 if exists(select 1 from unnest(private.deleted_media_locator_columns('public.videos'::regclass)) c
   where c not in ('storage_object_key','storage_path','thumb_storage_path','thumb_url','playback_url'))
 then return 'external_reference_unknown_locator_schema'; end if;
 if not private.deleted_media_reference_coverage_ready() then return 'external_reference_guard_coverage_required'; end if;
 if exists(select 1 from unnest(array['storage_object_key','storage_path','thumb_storage_path']) c
   where nullif(p_source->>c,'') is not null) then return 'external_reference_owned_locator'; end if;
 if not exists(select 1 from unnest(array['playback_url','thumb_url']) c where nullif(p_source->>c,'') is not null)
 then return 'external_reference_locator_required'; end if;
 if exists(select 1 from public.media_upload_reservations r where r.surface_type='creator_video' and r.attached_record_id=target)
  or exists(select 1 from private.deleted_media_key_retirements r where r.target_type='creator_video' and r.target_id=target)
  or exists(select 1 from private.deleted_content_media_stages s where s.target_type='creator_video' and s.target_id=target)
  or exists(select 1 from private.deleted_media_legacy_provenance l where l.target_type='creator_video' and l.target_id::text=target)
  or exists(select 1 from private.supabase_original_copy_receipts r where r.table_name='videos' and r.row_id::text=target)
  or exists(select 1 from private.media_object_storage_migration_audit a
    where (a.table_name='videos' and a.row_id=target)
      or (to_jsonb(a)->>'source_type'='creator_video' and to_jsonb(a)->>'source_id'=target))
 then return 'external_reference_ownership_conflict'; end if;
 return null;
end $$;

create function private.read_deleted_content_external_reference_source(p_target uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare s jsonb;
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'external_reference_requires_read_committed' using errcode='25000'; end if;
 select to_jsonb(v) into s from public.videos v where id=p_target for update;
 if s is null or nullif(s->>'created_at','') is null or nullif(s->>'deleted_at','') is not null
  or nullif(s->>'hard_deleted_at','') is not null then raise exception 'external_reference_live_source_required'; end if;
 return private.deleted_content_external_reference_binding(s);
end $$;

create function private.record_deleted_content_external_reference(p_target uuid,p_expected_binding jsonb,p_evidence jsonb)
returns uuid language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare b jsonb; s jsonb; reason text; e private.deleted_content_external_reference_evidence;
begin
 b:=private.read_deleted_content_external_reference_source(p_target);
 perform private.deleted_media_reference_fence_armed();
 perform pg_advisory_xact_lock(176214,30);
 select to_jsonb(v) into s from public.videos v where id=p_target;
 b:=private.deleted_content_external_reference_binding(s);
 if b is distinct from p_expected_binding then raise exception 'external_reference_source_changed'; end if;
 reason:=private.deleted_content_external_reference_blocker(s);
 if reason is not null then raise exception 'external_reference_recording_blocked: %',reason; end if;
 if not private.deleted_content_external_guards_ready() then
  raise exception 'external_reference_guard_coverage_required'; end if;
 if exists(select 1 from public.legal_holds h where h.status='active'
  and private.deleted_content_hold_matches(h.target_type,h.target_id,'creator_video',p_target::text,b->>'author',null,null))
 then raise exception 'external_reference_legal_hold'; end if;
 -- Only independently reviewed row creation and every locator are admitted.
 -- A URL pattern, a byte count, a negative search or another row's evidence is
 -- not a permitted review basis. SQL does not manufacture or authenticate it.
 if p_evidence->'binding' is distinct from b
  or p_evidence->>'reviewBasis' is distinct from 'row_specific_creation_record'
  or coalesce(p_evidence->>'subtype','') not in ('external_fixture','placeholder')
  or coalesce(p_evidence->>'sourceEvidenceSha256','') !~ '^[a-f0-9]{64}$'
  or coalesce(p_evidence->>'locatorEvidenceSha256','') !~ '^[a-f0-9]{64}$'
  or coalesce(length(btrim(p_evidence->>'reviewedBy')),0) not between 1 and 200
 then raise exception 'external_reference_reviewed_evidence_required'; end if;
 select * into e from private.deleted_content_external_reference_evidence
  where target_id=p_target and source_created_at=b->>'createdAt';
 if e.id is not null then
  if exists(select 1 from private.deleted_content_external_reference_invalidations i where i.evidence_id=e.id)
  then raise exception 'external_reference_source_incarnation_invalidated'; end if;
  if e.source_binding=b and e.subtype=p_evidence->>'subtype'
    and e.review_basis=p_evidence->>'reviewBasis' and e.source_evidence_sha256=p_evidence->>'sourceEvidenceSha256'
    and e.locator_evidence_sha256=p_evidence->>'locatorEvidenceSha256' and e.reviewed_by=p_evidence->>'reviewedBy'
  then return e.id; end if;
  raise exception 'external_reference_evidence_conflict';
 end if;
 insert into private.deleted_content_external_reference_evidence(target_id,author,source_created_at,source_binding,
  subtype,review_basis,source_evidence_sha256,locator_evidence_sha256,reviewed_by)
 values(p_target,(b->>'author')::uuid,b->>'createdAt',b,p_evidence->>'subtype',p_evidence->>'reviewBasis',
  p_evidence->>'sourceEvidenceSha256',p_evidence->>'locatorEvidenceSha256',p_evidence->>'reviewedBy') returning * into e;
 return e.id;
end $$;

-- Serialize every nonheld ownership admission with capture/enrollment, including
-- private historical audit writes that do not update the source. No producer
-- guard for renditions/transcode/shared masters is changed by this migration.
create function private.guard_deleted_content_external_ownership() returns trigger
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v jsonb:=to_jsonb(new); target text; kind text; targets text[]:='{}';
begin
 if tg_table_name in ('media_object_storage_migration_audit','supabase_original_copy_receipts') then
  target:=v->>'row_id'; kind:=case v->>'table_name' when 'videos' then 'creator_video' end;
 elsif tg_table_name='media_upload_reservations' then target:=v->>'attached_record_id'; kind:=v->>'surface_type';
 else target:=v->>'target_id'; kind:=v->>'target_type'; end if;
 perform private.deleted_media_reference_fence_armed();
 if kind='creator_video' and target is not null then targets:=array_append(targets,target); end if;
 if tg_table_name='media_object_storage_migration_audit' and v->>'source_type'='creator_video'
  and v->>'source_id' is not null then targets:=array_append(targets,v->>'source_id'); end if;
 if cardinality(targets)=0 then return new; end if;
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'external_reference_requires_read_committed' using errcode='25000'; end if;
 perform pg_advisory_xact_lock(176214,30);
 foreach target in array targets loop
 if exists(select 1 from private.deleted_content_external_reference_captures c where c.target_id::text=target)
  or (exists(select 1 from private.deleted_content_retention_settings where capture_enabled)
   and exists(select 1 from private.deleted_content_external_reference_evidence e
    join public.videos s on s.id=e.target_id where e.target_id::text=target
     and e.source_binding=private.deleted_content_external_reference_binding(to_jsonb(s)))) then
  raise exception 'external_reference_ownership_admission_forbidden' using errcode='55000'; end if;
 end loop;
 return new;
end $$;
create trigger zzzz_external_reference_ownership before insert or update on public.media_upload_reservations
 for each row execute function private.guard_deleted_content_external_ownership();
create trigger zzzz_external_reference_ownership before insert or update on private.media_object_storage_migration_audit
 for each row execute function private.guard_deleted_content_external_ownership();
create trigger zzzz_external_reference_ownership before insert or update on private.supabase_original_copy_receipts
 for each row execute function private.guard_deleted_content_external_ownership();
create trigger zzzz_external_reference_ownership before insert or update on private.deleted_media_legacy_provenance
 for each row execute function private.guard_deleted_content_external_ownership();
create trigger zzzz_external_reference_ownership before insert or update on private.deleted_content_media_stages
 for each row execute function private.guard_deleted_content_external_ownership();
create trigger zzzz_external_reference_ownership before insert or update on private.deleted_media_key_retirements
 for each row execute function private.guard_deleted_content_external_ownership();

create function private.deleted_content_external_guards_ready() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='public.videos'::regclass
  and t.tgfoid='private.invalidate_deleted_content_external_source()'::regprocedure
  and t.tgenabled in ('O','A') and (t.tgtype::integer & 11)=9 and t.tgqual is null)
 and exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='public.videos'::regclass
  and t.tgfoid='private.invalidate_deleted_content_external_source()'::regprocedure
  and t.tgenabled in ('O','A') and t.tgtype::integer=34 and t.tgqual is null)
 and exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='public.videos'::regclass
  and t.tgfoid='private.invalidate_deleted_content_external_source()'::regprocedure
  and t.tgenabled in ('O','A') and t.tgtype::integer=17 and t.tgqual is null and cardinality(t.tgattr::smallint[])=0)
 and not exists(select 1 from unnest(array['public.media_upload_reservations'::regclass,
  'private.media_object_storage_migration_audit'::regclass,'private.supabase_original_copy_receipts'::regclass,
  'private.deleted_media_legacy_provenance'::regclass,'private.deleted_content_media_stages'::regclass,
  'private.deleted_media_key_retirements'::regclass]) rel
  where not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=rel
    and t.tgfoid='private.guard_deleted_content_external_ownership()'::regprocedure
    and t.tgenabled in ('O','A') and (t.tgtype::integer & 23)=23 and t.tgqual is null and cardinality(t.tgattr::smallint[])=0))
$$;

alter function private.deleted_content_source_coverage(text,jsonb) rename to deleted_content_source_coverage_before_external;
create function private.deleted_content_source_coverage(p_type text,p_source jsonb) returns text
language plpgsql volatile security definer set search_path='' set timezone='UTC' as $$
declare previous text; reason text;
begin
 previous:=private.deleted_content_source_coverage_before_external(p_type,p_source);
 if p_type<>'creator_video' or previous in ('secondary_media_uncovered','unproven_source_incarnation','eligible_r2_original','metadata_only')
 then return previous; end if;
 -- No inferred classification. Exact reviewed evidence is mandatory; errors
 -- remain distinct and unknown rows retain their historical fail-closed result.
 if not exists(select 1 from private.deleted_content_external_reference_evidence e
   where e.target_id::text=p_source->>'id' and e.source_binding=private.deleted_content_external_reference_binding(p_source)
    and not exists(select 1 from private.deleted_content_external_reference_invalidations i where i.evidence_id=e.id))
 then return previous; end if;
 reason:=private.deleted_content_external_reference_blocker(p_source);
 if reason is not null then return reason; end if;
 if not private.deleted_content_external_guards_ready() then return 'external_reference_guard_coverage_required'; end if;
 return 'reviewed_external_reference';
end $$;

alter table private.deleted_content_records drop constraint deleted_content_records_media_disposition_check;
alter table private.deleted_content_records add constraint deleted_content_records_media_disposition_check
 check(media_disposition in ('unknown','text_only','metadata_only','retained_original','reviewed_external_reference')),
 add column external_evidence_id uuid references private.deleted_content_external_reference_evidence(id),
 add constraint deleted_content_external_disposition_binding check(
  (media_disposition='reviewed_external_reference')=(external_evidence_id is not null));

-- Immutable captured archive identity. Purging is still the existing hold/claim
-- protocol; ordinary archives and their established lifecycle stay unchanged.
create function private.guard_deleted_content_external_archive() returns trigger
language plpgsql set search_path='' as $$ begin
 if old.external_evidence_id is not null or new.external_evidence_id is not null
  or old.media_disposition='reviewed_external_reference' or new.media_disposition='reviewed_external_reference'
 then raise exception 'external_reference_archive_immutable' using errcode='55000'; end if;
 return new;
end $$;
create trigger preserve_external_reference_archive before update on private.deleted_content_records
 for each row execute function private.guard_deleted_content_external_archive();

alter function private.capture_deleted_content_row(text,jsonb,boolean) rename to capture_deleted_content_row_before_external;
create function private.capture_deleted_content_row(p_type text,v jsonb,p_soft boolean default false) returns uuid
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare e private.deleted_content_external_reference_evidence; r private.deleted_content_records;
 b jsonb; t timestamptz; intent private.deleted_content_external_delete_intents;
begin
 perform private.deleted_media_reference_fence_armed();
 if p_type<>'creator_video' or not exists(select 1 from private.deleted_content_retention_settings where capture_enabled)
 then return private.capture_deleted_content_row_before_external(p_type,v,p_soft); end if;
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'retention_requires_read_committed' using errcode='25000'; end if;
 perform pg_advisory_xact_lock(176214,30);
 if private.deleted_content_source_coverage(p_type,v)<>'reviewed_external_reference'
 then return private.capture_deleted_content_row_before_external(p_type,v,p_soft); end if;
 if p_soft then raise exception 'external_reference_explicit_hard_delete_required' using errcode='55000'; end if;
 b:=private.deleted_content_external_reference_binding(v);
 delete from private.deleted_content_external_delete_intents
  where transaction_id=txid_current() and backend_id=pg_backend_pid() and target_id::text=v->>'id'
   and author::text=v->>'owner_id' and author=auth.uid() and source_binding=b returning * into intent;
 if intent.target_id is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
 then raise exception 'external_reference_explicit_hard_delete_required' using errcode='42501'; end if;
 if exists(select 1 from private.deleted_content_records d where d.target_type='creator_video' and d.target_id=v->>'id')
 then raise exception 'external_reference_existing_archive_requires_resolution' using errcode='55000'; end if;
 select * into strict e from private.deleted_content_external_reference_evidence where target_id::text=v->>'id' and source_binding=b;
 t:=clock_timestamp();
 insert into private.deleted_content_records(target_type,target_id,author,owner_protected,content,source_updated_at,
  source_created_at,deletion_kind,deleted_at,expires_at,media_disposition,external_evidence_id)
 values('creator_video',v->>'id',v->>'owner_id',exists(select 1 from public.platform_role_memberships
  where user_id=v->>'owner_id' and role='owner'),jsonb_build_object('title',v->'title','description',v->'description'),
  nullif(v->>'updated_at','')::timestamptz,(v->>'created_at')::timestamptz,'hard',t,t+interval '720 hours',
  'reviewed_external_reference',e.id) returning * into r;
 insert into private.deleted_content_external_reference_captures(deletion_id,evidence_id,target_id,author,source_created_at,
  source_binding,archive_sha256,deleted_at,expires_at)
 values(r.id,e.id,e.target_id,e.author,r.source_created_at,b,private.deleted_content_external_sha256(to_jsonb(r)),r.deleted_at,r.expires_at);
 insert into private.deleted_content_retention_events(operation,target_type,target_id,deletion_id,actor)
 values('capture',r.target_type,r.target_id,r.id,auth.uid()::text);
 return r.id;
end $$;

-- Fail closed both before expiry and in readiness. The source must remain absent;
-- a new incarnation with the old UUID never inherits deletion or text authority.
create function private.deleted_content_external_archive_supported(p_deletion_id uuid) returns boolean
language sql volatile security definer set search_path='' set timezone='UTC' as $$
 select exists(select 1 from private.deleted_content_records r
  join private.deleted_content_external_reference_captures c on c.deletion_id=r.id
  join private.deleted_content_external_reference_evidence e on e.id=c.evidence_id
  where r.id=p_deletion_id and r.target_type='creator_video' and r.deletion_kind='hard'
   and r.media_disposition='reviewed_external_reference' and r.external_evidence_id=e.id
   and (r.target_id,r.author,r.source_created_at,r.deleted_at,r.expires_at)
     is not distinct from (c.target_id::text,c.author::text,c.source_created_at,c.deleted_at,c.expires_at)
   and c.target_id=e.target_id and c.author=e.author and c.source_created_at=e.source_created_at::timestamptz
   and c.source_binding=e.source_binding and c.archive_sha256=private.deleted_content_external_sha256(to_jsonb(r))
   and not exists(select 1 from public.videos v where v.id=c.target_id)
   and not exists(select 1 from private.deleted_content_media_stages s where s.deletion_id=r.id
     or (s.target_type='creator_video' and s.target_id=r.target_id))
   and not exists(select 1 from private.deleted_media_key_retirements k where k.deletion_id=r.id
     or (k.target_type='creator_video' and k.target_id=r.target_id)))
$$;

alter function public.delete_retained_content(text,uuid,text,text,text,timestamptz) rename to delete_retained_content_before_external;
alter function public.delete_retained_content_before_external(text,uuid,text,text,text,timestamptz) set schema private;
create function public.delete_retained_content(p_type text,p_target uuid,p_provider text,p_bucket text,p_object_key text,p_source_created_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v jsonb; actor uuid:=auth.uid(); b jsonb; receipt private.deleted_content_external_reference_captures; removed integer;
begin
 if p_type is distinct from 'creator_video' or p_object_key is not null then
  return private.delete_retained_content_before_external(p_type,p_target,p_provider,p_bucket,p_object_key,p_source_created_at); end if;
 if not exists(select 1 from private.deleted_content_retention_settings where capture_enabled)
  and not exists(select 1 from private.deleted_content_external_reference_captures where target_id=p_target)
 then return jsonb_build_object('status','disabled','retentionHandled',false); end if;
 if actor is null or public.whole_app_exact_current_session_authority_internal() is distinct from true
 then raise exception 'deleted_content_current_session_required' using errcode='42501'; end if;
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'retention_requires_read_committed' using errcode='25000'; end if;
 select to_jsonb(x) into v from public.videos x where x.id=p_target for update;
 perform private.deleted_media_reference_fence_armed();
 perform pg_advisory_xact_lock(176214,30);
 if public.whole_app_exact_current_session_authority_internal() is distinct from true
 then raise exception 'deleted_content_current_session_required' using errcode='42501'; end if;
 if p_source_created_at is null then raise exception 'deleted_content_source_identity_required' using errcode='22023'; end if;
 if v is null then
  select * into receipt from private.deleted_content_external_reference_captures where target_id=p_target;
  if receipt.author=actor and receipt.source_created_at=p_source_created_at
    and receipt.source_binding->>'provider' is not distinct from p_provider
    and receipt.source_binding->>'bucket' is not distinct from p_bucket
    and exists(select 1 from private.deleted_content_external_reference_evidence e where e.id=receipt.evidence_id
      and e.target_id=receipt.target_id and e.author=receipt.author and e.source_binding=receipt.source_binding)
    and (not exists(select 1 from private.deleted_content_records r where r.id=receipt.deletion_id)
      or private.deleted_content_external_archive_supported(receipt.deletion_id)) then
   return jsonb_build_object('status','already_deleted','retentionHandled',true); end if;
  raise exception 'deleted_content_source_binding_changed' using errcode='55000';
 end if;
 if v->>'owner_id' is distinct from actor::text or v->>'storage_provider' is distinct from p_provider
  or v->>'storage_bucket' is distinct from p_bucket or (v->>'created_at')::timestamptz is distinct from p_source_created_at
  or coalesce(nullif(v->>'storage_object_key',''),v->>'storage_path') is distinct from p_object_key
 then raise exception 'deleted_content_source_binding_changed' using errcode='55000'; end if;
 if private.deleted_content_source_coverage('creator_video',v) is distinct from 'reviewed_external_reference' then
  return private.delete_retained_content_before_external(p_type,p_target,p_provider,p_bucket,p_object_key,p_source_created_at); end if;
 if not exists(select 1 from private.deleted_content_retention_settings where capture_enabled)
 then return jsonb_build_object('status','disabled','retentionHandled',false); end if;
 b:=private.deleted_content_external_reference_binding(v);
 insert into private.deleted_content_external_delete_intents values(txid_current(),pg_backend_pid(),p_target,actor,b);
 delete from public.videos where id=p_target;
 get diagnostics removed=row_count;
 if removed<>1 or not exists(select 1 from private.deleted_content_external_reference_captures c
   where c.target_id=p_target and c.author=actor and c.source_binding=b)
  or exists(select 1 from private.deleted_content_external_delete_intents where transaction_id=txid_current()
    and backend_id=pg_backend_pid() and target_id=p_target)
 then raise exception 'external_reference_capture_required' using errcode='55000'; end if;
 if public.whole_app_exact_current_session_authority_internal() is distinct from true
 then raise exception 'deleted_content_current_session_required' using errcode='42501'; end if;
 return jsonb_build_object('status','deleted','retentionHandled',true);
end $$;

alter function public.expire_deleted_content_text(uuid) rename to expire_deleted_content_text_before_external;
alter function public.expire_deleted_content_text_before_external(uuid) set schema private;
create function public.expire_deleted_content_text(p_deletion_id uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare r private.deleted_content_records; claim uuid;
begin
 if not exists(select 1 from private.deleted_content_retention_settings where text_expiry_enabled)
 then return jsonb_build_object('status','disabled'); end if;
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'retention_requires_read_committed' using errcode='25000'; end if;
 perform private.deleted_media_reference_fence_armed();
 perform pg_advisory_xact_lock(176214,30);
 select * into r from private.deleted_content_records where id=p_deletion_id for update;
 if r.id is null then return jsonb_build_object('status','already_absent'); end if;
 if r.media_disposition<>'reviewed_external_reference' and r.external_evidence_id is null
  and not exists(select 1 from private.deleted_content_external_reference_captures where deletion_id=r.id)
 then return private.expire_deleted_content_text_before_external(p_deletion_id); end if;
 if not private.deleted_content_external_archive_supported(r.id)
 then return jsonb_build_object('status','external_reference_archive_proof_required'); end if;
 if r.expires_at>clock_timestamp() then return jsonb_build_object('status','not_due'); end if;
 if exists(select 1 from public.legal_holds h where h.status='active'
  and private.deleted_content_hold_matches(h.target_type,h.target_id,r.target_type,r.target_id,r.author,r.parent_type,r.parent_id))
 then return jsonb_build_object('status','held'); end if;
 insert into private.deleted_content_expiry_claims(deletion_id,target_type,target_id,author,parent_type,parent_id,kind)
 values(r.id,r.target_type,r.target_id,r.author,r.parent_type,r.parent_id,'text_only') returning id into claim;
 insert into private.deleted_content_retention_events(operation,target_type,target_id,deletion_id,actor)
 values('claim',r.target_type,r.target_id,r.id,'service:retention_expiry');
 delete from private.deleted_content_records where id=r.id;
 update private.deleted_content_expiry_claims set completed_at=clock_timestamp() where id=claim;
 insert into private.deleted_content_retention_events(operation,target_type,target_id,deletion_id,actor)
 values('purge',r.target_type,r.target_id,r.id,'service:retention_expiry');
 return jsonb_build_object('status','purged','claimId',claim);
end $$;

-- Every new helper and the renamed implementations remain private. Existing
-- authenticated owner deletion and service-only expiry/readiness grants alone
-- are restored below; no consumer can enroll or forge evidence/capture intent.
revoke all on function private.deleted_content_external_sha256(jsonb),
 private.invalidate_deleted_content_external_source(),
 private.preserve_deleted_content_external_reference(),private.deleted_content_external_reference_binding(jsonb),
 private.deleted_content_external_reference_blocker(jsonb),private.read_deleted_content_external_reference_source(uuid),
 private.record_deleted_content_external_reference(uuid,jsonb,jsonb),private.guard_deleted_content_external_ownership(),
 private.deleted_content_external_guards_ready(),private.deleted_content_source_coverage_before_external(text,jsonb),
 private.deleted_content_source_coverage(text,jsonb),private.guard_deleted_content_external_archive(),
 private.capture_deleted_content_row_before_external(text,jsonb,boolean),private.capture_deleted_content_row(text,jsonb,boolean),
 private.deleted_content_external_archive_supported(uuid),
 private.delete_retained_content_before_external(text,uuid,text,text,text,timestamptz),
 private.expire_deleted_content_text_before_external(uuid)
 from public,anon,authenticated,service_role;
revoke all on function public.delete_retained_content(text,uuid,text,text,text,timestamptz),public.expire_deleted_content_text(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.delete_retained_content(text,uuid,text,text,text,timestamptz) to authenticated;
grant execute on function public.expire_deleted_content_text(uuid) to service_role;

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

 -- A durable hard-delete receipt permanently fences UUID reuse. Dormant
 -- evidence alone does not: it must be revalidated after every disabled write.
 if exists(select 1 from private.deleted_content_external_reference_captures c
   where tg_table_name='videos' and c.target_id::text=to_jsonb(new)->>'id') then
   raise exception 'external_reference_captured_source_cannot_return' using errcode='55000'; end if;
 if not exists(select 1 from private.deleted_content_retention_settings where capture_enabled) then return new; end if;
 if tg_table_name='videos' and exists(select 1 from private.deleted_content_external_reference_evidence e
   where (e.target_id::text=to_jsonb(new)->>'id'
    or (tg_op='UPDATE' and e.target_id::text=to_jsonb(old)->>'id'))
    and not exists(select 1 from private.deleted_content_external_reference_invalidations i where i.evidence_id=e.id)) then
   -- This precedes the ordinary unchanged-locator shortcut: source incarnation,
   -- provider, bucket, full schema and every reference identity stay bound.
   reason:=private.deleted_content_source_coverage('creator_video',to_jsonb(new));
   if tg_op='INSERT' or reason not in ('reviewed_external_reference','eligible_r2_original') then
     raise exception 'retention_source_coverage_required: %',reason using errcode='55000'; end if;
   return new;
 end if;
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

create or replace function public.deleted_content_expiry_readiness() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare inventory jsonb; uncovered bigint; attached_stages bigint; secondary_count bigint; brand_count bigint;
 outstanding_scans bigint; exhausted_scans bigint; unknown_archives bigint:=0; unsupported_soft_archives bigint:=0;
 unproven_stages bigint; blockers text[]:='{}';
 settings private.deleted_content_retention_settings%rowtype;
 qualification private.deleted_content_rollout_qualification%rowtype;
 heartbeat timestamptz; references_ready boolean; source_guards_ready boolean; protocol_ready boolean; capture_guards_ready boolean;
begin
 select * into settings from private.deleted_content_retention_settings where singleton;
 if not found then blockers:=array_append(blockers,'retention_settings_missing'); end if;
 select * into qualification from private.deleted_content_rollout_qualification where singleton;
 select last_completed_at into heartbeat from private.deleted_content_worker_health where singleton;
 with sources as (
   select 'creator_video'::text kind,to_jsonb(v) source from public.videos v
   union all select 'social_attachment',to_jsonb(a) from public.social_attachments a
 ), classified as (
   select kind,coalesce(source->>'storage_provider','unknown') provider,
     private.deleted_content_source_coverage(kind,source) coverage from sources
 ), groups as (
   select kind,provider,coverage,count(*) n from classified group by kind,provider,coverage
 )
 select coalesce(jsonb_agg(jsonb_build_object('targetType',kind,'provider',provider,'coverage',coverage,'count',n)
   order by kind,provider,coverage),'[]'::jsonb),
   coalesce(sum(n) filter(where coverage not in ('eligible_r2_original','retained_r2_original','metadata_only','reviewed_external_reference')),0)
 into inventory,uncovered from groups;
 select (select count(*) from public.video_renditions r left join public.videos v on v.id=r.video_id
     where not private.deleted_content_original_rendition_alias(to_jsonb(r),to_jsonb(v)))
   +(select count(*) from public.media_renditions where source_type='creator_video' or video_id is not null)
   +(select count(*) from public.media_transcode_jobs where source_type='creator_video') into secondary_count;
 select count(*) into brand_count from public.platform_brand_assets;
 if exists(select 1 from pg_catalog.pg_attribute where attrelid='private.deleted_content_records'::regclass
   and attname='media_disposition' and not attisdropped) then
   execute $query$select count(*) from private.deleted_content_records d
     where d.target_type in ('creator_video','social_attachment') and
       (d.media_disposition='unknown' or (d.media_disposition='reviewed_external_reference' and not private.deleted_content_external_archive_supported(d.id)) or (d.media_disposition='retained_original' and not exists(
         select 1 from private.deleted_media_key_retirements registry
         join private.deleted_content_media_stages s on s.id=registry.stage_id
         where registry.deletion_id=d.id and s.deletion_id=d.id and registry.status in ('retained','claimed')
           and registry.target_type=d.target_type and registry.target_id=d.target_id and registry.author=d.author
           and registry.provider=s.provider and registry.bucket=s.bucket and registry.object_key=s.object_key
       )))$query$ into unknown_archives;
   execute $query$select count(*) from private.deleted_content_records d
     where d.target_type in ('creator_video','social_attachment') and d.deletion_kind='soft'
       and not private.deleted_content_soft_media_coverage(d.id)$query$ into unsupported_soft_archives;
 end if;
 select count(*) into unproven_stages from private.deleted_content_media_stages s
 where s.deletion_id is not null and not exists(select 1 from private.deleted_media_key_retirements r
   where r.stage_id=s.id and ((r.status in ('retained','claimed') and r.deletion_id=s.deletion_id)
     or r.status='cleanup_claimed'));
 select count(*),count(*) filter(where status in ('scan_failed','manual_review') or attempt_count>=max_attempts)
 into outstanding_scans,exhausted_scans from public.media_scan_jobs
 where target_table in ('videos','social_attachments','video_renditions','platform_brand_assets')
   and status not in ('clean','malware_detected','quarantined');
 select count(*) into attached_stages from private.deleted_content_media_stages s
 left join private.deleted_media_key_retirements registry on registry.stage_id=s.id
 where (s.deletion_id is null or registry.status='staged') and (
   (s.target_type='creator_video' and exists(select 1 from public.videos v where v.id::text=s.target_id
     and s.object_key in (coalesce(nullif(v.storage_object_key,''),v.storage_path,''),coalesce(v.thumb_storage_path,''))))
   or (s.target_type='social_attachment' and exists(select 1 from public.social_attachments a where a.id::text=s.target_id
     and s.object_key=coalesce(nullif(a.storage_object_key,''),a.storage_path,'')))
 );
 references_ready:=private.deleted_media_reference_coverage_ready();
 source_guards_ready:=not exists(select 1 from unnest(array['public.videos'::regclass,'public.social_attachments'::regclass]) rel
   where not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=rel
     and t.tgfoid='private.guard_deleted_content_source_coverage()'::regprocedure
     and t.tgenabled in ('O','A') and (t.tgtype::integer & 23)=23 and t.tgqual is null))
   and not exists(select 1 from unnest(array['public.video_renditions'::regclass,'public.media_renditions'::regclass,
     'public.media_transcode_jobs'::regclass,'public.platform_brand_assets'::regclass]) rel
     where not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=rel
       and t.tgfoid='private.guard_deleted_content_secondary_coverage()'::regprocedure
       and t.tgenabled in ('O','A') and (t.tgtype::integer & 23)=23 and t.tgqual is null));
 protocol_ready:=to_regprocedure('public.reconcile_deleted_content_stage(uuid)') is not null
   and to_regprocedure('public.read_deleted_content_stage_cleanup_claim(uuid)') is not null
   and to_regprocedure('public.record_deleted_content_stage_cleanup_result(uuid,text)') is not null
   and to_regprocedure('public.list_deleted_content_stage_cleanup_work()') is not null
   and to_regprocedure('public.delete_retained_content(text,uuid,text,text,text,timestamptz)') is not null
   and to_regprocedure('private.cleanup_expired_deleted_attachment_source(uuid)') is not null
   and to_regprocedure('private.stage_deleted_content_media_internal(text,text,text,text,text,uuid)') is not null
   and exists(select 1 from pg_catalog.pg_attribute where attrelid='private.deleted_content_records'::regclass
     and attname='media_disposition' and not attisdropped);
 capture_guards_ready:=not exists(select 1 from unnest(array[
   'public.profile_posts'::regclass,'public.profile_post_comments'::regclass,'public.creator_video_comments'::regclass,
   'public.chat_messages'::regclass,'public.watch_party_room_messages'::regclass,'public.videos'::regclass,
   'public.social_attachments'::regclass,'public.platform_brand_assets'::regclass]) rel
   where not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=rel
     and t.tgfoid='private.capture_deleted_content_trigger()'::regprocedure
     and t.tgenabled in ('O','A') and (t.tgtype::integer & 11)=11 and t.tgqual is null))
   and not exists(select 1 from pg_catalog.pg_attribute a
     where a.attrelid=any(array['public.profile_posts'::regclass,'public.profile_post_comments'::regclass,
       'public.creator_video_comments'::regclass,'public.chat_messages'::regclass,'public.watch_party_room_messages'::regclass,
       'public.videos'::regclass,'public.social_attachments'::regclass,'public.platform_brand_assets'::regclass])
       and a.attname='deleted_at' and not a.attisdropped
       and not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=a.attrelid
         and t.tgfoid='private.capture_deleted_content_trigger()'::regprocedure
         and t.tgenabled in ('O','A') and (t.tgtype::integer & 19)=19 and t.tgqual is null
         and (cardinality(t.tgattr::smallint[])=0 or a.attnum=any(t.tgattr::smallint[]))));
 if uncovered>0 then blockers:=array_append(blockers,'current_media_inventory_not_fully_covered'); end if;
 if secondary_count>0 then blockers:=array_append(blockers,'secondary_media_cleanup_not_covered'); end if;
 if brand_count>0 then blockers:=array_append(blockers,'platform_brand_media_not_covered'); end if;
 if outstanding_scans>0 then blockers:=array_append(blockers,'outstanding_scan_references_require_resolution'); end if;
 if unknown_archives>0 or unproven_stages>0 then blockers:=array_append(blockers,'historical_media_provenance_requires_resolution'); end if;
 if unsupported_soft_archives>0 then blockers:=array_append(blockers,'unsupported_soft_media_archive_cleanup'); end if;
 if attached_stages>0 then blockers:=array_append(blockers,'attached_legacy_stages_require_fresh_content_delete_intent'); end if;
 if not private.deleted_content_external_guards_ready() then blockers:=array_append(blockers,'external_reference_ownership_guard_coverage_incomplete'); end if;
 if not references_ready or not source_guards_ready then blockers:=array_append(blockers,'media_admission_guard_coverage_incomplete'); end if;
 if not capture_guards_ready then blockers:=array_append(blockers,'content_capture_guard_coverage_incomplete'); end if;
 if not protocol_ready then blockers:=array_append(blockers,'recovery_protocol_missing'); end if;
 if not settings.legacy_object_deletes_blocked then blockers:=array_append(blockers,'legacy_object_delete_gate_open'); end if;
 if qualification.legacy_delete_drain_evidence is null or qualification.qualified_at is null
   or settings.legacy_object_deletes_blocked_at is null
   or qualification.qualified_at<settings.legacy_object_deletes_blocked_at then
   blockers:=array_append(blockers,'pre_gate_provider_requests_not_qualified_drained');
 end if;
 if qualification.source_revision is null or qualification.qualified_at is null or qualification.qualified_at>clock_timestamp()
   or qualification.client_enforcement_evidence is null then blockers:=array_append(blockers,'consumer_rollout_not_qualified'); end if;
 if qualification.worker_schedule_evidence is null then blockers:=array_append(blockers,'worker_schedule_not_qualified'); end if;
 if qualification.origin_cleanup_evidence is null then blockers:=array_append(blockers,'origin_cleanup_not_qualified'); end if;
 if heartbeat is null or heartbeat<clock_timestamp()-interval '15 minutes' or heartbeat>clock_timestamp() then
   blockers:=array_append(blockers,'worker_completion_missing_or_stale');
 end if;
 return jsonb_build_object(
   'ready',cardinality(blockers)=0,'blockers',to_jsonb(blockers),
   'flags',to_jsonb(settings)-'singleton','inventory',inventory,'uncoveredSourceCount',uncovered,
   'secondaryMediaSourceCount',secondary_count,'platformBrandMediaSourceCount',brand_count,
   'outstandingScanReferencesCount',outstanding_scans,'failedOrExhaustedScanReferencesCount',exhausted_scans,
   'unprovenMediaArchiveCount',unknown_archives,'unprovenFinalizedStageCount',unproven_stages,
   'unsupportedSoftMediaArchiveCount',unsupported_soft_archives,
   'platformBrandMediaCoverage','unsupported','secondaryMediaCoverage','unsupported',
   'attachedLegacyStageCount',attached_stages,'referenceGuardCoverage',references_ready,
   'sourceAdmissionGuardCoverage',source_guards_ready,'protocolInstalled',protocol_ready,
   'contentCaptureGuardCoverage',capture_guards_ready,
   'retentionScope','verified_private_r2_originals_and_reviewed_external_text',
   'reviewedExternalReferenceSourceCount',(select count(*) from public.videos v
     where private.deleted_content_source_coverage('creator_video',to_jsonb(v))='reviewed_external_reference'),
   'reviewedExternalReferenceArchiveCount',(select count(*) from private.deleted_content_records d
     where d.media_disposition='reviewed_external_reference' and private.deleted_content_external_archive_supported(d.id)),
   'externalReferencePhysicalDeletionAllowed',false,'supabaseDirectStorageCoverage','unsupported',
   'legacyObjectDeleteBehavior','object_only_requests_rejected_after_gate_closure',
   'unattachedUploadCleanupCoverage','outside_retained_original_protocol',
   'physicalDeletionAllowed',false,'perObjectIrreversibleClaimRequired',true,
   'permanentPhysicalAbsenceGuaranteed',false,
   'workerLastCompletedAt',heartbeat,'workerCompletionProves','bounded_worker_pass_only',
   'scheduleObservedByDatabase',false,'rolloutEvidenceAuthority','operator_assertions_not_independently_verified',
   'sourceRevision',qualification.source_revision,'qualifiedAt',qualification.qualified_at);
end $$;
revoke all on function public.deleted_content_expiry_readiness() from public,anon,authenticated;
grant execute on function public.deleted_content_expiry_readiness() to service_role;

commit;
