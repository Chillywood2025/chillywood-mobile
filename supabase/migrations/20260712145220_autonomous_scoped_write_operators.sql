-- Scoped-write operator tables for notification, release/OTA, security/owner,
-- and moderation/safety autonomous systems. These tables are status, finding,
-- review, audit, and learning surfaces only. They do not grant broad mutation,
-- money movement, owner-role mutation, release publishing, or enforcement.

create table if not exists public.notification_operator_events (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'notification_delivery_operator' check (system_id = 'notification_delivery_operator'),
  actor_type text not null default 'operator',
  actor_id text,
  action_id text not null,
  result text not null,
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.notification_delivery_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'notification_delivery_operator' check (system_id = 'notification_delivery_operator'),
  health_state text not null,
  provider text,
  retry_backlog integer not null default 0 check (retry_backlog >= 0),
  failed_attempt_count integer not null default 0 check (failed_attempt_count >= 0),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.notification_provider_sync_status (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'notification_delivery_operator' check (system_id = 'notification_delivery_operator'),
  provider text not null,
  capability text not null,
  sync_status text not null check (sync_status in ('synced', 'stale', 'failed', 'blocked', 'unknown')),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  last_checked_at timestamptz not null default now(),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.notification_required_review_flags (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'notification_delivery_operator' check (system_id = 'notification_delivery_operator'),
  flag_type text not null,
  severity text not null default 'review' check (severity in ('info', 'review', 'warning', 'critical')),
  target_type text,
  target_id text,
  review_status text not null default 'open' check (review_status in ('open', 'reviewed', 'superseded')),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_duplicate_dedupe_records (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'notification_delivery_operator' check (system_id = 'notification_delivery_operator'),
  dedupe_key text not null,
  duplicate_count integer not null default 1 check (duplicate_count >= 1),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.notification_operator_learning_state (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'notification_delivery_operator' check (system_id = 'notification_delivery_operator'),
  incident_key text not null,
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  last_recommended_action text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.release_operator_events (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'release_ota_operator' check (system_id = 'release_ota_operator'),
  actor_type text not null default 'operator',
  actor_id text,
  action_id text not null,
  result text not null,
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.release_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'release_ota_operator' check (system_id = 'release_ota_operator'),
  health_state text not null,
  channel text,
  runtime_version text,
  update_id text,
  embedded_launch boolean,
  emergency_launch boolean,
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.release_required_review_flags (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'release_ota_operator' check (system_id = 'release_ota_operator'),
  flag_type text not null,
  severity text not null default 'review' check (severity in ('info', 'review', 'warning', 'critical')),
  review_status text not null default 'open' check (review_status in ('open', 'reviewed', 'superseded')),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ota_diagnostics_readback_records (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'release_ota_operator' check (system_id = 'release_ota_operator'),
  channel text,
  runtime_version text,
  update_id text,
  embedded_launch boolean,
  emergency_launch boolean,
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.rollout_anomaly_findings (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'release_ota_operator' check (system_id = 'release_ota_operator'),
  anomaly_type text not null,
  severity text not null default 'review' check (severity in ('info', 'review', 'warning', 'critical')),
  review_status text not null default 'open' check (review_status in ('open', 'reviewed', 'superseded')),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.rollback_readiness_records (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'release_ota_operator' check (system_id = 'release_ota_operator'),
  readiness_state text not null default 'review',
  rollback_available boolean not null default false,
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.release_operator_learning_state (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'release_ota_operator' check (system_id = 'release_ota_operator'),
  incident_key text not null,
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  last_recommended_action text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.security_operator_events (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'security_owner_operator' check (system_id = 'security_owner_operator'),
  actor_type text not null default 'operator',
  actor_id text,
  action_id text not null,
  result text not null,
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.security_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'security_owner_operator' check (system_id = 'security_owner_operator'),
  health_state text not null,
  critical_finding_count integer not null default 0 check (critical_finding_count >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.security_required_review_flags (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'security_owner_operator' check (system_id = 'security_owner_operator'),
  flag_type text not null,
  severity text not null default 'review' check (severity in ('info', 'review', 'warning', 'critical')),
  review_status text not null default 'open' check (review_status in ('open', 'reviewed', 'superseded')),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.secret_scan_findings (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'security_owner_operator' check (system_id = 'security_owner_operator'),
  finding_type text not null,
  severity text not null default 'review' check (severity in ('info', 'review', 'warning', 'critical')),
  review_status text not null default 'open' check (review_status in ('open', 'reviewed', 'superseded')),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.owner_authority_integrity_findings (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'security_owner_operator' check (system_id = 'security_owner_operator'),
  finding_type text not null,
  severity text not null default 'review' check (severity in ('info', 'review', 'warning', 'critical')),
  review_status text not null default 'open' check (review_status in ('open', 'reviewed', 'superseded')),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.approval_integrity_findings (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'security_owner_operator' check (system_id = 'security_owner_operator'),
  finding_type text not null,
  severity text not null default 'review' check (severity in ('info', 'review', 'warning', 'critical')),
  review_status text not null default 'open' check (review_status in ('open', 'reviewed', 'superseded')),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.security_operator_learning_state (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'security_owner_operator' check (system_id = 'security_owner_operator'),
  incident_key text not null,
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  last_recommended_action text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.moderation_operator_events (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'moderation_safety_operator' check (system_id = 'moderation_safety_operator'),
  actor_type text not null default 'operator',
  actor_id text,
  action_id text not null,
  result text not null,
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'moderation_safety_operator' check (system_id = 'moderation_safety_operator'),
  health_state text not null,
  stale_case_count integer not null default 0 check (stale_case_count >= 0),
  urgent_review_count integer not null default 0 check (urgent_review_count >= 0),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_required_review_flags (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'moderation_safety_operator' check (system_id = 'moderation_safety_operator'),
  flag_type text not null,
  severity text not null default 'review' check (severity in ('info', 'review', 'warning', 'critical')),
  review_status text not null default 'open' check (review_status in ('open', 'reviewed', 'superseded')),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.moderation_case_priority_flags (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'moderation_safety_operator' check (system_id = 'moderation_safety_operator'),
  flag_type text not null,
  priority text not null default 'review' check (priority in ('low', 'review', 'high', 'urgent')),
  review_status text not null default 'open' check (review_status in ('open', 'reviewed', 'superseded')),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.safety_review_recommendations (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'moderation_safety_operator' check (system_id = 'moderation_safety_operator'),
  recommendation_type text not null,
  severity text not null default 'review' check (severity in ('info', 'review', 'warning', 'critical')),
  review_status text not null default 'open' check (review_status in ('open', 'reviewed', 'superseded')),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_duplicate_report_detections (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'moderation_safety_operator' check (system_id = 'moderation_safety_operator'),
  dedupe_key text not null,
  report_count integer not null default 1 check (report_count >= 1),
  review_status text not null default 'open' check (review_status in ('open', 'reviewed', 'superseded')),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_stale_case_findings (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'moderation_safety_operator' check (system_id = 'moderation_safety_operator'),
  case_type text not null,
  stale_age_seconds integer not null default 0 check (stale_age_seconds >= 0),
  review_status text not null default 'open' check (review_status in ('open', 'reviewed', 'superseded')),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_operator_learning_state (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'moderation_safety_operator' check (system_id = 'moderation_safety_operator'),
  incident_key text not null,
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  last_recommended_action text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create index if not exists notification_operator_events_created_idx on public.notification_operator_events (created_at desc);
create index if not exists notification_delivery_health_created_idx on public.notification_delivery_health_snapshots (created_at desc);
create index if not exists notification_sync_status_provider_idx on public.notification_provider_sync_status (provider, capability, created_at desc);
create index if not exists notification_review_flags_status_idx on public.notification_required_review_flags (review_status, created_at desc);
create index if not exists notification_duplicate_dedupe_key_idx on public.notification_duplicate_dedupe_records (dedupe_key, created_at desc);

create index if not exists release_operator_events_created_idx on public.release_operator_events (created_at desc);
create index if not exists release_health_created_idx on public.release_health_snapshots (created_at desc);
create index if not exists release_review_flags_status_idx on public.release_required_review_flags (review_status, created_at desc);
create index if not exists ota_diagnostics_update_idx on public.ota_diagnostics_readback_records (update_id, created_at desc);
create index if not exists rollout_anomaly_status_idx on public.rollout_anomaly_findings (review_status, created_at desc);
create index if not exists rollback_readiness_created_idx on public.rollback_readiness_records (created_at desc);

create index if not exists security_operator_events_created_idx on public.security_operator_events (created_at desc);
create index if not exists security_health_created_idx on public.security_health_snapshots (created_at desc);
create index if not exists security_review_flags_status_idx on public.security_required_review_flags (review_status, created_at desc);
create index if not exists secret_scan_status_idx on public.secret_scan_findings (review_status, created_at desc);
create index if not exists owner_integrity_status_idx on public.owner_authority_integrity_findings (review_status, created_at desc);
create index if not exists approval_integrity_status_idx on public.approval_integrity_findings (review_status, created_at desc);

create index if not exists moderation_operator_events_created_idx on public.moderation_operator_events (created_at desc);
create index if not exists moderation_health_created_idx on public.moderation_health_snapshots (created_at desc);
create index if not exists moderation_review_flags_status_idx on public.moderation_required_review_flags (review_status, created_at desc);
create index if not exists moderation_case_priority_status_idx on public.moderation_case_priority_flags (review_status, created_at desc);
create index if not exists safety_recommendation_status_idx on public.safety_review_recommendations (review_status, created_at desc);
create index if not exists moderation_duplicate_reports_key_idx on public.moderation_duplicate_report_detections (dedupe_key, created_at desc);
create index if not exists moderation_stale_case_status_idx on public.moderation_stale_case_findings (review_status, created_at desc);

alter table public.notification_operator_events enable row level security;
alter table public.notification_delivery_health_snapshots enable row level security;
alter table public.notification_provider_sync_status enable row level security;
alter table public.notification_required_review_flags enable row level security;
alter table public.notification_duplicate_dedupe_records enable row level security;
alter table public.notification_operator_learning_state enable row level security;
alter table public.release_operator_events enable row level security;
alter table public.release_health_snapshots enable row level security;
alter table public.release_required_review_flags enable row level security;
alter table public.ota_diagnostics_readback_records enable row level security;
alter table public.rollout_anomaly_findings enable row level security;
alter table public.rollback_readiness_records enable row level security;
alter table public.release_operator_learning_state enable row level security;
alter table public.security_operator_events enable row level security;
alter table public.security_health_snapshots enable row level security;
alter table public.security_required_review_flags enable row level security;
alter table public.secret_scan_findings enable row level security;
alter table public.owner_authority_integrity_findings enable row level security;
alter table public.approval_integrity_findings enable row level security;
alter table public.security_operator_learning_state enable row level security;
alter table public.moderation_operator_events enable row level security;
alter table public.moderation_health_snapshots enable row level security;
alter table public.moderation_required_review_flags enable row level security;
alter table public.moderation_case_priority_flags enable row level security;
alter table public.safety_review_recommendations enable row level security;
alter table public.moderation_duplicate_report_detections enable row level security;
alter table public.moderation_stale_case_findings enable row level security;
alter table public.moderation_operator_learning_state enable row level security;

revoke all on table
  public.notification_operator_events,
  public.notification_delivery_health_snapshots,
  public.notification_provider_sync_status,
  public.notification_required_review_flags,
  public.notification_duplicate_dedupe_records,
  public.notification_operator_learning_state,
  public.release_operator_events,
  public.release_health_snapshots,
  public.release_required_review_flags,
  public.ota_diagnostics_readback_records,
  public.rollout_anomaly_findings,
  public.rollback_readiness_records,
  public.release_operator_learning_state,
  public.security_operator_events,
  public.security_health_snapshots,
  public.security_required_review_flags,
  public.secret_scan_findings,
  public.owner_authority_integrity_findings,
  public.approval_integrity_findings,
  public.security_operator_learning_state,
  public.moderation_operator_events,
  public.moderation_health_snapshots,
  public.moderation_required_review_flags,
  public.moderation_case_priority_flags,
  public.safety_review_recommendations,
  public.moderation_duplicate_report_detections,
  public.moderation_stale_case_findings,
  public.moderation_operator_learning_state
from anon, authenticated;

grant select, insert, update on table
  public.notification_operator_events,
  public.notification_delivery_health_snapshots,
  public.notification_provider_sync_status,
  public.notification_required_review_flags,
  public.notification_duplicate_dedupe_records,
  public.notification_operator_learning_state,
  public.release_operator_events,
  public.release_health_snapshots,
  public.release_required_review_flags,
  public.ota_diagnostics_readback_records,
  public.rollout_anomaly_findings,
  public.rollback_readiness_records,
  public.release_operator_learning_state,
  public.security_operator_events,
  public.security_health_snapshots,
  public.security_required_review_flags,
  public.secret_scan_findings,
  public.owner_authority_integrity_findings,
  public.approval_integrity_findings,
  public.security_operator_learning_state,
  public.moderation_operator_events,
  public.moderation_health_snapshots,
  public.moderation_required_review_flags,
  public.moderation_case_priority_flags,
  public.safety_review_recommendations,
  public.moderation_duplicate_report_detections,
  public.moderation_stale_case_findings,
  public.moderation_operator_learning_state
to service_role;

comment on table public.notification_operator_events is 'Scoped Notification Delivery Operator audit events; client writes denied.';
comment on table public.release_operator_events is 'Scoped Release / OTA Operator audit events; no publish or rollback execution.';
comment on table public.security_operator_events is 'Scoped Security / Owner Operator audit events; no owner/auth/RLS mutation.';
comment on table public.moderation_operator_events is 'Scoped Moderation / Safety Operator audit events; no hidden enforcement or user rights mutation.';
