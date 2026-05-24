create or replace function public."assert_platform_brand_profile_references"()
returns trigger
language plpgsql
as $$
declare
  asset_id uuid;
  asset_ids uuid[];
begin
  asset_ids := array[
    new."hero_image_asset_id",
    new."hero_video_asset_id",
    new."hero_poster_asset_id",
    new."background_image_asset_id",
    new."avatar_asset_id",
    new."logo_asset_id",
    new."watermark_asset_id"
  ];

  foreach asset_id in array asset_ids loop
    if asset_id is null then
      continue;
    end if;

    if not exists (
      select 1
      from public."platform_brand_assets" asset
      where asset."id" = asset_id
        and asset."owner_user_id" = new."owner_user_id"
        and asset."deleted_at" is null
    ) then
      raise exception 'Platform brand asset does not belong to this platform.';
    end if;
  end loop;

  if nullif(btrim(coalesce(new."spotlight_video_id", '')), '') is not null
    and not exists (
      select 1
      from public."videos" video
      where video."id"::text = new."spotlight_video_id"
        and video."owner_id"::text = new."owner_user_id"
        and video."visibility" = 'public'
        and video."moderation_status" in ('clean', 'reported')
    )
  then
    raise exception 'Spotlight video must be a public reviewed upload owned by this platform.';
  end if;

  return new;
end;
$$;

comment on function public."assert_platform_brand_profile_references"() is
  'Validates Platform Brand Studio asset ownership and public reviewed Spotlight video references without UUID/text comparison failures.';
