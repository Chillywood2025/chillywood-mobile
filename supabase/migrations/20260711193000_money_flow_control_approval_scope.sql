-- Add the money_flow_control autonomous system to the existing approval
-- framework. This only expands approval/audit naming and emergency-state
-- scope; it does not create money movement, payout, checkout, Premium grant,
-- provider-mode, or ledger mutation authority.

alter table public.autonomous_approval_requests
  drop constraint if exists autonomous_approval_requests_requested_by_actor_type_check;

alter table public.autonomous_approval_requests
  add constraint autonomous_approval_requests_requested_by_actor_type_check
  check (
    requested_by_actor_type in (
      'operator',
      'livekit_operator',
      'media_automation',
      'money_flow_control',
      'rachi',
      'admin',
      'owner'
    )
  );

alter table public.autonomous_approval_request_events
  drop constraint if exists autonomous_approval_request_events_actor_type_check;

alter table public.autonomous_approval_request_events
  add constraint autonomous_approval_request_events_actor_type_check
  check (
    actor_type in (
      'operator',
      'livekit_operator',
      'media_automation',
      'money_flow_control',
      'rachi',
      'admin',
      'owner',
      'system'
    )
  );

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
  if p_system_id not in ('media_automation', 'livekit_operator', 'money_flow_control') then
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

revoke all on function public.set_autonomous_system_emergency_state(text, text, text, jsonb) from public;
grant execute on function public.set_autonomous_system_emergency_state(text, text, text, jsonb) to authenticated;
