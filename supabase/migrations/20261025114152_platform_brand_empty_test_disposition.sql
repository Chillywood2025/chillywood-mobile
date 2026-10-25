begin;
-- SOURCE ONLY: no authorization rows, activation, Owner impersonation or origin
-- calls. Exact private authorizations require separately approved population.
select private.platform_brand_retention_lock();
create table private.platform_brand_empty_authorizations (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid not null unique references private.platform_brand_object_incarnations(asset_id),
 owner_decision_sha256 text not null check(owner_decision_sha256 ~ '^[0-9a-f]{64}$'),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 authorized_at timestamptz not null default clock_timestamp()
);
create table private.platform_brand_empty_observations (
 id uuid primary key default gen_random_uuid(),
 authorization_id uuid not null references private.platform_brand_empty_authorizations(id),
 observation_token uuid not null unique default gen_random_uuid(),
 started_at timestamptz not null default clock_timestamp()
);
-- A private receipt of a NEW, genuine canonical Owner operation. This is not a
-- global capture, historical actor backfill, scan receipt or media proof.
create table private.platform_brand_empty_owner_removals (
 authorization_id uuid primary key references private.platform_brand_empty_authorizations(id),
 asset_id uuid not null unique references private.platform_brand_object_incarnations(asset_id),
 actor text not null,
 operation_started_at timestamptz not null,
 recorded_at timestamptz not null default clock_timestamp(),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 global_capture_recorded boolean not null,
 check(recorded_at>=operation_started_at)
);
create table private.platform_brand_empty_dispositions (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid not null unique references private.platform_brand_object_incarnations(asset_id),
 observation_id uuid not null unique references private.platform_brand_empty_observations(id),
 result jsonb not null,
 evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 recorded_at timestamptz not null default clock_timestamp()
);
create table private.platform_brand_empty_claim_evidence (
 claim_token uuid primary key references private.platform_brand_expiry_claims(claim_token),
 asset_id uuid not null unique references private.platform_brand_object_incarnations(asset_id),
 evidence_kind text not null default 'archived_empty_test' check(evidence_kind='archived_empty_test'),
 disposition_id uuid not null references private.platform_brand_empty_dispositions(id),
 evidence_sha256 text not null,
 binding jsonb not null
);
do $$ declare t text; begin
 foreach t in array array['platform_brand_empty_authorizations','platform_brand_empty_observations',
  'platform_brand_empty_dispositions','platform_brand_empty_claim_evidence','platform_brand_empty_owner_removals'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('alter table private.%I force row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger empty_evidence_immutable before update or delete on private.%I for each row execute function private.platform_brand_retention_immutable()',t);
  execute format('create trigger empty_evidence_no_truncate before truncate on private.%I for each statement execute function private.platform_brand_retention_immutable()',t);
 end loop;
end $$;
create or replace function private.platform_brand_retention_references_clear(p_asset_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r private.platform_brand_object_incarnations%rowtype; t record; found_ref boolean; predicate text;
begin
 perform private.platform_brand_retention_lock();
 select * into r from private.platform_brand_object_incarnations where asset_id=p_asset_id;
 if r.asset_id is null or r.removed_at is null or to_regclass('public.platform_brand_publications') is null then return false; end if;
 if exists(select 1 from public.platform_brand_profiles p where r.asset_id=any(array[p.hero_image_asset_id,p.hero_video_asset_id,p.hero_poster_asset_id,p.background_image_asset_id,p.avatar_asset_id,p.logo_asset_id,p.watermark_asset_id]))
 or exists(select 1 from public.platform_brand_publications p where r.asset_id=any(array[p.hero_image_asset_id,p.hero_video_asset_id,p.hero_poster_asset_id,p.background_image_asset_id,p.avatar_asset_id,p.logo_asset_id,p.watermark_asset_id])) then return false; end if;
 for t in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p') and cardinality(private.deleted_media_locator_columns(c.oid))>0 loop
   if not exists(select 1 from pg_trigger g where g.tgrelid=t.oid and g.tgfoid='private.guard_platform_brand_retention_references()'::regprocedure
     and g.tgenabled in ('O','A') and (g.tgtype::int & 23)=23 and g.tgqual is null) then return false; end if;
   predicate:='true';
   if t.oid in (to_regclass('public.platform_brand_asset_review_events'),to_regclass('public.platform_admin_audit_logs')) then predicate:=format('not private.platform_brand_review_evidence_matches(%s::oid,to_jsonb(x),%L::uuid)',t.oid,r.asset_id); end if;
   if t.relname='platform_brand_assets' then predicate:=format('id<>%L::uuid',r.asset_id); end if;
   -- Only the exact proved terminal scan is evidence, not a live delivery alias.
   -- All other scans/reservations and unexpected references remain blockers.
   if t.relname='media_scan_jobs' and to_regclass('private.media_scan_byte_receipts') is not null then
     predicate:=format('not private.platform_brand_empty_history_matches(%L::uuid,to_jsonb(x)) and id not in (select observation.job_id from private.platform_brand_object_proofs proof join private.media_scan_byte_receipts receipt on receipt.id=proof.scan_receipt_id join private.media_scan_byte_observations observation on observation.id=receipt.observation_id where proof.asset_id=%L::uuid and (private.platform_brand_scan_byte_receipt_matches(receipt.id,proof.binding,proof.origin_sha256,proof.origin_size_bytes) or private.platform_brand_claimed_scan_evidence_matches(proof.asset_id,receipt.id,proof.binding,proof.origin_sha256,proof.origin_size_bytes)))',r.asset_id,r.asset_id);
   end if;
   execute format('select exists(select 1 from public.%I x where %s and (private.deleted_media_mentions(private.deleted_media_locator_document(to_jsonb(x),%s::oid),$1) or private.deleted_media_mentions(private.deleted_media_locator_document(to_jsonb(x),%s::oid),$2)))',t.relname,predicate,t.oid,t.oid)
     into found_ref using r.object_key,r.storage_path;
   if found_ref then return false; end if;
 end loop;
 return true;
end $$;

alter function private.deleted_content_brand_source_coverage(jsonb,boolean) rename to deleted_content_brand_source_coverage_before_empty;
create function private.deleted_content_brand_source_coverage(p_source jsonb,p_require_proof boolean default true)
returns text language plpgsql security definer set search_path='' as $$
declare previous text; id uuid; absent boolean;
begin
 previous:=private.deleted_content_brand_source_coverage_before_empty(p_source,p_require_proof);
 if not p_require_proof or previous not in ('brand_scan_proof_required','brand_claimed_scan_evidence_unavailable') then return previous; end if;
 id:=(p_source->>'id')::uuid;
 if not private.platform_brand_empty_evidence_matches(id,true) then return previous; end if;
 select not exists(select 1 from storage.objects o where o.bucket_id=r.bucket and o.name=r.object_key) into absent
 from private.platform_brand_object_incarnations r where r.asset_id=id;
 return case when absent then 'claimed_empty_test' else 'retained_empty_test' end;
end $$;
alter function public.claim_platform_brand_retention_expiry(uuid) rename to claim_platform_brand_retention_expiry_before_empty;
alter function public.claim_platform_brand_retention_expiry_before_empty(uuid) set schema private;
create function public.claim_platform_brand_retention_expiry(p_asset_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.platform_brand_object_incarnations%rowtype; c private.platform_brand_expiry_claims%rowtype; b jsonb; d private.platform_brand_empty_dispositions%rowtype;
begin
 perform private.platform_brand_retention_lock();
 select * into d from private.platform_brand_empty_dispositions where asset_id=p_asset_id;
 if d.id is null then return private.claim_platform_brand_retention_expiry_before_empty(p_asset_id); end if;
 -- An existing claim is never reinterpreted as empty evidence.
 select * into c from private.platform_brand_expiry_claims where asset_id=p_asset_id;
 if c.asset_id is not null then
  if not exists(select 1 from private.platform_brand_empty_claim_evidence where claim_token=c.claim_token) then return jsonb_build_object('status','claim_evidence_conflict'); end if;
  b:=public.read_platform_brand_retention_expiry_claim(p_asset_id,c.claim_token);
  if b->>'status'='authorized' then return b||jsonb_build_object('status','claimed'); end if;
  return b;
 end if;
 if not exists(select 1 from private.platform_brand_retention_settings where expiry_enabled and version_delete_verified
  and provider_origin is not null and provider_contract_sha256 is not null) then return jsonb_build_object('status','transport_unqualified_or_disabled'); end if;
 if not exists(select 1 from private.platform_brand_retention_settings where expiry_enabled) then return jsonb_build_object('status','disabled'); end if;
 if to_regclass('public.platform_brand_publications') is null then return jsonb_build_object('status','publication_schema_unavailable'); end if;
 if exists(select 1 from (values
   ('storage.objects','private.guard_platform_brand_storage_incarnation()',31),
   ('public.platform_brand_assets','private.guard_platform_brand_retained_asset()',31),
   ('public.legal_holds','private.guard_platform_brand_retention_hold()',23),
   ('public.platform_brand_profiles','private.guard_platform_brand_retention_profile()',23),
   ('public.platform_brand_publications','private.guard_platform_brand_retention_profile()',23)
 ) required(relation,func,mask) where not exists(select 1 from pg_trigger g
   where g.tgrelid=required.relation::regclass and g.tgfoid=required.func::regprocedure
   and g.tgenabled in ('O','A') and (g.tgtype::int & required.mask)=required.mask and g.tgqual is null)) then
   return jsonb_build_object('status','required_guard_unavailable'); end if;
 select * into r from private.platform_brand_object_incarnations where asset_id=p_asset_id;
 if r.asset_id is null or r.removed_at is null then return jsonb_build_object('status','not_removed'); end if;
 if r.retain_until>clock_timestamp() then return jsonb_build_object('status','not_due'); end if;
 if exists(select 1 from public.legal_holds h where h.status='active' and private.deleted_content_hold_matches(h.target_type,h.target_id,'platform_brand_asset',r.asset_id::text,r.owner_id,null,null)) then return jsonb_build_object('status','held'); end if;
 if not private.platform_brand_retention_references_clear(p_asset_id) then return jsonb_build_object('status','references_or_coverage_blocked'); end if;
 b:=public.read_platform_brand_retention_binding(p_asset_id);
 if b is null or not private.platform_brand_empty_evidence_matches(p_asset_id,false) then return jsonb_build_object('status','empty_evidence_unavailable'); end if;
 insert into private.platform_brand_expiry_claims(asset_id) values(p_asset_id) on conflict do nothing;
 select * into c from private.platform_brand_expiry_claims where asset_id=p_asset_id;
 insert into private.platform_brand_empty_claim_evidence(claim_token,asset_id,disposition_id,evidence_sha256,binding)
 values(c.claim_token,p_asset_id,d.id,d.evidence_sha256,b);
 return b||jsonb_build_object('evidenceKind','archived_empty_test','status','claimed','claimToken',c.claim_token,'retainUntil',r.retain_until,
   'guarantee','permanent_nonreuse_with_qualified_writer_drain');
end $$;

alter function public.read_platform_brand_retention_expiry_claim(uuid,uuid) rename to read_platform_brand_retention_expiry_claim_before_empty;
alter function public.read_platform_brand_retention_expiry_claim_before_empty(uuid,uuid) set schema private;
create function public.read_platform_brand_retention_expiry_claim(p_asset_id uuid,p_claim_token uuid)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare r private.platform_brand_object_incarnations%rowtype;
 c private.platform_brand_expiry_claims%rowtype; s private.platform_brand_retention_settings%rowtype;
 e private.platform_brand_empty_claim_evidence%rowtype; a public.platform_brand_assets%rowtype; o storage.objects%rowtype;
begin
 perform private.platform_brand_retention_lock();
 select * into e from private.platform_brand_empty_claim_evidence where asset_id=p_asset_id and claim_token=p_claim_token;
 if e.claim_token is null then return private.read_platform_brand_retention_expiry_claim_before_empty(p_asset_id,p_claim_token); end if;
 select * into s from private.platform_brand_retention_settings;
 if not coalesce(s.expiry_enabled,false) then return jsonb_build_object('status','disabled'); end if;
 if not coalesce(s.version_delete_verified,false) or s.provider_contract_sha256 is null or s.provider_origin is null then
  return jsonb_build_object('status','provider_contract_unqualified'); end if;
 select * into c from private.platform_brand_expiry_claims where asset_id=p_asset_id and claim_token=p_claim_token;
 if c.asset_id is null then return jsonb_build_object('status','claim_unavailable'); end if;
 if to_regclass('public.platform_brand_publications') is null then return jsonb_build_object('status','publication_schema_unavailable'); end if;
 if exists(select 1 from (values
   ('storage.objects','private.guard_platform_brand_storage_incarnation()',31),
   ('public.platform_brand_assets','private.guard_platform_brand_retained_asset()',31),
   ('public.legal_holds','private.guard_platform_brand_retention_hold()',23),
   ('public.platform_brand_profiles','private.guard_platform_brand_retention_profile()',23),
   ('public.platform_brand_publications','private.guard_platform_brand_retention_profile()',23)
 ) required(relation,func,mask) where not exists(select 1 from pg_trigger g
   where g.tgrelid=required.relation::regclass and g.tgfoid=required.func::regprocedure
   and g.tgenabled in ('O','A') and (g.tgtype::int & required.mask)=required.mask and g.tgqual is null)) then
  return jsonb_build_object('status','required_guard_unavailable'); end if;
 select * into r from private.platform_brand_object_incarnations where asset_id=p_asset_id;
 select * into a from public.platform_brand_assets where id=p_asset_id for share nowait;
 if r.asset_id is null or a.id is null or r.removed_at is null or r.retain_until>clock_timestamp()
  or r.provider<>'supabase' or r.storage_object_id is null or nullif(r.storage_version,'') is null
  or a.deleted_at is null
  or (a.owner_user_id,a.created_at,a.storage_provider,a.storage_bucket,a.storage_object_key,a.storage_path)
   is distinct from (r.owner_id,r.source_created_at,r.provider,r.bucket,r.object_key,r.storage_path) then
  return jsonb_build_object('status','incarnation_unavailable'); end if;
 if exists(select 1 from public.legal_holds h where h.status='active'
  and private.deleted_content_hold_matches(h.target_type,h.target_id,'platform_brand_asset',r.asset_id::text,r.owner_id,null,null)) then
  return jsonb_build_object('status','held'); end if;
 if not private.platform_brand_retention_references_clear(p_asset_id) then return jsonb_build_object('status','references_or_coverage_blocked'); end if;
 select * into o from storage.objects where bucket_id=r.bucket and name=r.object_key for share nowait;
 if o.id is not null and (o.id is distinct from r.storage_object_id or to_jsonb(o)->>'version' is distinct from r.storage_version) then
  return jsonb_build_object('status','storage_generation_changed'); end if;
 if not private.platform_brand_empty_evidence_matches(p_asset_id,true)
  or not exists(select 1 from private.platform_brand_empty_dispositions d where d.asset_id=p_asset_id
    and d.id=e.disposition_id and d.evidence_sha256=e.evidence_sha256)
  or e.binding is distinct from (select x.snapshot->'binding' from private.platform_brand_empty_authorizations x where x.asset_id=p_asset_id)
 then return jsonb_build_object('status','empty_claim_evidence_unavailable'); end if;
 return e.binding||jsonb_build_object('evidenceKind','archived_empty_test','status','authorized','claimToken',c.claim_token,
  'providerOrigin',s.provider_origin,'providerContractSha256',s.provider_contract_sha256,
  'exactVersionDelete',true,'metadataPresent',o.id is not null,
  'observationOnly',o.id is null or exists(select 1 from private.platform_brand_expiry_dispatch_intents d where d.claim_token=c.claim_token)
    or exists(select 1 from private.platform_brand_expiry_transport_results t where t.asset_id=p_asset_id and t.claim_token=c.claim_token and t.outcome in ('delete_acknowledged','observed_absent')),
  'deleteAcknowledged',exists(select 1 from private.platform_brand_expiry_transport_results t where t.asset_id=p_asset_id and t.claim_token=c.claim_token and t.outcome in ('delete_acknowledged','observed_absent')),
  'permanentlyAbsent',false);
exception when lock_not_available then return jsonb_build_object('status','contended');
end $$;

create or replace function public.deleted_content_expiry_readiness() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare inventory jsonb; uncovered bigint; attached_stages bigint; secondary_count bigint; brand_count bigint;
 outstanding_scans bigint; exhausted_scans bigint; unknown_archives bigint:=0; unsupported_soft_archives bigint:=0;
 unproven_stages bigint; blockers text[]:='{}';
 settings private.deleted_content_retention_settings%rowtype;
 qualification private.deleted_content_rollout_qualification%rowtype;
 heartbeat timestamptz; references_ready boolean; source_guards_ready boolean; protocol_ready boolean; capture_guards_ready boolean;
 brand_uncovered bigint; brand_proof_missing bigint; brand_evidence_missing bigint; brand_empty_supported bigint; brand_delegation_missing bigint; brand_guards boolean; brand_qualified boolean;
 brand_settings private.platform_brand_retention_settings%rowtype; brand_health private.platform_brand_retention_worker_health%rowtype;
begin
 perform private.platform_brand_retention_lock();
 select * into brand_settings from private.platform_brand_retention_settings where singleton;
 select * into brand_health from private.platform_brand_retention_worker_health where singleton;
 brand_guards:=private.deleted_content_brand_guards_ready();
 brand_qualified:=private.deleted_content_brand_transport_qualified();
 select * into settings from private.deleted_content_retention_settings where singleton;
 if not found then blockers:=array_append(blockers,'retention_settings_missing'); end if;
 select * into qualification from private.deleted_content_rollout_qualification where singleton;
 select last_completed_at into heartbeat from private.deleted_content_worker_health where singleton;
 with sources as (
   select 'creator_video'::text kind,to_jsonb(v) source from public.videos v
   union all select 'social_attachment',to_jsonb(a) from public.social_attachments a
   union all select 'platform_brand_asset',to_jsonb(a) from public.platform_brand_assets a
 ), classified as (
   select kind,coalesce(source->>'storage_provider','unknown') provider,
     case when kind='platform_brand_asset' then private.deleted_content_brand_source_coverage(source)
      else private.deleted_content_source_coverage(kind,source) end coverage from sources
 ), groups as (
   select kind,provider,coverage,count(*) n from classified group by kind,provider,coverage
 )
 select coalesce(jsonb_agg(jsonb_build_object('targetType',kind,'provider',provider,'coverage',coverage,'count',n)
   order by kind,provider,coverage),'[]'::jsonb),
   coalesce(sum(n) filter(where coverage not in ('eligible_r2_original','retained_r2_original','metadata_only','reviewed_external_reference','brand_verified_original','brand_claimed_original','retained_empty_test','claimed_empty_test')),0)
 into inventory,uncovered from groups;
 select (select count(*) from public.video_renditions r left join public.videos v on v.id=r.video_id
     where not private.deleted_content_original_rendition_alias(to_jsonb(r),to_jsonb(v)))
   +(select count(*) from public.media_renditions where source_type='creator_video' or video_id is not null)
   +(select count(*) from public.media_transcode_jobs where source_type='creator_video') into secondary_count;
 select count(*),count(*) filter(where private.deleted_content_brand_source_coverage(to_jsonb(a),false)<>'brand_exact_incarnation'),
  count(*) filter(where private.deleted_content_brand_source_coverage(to_jsonb(a)) not in ('brand_verified_original','brand_claimed_original'))
 into brand_count,brand_uncovered,brand_proof_missing from public.platform_brand_assets a;
 select count(*) filter(where private.deleted_content_brand_source_coverage(to_jsonb(a)) not in
  ('brand_verified_original','brand_claimed_original','retained_empty_test','claimed_empty_test')),
 count(*) filter(where private.deleted_content_brand_source_coverage(to_jsonb(a)) in ('retained_empty_test','claimed_empty_test'))
 into brand_evidence_missing,brand_empty_supported from public.platform_brand_assets a;
 select count(*) into brand_delegation_missing from private.deleted_content_records d
 where d.target_type='platform_brand_asset' and not exists(select 1 from private.deleted_content_brand_delegations b
  join private.platform_brand_object_incarnations r on r.asset_id=b.asset_id
  where b.deletion_id=d.id and d.target_id=b.asset_id::text and d.author=b.owner_id and d.source_created_at=b.source_created_at
   and d.content is null and (b.owner_id,b.source_created_at,b.removed_at,b.retain_until)
    is not distinct from (r.owner_id,r.source_created_at,r.removed_at,r.retain_until));
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
     'public.media_transcode_jobs'::regclass]) rel
     where not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=rel
       and t.tgfoid='private.guard_deleted_content_secondary_coverage()'::regprocedure
       and t.tgenabled in ('O','A') and (t.tgtype::integer & 23)=23 and t.tgqual is null))
   and brand_guards;
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
 if brand_uncovered>0 then blockers:=array_append(blockers,'platform_brand_incarnation_coverage_incomplete'); end if;
 if brand_evidence_missing>0 then blockers:=array_append(blockers,'platform_brand_exact_scan_proof_incomplete'); end if;
 if brand_delegation_missing>0 then blockers:=array_append(blockers,'platform_brand_delegation_incomplete'); end if;
 if brand_count>0 and not brand_qualified then blockers:=array_append(blockers,'platform_brand_transport_not_qualified'); end if;
 if brand_count>0 and not coalesce(brand_settings.expiry_enabled,false) then blockers:=array_append(blockers,'platform_brand_expiry_not_enabled'); end if;
 if brand_count>0 and not coalesce(brand_settings.batch_enabled,false) then blockers:=array_append(blockers,'platform_brand_batch_not_enabled'); end if;
 if brand_count>0 and (brand_health.last_completed_at is null or brand_health.last_completed_at<clock_timestamp()-interval '15 minutes'
  or brand_health.last_completed_at>clock_timestamp() or not coalesce(brand_health.qualified,false))
 then blockers:=array_append(blockers,'platform_brand_worker_completion_missing_or_stale'); end if;
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
   'platformBrandMediaCoverage','delegated_exact_brand_lifecycle','secondaryMediaCoverage','unsupported',
   'platformBrandMissingRetentionEvidenceCount',brand_evidence_missing,'platformBrandSupportedEmptyTestCount',brand_empty_supported,
   'platformBrandUncoveredIncarnationCount',brand_uncovered,'platformBrandMissingCurrentScanProofCount',brand_proof_missing,
   'platformBrandUnboundArchiveCount',brand_delegation_missing,'platformBrandGuardCoverage',brand_guards,
   'platformBrandTransportQualified',brand_qualified,'platformBrandBatchEnabled',brand_settings.batch_enabled,
   'platformBrandExpiryEnabled',brand_settings.expiry_enabled,
   'platformBrandWorkerLastCompletedAt',brand_health.last_completed_at,'platformBrandWorkerEnabledAtCompletion',brand_health.enabled,
   'platformBrandWorkerCompletionProves','bounded_brand_pass_only_not_provider_qualification',
   'attachedLegacyStageCount',attached_stages,'referenceGuardCoverage',references_ready,
   'sourceAdmissionGuardCoverage',source_guards_ready,'protocolInstalled',protocol_ready,
   'contentCaptureGuardCoverage',capture_guards_ready,
   'retentionScope','verified_private_r2_originals_reviewed_external_text_and_exact_brand',
   'reviewedExternalReferenceSourceCount',(select count(*) from public.videos v
     where private.deleted_content_source_coverage('creator_video',to_jsonb(v))='reviewed_external_reference'),
   'reviewedExternalReferenceArchiveCount',(select count(*) from private.deleted_content_records d
     where d.media_disposition='reviewed_external_reference' and private.deleted_content_external_archive_supported(d.id)),
   'externalReferencePhysicalDeletionAllowed',false,'supabaseDirectStorageCoverage','exact_brand_only_other_direct_storage_unsupported',
   'legacyObjectDeleteBehavior','object_only_requests_rejected_after_gate_closure',
   'unattachedUploadCleanupCoverage','outside_retained_original_protocol',
   'physicalDeletionAllowed',false,'perObjectIrreversibleClaimRequired',true,
   'permanentPhysicalAbsenceGuaranteed',false,
   'workerLastCompletedAt',heartbeat,'workerCompletionProves','bounded_worker_pass_only',
   'scheduleObservedByDatabase',false,'rolloutEvidenceAuthority','operator_assertions_not_independently_verified',
   'sourceRevision',qualification.source_revision,'qualifiedAt',qualification.qualified_at);
end $$;

-- This is a frozen retention/audit snapshot, NEVER a clean scan or media proof.
-- No holds/references recursion here: callers gate actions separately. Coverage
-- remains evidence coverage even when a subsequent hold prevents disposal.
create function private.platform_brand_empty_core_snapshot(p_asset_id uuid,p_claimed_absent boolean,p_intent boolean)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare a public.platform_brand_assets%rowtype; r private.platform_brand_object_incarnations%rowtype;
 o storage.objects%rowtype; jobs jsonb; b jsonb; delegation jsonb;
begin
 perform private.platform_brand_retention_lock();
 if not (private.deleted_media_locator_columns('public.platform_brand_assets'::regclass)<@array['storage_path','storage_object_key']::text[])
  or private.deleted_media_locator_columns('public.media_scan_jobs'::regclass) is distinct from array['storage_object_key','metadata']::text[] then return null; end if;
 select * into a from public.platform_brand_assets where id=p_asset_id for share nowait;
 select * into r from private.platform_brand_object_incarnations where asset_id=p_asset_id for share nowait;
 if a.id is null or r.asset_id is null
  or (p_intent and (a.asset_state<>'draft' or a.deleted_at is not null or r.removed_at is not null or r.retain_until is not null or p_claimed_absent))
  or (not p_intent and (a.asset_state<>'archived' or a.deleted_at is null
   or a.deleted_at is distinct from r.removed_at or r.removal_clock is distinct from 'server_observed_removal'
   or r.retain_until is distinct from r.removed_at+interval '720 hours'))
  or r.provider<>'supabase' or r.bucket<>'platform-brand-assets' or r.storage_path is distinct from r.object_key
  or r.storage_object_id is null or nullif(r.storage_version,'') is null
  or (a.owner_user_id,a.created_at,a.storage_provider,a.storage_bucket,a.storage_object_key,a.storage_path)
   is distinct from (r.owner_id,r.source_created_at,r.provider,r.bucket,r.object_key,r.storage_path)
  or exists(select 1 from private.platform_brand_object_incarnations x where x.asset_id<>r.asset_id
   and x.provider=r.provider and x.bucket=r.bucket and x.object_key=r.object_key)
  or exists(select 1 from private.platform_brand_object_proofs where asset_id=r.asset_id) then return null; end if;
 select * into o from storage.objects where bucket_id=r.bucket and name=r.object_key for share nowait;
 if p_claimed_absent then
  if o.id is not null or not exists(select 1 from private.platform_brand_empty_claim_evidence e
   join private.platform_brand_expiry_claims c on c.claim_token=e.claim_token and c.asset_id=e.asset_id
   where e.asset_id=r.asset_id) then return null; end if;
 elsif o.id is distinct from r.storage_object_id or to_jsonb(o)->>'version' is distinct from r.storage_version
  or o.metadata->>'size' is distinct from '0' then return null; end if;
 -- Optional global records must be absent together or form one exact pair.
 -- Validate them now, but do not freeze optional absence into the core receipt.
 select jsonb_build_object('delegation',to_jsonb(d),'capture',to_jsonb(c)) into delegation
 from private.deleted_content_brand_delegations d join private.deleted_content_records c on c.id=d.deletion_id
 where d.asset_id=r.asset_id and d.owner_id=r.owner_id and d.source_created_at=r.source_created_at
  and d.removed_at=r.removed_at and d.retain_until=r.retain_until
  and c.target_type='platform_brand_asset' and c.target_id=r.asset_id::text and c.author=r.owner_id
  and c.source_created_at=r.source_created_at and c.deleted_at=r.removed_at and c.expires_at=r.retain_until
  and c.deletion_kind='soft' and c.content is null and c.media_disposition='delegated_brand_original';
 if exists(select 1 from private.deleted_content_brand_delegations where asset_id=r.asset_id)
  or exists(select 1 from private.deleted_content_records where target_type='platform_brand_asset' and target_id=r.asset_id::text) then
  if p_intent or delegation is null
   or (select count(*) from private.deleted_content_brand_delegations where asset_id=r.asset_id)<>1
   or (select count(*) from private.deleted_content_records where target_type='platform_brand_asset' and target_id=r.asset_id::text)<>1 then return null; end if;
 end if;
 perform 1 from public.media_scan_jobs j where j.target_table='platform_brand_assets' and j.target_id=r.asset_id::text for share nowait;
 if exists(select 1 from public.media_scan_jobs j where j.target_table='platform_brand_assets' and j.target_id=r.asset_id::text
  and (j.status not in ('clean','malware_detected','manual_review','quarantined')
   or j.completed_at is null or j.completed_at>coalesce(r.removed_at,clock_timestamp()) or j.created_at<r.source_created_at
   or (j.owner_user_id,j.target_column,j.storage_provider,j.storage_bucket,j.storage_object_key)
    is distinct from (r.owner_id,a.asset_type,r.provider,r.bucket,r.object_key))) then return null; end if;
 select coalesce(jsonb_agg(to_jsonb(j) order by j.id),'[]'::jsonb) into jobs from public.media_scan_jobs j
 where j.target_table='platform_brand_assets' and j.target_id=r.asset_id::text;
 if jsonb_array_length(jobs)=0 then return null; end if;
 b:=jsonb_build_object('assetId',r.asset_id,'ownerId',r.owner_id,
  'sourceCreatedAt',to_char(r.source_created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'provider',r.provider,'bucket',r.bucket,'objectKey',r.object_key,'storageObjectId',r.storage_object_id,'storageVersion',r.storage_version);
 return jsonb_build_object('binding',b,'source',to_jsonb(a),'incarnation',to_jsonb(r),'jobs',jobs);
exception when lock_not_available then return null;
end $$;

create function private.platform_brand_empty_snapshot(p_asset_id uuid,p_claimed_absent boolean default false)
returns jsonb language sql security definer set search_path='' as $$
 select private.platform_brand_empty_core_snapshot(p_asset_id,p_claimed_absent,false)
$$;
create function private.platform_brand_empty_intent_snapshot(p_asset_id uuid)
returns jsonb language sql security definer set search_path='' as $$
 select private.platform_brand_empty_core_snapshot(p_asset_id,false,true)
$$;

-- Compare both frozen sides, permitting ONLY the canonical removal fields.
create function private.platform_brand_empty_owner_receipt_matches(p_asset_id uuid,p_claimed_absent boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$
declare x private.platform_brand_empty_authorizations%rowtype;
 r private.platform_brand_empty_owner_removals%rowtype; current_snapshot jsonb;
begin
 select * into x from private.platform_brand_empty_authorizations where asset_id=p_asset_id;
 select * into r from private.platform_brand_empty_owner_removals where asset_id=p_asset_id and authorization_id=x.id;
 if x.id is null or r.authorization_id is null then return false; end if;
 current_snapshot:=private.platform_brand_empty_snapshot(p_asset_id,p_claimed_absent);
 return coalesce(current_snapshot=r.snapshot
  and r.actor=x.snapshot->'binding'->>'ownerId'
  and x.authorized_at<=r.operation_started_at
  and (r.snapshot->'source'->>'deleted_at')::timestamptz between r.operation_started_at and r.recorded_at
  and x.snapshot->'source'->>'asset_state'='draft'
  and x.snapshot->'source'->'deleted_at'='null'::jsonb
  and x.snapshot->'incarnation'->'removed_at'='null'::jsonb
  and x.snapshot->'incarnation'->'retain_until'='null'::jsonb
  and x.snapshot->'binding'=r.snapshot->'binding' and x.snapshot->'jobs'=r.snapshot->'jobs'
  and ((x.snapshot->'source')-array['asset_state','deleted_at','updated_at'])=((r.snapshot->'source')-array['asset_state','deleted_at','updated_at'])
  and ((x.snapshot->'incarnation')-array['removed_at','retain_until','removal_clock'])=((r.snapshot->'incarnation')-array['removed_at','retain_until','removal_clock']),false);
end $$;

create function public.remove_platform_brand_empty_test_asset(p_asset_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare x private.platform_brand_empty_authorizations%rowtype; receipt private.platform_brand_empty_owner_removals%rowtype;
 started timestamptz; result jsonb; snapshot jsonb;
begin
 -- EXECUTE is authenticated-only; explicit role check also rejects privileged
 -- service callers. No replacement claims or historical authority are accepted.
 if auth.jwt()->>'role' is distinct from 'authenticated' or auth.uid() is null then raise exception 'brand_empty_authenticated_owner_required'; end if;
 perform private.platform_brand_retention_lock();
 select * into x from private.platform_brand_empty_authorizations where asset_id=p_asset_id;
 if x.id is null then raise exception 'brand_empty_exact_intent_required'; end if;
 select * into receipt from private.platform_brand_empty_owner_removals where asset_id=p_asset_id;
 if receipt.authorization_id is null then
  snapshot:=private.platform_brand_empty_intent_snapshot(p_asset_id);
  if snapshot is null or snapshot is distinct from x.snapshot then raise exception 'brand_empty_exact_intent_required'; end if;
 end if;
 started:=clock_timestamp();
 -- Also reestablishes current session/legal/Premium/exact asset-owner/path
 -- authority on an exact retry. The canonical implementation is unchanged.
 result:=public.remove_platform_brand_asset(p_asset_id);
 if receipt.authorization_id is null then
  snapshot:=private.platform_brand_empty_snapshot(p_asset_id);
  if snapshot is null then raise exception 'brand_empty_owner_receipt_required'; end if;
  insert into private.platform_brand_empty_owner_removals(authorization_id,asset_id,actor,operation_started_at,snapshot,global_capture_recorded)
   values(x.id,p_asset_id,auth.uid()::text,started,snapshot,exists(select 1 from private.deleted_content_brand_delegations where asset_id=p_asset_id))
   returning * into receipt;
 end if;
 if not private.platform_brand_empty_owner_receipt_matches(p_asset_id)
  or receipt.actor is distinct from auth.uid()::text
  or exists(select 1 from public.legal_holds h where h.status='active' and private.deleted_content_hold_matches(h.target_type,h.target_id,'platform_brand_asset',p_asset_id::text,receipt.actor,null,null))
  or not private.platform_brand_retention_references_clear(p_asset_id) then raise exception 'brand_empty_owner_receipt_or_references_required'; end if;
 return result||jsonb_build_object('ownerRemovalReceiptRecorded',true,'globalCaptureRecorded',receipt.global_capture_recorded);
end $$;

-- The only pre-disposition exemption recognizes exact authorized terminal audit
-- snapshots. It grants neither a claim nor read/delivery permission. The same
-- authorization/snapshot is revalidated after registration and after a claim.
create function private.platform_brand_empty_history_matches(p_asset_id uuid,p_job jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare x private.platform_brand_empty_authorizations%rowtype; snapshot jsonb;
begin
 select * into x from private.platform_brand_empty_authorizations where asset_id=p_asset_id;
 if x.id is null then return false; end if;
 snapshot:=private.platform_brand_empty_snapshot(p_asset_id,false);
 if snapshot is null then snapshot:=private.platform_brand_empty_snapshot(p_asset_id,true); end if;
 return coalesce(snapshot is not null and private.platform_brand_empty_owner_receipt_matches(p_asset_id,
  not exists(select 1 from storage.objects where bucket_id=x.snapshot->'binding'->>'bucket' and name=x.snapshot->'binding'->>'objectKey'))
  and exists(select 1 from jsonb_array_elements(x.snapshot->'jobs') j where j=p_job),false);
end $$;

create function private.platform_brand_empty_evidence_matches(p_asset_id uuid,p_allow_claimed_absent boolean default false) returns boolean
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare d private.platform_brand_empty_dispositions%rowtype; x private.platform_brand_empty_authorizations%rowtype;
 o private.platform_brand_empty_observations%rowtype; snapshot jsonb;
begin
 select * into d from private.platform_brand_empty_dispositions where asset_id=p_asset_id;
 if d.id is null then return false; end if;
 select * into o from private.platform_brand_empty_observations where id=d.observation_id;
 select * into x from private.platform_brand_empty_authorizations where id=o.authorization_id and asset_id=p_asset_id;
 if x.id is null or d.evidence_sha256 is distinct from encode(extensions.digest((jsonb_build_object('authorization',to_jsonb(x),
  'ownerRemoval',(select to_jsonb(r) from private.platform_brand_empty_owner_removals r where r.authorization_id=x.id),
  'observation',to_jsonb(o),'result',d.result))::text,'sha256'),'hex') then return false; end if;
 snapshot:=private.platform_brand_empty_snapshot(p_asset_id,false);
 if snapshot is null and p_allow_claimed_absent then
  if not exists(select 1 from private.platform_brand_empty_claim_evidence e join private.platform_brand_expiry_claims c
   on c.claim_token=e.claim_token and c.asset_id=e.asset_id where e.asset_id=p_asset_id and e.disposition_id=d.id
   and e.evidence_sha256=d.evidence_sha256 and e.binding=x.snapshot->'binding') then return false; end if;
  snapshot:=private.platform_brand_empty_snapshot(p_asset_id,true);
 end if;
 return coalesce(snapshot is not null and private.platform_brand_empty_owner_receipt_matches(p_asset_id,
  not exists(select 1 from storage.objects where bucket_id=x.snapshot->'binding'->>'bucket' and name=x.snapshot->'binding'->>'objectKey')),false);
end $$;

create function public.begin_platform_brand_empty_observation(p_asset_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare x private.platform_brand_empty_authorizations%rowtype; o private.platform_brand_empty_observations%rowtype;
begin
 perform private.platform_brand_archived_service_required();
 perform private.platform_brand_retention_lock();
 select * into x from private.platform_brand_empty_authorizations where asset_id=p_asset_id;
 if x.id is null or not private.platform_brand_empty_owner_receipt_matches(p_asset_id)
  or exists(select 1 from private.platform_brand_expiry_claims where asset_id=p_asset_id)
  or exists(select 1 from public.legal_holds h where h.status='active' and private.deleted_content_hold_matches(h.target_type,h.target_id,'platform_brand_asset',p_asset_id::text,x.snapshot->'binding'->>'ownerId',null,null))
  or not private.platform_brand_retention_references_clear(p_asset_id) then raise exception 'brand_empty_exact_authorization_required'; end if;
 insert into private.platform_brand_empty_observations(authorization_id) values(x.id) returning * into o;
 return jsonb_build_object('observationId',o.id,'observationToken',o.observation_token,'binding',x.snapshot->'binding');
end $$;

create function public.read_platform_brand_empty_observation(p_observation_id uuid,p_observation_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare x private.platform_brand_empty_authorizations%rowtype; o private.platform_brand_empty_observations%rowtype;
begin
 perform private.platform_brand_archived_service_required();
 perform private.platform_brand_retention_lock();
 select * into o from private.platform_brand_empty_observations where id=p_observation_id and observation_token=p_observation_token;
 if o.id is null or o.started_at>clock_timestamp() or o.started_at+interval '20 minutes'<=clock_timestamp() then return null; end if;
 select * into x from private.platform_brand_empty_authorizations where id=o.authorization_id;
 if x.id is null or not private.platform_brand_empty_owner_receipt_matches(x.asset_id)
  or exists(select 1 from private.platform_brand_expiry_claims where asset_id=x.asset_id)
  or exists(select 1 from public.legal_holds h where h.status='active' and private.deleted_content_hold_matches(h.target_type,h.target_id,'platform_brand_asset',x.asset_id::text,x.snapshot->'binding'->>'ownerId',null,null))
  or not private.platform_brand_retention_references_clear(x.asset_id) then return null; end if;
 return jsonb_build_object('observationId',o.id,'observationToken',o.observation_token,'binding',x.snapshot->'binding');
end $$;

create function public.record_platform_brand_empty_disposition(p_observation_id uuid,p_observation_token uuid,p_result jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare x private.platform_brand_empty_authorizations%rowtype; o private.platform_brand_empty_observations%rowtype;
 d private.platform_brand_empty_dispositions%rowtype; checked jsonb;
begin
 perform private.platform_brand_archived_service_required();
 perform private.platform_brand_retention_lock();
 select * into o from private.platform_brand_empty_observations where id=p_observation_id and observation_token=p_observation_token;
 if o.id is null then raise exception 'brand_empty_observation_required'; end if;
 select * into x from private.platform_brand_empty_authorizations where id=o.authorization_id;
 select * into d from private.platform_brand_empty_dispositions where asset_id=x.asset_id;
 if d.id is not null then
  if d.observation_id<>o.id or d.result is distinct from p_result or not private.platform_brand_empty_evidence_matches(x.asset_id,true)
   or exists(select 1 from public.legal_holds h where h.status='active' and private.deleted_content_hold_matches(h.target_type,h.target_id,'platform_brand_asset',x.asset_id::text,x.snapshot->'binding'->>'ownerId',null,null))
   or not private.platform_brand_retention_references_clear(x.asset_id) then raise exception 'brand_empty_disposition_conflict'; end if;
  return jsonb_build_object('recorded',true,'assetId',x.asset_id,'dispositionId',d.id);
 end if;
 checked:=public.read_platform_brand_empty_observation(o.id,o.observation_token);
 if checked is null or p_result is null or jsonb_typeof(p_result)<>'object'
  or p_result-array['protocol','sha256','sizeBytes','httpStatus','fullReadback','encoding','completedAt']<>'{}'::jsonb
  or (p_result-'completedAt') is distinct from '{"protocol":"brand-empty-test-origin-v1","sha256":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","sizeBytes":0,"httpStatus":200,"fullReadback":true,"encoding":"identity"}'::jsonb
  or nullif(p_result->>'completedAt','') is null
  or not pg_catalog.isfinite((p_result->>'completedAt')::timestamptz)
  or (p_result->>'completedAt')::timestamptz<date_trunc('milliseconds',o.started_at) or (p_result->>'completedAt')::timestamptz>clock_timestamp()
 then raise exception 'brand_empty_complete_origin_required'; end if;
 insert into private.platform_brand_empty_dispositions(asset_id,observation_id,result,evidence_sha256)
 values(x.asset_id,o.id,p_result,encode(extensions.digest((jsonb_build_object('authorization',to_jsonb(x),
  'ownerRemoval',(select to_jsonb(r) from private.platform_brand_empty_owner_removals r where r.authorization_id=x.id),
  'observation',to_jsonb(o),'result',p_result))::text,'sha256'),'hex')) returning * into d;
 return jsonb_build_object('recorded',true,'assetId',x.asset_id,'dispositionId',d.id);
end $$;

create function private.guard_platform_brand_empty_history() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 perform private.platform_brand_retention_lock();
 if tg_op='TRUNCATE' then
  if exists(select 1 from private.platform_brand_empty_authorizations) then raise exception 'brand_empty_history_permanent'; end if;
  return null;
 end if;
 if exists(select 1 from private.platform_brand_empty_authorizations x,
  lateral jsonb_array_elements(x.snapshot->'jobs') j where j->>'id'=old.id::text)
  and (tg_op='DELETE' or to_jsonb(new) is distinct from to_jsonb(old)) then raise exception 'brand_empty_history_permanent'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger aaa_platform_brand_empty_history before update or delete on public.media_scan_jobs
 for each row execute function private.guard_platform_brand_empty_history();
create trigger aaa_platform_brand_empty_history_no_truncate before truncate on public.media_scan_jobs
 for each statement execute function private.guard_platform_brand_empty_history();

-- Explicit privileges, including default-public function ACLs and renamed
-- positive-path implementations. No service authorization-seeding capability.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='private' and p.proname in (
  'platform_brand_empty_core_snapshot','platform_brand_empty_intent_snapshot','platform_brand_empty_owner_receipt_matches',
  'platform_brand_empty_snapshot','platform_brand_empty_history_matches','platform_brand_empty_evidence_matches',
  'guard_platform_brand_empty_history','deleted_content_brand_source_coverage_before_empty',
  'deleted_content_brand_source_coverage','claim_platform_brand_retention_expiry_before_empty',
  'read_platform_brand_retention_expiry_claim_before_empty'))
 or (n.nspname='public' and p.proname in ('remove_platform_brand_empty_test_asset','begin_platform_brand_empty_observation','read_platform_brand_empty_observation',
  'record_platform_brand_empty_disposition','claim_platform_brand_retention_expiry','read_platform_brand_retention_expiry_claim')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
grant execute on function public.remove_platform_brand_empty_test_asset(uuid) to authenticated;
grant execute on function public.begin_platform_brand_empty_observation(uuid),public.read_platform_brand_empty_observation(uuid,uuid),
 public.record_platform_brand_empty_disposition(uuid,uuid,jsonb),public.claim_platform_brand_retention_expiry(uuid),
 public.read_platform_brand_retention_expiry_claim(uuid,uuid) to service_role;
commit;
