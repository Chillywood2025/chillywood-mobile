-- Prevent positively identified proof sources from being republished by the
-- canonical spectator discovery backfill/trigger. The preceding migration is
-- already deployed and remains immutable; this is its forward-only successor.

alter function public."sync_spectator_broadcast_discovery"(uuid)
  rename to "sync_spectator_broadcast_discovery_pre_fixture_quarantine";

revoke all on function public."sync_spectator_broadcast_discovery_pre_fixture_quarantine"(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public."sync_spectator_broadcast_discovery_pre_fixture_quarantine"(uuid)
  to postgres, service_role;

create or replace function public."sync_spectator_broadcast_discovery"(
  p_broadcast_session_id uuid
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_broadcast public."room_broadcast_sessions"%rowtype;
  v_playback public."spectator_hls_playback_records"%rowtype;
  v_source_id text;
  v_is_fixture boolean := false;
  v_now timestamptz := timezone('utc'::text, now());
begin
  select * into v_broadcast
  from public."room_broadcast_sessions"
  where "id" = p_broadcast_session_id;

  select * into v_playback
  from public."spectator_hls_playback_records"
  where "broadcast_session_id" = p_broadcast_session_id
  order by "created_at" desc, "id" desc
  limit 1;

  v_is_fixture :=
    coalesce(v_broadcast."metadata" ->> 'proof_fixture', '') = 'true'
    or coalesce(v_broadcast."metadata" ->> 'spectator_child_room_fixture', '') = 'true'
    or coalesce(v_playback."metadata" ->> 'proof_fixture', '') = 'true'
    or coalesce(v_playback."metadata" ->> 'spectator_child_room_fixture', '') = 'true';

  if not v_is_fixture then
    perform public."sync_spectator_broadcast_discovery_pre_fixture_quarantine"(
      p_broadcast_session_id
    );
    return;
  end if;

  v_source_id := coalesce(
    nullif(btrim(v_broadcast."source_room_id"), ''),
    nullif(btrim(v_broadcast."watch_party_room_id"), ''),
    nullif(btrim(v_broadcast."creator_event_id"), ''),
    nullif(btrim(v_playback."source_room_id"), ''),
    nullif(btrim(v_playback."watch_party_room_id"), ''),
    nullif(btrim(v_playback."creator_event_id"), '')
  );

  update public."discovery_feed_items"
  set "is_publicly_discoverable" = false,
      "visibility" = 'private',
      "access_type" = 'private',
      "moderation_status" = 'hidden',
      "discovery_surface" = 'none',
      "is_spectator_enabled" = false,
      "is_spectator_playback_enabled" = false,
      "allow_spectator_view" = false,
      "allow_public_share" = false,
      "allow_watch_party_from_spectator" = false,
      "allow_live_reaction_rooms" = false,
      "allow_replay_watch_party" = false,
      "updated_at" = v_now,
      "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
        'canonical_projection_active', false,
        'release_quarantine', 'pre_activation_fixture_producer_quarantine_v1',
        'release_quarantined_at', v_now,
        'release_quarantine_reason', 'positively_identified_qa_fixture_source'
      )
  where "source_type" = 'watch_party_room'
    and (
      "source_id" = v_source_id
      or coalesce("metadata" ->> 'broadcast_session_id', '') = p_broadcast_session_id::text
    );

  update public."circle_spectator_feed_items"
  set "status" = 'hidden',
      "moderation_status" = 'hidden',
      "is_spectator_enabled" = false,
      "is_spectator_playback_enabled" = false,
      "allow_spectator_view" = false,
      "allow_watch_party_from_spectator" = false,
      "updated_at" = v_now,
      "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
        'canonical_projection_active', false,
        'release_quarantine', 'pre_activation_fixture_producer_quarantine_v1',
        'release_quarantined_at', v_now,
        'release_quarantine_reason', 'positively_identified_qa_fixture_source'
      )
  where "source_type" = 'watch_party_room'
    and (
      "source_id" = v_source_id
      or coalesce("metadata" ->> 'broadcast_session_id', '') = p_broadcast_session_id::text
    );
end;
$$;

revoke all on function public."sync_spectator_broadcast_discovery"(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public."sync_spectator_broadcast_discovery"(uuid)
  to postgres, service_role;

-- These are the two previously inventoried June proof sources. Preserve their
-- rows and provider-independent evidence, add a reversible quarantine marker,
-- and let the authoritative trigger retire any derived discovery projection.
update public."room_broadcast_sessions"
set "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
      'release_quarantine', 'pre_activation_fixture_producer_quarantine_v1',
      'release_quarantined_at', timezone('utc'::text, now()),
      'release_quarantine_reason', 'positively_identified_qa_fixture_source'
    ),
    "updated_at" = timezone('utc'::text, now())
where "id" in (
    '2c4f28cc-1c9c-4401-bdc4-dafddd71c130'::uuid,
    '9710539c-e940-408a-9b94-c41b222e61e1'::uuid
  )
  and coalesce("metadata" ->> 'proof_fixture', '') = 'true';

update public."spectator_hls_playback_records"
set "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
      'release_quarantine', 'pre_activation_fixture_producer_quarantine_v1',
      'release_quarantined_at', timezone('utc'::text, now()),
      'release_quarantine_reason', 'positively_identified_qa_fixture_source'
    ),
    "updated_at" = timezone('utc'::text, now())
where "id" in (
    '2f34f24f-0c3c-4856-b9c9-88bc60c4cb9a'::uuid,
    '39c4303a-b81c-4eaa-9160-9c9bf9f8d187'::uuid
  )
  and coalesce("metadata" ->> 'proof_fixture', '') = 'true';

do $$
declare
  fixture_row record;
begin
  for fixture_row in
    select "id"
    from public."room_broadcast_sessions"
    where "id" in (
      '2c4f28cc-1c9c-4401-bdc4-dafddd71c130'::uuid,
      '9710539c-e940-408a-9b94-c41b222e61e1'::uuid
    )
      and coalesce("metadata" ->> 'proof_fixture', '') = 'true'
  loop
    perform public."sync_spectator_broadcast_discovery"(fixture_row."id");
  end loop;
end;
$$;

comment on function public."sync_spectator_broadcast_discovery"(uuid) is
  'Fixture-aware server-owned spectator discovery producer. Positively identified proof sources are quarantined before any public or Circle projection can be active.';
