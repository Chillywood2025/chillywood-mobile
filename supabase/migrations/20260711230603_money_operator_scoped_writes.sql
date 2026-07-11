-- Scoped write tables for the Money Flow Control operator.
--
-- These tables are deliberately limited to reconciliation, provider sync
-- status, duplicate detection, review flags, health/audit events, and learning
-- state. They do not represent provider money movement and cannot be used to
-- mark real charges, payouts, transfers, cashout, Premium entitlements, or
-- payable balances as complete.

create table if not exists public.money_operator_events (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'money_flow_control' check (system_id = 'money_flow_control'),
  event_type text not null,
  action_id text,
  surface text,
  severity text not null default 'info' check (severity in ('info', 'warning', 'error', 'critical')),
  result text not null default 'recorded',
  environment_mode text not null default 'test' check (environment_mode in ('sandbox', 'test', 'production')),
  money_moved boolean not null default false check (money_moved = false),
  external_confirmation_required boolean not null default false,
  external_confirmation_status text not null default 'not_required' check (external_confirmation_status in ('not_required', 'required', 'provided_test_mode', 'provided_production', 'rejected')),
  blocked_reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by text not null default 'money_operator',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.money_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'money_flow_control' check (system_id = 'money_flow_control'),
  run_type text not null default 'readonly_reconciliation',
  status text not null default 'planned' check (status in ('planned', 'running', 'succeeded', 'failed', 'blocked')),
  environment_mode text not null default 'test' check (environment_mode in ('sandbox', 'test', 'production')),
  money_moved boolean not null default false check (money_moved = false),
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  created_by text not null default 'money_operator',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.money_reconciliation_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.money_reconciliation_runs(id) on delete set null,
  system_id text not null default 'money_flow_control' check (system_id = 'money_flow_control'),
  finding_type text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'error', 'critical')),
  surface text,
  entity_table text,
  entity_id text,
  status text not null default 'open' check (status in ('open', 'requires_review', 'reviewed', 'resolved', 'superseded')),
  environment_mode text not null default 'test' check (environment_mode in ('sandbox', 'test', 'production')),
  money_moved boolean not null default false check (money_moved = false),
  external_confirmation_required boolean not null default false,
  external_confirmation_status text not null default 'not_required' check (external_confirmation_status in ('not_required', 'required', 'provided_test_mode', 'provided_production', 'rejected')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by text not null default 'money_operator',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.money_provider_sync_status (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'money_flow_control' check (system_id = 'money_flow_control'),
  provider text not null,
  capability text not null,
  sync_status text not null check (sync_status in ('stale', 'synced', 'failed', 'blocked')),
  environment_mode text not null default 'test' check (environment_mode in ('sandbox', 'test', 'production')),
  money_moved boolean not null default false check (money_moved = false),
  last_checked_at timestamptz not null default timezone('utc', now()),
  last_success_at timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by text not null default 'money_operator',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (provider, capability, environment_mode)
);

create table if not exists public.money_duplicate_event_detections (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'money_flow_control' check (system_id = 'money_flow_control'),
  provider text not null,
  event_id_hash text not null,
  source_table text,
  source_row_id text,
  detection_status text not null default 'suspected_duplicate' check (detection_status in ('suspected_duplicate', 'duplicate', 'cleared_review_required')),
  environment_mode text not null default 'test' check (environment_mode in ('sandbox', 'test', 'production')),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by text not null default 'money_operator',
  created_at timestamptz not null default timezone('utc', now()),
  unique (provider, event_id_hash, environment_mode)
);

create table if not exists public.money_required_review_flags (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'money_flow_control' check (system_id = 'money_flow_control'),
  subject_type text not null,
  subject_id text not null,
  review_reason text not null,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'error', 'critical')),
  status text not null default 'open' check (status in ('open', 'reviewed', 'resolved', 'superseded')),
  environment_mode text not null default 'test' check (environment_mode in ('sandbox', 'test', 'production')),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by text not null default 'money_operator',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (subject_type, subject_id, review_reason, environment_mode)
);

create table if not exists public.money_flow_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'money_flow_control' check (system_id = 'money_flow_control'),
  health_state text not null check (health_state in ('healthy', 'degraded', 'blocked')),
  eligible_for_safe_writes boolean not null default true,
  latest_operator_action text,
  environment_mode text not null default 'test' check (environment_mode in ('sandbox', 'test', 'production')),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by text not null default 'money_operator',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.money_operator_learning_state (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'money_flow_control' check (system_id = 'money_flow_control'),
  incident_key text not null,
  surface text,
  reason text not null,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  confidence numeric(5, 4) not null default 0.5 check (confidence >= 0 and confidence <= 1),
  recommended_next_action text,
  last_recovery_action text,
  last_recovery_result text,
  environment_mode text not null default 'test' check (environment_mode in ('sandbox', 'test', 'production')),
  money_moved boolean not null default false check (money_moved = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  unique (incident_key, environment_mode)
);

create index if not exists money_operator_events_created_at_idx on public.money_operator_events(created_at desc);
create index if not exists money_reconciliation_runs_created_at_idx on public.money_reconciliation_runs(created_at desc);
create index if not exists money_reconciliation_findings_status_idx on public.money_reconciliation_findings(status, created_at desc);
create index if not exists money_provider_sync_status_status_idx on public.money_provider_sync_status(sync_status, last_checked_at desc);
create index if not exists money_duplicate_event_detections_created_at_idx on public.money_duplicate_event_detections(created_at desc);
create index if not exists money_required_review_flags_status_idx on public.money_required_review_flags(status, created_at desc);
create index if not exists money_flow_health_snapshots_created_at_idx on public.money_flow_health_snapshots(created_at desc);
create index if not exists money_operator_learning_state_seen_idx on public.money_operator_learning_state(last_seen_at desc);

alter table public.money_operator_events enable row level security;
alter table public.money_reconciliation_runs enable row level security;
alter table public.money_reconciliation_findings enable row level security;
alter table public.money_provider_sync_status enable row level security;
alter table public.money_duplicate_event_detections enable row level security;
alter table public.money_required_review_flags enable row level security;
alter table public.money_flow_health_snapshots enable row level security;
alter table public.money_operator_learning_state enable row level security;

revoke all on public.money_operator_events from anon, authenticated;
revoke all on public.money_reconciliation_runs from anon, authenticated;
revoke all on public.money_reconciliation_findings from anon, authenticated;
revoke all on public.money_provider_sync_status from anon, authenticated;
revoke all on public.money_duplicate_event_detections from anon, authenticated;
revoke all on public.money_required_review_flags from anon, authenticated;
revoke all on public.money_flow_health_snapshots from anon, authenticated;
revoke all on public.money_operator_learning_state from anon, authenticated;

grant select, insert, update, delete on public.money_operator_events to service_role;
grant select, insert, update, delete on public.money_reconciliation_runs to service_role;
grant select, insert, update, delete on public.money_reconciliation_findings to service_role;
grant select, insert, update, delete on public.money_provider_sync_status to service_role;
grant select, insert, update, delete on public.money_duplicate_event_detections to service_role;
grant select, insert, update, delete on public.money_required_review_flags to service_role;
grant select, insert, update, delete on public.money_flow_health_snapshots to service_role;
grant select, insert, update, delete on public.money_operator_learning_state to service_role;

comment on table public.money_operator_events is 'Scoped Money Flow Control operator audit events. No secrets and no money movement.';
comment on table public.money_reconciliation_runs is 'Read-only/safe reconciliation run records for money_flow_control.';
comment on table public.money_reconciliation_findings is 'Safe reconciliation findings and review-only money control records.';
comment on table public.money_provider_sync_status is 'Provider sync health/status records; never provider credentials or money movement.';
comment on table public.money_duplicate_event_detections is 'Duplicate provider/webhook event detection records using hashes only.';
comment on table public.money_required_review_flags is 'Required-review flags for ledger/provider/payout/revenue records; not a paid-settlement state.';
comment on table public.money_flow_health_snapshots is 'Money Flow Control health snapshots for scoped safe writes.';
comment on table public.money_operator_learning_state is 'Learning state for repeated money-flow control incidents and safe recovery outcomes.';
