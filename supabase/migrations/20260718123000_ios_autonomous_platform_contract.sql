-- Additive platform-aware autonomous operator contract for iOS.
-- This migration adds status/readback dimensions only. It does not send push,
-- publish or roll back a release, change a rollout, move money, grant access,
-- change user rights, or weaken RLS.

set check_function_bodies = false;

create table if not exists public.autonomous_provider_readback_capabilities (
  id uuid primary key default gen_random_uuid(),
  system_id text not null,
  platform text not null default 'unknown'
    check (platform in ('shared', 'ios', 'android', 'web', 'unknown')),
  provider text not null,
  capability text not null,
  capability_state text not null
    check (capability_state in ('available', 'unavailable', 'blocked', 'unknown')),
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
  window_start timestamptz,
  window_end timestamptz,
  money_moved boolean not null default false check (money_moved = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object')
    check (metadata::text !~* '"(token|secret|password|credential|authorization|api[_-]?key|service[_-]?role|private[_-]?key|signed[_-]?url)"[[:space:]]*:'),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.autonomous_scheduler_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  system_id text not null,
  surface_id text not null,
  platform text not null default 'shared'
    check (platform in ('shared', 'ios', 'android', 'web', 'unknown')),
  scheduler text not null,
  schedule text,
  enabled boolean,
  health_state text not null check (health_state in ('healthy', 'degraded', 'critical', 'blocked', 'unknown')),
  last_run_at timestamptz,
  retry_backlog integer not null default 0 check (retry_backlog >= 0),
  failed_attempt_count integer not null default 0 check (failed_attempt_count >= 0),
  capped_attempt_count integer not null default 0 check (capped_attempt_count >= 0),
  readback_complete boolean not null default false,
  data_source text not null,
  money_moved boolean not null default false check (money_moved = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object')
    check (metadata::text !~* '"(token|secret|password|credential|authorization|api[_-]?key|service[_-]?role|private[_-]?key|signed[_-]?url)"[[:space:]]*:'),
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.autonomous_provider_readback_capabilities enable row level security;
alter table public.autonomous_scheduler_health_snapshots enable row level security;
revoke all on table public.autonomous_provider_readback_capabilities from public, anon, authenticated;
revoke all on table public.autonomous_scheduler_health_snapshots from public, anon, authenticated;
grant all on table public.autonomous_provider_readback_capabilities to postgres, service_role;
grant all on table public.autonomous_scheduler_health_snapshots to postgres, service_role;

create index if not exists autonomous_provider_readback_platform_created_idx
  on public.autonomous_provider_readback_capabilities (platform, provider, created_at desc);
create index if not exists autonomous_provider_readback_build_runtime_idx
  on public.autonomous_provider_readback_capabilities (native_build, runtime_version, channel, created_at desc);
create index if not exists autonomous_scheduler_health_system_created_idx
  on public.autonomous_scheduler_health_snapshots (system_id, surface_id, created_at desc);

do $platform_columns$
declare
  table_name text;
  constraint_name text;
begin
  foreach table_name in array array[
    'notification_operator_events',
    'notification_delivery_health_snapshots',
    'notification_provider_sync_status',
    'notification_required_review_flags',
    'release_operator_events',
    'release_health_snapshots',
    'release_required_review_flags',
    'ota_diagnostics_readback_records',
    'rollout_anomaly_findings',
    'rollback_readiness_records',
    'observability_operator_events',
    'runtime_health_snapshots',
    'crash_cluster_findings',
    'js_error_findings',
    'performance_regression_findings',
    'analytics_delivery_findings',
    'release_health_findings',
    'backend_error_rate_findings',
    'observability_required_review_flags',
    'installed_qa_operator_events',
    'installed_traversal_runs',
    'route_behavior_findings',
    'role_behavior_findings',
    'account_fixture_health_findings',
    'device_availability_findings',
    'qa_required_review_flags',
    'livekit_operator_events',
    'livekit_operator_recovery_actions',
    'livekit_surface_health_snapshots',
    'money_operator_events',
    'money_reconciliation_runs',
    'money_reconciliation_findings',
    'money_provider_sync_status',
    'money_required_review_flags',
    'money_flow_health_snapshots',
    'security_operator_events',
    'security_health_snapshots',
    'security_required_review_flags',
    'platform_recovery_operator_events',
    'backup_health_snapshots',
    'migration_drift_findings',
    'function_deployment_drift_findings',
    'scheduled_timer_health_findings',
    'recovery_required_review_flags',
    'privacy_operator_events',
    'privacy_request_findings',
    'privacy_required_review_flags',
    'pii_exposure_findings',
    'support_operator_events',
    'support_health_snapshots',
    'support_ticket_findings',
    'support_required_review_flags',
    'owner_command_requests',
    'owner_command_events',
    'moderation_operator_events',
    'moderation_health_snapshots',
    'search_operator_events',
    'search_health_snapshots'
  ] loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;
    execute format('alter table public.%I add column if not exists platform text not null default ''unknown''', table_name);
    constraint_name := 'autonomous_platform_' || substr(md5(table_name), 1, 12) || '_check';
    execute format('alter table public.%I drop constraint if exists %I', table_name, constraint_name);
    execute format(
      'alter table public.%I add constraint %I check (platform in (''shared'', ''ios'', ''android'', ''web'', ''unknown''))',
      table_name,
      constraint_name
    );
    execute format('create index if not exists %I on public.%I (platform, created_at desc)', 'autonomous_platform_' || substr(md5(table_name), 1, 12) || '_idx', table_name);
  end loop;
end;
$platform_columns$;

do $identity_columns$
declare
  table_name text;
begin
  foreach table_name in array array[
    'notification_delivery_health_snapshots',
    'release_health_snapshots',
    'ota_diagnostics_readback_records',
    'rollout_anomaly_findings',
    'rollback_readiness_records',
    'runtime_health_snapshots',
    'crash_cluster_findings',
    'js_error_findings',
    'performance_regression_findings',
    'analytics_delivery_findings',
    'release_health_findings',
    'backend_error_rate_findings',
    'installed_qa_operator_events',
    'installed_traversal_runs',
    'route_behavior_findings',
    'role_behavior_findings',
    'account_fixture_health_findings',
    'device_availability_findings',
    'qa_required_review_flags',
    'livekit_operator_events',
    'livekit_surface_health_snapshots',
    'money_provider_sync_status',
    'money_flow_health_snapshots',
    'security_health_snapshots',
    'security_required_review_flags',
    'migration_drift_findings',
    'function_deployment_drift_findings',
    'scheduled_timer_health_findings',
    'recovery_required_review_flags',
    'privacy_request_findings',
    'privacy_required_review_flags',
    'support_health_snapshots',
    'support_ticket_findings',
    'support_required_review_flags'
  ] loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;
    execute format('alter table public.%I add column if not exists app_version text', table_name);
    execute format('alter table public.%I add column if not exists native_build text', table_name);
    execute format('alter table public.%I add column if not exists bundle_identifier text', table_name);
    execute format('alter table public.%I add column if not exists runtime_version text', table_name);
    execute format('alter table public.%I add column if not exists channel text', table_name);
    execute format('alter table public.%I add column if not exists update_id text', table_name);
    execute format('alter table public.%I add column if not exists distribution_source text', table_name);
    execute format('alter table public.%I add column if not exists provider_environment text', table_name);
    execute format('alter table public.%I add column if not exists data_source text', table_name);
    execute format('alter table public.%I add column if not exists readback_complete boolean not null default false', table_name);
    execute format('alter table public.%I add column if not exists window_start timestamptz', table_name);
    execute format('alter table public.%I add column if not exists window_end timestamptz', table_name);
    execute format(
      'create index if not exists %I on public.%I (native_build, runtime_version, channel, created_at desc)',
      'autonomous_identity_' || substr(md5(table_name), 1, 12) || '_idx',
      table_name
    );
  end loop;
end;
$identity_columns$;

alter table public.notification_delivery_health_snapshots
  add column if not exists invalid_token_count integer not null default 0 check (invalid_token_count >= 0),
  add column if not exists provider_response_class text;

-- Truthful backfill: backend control rows are shared; ambiguous historical
-- client/provider rows remain unknown. Play-installed evidence is Android.
update public.security_operator_events set platform = 'shared' where platform = 'unknown';
update public.platform_recovery_operator_events set platform = 'shared' where platform = 'unknown';
update public.privacy_operator_events set platform = 'shared' where platform = 'unknown';
update public.support_operator_events set platform = 'shared' where platform = 'unknown';
update public.moderation_operator_events set platform = 'shared' where platform = 'unknown';
update public.search_operator_events set platform = 'shared' where platform = 'unknown';
update public.money_operator_events set platform = 'shared' where platform = 'unknown';
update public.installed_qa_operator_events set platform = 'android' where platform = 'unknown' and source = 'play_installed';
update public.installed_traversal_runs set platform = 'android' where platform = 'unknown' and source = 'play_installed';

-- Extend installed-product proof vocabulary without converting device-required
-- evidence into a generic pass. Android and existing proof sources remain valid.
do $installed_qa_vocab$
declare
  table_name text;
  source_values constant text := '''testflight_internal'', ''physical_ios'', ''ios_simulator'', ''eas_internal_ios'', ''app_store_internal'', ''play_installed'', ''browserstack'', ''firebase_test_lab_uploaded_artifact'', ''local_fixture'', ''manual_codex_proof''';
  result_values constant text := '''pass'', ''partial'', ''blocked'', ''failed'', ''human_review'', ''two_device_required'', ''source_ready'', ''provider_ready'', ''internal_build_ready'', ''physical_proof_required'', ''second_device_required''';
begin
  foreach table_name in array array[
    'installed_qa_operator_events',
    'installed_traversal_runs',
    'route_behavior_findings',
    'role_behavior_findings',
    'account_fixture_health_findings',
    'device_availability_findings',
    'qa_required_review_flags'
  ] loop
    execute format('alter table public.%I drop constraint if exists %I', table_name, table_name || '_source_check');
    execute format(
      'alter table public.%I add constraint %I check (source in (%s))',
      table_name,
      table_name || '_source_check',
      source_values
    );
  end loop;

  foreach table_name in array array[
    'installed_traversal_runs',
    'route_behavior_findings',
    'role_behavior_findings',
    'account_fixture_health_findings',
    'device_availability_findings',
    'qa_required_review_flags'
  ] loop
    execute format('alter table public.%I drop constraint if exists %I', table_name, table_name || '_result_check');
    execute format(
      'alter table public.%I add constraint %I check (result in (%s))',
      table_name,
      table_name || '_result_check',
      result_values
    );
  end loop;
end;
$installed_qa_vocab$;

create or replace function public.get_ios_autonomous_call_retry_readback()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with config as (
    select enabled
    from public.chat_call_transition_retry_config
    where singleton is true
  ), job as (
    select schedule, active
    from cron.job
    where jobname = 'chilly-chat-call-transition-retry'
    limit 1
  ), deliveries as (
    select
      count(*) filter (where delivery_status = 'pending')::integer as pending_count,
      count(*) filter (where delivery_status = 'failed' and attempt_count < 10)::integer as failed_count,
      count(*) filter (
        where delivery_status = 'dispatching'
          and coalesce(last_attempt_at, updated_at) <= timezone('utc'::text, now()) - interval '2 minutes'
      )::integer as stale_dispatching_count,
      count(*) filter (where delivery_status = 'failed' and attempt_count >= 10)::integer as capped_count
    from public.chat_call_transition_deliveries
  ), failures as (
    select
      count(*) filter (where resolved_at is null and severity = 'warning')::integer as warning_count,
      count(*) filter (where resolved_at is null and severity = 'critical')::integer as critical_count
    from public.chat_call_transition_delivery_failures
  )
  select jsonb_build_object(
    'enabled', coalesce((select enabled from config), false),
    'scheduleExists', exists(select 1 from job),
    'schedule', (select schedule from job),
    'scheduleActive', coalesce((select active from job), false),
    'pendingCount', coalesce((select pending_count from deliveries), 0),
    'failedCount', coalesce((select failed_count from deliveries), 0),
    'staleDispatchingCount', coalesce((select stale_dispatching_count from deliveries), 0),
    'cappedCount', coalesce((select capped_count from deliveries), 0),
    'unresolvedWarningCount', coalesce((select warning_count from failures), 0),
    'unresolvedCriticalCount', coalesce((select critical_count from failures), 0),
    'readbackComplete', true
  );
$$;

revoke all on function public.get_ios_autonomous_call_retry_readback() from public, anon, authenticated;
grant execute on function public.get_ios_autonomous_call_retry_readback() to service_role;

comment on table public.autonomous_provider_readback_capabilities is
  'Sanitized platform/provider capability readback only. No provider secret, token, receipt, signed URL, money movement, user-right mutation, or release action.';
comment on table public.autonomous_scheduler_health_snapshots is
  'Sanitized scheduler/readback health only. No scheduled request secret, service-role key, raw token, money movement, user-right mutation, or release action.';
comment on function public.get_ios_autonomous_call_retry_readback() is
  'Service-role-only sanitized retry/scheduler summary. It returns no token hash, Vault value, delivery token, invite identity, or credential.';

create or replace function public.get_ios_autonomous_recovery_readback()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_migrations_aligned boolean := false;
  v_retry jsonb := '{}'::jsonb;
  v_release jsonb := '{}'::jsonb;
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    select count(*) = 4
    into v_migrations_aligned
    from supabase_migrations.schema_migrations migration
    where migration.version in ('20260718091500', '20260718103000', '20260718110000', '20260718111500');
  end if;

  select public.get_ios_autonomous_call_retry_readback() into v_retry;
  select jsonb_build_object(
    'snapshotExists', true,
    'runtimeVersion', snapshot.runtime_version,
    'channel', snapshot.channel,
    'nativeBuild', snapshot.native_build,
    'readbackComplete', snapshot.readback_complete,
    'rollbackTargetRecorded', exists (
      select 1 from public.rollback_readiness_records rollback
      where rollback.platform = 'ios'
        and rollback.rollback_available is true
    )
  )
  into v_release
  from public.release_health_snapshots snapshot
  where snapshot.platform = 'ios'
  order by snapshot.created_at desc
  limit 1;

  return jsonb_build_object(
    'migrationsAligned', v_migrations_aligned,
    'requiredFunctionsPresent',
      to_regprocedure('public.process_revenuecat_premium_event_atomic(text,text,text,uuid,text,text,text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,integer,text,text,text,text,text,uuid,uuid)') is not null
      and to_regprocedure('public.transition_chilly_chat_call_invite(uuid,uuid,text,integer)') is not null,
    'terminalRetry', coalesce(v_retry, '{}'::jsonb),
    'release', coalesce(v_release, jsonb_build_object('snapshotExists', false)),
    'readbackComplete', true
  );
end;
$$;

revoke all on function public.get_ios_autonomous_recovery_readback() from public, anon, authenticated;
grant execute on function public.get_ios_autonomous_recovery_readback() to service_role;

comment on function public.get_ios_autonomous_recovery_readback() is
  'Service-role-only sanitized iOS migration/function/retry/release recovery readiness. It performs no restore, rollout, release, credential, money, or user-right mutation.';
