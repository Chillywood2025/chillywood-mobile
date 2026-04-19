create or replace function public.can_access_chat_thread(target_thread_id uuid)
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

    union all

    select 1
    from public.chat_thread_members member
    where member.thread_id = target_thread_id
      and member.user_id = auth.uid()::text
  );
$$;

revoke all on function public.can_access_chat_thread(uuid) from public;
grant execute on function public.can_access_chat_thread(uuid) to authenticated;
