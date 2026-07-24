begin;
select no_plan();

insert into public.cognitive_projects(
  id, repository_full_name, source_state, activation_state,
  scheduler_state, production_authority
) values (
  'a1000000-0000-4000-8000-000000000001',
  'Chillywood2025/chillywood-mobile',
  'collective_governance_source_complete_not_deployed',
  'off',
  'bounded_level01',
  false
);

insert into public.intelligence_tasks(
  id, project_id, platform, environment, repository_full_name, branch_name,
  task_key, objective_hash, actor_identity, deadman_at
) values (
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'android', 'production', 'Chillywood2025/chillywood-mobile',
  'codex/cognitive-baseline-persistence-fixture',
  'baseline-owner-persistence-fixture', repeat('1',64),
  'baseline-persistence-fixture',
  transaction_timestamp() + interval '2 days'
);

insert into public.platform_role_memberships(user_id, email, role, status)
values
  ('a3000000-0000-4000-8000-000000000001', null, 'owner', 'active'),
  ('a3000000-0000-4000-8000-000000000002', null, 'super_admin', 'active');

insert into public.governance_constitutions(
  id, task_id, project_id, platform, environment, constitution_key, title,
  current_version, status, created_by_identity
) values (
  'a4000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'android', 'production', 'baseline-persistence-constitution',
  'Baseline Persistence Constitution Fixture', 1, 'active', 'fixture'
);

insert into public.governance_constitution_versions(
  id, constitution_id, task_id, project_id, platform, environment,
  version_number, constitution_hash, policy_snapshot, status,
  proposed_by_identity, independent_review_hash, owner_approved_by,
  owner_approved_at, activation_not_before, rollback_hash
) values (
  'a4100000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'android', 'production', 1, repeat('2',64),
  '{"activation":"off","baselinePersistence":true}'::jsonb,
  'active', 'fixture', repeat('3',64),
  'a3000000-0000-4000-8000-000000000001',
  transaction_timestamp(), transaction_timestamp() - interval '1 minute',
  repeat('4',64)
);

insert into public.governance_deliberations(
  id, task_id, project_id, platform, environment, constitution_version_id,
  deliberation_key, objective_hash, source_commit, architecture_graph_digest,
  risk_level, status, required_quorum, budget_ceiling, deadline_at, decided_at
) values (
  'a5000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'android', 'production',
  'a4100000-0000-4000-8000-000000000001',
  'baseline-persistence-deliberation', repeat('5',64), repeat('6',40),
  repeat('7',64), 'low', 'decided', 3, 0,
  transaction_timestamp() + interval '2 days', transaction_timestamp()
);

insert into public.governance_evidence_packets(
  id, deliberation_id, task_id, project_id, platform, environment,
  packet_hash, source_commit, architecture_graph_digest, research_claim_hashes,
  provider_state_hash, known_unknowns, approval_level, budget_hash,
  rollback_requirements_hash, freshness_deadline
) values (
  'a6000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'android', 'production', repeat('8',64), repeat('6',40),
  repeat('7',64), '{}'::text[], repeat('9',64),
  '{"fixture":"bounded-baseline-selection"}'::jsonb,
  'owner', repeat('a',64), repeat('b',64),
  transaction_timestamp() + interval '1 day'
);

insert into public.governance_proposals(
  id, deliberation_id, task_id, project_id, platform, environment,
  option_kind, proposal_hash, user_value_score, risk_score, reversibility,
  cost_estimate, proof_burden, rollback_hash
) values (
  'a7000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'android', 'production', 'minimal_repair',
  '29b2c09ded4add3fba577e1195d3da20d0e1015ba81e88f73b1319593f0c27c9',
  10, 0, 'full', 0, 'source',
  repeat('4',64)
);

insert into public.governance_model_execution_attestations(
  assessment_id, task_id, project_id, platform, environment, council_role,
  provider_identity_hash, model_family, model_version,
  execution_identity_hash, evidence_packet_hash,
  prompt_template_version_hash, output_hash, blind_first_round,
  correlation_class, cost, latency_ms
) values
  (
    (
      'deliberation-' || encode(
        extensions.digest(
          convert_to(
            'a5000000-0000-4000-8000-000000000001',
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
    ),
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'android', 'production', 'product_user_experience', repeat('1',64),
    'family-a', 'model-a', repeat('2',64), repeat('3',64), repeat('4',64),
    repeat('5',64), true, 'cross_provider', 0.1, 100
  ),
  (
    (
      'deliberation-' || encode(
        extensions.digest(
          convert_to(
            'a5000000-0000-4000-8000-000000000001',
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
    ),
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'android', 'production', 'security_privacy', repeat('2',64),
    'family-b', 'model-b', repeat('3',64), repeat('4',64), repeat('5',64),
    repeat('6',64), true, 'cross_provider', 0.1, 100
  ),
  (
    (
      'deliberation-' || encode(
        extensions.digest(
          convert_to(
            'a5000000-0000-4000-8000-000000000001',
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
    ),
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'android', 'production', 'reliability_release', repeat('3',64),
    'family-c', 'model-c', repeat('4',64), repeat('5',64), repeat('6',64),
    repeat('7',64), true, 'cross_provider', 0.1, 100
  );

insert into public.governance_decision_manifests(
  id, deliberation_id, evidence_packet_id, selected_proposal_id, task_id,
  project_id, platform, environment, decision_key, source_commit,
  architecture_graph_digest, evidence_manifest_hash, research_claim_hashes,
  selected_option_hash, rejected_option_hashes, council_attestation_hash,
  votes_hash, vetoes_hash, dissent_hash, stakeholder_impact_hash, risk_level,
  required_test_ids, capability_scope_hash, budget_hash, maximum_executions,
  rollback_hash, decision_hash, status, expires_at, finalized_at
) values (
  'a8000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001',
  'a6000000-0000-4000-8000-000000000001',
  'a7000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'android', 'production', 'baseline-persistence-decision', repeat('6',40),
  repeat('7',64), repeat('8',64), '{}'::text[],
  '29b2c09ded4add3fba577e1195d3da20d0e1015ba81e88f73b1319593f0c27c9',
  array[
    '9e891de1b46cd19405b43178dbd34ed0ea1d96b4eebcc7b404f4f3d9f6ba3dc5',
    '0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184'
  ],
  repeat('c',64), repeat('d',64), repeat('e',64), repeat('f',64),
  repeat('1',64), 'low', array['baseline-owner-persistence-test'],
  repeat('2',64), repeat('a',64), 1, repeat('4',64), repeat('5',64),
  'finalized', transaction_timestamp() + interval '1 day',
  transaction_timestamp()
);

insert into public.governance_owner_approval_records(
  id, decision_manifest_id, task_id, project_id, platform, environment,
  approval_key, objective_hash, owner_user_id, current_version, current_state,
  maximum_executions, executions_claimed, executions_completed, approval_hash
) values (
  'a9000000-0000-4000-8000-000000000001',
  'a8000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'android', 'production', 'baseline-owner-persistence-approval',
  repeat('1',64), 'a3000000-0000-4000-8000-000000000001',
  1, 'completed', 1, 1, 1, repeat('6',64)
);

insert into public.governance_owner_approval_versions(
  id, approval_record_id, decision_manifest_id, task_id, project_id, platform,
  environment, version_number, owner_user_id, owner_identity_hash,
  decision_manifest_hash, plan_snapshot_hash, source_commit,
  architecture_graph_digest, approval_scope_hash, objective_hash,
  repository_full_name, branch_name, provider, operation, target_resource_hash,
  path_scope_hashes, table_scope_hashes, function_scope_hashes, budget_hash,
  maximum_cost, maximum_calls, maximum_bytes, maximum_executions, tests_hash,
  required_test_ids, evaluator_requirement_hash, rollback_hash, approval_hash,
  approved_at, valid_from, expires_at
) values (
  'aa000000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000001',
  'a8000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'android', 'production', 1,
  'a3000000-0000-4000-8000-000000000001',
  encode(
    extensions.digest(
      convert_to('a3000000-0000-4000-8000-000000000001','UTF8'),
      'sha256'
    ),
    'hex'
  ),
  repeat('5',64), repeat('7',64), repeat('6',40), repeat('7',64),
  repeat('2',64), repeat('1',64),
  'Chillywood2025/chillywood-mobile',
  'codex/cognitive-baseline-persistence-fixture',
  'visual_sentinel', 'visual_experience_canary',
  '29b2c09ded4add3fba577e1195d3da20d0e1015ba81e88f73b1319593f0c27c9',
  '{}'::text[], '{}'::text[], '{}'::text[], repeat('a',64),
  0, 1, 4096, 1, repeat('3',64),
  array['baseline-owner-persistence-test'], repeat('4',64),
  repeat('4',64), repeat('6',64),
  transaction_timestamp() - interval '1 minute',
  transaction_timestamp() - interval '1 minute',
  transaction_timestamp() + interval '23 hours'
);

insert into public.governance_owner_approval_version_states(
  approval_version_id, approval_record_id, task_id, project_id, platform,
  environment, state, maximum_executions, executions_claimed,
  executions_completed, completed_at
) values (
  'aa000000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'android', 'production', 'completed', 1, 1, 1,
  transaction_timestamp() - interval '10 seconds'
);

insert into public.governance_approved_action_executions(
  id, approval_record_id, approval_version_id, task_id, project_id,
  repository_full_name, branch_name, platform, environment, provider,
  operation, claim_sequence, state, service_identity, service_identity_hash,
  worker_assertion_hash, decision_manifest_hash, plan_snapshot_hash,
  approval_hash, target_resource_hash, budget_hash, tests_hash,
  evaluator_requirement_hash, rollback_hash, execution_receipt_hash,
  evaluator_proof_hash, claimed_at, began_at, completed_at, updated_at
) values (
  'ab000000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000001',
  'aa000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'Chillywood2025/chillywood-mobile',
  'codex/cognitive-baseline-persistence-fixture',
  'android', 'production', 'visual_sentinel', 'visual_experience_canary',
  1, 'completed', 'product_experience_baseline_service',
  encode(
    extensions.digest(
      convert_to('product_experience_baseline_service','UTF8'),
      'sha256'
    ),
    'hex'
  ),
  repeat('2',64), repeat('5',64), repeat('7',64), repeat('6',64),
  '29b2c09ded4add3fba577e1195d3da20d0e1015ba81e88f73b1319593f0c27c9',
  repeat('a',64), repeat('3',64), repeat('4',64), repeat('4',64),
  repeat('d',64), repeat('e',64),
  transaction_timestamp() - interval '1 minute',
  transaction_timestamp() - interval '50 seconds',
  transaction_timestamp() - interval '10 seconds',
  transaction_timestamp() - interval '10 seconds'
);

insert into public.governance_approved_execution_evaluator_proofs(
  id, execution_id, approval_record_id, approval_version_id, task_id,
  project_id, platform, environment, evaluator_identity,
  evaluator_identity_hash, execution_receipt_hash, evaluator_proof_hash,
  evaluator_requirement_hash, verdict, created_at
) values (
  'ac000000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000001',
  'aa000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'android', 'production', 'cognitive_independent_evaluator',
  encode(
    extensions.digest(
      convert_to('cognitive_independent_evaluator','UTF8'),
      'sha256'
    ),
    'hex'
  ),
  repeat('d',64), repeat('e',64), repeat('4',64), 'passed',
  transaction_timestamp() - interval '20 seconds'
);

create temporary table baseline_persistence_result(
  baseline_id uuid,
  baseline_version integer,
  baseline_hash text,
  created boolean
);
grant select, insert on baseline_persistence_result to authenticated;

select has_column(
  'public',
  'product_experience_baseline_versions',
  'approved_execution_id',
  'baseline versions retain the exact approved execution'
);
select has_column(
  'public',
  'product_experience_baseline_versions',
  'baseline_manifest_hash',
  'baseline versions retain the canonical manifest hash'
);
select has_column(
  'public',
  'product_experience_baseline_versions',
  'baseline_option',
  'baseline versions retain the exact Owner-selected option'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.governance_owner_persist_product_experience_baseline(uuid,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.governance_owner_persist_product_experience_baseline(uuid,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.governance_owner_persist_product_experience_baseline(uuid,text,text)',
    'EXECUTE'
  ),
  'only authenticated callers can enter the exact Owner assertion'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.product_experience_baseline_versions',
    'INSERT'
  )
  and not has_table_privilege(
    'service_role',
    'public.product_experience_baseline_versions',
    'INSERT'
  ),
  'neither clients nor service_role can bypass the Owner persistence RPC'
);

select ok(
  lower(pg_get_functiondef(
    'public.governance_owner_persist_product_experience_baseline(uuid,text,text)'::regprocedure
  )) like '%governance_assert_exact_owner()%'
  and lower(pg_get_functiondef(
    'public.governance_owner_persist_product_experience_baseline(uuid,text,text)'::regprocedure
  )) like '%product_experience_baseline_service%'
  and lower(pg_get_functiondef(
    'public.governance_owner_persist_product_experience_baseline(uuid,text,text)'::regprocedure
  )) like '%visual_experience_canary%'
  and lower(pg_get_functiondef(
    'public.governance_owner_persist_product_experience_baseline(uuid,text,text)'::regprocedure
  )) like '%proof_value.verdict <> ''passed''%'
  and lower(pg_get_functiondef(
    'public.governance_owner_persist_product_experience_baseline(uuid,text,text)'::regprocedure
  )) like '%decision_value.selected_option_hash <> option_hash_value%'
  and lower(pg_get_functiondef(
    'public.governance_owner_persist_product_experience_baseline(uuid,text,text)'::regprocedure
  )) like '%approved_execution_count <> 1%',
  'Owner persistence is bound to one completed baseline execution and passed proof'
);

select ok(
  lower(pg_get_functiondef(
    'public.governance_owner_persist_product_experience_baseline(uuid,text,text)'::regprocedure
  )) not like '%cognitive_governance_switches%'
  and lower(pg_get_functiondef(
    'public.governance_owner_persist_product_experience_baseline(uuid,text,text)'::regprocedure
  )) not like '%cognitive_capabilities%'
  and lower(pg_get_functiondef(
    'public.governance_owner_persist_product_experience_baseline(uuid,text,text)'::regprocedure
  )) not like '%product_quality_findings%',
  'baseline persistence grants no switch, tool, UI, deploy, or finding authority'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'a3000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a3000000-0000-4000-8000-000000000002"}',
  true
);
select throws_ok(
  $$select public.governance_owner_persist_product_experience_baseline(
    'ab000000-0000-4000-8000-000000000001',
    'streaming_mobile_content_density',
    'A'
  )$$,
  '42501',
  'governance_owner_identity_required',
  'a non-Owner authenticated role cannot persist a baseline'
);

reset role;
update public.governance_approved_action_executions
set state = 'evaluating'
where id = 'ab000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'a3000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a3000000-0000-4000-8000-000000000001"}',
  true
);
select throws_ok(
  $$select public.governance_owner_persist_product_experience_baseline(
    'ab000000-0000-4000-8000-000000000001',
    'streaming_mobile_content_density',
    'A'
  )$$,
  'P0001',
  'product_experience_baseline_persistence_rejected',
  'an execution that is not completed cannot persist a baseline'
);

reset role;
update public.governance_approved_action_executions
set state = 'completed'
where id = 'ab000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'a3000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a3000000-0000-4000-8000-000000000001"}',
  true
);

select throws_ok(
  $$select public.governance_owner_persist_product_experience_baseline(
    'ab000000-0000-4000-8000-000000000001',
    'unreviewed_baseline_key',
    'A'
  )$$,
  'P0001',
  'product_experience_baseline_persistence_rejected',
  'an unknown baseline key is rejected'
);
select throws_ok(
  $$select public.governance_owner_persist_product_experience_baseline(
    'ab000000-0000-4000-8000-000000000001',
    'livekit_experience_deadlines',
    'A'
  )$$,
  'P0001',
  'product_experience_baseline_persistence_rejected',
  'visual options cannot be mislabeled as a different existing baseline type'
);
select throws_ok(
  $$select public.governance_owner_persist_product_experience_baseline(
    'ab000000-0000-4000-8000-000000000001',
    'streaming_mobile_content_density',
    'B'
  )$$,
  'P0001',
  'product_experience_baseline_persistence_rejected',
  'selection must equal the approval and decision target hash'
);

insert into baseline_persistence_result(
  baseline_id, baseline_version, baseline_hash, created
)
select
  (result->>'baselineId')::uuid,
  (result->>'baselineVersion')::integer,
  result->>'baselineHash',
  (result->>'created')::boolean
from (
  select public.governance_owner_persist_product_experience_baseline(
    'ab000000-0000-4000-8000-000000000001',
    'streaming_mobile_content_density',
    'A'
  ) result
) persisted;

select is(
  public.governance_owner_persist_product_experience_baseline(
    'ab000000-0000-4000-8000-000000000001',
    'streaming_mobile_content_density',
    'A'
  )->>'created',
  'false',
  'replaying the exact completed execution is idempotent'
);

reset role;

select is(
  (select count(*)::integer from public.product_experience_baseline_versions),
  1,
  'exact replay persists one immutable baseline version'
);
select ok(
  (
    select baseline.task_id =
      'a2000000-0000-4000-8000-000000000001'::uuid
      and baseline.project_id =
        'a1000000-0000-4000-8000-000000000001'::uuid
      and baseline.platform = 'android'
      and baseline.environment = 'production'
      and baseline.baseline_key = 'streaming_mobile_content_density'
      and baseline.baseline_version = 1
      and baseline.baseline_option = 'A'
      and baseline.baseline_manifest_hash =
        '7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df'
      and baseline.baseline_hash =
        '29b2c09ded4add3fba577e1195d3da20d0e1015ba81e88f73b1319593f0c27c9'
      and baseline.status = 'owner_approved'
      and baseline.owner_approval_version_id =
        'aa000000-0000-4000-8000-000000000001'::uuid
      and baseline.approved_execution_id =
        'ab000000-0000-4000-8000-000000000001'::uuid
    from public.product_experience_baseline_versions baseline
  ),
  'persisted baseline is bound to exact scope, approval, execution, and option'
);
select ok(
  (
    select result.created
      and result.baseline_version = 1
      and result.baseline_hash =
        '29b2c09ded4add3fba577e1195d3da20d0e1015ba81e88f73b1319593f0c27c9'
    from baseline_persistence_result result
  ),
  'first Owner persistence result reports the canonical created version'
);

select throws_ok(
  $$update public.product_experience_baseline_versions
    set baseline_option = 'B'
    where approved_execution_id =
      'ab000000-0000-4000-8000-000000000001'$$,
  '42501',
  'immutable_cognitive_evidence',
  'an approved baseline version cannot be rewritten'
);
select throws_ok(
  $$delete from public.product_experience_baseline_versions
    where approved_execution_id =
      'ab000000-0000-4000-8000-000000000001'$$,
  '42501',
  'immutable_cognitive_evidence',
  'an approved baseline version cannot be deleted'
);

select * from finish();
rollback;
