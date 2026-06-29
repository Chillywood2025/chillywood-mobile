alter table public."chat_thread_members"
  add column if not exists "hidden_at" timestamp with time zone;

create index if not exists "chat_thread_members_user_hidden_idx"
  on public."chat_thread_members" ("user_id", "hidden_at");

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

create or replace function public."unhide_chat_thread_for_me"(p_thread_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id text := auth.uid()::text;
  normalized_thread_id uuid;
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

  update public."chat_thread_members" member
  set "hidden_at" = null
  where member."thread_id" = normalized_thread_id
    and member."user_id" = actor_user_id;

  if not found then
    raise exception using errcode = '42501', message = 'thread_member_required';
  end if;

  return jsonb_build_object(
    'status', 'visible',
    'thread_id', normalized_thread_id::text
  );
end;
$$;

revoke all on function public."hide_chat_thread_from_inbox"(text) from public;
revoke all on function public."hide_chat_thread_from_inbox"(text) from anon;
revoke all on function public."hide_chat_thread_from_inbox"(text) from service_role;
grant execute on function public."hide_chat_thread_from_inbox"(text) to authenticated;

revoke all on function public."unhide_chat_thread_for_me"(text) from public;
revoke all on function public."unhide_chat_thread_for_me"(text) from anon;
revoke all on function public."unhide_chat_thread_for_me"(text) from service_role;
grant execute on function public."unhide_chat_thread_for_me"(text) to authenticated;

comment on column public."chat_thread_members"."hidden_at" is
  'Per-user inbox hide timestamp for Chi''lly Chat. This never deletes the shared thread, messages, call records, or another member''s inbox copy.';

comment on function public."hide_chat_thread_from_inbox"(text) is
  'Authenticated per-user Chi''lly Chat inbox hide. It only updates the caller''s chat_thread_members row and preserves shared thread/message/call history.';

comment on function public."unhide_chat_thread_for_me"(text) is
  'Authenticated per-user Chi''lly Chat inbox unhide/reopen helper. It only clears hidden_at on the caller''s chat_thread_members row.';
