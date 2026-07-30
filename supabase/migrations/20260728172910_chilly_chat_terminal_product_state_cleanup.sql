-- Keep durable Chi'lly Chat call product state consistent whenever a call
-- reaches a terminal status. This runs in the same transaction as the existing
-- server-owned invite transition, so client timeout and the autonomous expiry
-- worker cannot race and leave an active communication room behind.

set check_function_bodies = false;

create or replace function public."cleanup_terminal_chilly_chat_call_product_state"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc'::text, now());
begin
  if new."status" not in ('declined', 'missed', 'canceled', 'ended', 'busy')
    or new."status" is not distinct from old."status"
    or new."communication_room_id" is null
  then
    return new;
  end if;

  -- Fail closed if another non-terminal invite explicitly owns the same room.
  if exists (
    select 1
    from public."chat_call_invites" active_invite
    where active_invite."communication_room_id" = new."communication_room_id"
      and active_invite."id" <> new."id"
      and active_invite."status" in ('ringing', 'accepted')
  ) then
    return new;
  end if;

  update public."communication_room_memberships"
  set
    "membership_state" = 'left',
    "camera_enabled" = false,
    "mic_enabled" = false,
    "last_seen_at" = v_now,
    "left_at" = coalesce("left_at", v_now),
    "updated_at" = v_now
  where "room_id" = new."communication_room_id"
    and "membership_state" in ('active', 'reconnecting');

  update public."communication_rooms"
  set
    "status" = 'ended',
    "updated_at" = v_now,
    "last_activity_at" = v_now
  where "room_id" = new."communication_room_id"
    and "status" = 'active';

  update public."chat_threads"
  set
    "active_communication_room_id" = null,
    "active_call_type" = null,
    "updated_at" = v_now
  where "id" = new."thread_id"
    and "active_communication_room_id" = new."communication_room_id";

  return new;
end;
$$;

revoke all on function public."cleanup_terminal_chilly_chat_call_product_state"()
  from public, anon, authenticated;

drop trigger if exists "cleanup_terminal_chilly_chat_call_product_state"
  on public."chat_call_invites";
create trigger "cleanup_terminal_chilly_chat_call_product_state"
after update of "status" on public."chat_call_invites"
for each row
execute function public."cleanup_terminal_chilly_chat_call_product_state"();

comment on function public."cleanup_terminal_chilly_chat_call_product_state"() is
  'Atomically closes exact communication-room, membership, and thread state after a durable terminal Chi''lly Chat call transition.';

-- Repair only orphaned terminal-call rooms. A room still owned by a ringing or
-- accepted invite remains untouched.
update public."communication_room_memberships" membership
set
  "membership_state" = 'left',
  "camera_enabled" = false,
  "mic_enabled" = false,
  "last_seen_at" = timezone('utc'::text, now()),
  "left_at" = coalesce(membership."left_at", timezone('utc'::text, now())),
  "updated_at" = timezone('utc'::text, now())
where membership."membership_state" in ('active', 'reconnecting')
  and exists (
    select 1
    from public."chat_call_invites" terminal_invite
    where terminal_invite."communication_room_id" = membership."room_id"
      and terminal_invite."status" in ('declined', 'missed', 'canceled', 'ended', 'busy')
  )
  and not exists (
    select 1
    from public."chat_call_invites" active_invite
    where active_invite."communication_room_id" = membership."room_id"
      and active_invite."status" in ('ringing', 'accepted')
  );

update public."communication_rooms" room
set
  "status" = 'ended',
  "updated_at" = timezone('utc'::text, now()),
  "last_activity_at" = timezone('utc'::text, now())
where room."status" = 'active'
  and exists (
    select 1
    from public."chat_call_invites" terminal_invite
    where terminal_invite."communication_room_id" = room."room_id"
      and terminal_invite."status" in ('declined', 'missed', 'canceled', 'ended', 'busy')
  )
  and not exists (
    select 1
    from public."chat_call_invites" active_invite
    where active_invite."communication_room_id" = room."room_id"
      and active_invite."status" in ('ringing', 'accepted')
  );

update public."chat_threads" thread
set
  "active_communication_room_id" = null,
  "active_call_type" = null,
  "updated_at" = timezone('utc'::text, now())
where thread."active_communication_room_id" is not null
  and exists (
    select 1
    from public."chat_call_invites" terminal_invite
    where terminal_invite."thread_id" = thread."id"
      and terminal_invite."communication_room_id" = thread."active_communication_room_id"
      and terminal_invite."status" in ('declined', 'missed', 'canceled', 'ended', 'busy')
  )
  and not exists (
    select 1
    from public."chat_call_invites" active_invite
    where active_invite."communication_room_id" = thread."active_communication_room_id"
      and active_invite."status" in ('ringing', 'accepted')
  );
