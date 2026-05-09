create table if not exists public."room_broadcast_sessions" (
  "id" uuid default gen_random_uuid() not null,
  "source_type" text default 'watch_party_room'::text not null,
  "source_room_id" text,
  "watch_party_room_id" text,
  "creator_event_id" text,
  "host_user_id" text,
  "channel_user_id" text,
  "broadcast_status" text default 'foundation'::text not null,
  "egress_provider" text default 'not_connected'::text not null,
  "egress_id" text,
  "egress_status" text default 'not_connected'::text not null,
  "hls_playback_url" text,
  "playback_url_status" text default 'not_available'::text not null,
  "thumbnail_url" text,
  "rights_status" text default 'unknown_block_public_spectator'::text not null,
  "access_type" text default 'private'::text not null,
  "ad_policy" text default 'ads_not_allowed'::text not null,
  "is_publicly_watchable" boolean default false not null,
  "is_spectator_playback_enabled" boolean default false not null,
  "requires_premium" boolean default true not null,
  "requires_ticket" boolean default false not null,
  "max_broadcast_minutes" integer,
  "max_concurrent_spectators" integer,
  "cost_guard_status" text default 'not_configured'::text not null,
  "started_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "last_health_checked_at" timestamp with time zone,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "room_broadcast_sessions_pkey" primary key ("id"),
  constraint "room_broadcast_sessions_source_type_check"
    check ("source_type" in (
      'watch_party_room',
      'live_stage_room',
      'creator_event',
      'manual_foundation'
    )),
  constraint "room_broadcast_sessions_broadcast_status_check"
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
      'cancelled'
    )),
  constraint "room_broadcast_sessions_egress_provider_check"
    check ("egress_provider" in (
      'not_connected',
      'livekit_egress_later',
      'cloudflare_stream_later',
      'manual_foundation'
    )),
  constraint "room_broadcast_sessions_egress_status_check"
    check ("egress_status" in (
      'not_connected',
      'not_started',
      'starting_later',
      'active_later',
      'stopped_later',
      'failed_later'
    )),
  constraint "room_broadcast_sessions_playback_url_status_check"
    check ("playback_url_status" in (
      'not_available',
      'foundation_only',
      'available_later',
      'blocked_by_rights',
      'blocked_by_access',
      'blocked_by_cost'
    )),
  constraint "room_broadcast_sessions_rights_status_check"
    check ("rights_status" in (
      'creator_owned',
      'chillywood_original',
      'licensed_for_public_stream',
      'private_use_only',
      'protected_title_block_public_spectator',
      'unknown_block_public_spectator'
    )),
  constraint "room_broadcast_sessions_access_type_check"
    check ("access_type" in (
      'public_free',
      'premium_only',
      'ticketed',
      'subscriber_only_later',
      'invite_only',
      'private'
    )),
  constraint "room_broadcast_sessions_ad_policy_check"
    check ("ad_policy" in (
      'free_with_ads',
      'premium_ad_free',
      'no_ads',
      'sponsor_breaks_only_later',
      'ctv_ads_allowed_later',
      'ads_not_allowed'
    )),
  constraint "room_broadcast_sessions_cost_guard_status_check"
    check ("cost_guard_status" in (
      'not_configured',
      'foundation',
      'cap_required',
      'within_cap_later',
      'over_cap_later'
    )),
  constraint "room_broadcast_sessions_max_minutes_check"
    check ("max_broadcast_minutes" is null or "max_broadcast_minutes" > 0),
  constraint "room_broadcast_sessions_max_spectators_check"
    check ("max_concurrent_spectators" is null or "max_concurrent_spectators" >= 0),
  constraint "room_broadcast_sessions_time_order_check"
    check ("ended_at" is null or "started_at" is null or "ended_at" >= "started_at"),
  constraint "room_broadcast_sessions_public_watch_disabled_check"
    check ("is_publicly_watchable" = false),
  constraint "room_broadcast_sessions_spectator_playback_disabled_check"
    check ("is_spectator_playback_enabled" = false),
  constraint "room_broadcast_sessions_no_hls_url_foundation_check"
    check ("hls_playback_url" is null),
  constraint "room_broadcast_sessions_no_egress_id_foundation_check"
    check ("egress_id" is null)
);

create index if not exists "room_broadcast_sessions_source_type_idx"
  on public."room_broadcast_sessions" using btree ("source_type");

create index if not exists "room_broadcast_sessions_source_room_idx"
  on public."room_broadcast_sessions" using btree ("source_room_id");

create index if not exists "room_broadcast_sessions_watch_party_room_idx"
  on public."room_broadcast_sessions" using btree ("watch_party_room_id");

create index if not exists "room_broadcast_sessions_creator_event_idx"
  on public."room_broadcast_sessions" using btree ("creator_event_id");

create index if not exists "room_broadcast_sessions_host_user_idx"
  on public."room_broadcast_sessions" using btree ("host_user_id");

create index if not exists "room_broadcast_sessions_channel_user_idx"
  on public."room_broadcast_sessions" using btree ("channel_user_id");

create index if not exists "room_broadcast_sessions_broadcast_status_idx"
  on public."room_broadcast_sessions" using btree ("broadcast_status");

create index if not exists "room_broadcast_sessions_egress_status_idx"
  on public."room_broadcast_sessions" using btree ("egress_status");

create index if not exists "room_broadcast_sessions_rights_status_idx"
  on public."room_broadcast_sessions" using btree ("rights_status");

create index if not exists "room_broadcast_sessions_access_type_idx"
  on public."room_broadcast_sessions" using btree ("access_type");

create index if not exists "room_broadcast_sessions_publicly_watchable_idx"
  on public."room_broadcast_sessions" using btree ("is_publicly_watchable");

create index if not exists "room_broadcast_sessions_spectator_playback_idx"
  on public."room_broadcast_sessions" using btree ("is_spectator_playback_enabled");

create index if not exists "room_broadcast_sessions_created_at_idx"
  on public."room_broadcast_sessions" using btree ("created_at" desc);

alter table public."room_broadcast_sessions" enable row level security;

drop policy if exists "room_broadcast_sessions_select_owner_operator"
  on public."room_broadcast_sessions";
create policy "room_broadcast_sessions_select_owner_operator"
  on public."room_broadcast_sessions"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "room_broadcast_sessions_insert_owner_operator"
  on public."room_broadcast_sessions";
create policy "room_broadcast_sessions_insert_owner_operator"
  on public."room_broadcast_sessions"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "room_broadcast_sessions_update_owner_operator"
  on public."room_broadcast_sessions";
create policy "room_broadcast_sessions_update_owner_operator"
  on public."room_broadcast_sessions"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."room_broadcast_sessions" from "anon";
grant select, insert, update on table public."room_broadcast_sessions" to "authenticated";

comment on table public."room_broadcast_sessions" is
  'D7B spectator broadcast schema foundation only. No Egress, HLS, spectator playback, public watchability, or full-room spectator tokens are connected.';
comment on column public."room_broadcast_sessions"."is_publicly_watchable" is
  'D7B guardrail: defaults false and is constrained false until a later explicit broadcast playback proof lane.';
comment on column public."room_broadcast_sessions"."is_spectator_playback_enabled" is
  'D7B guardrail: defaults false and is constrained false; /spectate remains metadata-only.';
comment on column public."room_broadcast_sessions"."hls_playback_url" is
  'D7B guardrail: constrained null; no fake or live HLS playback URL is stored in this foundation pass.';
comment on column public."room_broadcast_sessions"."egress_id" is
  'D7B guardrail: constrained null; no fake or live Egress id is stored in this foundation pass.';
