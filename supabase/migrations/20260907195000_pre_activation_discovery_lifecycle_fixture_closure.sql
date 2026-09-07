-- Final installed replay found two adjacent discovery leaks:
-- 1. creator relationship feeds retained active fanout rows after a video was
--    quarantined, and their direct hydration path did not require clean scan
--    authority;
-- 2. scheduled Events whose start time had passed remained canonical Upcoming
--    discovery because the producer trusted status without time authority.
--
-- Preserve source/provider/financial evidence. Retire only derived discovery
-- projections and positively identified QA Event publication state.

do $patch_event_producer$
declare
  v_definition text;
  v_before constant text := $before$
    or (v_event."status" = 'scheduled' and v_event."starts_at" is null)
$before$;
  v_after constant text := $after$
    or (
      v_event."status" = 'scheduled'
      and (v_event."starts_at" is null or v_event."starts_at" <= v_now)
    )
    or (
      v_event."status" = 'live_now'
      and v_event."ends_at" is not null
      and v_event."ends_at" <= v_now
    )
$after$;
begin
  select pg_get_functiondef(
    'public.sync_creator_event_discovery(uuid)'::regprocedure
  ) into v_definition;

  if position(v_before in v_definition) = 0 then
    raise exception 'sync_creator_event_discovery_lifecycle_boundary_not_found';
  end if;

  execute replace(v_definition, v_before, v_after);
end;
$patch_event_producer$;

do $patch_video_producers$
declare
  v_signature regprocedure;
  v_definition text;
  v_before constant text := $before$
  v_is_feed_safe := v_video."moderation_status" in ('clean'::text, 'reported'::text)
    and public."is_creator_video_playable_source"(
      v_video."storage_path",
      v_video."storage_object_key",
      v_video."playback_url"
    );
$before$;
  v_after constant text := $after$
  v_is_feed_safe := v_video."moderation_status" in ('clean'::text, 'reported'::text)
    and public."media_scan_public_safe"(v_video."scan_status")
    and v_video."quarantined_at" is null
    and public."is_creator_video_playable_source"(
      v_video."storage_path",
      v_video."storage_object_key",
      v_video."playback_url"
    );
$after$;
begin
  foreach v_signature in array array[
    'public.sync_creator_video_feed_items(text)'::regprocedure,
    'public.sync_creator_video_feed_items_trigger()'::regprocedure
  ] loop
    select pg_get_functiondef(v_signature) into v_definition;
    if position(v_before in v_definition) = 0 then
      raise exception 'creator_video_feed_scan_boundary_not_found:%', v_signature::text;
    end if;
    execute replace(v_definition, v_before, v_after);
  end loop;
end;
$patch_video_producers$;

drop trigger if exists "sync_creator_video_feed_items_after_change" on public."videos";
create trigger "sync_creator_video_feed_items_after_change"
  after insert or update of
    "visibility", "moderation_status", "scan_status", "quarantined_at",
    "storage_path", "storage_object_key", "playback_url", "updated_at"
  or delete on public."videos"
  for each row execute function public."sync_creator_video_feed_items_trigger"();

create or replace function public."can_read_creator_feed_item"(
  p_source_type text,
  p_source_id text,
  p_creator_user_id text,
  p_visibility text,
  p_target_scope text,
  p_status text,
  p_viewer_user_id text default (auth.uid())::text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer_user_id text := (auth.uid())::text;
  v_creator_user_id text := nullif(pg_catalog.btrim(coalesce(p_creator_user_id, '')), '');
  v_source_id text := nullif(pg_catalog.btrim(coalesce(p_source_id, '')), '');
  v_video public."videos"%rowtype;
begin
  if v_creator_user_id is null or v_source_id is null or v_viewer_user_id is null then
    return false;
  end if;

  if coalesce(nullif(pg_catalog.btrim(coalesce(p_status, '')), ''), 'active') <> 'active' then
    return false;
  end if;

  if public."is_creator_feed_viewer_blocked"(v_creator_user_id, v_viewer_user_id) then
    return false;
  end if;

  if coalesce(nullif(pg_catalog.btrim(coalesce(p_source_type, '')), ''), '') = 'creator_video' then
    select * into v_video
    from public."videos"
    where "id"::text = v_source_id
      and "owner_id"::text = v_creator_user_id
    limit 1;

    if v_video."id" is null
      or v_video."moderation_status" not in ('clean', 'reported')
      or not public."media_scan_public_safe"(v_video."scan_status")
      or v_video."quarantined_at" is not null
      or not public."is_creator_video_playable_source"(
        v_video."storage_path",
        v_video."storage_object_key",
        v_video."playback_url"
      )
    then
      return false;
    end if;

    if v_viewer_user_id = v_creator_user_id then
      return true;
    end if;

    if not public."can_read_creator_video_row"(
      v_video."owner_id"::text,
      v_video."visibility",
      v_video."moderation_status",
      v_video."scan_status",
      v_video."storage_path",
      v_video."storage_object_key",
      v_video."playback_url",
      v_viewer_user_id
    ) then
      return false;
    end if;

    if p_target_scope = 'followers' then
      return p_visibility = 'public'
        and v_video."visibility" = 'public'
        and exists (
          select 1 from public."channel_followers" follower_row
          where follower_row."channel_user_id" = v_creator_user_id
            and follower_row."follower_user_id" = v_viewer_user_id
        );
    end if;

    if p_target_scope = 'circle' then
      return p_visibility in ('public', 'circle')
        and public."is_active_chilly_circle_member"(v_creator_user_id, v_viewer_user_id);
    end if;
  elsif coalesce(nullif(pg_catalog.btrim(coalesce(p_source_type, '')), ''), '') = 'profile_post' then
    if not exists (
      select 1 from public."profile_posts" post
      where post."id"::text = v_source_id
        and post."user_id" = v_creator_user_id
        and post."deleted_at" is null
        and post."visibility" = 'public'
        and post."moderation_status" in ('clean', 'reported')
        and public."can_view_profile_content"(post."user_id")
    ) then
      return false;
    end if;

    if v_viewer_user_id = v_creator_user_id then
      return true;
    end if;

    if p_target_scope = 'followers' then
      return p_visibility = 'public'
        and exists (
          select 1 from public."channel_followers" follower_row
          where follower_row."channel_user_id" = v_creator_user_id
            and follower_row."follower_user_id" = v_viewer_user_id
        );
    end if;

    if p_target_scope = 'circle' then
      return p_visibility = 'public'
        and public."is_active_chilly_circle_member"(v_creator_user_id, v_viewer_user_id);
    end if;
  end if;

  return false;
end;
$$;

revoke all on function public."can_read_creator_feed_item"(
  text, text, text, text, text, text, text
) from public;
grant execute on function public."can_read_creator_feed_item"(
  text, text, text, text, text, text, text
) to anon, authenticated, postgres, service_role;

create or replace function public."can_read_circle_spectator_feed_item"(
  p_item_id uuid,
  p_viewer_user_id text default (auth.uid())::text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item public."circle_spectator_feed_items"%rowtype;
  v_viewer_user_id text := nullif(pg_catalog.btrim(coalesce(p_viewer_user_id, '')), '');
  v_now timestamptz := now();
begin
  if v_viewer_user_id is distinct from (auth.uid())::text then
    return false;
  end if;

  select * into v_item
  from public."circle_spectator_feed_items"
  where "id" = p_item_id;

  if not found then
    return false;
  end if;

  if v_item."status" <> 'active'
    or v_item."visibility" <> 'circle'
    or v_item."access_type" <> 'circle'
    or v_item."moderation_status" <> 'clean'
    or v_item."rights_status" not in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')
    or v_item."is_spectator_enabled" is not true
    or v_item."allow_spectator_view" is not true
    or (
      v_item."live_state" = 'scheduled'
      and (v_item."starts_at" is null or v_item."starts_at" <= v_now)
    )
    or (
      v_item."live_state" = 'live'
      and v_item."ended_at" is not null
      and v_item."ended_at" <= v_now
    )
  then
    return false;
  end if;

  if v_viewer_user_id is null then
    return false;
  end if;

  if v_viewer_user_id = v_item."creator_user_id"
    or v_viewer_user_id = v_item."host_user_id"
    or v_viewer_user_id = v_item."channel_user_id"
  then
    return true;
  end if;

  if public."is_circle_spectator_viewer_blocked"(
    v_item."creator_user_id", v_viewer_user_id
  ) then
    return false;
  end if;

  return public."is_active_chilly_circle_member"(
    v_item."creator_user_id", v_viewer_user_id
  );
end;
$$;

revoke all on function public."can_read_circle_spectator_feed_item"(uuid, text)
  from public, anon, authenticated;
grant execute on function public."can_read_circle_spectator_feed_item"(uuid, text)
  to authenticated, postgres, service_role;

drop policy if exists "discovery_feed_items_select_public_safe_authenticated"
  on public."discovery_feed_items";
create policy "discovery_feed_items_select_public_safe_authenticated"
  on public."discovery_feed_items"
  for select to authenticated
  using (
    "is_publicly_discoverable" is true
    and "visibility" = 'public'
    and "moderation_status" = 'clean'
    and "rights_status" in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')
    and not public."discovery_feed_item_blocked_for_current_user"("id")
    and coalesce(public."is_platform_owner_user"("owner_user_id"), false) is false
    and coalesce(public."is_platform_owner_user"("channel_user_id"), false) is false
    and coalesce(public."is_platform_owner_user"("host_user_id"), false) is false
    and coalesce(public."is_platform_owner_user"("follow_signal_user_id"), false) is false
    and coalesce(public."is_platform_owner_user"("circle_signal_user_id"), false) is false
    and (
      "live_state" <> 'scheduled'
      or ("starts_at" is not null and "starts_at" > now())
    )
    and (
      "live_state" <> 'live'
      or "ended_at" is null
      or "ended_at" > now()
    )
  );

drop policy if exists "discovery_feed_items_select_spectator_public_safe_anon"
  on public."discovery_feed_items";
create policy "discovery_feed_items_select_spectator_public_safe_anon"
  on public."discovery_feed_items"
  for select to anon
  using (
    "allow_spectator_view" is true
    and "is_publicly_discoverable" is true
    and "visibility" = 'public'
    and "moderation_status" = 'clean'
    and "rights_status" in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')
    and "access_type" = 'public_free'
    and "requires_premium_to_join" is false
    and "requires_ticket_to_watch" is false
    and "requires_subscription_to_watch" is false
    and coalesce(public."is_platform_owner_user"("owner_user_id"), false) is false
    and coalesce(public."is_platform_owner_user"("channel_user_id"), false) is false
    and coalesce(public."is_platform_owner_user"("host_user_id"), false) is false
    and coalesce(public."is_platform_owner_user"("follow_signal_user_id"), false) is false
    and coalesce(public."is_platform_owner_user"("circle_signal_user_id"), false) is false
    and (
      "live_state" <> 'scheduled'
      or ("starts_at" is not null and "starts_at" > now())
    )
    and (
      "live_state" <> 'live'
      or "ended_at" is null
      or "ended_at" > now()
    )
  );

-- Retire every unsafe derived relationship item, not only the two cards seen
-- on the attached phone. Source video rows and all financial/provider evidence
-- remain intact.
update public."creator_feed_items" feed
set "status" = 'hidden',
    "updated_at" = now(),
    "metadata" = coalesce(feed."metadata", '{}'::jsonb) || jsonb_build_object(
      'release_quarantine', 'pre_activation_discovery_lifecycle_fixture_closure_v1',
      'canonical_projection_active', false
    )
from public."videos" video
where feed."source_type" = 'creator_video'
  and feed."source_id" = video."id"::text
  and feed."status" = 'active'
  and (
    video."moderation_status" not in ('clean', 'reported')
    or not public."media_scan_public_safe"(video."scan_status")
    or video."quarantined_at" is not null
    or not public."is_creator_video_playable_source"(
      video."storage_path", video."storage_object_key", video."playback_url"
    )
  );

-- This link is explicitly proof-scoped in its own immutable attribution. Hide
-- the publication link; retain the video row, source attribution, and access /
-- provider history.
update public."official_rachi_original_videos" original_link
set "status" = 'hidden',
    "updated_at" = now()
where original_link."status" = 'published'
  and original_link."proof_scope" = 'rachi_originals_public_video_fixture_20260526';

-- Exact, positively identified Event fixture rows from the frozen inventory.
-- No Event row, reminder, paid offer, pass, grant, or provider evidence is deleted.
update public."creator_events" event_row
set "status" = case
      when event_row."status" in ('scheduled', 'live_now') then 'canceled'
      else event_row."status"
    end,
    "visibility" = 'private',
    "updated_at" = now()
where event_row."id" in (
  '7a82869a-60c1-4b78-b62a-3bc0bd35a382'::uuid,
  '71abfa0d-bb1e-4bb1-9a9a-2b49657c3fe6'::uuid,
  '9b2f4e7d-2e8e-4d2f-93ef-40b06d317014'::uuid,
  '9b2f4e7d-2e8e-4d2f-93ef-40b06d317019'::uuid,
  '6381e602-830f-4332-9150-27d2a511582e'::uuid,
  'caaef33a-4001-43e1-8cc4-4f2d2c2a59c0'::uuid,
  '6d7f3cc1-caac-416e-9104-b7ffb2b93f09'::uuid,
  'a9167135-d3cc-4349-bf8a-46dfd9068806'::uuid,
  'c5f64bce-b7c1-434d-bb0b-1a40828ed2fc'::uuid,
  '28150731-480d-4e11-b132-52727c84d3d5'::uuid
);

-- A time boundary can pass without a row write. Retire existing projections as
-- data and rely on policy/client lifecycle predicates for future clock passage.
update public."discovery_feed_items"
set "is_publicly_discoverable" = false,
    "is_spectator_enabled" = false,
    "is_spectator_playback_enabled" = false,
    "allow_spectator_view" = false,
    "allow_watch_party_from_spectator" = false,
    "allow_live_reaction_rooms" = false,
    "allow_public_share" = false,
    "allow_replay_watch_party" = false,
    "moderation_status" = 'hidden',
    "discovery_surface" = 'none',
    "updated_at" = now(),
    "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
      'release_quarantine', 'pre_activation_discovery_lifecycle_fixture_closure_v1',
      'canonical_projection_active', false
    )
where (
    "live_state" = 'scheduled'
    and ("starts_at" is null or "starts_at" <= now())
  ) or (
    "live_state" = 'live'
    and "ended_at" is not null
    and "ended_at" <= now()
  );

update public."circle_spectator_feed_items"
set "status" = 'hidden',
    "moderation_status" = 'hidden',
    "updated_at" = now(),
    "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
      'release_quarantine', 'pre_activation_discovery_lifecycle_fixture_closure_v1',
      'canonical_projection_active', false
    )
where (
    "live_state" = 'scheduled'
    and ("starts_at" is null or "starts_at" <= now())
  ) or (
    "live_state" = 'live'
    and "ended_at" is not null
    and "ended_at" <= now()
  );

comment on function public."can_read_creator_feed_item"(
  text, text, text, text, text, text, text
) is
  'Relationship feed authority requires active fanout plus current moderation, scan, quarantine, source, relationship, and caller identity authority. Creator ownership does not make an unsafe source release-discoverable.';

comment on function public."sync_creator_event_discovery"(uuid) is
  'Canonical Event discovery producer. Future scheduled and current live Events only; past schedule/end boundaries fail closed even when stale source status remains.';
