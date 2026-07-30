-- Require an accepted Chi'lly Chat room to remain linked as the exact
-- authoritative room on its thread before it can win same-thread reuse or
-- produce a different-thread busy result. Historical rooms left active by
-- pre-cleanup clients are not current calls and must not block new invites.

set check_function_bodies = false;
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
  for update;

  if v_room."room_id" is null then
    raise exception 'chat_call_candidate_room_required';
  end if;

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

comment on function public."begin_chilly_chat_call"(uuid, text, text) is
  'Atomically selects one same-thread call and rejects a different-thread overlap as busy only when the accepted room remains authoritative on its thread; stale historical active-room rows cannot create false busy results.';

revoke all on function public."begin_chilly_chat_call"(uuid, text, text)
  from public, anon;
grant execute on function public."begin_chilly_chat_call"(uuid, text, text)
  to authenticated, service_role;
