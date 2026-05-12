alter table public."room_broadcast_sessions"
  drop constraint if exists "room_broadcast_sessions_playback_url_status_check",
  drop constraint if exists "room_broadcast_sessions_d7d_egress_id_guard",
  drop constraint if exists "room_broadcast_sessions_d7d_hls_url_guard";

alter table public."room_broadcast_sessions"
  add constraint "room_broadcast_sessions_playback_url_status_check"
    check ("playback_url_status" in (
      'not_available',
      'foundation_only',
      'available_later',
      'blocked_by_rights',
      'blocked_by_access',
      'blocked_by_cost',
      'test_private_playlist',
      'test_private_available',
      'public_safe_pending',
      'public_safe_available',
      'public_safe_disabled',
      'public_safe_failed'
    )),
  add constraint "room_broadcast_sessions_egress_id_d7d_d7f_guard"
    check (
      "egress_id" is null
      or (
        ("metadata" ->> 'd7d_test_proof') = 'true'
        and "source_room_id" like 'D7D_TEST_%'
        and "is_publicly_watchable" = false
        and "is_spectator_playback_enabled" = false
      )
      or (
        ("metadata" ->> 'd7f_public_safe_approved') = 'true'
        and coalesce("source_room_id", "watch_party_room_id", "creator_event_id", '') <> ''
        and lower(coalesce("source_room_id", "watch_party_room_id", "creator_event_id", '')) not like 'd7d_test_%'
        and lower(coalesce("source_room_id", "watch_party_room_id", "creator_event_id", '')) not like 'd7e_%'
        and "is_publicly_watchable" = true
        and "is_spectator_playback_enabled" = true
        and "rights_status" in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')
        and "access_type" = 'public_free'
        and "requires_premium" = false
        and "requires_ticket" = false
      )
    ),
  add constraint "room_broadcast_sessions_hls_url_d7d_d7f_guard"
    check (
      "hls_playback_url" is null
      or (
        ("metadata" ->> 'd7d_test_proof') = 'true'
        and "source_room_id" like 'D7D_TEST_%'
        and "is_publicly_watchable" = false
        and "is_spectator_playback_enabled" = false
      )
      or (
        ("metadata" ->> 'd7f_public_safe_approved') = 'true'
        and coalesce("source_room_id", "watch_party_room_id", "creator_event_id", '') <> ''
        and lower(coalesce("source_room_id", "watch_party_room_id", "creator_event_id", '')) not like 'd7d_test_%'
        and lower(coalesce("source_room_id", "watch_party_room_id", "creator_event_id", '')) not like 'd7e_%'
        and "hls_playback_url" ~ '^https://[^[:space:]]+\.m3u8($|[?#])'
        and "playback_url_status" = 'public_safe_available'
        and "is_publicly_watchable" = true
        and "is_spectator_playback_enabled" = true
        and "rights_status" in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')
        and "access_type" = 'public_free'
        and "requires_premium" = false
        and "requires_ticket" = false
      )
    );

create table if not exists public."spectator_hls_playback_records" (
  "id" uuid default gen_random_uuid() not null,
  "broadcast_session_id" uuid not null,
  "source_room_id" text not null,
  "watch_party_room_id" text,
  "creator_event_id" text,
  "host_user_id" text,
  "channel_user_id" text,
  "visibility" text default 'private'::text not null,
  "playback_status" text default 'pending'::text not null,
  "playlist_path" text,
  "rights_status" text default 'unknown_block_public_spectator'::text not null,
  "access_type" text default 'private'::text not null,
  "is_publicly_watchable" boolean default false not null,
  "is_spectator_playback_enabled" boolean default false not null,
  "requires_premium" boolean default true not null,
  "requires_ticket" boolean default false not null,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "spectator_hls_playback_records_pkey" primary key ("id"),
  constraint "spectator_hls_playback_records_broadcast_session_id_key" unique ("broadcast_session_id"),
  constraint "spectator_hls_playback_records_broadcast_session_id_fkey"
    foreign key ("broadcast_session_id") references public."room_broadcast_sessions"("id") on delete cascade,
  constraint "spectator_hls_playback_records_visibility_check"
    check ("visibility" in ('public', 'private', 'proof', 'disabled')),
  constraint "spectator_hls_playback_records_playback_status_check"
    check ("playback_status" in ('pending', 'live', 'ended', 'failed', 'disabled')),
  constraint "spectator_hls_playback_records_rights_status_check"
    check ("rights_status" in (
      'creator_owned',
      'chillywood_original',
      'licensed_for_public_stream',
      'private_use_only',
      'protected_title_block_public_spectator',
      'unknown_block_public_spectator'
    )),
  constraint "spectator_hls_playback_records_access_type_check"
    check ("access_type" in (
      'public_free',
      'premium_only',
      'ticketed',
      'subscriber_only_later',
      'invite_only',
      'private'
    )),
  constraint "spectator_hls_playback_records_no_raw_url_check"
    check ("playlist_path" is null or "playlist_path" !~* '^https?://'),
  constraint "spectator_hls_playback_records_public_safe_check"
    check (
      "visibility" <> 'public'
      or (
        "is_publicly_watchable" = true
        and "is_spectator_playback_enabled" = true
        and "rights_status" in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')
        and "access_type" = 'public_free'
        and "requires_premium" = false
        and "requires_ticket" = false
        and lower("source_room_id") not like 'd7d_test_%'
        and lower("source_room_id") not like 'd7e_%'
      )
    )
);

create index if not exists "spectator_hls_playback_records_source_room_idx"
  on public."spectator_hls_playback_records" using btree ("source_room_id");

create index if not exists "spectator_hls_playback_records_status_idx"
  on public."spectator_hls_playback_records" using btree ("playback_status");

create index if not exists "spectator_hls_playback_records_public_safe_idx"
  on public."spectator_hls_playback_records" using btree (
    "visibility",
    "is_publicly_watchable",
    "is_spectator_playback_enabled",
    "playback_status"
  );

alter table public."spectator_hls_playback_records" enable row level security;

drop policy if exists "spectator_hls_playback_records_public_live_select"
  on public."spectator_hls_playback_records";
create policy "spectator_hls_playback_records_public_live_select"
  on public."spectator_hls_playback_records"
  for select
  to "anon", "authenticated"
  using (
    "visibility" = 'public'
    and "playback_status" = 'live'
    and "playlist_path" is not null
    and "is_publicly_watchable" = true
    and "is_spectator_playback_enabled" = true
    and "rights_status" in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')
    and "access_type" = 'public_free'
    and "requires_premium" = false
    and "requires_ticket" = false
  );

drop policy if exists "spectator_hls_playback_records_owner_operator_select"
  on public."spectator_hls_playback_records";
create policy "spectator_hls_playback_records_owner_operator_select"
  on public."spectator_hls_playback_records"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "spectator_hls_playback_records_owner_operator_insert"
  on public."spectator_hls_playback_records";
create policy "spectator_hls_playback_records_owner_operator_insert"
  on public."spectator_hls_playback_records"
  for insert
  to "authenticated"
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "spectator_hls_playback_records_owner_operator_update"
  on public."spectator_hls_playback_records";
create policy "spectator_hls_playback_records_owner_operator_update"
  on public."spectator_hls_playback_records"
  for update
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]))
  with check (public.has_platform_role(array['owner'::text, 'operator'::text]));

drop policy if exists "spectator_hls_playback_records_owner_operator_delete"
  on public."spectator_hls_playback_records";
create policy "spectator_hls_playback_records_owner_operator_delete"
  on public."spectator_hls_playback_records"
  for delete
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."spectator_hls_playback_records" from "anon";
revoke all on table public."spectator_hls_playback_records" from "authenticated";
grant select on table public."spectator_hls_playback_records" to "anon", "authenticated";
grant insert, update, delete on table public."spectator_hls_playback_records" to "authenticated";

comment on table public."spectator_hls_playback_records" is
  'D7F public-safe spectator HLS read model. Server/admin writes only; public reads expose only eligible live watch-only records and never raw provider secrets.';
comment on column public."room_broadcast_sessions"."hls_playback_url" is
  'D7F guardrail: may store a server/admin-approved public-safe HLS playlist URL only when D7F metadata, rights, access, and public playback constraints pass; clients must use controlled resolver endpoints instead of reading this raw URL.';
comment on column public."spectator_hls_playback_records"."playlist_path" is
  'Public-safe object path or playlist identifier only. Raw http(s) HLS URLs are forbidden here; the server resolver maps approved records to controlled playback endpoints.';
