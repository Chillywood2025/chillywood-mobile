begin;
select no_plan();

insert into public.cognitive_projects(
  id, repository_full_name, source_state, activation_state,
  scheduler_state, production_authority
) values (
  'b0000000-0000-0000-0000-000000000001',
  'Chillywood2025/chillywood-mobile',
  'collective_governance_source_complete_not_deployed',
  'off',
  'none',
  false
);

insert into public.intelligence_tasks(
  id, project_id, platform, environment, repository_full_name, branch_name,
  task_key, objective_hash, actor_identity, deadman_at
) values (
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared', 'production', 'Chillywood2025/chillywood-mobile',
  'codex/cognitive-two-party-fixture', 'two-party-handoff-fixture',
  repeat('a',64), 'two-party-fixture', transaction_timestamp()+interval '2 days'
);

insert into public.platform_role_memberships(user_id, email, role, status)
values
  ('b2000000-0000-0000-0000-000000000001', null, 'owner', 'active'),
  ('b2000000-0000-0000-0000-000000000002', null, 'super_admin', 'active');

insert into public.autonomous_system_emergency_states(
  system_id, status, reason, updated_at, metadata
) values (
  'product_intelligence_operator', 'active',
  'two-party handoff fixture active emergency state',
  transaction_timestamp(), '{"fixture":true}'::jsonb
)
on conflict (system_id) do update
set status=excluded.status, updated_at=excluded.updated_at;

insert into public.governance_constitutions(
  id, task_id, project_id, platform, environment, constitution_key, title,
  current_version, status, created_by_identity
) values (
  'b3000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared','production','two-party-constitution',
  'Two Party Constitution Fixture',1,'active','fixture'
);

insert into public.governance_constitution_versions(
  id, constitution_id, task_id, project_id, platform, environment,
  version_number, constitution_hash, policy_snapshot, status,
  proposed_by_identity, independent_review_hash, owner_approved_by,
  owner_approved_at, activation_not_before, rollback_hash
) values (
  'b3000000-0000-0000-0000-000000000002',
  'b3000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared','production',1,repeat('1',64),
  '{"activation":"off","twoParty":true}'::jsonb,'active','fixture',
  repeat('2',64),'b2000000-0000-0000-0000-000000000001',
  transaction_timestamp(),transaction_timestamp()-interval '1 minute',
  repeat('3',64)
);

insert into public.governance_deliberations(
  id, task_id, project_id, platform, environment, constitution_version_id,
  deliberation_key, objective_hash, source_commit, architecture_graph_digest,
  risk_level, status, required_quorum, budget_ceiling, deadline_at, decided_at
) values (
  'b4000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared','production','b3000000-0000-0000-0000-000000000002',
  'two-party-deliberation',repeat('4',64),repeat('5',40),
  repeat('6',64),'low','decided',3,1,
  transaction_timestamp()+interval '2 days', transaction_timestamp()
);

insert into public.governance_evidence_packets(
  id, deliberation_id, task_id, project_id, platform, environment,
  packet_hash, source_commit, architecture_graph_digest, research_claim_hashes,
  provider_state_hash, known_unknowns, approval_level, budget_hash,
  rollback_requirements_hash, freshness_deadline
) values (
  'b5000000-0000-0000-0000-000000000001',
  'b4000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared','production',repeat('7',64),repeat('5',40),repeat('6',64),
  '{}'::text[],repeat('8',64),'{"fixture":"safe"}'::jsonb,
  'owner',repeat('9',64),repeat('a',64),
  transaction_timestamp()+interval '1 day'
);

insert into public.governance_proposals(
  id, deliberation_id, task_id, project_id, platform, environment,
  option_kind, proposal_hash, user_value_score, risk_score, reversibility,
  cost_estimate, proof_burden, rollback_hash
) values (
  'b6000000-0000-0000-0000-000000000001',
  'b4000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared','production','minimal_repair',repeat('b',64),10,1,'full',
  0,'source',repeat('3',64)
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
  'b7000000-0000-0000-0000-000000000001',
  'b4000000-0000-0000-0000-000000000001',
  'b5000000-0000-0000-0000-000000000001',
  'b6000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared','production','two-party-decision',repeat('5',40),
  repeat('6',64),repeat('c',64),'{}'::text[],repeat('d',64),
  '{}'::text[],repeat('e',64),repeat('f',64),repeat('1',64),
  repeat('2',64),repeat('3',64),'low',array['two-party-test'],
  repeat('4',64),repeat('9',64),1,repeat('3',64),repeat('5',64),
  'finalized',transaction_timestamp()+interval '1 day',
  transaction_timestamp()
);

create temporary table two_party_fixture(
  approval_id uuid,
  approval_version_id uuid,
  approval_hash text,
  execution_id uuid
);
grant select, insert, update on two_party_fixture to authenticated, service_role;

select ok(
  (
    select count(*) = 9
    from pg_class
    where oid in (
      'public.governance_owner_approval_records'::regclass,
      'public.governance_owner_approval_versions'::regclass,
      'public.governance_owner_approval_version_states'::regclass,
      'public.governance_owner_approval_lifecycle_events'::regclass,
      'public.governance_approved_action_executions'::regclass,
      'public.governance_model_execution_attestations'::regclass,
      'public.product_experience_baseline_versions'::regclass,
      'public.product_experience_sentinel_runs'::regclass,
      'public.product_quality_findings'::regclass
    )
      and relrowsecurity
      and relforcerowsecurity
  ),
  'two-party and sentinel tables have RLS plus FORCE RLS'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.governance_record_owner_approval(uuid,text,text,text,text,text,text,text,text,text,text,text,text[],text[],text[],text,numeric,integer,bigint,integer,text,text[],text,text,interval)',
    'EXECUTE'
  ),
  'service_role cannot execute the Owner approval recording RPC'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b2000000-0000-0000-0000-000000000001',true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b2000000-0000-0000-0000-000000000001"}',
  true
);
insert into two_party_fixture(approval_id,approval_version_id,approval_hash)
select
  (result->>'approvalId')::uuid,
  (result->>'approvalVersionId')::uuid,
  result->>'approvalHash'
from (
  select public.governance_record_owner_approval(
    'b7000000-0000-0000-0000-000000000001',
    'two-party-switch-approval',
    repeat('4',64),
    repeat('6',64),
    repeat('5',40),
    repeat('6',64),
    repeat('4',64),
    'Chillywood2025/chillywood-mobile',
    'codex/cognitive-two-party-fixture',
    'none',
    'set_switch',
    repeat('7',64),
    '{}'::text[],
    '{}'::text[],
    '{}'::text[],
    repeat('9',64),
    1,
    1,
    1024,
    1,
    repeat('8',64),
    array['two-party-test'],
    repeat('9',64),
    repeat('3',64),
    interval '24 hours'
  ) result
) approval;
select is(
  (select count(*)::integer from public.governance_owner_approval_versions),
  1,
  'exact Owner records one immutable approval version'
);
select is(
  (select state from public.governance_owner_approval_version_states),
  'active',
  'Owner approval starts active with a 24-hour-bounded version state'
);
select throws_ok(
  $$select public.governance_claim_approved_action(
    (select approval_version_id from two_party_fixture),
    'cognitive_approved_action_worker','synthetic-worker-assertion-000000000000',
    repeat('5',64),repeat('6',64),(select approval_hash from two_party_fixture),
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'Chillywood2025/chillywood-mobile','codex/cognitive-two-party-fixture',
    'shared','production','none','set_switch',repeat('7',64),repeat('9',64),
    repeat('8',64),repeat('9',64),repeat('3',64)
  )$$,
  '42501',
  null,
  'Owner-authenticated requests cannot service-execute an approved action'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b2000000-0000-0000-0000-000000000003',true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b2000000-0000-0000-0000-000000000003"}',
  true
);
select throws_ok(
  $$select public.governance_record_owner_approval(
    'b7000000-0000-0000-0000-000000000001','non-owner-attempt',
    repeat('4',64),repeat('6',64),repeat('5',40),repeat('6',64),
    repeat('4',64),'Chillywood2025/chillywood-mobile',
    'codex/cognitive-two-party-fixture','none','set_switch',repeat('7',64),
    '{}'::text[],'{}'::text[],'{}'::text[],repeat('9',64),1,1,1024,1,
    repeat('8',64),array['two-party-test'],repeat('9',64),repeat('3',64),
    interval '24 hours'
  )$$,
  '42501',
  null,
  'non-Owner authenticated user cannot record approval'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b2000000-0000-0000-0000-000000000002',true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b2000000-0000-0000-0000-000000000002"}',
  true
);
select throws_ok(
  $$select public.governance_register_two_party_service_principal(
    'cognitive_approved_action_worker',repeat('a',64),
    array['set_switch'],transaction_timestamp()+interval '1 day'
  )$$,
  '42501',
  null,
  'super-admin cannot register the service principal as Owner'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b2000000-0000-0000-0000-000000000001',true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b2000000-0000-0000-0000-000000000001"}',
  true
);
select is(
  public.governance_register_two_party_service_principal(
    'cognitive_approved_action_worker',
    encode(extensions.digest(convert_to('synthetic-worker-assertion-000000000000','UTF8'),'sha256'),'hex'),
    array['set_switch'],
    transaction_timestamp()+interval '1 day'
  )->>'status',
  'registered',
  'exact Owner registers only the service worker assertion hash'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(
  $$select public.governance_record_owner_approval(
    'b7000000-0000-0000-0000-000000000001','service-owner-attempt',
    repeat('4',64),repeat('6',64),repeat('5',40),repeat('6',64),
    repeat('4',64),'Chillywood2025/chillywood-mobile',
    'codex/cognitive-two-party-fixture','none','set_switch',repeat('7',64),
    '{}'::text[],'{}'::text[],'{}'::text[],repeat('9',64),1,1,1024,1,
    repeat('8',64),array['two-party-test'],repeat('9',64),repeat('3',64),
    interval '24 hours'
  )$$,
  '42501',
  null,
  'service principal cannot create Owner approval'
);
reset role;
select set_config('request.jwt.claim.role','service_role',true);
insert into two_party_fixture(execution_id)
select (result->>'executionId')::uuid
from (
  select public.governance_claim_approved_action(
    (select approval_version_id from two_party_fixture where approval_version_id is not null),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    repeat('5',64),
    repeat('6',64),
    (select approval_hash from two_party_fixture where approval_hash is not null),
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'Chillywood2025/chillywood-mobile',
    'codex/cognitive-two-party-fixture',
    'shared','production','none','set_switch',repeat('7',64),repeat('9',64),
    repeat('8',64),repeat('9',64),repeat('3',64)
  ) result
) claim;
select is(
  (select count(*)::integer from public.governance_approved_action_executions),
  1,
  'service principal claims exactly one approved execution'
);
select throws_ok(
  $$select public.governance_claim_approved_action(
    (select approval_version_id from two_party_fixture where approval_version_id is not null),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    repeat('5',64),repeat('6',64),
    (select approval_hash from two_party_fixture where approval_hash is not null),
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'Chillywood2025/chillywood-mobile','codex/cognitive-two-party-fixture',
    'shared','production','none','set_switch',repeat('7',64),repeat('9',64),
    repeat('8',64),repeat('9',64),repeat('3',64)
  )$$,
  'P0001',
  'two_party_approved_action_claim_rejected',
  'single-use approval cannot replay after first claim'
);
select throws_ok(
  $$select public.governance_claim_approved_action(
    (select approval_version_id from two_party_fixture where approval_version_id is not null),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    repeat('0',64),repeat('6',64),
    (select approval_hash from two_party_fixture where approval_hash is not null),
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'Chillywood2025/chillywood-mobile','codex/cognitive-two-party-fixture',
    'shared','production','none','set_switch',repeat('7',64),repeat('9',64),
    repeat('8',64),repeat('9',64),repeat('3',64)
  )$$,
  'P0001',
  'two_party_approved_action_claim_rejected',
  'wrong decision-manifest hash is denied'
);
select is(
  public.governance_begin_approved_execution(
    (select execution_id from two_party_fixture where execution_id is not null),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    'preflight'
  )->>'state',
  'preflight',
  'service worker enters preflight'
);
select is(
  public.governance_begin_approved_execution(
    (select execution_id from two_party_fixture where execution_id is not null),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    'executing'
  )->>'state',
  'executing',
  'service worker enters executing after preflight'
);
select is(
  public.governance_execute_approved_switch(
    (select execution_id from two_party_fixture where execution_id is not null),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    'cognitive_livekit_experience_sentinel_enabled',
    true,
    'two-party-test',
    repeat('7',64)
  )->>'enabled',
  'true',
  'service worker executes a switch change only after exact approval'
);
select is(
  public.governance_begin_approved_execution(
    (select execution_id from two_party_fixture where execution_id is not null),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    'evaluating'
  )->>'state',
  'evaluating',
  'service worker enters evaluating after postflight'
);
select is(
  public.governance_complete_approved_execution(
    (select execution_id from two_party_fixture where execution_id is not null),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    repeat('b',64),
    repeat('c',64)
  )->>'state',
  'completed',
  'service worker completes only with evaluator proof hash'
);
reset role;

select is(
  (
    select enabled
    from public.cognitive_governance_switches
    where switch_key='cognitive_livekit_experience_sentinel_enabled'
  ),
  true,
  'approved switch execution writes the Level 0/1 sentinel switch'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b2000000-0000-0000-0000-000000000001',true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b2000000-0000-0000-0000-000000000001"}',
  true
);
select throws_ok(
  $$select public.governance_revoke_owner_approval(
    (select approval_version_id from two_party_fixture where approval_version_id is not null),
    repeat('d',64)
  )$$,
  'P0001',
  'two_party_owner_revoke_rejected',
  'completed approval version cannot be revoked after execution'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(
  $$select public.governance_record_model_execution_attestation(
    'two-party-assessment',
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'shared','production','product_user_experience',repeat('1',64),
    'family-a','model-a',repeat('2',64),repeat('3',64),repeat('4',64),
    repeat('5',64),true,'same_family_isolated_advisory',0.1,100,
    'model_independence_attestation_service',
    'synthetic-worker-assertion-000000000000'
  )$$,
  '42501',
  null,
  'unregistered model attestation service cannot write attestations'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b2000000-0000-0000-0000-000000000001',true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b2000000-0000-0000-0000-000000000001"}',
  true
);
select public.governance_register_two_party_service_principal(
  'model_independence_attestation_service',
  encode(extensions.digest(convert_to('synthetic-model-assertion-000000000000','UTF8'),'sha256'),'hex'),
  array['model_independence_attestation'],
  transaction_timestamp()+interval '1 day'
);
select public.governance_register_two_party_service_principal(
  'product_quality_triage_router',
  encode(extensions.digest(convert_to('synthetic-triage-assertion-000000000000','UTF8'),'sha256'),'hex'),
  array['product_quality_triage'],
  transaction_timestamp()+interval '1 day'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select is(
  public.governance_record_model_execution_attestation(
    'two-party-assessment',
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'shared','production','product_user_experience',repeat('1',64),
    'family-a','model-a',repeat('2',64),repeat('3',64),repeat('4',64),
    repeat('5',64),true,'same_family_isolated_advisory',0.1,100,
    'model_independence_attestation_service',
    'synthetic-model-assertion-000000000000'
  ) is not null,
  true,
  'registered model attestation service records sanitized execution attestation'
);
select is(
  public.governance_model_independence_status(
    'b1000000-0000-0000-0000-000000000001',
    'two-party-assessment',
    2
  )->>'status',
  'MODEL_INDEPENDENCE_PROVIDER_REQUIRED',
  'single model execution cannot claim independent quorum'
);
reset role;

create temporary table two_party_sentinel_run(id uuid);
insert into public.product_experience_sentinel_runs(
  id, task_id, project_id, platform, environment, sentinel_key,
  route_or_surface, runtime_identity_hash, evidence_manifest_hash,
  metric_manifest, result_status, physical_proof_status
) values (
  'b8000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared','production','livekit_experience_sentinel','Live',
  repeat('6',64),repeat('7',64),
  '{"uiState":"connecting","backendState":"healthy","mediaState":"missing"}'::jsonb,
  'finding_created','installed_ui_observed'
);
insert into two_party_sentinel_run values ('b8000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.role','service_role',true);
select is(
  public.product_quality_record_finding(
    (select id from two_party_sentinel_run),
    'livekit-connecting-fixture','Live',repeat('8',64),'high',repeat('9',64),
    array[repeat('a',64)],'installed_ui_state',0.9000,'confirmed_defect',
    repeat('b',64),repeat('c',64),repeat('d',64),'installed_ui_observed',
    'product_quality_triage_router','synthetic-triage-assertion-000000000000'
  ) is not null,
  true,
  'product triage records an evidence-based sentinel finding without product mutation'
);
reset role;

select is(
  (
    select reproduction_state
    from public.product_quality_findings
    where finding_key='livekit-connecting-fixture'
  ),
  'confirmed_defect',
  'sentinel finding preserves truthful classification'
);

select * from finish();
rollback;
