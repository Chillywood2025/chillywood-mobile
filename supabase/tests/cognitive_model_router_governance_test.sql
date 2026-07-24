begin;
select no_plan();

-- MODEL_ROUTER_FIXTURE_BEGIN
insert into auth.users(id, is_sso_user, is_anonymous)
values ('d2000000-0000-4000-8000-000000000001', false, false);

insert into public.platform_role_memberships(user_id, email, role, status)
values (
  'd2000000-0000-4000-8000-000000000001',
  null,
  'owner',
  'active'
);

insert into public.cognitive_projects(
  id, repository_full_name, source_state, activation_state,
  scheduler_state, production_authority
) values (
  'd1000000-0000-4000-8000-000000000001',
  'Chillywood2025/chillywood-mobile',
  'collective_governance_source_complete_not_deployed',
  'off',
  'bounded_level01',
  false
);

insert into public.intelligence_tasks(
  id, project_id, platform, environment, repository_full_name,
  branch_name, task_key, objective_hash, status, actor_identity,
  deadman_at, retention_until, data_class
) values (
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared',
  'production',
  'Chillywood2025/chillywood-mobile',
  'codex/cognitive-model-router-test',
  'cognitive-model-router-governance-test',
  repeat('1', 64),
  'received',
  'model-router-test-fixture',
  transaction_timestamp() + interval '1 day',
  transaction_timestamp() + interval '30 days',
  'operational_metadata'
);

insert into public.autonomous_system_emergency_states(
  system_id, status, reason, updated_at, metadata
) values (
  'product_intelligence_operator',
  'active',
  'model router governance fixture',
  transaction_timestamp(),
  '{"fixture":"model-router-governance"}'::jsonb
)
on conflict (system_id) do update
set status = excluded.status,
    reason = excluded.reason,
    updated_at = excluded.updated_at,
    metadata = excluded.metadata;

insert into public.cognitive_service_identities(
  service_identity, credential_hash, status, issued_at, expires_at,
  revoked_at
) values (
  'cognitive_model_router',
  encode(
    extensions.digest(
      convert_to('model-router-service-token-test-only-0001', 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  'active',
  transaction_timestamp(),
  transaction_timestamp() + interval '1 day',
  null
)
on conflict (service_identity) do update
set credential_hash = excluded.credential_hash,
    status = 'active',
    issued_at = excluded.issued_at,
    expires_at = excluded.expires_at,
    revoked_at = null;

insert into public.governance_constitutions(
  id, task_id, project_id, platform, environment, constitution_key, title,
  current_version, status, created_by_identity
) values (
  'd4000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production','model-router-constitution',
  'Model Router Constitution Fixture',1,'active','fixture'
);

insert into public.governance_constitution_versions(
  id, constitution_id, task_id, project_id, platform, environment,
  version_number, constitution_hash, policy_snapshot, status,
  proposed_by_identity, independent_review_hash, owner_approved_by,
  owner_approved_at, activation_not_before, rollback_hash
) values (
  'd4000000-0000-4000-8000-000000000002',
  'd4000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production',1,repeat('2',64),
  '{"activation":"off","modelRouter":"advisoryOnly"}'::jsonb,
  'active','fixture',repeat('3',64),
  'd2000000-0000-4000-8000-000000000001',
  transaction_timestamp()-interval '1 minute',
  transaction_timestamp()-interval '1 minute',
  repeat('4',64)
);

insert into public.governance_deliberations(
  id, task_id, project_id, platform, environment, constitution_version_id,
  deliberation_key, objective_hash, source_commit,
  architecture_graph_digest, risk_level, status, required_quorum,
  budget_ceiling, deadline_at, decided_at
) values (
  'd5000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production',
  'd4000000-0000-4000-8000-000000000002',
  'model-router-deliberation',repeat('5',64),repeat('6',40),
  repeat('7',64),'low','decided',3,1,
  transaction_timestamp()+interval '1 day',transaction_timestamp()
);

insert into public.governance_evidence_packets(
  id, deliberation_id, task_id, project_id, platform, environment,
  packet_hash, source_commit, architecture_graph_digest,
  research_claim_hashes, provider_state_hash, known_unknowns,
  approval_level, budget_hash, rollback_requirements_hash,
  freshness_deadline
) values (
  'd6000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production',repeat('8',64),repeat('6',40),repeat('7',64),
  '{}'::text[],repeat('9',64),'{"fixture":"safe"}'::jsonb,
  'owner',repeat('a',64),repeat('b',64),
  transaction_timestamp()+interval '23 hours'
);

insert into public.governance_proposals(
  id, deliberation_id, task_id, project_id, platform, environment,
  option_kind, proposal_hash, user_value_score, risk_score,
  reversibility, cost_estimate, proof_burden, rollback_hash
) values (
  'd7000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production','minimal_repair',repeat('c',64),10,1,
  'full',0,'source',repeat('4',64)
);

insert into public.governance_model_execution_attestations(
  assessment_id, task_id, project_id, platform, environment, council_role,
  provider_identity_hash, model_family, model_version,
  execution_identity_hash, evidence_packet_hash,
  prompt_template_version_hash, output_hash, blind_first_round,
  correlation_class, cost, latency_ms
) values
  (
    ('deliberation-' || encode(extensions.digest(
      convert_to('d5000000-0000-4000-8000-000000000001','UTF8'),
      'sha256'
    ),'hex')),
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production','product_user_experience',repeat('1',64),
    'family-a','model-a',repeat('2',64),repeat('3',64),repeat('4',64),
    repeat('5',64),true,'cross_provider',0.1,100
  ),
  (
    ('deliberation-' || encode(extensions.digest(
      convert_to('d5000000-0000-4000-8000-000000000001','UTF8'),
      'sha256'
    ),'hex')),
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production','security_privacy',repeat('2',64),
    'family-b','model-b',repeat('3',64),repeat('4',64),repeat('5',64),
    repeat('6',64),true,'cross_provider',0.1,100
  ),
  (
    ('deliberation-' || encode(extensions.digest(
      convert_to('d5000000-0000-4000-8000-000000000001','UTF8'),
      'sha256'
    ),'hex')),
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production','reliability_release',repeat('3',64),
    'family-c','model-c',repeat('4',64),repeat('5',64),repeat('6',64),
    repeat('7',64),true,'cross_provider',0.1,100
  );

insert into public.governance_decision_manifests(
  id, deliberation_id, evidence_packet_id, selected_proposal_id, task_id,
  project_id, platform, environment, decision_key, source_commit,
  architecture_graph_digest, evidence_manifest_hash,
  research_claim_hashes, selected_option_hash, rejected_option_hashes,
  council_attestation_hash, votes_hash, vetoes_hash, dissent_hash,
  stakeholder_impact_hash, risk_level, required_test_ids,
  capability_scope_hash, budget_hash, maximum_executions,
  rollback_hash, decision_hash, status, expires_at, finalized_at
) values (
  'd8000000-0000-4000-8000-000000000001',
  'd5000000-0000-4000-8000-000000000001',
  'd6000000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production','model-router-decision',repeat('6',40),
  repeat('7',64),repeat('d',64),'{}'::text[],repeat('e',64),
  '{}'::text[],repeat('f',64),repeat('1',64),repeat('2',64),
  repeat('3',64),repeat('4',64),'low',array['model-router-test'],
  repeat('5',64),repeat('a',64),1,repeat('4',64),repeat('6',64),
  'finalized',transaction_timestamp()+interval '1 day',
  transaction_timestamp()
);

insert into public.governance_owner_approval_records(
  id, decision_manifest_id, task_id, project_id, platform, environment,
  approval_key, objective_hash, owner_user_id, current_version,
  current_state, maximum_executions, executions_claimed,
  executions_completed, approval_hash
) values (
  'd9000000-0000-4000-8000-000000000001',
  'd8000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production','model-router-owner-approval',repeat('5',64),
  'd2000000-0000-4000-8000-000000000001',
  1,'active',1,1,0,repeat('7',64)
);

insert into public.governance_owner_approval_versions(
  id, approval_record_id, decision_manifest_id, task_id, project_id,
  platform, environment, version_number, owner_user_id,
  owner_identity_hash, decision_manifest_hash, plan_snapshot_hash,
  source_commit, architecture_graph_digest, approval_scope_hash,
  objective_hash, repository_full_name, branch_name, provider, operation,
  target_resource_hash, path_scope_hashes, table_scope_hashes,
  function_scope_hashes, budget_hash, maximum_cost, maximum_calls,
  maximum_bytes, maximum_executions, tests_hash, required_test_ids,
  evaluator_requirement_hash, rollback_hash, approval_hash,
  approved_at, valid_from, expires_at
) values (
  'da000000-0000-4000-8000-000000000001',
  'd9000000-0000-4000-8000-000000000001',
  'd8000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production',1,
  'd2000000-0000-4000-8000-000000000001',
  encode(extensions.digest(
    convert_to('d2000000-0000-4000-8000-000000000001','UTF8'),
    'sha256'
  ),'hex'),
  repeat('6',64),repeat('7',64),repeat('6',40),repeat('7',64),
  repeat('5',64),repeat('5',64),
  'Chillywood2025/chillywood-mobile',
  'codex/cognitive-model-router-test',
  'model','model_advisory',repeat('8',64),
  '{}'::text[],'{}'::text[],'{}'::text[],repeat('a',64),
  1,3,16384,1,repeat('9',64),array['model-router-test'],
  repeat('a',64),repeat('4',64),repeat('7',64),
  transaction_timestamp()-interval '1 minute',
  transaction_timestamp()-interval '1 minute',
  transaction_timestamp()+interval '23 hours'
);

insert into public.governance_owner_approval_version_states(
  approval_version_id, approval_record_id, task_id, project_id,
  platform, environment, state, maximum_executions,
  executions_claimed
) values (
  'da000000-0000-4000-8000-000000000001',
  'd9000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production','consumed',1,1
);

insert into public.governance_approved_action_executions(
  id, approval_record_id, approval_version_id, task_id, project_id,
  repository_full_name, branch_name, platform, environment, provider,
  operation, claim_sequence, state, service_identity,
  service_identity_hash, worker_assertion_hash, decision_manifest_hash,
  plan_snapshot_hash, approval_hash, target_resource_hash, budget_hash,
  tests_hash, evaluator_requirement_hash, rollback_hash, claimed_at,
  began_at
) values (
  'db000000-0000-4000-8000-000000000001',
  'd9000000-0000-4000-8000-000000000001',
  'da000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'Chillywood2025/chillywood-mobile',
  'codex/cognitive-model-router-test',
  'shared','production','model','model_advisory',1,
  'executing','cognitive_approved_action_worker',
  repeat('1',64),repeat('2',64),repeat('6',64),repeat('7',64),
  repeat('7',64),repeat('8',64),repeat('a',64),repeat('9',64),
  repeat('a',64),repeat('4',64),transaction_timestamp(),
  transaction_timestamp()
);

insert into public.cognitive_governance_switches(
  task_id, project_id, platform, environment, switch_key, enabled,
  policy_version, enabled_by, enabled_at
) values (
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production','cognitive_research_enabled',true,
  'model-router-test-v1',
  'd2000000-0000-4000-8000-000000000001',
  transaction_timestamp()
);

insert into public.intelligence_budgets(
  id, task_id, project_id, platform, environment, actor_identity,
  dedupe_key, status, summary, evidence_metadata, data_class,
  retention_until, immutable_ceiling_hash, max_model_tokens,
  max_model_cost, max_tool_calls, max_tool_bytes, max_child_tasks,
  max_recursion_depth, max_retries, max_concurrent_calls, deadline_at
) values (
  'dc000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production','cognitive_model_router',
  'model-router-budget-fixture','received','{}'::jsonb,'{}'::jsonb,
  'operational_metadata',transaction_timestamp()+interval '30 days',
  repeat('a',64),100000,5,0,0,0,0,0,1,
  transaction_timestamp()+interval '1 day'
);
-- MODEL_ROUTER_FIXTURE_END

select ok(
  (
    select count(*) = 4
    from pg_class
    where oid in (
      'public.cognitive_model_router_capabilities'::regclass,
      'public.cognitive_model_router_preflight_audits'::regclass,
      'public.cognitive_model_router_result_audits'::regclass,
      'public.cognitive_model_router_revocation_audits'::regclass
    )
      and relrowsecurity
      and relforcerowsecurity
  ),
  'model router governance tables force RLS'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.cognitive_model_router_reserve(uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text,text,text,text,text,text,text,text,text,bigint,numeric,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cognitive_model_router_settle(uuid,text,bigint,numeric,text,text,text,text,text,text,text,integer,text)',
    'EXECUTE'
  ),
  'ordinary authenticated clients cannot reserve or settle model calls'
);

select ok(
  not has_table_privilege(
    'service_role','public.cognitive_model_router_preflight_audits','INSERT'
  )
  and not has_table_privilege(
    'service_role','public.cognitive_model_router_result_audits','INSERT'
  ),
  'service role has no direct model audit write path'
);

create temporary table model_router_fixture(
  capability_id uuid primary key,
  preflight_id uuid
);
grant select, insert, update on model_router_fixture
to authenticated, service_role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config(
  'request.jwt.claim.sub',
  'd2000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d2000000-0000-4000-8000-000000000001"}',
  true
);

insert into model_router_fixture(capability_id)
select public.governance_owner_register_model_router_capability(
  'db000000-0000-4000-8000-000000000001',
  'dc000000-0000-4000-8000-000000000001',
  'research_futures',
  'cognitive_research_enabled',
  'openai',
  'gpt-5.6',
  'gpt-5.6-luna',
  3,
  10000,
  1,
  repeat('b',64),
  transaction_timestamp()+interval '12 hours'
);

select ok(
  (
    select service_identity = 'cognitive_model_router'
      and authority = 'advisory_only'
      and not quorum_eligible
      and not evaluator_authority
      and not tool_authority
      and council_role = 'research_futures'
      and required_switch_key = 'cognitive_research_enabled'
      and provider_family = 'openai'
      and model_family = 'gpt-5.6'
      and model_name = 'gpt-5.6-luna'
    from public.cognitive_model_router_capabilities
    where id = (select capability_id from model_router_fixture)
  ),
  'Owner capability binds exact advisory-only scope without quorum or tools'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);

select throws_ok(
  $$select public.cognitive_model_router_reserve(
    (select capability_id from model_router_fixture),
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production','security_privacy',
    'openai','gpt-5.6','gpt-5.6-luna',
    'model-router-assessment-wrong-council',repeat('c',64),
    repeat('d',64),repeat('e',64),repeat('f',64),repeat('1',64),
    1000,0.1,'model-router-service-token-test-only-0001'
  )$$,
  'P0001',
  'model_router_capability_rejected',
  'model router rejects a mismatched council role'
);

select throws_ok(
  $$select public.cognitive_model_router_reserve(
    (select capability_id from model_router_fixture),
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production','research_futures',
    'openai','gpt-5.6','gpt-5.6-luna',
    'model-router-assessment-wrong-token',repeat('c',64),
    repeat('d',64),repeat('e',64),repeat('f',64),repeat('1',64),
    1000,0.1,'another-service-token-cannot-impersonate'
  )$$,
  '42501',
  'cognitive_service_token_rejected',
  'another service token cannot impersonate the model router'
);

update model_router_fixture
set preflight_id = (
  public.cognitive_model_router_reserve(
    capability_id,
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production','research_futures',
    'openai','gpt-5.6','gpt-5.6-luna',
    'model-router-assessment-0001',repeat('c',64),
    repeat('d',64),repeat('e',64),repeat('f',64),repeat('1',64),
    1000,0.1,'model-router-service-token-test-only-0001'
  )->>'preflightId'
)::uuid;

select ok(
  (
    select budget.used_model_tokens = 1000
      and budget.used_model_cost = 0.1
      and budget.active_concurrent_calls = 1
    from public.intelligence_budgets budget
    where budget.id = 'dc000000-0000-4000-8000-000000000001'
  )
  and (
    select capability.reserved_calls = 1
      and capability.settled_calls = 0
      and capability.reserved_model_tokens = 1000
      and capability.reserved_model_cost = 0.1
    from public.cognitive_model_router_capabilities capability
    where capability.id = (select capability_id from model_router_fixture)
  ),
  'preflight reserves cumulative budget and capability usage atomically'
);

select throws_ok(
  $$select public.cognitive_model_router_reserve(
    (select capability_id from model_router_fixture),
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production','research_futures',
    'openai','gpt-5.6','gpt-5.6-luna',
    'model-router-assessment-0001',repeat('c',64),
    repeat('d',64),repeat('e',64),repeat('f',64),repeat('1',64),
    1000,0.1,'model-router-service-token-test-only-0001'
  )$$,
  '23505',
  'model_router_replay_denied',
  'identical assessment and idempotency replay is denied'
);

select throws_ok(
  $$select public.cognitive_model_router_reserve(
    (select capability_id from model_router_fixture),
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production','research_futures',
    'openai','gpt-5.6','gpt-5.6-luna',
    'model-router-assessment-concurrent',repeat('2',64),
    repeat('3',64),repeat('4',64),repeat('5',64),repeat('6',64),
    1000,0.1,'model-router-service-token-test-only-0001'
  )$$,
  'P0001',
  'model_router_capability_rejected',
  'budget concurrency ceiling denies a second in-flight call'
);

select is(
  public.cognitive_model_router_settle(
    (select preflight_id from model_router_fixture),
    'completed',700,0.05,'gpt-5.6-luna',repeat('2',64),
    repeat('3',64),repeat('4',64),repeat('5',64),null,
    repeat('6',64),250,'model-router-service-token-test-only-0001'
  )->>'resultStatus',
  'completed',
  'exact completed result settles through the database boundary'
);

select ok(
  (
    select budget.used_model_tokens = 700
      and budget.used_model_cost = 0.05
      and budget.active_concurrent_calls = 0
    from public.intelligence_budgets budget
    where budget.id = 'dc000000-0000-4000-8000-000000000001'
  )
  and (
    select capability.reserved_calls = 0
      and capability.settled_calls = 1
      and capability.reserved_model_tokens = 0
      and capability.settled_model_tokens = 700
      and capability.reserved_model_cost = 0
      and capability.settled_model_cost = 0.05
    from public.cognitive_model_router_capabilities capability
    where capability.id = (select capability_id from model_router_fixture)
  ),
  'settlement replaces reservation with cumulative actual usage'
);

select ok(
  (
    select result.authority = 'advisory_only'
      and not result.quorum_eligible
      and not result.evaluator_proof_present
      and result.provider_response_id_hash = repeat('2',64)
      and result.output_hash = repeat('3',64)
    from public.cognitive_model_router_result_audits result
    where result.preflight_id = (
      select preflight_id from model_router_fixture
    )
  ),
  'result audit stores bounded hashes and remains quorum-ineligible'
);

select throws_ok(
  $$select public.cognitive_model_router_settle(
    (select preflight_id from model_router_fixture),
    'completed',700,0.05,'gpt-5.6-luna',repeat('2',64),
    repeat('3',64),repeat('4',64),repeat('5',64),null,
    repeat('6',64),250,'model-router-service-token-test-only-0001'
  )$$,
  '23505',
  'model_router_settlement_replay_denied',
  'result settlement replay is denied'
);

reset role;
select throws_ok(
  $$update public.cognitive_model_router_preflight_audits
    set request_hash = repeat('7',64)
    where id = (select preflight_id from model_router_fixture)$$,
  '42501',
  'immutable_cognitive_evidence',
  'preflight audit is immutable'
);
select throws_ok(
  $$delete from public.cognitive_model_router_result_audits
    where preflight_id = (select preflight_id from model_router_fixture)$$,
  '42501',
  'immutable_cognitive_evidence',
  'result audit is immutable'
);

update public.cognitive_governance_switches
set enabled = false,
    enabled_at = null,
    disabled_at = transaction_timestamp(),
    updated_at = transaction_timestamp()
where task_id = 'd3000000-0000-4000-8000-000000000001'
  and switch_key = 'cognitive_research_enabled';

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(
  $$select public.cognitive_model_router_reserve(
    (select capability_id from model_router_fixture),
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production','research_futures',
    'openai','gpt-5.6','gpt-5.6-luna',
    'model-router-assessment-switch-off',repeat('7',64),
    repeat('8',64),repeat('9',64),repeat('a',64),repeat('b',64),
    1000,0.1,'model-router-service-token-test-only-0001'
  )$$,
  'P0001',
  'model_router_capability_rejected',
  'disabled prerequisite switch blocks a new provider reservation'
);

reset role;
update public.cognitive_governance_switches
set enabled = true,
    enabled_by = 'd2000000-0000-4000-8000-000000000001',
    enabled_at = transaction_timestamp(),
    disabled_at = null,
    updated_at = transaction_timestamp()
where task_id = 'd3000000-0000-4000-8000-000000000001'
  and switch_key = 'cognitive_research_enabled';
update public.cognitive_model_router_capabilities
set issued_at = transaction_timestamp() - interval '2 seconds',
    expires_at = transaction_timestamp() - interval '1 second'
where id = (select capability_id from model_router_fixture);

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(
  $$select public.cognitive_model_router_reserve(
    (select capability_id from model_router_fixture),
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production','research_futures',
    'openai','gpt-5.6','gpt-5.6-luna',
    'model-router-assessment-expired',repeat('7',64),
    repeat('8',64),repeat('9',64),repeat('a',64),repeat('b',64),
    1000,0.1,'model-router-service-token-test-only-0001'
  )$$,
  'P0001',
  'model_router_capability_rejected',
  'expired capability blocks a new provider reservation'
);

reset role;
update public.cognitive_model_router_capabilities
set issued_at = transaction_timestamp(),
    expires_at = transaction_timestamp() + interval '12 hours'
where id = (select capability_id from model_router_fixture);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config(
  'request.jwt.claim.sub',
  'd2000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d2000000-0000-4000-8000-000000000001"}',
  true
);
select is(
  public.governance_owner_revoke_model_router_capability(
    (select capability_id from model_router_fixture),
    repeat('c',64)
  ),
  true,
  'exact Owner can revoke the model capability'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(
  $$select public.cognitive_model_router_reserve(
    (select capability_id from model_router_fixture),
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production','research_futures',
    'openai','gpt-5.6','gpt-5.6-luna',
    'model-router-assessment-revoked',repeat('d',64),
    repeat('e',64),repeat('f',64),repeat('1',64),repeat('2',64),
    1000,0.1,'model-router-service-token-test-only-0001'
  )$$,
  'P0001',
  'model_router_capability_rejected',
  'revoked capability blocks a new provider reservation'
);

reset role;
select ok(
  (
    select count(*) = 1
    from public.cognitive_model_router_revocation_audits audit
    where audit.capability_id = (
      select capability_id from model_router_fixture
    )
      and audit.revocation_hash = repeat('c',64)
  ),
  'Owner revocation writes one immutable sanitized audit'
);

select * from finish();
rollback;
