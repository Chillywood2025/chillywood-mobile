\set ON_ERROR_STOP on

create schema if not exists auth;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create table public.platform_role_memberships (
  id bigint generated always as identity primary key,
  user_id text,
  email text,
  role text not null,
  status text not null default 'active'
);

create or replace function public.has_platform_role(required_roles text[])
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  select auth.uid() is not null
    and coalesce(array_length(required_roles, 1), 0) > 0
    and exists (
      select 1
      from public.platform_role_memberships membership
      where membership.status = 'active'
        and membership.role = any(required_roles)
        and (
          membership.user_id = auth.uid()::text
          or (
            nullif(trim(coalesce(auth.jwt() ->> 'email', '')), '') is not null
            and lower(membership.email) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
          )
        )
    );
$$;

grant usage on schema auth to authenticated, anon, service_role;
grant execute on function auth.jwt() to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
grant execute on function public.has_platform_role(text[]) to authenticated, anon, service_role;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
