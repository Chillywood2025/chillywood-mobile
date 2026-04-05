create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  thread_kind text not null default 'direct' check (thread_kind = 'direct'),
  participant_pair_key text not null unique,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_preview text,
  active_communication_room_id text references public.communication_rooms (room_id) on delete set null,
  active_call_type text check (active_call_type in ('voice', 'video'))
);

create table if not exists public.chat_thread_members (
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  user_id text not null,
  display_name text,
  avatar_url text,
  tagline text,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  unread_count integer not null default 0 check (unread_count >= 0),
  primary key (thread_id, user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  sender_user_id text not null,
  body text not null,
  message_type text not null default 'text' check (message_type = 'text'),
  created_at timestamptz not null default now()
);

create index if not exists chat_threads_last_message_idx
  on public.chat_threads (last_message_at desc nulls last, updated_at desc);

create index if not exists chat_thread_members_user_idx
  on public.chat_thread_members (user_id, unread_count desc, joined_at desc);

create index if not exists chat_messages_thread_created_idx
  on public.chat_messages (thread_id, created_at asc);

alter table public.chat_threads replica identity full;
alter table public.chat_thread_members replica identity full;
alter table public.chat_messages replica identity full;

create or replace function public.set_chat_thread_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists chat_threads_set_updated_at on public.chat_threads;
create trigger chat_threads_set_updated_at
before update on public.chat_threads
for each row
execute function public.set_chat_thread_updated_at();

create or replace function public.sync_chat_thread_after_message_insert()
returns trigger
language plpgsql
as $$
begin
  update public.chat_threads
  set
    last_message_at = new.created_at,
    last_message_preview = left(new.body, 160),
    updated_at = now()
  where id = new.thread_id;

  update public.chat_thread_members
  set
    unread_count = 0,
    last_read_at = new.created_at
  where thread_id = new.thread_id
    and user_id = new.sender_user_id;

  update public.chat_thread_members
  set unread_count = unread_count + 1
  where thread_id = new.thread_id
    and user_id <> new.sender_user_id;

  return new;
end;
$$;

drop trigger if exists chat_messages_sync_thread on public.chat_messages;
create trigger chat_messages_sync_thread
after insert on public.chat_messages
for each row
execute function public.sync_chat_thread_after_message_insert();

alter table public.chat_threads enable row level security;
alter table public.chat_thread_members enable row level security;
alter table public.chat_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_threads'
      and policyname = 'chat_threads_select_policy'
  ) then
    create policy chat_threads_select_policy
      on public.chat_threads
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.chat_thread_members member
          where member.thread_id = chat_threads.id
            and member.user_id = auth.uid()::text
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_threads'
      and policyname = 'chat_threads_insert_policy'
  ) then
    create policy chat_threads_insert_policy
      on public.chat_threads
      for insert
      to authenticated
      with check (
        created_by = auth.uid()::text
        and thread_kind = 'direct'
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_threads'
      and policyname = 'chat_threads_update_policy'
  ) then
    create policy chat_threads_update_policy
      on public.chat_threads
      for update
      to authenticated
      using (
        exists (
          select 1
          from public.chat_thread_members member
          where member.thread_id = chat_threads.id
            and member.user_id = auth.uid()::text
        )
      )
      with check (
        exists (
          select 1
          from public.chat_thread_members member
          where member.thread_id = chat_threads.id
            and member.user_id = auth.uid()::text
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_thread_members'
      and policyname = 'chat_thread_members_select_policy'
  ) then
    create policy chat_thread_members_select_policy
      on public.chat_thread_members
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.chat_thread_members self_member
          where self_member.thread_id = chat_thread_members.thread_id
            and self_member.user_id = auth.uid()::text
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_thread_members'
      and policyname = 'chat_thread_members_insert_policy'
  ) then
    create policy chat_thread_members_insert_policy
      on public.chat_thread_members
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.chat_threads thread
          where thread.id = chat_thread_members.thread_id
            and thread.created_by = auth.uid()::text
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_thread_members'
      and policyname = 'chat_thread_members_update_policy'
  ) then
    create policy chat_thread_members_update_policy
      on public.chat_thread_members
      for update
      to authenticated
      using (
        user_id = auth.uid()::text
      )
      with check (
        user_id = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_messages'
      and policyname = 'chat_messages_select_policy'
  ) then
    create policy chat_messages_select_policy
      on public.chat_messages
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.chat_thread_members member
          where member.thread_id = chat_messages.thread_id
            and member.user_id = auth.uid()::text
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_messages'
      and policyname = 'chat_messages_insert_policy'
  ) then
    create policy chat_messages_insert_policy
      on public.chat_messages
      for insert
      to authenticated
      with check (
        sender_user_id = auth.uid()::text
        and message_type = 'text'
        and exists (
          select 1
          from public.chat_thread_members member
          where member.thread_id = chat_messages.thread_id
            and member.user_id = auth.uid()::text
        )
      );
  end if;
end
$$;
