create table if not exists public.app_configurations (
  config_key text primary key,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  updated_by text,
  constraint app_configurations_singleton_key_check
    check (config_key = 'global'::text)
);

alter table if exists public.app_configurations
  add column if not exists config_key text,
  add column if not exists config jsonb,
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by text;

update public.app_configurations
set
  config = coalesce(config, '{}'::jsonb),
  updated_at = coalesce(updated_at, timezone('utc'::text, now()))
where config is null
   or updated_at is null;

alter table public.app_configurations
  alter column config set default '{}'::jsonb,
  alter column updated_at set default timezone('utc'::text, now()),
  alter column config_key set not null,
  alter column config set not null,
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_configurations_pkey'
      and conrelid = 'public.app_configurations'::regclass
  ) then
    if exists (
      select 1
      from public.app_configurations
      where config_key is null
    ) then
      raise exception 'public.app_configurations contains null config_key values; reconcile manually before adding a primary key';
    end if;

    if exists (
      select 1
      from (
        select config_key
        from public.app_configurations
        group by config_key
        having count(*) > 1
      ) duplicates
    ) then
      raise exception 'public.app_configurations contains duplicate config_key values; reconcile manually before adding a primary key';
    end if;

    alter table public.app_configurations
      add constraint app_configurations_pkey primary key (config_key);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_configurations_singleton_key_check'
      and conrelid = 'public.app_configurations'::regclass
  ) then
    if exists (
      select 1
      from public.app_configurations
      where config_key <> 'global'
    ) then
      raise exception 'public.app_configurations contains non-global rows; reconcile manually before enforcing singleton design';
    end if;

    alter table public.app_configurations
      add constraint app_configurations_singleton_key_check
      check (config_key = 'global'::text);
  end if;
end $$;

alter table if exists public.app_configurations enable row level security;

grant select on public.app_configurations to anon, authenticated;
grant insert, update on public.app_configurations to authenticated;

create or replace function public.sanitize_app_configuration(input_config jsonb)
returns jsonb
language sql
immutable
as $$
  select
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                case
                  when jsonb_typeof(coalesce(input_config, '{}'::jsonb)) = 'object'
                    then coalesce(input_config, '{}'::jsonb)
                  else '{}'::jsonb
                end,
                '{branding,appDisplayName}',
                to_jsonb('Chi''llywood'::text),
                true
              ),
              '{branding,watchPartyLabel}',
              to_jsonb('Live Watch-Party'::text),
              true
            ),
            '{branding,liveWaitingRoomTitle}',
            to_jsonb('Live Waiting Room'::text),
            true
          ),
          '{branding,partyWaitingRoomTitle}',
          to_jsonb('Party Waiting Room'::text),
          true
        ),
        '{branding,liveRoomTitle}',
        to_jsonb('Live Room'::text),
        true
      ),
      '{branding,partyRoomTitle}',
      to_jsonb('Party Room'::text),
      true
    );
$$;

create or replace function public.app_configurations_sanitize_before_write()
returns trigger
language plpgsql
as $$
begin
  new.config := public.sanitize_app_configuration(new.config);
  return new;
end;
$$;

drop trigger if exists app_configurations_sanitize_before_write on public.app_configurations;

create trigger app_configurations_sanitize_before_write
before insert or update on public.app_configurations
for each row
execute function public.app_configurations_sanitize_before_write();

insert into public.app_configurations (config_key, config)
select 'global', public.sanitize_app_configuration('{}'::jsonb)
where not exists (
  select 1
  from public.app_configurations
  where config_key = 'global'
);

update public.app_configurations
set config = public.sanitize_app_configuration(config)
where config_key = 'global';

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'app_configurations'
      and policyname = 'app_configurations_select_policy'
  ) then
    create policy app_configurations_select_policy
      on public.app_configurations
      for select
      to public
      using (true);
  end if;
end $$;

drop policy if exists app_configurations_insert_policy on public.app_configurations;
drop policy if exists app_configurations_update_policy on public.app_configurations;
drop policy if exists app_configurations_insert_operator on public.app_configurations;
drop policy if exists app_configurations_update_operator on public.app_configurations;

create policy app_configurations_insert_operator
  on public.app_configurations
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and public.has_platform_role(array['operator'])
  );

create policy app_configurations_update_operator
  on public.app_configurations
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
