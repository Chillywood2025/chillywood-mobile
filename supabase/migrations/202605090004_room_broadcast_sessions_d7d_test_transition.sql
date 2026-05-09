alter table public."room_broadcast_sessions"
  drop constraint if exists "room_broadcast_sessions_broadcast_status_check",
  drop constraint if exists "room_broadcast_sessions_egress_provider_check",
  drop constraint if exists "room_broadcast_sessions_egress_status_check",
  drop constraint if exists "room_broadcast_sessions_playback_url_status_check",
  drop constraint if exists "room_broadcast_sessions_cost_guard_status_check",
  drop constraint if exists "room_broadcast_sessions_no_hls_url_foundation_check",
  drop constraint if exists "room_broadcast_sessions_no_egress_id_foundation_check";

alter table public."room_broadcast_sessions"
  add constraint "room_broadcast_sessions_broadcast_status_check"
    check ("broadcast_status" in (
      'foundation',
      'planned',
      'not_configured',
      'ready_later',
      'starting_later',
      'active_later',
      'stopping_later',
      'ended',
      'failed_later',
      'cancelled',
      'test_ready',
      'test_starting',
      'test_active',
      'test_stopping',
      'test_stopped',
      'test_failed',
      'test_proof_complete'
    )),
  add constraint "room_broadcast_sessions_egress_provider_check"
    check ("egress_provider" in (
      'not_connected',
      'livekit_egress_later',
      'livekit_egress_test',
      'cloudflare_stream_later',
      'manual_foundation'
    )),
  add constraint "room_broadcast_sessions_egress_status_check"
    check ("egress_status" in (
      'not_connected',
      'not_started',
      'starting_later',
      'active_later',
      'stopped_later',
      'failed_later',
      'test_starting',
      'test_active',
      'test_stopping',
      'test_stopped',
      'test_failed'
    )),
  add constraint "room_broadcast_sessions_playback_url_status_check"
    check ("playback_url_status" in (
      'not_available',
      'foundation_only',
      'available_later',
      'blocked_by_rights',
      'blocked_by_access',
      'blocked_by_cost',
      'test_private_playlist',
      'test_private_available'
    )),
  add constraint "room_broadcast_sessions_cost_guard_status_check"
    check ("cost_guard_status" in (
      'not_configured',
      'foundation',
      'cap_required',
      'within_cap_later',
      'over_cap_later',
      'test_cap_enforced',
      'test_cleanup_required'
    )),
  add constraint "room_broadcast_sessions_d7d_egress_id_guard"
    check (
      "egress_id" is null
      or (
        ("metadata" ->> 'd7d_test_proof') = 'true'
        and "source_room_id" like 'D7D_TEST_%'
        and "is_publicly_watchable" = false
        and "is_spectator_playback_enabled" = false
      )
    ),
  add constraint "room_broadcast_sessions_d7d_hls_url_guard"
    check (
      "hls_playback_url" is null
      or (
        ("metadata" ->> 'd7d_test_proof') = 'true'
        and "source_room_id" like 'D7D_TEST_%'
        and "is_publicly_watchable" = false
        and "is_spectator_playback_enabled" = false
      )
    );

comment on column public."room_broadcast_sessions"."hls_playback_url" is
  'D7D guardrail: may store only private test HLS playlist location for D7D proof rows; not public spectator playback.';
comment on column public."room_broadcast_sessions"."egress_id" is
  'D7D guardrail: may store only real test Egress ids for private D7D proof rows; fake ids and public playback are not allowed.';
