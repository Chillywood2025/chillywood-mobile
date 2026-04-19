create or replace function public.can_access_chat_thread(target_thread_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.chat_thread_members member
    where member.thread_id = target_thread_id
      and member.user_id = auth.uid()::text
  );
$$;

create or replace function public.can_manage_chat_thread_members(target_thread_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.chat_threads thread
    where thread.id = target_thread_id
      and thread.created_by = auth.uid()::text
  );
$$;

revoke all on function public.can_access_chat_thread(uuid) from public;
revoke all on function public.can_manage_chat_thread_members(uuid) from public;

grant execute on function public.can_access_chat_thread(uuid) to authenticated;
grant execute on function public.can_manage_chat_thread_members(uuid) to authenticated;

drop policy if exists chat_threads_select_policy on public.chat_threads;
create policy chat_threads_select_policy
  on public.chat_threads
  for select
  to authenticated
  using (
    public.can_access_chat_thread(chat_threads.id)
  );

drop policy if exists chat_threads_update_policy on public.chat_threads;
create policy chat_threads_update_policy
  on public.chat_threads
  for update
  to authenticated
  using (
    public.can_access_chat_thread(chat_threads.id)
  )
  with check (
    public.can_access_chat_thread(chat_threads.id)
  );

drop policy if exists chat_thread_members_select_policy on public.chat_thread_members;
create policy chat_thread_members_select_policy
  on public.chat_thread_members
  for select
  to authenticated
  using (
    public.can_access_chat_thread(chat_thread_members.thread_id)
  );

drop policy if exists chat_thread_members_insert_policy on public.chat_thread_members;
create policy chat_thread_members_insert_policy
  on public.chat_thread_members
  for insert
  to authenticated
  with check (
    public.can_manage_chat_thread_members(chat_thread_members.thread_id)
  );

drop policy if exists chat_messages_select_policy on public.chat_messages;
create policy chat_messages_select_policy
  on public.chat_messages
  for select
  to authenticated
  using (
    public.can_access_chat_thread(chat_messages.thread_id)
  );

drop policy if exists chat_messages_insert_policy on public.chat_messages;
create policy chat_messages_insert_policy
  on public.chat_messages
  for insert
  to authenticated
  with check (
    sender_user_id = auth.uid()::text
    and message_type = 'text'
    and public.can_access_chat_thread(chat_messages.thread_id)
  );
