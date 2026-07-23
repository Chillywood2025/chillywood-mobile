-- Two-party Cognitive activation handoff and proactive Level 0/1 sentinel
-- foundation.
--
-- This migration is additive over the frozen Collective Governance source. It
-- separates Owner approval recording from service-principal execution and keeps
-- every new product-experience sentinel switch disabled by default. It does not
-- change auth/RLS on existing product tables and grants no Level 2 production
-- repair authority.

alter table public.cognitive_governance_switches
  drop constraint if exists cognitive_governance_switches_switch_key_check;

alter table public.cognitive_governance_switches
  add constraint cognitive_governance_switches_switch_key_check check (
    switch_key in (
      'cognitive_research_enabled',
      'cognitive_memory_enabled',
      'cognitive_collective_deliberation_enabled',
      'cognitive_draft_pr_executor_enabled',
      'cognitive_scheduled_level01_enabled',
      'cognitive_level2_production_repairs_enabled',
      'cognitive_user_derived_memory_enabled',
      'cognitive_livekit_experience_sentinel_enabled',
      'cognitive_visual_experience_sentinel_enabled',
      'cognitive_installed_journey_sentinel_enabled'
    )
  );

alter table public.governance_decision_manifests
  add column if not exists model_independence_assessment_id text check (
    model_independence_assessment_id is null
    or (
      length(model_independence_assessment_id) between 8 and 160
      and not public.cognitive_text_has_secret(model_independence_assessment_id)
      and not public.cognitive_text_has_private_identifier(model_independence_assessment_id)
    )
  ),
  add column if not exists model_independence_status text check (
    model_independence_status is null
    or model_independence_status in (
      'MODEL_INDEPENDENCE_VERIFIED',
      'MODEL_INDEPENDENCE_PROVIDER_REQUIRED'
    )
  ),
  add column if not exists model_independence_evidence_hash text check (
    model_independence_evidence_hash is null
    or model_independence_evidence_hash ~ '^[a-f0-9]{64}$'
  );

create function public.governance_decision_has_verified_model_independence(
  p_decision_manifest_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.governance_decision_manifests decision
    where decision.id = p_decision_manifest_id
      and decision.status = 'finalized'
      and decision.model_independence_status = 'MODEL_INDEPENDENCE_VERIFIED'
      and decision.model_independence_assessment_id is not null
      and decision.model_independence_evidence_hash is not null
  );
$$;
revoke all on function public.governance_decision_has_verified_model_independence(uuid)
  from public, anon, authenticated, service_role;

create function public.governance_enforce_legacy_approval_model_independence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'governance_approval_versions' then
    if new.status <> 'active' then
      return new;
    end if;
  end if;
  if not public.governance_decision_has_verified_model_independence(
    new.decision_manifest_id
  ) then
    raise exception 'governance_model_independence_required'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.governance_enforce_legacy_approval_model_independence()
  from public, anon, authenticated, service_role;

drop trigger if exists governance_approval_versions_model_independence_before_insert
  on public.governance_approval_versions;
create trigger governance_approval_versions_model_independence_before_insert
  before insert on public.governance_approval_versions
  for each row
  execute function public.governance_enforce_legacy_approval_model_independence();

drop trigger if exists governance_decision_capability_model_independence_before_insert
  on public.governance_decision_capability_bindings;
create trigger governance_decision_capability_model_independence_before_insert
  before insert on public.governance_decision_capability_bindings
  for each row
  execute function public.governance_enforce_legacy_approval_model_independence();

create table public.governance_two_party_service_assertions (
  service_identity text primary key check (
    service_identity in (
      'cognitive_approved_action_worker',
      'product_experience_baseline_service',
      'livekit_experience_sentinel',
      'visual_product_experience_sentinel',
      'installed_journey_sentinel',
      'product_quality_triage_router',
      'model_independence_attestation_service'
    )
  ),
  assertion_hash text not null unique check (assertion_hash ~ '^[a-f0-9]{64}$'),
  allowed_operations text[] not null check (
    cardinality(allowed_operations) between 1 and 64
    and allowed_operations <@ array[
      'bootstrap_control_plane',
      'set_switch',
      'public_research_ingest',
      'collective_deliberation',
      'model_independence_attestation',
      'livekit_experience_canary',
      'visual_experience_canary',
      'installed_journey_canary',
      'product_quality_triage',
      'github_draft_pr'
    ]::text[]
  ),
  registered_by uuid not null,
  status text not null default 'active' check (status in ('active','revoked')),
  issued_at timestamptz not null default transaction_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid,
  revocation_hash text check (revocation_hash is null or revocation_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default transaction_timestamp(),
  check (expires_at > issued_at and expires_at <= issued_at + interval '365 days'),
  check ((status='revoked') = (
    revoked_at is not null
    and revoked_by is not null
    and revocation_hash is not null
  ))
);

alter table public.governance_two_party_service_assertions enable row level security;
alter table public.governance_two_party_service_assertions force row level security;
revoke all on table public.governance_two_party_service_assertions
  from public, anon, authenticated, service_role;

create table public.governance_owner_approval_records (
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
  owner_user_id uuid not null,
  current_version integer not null default 1 check (current_version between 1 and 1000),
  current_state text not null default 'active' check (
    current_state in (
      'active','expired','revoked','superseded','cancelled','consumed',
      'completed','failed','rolled_back'
    )
  ),
  maximum_executions integer not null check (maximum_executions between 1 and 10),
  executions_claimed integer not null default 0 check (
    executions_claimed between 0 and maximum_executions
  ),
  executions_completed integer not null default 0 check (
    executions_completed between 0 and maximum_executions
  ),
  approval_hash text not null unique check (approval_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  unique (task_id, approval_key),
  unique (id, task_id, project_id, platform, environment),
  foreign key (decision_manifest_id, task_id, project_id, platform, environment)
    references public.governance_decision_manifests(id, task_id, project_id, platform, environment),
  check (executions_completed <= executions_claimed)
);

create table public.governance_owner_approval_versions (
  id uuid primary key default gen_random_uuid(),
  approval_record_id uuid not null,
  decision_manifest_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  version_number integer not null check (version_number between 1 and 1000),
  prior_version_id uuid,
  owner_user_id uuid not null,
  owner_identity_hash text not null check (owner_identity_hash ~ '^[a-f0-9]{64}$'),
  decision_manifest_hash text not null check (decision_manifest_hash ~ '^[a-f0-9]{64}$'),
  plan_snapshot_hash text not null check (plan_snapshot_hash ~ '^[a-f0-9]{64}$'),
  source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  architecture_graph_digest text not null check (architecture_graph_digest ~ '^[a-f0-9]{64}$'),
  approval_scope_hash text not null check (approval_scope_hash ~ '^[a-f0-9]{64}$'),
  objective_hash text not null check (objective_hash ~ '^[a-f0-9]{64}$'),
  repository_full_name text not null check (repository_full_name = 'Chillywood2025/chillywood-mobile'),
  branch_name text not null check (
    branch_name ~ '^codex/[a-z0-9][a-z0-9/_-]{2,120}$'
    and branch_name !~* '(^|/)(main|master|release)(/|$)'
  ),
  provider text not null check (provider in (
    'repository','github_draft_pr','public_research','model','none',
    'livekit','visual_sentinel','installed_journey'
  )),
  operation text not null check (operation in (
    'bootstrap_control_plane',
    'set_switch',
    'public_research_ingest',
    'collective_deliberation',
    'model_independence_attestation',
    'livekit_experience_canary',
    'visual_experience_canary',
    'installed_journey_canary',
    'product_quality_triage',
    'github_draft_pr'
  )),
  target_resource_hash text not null check (target_resource_hash ~ '^[a-f0-9]{64}$'),
  path_scope_hashes text[] not null check (
    public.governance_hash_array_valid(path_scope_hashes, 0, 128)
  ),
  table_scope_hashes text[] not null default '{}'::text[] check (
    public.governance_hash_array_valid(table_scope_hashes, 0, 128)
  ),
  function_scope_hashes text[] not null default '{}'::text[] check (
    public.governance_hash_array_valid(function_scope_hashes, 0, 64)
  ),
  budget_hash text not null check (budget_hash ~ '^[a-f0-9]{64}$'),
  maximum_cost numeric(12,4) not null check (maximum_cost between 0 and 100),
  maximum_calls integer not null check (maximum_calls between 1 and 100),
  maximum_bytes bigint not null check (maximum_bytes between 1 and 10000000),
  maximum_executions integer not null check (maximum_executions between 1 and 10),
  tests_hash text not null check (tests_hash ~ '^[a-f0-9]{64}$'),
  required_test_ids text[] not null check (cardinality(required_test_ids) between 1 and 128),
  evaluator_requirement_hash text not null check (evaluator_requirement_hash ~ '^[a-f0-9]{64}$'),
  rollback_hash text not null check (rollback_hash ~ '^[a-f0-9]{64}$'),
  approval_hash text not null unique check (approval_hash ~ '^[a-f0-9]{64}$'),
  revalidation_hash text check (revalidation_hash is null or revalidation_hash ~ '^[a-f0-9]{64}$'),
  material_delta boolean not null default false,
  approved_at timestamptz not null,
  valid_from timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default transaction_timestamp(),
  unique (approval_record_id, version_number),
  unique (id, task_id, project_id, platform, environment),
  foreign key (approval_record_id, task_id, project_id, platform, environment)
    references public.governance_owner_approval_records(id, task_id, project_id, platform, environment),
  foreign key (decision_manifest_id, task_id, project_id, platform, environment)
    references public.governance_decision_manifests(id, task_id, project_id, platform, environment),
  foreign key (prior_version_id, task_id, project_id, platform, environment)
    references public.governance_owner_approval_versions(id, task_id, project_id, platform, environment),
  check (valid_from >= approved_at),
  check (expires_at > valid_from and expires_at <= valid_from + interval '24 hours'),
  check (
    (version_number = 1 and prior_version_id is null)
    or (version_number > 1 and prior_version_id is not null)
  )
);

create table public.governance_owner_approval_version_states (
  approval_version_id uuid primary key,
  approval_record_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  state text not null check (
    state in (
      'active','expired','revoked','superseded','cancelled','consumed',
      'completed','failed','rolled_back'
    )
  ),
  maximum_executions integer not null check (maximum_executions between 1 and 10),
  executions_claimed integer not null default 0 check (
    executions_claimed between 0 and maximum_executions
  ),
  executions_completed integer not null default 0 check (
    executions_completed between 0 and maximum_executions
  ),
  revoked_at timestamptz,
  superseded_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  rolled_back_at timestamptz,
  updated_at timestamptz not null default transaction_timestamp(),
  unique (approval_version_id, task_id, project_id, platform, environment),
  foreign key (approval_version_id, task_id, project_id, platform, environment)
    references public.governance_owner_approval_versions(id, task_id, project_id, platform, environment),
  foreign key (approval_record_id, task_id, project_id, platform, environment)
    references public.governance_owner_approval_records(id, task_id, project_id, platform, environment),
  check (executions_completed <= executions_claimed)
);

create table public.governance_owner_approval_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  approval_record_id uuid not null,
  approval_version_id uuid,
  execution_id uuid,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  event_sequence integer not null check (event_sequence >= 1),
  event_type text not null check (event_type in (
    'owner_approved','revoked','expired','reinstated','amendment_required',
    'claimed','preflight','executing','postflight','evaluating','completed',
    'failed','rollback_pending','rollback_running','rollback_succeeded',
    'rollback_failed','quarantined','cancelled','superseded','consumed',
    'service_identity_registered'
  )),
  event_hash text not null check (event_hash ~ '^[a-f0-9]{64}$'),
  actor_identity_hash text not null check (actor_identity_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default transaction_timestamp(),
  unique (approval_record_id, event_sequence),
  unique (id, task_id, project_id, platform, environment),
  foreign key (approval_record_id, task_id, project_id, platform, environment)
    references public.governance_owner_approval_records(id, task_id, project_id, platform, environment),
  foreign key (approval_version_id, task_id, project_id, platform, environment)
    references public.governance_owner_approval_versions(id, task_id, project_id, platform, environment)
);

create table public.governance_approved_action_executions (
  id uuid primary key default gen_random_uuid(),
  approval_record_id uuid not null,
  approval_version_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  repository_full_name text not null check (repository_full_name = 'Chillywood2025/chillywood-mobile'),
  branch_name text not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  provider text not null,
  operation text not null,
  claim_sequence integer not null check (claim_sequence between 1 and 10),
  state text not null check (state in (
    'queued','claimed','preflight','executing','postflight','evaluating',
    'completed','failed','rollback_pending','rollback_running',
    'rollback_succeeded','rollback_failed','quarantined'
  )),
  service_identity text not null check (
    service_identity in (
      'cognitive_approved_action_worker',
      'product_experience_baseline_service',
      'livekit_experience_sentinel',
      'visual_product_experience_sentinel',
      'installed_journey_sentinel',
      'product_quality_triage_router',
      'model_independence_attestation_service'
    )
  ),
  service_identity_hash text not null check (service_identity_hash ~ '^[a-f0-9]{64}$'),
  worker_assertion_hash text not null check (worker_assertion_hash ~ '^[a-f0-9]{64}$'),
  decision_manifest_hash text not null check (decision_manifest_hash ~ '^[a-f0-9]{64}$'),
  plan_snapshot_hash text not null check (plan_snapshot_hash ~ '^[a-f0-9]{64}$'),
  approval_hash text not null check (approval_hash ~ '^[a-f0-9]{64}$'),
  target_resource_hash text not null check (target_resource_hash ~ '^[a-f0-9]{64}$'),
  budget_hash text not null check (budget_hash ~ '^[a-f0-9]{64}$'),
  tests_hash text not null check (tests_hash ~ '^[a-f0-9]{64}$'),
  evaluator_requirement_hash text not null check (evaluator_requirement_hash ~ '^[a-f0-9]{64}$'),
  rollback_hash text not null check (rollback_hash ~ '^[a-f0-9]{64}$'),
  execution_receipt_hash text check (execution_receipt_hash is null or execution_receipt_hash ~ '^[a-f0-9]{64}$'),
  evaluator_proof_hash text check (evaluator_proof_hash is null or evaluator_proof_hash ~ '^[a-f0-9]{64}$'),
  failure_hash text check (failure_hash is null or failure_hash ~ '^[a-f0-9]{64}$'),
  claimed_at timestamptz not null default transaction_timestamp(),
  began_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default transaction_timestamp(),
  unique (approval_version_id, claim_sequence),
  unique (approval_version_id, id),
  unique (id, task_id, project_id, platform, environment),
  foreign key (approval_record_id, task_id, project_id, platform, environment)
    references public.governance_owner_approval_records(id, task_id, project_id, platform, environment),
  foreign key (approval_version_id, task_id, project_id, platform, environment)
    references public.governance_owner_approval_versions(id, task_id, project_id, platform, environment)
);

alter table public.governance_owner_approval_lifecycle_events
  add constraint governance_owner_approval_lifecycle_execution_fk
  foreign key (execution_id, task_id, project_id, platform, environment)
    references public.governance_approved_action_executions(id, task_id, project_id, platform, environment);

create table public.governance_model_execution_attestations (
  id uuid primary key default gen_random_uuid(),
  assessment_id text not null check (
    length(assessment_id) between 8 and 160
    and not public.cognitive_text_has_secret(assessment_id)
    and not public.cognitive_text_has_private_identifier(assessment_id)
  ),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  council_role text not null check (
    council_role in (
      'product_user_experience','architecture_engineering','security_privacy',
      'reliability_release','safety_trust','accessibility_inclusion',
      'money_commercial_policy','research_futures','adversarial_red_team'
    )
  ),
  provider_identity_hash text not null check (provider_identity_hash ~ '^[a-f0-9]{64}$'),
  model_family text not null check (
    length(model_family) between 2 and 80
    and not public.cognitive_text_has_secret(model_family)
    and not public.cognitive_text_has_private_identifier(model_family)
  ),
  model_version text not null check (
    length(model_version) between 2 and 120
    and not public.cognitive_text_has_secret(model_version)
    and not public.cognitive_text_has_private_identifier(model_version)
  ),
  execution_identity_hash text not null check (execution_identity_hash ~ '^[a-f0-9]{64}$'),
  evidence_packet_hash text not null check (evidence_packet_hash ~ '^[a-f0-9]{64}$'),
  prompt_template_version_hash text not null check (prompt_template_version_hash ~ '^[a-f0-9]{64}$'),
  output_hash text not null check (output_hash ~ '^[a-f0-9]{64}$'),
  blind_first_round boolean not null,
  correlation_class text not null check (
    correlation_class in (
      'cross_provider',
      'cross_model_family',
      'same_provider_distinct_model_family',
      'same_family_isolated_advisory',
      'deterministic_non_model_evidence'
    )
  ),
  cost numeric(12,4) not null check (cost between 0 and 25),
  latency_ms integer not null check (latency_ms between 0 and 300000),
  submitted_at timestamptz not null default transaction_timestamp(),
  created_at timestamptz not null default transaction_timestamp(),
  unique (task_id, assessment_id, council_role, execution_identity_hash),
  unique (task_id, assessment_id, output_hash),
  unique (id, task_id, project_id, platform, environment),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment)
);

create table public.product_experience_baseline_versions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  baseline_key text not null check (baseline_key in (
    'streaming_mobile_content_density',
    'livekit_experience_deadlines',
    'installed_journey_completion',
    'accessibility_dynamic_type'
  )),
  baseline_version integer not null check (baseline_version between 1 and 1000),
  baseline_hash text not null check (baseline_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'needs_product_baseline_review' check (
    status in (
      'needs_product_baseline_review','owner_approved','superseded'
    )
  ),
  owner_approval_version_id uuid,
  approved_at timestamptz,
  created_at timestamptz not null default transaction_timestamp(),
  unique (task_id, baseline_key, baseline_version),
  unique (id, task_id, project_id, platform, environment),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment),
  foreign key (owner_approval_version_id, task_id, project_id, platform, environment)
    references public.governance_owner_approval_versions(id, task_id, project_id, platform, environment),
  check (
    (status='owner_approved' and owner_approval_version_id is not null and approved_at is not null)
    or status <> 'owner_approved'
  )
);

create table public.product_experience_sentinel_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  sentinel_key text not null check (sentinel_key in (
    'livekit_experience_sentinel',
    'visual_product_experience_sentinel',
    'installed_journey_sentinel'
  )),
  route_or_surface text not null check (
    length(route_or_surface) between 1 and 160
    and not public.cognitive_text_has_secret(route_or_surface)
    and not public.cognitive_text_has_private_identifier(route_or_surface)
  ),
  runtime_identity_hash text not null check (runtime_identity_hash ~ '^[a-f0-9]{64}$'),
  evidence_manifest_hash text not null check (evidence_manifest_hash ~ '^[a-f0-9]{64}$'),
  metric_manifest jsonb not null check (
    jsonb_typeof(metric_manifest) = 'object'
    and pg_column_size(metric_manifest) <= 65536
    and public.cognitive_json_is_sanitized(metric_manifest)
  ),
  result_status text not null check (
    result_status in ('passed','finding_created','blocked','failed')
  ),
  physical_proof_status text not null check (
    physical_proof_status in (
      'installed_ui_observed','simulator_observed','source_only',
      'provider_blocked','device_unavailable','new_binary_or_ota_required'
    )
  ),
  private_data_used boolean not null default false check (private_data_used = false),
  user_derived_data_used boolean not null default false check (user_derived_data_used = false),
  data_class public.cognitive_data_class not null default 'operational_metadata'
    check (data_class in ('operational_metadata','security_evidence','legal_hold')),
  retention_until timestamptz not null default transaction_timestamp() + interval '90 days',
  legal_hold boolean not null default false,
  erased_at timestamptz,
  created_at timestamptz not null default transaction_timestamp(),
  check (retention_until > created_at),
  check (legal_hold or retention_until <= created_at + interval '365 days'),
  check (legal_hold = (data_class = 'legal_hold')),
  check (
    erased_at is null
    or (
      legal_hold = false
      and erased_at >= retention_until
    )
  ),
  unique (task_id, sentinel_key, route_or_surface, evidence_manifest_hash),
  unique (id, task_id, project_id, platform, environment),
  foreign key (task_id, project_id, platform, environment)
    references public.intelligence_tasks(id, project_id, platform, environment)
);

create table public.product_quality_findings (
  id uuid primary key default gen_random_uuid(),
  sentinel_run_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  finding_key text not null check (
    length(finding_key) between 8 and 160
    and not public.cognitive_text_has_secret(finding_key)
    and not public.cognitive_text_has_private_identifier(finding_key)
  ),
  route_or_surface text not null check (
    length(route_or_surface) between 1 and 160
    and not public.cognitive_text_has_secret(route_or_surface)
    and not public.cognitive_text_has_private_identifier(route_or_surface)
  ),
  build_runtime_hash text not null check (build_runtime_hash ~ '^[a-f0-9]{64}$'),
  first_seen_at timestamptz not null default transaction_timestamp(),
  last_seen_at timestamptz not null default transaction_timestamp(),
  occurrence_count integer not null default 1 check (occurrence_count between 1 and 1000000),
  severity text not null check (severity in ('info','low','medium','high','critical')),
  user_impact_hash text not null check (user_impact_hash ~ '^[a-f0-9]{64}$'),
  evidence_hashes text[] not null check (
    public.governance_hash_array_valid(evidence_hashes, 1, 64)
  ),
  suspected_layer text not null check (
    suspected_layer in (
      'backend_token','websocket','ice_turn','media_publish',
      'media_subscribe','installed_ui_state','react_state',
      'permission','provider_degradation','layout_density',
      'route_navigation','loading_state','empty_error_offline',
      'platform_drift','unknown'
    )
  ),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  reproduction_state text not null check (
    reproduction_state in (
      'confirmed_defect','likely_defect','design_baseline_missing',
      'provider_blocked','device_unavailable','unproven_hypothesis',
      'false_positive'
    )
  ),
  affected_components_hash text not null check (affected_components_hash ~ '^[a-f0-9]{64}$'),
  provider_backend_state_hash text not null check (provider_backend_state_hash ~ '^[a-f0-9]{64}$'),
  proposed_next_investigation_hash text not null check (proposed_next_investigation_hash ~ '^[a-f0-9]{64}$'),
  physical_proof_status text not null check (
    physical_proof_status in (
      'installed_ui_observed','simulator_observed','source_only',
      'provider_blocked','device_unavailable','new_binary_or_ota_required'
    )
  ),
  governance_status text not null default 'entered_collective_governance' check (
    governance_status in (
      'entered_collective_governance','needs_product_baseline_review',
      'proposal_requested','owner_approval_requested','closed_no_action'
    )
  ),
  data_class public.cognitive_data_class not null default 'operational_metadata'
    check (data_class in ('operational_metadata','security_evidence','legal_hold')),
  retention_until timestamptz not null default transaction_timestamp() + interval '90 days',
  legal_hold boolean not null default false,
  erased_at timestamptz,
  created_at timestamptz not null default transaction_timestamp(),
  check (retention_until > created_at),
  check (legal_hold or retention_until <= created_at + interval '365 days'),
  check (legal_hold = (data_class = 'legal_hold')),
  check (
    erased_at is null
    or (
      legal_hold = false
      and erased_at >= retention_until
    )
  ),
  unique (task_id, finding_key),
  unique (id, task_id, project_id, platform, environment),
  foreign key (sentinel_run_id, task_id, project_id, platform, environment)
    references public.product_experience_sentinel_runs(id, task_id, project_id, platform, environment)
);

create index governance_owner_approval_records_status_idx
  on public.governance_owner_approval_records(task_id, project_id, platform, environment, current_state, updated_at desc);
create index governance_owner_approval_versions_expiry_idx
  on public.governance_owner_approval_versions(task_id, expires_at);
create index governance_approved_action_executions_state_idx
  on public.governance_approved_action_executions(task_id, project_id, platform, environment, state, updated_at desc);
create index governance_model_execution_attestations_assessment_idx
  on public.governance_model_execution_attestations(task_id, assessment_id, correlation_class);
create index product_quality_findings_triage_idx
  on public.product_quality_findings(task_id, platform, route_or_surface, reproduction_state, severity);
create index product_experience_sentinel_runs_retention_idx
  on public.product_experience_sentinel_runs(retention_until)
  where legal_hold = false and erased_at is null;
create index product_quality_findings_retention_idx
  on public.product_quality_findings(retention_until)
  where legal_hold = false and erased_at is null;

do $$
declare
  table_name text;
  tables constant text[] := array[
    'governance_owner_approval_records',
    'governance_owner_approval_versions',
    'governance_owner_approval_version_states',
    'governance_owner_approval_lifecycle_events',
    'governance_approved_action_executions',
    'governance_model_execution_attestations',
    'product_experience_baseline_versions',
    'product_experience_sentinel_runs',
    'product_quality_findings'
  ];
begin
  foreach table_name in array tables loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'revoke all on table public.%I from public, anon, authenticated, service_role',
      table_name
    );
    execute format('grant select on table public.%I to authenticated, service_role', table_name);
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
  tables constant text[] := array[
    'governance_owner_approval_versions',
    'governance_owner_approval_lifecycle_events',
    'governance_model_execution_attestations',
    'product_experience_baseline_versions',
    'product_experience_sentinel_runs',
    'product_quality_findings'
  ];
begin
  foreach table_name in array tables loop
    execute format(
      'create trigger %I before update or delete on public.%I
       for each row execute function public.reject_cognitive_evidence_mutation()',
      table_name || '_immutable',
      table_name
    );
  end loop;
end
$$;

create function public.product_experience_evidence_mutation_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'immutable_product_experience_evidence' using errcode = '42501';
  end if;
  if old.erased_at is null
     and new.erased_at is not null
     and old.legal_hold = false
     and new.erased_at >= old.retention_until
     and to_jsonb(new) - 'erased_at' = to_jsonb(old) - 'erased_at' then
    return new;
  end if;
  raise exception 'immutable_product_experience_evidence' using errcode = '42501';
end;
$$;
revoke all on function public.product_experience_evidence_mutation_guard()
  from public, anon, authenticated, service_role;

drop trigger if exists product_experience_sentinel_runs_immutable
  on public.product_experience_sentinel_runs;
drop trigger if exists product_quality_findings_immutable
  on public.product_quality_findings;
create trigger product_experience_sentinel_runs_retention_tombstone_only
before update or delete on public.product_experience_sentinel_runs
for each row execute function public.product_experience_evidence_mutation_guard();
create trigger product_quality_findings_retention_tombstone_only
before update or delete on public.product_quality_findings
for each row execute function public.product_experience_evidence_mutation_guard();

create function public.governance_service_identity_allows_operation(
  p_service_identity text,
  p_operation text
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_service_identity
    when 'cognitive_approved_action_worker' then p_operation = any(array[
      'bootstrap_control_plane','set_switch','public_research_ingest',
      'collective_deliberation','github_draft_pr'
    ]::text[])
    when 'product_experience_baseline_service' then p_operation = 'visual_experience_canary'
    when 'livekit_experience_sentinel' then p_operation = 'livekit_experience_canary'
    when 'visual_product_experience_sentinel' then p_operation = 'visual_experience_canary'
    when 'installed_journey_sentinel' then p_operation = 'installed_journey_canary'
    when 'product_quality_triage_router' then p_operation = 'product_quality_triage'
    when 'model_independence_attestation_service' then p_operation = 'model_independence_attestation'
    else false
  end;
$$;
revoke all on function public.governance_service_identity_allows_operation(text,text)
  from public, anon, authenticated, service_role;

create function public.governance_assert_two_party_service_principal(
  p_service_identity text,
  p_worker_assertion text,
  p_operation text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    claims->>'role'
  );
begin
  if request_role <> 'service_role'
     or p_worker_assertion is null
     or octet_length(p_worker_assertion) not between 32 and 1024
     or p_operation is null
     or not public.governance_service_identity_allows_operation(p_service_identity, p_operation)
     or not exists (
       select 1
       from public.governance_two_party_service_assertions assertion
       where assertion.service_identity = p_service_identity
         and assertion.status = 'active'
         and assertion.revoked_at is null
         and transaction_timestamp() < assertion.expires_at
         and p_operation = any(assertion.allowed_operations)
         and assertion.assertion_hash = encode(
           extensions.digest(convert_to(p_worker_assertion,'UTF8'),'sha256'),
           'hex'
         )
     ) then
    raise exception 'two_party_service_principal_required' using errcode = '42501';
  end if;
  return p_service_identity;
end;
$$;
revoke all on function public.governance_assert_two_party_service_principal(text,text,text)
  from public, anon, authenticated;
grant execute on function public.governance_assert_two_party_service_principal(text,text,text)
  to service_role;

create function public.governance_register_two_party_service_principal(
  p_service_identity text,
  p_assertion_hash text,
  p_allowed_operations text[],
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  evidence_hash_value text;
begin
  if p_service_identity not in (
       'cognitive_approved_action_worker',
       'product_experience_baseline_service',
       'livekit_experience_sentinel',
       'visual_product_experience_sentinel',
       'installed_journey_sentinel',
       'product_quality_triage_router',
       'model_independence_attestation_service'
     )
     or p_assertion_hash !~ '^[a-f0-9]{64}$'
     or p_allowed_operations is null
     or cardinality(p_allowed_operations) not between 1 and 64
     or not p_allowed_operations <@ array[
       'bootstrap_control_plane','set_switch','public_research_ingest',
       'collective_deliberation','model_independence_attestation',
       'livekit_experience_canary','visual_experience_canary',
       'installed_journey_canary','product_quality_triage','github_draft_pr'
     ]::text[]
     or exists (
       select 1
       from unnest(p_allowed_operations) allowed_operation
       where not public.governance_service_identity_allows_operation(
         p_service_identity, allowed_operation
       )
     )
     or p_expires_at <= transaction_timestamp()
     or p_expires_at > transaction_timestamp() + interval '365 days' then
    raise exception 'two_party_service_principal_registration_rejected'
      using errcode = 'P0001';
  end if;
  insert into public.governance_two_party_service_assertions(
    service_identity, assertion_hash, allowed_operations, registered_by,
    status, issued_at, expires_at, revoked_at, revoked_by, revocation_hash
  ) values (
    p_service_identity, p_assertion_hash, p_allowed_operations, owner_id,
    'active', transaction_timestamp(), p_expires_at, null, null, null
  )
  on conflict (service_identity) do update
    set assertion_hash = excluded.assertion_hash,
        allowed_operations = excluded.allowed_operations,
        registered_by = excluded.registered_by,
        status = 'active',
        issued_at = transaction_timestamp(),
        expires_at = excluded.expires_at,
        revoked_at = null,
        revoked_by = null,
        revocation_hash = null;

  evidence_hash_value := encode(extensions.digest(
    convert_to(p_service_identity || ':' || p_assertion_hash,'UTF8'),'sha256'
  ),'hex');

  insert into public.governance_audit_events(
    task_id, project_id, platform, environment, entity_type, entity_id,
    event_type, actor_identity_hash, evidence_hash
  )
  select task.id, task.project_id, task.platform, task.environment,
    'switch', task.id, 'two_party_service_identity_registered',
    encode(extensions.digest(convert_to(owner_id::text,'UTF8'),'sha256'),'hex'),
    evidence_hash_value
  from public.intelligence_tasks task
  where task.task_key = 'cognitive-level01-canary-control'
  order by task.created_at
  limit 1;

  return jsonb_build_object(
    'serviceIdentity', p_service_identity,
    'status', 'registered',
    'assertionHash', p_assertion_hash,
    'expiresAt', p_expires_at
  );
end;
$$;
revoke all on function public.governance_register_two_party_service_principal(text,text,text[],timestamptz)
  from public, anon, service_role;
grant execute on function public.governance_register_two_party_service_principal(text,text,text[],timestamptz)
  to authenticated;

create function public.governance_revoke_two_party_service_principal(
  p_service_identity text,
  p_revocation_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  now_at timestamptz := transaction_timestamp();
begin
  if p_service_identity not in (
       'cognitive_approved_action_worker',
       'product_experience_baseline_service',
       'livekit_experience_sentinel',
       'visual_product_experience_sentinel',
       'installed_journey_sentinel',
       'product_quality_triage_router',
       'model_independence_attestation_service'
     )
     or p_revocation_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'two_party_service_principal_revoke_rejected'
      using errcode = 'P0001';
  end if;

  update public.governance_two_party_service_assertions assertion
  set status = 'revoked',
      revoked_at = now_at,
      revoked_by = owner_id,
      revocation_hash = p_revocation_hash
  where assertion.service_identity = p_service_identity
    and assertion.status = 'active'
    and assertion.revoked_at is null;

  if not found then
    raise exception 'two_party_service_principal_revoke_rejected'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'serviceIdentity', p_service_identity,
    'status', 'revoked',
    'revocationHash', p_revocation_hash,
    'revokedAt', now_at
  );
end;
$$;
revoke all on function public.governance_revoke_two_party_service_principal(text,text)
  from public, anon, service_role;
grant execute on function public.governance_revoke_two_party_service_principal(text,text)
  to authenticated;

create function public.governance_approval_event_next_sequence(p_approval_record_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_sequence integer;
begin
  perform 1
  from public.governance_owner_approval_records
  where id = p_approval_record_id
  for update;
  if not found then
    raise exception 'two_party_approval_record_missing' using errcode = 'P0001';
  end if;
  select coalesce(max(event_sequence), 0) + 1
    into next_sequence
  from public.governance_owner_approval_lifecycle_events
  where approval_record_id = p_approval_record_id;
  return next_sequence;
end;
$$;
revoke all on function public.governance_approval_event_next_sequence(uuid)
  from public, anon, authenticated, service_role;

create function public.governance_switch_target_hash(
  p_switch_key text,
  p_enabled boolean,
  p_policy_version text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(concat_ws(
    '|',
    'set_switch',
    p_switch_key,
    case when p_enabled then 'true' else 'false' end,
    p_policy_version
  ), 'UTF8'), 'sha256'), 'hex');
$$;
revoke all on function public.governance_switch_target_hash(text,boolean,text)
  from public, anon, authenticated, service_role;

create function public.governance_record_owner_approval(
  p_decision_manifest_id uuid,
  p_approval_key text,
  p_objective_hash text,
  p_plan_snapshot_hash text,
  p_source_commit text,
  p_architecture_graph_digest text,
  p_approval_scope_hash text,
  p_repository_full_name text,
  p_branch_name text,
  p_provider text,
  p_operation text,
  p_target_resource_hash text,
  p_path_scope_hashes text[],
  p_table_scope_hashes text[],
  p_function_scope_hashes text[],
  p_budget_hash text,
  p_maximum_cost numeric,
  p_maximum_calls integer,
  p_maximum_bytes bigint,
  p_maximum_executions integer,
  p_tests_hash text,
  p_required_test_ids text[],
  p_evaluator_requirement_hash text,
  p_rollback_hash text,
  p_validity interval default interval '24 hours'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  decision_value public.governance_decision_manifests%rowtype;
  approval_record_id uuid;
  approval_version_id uuid;
  approval_hash_value text;
  owner_hash text;
  now_at timestamptz := transaction_timestamp();
  expires_at_value timestamptz;
begin
  select * into decision_value
  from public.governance_decision_manifests
  where id = p_decision_manifest_id
  for share;

  if decision_value.id is null
     or decision_value.status <> 'finalized'
     or decision_value.model_independence_status <> 'MODEL_INDEPENDENCE_VERIFIED'
     or decision_value.model_independence_assessment_id is null
     or decision_value.model_independence_evidence_hash is null
     or now_at >= decision_value.expires_at
     or exists (
       select 1 from public.governance_vetoes veto
       where veto.deliberation_id = decision_value.deliberation_id
         and veto.mandatory and veto.status = 'active'
     )
     or p_approval_key is null
     or length(p_approval_key) not between 8 and 160
     or public.cognitive_text_has_secret(p_approval_key)
     or public.cognitive_text_has_private_identifier(p_approval_key)
     or p_objective_hash !~ '^[a-f0-9]{64}$'
     or p_plan_snapshot_hash !~ '^[a-f0-9]{64}$'
     or p_source_commit !~ '^[a-f0-9]{40}$'
     or p_source_commit <> decision_value.source_commit
     or p_architecture_graph_digest !~ '^[a-f0-9]{64}$'
     or p_architecture_graph_digest <> decision_value.architecture_graph_digest
     or p_approval_scope_hash !~ '^[a-f0-9]{64}$'
     or p_approval_scope_hash <> decision_value.capability_scope_hash
     or p_repository_full_name <> 'Chillywood2025/chillywood-mobile'
     or p_branch_name !~ '^codex/[a-z0-9][a-z0-9/_-]{2,120}$'
     or p_branch_name ~* '(^|/)(main|master|release)(/|$)'
     or p_provider not in (
       'repository','github_draft_pr','public_research','model','none',
       'livekit','visual_sentinel','installed_journey'
     )
     or p_operation not in (
       'bootstrap_control_plane','set_switch','public_research_ingest',
       'collective_deliberation','model_independence_attestation',
       'livekit_experience_canary','visual_experience_canary',
       'installed_journey_canary','product_quality_triage','github_draft_pr'
     )
     or p_target_resource_hash !~ '^[a-f0-9]{64}$'
     or not public.governance_hash_array_valid(p_path_scope_hashes, 0, 128)
     or not public.governance_hash_array_valid(coalesce(p_table_scope_hashes,'{}'::text[]), 0, 128)
     or not public.governance_hash_array_valid(coalesce(p_function_scope_hashes,'{}'::text[]), 0, 64)
     or p_budget_hash !~ '^[a-f0-9]{64}$'
     or p_budget_hash <> decision_value.budget_hash
     or p_maximum_cost not between 0 and 100
     or p_maximum_calls not between 1 and 100
     or p_maximum_bytes not between 1 and 10000000
     or p_maximum_executions < 1
     or p_maximum_executions > decision_value.maximum_executions
     or p_tests_hash !~ '^[a-f0-9]{64}$'
     or p_required_test_ids is null
     or cardinality(p_required_test_ids) not between 1 and 128
     or not decision_value.required_test_ids <@ p_required_test_ids
     or p_evaluator_requirement_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_hash <> decision_value.rollback_hash
     or p_validity <= interval '0 seconds'
     or p_validity > interval '24 hours' then
    raise exception 'two_party_owner_approval_rejected' using errcode = 'P0001';
  end if;

  expires_at_value := least(now_at + p_validity, decision_value.expires_at);
  owner_hash := encode(extensions.digest(convert_to(owner_id::text,'UTF8'),'sha256'),'hex');
  approval_hash_value := encode(extensions.digest(convert_to(concat_ws(
    '|', decision_value.id::text, decision_value.decision_hash, p_approval_key,
    p_objective_hash, p_plan_snapshot_hash, p_source_commit,
    p_architecture_graph_digest, p_approval_scope_hash, p_repository_full_name,
    p_branch_name, p_provider, p_operation, p_target_resource_hash,
    array_to_string(p_path_scope_hashes, ','), array_to_string(coalesce(p_table_scope_hashes,'{}'::text[]), ','),
    array_to_string(coalesce(p_function_scope_hashes,'{}'::text[]), ','),
    p_budget_hash, p_maximum_cost::text, p_maximum_calls::text,
    p_maximum_bytes::text, p_maximum_executions::text, p_tests_hash,
    array_to_string(p_required_test_ids, ','), p_evaluator_requirement_hash,
    p_rollback_hash, owner_id::text, now_at::text, expires_at_value::text
  ),'UTF8'),'sha256'),'hex');

  insert into public.governance_owner_approval_records(
    decision_manifest_id, task_id, project_id, platform, environment,
    approval_key, objective_hash, owner_user_id, current_version,
    current_state, maximum_executions, executions_claimed,
    executions_completed, approval_hash, created_at, updated_at
  ) values (
    decision_value.id, decision_value.task_id, decision_value.project_id,
    decision_value.platform, decision_value.environment, p_approval_key,
    p_objective_hash, owner_id, 1, 'active', p_maximum_executions, 0, 0,
    approval_hash_value, now_at, now_at
  ) returning id into approval_record_id;

  insert into public.governance_owner_approval_versions(
    approval_record_id, decision_manifest_id, task_id, project_id, platform,
    environment, version_number, owner_user_id, owner_identity_hash,
    decision_manifest_hash, plan_snapshot_hash, source_commit,
    architecture_graph_digest, approval_scope_hash, objective_hash,
    repository_full_name, branch_name, provider, operation, target_resource_hash,
    path_scope_hashes, table_scope_hashes, function_scope_hashes, budget_hash,
    maximum_cost, maximum_calls, maximum_bytes, maximum_executions, tests_hash,
    required_test_ids, evaluator_requirement_hash, rollback_hash, approval_hash,
    approved_at, valid_from, expires_at
  ) values (
    approval_record_id, decision_value.id, decision_value.task_id,
    decision_value.project_id, decision_value.platform, decision_value.environment,
    1, owner_id, owner_hash, decision_value.decision_hash, p_plan_snapshot_hash,
    p_source_commit, p_architecture_graph_digest, p_approval_scope_hash,
    p_objective_hash, p_repository_full_name, p_branch_name, p_provider,
    p_operation, p_target_resource_hash, p_path_scope_hashes,
    coalesce(p_table_scope_hashes,'{}'::text[]),
    coalesce(p_function_scope_hashes,'{}'::text[]), p_budget_hash,
    p_maximum_cost, p_maximum_calls, p_maximum_bytes, p_maximum_executions,
    p_tests_hash, p_required_test_ids, p_evaluator_requirement_hash,
    p_rollback_hash, approval_hash_value, now_at, now_at, expires_at_value
  ) returning id into approval_version_id;

  insert into public.governance_owner_approval_version_states(
    approval_version_id, approval_record_id, task_id, project_id, platform,
    environment, state, maximum_executions
  ) values (
    approval_version_id, approval_record_id, decision_value.task_id,
    decision_value.project_id, decision_value.platform, decision_value.environment,
    'active', p_maximum_executions
  );

  insert into public.governance_owner_approval_lifecycle_events(
    approval_record_id, approval_version_id, task_id, project_id, platform,
    environment, event_sequence, event_type, event_hash, actor_identity_hash
  ) values (
    approval_record_id, approval_version_id, decision_value.task_id,
    decision_value.project_id, decision_value.platform, decision_value.environment,
    1, 'owner_approved', approval_hash_value, owner_hash
  );

  return jsonb_build_object(
    'approvalId', approval_record_id,
    'approvalVersionId', approval_version_id,
    'approvalVersion', 1,
    'approvalHash', approval_hash_value,
    'status', 'active',
    'approvedAt', now_at,
    'expiresAt', expires_at_value,
    'remainingExecutionAllowance', p_maximum_executions
  );
end;
$$;
revoke all on function public.governance_record_owner_approval(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text[],
  text[],text[],text,numeric,integer,bigint,integer,text,text[],text,text,interval
) from public, anon, service_role;
grant execute on function public.governance_record_owner_approval(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text[],
  text[],text[],text,numeric,integer,bigint,integer,text,text[],text,text,interval
) to authenticated;

create function public.governance_revoke_owner_approval(
  p_approval_version_id uuid,
  p_reason_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  version_value public.governance_owner_approval_versions%rowtype;
  event_sequence_value integer;
  now_at timestamptz := transaction_timestamp();
  updated_state text;
begin
  select * into version_value
  from public.governance_owner_approval_versions
  where id = p_approval_version_id
  for share;
  if version_value.id is null
     or version_value.owner_user_id <> owner_id
     or p_reason_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'two_party_owner_revoke_rejected' using errcode = 'P0001';
  end if;

    update public.governance_owner_approval_version_states
    set state = 'revoked', revoked_at = now_at, updated_at = now_at
    where approval_version_id = p_approval_version_id
      and (
        state in ('active','expired')
        or (
          state = 'consumed'
          and exists (
            select 1
            from public.governance_approved_action_executions execution
            where execution.approval_version_id = p_approval_version_id
              and execution.state not in (
                'completed','failed','rollback_succeeded',
                'rollback_failed','quarantined'
              )
          )
        )
      )
    returning state into strict updated_state;

  update public.governance_owner_approval_records
  set current_state = 'revoked', updated_at = now_at
  where id = version_value.approval_record_id;

  select public.governance_approval_event_next_sequence(version_value.approval_record_id)
    into event_sequence_value;
  insert into public.governance_owner_approval_lifecycle_events(
    approval_record_id, approval_version_id, task_id, project_id, platform,
    environment, event_sequence, event_type, event_hash, actor_identity_hash
  ) values (
    version_value.approval_record_id, version_value.id, version_value.task_id,
    version_value.project_id, version_value.platform, version_value.environment,
    event_sequence_value, 'revoked', p_reason_hash,
    encode(extensions.digest(convert_to(owner_id::text,'UTF8'),'sha256'),'hex')
  );
  return jsonb_build_object(
    'approvalVersionId', p_approval_version_id,
    'status', 'revoked',
    'revokedAt', now_at
  );
exception
  when no_data_found then
    raise exception 'two_party_owner_revoke_rejected' using errcode = 'P0001';
end;
$$;
revoke all on function public.governance_revoke_owner_approval(uuid,text)
  from public, anon, service_role;
grant execute on function public.governance_revoke_owner_approval(uuid,text)
  to authenticated;

create function public.governance_revalidate_owner_approval(
  p_expired_version_id uuid,
  p_revalidation_hash text,
  p_current_decision_manifest_hash text,
  p_current_source_commit text,
  p_current_plan_snapshot_hash text,
  p_material_delta boolean,
  p_validity interval default interval '24 hours'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  old_version public.governance_owner_approval_versions%rowtype;
  old_state public.governance_owner_approval_version_states%rowtype;
  approval_value public.governance_owner_approval_records%rowtype;
  decision_value public.governance_decision_manifests%rowtype;
  next_version integer;
  new_version_id uuid;
  new_hash text;
  now_at timestamptz := transaction_timestamp();
  expires_at_value timestamptz;
  event_sequence_value integer;
begin
  select * into old_version
  from public.governance_owner_approval_versions
  where id = p_expired_version_id
  for update;
  select * into old_state
  from public.governance_owner_approval_version_states
  where approval_version_id = p_expired_version_id
  for update;
  select * into approval_value
  from public.governance_owner_approval_records
  where id = old_version.approval_record_id
  for update;
  select * into decision_value
  from public.governance_decision_manifests
  where id = old_version.decision_manifest_id;

  if old_version.id is null
     or old_state.approval_version_id is null
     or approval_value.id is null
     or decision_value.id is null then
    raise exception 'two_party_reinstatement_requires_amended_approval'
      using errcode = 'P0001';
  end if;

  if old_version.owner_user_id <> owner_id
     or old_state.state not in ('active','expired')
     or approval_value.current_version <> old_version.version_number
     or approval_value.current_state not in ('active','expired')
     or now_at < old_version.expires_at
     or p_revalidation_hash !~ '^[a-f0-9]{64}$'
     or p_current_decision_manifest_hash <> old_version.decision_manifest_hash
     or p_current_decision_manifest_hash <> decision_value.decision_hash
     or p_current_source_commit <> old_version.source_commit
     or p_current_plan_snapshot_hash <> old_version.plan_snapshot_hash
     or decision_value.status <> 'finalized'
     or now_at >= decision_value.expires_at
     or p_material_delta
     or p_validity <= interval '0 seconds'
     or p_validity > interval '24 hours' then
    select public.governance_approval_event_next_sequence(old_version.approval_record_id)
      into event_sequence_value;
    insert into public.governance_owner_approval_lifecycle_events(
      approval_record_id, approval_version_id, task_id, project_id, platform,
      environment, event_sequence, event_type, event_hash, actor_identity_hash
    ) values (
      old_version.approval_record_id, old_version.id, old_version.task_id,
      old_version.project_id, old_version.platform, old_version.environment,
      event_sequence_value, 'amendment_required',
      coalesce(nullif(p_revalidation_hash,''),'0000000000000000000000000000000000000000000000000000000000000000'),
      encode(extensions.digest(convert_to(owner_id::text,'UTF8'),'sha256'),'hex')
    );
    raise exception 'two_party_reinstatement_requires_amended_approval'
      using errcode = 'P0001';
  end if;

  update public.governance_owner_approval_version_states
  set state = 'expired', updated_at = now_at
  where approval_version_id = old_version.id
    and state = 'active';

  expires_at_value := least(now_at + p_validity, decision_value.expires_at);
  next_version := approval_value.current_version + 1;
  new_hash := encode(extensions.digest(convert_to(concat_ws(
    '|', old_version.approval_hash, p_revalidation_hash, owner_id::text,
    now_at::text, expires_at_value::text
  ),'UTF8'),'sha256'),'hex');

  insert into public.governance_owner_approval_versions(
    approval_record_id, decision_manifest_id, task_id, project_id, platform,
    environment, version_number, prior_version_id, owner_user_id,
    owner_identity_hash, decision_manifest_hash, plan_snapshot_hash,
    source_commit, architecture_graph_digest, approval_scope_hash,
    objective_hash, repository_full_name, branch_name, provider, operation,
    target_resource_hash, path_scope_hashes, table_scope_hashes,
    function_scope_hashes, budget_hash, maximum_cost, maximum_calls,
    maximum_bytes, maximum_executions, tests_hash, required_test_ids,
    evaluator_requirement_hash, rollback_hash, approval_hash,
    revalidation_hash, material_delta, approved_at, valid_from, expires_at
  )
  select approval_record_id, decision_manifest_id, task_id, project_id,
    platform, environment, next_version, old_version.id, owner_id,
    encode(extensions.digest(convert_to(owner_id::text,'UTF8'),'sha256'),'hex'),
    decision_manifest_hash, plan_snapshot_hash, source_commit,
    architecture_graph_digest, approval_scope_hash, objective_hash,
    repository_full_name, branch_name, provider, operation,
    target_resource_hash, path_scope_hashes, table_scope_hashes,
    function_scope_hashes, budget_hash, maximum_cost, maximum_calls,
    maximum_bytes, maximum_executions, tests_hash, required_test_ids,
    evaluator_requirement_hash, rollback_hash, new_hash, p_revalidation_hash,
    false, now_at, now_at, expires_at_value
  from public.governance_owner_approval_versions
  where id = old_version.id
  returning id into new_version_id;

  insert into public.governance_owner_approval_version_states(
    approval_version_id, approval_record_id, task_id, project_id, platform,
    environment, state, maximum_executions
  ) values (
    new_version_id, old_version.approval_record_id, old_version.task_id,
    old_version.project_id, old_version.platform, old_version.environment,
    'active', old_version.maximum_executions
  );

  update public.governance_owner_approval_version_states
  set state = 'superseded',
      superseded_at = now_at,
      updated_at = now_at
  where approval_record_id = old_version.approval_record_id
    and approval_version_id not in (old_version.id, new_version_id)
    and state = 'active';

  update public.governance_owner_approval_records
  set current_version = next_version,
      current_state = 'active',
      executions_claimed = 0,
      executions_completed = 0,
      approval_hash = new_hash,
      updated_at = now_at
  where id = old_version.approval_record_id;

  select public.governance_approval_event_next_sequence(old_version.approval_record_id)
    into event_sequence_value;
  insert into public.governance_owner_approval_lifecycle_events(
    approval_record_id, approval_version_id, task_id, project_id, platform,
    environment, event_sequence, event_type, event_hash, actor_identity_hash
  ) values (
    old_version.approval_record_id, new_version_id, old_version.task_id,
    old_version.project_id, old_version.platform, old_version.environment,
    event_sequence_value, 'reinstated', new_hash,
    encode(extensions.digest(convert_to(owner_id::text,'UTF8'),'sha256'),'hex')
  );

  return jsonb_build_object(
    'approvalVersionId', new_version_id,
    'approvalVersion', next_version,
    'approvalHash', new_hash,
    'status', 'active',
    'approvedAt', now_at,
    'expiresAt', expires_at_value,
    'remainingExecutionAllowance', old_version.maximum_executions
  );
end;
$$;
revoke all on function public.governance_revalidate_owner_approval(
  uuid,text,text,text,text,boolean,interval
) from public, anon, service_role;
grant execute on function public.governance_revalidate_owner_approval(
  uuid,text,text,text,text,boolean,interval
) to authenticated;

create function public.governance_approval_emergency_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select status = 'active'
    from public.autonomous_system_emergency_states
    where system_id = 'product_intelligence_operator'
    limit 1
  ), false);
$$;
revoke all on function public.governance_approval_emergency_active()
  from public, anon, authenticated, service_role;

create function public.governance_task_writes_allowed(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.governance_approval_emergency_active()
    and exists (
      select 1
      from public.intelligence_tasks task
      where task.id = p_task_id
        and task.project_id = p_project_id
        and task.platform = p_platform
        and task.environment = p_environment
        and task.cancelled_at is null
        and task.quarantined_at is null
        and transaction_timestamp() < task.deadman_at
    );
$$;
revoke all on function public.governance_task_writes_allowed(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment
) from public, anon, authenticated, service_role;

create function public.governance_approved_execution_is_live(p_execution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.governance_approved_action_executions execution
    join public.governance_owner_approval_versions version
      on version.id = execution.approval_version_id
     and version.task_id = execution.task_id
     and version.project_id = execution.project_id
     and version.platform = execution.platform
     and version.environment = execution.environment
    join public.governance_owner_approval_version_states state
      on state.approval_version_id = execution.approval_version_id
     and state.task_id = execution.task_id
     and state.project_id = execution.project_id
     and state.platform = execution.platform
     and state.environment = execution.environment
    where execution.id = p_execution_id
      and public.governance_task_writes_allowed(
        execution.task_id, execution.project_id,
        execution.platform, execution.environment
      )
      and transaction_timestamp() >= version.valid_from
      and transaction_timestamp() < version.expires_at
      and state.state in ('active','consumed')
      and state.revoked_at is null
      and state.superseded_at is null
      and state.cancelled_at is null
  );
$$;
revoke all on function public.governance_approved_execution_is_live(uuid)
  from public, anon, authenticated, service_role;

create function public.governance_lock_approved_execution_liveness(
  p_execution_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  execution_value public.governance_approved_action_executions%rowtype;
begin
  select * into execution_value
  from public.governance_approved_action_executions
  where id = p_execution_id
  for update;
  if execution_value.id is null then
    return false;
  end if;

  perform 1
  from public.governance_owner_approval_version_states state
  where state.approval_version_id = execution_value.approval_version_id
    and state.task_id = execution_value.task_id
    and state.project_id = execution_value.project_id
    and state.platform = execution_value.platform
    and state.environment = execution_value.environment
  for update;
  if not found then
    return false;
  end if;

  perform 1
  from public.intelligence_tasks task
  where task.id = execution_value.task_id
    and task.project_id = execution_value.project_id
    and task.platform = execution_value.platform
    and task.environment = execution_value.environment
  for share;
  if not found then
    return false;
  end if;

  perform 1
  from public.autonomous_system_emergency_states state
  where state.system_id = 'product_intelligence_operator'
  for share;
  if not found then
    return false;
  end if;

  return public.governance_approved_execution_is_live(p_execution_id);
end;
$$;
revoke all on function public.governance_lock_approved_execution_liveness(uuid)
  from public, anon, authenticated, service_role;

create function public.governance_lock_approved_execution_cleanup_scope(
  p_execution_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  execution_value public.governance_approved_action_executions%rowtype;
begin
  select * into execution_value
  from public.governance_approved_action_executions
  where id = p_execution_id
  for update;
  if execution_value.id is null then
    return false;
  end if;

  perform 1
  from public.governance_owner_approval_version_states state
  where state.approval_version_id = execution_value.approval_version_id
    and state.task_id = execution_value.task_id
    and state.project_id = execution_value.project_id
    and state.platform = execution_value.platform
    and state.environment = execution_value.environment
  for update;
  if not found then
    return false;
  end if;

  perform 1
  from public.intelligence_tasks task
  where task.id = execution_value.task_id
    and task.project_id = execution_value.project_id
    and task.platform = execution_value.platform
    and task.environment = execution_value.environment
  for share;
  if not found then
    return false;
  end if;

  perform 1
  from public.autonomous_system_emergency_states state
  where state.system_id = 'product_intelligence_operator'
  for share;
  if not found then
    return false;
  end if;

  return execution_value.state in (
    'claimed','preflight','executing','postflight','evaluating',
    'rollback_pending','rollback_running'
  );
end;
$$;
revoke all on function public.governance_lock_approved_execution_cleanup_scope(uuid)
  from public, anon, authenticated, service_role;

create function public.governance_claim_approved_action(
  p_approval_version_id uuid,
  p_service_identity text,
  p_worker_assertion text,
  p_decision_manifest_hash text,
  p_plan_snapshot_hash text,
  p_approval_hash text,
  p_task_id uuid,
  p_project_id uuid,
  p_repository_full_name text,
  p_branch_name text,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_provider text,
  p_operation text,
  p_target_resource_hash text,
  p_budget_hash text,
  p_tests_hash text,
  p_evaluator_requirement_hash text,
  p_rollback_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  service_identity_value text;
  version_value public.governance_owner_approval_versions%rowtype;
  state_value public.governance_owner_approval_version_states%rowtype;
  approval_value public.governance_owner_approval_records%rowtype;
  task_value public.intelligence_tasks%rowtype;
  claim_sequence_value integer;
  execution_id uuid;
  now_at timestamptz := transaction_timestamp();
  event_sequence_value integer;
  worker_hash text;
begin
  service_identity_value := public.governance_assert_two_party_service_principal(
    p_service_identity, p_worker_assertion, p_operation
  );
  select * into version_value
  from public.governance_owner_approval_versions
  where id = p_approval_version_id
  for share;
  select * into state_value
  from public.governance_owner_approval_version_states
  where approval_version_id = p_approval_version_id
  for update;
  select * into approval_value
  from public.governance_owner_approval_records
  where id = version_value.approval_record_id
  for update;
  select * into task_value
  from public.intelligence_tasks
  where id = p_task_id
    and project_id = p_project_id
    and platform = p_platform
    and environment = p_environment
  for share;

  if version_value.id is null
     or state_value.approval_version_id is null
     or approval_value.id is null
     or task_value.id is null
     or approval_value.current_version <> version_value.version_number
     or approval_value.current_state <> 'active'
     or task_value.cancelled_at is not null
     or task_value.quarantined_at is not null
     or now_at >= task_value.deadman_at
     or not public.governance_approval_emergency_active()
     or state_value.state <> 'active'
     or state_value.revoked_at is not null
     or now_at < version_value.valid_from
     or now_at >= version_value.expires_at
     or state_value.executions_claimed >= state_value.maximum_executions
     or version_value.decision_manifest_hash <> p_decision_manifest_hash
     or version_value.plan_snapshot_hash <> p_plan_snapshot_hash
     or version_value.approval_hash <> p_approval_hash
     or version_value.task_id <> p_task_id
     or version_value.project_id <> p_project_id
     or version_value.repository_full_name <> p_repository_full_name
     or version_value.branch_name <> p_branch_name
     or version_value.platform <> p_platform
     or version_value.environment <> p_environment
     or version_value.provider <> p_provider
     or version_value.operation <> p_operation
     or version_value.target_resource_hash <> p_target_resource_hash
     or version_value.budget_hash <> p_budget_hash
     or version_value.tests_hash <> p_tests_hash
     or version_value.evaluator_requirement_hash <> p_evaluator_requirement_hash
     or version_value.rollback_hash <> p_rollback_hash then
    raise exception 'two_party_approved_action_claim_rejected'
      using errcode = 'P0001';
  end if;

  claim_sequence_value := state_value.executions_claimed + 1;
  worker_hash := encode(extensions.digest(convert_to(p_worker_assertion,'UTF8'),'sha256'),'hex');

  update public.governance_owner_approval_version_states
  set executions_claimed = claim_sequence_value,
      state = case
        when claim_sequence_value >= maximum_executions then 'consumed'
        else state
      end,
      updated_at = now_at
  where approval_version_id = p_approval_version_id;

  update public.governance_owner_approval_records
  set executions_claimed = executions_claimed + 1,
      current_state = case
        when executions_claimed + 1 >= maximum_executions then 'consumed'
        else current_state
      end,
      updated_at = now_at
  where id = version_value.approval_record_id;

  insert into public.governance_approved_action_executions(
    approval_record_id, approval_version_id, task_id, project_id,
    repository_full_name, branch_name, platform, environment, provider,
    operation, claim_sequence, state, service_identity, service_identity_hash,
    worker_assertion_hash, decision_manifest_hash, plan_snapshot_hash,
    approval_hash, target_resource_hash, budget_hash, tests_hash,
    evaluator_requirement_hash, rollback_hash, claimed_at, updated_at
  ) values (
    version_value.approval_record_id, version_value.id, version_value.task_id,
    version_value.project_id, version_value.repository_full_name,
    version_value.branch_name, version_value.platform, version_value.environment,
    version_value.provider, version_value.operation, claim_sequence_value,
    'claimed', service_identity_value,
    encode(extensions.digest(convert_to(service_identity_value,'UTF8'),'sha256'),'hex'),
    worker_hash, version_value.decision_manifest_hash,
    version_value.plan_snapshot_hash, version_value.approval_hash,
    version_value.target_resource_hash, version_value.budget_hash,
    version_value.tests_hash, version_value.evaluator_requirement_hash,
    version_value.rollback_hash, now_at, now_at
  ) returning id into execution_id;

  select public.governance_approval_event_next_sequence(version_value.approval_record_id)
    into event_sequence_value;
  insert into public.governance_owner_approval_lifecycle_events(
    approval_record_id, approval_version_id, execution_id, task_id, project_id,
    platform, environment, event_sequence, event_type, event_hash,
    actor_identity_hash
  ) values (
    version_value.approval_record_id, version_value.id, execution_id,
    version_value.task_id, version_value.project_id, version_value.platform,
    version_value.environment, event_sequence_value, 'claimed',
    version_value.approval_hash,
    encode(extensions.digest(convert_to(service_identity_value,'UTF8'),'sha256'),'hex')
  );

  return jsonb_build_object(
    'executionId', execution_id,
    'claimSequence', claim_sequence_value,
    'approvalVersionId', version_value.id,
    'state', 'claimed',
    'claimedAt', now_at
  );
end;
$$;
revoke all on function public.governance_claim_approved_action(
  uuid,text,text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
  public.cognitive_environment,text,text,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.governance_claim_approved_action(
  uuid,text,text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,
  public.cognitive_environment,text,text,text,text,text,text,text
) to service_role;

create function public.governance_begin_approved_execution(
  p_execution_id uuid,
  p_service_identity text,
  p_worker_assertion text,
  p_next_state text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  execution_value public.governance_approved_action_executions%rowtype;
  service_identity_value text;
  now_at timestamptz := transaction_timestamp();
  event_sequence_value integer;
begin
  select * into execution_value
  from public.governance_approved_action_executions
  where id = p_execution_id
  for update;
  if execution_value.id is null then
    raise exception 'two_party_execution_missing' using errcode = 'P0001';
  end if;
  service_identity_value := public.governance_assert_two_party_service_principal(
    p_service_identity, p_worker_assertion, execution_value.operation
  );
  if execution_value.service_identity <> service_identity_value
     or not public.governance_lock_approved_execution_liveness(p_execution_id)
     or (
       execution_value.state = 'claimed' and p_next_state <> 'preflight'
     )
     or (
       execution_value.state = 'preflight' and p_next_state <> 'executing'
     )
     or (
       execution_value.state = 'executing' and p_next_state <> 'postflight'
     )
     or (
       execution_value.state = 'postflight' and p_next_state <> 'evaluating'
     )
     or p_next_state not in ('preflight','executing','postflight','evaluating') then
    raise exception 'two_party_execution_transition_rejected'
      using errcode = 'P0001';
  end if;
  update public.governance_approved_action_executions
  set state = p_next_state,
      began_at = coalesce(began_at, now_at),
      updated_at = now_at
  where id = p_execution_id;

  select public.governance_approval_event_next_sequence(execution_value.approval_record_id)
    into event_sequence_value;
  insert into public.governance_owner_approval_lifecycle_events(
    approval_record_id, approval_version_id, execution_id, task_id, project_id,
    platform, environment, event_sequence, event_type, event_hash,
    actor_identity_hash
  ) values (
    execution_value.approval_record_id, execution_value.approval_version_id,
    execution_value.id, execution_value.task_id, execution_value.project_id,
    execution_value.platform, execution_value.environment, event_sequence_value,
    p_next_state, execution_value.approval_hash,
    encode(extensions.digest(convert_to(service_identity_value,'UTF8'),'sha256'),'hex')
  );

  return jsonb_build_object(
    'executionId', p_execution_id,
    'state', p_next_state,
    'updatedAt', now_at
  );
end;
$$;
revoke all on function public.governance_begin_approved_execution(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.governance_begin_approved_execution(uuid,text,text,text)
  to service_role;

create function public.governance_complete_approved_execution(
  p_execution_id uuid,
  p_service_identity text,
  p_worker_assertion text,
  p_execution_receipt_hash text,
  p_evaluator_proof_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  execution_value public.governance_approved_action_executions%rowtype;
  service_identity_value text;
  now_at timestamptz := transaction_timestamp();
  event_sequence_value integer;
begin
  select * into execution_value
  from public.governance_approved_action_executions
  where id = p_execution_id
  for update;
  if execution_value.id is null then
    raise exception 'two_party_execution_missing' using errcode = 'P0001';
  end if;
  service_identity_value := public.governance_assert_two_party_service_principal(
    p_service_identity, p_worker_assertion, execution_value.operation
  );
  if execution_value.service_identity <> service_identity_value
     or not public.governance_lock_approved_execution_liveness(p_execution_id)
     or execution_value.state <> 'evaluating'
     or p_execution_receipt_hash !~ '^[a-f0-9]{64}$'
     or p_evaluator_proof_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'two_party_execution_completion_rejected'
      using errcode = 'P0001';
  end if;

  update public.governance_approved_action_executions
  set state = 'completed',
      execution_receipt_hash = p_execution_receipt_hash,
      evaluator_proof_hash = p_evaluator_proof_hash,
      completed_at = now_at,
      updated_at = now_at
  where id = p_execution_id;
  update public.governance_owner_approval_version_states
  set executions_completed = executions_completed + 1,
      state = case
        when executions_completed + 1 >= maximum_executions then 'completed'
        else state
      end,
      completed_at = case
        when executions_completed + 1 >= maximum_executions then now_at
        else completed_at
      end,
      updated_at = now_at
  where approval_version_id = execution_value.approval_version_id;
  update public.governance_owner_approval_records
  set executions_completed = executions_completed + 1,
      current_state = case
        when executions_completed + 1 >= maximum_executions then 'completed'
        else current_state
      end,
      updated_at = now_at
  where id = execution_value.approval_record_id;

  select public.governance_approval_event_next_sequence(execution_value.approval_record_id)
    into event_sequence_value;
  insert into public.governance_owner_approval_lifecycle_events(
    approval_record_id, approval_version_id, execution_id, task_id, project_id,
    platform, environment, event_sequence, event_type, event_hash,
    actor_identity_hash
  ) values (
    execution_value.approval_record_id, execution_value.approval_version_id,
    execution_value.id, execution_value.task_id, execution_value.project_id,
    execution_value.platform, execution_value.environment, event_sequence_value,
    'completed', p_execution_receipt_hash,
    encode(extensions.digest(convert_to(service_identity_value,'UTF8'),'sha256'),'hex')
  );

  return jsonb_build_object(
    'executionId', p_execution_id,
    'state', 'completed',
    'completedAt', now_at
  );
end;
$$;
revoke all on function public.governance_complete_approved_execution(uuid,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.governance_complete_approved_execution(uuid,text,text,text,text)
  to service_role;

create function public.governance_fail_approved_execution(
  p_execution_id uuid,
  p_service_identity text,
  p_worker_assertion text,
  p_failure_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  execution_value public.governance_approved_action_executions%rowtype;
  service_identity_value text;
  now_at timestamptz := transaction_timestamp();
  event_sequence_value integer;
begin
  select * into execution_value
  from public.governance_approved_action_executions
  where id = p_execution_id
  for update;
  if execution_value.id is null then
    raise exception 'two_party_execution_missing' using errcode = 'P0001';
  end if;
  service_identity_value := public.governance_assert_two_party_service_principal(
    p_service_identity, p_worker_assertion, execution_value.operation
  );
  if execution_value.service_identity <> service_identity_value
     or not public.governance_lock_approved_execution_cleanup_scope(p_execution_id)
     or execution_value.state not in ('claimed','preflight','executing','postflight','evaluating')
     or p_failure_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'two_party_execution_failure_rejected'
      using errcode = 'P0001';
  end if;
  update public.governance_approved_action_executions
  set state = 'failed', failure_hash = p_failure_hash, completed_at = now_at,
      updated_at = now_at
  where id = p_execution_id;
  update public.governance_owner_approval_version_states
  set state = 'failed', updated_at = now_at
  where approval_version_id = execution_value.approval_version_id
    and state in ('active','consumed');
  update public.governance_owner_approval_records
  set current_state = 'failed', updated_at = now_at
  where id = execution_value.approval_record_id;
  select public.governance_approval_event_next_sequence(execution_value.approval_record_id)
    into event_sequence_value;
  insert into public.governance_owner_approval_lifecycle_events(
    approval_record_id, approval_version_id, execution_id, task_id, project_id,
    platform, environment, event_sequence, event_type, event_hash,
    actor_identity_hash
  ) values (
    execution_value.approval_record_id, execution_value.approval_version_id,
    execution_value.id, execution_value.task_id, execution_value.project_id,
    execution_value.platform, execution_value.environment, event_sequence_value,
    'failed', p_failure_hash,
    encode(extensions.digest(convert_to(service_identity_value,'UTF8'),'sha256'),'hex')
  );
  return jsonb_build_object('executionId', p_execution_id, 'state', 'failed');
end;
$$;
revoke all on function public.governance_fail_approved_execution(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.governance_fail_approved_execution(uuid,text,text,text)
  to service_role;

create function public.governance_release_or_quarantine_execution(
  p_execution_id uuid,
  p_service_identity text,
  p_worker_assertion text,
  p_transition text,
  p_evidence_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  execution_value public.governance_approved_action_executions%rowtype;
  service_identity_value text;
  now_at timestamptz := transaction_timestamp();
  event_sequence_value integer;
  next_version_state text;
begin
  select * into execution_value
  from public.governance_approved_action_executions
  where id = p_execution_id
  for update;
  if execution_value.id is null then
    raise exception 'two_party_execution_missing' using errcode = 'P0001';
  end if;
  service_identity_value := public.governance_assert_two_party_service_principal(
    p_service_identity, p_worker_assertion, execution_value.operation
  );
  if execution_value.service_identity <> service_identity_value
     or not public.governance_lock_approved_execution_cleanup_scope(p_execution_id)
     or p_transition not in (
       'rollback_pending','rollback_running','rollback_succeeded',
       'rollback_failed','quarantined'
     )
     or not (
       (p_transition = 'rollback_pending'
        and execution_value.state in ('executing','postflight','evaluating'))
       or (p_transition = 'rollback_running'
        and execution_value.state = 'rollback_pending')
       or (p_transition in ('rollback_succeeded','rollback_failed')
        and execution_value.state = 'rollback_running')
       or (p_transition = 'quarantined'
        and execution_value.state in ('executing','postflight','evaluating','rollback_running'))
     )
     or p_evidence_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'two_party_execution_release_rejected'
      using errcode = 'P0001';
  end if;
  next_version_state := case
    when p_transition = 'rollback_succeeded' then 'rolled_back'
    when p_transition in ('rollback_failed','quarantined') then 'failed'
    else null
  end;
  update public.governance_approved_action_executions
  set state = p_transition,
      failure_hash = case when p_transition in ('rollback_failed','quarantined') then p_evidence_hash else failure_hash end,
      updated_at = now_at,
      completed_at = case
        when p_transition in ('rollback_succeeded','rollback_failed','quarantined') then now_at
        else completed_at
      end
  where id = p_execution_id;
  if next_version_state is not null then
    update public.governance_owner_approval_version_states
    set state = next_version_state,
        rolled_back_at = case when next_version_state = 'rolled_back' then now_at else rolled_back_at end,
        updated_at = now_at
    where approval_version_id = execution_value.approval_version_id;
    update public.governance_owner_approval_records
    set current_state = next_version_state,
        updated_at = now_at
    where id = execution_value.approval_record_id;
  end if;
  select public.governance_approval_event_next_sequence(execution_value.approval_record_id)
    into event_sequence_value;
  insert into public.governance_owner_approval_lifecycle_events(
    approval_record_id, approval_version_id, execution_id, task_id, project_id,
    platform, environment, event_sequence, event_type, event_hash,
    actor_identity_hash
  ) values (
    execution_value.approval_record_id, execution_value.approval_version_id,
    execution_value.id, execution_value.task_id, execution_value.project_id,
    execution_value.platform, execution_value.environment, event_sequence_value,
    p_transition, p_evidence_hash,
    encode(extensions.digest(convert_to(service_identity_value,'UTF8'),'sha256'),'hex')
  );
  return jsonb_build_object('executionId', p_execution_id, 'state', p_transition);
end;
$$;
revoke all on function public.governance_release_or_quarantine_execution(uuid,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.governance_release_or_quarantine_execution(uuid,text,text,text,text)
  to service_role;

create function public.governance_execute_approved_switch(
  p_execution_id uuid,
  p_service_identity text,
  p_worker_assertion text,
  p_switch_key text,
  p_enabled boolean,
  p_policy_version text,
  p_target_resource_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  execution_value public.governance_approved_action_executions%rowtype;
  version_value public.governance_owner_approval_versions%rowtype;
  service_identity_value text;
  switch_id uuid;
  now_at timestamptz := transaction_timestamp();
  event_sequence_value integer;
  schedule_count integer;
begin
  select * into execution_value
  from public.governance_approved_action_executions
  where id = p_execution_id
  for update;
  if execution_value.id is null then
    raise exception 'two_party_execution_missing' using errcode = 'P0001';
  end if;
  service_identity_value := public.governance_assert_two_party_service_principal(
    p_service_identity, p_worker_assertion, execution_value.operation
  );
  select * into version_value
  from public.governance_owner_approval_versions
  where id = execution_value.approval_version_id
  for share;
  if execution_value.service_identity <> service_identity_value
     or execution_value.operation <> 'set_switch'
     or execution_value.state <> 'executing'
     or not public.governance_lock_approved_execution_liveness(p_execution_id)
     or version_value.id is null
     or version_value.target_resource_hash <> p_target_resource_hash
     or p_target_resource_hash <> public.governance_switch_target_hash(
       p_switch_key, p_enabled, p_policy_version
     )
     or p_switch_key not in (
       'cognitive_research_enabled',
       'cognitive_memory_enabled',
       'cognitive_collective_deliberation_enabled',
       'cognitive_draft_pr_executor_enabled',
       'cognitive_scheduled_level01_enabled',
       'cognitive_livekit_experience_sentinel_enabled',
       'cognitive_visual_experience_sentinel_enabled',
       'cognitive_installed_journey_sentinel_enabled'
     )
     or length(p_policy_version) not between 1 and 64
     or public.cognitive_text_has_secret(p_policy_version) then
    raise exception 'two_party_switch_execution_rejected'
      using errcode = 'P0001';
  end if;

  if p_enabled
     and p_switch_key in ('cognitive_research_enabled','cognitive_memory_enabled')
     and not exists (
       select 1
       from public.cognitive_retention_policy_states policy
       where policy.task_id = execution_value.task_id
         and policy.project_id = execution_value.project_id
         and policy.platform = execution_value.platform
         and policy.environment = execution_value.environment
         and policy.policy_state = 'owner_counsel_decision_required'
         and not policy.user_derived_memory_allowed
         and not policy.raw_user_reports_allowed
         and not policy.raw_private_messages_allowed
         and not policy.raw_private_media_allowed
         and not policy.raw_user_analytics_allowed
         and not policy.private_model_input_allowed
     ) then
    raise exception 'cognitive_retention_gate_required' using errcode = 'P0001';
  end if;

  if p_enabled and p_switch_key = 'cognitive_collective_deliberation_enabled'
     and (
       select count(distinct run.canary_key)
       from public.cognitive_level01_canary_runs run
       where run.task_id = execution_value.task_id
         and run.project_id = execution_value.project_id
         and run.platform = execution_value.platform
         and run.environment = execution_value.environment
         and run.canary_type = 'research'
         and run.result_status = 'passed'
         and run.evaluator_state = 'pass'
     ) <> 3 then
    raise exception 'cognitive_research_canaries_required' using errcode = 'P0001';
  end if;

  if p_enabled and p_switch_key = 'cognitive_draft_pr_executor_enabled'
     and (
       (
         select count(distinct run.canary_key)
         from public.cognitive_level01_canary_runs run
         where run.task_id = execution_value.task_id
           and run.project_id = execution_value.project_id
           and run.platform = execution_value.platform
           and run.environment = execution_value.environment
           and run.canary_type = 'deliberation'
           and run.result_status = 'passed'
           and run.evaluator_state = 'pass'
       ) <> 3
       or not exists (
         select 1
         from public.cognitive_level01_credential_attestations attestation
         where attestation.task_id = execution_value.task_id
           and attestation.project_id = execution_value.project_id
           and attestation.platform = execution_value.platform
           and attestation.environment = execution_value.environment
           and attestation.credential_kind = 'github_draft_pr'
           and attestation.state = 'configured'
           and attestation.verified_at <= now_at
           and now_at < attestation.expires_at
         order by attestation.verified_at desc
         limit 1
       )
     ) then
    raise exception 'cognitive_draft_pr_canary_prerequisites_required'
      using errcode = 'P0001';
  end if;

  if p_enabled and p_switch_key = 'cognitive_scheduled_level01_enabled'
     and (
       (
         select count(distinct run.canary_key)
         from public.cognitive_level01_canary_runs run
         where run.task_id = execution_value.task_id
           and run.project_id = execution_value.project_id
           and run.platform = execution_value.platform
           and run.environment = execution_value.environment
           and run.canary_type = 'draft_pr'
           and run.result_status = 'passed'
           and run.evaluator_state = 'pass'
       ) <> 3
       or (
         select count(*)
         from public.cognitive_level01_schedule_definitions schedule
         where schedule.task_id = execution_value.task_id
           and schedule.project_id = execution_value.project_id
           and schedule.platform = execution_value.platform
           and schedule.environment = execution_value.environment
       ) <> 5
     ) then
    raise exception 'cognitive_schedule_canaries_required' using errcode = 'P0001';
  end if;

  insert into public.cognitive_governance_switches(
    task_id, project_id, platform, environment, switch_key, enabled,
    policy_version, enabled_by, enabled_at, disabled_at, updated_at
  ) values (
    execution_value.task_id, execution_value.project_id,
    execution_value.platform, execution_value.environment, p_switch_key,
    p_enabled, p_policy_version,
    case when p_enabled then version_value.owner_user_id else null end,
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
  returning id into switch_id;

  if switch_id is null then
    raise exception 'two_party_switch_execution_rejected'
      using errcode = 'P0001';
  end if;

  if p_switch_key = 'cognitive_scheduled_level01_enabled' then
    update public.cognitive_level01_schedule_definitions schedule
    set enabled = p_enabled,
        updated_at = now_at
    where schedule.task_id = execution_value.task_id
      and schedule.project_id = execution_value.project_id
      and schedule.platform = execution_value.platform
      and schedule.environment = execution_value.environment;
    get diagnostics schedule_count = row_count;
    if schedule_count <> 5 then
      raise exception 'cognitive_level01_schedule_scope_rejected'
        using errcode = 'P0001';
    end if;
  end if;

  if not p_enabled and p_switch_key in (
    'cognitive_research_enabled',
    'cognitive_memory_enabled',
    'cognitive_collective_deliberation_enabled',
    'cognitive_draft_pr_executor_enabled'
  ) then
    update public.cognitive_governance_switches switch
    set enabled = false,
        enabled_by = null,
        disabled_at = now_at,
        updated_at = now_at
    where switch.task_id = execution_value.task_id
      and switch.switch_key = any(
        case p_switch_key
          when 'cognitive_research_enabled' then array[
            'cognitive_collective_deliberation_enabled',
            'cognitive_draft_pr_executor_enabled',
            'cognitive_scheduled_level01_enabled'
          ]
          when 'cognitive_memory_enabled' then array[
            'cognitive_collective_deliberation_enabled',
            'cognitive_draft_pr_executor_enabled',
            'cognitive_scheduled_level01_enabled'
          ]
          when 'cognitive_collective_deliberation_enabled' then array[
            'cognitive_draft_pr_executor_enabled',
            'cognitive_scheduled_level01_enabled'
          ]
          else array['cognitive_scheduled_level01_enabled']
        end
      );
    update public.cognitive_level01_schedule_definitions schedule
    set enabled = false,
        updated_at = now_at
    where schedule.task_id = execution_value.task_id
      and schedule.project_id = execution_value.project_id
      and schedule.platform = execution_value.platform
      and schedule.environment = execution_value.environment;
  end if;

  update public.governance_approved_action_executions
  set state = 'postflight', updated_at = now_at
  where id = execution_value.id;

  select public.governance_approval_event_next_sequence(execution_value.approval_record_id)
    into event_sequence_value;
  insert into public.governance_owner_approval_lifecycle_events(
    approval_record_id, approval_version_id, execution_id, task_id, project_id,
    platform, environment, event_sequence, event_type, event_hash,
    actor_identity_hash
  ) values (
    execution_value.approval_record_id, execution_value.approval_version_id,
    execution_value.id, execution_value.task_id, execution_value.project_id,
    execution_value.platform, execution_value.environment, event_sequence_value,
    'postflight', p_target_resource_hash,
    encode(extensions.digest(convert_to(service_identity_value,'UTF8'),'sha256'),'hex')
  );

  return jsonb_build_object(
    'executionId', execution_value.id,
    'switchId', switch_id,
    'switchKey', p_switch_key,
    'enabled', p_enabled,
    'state', 'postflight'
  );
end;
$$;
revoke all on function public.governance_execute_approved_switch(
  uuid,text,text,text,boolean,text,text
) from public, anon, authenticated;
grant execute on function public.governance_execute_approved_switch(
  uuid,text,text,text,boolean,text,text
) to service_role;

create or replace function public.governance_set_level01_switch(
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
begin
  perform public.governance_assert_exact_owner();
  raise exception 'two_party_owner_approval_required' using errcode = 'P0001';
end;
$$;
revoke all on function public.governance_set_level01_switch(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,boolean,text
) from public, anon;
grant execute on function public.governance_set_level01_switch(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,boolean,text
) to authenticated;

create function public.governance_record_model_execution_attestation(
  p_assessment_id text,
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_council_role text,
  p_provider_identity_hash text,
  p_model_family text,
  p_model_version text,
  p_execution_identity_hash text,
  p_evidence_packet_hash text,
  p_prompt_template_version_hash text,
  p_output_hash text,
  p_blind_first_round boolean,
  p_correlation_class text,
  p_cost numeric,
  p_latency_ms integer,
  p_service_identity text,
  p_worker_assertion text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare result_id uuid;
begin
  perform public.governance_assert_two_party_service_principal(
    p_service_identity, p_worker_assertion, 'model_independence_attestation'
  );
  if p_service_identity <> 'model_independence_attestation_service' then
    raise exception 'model_attestation_service_required' using errcode = '42501';
  end if;
  if not public.governance_task_writes_allowed(
    p_task_id, p_project_id, p_platform, p_environment
  ) then
    raise exception 'model_attestation_task_not_live' using errcode = 'P0001';
  end if;
  insert into public.governance_model_execution_attestations(
    assessment_id, task_id, project_id, platform, environment, council_role,
    provider_identity_hash, model_family, model_version, execution_identity_hash,
    evidence_packet_hash, prompt_template_version_hash, output_hash,
    blind_first_round, correlation_class, cost, latency_ms
  ) values (
    p_assessment_id, p_task_id, p_project_id, p_platform, p_environment,
    p_council_role, p_provider_identity_hash, p_model_family, p_model_version,
    p_execution_identity_hash, p_evidence_packet_hash,
    p_prompt_template_version_hash, p_output_hash, p_blind_first_round,
    p_correlation_class, p_cost, p_latency_ms
  ) returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.governance_record_model_execution_attestation(
  text,uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,boolean,text,numeric,integer,text,text
) from public, anon, authenticated;
grant execute on function public.governance_record_model_execution_attestation(
  text,uuid,uuid,public.cognitive_platform,public.cognitive_environment,
  text,text,text,text,text,text,text,text,boolean,text,numeric,integer,text,text
) to service_role;

create function public.governance_model_independence_status_internal(
  p_task_id uuid,
  p_assessment_id text,
  p_required_count integer
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with rows as (
    select *
    from public.governance_model_execution_attestations
    where task_id = p_task_id
      and assessment_id = p_assessment_id
  ),
  aggregate as (
    select
      count(*)::integer as total_count,
      count(distinct execution_identity_hash)::integer as distinct_executions,
        count(distinct output_hash)::integer as distinct_outputs,
        count(*) filter (where blind_first_round)::integer as blind_count,
        count(distinct council_role)::integer as distinct_roles,
        count(distinct provider_identity_hash)::integer as provider_count,
        count(distinct model_family)::integer as model_family_count,
        count(distinct model_family || ':' || model_version)::integer as model_version_count,
        coalesce(bool_or(correlation_class = 'cross_provider'), false) as has_cross_provider_class
    from rows
  ),
  status as (
    select *,
      total_count >= p_required_count
        and distinct_executions >= p_required_count
        and distinct_outputs >= p_required_count
        and blind_count >= p_required_count
        and distinct_roles >= p_required_count
        and provider_count >= 2
        and model_family_count >= 2
        and model_version_count >= p_required_count
        and has_cross_provider_class as independence_satisfied
    from aggregate
  )
  select jsonb_build_object(
    'assessmentId', p_assessment_id,
    'requiredCount', p_required_count,
    'totalCount', total_count,
    'distinctExecutions', distinct_executions,
      'distinctOutputs', distinct_outputs,
      'blindFirstRoundCount', blind_count,
      'distinctCouncilRoles', distinct_roles,
      'providerCount', provider_count,
    'modelFamilyCount', model_family_count,
    'modelVersionCount', model_version_count,
    'independenceSatisfied', independence_satisfied,
    'status',
      case
        when independence_satisfied
        then 'MODEL_INDEPENDENCE_VERIFIED'
        else 'MODEL_INDEPENDENCE_PROVIDER_REQUIRED'
      end
  )
  from status;
$$;
revoke all on function public.governance_model_independence_status_internal(uuid,text,integer)
  from public, anon, authenticated, service_role;

create function public.governance_model_independence_status(
  p_task_id uuid,
  p_assessment_id text,
  p_required_count integer default 3
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    claims->>'role'
  );
  task_value public.intelligence_tasks%rowtype;
begin
  select * into task_value
  from public.intelligence_tasks
  where id = p_task_id;
  if task_value.id is null
     or (
       request_role <> 'service_role'
       and not public.cognitive_can_read_scope(
         task_value.project_id, task_value.id, task_value.platform
       )
     ) then
    raise exception 'model_independence_status_scope_denied'
      using errcode = '42501';
  end if;
  return public.governance_model_independence_status_internal(
    p_task_id, p_assessment_id, p_required_count
  );
end;
$$;
revoke all on function public.governance_model_independence_status(uuid,text,integer)
  from public, anon;
grant execute on function public.governance_model_independence_status(uuid,text,integer)
  to authenticated, service_role;

create function public.governance_enforce_decision_model_independence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  required_count integer;
  assessment_id_value text;
  status_value jsonb;
begin
  if new.status <> 'finalized' then
    return new;
  end if;

  select deliberation.required_quorum
    into required_count
  from public.governance_deliberations deliberation
  where deliberation.id = new.deliberation_id
    and deliberation.task_id = new.task_id
    and deliberation.project_id = new.project_id
    and deliberation.platform = new.platform
    and deliberation.environment = new.environment;

  assessment_id_value := coalesce(
    new.model_independence_assessment_id,
    'deliberation-' || encode(extensions.digest(
      convert_to(new.deliberation_id::text, 'UTF8'), 'sha256'
    ), 'hex')
  );
  status_value := public.governance_model_independence_status_internal(
    new.task_id, assessment_id_value, coalesce(required_count, 3)
  );

  if required_count is null
     or status_value->>'status' <> 'MODEL_INDEPENDENCE_VERIFIED' then
    raise exception 'governance_model_independence_required'
      using errcode = 'P0001';
  end if;

  new.model_independence_assessment_id := assessment_id_value;
  new.model_independence_status := status_value->>'status';
  new.model_independence_evidence_hash := encode(extensions.digest(convert_to(
    concat_ws('|', new.id::text, new.decision_hash, assessment_id_value, status_value::text),
    'UTF8'
  ), 'sha256'), 'hex');
  return new;
end;
$$;
revoke all on function public.governance_enforce_decision_model_independence()
  from public, anon, authenticated, service_role;

drop trigger if exists governance_decision_model_independence_before_insert
  on public.governance_decision_manifests;
create trigger governance_decision_model_independence_before_insert
  before insert on public.governance_decision_manifests
  for each row execute function public.governance_enforce_decision_model_independence();

create function public.product_experience_record_sentinel_run(
  p_task_id uuid,
  p_project_id uuid,
  p_platform public.cognitive_platform,
  p_environment public.cognitive_environment,
  p_sentinel_key text,
  p_route_or_surface text,
  p_runtime_identity_hash text,
  p_evidence_manifest_hash text,
  p_metric_manifest jsonb,
  p_result_status text,
  p_physical_proof_status text,
  p_service_identity text,
  p_worker_assertion text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare result_id uuid;
declare expected_operation text;
begin
  expected_operation := case p_sentinel_key
    when 'livekit_experience_sentinel' then 'livekit_experience_canary'
    when 'visual_product_experience_sentinel' then 'visual_experience_canary'
    when 'installed_journey_sentinel' then 'installed_journey_canary'
    else null
  end;
  perform public.governance_assert_two_party_service_principal(
    p_service_identity, p_worker_assertion, expected_operation
  );
  if expected_operation is null
     or p_service_identity <> p_sentinel_key
     or not public.governance_task_writes_allowed(
       p_task_id, p_project_id, p_platform, p_environment
     )
     or p_result_status not in ('passed','finding_created','blocked','failed')
     or p_physical_proof_status not in (
       'installed_ui_observed','simulator_observed','source_only',
       'provider_blocked','device_unavailable','new_binary_or_ota_required'
     )
     or (
       p_result_status in ('passed','finding_created')
       and p_physical_proof_status not in ('installed_ui_observed','simulator_observed')
     )
     or (
       p_sentinel_key = 'livekit_experience_sentinel'
       and (
           not p_metric_manifest ?& array[
             'tokenRequested','tokenReturned','websocketConnected','iceState',
             'roomConnected','localTrackPublished','remoteParticipantJoined',
             'remoteTrackSubscribed','firstAudioVideoObserved','connectingResolved',
             'tokenIssuedElapsedMs','roomConnectElapsedMs',
             'uiStateResolutionElapsedMs','firstRemoteMediaElapsedMs'
           ]
           or jsonb_typeof(p_metric_manifest->'tokenRequested') <> 'boolean'
           or jsonb_typeof(p_metric_manifest->'tokenReturned') <> 'boolean'
           or jsonb_typeof(p_metric_manifest->'websocketConnected') <> 'boolean'
           or jsonb_typeof(p_metric_manifest->'roomConnected') <> 'boolean'
           or jsonb_typeof(p_metric_manifest->'localTrackPublished') <> 'boolean'
           or jsonb_typeof(p_metric_manifest->'remoteParticipantJoined') <> 'boolean'
           or jsonb_typeof(p_metric_manifest->'remoteTrackSubscribed') <> 'boolean'
           or jsonb_typeof(p_metric_manifest->'firstAudioVideoObserved') <> 'boolean'
           or jsonb_typeof(p_metric_manifest->'connectingResolved') <> 'boolean'
           or jsonb_typeof(p_metric_manifest->'iceState') <> 'string'
           or (p_metric_manifest->>'iceState') not in (
             'new','checking','connected','completed','failed',
             'disconnected','closed','unknown'
           )
           or jsonb_typeof(p_metric_manifest->'tokenIssuedElapsedMs') <> 'number'
           or jsonb_typeof(p_metric_manifest->'roomConnectElapsedMs') <> 'number'
           or jsonb_typeof(p_metric_manifest->'uiStateResolutionElapsedMs') <> 'number'
           or jsonb_typeof(p_metric_manifest->'firstRemoteMediaElapsedMs') <> 'number'
           or (p_metric_manifest->>'tokenIssuedElapsedMs')::numeric not between 0 and 600000
           or (p_metric_manifest->>'roomConnectElapsedMs')::numeric not between 0 and 600000
           or (p_metric_manifest->>'uiStateResolutionElapsedMs')::numeric not between 0 and 600000
           or (p_metric_manifest->>'firstRemoteMediaElapsedMs')::numeric not between 0 and 600000
           or (
             p_result_status = 'passed'
             and not (
               p_metric_manifest->'tokenReturned' = 'true'::jsonb
             and p_metric_manifest->'websocketConnected' = 'true'::jsonb
             and p_metric_manifest->'roomConnected' = 'true'::jsonb
             and p_metric_manifest->'localTrackPublished' = 'true'::jsonb
               and p_metric_manifest->'remoteParticipantJoined' = 'true'::jsonb
               and p_metric_manifest->'remoteTrackSubscribed' = 'true'::jsonb
               and p_metric_manifest->'firstAudioVideoObserved' = 'true'::jsonb
               and p_metric_manifest->'connectingResolved' = 'true'::jsonb
               and (p_metric_manifest->>'tokenIssuedElapsedMs')::numeric between 0 and 3000
               and (p_metric_manifest->>'roomConnectElapsedMs')::numeric between 0 and 12000
               and (p_metric_manifest->>'uiStateResolutionElapsedMs')::numeric between 0 and 15000
               and (p_metric_manifest->>'firstRemoteMediaElapsedMs')::numeric between 0 and 20000
             )
           )
         )
     )
       or (
         p_sentinel_key = 'visual_product_experience_sentinel'
         and (
           not p_metric_manifest ?& array[
             'screenshotEvidenceHash','cardViewportWidthRatio',
             'cardsVisibleAboveFold','aspectRatio','densityScore',
             'baselineState','baselineComparisonHash'
           ]
           or jsonb_typeof(p_metric_manifest->'screenshotEvidenceHash') <> 'string'
           or (p_metric_manifest->>'screenshotEvidenceHash') !~ '^[a-f0-9]{64}$'
           or jsonb_typeof(p_metric_manifest->'baselineComparisonHash') <> 'string'
           or (p_metric_manifest->>'baselineComparisonHash') !~ '^[a-f0-9]{64}$'
           or jsonb_typeof(p_metric_manifest->'cardViewportWidthRatio') <> 'number'
           or (p_metric_manifest->>'cardViewportWidthRatio')::numeric not between 0 and 2
           or jsonb_typeof(p_metric_manifest->'cardsVisibleAboveFold') <> 'number'
           or (p_metric_manifest->>'cardsVisibleAboveFold')::numeric not between 0 and 100
           or jsonb_typeof(p_metric_manifest->'aspectRatio') <> 'string'
           or (p_metric_manifest->>'aspectRatio') not in ('16:9','4:5','1:1','mixed','unknown')
           or jsonb_typeof(p_metric_manifest->'densityScore') <> 'number'
           or (p_metric_manifest->>'densityScore')::numeric not between 0 and 1
           or jsonb_typeof(p_metric_manifest->'baselineState') <> 'string'
           or (p_metric_manifest->>'baselineState') not in (
             'needs_product_baseline_review','approved_baseline'
           )
           or (
             p_result_status = 'passed'
             and (p_metric_manifest->>'baselineState') <> 'approved_baseline'
           )
         )
       )
     or (
       p_sentinel_key = 'installed_journey_sentinel'
       and not p_metric_manifest ?& array[
         'journeyStepCount','unresolvedStateCount',
         'expectedState','observedState','maxDurationMs','elapsedDurationMs',
         'resultState','screenshotEvidenceHash','sourceRuntimeHash'
       ]
     )
     or (
       p_sentinel_key = 'installed_journey_sentinel'
       and (
         jsonb_typeof(p_metric_manifest->'journeyStepCount') <> 'number'
         or jsonb_typeof(p_metric_manifest->'unresolvedStateCount') <> 'number'
         or jsonb_typeof(p_metric_manifest->'maxDurationMs') <> 'number'
         or jsonb_typeof(p_metric_manifest->'elapsedDurationMs') <> 'number'
         or jsonb_typeof(p_metric_manifest->'expectedState') <> 'string'
         or jsonb_typeof(p_metric_manifest->'observedState') <> 'string'
         or jsonb_typeof(p_metric_manifest->'resultState') <> 'string'
         or jsonb_typeof(p_metric_manifest->'screenshotEvidenceHash') <> 'string'
         or (p_metric_manifest->>'screenshotEvidenceHash') !~ '^[a-f0-9]{64}$'
         or jsonb_typeof(p_metric_manifest->'sourceRuntimeHash') <> 'string'
         or (p_metric_manifest->>'sourceRuntimeHash') !~ '^[a-f0-9]{64}$'
         or (p_metric_manifest->>'expectedState') not in (
           'signed_out','signed_in','session_restored','home_feed_visible',
           'explore_visible','search_visible','library_visible','profile_visible',
           'settings_visible','content_player_visible','public_profile_visible',
           'chat_visible','live_surface_visible','watch_party_visible','loading',
           'empty','error','offline','permission_denied','blank','crashed',
           'no_state_change','route_unavailable','unknown_blocked'
         )
         or (p_metric_manifest->>'observedState') not in (
           'signed_out','signed_in','session_restored','home_feed_visible',
           'explore_visible','search_visible','library_visible','profile_visible',
           'settings_visible','content_player_visible','public_profile_visible',
           'chat_visible','live_surface_visible','watch_party_visible','loading',
           'empty','error','offline','permission_denied','blank','crashed',
           'no_state_change','route_unavailable','unknown_blocked'
         )
         or (p_metric_manifest->>'resultState') not in (
           'success','loading','error','blocked','offline',
           'permission_denied','blank','crashed'
         )
         or (p_metric_manifest->>'journeyStepCount')::integer not between 1 and 256
         or (p_metric_manifest->>'unresolvedStateCount')::integer not between 0 and 256
         or (p_metric_manifest->>'unresolvedStateCount')::integer >
            (p_metric_manifest->>'journeyStepCount')::integer
         or (p_metric_manifest->>'maxDurationMs')::integer not between 1 and 10000
         or (p_metric_manifest->>'elapsedDurationMs')::integer not between 0 and 600000
         or (
           p_result_status = 'passed'
           and (
             (p_metric_manifest->>'resultState') <> 'success'
             or (p_metric_manifest->>'unresolvedStateCount')::integer <> 0
             or (p_metric_manifest->>'elapsedDurationMs')::integer >
                (p_metric_manifest->>'maxDurationMs')::integer
           )
         )
       )
     )
     or not exists (
       select 1 from public.cognitive_governance_switches switch
       where switch.task_id=p_task_id
         and switch.project_id=p_project_id
         and switch.platform=p_platform
         and switch.environment=p_environment
         and switch.enabled
         and switch.switch_key = case p_sentinel_key
           when 'livekit_experience_sentinel' then 'cognitive_livekit_experience_sentinel_enabled'
           when 'visual_product_experience_sentinel' then 'cognitive_visual_experience_sentinel_enabled'
           when 'installed_journey_sentinel' then 'cognitive_installed_journey_sentinel_enabled'
         end
     ) then
    raise exception 'product_experience_sentinel_run_rejected'
      using errcode = 'P0001';
  end if;
  insert into public.product_experience_sentinel_runs(
    task_id, project_id, platform, environment, sentinel_key,
    route_or_surface, runtime_identity_hash, evidence_manifest_hash,
    metric_manifest, result_status, physical_proof_status
  ) values (
    p_task_id, p_project_id, p_platform, p_environment, p_sentinel_key,
    p_route_or_surface, p_runtime_identity_hash, p_evidence_manifest_hash,
    p_metric_manifest, p_result_status, p_physical_proof_status
  ) returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.product_experience_record_sentinel_run(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text,
  text,text,jsonb,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.product_experience_record_sentinel_run(
  uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text,
  text,text,jsonb,text,text,text,text
) to service_role;

create function public.product_quality_record_finding(
  p_sentinel_run_id uuid,
  p_finding_key text,
  p_route_or_surface text,
  p_build_runtime_hash text,
  p_severity text,
  p_user_impact_hash text,
  p_evidence_hashes text[],
  p_suspected_layer text,
  p_confidence numeric,
  p_reproduction_state text,
  p_affected_components_hash text,
  p_provider_backend_state_hash text,
  p_proposed_next_investigation_hash text,
  p_physical_proof_status text,
  p_service_identity text,
  p_worker_assertion text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare run_value public.product_experience_sentinel_runs%rowtype;
declare result_id uuid;
begin
  perform public.governance_assert_two_party_service_principal(
    p_service_identity, p_worker_assertion, 'product_quality_triage'
  );
  if p_service_identity <> 'product_quality_triage_router' then
    raise exception 'product_quality_triage_service_required'
      using errcode = '42501';
  end if;
  select * into run_value
  from public.product_experience_sentinel_runs
  where id = p_sentinel_run_id
  for share;
  if run_value.id is null
     or not public.governance_task_writes_allowed(
       run_value.task_id, run_value.project_id,
       run_value.platform, run_value.environment
     )
     or p_route_or_surface <> run_value.route_or_surface
     or p_physical_proof_status <> run_value.physical_proof_status
     or p_evidence_hashes is null
     or not public.governance_hash_array_valid(p_evidence_hashes, 1, 64)
     or not run_value.evidence_manifest_hash = any(p_evidence_hashes)
     or run_value.result_status not in ('finding_created','failed')
     or (
       p_reproduction_state in ('confirmed_defect','likely_defect')
       and (
         p_physical_proof_status not in ('installed_ui_observed','simulator_observed')
       )
     )
     or (
       p_reproduction_state = 'design_baseline_missing'
       and (
         run_value.sentinel_key <> 'visual_product_experience_sentinel'
         or p_physical_proof_status not in ('installed_ui_observed','simulator_observed')
       )
     )
     or (
       p_reproduction_state = 'provider_blocked'
       and p_physical_proof_status <> 'provider_blocked'
     )
     or (
       p_reproduction_state = 'device_unavailable'
       and p_physical_proof_status <> 'device_unavailable'
     ) then
    raise exception 'product_quality_finding_rejected' using errcode = 'P0001';
  end if;
  insert into public.product_quality_findings(
    sentinel_run_id, task_id, project_id, platform, environment, finding_key,
    route_or_surface, build_runtime_hash, severity, user_impact_hash,
    evidence_hashes, suspected_layer, confidence, reproduction_state,
    affected_components_hash, provider_backend_state_hash,
    proposed_next_investigation_hash, physical_proof_status,
    governance_status
  ) values (
    run_value.id, run_value.task_id, run_value.project_id, run_value.platform,
    run_value.environment, p_finding_key, p_route_or_surface,
    p_build_runtime_hash, p_severity, p_user_impact_hash, p_evidence_hashes,
    p_suspected_layer, p_confidence, p_reproduction_state,
    p_affected_components_hash, p_provider_backend_state_hash,
    p_proposed_next_investigation_hash, p_physical_proof_status,
    case
      when p_reproduction_state = 'design_baseline_missing'
        then 'needs_product_baseline_review'
      else 'entered_collective_governance'
    end
  ) returning id into result_id;
  return result_id;
end;
$$;
revoke all on function public.product_quality_record_finding(
  uuid,text,text,text,text,text,text[],text,numeric,text,text,text,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.product_quality_record_finding(
  uuid,text,text,text,text,text,text[],text,numeric,text,text,text,text,text,text,text
) to service_role;

create function public.product_experience_erase_expired_evidence(
  p_target_table text,
  p_target_id uuid,
  p_tombstone_hash text,
  p_service_identity text,
  p_worker_assertion text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_value public.product_experience_sentinel_runs%rowtype;
  finding_value public.product_quality_findings%rowtype;
  now_at timestamptz := transaction_timestamp();
begin
  perform public.governance_assert_two_party_service_principal(
    p_service_identity, p_worker_assertion, 'product_quality_triage'
  );
  if p_service_identity <> 'product_quality_triage_router'
     or p_target_table not in (
       'product_experience_sentinel_runs',
       'product_quality_findings'
     )
     or p_tombstone_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'product_experience_retention_tombstone_rejected'
      using errcode = 'P0001';
  end if;

  if p_target_table = 'product_experience_sentinel_runs' then
    select * into run_value
    from public.product_experience_sentinel_runs
    where id = p_target_id
    for update;
    if run_value.id is null
       or run_value.legal_hold
       or run_value.erased_at is not null
       or now_at < run_value.retention_until then
      raise exception 'product_experience_retention_tombstone_rejected'
        using errcode = 'P0001';
    end if;
    update public.product_experience_sentinel_runs
    set erased_at = now_at
    where id = run_value.id;
    insert into public.cognitive_erasure_events(
      task_id, project_id, platform, environment, target_table, target_id,
      prior_data_class, tombstone_hash, legal_hold, erased_at, actor_identity
    ) values (
      run_value.task_id, run_value.project_id, run_value.platform,
      run_value.environment, p_target_table, run_value.id,
      run_value.data_class, p_tombstone_hash, false, now_at,
      p_service_identity
    );
    return run_value.id;
  end if;

  select * into finding_value
  from public.product_quality_findings
  where id = p_target_id
  for update;
  if finding_value.id is null
     or finding_value.legal_hold
     or finding_value.erased_at is not null
     or now_at < finding_value.retention_until then
    raise exception 'product_experience_retention_tombstone_rejected'
      using errcode = 'P0001';
  end if;
  update public.product_quality_findings
  set erased_at = now_at
  where id = finding_value.id;
  insert into public.cognitive_erasure_events(
    task_id, project_id, platform, environment, target_table, target_id,
    prior_data_class, tombstone_hash, legal_hold, erased_at, actor_identity
  ) values (
    finding_value.task_id, finding_value.project_id, finding_value.platform,
    finding_value.environment, p_target_table, finding_value.id,
    finding_value.data_class, p_tombstone_hash, false, now_at,
    p_service_identity
  );
  return finding_value.id;
end;
$$;
revoke all on function public.product_experience_erase_expired_evidence(
  text,uuid,text,text,text
) from public, anon, authenticated;
grant execute on function public.product_experience_erase_expired_evidence(
  text,uuid,text,text,text
) to service_role;

comment on table public.governance_owner_approval_versions is
  'Immutable Owner approval versions recorded by an authenticated exact Owner. Service workers can only claim existing active versions through service-only RPCs.';
comment on table public.governance_approved_action_executions is
  'Service-principal execution lifecycle for exactly approved actions. Contains sanitized hashes and state only; no credentials or raw private evidence.';
comment on table public.product_quality_findings is
  'Bounded proactive product-experience findings from Level 0/1 sentinels. Findings enter governance and never mutate production directly.';
