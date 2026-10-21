begin;
-- Source-only transport successor. Provider version-delete qualification must
-- be supplied separately; installation does not activate or delete anything.
alter table private.platform_brand_retention_settings
 add column provider_origin text,
 add column provider_contract_sha256 text,
 add column version_delete_verified boolean not null default false;
alter table private.platform_brand_retention_settings add constraint brand_provider_contract_shape
 check(not version_delete_verified or (provider_origin ~ '^https://[A-Za-z0-9.-]+$'
  and provider_contract_sha256 ~ '^[a-f0-9]{64}$'
  and provider_origin is not null and provider_contract_sha256 is not null));

create table private.platform_brand_expiry_transport_results (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid not null references private.platform_brand_object_incarnations(asset_id),
 claim_token uuid not null references private.platform_brand_expiry_claims(claim_token),
 outcome text not null check(outcome in ('failed','delete_acknowledged','observed_absent')),
 recorded_at timestamptz not null default clock_timestamp(),
 permanently_absent boolean not null default false check(not permanently_absent)
);
alter table private.platform_brand_expiry_transport_results enable row level security;
alter table private.platform_brand_expiry_transport_results force row level security;
revoke all on private.platform_brand_expiry_transport_results from public,anon,authenticated,service_role;
create trigger brand_transport_result_immutable before update or delete on private.platform_brand_expiry_transport_results
 for each row execute function private.platform_brand_retention_immutable();
create trigger brand_transport_result_no_truncate before truncate on private.platform_brand_expiry_transport_results
 for each statement execute function private.platform_brand_retention_immutable();

create function public.begin_platform_brand_retention_transport(p_asset_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.platform_brand_expiry_claims%rowtype; checked jsonb;
begin
 perform private.platform_brand_retention_lock();
 if not exists(select 1 from private.platform_brand_retention_settings where expiry_enabled
  and version_delete_verified and provider_contract_sha256 is not null and provider_origin is not null) then
  return jsonb_build_object('status','transport_unqualified_or_disabled'); end if;
 select * into c from private.platform_brand_expiry_claims where asset_id=p_asset_id;
 if c.asset_id is not null then
  checked:=public.read_platform_brand_retention_expiry_claim(p_asset_id,c.claim_token);
  if checked->>'status'='authorized' then return checked||jsonb_build_object('status','claimed'); end if;
  return checked;
 end if;
 return public.claim_platform_brand_retention_expiry(p_asset_id);
end $$;

create function public.read_platform_brand_retention_expiry_claim(p_asset_id uuid,p_claim_token uuid)
returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare r private.platform_brand_object_incarnations%rowtype;
 c private.platform_brand_expiry_claims%rowtype; s private.platform_brand_retention_settings%rowtype;
 proof private.platform_brand_object_proofs%rowtype; a public.platform_brand_assets%rowtype; o storage.objects%rowtype;
begin
 perform private.platform_brand_retention_lock();
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
 select * into proof from private.platform_brand_object_proofs where asset_id=p_asset_id;
 select * into a from public.platform_brand_assets where id=p_asset_id for share nowait;
 if r.asset_id is null or proof.asset_id is null or a.id is null or r.removed_at is null or r.retain_until>clock_timestamp()
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
 -- The irreversible claim already bound the exact clean receipt. When the
 -- Storage row is absent, retain that original binding for bounded retry rather
 -- than inventing a new incarnation or treating SQL absence as physical proof.
 if o.id is null and not private.platform_brand_claimed_scan_evidence_matches(p_asset_id,proof.scan_receipt_id,proof.binding,proof.origin_sha256,proof.origin_size_bytes) then
  return jsonb_build_object('status','claimed_scan_evidence_unavailable'); end if;
 if o.id is not null and (public.read_platform_brand_retention_binding(p_asset_id) is distinct from proof.binding
  or not private.platform_brand_scan_byte_receipt_matches(proof.scan_receipt_id,proof.binding,proof.origin_sha256,proof.origin_size_bytes)) then
  return jsonb_build_object('status','proof_no_longer_current'); end if;
 return proof.binding||jsonb_build_object('status','authorized','claimToken',c.claim_token,
  'providerOrigin',s.provider_origin,'providerContractSha256',s.provider_contract_sha256,
  'exactVersionDelete',true,'metadataPresent',o.id is not null,'permanentlyAbsent',false);
exception when lock_not_available then return jsonb_build_object('status','contended');
end $$;

create function public.record_platform_brand_retention_transport_result(p_asset_id uuid,p_claim_token uuid,p_outcome text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.platform_brand_retention_lock();
 if p_outcome not in ('failed','delete_acknowledged','observed_absent') or p_outcome is null then raise exception 'brand_transport_outcome_invalid'; end if;
 if not exists(select 1 from private.platform_brand_expiry_claims where asset_id=p_asset_id and claim_token=p_claim_token) then
  raise exception 'brand_exact_claim_required'; end if;
 insert into private.platform_brand_expiry_transport_results(asset_id,claim_token,outcome) values(p_asset_id,p_claim_token,p_outcome);
 return jsonb_build_object('status',p_outcome,'assetId',p_asset_id,'claimToken',p_claim_token,'permanentlyAbsent',false);
end $$;
revoke all on function public.read_platform_brand_retention_expiry_claim(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.begin_platform_brand_retention_transport(uuid) from public,anon,authenticated,service_role;
revoke all on function public.record_platform_brand_retention_transport_result(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.read_platform_brand_retention_expiry_claim(uuid,uuid) to service_role;
grant execute on function public.begin_platform_brand_retention_transport(uuid) to service_role;
grant execute on function public.record_platform_brand_retention_transport_result(uuid,uuid,text) to service_role;


-- Recovery is evidence-only for an already-issued immutable claim after its
-- exact storage metadata disappeared. It cannot qualify an initial claim.
create function private.platform_brand_claimed_scan_evidence_matches(p_asset_id uuid,p_receipt_id uuid,p_binding jsonb,p_sha text,p_size bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare r private.media_scan_byte_receipts%rowtype; o private.media_scan_byte_observations%rowtype;
 j public.media_scan_jobs%rowtype; a public.platform_brand_assets%rowtype; i private.platform_brand_object_incarnations%rowtype;
begin
 perform private.platform_brand_retention_lock();
 if not exists(select 1 from private.platform_brand_expiry_claims where asset_id=p_asset_id) then return false; end if;
 select * into i from private.platform_brand_object_incarnations where asset_id=p_asset_id;
 if i.asset_id is null or exists(select 1 from storage.objects where bucket_id=i.bucket and name=i.object_key) then return false; end if;
 select * into r from private.media_scan_byte_receipts where id=p_receipt_id;
 if not found or r.sha256 is distinct from p_sha or r.size_bytes is distinct from p_size then return false; end if;
 select * into o from private.media_scan_byte_observations where id=r.observation_id;
 if not found or o.binding is distinct from p_binding then return false; end if;
 select * into j from public.media_scan_jobs where id=o.job_id for share nowait;
 if not found then return false; end if;
 select * into a from public.platform_brand_assets where id=p_asset_id for share nowait;
 return coalesce(found and j.target_id=p_asset_id::text and j.status='clean'
  and j.claimed_at=o.claimed_at and j.claimed_by=o.worker_id
  and private.media_scan_byte_result_binding(j)=r.result_binding
  and a.scan_status='clean' and a.scan_provider='clamav' and a.scanned_at=j.completed_at and a.scan_error is null
  and a.deleted_at is not null
  and (a.owner_user_id,a.created_at,a.storage_provider,a.storage_bucket,a.storage_object_key,a.storage_path)
    is not distinct from (i.owner_id,i.source_created_at,i.provider,i.bucket,i.object_key,i.storage_path),false);
exception when lock_not_available then return false;
end $$;
revoke all on function private.platform_brand_claimed_scan_evidence_matches(uuid,uuid,jsonb,text,bigint) from public,anon,authenticated,service_role;

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
   if t.relname='platform_brand_assets' then predicate:=format('id<>%L::uuid',r.asset_id); end if;
   -- Only the exact proved terminal scan is evidence, not a live delivery alias.
   -- All other scans/reservations and unexpected references remain blockers.
   if t.relname='media_scan_jobs' and to_regclass('private.media_scan_byte_receipts') is not null then
     predicate:=format('id not in (select observation.job_id from private.platform_brand_object_proofs proof join private.media_scan_byte_receipts receipt on receipt.id=proof.scan_receipt_id join private.media_scan_byte_observations observation on observation.id=receipt.observation_id where proof.asset_id=%L::uuid and (private.platform_brand_scan_byte_receipt_matches(receipt.id,proof.binding,proof.origin_sha256,proof.origin_size_bytes) or private.platform_brand_claimed_scan_evidence_matches(proof.asset_id,receipt.id,proof.binding,proof.origin_sha256,proof.origin_size_bytes)))',r.asset_id);
   end if;
   execute format('select exists(select 1 from public.%I x where %s and (private.deleted_media_mentions(private.deleted_media_locator_document(to_jsonb(x),%s::oid),$1) or private.deleted_media_mentions(private.deleted_media_locator_document(to_jsonb(x),%s::oid),$2)))',t.relname,predicate,t.oid,t.oid)
     into found_ref using r.object_key,r.storage_path;
   if found_ref then return false; end if;
 end loop;
 return true;
end $$;

commit;
