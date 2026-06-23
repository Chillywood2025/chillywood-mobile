-- Let Circle-private spectator sources create child rooms without weakening
-- public spectator validation. Public sources still validate against
-- discovery_feed_items; Circle sources validate against circle_spectator_feed_items
-- and the requesting host's Circle access.

alter table public."spectator_child_room_sources"
  drop constraint if exists "spectator_child_room_sources_source_item_id_fkey";

comment on column public."spectator_child_room_sources"."source_item_id" is
  'Spectator source item id. Public sources reference discovery_feed_items; Circle-private sources reference circle_spectator_feed_items and are validated by the child-room start function/trigger.';

create or replace function public.validate_watch_party_room_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_source_type text;
  normalized_source_id text;
begin
  normalized_source_type := nullif(trim(both from coalesce(new."source_type", '')), '');
  normalized_source_id := nullif(trim(both from coalesce(new."source_id", '')), '');

  if normalized_source_type is null and new."room_type" = 'title' and nullif(trim(both from coalesce(new."title_id", '')), '') is not null then
    normalized_source_type := 'platform_title';
    normalized_source_id := coalesce(normalized_source_id, nullif(trim(both from new."title_id"), ''));
  end if;

  if normalized_source_type = 'creator_video' then
    if normalized_source_id is null or normalized_source_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'creator_video_watch_party_source_required';
    end if;

    if not exists (
      select 1
      from public."videos" video
      where video."id" = normalized_source_id::uuid
        and video."visibility" = 'public'
        and video."moderation_status" in ('clean', 'reported')
        and nullif(coalesce(video."storage_path", video."playback_url", ''), '') is not null
    ) then
      raise exception 'creator_video_watch_party_source_unavailable';
    end if;

    new."room_type" := 'title';
    new."title_id" := null;
    new."source_type" := 'creator_video';
    new."source_id" := normalized_source_id;
  elsif normalized_source_type = 'spectator_playback' then
    if normalized_source_id is null or normalized_source_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'spectator_watch_party_source_required';
    end if;

    if not (
      exists (
        select 1
        from public."discovery_feed_items" item
        where item."id" = normalized_source_id::uuid
          and item."allow_spectator_view" = true
          and (
            (new."room_type" = 'title' and item."allow_watch_party_from_spectator" = true)
            or (new."room_type" = 'live' and item."allow_live_reaction_rooms" = true)
          )
          and item."is_publicly_discoverable" = true
          and item."visibility" = 'public'
          and item."moderation_status" = 'clean'
          and item."rights_status" in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')
          and item."access_type" = 'public_free'
          and item."is_spectator_enabled" = true
          and item."is_spectator_playback_enabled" = true
          and item."requires_premium_to_join" = false
          and item."requires_ticket_to_watch" = false
          and item."requires_subscription_to_watch" = false
          and item."live_state" <> 'ended'
          and exists (
            select 1
            from public."spectator_hls_playback_records" playback
            where playback."visibility" = 'public'
              and playback."playback_status" = 'live'
              and playback."playlist_path" is not null
              and playback."is_publicly_watchable" = true
              and playback."is_spectator_playback_enabled" = true
              and playback."rights_status" in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')
              and playback."access_type" = 'public_free'
              and playback."requires_premium" = false
              and playback."requires_ticket" = false
              and playback."source_room_id" in (
                coalesce(item."room_id", ''),
                coalesce(item."source_id", ''),
                coalesce(item."event_id", ''),
                item."id"::text
              )
          )
      )
      or exists (
        select 1
        from public."circle_spectator_feed_items" item
        join public."spectator_hls_playback_records" playback
          on playback."id" = item."playback_record_id"
        where item."id" = normalized_source_id::uuid
          and public."can_read_circle_spectator_feed_item"(item."id", new."host_user_id"::text)
          and item."status" = 'active'
          and item."visibility" = 'circle'
          and item."access_type" = 'circle'
          and item."allow_spectator_view" = true
          and (
            (new."room_type" = 'title' and item."allow_watch_party_from_spectator" = true)
            or (new."room_type" = 'live' and item."allow_live_reaction_rooms" = true)
          )
          and item."moderation_status" = 'clean'
          and item."rights_status" in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')
          and item."is_spectator_enabled" = true
          and item."is_spectator_playback_enabled" = true
          and item."requires_premium_to_join" = false
          and item."requires_ticket_to_watch" = false
          and item."requires_subscription_to_watch" = false
          and item."live_state" <> 'ended'
          and playback."visibility" = 'circle'
          and playback."playback_status" = 'live'
          and playback."playlist_path" is not null
          and playback."is_publicly_watchable" = false
          and playback."is_spectator_playback_enabled" = true
          and playback."rights_status" in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')
          and playback."access_type" = 'circle'
          and playback."requires_premium" = false
          and playback."requires_ticket" = false
      )
    ) then
      raise exception 'spectator_watch_party_source_unavailable';
    end if;

    new."title_id" := null;
    new."source_type" := 'spectator_playback';
    new."source_id" := normalized_source_id;
  elsif normalized_source_type = 'platform_title' then
    if normalized_source_id is null and nullif(trim(both from coalesce(new."title_id", '')), '') is not null then
      normalized_source_id := nullif(trim(both from new."title_id"), '');
    end if;

    if normalized_source_id is not null and nullif(trim(both from coalesce(new."title_id", '')), '') is null then
      new."title_id" := normalized_source_id;
    end if;

    new."source_type" := 'platform_title';
    new."source_id" := normalized_source_id;
  elsif new."room_type" = 'title' then
    raise exception 'watch_party_room_source_required';
  else
    new."source_type" := null;
    new."source_id" := null;
  end if;

  return new;
end;
$$;
