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

insert into auth.users(id, is_sso_user, is_anonymous, email_confirmed_at)
values
  ('a3000000-0000-4000-8000-000000000001', false, false, now()),
  ('a3000000-0000-4000-8000-000000000002', false, false, now());

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
  '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba',
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

-- Preserve the inherited baseline-approval lifecycle as an explicit
-- database-owner-only legacy decision. Runtime callers cannot disable this
-- trigger; the activation-gate pgTAP separately proves current model
-- attestations and independence remain fail closed.
alter table public.governance_decision_manifests
  disable trigger governance_decision_model_independence_before_insert;
insert into public.governance_decision_manifests(
  id, deliberation_id, evidence_packet_id, selected_proposal_id, task_id,
  project_id, platform, environment, decision_key, source_commit,
  architecture_graph_digest, evidence_manifest_hash, research_claim_hashes,
  selected_option_hash, rejected_option_hashes, council_attestation_hash,
  votes_hash, vetoes_hash, dissent_hash, stakeholder_impact_hash, risk_level,
  required_test_ids, capability_scope_hash, budget_hash, maximum_executions,
  rollback_hash, decision_hash, model_independence_assessment_id,
  model_independence_status, model_independence_evidence_hash,
  status, expires_at, finalized_at
) values (
  'a8000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001',
  'a6000000-0000-4000-8000-000000000001',
  'a7000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'android', 'production', 'baseline-persistence-decision', repeat('6',40),
  repeat('7',64), repeat('8',64), '{}'::text[],
  '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba',
  array[
    '9e891de1b46cd19405b43178dbd34ed0ea1d96b4eebcc7b404f4f3d9f6ba3dc5',
    '29b2c09ded4add3fba577e1195d3da20d0e1015ba81e88f73b1319593f0c27c9'
  ],
  repeat('c',64), repeat('d',64), repeat('e',64), repeat('f',64),
  repeat('1',64), 'low', array['baseline-owner-persistence-test'],
  repeat('2',64), repeat('a',64), 1, repeat('4',64), repeat('5',64),
  ('deliberation-' || encode(extensions.digest(convert_to(
    'a5000000-0000-4000-8000-000000000001','UTF8'
  ),'sha256'),'hex')),
  'MODEL_INDEPENDENCE_VERIFIED',repeat('6',64),
  'finalized', transaction_timestamp() + interval '1 day',
  transaction_timestamp()
);
alter table public.governance_decision_manifests
  enable trigger governance_decision_model_independence_before_insert;

create temporary table baseline_chain_state(
  approval_id uuid,
  approval_version_id uuid,
  approval_hash text,
  execution_id uuid,
  evaluator_proof_hash text
);
grant select, insert, update on baseline_chain_state
  to authenticated, service_role;

select is(
  (
    select decision.model_independence_status
    from public.governance_decision_manifests decision
    where decision.id = 'a8000000-0000-4000-8000-000000000001'
  ),
  'MODEL_INDEPENDENCE_VERIFIED',
  'explicit legacy decision preserves the downstream Owner lifecycle fixture'
);

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
select is(
  public.governance_register_two_party_service_principal(
    'product_experience_baseline_service',
    encode(
      extensions.digest(
        convert_to('synthetic-baseline-assertion-000000000000','UTF8'),
        'sha256'
      ),
      'hex'
    ),
    array['visual_experience_canary'],
    transaction_timestamp() + interval '1 day'
  )->>'status',
  'registered',
  'Owner registers the closed baseline executor assertion'
);
select is(
  public.governance_register_two_party_service_principal(
    'cognitive_product_quality_evaluator',
    encode(
      extensions.digest(
        convert_to('synthetic-evaluator-assertion-000000000000','UTF8'),
        'sha256'
      ),
      'hex'
    ),
    array['independent_evaluation'],
    transaction_timestamp() + interval '1 day'
  )->>'status',
  'registered',
  'Owner registers the isolated product-quality evaluator assertion'
);

insert into baseline_chain_state(
  approval_id, approval_version_id, approval_hash
)
select
  (result->>'approvalId')::uuid,
  (result->>'approvalVersionId')::uuid,
  result->>'approvalHash'
from (
  select public.governance_record_owner_approval(
    'a8000000-0000-4000-8000-000000000001',
    'baseline-owner-persistence-approval',
    repeat('1',64), repeat('7',64), repeat('6',40), repeat('7',64),
    repeat('2',64), 'Chillywood2025/chillywood-mobile',
    'codex/cognitive-baseline-persistence-fixture',
    'visual_sentinel', 'visual_experience_canary',
    '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba',
    '{}'::text[], '{}'::text[], '{}'::text[], repeat('a',64),
    0, 1, 4096, 1, repeat('3',64),
    array['baseline-owner-persistence-test'], repeat('4',64),
    repeat('4',64), interval '23 hours'
  ) result
) approval;
reset role;

select is(
  (select count(*)::integer from baseline_chain_state),
  1,
  'real authenticated Owner records one exact approval version'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

update baseline_chain_state
set execution_id = (
  select (result->>'executionId')::uuid
  from (
    select public.governance_claim_approved_action(
      (select approval_version_id from baseline_chain_state),
      'product_experience_baseline_service',
      'synthetic-baseline-assertion-000000000000',
      repeat('5',64), repeat('7',64),
      (select approval_hash from baseline_chain_state),
      'a2000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001',
      'Chillywood2025/chillywood-mobile',
      'codex/cognitive-baseline-persistence-fixture',
      'android', 'production', 'visual_sentinel',
      'visual_experience_canary',
      '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba',
      repeat('a',64), repeat('3',64), repeat('4',64), repeat('4',64)
    ) result
  ) claimed
);

select is(
  public.governance_begin_approved_execution(
    (select execution_id from baseline_chain_state),
    'product_experience_baseline_service',
    'synthetic-baseline-assertion-000000000000',
    'preflight'
  )->>'state',
  'preflight',
  'baseline executor enters preflight'
);
select is(
  public.governance_begin_approved_execution(
    (select execution_id from baseline_chain_state),
    'product_experience_baseline_service',
    'synthetic-baseline-assertion-000000000000',
    'executing'
  )->>'state',
  'executing',
  'baseline executor enters execution'
);
select is(
  public.governance_stage_product_experience_baseline_v1(
    (select execution_id from baseline_chain_state),
    'product_experience_baseline_service',
    'synthetic-baseline-assertion-000000000000',
    repeat('6',40),
    'chillywood-product-experience-baseline-v1',
    'C', 'creator_balanced',
    '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba',
    '7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df'
  )->>'state',
  'postflight',
  'baseline executor stages exact Option C without UI mutation authority'
);
select is(
  public.governance_begin_approved_execution(
    (select execution_id from baseline_chain_state),
    'product_experience_baseline_service',
    'synthetic-baseline-assertion-000000000000',
    'evaluating'
  )->>'state',
  'evaluating',
  'staged baseline enters independent evaluation'
);

select throws_ok(
  $$select public.governance_complete_approved_execution(
    (select execution_id from baseline_chain_state),
    'product_experience_baseline_service',
    'synthetic-baseline-assertion-000000000000',
    repeat('d',64), repeat('e',64)
  )$$,
  'P0001',
  'two_party_execution_completion_rejected',
  'baseline executor cannot complete before independent proof'
);
select throws_ok(
  $$select public.governance_evaluate_product_experience_baseline_v1(
    (select execution_id from baseline_chain_state),
    'product_experience_baseline_service',
    'synthetic-baseline-assertion-000000000000',
    repeat('d',64)
  )$$,
  '42501',
  'two_party_service_principal_required',
  'baseline executor cannot self-evaluate'
);

update baseline_chain_state
set evaluator_proof_hash = (
  select result->>'evaluatorProofHash'
  from (
    select public.governance_evaluate_product_experience_baseline_v1(
      (select execution_id from baseline_chain_state),
      'cognitive_product_quality_evaluator',
      'synthetic-evaluator-assertion-000000000000',
      repeat('d',64)
    ) result
  ) evaluated
);

select is(
  public.governance_complete_approved_execution(
    (select execution_id from baseline_chain_state),
    'product_experience_baseline_service',
    'synthetic-baseline-assertion-000000000000',
    repeat('d',64),
    (select evaluator_proof_hash from baseline_chain_state)
  )->>'state',
  'completed',
  'independently evaluated baseline execution completes'
);
reset role;

create temporary table baseline_persistence_result(
  baseline_id uuid,
  baseline_version integer,
  baseline_hash text,
  created boolean
);
grant select, insert on baseline_persistence_result to authenticated;
grant select, insert on baseline_persistence_result to service_role;

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
select has_column(
  'public',
  'product_experience_baseline_versions',
  'baseline_identifier',
  'baseline versions retain the immutable baseline identifier'
);
select has_column(
  'public',
  'product_experience_baseline_versions',
  'baseline_option_name',
  'baseline versions retain the canonical selected option name'
);
select has_column(
  'public',
  'product_experience_baseline_versions',
  'source_commit',
  'baseline versions retain the approved source commit'
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
  has_function_privilege(
    'service_role',
    'public.governance_product_baseline_persist_completed_execution(uuid,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.governance_product_baseline_persist_completed_execution(uuid,text,text)',
    'EXECUTE'
  ),
  'only the asserted baseline service path can service-persist'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.governance_stage_product_experience_baseline_v1(uuid,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.governance_evaluate_product_experience_baseline_v1(uuid,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.governance_stage_product_experience_baseline_v1(uuid,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.governance_evaluate_product_experience_baseline_v1(uuid,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.governance_persist_product_experience_baseline_v1_internal(uuid,uuid)',
    'EXECUTE'
  ),
  'stage, evaluation, and private persistence boundaries are closed'
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
  )
  and not has_table_privilege(
    'service_role',
    'public.product_experience_baseline_execution_stages',
    'INSERT'
  )
  and not has_table_privilege(
    'service_role',
    'public.product_experience_baseline_lifecycle_events',
    'INSERT'
  ),
  'neither clients nor service_role can bypass the Owner persistence RPC'
);

select ok(
  lower(pg_get_functiondef(
    'public.governance_owner_persist_product_experience_baseline(uuid,text,text)'::regprocedure
  )) like '%governance_assert_exact_owner()%'
  and lower(pg_get_functiondef(
    'public.governance_persist_product_experience_baseline_v1_internal(uuid,uuid)'::regprocedure
  )) like '%product_experience_baseline_service%'
  and lower(pg_get_functiondef(
    'public.governance_persist_product_experience_baseline_v1_internal(uuid,uuid)'::regprocedure
  )) like '%visual_experience_canary%'
  and lower(pg_get_functiondef(
    'public.governance_persist_product_experience_baseline_v1_internal(uuid,uuid)'::regprocedure
  )) like '%proof_value.verdict <> ''passed''%'
  and lower(pg_get_functiondef(
    'public.governance_persist_product_experience_baseline_v1_internal(uuid,uuid)'::regprocedure
  )) like '%decision_value.selected_option_hash <> option_hash_value%'
  and lower(pg_get_functiondef(
    'public.governance_persist_product_experience_baseline_v1_internal(uuid,uuid)'::regprocedure
  )) like '%approved_execution_count <> 1%',
  'Owner persistence is bound to one completed baseline execution and passed proof'
);

select ok(
  lower(pg_get_functiondef(
    'public.governance_persist_product_experience_baseline_v1_internal(uuid,uuid)'::regprocedure
  )) not like '%cognitive_governance_switches%'
  and lower(pg_get_functiondef(
    'public.governance_persist_product_experience_baseline_v1_internal(uuid,uuid)'::regprocedure
  )) not like '%cognitive_capabilities%'
  and lower(pg_get_functiondef(
    'public.governance_persist_product_experience_baseline_v1_internal(uuid,uuid)'::regprocedure
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
    (select execution_id from baseline_chain_state),
    'streaming_mobile_content_density',
    'C'
  )$$,
  '42501',
  'governance_owner_identity_required',
  'a non-Owner authenticated role cannot persist a baseline'
);

reset role;
update public.governance_approved_action_executions
set state = 'evaluating'
where id = (select execution_id from baseline_chain_state);

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
    (select execution_id from baseline_chain_state),
    'streaming_mobile_content_density',
    'C'
  )$$,
  'P0001',
  'product_experience_baseline_persistence_rejected',
  'an execution that is not completed cannot persist a baseline'
);

reset role;
update public.governance_approved_action_executions
set state = 'completed'
where id = (select execution_id from baseline_chain_state);

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
    (select execution_id from baseline_chain_state),
    'unreviewed_baseline_key',
    'C'
  )$$,
  'P0001',
  'product_experience_baseline_persistence_rejected',
  'an unknown baseline key is rejected'
);
select throws_ok(
  $$select public.governance_owner_persist_product_experience_baseline(
    (select execution_id from baseline_chain_state),
    'livekit_experience_deadlines',
    'C'
  )$$,
  'P0001',
  'product_experience_baseline_persistence_rejected',
  'visual options cannot be mislabeled as a different existing baseline type'
);
select throws_ok(
  $$select public.governance_owner_persist_product_experience_baseline(
    (select execution_id from baseline_chain_state),
    'streaming_mobile_content_density',
    'A'
  )$$,
  'P0001',
  'product_experience_baseline_persistence_rejected',
  'historical Option A cannot be persisted as baseline v1'
);
select throws_ok(
  $$select public.governance_owner_persist_product_experience_baseline(
    (select execution_id from baseline_chain_state),
    'streaming_mobile_content_density',
    'B'
  )$$,
  'P0001',
  'product_experience_baseline_persistence_rejected',
  'historical Option B cannot be persisted as baseline v1'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

insert into baseline_persistence_result(
  baseline_id, baseline_version, baseline_hash, created
)
select
  (result->>'baselineVersionId')::uuid,
  (result->>'baselineVersion')::integer,
  result->>'baselineHash',
  (result->>'created')::boolean
from (
  select public.governance_product_baseline_persist_completed_execution(
    (select execution_id from baseline_chain_state),
    'product_experience_baseline_service',
    'synthetic-baseline-assertion-000000000000'
  ) result
) persisted;

select is(
  public.governance_product_baseline_persist_completed_execution(
    (select execution_id from baseline_chain_state),
    'product_experience_baseline_service',
    'synthetic-baseline-assertion-000000000000'
  )->>'created',
  'false',
  'replaying the exact service persistence is idempotent'
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
      and baseline.baseline_identifier =
        'chillywood-product-experience-baseline-v1'
      and baseline.baseline_option = 'C'
      and baseline.baseline_option_name = 'creator_balanced'
      and baseline.source_commit = repeat('6',40)
      and baseline.baseline_manifest_hash =
        '7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df'
      and baseline.baseline_hash =
        '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'
      and baseline.status = 'owner_approved'
      and baseline.owner_approval_version_id =
        (select approval_version_id from baseline_chain_state)
      and baseline.approved_execution_id =
        (select execution_id from baseline_chain_state)
    from public.product_experience_baseline_versions baseline
  ),
  'persisted baseline is bound to exact scope, approval, execution, and option'
);
select is(
  (
    public.product_experience_resolve_current_active_baseline(
      'a2000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001',
      'android', 'production', 'streaming_mobile_content_density'
    )->>'baselineHash'
  ),
  '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba',
  'deterministic resolver returns exact active Option C'
);
select ok(
  public.product_experience_lock_effective_baseline_v1(
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'android','production',
    jsonb_build_object(
      'baselineState','approved_baseline',
      'baselineId','chillywood-product-experience-baseline-v1',
      'baselineComparisonHash',
      '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'
    )
  ),
  'final sentinel boundary locks and resolves the exact active Option C version'
);
select ok(
  (
    select count(*)=2
    from pg_trigger
    where not tgisinternal
      and tgname in (
        'product_experience_sentinel_runs_effective_baseline_required',
        'product_quality_findings_effective_baseline_required'
      )
  )
  and not has_function_privilege(
    'service_role',
    'public.product_experience_lock_effective_baseline_v1(uuid,uuid,public.cognitive_platform,public.cognitive_environment,jsonb)',
    'EXECUTE'
  ),
  'collection and triage table boundaries own the non-client baseline recheck'
);
select is(
  (
    select count(*)::integer
    from public.product_experience_baseline_lifecycle_events
    where event_type = 'owner_approved'
  ),
  1,
  'approval persistence appends one immutable lifecycle event'
);
select ok(
  (
    select result.created
      and result.baseline_version = 1
      and result.baseline_hash =
        '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'
    from baseline_persistence_result result
  ),
  'first Owner persistence result reports the canonical created version'
);

select throws_ok(
  $$update public.product_experience_baseline_versions
    set baseline_option = 'B'
    where approved_execution_id =
      (select execution_id from baseline_chain_state)$$,
  '42501',
  'immutable_cognitive_evidence',
  'an approved baseline version cannot be rewritten'
);
select throws_ok(
  $$delete from public.product_experience_baseline_versions
    where approved_execution_id =
      (select execution_id from baseline_chain_state)$$,
  '42501',
  'immutable_cognitive_evidence',
  'an approved baseline version cannot be deleted'
);

insert into public.governance_approved_action_executions(
  id, approval_record_id, approval_version_id, task_id, project_id,
  repository_full_name, branch_name, platform, environment, provider,
  operation, claim_sequence, state, service_identity, service_identity_hash,
  worker_assertion_hash, decision_manifest_hash, plan_snapshot_hash,
  approval_hash, target_resource_hash, budget_hash, tests_hash,
  evaluator_requirement_hash, rollback_hash, execution_receipt_hash,
  evaluator_proof_hash, claimed_at, began_at, completed_at, updated_at
)
select
  'ad000000-0000-4000-8000-000000000001',
  execution.approval_record_id, execution.approval_version_id,
  execution.task_id, execution.project_id, execution.repository_full_name,
  execution.branch_name, execution.platform, execution.environment,
  execution.provider, execution.operation, 2, 'completed',
  execution.service_identity, execution.service_identity_hash,
  execution.worker_assertion_hash, execution.decision_manifest_hash,
  execution.plan_snapshot_hash, execution.approval_hash, repeat('8',64),
  execution.budget_hash, execution.tests_hash,
  execution.evaluator_requirement_hash, execution.rollback_hash,
  repeat('7',64), repeat('6',64), transaction_timestamp(),
  transaction_timestamp(), transaction_timestamp(), transaction_timestamp()
from public.governance_approved_action_executions execution
where execution.id = (select execution_id from baseline_chain_state);

insert into public.product_experience_baseline_versions(
  id, task_id, project_id, platform, environment, baseline_key,
  baseline_version, baseline_hash, status, owner_approval_version_id,
  approved_execution_id, baseline_manifest_hash, baseline_option,
  baseline_identifier, baseline_option_name, source_commit,
  approved_at, created_at
) values (
  'ae000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'android', 'production', 'streaming_mobile_content_density',
  2, repeat('8',64), 'owner_approved',
  (select approval_version_id from baseline_chain_state),
  'ad000000-0000-4000-8000-000000000001',
  repeat('7',64), 'D',
  'chillywood-product-experience-baseline-v2',
  'creator_balanced_v2', repeat('6',40),
  transaction_timestamp(), transaction_timestamp()
);
insert into public.product_experience_baseline_lifecycle_events(
  baseline_version_id, task_id, project_id, platform, environment,
  event_sequence, event_type, event_hash, reason_hash, actor_user_id,
  actor_identity_hash
) values (
  'ae000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'android', 'production', 1, 'owner_approved', repeat('5',64),
  repeat('8',64), 'a3000000-0000-4000-8000-000000000001',
  encode(
    extensions.digest(
      convert_to('a3000000-0000-4000-8000-000000000001','UTF8'),
      'sha256'
    ),
    'hex'
  )
);

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
select is(
  public.governance_owner_supersede_product_experience_baseline(
    (select baseline_id from baseline_persistence_result),
    'ae000000-0000-4000-8000-000000000001',
    repeat('4',64)
  )->>'status',
  'superseded',
  'exact Owner appends a versioned supersession event'
);
select is(
  (
    public.product_experience_resolve_current_active_baseline(
      'a2000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001',
      'android', 'production', 'streaming_mobile_content_density'
    )->>'baselineHash'
  ),
  repeat('8',64),
  'active resolver moves deterministically to the approved replacement'
);
reset role;
select ok(
  not public.product_experience_lock_effective_baseline_v1(
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'android','production',
    jsonb_build_object(
      'baselineState','approved_baseline',
      'baselineId','chillywood-product-experience-baseline-v1',
      'baselineComparisonHash',
      '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'
    )
  ),
  'superseded Option C cannot be reused after the current resolver advances'
);
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
select is(
  public.governance_owner_revoke_product_experience_baseline(
    'ae000000-0000-4000-8000-000000000001',
    repeat('9',64)
  )->>'status',
  'revoked',
  'exact approving Owner appends baseline revocation'
);
reset role;

select is(
  public.product_experience_resolve_current_active_baseline(
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'android', 'production', 'streaming_mobile_content_density'
  ),
  null::jsonb,
  'revoked baseline is rejected by the active resolver'
);
select ok(
  not public.product_experience_lock_effective_baseline_v1(
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'android','production',
    jsonb_build_object(
      'baselineState','approved_baseline',
      'baselineId','chillywood-product-experience-baseline-v1',
      'baselineComparisonHash',
      '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba'
    )
  ),
  'revoked baseline cannot pass a later sentinel or triage lock/recheck'
);
select throws_ok(
  $$update public.product_experience_baseline_lifecycle_events
    set reason_hash = repeat('8',64)
    where event_type in ('revoked','superseded')$$,
  '42501',
  'immutable_cognitive_evidence',
  'revocation history is append-only'
);

select * from finish();
rollback;
