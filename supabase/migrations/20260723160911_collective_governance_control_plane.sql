-- Collective Intelligence governance control plane.
--
-- This migration is additive and intentionally undeployed. It adds a
-- service-owned governance layer over the existing cognitive task, capability,
-- lease, approval, and evidence primitives. It does not alter product-table
-- authorization or grant a model/provider any production authority.

create type public.governance_deliberation_status as enum (
  'collecting_assessments',
  'criticizing',
  'voting',
  'blocked',
  'decided',
  'cancelled'
);

create type public.governance_approval_status as enum (
  'pending',
  'active',
  'expired',
  'revoked',
  'consumed',
  'closed_no_action',
  'amendment_required'
);

create type public.governance_decision_status as enum (
  'draft',
  'finalized',
  'expired',
  'superseded'
);

create function public.governance_hash_array_valid(
  p_values text[],
  p_minimum integer,
  p_maximum integer
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_values is not null
    and cardinality(p_values) between p_minimum and p_maximum
    and coalesce((
      select bool_and(value ~ '^[a-f0-9]{64}$')
      from unnest(p_values) value
    ), p_minimum = 0);
$$;
revoke all on function public.governance_hash_array_valid(text[],integer,integer)
  from public, anon, authenticated;
grant execute on function public.governance_hash_array_valid(text[],integer,integer)
  to service_role;

create table public.governance_constitutions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  constitution_key text not null check (
    length(constitution_key) between 8 and 128
    and not public.cognitive_text_has_secret(constitution_key)
    and not public.cognitive_text_has_private_identifier(constitution_key)
  ),
  title text not null check (
    length(title) between 4 and 256
    and not public.cognitive_text_has_secret(title)
    and not public.cognitive_text_has_private_identifier(title)
  ),
  current_version integer not null default 1 check (current_version between 1 and 10000),
  status text not null default 'source_only' check (
    status in ('source_only', 'reviewed_not_active', 'active', 'superseded')
  ),
  self_amendment_allowed boolean not null default false check (self_amendment_allowed = false),
  created_by_identity text not null check (
    length(created_by_identity) between 3 and 128
    and not public.cognitive_text_has_secret(created_by_identity)
    and not public.cognitive_text_has_private_identifier(created_by_identity)
  ),
  created_at timestamptz not null default transaction_timestamp(),
  unique (task_id, constitution_key),
  unique (id, task_id, project_id, platform, environment),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment)
);

create table public.governance_constitution_versions (
  id uuid primary key default gen_random_uuid(),
  constitution_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  version_number integer not null check (version_number between 1 and 10000),
  constitution_hash text not null check (constitution_hash ~ '^[a-f0-9]{64}$'),
  policy_snapshot jsonb not null check (
    pg_column_size(policy_snapshot) <= 65536
    and public.cognitive_json_is_sanitized(policy_snapshot)
  ),
  status text not null default 'draft' check (
    status in ('draft', 'reviewed', 'active', 'superseded')
  ),
  proposed_by_identity text not null check (
    length(proposed_by_identity) between 3 and 128
    and not public.cognitive_text_has_secret(proposed_by_identity)
    and not public.cognitive_text_has_private_identifier(proposed_by_identity)
  ),
  independent_review_hash text check (
    independent_review_hash is null or independent_review_hash ~ '^[a-f0-9]{64}$'
  ),
  owner_approved_by uuid,
  owner_approved_at timestamptz,
  activation_not_before timestamptz,
  rollback_hash text not null check (rollback_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default transaction_timestamp(),
  unique (constitution_id, version_number),
  unique (id, task_id, project_id, platform, environment),
  foreign key (constitution_id, task_id, project_id, platform, environment)
    references public.governance_constitutions(id, task_id, project_id, platform, environment),
  check (
    (owner_approved_by is null and owner_approved_at is null)
    or (owner_approved_by is not null and owner_approved_at is not null)
  ),
  check (
    status <> 'active'
    or (
      independent_review_hash is not null
      and owner_approved_by is not null
      and activation_not_before is not null
      and activation_not_before <= transaction_timestamp()
    )
  )
);

create table public.governance_council_roles (
  id uuid primary key default gen_random_uuid(),
  constitution_version_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  role_key text not null check (role_key in (
    'product_user_experience',
    'architecture_engineering',
    'security_privacy',
    'reliability_release',
    'safety_trust',
    'accessibility_inclusion',
    'money_commercial_policy',
    'research_futures',
    'adversarial_red_team'
  )),
  allowed_evidence_types text[] not null check (
    cardinality(allowed_evidence_types) between 1 and 32
  ),
  required_question_hashes text[] not null check (
    public.governance_hash_array_valid(required_question_hashes, 1, 32)
  ),
  veto_scopes text[] not null default '{}'::text[] check (
    veto_scopes <@ array[
      'security','privacy','auth_rls','money','user_rights',
      'public_release','legal','retention'
    ]::text[]
  ),
  maximum_cost numeric(12,4) not null default 0 check (maximum_cost between 0 and 25),
  timeout_seconds integer not null check (timeout_seconds between 5 and 3600),
  direct_tool_authority boolean not null default false check (direct_tool_authority = false),
  provider_credentials_allowed boolean not null default false check (provider_credentials_allowed = false),
  execution_authority boolean not null default false check (execution_authority = false),
  created_at timestamptz not null default transaction_timestamp(),
  unique (task_id, role_key),
  unique (id, task_id, project_id, platform, environment),
  foreign key (constitution_version_id, task_id, project_id, platform, environment)
    references public.governance_constitution_versions(id, task_id, project_id, platform, environment)
);

create table public.governance_deliberations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  constitution_version_id uuid not null,
  deliberation_key text not null check (
    length(deliberation_key) between 8 and 160
    and not public.cognitive_text_has_secret(deliberation_key)
    and not public.cognitive_text_has_private_identifier(deliberation_key)
  ),
  objective_hash text not null check (objective_hash ~ '^[a-f0-9]{64}$'),
  source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  architecture_graph_digest text not null check (architecture_graph_digest ~ '^[a-f0-9]{64}$'),
  risk_level text not null check (risk_level in ('low','medium','high','critical')),
  status public.governance_deliberation_status not null default 'collecting_assessments',
  required_quorum integer not null check (required_quorum between 3 and 9),
  budget_ceiling numeric(12,4) not null check (budget_ceiling between 0 and 100),
  deadline_at timestamptz not null,
  cancelled_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  unique (task_id, deliberation_key),
  unique (id, task_id, project_id, platform, environment),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment),
  foreign key (constitution_version_id, task_id, project_id, platform, environment)
    references public.governance_constitution_versions(id, task_id, project_id, platform, environment),
  check (deadline_at > created_at),
  check (
    (status = 'cancelled') = (cancelled_at is not null)
    or status <> 'cancelled'
  ),
  check (
    (status = 'decided') = (decided_at is not null)
    or status <> 'decided'
  )
);

create table public.governance_evidence_packets (
  id uuid primary key default gen_random_uuid(),
  deliberation_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  packet_hash text not null check (packet_hash ~ '^[a-f0-9]{64}$'),
  source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  architecture_graph_digest text not null check (architecture_graph_digest ~ '^[a-f0-9]{64}$'),
  research_claim_hashes text[] not null default '{}'::text[] check (
    public.governance_hash_array_valid(research_claim_hashes, 0, 128)
  ),
  provider_state_hash text not null check (provider_state_hash ~ '^[a-f0-9]{64}$'),
  known_unknowns jsonb not null default '{}'::jsonb check (
    pg_column_size(known_unknowns) <= 16384
    and public.cognitive_json_is_sanitized(known_unknowns)
  ),
  approval_level text not null check (approval_level in ('none','owner','external_confirmation')),
  budget_hash text not null check (budget_hash ~ '^[a-f0-9]{64}$'),
  rollback_requirements_hash text not null check (rollback_requirements_hash ~ '^[a-f0-9]{64}$'),
  freshness_deadline timestamptz not null,
  untrusted_text_labeled boolean not null default true check (untrusted_text_labeled = true),
  created_at timestamptz not null default transaction_timestamp(),
  unique (deliberation_id),
  unique (task_id, packet_hash),
  unique (id, task_id, project_id, platform, environment),
  foreign key (deliberation_id, task_id, project_id, platform, environment)
    references public.governance_deliberations(id, task_id, project_id, platform, environment),
  check (freshness_deadline > created_at)
);

create table public.governance_council_assignments (
  id uuid primary key default gen_random_uuid(),
  deliberation_id uuid not null,
  council_role_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  participant_identity_hash text not null check (participant_identity_hash ~ '^[a-f0-9]{64}$'),
  model_identity_hash text not null check (model_identity_hash ~ '^[a-f0-9]{64}$'),
  conflict_state text not null default 'clear' check (
    conflict_state in ('clear','recused','conflict_detected')
  ),
  recusal_reason_hash text check (
    recusal_reason_hash is null or recusal_reason_hash ~ '^[a-f0-9]{64}$'
  ),
  assigned_at timestamptz not null default transaction_timestamp(),
  recused_at timestamptz,
  created_at timestamptz not null default transaction_timestamp(),
  unique (deliberation_id, council_role_id),
  unique (deliberation_id, participant_identity_hash),
  unique (deliberation_id, model_identity_hash),
  unique (id, task_id, project_id, platform, environment),
  foreign key (deliberation_id, task_id, project_id, platform, environment)
    references public.governance_deliberations(id, task_id, project_id, platform, environment),
  foreign key (council_role_id, task_id, project_id, platform, environment)
    references public.governance_council_roles(id, task_id, project_id, platform, environment),
  check (
    (conflict_state = 'recused' and recusal_reason_hash is not null and recused_at is not null)
    or (conflict_state <> 'recused' and recused_at is null)
  )
);

create table public.governance_assessments (
  id uuid primary key default gen_random_uuid(),
  deliberation_id uuid not null,
  evidence_packet_id uuid not null,
  council_role_id uuid not null,
  assignment_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  round_number integer not null default 1 check (round_number between 1 and 4),
  assessment_hash text not null check (assessment_hash ~ '^[a-f0-9]{64}$'),
  output_schema_hash text not null check (output_schema_hash ~ '^[a-f0-9]{64}$'),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  uncertainty text not null check (uncertainty in ('low','medium','high','blocked')),
  blind_submission boolean not null default true,
  submitted_at timestamptz not null default transaction_timestamp(),
  revealed_at timestamptz,
  created_at timestamptz not null default transaction_timestamp(),
  unique (deliberation_id, council_role_id, round_number),
  unique (id, task_id, project_id, platform, environment),
  foreign key (deliberation_id, task_id, project_id, platform, environment)
    references public.governance_deliberations(id, task_id, project_id, platform, environment),
  foreign key (evidence_packet_id, task_id, project_id, platform, environment)
    references public.governance_evidence_packets(id, task_id, project_id, platform, environment),
  foreign key (council_role_id, task_id, project_id, platform, environment)
    references public.governance_council_roles(id, task_id, project_id, platform, environment),
  foreign key (assignment_id, task_id, project_id, platform, environment)
    references public.governance_council_assignments(id, task_id, project_id, platform, environment),
  check (
    (round_number = 1 and blind_submission)
    or round_number > 1
  )
);

create table public.governance_proposals (
  id uuid primary key default gen_random_uuid(),
  deliberation_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  option_kind text not null check (
    option_kind in ('no_action','minimal_repair','moderate_improvement','larger_redesign')
  ),
  proposal_hash text not null check (proposal_hash ~ '^[a-f0-9]{64}$'),
  user_value_score numeric(5,2) not null check (user_value_score between 0 and 100),
  risk_score numeric(5,2) not null check (risk_score between 0 and 100),
  reversibility text not null check (reversibility in ('full','bounded','difficult','irreversible')),
  cost_estimate numeric(12,4) not null check (cost_estimate between 0 and 10000),
  proof_burden text not null check (proof_burden in ('source','provider','physical','legal')),
  rollback_hash text not null check (rollback_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default transaction_timestamp(),
  unique (deliberation_id, option_kind),
  unique (task_id, proposal_hash),
  unique (id, task_id, project_id, platform, environment),
  foreign key (deliberation_id, task_id, project_id, platform, environment)
    references public.governance_deliberations(id, task_id, project_id, platform, environment)
);

create table public.governance_votes (
  id uuid primary key default gen_random_uuid(),
  deliberation_id uuid not null,
  proposal_id uuid not null,
  council_role_id uuid not null,
  assignment_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  participant_identity_hash text not null check (participant_identity_hash ~ '^[a-f0-9]{64}$'),
  position text not null check (position in ('support','oppose','abstain')),
  rationale_hash text not null check (rationale_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default transaction_timestamp(),
  unique (deliberation_id, council_role_id),
  unique (deliberation_id, participant_identity_hash),
  unique (id, task_id, project_id, platform, environment),
  foreign key (deliberation_id, task_id, project_id, platform, environment)
    references public.governance_deliberations(id, task_id, project_id, platform, environment),
  foreign key (proposal_id, task_id, project_id, platform, environment)
    references public.governance_proposals(id, task_id, project_id, platform, environment),
  foreign key (council_role_id, task_id, project_id, platform, environment)
    references public.governance_council_roles(id, task_id, project_id, platform, environment),
  foreign key (assignment_id, task_id, project_id, platform, environment)
    references public.governance_council_assignments(id, task_id, project_id, platform, environment)
);

create table public.governance_vetoes (
  id uuid primary key default gen_random_uuid(),
  deliberation_id uuid not null,
  proposal_id uuid not null,
  council_role_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  veto_scope text not null check (veto_scope in (
    'security','privacy','auth_rls','money','user_rights',
    'public_release','legal','retention'
  )),
  mandatory boolean not null default true,
  reason_hash text not null check (reason_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'active' check (status in ('active','resolved','withdrawn')),
  resolved_by_owner uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default transaction_timestamp(),
  unique (id, task_id, project_id, platform, environment),
  foreign key (deliberation_id, task_id, project_id, platform, environment)
    references public.governance_deliberations(id, task_id, project_id, platform, environment),
  foreign key (proposal_id, task_id, project_id, platform, environment)
    references public.governance_proposals(id, task_id, project_id, platform, environment),
  foreign key (council_role_id, task_id, project_id, platform, environment)
    references public.governance_council_roles(id, task_id, project_id, platform, environment),
  check (
    (status = 'resolved' and resolved_by_owner is not null and resolved_at is not null)
    or (status <> 'resolved' and resolved_by_owner is null and resolved_at is null)
  )
);
create unique index governance_vetoes_active_scope_idx
  on public.governance_vetoes(deliberation_id, veto_scope)
  where status = 'active';

create table public.governance_dissent_reports (
  id uuid primary key default gen_random_uuid(),
  deliberation_id uuid not null,
  proposal_id uuid not null,
  council_role_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  dissent_hash text not null check (dissent_hash ~ '^[a-f0-9]{64}$'),
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  predicted_risk text not null check (predicted_risk in ('low','medium','high','critical')),
  resolution_state text not null default 'unresolved' check (
    resolution_state in ('unresolved','accepted_residual','resolved')
  ),
  created_at timestamptz not null default transaction_timestamp(),
  resolved_at timestamptz,
  unique (deliberation_id, council_role_id, proposal_id),
  unique (id, task_id, project_id, platform, environment),
  foreign key (deliberation_id, task_id, project_id, platform, environment)
    references public.governance_deliberations(id, task_id, project_id, platform, environment),
  foreign key (proposal_id, task_id, project_id, platform, environment)
    references public.governance_proposals(id, task_id, project_id, platform, environment),
  foreign key (council_role_id, task_id, project_id, platform, environment)
    references public.governance_council_roles(id, task_id, project_id, platform, environment)
);

create table public.governance_stakeholder_impacts (
  id uuid primary key default gen_random_uuid(),
  deliberation_id uuid not null,
  proposal_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  stakeholder_key text not null check (stakeholder_key in (
    'normal_users','creators','subscribers_buyers','minors_safety_sensitive',
    'accessibility_users','moderators_admins','owner_operations',
    'android','ios','web','privacy','security','support',
    'infrastructure_cost','provider_cost','legal_compliance'
  )),
  impact_level text not null check (impact_level in ('positive','neutral','negative','unknown')),
  impact_hash text not null check (impact_hash ~ '^[a-f0-9]{64}$'),
  mitigation_hash text check (mitigation_hash is null or mitigation_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default transaction_timestamp(),
  unique (proposal_id, stakeholder_key),
  unique (id, task_id, project_id, platform, environment),
  foreign key (deliberation_id, task_id, project_id, platform, environment)
    references public.governance_deliberations(id, task_id, project_id, platform, environment),
  foreign key (proposal_id, task_id, project_id, platform, environment)
    references public.governance_proposals(id, task_id, project_id, platform, environment)
);

create table public.governance_decision_manifests (
  id uuid primary key default gen_random_uuid(),
  deliberation_id uuid not null,
  evidence_packet_id uuid not null,
  selected_proposal_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  decision_key text not null check (
    length(decision_key) between 8 and 160
    and not public.cognitive_text_has_secret(decision_key)
    and not public.cognitive_text_has_private_identifier(decision_key)
  ),
  source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  architecture_graph_digest text not null check (architecture_graph_digest ~ '^[a-f0-9]{64}$'),
  evidence_manifest_hash text not null check (evidence_manifest_hash ~ '^[a-f0-9]{64}$'),
  research_claim_hashes text[] not null default '{}'::text[] check (
    public.governance_hash_array_valid(research_claim_hashes, 0, 128)
  ),
  selected_option_hash text not null check (selected_option_hash ~ '^[a-f0-9]{64}$'),
  rejected_option_hashes text[] not null default '{}'::text[] check (
    public.governance_hash_array_valid(rejected_option_hashes, 0, 16)
  ),
  council_attestation_hash text not null check (council_attestation_hash ~ '^[a-f0-9]{64}$'),
  votes_hash text not null check (votes_hash ~ '^[a-f0-9]{64}$'),
  vetoes_hash text not null check (vetoes_hash ~ '^[a-f0-9]{64}$'),
  dissent_hash text not null check (dissent_hash ~ '^[a-f0-9]{64}$'),
  stakeholder_impact_hash text not null check (stakeholder_impact_hash ~ '^[a-f0-9]{64}$'),
  risk_level text not null check (risk_level in ('low','medium','high','critical')),
  required_test_ids text[] not null check (cardinality(required_test_ids) between 1 and 128),
  capability_scope_hash text not null check (capability_scope_hash ~ '^[a-f0-9]{64}$'),
  budget_hash text not null check (budget_hash ~ '^[a-f0-9]{64}$'),
  maximum_executions integer not null check (maximum_executions between 0 and 10),
  rollback_hash text not null check (rollback_hash ~ '^[a-f0-9]{64}$'),
  external_confirmation_required boolean not null default false,
  decision_hash text not null unique check (decision_hash ~ '^[a-f0-9]{64}$'),
  status public.governance_decision_status not null default 'draft',
  expires_at timestamptz not null,
  finalized_at timestamptz,
  created_at timestamptz not null default transaction_timestamp(),
  unique (task_id, decision_key),
  unique (id, task_id, project_id, platform, environment),
  foreign key (deliberation_id, task_id, project_id, platform, environment)
    references public.governance_deliberations(id, task_id, project_id, platform, environment),
  foreign key (evidence_packet_id, task_id, project_id, platform, environment)
    references public.governance_evidence_packets(id, task_id, project_id, platform, environment),
  foreign key (selected_proposal_id, task_id, project_id, platform, environment)
    references public.governance_proposals(id, task_id, project_id, platform, environment),
  check (expires_at > created_at),
  check (
    (status = 'finalized' and finalized_at is not null)
    or status <> 'finalized'
  )
);

create table public.governance_decision_manifest_events (
  id uuid primary key default gen_random_uuid(),
  decision_manifest_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  event_sequence integer not null check (event_sequence >= 1),
  event_type text not null check (
    event_type in ('drafted','finalized','expired','superseded','appealed','reopened')
  ),
  event_hash text not null check (event_hash ~ '^[a-f0-9]{64}$'),
  actor_identity text not null check (
    length(actor_identity) between 3 and 128
    and not public.cognitive_text_has_secret(actor_identity)
    and not public.cognitive_text_has_private_identifier(actor_identity)
  ),
  created_at timestamptz not null default transaction_timestamp(),
  unique (decision_manifest_id, event_sequence),
  unique (id, task_id, project_id, platform, environment),
  foreign key (decision_manifest_id, task_id, project_id, platform, environment)
    references public.governance_decision_manifests(id, task_id, project_id, platform, environment)
);

create table public.governance_approvals (
  id uuid primary key default gen_random_uuid(),
  decision_manifest_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  approval_key text not null check (
    length(approval_key) between 8 and 160
    and not public.cognitive_text_has_secret(approval_key)
    and not public.cognitive_text_has_private_identifier(approval_key)
  ),
  objective_hash text not null check (objective_hash ~ '^[a-f0-9]{64}$'),
  requester_identity_hash text not null check (requester_identity_hash ~ '^[a-f0-9]{64}$'),
  requester_user_id uuid,
  current_version integer not null default 0 check (current_version between 0 and 1000),
  status public.governance_approval_status not null default 'pending',
  maximum_executions integer not null check (maximum_executions between 0 and 10),
  executions_consumed integer not null default 0 check (
    executions_consumed >= 0 and executions_consumed <= maximum_executions
  ),
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  unique (task_id, approval_key),
  unique (id, task_id, project_id, platform, environment),
  foreign key (decision_manifest_id, task_id, project_id, platform, environment)
    references public.governance_decision_manifests(id, task_id, project_id, platform, environment)
);

create table public.governance_approval_versions (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null,
  decision_manifest_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  version_number integer not null check (version_number between 1 and 1000),
  prior_version_id uuid,
  decision_manifest_hash text not null check (decision_manifest_hash ~ '^[a-f0-9]{64}$'),
  approval_scope_hash text not null check (approval_scope_hash ~ '^[a-f0-9]{64}$'),
  objective_hash text not null check (objective_hash ~ '^[a-f0-9]{64}$'),
  repository_full_name text not null check (
    repository_full_name = 'Chillywood2025/chillywood-mobile'
  ),
  branch_name text not null check (
    branch_name ~ '^codex/[a-z0-9][a-z0-9/_-]{2,120}$'
    and branch_name !~* '(^|/)(main|master|release)(/|$)'
  ),
  provider text not null check (provider in (
    'repository','github_draft_pr','public_research','model','none'
  )),
  target_scope_hash text not null check (target_scope_hash ~ '^[a-f0-9]{64}$'),
  allowed_action_types text[] not null check (
    cardinality(allowed_action_types) between 1 and 32
    and allowed_action_types <@ array[
      'repository_read_file','repository_list_files','repository_search',
      'repository_apply_patch','repository_write_new_file','test_run_allowlisted',
      'git_create_scoped_branch','git_stage_allowlisted_paths','git_commit_scoped',
      'git_push_scoped_draft_branch','github_open_draft_pr',
      'github_update_draft_pr_body','public_research_ingest',
      'collective_deliberation'
    ]::text[]
  ),
  allowed_resource_hashes text[] not null check (
    public.governance_hash_array_valid(allowed_resource_hashes, 1, 128)
  ),
  maximum_risk text not null check (maximum_risk in ('low','medium','high')),
  maximum_cost numeric(12,4) not null check (maximum_cost between 0 and 100),
  maximum_calls integer not null check (maximum_calls between 1 and 100),
  maximum_bytes bigint not null check (maximum_bytes between 1 and 10000000),
  maximum_executions integer not null check (maximum_executions between 1 and 10),
  required_test_ids text[] not null check (cardinality(required_test_ids) between 1 and 128),
  evaluator_required boolean not null default true check (evaluator_required = true),
  rollback_hash text not null check (rollback_hash ~ '^[a-f0-9]{64}$'),
  approved_by uuid not null,
  approved_at timestamptz not null,
  valid_from timestamptz not null,
  expires_at timestamptz not null,
  status public.governance_approval_status not null,
  revalidation_hash text check (
    revalidation_hash is null or revalidation_hash ~ '^[a-f0-9]{64}$'
  ),
  material_delta boolean not null default false,
  created_at timestamptz not null default transaction_timestamp(),
  unique (approval_id, version_number),
  unique (id, task_id, project_id, platform, environment),
  foreign key (approval_id, task_id, project_id, platform, environment)
    references public.governance_approvals(id, task_id, project_id, platform, environment),
  foreign key (decision_manifest_id, task_id, project_id, platform, environment)
    references public.governance_decision_manifests(id, task_id, project_id, platform, environment),
  foreign key (prior_version_id, task_id, project_id, platform, environment)
    references public.governance_approval_versions(id, task_id, project_id, platform, environment),
  check (valid_from >= approved_at),
  check (expires_at > valid_from and expires_at <= valid_from + interval '24 hours'),
  check (
    (version_number = 1 and prior_version_id is null)
    or (version_number > 1 and prior_version_id is not null)
  )
);

create table public.governance_approval_events (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null,
  approval_version_id uuid,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  event_sequence integer not null check (event_sequence >= 1),
  event_type text not null check (event_type in (
    'requested','activated','execution_started','adapted','provider_wait',
    'blocked','rollback','no_action','twelve_hours_remaining',
    'two_hours_remaining','expired','reinstatement_available',
    'amendment_required','consumed','revoked','completed'
  )),
  event_hash text not null check (event_hash ~ '^[a-f0-9]{64}$'),
  actor_identity_hash text not null check (actor_identity_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default transaction_timestamp(),
  unique (approval_id, event_sequence),
  unique (id, task_id, project_id, platform, environment),
  foreign key (approval_id, task_id, project_id, platform, environment)
    references public.governance_approvals(id, task_id, project_id, platform, environment),
  foreign key (approval_version_id, task_id, project_id, platform, environment)
    references public.governance_approval_versions(id, task_id, project_id, platform, environment)
);

create table public.governance_appeals (
  id uuid primary key default gen_random_uuid(),
  decision_manifest_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  appeal_key text not null check (
    length(appeal_key) between 8 and 160
    and not public.cognitive_text_has_secret(appeal_key)
    and not public.cognitive_text_has_private_identifier(appeal_key)
  ),
  appeal_type text not null check (
    appeal_type in ('owner_reconsideration','new_evidence','expired_decision','dissent','outcome')
  ),
  evidence_delta_hash text not null check (evidence_delta_hash ~ '^[a-f0-9]{64}$'),
  prior_appeal_id uuid,
  material_new_evidence boolean not null,
  status text not null default 'pending' check (
    status in ('pending','accepted','denied','closed')
  ),
  created_at timestamptz not null default transaction_timestamp(),
  resolved_at timestamptz,
  unique (task_id, appeal_key),
  unique (id, task_id, project_id, platform, environment),
  foreign key (decision_manifest_id, task_id, project_id, platform, environment)
    references public.governance_decision_manifests(id, task_id, project_id, platform, environment),
  foreign key (prior_appeal_id, task_id, project_id, platform, environment)
    references public.governance_appeals(id, task_id, project_id, platform, environment),
  check (
    prior_appeal_id is null or material_new_evidence
  )
);

create table public.governance_decision_capability_bindings (
  id uuid primary key default gen_random_uuid(),
  decision_manifest_id uuid not null,
  approval_version_id uuid not null,
  capability_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  decision_manifest_hash text not null check (decision_manifest_hash ~ '^[a-f0-9]{64}$'),
  approval_scope_hash text not null check (approval_scope_hash ~ '^[a-f0-9]{64}$'),
  plan_snapshot_hash text not null check (plan_snapshot_hash ~ '^[a-f0-9]{64}$'),
  binding_hash text not null unique check (binding_hash ~ '^[a-f0-9]{64}$'),
  bound_at timestamptz not null default transaction_timestamp(),
  revoked_at timestamptz,
  created_at timestamptz not null default transaction_timestamp(),
  unique (capability_id),
  unique (id, task_id, project_id, platform, environment),
  foreign key (decision_manifest_id, task_id, project_id, platform, environment)
    references public.governance_decision_manifests(id, task_id, project_id, platform, environment),
  foreign key (approval_version_id, task_id, project_id, platform, environment)
    references public.governance_approval_versions(id, task_id, project_id, platform, environment),
  foreign key (capability_id, task_id, project_id, platform, environment)
    references public.cognitive_capabilities(id, task_id, project_id, platform, environment)
);

create table public.cognitive_execution_receipts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  repository_full_name text not null check (
    repository_full_name = 'Chillywood2025/chillywood-mobile'
  ),
  branch_name text not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  capability_id uuid not null,
  capability_usage_sequence integer not null check (capability_usage_sequence >= 1),
  call_id text not null check (
    length(call_id) between 3 and 128
    and not public.cognitive_text_has_secret(call_id)
    and not public.cognitive_text_has_private_identifier(call_id)
  ),
  decision_manifest_id uuid not null,
  decision_manifest_hash text not null check (decision_manifest_hash ~ '^[a-f0-9]{64}$'),
  approval_version_id uuid not null,
  plan_snapshot_id uuid not null,
  plan_snapshot_hash text not null check (plan_snapshot_hash ~ '^[a-f0-9]{64}$'),
  before_state_hash text not null check (before_state_hash ~ '^[a-f0-9]{64}$'),
  after_state_hash text not null check (after_state_hash ~ '^[a-f0-9]{64}$'),
  untrusted_result_envelope_hash text not null check (
    untrusted_result_envelope_hash ~ '^[a-f0-9]{64}$'
  ),
  actual_bytes bigint not null check (actual_bytes between 0 and 10000000),
  actual_calls integer not null check (actual_calls between 1 and 100),
  actual_cost numeric(12,4) not null check (actual_cost between 0 and 100),
  resource_lease_ids uuid[] not null check (cardinality(resource_lease_ids) between 0 and 64),
  diff_hash text check (diff_hash is null or diff_hash ~ '^[a-f0-9]{64}$'),
  final_commit text check (final_commit is null or final_commit ~ '^[a-f0-9]{40}$'),
  rollback_state text not null check (
    rollback_state in ('not_required','pending','running','succeeded','failed')
  ),
  evaluator_state public.cognitive_evaluation_status not null default 'incomplete',
  receipt_state text not null check (
    receipt_state in (
      'pending_evaluation','accepted','rejected','quarantined','rollback_pending'
    )
  ),
  receipt_hash text not null unique check (receipt_hash ~ '^[a-f0-9]{64}$'),
  completed_at timestamptz not null default transaction_timestamp(),
  created_at timestamptz not null default transaction_timestamp(),
  unique (capability_id, capability_usage_sequence),
  unique (capability_id, call_id),
  unique (id, task_id, project_id, platform, environment),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment),
  foreign key (capability_id, task_id, project_id, platform, environment)
    references public.cognitive_capabilities(id, task_id, project_id, platform, environment),
  foreign key (decision_manifest_id, task_id, project_id, platform, environment)
    references public.governance_decision_manifests(id, task_id, project_id, platform, environment),
  foreign key (approval_version_id, task_id, project_id, platform, environment)
    references public.governance_approval_versions(id, task_id, project_id, platform, environment),
  foreign key (plan_snapshot_id, task_id, project_id, platform, environment)
    references public.execution_plan_snapshots(id, task_id, project_id, platform, environment),
  check (completed_at = created_at)
);

create table public.governance_execution_receipt_leases (
  receipt_id uuid not null,
  lease_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  created_at timestamptz not null default transaction_timestamp(),
  primary key (receipt_id, lease_id),
  unique (receipt_id, lease_id, task_id, project_id, platform, environment),
  foreign key (receipt_id, task_id, project_id, platform, environment)
    references public.cognitive_execution_receipts(id, task_id, project_id, platform, environment),
  foreign key (lease_id, task_id, project_id, platform, environment)
    references public.cognitive_resource_leases(id, task_id, project_id, platform, environment)
);

create table public.governance_outcome_evaluations (
  id uuid primary key default gen_random_uuid(),
  decision_manifest_id uuid not null,
  execution_receipt_id uuid,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  prediction_hash text not null check (prediction_hash ~ '^[a-f0-9]{64}$'),
  actual_result_hash text not null check (actual_result_hash ~ '^[a-f0-9]{64}$'),
  test_coverage_hash text not null check (test_coverage_hash ~ '^[a-f0-9]{64}$'),
  impact_hash text not null check (impact_hash ~ '^[a-f0-9]{64}$'),
  provider_cost numeric(12,4) not null check (provider_cost between 0 and 10000),
  rollback_required boolean not null default false,
  dissent_accuracy_hash text not null check (dissent_accuracy_hash ~ '^[a-f0-9]{64}$'),
  source_reliability_hash text not null check (source_reliability_hash ~ '^[a-f0-9]{64}$'),
  evaluator_identity_hash text not null check (evaluator_identity_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default transaction_timestamp(),
  unique (decision_manifest_id, execution_receipt_id),
  unique (id, task_id, project_id, platform, environment),
  foreign key (decision_manifest_id, task_id, project_id, platform, environment)
    references public.governance_decision_manifests(id, task_id, project_id, platform, environment),
  foreign key (execution_receipt_id, task_id, project_id, platform, environment)
    references public.cognitive_execution_receipts(id, task_id, project_id, platform, environment)
);

create table public.governance_calibration_records (
  id uuid primary key default gen_random_uuid(),
  outcome_evaluation_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  calibration_type text not null check (calibration_type in (
    'source_reliability','council_role','tool_preference','test_preference',
    'playbook_confidence','expected_cost_time','model_routing'
  )),
  subject_hash text not null check (subject_hash ~ '^[a-f0-9]{64}$'),
  prior_value numeric(8,5) not null check (prior_value between 0 and 1),
  next_value numeric(8,5) not null check (next_value between 0 and 1),
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  authority_change_allowed boolean not null default false check (authority_change_allowed = false),
  created_at timestamptz not null default transaction_timestamp(),
  unique (outcome_evaluation_id, calibration_type, subject_hash),
  unique (id, task_id, project_id, platform, environment),
  foreign key (outcome_evaluation_id, task_id, project_id, platform, environment)
    references public.governance_outcome_evaluations(id, task_id, project_id, platform, environment)
);

create table public.governance_audit_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  entity_type text not null check (entity_type in (
    'constitution','deliberation','assessment','proposal','vote','veto','dissent',
    'decision','approval','appeal','capability_binding','execution_receipt',
    'outcome','calibration','switch','retention'
  )),
  entity_id uuid not null,
  event_type text not null check (
    length(event_type) between 3 and 80
    and not public.cognitive_text_has_secret(event_type)
    and not public.cognitive_text_has_private_identifier(event_type)
  ),
  actor_identity_hash text not null check (actor_identity_hash ~ '^[a-f0-9]{64}$'),
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default transaction_timestamp(),
  unique (entity_type, entity_id, event_type, evidence_hash),
  unique (id, task_id, project_id, platform, environment),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment)
);

create table public.governance_approval_notifications (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null,
  approval_version_id uuid,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  notification_type text not null check (notification_type in (
    'activated','execution_begins','material_adaptation','provider_wait',
    'blocked','rollback','no_action','twelve_hours_remaining',
    'two_hours_remaining','expired','reinstatement_available',
    'amended_approval_required','completed'
  )),
  delivery_state text not null default 'pending' check (
    delivery_state in ('pending','delivered','blocked','expired')
  ),
  dedupe_key text not null check (
    length(dedupe_key) between 8 and 256
    and not public.cognitive_text_has_secret(dedupe_key)
    and not public.cognitive_text_has_private_identifier(dedupe_key)
  ),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  deliver_after timestamptz not null,
  expires_at timestamptz not null,
  delivered_at timestamptz,
  created_at timestamptz not null default transaction_timestamp(),
  unique (approval_id, dedupe_key),
  unique (id, task_id, project_id, platform, environment),
  foreign key (approval_id, task_id, project_id, platform, environment)
    references public.governance_approvals(id, task_id, project_id, platform, environment),
  foreign key (approval_version_id, task_id, project_id, platform, environment)
    references public.governance_approval_versions(id, task_id, project_id, platform, environment),
  check (expires_at > deliver_after)
);

create table public.cognitive_governance_switches (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  switch_key text not null check (switch_key in (
    'cognitive_research_enabled',
    'cognitive_memory_enabled',
    'cognitive_collective_deliberation_enabled',
    'cognitive_draft_pr_executor_enabled',
    'cognitive_scheduled_level01_enabled',
    'cognitive_level2_production_repairs_enabled',
    'cognitive_user_derived_memory_enabled'
  )),
  enabled boolean not null default false,
  policy_version text not null check (
    length(policy_version) between 1 and 64
    and not public.cognitive_text_has_secret(policy_version)
  ),
  enabled_by uuid,
  enabled_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  unique (task_id, switch_key),
  unique (id, task_id, project_id, platform, environment),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment),
  check (
    not enabled
    or switch_key not in (
      'cognitive_level2_production_repairs_enabled',
      'cognitive_user_derived_memory_enabled'
    )
  ),
  check (
    (enabled and enabled_by is not null and enabled_at is not null and disabled_at is null)
    or (not enabled and enabled_at is null)
  )
);

create table public.cognitive_retention_policy_states (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  policy_hash text not null check (policy_hash ~ '^[a-f0-9]{64}$'),
  policy_state text not null default 'owner_counsel_decision_required' check (
    policy_state in ('owner_counsel_decision_required','approved','superseded')
  ),
  user_derived_memory_allowed boolean not null default false,
  raw_user_reports_allowed boolean not null default false,
  raw_private_messages_allowed boolean not null default false,
  raw_private_media_allowed boolean not null default false,
  raw_user_analytics_allowed boolean not null default false,
  private_model_input_allowed boolean not null default false,
  approved_by uuid,
  approved_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default transaction_timestamp(),
  unique (task_id, policy_state),
  unique (id, task_id, project_id, platform, environment),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment),
  check (
    policy_state = 'approved'
    or (
      not user_derived_memory_allowed
      and not raw_user_reports_allowed
      and not raw_private_messages_allowed
      and not raw_private_media_allowed
      and not raw_user_analytics_allowed
      and not private_model_input_allowed
      and approved_by is null
      and approved_at is null
    )
  ),
  check (
    policy_state <> 'approved'
    or (
      approved_by is not null
      and approved_at is not null
      and expires_at is not null
      and expires_at > approved_at
    )
  )
);

create function public.governance_exact_owner(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and exists (
      select 1
      from public.platform_role_memberships membership
      where membership.status = 'active'
        and membership.role = 'owner'
        and membership.user_id = p_user_id::text
    );
$$;
revoke all on function public.governance_exact_owner(uuid)
  from public, anon;
grant execute on function public.governance_exact_owner(uuid)
  to authenticated, service_role;

create function public.governance_assert_exact_owner()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null or not public.governance_exact_owner(actor_id) then
    raise exception 'governance_owner_identity_required' using errcode = '42501';
  end if;
  return actor_id;
end;
$$;
revoke all on function public.governance_assert_exact_owner()
  from public, anon;
grant execute on function public.governance_assert_exact_owner()
  to authenticated;

-- Edge Functions hold distinct opaque service credentials.  The foundation
-- registry, rather than a caller-supplied label, establishes the service
-- identity used by this governance function.
create function public.governance_assert_level01_service_actor(
  p_allowed_actors text[],
  p_claimed_actor text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare authenticated_actor text;
begin
  if p_claimed_actor is null
     or p_claimed_actor not in (
       'governance_constitution_service',
       'deliberation_orchestrator',
       'decision_manifest_authority',
       'owner_approval_lifecycle_service',
       'capability_and_tool_broker',
       'cognitive_postflight_authority',
       'independent_evaluation_judge',
       'approval_revalidation_service',
       'research_source_broker',
       'intelligence_memory_service',
       'governance_canary_scheduler'
     ) then
    raise exception 'governance_level01_service_actor_mismatch'
      using errcode = '42501';
  end if;
  authenticated_actor := public.cognitive_assert_service_actor(
    p_allowed_actors,
    p_claimed_actor
  );
  return authenticated_actor;
end;
$$;
revoke all on function public.governance_assert_level01_service_actor(text[],text)
  from public, anon, authenticated;
grant execute on function public.governance_assert_level01_service_actor(text[],text)
  to service_role;

create function public.governance_bootstrap_constitution(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_constitution_key text,
  p_title text,
  p_constitution_hash text,
  p_policy_snapshot jsonb,
  p_rollback_hash text,
  p_actor_identity text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  constitution_id uuid;
  version_id uuid;
  role_key_value text;
  veto_scope_values text[];
begin
  perform public.governance_assert_level01_service_actor(
    array['governance_constitution_service','governance_canary_scheduler'],
    p_actor_identity
  );
  if p_constitution_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_hash !~ '^[a-f0-9]{64}$'
     or p_policy_snapshot is null
     or pg_column_size(p_policy_snapshot) > 65536
     or not public.cognitive_json_is_sanitized(p_policy_snapshot) then
    raise exception 'governance_constitution_rejected' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.governance_constitutions
    where task_id = p_task_id and constitution_key = p_constitution_key
  ) then
    raise exception 'governance_constitution_exists' using errcode = '23505';
  end if;

  insert into public.governance_constitutions(
    task_id, project_id, platform, environment, constitution_key, title,
    created_by_identity
  ) values (
    p_task_id, p_project_id, p_platform, p_environment, p_constitution_key,
    p_title, p_actor_identity
  ) returning id into constitution_id;

  insert into public.governance_constitution_versions(
    constitution_id, task_id, project_id, platform, environment,
    version_number, constitution_hash, policy_snapshot, proposed_by_identity,
    rollback_hash
  ) values (
    constitution_id, p_task_id, p_project_id, p_platform, p_environment,
    1, p_constitution_hash, p_policy_snapshot, p_actor_identity, p_rollback_hash
  ) returning id into version_id;

  foreach role_key_value in array array[
    'product_user_experience',
    'architecture_engineering',
    'security_privacy',
    'reliability_release',
    'safety_trust',
    'accessibility_inclusion',
    'money_commercial_policy',
    'research_futures',
    'adversarial_red_team'
  ] loop
    veto_scope_values := case role_key_value
      when 'security_privacy' then array['security','privacy','auth_rls','retention']
      when 'reliability_release' then array['public_release']
      when 'money_commercial_policy' then array['money']
      when 'safety_trust' then array['user_rights','legal']
      else '{}'::text[]
    end;
    insert into public.governance_council_roles(
      constitution_version_id, task_id, project_id, platform, environment,
      role_key, allowed_evidence_types, required_question_hashes,
      veto_scopes, timeout_seconds
    ) values (
      version_id, p_task_id, p_project_id, p_platform, p_environment,
      role_key_value,
      array['source','test','provider_readback','architecture_graph'],
      array[encode(
        extensions.digest(convert_to(role_key_value || ':required-question','UTF8'),'sha256'),
        'hex'
      )],
      veto_scope_values,
      600
    );
  end loop;

  insert into public.governance_audit_events(
    task_id, project_id, platform, environment, entity_type, entity_id,
    event_type, actor_identity_hash, evidence_hash
  ) values (
    p_task_id, p_project_id, p_platform, p_environment, 'constitution',
    constitution_id, 'bootstrapped',
    encode(extensions.digest(convert_to(p_actor_identity,'UTF8'),'sha256'),'hex'),
    p_constitution_hash
  );
  return version_id;
end;
$$;
revoke all on function public.governance_bootstrap_constitution(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,jsonb,text,text
) from public, anon, authenticated;
grant execute on function public.governance_bootstrap_constitution(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,jsonb,text,text
) to service_role;

create function public.governance_finalize_decision(
  p_deliberation_id uuid,
  p_selected_proposal_id uuid,
  p_decision_key text,
  p_required_test_ids text[],
  p_capability_scope_hash text,
  p_budget_hash text,
  p_maximum_executions integer,
  p_rollback_hash text,
  p_external_confirmation_required boolean,
  p_actor_identity text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  deliberation_value public.governance_deliberations%rowtype;
  packet_value public.governance_evidence_packets%rowtype;
  proposal_value public.governance_proposals%rowtype;
  decision_id uuid;
  decision_hash_value text;
  now_at timestamptz := transaction_timestamp();
  supporting_votes integer;
  opposing_votes integer;
  stakeholder_count integer;
  council_attestation_hash_value text;
  votes_hash_value text;
  vetoes_hash_value text;
  dissent_hash_value text;
  stakeholder_impact_hash_value text;
begin
  perform public.governance_assert_level01_service_actor(
    array['decision_manifest_authority'],
    p_actor_identity
  );
  select * into deliberation_value
  from public.governance_deliberations
  where id = p_deliberation_id
  for update;
  if deliberation_value.id is null
     or deliberation_value.status not in ('criticizing','voting')
     or now_at >= deliberation_value.deadline_at then
    raise exception 'governance_decision_preflight_rejected' using errcode = 'P0001';
  end if;
  select * into packet_value
  from public.governance_evidence_packets
  where deliberation_id = deliberation_value.id;
  select * into proposal_value
  from public.governance_proposals
  where id = p_selected_proposal_id
    and deliberation_id = deliberation_value.id;
  if packet_value.id is null
     or proposal_value.id is null
     or now_at >= packet_value.freshness_deadline
     or p_required_test_ids is null
     or cardinality(p_required_test_ids) not between 1 and 128
     or p_capability_scope_hash !~ '^[a-f0-9]{64}$'
     or p_budget_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_hash !~ '^[a-f0-9]{64}$'
     or p_maximum_executions not between 0 and 10 then
    raise exception 'governance_decision_preflight_rejected' using errcode = 'P0001';
  end if;
  if not exists (
    select 1
    from public.governance_proposals proposal
    where proposal.deliberation_id = deliberation_value.id
      and proposal.option_kind = 'no_action'
  ) or not exists (
    select 1
    from public.governance_proposals proposal
    where proposal.deliberation_id = deliberation_value.id
      and proposal.option_kind = 'minimal_repair'
  ) or not exists (
    select 1
    from public.governance_proposals proposal
    where proposal.deliberation_id = deliberation_value.id
      and proposal.option_kind = 'moderate_improvement'
  ) then
    raise exception 'governance_required_alternatives_missing' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from unnest(array[
      'product_user_experience',
      'security_privacy',
      'reliability_release',
      'adversarial_red_team'
    ]) mandatory_role
    where not exists (
      select 1
      from public.governance_assessments assessment
      join public.governance_council_roles council_role
        on council_role.id = assessment.council_role_id
       and council_role.task_id = assessment.task_id
       and council_role.project_id = assessment.project_id
       and council_role.platform = assessment.platform
       and council_role.environment = assessment.environment
      join public.governance_council_assignments assignment
        on assignment.id = assessment.assignment_id
       and assignment.council_role_id = assessment.council_role_id
       and assignment.task_id = assessment.task_id
       and assignment.project_id = assessment.project_id
       and assignment.platform = assessment.platform
       and assignment.environment = assessment.environment
      where assessment.deliberation_id = deliberation_value.id
        and assessment.round_number = 1
        and assessment.blind_submission
        and council_role.role_key = mandatory_role
        and assignment.conflict_state = 'clear'
    )
  ) then
    raise exception 'governance_required_criticism_missing' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.governance_vetoes veto
    where veto.deliberation_id = deliberation_value.id
      and veto.mandatory
      and veto.status = 'active'
  ) then
    update public.governance_deliberations
    set status = 'blocked', updated_at = now_at
    where id = deliberation_value.id;
    raise exception 'governance_mandatory_veto_active' using errcode = 'P0001';
  end if;
  select count(*)::integer into supporting_votes
  from public.governance_votes vote
  join public.governance_council_assignments assignment
    on assignment.id = vote.assignment_id
   and assignment.council_role_id = vote.council_role_id
   and assignment.participant_identity_hash = vote.participant_identity_hash
   and assignment.task_id = vote.task_id
   and assignment.project_id = vote.project_id
   and assignment.platform = vote.platform
   and assignment.environment = vote.environment
  where vote.deliberation_id = deliberation_value.id
    and vote.proposal_id = proposal_value.id
    and vote.position = 'support'
    and assignment.conflict_state = 'clear';
  select count(*)::integer into opposing_votes
  from public.governance_votes vote
  join public.governance_council_assignments assignment
    on assignment.id = vote.assignment_id
   and assignment.council_role_id = vote.council_role_id
   and assignment.participant_identity_hash = vote.participant_identity_hash
   and assignment.task_id = vote.task_id
   and assignment.project_id = vote.project_id
   and assignment.platform = vote.platform
   and assignment.environment = vote.environment
  where vote.deliberation_id = deliberation_value.id
    and vote.proposal_id = proposal_value.id
    and vote.position = 'oppose'
    and assignment.conflict_state = 'clear';
  if supporting_votes < deliberation_value.required_quorum
     or supporting_votes <= opposing_votes then
    raise exception 'governance_quorum_not_met' using errcode = 'P0001';
  end if;
  select count(distinct stakeholder_key)::integer into stakeholder_count
  from public.governance_stakeholder_impacts
  where deliberation_id = deliberation_value.id
    and proposal_id = proposal_value.id;
  if stakeholder_count <> 16 then
    raise exception 'governance_stakeholder_review_incomplete' using errcode = 'P0001';
  end if;

  select encode(extensions.digest(convert_to(coalesce(jsonb_agg(
    jsonb_build_object(
      'assignmentId', assignment.id,
      'roleId', assignment.council_role_id,
      'participantHash', assignment.participant_identity_hash,
      'modelHash', assignment.model_identity_hash,
      'conflictState', assignment.conflict_state,
      'assessmentHash', assessment.assessment_hash,
      'schemaHash', assessment.output_schema_hash,
      'round', assessment.round_number,
      'blind', assessment.blind_submission
    ) order by assignment.council_role_id, assessment.round_number
  ),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex')
  into council_attestation_hash_value
  from public.governance_council_assignments assignment
  left join public.governance_assessments assessment
    on assessment.assignment_id=assignment.id
   and assessment.council_role_id=assignment.council_role_id
   and assessment.task_id=assignment.task_id
   and assessment.project_id=assignment.project_id
   and assessment.platform=assignment.platform
   and assessment.environment=assignment.environment
  where assignment.deliberation_id=deliberation_value.id;

  select encode(extensions.digest(convert_to(coalesce(jsonb_agg(
    jsonb_build_object(
      'roleId',vote.council_role_id,
      'assignmentId',vote.assignment_id,
      'participantHash',vote.participant_identity_hash,
      'proposalId',vote.proposal_id,
      'position',vote.position,
      'rationaleHash',vote.rationale_hash
    ) order by vote.council_role_id
  ),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex')
  into votes_hash_value
  from public.governance_votes vote
  where vote.deliberation_id=deliberation_value.id;

  select encode(extensions.digest(convert_to(coalesce(jsonb_agg(
    jsonb_build_object(
      'roleId',veto.council_role_id,
      'proposalId',veto.proposal_id,
      'scope',veto.veto_scope,
      'mandatory',veto.mandatory,
      'reasonHash',veto.reason_hash,
      'status',veto.status
    ) order by veto.council_role_id,veto.veto_scope
  ),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex')
  into vetoes_hash_value
  from public.governance_vetoes veto
  where veto.deliberation_id=deliberation_value.id;

  select encode(extensions.digest(convert_to(coalesce(jsonb_agg(
    jsonb_build_object(
      'roleId',dissent.council_role_id,
      'proposalId',dissent.proposal_id,
      'dissentHash',dissent.dissent_hash,
      'evidenceHash',dissent.evidence_hash,
      'predictedRisk',dissent.predicted_risk,
      'resolutionState',dissent.resolution_state
    ) order by dissent.council_role_id,dissent.proposal_id
  ),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex')
  into dissent_hash_value
  from public.governance_dissent_reports dissent
  where dissent.deliberation_id=deliberation_value.id;

  select encode(extensions.digest(convert_to(coalesce(jsonb_agg(
    jsonb_build_object(
      'proposalId',impact.proposal_id,
      'stakeholder',impact.stakeholder_key,
      'impact',impact.impact_level,
      'impactHash',impact.impact_hash,
      'mitigationHash',impact.mitigation_hash
    ) order by impact.proposal_id,impact.stakeholder_key
  ),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex')
  into stakeholder_impact_hash_value
  from public.governance_stakeholder_impacts impact
  where impact.deliberation_id=deliberation_value.id;

  decision_hash_value := encode(extensions.digest(convert_to(concat_ws(
    '|',
    deliberation_value.id::text,
    packet_value.packet_hash,
    proposal_value.proposal_hash,
    deliberation_value.source_commit,
    deliberation_value.architecture_graph_digest,
    p_capability_scope_hash,
    p_budget_hash,
    p_maximum_executions::text,
    p_rollback_hash,
    council_attestation_hash_value,
    votes_hash_value,
    vetoes_hash_value,
    dissent_hash_value,
    stakeholder_impact_hash_value
  ),'UTF8'),'sha256'),'hex');

  insert into public.governance_decision_manifests(
    deliberation_id, evidence_packet_id, selected_proposal_id,
    task_id, project_id, platform, environment, decision_key,
    source_commit, architecture_graph_digest, evidence_manifest_hash,
    research_claim_hashes, selected_option_hash, rejected_option_hashes,
    council_attestation_hash, votes_hash, vetoes_hash, dissent_hash,
    stakeholder_impact_hash, risk_level, required_test_ids,
    capability_scope_hash, budget_hash, maximum_executions, rollback_hash,
    external_confirmation_required, decision_hash, status, expires_at, finalized_at
  ) values (
    deliberation_value.id, packet_value.id, proposal_value.id,
    deliberation_value.task_id, deliberation_value.project_id,
    deliberation_value.platform, deliberation_value.environment, p_decision_key,
    deliberation_value.source_commit, deliberation_value.architecture_graph_digest,
    packet_value.packet_hash, packet_value.research_claim_hashes,
    proposal_value.proposal_hash,
    coalesce((
      select array_agg(proposal.proposal_hash order by proposal.proposal_hash)
      from public.governance_proposals proposal
      where proposal.deliberation_id = deliberation_value.id
        and proposal.id <> proposal_value.id
    ), '{}'::text[]),
    council_attestation_hash_value,
    votes_hash_value,
    vetoes_hash_value,
    dissent_hash_value,
    stakeholder_impact_hash_value,
    deliberation_value.risk_level, p_required_test_ids,
    p_capability_scope_hash, p_budget_hash, p_maximum_executions,
    p_rollback_hash, p_external_confirmation_required, decision_hash_value,
    'finalized', least(deliberation_value.deadline_at, now_at + interval '30 days'), now_at
  ) returning id into decision_id;

  insert into public.governance_decision_manifest_events(
    decision_manifest_id, task_id, project_id, platform, environment,
    event_sequence, event_type, event_hash, actor_identity
  ) values (
    decision_id, deliberation_value.task_id, deliberation_value.project_id,
    deliberation_value.platform, deliberation_value.environment,
    1, 'finalized', decision_hash_value, p_actor_identity
  );
  update public.governance_deliberations
  set status = 'decided', decided_at = now_at, updated_at = now_at
  where id = deliberation_value.id;
  return decision_id;
end;
$$;
revoke all on function public.governance_finalize_decision(
  uuid,uuid,text,text[],text,text,integer,text,boolean,text
) from public, anon, authenticated;
grant execute on function public.governance_finalize_decision(
  uuid,uuid,text,text[],text,text,integer,text,boolean,text
) to service_role;

create function public.governance_request_approval(
  p_decision_manifest_id uuid,
  p_approval_key text,
  p_objective_hash text,
  p_requester_identity_hash text,
  p_requester_user_id uuid,
  p_maximum_executions integer,
  p_actor_identity text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  decision_value public.governance_decision_manifests%rowtype;
  approval_id uuid;
begin
  perform public.governance_assert_level01_service_actor(
    array['owner_approval_lifecycle_service'],
    p_actor_identity
  );
  select * into decision_value
  from public.governance_decision_manifests
  where id = p_decision_manifest_id and status = 'finalized';
  if decision_value.id is null
     or transaction_timestamp() >= decision_value.expires_at
     or p_objective_hash !~ '^[a-f0-9]{64}$'
     or p_requester_identity_hash !~ '^[a-f0-9]{64}$'
     or p_maximum_executions < 1
     or p_maximum_executions > decision_value.maximum_executions then
    raise exception 'governance_approval_request_rejected' using errcode = 'P0001';
  end if;
  insert into public.governance_approvals(
    decision_manifest_id, task_id, project_id, platform, environment,
    approval_key, objective_hash, requester_identity_hash, requester_user_id,
    maximum_executions
  ) values (
    decision_value.id, decision_value.task_id, decision_value.project_id,
    decision_value.platform, decision_value.environment, p_approval_key,
    p_objective_hash, p_requester_identity_hash, p_requester_user_id,
    p_maximum_executions
  ) returning id into approval_id;
  insert into public.governance_approval_events(
    approval_id, task_id, project_id, platform, environment, event_sequence,
    event_type, event_hash, actor_identity_hash
  ) values (
    approval_id, decision_value.task_id, decision_value.project_id,
    decision_value.platform, decision_value.environment, 1,
    'requested', p_objective_hash,
    encode(extensions.digest(convert_to(p_actor_identity,'UTF8'),'sha256'),'hex')
  );
  return approval_id;
end;
$$;
revoke all on function public.governance_request_approval(
  uuid,text,text,text,uuid,integer,text
) from public, anon, authenticated;
grant execute on function public.governance_request_approval(
  uuid,text,text,text,uuid,integer,text
) to service_role;

create function public.governance_owner_activate_approval(
  p_approval_id uuid,
  p_approval_scope_hash text,
  p_repository_full_name text,
  p_branch_name text,
  p_provider text,
  p_target_scope_hash text,
  p_allowed_action_types text[],
  p_allowed_resource_hashes text[],
  p_maximum_risk text,
  p_maximum_cost numeric,
  p_maximum_calls integer,
  p_maximum_bytes bigint,
  p_required_test_ids text[],
  p_rollback_hash text,
  p_validity interval default interval '24 hours'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  approval_value public.governance_approvals%rowtype;
  decision_value public.governance_decision_manifests%rowtype;
  version_id uuid;
  now_at timestamptz := transaction_timestamp();
begin
  select * into approval_value
  from public.governance_approvals
  where id = p_approval_id
  for update;
  if approval_value.id is null
     or approval_value.status <> 'pending'
     or approval_value.requester_user_id is not null
        and approval_value.requester_user_id = owner_id then
    raise exception 'governance_self_or_invalid_approval_rejected' using errcode = 'P0001';
  end if;
  select * into decision_value
  from public.governance_decision_manifests
  where id = approval_value.decision_manifest_id
    and task_id = approval_value.task_id
    and project_id = approval_value.project_id
    and platform = approval_value.platform
    and environment = approval_value.environment;
  if decision_value.id is null
     or decision_value.status <> 'finalized'
     or now_at >= decision_value.expires_at
     or exists (
       select 1 from public.governance_vetoes veto
       where veto.deliberation_id = decision_value.deliberation_id
         and veto.mandatory and veto.status = 'active'
     )
     or p_approval_scope_hash !~ '^[a-f0-9]{64}$'
     or p_approval_scope_hash <> decision_value.capability_scope_hash
     or p_repository_full_name <> 'Chillywood2025/chillywood-mobile'
     or p_branch_name !~ '^codex/[a-z0-9][a-z0-9/_-]{2,120}$'
     or p_branch_name ~* '(^|/)(main|master|release)(/|$)'
     or p_provider not in ('repository','github_draft_pr','public_research','model','none')
     or p_target_scope_hash !~ '^[a-f0-9]{64}$'
     or p_allowed_action_types is null
     or cardinality(p_allowed_action_types) not between 1 and 32
     or not p_allowed_action_types <@ array[
       'repository_read_file','repository_list_files','repository_search',
       'repository_apply_patch','repository_write_new_file','test_run_allowlisted',
       'git_create_scoped_branch','git_stage_allowlisted_paths','git_commit_scoped',
       'git_push_scoped_draft_branch','github_open_draft_pr',
       'github_update_draft_pr_body','public_research_ingest',
       'collective_deliberation'
     ]::text[]
     or not public.governance_hash_array_valid(p_allowed_resource_hashes,1,128)
     or p_maximum_risk not in ('low','medium','high')
     or p_maximum_cost not between 0 and 100
     or p_maximum_calls not between 1 and 100
     or p_maximum_bytes not between 1 and 10000000
     or p_required_test_ids is null
     or cardinality(p_required_test_ids) not between 1 and 128
     or not decision_value.required_test_ids <@ p_required_test_ids
     or p_rollback_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_hash <> decision_value.rollback_hash
     or p_validity <= interval '0 seconds'
     or p_validity > interval '24 hours' then
    raise exception 'governance_approval_scope_rejected' using errcode = 'P0001';
  end if;

  insert into public.governance_approval_versions(
    approval_id, decision_manifest_id, task_id, project_id, platform, environment,
    version_number, decision_manifest_hash, approval_scope_hash, objective_hash,
    repository_full_name, branch_name, provider, target_scope_hash,
    allowed_action_types, allowed_resource_hashes, maximum_risk, maximum_cost,
    maximum_calls, maximum_bytes, maximum_executions, required_test_ids,
    rollback_hash, approved_by, approved_at, valid_from, expires_at, status
  ) values (
    approval_value.id, decision_value.id, approval_value.task_id,
    approval_value.project_id, approval_value.platform, approval_value.environment,
    1, decision_value.decision_hash, p_approval_scope_hash, approval_value.objective_hash,
    p_repository_full_name, p_branch_name, p_provider, p_target_scope_hash,
    p_allowed_action_types, p_allowed_resource_hashes, p_maximum_risk, p_maximum_cost,
    p_maximum_calls, p_maximum_bytes, approval_value.maximum_executions,
    p_required_test_ids, p_rollback_hash, owner_id, now_at, now_at,
    least(now_at + p_validity, decision_value.expires_at), 'active'
  ) returning id into version_id;
  update public.governance_approvals
  set status = 'active', current_version = 1, updated_at = now_at
  where id = approval_value.id;
  insert into public.governance_approval_events(
    approval_id, approval_version_id, task_id, project_id, platform, environment,
    event_sequence, event_type, event_hash, actor_identity_hash
  ) values (
    approval_value.id, version_id, approval_value.task_id, approval_value.project_id,
    approval_value.platform, approval_value.environment, 2, 'activated',
    p_approval_scope_hash,
    encode(extensions.digest(convert_to(owner_id::text,'UTF8'),'sha256'),'hex')
  );
  return version_id;
end;
$$;
revoke all on function public.governance_owner_activate_approval(
  uuid,text,text,text,text,text,text[],text[],text,numeric,integer,bigint,text[],text,interval
) from public, anon;
grant execute on function public.governance_owner_activate_approval(
  uuid,text,text,text,text,text,text[],text[],text,numeric,integer,bigint,text[],text,interval
) to authenticated;

create function public.governance_revalidate_and_reinstate_approval(
  p_approval_id uuid,
  p_expired_version_id uuid,
  p_revalidation_hash text,
  p_current_decision_manifest_hash text,
  p_current_source_commit text,
  p_material_delta boolean,
  p_validity interval default interval '24 hours'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  approval_value public.governance_approvals%rowtype;
  old_version public.governance_approval_versions%rowtype;
  decision_value public.governance_decision_manifests%rowtype;
  new_version_id uuid;
  next_version integer;
  now_at timestamptz := transaction_timestamp();
begin
  select * into approval_value
  from public.governance_approvals
  where id = p_approval_id
  for update;
  select * into old_version
  from public.governance_approval_versions
  where id = p_expired_version_id
    and approval_id = approval_value.id;
  select * into decision_value
  from public.governance_decision_manifests
  where id = approval_value.decision_manifest_id;
  if approval_value.id is null
     or old_version.id is null
     or now_at < old_version.expires_at
     or old_version.status not in ('active','expired')
     or approval_value.requester_user_id is not null
        and approval_value.requester_user_id = owner_id
     or p_revalidation_hash !~ '^[a-f0-9]{64}$'
     or p_current_decision_manifest_hash is distinct from decision_value.decision_hash
     or p_current_source_commit is distinct from decision_value.source_commit
     or p_material_delta
     or decision_value.status <> 'finalized'
     or now_at >= decision_value.expires_at
     or p_validity <= interval '0 seconds'
     or p_validity > interval '24 hours' then
    raise exception 'governance_reinstatement_requires_amended_approval' using errcode = 'P0001';
  end if;
  next_version := approval_value.current_version + 1;
  insert into public.governance_approval_versions(
    approval_id, decision_manifest_id, task_id, project_id, platform, environment,
    version_number, prior_version_id, decision_manifest_hash, approval_scope_hash,
    objective_hash, repository_full_name, branch_name, provider, target_scope_hash,
    allowed_action_types, allowed_resource_hashes, maximum_risk, maximum_cost,
    maximum_calls, maximum_bytes, maximum_executions, required_test_ids,
    rollback_hash, approved_by, approved_at, valid_from, expires_at, status,
    revalidation_hash, material_delta
  ) values (
    approval_value.id, decision_value.id, approval_value.task_id,
    approval_value.project_id, approval_value.platform, approval_value.environment,
    next_version, old_version.id, decision_value.decision_hash,
    old_version.approval_scope_hash, old_version.objective_hash,
    old_version.repository_full_name, old_version.branch_name, old_version.provider,
    old_version.target_scope_hash, old_version.allowed_action_types,
    old_version.allowed_resource_hashes, old_version.maximum_risk,
    old_version.maximum_cost, old_version.maximum_calls, old_version.maximum_bytes,
    old_version.maximum_executions, old_version.required_test_ids,
    old_version.rollback_hash, owner_id, now_at, now_at,
    least(now_at + p_validity, decision_value.expires_at),
    'active', p_revalidation_hash, false
  ) returning id into new_version_id;
  update public.governance_approvals
  set status = 'active', current_version = next_version, updated_at = now_at
  where id = approval_value.id;
  insert into public.governance_approval_events(
    approval_id, approval_version_id, task_id, project_id, platform, environment,
    event_sequence, event_type, event_hash, actor_identity_hash
  ) values (
    approval_value.id, new_version_id, approval_value.task_id,
    approval_value.project_id, approval_value.platform, approval_value.environment,
    (select coalesce(max(event_sequence),0)+1 from public.governance_approval_events
     where approval_id = approval_value.id),
    'activated', p_revalidation_hash,
    encode(extensions.digest(convert_to(owner_id::text,'UTF8'),'sha256'),'hex')
  );
  return new_version_id;
end;
$$;
revoke all on function public.governance_revalidate_and_reinstate_approval(
  uuid,uuid,text,text,text,boolean,interval
) from public, anon;
grant execute on function public.governance_revalidate_and_reinstate_approval(
  uuid,uuid,text,text,text,boolean,interval
) to authenticated;

create function public.governance_bind_capability_to_decision(
  p_decision_manifest_id uuid,
  p_approval_version_id uuid,
  p_capability_id uuid,
  p_binding_hash text,
  p_actor_identity text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  decision_value public.governance_decision_manifests%rowtype;
  approval_version public.governance_approval_versions%rowtype;
  approval_value public.governance_approvals%rowtype;
  capability_value public.cognitive_capabilities%rowtype;
  result_id uuid;
  now_at timestamptz := transaction_timestamp();
begin
  perform public.governance_assert_level01_service_actor(
    array['capability_and_tool_broker'],
    p_actor_identity
  );
  select * into decision_value
  from public.governance_decision_manifests
  where id = p_decision_manifest_id;
  select * into approval_version
  from public.governance_approval_versions
  where id = p_approval_version_id;
  select * into approval_value
  from public.governance_approvals
  where id = approval_version.approval_id
  for update;
  select * into capability_value
  from public.cognitive_capabilities
  where id = p_capability_id;
  if decision_value.id is null
     or approval_version.id is null
     or capability_value.id is null
     or decision_value.status <> 'finalized'
     or now_at >= decision_value.expires_at
     or approval_version.status <> 'active'
     or now_at < approval_version.valid_from
     or now_at >= approval_version.expires_at
     or approval_value.status <> 'active'
     or approval_value.executions_consumed >= approval_value.maximum_executions
     or capability_value.status <> 'active'
     or now_at < capability_value.not_before
     or now_at >= capability_value.expires_at
     or capability_value.task_id <> decision_value.task_id
     or capability_value.project_id <> decision_value.project_id
     or capability_value.platform <> decision_value.platform
     or capability_value.environment <> decision_value.environment
     or capability_value.repository_full_name <> approval_version.repository_full_name
     or capability_value.branch_name <> approval_version.branch_name
     or not (
       capability_value.provider = approval_version.provider
       or (
         capability_value.provider = 'github'
         and approval_version.provider = 'github_draft_pr'
       )
       or (
         capability_value.provider = 'research_mock'
         and approval_version.provider = 'public_research'
       )
       or (
         capability_value.provider = 'model_mock'
         and approval_version.provider = 'model'
       )
     )
     or not capability_value.operation = any(approval_version.allowed_action_types)
     or exists (
       select 1
       from unnest(capability_value.path_scopes) path_scope
       where encode(
         extensions.digest(convert_to(path_scope,'UTF8'),'sha256'),
         'hex'
       ) <> all(approval_version.allowed_resource_hashes)
     )
     or capability_value.maximum_calls > approval_version.maximum_calls
     or capability_value.maximum_bytes > approval_version.maximum_bytes
     or capability_value.maximum_cost > approval_version.maximum_cost
     or (
       capability_value.risk_level = 'high'
       and approval_version.maximum_risk <> 'high'
     )
     or (
       capability_value.risk_level = 'medium'
       and approval_version.maximum_risk = 'low'
     )
     or approval_version.task_id <> decision_value.task_id
     or approval_version.project_id <> decision_value.project_id
     or approval_version.platform <> decision_value.platform
     or approval_version.environment <> decision_value.environment
     or approval_version.decision_manifest_hash <> decision_value.decision_hash
     or approval_version.approval_scope_hash <> decision_value.capability_scope_hash
     or capability_value.approval_scope_hash <> approval_version.approval_scope_hash
     or capability_value.plan_snapshot_hash is distinct from (
       select snapshot.snapshot_hash
       from public.execution_plan_snapshots snapshot
       where snapshot.id = capability_value.plan_snapshot_id
     )
     or p_binding_hash !~ '^[a-f0-9]{64}$'
     or exists (
       select 1 from public.governance_vetoes veto
       where veto.deliberation_id = decision_value.deliberation_id
         and veto.mandatory and veto.status = 'active'
     ) then
    raise exception 'governance_capability_binding_rejected' using errcode = 'P0001';
  end if;
  insert into public.governance_decision_capability_bindings(
    decision_manifest_id, approval_version_id, capability_id,
    task_id, project_id, platform, environment, decision_manifest_hash,
    approval_scope_hash, plan_snapshot_hash, binding_hash
  ) values (
    decision_value.id, approval_version.id, capability_value.id,
    decision_value.task_id, decision_value.project_id, decision_value.platform,
    decision_value.environment, decision_value.decision_hash,
    approval_version.approval_scope_hash, capability_value.plan_snapshot_hash,
    p_binding_hash
  ) returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.governance_bind_capability_to_decision(
  uuid,uuid,uuid,text,text
) from public, anon, authenticated;
grant execute on function public.governance_bind_capability_to_decision(
  uuid,uuid,uuid,text,text
) to service_role;

create function public.governance_record_execution_receipt(
  p_capability_id uuid,
  p_call_id text,
  p_capability_usage_sequence integer,
  p_before_state_hash text,
  p_after_state_hash text,
  p_result_envelope jsonb,
  p_actual_bytes bigint,
  p_actual_calls integer,
  p_actual_cost numeric,
  p_resource_lease_ids uuid[],
  p_diff_hash text,
  p_final_commit text,
  p_rollback_state text,
  p_actor_identity text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  capability_value public.cognitive_capabilities%rowtype;
  binding_value public.governance_decision_capability_bindings%rowtype;
  decision_value public.governance_decision_manifests%rowtype;
  approval_version public.governance_approval_versions%rowtype;
  approval_value public.governance_approvals%rowtype;
  snapshot_value public.execution_plan_snapshots%rowtype;
  task_value public.intelligence_tasks%rowtype;
  tool_result_value public.cognitive_tool_result_records%rowtype;
  consumed_event_value public.cognitive_capability_events%rowtype;
  receipt_id uuid;
  result_hash text;
  receipt_hash_value text;
  now_at timestamptz := transaction_timestamp();
  lease_id_value uuid;
  event_sequence_value integer;
begin
  perform public.governance_assert_level01_service_actor(
    array['cognitive_postflight_authority'],
    p_actor_identity
  );
  select * into capability_value
  from public.cognitive_capabilities
  where id = p_capability_id
  for update;
  select * into binding_value
  from public.governance_decision_capability_bindings
  where capability_id = p_capability_id
    and revoked_at is null;
  select * into decision_value
  from public.governance_decision_manifests
  where id = binding_value.decision_manifest_id;
  select * into approval_version
  from public.governance_approval_versions
  where id = binding_value.approval_version_id;
  select * into approval_value
  from public.governance_approvals
  where id = approval_version.approval_id
  for update;
  select * into snapshot_value
  from public.execution_plan_snapshots
  where id = capability_value.plan_snapshot_id;
  select * into task_value
  from public.intelligence_tasks
  where id=capability_value.task_id and project_id=capability_value.project_id
    and platform=capability_value.platform and environment=capability_value.environment
  for update;
  select * into tool_result_value
  from public.cognitive_tool_result_records
  where capability_id=capability_value.id
    and call_id=p_call_id
    and usage_sequence=p_capability_usage_sequence;
  select * into consumed_event_value
  from public.cognitive_capability_events event
  where event.capability_id=capability_value.id
    and event.call_id=p_call_id
    and event.usage_sequence=p_capability_usage_sequence
    and event.event_type='consumed';

  if capability_value.id is null
     or binding_value.id is null
     or decision_value.id is null
     or approval_version.id is null
     or approval_value.id is null
     or snapshot_value.id is null
     or capability_value.status not in ('active','exhausted')
     or capability_value.revoked_at is not null
     or now_at >= capability_value.expires_at
     or binding_value.decision_manifest_hash <> decision_value.decision_hash
     or binding_value.approval_scope_hash <> approval_version.approval_scope_hash
     or binding_value.plan_snapshot_hash <> snapshot_value.snapshot_hash
     or approval_version.status <> 'active'
     or now_at < approval_version.valid_from
     or now_at >= approval_version.expires_at
     or approval_value.status <> 'active'
     or approval_value.executions_consumed >= approval_value.maximum_executions
     or task_value.id is null
     or task_value.cancelled_at is not null
     or task_value.quarantined_at is not null
     or now_at >= task_value.deadman_at
     or decision_value.status <> 'finalized'
     or now_at >= decision_value.expires_at
     or capability_value.task_id <> decision_value.task_id
     or capability_value.project_id <> decision_value.project_id
     or capability_value.platform <> decision_value.platform
     or capability_value.environment <> decision_value.environment
     or consumed_event_value.id is null
     or exists (
       select 1
       from public.governance_vetoes veto
       where veto.deliberation_id = decision_value.deliberation_id
         and veto.mandatory and veto.status = 'active'
     )
     or coalesce((
       select status = 'active'
       from public.autonomous_system_emergency_states
       where system_id = 'product_intelligence_operator'
     ), false) = false
     or p_before_state_hash !~ '^[a-f0-9]{64}$'
     or p_after_state_hash !~ '^[a-f0-9]{64}$'
     or p_result_envelope is null
     or pg_column_size(p_result_envelope) > 65536
     or not public.cognitive_json_is_sanitized(p_result_envelope)
     or tool_result_value.id is null
     or tool_result_value.before_state_hash is distinct from p_before_state_hash
     or tool_result_value.after_state_hash is distinct from p_after_state_hash
     or tool_result_value.diff_hash is distinct from p_diff_hash
     or tool_result_value.final_commit is distinct from p_final_commit
     or tool_result_value.resource_type is distinct from consumed_event_value.resource_type
     or tool_result_value.resource_key is distinct from consumed_event_value.resource_key
     or p_actual_bytes < 0
     or p_actual_bytes > consumed_event_value.reserved_bytes
     or p_actual_bytes > capability_value.maximum_bytes
     or coalesce((
       select sum(receipt.actual_bytes)
       from public.cognitive_execution_receipts receipt
       where receipt.capability_id = capability_value.id
     ),0) + p_actual_bytes
       > capability_value.maximum_bytes - capability_value.remaining_bytes
     or p_actual_calls <> 1
     or coalesce((
       select sum(receipt.actual_calls)
       from public.cognitive_execution_receipts receipt
       where receipt.capability_id = capability_value.id
     ),0) + p_actual_calls
       > capability_value.maximum_calls - capability_value.remaining_calls
     or p_actual_cost < 0
     or p_actual_cost > consumed_event_value.reserved_cost
     or p_actual_cost > capability_value.maximum_cost
     or coalesce((
       select sum(receipt.actual_cost)
       from public.cognitive_execution_receipts receipt
       where receipt.capability_id = capability_value.id
     ),0) + p_actual_cost
       > capability_value.maximum_cost - capability_value.remaining_cost
     or p_resource_lease_ids is null
     or cardinality(p_resource_lease_ids) <> 1
     or p_resource_lease_ids[1] is distinct from consumed_event_value.resource_lease_id
     or (
       capability_value.operation in (
         'repository_apply_patch','repository_write_new_file',
         'git_create_scoped_branch','git_stage_allowlisted_paths',
         'git_commit_scoped','git_push_scoped_draft_branch',
         'github_open_draft_pr','github_update_draft_pr_body'
       )
       and cardinality(p_resource_lease_ids) < 1
     )
     or (
       select count(*) <> count(distinct value)
       from unnest(p_resource_lease_ids) value
     )
     or p_diff_hash is not null and p_diff_hash !~ '^[a-f0-9]{64}$'
     or p_final_commit is not null and p_final_commit !~ '^[a-f0-9]{40}$'
     or p_rollback_state not in ('not_required','pending','running','succeeded','failed')
     or length(p_call_id) not between 3 and 128
     or public.cognitive_text_has_secret(p_call_id)
     or public.cognitive_text_has_private_identifier(p_call_id) then
    raise exception 'governance_postflight_rejected' using errcode = 'P0001';
  end if;

  perform 1
  from public.cognitive_resource_leases lease
  where lease.id = any(p_resource_lease_ids)
  order by lease.id
  for update;
  if exists (
    select 1
    from unnest(p_resource_lease_ids) requested_lease_id
    left join public.cognitive_resource_leases lease
      on lease.id = requested_lease_id
     and lease.task_id = capability_value.task_id
     and lease.project_id = capability_value.project_id
     and lease.platform = capability_value.platform
     and lease.environment = capability_value.environment
    where lease.id is null
       or lease.revoked_at is not null
       or now_at < lease.issued_at
       or now_at >= lease.expires_at
       or lease.resource_type is distinct from consumed_event_value.resource_type
       or lease.resource_key is distinct from consumed_event_value.resource_key
  ) then
    raise exception 'governance_postflight_lease_rejected' using errcode = 'P0001';
  end if;

  result_hash := encode(
    extensions.digest(convert_to(p_result_envelope::text,'UTF8'),'sha256'),
    'hex'
  );
  if result_hash is distinct from tool_result_value.result_envelope_hash then
    raise exception 'governance_postflight_result_binding_rejected'
      using errcode='P0001';
  end if;

  if capability_value.operation in (
       'repository_apply_patch','repository_write_new_file',
       'git_create_scoped_branch','git_stage_allowlisted_paths',
       'git_commit_scoped','git_push_scoped_draft_branch',
       'github_open_draft_pr','github_update_draft_pr_body'
     ) and not exists (
       select 1 from public.cognitive_resource_leases lease
       where lease.id=any(p_resource_lease_ids)
         and lease.task_id=capability_value.task_id
         and lease.project_id=capability_value.project_id
         and lease.platform=capability_value.platform
         and lease.environment=capability_value.environment
         and lease.mode='write'
         and lease.resource_type=consumed_event_value.resource_type
         and lease.resource_key=consumed_event_value.resource_key
         and lease.revoked_at is null
         and now_at >= lease.issued_at and now_at < lease.expires_at
     ) then
    raise exception 'governance_postflight_write_lease_required'
      using errcode='P0001';
  end if;
  receipt_hash_value := encode(extensions.digest(convert_to(concat_ws(
    '|',
    capability_value.task_id::text,
    capability_value.project_id::text,
    capability_value.repository_full_name,
    capability_value.branch_name,
    capability_value.platform::text,
    capability_value.environment::text,
    capability_value.id::text,
    p_capability_usage_sequence::text,
    p_call_id,
    decision_value.decision_hash,
    approval_version.id::text,
    snapshot_value.snapshot_hash,
    p_before_state_hash,
    p_after_state_hash,
    result_hash,
    p_actual_bytes::text,
    p_actual_calls::text,
    p_actual_cost::text,
    coalesce(p_diff_hash,''),
    coalesce(p_final_commit,''),
    p_rollback_state
  ),'UTF8'),'sha256'),'hex');

  insert into public.cognitive_execution_receipts(
    task_id, project_id, repository_full_name, branch_name, platform, environment,
    capability_id, capability_usage_sequence, call_id, decision_manifest_id,
    decision_manifest_hash, approval_version_id, plan_snapshot_id,
    plan_snapshot_hash, before_state_hash, after_state_hash,
    untrusted_result_envelope_hash, actual_bytes, actual_calls, actual_cost,
    resource_lease_ids, diff_hash, final_commit, rollback_state,
    evaluator_state, receipt_state, receipt_hash, completed_at, created_at
  ) values (
    capability_value.task_id, capability_value.project_id,
    capability_value.repository_full_name, capability_value.branch_name,
    capability_value.platform, capability_value.environment, capability_value.id,
    p_capability_usage_sequence, p_call_id, decision_value.id, decision_value.decision_hash,
    approval_version.id, snapshot_value.id, snapshot_value.snapshot_hash,
    p_before_state_hash, p_after_state_hash, result_hash, p_actual_bytes,
    p_actual_calls, p_actual_cost, p_resource_lease_ids, p_diff_hash,
    p_final_commit, p_rollback_state, 'incomplete', 'pending_evaluation',
    receipt_hash_value, now_at, now_at
  ) returning id into receipt_id;

  insert into public.cognitive_capability_usage_settlements(
    capability_event_id,receipt_id,task_id,project_id,platform,environment,
    reserved_bytes,actual_bytes,released_bytes,
    reserved_cost,actual_cost,released_cost
  ) values (
    consumed_event_value.id,receipt_id,capability_value.task_id,
    capability_value.project_id,capability_value.platform,
    capability_value.environment,consumed_event_value.reserved_bytes,
    p_actual_bytes,consumed_event_value.reserved_bytes-p_actual_bytes,
    consumed_event_value.reserved_cost,p_actual_cost,
    consumed_event_value.reserved_cost-p_actual_cost
  );
  update public.cognitive_capabilities
  set remaining_bytes=least(
        maximum_bytes,
        remaining_bytes+consumed_event_value.reserved_bytes-p_actual_bytes
      ),
      remaining_cost=least(
        maximum_cost,
        remaining_cost+consumed_event_value.reserved_cost-p_actual_cost
      )
  where id=capability_value.id;

  foreach lease_id_value in array p_resource_lease_ids loop
    insert into public.governance_execution_receipt_leases(
      receipt_id, lease_id, task_id, project_id, platform, environment
    ) values (
      receipt_id, lease_id_value, capability_value.task_id,
      capability_value.project_id, capability_value.platform,
      capability_value.environment
    );
    update public.cognitive_resource_leases
    set revoked_at = now_at
    where id = lease_id_value;
    insert into public.cognitive_resource_lease_events(
      lease_id, task_id, project_id, platform, environment, event_type, event_hash
    ) values (
      lease_id_value, capability_value.task_id, capability_value.project_id,
      capability_value.platform, capability_value.environment,
      'released', receipt_hash_value
    );
  end loop;

  update public.governance_approvals
  set executions_consumed = executions_consumed + 1,
      status = case
        when executions_consumed + 1 >= maximum_executions then 'consumed'
        else status
      end,
      updated_at = now_at
  where id = approval_value.id;
  select coalesce(max(event_sequence),0)+1 into event_sequence_value
  from public.governance_approval_events
  where approval_id = approval_value.id;
  insert into public.governance_approval_events(
    approval_id, approval_version_id, task_id, project_id, platform, environment,
    event_sequence, event_type, event_hash, actor_identity_hash
  ) values (
    approval_value.id, approval_version.id, approval_value.task_id,
    approval_value.project_id, approval_value.platform, approval_value.environment,
    event_sequence_value, 'consumed', receipt_hash_value,
    encode(extensions.digest(convert_to(p_actor_identity,'UTF8'),'sha256'),'hex')
  );
  insert into public.governance_audit_events(
    task_id, project_id, platform, environment, entity_type, entity_id,
    event_type, actor_identity_hash, evidence_hash
  ) values (
    capability_value.task_id, capability_value.project_id,
    capability_value.platform, capability_value.environment,
    'execution_receipt', receipt_id, 'postflight_recorded',
    encode(extensions.digest(convert_to(p_actor_identity,'UTF8'),'sha256'),'hex'),
    receipt_hash_value
  );
  return receipt_id;
end;
$$;
revoke all on function public.governance_record_execution_receipt(
  uuid,text,integer,text,text,jsonb,bigint,integer,numeric,uuid[],text,text,text,text
) from public, anon, authenticated;
grant execute on function public.governance_record_execution_receipt(
  uuid,text,integer,text,text,jsonb,bigint,integer,numeric,uuid[],text,text,text,text
) to service_role;

create function public.governance_expire_approval_versions(p_actor_identity text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := transaction_timestamp();
  expired_count integer;
begin
  perform public.governance_assert_level01_service_actor(
    array['approval_revalidation_service'],
    p_actor_identity
  );
  update public.governance_approvals approval
  set status = 'expired', updated_at = now_at
  where exists (
      select 1
      from public.governance_approval_versions version
      where version.approval_id = approval.id
        and version.id = (
          select current_version.id
          from public.governance_approval_versions current_version
          where current_version.approval_id = approval.id
            and current_version.version_number = approval.current_version
        )
        and version.status = 'active'
        and now_at >= version.expires_at
    )
    and approval.status = 'active';
  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;
revoke all on function public.governance_expire_approval_versions(text)
  from public, anon, authenticated;
grant execute on function public.governance_expire_approval_versions(text)
  to service_role;

create function public.governance_set_level01_switch(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_switch_key text,
  p_enabled boolean,
  p_policy_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  result_id uuid;
  now_at timestamptz := transaction_timestamp();
begin
  if p_switch_key not in (
      'cognitive_research_enabled',
      'cognitive_memory_enabled',
      'cognitive_collective_deliberation_enabled',
      'cognitive_draft_pr_executor_enabled',
      'cognitive_scheduled_level01_enabled'
    )
     or length(p_policy_version) not between 1 and 64
     or public.cognitive_text_has_secret(p_policy_version) then
    raise exception 'governance_switch_scope_rejected' using errcode = 'P0001';
  end if;
  insert into public.cognitive_governance_switches(
    task_id, project_id, platform, environment, switch_key, enabled,
    policy_version, enabled_by, enabled_at, disabled_at, updated_at
  ) values (
    p_task_id, p_project_id, p_platform, p_environment, p_switch_key, p_enabled,
    p_policy_version, case when p_enabled then owner_id else null end,
    case when p_enabled then now_at else null end,
    case when p_enabled then null else now_at end,
    now_at
  )
  on conflict (task_id, switch_key) do update
  set enabled = excluded.enabled,
      policy_version = excluded.policy_version,
      enabled_by = excluded.enabled_by,
      enabled_at = excluded.enabled_at,
      disabled_at = excluded.disabled_at,
      updated_at = now_at
  where cognitive_governance_switches.project_id = excluded.project_id
    and cognitive_governance_switches.platform = excluded.platform
    and cognitive_governance_switches.environment = excluded.environment
  returning id into result_id;
  if result_id is null then
    raise exception 'governance_switch_scope_rejected' using errcode = 'P0001';
  end if;
  return result_id;
end;
$$;
revoke all on function public.governance_set_level01_switch(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,boolean,text
) from public, anon;
grant execute on function public.governance_set_level01_switch(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,boolean,text
) to authenticated;

create index governance_deliberations_status_idx
  on public.governance_deliberations(
    task_id, project_id, platform, environment, status, deadline_at
  );
create index governance_decisions_status_idx
  on public.governance_decision_manifests(
    task_id, project_id, platform, environment, status, expires_at
  );
create index governance_approvals_status_idx
  on public.governance_approvals(
    task_id, project_id, platform, environment, status, updated_at desc
  );
create index governance_approval_versions_expiry_idx
  on public.governance_approval_versions(status, expires_at)
  where status = 'active';
create index governance_notifications_due_idx
  on public.governance_approval_notifications(delivery_state, deliver_after)
  where delivery_state = 'pending';
create index governance_audit_scope_idx
  on public.governance_audit_events(
    task_id, project_id, platform, environment, created_at desc
  );

do $$
declare
  table_name text;
  governance_tables constant text[] := array[
    'governance_constitutions',
    'governance_constitution_versions',
    'governance_council_roles',
    'governance_deliberations',
    'governance_evidence_packets',
    'governance_council_assignments',
    'governance_assessments',
    'governance_proposals',
    'governance_votes',
    'governance_vetoes',
    'governance_dissent_reports',
    'governance_stakeholder_impacts',
    'governance_decision_manifests',
    'governance_decision_manifest_events',
    'governance_approvals',
    'governance_approval_versions',
    'governance_approval_events',
    'governance_appeals',
    'governance_decision_capability_bindings',
    'cognitive_execution_receipts',
    'governance_execution_receipt_leases',
    'governance_outcome_evaluations',
    'governance_calibration_records',
    'governance_audit_events',
    'governance_approval_notifications',
    'cognitive_governance_switches',
    'cognitive_retention_policy_states'
  ];
begin
  foreach table_name in array governance_tables loop
    execute format(
      'create index %I on public.%I (
        task_id, project_id, platform, environment, created_at desc
      )',
      table_name || '_scope_created_idx',
      table_name
    );
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'revoke all on table public.%I from public, anon, authenticated, service_role',
      table_name
    );
    execute format(
      'grant select on table public.%I to authenticated, service_role',
      table_name
    );
    execute format(
      'create policy %I on public.%I for select to authenticated using (
        (select public.cognitive_can_read_scope(project_id, task_id, platform))
      )',
      table_name || '_exact_cognitive_read',
      table_name
    );
  end loop;
end
$$;

do $$
declare
  table_name text;
  immutable_tables constant text[] := array[
    'governance_constitution_versions',
    'governance_council_roles',
    'governance_evidence_packets',
    'governance_assessments',
    'governance_proposals',
    'governance_votes',
    'governance_dissent_reports',
    'governance_stakeholder_impacts',
    'governance_decision_manifests',
    'governance_decision_manifest_events',
    'governance_approval_versions',
    'governance_approval_events',
    'governance_decision_capability_bindings',
    'cognitive_execution_receipts',
    'governance_execution_receipt_leases',
    'governance_outcome_evaluations',
    'governance_calibration_records',
    'governance_audit_events',
    'cognitive_retention_policy_states'
  ];
begin
  foreach table_name in array immutable_tables loop
    execute format(
      'create trigger %I before update or delete on public.%I
       for each row execute function public.reject_cognitive_evidence_mutation()',
      table_name || '_immutable',
      table_name
    );
  end loop;
end
$$;

-- No governance table is directly writable by a public role, ordinary client,
-- scoped Admin, Owner client, or service_role. The reviewed security-definer
-- RPCs above are the only mutation surface.

-- Owner-controlled service registration stores only credential digests.  It is
-- intentionally impossible for a service-role caller to mint or rotate its own
-- identity.
create function public.governance_owner_register_service_identity(
  p_service_identity text,
  p_credential_hash text,
  p_expires_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare owner_id uuid := public.governance_assert_exact_owner();
begin
  if p_credential_hash !~ '^[a-f0-9]{64}$'
     or p_expires_at <= transaction_timestamp()
     or p_expires_at > transaction_timestamp() + interval '365 days' then
    raise exception 'cognitive_service_identity_registration_rejected'
      using errcode='P0001';
  end if;
  insert into public.cognitive_service_identities(
    service_identity,credential_hash,status,issued_at,expires_at,revoked_at
  ) values (
    p_service_identity,p_credential_hash,'active',transaction_timestamp(),
    p_expires_at,null
  )
  on conflict (service_identity) do update
    set credential_hash=excluded.credential_hash,
        status='active',
        issued_at=transaction_timestamp(),
        expires_at=excluded.expires_at,
        revoked_at=null;
  insert into public.governance_audit_events(
    task_id,project_id,platform,environment,entity_type,entity_id,event_type,
    actor_identity_hash,evidence_hash
  )
  select task.id,task.project_id,task.platform,task.environment,'switch',task.id,
    'service_identity_registered',
    encode(extensions.digest(convert_to(owner_id::text,'UTF8'),'sha256'),'hex'),
    encode(extensions.digest(
      convert_to(p_service_identity || ':' || p_credential_hash,'UTF8'),'sha256'
    ),'hex')
  from public.intelligence_tasks task
  where task.task_key='cognitive-level01-canary-control'
  order by task.created_at
  limit 1;
  return p_service_identity;
end;
$$;
revoke all on function public.governance_owner_register_service_identity(text,text,timestamptz)
  from public, anon, service_role;
grant execute on function public.governance_owner_register_service_identity(text,text,timestamptz)
  to authenticated;

create function public.cognitive_verify_service_token(
  p_expected_identity text,
  p_opaque_token text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if nullif(current_setting('request.jwt.claim.role',true),'') <> 'service_role'
     or p_opaque_token is null
     or octet_length(p_opaque_token) not between 32 and 512
     or not exists (
       select 1 from public.cognitive_service_identities identity
       where identity.service_identity=p_expected_identity
         and identity.status='active'
         and identity.revoked_at is null
         and transaction_timestamp() < identity.expires_at
         and identity.credential_hash=encode(
           extensions.digest(convert_to(p_opaque_token,'UTF8'),'sha256'),'hex'
         )
     ) then
    raise exception 'cognitive_service_token_rejected' using errcode='42501';
  end if;
  return p_expected_identity;
end;
$$;
revoke all on function public.cognitive_verify_service_token(text,text)
  from public, anon, authenticated;
grant execute on function public.cognitive_verify_service_token(text,text)
  to service_role;

-- Any decrement of a capability budget is a side-effect authorization point.
-- Enforce the governance decision/approval/veto envelope in the database even
-- when a caller reaches the lower-level capability RPC directly.
create function public.governance_enforce_capability_consumption()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare now_at timestamptz := transaction_timestamp();
begin
  if new.remaining_calls < old.remaining_calls
     or new.remaining_bytes < old.remaining_bytes
     or new.remaining_cost < old.remaining_cost then
    if not exists (
      select 1
      from public.governance_decision_capability_bindings binding
      join public.governance_decision_manifests decision
        on decision.id=binding.decision_manifest_id
       and decision.task_id=binding.task_id
       and decision.project_id=binding.project_id
       and decision.platform=binding.platform
       and decision.environment=binding.environment
      join public.governance_approval_versions version
        on version.id=binding.approval_version_id
       and version.task_id=binding.task_id
       and version.project_id=binding.project_id
       and version.platform=binding.platform
       and version.environment=binding.environment
      join public.governance_approvals approval
        on approval.id=version.approval_id
       and approval.task_id=version.task_id
       and approval.project_id=version.project_id
       and approval.platform=version.platform
       and approval.environment=version.environment
      join public.intelligence_tasks task
        on task.id=binding.task_id and task.project_id=binding.project_id
       and task.platform=binding.platform and task.environment=binding.environment
      where binding.capability_id=old.id
        and binding.revoked_at is null
        and binding.decision_manifest_hash=decision.decision_hash
        and binding.approval_scope_hash=version.approval_scope_hash
        and binding.plan_snapshot_hash=old.plan_snapshot_hash
        and decision.status='finalized'
        and now_at < decision.expires_at
        and version.status='active'
        and now_at >= version.valid_from
        and now_at < version.expires_at
        and approval.status='active'
        and approval.executions_consumed < approval.maximum_executions
        and task.cancelled_at is null
        and task.quarantined_at is null
        and now_at < task.deadman_at
        and not exists (
          select 1 from public.governance_vetoes veto
          where veto.deliberation_id=decision.deliberation_id
            and veto.mandatory and veto.status='active'
        )
        and coalesce((
          select emergency.status='active'
          from public.autonomous_system_emergency_states emergency
          where emergency.system_id='product_intelligence_operator'
        ),false)
    ) then
      raise exception 'governed_capability_not_active' using errcode='P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.governance_enforce_capability_consumption()
  from public,anon,authenticated,service_role;
create trigger cognitive_capability_governance_consumption_guard
before update on public.cognitive_capabilities
for each row execute function public.governance_enforce_capability_consumption();
