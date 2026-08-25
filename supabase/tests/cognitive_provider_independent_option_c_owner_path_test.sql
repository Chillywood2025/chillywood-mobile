begin;
select no_plan();

insert into public.cognitive_projects(
  id, repository_full_name, source_state, activation_state,
  scheduler_state, production_authority
) values (
  'd1000000-0000-4000-8000-000000000001',
  'Chillywood2025/chillywood-mobile',
  'collective_governance_source_complete_not_deployed',
  'off', 'bounded_level01', false
);

insert into public.intelligence_tasks(
  id, project_id, platform, environment, repository_full_name,
  branch_name, task_key, objective_hash, actor_identity, deadman_at
) values (
  'd2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared', 'production', 'Chillywood2025/chillywood-mobile',
  'codex/cognitive-level01-staged-worker-activation',
  'cognitive-level01-canary-control', repeat('a', 64),
  'provider-independent-option-c-owner-path-test',
  transaction_timestamp() + interval '2 days'
);

insert into auth.users(id, is_sso_user, is_anonymous, email_confirmed_at)
values
  ('d3000000-0000-4000-8000-000000000001', false, false, now()),
  ('d3000000-0000-4000-8000-000000000002', false, false, now());

insert into auth.sessions(id, user_id)
values
  ('d3100000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001'),
  ('d3100000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000002');

insert into public.platform_role_memberships(user_id, email, role, status)
values
  ('d3000000-0000-4000-8000-000000000001', null, 'owner', 'active'),
  ('d3000000-0000-4000-8000-000000000002', null, 'super_admin', 'active');

insert into public.governance_constitutions(
  id, task_id, project_id, platform, environment, constitution_key,
  title, current_version, status, created_by_identity
) values (
  'd4000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared', 'production', 'collective-governance-v1',
  'Provider-independent Option C fixture', 1, 'source_only', 'fixture'
);

insert into public.governance_constitution_versions(
  id, constitution_id, task_id, project_id, platform, environment,
  version_number, constitution_hash, policy_snapshot, status,
  proposed_by_identity, rollback_hash
) values (
  'd4100000-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared', 'production', 1, repeat('b', 64),
  '{"activation":"off","providerIndependentBaseline":true}'::jsonb,
  'draft', 'fixture', repeat('c', 64)
);

create temporary table option_c_owner_path_state(
  decision_manifest_id uuid,
  decision_hash text,
  evidence_manifest_hash text,
  capability_scope_hash text,
  budget_hash text,
  tests_hash text,
  evaluator_requirement_hash text,
  rollback_hash text,
  approval_id uuid,
  approval_version_id uuid,
  approval_hash text,
  execution_id uuid,
  evaluator_proof_hash text
);
grant select, insert, update on option_c_owner_path_state
  to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'd3000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d3000000-0000-4000-8000-000000000002","session_id":"d3100000-0000-4000-8000-000000000002"}',
  true
);
select throws_ok(
  $$select public.governance_prepare_product_baseline_v1_owner_selection(
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    repeat('1', 40), repeat('2', 40),
    '0d377e19a200e0c970bef32ca141a588a7f4097d2c21ac69951ea19356edcb87',
    repeat('4', 64), repeat('5', 64), repeat('6', 64),
    interval '23 hours'
  )$$,
  '42501',
  'governance_owner_identity_required',
  'a non-Owner cannot prepare the provider-independent Option C receipt'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'd3000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d3000000-0000-4000-8000-000000000001","session_id":"d3100000-0000-4000-8000-000000000001"}',
  true
);

select throws_ok(
  $$select public.governance_prepare_product_baseline_v1_owner_selection(
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    repeat('1', 40), repeat('2', 40), repeat('3', 64),
    repeat('4', 64), repeat('5', 64), repeat('6', 64),
    interval '23 hours'
  )$$,
  'P0001',
  'product_experience_baseline_owner_selection_rejected',
  'even the Owner cannot substitute an unreviewed runtime source graph'
);

insert into option_c_owner_path_state(
  decision_manifest_id, decision_hash, evidence_manifest_hash,
  capability_scope_hash, budget_hash, tests_hash,
  evaluator_requirement_hash, rollback_hash
)
select
  (result->>'decisionManifestId')::uuid,
  result->>'decisionHash',
  result->>'evidenceManifestHash',
  result->>'capabilityScopeHash',
  result->>'budgetHash',
  result->>'testsHash',
  result->>'evaluatorRequirementHash',
  result->>'rollbackHash'
from (
  select public.governance_prepare_product_baseline_v1_owner_selection(
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    repeat('1', 40), repeat('2', 40),
    '0d377e19a200e0c970bef32ca141a588a7f4097d2c21ac69951ea19356edcb87',
    repeat('4', 64), repeat('5', 64), repeat('6', 64),
    interval '23 hours'
  ) result
) prepared;
reset role;

select is(
  (
    select count(*)::integer
    from public.product_experience_baseline_owner_decisions
  ),
  1,
  'the exact Owner records one immutable provider-independent decision receipt'
);
select ok(
  (
    select
      decision.status = 'finalized'
      and decision.model_independence_status =
        'PROVIDER_INDEPENDENT_OWNER_SELECTION_REVIEWED'
      and decision.model_independence_assessment_id =
        'product-baseline-owner-selection-v1'
      and decision.model_independence_evidence_hash = repeat('4', 64)
      and decision.selected_option_hash =
        '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'
      and decision.maximum_executions = 1
      and not decision.external_confirmation_required
    from public.governance_decision_manifests decision
    where decision.id = (
      select decision_manifest_id from option_c_owner_path_state
    )
  ),
  'the receipt is truthful about provider independence and never claims model verification'
);
select ok(
  (
    select
      baseline.repository_full_name =
        'Chillywood2025/chillywood-mobile'
      and baseline.branch_name =
        'codex/cognitive-level01-staged-worker-activation'
      and baseline.source_commit = repeat('1', 40)
      and baseline.source_tree = repeat('2', 40)
      and baseline.source_module_graph_hash =
        '0d377e19a200e0c970bef32ca141a588a7f4097d2c21ac69951ea19356edcb87'
      and baseline.independent_review_hash = repeat('4', 64)
      and baseline.tests_hash = repeat('5', 64)
      and baseline.rollback_hash = repeat('6', 64)
      and baseline.baseline_identifier =
        'chillywood-product-experience-baseline-v1'
      and baseline.selected_option_code = 'C'
      and baseline.selected_option_name = 'creator_balanced'
      and baseline.baseline_hash =
        '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'
    from public.product_experience_baseline_owner_decisions baseline
  ),
  'the decision receipt binds exact source, review, repository, and Option C'
);
select is(
  (
    select count(*)::integer
    from public.governance_model_execution_attestations attestation
    where attestation.task_id =
      'd2000000-0000-4000-8000-000000000001'
  ),
  0,
  'provider-independent preparation fabricates no model execution'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'd3000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d3000000-0000-4000-8000-000000000001","session_id":"d3100000-0000-4000-8000-000000000001"}',
  true
);
select throws_ok(
  $$select public.governance_record_owner_approval(
    (select decision_manifest_id from option_c_owner_path_state),
    'generic-option-c-bypass-attempt',
    repeat('a', 64), repeat('7', 64), repeat('1', 40), repeat('3', 64),
    (select capability_scope_hash from option_c_owner_path_state),
    'Chillywood2025/chillywood-mobile',
    'codex/cognitive-level01-staged-worker-activation',
    'visual_sentinel', 'visual_experience_canary',
    '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba',
    '{}'::text[], '{}'::text[], '{}'::text[],
    (select budget_hash from option_c_owner_path_state),
    0, 8, 32768, 1,
    (select tests_hash from option_c_owner_path_state),
    array[
      'cognitive-staged-activation-ci-13-of-13',
      'cognitive-staged-activation-pgtap-full',
      'cognitive-staged-activation-p0-p1-zero',
      'cognitive-product-baseline-owner-executor-evaluator'
    ]::text[],
    (select evaluator_requirement_hash from option_c_owner_path_state),
    (select rollback_hash from option_c_owner_path_state),
    interval '22 hours'
  )$$,
  'P0001',
  'two_party_owner_approval_rejected',
  'the generic approval path still requires real model independence'
);

update option_c_owner_path_state
set (
  approval_id, approval_version_id, approval_hash
) = (
  select
    (result->>'approvalId')::uuid,
    (result->>'approvalVersionId')::uuid,
    result->>'approvalHash'
  from (
    select
      public.governance_record_product_experience_baseline_v1_owner_approval(
        (select decision_manifest_id from option_c_owner_path_state),
        repeat('7', 64),
        interval '22 hours'
      ) result
  ) approved
);

select ok(
  (
    select
      version.provider = 'visual_sentinel'
      and version.operation = 'visual_experience_canary'
      and version.target_resource_hash =
        '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'
      and cardinality(version.path_scope_hashes) = 0
      and cardinality(version.table_scope_hashes) = 0
      and cardinality(version.function_scope_hashes) = 0
      and version.maximum_cost = 0
      and version.maximum_executions = 1
      and version.owner_user_id =
        'd3000000-0000-4000-8000-000000000001'::uuid
    from public.governance_owner_approval_versions version
    where version.id = (
      select approval_version_id from option_c_owner_path_state
    )
  ),
  'authenticated approval grants one canary execution and no UI or mutation scope'
);
select throws_ok(
  $$select
    public.governance_record_product_experience_baseline_v1_owner_approval(
      (select decision_manifest_id from option_c_owner_path_state),
      repeat('7', 64),
      interval '22 hours'
    )$$,
  'P0001',
  'product_experience_baseline_owner_approval_rejected',
  'the immutable Owner approval cannot be duplicated'
);

select is(
  public.governance_register_two_party_service_principal(
    'product_experience_baseline_service',
    encode(extensions.digest(
      convert_to('provider-independent-baseline-assertion-000000', 'UTF8'),
      'sha256'
    ), 'hex'),
    array['visual_experience_canary'],
    transaction_timestamp() + interval '1 day'
  )->>'status',
  'registered',
  'Owner registers only the baseline executor assertion hash'
);
select is(
  public.governance_register_two_party_service_principal(
    'cognitive_product_quality_evaluator',
    encode(extensions.digest(
      convert_to('provider-independent-evaluator-assertion-00000', 'UTF8'),
      'sha256'
    ), 'hex'),
    array['independent_evaluation'],
    transaction_timestamp() + interval '1 day'
  )->>'status',
  'registered',
  'Owner separately registers the product-quality evaluator assertion hash'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

update option_c_owner_path_state
set execution_id = (
  select (result->>'executionId')::uuid
  from (
    select public.governance_claim_approved_action(
      (select approval_version_id from option_c_owner_path_state),
      'product_experience_baseline_service',
      'provider-independent-baseline-assertion-000000',
      (select decision_hash from option_c_owner_path_state),
      repeat('7', 64),
      (select approval_hash from option_c_owner_path_state),
      'd2000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000001',
      'Chillywood2025/chillywood-mobile',
      'codex/cognitive-level01-staged-worker-activation',
      'shared', 'production', 'visual_sentinel',
      'visual_experience_canary',
      '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba',
      (select budget_hash from option_c_owner_path_state),
      (select tests_hash from option_c_owner_path_state),
      (select evaluator_requirement_hash from option_c_owner_path_state),
      (select rollback_hash from option_c_owner_path_state)
    ) result
  ) claimed
);

select is(
  public.governance_begin_approved_execution(
    (select execution_id from option_c_owner_path_state),
    'product_experience_baseline_service',
    'provider-independent-baseline-assertion-000000',
    'preflight'
  )->>'state',
  'preflight',
  'the winning baseline executor enters preflight'
);
select is(
  public.governance_begin_approved_execution(
    (select execution_id from option_c_owner_path_state),
    'product_experience_baseline_service',
    'provider-independent-baseline-assertion-000000',
    'executing'
  )->>'state',
  'executing',
  'the winning baseline executor enters non-live staging'
);
select is(
  public.governance_stage_product_experience_baseline_v1(
    (select execution_id from option_c_owner_path_state),
    'product_experience_baseline_service',
    'provider-independent-baseline-assertion-000000',
    repeat('1', 40),
    'chillywood-product-experience-baseline-v1',
    'C', 'creator_balanced',
    '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba',
    '7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df'
  )->>'state',
  'postflight',
  'the executor stages exact Option C without UI mutation authority'
);
select is(
  public.governance_begin_approved_execution(
    (select execution_id from option_c_owner_path_state),
    'product_experience_baseline_service',
    'provider-independent-baseline-assertion-000000',
    'evaluating'
  )->>'state',
  'evaluating',
  'the staged selection requires independent evaluation'
);

update option_c_owner_path_state
set evaluator_proof_hash = (
  select result->>'evaluatorProofHash'
  from (
    select public.governance_evaluate_product_experience_baseline_v1(
      (select execution_id from option_c_owner_path_state),
      'cognitive_product_quality_evaluator',
      'provider-independent-evaluator-assertion-00000',
      repeat('8', 64)
    ) result
  ) evaluated
);

select is(
  public.governance_complete_approved_execution(
    (select execution_id from option_c_owner_path_state),
    'product_experience_baseline_service',
    'provider-independent-baseline-assertion-000000',
    repeat('8', 64),
    (select evaluator_proof_hash from option_c_owner_path_state)
  )->>'state',
  'completed',
  'the baseline completes only after the separate product evaluator proof'
);
select is(
  public.governance_product_baseline_persist_completed_execution(
    (select execution_id from option_c_owner_path_state),
    'product_experience_baseline_service',
    'provider-independent-baseline-assertion-000000'
  )->>'created',
  'true',
  'the completed independently evaluated selection persists once'
);
select is(
  public.governance_product_baseline_persist_completed_execution(
    (select execution_id from option_c_owner_path_state),
    'product_experience_baseline_service',
    'provider-independent-baseline-assertion-000000'
  )->>'created',
  'false',
  'persistence replay is an idempotent no-op'
);
select throws_ok(
  $$select public.governance_claim_approved_action(
    (select approval_version_id from option_c_owner_path_state),
    'product_experience_baseline_service',
    'provider-independent-baseline-assertion-000000',
    (select decision_hash from option_c_owner_path_state),
    repeat('7', 64),
    (select approval_hash from option_c_owner_path_state),
    'd2000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'Chillywood2025/chillywood-mobile',
    'codex/cognitive-level01-staged-worker-activation',
    'shared', 'production', 'visual_sentinel',
    'visual_experience_canary',
    '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba',
    (select budget_hash from option_c_owner_path_state),
    (select tests_hash from option_c_owner_path_state),
    (select evaluator_requirement_hash from option_c_owner_path_state),
    (select rollback_hash from option_c_owner_path_state)
  )$$,
  'P0001',
  'two_party_approved_action_claim_rejected',
  'the single winning worker claim cannot replay'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.product_experience_baseline_versions baseline
    where baseline.baseline_identifier =
      'chillywood-product-experience-baseline-v1'
      and baseline.baseline_option = 'C'
      and baseline.baseline_option_name = 'creator_balanced'
      and baseline.baseline_hash =
        '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'
      and baseline.source_commit = repeat('1', 40)
  ),
  1,
  'the effective provider-independent Option C baseline count is exactly one'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_governance_switches switch
    where switch.task_id =
      'd2000000-0000-4000-8000-000000000001'
      and switch.enabled
  ),
  0,
  'baseline approval enables no governance switch'
);

select throws_ok(
  $$update public.product_experience_baseline_owner_decisions
    set branch_name = 'codex/mutated'
    where task_id =
      'd2000000-0000-4000-8000-000000000001'$$,
  '42501',
  'immutable_cognitive_evidence',
  'the provider-independent Owner receipt cannot be rewritten'
);

select * from finish();
rollback;
