-- Pre-activation discovery and Event authority closure.
--
-- This forward-only successor makes discovery a server-owned projection of
-- canonical room, broadcast, and creator Event lifecycle state. It also closes
-- the over-broad creator_events read policy and quarantines positively
-- identified release-facing QA fixtures without deleting audit evidence.

alter table public."watch_party_rooms"
  add column if not exists "discovery_visibility" text not null default 'private',
  add column if not exists "discovery_title" text,
  add column if not exists "discovery_started_at" timestamptz;

alter table public."watch_party_rooms"
  drop constraint if exists "watch_party_rooms_discovery_visibility_check",
  add constraint "watch_party_rooms_discovery_visibility_check"
    check ("discovery_visibility" in ('public', 'circle', 'private')),
  drop constraint if exists "watch_party_rooms_discovery_title_check",
  add constraint "watch_party_rooms_discovery_title_check"
    check ("discovery_title" is null or nullif(btrim("discovery_title"), '') is not null);

create or replace function public."guard_live_stage_discovery_started_authority"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new."discovery_started_at" is distinct from old."discovery_started_at"
    and not (
      coalesce(auth.role(), '') in ('service_role', 'supabase_admin')
      or (
        coalesce(auth.role(), '') = ''
        and session_user in ('postgres', 'supabase_admin')
      )
    )
  then
    raise exception 'live_stage_discovery_start_authority_required';
  end if;
  return new;
end;
$$;

revoke all on function public."guard_live_stage_discovery_started_authority"()
  from public, anon, authenticated, service_role;

drop trigger if exists "guard_live_stage_discovery_started_authority_before_update"
  on public."watch_party_rooms";
create trigger "guard_live_stage_discovery_started_authority_before_update"
  before update of "discovery_started_at" on public."watch_party_rooms"
  for each row execute function public."guard_live_stage_discovery_started_authority"();

-- Circle discovery is also an entry boundary. A guessed/shared room id cannot
-- turn a Circle Live into an ordinary code-driven room for a non-member.
alter function public."join_watch_party_room_session"(text, text, text, text, boolean, boolean, boolean)
  rename to "join_watch_party_room_session_pre_discovery_rfgc";

create or replace function public."join_watch_party_room_session"(
  p_party_id text,
  p_display_name text default null,
  p_avatar_url text default null,
  p_camera_preview_url text default null,
  p_camera_enabled boolean default false,
  p_mic_enabled boolean default true,
  p_self_muted boolean default null
) returns setof public."watch_party_room_memberships"
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_room public."watch_party_rooms"%rowtype;
begin
  select * into v_room
  from public."watch_party_rooms"
  where "party_id" = upper(nullif(btrim(coalesce(p_party_id, '')), ''));

  if v_room."room_type" = 'live'
    and v_room."discovery_visibility" = 'circle'
    and v_actor_user_id is distinct from v_room."host_user_id"
    and (
      v_actor_user_id is null
      or not public."is_active_chilly_circle_member"(
        v_room."host_user_id"::text,
        v_actor_user_id::text
      )
      or public."is_circle_spectator_viewer_blocked"(
        v_room."host_user_id"::text,
        v_actor_user_id::text
      )
    )
  then
    raise exception 'circle_live_authority_required';
  end if;

  return query
  select *
  from public."join_watch_party_room_session_pre_discovery_rfgc"(
    p_party_id,
    p_display_name,
    p_avatar_url,
    p_camera_preview_url,
    p_camera_enabled,
    p_mic_enabled,
    p_self_muted
  );
end;
$$;

revoke all on function public."join_watch_party_room_session_pre_discovery_rfgc"(
  text, text, text, text, boolean, boolean, boolean
) from public, anon, authenticated, service_role;
revoke all on function public."join_watch_party_room_session"(
  text, text, text, text, boolean, boolean, boolean
) from public, anon, service_role;
grant execute on function public."join_watch_party_room_session"(
  text, text, text, text, boolean, boolean, boolean
) to authenticated;

alter function public."resolve_watch_party_livekit_viewer_authority"(text, uuid, uuid)
  rename to "resolve_watch_party_livekit_authority_pre_discovery_rfgc";

create or replace function public."resolve_watch_party_livekit_viewer_authority"(
  p_party_id text,
  p_user_id uuid,
  p_session_generation uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_room public."watch_party_rooms"%rowtype;
  v_baseline jsonb;
begin
  v_baseline := public."resolve_watch_party_livekit_authority_pre_discovery_rfgc"(
    p_party_id,
    p_user_id,
    p_session_generation
  );
  if coalesce((v_baseline ->> 'allowed')::boolean, false) is not true then
    return v_baseline;
  end if;

  select * into v_room
  from public."watch_party_rooms"
  where "party_id" = upper(nullif(btrim(coalesce(p_party_id, '')), ''));

  if v_room."room_type" = 'live'
    and v_room."discovery_visibility" = 'circle'
    and p_user_id is distinct from v_room."host_user_id"
    and (
      p_user_id is null
      or not public."is_active_chilly_circle_member"(
        v_room."host_user_id"::text,
        p_user_id::text
      )
      or public."is_circle_spectator_viewer_blocked"(
        v_room."host_user_id"::text,
        p_user_id::text
      )
    )
  then
    return jsonb_build_object(
      'allowed', false,
      'paidSeatRequired', coalesce((v_baseline ->> 'paidSeatRequired')::boolean, false),
      'speakerEligible', false,
      'hostAuthority', false,
      'expiresAt', null,
      'reason', 'room_viewer_authority_required'
    );
  end if;

  return v_baseline;
end;
$$;

revoke all on function public."resolve_watch_party_livekit_authority_pre_discovery_rfgc"(
  text, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function public."resolve_watch_party_livekit_viewer_authority"(
  text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public."resolve_watch_party_livekit_viewer_authority"(
  text, uuid, uuid
) to service_role;

alter table public."creator_events"
  add column if not exists "visibility" text;

-- Preserve the prior published/non-draft public contract exactly once while
-- making every newly authored Event fail closed until its creator chooses an
-- audience. Existing drafts remain private.
update public."creator_events"
set "visibility" = case when "status" = 'draft' then 'private' else 'public' end
where "visibility" is null;

alter table public."creator_events"
  alter column "visibility" set default 'private',
  alter column "visibility" set not null;

alter table public."creator_events"
  drop constraint if exists "creator_events_visibility_check",
  add constraint "creator_events_visibility_check"
    check ("visibility" in ('public', 'circle', 'private'));

alter table public."discovery_feed_items"
  drop constraint if exists "discovery_feed_items_source_type_check",
  add constraint "discovery_feed_items_source_type_check"
    check ("source_type" in (
      'watch_party_room',
      'live_stage_room',
      'creator_event',
      'creator_video',
      'profile_post',
      'channel',
      'manual_foundation'
    ));

create index if not exists "creator_events_visibility_status_starts_idx"
  on public."creator_events" ("visibility", "status", "starts_at" asc nulls last);

create unique index if not exists "discovery_feed_items_canonical_source_unique"
  on public."discovery_feed_items" ("source_type", "source_id")
  where "source_id" is not null;

create or replace function public."can_read_creator_event"(
  p_event_id uuid,
  p_viewer_user_id uuid default auth.uid()
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event public."creator_events"%rowtype;
begin
  if coalesce(auth.role(), '') not in ('service_role', 'supabase_admin')
    and p_viewer_user_id is distinct from auth.uid()
  then
    return false;
  end if;

  select * into v_event
  from public."creator_events"
  where "id" = p_event_id;

  if not found then
    return false;
  end if;

  if p_viewer_user_id is not null and (
    p_viewer_user_id = v_event."host_user_id"
    or public.has_platform_role(array['owner'::text, 'operator'::text])
  ) then
    return true;
  end if;

  if v_event."status" = 'draft' then
    return false;
  end if;

  if v_event."visibility" = 'public' then
    return true;
  end if;

  if p_viewer_user_id is null then
    return false;
  end if;

  if v_event."visibility" = 'circle' then
    return public."is_active_chilly_circle_member"(
      v_event."host_user_id"::text,
      p_viewer_user_id::text
    ) and not public."is_circle_spectator_viewer_blocked"(
      v_event."host_user_id"::text,
      p_viewer_user_id::text
    );
  end if;

  return exists (
    select 1
    from public."paid_creator_event_passes" event_pass
    where event_pass."creator_event_id" = v_event."id"
      and event_pass."buyer_id" = p_viewer_user_id
      and event_pass."status" = 'active'
      and (event_pass."expires_at" is null or event_pass."expires_at" > timezone('utc'::text, now()))
  );
end;
$$;

revoke all on function public."can_read_creator_event"(uuid, uuid) from public;
grant execute on function public."can_read_creator_event"(uuid, uuid) to anon, authenticated, postgres, service_role;

drop policy if exists "creator_events_select_policy" on public."creator_events";
drop policy if exists "creator_events_host_insert_policy" on public."creator_events";
drop policy if exists "creator_events_host_update_policy" on public."creator_events";
drop policy if exists "creator_events_host_delete_policy" on public."creator_events";

create policy "creator_events_visibility_select_policy"
  on public."creator_events"
  for select
  to anon, authenticated
  using (public."can_read_creator_event"("id", auth.uid()));

create policy "creator_events_host_insert_policy"
  on public."creator_events"
  for insert
  to authenticated
  with check (auth.uid() is not null and "host_user_id" = auth.uid());

create policy "creator_events_host_update_policy"
  on public."creator_events"
  for update
  to authenticated
  using (auth.uid() is not null and "host_user_id" = auth.uid())
  with check (auth.uid() is not null and "host_user_id" = auth.uid());

create policy "creator_events_host_delete_policy"
  on public."creator_events"
  for delete
  to authenticated
  using (auth.uid() is not null and "host_user_id" = auth.uid());

revoke all on table public."creator_events" from anon, authenticated;
grant select on table public."creator_events" to anon;
grant select, insert, update, delete on table public."creator_events" to authenticated;
grant all on table public."creator_events" to postgres, service_role;

drop policy if exists "event_reminders_select_policy" on public."event_reminders";
drop policy if exists "event_reminders_insert_policy" on public."event_reminders";
drop policy if exists "event_reminders_update_policy" on public."event_reminders";
drop policy if exists "event_reminders_delete_policy" on public."event_reminders";

create policy "event_reminders_select_policy"
  on public."event_reminders"
  for select
  to authenticated
  using (
    (
      "user_id" = auth.uid()
      and public."can_read_creator_event"("event_id", auth.uid())
    )
    or exists (
      select 1 from public."creator_events" event_row
      where event_row."id" = public."event_reminders"."event_id"
        and event_row."host_user_id" = auth.uid()
    )
  );

create policy "event_reminders_insert_policy"
  on public."event_reminders"
  for insert
  to authenticated
  with check (
    "user_id" = auth.uid()
    and public."can_read_creator_event"("event_id", auth.uid())
    and exists (
      select 1 from public."creator_events" event_row
      where event_row."id" = public."event_reminders"."event_id"
        and event_row."status" = 'scheduled'
        and event_row."reminder_ready" is true
    )
  );

create policy "event_reminders_update_policy"
  on public."event_reminders"
  for update
  to authenticated
  using (
    "user_id" = auth.uid()
    and public."can_read_creator_event"("event_id", auth.uid())
  )
  with check (
    "user_id" = auth.uid()
    and public."can_read_creator_event"("event_id", auth.uid())
  );

create policy "event_reminders_delete_policy"
  on public."event_reminders"
  for delete
  to authenticated
  using ("user_id" = auth.uid());

revoke all on table public."event_reminders" from anon, authenticated;
grant select, insert, update, delete on table public."event_reminders" to authenticated;
grant all on table public."event_reminders" to postgres, service_role;

create or replace function public."read_authorized_event_reminder_recipients"(
  p_event_id uuid
) returns table (recipient_user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select reminder."user_id"
  from public."event_reminders" reminder
  join public."creator_events" event_row on event_row."id" = reminder."event_id"
  where reminder."event_id" = p_event_id
    and reminder."status" = 'active'
    and event_row."status" = 'scheduled'
    and event_row."reminder_ready" is true
    and public."can_read_creator_event"(event_row."id", reminder."user_id");
$$;

revoke all on function public."read_authorized_event_reminder_recipients"(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public."read_authorized_event_reminder_recipients"(uuid) to service_role;

create or replace function public."sync_creator_event_discovery"(
  p_event_id uuid
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event public."creator_events"%rowtype;
  v_live_state text;
  v_paid boolean := false;
  v_now timestamptz := timezone('utc'::text, now());
begin
  select * into v_event
  from public."creator_events"
  where "id" = p_event_id;

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
      "updated_at" = v_now,
      "metadata" = coalesce("metadata", '{}'::jsonb)
        || jsonb_build_object('canonical_projection_active', false)
  where "source_type" = 'creator_event'
    and "source_id" = p_event_id::text
    and coalesce("metadata" ->> 'producer', '') = 'canonical_creator_event_v1';

  update public."circle_spectator_feed_items"
  set "status" = 'hidden',
      "moderation_status" = 'hidden',
      "updated_at" = v_now,
      "metadata" = coalesce("metadata", '{}'::jsonb)
        || jsonb_build_object('canonical_projection_active', false)
  where "source_type" = 'creator_event'
    and "source_id" = p_event_id::text
    and coalesce("metadata" ->> 'producer', '') = 'canonical_creator_event_v1';

  if v_event."id" is null
    or v_event."status" not in ('scheduled', 'live_now')
    or (v_event."status" = 'scheduled' and v_event."starts_at" is null)
  then
    return;
  end if;

  v_live_state := case when v_event."status" = 'live_now' then 'live' else 'scheduled' end;
  select exists (
    select 1
    from public."paid_creator_events" paid
    where paid."creator_event_id" = v_event."id"
      and paid."status" in ('sandbox', 'active', 'sold_out')
  ) into v_paid;

  if v_event."visibility" = 'public' then
    insert into public."discovery_feed_items" (
      "item_type", "source_type", "source_id", "owner_user_id", "channel_user_id",
      "host_user_id", "event_id", "title", "visibility", "access_type",
      "rights_status", "ad_policy", "discovery_surface", "starts_at", "ended_at",
      "published_at", "live_state", "moderation_status", "is_publicly_discoverable",
      "is_spectator_enabled", "is_spectator_playback_enabled",
      "requires_premium_to_join", "requires_ticket_to_watch",
      "requires_subscription_to_watch", "ranking_score", "ranking_reason", "metadata"
    ) values (
      'creator_event', 'creator_event', v_event."id"::text, v_event."host_user_id"::text,
      v_event."host_user_id"::text, v_event."host_user_id"::text, v_event."id"::text,
      v_event."event_title", 'public', case when v_paid then 'ticketed' else 'public_free' end,
      'creator_owned', 'ads_not_allowed', 'home_profile_channel', v_event."starts_at",
      v_event."ends_at", v_now, v_live_state, 'clean', true, false, false, false, v_paid,
      false, case when v_live_state = 'live' then 95 else 70 end,
      case when v_live_state = 'live' then 'live_now' else 'upcoming_event' end,
      jsonb_build_object(
        'producer', 'canonical_creator_event_v1',
        'canonical_projection_active', true,
        'event_visibility', 'public'
      )
    )
    on conflict ("source_type", "source_id") where "source_id" is not null
    do update set
      "item_type" = excluded."item_type",
      "owner_user_id" = excluded."owner_user_id",
      "channel_user_id" = excluded."channel_user_id",
      "host_user_id" = excluded."host_user_id",
      "event_id" = excluded."event_id",
      "title" = excluded."title",
      "visibility" = excluded."visibility",
      "access_type" = excluded."access_type",
      "rights_status" = excluded."rights_status",
      "discovery_surface" = excluded."discovery_surface",
      "starts_at" = excluded."starts_at",
      "ended_at" = excluded."ended_at",
      "published_at" = excluded."published_at",
      "live_state" = excluded."live_state",
      "moderation_status" = excluded."moderation_status",
      "is_publicly_discoverable" = excluded."is_publicly_discoverable",
      "requires_ticket_to_watch" = excluded."requires_ticket_to_watch",
      "ranking_score" = excluded."ranking_score",
      "ranking_reason" = excluded."ranking_reason",
      "metadata" = excluded."metadata",
      "updated_at" = v_now;
  elsif v_event."visibility" = 'circle' and not v_paid then
    update public."circle_spectator_feed_items"
    set "creator_user_id" = v_event."host_user_id"::text,
        "channel_user_id" = v_event."host_user_id"::text,
        "host_user_id" = v_event."host_user_id"::text,
        "event_id" = v_event."id"::text,
        "item_type" = 'creator_event',
        "title" = v_event."event_title",
        "status" = 'active',
        "moderation_status" = 'clean',
        "live_state" = v_live_state,
        "starts_at" = v_event."starts_at",
        "ended_at" = v_event."ends_at",
        "published_at" = v_now,
        "is_spectator_enabled" = true,
        "allow_spectator_view" = true,
        "ranking_score" = case when v_live_state = 'live' then 95 else 70 end,
        "ranking_reason" = case when v_live_state = 'live' then 'live_now' else 'upcoming_event' end,
        "metadata" = jsonb_build_object(
          'producer', 'canonical_creator_event_v1',
          'canonical_projection_active', true,
          'event_visibility', 'circle'
        ),
        "updated_at" = v_now
    where "source_type" = 'creator_event'
      and "source_id" = v_event."id"::text;

    if not found then
      insert into public."circle_spectator_feed_items" (
        "source_type", "source_id", "event_id", "creator_user_id", "channel_user_id",
        "host_user_id", "item_type", "title", "visibility", "access_type",
        "rights_status", "moderation_status", "status", "live_state", "starts_at",
        "ended_at", "published_at", "is_spectator_enabled", "allow_spectator_view",
        "ranking_score", "ranking_reason", "metadata"
      ) values (
        'creator_event', v_event."id"::text, v_event."id"::text,
        v_event."host_user_id"::text, v_event."host_user_id"::text,
        v_event."host_user_id"::text, 'creator_event', v_event."event_title",
        'circle', 'circle', 'creator_owned', 'clean', 'active', v_live_state,
        v_event."starts_at", v_event."ends_at", v_now, true, true,
        case when v_live_state = 'live' then 95 else 70 end,
        case when v_live_state = 'live' then 'live_now' else 'upcoming_event' end,
        jsonb_build_object(
          'producer', 'canonical_creator_event_v1',
          'canonical_projection_active', true,
          'event_visibility', 'circle'
        )
      );
    end if;
  end if;
end;
$$;

revoke all on function public."sync_creator_event_discovery"(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public."sync_creator_event_discovery"(uuid) to postgres, service_role;

create or replace function public."sync_creator_event_discovery_trigger"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public."sync_creator_event_discovery"(coalesce(new."id", old."id"));
  return coalesce(new, old);
end;
$$;

revoke all on function public."sync_creator_event_discovery_trigger"()
  from public, anon, authenticated, service_role;

drop trigger if exists "sync_creator_event_discovery_after_write" on public."creator_events";
create trigger "sync_creator_event_discovery_after_write"
  after insert or update of "event_title", "event_type", "status", "starts_at", "ends_at", "visibility"
  or delete on public."creator_events"
  for each row execute function public."sync_creator_event_discovery_trigger"();

create or replace function public."sync_paid_creator_event_discovery_trigger"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public."sync_creator_event_discovery"(
    coalesce(new."creator_event_id", old."creator_event_id")
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public."sync_paid_creator_event_discovery_trigger"()
  from public, anon, authenticated, service_role;

drop trigger if exists "sync_paid_creator_event_discovery_after_write" on public."paid_creator_events";
create trigger "sync_paid_creator_event_discovery_after_write"
  after insert or update of "creator_event_id", "status" or delete
  on public."paid_creator_events"
  for each row execute function public."sync_paid_creator_event_discovery_trigger"();

do $$
declare
  event_row record;
begin
  for event_row in select "id" from public."creator_events" loop
    perform public."sync_creator_event_discovery"(event_row."id");
  end loop;
end;
$$;

create or replace function public."sync_live_stage_discovery"(
  p_party_id text
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_room public."watch_party_rooms"%rowtype;
  v_title text;
  v_now timestamptz := timezone('utc'::text, now());
begin
  select * into v_room
  from public."watch_party_rooms"
  where "party_id" = upper(nullif(btrim(coalesce(p_party_id, '')), ''));

  update public."discovery_feed_items"
  set "is_publicly_discoverable" = false,
      "moderation_status" = 'hidden',
      "discovery_surface" = 'none',
      "live_state" = case when v_room."is_active" is false then 'ended' else "live_state" end,
      "ended_at" = case when v_room."is_active" is false then v_now else "ended_at" end,
      "updated_at" = v_now,
      "metadata" = coalesce("metadata", '{}'::jsonb)
        || jsonb_build_object('canonical_projection_active', false)
  where "source_type" = 'live_stage_room'
    and "source_id" = upper(nullif(btrim(coalesce(p_party_id, '')), ''))
    and coalesce("metadata" ->> 'producer', '') = 'canonical_live_stage_v1';

  update public."circle_spectator_feed_items"
  set "status" = 'hidden',
      "moderation_status" = 'hidden',
      "live_state" = case when v_room."is_active" is false then 'ended' else "live_state" end,
      "ended_at" = case when v_room."is_active" is false then v_now else "ended_at" end,
      "updated_at" = v_now,
      "metadata" = coalesce("metadata", '{}'::jsonb)
        || jsonb_build_object('canonical_projection_active', false)
  where "source_type" = 'live_stage_room'
    and "source_id" = upper(nullif(btrim(coalesce(p_party_id, '')), ''))
    and coalesce("metadata" ->> 'producer', '') = 'canonical_live_stage_v1';

  if v_room."party_id" is null
    or v_room."room_type" <> 'live'
    or v_room."is_active" is not true
    or v_room."discovery_started_at" is null
    or v_room."discovery_visibility" = 'private'
  then
    return;
  end if;

  select coalesce(
    nullif(btrim(v_room."discovery_title"), ''),
    'Live with ' || coalesce(
      nullif(btrim(profile."display_name"), ''),
      nullif(btrim(profile."username"), ''),
      'a Chi''llywood creator'
    )
  ) into v_title
  from public."user_profiles" profile
  where profile."user_id" = v_room."host_user_id"::text;
  v_title := coalesce(v_title, nullif(btrim(v_room."discovery_title"), ''), 'Chi''llywood Live');

  if v_room."discovery_visibility" = 'public' then
    insert into public."discovery_feed_items" (
      "item_type", "source_type", "source_id", "owner_user_id", "channel_user_id",
      "host_user_id", "room_id", "title", "visibility", "access_type",
      "rights_status", "ad_policy", "discovery_surface", "starts_at", "published_at",
      "live_state", "moderation_status", "is_publicly_discoverable", "is_spectator_enabled",
      "is_spectator_playback_enabled", "requires_premium_to_join",
      "requires_ticket_to_watch", "requires_subscription_to_watch", "ranking_score",
      "ranking_reason", "metadata"
    ) values (
      'live_room', 'live_stage_room', v_room."party_id", v_room."host_user_id"::text,
      v_room."host_user_id"::text, v_room."host_user_id"::text, v_room."party_id",
      v_title, 'public', 'public_free', 'creator_owned', 'no_ads', 'home_profile_channel',
      v_room."discovery_started_at", v_room."discovery_started_at", 'live', 'clean', true,
      true, false, false, false, false, 100, 'live_now',
      jsonb_build_object(
        'producer', 'canonical_live_stage_v1',
        'canonical_projection_active', true,
        'destination', 'live_stage',
        'room_id', v_room."party_id"
      )
    )
    on conflict ("source_type", "source_id") where "source_id" is not null
    do update set
      "item_type" = excluded."item_type",
      "owner_user_id" = excluded."owner_user_id",
      "channel_user_id" = excluded."channel_user_id",
      "host_user_id" = excluded."host_user_id",
      "room_id" = excluded."room_id",
      "title" = excluded."title",
      "visibility" = excluded."visibility",
      "access_type" = excluded."access_type",
      "rights_status" = excluded."rights_status",
      "discovery_surface" = excluded."discovery_surface",
      "starts_at" = excluded."starts_at",
      "ended_at" = null,
      "published_at" = excluded."published_at",
      "live_state" = 'live',
      "moderation_status" = 'clean',
      "is_publicly_discoverable" = true,
      "is_spectator_enabled" = true,
      "metadata" = excluded."metadata",
      "updated_at" = v_now;
  else
    update public."circle_spectator_feed_items"
    set "source_room_id" = v_room."party_id",
        "room_id" = v_room."party_id",
        "creator_user_id" = v_room."host_user_id"::text,
        "channel_user_id" = v_room."host_user_id"::text,
        "host_user_id" = v_room."host_user_id"::text,
        "item_type" = 'live_room',
        "title" = v_title,
        "status" = 'active',
        "moderation_status" = 'clean',
        "live_state" = 'live',
        "starts_at" = v_room."discovery_started_at",
        "ended_at" = null,
        "published_at" = v_room."discovery_started_at",
        "is_spectator_enabled" = true,
        "allow_spectator_view" = true,
        "ranking_score" = 100,
        "ranking_reason" = 'live_now',
        "metadata" = jsonb_build_object(
          'producer', 'canonical_live_stage_v1',
          'canonical_projection_active', true,
          'destination', 'live_stage',
          'room_id', v_room."party_id"
        ),
        "updated_at" = v_now
    where "source_type" = 'live_stage_room'
      and "source_id" = v_room."party_id";

    if not found then
      insert into public."circle_spectator_feed_items" (
        "source_type", "source_id", "source_room_id", "room_id", "creator_user_id",
        "channel_user_id", "host_user_id", "item_type", "title", "visibility",
        "access_type", "rights_status", "moderation_status", "status", "live_state",
        "starts_at", "published_at", "is_spectator_enabled", "allow_spectator_view",
        "ranking_score", "ranking_reason", "metadata"
      ) values (
        'live_stage_room', v_room."party_id", v_room."party_id", v_room."party_id",
        v_room."host_user_id"::text, v_room."host_user_id"::text,
        v_room."host_user_id"::text, 'live_room', v_title, 'circle', 'circle',
        'creator_owned', 'clean', 'active', 'live', v_room."discovery_started_at",
        v_room."discovery_started_at", true, true, 100, 'live_now',
        jsonb_build_object(
          'producer', 'canonical_live_stage_v1',
          'canonical_projection_active', true,
          'destination', 'live_stage',
          'room_id', v_room."party_id"
        )
      );
    end if;
  end if;
end;
$$;

revoke all on function public."sync_live_stage_discovery"(text)
  from public, anon, authenticated, service_role;
grant execute on function public."sync_live_stage_discovery"(text) to postgres, service_role;

create or replace function public."publish_live_stage_discovery"(
  p_party_id text,
  p_actor_user_id uuid
) returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_room public."watch_party_rooms"%rowtype;
begin
  if p_actor_user_id is null then
    return false;
  end if;

  select * into v_room
  from public."watch_party_rooms"
  where "party_id" = upper(nullif(btrim(coalesce(p_party_id, '')), ''))
  for update;

  if not found
    or v_room."host_user_id" <> p_actor_user_id
    or v_room."room_type" <> 'live'
    or v_room."is_active" is not true
    or v_room."discovery_visibility" = 'private'
  then
    return false;
  end if;

  update public."watch_party_rooms"
  set "discovery_started_at" = coalesce("discovery_started_at", timezone('utc'::text, now())),
      "updated_at" = timezone('utc'::text, now())
  where "party_id" = v_room."party_id";

  perform public."sync_live_stage_discovery"(v_room."party_id");
  return true;
end;
$$;

revoke all on function public."publish_live_stage_discovery"(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public."publish_live_stage_discovery"(text, uuid) to service_role;

create or replace function public."sync_live_stage_discovery_trigger"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public."sync_live_stage_discovery"(coalesce(new."party_id", old."party_id"));
  return coalesce(new, old);
end;
$$;

revoke all on function public."sync_live_stage_discovery_trigger"()
  from public, anon, authenticated, service_role;

drop trigger if exists "sync_live_stage_discovery_after_write" on public."watch_party_rooms";
create trigger "sync_live_stage_discovery_after_write"
  after update of "is_active", "discovery_visibility", "discovery_title", "discovery_started_at"
  or delete on public."watch_party_rooms"
  for each row execute function public."sync_live_stage_discovery_trigger"();

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
  v_title text;
  v_now timestamptz := timezone('utc'::text, now());
  v_public_ok boolean := false;
  v_circle_ok boolean := false;
begin
  select * into v_broadcast
  from public."room_broadcast_sessions"
  where "id" = p_broadcast_session_id;

  select * into v_playback
  from public."spectator_hls_playback_records"
  where "broadcast_session_id" = p_broadcast_session_id;

  v_source_id := coalesce(
    nullif(btrim(v_broadcast."source_room_id"), ''),
    nullif(btrim(v_broadcast."watch_party_room_id"), ''),
    nullif(btrim(v_broadcast."creator_event_id"), '')
  );

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
      "live_state" = case when v_broadcast."broadcast_status" in ('ended', 'cancelled') then 'ended' else "live_state" end,
      "ended_at" = case when v_broadcast."broadcast_status" in ('ended', 'cancelled') then coalesce(v_broadcast."ended_at", v_now) else "ended_at" end,
      "updated_at" = v_now,
      "metadata" = coalesce("metadata", '{}'::jsonb)
        || jsonb_build_object('canonical_projection_active', false)
  where "source_type" = 'watch_party_room'
    and coalesce("metadata" ->> 'producer', '') = 'canonical_spectator_broadcast_v1'
    and (
      "source_id" = v_source_id
      or coalesce("metadata" ->> 'broadcast_session_id', '') = p_broadcast_session_id::text
    );

  update public."circle_spectator_feed_items"
  set "status" = 'hidden',
      "moderation_status" = 'hidden',
      "live_state" = case when v_broadcast."broadcast_status" in ('ended', 'cancelled') then 'ended' else "live_state" end,
      "ended_at" = case when v_broadcast."broadcast_status" in ('ended', 'cancelled') then coalesce(v_broadcast."ended_at", v_now) else "ended_at" end,
      "updated_at" = v_now,
      "metadata" = coalesce("metadata", '{}'::jsonb)
        || jsonb_build_object('canonical_projection_active', false)
  where "source_type" = 'watch_party_room'
    and coalesce("metadata" ->> 'producer', '') = 'canonical_spectator_broadcast_v1'
    and (
      "source_id" = v_source_id
      or coalesce("metadata" ->> 'broadcast_session_id', '') = p_broadcast_session_id::text
    );

  if v_broadcast."id" is null or v_playback."id" is null or v_source_id is null then
    return;
  end if;

  v_public_ok :=
    v_broadcast."broadcast_status" = 'active_later'
    and v_broadcast."playback_url_status" = 'public_safe_available'
    and v_broadcast."is_publicly_watchable" is true
    and v_broadcast."is_spectator_playback_enabled" is true
    and v_broadcast."access_type" = 'public_free'
    and v_broadcast."requires_premium" is false
    and v_broadcast."requires_ticket" is false
    and v_broadcast."rights_status" in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')
    and coalesce(v_broadcast."metadata" ->> 'd7f_public_safe_approved', '') = 'true'
    and coalesce(v_broadcast."metadata" ->> 'spectator_child_room_fixture', '') <> 'true'
    and v_playback."playback_status" = 'live'
    and v_playback."visibility" = 'public'
    and v_playback."playlist_path" is not null
    and v_playback."is_publicly_watchable" is true
    and v_playback."is_spectator_playback_enabled" is true;

  v_circle_ok :=
    v_broadcast."broadcast_status" = 'active_later'
    and v_broadcast."playback_url_status" = 'circle_safe_available'
    and v_broadcast."is_publicly_watchable" is false
    and v_broadcast."is_spectator_playback_enabled" is true
    and v_broadcast."access_type" = 'circle'
    and v_broadcast."requires_premium" is false
    and v_broadcast."requires_ticket" is false
    and v_broadcast."rights_status" in ('creator_owned', 'chillywood_original', 'licensed_for_public_stream')
    and coalesce(v_broadcast."metadata" ->> 'circle_spectator_approved', '') = 'true'
    and coalesce(v_broadcast."metadata" ->> 'spectator_child_room_fixture', '') <> 'true'
    and v_playback."playback_status" = 'live'
    and v_playback."visibility" = 'circle'
    and v_playback."playlist_path" is not null
    and v_playback."is_publicly_watchable" is false
    and v_playback."is_spectator_playback_enabled" is true;

  v_title := coalesce(
    nullif(btrim(v_broadcast."metadata" ->> 'title'), ''),
    'Chi''llywood Watch-Party'
  );

  if v_public_ok then
    insert into public."discovery_feed_items" (
      "item_type", "source_type", "source_id", "owner_user_id", "channel_user_id",
      "host_user_id", "room_id", "title", "visibility", "access_type", "rights_status",
      "ad_policy", "discovery_surface", "starts_at", "published_at", "live_state",
      "moderation_status", "is_publicly_discoverable", "is_spectator_enabled",
      "is_spectator_playback_enabled", "requires_premium_to_join",
      "requires_ticket_to_watch", "requires_subscription_to_watch", "ranking_score",
      "ranking_reason", "metadata", "allow_spectator_view",
      "allow_watch_party_from_spectator"
    ) values (
      'watch_party', 'watch_party_room', v_source_id, v_broadcast."host_user_id",
      v_broadcast."channel_user_id", v_broadcast."host_user_id", v_source_id, v_title,
      'public', 'public_free', v_broadcast."rights_status", v_broadcast."ad_policy",
      'home_profile_channel', coalesce(v_broadcast."started_at", v_now),
      coalesce(v_broadcast."started_at", v_now), 'live', 'clean', true, true, true,
      false, false, false, 98, 'live_now',
      jsonb_build_object(
        'producer', 'canonical_spectator_broadcast_v1',
        'canonical_projection_active', true,
        'broadcast_session_id', v_broadcast."id",
        'playback_record_id', v_playback."id",
        'destination', 'spectator'
      ), true, true
    )
    on conflict ("source_type", "source_id") where "source_id" is not null
    do update set
      "item_type" = excluded."item_type",
      "owner_user_id" = excluded."owner_user_id",
      "channel_user_id" = excluded."channel_user_id",
      "host_user_id" = excluded."host_user_id",
      "room_id" = excluded."room_id",
      "title" = excluded."title",
      "visibility" = excluded."visibility",
      "access_type" = excluded."access_type",
      "rights_status" = excluded."rights_status",
      "ad_policy" = excluded."ad_policy",
      "discovery_surface" = excluded."discovery_surface",
      "starts_at" = excluded."starts_at",
      "ended_at" = null,
      "published_at" = excluded."published_at",
      "live_state" = 'live',
      "moderation_status" = 'clean',
      "is_publicly_discoverable" = true,
      "is_spectator_enabled" = true,
      "is_spectator_playback_enabled" = true,
      "allow_spectator_view" = true,
      "allow_watch_party_from_spectator" = true,
      "metadata" = excluded."metadata",
      "updated_at" = v_now;
  elsif v_circle_ok then
    update public."circle_spectator_feed_items"
    set "source_room_id" = v_source_id,
        "room_id" = v_source_id,
        "playback_record_id" = v_playback."id",
        "broadcast_session_id" = v_broadcast."id",
        "creator_user_id" = coalesce(v_broadcast."host_user_id", v_broadcast."channel_user_id"),
        "channel_user_id" = v_broadcast."channel_user_id",
        "host_user_id" = v_broadcast."host_user_id",
        "item_type" = 'watch_party',
        "title" = v_title,
        "status" = 'active',
        "moderation_status" = 'clean',
        "live_state" = 'live',
        "starts_at" = coalesce(v_broadcast."started_at", v_now),
        "ended_at" = null,
        "published_at" = coalesce(v_broadcast."started_at", v_now),
        "is_spectator_enabled" = true,
        "is_spectator_playback_enabled" = true,
        "allow_spectator_view" = true,
        "allow_watch_party_from_spectator" = true,
        "ranking_score" = 98,
        "ranking_reason" = 'live_now',
        "metadata" = jsonb_build_object(
          'producer', 'canonical_spectator_broadcast_v1',
          'canonical_projection_active', true,
          'broadcast_session_id', v_broadcast."id",
          'playback_record_id', v_playback."id",
          'destination', 'spectator'
        ),
        "updated_at" = v_now
    where "source_type" = 'watch_party_room'
      and "source_id" = v_source_id;

    if not found then
      insert into public."circle_spectator_feed_items" (
        "source_type", "source_id", "source_room_id", "room_id", "playback_record_id",
        "broadcast_session_id", "creator_user_id", "channel_user_id", "host_user_id",
        "item_type", "title", "visibility", "access_type", "rights_status",
        "moderation_status", "status", "live_state", "starts_at", "published_at",
        "is_spectator_enabled", "is_spectator_playback_enabled", "allow_spectator_view",
        "allow_watch_party_from_spectator", "ranking_score", "ranking_reason", "metadata"
      ) values (
        'watch_party_room', v_source_id, v_source_id, v_source_id, v_playback."id",
        v_broadcast."id", coalesce(v_broadcast."host_user_id", v_broadcast."channel_user_id"),
        v_broadcast."channel_user_id", v_broadcast."host_user_id", 'watch_party', v_title,
        'circle', 'circle', v_broadcast."rights_status", 'clean', 'active', 'live',
        coalesce(v_broadcast."started_at", v_now), coalesce(v_broadcast."started_at", v_now),
        true, true, true, true, 98, 'live_now',
        jsonb_build_object(
          'producer', 'canonical_spectator_broadcast_v1',
          'canonical_projection_active', true,
          'broadcast_session_id', v_broadcast."id",
          'playback_record_id', v_playback."id",
          'destination', 'spectator'
        )
      );
    end if;
  end if;
end;
$$;

revoke all on function public."sync_spectator_broadcast_discovery"(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public."sync_spectator_broadcast_discovery"(uuid) to postgres, service_role;

create or replace function public."sync_spectator_broadcast_discovery_trigger"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_broadcast_session_id uuid;
begin
  if tg_table_name = 'spectator_hls_playback_records' then
    v_broadcast_session_id := coalesce(new."broadcast_session_id", old."broadcast_session_id");
  else
    v_broadcast_session_id := coalesce(new."id", old."id");
  end if;

  perform public."sync_spectator_broadcast_discovery"(v_broadcast_session_id);
  return coalesce(new, old);
end;
$$;

revoke all on function public."sync_spectator_broadcast_discovery_trigger"()
  from public, anon, authenticated, service_role;

drop trigger if exists "sync_spectator_broadcast_discovery_after_write" on public."room_broadcast_sessions";
create trigger "sync_spectator_broadcast_discovery_after_write"
  after insert or update or delete on public."room_broadcast_sessions"
  for each row execute function public."sync_spectator_broadcast_discovery_trigger"();

drop trigger if exists "sync_spectator_playback_discovery_after_write" on public."spectator_hls_playback_records";
create trigger "sync_spectator_playback_discovery_after_write"
  after insert or update or delete on public."spectator_hls_playback_records"
  for each row execute function public."sync_spectator_broadcast_discovery_trigger"();

do $$
declare
  broadcast_row record;
begin
  for broadcast_row in select "id" from public."room_broadcast_sessions" loop
    perform public."sync_spectator_broadcast_discovery"(broadcast_row."id");
  end loop;
end;
$$;

drop policy if exists "discovery_feed_items_insert_owner_operator" on public."discovery_feed_items";
drop policy if exists "discovery_feed_items_update_owner_operator" on public."discovery_feed_items";
drop policy if exists "circle_spectator_feed_items_owner_insert" on public."circle_spectator_feed_items";
drop policy if exists "circle_spectator_feed_items_owner_update" on public."circle_spectator_feed_items";
drop policy if exists "circle_spectator_feed_items_owner_delete" on public."circle_spectator_feed_items";

revoke insert, update, delete on table public."discovery_feed_items" from authenticated;
revoke insert, update, delete on table public."circle_spectator_feed_items" from authenticated;
grant select on table public."discovery_feed_items" to authenticated;
grant select on table public."circle_spectator_feed_items" to authenticated;
grant all on table public."discovery_feed_items" to postgres, service_role;
grant all on table public."circle_spectator_feed_items" to postgres, service_role;

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
    "updated_at" = timezone('utc'::text, now()),
    "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
      'release_quarantine', 'pre_activation_discovery_event_authority_v1',
      'release_quarantined_at', timezone('utc'::text, now()),
      'release_quarantine_reason', 'positively_identified_qa_fixture'
    )
where coalesce("metadata" ->> 'spectator_child_room_fixture', '') = 'true'
  and coalesce("metadata" ->> 'fixture_scope', '') in (
    'android_runtime_validation',
    'android_replay_archive_validation'
  );

update public."circle_spectator_feed_items"
set "status" = 'hidden',
    "moderation_status" = 'hidden',
    "is_spectator_enabled" = false,
    "allow_spectator_view" = false,
    "updated_at" = timezone('utc'::text, now()),
    "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
      'release_quarantine', 'pre_activation_discovery_event_authority_v1',
      'release_quarantined_at', timezone('utc'::text, now()),
      'release_quarantine_reason', 'positively_identified_qa_fixture'
    )
where coalesce("metadata" ->> 'proof_fixture', '') = 'true';

comment on column public."watch_party_rooms"."discovery_visibility" is
  'Host-selected Live Stage discovery audience. Publication remains server-owned and begins only after an authenticated host reports a connected provider room.';
comment on column public."creator_events"."visibility" is
  'Authoritative Event audience: public, current Chi''lly Circle, or exact private participant/pass authority.';
comment on function public."publish_live_stage_discovery"(text, uuid) is
  'Service-only transition that binds an authenticated host to the exact active Live Stage room before canonical discovery publication.';
comment on function public."sync_spectator_broadcast_discovery"(uuid) is
  'Server-owned discovery producer for provider-approved public or Circle spectator-safe Watch-Party playback. Invite/code rooms are never published by this projection.';
