begin;
select no_plan();

insert into public.cognitive_projects(
  id, repository_full_name, source_state, activation_state,
  scheduler_state, production_authority
) values (
  'e1000000-0000-4000-8000-000000000001',
  'Chillywood2025/chillywood-mobile',
  'collective_governance_source_complete_not_deployed',
  'off', 'bounded_level01', false
);

insert into public.intelligence_tasks(
  id, project_id, platform, environment, repository_full_name,
  branch_name, task_key, objective_hash, actor_identity, deadman_at
) values (
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'shared', 'production', 'Chillywood2025/chillywood-mobile',
  'codex/cognitive-level01-staged-worker-activation',
  'cognitive-level01-canary-control', repeat('a', 64),
  'option-c-unclaimed-source-amendment-test',
  transaction_timestamp() + interval '2 days'
);

insert into public.platform_role_memberships(user_id, email, role, status)
values
  ('e3000000-0000-4000-8000-000000000001', null, 'owner', 'active'),
  ('e3000000-0000-4000-8000-000000000002', null, 'super_admin', 'active');

insert into public.governance_constitutions(
  id, task_id, project_id, platform, environment, constitution_key,
  title, current_version, status, created_by_identity
) values (
  'e4000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'shared', 'production', 'collective-governance-v1',
  'Unclaimed Option C source amendment fixture',
  1, 'source_only', 'fixture'
);

insert into public.governance_constitution_versions(
  id, constitution_id, task_id, project_id, platform, environment,
  version_number, constitution_hash, policy_snapshot, status,
  proposed_by_identity, rollback_hash
) values (
  'e4100000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'shared', 'production', 1, repeat('b', 64),
  '{"activation":"off","providerIndependentBaseline":true}'::jsonb,
  'draft', 'fixture', repeat('c', 64)
);

create temporary table option_c_source_amendment_state(
  decision_manifest_id uuid,
  decision_hash text,
  budget_hash text,
  initial_tests_hash text,
  initial_evaluator_requirement_hash text,
  initial_rollback_hash text,
  approval_id uuid,
  prior_approval_version_id uuid,
  prior_approval_hash text,
  amended_approval_version_id uuid,
  amended_approval_hash text
);
grant select, insert, update on option_c_source_amendment_state
  to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'e3000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"e3000000-0000-4000-8000-000000000001"}',
  true
);

insert into option_c_source_amendment_state(
  decision_manifest_id, decision_hash, budget_hash, initial_tests_hash,
  initial_evaluator_requirement_hash, initial_rollback_hash
)
select
  (result->>'decisionManifestId')::uuid,
  result->>'decisionHash',
  result->>'budgetHash',
  result->>'testsHash',
  result->>'evaluatorRequirementHash',
  result->>'rollbackHash'
from (
  select public.governance_prepare_product_baseline_v1_owner_selection(
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'c0d6e8f5b403324fff2d12e89d456f9cbe5e4e38',
    repeat('2', 40),
    '0d377e19a200e0c970bef32ca141a588a7f4097d2c21ac69951ea19356edcb87',
    repeat('4', 64), repeat('5', 64), repeat('6', 64),
    interval '23 hours'
  ) result
) prepared;

update option_c_source_amendment_state
set (
  approval_id, prior_approval_version_id, prior_approval_hash
) = (
  select
    (result->>'approvalId')::uuid,
    (result->>'approvalVersionId')::uuid,
    result->>'approvalHash'
  from (
    select
      public.governance_record_product_experience_baseline_v1_owner_approval(
        (select decision_manifest_id
         from option_c_source_amendment_state),
        repeat('7', 64),
        interval '22 hours'
      ) result
  ) approved
);

select is(
  public.governance_register_two_party_service_principal(
    'product_experience_baseline_service',
    encode(extensions.digest(
      convert_to('source-amendment-baseline-assertion-000000', 'UTF8'),
      'sha256'
    ), 'hex'),
    array['visual_experience_canary'],
    transaction_timestamp() + interval '1 day'
  )->>'status',
  'registered',
  'the Owner registers the baseline executor for the claim guard'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'e3000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"e3000000-0000-4000-8000-000000000002"}',
  true
);
select throws_ok(
  $$select
    public.governance_amend_unclaimed_product_baseline_v1_owner_approval_source(
      (select prior_approval_version_id
       from option_c_source_amendment_state),
      repeat('9', 40), repeat('8', 40),
      'b8d974ae532bc7b3a26230048376af19d507fb0fb64069c2660868ff0c547bf9',
      repeat('b', 64), repeat('c', 64),
      repeat('d', 64), repeat('e', 64),
      interval '21 hours'
    )$$,
  '42501',
  'governance_owner_identity_required',
  'a non-Owner cannot amend the immutable source approval'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'e3000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"e3000000-0000-4000-8000-000000000001"}',
  true
);
select throws_ok(
  $$select
    public.governance_amend_unclaimed_product_baseline_v1_owner_approval_source(
      (select prior_approval_version_id
       from option_c_source_amendment_state),
      repeat('9', 40), repeat('8', 40), repeat('f', 64),
      repeat('b', 64), repeat('c', 64),
      repeat('d', 64), repeat('e', 64),
      interval '21 hours'
    )$$,
  'P0001',
  'product_experience_baseline_source_amendment_rejected',
  'the Owner cannot substitute an unreviewed amended source graph'
);
reset role;

savepoint before_claim_guard;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
select lives_ok(
  $$select public.governance_claim_approved_action(
    (select prior_approval_version_id
     from option_c_source_amendment_state),
    'product_experience_baseline_service',
    'source-amendment-baseline-assertion-000000',
    (select decision_hash from option_c_source_amendment_state),
    repeat('7', 64),
    (select prior_approval_hash from option_c_source_amendment_state),
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'Chillywood2025/chillywood-mobile',
    'codex/cognitive-level01-staged-worker-activation',
    'shared', 'production', 'visual_sentinel',
    'visual_experience_canary',
    '34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba',
    (select budget_hash from option_c_source_amendment_state),
    (select initial_tests_hash from option_c_source_amendment_state),
    (select initial_evaluator_requirement_hash
     from option_c_source_amendment_state),
    (select initial_rollback_hash from option_c_source_amendment_state)
  )$$,
  'the original version can claim before it is superseded'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'e3000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"e3000000-0000-4000-8000-000000000001"}',
  true
);
select throws_ok(
  $$select
    public.governance_amend_unclaimed_product_baseline_v1_owner_approval_source(
      (select prior_approval_version_id
       from option_c_source_amendment_state),
      repeat('9', 40), repeat('8', 40),
      'b8d974ae532bc7b3a26230048376af19d507fb0fb64069c2660868ff0c547bf9',
      repeat('b', 64), repeat('c', 64),
      repeat('d', 64), repeat('e', 64),
      interval '21 hours'
    )$$,
  'P0001',
  'product_experience_baseline_source_amendment_rejected',
  'any winning claim makes source amendment impossible'
);
reset role;
rollback to savepoint before_claim_guard;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'e3000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"e3000000-0000-4000-8000-000000000001"}',
  true
);

update option_c_source_amendment_state
set (
  amended_approval_version_id, amended_approval_hash
) = (
  select
    (result->>'approvalVersionId')::uuid,
    result->>'approvalHash'
  from (
    select
      public.governance_amend_unclaimed_product_baseline_v1_owner_approval_source(
        (select prior_approval_version_id
         from option_c_source_amendment_state),
        repeat('9', 40), repeat('8', 40),
        'b8d974ae532bc7b3a26230048376af19d507fb0fb64069c2660868ff0c547bf9',
        repeat('b', 64), repeat('c', 64),
        repeat('d', 64), repeat('e', 64),
        interval '21 hours'
      ) result
  ) amended
);

select ok(
  (
    select
      amendment.prior_source_commit =
        'c0d6e8f5b403324fff2d12e89d456f9cbe5e4e38'
      and amendment.amended_source_commit = repeat('9', 40)
      and amendment.amended_source_tree = repeat('8', 40)
      and amendment.amended_source_module_graph_hash =
        'b8d974ae532bc7b3a26230048376af19d507fb0fb64069c2660868ff0c547bf9'
      and amendment.reason_code =
        'hyperdrive_initial_connection_timeout_alignment'
    from public.product_experience_baseline_owner_source_amendments amendment
    where amendment.prior_approval_version_id = (
      select prior_approval_version_id
      from option_c_source_amendment_state
    )
  ),
  'the immutable amendment binds exact prior and amended source evidence'
);
select ok(
  (
    select
      prior_state.state = 'superseded'
      and prior_state.executions_claimed = 0
      and amended_state.state = 'active'
      and amended_state.executions_claimed = 0
      and amended.version_number = 2
      and amended.prior_version_id = prior.id
      and amended.source_commit = repeat('9', 40)
      and amended.architecture_graph_digest =
        'b8d974ae532bc7b3a26230048376af19d507fb0fb64069c2660868ff0c547bf9'
      and amended.maximum_executions = 1
      and amended.material_delta
    from public.governance_owner_approval_versions prior
    join public.governance_owner_approval_version_states prior_state
      on prior_state.approval_version_id = prior.id
    join public.governance_owner_approval_versions amended
      on amended.id = (
        select amended_approval_version_id
        from option_c_source_amendment_state
      )
    join public.governance_owner_approval_version_states amended_state
      on amended_state.approval_version_id = amended.id
    where prior.id = (
      select prior_approval_version_id
      from option_c_source_amendment_state
    )
  ),
  'version 1 is preserved and superseded while exact version 2 is active'
);
select is(
  (
    select current_version
    from public.governance_owner_approval_records
    where id = (
      select approval_id from option_c_source_amendment_state
    )
  ),
  2,
  'the approval record points at immutable source-amended version 2'
);
select throws_ok(
  $$select
    public.governance_amend_unclaimed_product_baseline_v1_owner_approval_source(
      (select prior_approval_version_id
       from option_c_source_amendment_state),
      repeat('9', 40), repeat('8', 40),
      'b8d974ae532bc7b3a26230048376af19d507fb0fb64069c2660868ff0c547bf9',
      repeat('b', 64), repeat('c', 64),
      repeat('d', 64), repeat('e', 64),
      interval '21 hours'
    )$$,
  'P0001',
  'product_experience_baseline_source_amendment_rejected',
  'the one-time source amendment cannot replay'
);
reset role;
select throws_ok(
  $$update public.product_experience_baseline_owner_source_amendments
    set reason_code = 'mutated'
    where prior_approval_version_id = (
      select prior_approval_version_id
      from option_c_source_amendment_state
    )$$,
  '42501',
  'immutable_cognitive_evidence',
  'the exact source-amendment receipt cannot be rewritten'
);

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid =
      'public.product_experience_baseline_owner_source_amendments'::regclass
  ),
  'the source-amendment receipt table has forced RLS'
);
select is(
  (
    select count(*)::integer
    from public.product_experience_baseline_versions
  ),
  0,
  'source amendment does not fabricate a completed effective baseline'
);
select is(
  (
    select count(*)::integer
    from public.governance_model_execution_attestations
    where task_id = 'e2000000-0000-4000-8000-000000000001'
  ),
  0,
  'source amendment fabricates no model-provider execution'
);

select * from finish();
rollback;
