alter table if exists public.communication_rooms
  add column if not exists content_access_rule text,
  add column if not exists capture_policy text,
  add column if not exists last_activity_at timestamptz;

update public.communication_rooms
set
  content_access_rule = case
    when lower(trim(coalesce(content_access_rule, ''))) = 'party_pass' then 'party_pass'
    when lower(trim(coalesce(content_access_rule, ''))) = 'premium' then 'premium'
    else 'open'
  end,
  capture_policy = case
    when lower(trim(coalesce(capture_policy, ''))) = 'host_managed' then 'host_managed'
    else 'best_effort'
  end,
  last_activity_at = coalesce(last_activity_at, updated_at, created_at, now())
where
  content_access_rule is null
  or lower(trim(coalesce(content_access_rule, ''))) not in ('open', 'party_pass', 'premium')
  or capture_policy is null
  or lower(trim(coalesce(capture_policy, ''))) not in ('best_effort', 'host_managed')
  or last_activity_at is null;

alter table if exists public.communication_rooms
  alter column content_access_rule set default 'open',
  alter column capture_policy set default 'best_effort',
  alter column last_activity_at set default now();

alter table if exists public.communication_rooms
  alter column content_access_rule set not null,
  alter column capture_policy set not null,
  alter column last_activity_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'communication_rooms_content_access_rule_check'
      and conrelid = 'public.communication_rooms'::regclass
  ) then
    alter table public.communication_rooms
      add constraint communication_rooms_content_access_rule_check
      check (content_access_rule in ('open', 'party_pass', 'premium'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'communication_rooms_capture_policy_check'
      and conrelid = 'public.communication_rooms'::regclass
  ) then
    alter table public.communication_rooms
      add constraint communication_rooms_capture_policy_check
      check (capture_policy in ('best_effort', 'host_managed'));
  end if;
end
$$;

create table if not exists public.communication_room_memberships (
  room_id text not null references public.communication_rooms (room_id) on delete cascade,
  user_id text not null,
  role text not null default 'participant',
  membership_state text not null default 'active',
  camera_enabled boolean not null default false,
  mic_enabled boolean not null default true,
  display_name text,
  avatar_url text,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'communication_room_memberships_role_check'
      and conrelid = 'public.communication_room_memberships'::regclass
  ) then
    alter table public.communication_room_memberships
      add constraint communication_room_memberships_role_check
      check (role in ('host', 'participant'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'communication_room_memberships_state_check'
      and conrelid = 'public.communication_room_memberships'::regclass
  ) then
    alter table public.communication_room_memberships
      add constraint communication_room_memberships_state_check
      check (membership_state in ('active', 'reconnecting', 'left', 'removed'));
  end if;
end
$$;

create index if not exists communication_room_memberships_room_seen_idx
  on public.communication_room_memberships (room_id, last_seen_at desc);

create index if not exists communication_room_memberships_room_state_idx
  on public.communication_room_memberships (room_id, membership_state);

alter table public.communication_room_memberships replica identity full;

create or replace function public.communication_room_join_allowed(target_room_id text, joining_user_id text)
returns boolean
language sql
stable
as $$
  with active_members as (
    select count(*)::int as count
    from public.communication_room_memberships membership
    where membership.room_id = target_room_id
      and membership.membership_state in ('active', 'reconnecting')
      and membership.last_seen_at >= now() - interval '25 seconds'
      and membership.user_id <> joining_user_id
  )
  select exists (
    select 1
    from public.communication_rooms room
    where room.room_id = target_room_id
      and room.status = 'active'
      and (
        room.host_user_id = joining_user_id
        or (select count from active_members) < 4
      )
  );
$$;

alter table if exists public.communication_rooms enable row level security;
alter table if exists public.communication_room_memberships enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'communication_rooms'
      and policyname = 'communication_rooms_select_policy'
  ) then
    create policy communication_rooms_select_policy
      on public.communication_rooms
      for select
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'communication_rooms'
      and policyname = 'communication_rooms_insert_policy'
  ) then
    create policy communication_rooms_insert_policy
      on public.communication_rooms
      for insert
      with check (auth.uid() is not null and host_user_id = auth.uid()::text);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'communication_rooms'
      and policyname = 'communication_rooms_host_update_policy'
  ) then
    create policy communication_rooms_host_update_policy
      on public.communication_rooms
      for update
      using (auth.uid() is not null and host_user_id = auth.uid()::text)
      with check (auth.uid() is not null and host_user_id = auth.uid()::text);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'communication_room_memberships'
      and policyname = 'communication_room_memberships_select_policy'
  ) then
    create policy communication_room_memberships_select_policy
      on public.communication_room_memberships
      for select
      using (
        exists (
          select 1
          from public.communication_rooms room
          where room.room_id = communication_room_memberships.room_id
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'communication_room_memberships'
      and policyname = 'communication_room_memberships_self_insert_policy'
  ) then
    create policy communication_room_memberships_self_insert_policy
      on public.communication_room_memberships
      for insert
      with check (
        auth.uid() is not null
        and user_id = auth.uid()::text
        and public.communication_room_join_allowed(room_id, auth.uid()::text)
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'communication_room_memberships'
      and policyname = 'communication_room_memberships_self_update_policy'
  ) then
    create policy communication_room_memberships_self_update_policy
      on public.communication_room_memberships
      for update
      using (auth.uid() is not null and user_id = auth.uid()::text)
      with check (auth.uid() is not null and user_id = auth.uid()::text);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'communication_room_memberships'
      and policyname = 'communication_room_memberships_host_update_policy'
  ) then
    create policy communication_room_memberships_host_update_policy
      on public.communication_room_memberships
      for update
      using (
        exists (
          select 1
          from public.communication_rooms room
          where room.room_id = communication_room_memberships.room_id
            and room.host_user_id = auth.uid()::text
        )
      )
      with check (
        exists (
          select 1
          from public.communication_rooms room
          where room.room_id = communication_room_memberships.room_id
            and room.host_user_id = auth.uid()::text
        )
      );
  end if;
end
$$;
