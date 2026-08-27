-- A permissive storage.objects policy is evaluated together with every other
-- SELECT policy for the caller.  Referencing protected communication tables
-- directly from one bucket's policy can therefore make unrelated buckets fail
-- with a table-permission error; an outer bucket predicate is not an execution
-- ordering guarantee.  Keep the cross-table work inside one boolean-only,
-- fixed-path helper and return no attachment or room metadata.

create or replace function public."social_attachment_storage_access_allowed"(
  p_bucket text,
  p_object_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_bucket text := coalesce(p_bucket, '');
  v_object_key text := p_object_key;
  v_allowed boolean := false;
begin
  if v_bucket <> 'social-attachments'
    or nullif(pg_catalog.btrim(coalesce(v_object_key, '')), '') is null
  then
    return false;
  end if;

  select exists (
    select 1
    from public."social_attachments" attachment
    where pg_catalog.lower(
        pg_catalog.btrim(coalesce(attachment."storage_provider", ''))
      ) = 'supabase'
      and attachment."storage_bucket" = v_bucket
      and coalesce(
        nullif(attachment."storage_object_key", ''),
        nullif(attachment."storage_path", '')
      ) = v_object_key
      and attachment."deleted_at" is null
      and attachment."quarantined_at" is null
      and attachment."moderation_status" in ('clean', 'reported')
      and public."media_scan_public_safe"(attachment."scan_status")
      and (
        (
          attachment."surface_type" = 'profile_post'
          and exists (
            select 1
            from public."profile_posts" post
            where post."id" = attachment."surface_id"
              and post."deleted_at" is null
              and post."visibility" = 'public'
              and post."moderation_status" in ('clean', 'reported')
              and public."can_view_profile_content"(post."user_id")
          )
        )
        or (
          attachment."surface_type" = 'profile_post_comment'
          and exists (
            select 1
            from public."profile_post_comments" comment_row
            join public."profile_posts" post
              on post."id" = comment_row."post_id"
            where comment_row."id" = attachment."surface_id"
              and comment_row."deleted_at" is null
              and comment_row."moderation_status" in ('clean', 'reported')
              and post."deleted_at" is null
              and post."visibility" = 'public'
              and post."moderation_status" in ('clean', 'reported')
              and public."can_view_profile_content"(post."user_id")
          )
        )
        or (
          attachment."surface_type" = 'creator_video_comment'
          and exists (
            select 1
            from public."creator_video_comments" comment_row
            join public."videos" video
              on video."id" = comment_row."video_id"
            where comment_row."id" = attachment."surface_id"
              and comment_row."deleted_at" is null
              and comment_row."moderation_status" in ('clean', 'reported')
              and video."visibility" = 'public'
              and video."moderation_status" in ('clean', 'reported')
              and video."quarantined_at" is null
              and public."media_scan_public_safe"(video."scan_status")
              -- A public row is only discovery metadata. VIP and per-video
              -- commerce authority must resolve for the exact parent before
              -- its comment attachment can become downloadable.
              and public."creator_video_commerce_access_allowed"(video."id")
          )
        )
        or (
          attachment."surface_type" = 'chat_message'
          and auth.uid() is not null
          and exists (
            select 1
            from public."chat_messages" message
            where message."id" = attachment."surface_id"
              and public."can_access_chat_thread"(message."thread_id")
          )
        )
        or (
          attachment."surface_type" = 'watch_party_room_message'
          and auth.uid() is not null
          and exists (
            select 1
            from public."watch_party_room_messages" message
            where message."id" = attachment."surface_id"
              and public."can_read_watch_party_room_authority"(
                message."party_id"
              )
          )
        )
      )
  ) into v_allowed;

  return coalesce(v_allowed, false);
exception when others then
  -- Storage authorization is fail closed.  A malformed historical row or a
  -- downstream authority failure must not abort unrelated bucket reads.
  return false;
end;
$$;

revoke all on function public."social_attachment_storage_access_allowed"(
  text, text
) from public, anon, authenticated, service_role;
grant execute on function public."social_attachment_storage_access_allowed"(
  text, text
) to anon, authenticated;

comment on function public."social_attachment_storage_access_allowed"(
  text, text
) is
  'Boolean-only exact Supabase social-attachment Storage gate. Communication attachments require current canonical room authority.';

drop policy if exists "social_attachments_storage_select_authorized"
  on storage."objects";
create policy "social_attachments_storage_select_authorized"
  on storage."objects"
  for select
  to anon, authenticated
  using (
    public."social_attachment_storage_access_allowed"("bucket_id", "name")
  );

-- The platform-brand Storage policy had the same cross-policy failure mode:
-- its direct subquery caused the platform_brand_assets RLS expression (and its
-- private staff helpers) to be planned for every anonymous storage.objects
-- read, even when the object belonged to another bucket.  Keep both the row
-- and object decisions behind fixed-path, fail-closed boolean helpers.
create or replace function public."platform_brand_asset_row_access_allowed"(
  p_owner_user_id text,
  p_asset_state text,
  p_moderation_status text,
  p_scan_status text,
  p_storage_provider text,
  p_storage_bucket text,
  p_storage_object_key text,
  p_storage_path text,
  p_quarantined_at timestamptz,
  p_deleted_at timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id text := auth.uid()::text;
begin
  if p_quarantined_at is not null
    or p_deleted_at is not null
    or nullif(pg_catalog.btrim(coalesce(p_owner_user_id, '')), '') is null
    or pg_catalog.lower(pg_catalog.btrim(coalesce(p_storage_provider, '')))
      <> 'supabase'
    or p_storage_bucket <> 'platform-brand-assets'
    or nullif(pg_catalog.btrim(coalesce(p_storage_object_key, '')), '') is null
    or p_storage_object_key is distinct from p_storage_path
    or (storage."foldername"(p_storage_path))[1] is distinct from p_owner_user_id
  then
    return false;
  end if;

  if p_asset_state = 'published'
    and p_moderation_status in ('clean', 'reported')
    and public."media_scan_public_safe"(p_scan_status)
  then
    return true;
  end if;

  if v_actor_id is null
    or not public."whole_app_exact_current_session_authority_internal"()
    or public."is_account_access_restricted"(v_actor_id)
  then
    return false;
  end if;

  if p_owner_user_id = v_actor_id then
    return true;
  end if;

  return public."has_platform_role"(
      array['owner'::text, 'operator'::text]
    )
    or public."has_platform_permission"('content_moderation')
    or public."has_platform_permission"('reports_review');
exception when others then
  return false;
end;
$$;

revoke all on function public."platform_brand_asset_row_access_allowed"(
  text, text, text, text, text, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public."platform_brand_asset_row_access_allowed"(
  text, text, text, text, text, text, text, text, timestamptz, timestamptz
) to anon, authenticated;

drop policy if exists "platform_brand_assets_select_owner_or_public_safe"
  on public."platform_brand_assets";
create policy "platform_brand_assets_select_owner_or_public_safe"
  on public."platform_brand_assets"
  for select
  to anon, authenticated
  using (
    public."platform_brand_asset_row_access_allowed"(
      "owner_user_id", "asset_state", "moderation_status", "scan_status",
      "storage_provider", "storage_bucket", "storage_object_key", "storage_path",
      "quarantined_at", "deleted_at"
    )
  );

drop policy if exists "platform_brand_assets_insert_owner_draft"
  on public."platform_brand_assets";
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
    and pg_catalog.lower(pg_catalog.btrim(coalesce("storage_provider", '')))
      = 'supabase'
    and "storage_bucket" = 'platform-brand-assets'
    and nullif(pg_catalog.btrim(coalesce("storage_object_key", '')), '') is not null
    and "storage_object_key" = "storage_path"
    and (storage."foldername"("storage_path"))[1] = "owner_user_id"
  );

drop policy if exists "platform_brand_assets_update_owner_safe_fields"
  on public."platform_brand_assets";
create policy "platform_brand_assets_update_owner_safe_fields"
  on public."platform_brand_assets"
  for update
  to authenticated
  using (
    "owner_user_id" = auth.uid()::text
    and public."has_active_premium_creator_tool_access"("owner_user_id")
    and pg_catalog.lower(pg_catalog.btrim(coalesce("storage_provider", '')))
      = 'supabase'
    and "storage_bucket" = 'platform-brand-assets'
    and "storage_object_key" = "storage_path"
    and (storage."foldername"("storage_path"))[1] = "owner_user_id"
  )
  with check (
    "owner_user_id" = auth.uid()::text
    and public."has_active_premium_creator_tool_access"("owner_user_id")
    and pg_catalog.lower(pg_catalog.btrim(coalesce("storage_provider", '')))
      = 'supabase'
    and "storage_bucket" = 'platform-brand-assets'
    and "storage_object_key" = "storage_path"
    and (storage."foldername"("storage_path"))[1] = "owner_user_id"
  );

create or replace function public."platform_brand_asset_public_safe"(
  p_asset_id uuid,
  p_owner_user_id text default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."platform_brand_assets" asset
    where asset."id" = p_asset_id
      and (p_owner_user_id is null
        or asset."owner_user_id" = p_owner_user_id)
      and asset."asset_state" = 'published'
      and public."platform_brand_asset_row_access_allowed"(
        asset."owner_user_id", asset."asset_state",
        asset."moderation_status", asset."scan_status",
        asset."storage_provider", asset."storage_bucket",
        asset."storage_object_key", asset."storage_path",
        asset."quarantined_at", asset."deleted_at"
      )
  );
$$;
revoke all on function public."platform_brand_asset_public_safe"(uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public."platform_brand_asset_public_safe"(uuid,text)
  to anon,authenticated,service_role;

create or replace function public."platform_brand_storage_access_allowed"(
  p_bucket text,
  p_object_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_bucket text := coalesce(p_bucket, '');
  v_object_key text := nullif(pg_catalog.btrim(coalesce(p_object_key, '')), '');
  v_actor_id text := auth.uid()::text;
  v_allowed boolean := false;
begin
  if v_bucket <> 'platform-brand-assets' or v_object_key is null then
    return false;
  end if;

  select exists (
    select 1
    from public."platform_brand_assets" asset
    where pg_catalog.lower(
        pg_catalog.btrim(coalesce(asset."storage_provider", ''))
      ) = 'supabase'
      and asset."storage_bucket" = v_bucket
      and asset."storage_object_key" = v_object_key
      and asset."storage_path" = v_object_key
      and (storage."foldername"(v_object_key))[1] = asset."owner_user_id"
      and asset."quarantined_at" is null
      and asset."deleted_at" is null
      and (
        (
          asset."asset_state" = 'published'
          and asset."moderation_status" in ('clean', 'reported')
          and public."media_scan_public_safe"(asset."scan_status")
        )
        or (
          v_actor_id is not null
          and asset."owner_user_id" = v_actor_id
          and (storage."foldername"(v_object_key))[1] = v_actor_id
          and public."whole_app_exact_current_session_authority_internal"()
          and not public."is_account_access_restricted"(v_actor_id)
        )
      )
  ) into v_allowed;

  return coalesce(v_allowed, false);
exception when others then
  return false;
end;
$$;

revoke all on function public."platform_brand_storage_access_allowed"(
  text, text
) from public, anon, authenticated, service_role;
grant execute on function public."platform_brand_storage_access_allowed"(
  text, text
) to anon, authenticated;

drop policy if exists "platform_brand_storage_select_owner_or_public_safe"
  on storage."objects";
create policy "platform_brand_storage_select_owner_or_public_safe"
  on storage."objects"
  for select
  to anon, authenticated
  using (
    public."platform_brand_storage_access_allowed"("bucket_id", "name")
  );
