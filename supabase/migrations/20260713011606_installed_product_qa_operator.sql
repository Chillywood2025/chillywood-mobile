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

insert into public.route_behavior_findings (
  system_id,
  source,
  route_path,
  expected_marker,
  actual_marker,
  expected_behavior,
  actual_behavior,
  update_id,
  runtime_version,
  channel,
  account_role,
  result,
  blocker_classification,
  finding_status,
  next_safe_action,
  discovered_by,
  high_risk_executed,
  money_moved,
  user_rights_changed,
  fake_proof,
  secrets_logged,
  private_evidence_stored,
  metadata
) values
  (
    'installed_product_qa_operator',
    'manual_codex_proof',
    '/chat',
    'chat-inbox-screen',
    'Home',
    'normal signed-in user should land on chat inbox or documented canonical chat route',
    'normal /chat stayed on Home during Codex manual installed traversal',
    '019f58bd-8ae2-7c9e-b9fc-56f09dce62ba',
    '1.0.0',
    'production',
    'normal',
    'blocked',
    'route_contract_mismatch',
    'open',
    'Run proactive installed normal /chat route marker check and create safe source/proof/testID owner command if mismatch recurs.',
    'codex_manual',
    false,
    false,
    false,
    false,
    false,
    false,
    '{"finding_key":"manual-normal-chat-stayed-home","safe_source":"codex_manual"}'::jsonb
  ),
  (
    'installed_product_qa_operator',
    'manual_codex_proof',
    '/creator-monetization-setup',
    'Platform Studio / Premium required compatibility marker',
    'expected marker missing',
    'creator compatibility route should reach canonical monetization gate',
    'creator monetization setup marker missing during Codex manual installed traversal',
    '019f58bd-8ae2-7c9e-b9fc-56f09dce62ba',
    '1.0.0',
    'production',
    'creator',
    'blocked',
    'missing_testid_or_marker',
    'open',
    'Run proactive compatibility marker check and create safe source/proof/testID owner command if marker is missing.',
    'codex_manual',
    false,
    false,
    false,
    false,
    false,
    false,
    '{"finding_key":"manual-creator-monetization-marker-missing","safe_source":"codex_manual"}'::jsonb
  );

insert into public.role_behavior_findings (
  system_id,
  source,
  account_role,
  route_path,
  expected_behavior,
  actual_behavior,
  update_id,
  runtime_version,
  channel,
  result,
  blocker_classification,
  finding_status,
  next_safe_action,
  discovered_by,
  high_risk_executed,
  money_moved,
  user_rights_changed,
  fake_proof,
  secrets_logged,
  private_evidence_stored,
  metadata
) values (
  'installed_product_qa_operator',
  'manual_codex_proof',
  'restricted',
  '/chat',
  'restricted/denied copy or blocked chat action',
  'restricted /chat showed Chat inbox during Codex manual installed traversal',
  '019f58bd-8ae2-7c9e-b9fc-56f09dce62ba',
  '1.0.0',
  'production',
  'blocked',
  'expected_denial_copy_missing',
  'open',
  'Verify restricted fixture state first; do not ban/restrict a real user or fake denial proof.',
  'codex_manual',
  false,
  false,
  false,
  false,
  false,
  false,
  '{"finding_key":"manual-restricted-chat-showed-inbox","safe_source":"codex_manual"}'::jsonb
);

insert into public.account_fixture_health_findings (
  system_id,
  source,
  account_label,
  account_role,
  expected_state,
  actual_state,
  provider_backed,
  update_id,
  runtime_version,
  channel,
  result,
  blocker_classification,
  finding_status,
  next_safe_action,
  discovered_by,
  high_risk_executed,
  money_moved,
  user_rights_changed,
  fake_proof,
  secrets_logged,
  private_evidence_stored,
  metadata
) values (
  'installed_product_qa_operator',
  'manual_codex_proof',
  'proof_premium_001',
  'premium',
  'provider-backed Premium active',
  'Premium is not active in installed traversal',
  false,
  '019f58bd-8ae2-7c9e-b9fc-56f09dce62ba',
  '1.0.0',
  'production',
  'blocked',
  'premium_provider_state_missing',
  'open',
  'Use only provider-backed active account, restore, or approved Google Play / RevenueCat sandbox renewal; never manually grant Premium.',
  'codex_manual',
  false,
  false,
  false,
  false,
  false,
  false,
  '{"finding_key":"manual-premium-labelled-account-inactive","safe_source":"codex_manual"}'::jsonb
);

insert into public.qa_required_review_flags (
  system_id,
  source,
  flag_type,
  severity,
  target_type,
  target_id,
  update_id,
  runtime_version,
  channel,
  account_role,
  result,
  blocker_classification,
  review_status,
  next_safe_action,
  discovered_by,
  high_risk_executed,
  money_moved,
  user_rights_changed,
  fake_proof,
  secrets_logged,
  private_evidence_stored,
  metadata
) values (
  'installed_product_qa_operator',
  'manual_codex_proof',
  'moderator_boundary_pending',
  'review',
  'role_boundary',
  'proof_moderator_001:/admin',
  '019f58bd-8ae2-7c9e-b9fc-56f09dce62ba',
  '1.0.0',
  'production',
  'moderator',
  'human_review',
  'manual_codex_only_gap',
  'open',
  'Run focused moderator boundary packet and keep private evidence/reporter identity absent by default.',
  'codex_manual',
  false,
  false,
  false,
  false,
  false,
  false,
  '{"finding_key":"manual-moderator-boundary-pending","safe_source":"codex_manual"}'::jsonb
);

insert into public.device_availability_findings (
  system_id,
  source,
  device_requirement,
  available_device_count,
  required_device_count,
  play_installed_device_available,
  device_lab_configured,
  update_id,
  runtime_version,
  channel,
  account_role,
  result,
  blocker_classification,
  finding_status,
  next_safe_action,
  discovered_by,
  high_risk_executed,
  money_moved,
  user_rights_changed,
  fake_proof,
  secrets_logged,
  private_evidence_stored,
  metadata
) values (
  'installed_product_qa_operator',
  'manual_codex_proof',
  'two Play-installed devices or approved device lab',
  1,
  2,
  true,
  false,
  '019f58bd-8ae2-7c9e-b9fc-56f09dce62ba',
  '1.0.0',
  'production',
  'two_device',
  'two_device_required',
  'second_device_required',
  'open',
  'Do not claim realtime closure until two Play-installed devices or an approved device lab prove the flow.',
  'codex_manual',
  false,
  false,
  false,
  false,
  false,
  false,
  '{"finding_key":"manual-two-device-realtime-pending","safe_source":"codex_manual"}'::jsonb
);

comment on table public.installed_qa_operator_events is 'Installed Product QA Operator audit events; no secrets, no fake proof, no high-risk execution.';
comment on table public.installed_traversal_runs is 'Installed app traversal run summaries with updateId/runtime/channel and explicit Partial/Blocked classification.';
comment on table public.route_behavior_findings is 'Route and marker mismatch findings from installed_product_qa_operator; client writes denied.';
comment on table public.role_behavior_findings is 'Role/account-specific installed behavior findings; client writes denied and no enforcement mutation.';
comment on table public.account_fixture_health_findings is 'Proof account fixture health findings, including Premium provider-backed state and restricted-account readiness.';
comment on table public.device_availability_findings is 'Installed device and device-lab readiness findings, including second-device requirements.';
comment on table public.qa_required_review_flags is 'Required review flags for installed app QA proof gaps and human/device-lab blockers.';
comment on table public.qa_operator_learning_state is 'Learning state for repeated installed app QA blockers; cannot override proof, Premium, role, device, or owner approval gates.';
