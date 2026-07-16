-- Durable, server-owned Chi'lly Chat call status transitions.
--
-- The database owns the invite/event transaction and creates a durable remote
-- delivery record in the same transaction. The authenticated Edge operation
-- completes or retries that record before returning to the mobile client.

set check_function_bodies = false;

create table if not exists public."chat_call_transition_deliveries" (
  "id" uuid primary key default gen_random_uuid(),
  "transition_key" text not null,
  "call_invite_id" uuid not null references public."chat_call_invites"("id") on delete cascade,
  "actor_user_id" uuid not null references auth.users("id") on delete restrict,
  "target_status" text not null,
  "dispatch_action" text,
  "delivery_status" text not null default 'pending',
  "delivery_result" jsonb not null default '{}'::jsonb,
  "attempt_count" integer not null default 0,
  "last_attempt_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz not null default timezone('utc'::text, now()),
  "updated_at" timestamptz not null default timezone('utc'::text, now()),
  constraint "chat_call_transition_deliveries_transition_key_unique" unique ("transition_key"),
  constraint "chat_call_transition_deliveries_target_status_check"
    check ("target_status" in ('accepted', 'declined', 'missed', 'canceled', 'ended', 'busy')),
  constraint "chat_call_transition_deliveries_action_check"
    check ("dispatch_action" is null or "dispatch_action" in ('cancel', 'declined', 'end', 'timeout')),
  constraint "chat_call_transition_deliveries_status_check"
    check ("delivery_status" in ('pending', 'dispatching', 'sent', 'created', 'skipped', 'failed', 'blocked', 'disabled')),
  constraint "chat_call_transition_deliveries_attempt_count_check"
    check ("attempt_count" between 0 and 10),
  constraint "chat_call_transition_deliveries_result_safe_check"
    check ("delivery_result"::text !~* '(secret|token|password|service_role|private_key|webhook_secret|api_key|authorization|raw_payload)')
);

create index if not exists "chat_call_transition_deliveries_invite_idx"
  on public."chat_call_transition_deliveries" ("call_invite_id", "created_at" desc);

create index if not exists "chat_call_transition_deliveries_retry_idx"
  on public."chat_call_transition_deliveries" ("delivery_status", "updated_at")
  where "delivery_status" in ('pending', 'dispatching', 'failed');

drop trigger if exists "chat_call_transition_deliveries_touch_updated_at"
  on public."chat_call_transition_deliveries";
create trigger "chat_call_transition_deliveries_touch_updated_at"
before update on public."chat_call_transition_deliveries"
for each row execute function public."touch_notification_updated_at"();

alter table public."chat_call_transition_deliveries" enable row level security;
revoke all on table public."chat_call_transition_deliveries" from public, anon, authenticated;
grant all on table public."chat_call_transition_deliveries" to postgres, service_role;

-- Status writes are now mediated by the server operation. Clients retain
-- insert/select for invite creation and realtime state, but no direct update.
revoke update on table public."chat_call_invites" from authenticated;

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

create or replace function public."claim_chilly_chat_call_transition_delivery"(
  p_delivery_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public."chat_call_transition_deliveries"%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
begin
  update public."chat_call_transition_deliveries"
  set
    "delivery_status" = 'dispatching',
    "attempt_count" = "attempt_count" + 1,
    "last_attempt_at" = v_now
  where "id" = p_delivery_id
    and "attempt_count" < 10
    and (
      "delivery_status" in ('pending', 'failed')
      or (
        "delivery_status" = 'dispatching'
        and coalesce("last_attempt_at", "updated_at") <= v_now - interval '15 seconds'
      )
    )
  returning * into v_delivery;

  if v_delivery."id" is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', v_delivery."id",
    'action', v_delivery."dispatch_action",
    'status', v_delivery."delivery_status",
    'attemptCount', v_delivery."attempt_count"
  );
end;
$$;

revoke all on function public."claim_chilly_chat_call_transition_delivery"(uuid)
  from public, anon, authenticated;
grant execute on function public."claim_chilly_chat_call_transition_delivery"(uuid)
  to service_role;

comment on table public."chat_call_transition_deliveries" is
  'Durable, sanitized terminal call-delivery state. Server-owned; contains no push token or credential.';
comment on function public."transition_chilly_chat_call_invite"(uuid, uuid, text, integer) is
  'Atomically validates a participant call transition, updates the invite, inserts one call event, and creates an idempotent remote-delivery record.';
comment on function public."claim_chilly_chat_call_transition_delivery"(uuid) is
  'Claims one pending or retryable terminal call delivery with a short crash-recovery lease.';
