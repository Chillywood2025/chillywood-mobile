-- Reject a stale client cleanup that races a newer ringing or accepted call.
--
-- Terminal invite transitions remain the authority for clearing thread call
-- linkage. Their cleanup trigger first moves the invite out of the active
-- states, so this guard does not interfere with legitimate terminal cleanup.

set check_function_bodies = false;

create or replace function public."prevent_active_chilly_chat_thread_call_clear"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old."active_communication_room_id" is null
    or new."active_communication_room_id" is not null
  then
    return new;
  end if;

  if exists (
    select 1
    from public."chat_call_invites" active_invite
    where active_invite."thread_id" = old."id"
      and active_invite."communication_room_id" = old."active_communication_room_id"
      and active_invite."status" in ('ringing', 'accepted')
  ) then
    new."active_communication_room_id" := old."active_communication_room_id";
    new."active_call_type" := old."active_call_type";
  end if;

  return new;
end;
$$;

revoke all on function public."prevent_active_chilly_chat_thread_call_clear"()
  from public, anon, authenticated;

drop trigger if exists "prevent_active_chilly_chat_thread_call_clear"
  on public."chat_threads";
create trigger "prevent_active_chilly_chat_thread_call_clear"
before update of
  "active_communication_room_id",
  "active_call_type"
on public."chat_threads"
for each row
execute function public."prevent_active_chilly_chat_thread_call_clear"();

comment on function public."prevent_active_chilly_chat_thread_call_clear"() is
  'Fail-closed guard preventing stale client cleanup from detaching a ringing or accepted Chi''lly Chat call from its direct thread.';
