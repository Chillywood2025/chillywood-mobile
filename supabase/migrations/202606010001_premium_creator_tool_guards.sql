-- Restore Premium-backed creator tool guards for Google testing.
-- This does not grant Premium. It only allows creator-tool writes when an
-- active RevenueCat/Google-backed entitlement row exists, or when an
-- active owner/operator platform role is performing allowed owner work.

create or replace function public."has_active_premium_creator_tool_access"(target_user_id text default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with actor as (
    select coalesce(nullif(btrim(target_user_id), ''), auth.uid()::text) as user_id
  )
  select exists (
    select 1
    from public."user_entitlements" entitlement
    join actor on actor.user_id = entitlement."user_id"
    where entitlement."entitlement_key" = 'premium'
      and entitlement."status" in ('active', 'trialing', 'grace_period')
      and entitlement."revoked_at" is null
      and (
        entitlement."expires_at" is null
        or entitlement."expires_at" > now()
      )
  )
  or public.has_platform_role(array['owner'::text, 'operator'::text]);
$$;

revoke all on function public."has_active_premium_creator_tool_access"(text) from public;
grant execute on function public."has_active_premium_creator_tool_access"(text) to authenticated;
grant execute on function public."has_active_premium_creator_tool_access"(text) to service_role;

drop policy if exists "Users can insert own videos" on public."videos";
create policy "Users can insert own videos"
  on public."videos"
  for insert
  to public
  with check (
    auth.uid() is not null
    and auth.uid() = "owner_id"
    and public."has_active_premium_creator_tool_access"(auth.uid()::text)
  );

drop policy if exists "creator_videos_storage_owner_insert" on storage.objects;
create policy "creator_videos_storage_owner_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'creator-videos'
    and (storage.foldername(name))[1] = (auth.uid())::text
    and public."has_active_premium_creator_tool_access"(auth.uid()::text)
  );

drop policy if exists "creator_videos_storage_owner_update" on storage.objects;
create policy "creator_videos_storage_owner_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'creator-videos'
    and (storage.foldername(name))[1] = (auth.uid())::text
    and public."has_active_premium_creator_tool_access"(auth.uid()::text)
  )
  with check (
    bucket_id = 'creator-videos'
    and (storage.foldername(name))[1] = (auth.uid())::text
    and public."has_active_premium_creator_tool_access"(auth.uid()::text)
  );

drop policy if exists "platform_brand_assets_insert_owner_draft" on public."platform_brand_assets";
create policy "platform_brand_assets_insert_owner_draft"
  on public."platform_brand_assets"
  for insert
  to authenticated
  with check (
    "owner_user_id" = auth.uid()::text
    and public."has_active_premium_creator_tool_access"("owner_user_id")
    and "asset_state" = 'draft'
    and "moderation_status" = 'pending_review'
    and "deleted_at" is null
  );

drop policy if exists "platform_brand_assets_update_owner_safe_fields" on public."platform_brand_assets";
create policy "platform_brand_assets_update_owner_safe_fields"
  on public."platform_brand_assets"
  for update
  to authenticated
  using (
    "owner_user_id" = auth.uid()::text
    and public."has_active_premium_creator_tool_access"("owner_user_id")
  )
  with check (
    "owner_user_id" = auth.uid()::text
    and public."has_active_premium_creator_tool_access"("owner_user_id")
  );

drop policy if exists "platform_brand_profiles_write_owner" on public."platform_brand_profiles";
create policy "platform_brand_profiles_write_owner"
  on public."platform_brand_profiles"
  for all
  to authenticated
  using (
    "owner_user_id" = auth.uid()::text
    and public."has_active_premium_creator_tool_access"("owner_user_id")
  )
  with check (
    "owner_user_id" = auth.uid()::text
    and public."has_active_premium_creator_tool_access"("owner_user_id")
  );

drop policy if exists "platform_brand_storage_insert_owner_prefix" on storage.objects;
create policy "platform_brand_storage_insert_owner_prefix"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'platform-brand-assets'
    and split_part(name, '/', 1) = auth.uid()::text
    and public."has_active_premium_creator_tool_access"(auth.uid()::text)
  );

drop policy if exists "platform_brand_storage_update_owner_prefix" on storage.objects;
create policy "platform_brand_storage_update_owner_prefix"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'platform-brand-assets'
    and split_part(name, '/', 1) = auth.uid()::text
    and public."has_active_premium_creator_tool_access"(auth.uid()::text)
  )
  with check (
    bucket_id = 'platform-brand-assets'
    and split_part(name, '/', 1) = auth.uid()::text
    and public."has_active_premium_creator_tool_access"(auth.uid()::text)
  );

drop policy if exists "creator_clip_edits_insert_owner" on public."creator_clip_edits";
create policy "creator_clip_edits_insert_owner"
  on public."creator_clip_edits"
  for insert
  to authenticated
  with check (
    "owner_user_id" = auth.uid()::text
    and public."has_active_premium_creator_tool_access"("owner_user_id")
  );

drop policy if exists "creator_clip_edits_update_owner" on public."creator_clip_edits";
create policy "creator_clip_edits_update_owner"
  on public."creator_clip_edits"
  for update
  to authenticated
  using (
    "owner_user_id" = auth.uid()::text
    and public."has_active_premium_creator_tool_access"("owner_user_id")
  )
  with check (
    "owner_user_id" = auth.uid()::text
    and public."has_active_premium_creator_tool_access"("owner_user_id")
  );

comment on function public."has_active_premium_creator_tool_access"(text) is
  'Premium creator-tool guard. Checks active premium entitlement or active owner/operator role only; does not grant Premium, paid access, money movement, checkout, tickets, seats, tips, or payouts.';
