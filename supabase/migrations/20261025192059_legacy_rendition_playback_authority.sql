-- The legacy SECURITY DEFINER selector bypasses table RLS. Apply the same
-- current rendition safety predicate to its source-bearing results, Storage,
-- and direct owner reads. Parent commerce authorization stays in the public
-- resolve_video_playback wrapper; this migration does not change job lifecycle.
begin;

create or replace function public."video_rendition_playback_safe"(p_rendition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."video_renditions" rendition
    join public."videos" video on video."id"=rendition."video_id"
    where rendition."id"=p_rendition_id
      and rendition."status"='ready'
      and rendition."quality_label"<>'original'
      and nullif(btrim(coalesce(rendition."manifest_path",rendition."storage_path",'')),'') is not null
      and rendition."quarantined_at" is null
      and video."quarantined_at" is null
      and video."moderation_status" in ('clean','reported')
      and public."media_scan_public_safe"(video."scan_status")
      and public."media_scan_public_safe"(rendition."scan_status")
      and public."video_rendition_binding_valid"(rendition."video_id",rendition."owner_id")
      and public."video_rendition_output_paths_valid"(
        rendition."id",rendition."storage_path",rendition."manifest_path"
      )
  );
$$;
revoke all on function public."video_rendition_playback_safe"(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public."video_rendition_playback_safe"(uuid)
  to anon,authenticated,service_role;
comment on function public."video_rendition_playback_safe"(uuid) is
  'Boolean-only current legacy rendition safety. It returns no paths and does not grant viewer, commerce, ownership, or Premium authority.';

-- Count all ready renditions in the legacy selector, including unsafe ones.
-- Filtering that count would revive original fallback after a rendition loses
-- its claim or is quarantined. Only the actual quality/availability selectors
-- use the safety predicate.
create or replace function public."resolve_video_playback_pre_paid_authority_closeout"(target_video_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
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
    and public."video_rendition_playback_safe"(rendition."id")
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
    and public."video_rendition_playback_safe"(rendition."id")
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
      and public."video_rendition_playback_safe"(rendition."id")
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
      and public."video_rendition_playback_safe"(rendition."id")
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

comment on function public."resolve_video_playback_pre_paid_authority_closeout"(uuid) is
  'Internal legacy selector behind resolve_video_playback. Every returned quality and availability flag requires current parent/rendition scan, quarantine, source binding and exact output claims; viewer tier and fallback semantics are preserved.';


create or replace function public."creator_video_storage_rendition_access_allowed"(
  p_bucket text,
  p_object_key text,
  p_required_tier text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.btrim(coalesce(p_bucket,''))='creator-videos'
    and pg_catalog.lower(pg_catalog.btrim(coalesce(p_required_tier,'')))
      in ('free','premium')
    and nullif(pg_catalog.btrim(coalesce(p_object_key,'')),'') is not null
    and exists (
      select 1
      from public."video_renditions" rendition
      join public."videos" video on video."id"=rendition."video_id"
      where rendition."storage_bucket"=pg_catalog.btrim(p_bucket)
        and (
          rendition."storage_path"=pg_catalog.btrim(p_object_key)
          or rendition."manifest_path"=pg_catalog.btrim(p_object_key)
        )
        and rendition."access_tier"=
          pg_catalog.lower(pg_catalog.btrim(p_required_tier))
        and public."video_rendition_playback_safe"(rendition."id")
        and public."can_read_creator_video_row"(
          video."owner_id"::text,
          video."visibility",
          video."moderation_status",
          video."scan_status",
          video."storage_path",
          video."storage_object_key",
          video."playback_url",
          auth.uid()::text
        )
        and (
          pg_catalog.lower(pg_catalog.btrim(p_required_tier))='free'
          or case
            when auth.uid() is null then false
            else public."monetization_has_active_premium"(auth.uid())
          end
        )
    );
$$;
revoke all on function public."creator_video_storage_rendition_access_allowed"(text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public."creator_video_storage_rendition_access_allowed"(text,text,text)
  to anon,authenticated;
comment on function public."creator_video_storage_rendition_access_allowed"(text,text,text) is
  'Boolean-only exact legacy rendition gate. Free and Premium remain separate; Premium requires current provider-backed Premium. Staff preview uses the audited media endpoint and is not direct Storage authority.';


-- Keep exact current ownership separate from the shared safety predicate.
drop policy if exists "video_renditions_select_owner_operator"
  on public."video_renditions";
create policy "video_renditions_select_owner_operator"
  on public."video_renditions" for select to authenticated using (
    public."creator_rendition_direct_owner_authorized"("owner_id")
    and public."video_rendition_playback_safe"("id")
  );

-- The historical selector remains inaccessible as a direct RPC.
revoke all on function public."resolve_video_playback_pre_paid_authority_closeout"(uuid)
  from public,anon,authenticated,service_role;

commit;
