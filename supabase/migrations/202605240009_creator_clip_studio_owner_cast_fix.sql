create or replace function public."assert_creator_clip_edit_references"()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public."videos" video
    where video."id" = new."video_id"
      and video."owner_id"::text = new."owner_user_id"
  ) then
    raise exception 'Clip Studio edit must belong to a creator video owned by this account.';
  end if;

  if new."cover_storage_path" is not null
    and not exists (
      select 1
      from public."videos" video
      where video."id" = new."video_id"
        and video."owner_id"::text = new."owner_user_id"
        and video."thumb_storage_path" = new."cover_storage_path"
    )
  then
    raise exception 'Clip Studio cover must match the saved creator-video cover path.';
  end if;

  if coalesce(new."brand_mark_enabled", false) then
    if new."brand_asset_id" is null then
      raise exception 'Clip Studio brand mark requires an approved published Platform asset.';
    end if;

    if not exists (
      select 1
      from public."platform_brand_assets" asset
      where asset."id" = new."brand_asset_id"
        and asset."owner_user_id" = new."owner_user_id"
        and asset."asset_type" in ('avatar', 'logo', 'watermark')
        and asset."asset_state" = 'published'
        and asset."moderation_status" in ('clean', 'reported')
        and asset."deleted_at" is null
    ) then
      raise exception 'Clip Studio brand mark must be an approved published Platform asset.';
    end if;
  end if;

  return new;
end;
$$;

comment on function public."assert_creator_clip_edit_references"() is
  'Validates Clip Studio metadata references. Casts videos.owner_id to text because older videos schemas store owner_id as uuid while Clip Studio owner_user_id is text.';
