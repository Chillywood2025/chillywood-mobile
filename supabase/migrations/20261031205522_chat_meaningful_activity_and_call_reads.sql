-- Meaningful conversation activity, not generic row updated_at, drives inbox
-- ranking/preview. Message unread_count remains independent from call events.
alter table public.chat_threads
  add column activity_admission_watermark timestamptz;
alter table public.chat_thread_members
  add column last_call_read_at timestamptz;
-- Initialize the new field as a schema transformation, not an application
-- membership write. Retained restricted accounts must keep their exact read
-- evidence too; their existing write guards remain armed and unchanged.
alter table public.chat_thread_members
  alter column last_call_read_at type timestamptz using last_read_at;

-- A row UPDATE would invoke updated_at triggers and manufacture activity.
-- USING cannot contain subqueries; this transaction-local, invoker-only helper
-- derives the same exact historical maximum without changing existing fields.
-- Both rewrites take ACCESS EXCLUSIVE locks; the migration runner must retain
-- its bounded lock/statement deadlines and transactional rollback.
create function pg_temp.initialize_chat_activity_watermark(p_thread_id uuid)
returns timestamptz language sql stable set search_path='' as $$
  select greatest(
    (select max(created_at) from public.chat_messages where thread_id=p_thread_id),
    (select max(created_at) from public.chat_call_events where thread_id=p_thread_id),
    '1970-01-01'::timestamptz)
$$;
alter table public.chat_threads
  alter column activity_admission_watermark type timestamptz
  using pg_temp.initialize_chat_activity_watermark(id);
drop function pg_temp.initialize_chat_activity_watermark(uuid);

-- Legacy direct inserts remain supported. Serialize admission before stamping
-- either stream so a blocked insert cannot commit behind a later read boundary.
create function private.stamp_client_chat_activity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.id is distinct from old.id or new.thread_id is distinct from old.thread_id then
      raise exception 'chat_activity_identity_immutable'; end if;
    new.created_at:=old.created_at;
    return new;
  end if;
  perform 1 from public.chat_threads where id=new.thread_id for update;
  if tg_op='INSERT' then new.created_at:=greatest(clock_timestamp(),
    (select greatest((select max(m.created_at) from public.chat_messages m where m.thread_id=new.thread_id),
      (select max(e.created_at) from public.chat_call_events e where e.thread_id=new.thread_id),
      (select t.activity_admission_watermark from public.chat_threads t where t.id=new.thread_id))+interval '1 microsecond'));
    update public.chat_threads set activity_admission_watermark=new.created_at where id=new.thread_id;
  else new.created_at:=old.created_at; end if;
  return new;
end $$;
revoke all on function private.stamp_client_chat_activity() from public,anon,authenticated,service_role;
create trigger stamp_client_chat_message before insert or update on public.chat_messages
  for each row execute function private.stamp_client_chat_activity();
create trigger stamp_client_chat_call_event before insert or update on public.chat_call_events
  for each row execute function private.stamp_client_chat_activity();

-- Read-derived summary: RLS on every underlying table is evaluated as the
-- querying user. No UPDATE/DELETE source trigger writes back to its parent.
create view public.chat_thread_activity with (security_invoker=true) as
select t.id,t.participant_pair_key,t.created_by,t.created_at,t.updated_at,
  t.active_communication_room_id,t.active_call_type,
  message_head.created_at last_message_at,message_head.preview last_message_preview,
  coalesce(activity.created_at,t.created_at) last_activity_at,
  activity.source_key last_activity_source_key,activity.kind last_activity_kind,
  activity.preview last_activity_preview,
  (select coalesce(jsonb_agg(to_jsonb(member)||jsonb_build_object(
    'unread_count',(select count(*) from public.chat_messages m where m.thread_id=t.id
      and m.sender_user_id<>member.user_id and (member.last_read_at is null or m.created_at>member.last_read_at)),
    'unread_call_count',(select count(*) from public.chat_call_events e where e.thread_id=t.id
      and e.actor_user_id<>member.user_id and (member.last_call_read_at is null or e.created_at>member.last_call_read_at))
  ) order by member.user_id),'[]'::jsonb) from public.chat_thread_members member where member.thread_id=t.id) members
from public.chat_threads t
left join lateral (
  select m.created_at,m.id,case when m.moderation_status='removed' then 'Message removed after review'
    when m.moderation_status='hidden' then 'Message hidden for review' else left(m.body,160) end preview
  from public.chat_messages m where m.thread_id=t.id order by m.created_at desc nulls last,m.id desc limit 1
) message_head on true
left join lateral (
  select * from (
    select message_head.created_at,'message:'||message_head.id::text source_key,'message'::text kind,message_head.preview where message_head.id is not null
    union all
    (select e.created_at,'call:'||e.id::text,'call'::text,
      (case when e.call_type='video' then 'Video' else 'Voice' end)||' call '||
      case e.event_type when 'started' then 'started' when 'accepted' then 'accepted'
        when 'declined' then 'declined' when 'missed' then 'missed'
        when 'canceled' then 'canceled' when 'busy' then 'busy' else 'ended' end
     from public.chat_call_events e where e.thread_id=t.id order by e.created_at desc nulls last,e.id desc limit 1)
  ) candidates order by created_at desc nulls last,source_key desc limit 1
) activity on true;
revoke all on public.chat_thread_activity from public,anon,authenticated,service_role;
grant select on public.chat_thread_activity to authenticated,service_role;

-- Preserve old-client message counters without treating sending as reading.
-- INSERT already owns the parent admission lock. UPDATE/DELETE use read-derived
-- truth for new clients rather than introducing source-row -> parent locks.
create or replace function public.sync_chat_thread_after_message_insert()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.chat_threads set last_message_at=new.created_at,
    last_message_preview=case when new.moderation_status='removed' then 'Message removed after review'
      when new.moderation_status='hidden' then 'Message hidden for review' else left(new.body,160) end,
    updated_at=clock_timestamp() where id=new.thread_id;
  update public.chat_thread_members set unread_count=unread_count+1
    where thread_id=new.thread_id and user_id<>new.sender_user_id;
  return new;
end $$;

-- Bound read acknowledgement to content the mounted screen actually received.
create function public.read_chilly_chat_activity_cut(p_thread_id uuid)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare cut timestamptz;
begin
  if not public.whole_app_exact_current_session_authority_internal() or not public.can_access_chat_thread(p_thread_id) then
    raise exception 'chat_read_current_session_required'; end if;
  perform 1 from public.chat_threads where id=p_thread_id for update;
  if not public.whole_app_exact_current_session_authority_internal() then raise exception 'chat_read_current_session_required'; end if;
  select greatest((select max(created_at) from public.chat_messages where thread_id=p_thread_id),
    (select max(created_at) from public.chat_call_events where thread_id=p_thread_id),
    (select activity_admission_watermark from public.chat_threads where id=p_thread_id),'1970-01-01'::timestamptz) into cut;
  return cut;
end $$;
revoke all on function public.read_chilly_chat_activity_cut(uuid) from public,anon,service_role;
grant execute on function public.read_chilly_chat_activity_cut(uuid) to authenticated;

-- Sorting/listing never invokes this function. Monotonic recipient watermark
-- and exact session authority prevent stale reads from acknowledging new data.
create function public.mark_chilly_chat_thread_read(p_thread_id uuid,p_read_through timestamptz,p_call_read_through timestamptz)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare member public.chat_thread_members%rowtype; through_at timestamptz; call_through_at timestamptz;
begin
  if not public.whole_app_exact_current_session_authority_internal() then
    raise exception 'chat_read_current_session_required'; end if;
  if p_thread_id is null or (p_read_through is null and p_call_read_through is null) or not public.can_access_chat_thread(p_thread_id) then
    raise exception 'chat_read_scope_required'; end if;
  perform 1 from public.chat_threads where id=p_thread_id for update;
  select * into member from public.chat_thread_members
    where thread_id=p_thread_id and user_id=auth.uid()::text for update;
  if not found or not public.whole_app_exact_current_session_authority_internal() then
    raise exception 'chat_read_current_session_required'; end if;
  through_at:=greatest(member.last_read_at,case when p_read_through is not null then
    (select least(p_read_through,max(created_at)) from public.chat_messages where thread_id=p_thread_id having max(created_at) is not null) end);
  call_through_at:=greatest(member.last_call_read_at,case when p_call_read_through is not null then
    (select least(p_call_read_through,max(created_at)) from public.chat_call_events where thread_id=p_thread_id having max(created_at) is not null) end);
  update public.chat_thread_members set last_read_at=through_at,last_call_read_at=call_through_at,
    unread_count=(select count(*)::integer from public.chat_messages m where m.thread_id=p_thread_id
      and m.sender_user_id<>auth.uid()::text and (through_at is null or m.created_at>through_at))
    where thread_id=p_thread_id and user_id=auth.uid()::text;
  return through_at;
end $$;
revoke all on function public.mark_chilly_chat_thread_read(uuid,timestamptz,timestamptz) from public,anon,service_role;
grant execute on function public.mark_chilly_chat_thread_read(uuid,timestamptz,timestamptz) to authenticated;

-- No guessed timestamps, fake unread, metadata bump or provider mutation.
create or replace function public."expire_stale_chilly_chat_call_invites"(
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite record;
  v_result jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 10);
  v_expired_count integer := 0;
  v_delivery_created_count integer := 0;
  v_room_closed_count integer := 0;
  v_thread_cleared_count integer := 0;
  v_now timestamptz := timezone('utc'::text, now());
begin
  for v_invite in
    select
      invite."id",
      invite."caller_user_id",
      invite."thread_id",
      invite."communication_room_id"
    from public."chat_call_invites" invite
    join public.chat_threads expiry_thread on expiry_thread.id=invite.thread_id
    where invite."status" = 'ringing'
      and invite."expires_at" <= v_now
    order by invite."expires_at", invite."id"
    for update of expiry_thread skip locked
    limit v_limit
  loop
    -- Skip a busy thread before ever locking its invite; same order as Start.
    perform 1 from public.chat_threads where id=v_invite.thread_id for update skip locked;
    if not found then continue; end if;
    perform 1 from public.chat_call_invites where id=v_invite.id
      and status='ringing' and expires_at<=clock_timestamp() for update skip locked;
    if not found then continue; end if;
    v_result := public."transition_chilly_chat_call_invite"(
      v_invite."id",
      v_invite."caller_user_id"::uuid,
      'missed',
      null
    );
    v_expired_count := v_expired_count + 1;
    if coalesce(v_result #>> '{delivery,status}', '') = 'pending' then
      v_delivery_created_count := v_delivery_created_count + 1;
    end if;

    if v_invite."communication_room_id" is not null then
      update public."communication_rooms"
      set
        "status" = 'ended',
        "updated_at" = v_now,
        "last_activity_at" = v_now
      where "room_id" = v_invite."communication_room_id"
        and "status" = 'active';
      v_room_closed_count := v_room_closed_count + case when found then 1 else 0 end;

      update public."chat_threads"
      set
        "active_communication_room_id" = null,
        "active_call_type" = null,
        "updated_at" = v_now
      where "id" = v_invite."thread_id"
        and "active_communication_room_id" = v_invite."communication_room_id";
      v_thread_cleared_count := v_thread_cleared_count + case when found then 1 else 0 end;
    end if;
  end loop;

  return jsonb_build_object(
    'expiredCount', v_expired_count,
    'deliveryCreatedCount', v_delivery_created_count,
    'roomClosedCount', v_room_closed_count,
    'threadClearedCount', v_thread_cleared_count
  );
end;
$$;
-- Preserve transition semantics while taking the thread lock before the invite.
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

  -- All admissions and transitions use thread -> invite -> member ordering.
  perform 1 from public.chat_threads thread
  where thread.id=(select i.thread_id from public.chat_call_invites i where i.id=p_invite_id)
  for update;

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
-- Existing column-specific UPDATE grants remain unchanged. Clients cannot
-- write the admission watermark, call read watermark, or read-derived view.
