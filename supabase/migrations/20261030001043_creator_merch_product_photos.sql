begin;

-- Source-only: reuse the existing private Platform asset incarnation, scan
-- queue, review and 720-hour retained deletion pipeline. No new bucket/provider,
-- scanner activation, cleanup activation, or live commerce capability.
alter table public.platform_brand_assets drop constraint platform_brand_assets_type_check;
alter table public.platform_brand_assets add constraint platform_brand_assets_type_check
 check(asset_type in ('hero_image','hero_video','hero_poster','background_image','avatar','logo','watermark','merch_product_image'));
alter table public.merch_products
 add column photo_asset_id uuid references public.platform_brand_assets(id),
 -- An authoritative locator accompanies the FK so the existing global retained
 -- object-reference scanner also sees this reference, including after archive.
 add column photo_storage_object_key text,
 add column photo_safety_removed_at timestamptz;
create unique index merch_product_photo_reference on public.merch_products(photo_asset_id) where photo_asset_id is not null;

-- Ordinary Brand publication already enforces its exact slot asset kinds.
-- Also reject placing a product photo in a draft Brand slot: otherwise an
-- unrelated draft could prevent this product's normal retained photo removal.
create function private.guard_merch_photo_brand_reference() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if exists(select 1 from public.platform_brand_assets where asset_type='merch_product_image' and id=any(array[
  new.hero_image_asset_id,new.hero_video_asset_id,new.hero_poster_asset_id,new.background_image_asset_id,
  new.avatar_asset_id,new.logo_asset_id,new.watermark_asset_id])) then raise exception 'merch_photo_product_reference_only'; end if;
 return new;
end $$;
revoke all on function private.guard_merch_photo_brand_reference() from public,anon,authenticated,service_role;
create trigger aaa_merch_photo_brand_reference before insert or update on public.platform_brand_profiles
 for each row execute function private.guard_merch_photo_brand_reference();
do $$ begin
 if to_regclass('public.platform_brand_publications') is not null then
  create trigger aaa_merch_photo_brand_reference before insert or update on public.platform_brand_publications
   for each row execute function private.guard_merch_photo_brand_reference();
 end if;
end $$;

create function private.guard_merch_photo_asset() returns trigger
language plpgsql security definer set search_path='' as $$
declare metadata jsonb;
begin
 if new.asset_type<>'merch_product_image' then return new; end if;
 -- Product publication owns this new kind, never generic Brand publication.
 -- In held-Studio schemas the legacy Brand SELECT policy otherwise considers
 -- published clean assets public without requiring a publication snapshot.
 if new.asset_state='published' then raise exception 'merch_photo_product_publication_only'; end if;
 perform private.platform_brand_retention_lock();
 if tg_op='UPDATE' and new.moderation_status='clean'
   and new.moderation_status is distinct from old.moderation_status
   and auth.uid() is not null
   and current_setting('app.platform_brand_review_context',true)='review_platform_brand_asset'
   and not (public.has_platform_role(array['owner','operator'])
     or public.has_platform_permission('content_moderation')
     or public.has_platform_permission('reports_review')) then
   if old.moderation_status<>'pending_review' or new.scan_status<>'clean'
     or new.quarantined_at is not null or new.deleted_at is not null then
     raise exception 'merch_photo_approval_unavailable'; end if;
 end if;
 if tg_op='INSERT' then
   if new.mime_type not in ('image/jpeg','image/png','image/webp')
     or new.file_size_bytes not between 1 and 20971520
     or new.storage_provider<>'supabase' or new.storage_bucket<>'platform-brand-assets'
     or new.storage_object_key not like new.owner_user_id||'/merch_product_image/%'
   then raise exception 'merch_photo_invalid'; end if;
   select o.metadata into metadata from storage.objects o
    where o.bucket_id=new.storage_bucket and o.name=new.storage_object_key for share nowait;
   if metadata is null or metadata->>'size' is null
     or (metadata->>'size')::bigint is distinct from new.file_size_bytes
     or metadata->>'mimetype' is distinct from new.mime_type
   then raise exception 'merch_photo_storage_metadata_mismatch'; end if;
 elsif old.deleted_at is null and new.deleted_at is not null
   and exists(select 1 from public.merch_products where photo_asset_id=old.id) then
   -- Preserve legitimate moderation removal, never creator deletion of an
   -- in-use asset. Retention still sees the product's authoritative locator.
   if not coalesce(auth.uid() is not null
     and current_setting('app.platform_brand_review_context',true)='review_platform_brand_asset'
     and new.moderation_status='removed' and new.asset_state='archived'
     and new.moderated_by=auth.uid()::text and new.moderated_at is not null
     and length(btrim(coalesce(new.moderation_reason,'')))>=6
     and (public.has_platform_role(array['owner','operator'])
       or public.has_platform_permission('content_moderation')
       or public.has_platform_permission('reports_review')),false)
   then raise exception 'merch_photo_in_use'; end if;
   -- A safety takedown must not freeze stock/order processing. Atomically remove
   -- its catalog reference; the original object remains in retained storage.
   perform 1 from public.merch_products where photo_asset_id=old.id for update nowait;
   update public.merch_products set photo_asset_id=null,image_url=null,
    photo_safety_removed_at=clock_timestamp(),updated_at=clock_timestamp()
    where photo_asset_id=old.id;
 end if;
 return new;
end $$;
revoke all on function private.guard_merch_photo_asset() from public,anon,authenticated,service_role;
create trigger aaa_merch_photo_asset before insert or update on public.platform_brand_assets
 for each row execute function private.guard_merch_photo_asset();

create function private.guard_merch_product_photo_reference() returns trigger
language plpgsql security definer set search_path='' as $$
declare asset public.platform_brand_assets%rowtype;
begin
 perform private.platform_brand_retention_lock();
 if tg_op='UPDATE' and (new.photo_asset_id,new.creator_id,new.photo_storage_object_key)
   is not distinct from (old.photo_asset_id,old.creator_id,old.photo_storage_object_key) then
   return new;
 end if;
 if new.photo_asset_id is null then new.photo_storage_object_key:=null; return new; end if;
 select * into asset from public.platform_brand_assets where id=new.photo_asset_id for share nowait;
 if asset.id is null or asset.owner_user_id is distinct from new.creator_id::text
   or asset.asset_type<>'merch_product_image' or asset.deleted_at is not null
   or asset.asset_state='archived' or asset.quarantined_at is not null
   or asset.storage_provider<>'supabase' or asset.storage_bucket<>'platform-brand-assets'
   or asset.storage_object_key is distinct from asset.storage_path
 then raise exception 'merch_photo_unavailable'; end if;
 new.photo_storage_object_key:=asset.storage_object_key;
 return new;
end $$;
revoke all on function private.guard_merch_product_photo_reference() from public,anon,authenticated,service_role;
create trigger aaa_merch_photo_reference before insert or update on public.merch_products
 for each row execute function private.guard_merch_product_photo_reference();
-- The pre-existing table already has generic retained-reference guards. Add
-- explicitly if a source fixture predates their catalog installation.
do $$ begin
 if not exists(select 1 from pg_trigger where tgrelid='public.merch_products'::regclass
  and tgfoid='private.guard_platform_brand_retention_references()'::regprocedure and not tgisinternal) then
  create trigger zzz_platform_brand_retention_reference before insert or update on public.merch_products
   for each row execute function private.guard_platform_brand_retention_references();
 end if;
end $$;

create function public.merch_photo_public_access_allowed(p_asset_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.whole_app_exact_current_session_authority_internal()
 and not public.is_account_access_restricted(auth.uid()::text)
 and exists(select 1 from public.platform_brand_assets a join public.merch_products p on p.photo_asset_id=a.id
   where a.id=p_asset_id and a.asset_type='merch_product_image' and a.owner_user_id=p.creator_id::text
     and a.storage_provider='supabase' and a.storage_bucket='platform-brand-assets'
     and a.storage_object_key=a.storage_path and p.photo_storage_object_key=a.storage_object_key
     and (storage.foldername(a.storage_path))[1]=a.owner_user_id
     and a.deleted_at is null and a.quarantined_at is null and a.asset_state<>'archived'
     and a.scan_status='clean' and a.moderation_status in ('clean','reported')
     and p.publication_status='published' and p.environment='sandbox'
     and coalesce((public.resolve_platform_visibility_access(p.creator_id::text,auth.uid()::text)->>'allowed')::boolean,false))
$$;
revoke all on function public.merch_photo_public_access_allowed(uuid) from public,anon,authenticated,service_role;
grant execute on function public.merch_photo_public_access_allowed(uuid) to authenticated;
create policy merch_photo_visible_product on public.platform_brand_assets for select to authenticated
 using(asset_type='merch_product_image' and public.merch_photo_public_access_allowed(id));
create policy merch_photo_visible_product_storage on storage.objects for select to authenticated
 using(bucket_id='platform-brand-assets' and exists(select 1 from public.platform_brand_assets a
   where a.storage_bucket=bucket_id and a.storage_object_key=name and a.asset_type='merch_product_image'
     and public.merch_photo_public_access_allowed(a.id)));

create function public.check_creator_merch_photo_target(p_product_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.whole_app_exact_current_session_authority_internal()
 and not public.is_account_access_restricted(auth.uid()::text)
 and public.has_active_premium_creator_tool_access(auth.uid()::text)
 and exists(select 1 from public.merch_products where id=p_product_id and creator_id=auth.uid()
   and environment='sandbox' and provider='stripe_physical_goods')
$$;
revoke all on function public.check_creator_merch_photo_target(uuid) from public,anon,authenticated,service_role;
grant execute on function public.check_creator_merch_photo_target(uuid) to authenticated;

alter function public.merch_product_projection_internal(public.merch_products) rename to merch_product_projection_before_photos_internal;
create function public.merch_product_projection_internal(p public.merch_products) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.platform_brand_assets%rowtype;
 status text:=case when p.photo_safety_removed_at is not null then 'blocked' else 'none' end;
 readable boolean:=false;
begin
 if p.photo_asset_id is not null then
   select * into a from public.platform_brand_assets where id=p.photo_asset_id;
   status:=case when a.id is null or a.deleted_at is not null or a.quarantined_at is not null
     or a.asset_state='archived' or a.scan_status in ('malware_detected','scan_failed','quarantined')
     or a.moderation_status in ('hidden','removed','rejected') then 'blocked'
     when a.scan_status='clean' and a.moderation_status in ('clean','reported') then 'ready'
     else 'pending_review' end;
   readable:=public.merch_photo_public_access_allowed(a.id)
     or (p.creator_id=auth.uid() and public.platform_brand_storage_access_allowed(a.storage_bucket,a.storage_object_key));
 end if;
 return public.merch_product_projection_before_photos_internal(p)||jsonb_build_object(
   'photoAssetId',p.photo_asset_id,'photoStatus',status,
   'photoScanStatus',case when p.creator_id=auth.uid() then a.scan_status end,
   'photoCanApprove',coalesce(p.creator_id=auth.uid() and a.scan_status='clean'
     and a.moderation_status='pending_review' and a.deleted_at is null
     and a.quarantined_at is null and a.asset_state<>'archived',false),
   'photoStoragePath',case when readable then a.storage_object_key end);
end $$;
revoke all on function public.merch_product_projection_internal(public.merch_products) from public,anon,authenticated,service_role;

create function public.assign_merch_product_photo(p_product_id uuid,p_asset_id uuid,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.merch_products%rowtype; previous_asset_id uuid;
begin
 -- Global reference latch before product/asset locks, matching retained-media
 -- mutation order. No lock inversion against expiry or reference writers.
 perform private.platform_brand_retention_lock();
 if public.check_creator_merch_photo_target(p_product_id) is distinct from true then
   raise exception 'merch_photo_owner_required' using errcode='42501'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('merch_product:'||p_product_id::text,0)) then
   raise exception 'merch_product_busy_retry' using errcode='55P03'; end if;
 select * into p from public.merch_products where id=p_product_id for update nowait;
 if public.check_creator_merch_photo_target(p_product_id) is distinct from true then
   raise exception 'merch_photo_owner_required' using errcode='42501'; end if;
 if p.publication_status='published' then
   perform public.wave1_assert_current_creator_money_authority_internal();
 end if;
 -- Same desired reference is a safe acknowledgement retry; no revision churn.
 if p.photo_asset_id is not distinct from p_asset_id then return public.merch_product_projection_internal(p); end if;
 if p_expected_updated_at is null or p.updated_at is distinct from p_expected_updated_at then
   raise exception 'merch_product_changed_reload' using errcode='40001'; end if;
 previous_asset_id:=p.photo_asset_id;
 update public.merch_products set photo_asset_id=p_asset_id,
   photo_safety_removed_at=case when p_asset_id is not null then null else photo_safety_removed_at end,
   updated_at=clock_timestamp()
   where id=p_product_id returning * into p;
 if previous_asset_id is not null then perform public.remove_platform_brand_asset(previous_asset_id); end if;
 return public.merch_product_projection_internal(p);
end $$;
revoke all on function public.assign_merch_product_photo(uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.assign_merch_product_photo(uuid,uuid,timestamptz) to authenticated;

create function public.discard_creator_merch_photo(p_asset_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform private.platform_brand_retention_lock();
 if public.whole_app_exact_current_session_authority_internal() is distinct from true
   or not exists(select 1 from public.platform_brand_assets where id=p_asset_id
     and owner_user_id=auth.uid()::text and asset_type='merch_product_image') then
   raise exception 'merch_photo_owner_required' using errcode='42501'; end if;
 -- Existing remove RPC rechecks exact active session, Premium, owner, provider,
 -- immutable incarnation and in-use prohibition; this is not object deletion.
 return public.remove_platform_brand_asset(p_asset_id);
end $$;
revoke all on function public.discard_creator_merch_photo(uuid) from public,anon,authenticated,service_role;
grant execute on function public.discard_creator_merch_photo(uuid) to authenticated;

create function public.approve_creator_merch_photo(p_product_id uuid,p_asset_id uuid,p_expected_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.merch_products%rowtype; a public.platform_brand_assets%rowtype;
begin
 perform private.platform_brand_retention_lock();
 if public.check_creator_merch_photo_target(p_product_id) is distinct from true then
   raise exception 'merch_photo_owner_required' using errcode='42501'; end if;
 select * into p from public.merch_products where id=p_product_id for update nowait;
 if p.photo_asset_id is distinct from p_asset_id or p_asset_id is null then raise exception 'merch_photo_changed_reload'; end if;
 if p_expected_updated_at is null or p.updated_at is distinct from p_expected_updated_at then
   raise exception 'merch_product_changed_reload' using errcode='40001'; end if;
 if p.publication_status='published' then perform public.wave1_assert_current_creator_money_authority_internal(); end if;
 select * into a from public.platform_brand_assets where id=p_asset_id for update nowait;
 if a.owner_user_id is distinct from auth.uid()::text or a.asset_type<>'merch_product_image'
   or a.scan_status is distinct from 'clean' or a.deleted_at is not null
   or a.quarantined_at is not null or a.asset_state='archived'
   or a.moderation_status not in ('pending_review','clean') then raise exception 'merch_photo_approval_unavailable'; end if;
 if a.moderation_status='pending_review' then
   -- Existing owner review and its audit trail; no new moderation authority,
   -- scan mutation, hidden/rejected override, or automatic public publication.
   perform public.review_platform_brand_asset(p_asset_id,'approve',null);
 end if;
 return public.merch_product_projection_internal(p);
end $$;
revoke all on function public.approve_creator_merch_photo(uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.approve_creator_merch_photo(uuid,uuid,timestamptz) to authenticated;

create function public.read_creator_merch_photo_status(p_product_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.merch_products%rowtype;
begin
 if public.whole_app_exact_current_session_authority_internal() is distinct from true
   or public.is_account_access_restricted(auth.uid()::text) is distinct from false then
   raise exception 'merch_current_session_required' using errcode='42501'; end if;
 select * into p from public.merch_products where id=p_product_id and creator_id=auth.uid() and environment='sandbox';
 if p.id is null then raise exception 'merch_photo_owner_required' using errcode='42501'; end if;
 return public.merch_product_projection_internal(p);
end $$;
revoke all on function public.read_creator_merch_photo_status(uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_creator_merch_photo_status(uuid) to authenticated;

-- Every exposed product writer enters the pre-existing retained-reference
-- latch BEFORE taking a product/advisory/order lock. These wrappers preserve
-- each canonical implementation, claims, validation, result and ACL. The
-- predecessor routines are internal only, so old clients cannot skip ordering.
alter function public.save_creator_merch_product(uuid,text,text,text,integer,integer,text,timestamptz)
 rename to save_creator_merch_product_before_photo_lock;
revoke all on function public.save_creator_merch_product_before_photo_lock(uuid,text,text,text,integer,integer,text,timestamptz) from public,anon,authenticated,service_role;
create function public.save_creator_merch_product(p_product_id uuid default null,p_title text default '',
 p_description text default '',p_image_url text default null,p_price_minor integer default 0,
 p_stock_quantity integer default 0,p_publication_status text default 'draft',p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if public.whole_app_exact_current_session_authority_internal() is distinct from true then
   raise exception 'merch_current_session_required' using errcode='42501'; end if;
 perform private.platform_brand_retention_lock();
 return public.save_creator_merch_product_before_photo_lock(p_product_id,p_title,p_description,p_image_url,
   p_price_minor,p_stock_quantity,p_publication_status,p_expected_updated_at);
end $$;
revoke all on function public.save_creator_merch_product(uuid,text,text,text,integer,integer,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.save_creator_merch_product(uuid,text,text,text,integer,integer,text,timestamptz) to authenticated;

alter function public.configure_creator_merch_variants(uuid,text,jsonb,timestamptz)
 rename to configure_creator_merch_variants_before_photo_lock;
revoke all on function public.configure_creator_merch_variants_before_photo_lock(uuid,text,jsonb,timestamptz) from public,anon,authenticated,service_role;
create function public.configure_creator_merch_variants(p_product_id uuid,p_variant_mode text,p_variants jsonb,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if public.whole_app_exact_current_session_authority_internal() is distinct from true then
   raise exception 'merch_current_session_required' using errcode='42501'; end if;
 perform private.platform_brand_retention_lock();
 return public.configure_creator_merch_variants_before_photo_lock(p_product_id,p_variant_mode,p_variants,p_expected_updated_at);
end $$;
revoke all on function public.configure_creator_merch_variants(uuid,text,jsonb,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.configure_creator_merch_variants(uuid,text,jsonb,timestamptz) to authenticated;

alter function public.reserve_merch_checkout_for_actor(uuid,uuid,uuid,integer,uuid,uuid)
 rename to reserve_merch_checkout_for_actor_before_photo_lock;
revoke all on function public.reserve_merch_checkout_for_actor_before_photo_lock(uuid,uuid,uuid,integer,uuid,uuid) from public,anon,authenticated,service_role;
create function public.reserve_merch_checkout_for_actor(p_buyer_id uuid,p_session_id uuid,p_product_id uuid,p_quantity integer,p_attempt_id uuid,p_variant_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 perform private.platform_brand_retention_lock();
 return public.reserve_merch_checkout_for_actor_before_photo_lock(p_buyer_id,p_session_id,p_product_id,p_quantity,p_attempt_id,p_variant_id);
end $$;
revoke all on function public.reserve_merch_checkout_for_actor(uuid,uuid,uuid,integer,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.reserve_merch_checkout_for_actor(uuid,uuid,uuid,integer,uuid,uuid) to service_role;
create or replace function public.reserve_merch_checkout_for_actor(p_buyer_id uuid,p_session_id uuid,
 p_product_id uuid,p_quantity integer,p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 perform private.platform_brand_retention_lock();
 return public.reserve_merch_checkout_for_actor(p_buyer_id,p_session_id,p_product_id,p_quantity,p_attempt_id,null::uuid);
end $$;
revoke all on function public.reserve_merch_checkout_for_actor(uuid,uuid,uuid,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.reserve_merch_checkout_for_actor(uuid,uuid,uuid,integer,uuid) to service_role;

alter function public.process_stripe_merch_webhook_lifecycle(text,text,text,jsonb)
 rename to process_stripe_merch_webhook_before_photo_lock;
revoke all on function public.process_stripe_merch_webhook_before_photo_lock(text,text,text,jsonb) from public,anon,authenticated,service_role;
create function public.process_stripe_merch_webhook_lifecycle(p_event_id text,p_event_type text,p_raw_event_hash text,p_facts jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 perform private.platform_brand_retention_lock();
 return public.process_stripe_merch_webhook_before_photo_lock(p_event_id,p_event_type,p_raw_event_hash,p_facts);
end $$;
revoke all on function public.process_stripe_merch_webhook_lifecycle(text,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.process_stripe_merch_webhook_lifecycle(text,text,text,jsonb) to service_role;
commit;
