alter table public."room_broadcast_sessions"
  drop constraint if exists "room_broadcast_sessions_public_watch_disabled_check",
  drop constraint if exists "room_broadcast_sessions_spectator_playback_disabled_check";

alter table public."room_broadcast_sessions"
  add constraint "room_broadcast_sessions_public_watch_d7f_guard"
    check (
      "is_publicly_watchable" = false
      or (
        ("metadata" ->> 'd7f_public_safe_approved') = 'true'
        and coalesce("source_room_id", "watch_party_room_id", "creator_event_id", '') <> ''
        and lower(coalesce("source_room_id", "watch_party_room_id", "creator_event_id", '')) not like 'd7d_test_%'
        and lower(coalesce("source_room_id", "watch_party_room_id", "creator_event_id", '')) not like 'd7e_%'
        and "rights_status" in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')
        and "access_type" = 'public_free'
        and "requires_premium" = false
        and "requires_ticket" = false
      )
    ),
  add constraint "room_broadcast_sessions_spectator_playback_d7f_guard"
    check (
      "is_spectator_playback_enabled" = false
      or (
        "is_publicly_watchable" = true
        and ("metadata" ->> 'd7f_public_safe_approved') = 'true'
        and coalesce("source_room_id", "watch_party_room_id", "creator_event_id", '') <> ''
        and lower(coalesce("source_room_id", "watch_party_room_id", "creator_event_id", '')) not like 'd7d_test_%'
        and lower(coalesce("source_room_id", "watch_party_room_id", "creator_event_id", '')) not like 'd7e_%'
        and "rights_status" in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')
        and "access_type" = 'public_free'
        and "requires_premium" = false
        and "requires_ticket" = false
      )
    );

alter table public."discovery_feed_items"
  drop constraint if exists "discovery_feed_items_spectator_playback_disabled_check";

alter table public."discovery_feed_items"
  add constraint "discovery_feed_items_spectator_playback_public_safe_check"
    check (
      "is_spectator_playback_enabled" = false
      or (
        "is_spectator_enabled" = true
        and "is_publicly_discoverable" = true
        and "visibility" = 'public'
        and "moderation_status" = 'clean'
        and "rights_status" in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')
        and "access_type" = 'public_free'
        and "requires_premium_to_join" = false
        and "requires_ticket_to_watch" = false
        and "requires_subscription_to_watch" = false
      )
    );

comment on column public."room_broadcast_sessions"."is_publicly_watchable" is
  'D7F guardrail: may become true only for server/admin-approved public-safe HLS sessions; private, proof, protected, ticketed, and Premium-full-room sessions remain blocked.';
comment on column public."room_broadcast_sessions"."is_spectator_playback_enabled" is
  'D7F guardrail: may become true only with public-safe watchability, rights-safe public-free access, no ticket, and no Premium full-room requirement.';
comment on column public."discovery_feed_items"."is_spectator_playback_enabled" is
  'D7F read-model flag: may become true only for public, clean, rights-safe, public-free, non-ticketed, non-Premium discovery rows after the controlled spectator playback gate is approved.';
