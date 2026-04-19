drop policy if exists chat_threads_insert_policy on public.chat_threads;

create policy chat_threads_insert_policy
  on public.chat_threads
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and thread_kind = 'direct'
  );
