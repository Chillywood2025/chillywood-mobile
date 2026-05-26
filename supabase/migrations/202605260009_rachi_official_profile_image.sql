create or replace function public."admin_update_official_rachi_profile_image"(
  p_avatar_url text default null,
  p_reason text default 'Official Rachi profile photo update'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
  safe_avatar_url text := nullif(trim(coalesce(p_avatar_url, '')), '');
  safe_reason text := nullif(trim(coalesce(p_reason, '')), '');
  previous_profile public."user_profiles"%rowtype;
  updated_profile public."user_profiles"%rowtype;
  audit_id uuid;
begin
  actor_role := public."admin_content_assert_operator"();

  if safe_avatar_url is not null then
    if char_length(safe_avatar_url) > 2048 then
      raise exception 'rachi_profile_image_url_too_long';
    end if;

    if lower(safe_avatar_url) not like 'https://%' then
      raise exception 'rachi_profile_image_https_required';
    end if;
  end if;

  safe_reason := coalesce(safe_reason, 'Official Rachi profile photo update');

  select *
  into previous_profile
  from public."user_profiles"
  where "user_id" = 'platform_rachi_official';

  insert into public."user_profiles" (
    "user_id",
    "username",
    "avatar_index",
    "display_name",
    "avatar_url",
    "profile_avatar_media_status",
    "profile_avatar_fit_mode",
    "profile_avatar_focal_x",
    "profile_avatar_focal_y",
    "profile_visibility",
    "public_activity_visibility",
    "tagline",
    "channel_role",
    "profile_media_updated_at",
    "updated_at"
  )
  values (
    'platform_rachi_official',
    'chillywood.rachi',
    0,
    'Rachi',
    safe_avatar_url,
    'active',
    'fill',
    0.5,
    0.5,
    'everyone',
    'public',
    'Official Chi''llwood guide for updates, tips, and Chi''llwood Originals.',
    'creator',
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  on conflict ("user_id")
  do update set
    "username" = excluded."username",
    "display_name" = excluded."display_name",
    "avatar_url" = excluded."avatar_url",
    "profile_avatar_media_status" = 'active',
    "profile_avatar_fit_mode" = 'fill',
    "profile_avatar_focal_x" = 0.5,
    "profile_avatar_focal_y" = 0.5,
    "profile_visibility" = 'everyone',
    "public_activity_visibility" = 'public',
    "tagline" = excluded."tagline",
    "channel_role" = 'creator',
    "profile_media_updated_at" = excluded."profile_media_updated_at",
    "updated_at" = excluded."updated_at"
  returning * into updated_profile;

  audit_id := public."admin_content_write_audit"(
    'official_rachi_profile_image_updated',
    'user_profile',
    updated_profile."user_id",
    safe_reason,
    case when previous_profile."user_id" is null then null else to_jsonb(previous_profile) end,
    to_jsonb(updated_profile),
    jsonb_build_object(
      'official_account_id', 'platform_rachi_official',
      'rachi_official_account', true,
      'surface', 'admin_rachi_tab',
      'avatar_url_present', safe_avatar_url is not null
    ),
    'platform_rachi_official',
    'notice'
  );

  return jsonb_build_object(
    'userId', updated_profile."user_id",
    'avatarUrl', updated_profile."avatar_url",
    'updatedAt', updated_profile."updated_at",
    'auditId', audit_id,
    'actorRole', actor_role
  );
end;
$$;

revoke all on function public."admin_update_official_rachi_profile_image"(text, text) from public;
grant execute on function public."admin_update_official_rachi_profile_image"(text, text) to authenticated;
