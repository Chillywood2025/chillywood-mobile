-- Installed Product QA Operator.
-- Proactive status/finding/review/learning tables only. These tables do not
-- grant Premium, mutate roles/auth/RLS, move money, enforce moderation, fake
-- installed proof, sideload/install apps, or claim two-device proof.

create table if not exists public.installed_qa_operator_events (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'installed_product_qa_operator' check (system_id = 'installed_product_qa_operator'),
  source text not null default 'manual_codex_proof' check (source in ('play_installed', 'browserstack', 'local_fixture', 'manual_codex_proof')),
  action_id text not null,
  result text not null,
  update_id text,
  runtime_version text,
  channel text,
  account_role text,
  blocker_classification text,
  discovered_by text not null default 'autonomous_operator' check (discovered_by in ('autonomous_operator', 'codex_manual', 'device_lab')),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  money_moved boolean not null default false check (money_moved = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  fake_proof boolean not null default false check (fake_proof = false),
  secrets_logged boolean not null default false check (secrets_logged = false),
  private_evidence_stored boolean not null default false check (private_evidence_stored = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.installed_traversal_runs (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'installed_product_qa_operator' check (system_id = 'installed_product_qa_operator'),
  source text not null check (source in ('play_installed', 'browserstack', 'local_fixture', 'manual_codex_proof')),
  run_label text not null,
  update_id text,
  runtime_version text,
  channel text,
  installed_package text,
  installer_package text,
  native_version text,
  native_build text,
  device_count integer not null default 0 check (device_count >= 0),
  pass_count integer not null default 0 check (pass_count >= 0),
  human_review_count integer not null default 0 check (human_review_count >= 0),
  blocked_count integer not null default 0 check (blocked_count >= 0),
  two_device_required_count integer not null default 0 check (two_device_required_count >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),
  result text not null check (result in ('pass', 'partial', 'blocked', 'failed', 'human_review', 'two_device_required')),
  blocker_classification text,
  discovered_by text not null default 'autonomous_operator' check (discovered_by in ('autonomous_operator', 'codex_manual', 'device_lab')),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  money_moved boolean not null default false check (money_moved = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  fake_proof boolean not null default false check (fake_proof = false),
  secrets_logged boolean not null default false check (secrets_logged = false),
  private_evidence_stored boolean not null default false check (private_evidence_stored = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.route_behavior_findings (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'installed_product_qa_operator' check (system_id = 'installed_product_qa_operator'),
  source text not null check (source in ('play_installed', 'browserstack', 'local_fixture', 'manual_codex_proof')),
  route_path text not null,
  expected_marker text,
  actual_marker text,
  expected_behavior text,
  actual_behavior text,
  update_id text,
  runtime_version text,
  channel text,
  account_role text,
  result text not null default 'blocked' check (result in ('pass', 'partial', 'blocked', 'failed', 'human_review', 'two_device_required')),
  blocker_classification text not null,
  finding_status text not null default 'open' check (finding_status in ('open', 'reviewed', 'closed', 'superseded')),
  next_safe_action text not null,
  owner_command_request_id uuid null references public.owner_command_requests(id) on delete set null,
  discovered_by text not null default 'autonomous_operator' check (discovered_by in ('autonomous_operator', 'codex_manual', 'device_lab')),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  money_moved boolean not null default false check (money_moved = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  fake_proof boolean not null default false check (fake_proof = false),
  secrets_logged boolean not null default false check (secrets_logged = false),
  private_evidence_stored boolean not null default false check (private_evidence_stored = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.role_behavior_findings (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'installed_product_qa_operator' check (system_id = 'installed_product_qa_operator'),
  source text not null check (source in ('play_installed', 'browserstack', 'local_fixture', 'manual_codex_proof')),
  account_role text not null,
  route_path text,
  expected_behavior text not null,
  actual_behavior text not null,
  update_id text,
  runtime_version text,
  channel text,
  result text not null default 'blocked' check (result in ('pass', 'partial', 'blocked', 'failed', 'human_review', 'two_device_required')),
  blocker_classification text not null,
  finding_status text not null default 'open' check (finding_status in ('open', 'reviewed', 'closed', 'superseded')),
  next_safe_action text not null,
  owner_command_request_id uuid null references public.owner_command_requests(id) on delete set null,
  discovered_by text not null default 'autonomous_operator' check (discovered_by in ('autonomous_operator', 'codex_manual', 'device_lab')),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  money_moved boolean not null default false check (money_moved = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  fake_proof boolean not null default false check (fake_proof = false),
  secrets_logged boolean not null default false check (secrets_logged = false),
  private_evidence_stored boolean not null default false check (private_evidence_stored = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.account_fixture_health_findings (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'installed_product_qa_operator' check (system_id = 'installed_product_qa_operator'),
  source text not null check (source in ('play_installed', 'browserstack', 'local_fixture', 'manual_codex_proof')),
  account_label text not null,
  account_role text not null,
  expected_state text not null,
  actual_state text not null,
  provider_backed boolean not null default false,
  update_id text,
  runtime_version text,
  channel text,
  result text not null default 'blocked' check (result in ('pass', 'partial', 'blocked', 'failed', 'human_review', 'two_device_required')),
  blocker_classification text not null,
  finding_status text not null default 'open' check (finding_status in ('open', 'reviewed', 'closed', 'superseded')),
  next_safe_action text not null,
  owner_command_request_id uuid null references public.owner_command_requests(id) on delete set null,
  discovered_by text not null default 'autonomous_operator' check (discovered_by in ('autonomous_operator', 'codex_manual', 'device_lab')),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  money_moved boolean not null default false check (money_moved = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  fake_proof boolean not null default false check (fake_proof = false),
  secrets_logged boolean not null default false check (secrets_logged = false),
  private_evidence_stored boolean not null default false check (private_evidence_stored = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.device_availability_findings (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'installed_product_qa_operator' check (system_id = 'installed_product_qa_operator'),
  source text not null check (source in ('play_installed', 'browserstack', 'local_fixture', 'manual_codex_proof')),
  device_requirement text not null,
  available_device_count integer not null default 0 check (available_device_count >= 0),
  required_device_count integer not null default 1 check (required_device_count >= 1),
  play_installed_device_available boolean not null default false,
  device_lab_configured boolean not null default false,
  update_id text,
  runtime_version text,
  channel text,
  account_role text,
  result text not null default 'blocked' check (result in ('pass', 'partial', 'blocked', 'failed', 'human_review', 'two_device_required')),
  blocker_classification text not null,
  finding_status text not null default 'open' check (finding_status in ('open', 'reviewed', 'closed', 'superseded')),
  next_safe_action text not null,
  owner_command_request_id uuid null references public.owner_command_requests(id) on delete set null,
  discovered_by text not null default 'autonomous_operator' check (discovered_by in ('autonomous_operator', 'codex_manual', 'device_lab')),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  money_moved boolean not null default false check (money_moved = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  fake_proof boolean not null default false check (fake_proof = false),
  secrets_logged boolean not null default false check (secrets_logged = false),
  private_evidence_stored boolean not null default false check (private_evidence_stored = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.qa_required_review_flags (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'installed_product_qa_operator' check (system_id = 'installed_product_qa_operator'),
  source text not null check (source in ('play_installed', 'browserstack', 'local_fixture', 'manual_codex_proof')),
  flag_type text not null,
  severity text not null default 'review' check (severity in ('info', 'review', 'warning', 'critical')),
  target_type text,
  target_id text,
  update_id text,
  runtime_version text,
  channel text,
  account_role text,
  result text not null default 'human_review' check (result in ('pass', 'partial', 'blocked', 'failed', 'human_review', 'two_device_required')),
  blocker_classification text not null,
  review_status text not null default 'open' check (review_status in ('open', 'reviewed', 'closed', 'superseded')),
  next_safe_action text not null,
  owner_command_request_id uuid null references public.owner_command_requests(id) on delete set null,
  discovered_by text not null default 'autonomous_operator' check (discovered_by in ('autonomous_operator', 'codex_manual', 'device_lab')),
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  money_moved boolean not null default false check (money_moved = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  fake_proof boolean not null default false check (fake_proof = false),
  secrets_logged boolean not null default false check (secrets_logged = false),
  private_evidence_stored boolean not null default false check (private_evidence_stored = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.qa_operator_learning_state (
  id uuid primary key default gen_random_uuid(),
  system_id text not null default 'installed_product_qa_operator' check (system_id = 'installed_product_qa_operator'),
  finding_key text not null,
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  last_blocker_classification text not null,
  last_result text not null,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  last_recommended_action text,
  high_risk_executed boolean not null default false check (high_risk_executed = false),
  money_moved boolean not null default false check (money_moved = false),
  user_rights_changed boolean not null default false check (user_rights_changed = false),
  fake_proof boolean not null default false check (fake_proof = false),
  secrets_logged boolean not null default false check (secrets_logged = false),
  private_evidence_stored boolean not null default false check (private_evidence_stored = false),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  first_seen_at timestamptz not null default timezone('utc'::text, now()),
  last_seen_at timestamptz not null default timezone('utc'::text, now()),
  unique (system_id, finding_key)
);

create index if not exists installed_qa_events_created_idx
  on public.installed_qa_operator_events (created_at desc);
create index if not exists installed_traversal_runs_created_idx
  on public.installed_traversal_runs (created_at desc);
create index if not exists route_behavior_findings_status_idx
  on public.route_behavior_findings (finding_status, created_at desc);
create index if not exists role_behavior_findings_status_idx
  on public.role_behavior_findings (finding_status, created_at desc);
create index if not exists account_fixture_health_findings_status_idx
  on public.account_fixture_health_findings (finding_status, created_at desc);
create index if not exists device_availability_findings_status_idx
  on public.device_availability_findings (finding_status, created_at desc);
create index if not exists qa_required_review_flags_status_idx
  on public.qa_required_review_flags (review_status, created_at desc);
create index if not exists qa_operator_learning_state_seen_idx
  on public.qa_operator_learning_state (last_seen_at desc);

alter table public.installed_qa_operator_events enable row level security;
alter table public.installed_traversal_runs enable row level security;
alter table public.route_behavior_findings enable row level security;
alter table public.role_behavior_findings enable row level security;
alter table public.account_fixture_health_findings enable row level security;
alter table public.device_availability_findings enable row level security;
alter table public.qa_required_review_flags enable row level security;
alter table public.qa_operator_learning_state enable row level security;

revoke all on table
  public.installed_qa_operator_events,
  public.installed_traversal_runs,
  public.route_behavior_findings,
  public.role_behavior_findings,
  public.account_fixture_health_findings,
  public.device_availability_findings,
  public.qa_required_review_flags,
  public.qa_operator_learning_state
from anon, authenticated;

grant select, insert, update on table
  public.installed_qa_operator_events,
  public.installed_traversal_runs,
  public.route_behavior_findings,
  public.role_behavior_findings,
  public.account_fixture_health_findings,
  public.device_availability_findings,
  public.qa_required_review_flags,
  public.qa_operator_learning_state
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
      'system'
    )
  );

comment on table public.installed_qa_operator_events is 'Installed Product QA Operator audit events; no secrets, no fake proof, no high-risk execution.';
comment on table public.installed_traversal_runs is 'Installed app traversal run summaries with updateId/runtime/channel and explicit Partial/Blocked classification.';
comment on table public.route_behavior_findings is 'Route and marker mismatch findings from installed_product_qa_operator; client writes denied.';
comment on table public.role_behavior_findings is 'Role/account-specific installed behavior findings; client writes denied and no enforcement mutation.';
comment on table public.account_fixture_health_findings is 'Proof account fixture health findings, including Premium provider-backed state and restricted-account readiness.';
comment on table public.device_availability_findings is 'Installed device and device-lab readiness findings, including second-device requirements.';
comment on table public.qa_required_review_flags is 'Required review flags for installed app QA proof gaps and human/device-lab blockers.';
comment on table public.qa_operator_learning_state is 'Learning state for repeated installed app QA blockers; cannot override proof, Premium, role, device, or owner approval gates.';
