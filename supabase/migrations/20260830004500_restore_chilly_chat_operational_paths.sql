-- Restore Chi'lly Chat text-send and direct-call creation paths after the
-- private-authority closure. Keep thread/call authority server-owned and fail
-- closed; this migration does not widen raw chat-thread mutation privileges.

-- Message inserts are caller-authorized by chat_messages_insert_policy and the
-- abuse guard before this AFTER INSERT trigger runs. The trigger itself must be
-- able to maintain the server-owned thread projection and both members' unread
-- counters without granting clients UPDATE on those authority tables.
create or replace function public."sync_chat_thread_after_message_insert"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public."chat_threads"
  set
    "last_message_at" = new."created_at",
    "last_message_preview" = left(new."body", 160),
    "updated_at" = now()
  where "id" = new."thread_id";

  update public."chat_thread_members"
  set
    "unread_count" = 0,
    "last_read_at" = new."created_at"
  where "thread_id" = new."thread_id"
    and "user_id" = new."sender_user_id";

  update public."chat_thread_members"
  set "unread_count" = "unread_count" + 1
  where "thread_id" = new."thread_id"
    and "user_id" <> new."sender_user_id";

  return new;
end;
$$;

revoke all on function public."sync_chat_thread_after_message_insert"()
  from public, anon, authenticated, service_role;

comment on function public."sync_chat_thread_after_message_insert"() is
  'Trigger-only server projection for an already-authorized chat message insert. Maintains last-message and unread state without restoring raw client UPDATE authority on chat threads or other members.';

-- PostgREST implements insert(...).select(...) as INSERT ... RETURNING. The
-- normal communication-room SELECT helper intentionally re-reads the stored
-- row and its attached thread. During RETURNING the just-inserted row is not
-- yet visible to that helper, which made an otherwise-authorized room creation
-- fail RLS. This narrow helper authorizes only the creation readback window:
-- exact current host, ACTIVE room, unrestricted account, and no attached chat
-- thread yet. Once begin_chilly_chat_call attaches the room, this path closes
-- and the canonical read helper is authoritative again.
create or replace function public."communication_room_creation_readback_allowed"(
  p_room_id text,
  p_host_user_id text,
  p_status text,
  p_linked_party_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    auth.uid() is not null
    and auth.uid()::text = nullif(btrim(coalesce(p_host_user_id, '')), '')
    and public."whole_app_exact_current_session_authority_internal"()
    and not public."is_account_access_restricted"(auth.uid()::text)
    and p_status = 'active'
    and not exists (
      select 1
      from public."chat_threads" thread
      where thread."active_communication_room_id" =
        upper(btrim(coalesce(p_room_id, '')))
    )
    and (
      p_linked_party_id is null
      or public."can_read_watch_party_room_authority"(p_linked_party_id)
    ),
    false
  );
$$;

revoke all on function public."communication_room_creation_readback_allowed"(text, text, text, text)
  from public, anon, service_role;
grant execute on function public."communication_room_creation_readback_allowed"(text, text, text, text)
  to authenticated;

comment on function public."communication_room_creation_readback_allowed"(text, text, text, text) is
  'Caller-bound INSERT RETURNING bridge for a newly created communication room. It closes as soon as a chat thread attaches and never substitutes for canonical room/thread authority afterward.';

drop policy if exists "communication_rooms_select_policy"
  on public."communication_rooms";
create policy "communication_rooms_select_policy"
  on public."communication_rooms"
  for select
  to authenticated
  using (
    public."can_read_communication_room_authority"("room_id")
    or public."communication_room_creation_readback_allowed"(
      "room_id",
      "host_user_id",
      "status",
      "linked_party_id"
    )
  );
