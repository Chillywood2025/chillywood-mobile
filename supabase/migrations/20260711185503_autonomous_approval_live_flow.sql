-- Live autonomous approval authority for Level 3/4 autonomous actions.
-- This is additive over the source-proofed approval request foundation.
-- It uses platform_role_memberships as role truth, keeps client table writes
-- denied, and exposes bounded security-definer RPCs for owner/super-admin
-- review plus trusted-operator preflight/execution audit.

create extension if not exists pgcrypto with schema extensions;

alter table public."platform_role_memberships"
  drop constraint if exists "platform_role_memberships_role_check";

alter table public."platform_role_memberships"
  add constraint "platform_role_memberships_role_check"
  check (role = any (array['owner'::text, 'super_admin'::text, 'operator'::text, 'moderator'::text]));

alter table public.autonomous_approval_requests
  drop constraint if exists autonomous_approval_requests_status_check;

alter table public.autonomous_approval_requests
  add constraint autonomous_approval_requests_status_check
  check (
    status in (
      'pending',
      'approved',
      'denied',
      'expired',
      'cancelled',
      'preflight_failed',
      'executed',
      'execution_failed',
      'superseded'
    )
  );

alter table public.autonomous_approval_request_events
  drop constraint if exists autonomous_approval_request_events_event_type_check;

alter table public.autonomous_approval_request_events
  add constraint autonomous_approval_request_events_event_type_check
  check (
    event_type in (
      'created',
      'requested',
      'reviewed',
      'approved',
      'denied',
      'cancelled',
      'expired',
      'preflight_started',
      'preflight_passed',
      'preflight_failed',
      'preflight_reran',
      'executed',
      'execution_failed',
      'execution_blocked',
      'superseded',
      'emergency_paused',
      'emergency_resumed'
    )
  );

create table if not exists public.autonomous_system_emergency_states (
  system_id text primary key,
  status text not null default 'active' check (status in ('active', 'paused', 'emergency_stop')),
  reason text,
  updated_by uuid,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint autonomous_system_emergency_states_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.autonomous_system_control_events (
  id uuid primary key default gen_random_uuid(),
  system_id text not null,
  event_type text not null check (event_type in ('emergency_paused', 'emergency_resumed', 'paused', 'resumed', 'status_checked')),
  actor_id uuid,
  actor_role text not null default 'unknown',
  event_summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint autonomous_system_control_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

alter table public.autonomous_system_emergency_states enable row level security;
alter table public.autonomous_system_control_events enable row level security;

revoke all on table public.autonomous_system_emergency_states from anon, authenticated;
revoke all on table public.autonomous_system_control_events from anon, authenticated;
grant select, insert, update on table public.autonomous_system_emergency_states to service_role;
grant select, insert on table public.autonomous_system_control_events to service_role;

create index if not exists autonomous_system_control_events_system_created_idx
  on public.autonomous_system_control_events (system_id, created_at desc);

create or replace function public.autonomous_approval_payload_has_secret(p_value jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_value::text, '') ~* '(secret|token|password|authorization|service[_-]?role|participant[_-]?token|signed[_-]?url|api[_-]?key|private[_-]?key|db[_-]?url|database[_-]?url|[A-Za-z0-9._~+/=-]{64,})';
$$;

create or replace function public.autonomous_actor_has_owner_authority(
  p_actor_user_id text,
  p_actor_email text default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public."platform_role_memberships" membership
    where membership."status" = 'active'
      and membership."role" in ('owner', 'super_admin')
      and (
        (
          nullif(trim(coalesce(p_actor_user_id, '')), '') is not null
          and membership."user_id" = nullif(trim(coalesce(p_actor_user_id, '')), '')
        )
        or (
          nullif(lower(trim(coalesce(p_actor_email, ''))), '') is not null
          and lower(membership."email") = nullif(lower(trim(coalesce(p_actor_email, ''))), '')
        )
      )
  );
$$;

create or replace function public.autonomous_actor_authority_role(
  p_actor_user_id text,
  p_actor_email text default null
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select membership."role"
  from public."platform_role_memberships" membership
  where membership."status" = 'active'
    and membership."role" in ('owner', 'super_admin')
    and (
      (
        nullif(trim(coalesce(p_actor_user_id, '')), '') is not null
        and membership."user_id" = nullif(trim(coalesce(p_actor_user_id, '')), '')
      )
      or (
        nullif(lower(trim(coalesce(p_actor_email, ''))), '') is not null
        and lower(membership."email") = nullif(lower(trim(coalesce(p_actor_email, ''))), '')
      )
    )
  order by case membership."role" when 'owner' then 0 else 1 end
  limit 1;
$$;

create or replace function public.autonomous_write_request_event(
  p_request_id uuid,
  p_event_type text,
  p_actor_type text,
  p_actor_id uuid,
  p_event_summary text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event_id uuid;
begin
  if public.autonomous_approval_payload_has_secret(coalesce(p_metadata, '{}'::jsonb)) then
    raise exception 'autonomous_approval_secret_metadata_blocked';
  end if;

  insert into public.autonomous_approval_request_events (
    request_id,
    event_type,
    actor_type,
    actor_id,
    event_summary,
    metadata
  )
  values (
    p_request_id,
    p_event_type,
    p_actor_type,
    p_actor_id,
    p_event_summary,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.list_autonomous_approval_requests(
  p_status text default 'pending'
)
returns table (
  id uuid,
  system_id text,
  action_id text,
  requested_by_actor_type text,
  requested_by_actor_id uuid,
  approval_level integer,
  status text,
  title text,
  reason text,
  risk_summary text,
  proposed_action text,
  allowed_write_scope jsonb,
  forbidden_scope jsonb,
  rollback_plan text,
  kill_switch_plan text,
  proof_plan text,
  validation_plan text,
  expires_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  denied_by uuid,
  denied_at timestamptz,
  denial_reason text,
  execution_result text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.autonomous_actor_has_owner_authority(auth.uid()::text, auth.jwt() ->> 'email') then
    raise exception 'owner_or_super_admin_required' using errcode = '42501';
  end if;

  return query
  select
    request.id,
    request.system_id,
    request.action_id,
    request.requested_by_actor_type,
    request.requested_by_actor_id,
    request.approval_level,
    request.status,
    request.title,
    request.reason,
    request.risk_summary,
    request.proposed_action,
    request.allowed_write_scope,
    request.forbidden_scope,
    request.rollback_plan,
    request.kill_switch_plan,
    request.proof_plan,
    request.validation_plan,
    request.expires_at,
    request.approved_by,
    request.approved_at,
    request.denied_by,
    request.denied_at,
    request.denial_reason,
    request.execution_result,
    request.metadata,
    request.created_at,
    request.updated_at
  from public.autonomous_approval_requests request
  where p_status is null or request.status = p_status
  order by request.created_at desc
  limit 100;
end;
$$;

create or replace function public.get_autonomous_approval_request(
  p_request_id uuid
)
returns public.autonomous_approval_requests
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.autonomous_approval_requests%rowtype;
begin
  if auth.uid() is null or not public.autonomous_actor_has_owner_authority(auth.uid()::text, auth.jwt() ->> 'email') then
    raise exception 'owner_or_super_admin_required' using errcode = '42501';
  end if;

  select * into v_request
  from public.autonomous_approval_requests
  where id = p_request_id;

  if v_request.id is null then
    raise exception 'autonomous_approval_request_not_found';
  end if;

  return v_request;
end;
$$;

create or replace function public.approve_autonomous_approval_request(
  p_request_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns public.autonomous_approval_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text := public.autonomous_actor_authority_role(auth.uid()::text, auth.jwt() ->> 'email');
  v_request public.autonomous_approval_requests%rowtype;
begin
  if v_actor_id is null or v_actor_role is null then
    raise exception 'owner_or_super_admin_required' using errcode = '42501';
  end if;

  if public.autonomous_approval_payload_has_secret(coalesce(p_metadata, '{}'::jsonb)) then
    raise exception 'autonomous_approval_secret_metadata_blocked';
  end if;

  select * into v_request
  from public.autonomous_approval_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'autonomous_approval_request_not_found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'autonomous_approval_request_not_pending';
  end if;
  if v_request.expires_at <= timezone('utc'::text, now()) then
    update public.autonomous_approval_requests
    set status = 'expired', updated_at = timezone('utc'::text, now())
    where id = p_request_id;
    perform public.autonomous_write_request_event(p_request_id, 'expired', v_actor_role, v_actor_id, 'Autonomous approval request expired during review.', '{}'::jsonb);
    raise exception 'autonomous_approval_request_expired';
  end if;
  if v_request.requested_by_actor_id is not null and v_request.requested_by_actor_id = v_actor_id then
    raise exception 'autonomous_approval_self_approval_denied' using errcode = '42501';
  end if;
  if v_request.requested_by_actor_type in ('rachi', 'livekit_operator', 'media_automation') and v_actor_role = v_request.requested_by_actor_type then
    raise exception 'autonomous_approval_self_approval_denied' using errcode = '42501';
  end if;

  update public.autonomous_approval_requests
  set
    status = 'approved',
    approved_by = v_actor_id,
    approved_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now()),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('approvalMetadata', coalesce(p_metadata, '{}'::jsonb))
  where id = p_request_id
  returning * into v_request;

  perform public.autonomous_write_request_event(
    p_request_id,
    'approved',
    v_actor_role,
    v_actor_id,
    'Owner/super-admin approved autonomous Level 3/4 request. Fresh preflight is still required before execution.',
    jsonb_build_object('executionRequiresFreshPreflight', true)
  );

  return v_request;
end;
$$;

create or replace function public.deny_autonomous_approval_request(
  p_request_id uuid,
  p_denial_reason text
)
returns public.autonomous_approval_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text := public.autonomous_actor_authority_role(auth.uid()::text, auth.jwt() ->> 'email');
  v_reason text := nullif(trim(coalesce(p_denial_reason, '')), '');
  v_request public.autonomous_approval_requests%rowtype;
begin
  if v_actor_id is null or v_actor_role is null then
    raise exception 'owner_or_super_admin_required' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'autonomous_approval_denial_reason_required';
  end if;

  select * into v_request
  from public.autonomous_approval_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'autonomous_approval_request_not_found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'autonomous_approval_request_not_pending';
  end if;
  if v_request.requested_by_actor_id is not null and v_request.requested_by_actor_id = v_actor_id then
    raise exception 'autonomous_approval_self_denial_denied' using errcode = '42501';
  end if;

  update public.autonomous_approval_requests
  set
    status = 'denied',
    denied_by = v_actor_id,
    denied_at = timezone('utc'::text, now()),
    denial_reason = left(v_reason, 2000),
    updated_at = timezone('utc'::text, now())
  where id = p_request_id
  returning * into v_request;

  perform public.autonomous_write_request_event(p_request_id, 'denied', v_actor_role, v_actor_id, 'Owner/super-admin denied autonomous approval request.', jsonb_build_object('reason', left(v_reason, 2000)));

  return v_request;
end;
$$;

create or replace function public.cancel_autonomous_approval_request(
  p_request_id uuid,
  p_reason text default null
)
returns public.autonomous_approval_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text := public.autonomous_actor_authority_role(auth.uid()::text, auth.jwt() ->> 'email');
  v_request public.autonomous_approval_requests%rowtype;
begin
  if v_actor_id is null or v_actor_role is null then
    raise exception 'owner_or_super_admin_required' using errcode = '42501';
  end if;

  update public.autonomous_approval_requests
  set status = 'cancelled', updated_at = timezone('utc'::text, now())
  where id = p_request_id and status = 'pending'
  returning * into v_request;

  if v_request.id is null then
    raise exception 'autonomous_approval_request_not_pending';
  end if;

  perform public.autonomous_write_request_event(p_request_id, 'cancelled', v_actor_role, v_actor_id, 'Owner/super-admin cancelled autonomous approval request.', jsonb_build_object('reason', left(coalesce(p_reason, 'Cancelled from Admin.'), 2000)));

  return v_request;
end;
$$;

create or replace function public.expire_autonomous_approval_requests()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.autonomous_approval_requests
  set status = 'expired', updated_at = timezone('utc'::text, now())
  where status = 'pending'
    and expires_at <= timezone('utc'::text, now());

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.mark_autonomous_approval_preflight_result(
  p_request_id uuid,
  p_passed boolean,
  p_summary text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.autonomous_approval_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.autonomous_approval_requests%rowtype;
  v_summary text := left(nullif(trim(coalesce(p_summary, '')), ''), 2000);
begin
  if v_summary is null then
    raise exception 'autonomous_preflight_summary_required';
  end if;
  if public.autonomous_approval_payload_has_secret(coalesce(p_metadata, '{}'::jsonb)) then
    raise exception 'autonomous_approval_secret_metadata_blocked';
  end if;

  select * into v_request
  from public.autonomous_approval_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'autonomous_approval_request_not_found';
  end if;
  if v_request.status <> 'approved' then
    raise exception 'autonomous_approval_request_not_approved';
  end if;
  if v_request.expires_at <= timezone('utc'::text, now()) then
    update public.autonomous_approval_requests
    set status = 'expired', updated_at = timezone('utc'::text, now())
    where id = p_request_id
    returning * into v_request;
    perform public.autonomous_write_request_event(p_request_id, 'expired', 'operator', null, 'Approved autonomous request expired before preflight.', '{}'::jsonb);
    return v_request;
  end if;

  if p_passed then
    perform public.autonomous_write_request_event(p_request_id, 'preflight_passed', 'operator', null, v_summary, coalesce(p_metadata, '{}'::jsonb));
  else
    update public.autonomous_approval_requests
    set status = 'preflight_failed', updated_at = timezone('utc'::text, now())
    where id = p_request_id
    returning * into v_request;
    perform public.autonomous_write_request_event(p_request_id, 'preflight_failed', 'operator', null, v_summary, coalesce(p_metadata, '{}'::jsonb));
    return v_request;
  end if;

  select * into v_request from public.autonomous_approval_requests where id = p_request_id;
  return v_request;
end;
$$;

create or replace function public.mark_autonomous_approval_request_executed(
  p_request_id uuid,
  p_system_id text,
  p_action_id text,
  p_execution_result text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.autonomous_approval_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.autonomous_approval_requests%rowtype;
  v_state_status text;
  v_preflight_count integer;
  v_result text := left(nullif(trim(coalesce(p_execution_result, '')), ''), 4000);
begin
  if v_result is null then
    raise exception 'autonomous_execution_result_required';
  end if;
  if public.autonomous_approval_payload_has_secret(coalesce(p_metadata, '{}'::jsonb)) then
    raise exception 'autonomous_approval_secret_metadata_blocked';
  end if;

  select * into v_request
  from public.autonomous_approval_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'autonomous_approval_request_not_found';
  end if;
  if v_request.status <> 'approved' then
    raise exception 'autonomous_approval_request_not_approved';
  end if;
  if v_request.system_id <> p_system_id or v_request.action_id <> p_action_id then
    raise exception 'autonomous_approval_scope_mismatch';
  end if;
  if v_request.expires_at <= timezone('utc'::text, now()) then
    update public.autonomous_approval_requests
    set status = 'expired', updated_at = timezone('utc'::text, now())
    where id = p_request_id;
    perform public.autonomous_write_request_event(p_request_id, 'expired', 'operator', null, 'Approved autonomous request expired before execution.', '{}'::jsonb);
    raise exception 'autonomous_approval_request_expired';
  end if;

  select status into v_state_status
  from public.autonomous_system_emergency_states
  where system_id = v_request.system_id;

  if coalesce(v_state_status, 'active') <> 'active' then
    perform public.autonomous_write_request_event(p_request_id, 'execution_blocked', 'operator', null, 'Autonomous execution blocked by system emergency state.', jsonb_build_object('systemState', coalesce(v_state_status, 'active')));
    raise exception 'autonomous_system_emergency_state_blocks_execution';
  end if;

  select count(*) into v_preflight_count
  from public.autonomous_approval_request_events event
  where event.request_id = p_request_id
    and event.event_type = 'preflight_passed'
    and event.created_at >= coalesce(v_request.approved_at, v_request.created_at);

  if coalesce(v_preflight_count, 0) = 0 then
    perform public.autonomous_write_request_event(p_request_id, 'execution_blocked', 'operator', null, 'Autonomous execution blocked because fresh preflight was not recorded after approval.', '{}'::jsonb);
    raise exception 'autonomous_execution_requires_fresh_preflight';
  end if;

  update public.autonomous_approval_requests
  set
    status = 'executed',
    execution_result = v_result,
    updated_at = timezone('utc'::text, now())
  where id = p_request_id
  returning * into v_request;

  perform public.autonomous_write_request_event(p_request_id, 'executed', 'operator', null, 'Autonomous approved action executed inside approved scope.', coalesce(p_metadata, '{}'::jsonb));

  return v_request;
end;
$$;

create or replace function public.set_autonomous_system_emergency_state(
  p_system_id text,
  p_status text,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.autonomous_system_emergency_states
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text := public.autonomous_actor_authority_role(auth.uid()::text, auth.jwt() ->> 'email');
  v_state public.autonomous_system_emergency_states%rowtype;
  v_reason text := left(nullif(trim(coalesce(p_reason, '')), ''), 2000);
  v_event_type text;
begin
  if v_actor_id is null or v_actor_role is null then
    raise exception 'owner_or_super_admin_required' using errcode = '42501';
  end if;
  if p_system_id not in ('media_automation', 'livekit_operator') then
    raise exception 'autonomous_system_unknown';
  end if;
  if p_status not in ('active', 'paused', 'emergency_stop') then
    raise exception 'autonomous_system_status_invalid';
  end if;
  if v_reason is null then
    raise exception 'autonomous_system_reason_required';
  end if;
  if public.autonomous_approval_payload_has_secret(coalesce(p_metadata, '{}'::jsonb)) then
    raise exception 'autonomous_system_secret_metadata_blocked';
  end if;

  insert into public.autonomous_system_emergency_states (
    system_id,
    status,
    reason,
    updated_by,
    updated_at,
    metadata
  )
  values (
    p_system_id,
    p_status,
    v_reason,
    v_actor_id,
    timezone('utc'::text, now()),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (system_id) do update
  set
    status = excluded.status,
    reason = excluded.reason,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at,
    metadata = excluded.metadata
  returning * into v_state;

  v_event_type := case
    when p_status = 'emergency_stop' then 'emergency_paused'
    when p_status = 'paused' then 'paused'
    else 'resumed'
  end;

  insert into public.autonomous_system_control_events (
    system_id,
    event_type,
    actor_id,
    actor_role,
    event_summary,
    metadata
  )
  values (
    p_system_id,
    v_event_type,
    v_actor_id,
    v_actor_role,
    case
      when p_status = 'emergency_stop' then 'Owner/super-admin put autonomous system into emergency stop.'
      when p_status = 'paused' then 'Owner/super-admin paused autonomous system.'
      else 'Owner/super-admin resumed autonomous system.'
    end,
    jsonb_build_object('reason', v_reason)
  );

  return v_state;
end;
$$;

create or replace function public.read_autonomous_system_emergency_states()
returns setof public.autonomous_system_emergency_states
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.autonomous_actor_has_owner_authority(auth.uid()::text, auth.jwt() ->> 'email') then
    raise exception 'owner_or_super_admin_required' using errcode = '42501';
  end if;

  return query
  select *
  from public.autonomous_system_emergency_states
  order by system_id;
end;
$$;

revoke all on function public.autonomous_approval_payload_has_secret(jsonb) from public;
revoke all on function public.autonomous_actor_has_owner_authority(text, text) from public;
revoke all on function public.autonomous_actor_authority_role(text, text) from public;
revoke all on function public.autonomous_write_request_event(uuid, text, text, uuid, text, jsonb) from public;
revoke all on function public.list_autonomous_approval_requests(text) from public;
revoke all on function public.get_autonomous_approval_request(uuid) from public;
revoke all on function public.approve_autonomous_approval_request(uuid, jsonb) from public;
revoke all on function public.deny_autonomous_approval_request(uuid, text) from public;
revoke all on function public.cancel_autonomous_approval_request(uuid, text) from public;
revoke all on function public.expire_autonomous_approval_requests() from public;
revoke all on function public.mark_autonomous_approval_preflight_result(uuid, boolean, text, jsonb) from public;
revoke all on function public.mark_autonomous_approval_request_executed(uuid, text, text, text, jsonb) from public;
revoke all on function public.set_autonomous_system_emergency_state(text, text, text, jsonb) from public;
revoke all on function public.read_autonomous_system_emergency_states() from public;

grant execute on function public.autonomous_actor_has_owner_authority(text, text) to service_role;
grant execute on function public.autonomous_actor_authority_role(text, text) to service_role;
grant execute on function public.list_autonomous_approval_requests(text) to authenticated, service_role;
grant execute on function public.get_autonomous_approval_request(uuid) to authenticated, service_role;
grant execute on function public.approve_autonomous_approval_request(uuid, jsonb) to authenticated;
grant execute on function public.deny_autonomous_approval_request(uuid, text) to authenticated;
grant execute on function public.cancel_autonomous_approval_request(uuid, text) to authenticated;
grant execute on function public.set_autonomous_system_emergency_state(text, text, text, jsonb) to authenticated;
grant execute on function public.read_autonomous_system_emergency_states() to authenticated, service_role;
grant execute on function public.autonomous_approval_payload_has_secret(jsonb) to service_role;
grant execute on function public.autonomous_write_request_event(uuid, text, text, uuid, text, jsonb) to service_role;
grant execute on function public.expire_autonomous_approval_requests() to service_role;
grant execute on function public.mark_autonomous_approval_preflight_result(uuid, boolean, text, jsonb) to service_role;
grant execute on function public.mark_autonomous_approval_request_executed(uuid, text, text, text, jsonb) to service_role;

comment on table public.autonomous_system_emergency_states is
  'Owner/super-admin emergency state for named autonomous systems only. Blocks autonomous execution while preserving read-only reports.';

comment on table public.autonomous_system_control_events is
  'Append-only owner/super-admin audit for autonomous system pause/resume/emergency controls. No secrets belong in metadata.';

comment on function public.approve_autonomous_approval_request(uuid, jsonb) is
  'Owner/super-admin approval for pending Level 3/4 autonomous requests. Approval never executes; fresh preflight is still required.';

comment on function public.mark_autonomous_approval_request_executed(uuid, text, text, text, jsonb) is
  'Trusted operator execution marker. Requires approved request, exact system/action scope, non-expired approval, active emergency state, and preflight_passed after approval.';
