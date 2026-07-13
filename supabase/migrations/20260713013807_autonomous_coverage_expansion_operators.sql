-- Final autonomous coverage expansion operators.
-- Systems 2-5 are scoped safe-write/status/finding operators only.
-- System 6 is foundation-only in source/docs and has no live write tables here.

create table if not exists public.platform_recovery_operator_events (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'platform_recovery_operator' check (system_id = 'platform_recovery_operator'),
  actor_type text not null default 'operator',
  actor_id text,
  action_id text not null,
  result text not null,
  environment_mode text not null default 'production',
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.backup_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'platform_recovery_operator' check (system_id = 'platform_recovery_operator'),
  health_state text not null default 'unknown',
  environment_mode text not null default 'production',
  flag_type text not null default 'database_backup_freshness',
  severity text not null default 'review',
  target_type text,
  target_id text,
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.restore_drill_findings (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'platform_recovery_operator' check (system_id = 'platform_recovery_operator'),
  environment_mode text not null default 'production',
  flag_type text not null default 'restore_drill_freshness',
  severity text not null default 'review',
  target_type text,
  target_id text,
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.migration_drift_findings (like public.restore_drill_findings including defaults including constraints including indexes);
alter table public.migration_drift_findings alter column system_id set default 'platform_recovery_operator';
alter table public.migration_drift_findings alter column flag_type set default 'migration_drift_detection';

create table if not exists public.function_deployment_drift_findings (like public.restore_drill_findings including defaults including constraints including indexes);
alter table public.function_deployment_drift_findings alter column system_id set default 'platform_recovery_operator';
alter table public.function_deployment_drift_findings alter column flag_type set default 'function_deployment_drift';

create table if not exists public.scheduled_timer_health_findings (like public.restore_drill_findings including defaults including constraints including indexes);
alter table public.scheduled_timer_health_findings alter column system_id set default 'platform_recovery_operator';
alter table public.scheduled_timer_health_findings alter column flag_type set default 'scheduled_timer_health';

create table if not exists public.recovery_required_review_flags (like public.restore_drill_findings including defaults including constraints including indexes);
alter table public.recovery_required_review_flags alter column system_id set default 'platform_recovery_operator';
alter table public.recovery_required_review_flags alter column flag_type set default 'recovery_required_review';

create table if not exists public.recovery_operator_learning_state (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'platform_recovery_operator' check (system_id = 'platform_recovery_operator'),
  finding_key text not null,
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  last_result text not null default 'review',
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  first_seen_at timestamptz not null default timezone('utc'::text, now()),
  last_seen_at timestamptz not null default timezone('utc'::text, now()),
  unique (system_id, finding_key)
);

create table if not exists public.privacy_operator_events (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'privacy_compliance_operator' check (system_id = 'privacy_compliance_operator'),
  actor_type text not null default 'operator',
  actor_id text,
  action_id text not null,
  result text not null,
  environment_mode text not null default 'production',
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.privacy_request_findings (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'privacy_compliance_operator' check (system_id = 'privacy_compliance_operator'),
  health_state text not null default 'unknown',
  environment_mode text not null default 'production',
  flag_type text not null default 'privacy_request_status',
  severity text not null default 'review',
  target_type text,
  target_id text,
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.privacy_export_plans (like public.privacy_request_findings including defaults including constraints including indexes);
alter table public.privacy_export_plans alter column flag_type set default 'privacy_export_plan';
create table if not exists public.privacy_deletion_plans (like public.privacy_request_findings including defaults including constraints including indexes);
alter table public.privacy_deletion_plans alter column flag_type set default 'privacy_deletion_plan';
create table if not exists public.privacy_required_review_flags (like public.privacy_request_findings including defaults including constraints including indexes);
alter table public.privacy_required_review_flags alter column flag_type set default 'privacy_required_review';
create table if not exists public.pii_exposure_findings (like public.privacy_request_findings including defaults including constraints including indexes);
alter table public.pii_exposure_findings alter column flag_type set default 'pii_exposure_finding';
create table if not exists public.retention_hold_findings (like public.privacy_request_findings including defaults including constraints including indexes);
alter table public.retention_hold_findings alter column flag_type set default 'retention_hold_readback';

create table if not exists public.privacy_operator_learning_state (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'privacy_compliance_operator' check (system_id = 'privacy_compliance_operator'),
  finding_key text not null,
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  last_result text not null default 'review',
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  first_seen_at timestamptz not null default timezone('utc'::text, now()),
  last_seen_at timestamptz not null default timezone('utc'::text, now()),
  unique (system_id, finding_key)
);

create table if not exists public.support_operator_events (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'support_success_operator' check (system_id = 'support_success_operator'),
  actor_type text not null default 'operator',
  actor_id text,
  action_id text not null,
  result text not null,
  environment_mode text not null default 'production',
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.support_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'support_success_operator' check (system_id = 'support_success_operator'),
  health_state text not null default 'unknown',
  environment_mode text not null default 'production',
  flag_type text not null default 'support_inbox_health',
  severity text not null default 'review',
  target_type text,
  target_id text,
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.support_ticket_findings (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'support_success_operator' check (system_id = 'support_success_operator'),
  environment_mode text not null default 'production',
  flag_type text not null default 'support_ticket_finding',
  severity text not null default 'review',
  target_type text,
  target_id text,
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.support_required_review_flags (like public.support_ticket_findings including defaults including constraints including indexes);
alter table public.support_required_review_flags alter column flag_type set default 'support_required_review';
create table if not exists public.support_response_drafts (like public.support_ticket_findings including defaults including constraints including indexes);
alter table public.support_response_drafts alter column flag_type set default 'support_response_draft';
create table if not exists public.support_escalation_records (like public.support_ticket_findings including defaults including constraints including indexes);
alter table public.support_escalation_records alter column flag_type set default 'support_escalation_record';

create table if not exists public.support_operator_learning_state (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'support_success_operator' check (system_id = 'support_success_operator'),
  finding_key text not null,
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  last_result text not null default 'review',
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  first_seen_at timestamptz not null default timezone('utc'::text, now()),
  last_seen_at timestamptz not null default timezone('utc'::text, now()),
  unique (system_id, finding_key)
);

create table if not exists public.search_operator_events (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'search_ranking_integrity_operator' check (system_id = 'search_ranking_integrity_operator'),
  actor_type text not null default 'operator',
  actor_id text,
  action_id text not null,
  result text not null,
  environment_mode text not null default 'production',
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.search_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'search_ranking_integrity_operator' check (system_id = 'search_ranking_integrity_operator'),
  health_state text not null default 'unknown',
  environment_mode text not null default 'production',
  flag_type text not null default 'search_health',
  severity text not null default 'review',
  target_type text,
  target_id text,
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.ranking_integrity_findings (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'search_ranking_integrity_operator' check (system_id = 'search_ranking_integrity_operator'),
  environment_mode text not null default 'production',
  flag_type text not null default 'ranking_integrity_finding',
  severity text not null default 'review',
  target_type text,
  target_id text,
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.recommendation_quality_findings (like public.ranking_integrity_findings including defaults including constraints including indexes);
alter table public.recommendation_quality_findings alter column flag_type set default 'recommendation_quality_finding';
create table if not exists public.visibility_anomaly_findings (like public.ranking_integrity_findings including defaults including constraints including indexes);
alter table public.visibility_anomaly_findings alter column flag_type set default 'visibility_anomaly_finding';
create table if not exists public.search_required_review_flags (like public.ranking_integrity_findings including defaults including constraints including indexes);
alter table public.search_required_review_flags alter column flag_type set default 'search_required_review';

create table if not exists public.search_operator_learning_state (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'search_ranking_integrity_operator' check (system_id = 'search_ranking_integrity_operator'),
  finding_key text not null,
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  last_result text not null default 'review',
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  first_seen_at timestamptz not null default timezone('utc'::text, now()),
  last_seen_at timestamptz not null default timezone('utc'::text, now()),
  unique (system_id, finding_key)
);

do $$
declare
  safe_table_name text;
begin
  foreach safe_table_name in array array[
    'platform_recovery_operator_events',
    'backup_health_snapshots',
    'restore_drill_findings',
    'migration_drift_findings',
    'function_deployment_drift_findings',
    'scheduled_timer_health_findings',
    'recovery_required_review_flags',
    'recovery_operator_learning_state',
    'privacy_operator_events',
    'privacy_request_findings',
    'privacy_export_plans',
    'privacy_deletion_plans',
    'privacy_required_review_flags',
    'pii_exposure_findings',
    'retention_hold_findings',
    'privacy_operator_learning_state',
    'support_operator_events',
    'support_health_snapshots',
    'support_ticket_findings',
    'support_required_review_flags',
    'support_response_drafts',
    'support_escalation_records',
    'support_operator_learning_state',
    'search_operator_events',
    'search_health_snapshots',
    'ranking_integrity_findings',
    'recommendation_quality_findings',
    'visibility_anomaly_findings',
    'search_required_review_flags',
    'search_operator_learning_state'
  ] loop
    execute format('alter table public.%I add column if not exists fake_proof boolean not null default false', safe_table_name);
    execute format('alter table public.%I drop constraint if exists %I', safe_table_name, safe_table_name || '_fake_proof_false');
    execute format('alter table public.%I add constraint %I check (fake_proof = false)', safe_table_name, safe_table_name || '_fake_proof_false');
  end loop;
end $$;

alter table public.platform_recovery_operator_events enable row level security;
alter table public.backup_health_snapshots enable row level security;
alter table public.restore_drill_findings enable row level security;
alter table public.migration_drift_findings enable row level security;
alter table public.function_deployment_drift_findings enable row level security;
alter table public.scheduled_timer_health_findings enable row level security;
alter table public.recovery_required_review_flags enable row level security;
alter table public.recovery_operator_learning_state enable row level security;
alter table public.privacy_operator_events enable row level security;
alter table public.privacy_request_findings enable row level security;
alter table public.privacy_export_plans enable row level security;
alter table public.privacy_deletion_plans enable row level security;
alter table public.privacy_required_review_flags enable row level security;
alter table public.pii_exposure_findings enable row level security;
alter table public.retention_hold_findings enable row level security;
alter table public.privacy_operator_learning_state enable row level security;
alter table public.support_operator_events enable row level security;
alter table public.support_health_snapshots enable row level security;
alter table public.support_ticket_findings enable row level security;
alter table public.support_required_review_flags enable row level security;
alter table public.support_response_drafts enable row level security;
alter table public.support_escalation_records enable row level security;
alter table public.support_operator_learning_state enable row level security;
alter table public.search_operator_events enable row level security;
alter table public.search_health_snapshots enable row level security;
alter table public.ranking_integrity_findings enable row level security;
alter table public.recommendation_quality_findings enable row level security;
alter table public.visibility_anomaly_findings enable row level security;
alter table public.search_required_review_flags enable row level security;
alter table public.search_operator_learning_state enable row level security;

revoke all on table
  public.platform_recovery_operator_events,
  public.backup_health_snapshots,
  public.restore_drill_findings,
  public.migration_drift_findings,
  public.function_deployment_drift_findings,
  public.scheduled_timer_health_findings,
  public.recovery_required_review_flags,
  public.recovery_operator_learning_state,
  public.privacy_operator_events,
  public.privacy_request_findings,
  public.privacy_export_plans,
  public.privacy_deletion_plans,
  public.privacy_required_review_flags,
  public.pii_exposure_findings,
  public.retention_hold_findings,
  public.privacy_operator_learning_state,
  public.support_operator_events,
  public.support_health_snapshots,
  public.support_ticket_findings,
  public.support_required_review_flags,
  public.support_response_drafts,
  public.support_escalation_records,
  public.support_operator_learning_state,
  public.search_operator_events,
  public.search_health_snapshots,
  public.ranking_integrity_findings,
  public.recommendation_quality_findings,
  public.visibility_anomaly_findings,
  public.search_required_review_flags,
  public.search_operator_learning_state
from anon, authenticated;

grant select, insert, update on table
  public.platform_recovery_operator_events,
  public.backup_health_snapshots,
  public.restore_drill_findings,
  public.migration_drift_findings,
  public.function_deployment_drift_findings,
  public.scheduled_timer_health_findings,
  public.recovery_required_review_flags,
  public.recovery_operator_learning_state,
  public.privacy_operator_events,
  public.privacy_request_findings,
  public.privacy_export_plans,
  public.privacy_deletion_plans,
  public.privacy_required_review_flags,
  public.pii_exposure_findings,
  public.retention_hold_findings,
  public.privacy_operator_learning_state,
  public.support_operator_events,
  public.support_health_snapshots,
  public.support_ticket_findings,
  public.support_required_review_flags,
  public.support_response_drafts,
  public.support_escalation_records,
  public.support_operator_learning_state,
  public.search_operator_events,
  public.search_health_snapshots,
  public.ranking_integrity_findings,
  public.recommendation_quality_findings,
  public.visibility_anomaly_findings,
  public.search_required_review_flags,
  public.search_operator_learning_state
to service_role;

alter table public.autonomous_approval_requests
  drop constraint if exists autonomous_approval_requests_requested_by_actor_type_check,
  add constraint autonomous_approval_requests_requested_by_actor_type_check check (
    requested_by_actor_type in (
      'operator',
      'livekit_operator',
      'media_automation',
      'money_flow_control',
      'notification_delivery_operator',
      'release_ota_operator',
      'security_owner_operator',
      'moderation_safety_operator',
      'observability_runtime_operator',
      'installed_product_qa_operator',
      'platform_recovery_operator',
      'privacy_compliance_operator',
      'support_success_operator',
      'search_ranking_integrity_operator',
      'owner_command_operator',
      'rachi',
      'admin',
      'moderator',
      'super_admin',
      'owner'
    )
  );

alter table public.autonomous_approval_request_events
  drop constraint if exists autonomous_approval_request_events_actor_type_check,
  add constraint autonomous_approval_request_events_actor_type_check check (
    actor_type in (
      'operator',
      'livekit_operator',
      'media_automation',
      'money_flow_control',
      'notification_delivery_operator',
      'release_ota_operator',
      'security_owner_operator',
      'moderation_safety_operator',
      'observability_runtime_operator',
      'installed_product_qa_operator',
      'platform_recovery_operator',
      'privacy_compliance_operator',
      'support_success_operator',
      'search_ranking_integrity_operator',
      'owner_command_operator',
      'rachi',
      'admin',
      'moderator',
      'super_admin',
      'owner',
      'system'
    )
  );

alter table public.owner_command_events
  drop constraint if exists owner_command_events_actor_type_check,
  add constraint owner_command_events_actor_type_check check (
    actor_type in (
      'owner',
      'super_admin',
      'rachi',
      'operator',
      'owner_command_operator',
      'media_automation',
      'livekit_operator',
      'money_flow_control',
      'notification_delivery_operator',
      'release_ota_operator',
      'security_owner_operator',
      'moderation_safety_operator',
      'observability_runtime_operator',
      'installed_product_qa_operator',
      'platform_recovery_operator',
      'privacy_compliance_operator',
      'support_success_operator',
      'search_ranking_integrity_operator',
      'ads_sponsor_delivery_operator',
      'system'
    )
  );

insert into public.backup_health_snapshots (health_state, metadata)
values ('review', '{"safe_proof":"watch_once writes backup freshness status only","restore_executed":false,"highRiskExecuted":false}'::jsonb);
insert into public.privacy_request_findings (flag_type, severity, metadata)
values ('privacy_request_status', 'review', '{"safe_proof":"request/status finding only","export_executed":false,"deletion_executed":false}'::jsonb);
insert into public.support_health_snapshots (health_state, metadata)
values ('review', '{"safe_proof":"support queue health status only","external_message_sent":false,"refund_executed":false}'::jsonb);
insert into public.search_health_snapshots (health_state, metadata)
values ('review', '{"safe_proof":"search/ranking health status only","ranking_changed":false,"hidden_enforcement":false}'::jsonb);

comment on table public.platform_recovery_operator_events is 'Platform Recovery Operator safe audit events; no restore, deletion, secret rotation, provider config, or R2/media mutation.';
comment on table public.privacy_operator_events is 'Privacy Compliance Operator safe audit events; no data export/deletion or legal hold bypass.';
comment on table public.support_operator_events is 'Support Success Operator safe audit events; no refunds, Premium grants, auth mutation, or external legal/payment commitment.';
comment on table public.search_operator_events is 'Search Ranking Integrity Operator safe audit events; no hidden shadowban, ranking mutation, content deletion, or exposure change.';
