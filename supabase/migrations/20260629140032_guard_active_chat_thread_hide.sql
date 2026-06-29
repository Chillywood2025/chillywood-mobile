create or replace function public."hide_chat_thread_from_inbox"(p_thread_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id text := auth.uid()::text;
  normalized_thread_id uuid;
  updated_hidden_at timestamp with time zone;
begin
  if actor_user_id is null then
    raise exception using errcode = '28000', message = 'sign_in_required';
  end if;

  begin
    normalized_thread_id := p_thread_id::uuid;
  exception
    when invalid_text_representation then
      raise exception using errcode = '23514', message = 'thread_required';
  end;

  if normalized_thread_id is null then
    raise exception using errcode = '23514', message = 'thread_required';
  end if;

  if not public."can_access_chat_thread"(normalized_thread_id) then
    raise exception using errcode = '42501', message = 'thread_unavailable';
  end if;

  if exists (
    select 1
    from public."chat_threads" thread
    where thread."id" = normalized_thread_id
      and thread."active_communication_room_id" is not null
  ) then
    raise exception using errcode = '23514', message = 'active_call_in_progress';
  end if;

  update public."chat_thread_members" member
  set "hidden_at" = now()
  where member."thread_id" = normalized_thread_id
    and member."user_id" = actor_user_id
  returning member."hidden_at" into updated_hidden_at;

  if updated_hidden_at is null then
    raise exception using errcode = '42501', message = 'thread_member_required';
  end if;

  return jsonb_build_object(
    'status', 'hidden',
    'thread_id', normalized_thread_id::text,
    'hidden_at', updated_hidden_at
  );
end;
$$;

revoke all on function public."hide_chat_thread_from_inbox"(text) from public;
revoke all on function public."hide_chat_thread_from_inbox"(text) from anon;
revoke all on function public."hide_chat_thread_from_inbox"(text) from service_role;
grant execute on function public."hide_chat_thread_from_inbox"(text) to authenticated;

comment on function public."hide_chat_thread_from_inbox"(text) is
  'Authenticated per-user Chi''lly Chat inbox hide. It only updates the caller''s chat_thread_members row, refuses active-call threads, and preserves shared thread/message/call history.';
