-- Provider-independent authenticated Owner selection for the immutable
-- Product Experience Baseline v1.
--
-- This is deliberately not a model-independence attestation and does not
-- weaken the generic collective-governance approval path. It records one
-- exact Owner selection, binds it to independently reviewed source and tests,
-- and still requires the separate product-quality evaluator before the
-- baseline executor can complete or persist anything.

alter table public.governance_decision_manifests
  drop constraint if exists
    governance_decision_manifests_model_independence_status_check;
alter table public.governance_decision_manifests
  add constraint governance_decision_manifests_model_independence_status_check
  check (
    model_independence_status is null
    or model_independence_status in (
      'MODEL_INDEPENDENCE_VERIFIED',
      'MODEL_INDEPENDENCE_PROVIDER_REQUIRED',
      'PROVIDER_INDEPENDENT_OWNER_SELECTION_REVIEWED'
    )
  );

create table public.product_experience_baseline_owner_decisions (
  id uuid primary key default gen_random_uuid(),
  decision_manifest_id uuid not null unique,
  deliberation_id uuid not null,
  evidence_packet_id uuid not null,
  selected_proposal_id uuid not null,
  task_id uuid not null,
  project_id uuid not null,
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  owner_user_id uuid not null,
  owner_identity_hash text not null check (
    owner_identity_hash ~ '^[a-f0-9]{64}$'
  ),
  repository_full_name text not null check (
    repository_full_name = 'Chillywood2025/chillywood-mobile'
  ),
  branch_name text not null check (
    branch_name =
      'codex/cognitive-level01-staged-worker-activation'
  ),
  source_commit text not null check (source_commit ~ '^[a-f0-9]{40}$'),
  source_tree text not null check (source_tree ~ '^[a-f0-9]{40}$'),
  source_module_graph_hash text not null check (
    source_module_graph_hash =
      '0d377e19a200e0c970bef32ca141a588a7f4097d2c21ac69951ea19356edcb87'
  ),
  independent_review_hash text not null check (
    independent_review_hash ~ '^[a-f0-9]{64}$'
  ),
  tests_hash text not null check (tests_hash ~ '^[a-f0-9]{64}$'),
  required_test_ids text[] not null check (
    required_test_ids = array[
      'cognitive-staged-activation-ci-13-of-13',
      'cognitive-staged-activation-pgtap-full',
      'cognitive-staged-activation-p0-p1-zero',
      'cognitive-product-baseline-owner-executor-evaluator'
    ]::text[]
  ),
  baseline_identifier text not null check (
    baseline_identifier = 'chillywood-product-experience-baseline-v1'
  ),
  selected_option_code text not null check (selected_option_code = 'C'),
  selected_option_name text not null check (
    selected_option_name = 'creator_balanced'
  ),
  baseline_hash text not null check (
    baseline_hash =
      '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'
  ),
  source_options_manifest_hash text not null check (
    source_options_manifest_hash =
      '7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df'
  ),
  evidence_manifest_hash text not null check (
    evidence_manifest_hash ~ '^[a-f0-9]{64}$'
  ),
  capability_scope_hash text not null check (
    capability_scope_hash ~ '^[a-f0-9]{64}$'
  ),
  budget_hash text not null check (budget_hash ~ '^[a-f0-9]{64}$'),
  evaluator_requirement_hash text not null check (
    evaluator_requirement_hash ~ '^[a-f0-9]{64}$'
  ),
  rollback_hash text not null check (rollback_hash ~ '^[a-f0-9]{64}$'),
  decision_hash text not null unique check (
    decision_hash ~ '^[a-f0-9]{64}$'
  ),
  expires_at timestamptz not null,
  created_at timestamptz not null default transaction_timestamp(),
  unique (task_id, baseline_identifier),
  unique (id, task_id, project_id, platform, environment),
  foreign key (
    deliberation_id, task_id, project_id, platform, environment
  ) references public.governance_deliberations(
    id, task_id, project_id, platform, environment
  ),
  foreign key (
    evidence_packet_id, task_id, project_id, platform, environment
  ) references public.governance_evidence_packets(
    id, task_id, project_id, platform, environment
  ),
  foreign key (
    selected_proposal_id, task_id, project_id, platform, environment
  ) references public.governance_proposals(
    id, task_id, project_id, platform, environment
  ),
  foreign key (
    decision_manifest_id, task_id, project_id, platform, environment
  ) references public.governance_decision_manifests(
    id, task_id, project_id, platform, environment
  ) deferrable initially deferred,
  check (
    platform = 'shared'
    and environment = 'production'
    and expires_at > created_at
    and expires_at <= created_at + interval '24 hours'
  )
);

alter table public.product_experience_baseline_owner_decisions
  enable row level security;
alter table public.product_experience_baseline_owner_decisions
  force row level security;
revoke all on table public.product_experience_baseline_owner_decisions
  from public, anon, authenticated, service_role;
create trigger product_experience_baseline_owner_decisions_immutable
before update or delete
  on public.product_experience_baseline_owner_decisions
for each row execute function public.reject_cognitive_evidence_mutation();

create or replace function public.governance_enforce_decision_model_independence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  required_count integer;
  assessment_id_value text;
  status_value jsonb;
  advisory_value public.cognitive_model_advisory_owner_decisions%rowtype;
  baseline_value
    public.product_experience_baseline_owner_decisions%rowtype;
begin
  if new.status <> 'finalized' then
    return new;
  end if;

  select * into baseline_value
  from public.product_experience_baseline_owner_decisions baseline
  where baseline.decision_manifest_id = new.id
    and baseline.deliberation_id = new.deliberation_id
    and baseline.evidence_packet_id = new.evidence_packet_id
    and baseline.selected_proposal_id = new.selected_proposal_id
    and baseline.task_id = new.task_id
    and baseline.project_id = new.project_id
    and baseline.platform = new.platform
    and baseline.environment = new.environment
  for share;

  if baseline_value.id is not null then
    if auth.uid() is null
       or auth.uid() <> baseline_value.owner_user_id
       or not public.governance_exact_owner(auth.uid())
       or transaction_timestamp() >= baseline_value.expires_at
       or new.decision_key <>
          'product-experience-baseline-v1-owner-selection'
       or new.source_commit <> baseline_value.source_commit
       or new.architecture_graph_digest <>
          baseline_value.source_module_graph_hash
       or new.evidence_manifest_hash <>
          baseline_value.evidence_manifest_hash
       or new.selected_option_hash <> baseline_value.baseline_hash
       or new.rejected_option_hashes <> array[
         '29b2c09ded4add3fba577e1195d3da20d0e1015ba81e88f73b1319593f0c27c9',
         '9e891de1b46cd19405b43178dbd34ed0ea1d96b4eebcc7b404f4f3d9f6ba3dc5'
       ]::text[]
       or new.council_attestation_hash <>
          baseline_value.independent_review_hash
       or new.required_test_ids <> baseline_value.required_test_ids
       or new.capability_scope_hash <>
          baseline_value.capability_scope_hash
       or new.budget_hash <> baseline_value.budget_hash
       or new.maximum_executions <> 1
       or new.rollback_hash <> baseline_value.rollback_hash
       or new.external_confirmation_required
       or new.decision_hash <> baseline_value.decision_hash
       or new.model_independence_assessment_id is not null
       or new.model_independence_status is not null
       or new.model_independence_evidence_hash is not null then
      raise exception
        'product_experience_baseline_owner_decision_rejected'
        using errcode = 'P0001';
    end if;

    new.model_independence_assessment_id :=
      'product-baseline-owner-selection-v1';
    new.model_independence_status :=
      'PROVIDER_INDEPENDENT_OWNER_SELECTION_REVIEWED';
    new.model_independence_evidence_hash :=
      baseline_value.independent_review_hash;
    return new;
  end if;

  select * into advisory_value
  from public.cognitive_model_advisory_owner_decisions advisory
  where advisory.decision_manifest_id = new.id
    and advisory.deliberation_id = new.deliberation_id
    and advisory.evidence_packet_id = new.evidence_packet_id
    and advisory.selected_proposal_id = new.selected_proposal_id
    and advisory.task_id = new.task_id
    and advisory.project_id = new.project_id
    and advisory.platform = new.platform
    and advisory.environment = new.environment
  for share;

  if advisory_value.id is not null then
    if auth.uid() is null
       or auth.uid() <> advisory_value.owner_user_id
       or not public.governance_exact_owner(auth.uid())
       or transaction_timestamp() >= advisory_value.expires_at
       or advisory_value.authority <> 'advisory_only'
       or advisory_value.quorum_eligible
       or not advisory_value.evaluator_required
       or new.source_commit <> advisory_value.source_commit
       or new.architecture_graph_digest <>
          advisory_value.architecture_graph_digest
       or new.evidence_manifest_hash <>
          advisory_value.evidence_manifest_hash
       or new.capability_scope_hash <>
          advisory_value.capability_scope_hash
       or new.budget_hash <> advisory_value.budget_hash
       or new.required_test_ids <> advisory_value.required_test_ids
       or new.rollback_hash <> advisory_value.rollback_hash
       or new.maximum_executions <> 1
       or new.decision_hash <> advisory_value.decision_hash
       or new.model_independence_assessment_id is not null
       or new.model_independence_status is not null
       or new.model_independence_evidence_hash is not null then
      raise exception 'model_advisory_owner_decision_rejected'
        using errcode = 'P0001';
    end if;
    new.model_independence_assessment_id := null;
    new.model_independence_status :=
      'MODEL_INDEPENDENCE_PROVIDER_REQUIRED';
    new.model_independence_evidence_hash :=
      advisory_value.provider_required_evidence_hash;
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
  new.model_independence_evidence_hash :=
    encode(extensions.digest(convert_to(concat_ws(
      '|', new.id::text, new.decision_hash, assessment_id_value,
      status_value::text
    ), 'UTF8'), 'sha256'), 'hex');
  return new;
end;
$$;
revoke all on function
  public.governance_enforce_decision_model_independence()
  from public, anon, authenticated, service_role;

create function
  public.governance_prepare_product_baseline_v1_owner_selection(
    p_task_id uuid,
    p_project_id uuid,
    p_source_commit text,
    p_source_tree text,
    p_source_module_graph_hash text,
    p_independent_review_hash text,
    p_tests_hash text,
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
  task_value public.intelligence_tasks%rowtype;
  constitution_version_id_value uuid;
  deliberation_id_value uuid := gen_random_uuid();
  evidence_packet_id_value uuid := gen_random_uuid();
  selected_proposal_id_value uuid := gen_random_uuid();
  rejected_a_proposal_id_value uuid := gen_random_uuid();
  rejected_b_proposal_id_value uuid := gen_random_uuid();
  decision_id_value uuid := gen_random_uuid();
  owner_hash_value text;
  evidence_manifest_hash_value text;
  provider_state_hash_value text;
  capability_scope_hash_value text;
  budget_hash_value text;
  evaluator_requirement_hash_value text;
  decision_hash_value text;
  expires_at_value timestamptz;
  required_test_ids_value constant text[] := array[
    'cognitive-staged-activation-ci-13-of-13',
    'cognitive-staged-activation-pgtap-full',
    'cognitive-staged-activation-p0-p1-zero',
    'cognitive-product-baseline-owner-executor-evaluator'
  ]::text[];
  now_at timestamptz := transaction_timestamp();
begin
  select * into task_value
  from public.intelligence_tasks task
  where task.id = p_task_id
    and task.project_id = p_project_id
    and task.task_key = 'cognitive-level01-canary-control'
    and task.platform = 'shared'
    and task.environment = 'production'
    and task.repository_full_name =
      'Chillywood2025/chillywood-mobile'
  for share;

  if task_value.id is not null then
    select version.id into constitution_version_id_value
    from public.governance_constitutions constitution
    join public.governance_constitution_versions version
      on version.constitution_id = constitution.id
     and version.task_id = constitution.task_id
     and version.project_id = constitution.project_id
     and version.platform = constitution.platform
     and version.environment = constitution.environment
     and version.version_number = constitution.current_version
    where constitution.task_id = task_value.id
      and constitution.project_id = task_value.project_id
      and constitution.platform = task_value.platform
      and constitution.environment = task_value.environment
      and constitution.constitution_key = 'collective-governance-v1'
    order by version.created_at, version.id
    limit 1
    for share;
  end if;

  if task_value.id is null
     or constitution_version_id_value is null
     or task_value.cancelled_at is not null
     or task_value.quarantined_at is not null
     or now_at >= task_value.deadman_at
     or p_source_commit !~ '^[a-f0-9]{40}$'
     or p_source_tree !~ '^[a-f0-9]{40}$'
     or p_source_module_graph_hash <>
        '0d377e19a200e0c970bef32ca141a588a7f4097d2c21ac69951ea19356edcb87'
     or p_independent_review_hash !~ '^[a-f0-9]{64}$'
     or p_tests_hash !~ '^[a-f0-9]{64}$'
     or p_rollback_hash !~ '^[a-f0-9]{64}$'
     or p_validity <= interval '0 seconds'
     or p_validity > interval '24 hours'
     or not public.governance_approval_emergency_active()
     or exists (
       select 1
       from public.cognitive_governance_switches switch
       where switch.task_id = task_value.id
         and switch.project_id = task_value.project_id
         and switch.platform = task_value.platform
         and switch.environment = task_value.environment
         and switch.enabled
     )
     or exists (
       select 1
       from public.product_experience_baseline_owner_decisions baseline
       where baseline.task_id = task_value.id
         and baseline.baseline_identifier =
           'chillywood-product-experience-baseline-v1'
     ) then
    raise exception
      'product_experience_baseline_owner_selection_rejected'
      using errcode = 'P0001';
  end if;

  expires_at_value := least(now_at + p_validity, task_value.deadman_at);
  if expires_at_value <= now_at then
    raise exception
      'product_experience_baseline_owner_selection_rejected'
      using errcode = 'P0001';
  end if;

  owner_hash_value := encode(extensions.digest(
    convert_to(owner_id::text, 'UTF8'), 'sha256'
  ), 'hex');
  evidence_manifest_hash_value := encode(extensions.digest(convert_to(
    concat_ws(
      '|', 'product-baseline-v1-reviewed-source-evidence',
      p_source_commit, p_source_tree, p_source_module_graph_hash,
      p_independent_review_hash, p_tests_hash
    ), 'UTF8'
  ), 'sha256'), 'hex');
  provider_state_hash_value := encode(extensions.digest(convert_to(
    'product-baseline-v1:no-provider-required', 'UTF8'
  ), 'sha256'), 'hex');
  capability_scope_hash_value := encode(extensions.digest(convert_to(
    concat_ws(
      '|', 'product-baseline-v1-provider-independent-scope',
      'visual_experience_canary',
      '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba',
      p_source_commit, p_source_module_graph_hash
    ), 'UTF8'
  ), 'sha256'), 'hex');
  budget_hash_value := encode(extensions.digest(convert_to(
    'product-baseline-v1:zero-provider-cost', 'UTF8'
  ), 'sha256'), 'hex');
  evaluator_requirement_hash_value := encode(extensions.digest(convert_to(
    concat_ws(
      '|', 'product-baseline-v1-independent-evaluator-required',
      'cognitive_product_quality_evaluator',
      'independent_evaluation', p_independent_review_hash
    ), 'UTF8'
  ), 'sha256'), 'hex');
  decision_hash_value := encode(extensions.digest(convert_to(concat_ws(
    '|', 'product-baseline-v1-owner-selection-decision',
    decision_id_value::text, task_value.id::text,
    task_value.project_id::text, p_source_commit, p_source_tree,
    p_source_module_graph_hash, evidence_manifest_hash_value,
    capability_scope_hash_value, budget_hash_value,
    evaluator_requirement_hash_value, p_tests_hash, p_rollback_hash,
    owner_hash_value, expires_at_value::text,
    '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'
  ), 'UTF8'), 'sha256'), 'hex');

  insert into public.governance_deliberations(
    id, task_id, project_id, platform, environment,
    constitution_version_id, deliberation_key, objective_hash,
    source_commit, architecture_graph_digest, risk_level, status,
    required_quorum, budget_ceiling, deadline_at, decided_at
  ) values (
    deliberation_id_value, task_value.id, task_value.project_id,
    task_value.platform, task_value.environment,
    constitution_version_id_value,
    'product-experience-baseline-v1-owner-selection',
    task_value.objective_hash, p_source_commit,
    p_source_module_graph_hash, 'low', 'decided', 3, 0,
    expires_at_value, now_at
  );

  insert into public.governance_evidence_packets(
    id, deliberation_id, task_id, project_id, platform, environment,
    packet_hash, source_commit, architecture_graph_digest,
    research_claim_hashes, provider_state_hash, known_unknowns,
    approval_level, budget_hash, rollback_requirements_hash,
    freshness_deadline
  ) values (
    evidence_packet_id_value, deliberation_id_value,
    task_value.id, task_value.project_id,
    task_value.platform, task_value.environment,
    evidence_manifest_hash_value, p_source_commit,
    p_source_module_graph_hash, '{}'::text[],
    provider_state_hash_value,
    jsonb_build_object(
      'providersRequired', false,
      'uiMutationAuthority', false,
      'independentEvaluatorRequired', true
    ),
    'owner', budget_hash_value, p_rollback_hash, expires_at_value
  );

  insert into public.governance_proposals(
    id, deliberation_id, task_id, project_id, platform, environment,
    option_kind, proposal_hash, user_value_score, risk_score,
    reversibility, cost_estimate, proof_burden, rollback_hash
  ) values
  (
    rejected_a_proposal_id_value, deliberation_id_value,
    task_value.id, task_value.project_id,
    task_value.platform, task_value.environment,
    'no_action',
    '9e891de1b46cd19405b43178dbd34ed0ea1d96b4eebcc7b404f4f3d9f6ba3dc5',
    0, 0, 'full', 0, 'source', p_rollback_hash
  ),
  (
    rejected_b_proposal_id_value, deliberation_id_value,
    task_value.id, task_value.project_id,
    task_value.platform, task_value.environment,
    'moderate_improvement',
    '29b2c09ded4add3fba577e1195d3da20d0e1015ba81e88f73b1319593f0c27c9',
    0, 0, 'full', 0, 'source', p_rollback_hash
  ),
  (
    selected_proposal_id_value, deliberation_id_value,
    task_value.id, task_value.project_id,
    task_value.platform, task_value.environment,
    'minimal_repair',
    '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba',
    100, 0, 'full', 0, 'source', p_rollback_hash
  );

  insert into public.product_experience_baseline_owner_decisions(
    decision_manifest_id, deliberation_id, evidence_packet_id,
    selected_proposal_id, task_id, project_id, platform, environment,
    owner_user_id, owner_identity_hash, repository_full_name, branch_name,
    source_commit, source_tree, source_module_graph_hash,
    independent_review_hash, tests_hash, required_test_ids,
    baseline_identifier, selected_option_code, selected_option_name,
    baseline_hash, source_options_manifest_hash, evidence_manifest_hash,
    capability_scope_hash, budget_hash, evaluator_requirement_hash,
    rollback_hash, decision_hash, expires_at
  ) values (
    decision_id_value, deliberation_id_value, evidence_packet_id_value,
    selected_proposal_id_value, task_value.id, task_value.project_id,
    task_value.platform, task_value.environment, owner_id,
    owner_hash_value, 'Chillywood2025/chillywood-mobile',
    'codex/cognitive-level01-staged-worker-activation',
    p_source_commit, p_source_tree, p_source_module_graph_hash,
    p_independent_review_hash, p_tests_hash, required_test_ids_value,
    'chillywood-product-experience-baseline-v1',
    'C', 'creator_balanced',
    '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba',
    '7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df',
    evidence_manifest_hash_value, capability_scope_hash_value,
    budget_hash_value, evaluator_requirement_hash_value,
    p_rollback_hash, decision_hash_value, expires_at_value
  );

  insert into public.governance_decision_manifests(
    id, deliberation_id, evidence_packet_id, selected_proposal_id,
    task_id, project_id, platform, environment, decision_key,
    source_commit, architecture_graph_digest, evidence_manifest_hash,
    research_claim_hashes, selected_option_hash,
    rejected_option_hashes, council_attestation_hash, votes_hash,
    vetoes_hash, dissent_hash, stakeholder_impact_hash, risk_level,
    required_test_ids, capability_scope_hash, budget_hash,
    maximum_executions, rollback_hash, external_confirmation_required,
    decision_hash, status, expires_at, finalized_at
  ) values (
    decision_id_value, deliberation_id_value, evidence_packet_id_value,
    selected_proposal_id_value, task_value.id, task_value.project_id,
    task_value.platform, task_value.environment,
    'product-experience-baseline-v1-owner-selection',
    p_source_commit, p_source_module_graph_hash,
    evidence_manifest_hash_value, '{}'::text[],
    '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba',
    array[
      '29b2c09ded4add3fba577e1195d3da20d0e1015ba81e88f73b1319593f0c27c9',
      '9e891de1b46cd19405b43178dbd34ed0ea1d96b4eebcc7b404f4f3d9f6ba3dc5'
    ]::text[],
    p_independent_review_hash,
    encode(extensions.digest(convert_to(
      'product-baseline-v1:no-collective-vote', 'UTF8'
    ), 'sha256'), 'hex'),
    encode(extensions.digest(convert_to(
      'product-baseline-v1:no-veto-authority', 'UTF8'
    ), 'sha256'), 'hex'),
    encode(extensions.digest(convert_to(
      'product-baseline-v1:no-dissent-authority', 'UTF8'
    ), 'sha256'), 'hex'),
    encode(extensions.digest(convert_to(
      'product-baseline-v1:no-product-mutation', 'UTF8'
    ), 'sha256'), 'hex'),
    'low', required_test_ids_value, capability_scope_hash_value,
    budget_hash_value, 1, p_rollback_hash, false,
    decision_hash_value, 'finalized', expires_at_value, now_at
  );

  insert into public.governance_decision_manifest_events(
    decision_manifest_id, task_id, project_id, platform, environment,
    event_sequence, event_type, event_hash, actor_identity
  ) values (
    decision_id_value, task_value.id, task_value.project_id,
    task_value.platform, task_value.environment, 1, 'finalized',
    decision_hash_value, 'exact_owner_product_baseline'
  );

  return jsonb_build_object(
    'decisionManifestId', decision_id_value,
    'decisionHash', decision_hash_value,
    'sourceCommit', p_source_commit,
    'sourceTree', p_source_tree,
    'sourceModuleGraphHash', p_source_module_graph_hash,
    'independentReviewHash', p_independent_review_hash,
    'evidenceManifestHash', evidence_manifest_hash_value,
    'capabilityScopeHash', capability_scope_hash_value,
    'budgetHash', budget_hash_value,
    'testsHash', p_tests_hash,
    'requiredTestIds', required_test_ids_value,
    'evaluatorRequirementHash', evaluator_requirement_hash_value,
    'rollbackHash', p_rollback_hash,
    'repositoryFullName', 'Chillywood2025/chillywood-mobile',
    'branchName',
      'codex/cognitive-level01-staged-worker-activation',
    'baselineId', 'chillywood-product-experience-baseline-v1',
    'selectedOptionCode', 'C',
    'selectedOption', 'creator_balanced',
    'baselineHash',
      '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba',
    'sourceOptionsManifestHash',
      '7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df',
    'modelIndependenceStatus',
      'PROVIDER_INDEPENDENT_OWNER_SELECTION_REVIEWED',
    'modelProviderUsed', false,
    'independentEvaluatorRequired', true,
    'uiMutationAuthority', false,
    'maximumExecutions', 1,
    'expiresAt', expires_at_value
  );
end;
$$;

revoke all on function
  public.governance_prepare_product_baseline_v1_owner_selection(
    uuid, uuid, text, text, text, text, text, text, interval
  )
  from public, anon, service_role;
grant execute on function
  public.governance_prepare_product_baseline_v1_owner_selection(
    uuid, uuid, text, text, text, text, text, text, interval
  )
  to authenticated;

create function
  public.governance_record_product_experience_baseline_v1_owner_approval(
    p_decision_manifest_id uuid,
    p_plan_snapshot_hash text,
    p_validity interval default interval '24 hours'
  )
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := public.governance_assert_exact_owner();
  baseline_value
    public.product_experience_baseline_owner_decisions%rowtype;
  decision_value public.governance_decision_manifests%rowtype;
  approval_record_id_value uuid;
  approval_version_id_value uuid;
  approval_hash_value text;
  owner_hash_value text;
  expires_at_value timestamptz;
  now_at timestamptz := transaction_timestamp();
begin
  select * into baseline_value
  from public.product_experience_baseline_owner_decisions baseline
  where baseline.decision_manifest_id = p_decision_manifest_id
  for share;

  select * into decision_value
  from public.governance_decision_manifests decision
  where decision.id = p_decision_manifest_id
  for share;

  if baseline_value.id is null
     or decision_value.id is null
     or baseline_value.owner_user_id <> owner_id
     or decision_value.status <> 'finalized'
     or decision_value.model_independence_status <>
        'PROVIDER_INDEPENDENT_OWNER_SELECTION_REVIEWED'
     or decision_value.model_independence_assessment_id <>
        'product-baseline-owner-selection-v1'
     or decision_value.model_independence_evidence_hash <>
        baseline_value.independent_review_hash
     or decision_value.decision_hash <> baseline_value.decision_hash
     or decision_value.selected_option_hash <>
        baseline_value.baseline_hash
     or transaction_timestamp() >= baseline_value.expires_at
     or transaction_timestamp() >= decision_value.expires_at
     or p_plan_snapshot_hash !~ '^[a-f0-9]{64}$'
     or p_validity <= interval '0 seconds'
     or p_validity > interval '24 hours'
     or not public.governance_approval_emergency_active()
     or exists (
       select 1
       from public.governance_owner_approval_records approval
       where approval.task_id = baseline_value.task_id
         and approval.approval_key =
           'product-experience-baseline-v1-option-c'
     ) then
    raise exception
      'product_experience_baseline_owner_approval_rejected'
      using errcode = 'P0001';
  end if;

  expires_at_value := least(
    now_at + p_validity,
    baseline_value.expires_at,
    decision_value.expires_at
  );
  if expires_at_value <= now_at then
    raise exception
      'product_experience_baseline_owner_approval_rejected'
      using errcode = 'P0001';
  end if;

  owner_hash_value := encode(extensions.digest(
    convert_to(owner_id::text, 'UTF8'), 'sha256'
  ), 'hex');
  approval_hash_value := encode(extensions.digest(convert_to(concat_ws(
    '|', 'product-baseline-v1-owner-approval',
    decision_value.id::text, decision_value.decision_hash,
    baseline_value.task_id::text, baseline_value.project_id::text,
    baseline_value.source_commit, baseline_value.source_tree,
    baseline_value.source_module_graph_hash,
    baseline_value.independent_review_hash, p_plan_snapshot_hash,
    baseline_value.capability_scope_hash, baseline_value.budget_hash,
    baseline_value.tests_hash, baseline_value.evaluator_requirement_hash,
    baseline_value.rollback_hash, owner_id::text, now_at::text,
    expires_at_value::text
  ), 'UTF8'), 'sha256'), 'hex');

  insert into public.governance_owner_approval_records(
    decision_manifest_id, task_id, project_id, platform, environment,
    approval_key, objective_hash, owner_user_id, current_version,
    current_state, maximum_executions, executions_claimed,
    executions_completed, approval_hash, created_at, updated_at
  )
  select
    decision_value.id, baseline_value.task_id, baseline_value.project_id,
    baseline_value.platform, baseline_value.environment,
    'product-experience-baseline-v1-option-c',
    task.objective_hash, owner_id, 1, 'active', 1, 0, 0,
    approval_hash_value, now_at, now_at
  from public.intelligence_tasks task
  where task.id = baseline_value.task_id
    and task.project_id = baseline_value.project_id
    and task.platform = baseline_value.platform
    and task.environment = baseline_value.environment
  returning id into approval_record_id_value;

  if approval_record_id_value is null then
    raise exception
      'product_experience_baseline_owner_approval_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.governance_owner_approval_versions(
    approval_record_id, decision_manifest_id, task_id, project_id,
    platform, environment, version_number, owner_user_id,
    owner_identity_hash, decision_manifest_hash, plan_snapshot_hash,
    source_commit, architecture_graph_digest, approval_scope_hash,
    objective_hash, repository_full_name, branch_name, provider,
    operation, target_resource_hash, path_scope_hashes,
    table_scope_hashes, function_scope_hashes, budget_hash,
    maximum_cost, maximum_calls, maximum_bytes, maximum_executions,
    tests_hash, required_test_ids, evaluator_requirement_hash,
    rollback_hash, approval_hash, approved_at, valid_from, expires_at
  )
  select
    approval_record_id_value, decision_value.id,
    baseline_value.task_id, baseline_value.project_id,
    baseline_value.platform, baseline_value.environment, 1, owner_id,
    owner_hash_value, decision_value.decision_hash,
    p_plan_snapshot_hash, baseline_value.source_commit,
    baseline_value.source_module_graph_hash,
    baseline_value.capability_scope_hash, task.objective_hash,
    baseline_value.repository_full_name, baseline_value.branch_name,
    'visual_sentinel', 'visual_experience_canary',
    baseline_value.baseline_hash, '{}'::text[], '{}'::text[],
    '{}'::text[], baseline_value.budget_hash, 0, 8, 32768, 1,
    baseline_value.tests_hash, baseline_value.required_test_ids,
    baseline_value.evaluator_requirement_hash,
    baseline_value.rollback_hash, approval_hash_value,
    now_at, now_at, expires_at_value
  from public.intelligence_tasks task
  where task.id = baseline_value.task_id
    and task.project_id = baseline_value.project_id
    and task.platform = baseline_value.platform
    and task.environment = baseline_value.environment
  returning id into approval_version_id_value;

  insert into public.governance_owner_approval_version_states(
    approval_version_id, approval_record_id, task_id, project_id,
    platform, environment, state, maximum_executions
  ) values (
    approval_version_id_value, approval_record_id_value,
    baseline_value.task_id, baseline_value.project_id,
    baseline_value.platform, baseline_value.environment, 'active', 1
  );

  insert into public.governance_owner_approval_lifecycle_events(
    approval_record_id, approval_version_id, task_id, project_id,
    platform, environment, event_sequence, event_type, event_hash,
    actor_identity_hash
  ) values (
    approval_record_id_value, approval_version_id_value,
    baseline_value.task_id, baseline_value.project_id,
    baseline_value.platform, baseline_value.environment,
    1, 'owner_approved', approval_hash_value, owner_hash_value
  );

  return jsonb_build_object(
    'approvalId', approval_record_id_value,
    'approvalVersionId', approval_version_id_value,
    'approvalVersion', 1,
    'approvalHash', approval_hash_value,
    'decisionManifestId', decision_value.id,
    'decisionManifestHash', decision_value.decision_hash,
    'planSnapshotHash', p_plan_snapshot_hash,
    'sourceCommit', baseline_value.source_commit,
    'sourceTree', baseline_value.source_tree,
    'architectureGraphDigest',
      baseline_value.source_module_graph_hash,
    'repositoryFullName', baseline_value.repository_full_name,
    'branchName', baseline_value.branch_name,
    'provider', 'visual_sentinel',
    'operation', 'visual_experience_canary',
    'targetResourceHash', baseline_value.baseline_hash,
    'budgetHash', baseline_value.budget_hash,
    'testsHash', baseline_value.tests_hash,
    'requiredTestIds', baseline_value.required_test_ids,
    'evaluatorRequirementHash',
      baseline_value.evaluator_requirement_hash,
    'rollbackHash', baseline_value.rollback_hash,
    'baselineId', baseline_value.baseline_identifier,
    'selectedOptionCode', baseline_value.selected_option_code,
    'selectedOption', baseline_value.selected_option_name,
    'baselineHash', baseline_value.baseline_hash,
    'sourceOptionsManifestHash',
      baseline_value.source_options_manifest_hash,
    'status', 'active',
    'maximumExecutions', 1,
    'modelProviderUsed', false,
    'independentEvaluatorRequired', true,
    'uiMutationAuthority', false,
    'approvedAt', now_at,
    'expiresAt', expires_at_value
  );
end;
$$;

revoke all on function
  public.governance_record_product_experience_baseline_v1_owner_approval(
    uuid, text, interval
  )
  from public, anon, service_role;
grant execute on function
  public.governance_record_product_experience_baseline_v1_owner_approval(
    uuid, text, interval
  )
  to authenticated;

comment on table public.product_experience_baseline_owner_decisions is
  'Immutable provider-independent exact Owner selection receipt for Product Experience Baseline v1; it grants no model, UI mutation, release, repair, or collective-governance authority.';
comment on function
  public.governance_prepare_product_baseline_v1_owner_selection(
    uuid, uuid, text, text, text, text, text, text, interval
  ) is
  'Authenticated exact-Owner preparation of the reviewed Option C decision receipt without model-provider claims; independent product-quality evaluation remains mandatory.';
comment on function
  public.governance_record_product_experience_baseline_v1_owner_approval(
    uuid, text, interval
  ) is
  'Authenticated exact-Owner approval of the immutable Option C receipt with one execution, no UI mutation scopes, and a mandatory separate evaluator.';
