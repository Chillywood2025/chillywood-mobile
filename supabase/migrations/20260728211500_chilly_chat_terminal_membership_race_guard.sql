-- Prevent a stale client media-state write from reactivating membership after
-- the authoritative call transition has ended its communication room.
--
-- The room row is locked before membership rows in both paths. This preserves
-- a single lock order when an end transition races a background/foreground
-- heartbeat: either the client commits first and terminal cleanup wins, or the
-- terminal transition commits first and the stale client write is forced left.

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

  if exists (
    select 1
    from public."chat_call_invites" active_invite
    where active_invite."communication_room_id" = new."communication_room_id"
      and active_invite."id" <> new."id"
      and active_invite."status" in ('ringing', 'accepted')
  ) then
    return new;
  end if;

  -- Lock and end the room first. Membership writers take a matching room lock
  -- before they can publish active media state.
  update public."communication_rooms"
  set
    "status" = 'ended',
    "updated_at" = v_now,
    "last_activity_at" = v_now
  where "room_id" = new."communication_room_id"
    and "status" = 'active';

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

create or replace function public."prevent_ended_communication_room_membership_reactivation"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc'::text, now());
  v_room_status text;
begin
  if new."membership_state" not in ('active', 'reconnecting')
    and not new."camera_enabled"
    and not new."mic_enabled"
  then
    return new;
  end if;

  select room."status"
  into v_room_status
  from public."communication_rooms" room
  where room."room_id" = new."room_id"
  for key share;

  if v_room_status = 'ended' then
    new."membership_state" := 'left';
    new."camera_enabled" := false;
    new."mic_enabled" := false;
    new."last_seen_at" := v_now;
    new."left_at" := coalesce(new."left_at", v_now);
    new."updated_at" := v_now;
  end if;

  return new;
end;
$$;

revoke all on function public."prevent_ended_communication_room_membership_reactivation"()
  from public, anon, authenticated;

drop trigger if exists "prevent_ended_communication_room_membership_reactivation"
  on public."communication_room_memberships";
create trigger "prevent_ended_communication_room_membership_reactivation"
before insert or update of
  "membership_state",
  "camera_enabled",
  "mic_enabled"
on public."communication_room_memberships"
for each row
execute function public."prevent_ended_communication_room_membership_reactivation"();

-- Forward-repair terminal rooms that were exposed to the pre-guard race.
update public."communication_room_memberships" membership
set
  "membership_state" = 'left',
  "camera_enabled" = false,
  "mic_enabled" = false,
  "last_seen_at" = timezone('utc'::text, now()),
  "left_at" = coalesce(membership."left_at", timezone('utc'::text, now())),
  "updated_at" = timezone('utc'::text, now())
where (
    membership."membership_state" in ('active', 'reconnecting')
    or membership."camera_enabled"
    or membership."mic_enabled"
  )
  and exists (
    select 1
    from public."communication_rooms" room
    where room."room_id" = membership."room_id"
      and room."status" = 'ended'
  );

comment on function public."prevent_ended_communication_room_membership_reactivation"() is
  'Fail-closed guard preventing stale client writes from publishing active membership or media state in an ended communication room.';
