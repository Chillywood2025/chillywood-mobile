-- Preserve historical proof IDs. A fresh independent proof may renew exactly
-- the same source/semantic lineage; a new UUID alone conveys no equivalence.
-- Empty private issuer boundaries and all OFF controls remain unchanged.
alter table private.native_production_source_proofs add column renewal_root_proof_id uuid
 references private.native_production_source_proofs(id),add check(renewal_root_proof_id is distinct from id);
alter table private.native_production_scope_qualifications add column renewal_root_scope_id uuid
 references private.native_production_scope_qualifications(id),add check(renewal_root_scope_id is distinct from id);
create index native_production_source_renewal on private.native_production_source_proofs(renewal_root_proof_id,verified_at desc);
create index native_production_scope_renewal on private.native_production_scope_qualifications(renewal_root_scope_id,verified_at desc);

create function private.native_production_scope_equivalent(p_original uuid,p_observed uuid) returns boolean
language sql volatile set search_path='' as $$
 select exists(select 1 from private.native_production_scope_qualifications original
  join private.native_production_scope_qualifications root on root.id=coalesce(original.renewal_root_scope_id,original.id)
  join private.native_production_scope_qualifications observed on observed.id=p_observed
  where original.id=p_original
   and root.renewal_root_scope_id is null and root.verified_at<=original.verified_at and root.verified_at<=observed.verified_at
   and (observed.id=original.id or observed.id=root.id or observed.renewal_root_scope_id=root.id)
   and row(observed.provider,observed.environment,observed.project_id,observed.app_id,observed.store_account_id,observed.provider_product_id,
    observed.currency,observed.report_schema,observed.legal_document_key,observed.legal_document_version,observed.terms_sha256,observed.platform_share_bps)
   is not distinct from row(original.provider,original.environment,original.project_id,original.app_id,original.store_account_id,original.provider_product_id,
    original.currency,original.report_schema,original.legal_document_key,original.legal_document_version,original.terms_sha256,original.platform_share_bps)
   and row(root.provider,root.environment,root.project_id,root.app_id,root.store_account_id,root.provider_product_id,
    root.currency,root.report_schema,root.legal_document_key,root.legal_document_version,root.terms_sha256,root.platform_share_bps)
   is not distinct from row(original.provider,original.environment,original.project_id,original.app_id,original.store_account_id,original.provider_product_id,
    original.currency,original.report_schema,original.legal_document_key,original.legal_document_version,original.terms_sha256,original.platform_share_bps)
   and not exists(select 1 from private.native_production_scope_revocations where qualification_id in
    (original.id,coalesce(original.renewal_root_scope_id,original.id),observed.id)));
$$;
create or replace function private.native_production_scope_current(p_scope uuid) returns boolean
language plpgsql volatile set search_path='' as $$
declare original private.native_production_scope_qualifications; latest private.native_production_scope_qualifications; tied integer;
begin
 select * into original from private.native_production_scope_qualifications where id=p_scope;
 if original.id is null then return false; end if;
 -- Choose newest BEFORE checking equivalence/time/revocation. Unknown unlinked
 -- records in the same namespace, or changed records in this explicit lineage,
 -- veto the old proof. A timestamp tie is ambiguous, not a UUID election.
 select * into latest from private.native_production_scope_qualifications candidate where
  candidate.id=coalesce(original.renewal_root_scope_id,original.id)
  or candidate.renewal_root_scope_id=coalesce(original.renewal_root_scope_id,original.id)
  or row(candidate.provider,candidate.project_id,candidate.app_id,candidate.store_account_id,candidate.provider_product_id,candidate.currency)
   is not distinct from row(original.provider,original.project_id,original.app_id,original.store_account_id,original.provider_product_id,original.currency)
  order by verified_at desc,id desc limit 1;
 select count(*) into tied from private.native_production_scope_qualifications candidate where candidate.verified_at=latest.verified_at and (
  candidate.id=coalesce(original.renewal_root_scope_id,original.id)
  or candidate.renewal_root_scope_id=coalesce(original.renewal_root_scope_id,original.id)
  or row(candidate.provider,candidate.project_id,candidate.app_id,candidate.store_account_id,candidate.provider_product_id,candidate.currency)
   is not distinct from row(original.provider,original.project_id,original.app_id,original.store_account_id,original.provider_product_id,original.currency));
 return tied=1 and private.native_production_scope_equivalent(original.id,latest.id)
  and latest.verified_at<=clock_timestamp() and latest.expires_at>clock_timestamp();
end $$;

create or replace function private.native_production_source_current(p_version uuid,p_proof uuid) returns boolean
language plpgsql volatile set search_path='' as $$
declare original private.native_production_source_proofs; latest private.native_production_source_proofs; root private.native_production_source_proofs; tied integer;
begin
 select * into original from private.native_production_source_proofs where id=p_proof and version_id=p_version;
 if original.id is null then return false; end if;
 select * into root from private.native_production_source_proofs where id=coalesce(original.renewal_root_proof_id,original.id);
 if root.id is null or root.renewal_root_proof_id is not null or root.verified_at>original.verified_at
  or row(root.version_id,root.origin_provider,root.origin_bucket,root.origin_object,root.origin_generation,root.asset_sha256,root.byte_length,root.adapter_version)
   is distinct from row(original.version_id,original.origin_provider,original.origin_bucket,original.origin_object,original.origin_generation,original.asset_sha256,original.byte_length,original.adapter_version)
 then return false; end if;
 select * into latest from private.native_production_source_proofs candidate where candidate.version_id=p_version
  or candidate.renewal_root_proof_id=coalesce(original.renewal_root_proof_id,original.id)
  order by verified_at desc,id desc limit 1;
 select count(*) into tied from private.native_production_source_proofs candidate where candidate.verified_at=latest.verified_at
  and (candidate.version_id=p_version or candidate.renewal_root_proof_id=coalesce(original.renewal_root_proof_id,original.id));
 if tied<>1 or (latest.id<>original.id and latest.renewal_root_proof_id is distinct from coalesce(original.renewal_root_proof_id,original.id))
  or row(latest.version_id,latest.origin_provider,latest.origin_bucket,latest.origin_object,latest.origin_generation,latest.asset_sha256,latest.byte_length,latest.adapter_version)
   is distinct from row(original.version_id,original.origin_provider,original.origin_bucket,original.origin_object,original.origin_generation,original.asset_sha256,original.byte_length,original.adapter_version)
  or exists(select 1 from private.native_production_source_revocations where proof_id in
   (original.id,coalesce(original.renewal_root_proof_id,original.id),latest.id)) then return false; end if;
 -- A fresh scan receipt may change only because the same immutable bytes were
 -- independently checked again under the same verifier semantics. The private
 -- issuer must authenticate it; the receipt digest alone never issues proof.
 return exists(select 1 from private.native_production_video_versions version join public.videos video
  on video.id=version.source_id and video.owner_id=version.creator_id where version.id=p_version and version.operation='present'
   and version.id=(select id from private.native_production_video_versions where source_id=version.source_id order by revision desc limit 1)
   and version.source_facts_sha256=encode(extensions.digest(convert_to(private.native_production_video_facts(video)::text,'UTF8'),'sha256'),'hex')
   and row(latest.origin_provider,latest.origin_bucket,latest.origin_object) is not distinct from row(video.storage_provider,video.storage_bucket,video.storage_object_key)
   and latest.byte_length=video.file_size_bytes and latest.verified_at>=version.created_at
   and latest.verified_at<=clock_timestamp() and latest.expires_at>clock_timestamp()
   and video.visibility='public' and video.moderation_status in ('clean','reported') and public.media_scan_public_safe(video.scan_status)
   and video.quarantined_at is null and not coalesce(video.vip_access_required,false));
end $$;

create function private.native_production_report_qualification_valid(p_original uuid,p_report jsonb,p_observed timestamptz) returns boolean
language sql volatile set search_path='' as $$
 select exists(select 1 from private.native_production_scope_qualifications observed where observed.id::text=p_report->>'qualificationId'
  and private.native_production_scope_equivalent(p_original,observed.id)
  and observed.report_schema=p_report->>'reportSchema' and observed.verified_at<=p_observed and observed.expires_at>p_observed);
$$;

-- Retain exact runtime schema/identity validation. Only the qualification UUID
-- requirement changes; each immutable report keeps its own authenticated issuer
-- and observation time. No older unqualified report is retroactively upgraded.
do $$ declare definition text; old text; replacement text; begin
 definition:=pg_get_functiondef('private.append_native_production_report(uuid,jsonb)'::regprocedure);
 old:=$old$if kind in ('component','coverage') and (p_observation->>'reportSchema' is distinct from q.report_schema
  or p_observation->>'qualificationId' is distinct from q.id::text) then raise exception 'native_production_report_scope_mismatch'; end if;$old$;
 replacement:=$new$if kind in ('component','coverage') and not exists(select 1 from private.native_production_scope_qualifications issuer
  where issuer.id::text=p_observation->>'qualificationId' and private.native_production_scope_equivalent(q.id,issuer.id)
   and issuer.report_schema=p_observation->>'reportSchema') then raise exception 'native_production_report_scope_mismatch'; end if;$new$;
 if position(old in definition)=0 then raise exception 'native_report_renewal_append_anchor_changed'; end if;
 execute replace(definition,old,replacement);
 definition:=pg_get_functiondef('private.evaluate_native_production_economics(uuid)'::regprocedure);
 old:=$old$observed_at<q.verified_at or observed_at>=q.expires_at or observed_at<c.purchased_at or facts->>'qualificationId'<>q.id::text
   or facts->>'reportSchema'<>q.report_schema$old$;
 replacement:='not private.native_production_report_qualification_valid(q.id,facts,observed_at) or observed_at<c.purchased_at';
 if position(old in definition)=0 then raise exception 'native_report_renewal_evaluation_anchor_changed'; end if;
 definition:=replace(definition,old,replacement);
 -- UUIDs remain in the journal and per-observation qualification checks, but
 -- equivalent proof renewals are not different economic components/manifests.
 definition:=replace(definition,',facts->>''qualificationId''','');
 definition:=replace(definition,',coverage->>''qualificationId''','');
 execute definition;
 definition:=pg_get_functiondef('private.native_production_funding_current(uuid,uuid)'::regprocedure);
 old:='if proof.id is null or proof.snapshot_id<>p_snapshot';
 if position(old in definition)=0 then raise exception 'native_funding_tie_anchor_changed'; end if;
 execute replace(definition,old,'if (select count(*) from private.native_production_funding_proofs where canonical_receipt_id=p_receipt and verified_at=proof.verified_at)<>1 or proof.id is null or proof.snapshot_id<>p_snapshot');
end $$;

do $$ declare f record; begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='private'::regnamespace and proname like '%native_production%' loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
