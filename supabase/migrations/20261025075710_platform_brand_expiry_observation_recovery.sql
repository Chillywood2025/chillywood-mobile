begin;
-- Cutover requires quiesced expiry and all callers on the intent protocol.
-- Old binaries do not honor this marker. This migration never enables expiry.
select private.platform_brand_retention_lock();
do $$ begin
 if exists(select 1 from private.platform_brand_retention_settings where expiry_enabled) then
  raise exception 'brand_expiry_must_be_quiesced_before_dispatch_cutover';
 end if;
end $$;
create table private.platform_brand_expiry_dispatch_intents (
 claim_token uuid primary key references private.platform_brand_expiry_claims(claim_token),
 asset_id uuid not null references private.platform_brand_object_incarnations(asset_id),
 reason text not null check(reason in ('legacy_unknown_history','dispatch_intent')),
 created_at timestamptz not null default clock_timestamp()
);
alter table private.platform_brand_expiry_dispatch_intents enable row level security;
alter table private.platform_brand_expiry_dispatch_intents force row level security;
revoke all on private.platform_brand_expiry_dispatch_intents from public,anon,authenticated,service_role;
create trigger brand_dispatch_intent_immutable before update or delete on private.platform_brand_expiry_dispatch_intents
 for each row execute function private.platform_brand_retention_immutable();
create trigger brand_dispatch_intent_no_truncate before truncate on private.platform_brand_expiry_dispatch_intents
 for each statement execute function private.platform_brand_retention_immutable();
-- A legacy claim without a result might already have dispatched. Do not infer
-- permission to replay, or rewrite its original evidence to pretend certainty.
insert into private.platform_brand_expiry_dispatch_intents(claim_token,asset_id,reason)
 select claim_token,asset_id,'legacy_unknown_history' from private.platform_brand_expiry_claims;

create or replace function public.read_platform_brand_retention_expiry_claim(p_asset_id uuid,p_claim_token uuid)
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
  'exactVersionDelete',true,'metadataPresent',o.id is not null,
  'observationOnly',o.id is null or exists(select 1 from private.platform_brand_expiry_dispatch_intents d where d.claim_token=c.claim_token)
    or exists(select 1 from private.platform_brand_expiry_transport_results t where t.asset_id=p_asset_id and t.claim_token=c.claim_token and t.outcome in ('delete_acknowledged','observed_absent')),
  'deleteAcknowledged',exists(select 1 from private.platform_brand_expiry_transport_results t where t.asset_id=p_asset_id and t.claim_token=c.claim_token and t.outcome in ('delete_acknowledged','observed_absent')),
  'permanentlyAbsent',false);
exception when lock_not_available then return jsonb_build_object('status','contended');
end $$;

create function public.prepare_platform_brand_retention_dispatch(p_asset_id uuid,p_claim_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare checked jsonb; inserted uuid;
begin
 perform private.platform_brand_retention_lock();
 checked:=public.read_platform_brand_retention_expiry_claim(p_asset_id,p_claim_token);
 if checked->>'status'<>'authorized' then return checked; end if;
 if (checked->>'observationOnly')::boolean or (checked->>'deleteAcknowledged')::boolean then
  return checked||jsonb_build_object('status','observe_only'); end if;
 insert into private.platform_brand_expiry_dispatch_intents(claim_token,asset_id,reason)
  values(p_claim_token,p_asset_id,'dispatch_intent') on conflict(claim_token) do nothing returning claim_token into inserted;
 return checked||jsonb_build_object('status',case when inserted is null then 'observe_only' else 'dispatch_authorized' end);
end $$;
revoke all on function public.prepare_platform_brand_retention_dispatch(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_platform_brand_retention_dispatch(uuid,uuid) to service_role;

create function public.prepare_platform_brand_retention_batch_dispatch(p_asset_id uuid,p_claim_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare checked jsonb;
begin
 perform private.platform_brand_retention_lock();
 checked:=public.read_platform_brand_retention_batch_claim(p_asset_id,p_claim_token);
 if checked->>'status'<>'authorized' then return checked; end if;
 return public.prepare_platform_brand_retention_dispatch(p_asset_id,p_claim_token);
end $$;
revoke all on function public.prepare_platform_brand_retention_batch_dispatch(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_platform_brand_retention_batch_dispatch(uuid,uuid) to service_role;
commit;
