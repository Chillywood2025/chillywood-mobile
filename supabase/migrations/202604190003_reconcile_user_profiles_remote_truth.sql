create table if not exists public.user_profiles (
  user_id text primary key,
  username text not null,
  avatar_index integer not null default 0,
  display_name text,
  avatar_url text,
  tagline text,
  channel_role text,
  likes_visibility text not null default 'public'::text,
  shares_visibility text not null default 'public'::text,
  default_watch_party_join_policy text,
  default_watch_party_reactions_policy text,
  default_watch_party_content_access_rule text,
  default_watch_party_capture_policy text,
  default_communication_content_access_rule text,
  default_communication_capture_policy text,
  updated_at timestamptz not null default now()
);

alter table if exists public.user_profiles
  add column if not exists user_id text,
  add column if not exists username text,
  add column if not exists avatar_index integer,
  add column if not exists display_name text,
  add column if not exists avatar_url text,
  add column if not exists tagline text,
  add column if not exists channel_role text,
  add column if not exists likes_visibility text,
  add column if not exists shares_visibility text,
  add column if not exists default_watch_party_join_policy text,
  add column if not exists default_watch_party_reactions_policy text,
  add column if not exists default_watch_party_content_access_rule text,
  add column if not exists default_watch_party_capture_policy text,
  add column if not exists default_communication_content_access_rule text,
  add column if not exists default_communication_capture_policy text,
  add column if not exists updated_at timestamptz;

update public.user_profiles
set
  avatar_index = coalesce(avatar_index, 0),
  likes_visibility = coalesce(likes_visibility, 'public'::text),
  shares_visibility = coalesce(shares_visibility, 'public'::text),
  updated_at = coalesce(updated_at, now())
where avatar_index is null
   or likes_visibility is null
   or shares_visibility is null
   or updated_at is null;

do $$
begin
  if exists (
    select 1
    from public.user_profiles
    where user_id is null
  ) then
    raise exception 'public.user_profiles contains null user_id values; reconcile manually before enforcing repo truth';
  end if;

  if exists (
    select 1
    from public.user_profiles
    where username is null
  ) then
    raise exception 'public.user_profiles contains null username values; reconcile manually before enforcing repo truth';
  end if;
end $$;

alter table public.user_profiles
  alter column avatar_index set default 0,
  alter column likes_visibility set default 'public'::text,
  alter column shares_visibility set default 'public'::text,
  alter column updated_at set default now(),
  alter column user_id set not null,
  alter column username set not null,
  alter column avatar_index set not null,
  alter column likes_visibility set not null,
  alter column shares_visibility set not null,
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_pkey'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    if exists (
      select 1
      from (
        select user_id
        from public.user_profiles
        group by user_id
        having count(*) > 1
      ) duplicates
    ) then
      raise exception 'public.user_profiles contains duplicate user_id values; reconcile manually before adding a primary key';
    end if;

    alter table public.user_profiles
      add constraint user_profiles_pkey primary key (user_id);
  end if;
end $$;

create index if not exists user_profiles_updated_at_idx
  on public.user_profiles (updated_at desc);

alter table if exists public.user_profiles enable row level security;

revoke all on public.user_profiles from anon;
grant select, insert, update on public.user_profiles to authenticated;
grant select, insert, update on public.user_profiles to service_role;

drop policy if exists user_profiles_select_policy on public.user_profiles;
drop policy if exists user_profiles_insert_policy on public.user_profiles;
drop policy if exists user_profiles_update_policy on public.user_profiles;

create policy user_profiles_select_policy
  on public.user_profiles
  for select
  to authenticated
  using (true);

create policy user_profiles_insert_policy
  on public.user_profiles
  for insert
  to authenticated
  with check (
    user_id = auth.uid()::text
  );

create policy user_profiles_update_policy
  on public.user_profiles
  for update
  to authenticated
  using (
    user_id = auth.uid()::text
  )
  with check (
    user_id = auth.uid()::text
  );
