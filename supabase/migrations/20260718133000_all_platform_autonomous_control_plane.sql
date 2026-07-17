-- All-platform autonomous control-plane parity.
-- Additive only: no rollout, release, provider, money, entitlement, user-right,
-- auth, RLS, moderation-enforcement, build, OTA, or TestFlight action.

set check_function_bodies = false;

create table if not exists public.release_binary_attestations (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('ios', 'android')),
  bundle_identifier text not null,
  app_version text not null,
  native_build text not null,
  runtime_version text,
  channel text,
  distribution_source text not null,
  source_commit text not null,
  binary_sha256 text not null check (binary_sha256 ~ '^[0-9a-f]{64}$'),
  app_store_connect_build_id text,
  play_build_identifier text,
  submission_identifier_hash text check (submission_identifier_hash is null or submission_identifier_hash ~ '^[0-9a-f]{64}$'),
  signing_identity_summary text,
  verification_source text not null,
  attestation_status text not null default 'pending_provider_verification'
    check (attestation_status in ('pending_provider_verification', 'verified', 'mismatch', 'revoked', 'superseded')),
  verified_at timestamptz,
  money_moved boolean not null default false check (money_moved = false),
  release_action_executed boolean not null default false check (release_action_executed = false),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object')
    check (metadata::text !~* '"(secret|token|password|credential|authorization|api[_-]?key|service[_-]?role|private[_-]?key|signed[_-]?url|receipt|p8|p12)"[[:space:]]*:'),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (platform, binary_sha256)
);

alter table public.release_binary_attestations enable row level security;
revoke all on table public.release_binary_attestations from public, anon, authenticated;
grant select, insert, update on table public.release_binary_attestations to service_role;
create index if not exists release_binary_attestations_identity_idx
  on public.release_binary_attestations (platform, bundle_identifier, app_version, native_build, created_at desc);
create index if not exists release_binary_attestations_provider_idx
  on public.release_binary_attestations (app_store_connect_build_id, play_build_identifier, attestation_status);

insert into public.release_binary_attestations (
  platform, bundle_identifier, app_version, native_build, runtime_version, channel,
  distribution_source, source_commit, binary_sha256, app_store_connect_build_id,
  signing_identity_summary, verification_source, attestation_status, metadata
) values (
  'ios', 'com.chillywood.mobile', '1.0.0', '8', '1.0.0-iosqa1', 'ios-qa',
  'testflight_internal', 'bbb9d6db67620b1d39e3a3e67ab8ef7166ce02ae',
  '24a951d58302dd73e13e4adc899fc28680472eb78f37cac04639ee95896e36d8',
  'a6ed5eda-fe76-4dd0-b18c-d00c72b0f00f',
  'reviewed local App Store archive; credential material excluded',
  'config/release/ios-qa.json+sanitized_archive_inspection',
  'pending_provider_verification',
  '{"local_build":true,"eas_cloud_build":false,"testflight_availability_proved":false}'::jsonb
) on conflict (platform, binary_sha256) do nothing;

do $control_plane_platform$
declare
  table_name text;
  constraint_name text;
begin
  foreach table_name in array array[
    'autonomous_approval_requests',
    'autonomous_approval_request_events',
    'owner_command_requests',
    'owner_command_events',
    'owner_command_execution_steps',
    'owner_command_blockers',
    'provider_dashboard_repair_requests'
  ] loop
    execute format('alter table public.%I add column if not exists platform text not null default ''unknown''', table_name);
    constraint_name := table_name || '_platform_check';
    execute format('alter table public.%I drop constraint if exists %I', table_name, constraint_name);
    execute format('alter table public.%I add constraint %I check (platform in (''shared'', ''ios'', ''android'', ''web'', ''unknown''))', table_name, constraint_name);
    execute format('create index if not exists %I on public.%I (platform, created_at desc)', table_name || '_platform_created_idx', table_name);
  end loop;
end;
$control_plane_platform$;

create or replace function public.inherit_autonomous_child_platform()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'autonomous_approval_request_events' then
    select request.platform into new.platform
    from public.autonomous_approval_requests request where request.id = new.request_id;
  elsif tg_table_name = 'owner_command_events' then
    select command.platform into new.platform
    from public.owner_command_requests command where command.id = new.command_id;
  elsif tg_table_name in ('owner_command_execution_steps', 'owner_command_blockers') then
    select command.platform into new.platform
    from public.owner_command_requests command where command.id = new.command_id;
  elsif tg_table_name = 'provider_dashboard_repair_requests' and new.approval_request_id is not null then
    select request.platform into new.platform
    from public.autonomous_approval_requests request where request.id = new.approval_request_id;
  end if;
  new.platform := coalesce(new.platform, 'unknown');
  return new;
end;
$$;

drop trigger if exists autonomous_approval_event_inherit_platform on public.autonomous_approval_request_events;
create trigger autonomous_approval_event_inherit_platform before insert on public.autonomous_approval_request_events
for each row execute function public.inherit_autonomous_child_platform();
drop trigger if exists owner_command_event_inherit_platform on public.owner_command_events;
create trigger owner_command_event_inherit_platform before insert on public.owner_command_events
for each row execute function public.inherit_autonomous_child_platform();
drop trigger if exists owner_command_step_inherit_platform on public.owner_command_execution_steps;
create trigger owner_command_step_inherit_platform before insert or update of command_id on public.owner_command_execution_steps
for each row execute function public.inherit_autonomous_child_platform();
drop trigger if exists owner_command_blocker_inherit_platform on public.owner_command_blockers;
create trigger owner_command_blocker_inherit_platform before insert or update of command_id on public.owner_command_blockers
for each row execute function public.inherit_autonomous_child_platform();
drop trigger if exists provider_repair_inherit_platform on public.provider_dashboard_repair_requests;
create trigger provider_repair_inherit_platform before insert or update of approval_request_id on public.provider_dashboard_repair_requests
for each row execute function public.inherit_autonomous_child_platform();

create or replace function public.assert_autonomous_approval_platform_scope(
  p_request_id uuid,
  p_system_id text,
  p_action_id text,
  p_platform text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.autonomous_approval_requests request
    where request.id = p_request_id
      and request.status = 'approved'
      and request.expires_at > timezone('utc'::text, now())
      and request.system_id = p_system_id
      and request.action_id = p_action_id
      and request.platform = p_platform
  );
$$;
revoke all on function public.assert_autonomous_approval_platform_scope(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.assert_autonomous_approval_platform_scope(uuid, text, text, text) to service_role;

alter table public.device_availability_findings
  add column if not exists testflight_internal_build_available boolean not null default false,
  add column if not exists signed_ios_build_available boolean not null default false,
  add column if not exists ios_physical_device_count integer not null default 0 check (ios_physical_device_count >= 0),
  add column if not exists ios_second_device_available boolean not null default false,
  add column if not exists ios_simulator_available boolean not null default false,
  add column if not exists physical_proof_available boolean not null default false,
  add column if not exists universal_link_proof_available boolean not null default false,
  add column if not exists apns_proof_available boolean not null default false,
  add column if not exists voip_proof_available boolean not null default false,
  add column if not exists storekit_proof_available boolean not null default false;

do $installed_result_vocab$
declare table_name text;
begin
  foreach table_name in array array[
    'installed_traversal_runs', 'route_behavior_findings', 'role_behavior_findings',
    'account_fixture_health_findings', 'device_availability_findings', 'qa_required_review_flags'
  ] loop
    execute format('alter table public.%I drop constraint if exists %I', table_name, table_name || '_result_check');
    execute format(
      'alter table public.%I add constraint %I check (result in (''pass'',''partial'',''blocked'',''failed'',''human_review'',''two_device_required'',''source_ready'',''provider_ready'',''provider_readback_blocked'',''internal_build_ready'',''physical_proof_required'',''second_device_required''))',
      table_name, table_name || '_result_check'
    );
  end loop;
end;
$installed_result_vocab$;

create table if not exists public.autonomous_current_findings (
  id uuid primary key default gen_random_uuid(),
  finding_key text not null unique check (finding_key ~ '^[0-9a-f]{64}$'),
  system_id text not null,
  platform text not null check (platform in ('shared', 'ios', 'android', 'web', 'unknown')),
  finding_type text not null,
  target_surface text not null default 'unknown',
  provider text not null default 'none',
  severity text not null default 'review' check (severity in ('info', 'review', 'warning', 'critical')),
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  first_seen_at timestamptz not null default timezone('utc'::text, now()),
  last_seen_at timestamptz not null default timezone('utc'::text, now()),
  resolved_at timestamptz,
  current_status text not null default 'open' check (current_status in ('open', 'resolved', 'superseded')),
  money_moved boolean not null default false check (money_moved = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object')
    check (metadata::text !~* '"(secret|token|password|credential|authorization|api[_-]?key|service[_-]?role|private[_-]?key|signed[_-]?url|receipt)"[[:space:]]*:'),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.autonomous_finding_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  finding_key text not null,
  system_id text not null,
  platform text not null check (platform in ('shared', 'ios', 'android', 'web', 'unknown')),
  event_type text not null check (event_type in ('opened', 'observed_again', 'resolved', 'superseded')),
  event_summary text not null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object')
    check (metadata::text !~* '"(secret|token|password|credential|authorization|api[_-]?key|service[_-]?role|private[_-]?key|signed[_-]?url|receipt)"[[:space:]]*:'),
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.autonomous_current_findings enable row level security;
alter table public.autonomous_finding_lifecycle_events enable row level security;
revoke all on table public.autonomous_current_findings, public.autonomous_finding_lifecycle_events from public, anon, authenticated;
grant select, insert, update on table public.autonomous_current_findings to service_role;
grant select, insert on table public.autonomous_finding_lifecycle_events to service_role;
create index if not exists autonomous_current_findings_scope_idx
  on public.autonomous_current_findings (system_id, platform, current_status, last_seen_at desc);
create index if not exists autonomous_finding_events_scope_idx
  on public.autonomous_finding_lifecycle_events (system_id, platform, created_at desc);

create or replace function public.record_autonomous_finding(
  p_system_id text,
  p_platform text,
  p_finding_type text,
  p_target_surface text,
  p_provider text default 'none',
  p_severity text default 'review',
  p_metadata jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_existed boolean;
begin
  if p_platform not in ('shared', 'ios', 'android', 'web', 'unknown') then raise exception 'invalid_platform'; end if;
  if p_severity not in ('info', 'review', 'warning', 'critical') then raise exception 'invalid_severity'; end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' or coalesce(p_metadata, '{}'::jsonb)::text ~* '"(secret|token|password|credential|authorization|api[_-]?key|service[_-]?role|private[_-]?key|signed[_-]?url|receipt)"[[:space:]]*:' then
    raise exception 'unsafe_finding_metadata';
  end if;
  v_key := encode(extensions.digest(concat_ws('|', p_system_id, p_platform, p_finding_type, coalesce(p_target_surface, 'unknown'), coalesce(p_provider, 'none')), 'sha256'), 'hex');
  select exists(select 1 from public.autonomous_current_findings where finding_key = v_key and current_status = 'open') into v_existed;
  insert into public.autonomous_current_findings (
    finding_key, system_id, platform, finding_type, target_surface, provider, severity, metadata
  ) values (
    v_key, p_system_id, p_platform, p_finding_type, coalesce(p_target_surface, 'unknown'), coalesce(p_provider, 'none'), p_severity, coalesce(p_metadata, '{}'::jsonb)
  ) on conflict (finding_key) do update set
    occurrence_count = case when public.autonomous_current_findings.current_status = 'open' then public.autonomous_current_findings.occurrence_count + 1 else 1 end,
    last_seen_at = timezone('utc'::text, now()), resolved_at = null, current_status = 'open', severity = excluded.severity,
    metadata = excluded.metadata, updated_at = timezone('utc'::text, now());
  insert into public.autonomous_finding_lifecycle_events (finding_key, system_id, platform, event_type, event_summary, metadata)
  values (v_key, p_system_id, p_platform, case when v_existed then 'observed_again' else 'opened' end,
    case when v_existed then 'Finding observed again; current row updated.' else 'Finding opened.' end, '{}'::jsonb);
  return v_key;
end;
$$;

create or replace function public.resolve_autonomous_findings(
  p_system_id text,
  p_platform text,
  p_active_finding_keys text[] default '{}'::text[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  with resolved as (
    update public.autonomous_current_findings
    set current_status = 'resolved', resolved_at = timezone('utc'::text, now()), updated_at = timezone('utc'::text, now())
    where system_id = p_system_id and platform = p_platform and current_status = 'open'
      and not (finding_key = any(coalesce(p_active_finding_keys, '{}'::text[])))
    returning finding_key
  ), audited as (
    insert into public.autonomous_finding_lifecycle_events (finding_key, system_id, platform, event_type, event_summary, metadata)
    select finding_key, p_system_id, p_platform, 'resolved', 'Finding resolved after successful readback.', '{}'::jsonb from resolved
    returning 1
  ) select count(*) into v_count from audited;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.record_autonomous_finding(text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.resolve_autonomous_findings(text, text, text[]) from public, anon, authenticated;
grant execute on function public.record_autonomous_finding(text, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.resolve_autonomous_findings(text, text, text[]) to service_role;

-- Provider observations stay append-only in autonomous_provider_readback_capabilities.
-- This trigger-maintained table holds the deduplicated current capability state.
create table if not exists public.autonomous_provider_readback_current (
  id uuid primary key default gen_random_uuid(),
  system_id text not null,
  platform text not null check (platform in ('shared','ios','android','web','unknown')),
  provider text not null,
  capability text not null,
  capability_state text not null check (capability_state in ('available','unavailable','blocked','unknown')),
  current_status text not null check (current_status in ('open','resolved')),
  missing_capability text,
  readback_complete boolean not null default false,
  data_source text not null,
  provider_environment text,
  app_version text,
  native_build text,
  bundle_identifier text,
  runtime_version text,
  channel text,
  update_id text,
  distribution_source text,
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  money_moved boolean not null default false check (money_moved = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
    check (metadata::text !~* '"(token|secret|password|credential|authorization|api[_-]?key|service[_-]?role|private[_-]?key|signed[_-]?url)"[[:space:]]*:'),
  unique (system_id, platform, provider, capability)
);

alter table public.autonomous_provider_readback_current enable row level security;
revoke all on table public.autonomous_provider_readback_current from public, anon, authenticated;
grant select, insert, update on table public.autonomous_provider_readback_current to service_role;
create index if not exists autonomous_provider_readback_current_state_idx
  on public.autonomous_provider_readback_current(platform, provider, current_status, last_seen_at desc);

create or replace function public.sync_autonomous_provider_readback_current()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_resolved boolean := new.readback_complete is true and new.capability_state = 'available';
begin
  insert into public.autonomous_provider_readback_current (
    system_id, platform, provider, capability, capability_state, current_status,
    missing_capability, readback_complete, data_source, provider_environment,
    app_version, native_build, bundle_identifier, runtime_version, channel,
    update_id, distribution_source, occurrence_count, first_seen_at, last_seen_at,
    resolved_at, money_moved, user_rights_changed, high_risk_executed, metadata
  ) values (
    new.system_id, new.platform, new.provider, new.capability, new.capability_state,
    case when v_resolved then 'resolved' else 'open' end,
    new.missing_capability, new.readback_complete, new.data_source,
    new.provider_environment, new.app_version, new.native_build,
    new.bundle_identifier, new.runtime_version, new.channel, new.update_id,
    new.distribution_source, 1, new.created_at, new.created_at,
    case when v_resolved then new.created_at else null end,
    false, false, false, new.metadata
  )
  on conflict (system_id, platform, provider, capability) do update set
    capability_state = excluded.capability_state,
    current_status = excluded.current_status,
    missing_capability = excluded.missing_capability,
    readback_complete = excluded.readback_complete,
    data_source = excluded.data_source,
    provider_environment = excluded.provider_environment,
    app_version = excluded.app_version,
    native_build = excluded.native_build,
    bundle_identifier = excluded.bundle_identifier,
    runtime_version = excluded.runtime_version,
    channel = excluded.channel,
    update_id = excluded.update_id,
    distribution_source = excluded.distribution_source,
    occurrence_count = public.autonomous_provider_readback_current.occurrence_count + 1,
    last_seen_at = excluded.last_seen_at,
    resolved_at = excluded.resolved_at,
    money_moved = false,
    user_rights_changed = false,
    high_risk_executed = false,
    metadata = excluded.metadata;
  return new;
end;
$$;

revoke all on function public.sync_autonomous_provider_readback_current() from public, anon, authenticated;
drop trigger if exists autonomous_provider_readback_sync_current on public.autonomous_provider_readback_capabilities;
create trigger autonomous_provider_readback_sync_current
after insert on public.autonomous_provider_readback_capabilities
for each row execute function public.sync_autonomous_provider_readback_current();

comment on table public.release_binary_attestations is 'Service-owned local/cloud binary provenance. No artifact URL, signing material, provider credential, release action, or client write.';
comment on table public.autonomous_current_findings is 'Deduplicated mutable current finding state; immutable lifecycle history is stored separately.';
comment on table public.autonomous_finding_lifecycle_events is 'Append-only finding open/repeat/resolution audit. Rows are never deleted by autonomous probes.';
comment on table public.autonomous_provider_readback_current is 'Deduplicated current provider capability state; append-only observations remain in autonomous_provider_readback_capabilities.';
