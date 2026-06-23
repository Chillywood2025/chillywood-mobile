-- Back Circle-private spectator rows without weakening public discovery.
-- Public spectator remains sourced from discovery_feed_items only.

alter table public."room_broadcast_sessions"
  drop constraint if exists "room_broadcast_sessions_playback_url_status_check",
  drop constraint if exists "room_broadcast_sessions_access_type_check",
  drop constraint if exists "room_broadcast_sessions_egress_id_d7d_d7f_guard",
  drop constraint if exists "room_broadcast_sessions_hls_url_d7d_d7f_guard",
  drop constraint if exists "room_broadcast_sessions_public_watch_d7f_guard",
  drop constraint if exists "room_broadcast_sessions_spectator_playback_d7f_guard";

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
      'public_safe_failed',
      'circle_safe_pending',
      'circle_safe_available',
      'circle_safe_disabled',
      'circle_safe_failed'
    )),
  add constraint "room_broadcast_sessions_access_type_check"
    check ("access_type" in (
      'public_free',
      'circle',
      'premium_only',
      'ticketed',
      'subscriber_only_later',
      'invite_only',
      'private'
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
      or (
        ("metadata" ->> 'circle_spectator_approved') = 'true'
        and coalesce("source_room_id", "watch_party_room_id", "creator_event_id", '') <> ''
        and lower(coalesce("source_room_id", "watch_party_room_id", "creator_event_id", '')) not like 'd7d_test_%'
        and lower(coalesce("source_room_id", "watch_party_room_id", "creator_event_id", '')) not like 'd7e_%'
        and "is_publicly_watchable" = false
        and "is_spectator_playback_enabled" = true
        and "rights_status" in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')
        and "access_type" = 'circle'
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
      or (
        ("metadata" ->> 'circle_spectator_approved') = 'true'
        and coalesce("source_room_id", "watch_party_room_id", "creator_event_id", '') <> ''
        and lower(coalesce("source_room_id", "watch_party_room_id", "creator_event_id", '')) not like 'd7d_test_%'
        and lower(coalesce("source_room_id", "watch_party_room_id", "creator_event_id", '')) not like 'd7e_%'
        and "hls_playback_url" ~ '^https://[^[:space:]]+\.m3u8($|[?#])'
        and "playback_url_status" = 'circle_safe_available'
        and "is_publicly_watchable" = false
        and "is_spectator_playback_enabled" = true
        and "rights_status" in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')
        and "access_type" = 'circle'
        and "requires_premium" = false
        and "requires_ticket" = false
      )
    ),
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
      or (
        "is_publicly_watchable" = false
        and ("metadata" ->> 'circle_spectator_approved') = 'true'
        and coalesce("source_room_id", "watch_party_room_id", "creator_event_id", '') <> ''
        and lower(coalesce("source_room_id", "watch_party_room_id", "creator_event_id", '')) not like 'd7d_test_%'
        and lower(coalesce("source_room_id", "watch_party_room_id", "creator_event_id", '')) not like 'd7e_%'
        and "rights_status" in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')
        and "access_type" = 'circle'
        and "requires_premium" = false
        and "requires_ticket" = false
      )
    );

alter table public."spectator_hls_playback_records"
  drop constraint if exists "spectator_hls_playback_records_visibility_check",
  drop constraint if exists "spectator_hls_playback_records_access_type_check";

alter table public."spectator_hls_playback_records"
  add constraint "spectator_hls_playback_records_visibility_check"
    check ("visibility" in ('public', 'circle', 'private', 'proof', 'disabled')),
  add constraint "spectator_hls_playback_records_access_type_check"
    check ("access_type" in (
      'public_free',
      'circle',
      'premium_only',
      'ticketed',
      'subscriber_only_later',
      'invite_only',
      'private'
    ));

create table if not exists public."circle_spectator_feed_items" (
  "id" uuid default gen_random_uuid() not null,
  "source_type" text not null,
  "source_id" text,
  "source_room_id" text,
  "room_id" text,
  "event_id" text,
  "playback_record_id" uuid,
  "broadcast_session_id" uuid,
  "creator_user_id" text not null,
  "channel_user_id" text,
  "host_user_id" text,
  "item_type" text not null,
  "title" text,
  "subtitle" text,
  "thumbnail_url" text,
  "visibility" text default 'circle'::text not null,
  "access_type" text default 'circle'::text not null,
  "rights_status" text default 'creator_owned'::text not null,
  "moderation_status" text default 'clean'::text not null,
  "status" text default 'active'::text not null,
  "live_state" text default 'not_live'::text not null,
  "starts_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "published_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "is_spectator_enabled" boolean default true not null,
  "is_spectator_playback_enabled" boolean default false not null,
  "allow_spectator_view" boolean default true not null,
  "allow_watch_party_from_spectator" boolean default false not null,
  "allow_live_reaction_rooms" boolean default false not null,
  "allow_replay_watch_party" boolean default false not null,
  "requires_premium_to_join" boolean default false not null,
  "requires_ticket_to_watch" boolean default false not null,
  "requires_subscription_to_watch" boolean default false not null,
  "category_key" text,
  "ranking_score" numeric default 0 not null,
  "ranking_reason" text,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "updated_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "circle_spectator_feed_items_pkey" primary key ("id"),
  constraint "circle_spectator_feed_items_playback_record_fkey"
    foreign key ("playback_record_id") references public."spectator_hls_playback_records"("id") on delete set null,
  constraint "circle_spectator_feed_items_broadcast_session_fkey"
    foreign key ("broadcast_session_id") references public."room_broadcast_sessions"("id") on delete set null,
  constraint "circle_spectator_feed_items_source_type_check"
    check ("source_type" in ('watch_party_room', 'live_stage_room', 'creator_event', 'manual_foundation')),
  constraint "circle_spectator_feed_items_item_type_check"
    check ("item_type" in ('live_room', 'watch_party', 'creator_event', 'replay_later', 'manual_foundation')),
  constraint "circle_spectator_feed_items_visibility_check"
    check ("visibility" = 'circle'),
  constraint "circle_spectator_feed_items_access_type_check"
    check ("access_type" = 'circle'),
  constraint "circle_spectator_feed_items_rights_status_check"
    check ("rights_status" in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')),
  constraint "circle_spectator_feed_items_moderation_status_check"
    check ("moderation_status" in ('clean', 'reported', 'under_review', 'hidden', 'removed', 'banned', 'blocked')),
  constraint "circle_spectator_feed_items_status_check"
    check ("status" in ('active', 'hidden', 'removed')),
  constraint "circle_spectator_feed_items_live_state_check"
    check ("live_state" in ('not_live', 'scheduled', 'live', 'ended', 'replay_available_later')),
  constraint "circle_spectator_feed_items_safe_active_check"
    check (
      "status" <> 'active'
      or (
        "visibility" = 'circle'
        and "access_type" = 'circle'
        and "moderation_status" = 'clean'
        and "rights_status" in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')
        and "is_spectator_enabled" = true
        and "allow_spectator_view" = true
        and "requires_ticket_to_watch" = false
        and "requires_subscription_to_watch" = false
        and "requires_premium_to_join" = false
        and coalesce("source_room_id", "room_id", "event_id", "source_id", '') <> ''
        and coalesce("metadata" ->> 'raw_hls_url', '') = ''
        and coalesce("metadata" ->> 'hls_playback_url', '') = ''
        and coalesce("metadata" ->> 'livekit_token', '') = ''
        and coalesce("metadata" ->> 'storage_path', '') = ''
        and coalesce("metadata" ->> 'storage_key', '') = ''
      )
    )
);

create unique index if not exists "circle_spectator_feed_items_source_unique"
  on public."circle_spectator_feed_items" ("source_type", coalesce("source_id", ''), coalesce("source_room_id", ''), coalesce("event_id", ''));
create index if not exists "circle_spectator_feed_items_creator_status_idx"
  on public."circle_spectator_feed_items" ("creator_user_id", "status", "published_at" desc);
create index if not exists "circle_spectator_feed_items_live_state_idx"
  on public."circle_spectator_feed_items" ("live_state", "published_at" desc);

alter table public."circle_spectator_feed_items" enable row level security;

create or replace function public."is_circle_spectator_viewer_blocked"(
  p_creator_user_id text,
  p_viewer_user_id text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public."channel_audience_blocks" block_row
    where block_row."channel_user_id" = p_creator_user_id
      and block_row."blocked_user_id" = p_viewer_user_id
  );
$$;

revoke all on function public."is_circle_spectator_viewer_blocked"(text, text) from public;
grant execute on function public."is_circle_spectator_viewer_blocked"(text, text) to authenticated, postgres, service_role;

create or replace function public."can_read_circle_spectator_feed_item"(
  p_item_id uuid,
  p_viewer_user_id text default (auth.uid())::text
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_item public."circle_spectator_feed_items"%rowtype;
  v_viewer_user_id text := nullif(btrim(coalesce(p_viewer_user_id, '')), '');
begin
  select *
  into v_item
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

  if public."is_circle_spectator_viewer_blocked"(v_item."creator_user_id", v_viewer_user_id) then
    return false;
  end if;

  return public."is_active_chilly_circle_member"(v_item."creator_user_id", v_viewer_user_id);
end;
$$;

revoke all on function public."can_read_circle_spectator_feed_item"(uuid, text) from public;
grant execute on function public."can_read_circle_spectator_feed_item"(uuid, text) to authenticated, postgres, service_role;

create or replace function public."can_read_circle_spectator_playback_record"(
  p_record_id uuid,
  p_viewer_user_id text default (auth.uid())::text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public."circle_spectator_feed_items" item
    where item."playback_record_id" = p_record_id
      and public."can_read_circle_spectator_feed_item"(item."id", p_viewer_user_id)
  );
$$;

revoke all on function public."can_read_circle_spectator_playback_record"(uuid, text) from public;
grant execute on function public."can_read_circle_spectator_playback_record"(uuid, text) to authenticated, postgres, service_role;

drop policy if exists "circle_spectator_feed_items_select_member_gated"
  on public."circle_spectator_feed_items";
create policy "circle_spectator_feed_items_select_member_gated"
  on public."circle_spectator_feed_items"
  for select
  to authenticated
  using (public."can_read_circle_spectator_feed_item"("id", (auth.uid())::text));

drop policy if exists "circle_spectator_feed_items_owner_insert"
  on public."circle_spectator_feed_items";
create policy "circle_spectator_feed_items_owner_insert"
  on public."circle_spectator_feed_items"
  for insert
  to authenticated
  with check (
    (auth.uid())::text in ("creator_user_id", coalesce("host_user_id", ''), coalesce("channel_user_id", ''))
    and "visibility" = 'circle'
    and "access_type" = 'circle'
    and "status" in ('active', 'hidden')
  );

drop policy if exists "circle_spectator_feed_items_owner_update"
  on public."circle_spectator_feed_items";
create policy "circle_spectator_feed_items_owner_update"
  on public."circle_spectator_feed_items"
  for update
  to authenticated
  using ((auth.uid())::text in ("creator_user_id", coalesce("host_user_id", ''), coalesce("channel_user_id", '')))
  with check (
    (auth.uid())::text in ("creator_user_id", coalesce("host_user_id", ''), coalesce("channel_user_id", ''))
    and "visibility" = 'circle'
    and "access_type" = 'circle'
  );

drop policy if exists "circle_spectator_feed_items_owner_delete"
  on public."circle_spectator_feed_items";
create policy "circle_spectator_feed_items_owner_delete"
  on public."circle_spectator_feed_items"
  for delete
  to authenticated
  using ((auth.uid())::text in ("creator_user_id", coalesce("host_user_id", ''), coalesce("channel_user_id", '')));

drop policy if exists "spectator_hls_playback_records_circle_member_select"
  on public."spectator_hls_playback_records";
create policy "spectator_hls_playback_records_circle_member_select"
  on public."spectator_hls_playback_records"
  for select
  to authenticated
  using (
    "visibility" = 'circle'
    and public."can_read_circle_spectator_playback_record"("id", (auth.uid())::text)
  );

revoke all on table public."circle_spectator_feed_items" from anon;
revoke all on table public."circle_spectator_feed_items" from authenticated;
grant select, insert, update, delete on table public."circle_spectator_feed_items" to authenticated;
grant all on table public."circle_spectator_feed_items" to postgres, service_role;

comment on table public."circle_spectator_feed_items" is
  'Circle-private spectator read model. Rows are not public discovery and are visible only to owner/host/channel or active Chi''lly Circle members through RLS.';
comment on function public."can_read_circle_spectator_feed_item"(uuid, text) is
  'RLS helper for Circle-private spectator rows. Private means approved Chi''lly Circle, not owner-only; blocked viewers and signed-out viewers are denied.';
comment on policy "spectator_hls_playback_records_circle_member_select" on public."spectator_hls_playback_records" is
  'Allows Circle-private spectator playback record metadata only when the related Circle spectator feed item is readable. Raw HLS URLs remain outside the table.';
