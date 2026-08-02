-- Chi'lly Chat accepted-call media rollout.
--
-- Supabase remains authoritative for call lifecycle. This migration only
-- stamps each durable invite with one immutable media provider. Public calls
-- stay on legacy WebRTC while an exact, private two-account canary cohort can
-- be assigned to LiveKit. The provider never changes during an active call.

set check_function_bodies = false;

alter table public.chat_call_invites
  add column if not exists chat_call_media_provider text
  default 'legacy_webrtc'::text not null;

alter table public.chat_call_invites
  drop constraint if exists chat_call_invites_media_provider_check;
alter table public.chat_call_invites
  add constraint chat_call_invites_media_provider_check
  check (chat_call_media_provider in ('legacy_webrtc', 'livekit'));

create table if not exists public.chat_call_media_rollout_control (
  singleton boolean primary key default true check (singleton),
  public_default_provider text not null default 'legacy_webrtc'
    check (public_default_provider = 'legacy_webrtc'),
  canary_provider text not null default 'livekit'
    check (canary_provider in ('legacy_webrtc', 'livekit')),
  canary_enabled boolean not null default false,
  livekit_emergency_stop boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

insert into public.chat_call_media_rollout_control (
  singleton,
  public_default_provider,
  canary_provider,
  canary_enabled,
  livekit_emergency_stop
) values (
  true,
  'legacy_webrtc',
  'livekit',
  false,
  true
)
on conflict (singleton) do nothing;

create table if not exists public.chat_call_livekit_canary_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  enrolled_by uuid not null references auth.users(id) on delete restrict,
  enrolled_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.chat_call_media_rollout_control enable row level security;
alter table public.chat_call_media_rollout_control force row level security;
alter table public.chat_call_livekit_canary_users enable row level security;
alter table public.chat_call_livekit_canary_users force row level security;

revoke all on table public.chat_call_media_rollout_control
  from public, anon, authenticated;
revoke all on table public.chat_call_livekit_canary_users
  from public, anon, authenticated;
grant all on table public.chat_call_media_rollout_control
  to postgres, service_role;
grant all on table public.chat_call_livekit_canary_users
  to postgres, service_role;

create or replace function public.resolve_chilly_chat_call_media_provider(
  p_caller_user_id uuid,
  p_callee_user_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when control.canary_enabled
      and not control.livekit_emergency_stop
      and control.canary_provider = 'livekit'
      and exists (
        select 1
        from public.chat_call_livekit_canary_users caller_canary
        where caller_canary.user_id = p_caller_user_id
          and caller_canary.enabled
      )
      and exists (
        select 1
        from public.chat_call_livekit_canary_users callee_canary
        where callee_canary.user_id = p_callee_user_id
          and callee_canary.enabled
      )
    then 'livekit'
    else 'legacy_webrtc'
  end
  from public.chat_call_media_rollout_control control
  where control.singleton
  limit 1
$$;

revoke all on function public.resolve_chilly_chat_call_media_provider(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_chilly_chat_call_media_provider(uuid, uuid)
  to postgres, service_role;

create or replace function public.assign_chilly_chat_call_media_provider()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.chat_call_media_provider := coalesce(
    public.resolve_chilly_chat_call_media_provider(
      new.caller_user_id::uuid,
      new.callee_user_id::uuid
    ),
    'legacy_webrtc'
  );
  return new;
end;
$$;

revoke all on function public.assign_chilly_chat_call_media_provider()
  from public, anon, authenticated;

drop trigger if exists assign_chilly_chat_call_media_provider
  on public.chat_call_invites;
create trigger assign_chilly_chat_call_media_provider
before insert on public.chat_call_invites
for each row execute function public.assign_chilly_chat_call_media_provider();

create or replace function public.preserve_chilly_chat_call_media_provider()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.chat_call_media_provider := old.chat_call_media_provider;
  return new;
end;
$$;

revoke all on function public.preserve_chilly_chat_call_media_provider()
  from public, anon, authenticated;

drop trigger if exists preserve_chilly_chat_call_media_provider
  on public.chat_call_invites;
create trigger preserve_chilly_chat_call_media_provider
before update on public.chat_call_invites
for each row execute function public.preserve_chilly_chat_call_media_provider();

create or replace function public.configure_chilly_chat_livekit_canary(
  p_canary_enabled boolean,
  p_livekit_emergency_stop boolean
)
returns public.chat_call_media_rollout_control
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  result public.chat_call_media_rollout_control;
begin
  if p_canary_enabled is null or p_livekit_emergency_stop is null then
    raise exception 'chat_call_media_rollout_state_required';
  end if;
  if p_canary_enabled and p_livekit_emergency_stop then
    raise exception 'chat_call_livekit_canary_cannot_run_during_emergency_stop';
  end if;

  update public.chat_call_media_rollout_control
  set
    canary_enabled = p_canary_enabled,
    livekit_emergency_stop = p_livekit_emergency_stop,
    updated_by = owner_id,
    updated_at = timezone('utc'::text, now())
  where singleton
  returning * into result;

  return result;
end;
$$;

revoke all on function public.configure_chilly_chat_livekit_canary(boolean, boolean)
  from public, anon;
grant execute on function public.configure_chilly_chat_livekit_canary(boolean, boolean)
  to authenticated, service_role;

create or replace function public.set_chilly_chat_livekit_canary_user(
  p_user_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
begin
  if p_user_id is null or p_enabled is null then
    raise exception 'chat_call_livekit_canary_user_scope_required';
  end if;
  if not exists (select 1 from auth.users app_user where app_user.id = p_user_id) then
    raise exception 'chat_call_livekit_canary_user_not_found';
  end if;

  insert into public.chat_call_livekit_canary_users (
    user_id,
    enabled,
    enrolled_by,
    enrolled_at,
    updated_at
  ) values (
    p_user_id,
    p_enabled,
    owner_id,
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
  )
  on conflict (user_id) do update
  set
    enabled = excluded.enabled,
    enrolled_by = owner_id,
    updated_at = timezone('utc'::text, now());

  return true;
end;
$$;

revoke all on function public.set_chilly_chat_livekit_canary_user(uuid, boolean)
  from public, anon;
grant execute on function public.set_chilly_chat_livekit_canary_user(uuid, boolean)
  to authenticated, service_role;

comment on column public.chat_call_invites.chat_call_media_provider is
  'Server-stamped media provider fixed for this call invite. It is never a client setting and never changes mid-call.';
comment on table public.chat_call_media_rollout_control is
  'Private fail-closed Chi''lly Chat media rollout state. Public default is constrained to legacy_webrtc.';
comment on table public.chat_call_livekit_canary_users is
  'Private role-free internal account cohort. Both direct-call participants must be enabled before a new invite is stamped livekit.';
comment on function public.configure_chilly_chat_livekit_canary(boolean, boolean) is
  'Exact-Owner control for new-call LiveKit canary selection and emergency stop. Existing calls keep their stamped provider.';
comment on function public.set_chilly_chat_livekit_canary_user(uuid, boolean) is
  'Exact-Owner enrollment for a role-free internal Chat Call LiveKit canary account.';
