create or replace function public."resolve_video_playback"(target_video_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_video public."videos"%rowtype;
  v_is_owner boolean := false;
  v_is_staff boolean := false;
  v_has_premium boolean := false;
  v_is_public_safe boolean := false;
  v_has_legacy_source boolean := false;
  v_ready_rendition_count integer := 0;
  v_allowed_qualities jsonb := '[]'::jsonb;
  v_rendition_statuses jsonb := '[]'::jsonb;
  v_default_quality text := null;
  v_hd_available boolean := false;
  v_premium_locked_available boolean := false;
begin
  select *
  into v_video
  from public."videos" video
  where video."id" = target_video_id;

  if not found then
    return jsonb_build_object(
      'status', 'not_found',
      'video_id', target_video_id,
      'allowed_qualities', '[]'::jsonb,
      'default_quality', null,
      'is_premium_locked_available', false,
      'hd_available', false,
      'legacy_single_file_available', false,
      'legacy_playback_allowed', false,
      'message', 'Video was not found.'
    );
  end if;

  v_is_owner := v_viewer_id is not null and v_video."owner_id" = v_viewer_id;
  v_is_staff := public.has_platform_role(array['owner'::text, 'operator'::text]);
  v_is_public_safe := v_video."visibility" = 'public'
    and v_video."moderation_status" in ('clean', 'reported')
    and public.media_scan_public_safe(v_video."scan_status");
  v_has_legacy_source := nullif(trim(coalesce(v_video."storage_object_key", v_video."storage_path", v_video."playback_url", '')), '') is not null;

  if not (v_is_public_safe or v_is_owner or v_is_staff) then
    return jsonb_build_object(
      'status', 'not_allowed',
      'video_id', v_video."id",
      'title', coalesce(nullif(trim(v_video."title"), ''), 'Untitled Video'),
      'allowed_qualities', '[]'::jsonb,
      'default_quality', null,
      'is_premium_locked_available', false,
      'hd_available', false,
      'legacy_single_file_available', false,
      'legacy_playback_allowed', false,
      'message', 'This creator video is not available for this viewer.'
    );
  end if;

  if v_viewer_id is not null then
    v_has_premium := public.user_has_active_entitlement(v_viewer_id::text, array['premium'::text]);
  end if;

  select count(*)
  into v_ready_rendition_count
  from public."video_renditions" rendition
  where rendition."video_id" = v_video."id"
    and rendition."status" = 'ready'
    and rendition."quality_label" <> 'original';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', rendition."id",
      'quality_label', rendition."quality_label",
      'width', rendition."width",
      'height', rendition."height",
      'fps', rendition."fps",
      'bitrate_kbps', rendition."bitrate_kbps",
      'codec', rendition."codec",
      'container', rendition."container",
      'access_tier', rendition."access_tier",
      'storage_bucket', rendition."storage_bucket",
      'storage_path', rendition."storage_path",
      'manifest_path', rendition."manifest_path"
    )
    order by
      case rendition."quality_label"
        when '1080p' then 5
        when '720p' then 4
        when '480p' then 3
        when '360p' then 2
        else 1
      end desc
  ), '[]'::jsonb)
  into v_allowed_qualities
  from public."video_renditions" rendition
  where rendition."video_id" = v_video."id"
    and rendition."status" = 'ready'
    and rendition."quality_label" <> 'original'
    and nullif(trim(coalesce(rendition."manifest_path", rendition."storage_path", '')), '') is not null
    and (v_is_owner or v_is_staff or public.media_scan_public_safe(rendition."scan_status"))
    and (
      rendition."access_tier" = 'free'
      or v_is_owner
      or v_is_staff
      or (rendition."access_tier" = 'premium' and v_has_premium)
    );

  select rendition."quality_label"
  into v_default_quality
  from public."video_renditions" rendition
  where rendition."video_id" = v_video."id"
    and rendition."status" = 'ready'
    and rendition."quality_label" <> 'original'
    and nullif(trim(coalesce(rendition."manifest_path", rendition."storage_path", '')), '') is not null
    and (v_is_owner or v_is_staff or public.media_scan_public_safe(rendition."scan_status"))
    and (
      rendition."access_tier" = 'free'
      or v_is_owner
      or v_is_staff
      or (rendition."access_tier" = 'premium' and v_has_premium)
    )
  order by
    case rendition."quality_label"
      when '1080p' then 5
      when '720p' then 4
      when '480p' then 3
      when '360p' then 2
      else 1
    end desc
  limit 1;

  select exists (
    select 1
    from public."video_renditions" rendition
    where rendition."video_id" = v_video."id"
      and rendition."status" = 'ready'
      and rendition."quality_label" in ('720p', '1080p')
      and (v_is_owner or v_is_staff or public.media_scan_public_safe(rendition."scan_status"))
      and (
        rendition."access_tier" = 'free'
        or v_is_owner
        or v_is_staff
        or (rendition."access_tier" = 'premium' and v_has_premium)
      )
  )
  into v_hd_available;

  select exists (
    select 1
    from public."video_renditions" rendition
    where rendition."video_id" = v_video."id"
      and rendition."status" = 'ready'
      and rendition."quality_label" in ('720p', '1080p')
      and public.media_scan_public_safe(rendition."scan_status")
      and rendition."access_tier" = 'premium'
      and not (v_is_owner or v_is_staff or v_has_premium)
  )
  into v_premium_locked_available;

  if v_is_owner or v_is_staff then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', rendition."id",
        'quality_label', rendition."quality_label",
        'status', rendition."status",
        'access_tier', rendition."access_tier",
        'width', rendition."width",
        'height', rendition."height",
        'fps', rendition."fps",
        'bitrate_kbps', rendition."bitrate_kbps",
        'error_message', rendition."error_message",
        'updated_at', rendition."updated_at"
      )
      order by
        case rendition."quality_label"
          when 'original' then 1
          when '360p' then 2
          when '480p' then 3
          when '720p' then 4
          when '1080p' then 5
          else 6
        end asc
    ), '[]'::jsonb)
    into v_rendition_statuses
    from public."video_renditions" rendition
    where rendition."video_id" = v_video."id";
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'video_id', v_video."id",
    'title', coalesce(nullif(trim(v_video."title"), ''), 'Untitled Video'),
    'allowed_qualities', v_allowed_qualities,
    'default_quality', v_default_quality,
    'is_premium_locked_available', v_premium_locked_available,
    'hd_available', v_hd_available,
    'legacy_single_file_available', v_has_legacy_source,
    'legacy_playback_allowed', v_has_legacy_source and v_ready_rendition_count = 0,
    'legacy_quality_enforcement',
      case
        when jsonb_array_length(v_allowed_qualities) > 0 then 'resolver_renditions'
        when v_has_legacy_source and v_ready_rendition_count = 0 then 'pending_renditions'
        else 'no_playable_source'
      end,
    'message',
      case
        when jsonb_array_length(v_allowed_qualities) > 0 then 'Resolved playback through allowed VOD renditions.'
        when v_has_legacy_source and v_ready_rendition_count = 0 then 'Legacy single-file playback is available; quality enforcement is pending real renditions.'
        else 'No playable VOD rendition is ready.'
      end,
    'rendition_statuses', v_rendition_statuses
  );
end;
$$;

comment on function public."resolve_video_playback"(uuid) is
  'Resolver-owned VOD playback decision. Public playback requires public visibility, clean/reported moderation, and scan-safe video/rendition status; original/master paths are never returned as regular playback options.';

create or replace function public."can_read_creator_video_row"(
  p_owner_user_id text,
  p_visibility text,
  p_moderation_status text,
  p_scan_status text,
  p_storage_path text,
  p_storage_object_key text,
  p_playback_url text,
  p_viewer_user_id text default (auth.uid())::text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with normalized as (
    select
      nullif(btrim(coalesce(p_owner_user_id, '')), '') as owner_user_id,
      coalesce(nullif(btrim(coalesce(p_viewer_user_id, '')), ''), (auth.uid())::text) as viewer_user_id,
      coalesce(nullif(btrim(coalesce(p_visibility, '')), ''), 'draft') as visibility,
      coalesce(nullif(btrim(coalesce(p_moderation_status, '')), ''), 'clean') as moderation_status,
      coalesce(nullif(btrim(coalesce(p_scan_status, '')), ''), 'pending_scan') as scan_status
  )
  select case
    when normalized.owner_user_id is null then false
    when normalized.viewer_user_id is not null and normalized.viewer_user_id = normalized.owner_user_id then true
    when normalized.moderation_status not in ('clean'::text, 'reported'::text) then false
    when not public.media_scan_public_safe(normalized.scan_status) then false
    when not public."is_creator_video_playable_source"(p_storage_path, p_storage_object_key, p_playback_url) then false
    when normalized.viewer_user_id is not null
      and public."is_creator_video_viewer_blocked"(normalized.owner_user_id, normalized.viewer_user_id)
      then false
    when normalized.visibility = 'public'::text then true
    when normalized.visibility = 'circle'::text
      and normalized.viewer_user_id is not null
      and public."is_active_chilly_circle_member"(normalized.owner_user_id, normalized.viewer_user_id)
      then true
    else false
  end
  from normalized;
$$;

revoke all on function public."can_read_creator_video_row"(text, text, text, text, text, text, text, text) from public;
grant execute on function public."can_read_creator_video_row"(text, text, text, text, text, text, text, text) to anon, authenticated, postgres, service_role;

drop policy if exists "videos_select_visibility_access" on public."videos";
create policy "videos_select_visibility_access"
  on public."videos"
  for select
  to public
  using (
    public."can_read_creator_video_row"(
      "owner_id"::text,
      "visibility",
      "moderation_status",
      "scan_status",
      "storage_path",
      "storage_object_key",
      "playback_url",
      (auth.uid())::text
    )
  );

create or replace function public."resolve_creator_video_visibility_access"(
  p_video_id text,
  p_viewer_user_id text default (auth.uid())::text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_video_id uuid;
  v_viewer_user_id text := nullif(btrim(coalesce(p_viewer_user_id, '')), '');
  v_video public."videos"%rowtype;
  v_owner_user_id text := null;
  v_visibility text := 'draft';
  v_is_owner boolean := false;
  v_is_blocked boolean := false;
  v_is_circle_member boolean := false;
  v_has_playable_source boolean := false;
  v_allowed boolean := false;
  v_reason text := 'unavailable';
begin
  begin
    v_video_id := nullif(btrim(coalesce(p_video_id, '')), '')::uuid;
  exception when others then
    v_video_id := null;
  end;

  if v_video_id is null then
    return jsonb_build_object(
      'allowed', false,
      'visibility', v_visibility,
      'reason', 'not_found',
      'is_owner', false,
      'is_blocked', false,
      'is_circle_member', false,
      'has_playable_source', false,
      'viewer_user_id', v_viewer_user_id,
      'owner_user_id', null
    );
  end if;

  select *
  into v_video
  from public."videos"
  where "id" = v_video_id
  limit 1;

  if v_video."id" is null then
    return jsonb_build_object(
      'allowed', false,
      'visibility', v_visibility,
      'reason', 'not_found',
      'is_owner', false,
      'is_blocked', false,
      'is_circle_member', false,
      'has_playable_source', false,
      'viewer_user_id', v_viewer_user_id,
      'owner_user_id', null
    );
  end if;

  v_owner_user_id := v_video."owner_id"::text;
  v_visibility := coalesce(nullif(v_video."visibility", ''), 'draft');
  if v_visibility not in ('draft', 'circle', 'public') then
    v_visibility := 'draft';
  end if;
  v_is_owner := v_viewer_user_id is not null and v_viewer_user_id = v_owner_user_id;
  v_has_playable_source := public."is_creator_video_playable_source"(v_video."storage_path", v_video."storage_object_key", v_video."playback_url");

  if v_viewer_user_id is not null and not v_is_owner then
    v_is_blocked := public."is_creator_video_viewer_blocked"(v_owner_user_id, v_viewer_user_id);
    v_is_circle_member := public."is_active_chilly_circle_member"(v_owner_user_id, v_viewer_user_id);
  end if;

  if v_is_blocked then
    v_reason := 'blocked';
  elsif v_is_owner then
    v_allowed := true;
    v_reason := 'owner_allowed';
  elsif v_video."moderation_status" not in ('clean'::text, 'reported'::text) then
    v_reason := 'moderation_unavailable';
  elsif not public.media_scan_public_safe(v_video."scan_status") then
    v_reason := 'scan_unavailable';
  elsif not v_has_playable_source then
    v_reason := 'media_unavailable';
  elsif v_visibility = 'public'::text then
    v_allowed := true;
    v_reason := 'public_allowed';
  elsif v_visibility = 'circle'::text and v_is_circle_member then
    v_allowed := true;
    v_reason := 'circle_member_allowed';
  elsif v_visibility = 'circle'::text then
    v_reason := case when v_viewer_user_id is null then 'signed_out_requires_circle' else 'circle_member_required' end;
  elsif v_visibility = 'draft'::text then
    v_reason := 'draft_owner_only';
  else
    v_reason := 'unavailable';
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'visibility', v_visibility,
    'reason', v_reason,
    'is_owner', v_is_owner,
    'is_blocked', v_is_blocked,
    'is_circle_member', v_is_circle_member,
    'has_playable_source', v_has_playable_source,
    'viewer_user_id', v_viewer_user_id,
    'owner_user_id', v_owner_user_id
  );
end;
$$;

drop policy if exists "creator_videos_storage_select_visibility_access" on storage.objects;
create policy "creator_videos_storage_select_visibility_access"
  on storage.objects
  for select
  to public
  using (
    bucket_id = 'creator-videos'
    and (
      ((auth.uid() is not null) and ((storage.foldername(name))[1] = (auth.uid())::text))
      or exists (
        select 1
        from public."videos" video
        where (
          video."storage_path" = storage.objects.name
          or video."storage_object_key" = storage.objects.name
          or video."thumb_storage_path" = storage.objects.name
          or video."playback_url" = storage.objects.name
        )
        and public."can_read_creator_video_row"(
          video."owner_id"::text,
          video."visibility",
          video."moderation_status",
          video."scan_status",
          video."storage_path",
          video."storage_object_key",
          video."playback_url",
          (auth.uid())::text
        )
      )
    )
  );

comment on function public."can_read_creator_video_row"(text, text, text, text, text, text, text, text) is
  'RLS helper for creator videos. Public and Circle reads require safe moderation, scan-safe media, playable media, and no channel block; owner reads remain allowed for Studio.';
