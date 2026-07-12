-- Scoped-write observability/runtime autonomous operator tables.
-- These tables are status, finding, review, audit, and learning surfaces only.
-- They do not grant crash evidence deletion, OTA publish/rollback, Remote
-- Config mutation, provider config mutation, auth/RLS mutation, money movement,
-- or Premium entitlement changes.

create table if not exists public.observability_operator_events (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'observability_runtime_operator' check (system_id = 'observability_runtime_operator'),
  actor_type text not null default 'operator',
  actor_id text,
  action_id text not null,
  result text not null,
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  update_id text,
  runtime_version text,
  channel text,
  pii_stored boolean not null default false check (pii_stored = false),
  secrets_logged boolean not null default false check (secrets_logged = false),
  release_action_executed boolean not null default false check (release_action_executed = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.runtime_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'observability_runtime_operator' check (system_id = 'observability_runtime_operator'),
  health_state text not null,
  crash_cluster_count integer not null default 0 check (crash_cluster_count >= 0),
  js_error_count integer not null default 0 check (js_error_count >= 0),
  performance_regression_count integer not null default 0 check (performance_regression_count >= 0),
  backend_error_rate_percent numeric,
  update_id text,
  runtime_version text,
  channel text,
  embedded_launch boolean,
  emergency_launch boolean,
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  pii_stored boolean not null default false check (pii_stored = false),
  secrets_logged boolean not null default false check (secrets_logged = false),
  release_action_executed boolean not null default false check (release_action_executed = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.crash_cluster_findings (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'observability_runtime_operator' check (system_id = 'observability_runtime_operator'),
  flag_type text not null,
  severity text not null default 'review' check (severity in ('info', 'review', 'warning', 'critical')),
  target_type text,
  target_id text,
  signature_hash text,
  update_id text,
  runtime_version text,
  channel text,
  review_status text not null default 'open' check (review_status in ('open', 'reviewed', 'superseded')),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  pii_stored boolean not null default false check (pii_stored = false),
  secrets_logged boolean not null default false check (secrets_logged = false),
  release_action_executed boolean not null default false check (release_action_executed = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.js_error_findings (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'observability_runtime_operator' check (system_id = 'observability_runtime_operator'),
  flag_type text not null,
  severity text not null default 'review' check (severity in ('info', 'review', 'warning', 'critical')),
  target_type text,
  target_id text,
  signature_hash text,
  update_id text,
  runtime_version text,
  channel text,
  review_status text not null default 'open' check (review_status in ('open', 'reviewed', 'superseded')),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  pii_stored boolean not null default false check (pii_stored = false),
  secrets_logged boolean not null default false check (secrets_logged = false),
  release_action_executed boolean not null default false check (release_action_executed = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.performance_regression_findings (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'observability_runtime_operator' check (system_id = 'observability_runtime_operator'),
  flag_type text not null,
  severity text not null default 'review' check (severity in ('info', 'review', 'warning', 'critical')),
  target_type text,
  target_id text,
  metric_name text,
  metric_value numeric,
  update_id text,
  runtime_version text,
  channel text,
  review_status text not null default 'open' check (review_status in ('open', 'reviewed', 'superseded')),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  pii_stored boolean not null default false check (pii_stored = false),
  secrets_logged boolean not null default false check (secrets_logged = false),
  release_action_executed boolean not null default false check (release_action_executed = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.analytics_delivery_findings (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'observability_runtime_operator' check (system_id = 'observability_runtime_operator'),
  flag_type text not null,
  severity text not null default 'review' check (severity in ('info', 'review', 'warning', 'critical')),
  target_type text,
  target_id text,
  provider text,
  capability text,
  update_id text,
  runtime_version text,
  channel text,
  review_status text not null default 'open' check (review_status in ('open', 'reviewed', 'superseded')),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  pii_stored boolean not null default false check (pii_stored = false),
  secrets_logged boolean not null default false check (secrets_logged = false),
  release_action_executed boolean not null default false check (release_action_executed = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.release_health_findings (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'observability_runtime_operator' check (system_id = 'observability_runtime_operator'),
  flag_type text not null,
  severity text not null default 'review' check (severity in ('info', 'review', 'warning', 'critical')),
  target_type text,
  target_id text,
  update_id text,
  runtime_version text,
  channel text,
  embedded_launch boolean,
  emergency_launch boolean,
  review_status text not null default 'open' check (review_status in ('open', 'reviewed', 'superseded')),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  pii_stored boolean not null default false check (pii_stored = false),
  secrets_logged boolean not null default false check (secrets_logged = false),
  release_action_executed boolean not null default false check (release_action_executed = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.backend_error_rate_findings (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'observability_runtime_operator' check (system_id = 'observability_runtime_operator'),
  flag_type text not null,
  severity text not null default 'review' check (severity in ('info', 'review', 'warning', 'critical')),
  target_type text,
  target_id text,
  backend_surface text,
  error_rate_percent numeric,
  review_status text not null default 'open' check (review_status in ('open', 'reviewed', 'superseded')),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  pii_stored boolean not null default false check (pii_stored = false),
  secrets_logged boolean not null default false check (secrets_logged = false),
  release_action_executed boolean not null default false check (release_action_executed = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.observability_required_review_flags (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'observability_runtime_operator' check (system_id = 'observability_runtime_operator'),
  flag_type text not null,
  severity text not null default 'review' check (severity in ('info', 'review', 'warning', 'critical')),
  target_type text,
  target_id text,
  update_id text,
  runtime_version text,
  channel text,
  review_status text not null default 'open' check (review_status in ('open', 'reviewed', 'superseded')),
  environment_mode text not null default 'production' check (environment_mode in ('production', 'test', 'sandbox')),
  pii_stored boolean not null default false check (pii_stored = false),
  secrets_logged boolean not null default false check (secrets_logged = false),
  release_action_executed boolean not null default false check (release_action_executed = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.observability_operator_learning_state (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'observability_runtime_operator' check (system_id = 'observability_runtime_operator'),
  incident_key text not null,
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  last_recommended_action text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  pii_stored boolean not null default false check (pii_stored = false),
  secrets_logged boolean not null default false check (secrets_logged = false),
  release_action_executed boolean not null default false check (release_action_executed = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create index if not exists observability_events_created_idx on public.observability_operator_events (created_at desc);
create index if not exists runtime_health_created_idx on public.runtime_health_snapshots (created_at desc);
create index if not exists crash_cluster_findings_status_idx on public.crash_cluster_findings (review_status, created_at desc);
create index if not exists js_error_findings_status_idx on public.js_error_findings (review_status, created_at desc);
create index if not exists performance_regression_findings_status_idx on public.performance_regression_findings (review_status, created_at desc);
create index if not exists analytics_delivery_findings_status_idx on public.analytics_delivery_findings (review_status, created_at desc);
create index if not exists release_health_findings_status_idx on public.release_health_findings (review_status, created_at desc);
create index if not exists backend_error_rate_findings_status_idx on public.backend_error_rate_findings (review_status, created_at desc);
create index if not exists observability_review_flags_status_idx on public.observability_required_review_flags (review_status, created_at desc);

alter table public.observability_operator_events enable row level security;
alter table public.runtime_health_snapshots enable row level security;
alter table public.crash_cluster_findings enable row level security;
alter table public.js_error_findings enable row level security;
alter table public.performance_regression_findings enable row level security;
alter table public.analytics_delivery_findings enable row level security;
alter table public.release_health_findings enable row level security;
alter table public.backend_error_rate_findings enable row level security;
alter table public.observability_required_review_flags enable row level security;
alter table public.observability_operator_learning_state enable row level security;

revoke all on table
  public.observability_operator_events,
  public.runtime_health_snapshots,
  public.crash_cluster_findings,
  public.js_error_findings,
  public.performance_regression_findings,
  public.analytics_delivery_findings,
  public.release_health_findings,
  public.backend_error_rate_findings,
  public.observability_required_review_flags,
  public.observability_operator_learning_state
from anon, authenticated;

grant select, insert, update on table
  public.observability_operator_events,
  public.runtime_health_snapshots,
  public.crash_cluster_findings,
  public.js_error_findings,
  public.performance_regression_findings,
  public.analytics_delivery_findings,
  public.release_health_findings,
  public.backend_error_rate_findings,
  public.observability_required_review_flags,
  public.observability_operator_learning_state
to service_role;

comment on table public.observability_operator_events is 'Scoped Observability / Runtime Health Operator audit events; client writes denied.';
comment on table public.runtime_health_snapshots is 'Scoped observability runtime health snapshots; no crash evidence deletion, release action, or secret logging.';
comment on table public.crash_cluster_findings is 'Redacted crash cluster findings for observability_runtime_operator; signature hashes only.';
comment on table public.js_error_findings is 'Redacted JS error findings for observability_runtime_operator; signature hashes only.';
