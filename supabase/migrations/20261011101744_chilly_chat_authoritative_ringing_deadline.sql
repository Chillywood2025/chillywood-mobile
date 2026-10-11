-- New invitations use a server-owned 45-second ringing window. This expires
-- before the observed iOS system ringing limit; it does not infer a user action
-- from elapsed time. Existing invitations retain their immutable expires_at.
-- Delayed delivery consumes this same window and never renews it.

set check_function_bodies = false;

alter table public."chat_call_invites"
  alter column "expires_at"
  set default (timezone('utc'::text, now()) + interval '45 seconds');

create or replace function public."begin_chilly_chat_call"(
  p_thread_id uuid,
  p_communication_room_id text,
  p_call_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id text := coalesce(auth.uid()::text, '');
  v_call_type text := lower(btrim(coalesce(p_call_type, '')));
  v_room_id text := upper(btrim(coalesce(p_communication_room_id, '')));
  v_callee_user_id text;
  v_member_count integer := 0;
  v_thread public."chat_threads"%rowtype;
  v_room public."communication_rooms"%rowtype;
  v_existing public."chat_call_invites"%rowtype;
  v_established public."chat_call_invites"%rowtype;
  v_invite public."chat_call_invites"%rowtype;
  v_stale record;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_actor_user_id = '' then
    raise exception 'chat_call_authentication_required';
  end if;
  if p_thread_id is null or v_room_id = '' or v_call_type not in ('voice', 'video') then
    raise exception 'chat_call_begin_invalid_scope';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_thread_id::text, 0));

  select thread.* into v_thread
  from public."chat_threads" thread
  where thread."id" = p_thread_id
  for update;

  if v_thread."id" is null
    or v_thread."thread_kind" <> 'direct'
    or not public."can_access_chat_thread"(p_thread_id)
  then
    raise exception 'chat_call_thread_access_required';
  end if;

  select
    min(member."user_id") filter (where member."user_id" <> v_actor_user_id),
    count(*)::integer
  into v_callee_user_id, v_member_count
  from public."chat_thread_members" member
  where member."thread_id" = p_thread_id;

  if v_member_count <> 2 or coalesce(v_callee_user_id, '') = '' then
    raise exception 'chat_call_direct_participants_required';
  end if;

  select room.* into v_room
  from public."communication_rooms" room
  where room."room_id" = v_room_id
    and room."status" = 'active'
    and room."host_user_id" = v_actor_user_id
    and coalesce(
      room."last_activity_at",
      room."updated_at",
      room."created_at"
    ) >= v_now - interval '15 minutes'
  for update;

  if v_room."room_id" is null then
    raise exception 'chat_call_candidate_room_required';
  end if;

  -- A same-thread accepted invite whose room can no longer pass the exact
  -- join authority check must become durable terminal evidence before a new
  -- call is selected. This prevents a stale accepted room from winning reuse.
  for v_stale in
    select invite."id"
    from public."chat_call_invites" invite
    where invite."thread_id" = p_thread_id
      and invite."status" = 'accepted'
      and v_thread."active_communication_room_id" = invite."communication_room_id"
      and not exists (
        select 1
        from public."communication_rooms" active_room
        where active_room."room_id" = invite."communication_room_id"
          and active_room."status" = 'active'
          and coalesce(
            active_room."last_activity_at",
            active_room."updated_at",
            active_room."created_at"
          ) >= v_now - interval '15 minutes'
      )
    order by invite."accepted_at", invite."created_at", invite."id"
    for update
  loop
    perform public."transition_chilly_chat_call_invite"(
      v_stale."id",
      v_actor_user_id::uuid,
      'ended',
      null
    );
  end loop;

  -- Terminal cleanup runs from the invite transition trigger. Refresh the
  -- locked projection before selecting a same-thread winner.
  select thread.* into v_thread
  from public."chat_threads" thread
  where thread."id" = p_thread_id
  for update;

  select invite.* into v_existing
  from public."chat_call_invites" invite
  where invite."thread_id" = p_thread_id
    and invite."status" in ('ringing', 'accepted')
    and (
      (invite."status" = 'ringing' and invite."expires_at" > v_now)
      or (
        invite."status" = 'accepted'
        and v_thread."active_communication_room_id" = invite."communication_room_id"
        and exists (
          select 1
          from public."communication_rooms" active_room
          where active_room."room_id" = invite."communication_room_id"
            and active_room."status" = 'active'
            and coalesce(
              active_room."last_activity_at",
              active_room."updated_at",
              active_room."created_at"
            ) >= v_now - interval '15 minutes'
        )
      )
    )
  order by invite."created_at", invite."id"
  limit 1
  for update;

  if v_existing."id" is not null then
    update public."communication_rooms"
    set
      "status" = 'ended',
      "updated_at" = v_now,
      "last_activity_at" = v_now
    where "room_id" = v_room_id
      and "room_id" is distinct from v_existing."communication_room_id"
      and "host_user_id" = v_actor_user_id
      and "status" = 'active';

    return jsonb_build_object(
      'created', false,
      'role', case
        when v_existing."caller_user_id" = v_actor_user_id then 'caller'
        when v_existing."callee_user_id" = v_actor_user_id then 'callee'
        else 'none'
      end,
      'invite', to_jsonb(v_existing)
    );
  end if;

  -- Serialize starts aimed at the same callee even when historical duplicate
  -- direct threads exist. A same-thread active invite has already won above.
  perform pg_advisory_xact_lock(
    hashtextextended('chilly-chat-callee:' || v_callee_user_id, 0)
  );

  select invite.* into v_established
  from public."chat_call_invites" invite
  where invite."thread_id" <> p_thread_id
    and invite."status" = 'accepted'
    and v_callee_user_id in (invite."caller_user_id", invite."callee_user_id")
    and exists (
      select 1
      from public."chat_threads" established_thread
      where established_thread."id" = invite."thread_id"
        and established_thread."active_communication_room_id" =
          invite."communication_room_id"
    )
    and exists (
      select 1
      from public."communication_rooms" active_room
      where active_room."room_id" = invite."communication_room_id"
        and active_room."status" = 'active'
        and coalesce(
          active_room."last_activity_at",
          active_room."updated_at",
          active_room."created_at"
        ) >= v_now - interval '15 minutes'
    )
  order by invite."accepted_at" desc nulls last, invite."created_at" desc, invite."id"
  limit 1
  for update;

  if v_established."id" is not null then
    insert into public."chat_call_invites" (
      "thread_id",
      "communication_room_id",
      "caller_user_id",
      "callee_user_id",
      "call_type",
      "status",
      "created_at",
      "expires_at"
    ) values (
      p_thread_id,
      v_room_id,
      v_actor_user_id,
      v_callee_user_id,
      v_call_type,
      'ringing',
      v_now,
      v_now + interval '45 seconds'
    ) returning * into v_invite;

    insert into public."chat_call_events" (
      "thread_id",
      "call_invite_id",
      "actor_user_id",
      "call_type",
      "event_type",
      "created_at"
    ) values (
      p_thread_id,
      v_invite."id",
      v_actor_user_id,
      v_call_type,
      'started',
      v_now
    );

    perform public."transition_chilly_chat_call_invite"(
      v_invite."id",
      v_callee_user_id::uuid,
      'busy',
      null
    );

    update public."chat_call_transition_deliveries"
    set
      "delivery_status" = 'skipped',
      "delivery_result" = jsonb_build_object(
        'reason', 'non_incoming_uses_authoritative_state',
        'status', 'skipped'
      ),
      "completed_at" = v_now
    where "transition_key" = v_invite."id"::text || ':busy'
      and "delivery_status" = 'pending';

    select invite.* into v_invite
    from public."chat_call_invites" invite
    where invite."id" = v_invite."id";

    return jsonb_build_object(
      'created', false,
      'role', 'caller',
      'invite', to_jsonb(v_invite)
    );
  end if;

  for v_stale in
    select invite."id", invite."caller_user_id", invite."communication_room_id"
    from public."chat_call_invites" invite
    where invite."thread_id" = p_thread_id
      and invite."status" = 'ringing'
      and invite."expires_at" <= v_now
    order by invite."expires_at", invite."id"
    for update
  loop
    perform public."transition_chilly_chat_call_invite"(
      v_stale."id",
      v_stale."caller_user_id"::uuid,
      'missed',
      null
    );
    update public."communication_rooms"
    set
      "status" = 'ended',
      "updated_at" = v_now,
      "last_activity_at" = v_now
    where "room_id" = v_stale."communication_room_id"
      and "status" = 'active';
  end loop;

  insert into public."chat_call_invites" (
    "thread_id",
    "communication_room_id",
    "caller_user_id",
    "callee_user_id",
    "call_type",
    "status",
    "created_at",
    "expires_at"
  ) values (
    p_thread_id,
    v_room_id,
    v_actor_user_id,
    v_callee_user_id,
    v_call_type,
    'ringing',
    v_now,
    v_now + interval '45 seconds'
  ) returning * into v_invite;

  insert into public."chat_call_events" (
    "thread_id",
    "call_invite_id",
    "actor_user_id",
    "call_type",
    "event_type",
    "created_at"
  ) values (
    p_thread_id,
    v_invite."id",
    v_actor_user_id,
    v_call_type,
    'started',
    v_now
  );

  update public."chat_threads"
  set
    "active_communication_room_id" = v_room_id,
    "active_call_type" = v_call_type,
    "updated_at" = v_now
  where "id" = p_thread_id;

  return jsonb_build_object(
    'created', true,
    'role', 'caller',
    'invite', to_jsonb(v_invite)
  );
end;
$$;

revoke all on function public."begin_chilly_chat_call"(uuid, text, text)
  from public, anon;
grant execute on function public."begin_chilly_chat_call"(uuid, text, text)
  to authenticated, service_role;

comment on function public."begin_chilly_chat_call"(uuid, text, text) is
  'Atomically begins a direct Chi''lly Chat call with a 45-second ringing authority window shared by clients and native providers while preserving exact accepted-room and terminal-cleanup authority.';

create or replace function public."transition_chilly_chat_call_invite"(
  p_invite_id uuid,
  p_actor_user_id uuid,
  p_target_status text,
  p_duration_seconds integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public."chat_call_invites"%rowtype;
  v_delivery public."chat_call_transition_deliveries"%rowtype;
  v_target_status text := lower(btrim(coalesce(p_target_status, '')));
  v_event_type text;
  v_dispatch_action text;
  v_transition_key text;
  v_now timestamptz := timezone('utc'::text, now());
  v_idempotent boolean := false;
begin
  if p_invite_id is null or p_actor_user_id is null then
    raise exception 'transition_invalid_scope';
  end if;
  if v_target_status not in ('accepted', 'declined', 'missed', 'canceled', 'ended', 'busy') then
    raise exception 'transition_invalid_target_status';
  end if;
  if p_duration_seconds is not null and p_duration_seconds < 0 then
    raise exception 'transition_invalid_duration';
  end if;

  select invite.* into v_invite
  from public."chat_call_invites" invite
  where invite."id" = p_invite_id
  for update;

  if v_invite."id" is null then
    raise exception 'transition_invite_not_found';
  end if;
  if p_actor_user_id::text not in (v_invite."caller_user_id", v_invite."callee_user_id") then
    raise exception 'transition_not_call_participant';
  end if;
  if not exists (
    select 1
    from public."chat_thread_members" member
    where member."thread_id" = v_invite."thread_id"
      and member."user_id" = v_invite."caller_user_id"
  ) or not exists (
    select 1
    from public."chat_thread_members" member
    where member."thread_id" = v_invite."thread_id"
      and member."user_id" = v_invite."callee_user_id"
  ) then
    raise exception 'transition_thread_membership_required';
  end if;

  -- Decide expiry after acquiring the invite lock. A request queued before the
  -- deadline cannot use a stale transaction-start timestamp after the deadline.
  v_now := clock_timestamp();
  -- CallKit also emits an End action for system ringing expiry. Once the
  -- authoritative deadline has elapsed, an exact callee's unanswered decline
  -- request settles as missed. Preserve the original callee check before
  -- normalization; a caller cannot disguise a forbidden decline as timeout.
  -- Replays after that normalization reuse the same missed delivery key.
  if v_target_status = 'declined' then
    if p_actor_user_id::text <> v_invite."callee_user_id" then
      raise exception 'transition_decline_forbidden';
    end if;
    if v_invite."status" in ('ringing', 'missed') and v_invite."expires_at" <= v_now then
      v_target_status := 'missed';
    end if;
  end if;

  v_transition_key := p_invite_id::text || ':' || v_target_status;
  if v_invite."status" = v_target_status then
    v_idempotent := true;
  elsif v_target_status = 'accepted' then
    if v_invite."status" <> 'ringing'
      or p_actor_user_id::text <> v_invite."callee_user_id"
      or v_invite."expires_at" <= v_now
    then
      raise exception 'transition_accept_forbidden';
    end if;
  elsif v_target_status = 'declined' then
    if v_invite."status" <> 'ringing' or p_actor_user_id::text <> v_invite."callee_user_id" then
      raise exception 'transition_decline_forbidden';
    end if;
  elsif v_target_status = 'canceled' then
    if v_invite."status" <> 'ringing' or p_actor_user_id::text <> v_invite."caller_user_id" then
      raise exception 'transition_cancel_forbidden';
    end if;
  elsif v_target_status = 'missed' then
    if v_invite."status" <> 'ringing' or v_invite."expires_at" > v_now then
      raise exception 'transition_timeout_forbidden';
    end if;
  elsif v_target_status = 'busy' then
    if v_invite."status" <> 'ringing' or p_actor_user_id::text <> v_invite."callee_user_id" then
      raise exception 'transition_busy_forbidden';
    end if;
  elsif v_target_status = 'ended' then
    if v_invite."status" <> 'accepted' then
      raise exception 'transition_end_forbidden';
    end if;
  end if;

  if not v_idempotent then
    update public."chat_call_invites"
    set
      "status" = v_target_status,
      "accepted_at" = case when v_target_status = 'accepted' then v_now else "accepted_at" end,
      "ended_at" = case when v_target_status = 'ended' then v_now else "ended_at" end
    where "id" = p_invite_id
    returning * into v_invite;

    v_event_type := case v_target_status
      when 'accepted' then 'accepted'
      when 'declined' then 'declined'
      when 'missed' then 'missed'
      when 'canceled' then 'canceled'
      when 'ended' then 'ended'
      when 'busy' then 'busy'
    end;
    insert into public."chat_call_events" (
      "thread_id",
      "call_invite_id",
      "actor_user_id",
      "call_type",
      "event_type",
      "duration_seconds",
      "created_at"
    ) values (
      v_invite."thread_id",
      v_invite."id",
      p_actor_user_id::text,
      v_invite."call_type",
      v_event_type,
      p_duration_seconds,
      v_now
    );
  end if;

  v_dispatch_action := case v_target_status
    when 'declined' then 'declined'
    when 'canceled' then 'cancel'
    when 'missed' then 'timeout'
    when 'busy' then 'timeout'
    when 'ended' then 'end'
    else null
  end;

  insert into public."chat_call_transition_deliveries" (
    "transition_key",
    "call_invite_id",
    "actor_user_id",
    "target_status",
    "dispatch_action",
    "delivery_status",
    "delivery_result",
    "completed_at"
  ) values (
    v_transition_key,
    v_invite."id",
    p_actor_user_id,
    v_target_status,
    v_dispatch_action,
    case when v_dispatch_action is null then 'skipped' else 'pending' end,
    case when v_dispatch_action is null
      then jsonb_build_object('reason', 'no_remote_terminal_action')
      else '{}'::jsonb
    end,
    case when v_dispatch_action is null then v_now else null end
  )
  on conflict ("transition_key") do update
  set "updated_at" = public."chat_call_transition_deliveries"."updated_at"
  returning * into v_delivery;

  return jsonb_build_object(
    'idempotent', v_idempotent,
    'invite', jsonb_build_object(
      'id', v_invite."id",
      'threadId', v_invite."thread_id",
      'communicationRoomId', v_invite."communication_room_id",
      'callerUserId', v_invite."caller_user_id",
      'calleeUserId', v_invite."callee_user_id",
      'callType', v_invite."call_type",
      'status', v_invite."status",
      'createdAt', v_invite."created_at",
      'expiresAt', v_invite."expires_at",
      'acceptedAt', v_invite."accepted_at",
      'endedAt', v_invite."ended_at"
    ),
    'delivery', jsonb_build_object(
      'id', v_delivery."id",
      'action', v_delivery."dispatch_action",
      'status', v_delivery."delivery_status",
      'attemptCount', v_delivery."attempt_count",
      'result', v_delivery."delivery_result"
    )
  );
end;
$$;

revoke all on function public."transition_chilly_chat_call_invite"(uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public."transition_chilly_chat_call_invite"(uuid, uuid, text, integer)
  to service_role;
