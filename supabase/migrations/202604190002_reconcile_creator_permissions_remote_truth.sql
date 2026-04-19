create table if not exists public.creator_permissions (
  user_id text primary key,
  can_use_party_pass_rooms boolean not null default true,
  can_use_premium_rooms boolean not null default true,
  can_publish_premium_titles boolean not null default true,
  can_use_sponsor_placements boolean not null default true,
  can_use_player_ads boolean not null default true,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table if exists public.creator_permissions
  add column if not exists user_id text,
  add column if not exists can_use_party_pass_rooms boolean,
  add column if not exists can_use_premium_rooms boolean,
  add column if not exists can_publish_premium_titles boolean,
  add column if not exists can_use_sponsor_placements boolean,
  add column if not exists can_use_player_ads boolean,
  add column if not exists updated_at timestamptz;

update public.creator_permissions
set
  can_use_party_pass_rooms = coalesce(can_use_party_pass_rooms, true),
  can_use_premium_rooms = coalesce(can_use_premium_rooms, true),
  can_publish_premium_titles = coalesce(can_publish_premium_titles, true),
  can_use_sponsor_placements = coalesce(can_use_sponsor_placements, true),
  can_use_player_ads = coalesce(can_use_player_ads, true),
  updated_at = coalesce(updated_at, timezone('utc'::text, now()))
where can_use_party_pass_rooms is null
   or can_use_premium_rooms is null
   or can_publish_premium_titles is null
   or can_use_sponsor_placements is null
   or can_use_player_ads is null
   or updated_at is null;

alter table public.creator_permissions
  alter column can_use_party_pass_rooms set default true,
  alter column can_use_premium_rooms set default true,
  alter column can_publish_premium_titles set default true,
  alter column can_use_sponsor_placements set default true,
  alter column can_use_player_ads set default true,
  alter column updated_at set default timezone('utc'::text, now()),
  alter column user_id set not null,
  alter column can_use_party_pass_rooms set not null,
  alter column can_use_premium_rooms set not null,
  alter column can_publish_premium_titles set not null,
  alter column can_use_sponsor_placements set not null,
  alter column can_use_player_ads set not null,
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'creator_permissions_pkey'
      and conrelid = 'public.creator_permissions'::regclass
  ) then
    if exists (
      select 1
      from public.creator_permissions
      where user_id is null
    ) then
      raise exception 'public.creator_permissions contains null user_id values; reconcile manually before adding a primary key';
    end if;

    if exists (
      select 1
      from (
        select user_id
        from public.creator_permissions
        group by user_id
        having count(*) > 1
      ) duplicates
    ) then
      raise exception 'public.creator_permissions contains duplicate user_id values; reconcile manually before adding a primary key';
    end if;

    alter table public.creator_permissions
      add constraint creator_permissions_pkey primary key (user_id);
  end if;
end $$;

alter table if exists public.creator_permissions enable row level security;

revoke all on public.creator_permissions from anon;
grant select, insert, update on public.creator_permissions to authenticated;
grant select, insert, update on public.creator_permissions to service_role;

drop policy if exists creator_permissions_select_policy on public.creator_permissions;
drop policy if exists creator_permissions_insert_policy on public.creator_permissions;
drop policy if exists creator_permissions_update_policy on public.creator_permissions;
drop policy if exists creator_permissions_select_self_or_operator on public.creator_permissions;
drop policy if exists creator_permissions_insert_operator on public.creator_permissions;
drop policy if exists creator_permissions_update_operator on public.creator_permissions;

create policy creator_permissions_select_self_or_operator
  on public.creator_permissions
  for select
  to authenticated
  using (
    auth.uid() is not null
    and (
      user_id = auth.uid()::text
      or public.has_platform_role(array['operator'])
    )
  );

create policy creator_permissions_insert_operator
  on public.creator_permissions
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and public.has_platform_role(array['operator'])
  );

create policy creator_permissions_update_operator
  on public.creator_permissions
  for update
  to authenticated
  using (
    auth.uid() is not null
    and public.has_platform_role(array['operator'])
  )
  with check (
    auth.uid() is not null
    and public.has_platform_role(array['operator'])
  );
