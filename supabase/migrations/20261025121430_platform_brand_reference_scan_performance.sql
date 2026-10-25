begin;
-- Forward-only source correction. Deploy after the empty-test protocol
-- (20261025114152), whose exact scan-history exemption is retained below.
-- No shared recognizer changes, clearance cache, new exclusions or activation.
create function private.platform_brand_retention_row_mentions(
 p_row jsonb,p_columns text[],p_key text,p_path text
) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare projected jsonb; normalized text;
begin
 -- Preserve jsonb_each's original errors even for empty/NULL column arrays.
 -- SQL NULL rows still project to '{}', as in the original aggregate.
 if jsonb_typeof(p_row)<>'object' then perform 1 from jsonb_each(p_row); end if;
 -- Enumerate only the exact selected names. Missing keys must be omitted;
 -- present JSON nulls and duplicate names retain the original JSONB document.
 select coalesce(jsonb_object_agg(k,p_row->k),'{}'::jsonb)
 into projected from unnest(p_columns) x(k) where p_row ? k;
 -- The shared normalizer is identity when the complete serialized document
 -- contains no percent sign (including keys). Keep its identical behavior for
 -- every percent-containing document and do not normalize either needle.
 -- JSONB-to-text casts retain the original normalizer call's collation.
 if projected::text !~ '%' then normalized:=projected::text;
 else normalized:=private.deleted_media_normalize_locator(projected::text); end if;
 return strpos(normalized,p_key)>0 or strpos(normalized,p_path)>0;
end $$;
revoke all on function private.platform_brand_retention_row_mentions(jsonb,text[],text,text)
 from public,anon,authenticated,service_role;

-- Only the final dynamic scan changes. Its outer uncorrelated scalar subquery
-- discovers columns once per statement (InitPlan), under the SELECT's ordinary
-- relation lock and snapshot. No catalog-loop cache or new lock order is added.
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
   execute format('select exists(select 1 from public.%I x where %s and private.platform_brand_retention_row_mentions(to_jsonb(x),(select private.deleted_media_locator_columns(%s::oid))::text[],$1,$2))',t.relname,predicate,t.oid)
     into found_ref using r.object_key,r.storage_path;
   if found_ref then return false; end if;
 end loop;
 return true;
end $$;
commit;
