drop policy if exists "platform_brand_assets_select_owner_or_public_safe" on public."platform_brand_assets";
create policy "platform_brand_assets_select_owner_or_public_safe"
  on public."platform_brand_assets" for select to anon, authenticated
  using (
    "deleted_at" is null
    and (
      "owner_user_id" = auth.uid()::text
      or (
        "asset_state" = 'published'
        and "moderation_status" in ('clean', 'reported')
      )
      or (
        auth.role() = 'authenticated'
        and (
          public.has_platform_role(array['owner'::text, 'operator'::text])
          or public.has_platform_permission('content_moderation')
          or public.has_platform_permission('reports_review')
        )
      )
    )
  );

drop policy if exists "platform_brand_storage_select_owner_or_public_safe" on storage.objects;
create policy "platform_brand_storage_select_owner_or_public_safe"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'platform-brand-assets'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or exists (
        select 1
        from public."platform_brand_assets" asset
        where asset."storage_bucket" = storage.objects.bucket_id
          and asset."storage_path" = storage.objects.name
          and asset."asset_state" = 'published'
          and asset."moderation_status" in ('clean', 'reported')
          and asset."deleted_at" is null
      )
      or (
        auth.role() = 'authenticated'
        and (
          public.has_platform_role(array['owner'::text, 'operator'::text])
          or public.has_platform_permission('content_moderation')
          or public.has_platform_permission('reports_review')
        )
      )
    )
  );

comment on policy "platform_brand_assets_select_owner_or_public_safe" on public."platform_brand_assets" is
  'Owners can read their own brand assets, public clients can read only published moderation-safe assets, and authorized reviewers can read pending assets for review.';
