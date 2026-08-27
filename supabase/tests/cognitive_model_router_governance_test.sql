begin;
select no_plan();

create function pg_temp.set_service_role_test_context()
returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  if auth.uid() is not null or auth.jwt() ? 'session_id' then
    raise exception 'service_role_fixture_retained_user_session';
  end if;
  return current_setting('request.jwt.claims',true);
end;
$$;

-- MODEL_ROUTER_FIXTURE_BEGIN
insert into auth.users(id, is_sso_user, is_anonymous, email_confirmed_at)
values ('d2000000-0000-4000-8000-000000000001', false, false, now());

insert into auth.sessions(id, user_id)
values (
  'd2100000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001'
);

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
  'shared','production','no_action',repeat('c',64),10,1,
  'full',0,'source',repeat('4',64)
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

insert into public.cognitive_level01_credential_attestations(
  id,task_id,project_id,platform,environment,credential_kind,state,
  public_fingerprint_hash,scope_manifest_hash,private_material_stored,
  verified_at,expires_at
) values (
  'de000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production','model_provider','configured',
  repeat('b',64),repeat('c',64),false,transaction_timestamp(),
  transaction_timestamp()+interval '1 day'
);

create temporary table model_owner_chain_fixture(
  decision_id uuid,
  decision_hash text,
  approval_id uuid,
  approval_version_id uuid,
  approval_hash text,
  execution_id uuid
);
grant select,insert,update on model_owner_chain_fixture
  to authenticated,service_role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config(
  'request.jwt.claim.sub',
  'd2000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d2000000-0000-4000-8000-000000000001","session_id":"d2100000-0000-4000-8000-000000000001"}',
  true
);
select public.governance_register_two_party_service_principal(
  'cognitive_approved_action_worker',
  encode(extensions.digest(convert_to(
    'model-worker-assertion-test-only-000000000000','UTF8'
  ),'sha256'),'hex'),
  array['model_advisory'],
  transaction_timestamp()+interval '1 day'
);
select public.governance_register_two_party_service_principal(
  'cognitive_independent_evaluator',
  encode(extensions.digest(convert_to(
    'model-evaluator-assertion-test-only-000000000','UTF8'
  ),'sha256'),'hex'),
  array['independent_evaluation'],
  transaction_timestamp()+interval '1 day'
);
insert into model_owner_chain_fixture(decision_id,decision_hash)
select (result->>'decisionManifestId')::uuid,result->>'decisionHash'
from (
  select public.governance_owner_prepare_model_advisory_decision(
    'd5000000-0000-4000-8000-000000000001',
    'd7000000-0000-4000-8000-000000000001',
    'model-router-owner-advisory-decision',
    array['cognitive-model-advisory-independent-evaluation'],
    encode(extensions.digest(convert_to(concat_ws(
      '|','cognitive-model-assessment-scope-v1',
      'd3000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000001',
      'shared','production','research_futures',
      'model-router-assessment-0001',repeat('e',64)
    ),'UTF8'),'sha256'),'hex'),
    'dc000000-0000-4000-8000-000000000001',
    repeat('a',64),repeat('4',64),interval '24 hours'
  ) result
) prepared;
update model_owner_chain_fixture
set approval_id = (owner_approval.result->>'approvalId')::uuid,
    approval_version_id =
      (owner_approval.result->>'approvalVersionId')::uuid,
    approval_hash = owner_approval.result->>'approvalHash'
from (
  select public.governance_record_owner_approval(
    (select decision_id from model_owner_chain_fixture),
    'model-router-owner-approval',
    repeat('5',64),repeat('7',64),repeat('6',40),repeat('7',64),
    encode(extensions.digest(convert_to(concat_ws(
      '|','cognitive-model-assessment-scope-v1',
      'd3000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000001',
      'shared','production','research_futures',
      'model-router-assessment-0001',repeat('e',64)
    ),'UTF8'),'sha256'),'hex'),'Chillywood2025/chillywood-mobile',
    'codex/cognitive-model-router-test','model','model_advisory',
    repeat('8',64),'{}'::text[],'{}'::text[],'{}'::text[],
    repeat('a',64),1,3,16384,1,repeat('9',64),
    array['cognitive-model-advisory-independent-evaluation'],
    repeat('a',64),repeat('4',64),
    interval '24 hours'
  ) result
) owner_approval;
reset role;

set local role service_role;
select pg_temp.set_service_role_test_context();
update model_owner_chain_fixture
set execution_id = (
  public.governance_claim_approved_action(
    approval_version_id,'cognitive_approved_action_worker',
    'model-worker-assertion-test-only-000000000000',
    decision_hash,repeat('7',64),approval_hash,
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'Chillywood2025/chillywood-mobile',
    'codex/cognitive-model-router-test','shared','production',
    'model','model_advisory',repeat('8',64),repeat('a',64),
    repeat('9',64),repeat('a',64),repeat('4',64)
  )->>'executionId'
)::uuid;
select public.governance_begin_approved_execution(
  (select execution_id from model_owner_chain_fixture),
  'cognitive_approved_action_worker',
  'model-worker-assertion-test-only-000000000000',
  'preflight'
);
select public.governance_begin_approved_execution(
  (select execution_id from model_owner_chain_fixture),
  'cognitive_approved_action_worker',
  'model-worker-assertion-test-only-000000000000',
  'executing'
);
reset role;

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

-- MODEL_ROUTER_FIXTURE_END

select ok(
  exists (
    select 1
    from public.governance_owner_approval_versions version
    join public.governance_approved_action_executions execution
      on execution.approval_version_id = version.id
    where version.provider = 'model'
      and version.operation = 'model_advisory'
      and execution.provider = 'model'
      and execution.operation = 'model_advisory'
      and execution.state = 'executing'
      and execution.id = (
        select execution_id from model_owner_chain_fixture
      )
  ),
  'real Owner approval and worker handoff accept exact bounded model_advisory'
);

select ok(
  not exists (
    select 1
    from public.governance_model_execution_attestations
    where task_id = 'd3000000-0000-4000-8000-000000000001'
  )
  and (
    select decision.model_independence_status =
        'MODEL_INDEPENDENCE_PROVIDER_REQUIRED'
      and decision.model_independence_assessment_id is null
      and advisory.authority = 'advisory_only'
      and not advisory.quorum_eligible
      and advisory.evaluator_required
      and advisory.maximum_executions = 1
    from public.governance_decision_manifests decision
    join public.cognitive_model_advisory_owner_decisions advisory
      on advisory.decision_manifest_id = decision.id
    where decision.id = (
      select decision_id from model_owner_chain_fixture
    )
  ),
  'single-provider Owner path is unseeded, advisory-only, and not quorum eligible'
);

select ok(
  (
    select count(*) = 8
    from pg_class
    where oid in (
      'public.cognitive_model_router_capabilities'::regclass,
      'public.cognitive_model_router_preflight_audits'::regclass,
      'public.cognitive_model_router_result_audits'::regclass,
      'public.cognitive_model_router_revocation_audits'::regclass,
      'public.cognitive_model_router_recovery_audits'::regclass,
      'public.cognitive_model_router_runtime_credential_proofs'::regclass,
      'public.cognitive_model_provider_overrun_audits'::regclass,
      'public.cognitive_model_advisory_owner_decisions'::regclass
    )
      and relrowsecurity
      and relforcerowsecurity
  ),
  'model router governance tables force RLS'
);

select ok(
  not has_function_privilege(
    'authenticated',
  'public.cognitive_model_router_reserve(uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text,text,text,text,text,text,text,text,text,text,text,text,bigint,numeric,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cognitive_model_router_settle(uuid,text,bigint,numeric,text,text,text,text,text,text,text,integer,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cognitive_model_router_recover_expired(uuid,integer,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cognitive_model_router_record_provider_overrun(uuid,bigint,numeric,text,text,text,text,integer,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cognitive_model_router_sweep_expired(integer,text,text)',
    'EXECUTE'
  ),
  'ordinary authenticated clients cannot reserve, recover, sweep, or settle model calls'
);

select ok(
  not has_table_privilege(
    'service_role','public.cognitive_model_router_preflight_audits','INSERT'
  )
  and not has_table_privilege(
    'service_role','public.cognitive_model_router_result_audits','INSERT'
  )
  and not has_table_privilege(
    'service_role','public.cognitive_model_provider_overrun_audits','INSERT'
  ),
  'service role has no direct model audit write path'
);

create temporary table model_router_fixture(
  capability_id uuid primary key,
  preflight_id uuid,
  approval_target_hash text not null default repeat('8',64),
  scope_hash text not null default encode(extensions.digest(convert_to(
    concat_ws(
      '|','cognitive-model-assessment-scope-v1',
      'd3000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000001',
      'shared','production','research_futures',
      'model-router-assessment-0001',repeat('e',64)
    ),
    'UTF8'
  ),'sha256'),'hex'),
  model_identity_hash text not null default encode(extensions.digest(convert_to(
    concat_ws('|','openai','gpt-5.6','gpt-5.6-luna'),
    'UTF8'
  ),'sha256'),'hex')
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
  '{"role":"authenticated","sub":"d2000000-0000-4000-8000-000000000001","session_id":"d2100000-0000-4000-8000-000000000001"}',
  true
);

insert into model_router_fixture(capability_id)
select public.governance_owner_register_model_router_capability(
  (select execution_id from model_owner_chain_fixture),
  'dc000000-0000-4000-8000-000000000001',
  'research_futures',
  'cognitive_research_enabled',
  'openai',
  'gpt-5.6',
  'gpt-5.6-luna',
  3,
  10000,
  1,
  encode(extensions.digest(convert_to(
    concat_ws(
      '|','cognitive-model-assessment-scope-v1',
      'd3000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000001',
      'shared','production','research_futures',
      'model-router-assessment-0001',repeat('e',64)
    ),
    'UTF8'
  ),'sha256'),'hex'),
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
      and credential_attestation_id =
        'de000000-0000-4000-8000-000000000001'
      and credential_public_fingerprint_hash = repeat('b',64)
      and credential_scope_manifest_hash = repeat('c',64)
      and credential_expires_at > transaction_timestamp()
    from public.cognitive_model_router_capabilities
    where id = (select capability_id from model_router_fixture)
  ),
  'Owner capability binds exact advisory-only scope without quorum or tools'
);

reset role;
create function pg_temp.reserve_after_model_credential_supersession()
returns jsonb
language plpgsql
as $$
begin
  perform pg_temp.set_service_role_test_context();
  insert into public.cognitive_level01_credential_attestations(
    id,task_id,project_id,platform,environment,credential_kind,state,
    public_fingerprint_hash,scope_manifest_hash,private_material_stored,
    verified_at,expires_at
  ) values (
    'df000000-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production','model_provider','configured',
    repeat('1',64),repeat('2',64),false,
    transaction_timestamp()+interval '1 microsecond',
    transaction_timestamp()+interval '1 day'
  );
  return public.cognitive_model_router_reserve(
    (select capability_id from model_router_fixture),
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production','research_futures',
    'openai','gpt-5.6','gpt-5.6-luna',
    'model-router-assessment-0001',repeat('0',64),
    repeat('d',64),repeat('e',64),repeat('f',64),
    (select model_identity_hash from model_router_fixture),
    (select approval_target_hash from model_router_fixture),
    (select scope_hash from model_router_fixture),
    repeat('b',64),
    1000,0.1,'model-router-service-token-test-only-0001'
  );
end;
$$;
select throws_ok(
  $$select pg_temp.reserve_after_model_credential_supersession()$$,
  'P0001',
  'model_router_runtime_credential_rejected',
  'superseding accepted credential fingerprint blocks an old capability'
);
set local role service_role;
select pg_temp.set_service_role_test_context();

select throws_ok(
  $$select public.cognitive_model_router_reserve(
    (select capability_id from model_router_fixture),
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production','security_privacy',
    'openai','gpt-5.6','gpt-5.6-luna',
    'model-router-assessment-wrong-council',repeat('c',64),
    repeat('d',64),repeat('e',64),repeat('f',64),
    (select model_identity_hash from model_router_fixture),
    (select approval_target_hash from model_router_fixture),
    (select scope_hash from model_router_fixture),
    repeat('b',64),
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
    'model-router-assessment-0001',repeat('0',64),
    repeat('d',64),repeat('e',64),repeat('f',64),
    (select model_identity_hash from model_router_fixture),
    (select approval_target_hash from model_router_fixture),
    (select scope_hash from model_router_fixture),
    repeat('9',64),
    1000,0.1,'model-router-service-token-test-only-0001'
  )$$,
  'P0001',
  'model_router_runtime_credential_rejected',
  'runtime API-key fingerprint must match accepted credential attestation'
);

select throws_ok(
  $$select public.cognitive_model_router_reserve(
    (select capability_id from model_router_fixture),
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production','research_futures',
    'openai','gpt-5.6','gpt-5.6-luna',
    'model-router-assessment-wrong-token',repeat('c',64),
    repeat('d',64),repeat('e',64),repeat('f',64),
    (select model_identity_hash from model_router_fixture),
    (select approval_target_hash from model_router_fixture),
    (select scope_hash from model_router_fixture),
    repeat('b',64),
    1000,0.1,'another-service-token-cannot-impersonate'
  )$$,
  '42501',
  'cognitive_service_token_rejected',
  'another service token cannot impersonate the model router'
);

select throws_ok(
  $$select public.cognitive_model_router_reserve(
    (select capability_id from model_router_fixture),
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production','research_futures',
    'openai','gpt-5.6','gpt-5.6-luna',
    'model-router-assessment-0001',repeat('1',64),
    repeat('d',64),repeat('e',64),repeat('f',64),
    (select model_identity_hash from model_router_fixture),
    repeat('9',64),
    (select scope_hash from model_router_fixture),
    repeat('b',64),
    1000,0.1,'model-router-service-token-test-only-0001'
  )$$,
  'P0001',
  'model_router_capability_rejected',
  'model router rejects approval-target substitution'
);

select throws_ok(
  $$select public.cognitive_model_router_reserve(
    (select capability_id from model_router_fixture),
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production','research_futures',
    'openai','gpt-5.6','gpt-5.6-luna',
    'model-router-assessment-0001',repeat('1',64),
    repeat('d',64),repeat('e',64),repeat('f',64),
    (select model_identity_hash from model_router_fixture),
    (select approval_target_hash from model_router_fixture),
    repeat('9',64),
    repeat('b',64),
    1000,0.1,'model-router-service-token-test-only-0001'
  )$$,
  'P0001',
  'model_router_capability_rejected',
  'model router rejects assessment-scope substitution'
);

select throws_ok(
  $$select public.cognitive_model_router_reserve(
    (select capability_id from model_router_fixture),
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production','research_futures',
    'openai','gpt-5.6','gpt-5.6-luna',
    'model-router-assessment-0001',repeat('1',64),
    repeat('d',64),repeat('e',64),repeat('f',64),repeat('9',64),
    (select approval_target_hash from model_router_fixture),
    (select scope_hash from model_router_fixture),
    repeat('b',64),
    1000,0.1,'model-router-service-token-test-only-0001'
  )$$,
  'P0001',
  'model_router_capability_rejected',
  'model router recomputes and rejects configured model identity substitution'
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
    repeat('d',64),repeat('e',64),repeat('f',64),model_identity_hash,
    approval_target_hash,scope_hash,
    repeat('b',64),
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
  )
  and (
    select preflight.approval_target_hash =
        (select approval_target_hash from model_router_fixture)
      and preflight.scope_hash =
        (select scope_hash from model_router_fixture)
      and preflight.lease_expires_at > preflight.created_at
      and preflight.lease_expires_at <=
        preflight.created_at + interval '2 minutes'
      and preflight.credential_attestation_id =
        'de000000-0000-4000-8000-000000000001'
      and preflight.credential_public_fingerprint_hash = repeat('b',64)
      and preflight.credential_scope_manifest_hash = repeat('c',64)
      and preflight.runtime_credential_fingerprint_hash = repeat('b',64)
    from public.cognitive_model_router_preflight_audits preflight
    where preflight.id = (select preflight_id from model_router_fixture)
  ),
  'preflight atomically reserves budget and binds target, scope, and lease'
);

select throws_ok(
  $$select public.cognitive_model_router_reserve(
    (select capability_id from model_router_fixture),
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production','research_futures',
    'openai','gpt-5.6','gpt-5.6-luna',
    'model-router-assessment-0001',repeat('c',64),
    repeat('d',64),repeat('e',64),repeat('f',64),
    (select model_identity_hash from model_router_fixture),
    (select approval_target_hash from model_router_fixture),
    (select scope_hash from model_router_fixture),
    repeat('b',64),
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
    repeat('3',64),repeat('4',64),repeat('5',64),
    (select model_identity_hash from model_router_fixture),
    (select approval_target_hash from model_router_fixture),
    (select scope_hash from model_router_fixture),
    repeat('b',64),
    1000,0.1,'model-router-service-token-test-only-0001'
  )$$,
  'P0001',
  'model_router_capability_rejected',
  'capability rejects a different assessment outside its exact scope'
);

savepoint model_provider_overrun_contract;
select throws_ok(
  $$select public.cognitive_model_router_record_provider_overrun(
    (select preflight_id from model_router_fixture),
    100050,0.1001,'gpt-5.6-luna',repeat('2',64),
    repeat('3',64),repeat('4',64),250,
    'model-router-service-token-test-only-0001'
  )$$,
  '42501',
  'permission denied for function cognitive_model_router_record_provider_overrun',
  'generic service_role cannot record isolated provider overruns'
);
reset role;
select is(
  public.cognitive_model_router_record_provider_overrun(
    (select preflight_id from model_router_fixture),
    100050,0.1001,'gpt-5.6-luna',repeat('2',64),
    repeat('3',64),repeat('4',64),250,
    'model-router-service-token-test-only-0001'
  )->>'reportedModelTokens',
  '100050',
  'provider overrun preserves exact bounded usage before settlement'
);
reset role;
select ok(
  (
    select reported_model_tokens=100050
      and reported_model_cost=0.1001
      and reserved_model_tokens=1000
      and reserved_model_cost=0.1
      and provider_response_id_hash=repeat('2',64)
      and failure_reason_hash=repeat('3',64)
      and evidence_hash=repeat('4',64)
      and service_identity='cognitive_model_router'
    from public.cognitive_model_provider_overrun_audits
    where preflight_id=(select preflight_id from model_router_fixture)
  ),
  'immutable overrun audit separates reported usage from the ceiling'
);
select throws_ok(
  $$insert into public.cognitive_model_router_recovery_audits(
    preflight_id,capability_id,budget_id,task_id,project_id,platform,
    environment,recovery_batch_hash,recovery_hash,accounting_state,
    recovered_model_tokens,recovered_model_cost,service_identity
  )
  select
    preflight.id,preflight.capability_id,preflight.budget_id,
    preflight.task_id,preflight.project_id,preflight.platform,
    preflight.environment,repeat('8',64),repeat('9',64),
    'conservative_reservation_charged',
    preflight.reserved_model_tokens,preflight.reserved_model_cost,
    'cognitive_model_router'
  from public.cognitive_model_router_preflight_audits preflight
  where preflight.id=(select preflight_id from model_router_fixture)$$,
  'P0001',
  'model_router_overrun_recovery_rejected',
  'provider overrun cannot be followed by contradictory recovery evidence'
);
reset role;
select throws_ok(
  $$select public.cognitive_model_router_record_provider_overrun(
    (select preflight_id from model_router_fixture),
    100050,0.1001,'gpt-5.6-luna',repeat('2',64),
    repeat('3',64),repeat('4',64),250,
    'model-router-service-token-test-only-0001'
  )$$,
  'P0001',
  'model_router_provider_overrun_rejected',
  'provider overrun replay is denied'
);
set local role service_role;
select pg_temp.set_service_role_test_context();
select throws_ok(
  $$select public.cognitive_model_router_settle(
    (select preflight_id from model_router_fixture),
    'completed',1000,0.1,'gpt-5.6-luna',repeat('2',64),
    repeat('5',64),repeat('6',64),repeat('7',64),null,
    repeat('7',64),250,'model-router-service-token-test-only-0001'
  )$$,
  'P0001',
  'model_router_overrun_settlement_rejected',
  'provider overrun cannot be followed by a contradictory completed result'
);
select is(
  public.cognitive_model_router_settle(
    (select preflight_id from model_router_fixture),
    'provider_rejected',1000,0.1,null,null,null,null,null,repeat('3',64),
    repeat('a',64),250,'model-router-service-token-test-only-0001'
  )->>'resultStatus',
  'provider_rejected',
  'provider overrun permits only the bounded conservative failure settlement'
);
reset role;
select ok(
  (
    select result.result_status='provider_rejected'
      and result.actual_model_tokens=overrun.reserved_model_tokens
      and result.actual_model_cost=overrun.reserved_model_cost
      and result.failure_reason_hash=overrun.failure_reason_hash
    from public.cognitive_model_router_result_audits result
    join public.cognitive_model_provider_overrun_audits overrun
      on overrun.preflight_id=result.preflight_id
    where result.preflight_id=(select preflight_id from model_router_fixture)
  ),
  'overrun and result evidence remain mutually consistent'
);
select throws_ok(
  $$delete from public.cognitive_model_provider_overrun_audits
    where preflight_id=(select preflight_id from model_router_fixture)$$,
  '42501',
  'immutable_cognitive_evidence',
  'provider overrun audit is immutable'
);
rollback to savepoint model_provider_overrun_contract;
reset role;

savepoint model_recovery_overrun_contract;
insert into public.cognitive_model_router_recovery_audits(
  preflight_id,capability_id,budget_id,task_id,project_id,platform,
  environment,recovery_batch_hash,recovery_hash,accounting_state,
  recovered_model_tokens,recovered_model_cost,service_identity
)
select
  preflight.id,preflight.capability_id,preflight.budget_id,
  preflight.task_id,preflight.project_id,preflight.platform,
  preflight.environment,repeat('8',64),repeat('9',64),
  'conservative_reservation_charged',
  preflight.reserved_model_tokens,preflight.reserved_model_cost,
  'cognitive_model_router'
from public.cognitive_model_router_preflight_audits preflight
where preflight.id=(select preflight_id from model_router_fixture);
select throws_ok(
  $$select public.cognitive_model_router_record_provider_overrun(
    (select preflight_id from model_router_fixture),
    100050,0.1001,'gpt-5.6-luna',repeat('2',64),
    repeat('3',64),repeat('4',64),250,
    'model-router-service-token-test-only-0001'
  )$$,
  'P0001',
  'model_router_provider_overrun_rejected',
  'recovered reservation cannot later acquire provider overrun evidence'
);
rollback to savepoint model_recovery_overrun_contract;

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

select is(
  public.governance_begin_approved_execution(
    (select execution_id from model_owner_chain_fixture),
    'cognitive_approved_action_worker',
    'model-worker-assertion-test-only-000000000000',
    'evaluating'
  )->>'state',
  'evaluating',
  'model settlement advances to independently evaluated postflight'
);
select is(
  public.governance_record_approved_execution_evaluator_proof(
    (select execution_id from model_owner_chain_fixture),
    'cognitive_independent_evaluator',
    'model-evaluator-assertion-test-only-000000000',
    repeat('7',64),repeat('8',64),'passed'
  )->>'verdict',
  'passed',
  'distinct evaluator records the model advisory proof'
);
select is(
  public.governance_complete_approved_execution(
    (select execution_id from model_owner_chain_fixture),
    'cognitive_approved_action_worker',
    'model-worker-assertion-test-only-000000000000',
    repeat('7',64),repeat('8',64)
  )->>'state',
  'completed',
  'worker completes the advisory only after independent evaluator proof'
);

reset role;
create temporary table model_router_recovery_fixture(
  capability_id uuid primary key,
  preflight_id uuid not null
);
grant select, insert, update on model_router_recovery_fixture
to authenticated, service_role;

insert into model_router_recovery_fixture(capability_id,preflight_id)
select capability_id,'dd000000-0000-4000-8000-000000000002'
from model_router_fixture;
insert into public.cognitive_model_router_runtime_credential_proofs(
  capability_id,idempotency_key,request_hash,task_id,project_id,platform,
  environment,credential_attestation_id,runtime_credential_fingerprint_hash,
  credential_scope_manifest_hash,service_identity
)
select
  capability.id,repeat('6',64),repeat('5',64),capability.task_id,
  capability.project_id,capability.platform,capability.environment,
  capability.credential_attestation_id,
  capability.credential_public_fingerprint_hash,
  capability.credential_scope_manifest_hash,'cognitive_model_router'
from model_router_fixture recovery
join public.cognitive_model_router_capabilities capability
  on capability.id = recovery.capability_id;
insert into public.cognitive_model_router_preflight_audits(
  id,capability_id,approved_execution_id,task_id,project_id,platform,
  environment,council_role,required_switch_key,provider_family,model_family,
  model_name,budget_id,assessment_id,idempotency_key,request_hash,
  evidence_packet_hash,prompt_template_hash,configured_model_identity_hash,
  approval_target_hash,scope_hash,lease_expires_at,reserved_model_tokens,
  reserved_model_cost,service_identity,created_at
)
select
  recovery.preflight_id,capability.id,capability.approved_execution_id,
  capability.task_id,capability.project_id,capability.platform,
  capability.environment,capability.council_role,
  capability.required_switch_key,capability.provider_family,
  capability.model_family,capability.model_name,capability.budget_id,
  'model-router-recovery-fixture',repeat('6',64),repeat('5',64),
  repeat('7',64),repeat('4',64),
  encode(extensions.digest(convert_to(
    concat_ws(
      '|',capability.provider_family,capability.model_family,
      capability.model_name
    ),
    'UTF8'
  ),'sha256'),'hex'),
  capability.approval_target_hash,capability.scope_hash,
  transaction_timestamp()-interval '1 minute',1000,0.1,
  'cognitive_model_router',transaction_timestamp()-interval '3 minutes'
from model_router_recovery_fixture recovery
join public.cognitive_model_router_capabilities capability
  on capability.id=recovery.capability_id;
update public.cognitive_model_router_capabilities capability
set reserved_calls=1,
    reserved_model_tokens=1000,
    reserved_model_cost=0.1
where capability.id=(
  select capability_id from model_router_recovery_fixture
);
update public.intelligence_budgets
set used_model_tokens=used_model_tokens+1000,
    used_model_cost=used_model_cost+0.1,
    active_concurrent_calls=active_concurrent_calls+1
where id='dc000000-0000-4000-8000-000000000001';
insert into public.cognitive_budget_events(
  budget_id,task_id,project_id,platform,environment,
  reservation_id,event_type,usage
) values (
  'dc000000-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'shared','production',repeat('6',64),'reserved',
  '{"model_tokens":1000,"model_cost":0.1,"model_calls":1,"service_identity":"cognitive_model_router","request_hash":"5555555555555555555555555555555555555555555555555555555555555555"}'::jsonb
);

set local role service_role;
select pg_temp.set_service_role_test_context();
select is(
  public.cognitive_model_router_sweep_expired(
    10,repeat('3',64),'model-router-service-token-test-only-0001'
  )->>'recoveredCount',
  '1',
  'bounded maintenance sweep reaches and recovers an expired reservation'
);
select is(
  public.cognitive_model_router_recover_expired(
    (select capability_id from model_router_recovery_fixture),
    10,repeat('3',64),'model-router-service-token-test-only-0001'
  )->>'recoveredCount',
  '0',
  'repeating a recovery batch is idempotent'
);
select ok(
  (
    select capability.reserved_calls=0
      and capability.settled_calls=2
      and capability.reserved_model_tokens=0
      and capability.settled_model_tokens=1700
      and capability.reserved_model_cost=0
      and capability.settled_model_cost=0.15
    from public.cognitive_model_router_capabilities capability
    where capability.id=(
      select capability_id from model_router_recovery_fixture
    )
  )
  and (
    select budget.active_concurrent_calls=0
      and budget.used_model_tokens=1700
      and budget.used_model_cost=0.15
    from public.intelligence_budgets budget
    where budget.id='dc000000-0000-4000-8000-000000000001'
  )
  and (
    select count(*)=1
      and bool_and(accounting_state='conservative_reservation_charged')
    from public.cognitive_model_router_recovery_audits
    where preflight_id=(
      select preflight_id from model_router_recovery_fixture
    )
  ),
  'recovery releases concurrency, conservatively charges reservation, and audits'
);
select throws_ok(
  $$select public.cognitive_model_router_settle(
    (select preflight_id from model_router_recovery_fixture),
    'provider_timeout',1000,0.1,null,null,null,null,null,repeat('2',64),
    repeat('1',64),120000,'model-router-service-token-test-only-0001'
  )$$,
  'P0001',
  'model_router_settlement_rejected',
  'late provider settlement cannot mutate recovered accounting'
);

reset role;
select throws_ok(
  $$delete from public.cognitive_model_router_recovery_audits
    where preflight_id=(
      select preflight_id from model_router_recovery_fixture
    )$$,
  '42501',
  'immutable_cognitive_evidence',
  'recovery audit is immutable'
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
select pg_temp.set_service_role_test_context();
select throws_ok(
  $$select public.cognitive_model_router_reserve(
    (select capability_id from model_router_fixture),
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production','research_futures',
    'openai','gpt-5.6','gpt-5.6-luna',
    'model-router-assessment-switch-off',repeat('7',64),
    repeat('8',64),repeat('9',64),repeat('a',64),
    (select model_identity_hash from model_router_fixture),
    (select approval_target_hash from model_router_fixture),
    (select scope_hash from model_router_fixture),
    repeat('b',64),
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
select pg_temp.set_service_role_test_context();
select throws_ok(
  $$select public.cognitive_model_router_reserve(
    (select capability_id from model_router_fixture),
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production','research_futures',
    'openai','gpt-5.6','gpt-5.6-luna',
    'model-router-assessment-expired',repeat('7',64),
    repeat('8',64),repeat('9',64),repeat('a',64),
    (select model_identity_hash from model_router_fixture),
    (select approval_target_hash from model_router_fixture),
    (select scope_hash from model_router_fixture),
    repeat('b',64),
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
  '{"role":"authenticated","sub":"d2000000-0000-4000-8000-000000000001","session_id":"d2100000-0000-4000-8000-000000000001"}',
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
select pg_temp.set_service_role_test_context();
select throws_ok(
  $$select public.cognitive_model_router_reserve(
    (select capability_id from model_router_fixture),
    'd3000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001',
    'shared','production','research_futures',
    'openai','gpt-5.6','gpt-5.6-luna',
    'model-router-assessment-revoked',repeat('d',64),
    repeat('e',64),repeat('f',64),repeat('1',64),
    (select model_identity_hash from model_router_fixture),
    (select approval_target_hash from model_router_fixture),
    (select scope_hash from model_router_fixture),
    repeat('b',64),
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
