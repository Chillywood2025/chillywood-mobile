alter table public."discovery_feed_items"
  add column if not exists "allow_spectator_view" boolean default false not null,
  add column if not exists "allow_watch_party_from_spectator" boolean default false not null,
  add column if not exists "allow_live_reaction_rooms" boolean default false not null,
  add column if not exists "allow_public_share" boolean default false not null,
  add column if not exists "allow_replay_watch_party" boolean default false not null;

update public."discovery_feed_items"
set
  "allow_spectator_view" = true,
  "allow_public_share" = true,
  "allow_watch_party_from_spectator" = true,
  "allow_live_reaction_rooms" = true,
  "allow_replay_watch_party" = case when "live_state" = 'replay_available_later' then true else "allow_replay_watch_party" end,
  "updated_at" = timezone('utc'::text, now())
where "is_publicly_discoverable" = true
  and "visibility" = 'public'
  and "moderation_status" = 'clean'
  and "rights_status" in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')
  and "access_type" = 'public_free'
  and "requires_premium_to_join" = false
  and "requires_ticket_to_watch" = false
  and "requires_subscription_to_watch" = false
  and "is_spectator_enabled" = true
  and "is_spectator_playback_enabled" = true;

alter table public."discovery_feed_items"
  drop constraint if exists "discovery_feed_items_spectator_reuse_flags_public_safe_check";

alter table public."discovery_feed_items"
  add constraint "discovery_feed_items_spectator_reuse_flags_public_safe_check"
    check (
      (
        "allow_spectator_view" = false
        or (
          "is_publicly_discoverable" = true
          and "visibility" = 'public'
          and "moderation_status" = 'clean'
          and "rights_status" in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')
        )
      )
      and (
        "allow_public_share" = false
        or (
          "allow_spectator_view" = true
          and "is_publicly_discoverable" = true
          and "visibility" = 'public'
          and "moderation_status" = 'clean'
        )
      )
      and (
        "allow_watch_party_from_spectator" = false
        or (
          "allow_spectator_view" = true
          and "is_spectator_playback_enabled" = true
          and "access_type" = 'public_free'
          and "requires_premium_to_join" = false
          and "requires_ticket_to_watch" = false
          and "requires_subscription_to_watch" = false
        )
      )
      and (
        "allow_live_reaction_rooms" = false
        or (
          "allow_spectator_view" = true
          and "is_spectator_playback_enabled" = true
          and "access_type" = 'public_free'
          and "requires_premium_to_join" = false
          and "requires_ticket_to_watch" = false
          and "requires_subscription_to_watch" = false
        )
      )
      and (
        "allow_replay_watch_party" = false
        or (
          "allow_spectator_view" = true
          and "live_state" in ('ended', 'replay_available_later')
          and "access_type" = 'public_free'
          and "requires_premium_to_join" = false
          and "requires_ticket_to_watch" = false
          and "requires_subscription_to_watch" = false
        )
      )
    );

alter table public."watch_party_rooms"
  drop constraint if exists "watch_party_rooms_source_type_check";

alter table public."watch_party_rooms"
  add constraint "watch_party_rooms_source_type_check"
  check ("source_type" is null or "source_type" in ('platform_title', 'creator_video', 'spectator_playback'));

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

    if not exists (
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

create table if not exists public."spectator_child_room_sources" (
  "child_room_id" text not null,
  "source_item_id" uuid not null,
  "source_type" text not null,
  "source_owner_user_id" text,
  "source_platform_id" text,
  "source_public_playback_id" uuid,
  "root_source_id" text not null,
  "parent_room_id" text,
  "created_by_user_id" uuid not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  "metadata" jsonb default '{}'::jsonb not null,
  constraint "spectator_child_room_sources_pkey" primary key ("child_room_id"),
  constraint "spectator_child_room_sources_child_room_id_fkey"
    foreign key ("child_room_id") references public."watch_party_rooms"("party_id") on delete cascade,
  constraint "spectator_child_room_sources_source_item_id_fkey"
    foreign key ("source_item_id") references public."discovery_feed_items"("id") on delete restrict,
  constraint "spectator_child_room_sources_source_public_playback_id_fkey"
    foreign key ("source_public_playback_id") references public."spectator_hls_playback_records"("id") on delete set null,
  constraint "spectator_child_room_sources_created_by_user_id_fkey"
    foreign key ("created_by_user_id") references auth."users"("id") on delete cascade,
  constraint "spectator_child_room_sources_source_type_check"
    check ("source_type" in ('watch_party_live', 'live_stage', 'replay', 'creator_video')),
  constraint "spectator_child_room_sources_no_sensitive_metadata_check"
    check ("metadata"::text !~* '(participantToken|livekit|raw_hls|hls_playback_url|storage_path|speaker_credentials|host_controls|secret)')
);

create index if not exists "spectator_child_room_sources_source_item_idx"
  on public."spectator_child_room_sources" using btree ("source_item_id", "created_at" desc);

create index if not exists "spectator_child_room_sources_root_source_idx"
  on public."spectator_child_room_sources" using btree ("root_source_id", "created_at" desc);

create index if not exists "spectator_child_room_sources_created_by_idx"
  on public."spectator_child_room_sources" using btree ("created_by_user_id", "created_at" desc);

alter table public."spectator_child_room_sources" enable row level security;

drop policy if exists "spectator_child_room_sources_member_select"
  on public."spectator_child_room_sources";
create policy "spectator_child_room_sources_member_select"
  on public."spectator_child_room_sources"
  for select
  to "authenticated"
  using (
    "created_by_user_id" = auth.uid()
    or exists (
      select 1
      from public."watch_party_rooms" room
      where room."party_id" = "spectator_child_room_sources"."child_room_id"
        and room."host_user_id" = (auth.uid())::text
    )
    or exists (
      select 1
      from public."watch_party_room_memberships" membership
      where membership."party_id" = "spectator_child_room_sources"."child_room_id"
        and membership."user_id" = (auth.uid())::text
        and membership."membership_state" in ('active', 'reconnecting')
    )
  );

drop policy if exists "spectator_child_room_sources_owner_operator_select"
  on public."spectator_child_room_sources";
create policy "spectator_child_room_sources_owner_operator_select"
  on public."spectator_child_room_sources"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."spectator_child_room_sources" from "anon";
revoke all on table public."spectator_child_room_sources" from "authenticated";
grant select on table public."spectator_child_room_sources" to "authenticated";
grant all on table public."spectator_child_room_sources" to "service_role";

create table if not exists public."spectator_child_room_audit_log" (
  "id" uuid default gen_random_uuid() not null,
  "event_type" text not null,
  "actor_user_id" uuid,
  "source_item_id" uuid,
  "child_room_id" text,
  "denial_reason" text,
  "security_context_id" uuid,
  "metadata" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint "spectator_child_room_audit_log_pkey" primary key ("id"),
  constraint "spectator_child_room_audit_log_event_type_check"
    check ("event_type" in (
      'spectator_start_watch_party_attempt',
      'spectator_start_watch_party_success',
      'spectator_start_watch_party_denied',
      'spectator_start_live_reaction_attempt',
      'spectator_start_live_reaction_success',
      'spectator_start_live_reaction_denied'
    )),
  constraint "spectator_child_room_audit_log_source_item_id_fkey"
    foreign key ("source_item_id") references public."discovery_feed_items"("id") on delete set null,
  constraint "spectator_child_room_audit_log_child_room_id_fkey"
    foreign key ("child_room_id") references public."watch_party_rooms"("party_id") on delete set null,
  constraint "spectator_child_room_audit_log_actor_user_id_fkey"
    foreign key ("actor_user_id") references auth."users"("id") on delete set null,
  constraint "spectator_child_room_audit_log_security_context_id_fkey"
    foreign key ("security_context_id") references public."security_request_context"("id") on delete set null,
  constraint "spectator_child_room_audit_log_no_sensitive_metadata_check"
    check ("metadata"::text !~* '(participantToken|livekit|raw_hls|hls_playback_url|storage_path|speaker_credentials|host_controls|secret)')
);

create index if not exists "spectator_child_room_audit_log_source_idx"
  on public."spectator_child_room_audit_log" using btree ("source_item_id", "created_at" desc);

create index if not exists "spectator_child_room_audit_log_actor_idx"
  on public."spectator_child_room_audit_log" using btree ("actor_user_id", "created_at" desc);

alter table public."spectator_child_room_audit_log" enable row level security;

drop policy if exists "spectator_child_room_audit_log_owner_operator_select"
  on public."spectator_child_room_audit_log";
create policy "spectator_child_room_audit_log_owner_operator_select"
  on public."spectator_child_room_audit_log"
  for select
  to "authenticated"
  using (public.has_platform_role(array['owner'::text, 'operator'::text]));

revoke all on table public."spectator_child_room_audit_log" from "anon";
revoke all on table public."spectator_child_room_audit_log" from "authenticated";
grant select on table public."spectator_child_room_audit_log" to "authenticated";
grant all on table public."spectator_child_room_audit_log" to "service_role";

comment on column public."discovery_feed_items"."allow_spectator_view" is
  'Creator/source permission flag for public-safe spectator viewing. Private, blocked, protected, Premium-full-room, ticketed, and subscriber-only rows remain blocked by server eligibility.';
comment on column public."discovery_feed_items"."allow_watch_party_from_spectator" is
  'Creator/source permission flag allowing a public-safe spectator source to launch a child Watch-Party Live room without exposing original LiveKit room credentials.';
comment on column public."discovery_feed_items"."allow_live_reaction_rooms" is
  'Creator/source permission flag allowing a public-safe spectator live source to launch a child Live Watch-Party reaction room without granting publish access to the original room.';
comment on column public."discovery_feed_items"."allow_public_share" is
  'Creator/source permission flag for safe source sharing from Spectator. Sharing never exposes raw HLS paths or LiveKit tokens.';
comment on table public."spectator_child_room_sources" is
  'Safe child-room source links for spectator-to-room creation. Stores source ids and resolver ids only; never stores original LiveKit tokens, host controls, speaker credentials, raw HLS URLs, or private storage paths.';
comment on table public."spectator_child_room_audit_log" is
  'Audits spectator-to-child-room creation attempts, denials, and successes without tokens or raw media paths.';
