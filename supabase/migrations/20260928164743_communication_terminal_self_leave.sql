-- A terminal Chat invite closes ordinary room visibility before the client
-- finishes its local media teardown. Self-leave must confirm the actual durable
-- row without reopening room reads or guessing that an invisible row is gone.
alter table public.communication_room_memberships
  add column membership_generation uuid not null default gen_random_uuid(),
  add column membership_admission_attempt uuid;

-- Legacy active retries retain their generation; a legacy LEFT-to-ACTIVE join
-- rotates it. Modern admission records a distinct attempt and rotates even on
-- ACTIVE takeover after process restart. Historical joined_at stays unchanged.
-- Only the authorized server admission paths may assign either ownership field.
create function public.advance_communication_membership_generation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user::text not in ('postgres', 'service_role', 'supabase_admin') then
    if new.membership_generation is distinct from old.membership_generation
      or new.membership_admission_attempt is distinct from old.membership_admission_attempt then
      raise exception 'communication_membership_generation_immutable';
    end if;
    if old.membership_admission_attempt is not null and auth.uid()::text = old.user_id then
      -- The earlier guard refreshes last_seen_at on any direct self update.
      -- Metadata-only profile sync remains legal, but cannot refresh liveness.
      new.last_seen_at := old.last_seen_at;
    end if;
    return new;
  end if;
  if new.membership_admission_attempt is distinct from old.membership_admission_attempt then
    if new.membership_admission_attempt is null
      or new.membership_generation is not distinct from old.membership_generation then
      raise exception 'communication_membership_generation_immutable';
    end if;
    return new;
  end if;
  if old.membership_state = 'left'
    and new.membership_state in ('active', 'reconnecting')
    and old.membership_admission_attempt is null then
    new.membership_generation := gen_random_uuid();
  elsif new.membership_generation is distinct from old.membership_generation then
    raise exception 'communication_membership_generation_immutable';
  end if;
  return new;
end;
$$;
revoke all on function public.advance_communication_membership_generation()
  from public, anon, authenticated, service_role;
-- PostgreSQL orders same-kind triggers by name. Rotate only after the identity
-- and ended-room guards have settled NEW; a rejected stale reactivation must
-- not invalidate the existing terminal generation.
create trigger zz_advance_communication_membership_generation
before update on public.communication_room_memberships
for each row execute function public.advance_communication_membership_generation();

-- Modern rows reject unfenced direct self media/liveness writes. Profile
-- metadata sync and existing host moderation keep their prior authority.
create function public.guard_owned_communication_membership_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.membership_admission_attempt is not null
    and current_user::text not in ('postgres', 'service_role', 'supabase_admin')
    and auth.uid()::text = old.user_id
    and (new.membership_state is distinct from old.membership_state
      or new.camera_enabled is distinct from old.camera_enabled
      or new.mic_enabled is distinct from old.mic_enabled
      or new.last_seen_at is distinct from old.last_seen_at
      or new.left_at is distinct from old.left_at) then
    raise exception 'communication_membership_owned_write_required';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_owned_communication_membership_write()
  from public, anon, authenticated, service_role;
create trigger aa_guard_owned_communication_membership_write
before update on public.communication_room_memberships
for each row execute function public.guard_owned_communication_membership_write();

create function public.leave_communication_room_session(
  p_room_id text,
  p_expected_membership_generation uuid
)
returns setof public.communication_room_memberships
language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := nullif(auth.uid()::text, '');
  v_room_id text := upper(btrim(coalesce(p_room_id, '')));
  v_room public.communication_rooms%rowtype;
  v_membership public.communication_room_memberships%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_actor is null
    or not public.whole_app_exact_current_session_authority_internal() then
    raise exception 'communication_room_current_session_required';
  end if;
  if v_room_id = '' or v_room_id !~ '^[A-Z0-9_-]{4,128}$'
    or p_expected_membership_generation is null then
    raise exception 'communication_membership_cleanup_identity_required';
  end if;

  -- Same lock order as join and terminal cleanup: room, then membership.
  select room.* into v_room from public.communication_rooms room
  where room.room_id = v_room_id for update;
  if v_room.room_id is null then
    raise exception 'communication_membership_cleanup_not_found';
  end if;
  select membership.* into v_membership
  from public.communication_room_memberships membership
  where membership.room_id = v_room_id and membership.user_id = v_actor
  for update;
  if v_membership.user_id is null then
    raise exception 'communication_membership_cleanup_not_found';
  end if;
  if v_membership.membership_generation is distinct from p_expected_membership_generation then
    raise exception 'communication_membership_cleanup_generation_changed';
  end if;
  if v_membership.role <> (case when v_room.host_user_id = v_actor then 'host' else 'participant' end) then
    raise exception 'communication_membership_role_invalid';
  end if;

  -- Cleanup only reduces this authenticated actor's existing authority. A
  -- terminal room cannot pass the normal read gate; returning this one own row
  -- deliberately does not expose its peers, linked room, or private content.
  if v_membership.membership_state in ('left', 'removed') then
    if v_membership.camera_enabled or v_membership.mic_enabled
      or v_membership.left_at is null then
      raise exception 'communication_membership_cleanup_postcondition_failed';
    end if;
    return next v_membership;
    return;
  end if;
  if v_membership.membership_state not in ('active', 'reconnecting') then
    raise exception 'communication_membership_cleanup_state_invalid';
  end if;
  update public.communication_room_memberships membership
  set membership_state = 'left', camera_enabled = false, mic_enabled = false,
      last_seen_at = v_now, updated_at = v_now, left_at = v_now
  where membership.room_id = v_room_id and membership.user_id = v_actor
    and membership.membership_generation = p_expected_membership_generation
  returning membership.* into v_membership;
  if v_membership.user_id is null
    or v_membership.membership_state <> 'left'
    or v_membership.camera_enabled or v_membership.mic_enabled
    or v_membership.left_at is null then
    raise exception 'communication_membership_cleanup_postcondition_failed';
  end if;
  return next v_membership;
end;
$$;
revoke all on function public.leave_communication_room_session(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.leave_communication_room_session(text, uuid)
  to authenticated;
comment on function public.leave_communication_room_session(text, uuid) is
  'Exact-current-session self cleanup; confirms one existing membership generation after terminal room visibility closes. No room discovery or peer read authority.';

-- One private authorization body preserves the established join contract and
-- lock order for legacy admission, owned admission, and its CAS snapshot.
create function public.authorize_communication_room_admission_internal(p_room_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_actor_user_id text := nullif(auth.uid()::text, '');
  v_room_id text := upper(btrim(coalesce(p_room_id, '')));
  v_room public."communication_rooms"%rowtype;
  v_attached_thread public."chat_threads"%rowtype;
  v_attached_thread_count integer := 0;
  v_existing public."communication_room_memberships"%rowtype;
  v_membership public."communication_room_memberships"%rowtype;
  v_active_member_count integer := 0;
  v_now timestamptz := timezone('utc'::text, now());
  v_linked_party_host_user_id text;
  v_linked_paid_viewer boolean := false;
begin
  if v_actor_user_id is null then
    raise exception 'communication_room_authentication_required';
  end if;
  if not public."whole_app_exact_current_session_authority_internal"() then
    raise exception 'communication_room_current_session_required';
  end if;
  if v_room_id = '' or v_room_id !~ '^[A-Z0-9_-]{4,128}$' then
    raise exception 'communication_room_identity_required';
  end if;

  perform public."assert_account_private_feature_allowed"(
    v_actor_user_id,
    'communication_room_membership'
  );

  select room.* into v_room
  from public."communication_rooms" room
  where room."room_id" = v_room_id
  for update;

  if v_room."room_id" is null
    or v_room."status" <> 'active'
    or coalesce(
      v_room."last_activity_at",
      v_room."updated_at",
      v_room."created_at"
    ) < v_now - interval '15 minutes'
  then
    raise exception 'communication_room_unavailable';
  end if;

  select count(*)::integer into v_attached_thread_count
  from public."chat_threads" thread
  where thread."active_communication_room_id" = v_room_id;

  if v_attached_thread_count > 1 then
    raise exception 'communication_chat_call_authority_required';
  end if;

  if v_attached_thread_count = 1 then
    select thread.* into v_attached_thread
    from public."chat_threads" thread
    where thread."active_communication_room_id" = v_room_id
    for update;
  end if;

  if v_attached_thread."id" is not null then
    if not public."can_access_chat_thread"(v_attached_thread."id")
      or not exists (
        select 1
        from public."chat_call_invites" invite
        where invite."thread_id" = v_attached_thread."id"
          and invite."communication_room_id" = v_room_id
          and invite."status" = 'accepted'
          and invite."accepted_at" is not null
          and invite."ended_at" is null
          and invite."call_type" = v_attached_thread."active_call_type"
          and v_actor_user_id in (
            invite."caller_user_id",
            invite."callee_user_id"
          )
      )
    then
      raise exception 'communication_chat_call_authority_required';
    end if;
  elsif v_room."linked_party_id" is not null then
    if not public."can_read_watch_party_room_authority"(
      v_room."linked_party_id"
    ) then
      raise exception 'communication_watch_party_authority_required';
    end if;
    select party_room."host_user_id"::text
    into v_linked_party_host_user_id
    from public."watch_party_rooms" party_room
    where party_room."party_id" = v_room."linked_party_id";
    v_linked_paid_viewer := v_actor_user_id is distinct from
        v_linked_party_host_user_id
      and exists (
        select 1
        from public."paid_watch_party_offers" offer
        where offer."party_id" = v_room."linked_party_id"
          and offer."status" in (
            'sandbox', 'active', 'paused', 'sold_out', 'blocked'
          )
      );
  elsif v_actor_user_id <> v_room."host_user_id"
    and not (
      v_room."content_access_rule" = 'open'
      or (
        v_room."content_access_rule" = 'party_pass'
        and public."user_has_active_entitlement"(
          v_actor_user_id,
          array['premium_watch_party'::text, 'premium'::text]
        )
      )
      or (
        v_room."content_access_rule" = 'premium'
        and public."user_has_active_entitlement"(
          v_actor_user_id,
          array['premium'::text]
        )
      )
    )
  then
    raise exception 'communication_room_entitlement_required';
  end if;

  select membership.* into v_existing
  from public."communication_room_memberships" membership
  where membership."room_id" = v_room_id
    and membership."user_id" = v_actor_user_id
  for update;

  if v_existing."membership_state" = 'removed' then
    raise exception 'communication_room_membership_removed';
  end if;

  select count(*)::integer into v_active_member_count
  from public."communication_room_memberships" membership
  where membership."room_id" = v_room_id
    and membership."user_id" <> v_actor_user_id
    and membership."membership_state" in ('active', 'reconnecting')
    and membership."last_seen_at" >= v_now - interval '45 seconds';

  if v_active_member_count >= 4 then
    raise exception 'communication_room_full';
  end if;

  return v_linked_paid_viewer;
end;
$$;
revoke all on function public.authorize_communication_room_admission_internal(text)
  from public, anon, authenticated, service_role;

create function public.read_communication_room_admission(p_room_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := auth.uid()::text;
  v_room_id text := upper(btrim(coalesce(p_room_id, '')));
  v_generation uuid;
begin
  perform public.authorize_communication_room_admission_internal(v_room_id);
  select membership_generation into v_generation
  from public.communication_room_memberships
  where room_id = v_room_id and user_id = v_actor;
  return jsonb_build_object('roomId', v_room_id, 'userId', v_actor,
    'previousGeneration', v_generation);
end;
$$;
revoke all on function public.read_communication_room_admission(text)
  from public, anon, authenticated, service_role;
grant execute on function public.read_communication_room_admission(text) to authenticated;

create or replace function public."join_communication_room_session"(
  p_room_id text,
  p_display_name text default null,
  p_avatar_url text default null,
  p_camera_enabled boolean default false,
  p_mic_enabled boolean default true
)
returns setof public."communication_room_memberships"
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id text := auth.uid()::text;
  v_room_id text := upper(btrim(coalesce(p_room_id, '')));
  v_room public.communication_rooms%rowtype;
  v_existing public.communication_room_memberships%rowtype;
  v_membership public.communication_room_memberships%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
  v_linked_paid_viewer boolean;
begin
  v_linked_paid_viewer := public.authorize_communication_room_admission_internal(v_room_id);
  select * into v_room from public.communication_rooms where room_id = v_room_id;
  select * into v_existing from public.communication_room_memberships
    where room_id = v_room_id and user_id = v_actor_user_id;
  if v_existing.membership_admission_attempt is not null then
    raise exception 'communication_membership_owned_admission_required';
  end if;
  insert into public."communication_room_memberships" (
    "room_id",
    "user_id",
    "role",
    "membership_state",
    "camera_enabled",
    "mic_enabled",
    "display_name",
    "avatar_url",
    "joined_at",
    "last_seen_at",
    "left_at",
    "updated_at"
  ) values (
    v_room_id,
    v_actor_user_id,
    case when v_actor_user_id = v_room."host_user_id" then 'host' else 'participant' end,
    'active',
    not v_linked_paid_viewer and coalesce(p_camera_enabled, false),
    not v_linked_paid_viewer and coalesce(p_mic_enabled, true),
    nullif(left(btrim(coalesce(p_display_name, '')), 160), ''),
    nullif(left(btrim(coalesce(p_avatar_url, '')), 2048), ''),
    v_now,
    v_now,
    null,
    v_now
  )
  on conflict on constraint "communication_room_memberships_pkey" do update
  set
    "role" = excluded."role",
    "membership_state" = 'active',
    "camera_enabled" = excluded."camera_enabled",
    "mic_enabled" = excluded."mic_enabled",
    "display_name" = excluded."display_name",
    "avatar_url" = excluded."avatar_url",
    "joined_at" = public."communication_room_memberships"."joined_at",
    "last_seen_at" = excluded."last_seen_at",
    "left_at" = null,
    "updated_at" = excluded."updated_at"
  returning * into v_membership;

  return next v_membership;
end;
$$;

create function public.join_owned_communication_room_session(
  p_room_id text,
  p_admission_attempt uuid,
  p_expected_previous_generation uuid,
  p_display_name text default null,
  p_avatar_url text default null,
  p_camera_enabled boolean default false,
  p_mic_enabled boolean default true
)
returns setof public.communication_room_memberships
language plpgsql security definer set search_path = '' as $$
declare
  v_actor_user_id text := auth.uid()::text;
  v_room_id text := upper(btrim(coalesce(p_room_id, '')));
  v_room public.communication_rooms%rowtype;
  v_existing public.communication_room_memberships%rowtype;
  v_membership public.communication_room_memberships%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
  v_linked_paid_viewer boolean;
begin
  v_linked_paid_viewer := public.authorize_communication_room_admission_internal(v_room_id);
  select * into v_room from public.communication_rooms where room_id = v_room_id;
  select * into v_existing from public.communication_room_memberships
    where room_id = v_room_id and user_id = v_actor_user_id;
  if p_admission_attempt is null then
    raise exception 'communication_membership_admission_identity_required';
  end if;
  if v_existing.membership_admission_attempt = p_admission_attempt then
    if v_existing.membership_state not in ('active', 'reconnecting')
      or v_existing.left_at is not null then
      raise exception 'communication_membership_admission_retired';
    end if;
    -- A retry reads the committed admission. Never replay its old media flags.
    return next v_existing;
    return;
  end if;
  if v_existing.membership_generation is distinct from p_expected_previous_generation then
    raise exception 'communication_membership_admission_conflict';
  end if;
  insert into public."communication_room_memberships" (
    "room_id",
    "user_id",
    "role",
    "membership_state",
    "camera_enabled",
    "mic_enabled",
    "display_name",
    "avatar_url",
    "joined_at",
    "last_seen_at",
    "left_at",
    "updated_at",
    "membership_generation",
    "membership_admission_attempt"
  ) values (
    v_room_id,
    v_actor_user_id,
    case when v_actor_user_id = v_room."host_user_id" then 'host' else 'participant' end,
    'active',
    not v_linked_paid_viewer and coalesce(p_camera_enabled, false),
    not v_linked_paid_viewer and coalesce(p_mic_enabled, true),
    nullif(left(btrim(coalesce(p_display_name, '')), 160), ''),
    nullif(left(btrim(coalesce(p_avatar_url, '')), 2048), ''),
    v_now,
    v_now,
    null,
    v_now,
    gen_random_uuid(),
    p_admission_attempt
  )
  on conflict on constraint "communication_room_memberships_pkey" do update
  set
    "membership_generation" = excluded."membership_generation",
    "membership_admission_attempt" = excluded."membership_admission_attempt",
    "role" = excluded."role",
    "membership_state" = 'active',
    "camera_enabled" = excluded."camera_enabled",
    "mic_enabled" = excluded."mic_enabled",
    "display_name" = excluded."display_name",
    "avatar_url" = excluded."avatar_url",
    "joined_at" = public."communication_room_memberships"."joined_at",
    "last_seen_at" = excluded."last_seen_at",
    "left_at" = null,
    "updated_at" = excluded."updated_at"
  returning * into v_membership;

  return next v_membership;
end;
$$;
revoke all on function public.join_owned_communication_room_session(text, uuid, uuid, text, text, boolean, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.join_owned_communication_room_session(text, uuid, uuid, text, text, boolean, boolean) to authenticated;

create function public.touch_owned_communication_room_session(
  p_room_id text,
  p_expected_membership_generation uuid,
  p_membership_state text default null,
  p_camera_enabled boolean default null,
  p_mic_enabled boolean default null,
  p_display_name text default null,
  p_avatar_url text default null,
  p_update_display_name boolean default false,
  p_update_avatar_url boolean default false
)
returns setof public.communication_room_memberships
language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := nullif(auth.uid()::text, '');
  v_room_id text := upper(btrim(coalesce(p_room_id, '')));
  v_room public.communication_rooms%rowtype;
  v_membership public.communication_room_memberships%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_actor is null or not public.whole_app_exact_current_session_authority_internal() then
    raise exception 'communication_room_current_session_required';
  end if;
  if v_room_id = '' or v_room_id !~ '^[A-Z0-9_-]{4,128}$'
    or p_expected_membership_generation is null then
    raise exception 'communication_membership_identity_required';
  end if;
  if p_membership_state is not null and p_membership_state not in ('active', 'reconnecting') then
    raise exception 'communication_membership_state_invalid';
  end if;
  select * into v_room from public.communication_rooms where room_id = v_room_id for update;
  select * into v_membership from public.communication_room_memberships
    where room_id = v_room_id and user_id = v_actor for update;
  if v_membership.membership_generation is distinct from p_expected_membership_generation then
    raise exception 'communication_membership_generation_changed';
  end if;
  if v_membership.membership_admission_attempt is null then
    raise exception 'communication_membership_owned_admission_required';
  end if;
  if v_membership.membership_state not in ('active', 'reconnecting') or v_membership.left_at is not null then
    raise exception 'communication_membership_not_active';
  end if;
  if not public.can_read_communication_room_authority(v_room_id) then
    raise exception 'communication_membership_authority_required';
  end if;
  update public.communication_room_memberships membership set
    membership_state = coalesce(p_membership_state, membership.membership_state),
    camera_enabled = coalesce(p_camera_enabled, membership.camera_enabled),
    mic_enabled = coalesce(p_mic_enabled, membership.mic_enabled),
    display_name = case when p_update_display_name then nullif(left(btrim(coalesce(p_display_name, '')),160),'') else membership.display_name end,
    avatar_url = case when p_update_avatar_url then nullif(left(btrim(coalesce(p_avatar_url, '')),2048),'') else membership.avatar_url end,
    last_seen_at = v_now, updated_at = v_now
  where membership.room_id = v_room_id and membership.user_id = v_actor
    and membership.membership_generation = p_expected_membership_generation
  returning membership.* into v_membership;
  if v_membership.membership_state not in ('active', 'reconnecting')
    or v_membership.left_at is not null then
    raise exception 'communication_membership_not_active';
  end if;
  update public.communication_rooms set last_activity_at = v_now, updated_at = v_now
    where room_id = v_room_id and status = 'active';
  return next v_membership;
end;
$$;
revoke all on function public.touch_owned_communication_room_session(text, uuid, text, boolean, boolean, text, text, boolean, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.touch_owned_communication_room_session(text, uuid, text, boolean, boolean, text, text, boolean, boolean) to authenticated;

-- Preserve canonical signal validation, with durable sender ownership.
create function public.broadcast_communication_room_signal_internal(
  p_room_id text,
  p_event text,
  p_payload jsonb,
  p_expected_membership_generation uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_user_id text := nullif(auth.uid()::text, '');
  v_room_id text := upper(btrim(coalesce(p_room_id, '')));
  v_event text := lower(btrim(coalesce(p_event, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_target_user_id text;
  v_negotiation_id text;
  v_description jsonb;
  v_candidate jsonb;
  v_message jsonb;
  v_now timestamptz := timezone('utc'::text, now());
  v_paid_viewer_only boolean := false;
  v_sender public.communication_room_memberships%rowtype;
begin
  if v_actor_user_id is null then
    raise exception 'communication_room_authentication_required';
  end if;
  if v_room_id = '' or v_room_id !~ '^[A-Z0-9_-]{4,128}$' then
    raise exception 'communication_room_identity_required';
  end if;
  if jsonb_typeof(v_payload) <> 'object'
    or octet_length(v_payload::text) > 131072
  then
    raise exception 'communication_signal_payload_invalid';
  end if;
  if v_event not in (
    'webrtc:offer',
    'webrtc:answer',
    'webrtc:ice',
    'media:update',
    'room:end'
  ) then
    raise exception 'communication_signal_event_invalid';
  end if;
  if not public.whole_app_exact_current_session_authority_internal() then
    raise exception 'communication_room_current_session_required';
  end if;
  -- Serialize relay validation with admission/leave. A packet already relayed
  -- retains its generation stamp so the receiver can reject it after takeover.
  perform 1 from public.communication_rooms where room_id = v_room_id for update;
  select * into v_sender from public.communication_room_memberships
    where room_id = v_room_id and user_id = v_actor_user_id for update;
  if v_event <> 'room:end' then
    if p_expected_membership_generation is null then
      if v_sender.membership_admission_attempt is not null then
        raise exception 'communication_membership_owned_signal_required';
      end if;
    elsif v_sender.membership_generation is distinct from p_expected_membership_generation then
      raise exception 'communication_membership_generation_changed';
    end if;
    if v_sender.user_id is null
      or v_sender.membership_state not in ('active', 'reconnecting')
      or v_sender.left_at is not null then
      raise exception 'communication_membership_not_active';
    end if;
  elsif p_expected_membership_generation is not null then
    raise exception 'communication_signal_event_invalid';
  end if;
  if not public."can_access_communication_realtime_topic"(
    'comm-room-' || v_room_id
  ) then
    raise exception 'communication_signal_authority_required';
  end if;

  select exists (
    select 1
    from public."communication_rooms" communication_room
    join public."watch_party_rooms" party_room
      on party_room."party_id" = communication_room."linked_party_id"
    where communication_room."room_id" = v_room_id
      and party_room."host_user_id"::text <> v_actor_user_id
      and exists (
        select 1
        from public."paid_watch_party_offers" offer
        where offer."party_id" = party_room."party_id"
          and offer."status" in (
            'sandbox', 'active', 'paused', 'sold_out', 'blocked'
          )
      )
  ) into v_paid_viewer_only;

  if v_event in ('webrtc:offer', 'webrtc:answer', 'webrtc:ice') then
    v_target_user_id := nullif(btrim(coalesce(
      v_payload ->> 'targetUserId',
      ''
    )), '');
    if v_target_user_id is null
      or v_target_user_id = v_actor_user_id
      or not exists (
        select 1
        from public."communication_room_memberships" membership
        join public."communication_rooms" room
          on room."room_id" = membership."room_id"
        where membership."room_id" = v_room_id
          and membership."user_id" = v_target_user_id
          and membership."membership_state" in ('active', 'reconnecting')
          and membership."last_seen_at" >= v_now - interval '45 seconds'
          and membership."role" = case
            when membership."user_id" = room."host_user_id" then 'host'
            else 'participant'
          end
          and room."status" = 'active'
          and not public."is_account_access_restricted"(
            membership."user_id"
          )
      )
      or public."has_channel_audience_block_between"(
        v_actor_user_id,
        v_target_user_id
      )
    then
      raise exception 'communication_signal_target_invalid';
    end if;
  end if;

  if v_event in ('webrtc:offer', 'webrtc:answer') then
    v_description := v_payload -> 'description';
    if jsonb_typeof(v_description) <> 'object'
      or v_description ->> 'type' <> split_part(v_event, ':', 2)
      or nullif(v_description ->> 'sdp', '') is null
      or octet_length(v_description ->> 'sdp') > 98304
    then
      raise exception 'communication_signal_description_invalid';
    end if;
    if v_paid_viewer_only
      and not public."communication_sdp_is_receive_only_internal"(
        v_description ->> 'sdp'
      )
    then
      raise exception 'paid_watch_party_viewer_only';
    end if;
    v_negotiation_id := nullif(left(btrim(coalesce(
      v_payload ->> 'negotiationId',
      ''
    )), 256), '');
    v_message := jsonb_build_object(
      'fromUserId', v_actor_user_id,
      'roomId', v_room_id,
      'targetUserId', v_target_user_id,
      'description', jsonb_build_object(
        'type', v_description ->> 'type',
        'sdp', v_description ->> 'sdp'
      )
    );
    if v_negotiation_id is not null then
      v_message := v_message || jsonb_build_object(
        'negotiationId', v_negotiation_id
      );
    end if;
  elsif v_event = 'webrtc:ice' then
    v_candidate := v_payload -> 'candidate';
    if jsonb_typeof(v_candidate) <> 'object'
      or nullif(v_candidate ->> 'candidate', '') is null
      or octet_length(v_candidate ->> 'candidate') > 8192
      or octet_length(coalesce(v_candidate ->> 'sdpMid', '')) > 256
      or (
        v_candidate ? 'sdpMLineIndex'
        and jsonb_typeof(v_candidate -> 'sdpMLineIndex')
          not in ('number', 'null')
      )
    then
      raise exception 'communication_signal_candidate_invalid';
    end if;
    v_message := jsonb_build_object(
      'fromUserId', v_actor_user_id,
      'roomId', v_room_id,
      'targetUserId', v_target_user_id,
      'candidate', jsonb_build_object(
        'candidate', v_candidate ->> 'candidate',
        'sdpMid', v_candidate -> 'sdpMid',
        'sdpMLineIndex', v_candidate -> 'sdpMLineIndex'
      )
    );
  elsif v_event = 'media:update' then
    if jsonb_typeof(v_payload -> 'cameraOn') <> 'boolean'
      or jsonb_typeof(v_payload -> 'micOn') <> 'boolean'
    then
      raise exception 'communication_signal_media_invalid';
    end if;
    if v_paid_viewer_only
      and (
        (v_payload ->> 'cameraOn')::boolean
        or (v_payload ->> 'micOn')::boolean
      )
    then
      raise exception 'paid_watch_party_viewer_only';
    end if;
    v_message := jsonb_build_object(
      'fromUserId', v_actor_user_id,
      'roomId', v_room_id,
      'cameraOn', (v_payload ->> 'cameraOn')::boolean,
      'micOn', (v_payload ->> 'micOn')::boolean
    );
  else
    if not exists (
      select 1
      from public."communication_rooms" room
      where room."room_id" = v_room_id
        and room."host_user_id" = v_actor_user_id
        and room."status" = 'active'
    ) then
      raise exception 'communication_signal_host_required';
    end if;
    v_message := jsonb_build_object(
      'fromUserId', v_actor_user_id,
      'roomId', v_room_id,
      'reason', case
        when v_payload ->> 'reason' = 'host-left' then 'host-left'
        else 'ended'
      end
    );
  end if;

  if v_event <> 'room:end' then
    v_message := v_message || jsonb_build_object('membershipGeneration', v_sender.membership_generation);
  end if;

  perform realtime."send"(
    v_message,
    v_event,
    'comm-room-' || v_room_id,
    true
  );

  return jsonb_build_object(
    'sent', true,
    'event', v_event,
    'roomId', v_room_id,
    'senderUserId', v_actor_user_id,
    'fromUserId', v_actor_user_id,
    'membershipGeneration', case when v_event <> 'room:end' then v_sender.membership_generation else null end
  );
end;
$$;
revoke all on function public.broadcast_communication_room_signal_internal(text, text, jsonb, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.broadcast_communication_room_signal(
  p_room_id text, p_event text, p_payload jsonb default '{}'::jsonb
)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select public.broadcast_communication_room_signal_internal(p_room_id, p_event, p_payload, null);
$$;
revoke all on function public.broadcast_communication_room_signal(text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.broadcast_communication_room_signal(text, text, jsonb) to authenticated;

create function public.broadcast_owned_communication_room_signal(
  p_room_id text, p_expected_membership_generation uuid,
  p_event text, p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_expected_membership_generation is null then
    raise exception 'communication_membership_identity_required';
  end if;
  if lower(btrim(coalesce(p_event, ''))) = 'room:end' then
    raise exception 'communication_signal_event_invalid';
  end if;
  return public.broadcast_communication_room_signal_internal(
    p_room_id, p_event, p_payload, p_expected_membership_generation);
end;
$$;
revoke all on function public.broadcast_owned_communication_room_signal(text, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.broadcast_owned_communication_room_signal(text, uuid, text, jsonb) to authenticated;
