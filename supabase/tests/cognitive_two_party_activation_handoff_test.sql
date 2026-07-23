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

insert into public.governance_model_execution_attestations(
  assessment_id, task_id, project_id, platform, environment, council_role,
  provider_identity_hash, model_family, model_version, execution_identity_hash,
  evidence_packet_hash, prompt_template_version_hash, output_hash,
  blind_first_round, correlation_class, cost, latency_ms
) values
  (
    ('deliberation-' || encode(extensions.digest(convert_to('b4000000-0000-0000-0000-000000000001','UTF8'),'sha256'),'hex')),
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'shared','production','product_user_experience',repeat('a',64),
    'family-a','model-a',repeat('b',64),repeat('c',64),repeat('d',64),
    repeat('e',64),true,'cross_provider',0.1,100
  ),
  (
    ('deliberation-' || encode(extensions.digest(convert_to('b4000000-0000-0000-0000-000000000001','UTF8'),'sha256'),'hex')),
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'shared','production','security_privacy',repeat('b',64),
    'family-b','model-b',repeat('c',64),repeat('d',64),repeat('e',64),
    repeat('f',64),true,'cross_provider',0.1,100
  ),
  (
    ('deliberation-' || encode(extensions.digest(convert_to('b4000000-0000-0000-0000-000000000001','UTF8'),'sha256'),'hex')),
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'shared','production','reliability_release',repeat('c',64),
    'family-c','model-c',repeat('d',64),repeat('e',64),repeat('f',64),
    repeat('a',64),true,'cross_provider',0.1,100
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
  repeat('4',64),repeat('9',64),2,repeat('3',64),repeat('5',64),
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

create temporary table two_party_liveness_fixture(
  fixture_key text primary key,
  approval_version_id uuid,
  approval_hash text,
  execution_id uuid
);
grant select, insert, update on two_party_liveness_fixture to authenticated, service_role;

create temporary table two_party_target_hashes(
  switch_target_hash text not null
);
insert into two_party_target_hashes values (
  encode(extensions.digest(convert_to(
    'set_switch|cognitive_livekit_experience_sentinel_enabled|true|two-party-test',
    'UTF8'
  ), 'sha256'), 'hex')
);
grant select on two_party_target_hashes to authenticated, service_role;

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

select has_column(
  'public',
  'product_experience_sentinel_runs',
  'retention_until',
  'sentinel runs carry bounded retention metadata'
);
select has_column(
  'public',
  'product_quality_findings',
  'retention_until',
  'product findings carry bounded retention metadata'
);
select ok(
  lower(pg_get_functiondef(
    'public.governance_lock_approved_execution_liveness(uuid)'::regprocedure
  )) like '%governance_owner_approval_version_states%'
  and lower(pg_get_functiondef(
    'public.governance_lock_approved_execution_liveness(uuid)'::regprocedure
  )) like '%for update%'
  and lower(pg_get_functiondef(
    'public.governance_lock_approved_execution_liveness(uuid)'::regprocedure
  )) like '%autonomous_system_emergency_states%'
  and lower(pg_get_functiondef(
    'public.governance_lock_approved_execution_liveness(uuid)'::regprocedure
  )) like '%for share%',
  'service execution liveness locks approval state, task, and emergency-stop rows before side effects'
);
select ok(
  lower(pg_get_functiondef(
    'public.governance_lock_approved_execution_cleanup_scope(uuid)'::regprocedure
  )) like '%governance_owner_approval_version_states%'
  and lower(pg_get_functiondef(
    'public.governance_lock_approved_execution_cleanup_scope(uuid)'::regprocedure
  )) like '%for update%'
  and lower(pg_get_functiondef(
    'public.governance_lock_approved_execution_cleanup_scope(uuid)'::regprocedure
  )) like '%autonomous_system_emergency_states%'
  and lower(pg_get_functiondef(
    'public.governance_lock_approved_execution_cleanup_scope(uuid)'::regprocedure
  )) like '%for share%',
  'service execution cleanup locks approval state, task, and emergency-stop rows without granting new side effects'
);
select ok(
  lower(pg_get_functiondef(
    'public.governance_begin_approved_execution(uuid,text,text,text)'::regprocedure
  )) like '%governance_lock_approved_execution_liveness(p_execution_id)%'
  and lower(pg_get_functiondef(
    'public.governance_complete_approved_execution(uuid,text,text,text,text)'::regprocedure
  )) like '%governance_lock_approved_execution_liveness(p_execution_id)%'
  and lower(pg_get_functiondef(
    'public.governance_fail_approved_execution(uuid,text,text,text)'::regprocedure
  )) like '%governance_lock_approved_execution_cleanup_scope(p_execution_id)%'
  and lower(pg_get_functiondef(
    'public.governance_release_or_quarantine_execution(uuid,text,text,text,text)'::regprocedure
  )) like '%governance_lock_approved_execution_cleanup_scope(p_execution_id)%'
  and lower(pg_get_functiondef(
    'public.governance_execute_approved_switch(uuid,text,text,text,boolean,text,text)'::regprocedure
  )) like '%governance_lock_approved_execution_liveness(p_execution_id)%',
  'side effects and success use locked liveness while cleanup uses locked cleanup scope'
);
select ok(
  lower(pg_get_functiondef(
    'public.governance_assert_two_party_service_principal(text,text,text)'::regprocedure
  )) like '%from public.governance_two_party_service_assertions assertion%'
  and lower(pg_get_functiondef(
    'public.governance_assert_two_party_service_principal(text,text,text)'::regprocedure
  )) like '%for share%',
  'service-principal verifier locks the matched assertion row before authorizing execution'
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
    (select switch_target_hash from two_party_target_hashes),
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
    'shared','production','none','set_switch',
    (select switch_target_hash from two_party_target_hashes),repeat('9',64),
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
    'codex/cognitive-two-party-fixture','none','set_switch',
    (select switch_target_hash from two_party_target_hashes),
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
    'codex/cognitive-two-party-fixture','none','set_switch',
    (select switch_target_hash from two_party_target_hashes),
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
    'shared','production','none','set_switch',
    (select switch_target_hash from two_party_target_hashes),repeat('9',64),
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
    'shared','production','none','set_switch',
    (select switch_target_hash from two_party_target_hashes),repeat('9',64),
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
    'shared','production','none','set_switch',
    (select switch_target_hash from two_party_target_hashes),repeat('9',64),
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
select throws_ok(
  $$select public.governance_begin_approved_execution(
    (select execution_id from two_party_fixture where execution_id is not null),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    'postflight'
  )$$,
  'P0001',
  'two_party_execution_transition_rejected',
  'generic begin cannot enter postflight before the approved operation-specific executor runs'
);
select throws_ok(
  $$select public.governance_release_or_quarantine_execution(
    (select execution_id from two_party_fixture where execution_id is not null),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    'rollback_succeeded',
    repeat('f',64)
  )$$,
  'P0001',
  'two_party_execution_release_rejected',
  'rollback cannot skip directly from executing to rollback_succeeded'
);
select throws_ok(
  $$select public.governance_execute_approved_switch(
    (select execution_id from two_party_fixture where execution_id is not null),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    'cognitive_visual_experience_sentinel_enabled',
    true,
    'two-party-test',
    (select switch_target_hash from two_party_target_hashes)
  )$$,
  'P0001',
  'two_party_switch_execution_rejected',
  'approved switch execution rejects a different switch key with the approved target hash'
);
select throws_ok(
  $$select public.governance_execute_approved_switch(
    (select execution_id from two_party_fixture where execution_id is not null),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    'cognitive_livekit_experience_sentinel_enabled',
    false,
    'two-party-test',
    (select switch_target_hash from two_party_target_hashes)
  )$$,
  'P0001',
  'two_party_switch_execution_rejected',
  'approved switch execution rejects a different desired state with the approved target hash'
);
select is(
  public.governance_execute_approved_switch(
    (select execution_id from two_party_fixture where execution_id is not null),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    'cognitive_livekit_experience_sentinel_enabled',
    true,
    'two-party-test',
    (select switch_target_hash from two_party_target_hashes)
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

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b2000000-0000-0000-0000-000000000001',true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b2000000-0000-0000-0000-000000000001"}',
  true
);
insert into two_party_liveness_fixture(fixture_key,approval_version_id,approval_hash)
select
  'emergency-after-side-effect',
  (result->>'approvalVersionId')::uuid,
  result->>'approvalHash'
from (
  select public.governance_record_owner_approval(
    'b7000000-0000-0000-0000-000000000001',
    'emergency-after-side-effect-test',
    repeat('4',64),
    repeat('6',64),
    repeat('5',40),
    repeat('6',64),
    repeat('4',64),
    'Chillywood2025/chillywood-mobile',
    'codex/cognitive-two-party-fixture',
    'none',
    'set_switch',
    (select switch_target_hash from two_party_target_hashes),
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
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
update two_party_liveness_fixture
set execution_id = (result->>'executionId')::uuid
from (
  select public.governance_claim_approved_action(
    (select approval_version_id from two_party_liveness_fixture where fixture_key='emergency-after-side-effect'),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    repeat('5',64),
    repeat('6',64),
    (select approval_hash from two_party_liveness_fixture where fixture_key='emergency-after-side-effect'),
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'Chillywood2025/chillywood-mobile',
    'codex/cognitive-two-party-fixture',
    'shared','production','none','set_switch',
    (select switch_target_hash from two_party_target_hashes),repeat('9',64),
    repeat('8',64),repeat('9',64),repeat('3',64)
  ) result
) claim
where fixture_key='emergency-after-side-effect';
select public.governance_begin_approved_execution(
  (select execution_id from two_party_liveness_fixture where fixture_key='emergency-after-side-effect'),
  'cognitive_approved_action_worker',
  'synthetic-worker-assertion-000000000000',
  'preflight'
);
select public.governance_begin_approved_execution(
  (select execution_id from two_party_liveness_fixture where fixture_key='emergency-after-side-effect'),
  'cognitive_approved_action_worker',
  'synthetic-worker-assertion-000000000000',
  'executing'
);
select public.governance_execute_approved_switch(
  (select execution_id from two_party_liveness_fixture where fixture_key='emergency-after-side-effect'),
  'cognitive_approved_action_worker',
  'synthetic-worker-assertion-000000000000',
  'cognitive_livekit_experience_sentinel_enabled',
  true,
  'two-party-test',
  (select switch_target_hash from two_party_target_hashes)
);
select public.governance_begin_approved_execution(
  (select execution_id from two_party_liveness_fixture where fixture_key='emergency-after-side-effect'),
  'cognitive_approved_action_worker',
  'synthetic-worker-assertion-000000000000',
  'evaluating'
);
reset role;

update public.autonomous_system_emergency_states
set status = 'emergency_stop',
    reason = 'two-party emergency cleanup fixture',
    updated_at = transaction_timestamp()
where system_id = 'product_intelligence_operator';

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(
  $$select public.governance_complete_approved_execution(
    (select execution_id from two_party_liveness_fixture where fixture_key='emergency-after-side-effect'),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    repeat('b',64),
    repeat('c',64)
  )$$,
  'P0001',
  'two_party_execution_completion_rejected',
  'emergency stop after side effect blocks successful completion'
);
select is(
  public.governance_release_or_quarantine_execution(
    (select execution_id from two_party_liveness_fixture where fixture_key='emergency-after-side-effect'),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    'quarantined',
    repeat('d',64)
  )->>'state',
  'quarantined',
  'emergency stop after side effect permits audited quarantine cleanup'
);
reset role;

update public.autonomous_system_emergency_states
set status = 'active',
    reason = 'two-party handoff fixture active emergency state',
    updated_at = transaction_timestamp()
where system_id = 'product_intelligence_operator';

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b2000000-0000-0000-0000-000000000001',true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b2000000-0000-0000-0000-000000000001"}',
  true
);
insert into two_party_liveness_fixture(fixture_key,approval_version_id,approval_hash)
select
  'cancelled-after-claim',
  (result->>'approvalVersionId')::uuid,
  result->>'approvalHash'
from (
  select public.governance_record_owner_approval(
    'b7000000-0000-0000-0000-000000000001',
    'post-claim-cancel-test',
    repeat('4',64),
    repeat('6',64),
    repeat('5',40),
    repeat('6',64),
    repeat('4',64),
    'Chillywood2025/chillywood-mobile',
    'codex/cognitive-two-party-fixture',
    'none',
    'set_switch',
    (select switch_target_hash from two_party_target_hashes),
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
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
update two_party_liveness_fixture
set execution_id = (result->>'executionId')::uuid
from (
  select public.governance_claim_approved_action(
    (select approval_version_id from two_party_liveness_fixture where fixture_key='cancelled-after-claim'),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    repeat('5',64),
    repeat('6',64),
    (select approval_hash from two_party_liveness_fixture where fixture_key='cancelled-after-claim'),
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'Chillywood2025/chillywood-mobile',
    'codex/cognitive-two-party-fixture',
    'shared','production','none','set_switch',
    (select switch_target_hash from two_party_target_hashes),repeat('9',64),
    repeat('8',64),repeat('9',64),repeat('3',64)
  ) result
) claim
where fixture_key='cancelled-after-claim';
reset role;
update public.intelligence_tasks
set cancelled_at = transaction_timestamp()
where id = 'b1000000-0000-0000-0000-000000000001';
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(
  $$select public.governance_begin_approved_execution(
    (select execution_id from two_party_liveness_fixture where fixture_key='cancelled-after-claim'),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    'preflight'
  )$$,
  'P0001',
  'two_party_execution_transition_rejected',
  'post-claim task cancellation blocks execution transition'
);
reset role;
update public.intelligence_tasks
set cancelled_at = null
where id = 'b1000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b2000000-0000-0000-0000-000000000001',true);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b2000000-0000-0000-0000-000000000001"}',
  true
);
insert into two_party_liveness_fixture(fixture_key,approval_version_id,approval_hash)
select
  'revoked-after-claim',
  (result->>'approvalVersionId')::uuid,
  result->>'approvalHash'
from (
  select public.governance_record_owner_approval(
    'b7000000-0000-0000-0000-000000000001',
    'post-claim-revoke-test',
    repeat('4',64),
    repeat('6',64),
    repeat('5',40),
    repeat('6',64),
    repeat('4',64),
    'Chillywood2025/chillywood-mobile',
    'codex/cognitive-two-party-fixture',
    'none',
    'set_switch',
    (select switch_target_hash from two_party_target_hashes),
    '{}'::text[],
    '{}'::text[],
    '{}'::text[],
    repeat('9',64),
    1,
    2,
    1024,
    2,
    repeat('8',64),
    array['two-party-test'],
    repeat('9',64),
    repeat('3',64),
    interval '24 hours'
  ) result
) approval;
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
update two_party_liveness_fixture
set execution_id = (result->>'executionId')::uuid
from (
  select public.governance_claim_approved_action(
    (select approval_version_id from two_party_liveness_fixture where fixture_key='revoked-after-claim'),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    repeat('5',64),
    repeat('6',64),
    (select approval_hash from two_party_liveness_fixture where fixture_key='revoked-after-claim'),
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'Chillywood2025/chillywood-mobile',
    'codex/cognitive-two-party-fixture',
    'shared','production','none','set_switch',
    (select switch_target_hash from two_party_target_hashes),repeat('9',64),
    repeat('8',64),repeat('9',64),repeat('3',64)
  ) result
) claim
where fixture_key='revoked-after-claim';
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
  public.governance_revoke_owner_approval(
    (select approval_version_id from two_party_liveness_fixture where fixture_key='revoked-after-claim'),
    repeat('e',64)
  )->>'status',
  'revoked',
  'Owner revocation can invalidate a claimed multi-use approval'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(
  $$select public.governance_begin_approved_execution(
    (select execution_id from two_party_liveness_fixture where fixture_key='revoked-after-claim'),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    'preflight'
  )$$,
  'P0001',
  'two_party_execution_transition_rejected',
  'post-claim Owner revocation blocks execution transition'
);
select throws_ok(
  $$select public.governance_release_or_quarantine_execution(
    (select execution_id from two_party_liveness_fixture where fixture_key='revoked-after-claim'),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    'quarantined',
    repeat('f',64)
  )$$,
  'P0001',
  'two_party_execution_release_rejected',
  'post-claim Owner revocation blocks rollback and quarantine transition'
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
insert into two_party_liveness_fixture(fixture_key,approval_version_id,approval_hash)
select
  'single-use-revoked-after-claim',
  (result->>'approvalVersionId')::uuid,
  result->>'approvalHash'
from (
  select public.governance_record_owner_approval(
    'b7000000-0000-0000-0000-000000000001',
    'single-use-post-claim-revoke-test',
    repeat('4',64),
    repeat('6',64),
    repeat('5',40),
    repeat('6',64),
    repeat('4',64),
    'Chillywood2025/chillywood-mobile',
    'codex/cognitive-two-party-fixture',
    'none',
    'set_switch',
    (select switch_target_hash from two_party_target_hashes),
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
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
update two_party_liveness_fixture
set execution_id = (result->>'executionId')::uuid
from (
  select public.governance_claim_approved_action(
    (select approval_version_id from two_party_liveness_fixture where fixture_key='single-use-revoked-after-claim'),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    repeat('5',64),
    repeat('6',64),
    (select approval_hash from two_party_liveness_fixture where fixture_key='single-use-revoked-after-claim'),
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'Chillywood2025/chillywood-mobile',
    'codex/cognitive-two-party-fixture',
    'shared','production','none','set_switch',
    (select switch_target_hash from two_party_target_hashes),repeat('9',64),
    repeat('8',64),repeat('9',64),repeat('3',64)
  ) result
) claim
where fixture_key='single-use-revoked-after-claim';
select public.governance_begin_approved_execution(
  (select execution_id from two_party_liveness_fixture where fixture_key='single-use-revoked-after-claim'),
  'cognitive_approved_action_worker',
  'synthetic-worker-assertion-000000000000',
  'preflight'
);
select public.governance_begin_approved_execution(
  (select execution_id from two_party_liveness_fixture where fixture_key='single-use-revoked-after-claim'),
  'cognitive_approved_action_worker',
  'synthetic-worker-assertion-000000000000',
  'executing'
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
  public.governance_revoke_owner_approval(
    (select approval_version_id from two_party_liveness_fixture where fixture_key='single-use-revoked-after-claim'),
    repeat('a',64)
  )->>'status',
  'revoked',
  'Owner revocation can invalidate a consumed single-use in-flight approval'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(
  $$select public.governance_execute_approved_switch(
    (select execution_id from two_party_liveness_fixture where fixture_key='single-use-revoked-after-claim'),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    'cognitive_livekit_experience_sentinel_enabled',
    true,
    'two-party-test',
    (select switch_target_hash from two_party_target_hashes)
  )$$,
  'P0001',
  'two_party_switch_execution_rejected',
  'single-use Owner revocation blocks later approved switch execution'
);
select throws_ok(
  $$select public.governance_complete_approved_execution(
    (select execution_id from two_party_liveness_fixture where fixture_key='single-use-revoked-after-claim'),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    repeat('b',64),
    repeat('c',64)
  )$$,
  'P0001',
  'two_party_execution_completion_rejected',
  'single-use Owner revocation blocks completion'
);
select is(
  public.governance_release_or_quarantine_execution(
    (select execution_id from two_party_liveness_fixture where fixture_key='single-use-revoked-after-claim'),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    'quarantined',
    repeat('d',64)
  )->>'state',
  'quarantined',
  'single-use Owner revocation permits quarantine cleanup after execution started'
);
reset role;

reset role;
insert into public.governance_owner_approval_records(
  id, decision_manifest_id, task_id, project_id, platform, environment,
  approval_key, objective_hash, owner_user_id, current_version, current_state,
  maximum_executions, executions_claimed, executions_completed, approval_hash,
  created_at, updated_at
) values (
  'b7100000-0000-0000-0000-000000000001',
  'b7000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared','production','expired-revalidation-test',repeat('4',64),
  'b2000000-0000-0000-0000-000000000001',
  1,'expired',1,0,0,repeat('7',64),
  transaction_timestamp() - interval '2 seconds',
  transaction_timestamp() - interval '1 second'
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
  'b7200000-0000-0000-0000-000000000001',
  'b7100000-0000-0000-0000-000000000001',
  'b7000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared','production',1,'b2000000-0000-0000-0000-000000000001',
  encode(extensions.digest(convert_to('b2000000-0000-0000-0000-000000000001','UTF8'),'sha256'),'hex'),
  repeat('5',64),repeat('6',64),repeat('5',40),repeat('6',64),repeat('4',64),
  repeat('4',64),'Chillywood2025/chillywood-mobile',
  'codex/cognitive-two-party-fixture','none','set_switch',
  (select switch_target_hash from two_party_target_hashes),
  '{}'::text[],'{}'::text[],'{}'::text[],repeat('9',64),1,1,1024,1,
  repeat('8',64),array['two-party-test'],repeat('9',64),repeat('3',64),
  repeat('7',64),
  transaction_timestamp() - interval '2 seconds',
  transaction_timestamp() - interval '2 seconds',
  transaction_timestamp() - interval '1 second'
);
insert into public.governance_owner_approval_version_states(
  approval_version_id, approval_record_id, task_id, project_id, platform,
  environment, state, maximum_executions
) values (
  'b7200000-0000-0000-0000-000000000001',
  'b7100000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared','production','expired',1
);
insert into public.governance_owner_approval_lifecycle_events(
  approval_record_id, approval_version_id, task_id, project_id, platform,
  environment, event_sequence, event_type, event_hash, actor_identity_hash
) values (
  'b7100000-0000-0000-0000-000000000001',
  'b7200000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared','production',1,'owner_approved',repeat('7',64),
  encode(extensions.digest(convert_to('b2000000-0000-0000-0000-000000000001','UTF8'),'sha256'),'hex')
);
insert into two_party_liveness_fixture(
  fixture_key, approval_version_id, approval_hash
) values (
  'expired-revalidation',
  'b7200000-0000-0000-0000-000000000001',
  repeat('7',64)
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
  public.governance_revalidate_owner_approval(
    (select approval_version_id from two_party_liveness_fixture where fixture_key='expired-revalidation'),
    repeat('1',64),repeat('5',64),repeat('5',40),repeat('6',64),false,
    interval '24 hours'
  )->>'status',
  'active',
  'expired approval revalidation creates one active successor version'
);
select throws_ok(
  $$select public.governance_revalidate_owner_approval(
    (select approval_version_id from two_party_liveness_fixture where fixture_key='expired-revalidation'),
    repeat('2',64),repeat('5',64),repeat('5',40),repeat('6',64),false,
    interval '24 hours'
  )$$,
  'P0001',
  'two_party_reinstatement_requires_amended_approval',
  'same expired approval version cannot be revalidated twice'
);
select is(
  (
    select count(*)::integer
    from public.governance_owner_approval_version_states state
    where state.approval_record_id = (
      select approval_record_id
      from public.governance_owner_approval_versions
      where id = (
        select approval_version_id
        from two_party_liveness_fixture
        where fixture_key='expired-revalidation'
      )
    )
      and state.state = 'active'
  ),
  1,
  'revalidation preserves a single active approval version per approval record'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(
  $$select public.governance_claim_approved_action(
    (select approval_version_id from two_party_liveness_fixture where fixture_key='expired-revalidation'),
    'cognitive_approved_action_worker',
    'synthetic-worker-assertion-000000000000',
    repeat('5',64),repeat('6',64),
    (select approval_hash from two_party_liveness_fixture where fixture_key='expired-revalidation'),
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'Chillywood2025/chillywood-mobile','codex/cognitive-two-party-fixture',
    'shared','production','none','set_switch',
    (select switch_target_hash from two_party_target_hashes),repeat('9',64),
    repeat('8',64),repeat('9',64),repeat('3',64)
  )$$,
  'P0001',
  'two_party_approved_action_claim_rejected',
  'stale non-current approval version cannot be claimed after revalidation'
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
select public.governance_register_two_party_service_principal(
  'livekit_experience_sentinel',
  encode(extensions.digest(convert_to('synthetic-livekit-assertion-000000000000','UTF8'),'sha256'),'hex'),
  array['livekit_experience_canary'],
  transaction_timestamp()+interval '1 day'
);
select public.governance_register_two_party_service_principal(
  'visual_product_experience_sentinel',
  encode(extensions.digest(convert_to('synthetic-visual-assertion-000000000000','UTF8'),'sha256'),'hex'),
  array['visual_experience_canary'],
  transaction_timestamp()+interval '1 day'
);
select public.governance_register_two_party_service_principal(
  'installed_journey_sentinel',
  encode(extensions.digest(convert_to('synthetic-installed-assertion-000000000000','UTF8'),'sha256'),'hex'),
  array['installed_journey_canary'],
  transaction_timestamp()+interval '1 day'
);
select public.governance_register_two_party_service_principal(
  'product_experience_baseline_service',
  encode(extensions.digest(convert_to('synthetic-baseline-assertion-000000000000','UTF8'),'sha256'),'hex'),
  array['visual_experience_canary'],
  transaction_timestamp()+interval '1 day'
);
select is(
  public.governance_revoke_two_party_service_principal(
    'product_experience_baseline_service',
    repeat('f',64)
  )->>'status',
  'revoked',
  'Owner can revoke a service-principal assertion through an explicit RPC'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(
  $$select public.governance_assert_two_party_service_principal(
    'product_experience_baseline_service',
    'synthetic-baseline-assertion-000000000000',
    'visual_experience_canary'
  )$$,
  '42501',
  'two_party_service_principal_required',
  'revoked service-principal assertion cannot execute'
);
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
select public.governance_record_model_execution_attestation(
  'same-provider-assessment',
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared','production','architecture_engineering',repeat('a',64),
  'family-a','model-a',repeat('b',64),repeat('c',64),repeat('d',64),
  repeat('e',64),true,'same_provider_distinct_model_family',0.1,100,
  'model_independence_attestation_service',
  'synthetic-model-assertion-000000000000'
);
select public.governance_record_model_execution_attestation(
  'same-provider-assessment',
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared','production','security_privacy',repeat('a',64),
  'family-b','model-b',repeat('c',64),repeat('d',64),repeat('e',64),
  repeat('f',64),true,'same_provider_distinct_model_family',0.1,100,
  'model_independence_attestation_service',
  'synthetic-model-assertion-000000000000'
);
select is(
  public.governance_model_independence_status(
    'b1000000-0000-0000-0000-000000000001',
    'same-provider-assessment',
    2
  )->>'status',
  'MODEL_INDEPENDENCE_PROVIDER_REQUIRED',
  'same-provider distinct-model attestations cannot claim independent quorum'
);
select public.governance_record_model_execution_attestation(
  'cross-provider-same-family-assessment',
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared','production','architecture_engineering',repeat('1',64),
  'family-a','model-a',repeat('2',64),repeat('3',64),repeat('4',64),
  repeat('5',64),true,'cross_provider',0.1,100,
  'model_independence_attestation_service',
  'synthetic-model-assertion-000000000000'
);
select public.governance_record_model_execution_attestation(
  'cross-provider-same-family-assessment',
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared','production','security_privacy',repeat('2',64),
  'family-a','model-a',repeat('3',64),repeat('4',64),repeat('5',64),
  repeat('6',64),true,'cross_provider',0.1,100,
  'model_independence_attestation_service',
  'synthetic-model-assertion-000000000000'
);
select is(
  public.governance_model_independence_status(
    'b1000000-0000-0000-0000-000000000001',
    'cross-provider-same-family-assessment',
    2
  )->>'status',
  'MODEL_INDEPENDENCE_PROVIDER_REQUIRED',
  'cross-provider same-family attestations cannot claim independent model quorum'
);
select public.governance_record_model_execution_attestation(
  'duplicate-role-assessment',
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared','production','product_user_experience',repeat('a',64),
  'family-a','model-a',repeat('b',64),repeat('c',64),repeat('d',64),
  repeat('e',64),true,'cross_provider',0.1,100,
  'model_independence_attestation_service',
  'synthetic-model-assertion-000000000000'
);
select public.governance_record_model_execution_attestation(
  'duplicate-role-assessment',
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared','production','product_user_experience',repeat('b',64),
  'family-b','model-b',repeat('c',64),repeat('d',64),repeat('e',64),
  repeat('f',64),true,'cross_provider',0.1,100,
  'model_independence_attestation_service',
  'synthetic-model-assertion-000000000000'
);
select public.governance_record_model_execution_attestation(
  'duplicate-role-assessment',
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared','production','product_user_experience',repeat('c',64),
  'family-c','model-c',repeat('d',64),repeat('e',64),repeat('f',64),
  repeat('a',64),true,'cross_provider',0.1,100,
  'model_independence_attestation_service',
  'synthetic-model-assertion-000000000000'
);
select is(
  public.governance_model_independence_status(
    'b1000000-0000-0000-0000-000000000001',
    'duplicate-role-assessment',
    3
  )->>'status',
  'MODEL_INDEPENDENCE_PROVIDER_REQUIRED',
  'duplicate council-role attestations cannot claim independent quorum'
);
reset role;

create temporary table two_party_sentinel_run(id uuid);
grant select, insert on two_party_sentinel_run to service_role;
create temporary table two_party_visual_passed_run(id uuid);
grant select, insert on two_party_visual_passed_run to service_role;
create temporary table two_party_expired_sentinel_run(id uuid);
grant select, insert on two_party_expired_sentinel_run to service_role;
insert into public.cognitive_governance_switches(
  task_id, project_id, platform, environment, switch_key, enabled,
  policy_version, enabled_by, enabled_at, updated_at
) values (
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared','production','cognitive_installed_journey_sentinel_enabled',
  true,'two-party-installed-test','b2000000-0000-0000-0000-000000000001',
  transaction_timestamp(),transaction_timestamp()
);
insert into public.cognitive_governance_switches(
  task_id, project_id, platform, environment, switch_key, enabled,
  policy_version, enabled_by, enabled_at, updated_at
) values (
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared','production','cognitive_visual_experience_sentinel_enabled',
  true,'two-party-visual-test','b2000000-0000-0000-0000-000000000001',
  transaction_timestamp(),transaction_timestamp()
);
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(
  $$select public.product_experience_record_sentinel_run(
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'shared','production','livekit_experience_sentinel','Live',
    repeat('6',64),repeat('7',64),
    '{
      "tokenRequested":true,
      "tokenReturned":true,
      "websocketConnected":true,
      "iceState":"connected",
      "roomConnected":true,
      "localTrackPublished":true,
        "remoteParticipantJoined":true,
        "remoteTrackSubscribed":true,
        "firstAudioVideoObserved":true,
        "connectingResolved":true
      }'::jsonb,
      'passed','source_only',
    'livekit_experience_sentinel','synthetic-livekit-assertion-000000000000'
  )$$,
  'P0001',
    'product_experience_sentinel_run_rejected',
    'LiveKit sentinel cannot pass from source-only evidence'
  );
select throws_ok(
  $$select public.product_experience_record_sentinel_run(
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'shared','production','livekit_experience_sentinel','Live',
    repeat('6',64),repeat('7',64),
    '{
      "tokenRequested":true,
      "tokenReturned":true,
      "websocketConnected":true,
      "iceState":"connected",
      "roomConnected":true,
      "localTrackPublished":true,
      "remoteParticipantJoined":true,
      "remoteTrackSubscribed":true,
      "firstAudioVideoObserved":true,
      "connectingResolved":true
    }'::jsonb,
    'passed','installed_ui_observed',
    'livekit_experience_sentinel','synthetic-livekit-assertion-000000000000'
  )$$,
  'P0001',
  'product_experience_sentinel_run_rejected',
  'LiveKit sentinel pass rejects missing bounded timing evidence'
);
select throws_ok(
  $$select public.product_experience_record_sentinel_run(
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'shared','production','livekit_experience_sentinel','Live',
    repeat('6',64),repeat('7',64),
    '{
      "tokenRequested":true,
      "tokenReturned":true,
      "websocketConnected":true,
      "iceState":"connected",
      "roomConnected":true,
      "localTrackPublished":true,
      "remoteParticipantJoined":true,
      "remoteTrackSubscribed":true,
      "firstAudioVideoObserved":true,
      "connectingResolved":true,
      "tokenIssuedElapsedMs":3001,
      "roomConnectElapsedMs":1000,
      "uiStateResolutionElapsedMs":1000,
      "firstRemoteMediaElapsedMs":1000
    }'::jsonb,
    'passed','installed_ui_observed',
    'livekit_experience_sentinel','synthetic-livekit-assertion-000000000000'
  )$$,
  'P0001',
  'product_experience_sentinel_run_rejected',
  'LiveKit sentinel pass rejects constitution deadline violations'
);
select throws_ok(
  $$select public.product_experience_record_sentinel_run(
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'shared','production','livekit_experience_sentinel','Live',
    repeat('6',64),repeat('7',64),
    '{
      "tokenRequested":true,
      "tokenReturned":false,
      "websocketConnected":true,
      "iceState":"failed",
      "roomConnected":false,
      "localTrackPublished":false,
      "remoteParticipantJoined":false,
      "remoteTrackSubscribed":false,
      "firstAudioVideoObserved":false,
      "connectingResolved":false,
      "tokenIssuedElapsedMs":600001,
      "roomConnectElapsedMs":1000,
      "uiStateResolutionElapsedMs":1000,
      "firstRemoteMediaElapsedMs":1000
    }'::jsonb,
    'finding_created','installed_ui_observed',
    'livekit_experience_sentinel','synthetic-livekit-assertion-000000000000'
  )$$,
  'P0001',
  'product_experience_sentinel_run_rejected',
  'LiveKit sentinel finding rejects unbounded timing evidence'
);
insert into two_party_sentinel_run(id)
select public.product_experience_record_sentinel_run(
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared','production','livekit_experience_sentinel','Live',
  repeat('6',64),repeat('7',64),
  '{
    "tokenRequested":true,
    "tokenReturned":true,
    "websocketConnected":true,
    "iceState":"connected",
    "roomConnected":true,
    "localTrackPublished":true,
    "remoteParticipantJoined":true,
    "remoteTrackSubscribed":true,
    "firstAudioVideoObserved":false,
    "connectingResolved":false,
    "tokenIssuedElapsedMs":2500,
    "roomConnectElapsedMs":11000,
    "uiStateResolutionElapsedMs":15001,
    "firstRemoteMediaElapsedMs":20001
  }'::jsonb,
    'finding_created','installed_ui_observed',
  'livekit_experience_sentinel','synthetic-livekit-assertion-000000000000'
);
select throws_ok(
  $$select public.product_quality_record_finding(
    (select id from two_party_sentinel_run),
    'livekit-proof-mismatch-fixture','Live',repeat('8',64),'high',repeat('9',64),
    array[repeat('7',64)],'installed_ui_state',0.9000,'confirmed_defect',
    repeat('b',64),repeat('c',64),repeat('d',64),'source_only',
    'product_quality_triage_router','synthetic-triage-assertion-000000000000'
  )$$,
  'P0001',
  'product_quality_finding_rejected',
  'product triage rejects proof-status mismatch against the sentinel run'
);
select throws_ok(
  $$select public.product_experience_record_sentinel_run(
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'shared','production','visual_product_experience_sentinel','Home',
    repeat('8',64),repeat('9',64),
    '{
      "screenshotEvidenceHash":"not-a-hash",
      "cardViewportWidthRatio":99,
      "cardsVisibleAboveFold":"many",
      "aspectRatio":"9:16",
      "densityScore":2,
      "baselineState":"needs_product_baseline_review",
      "baselineComparisonHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }'::jsonb,
    'finding_created','installed_ui_observed',
    'visual_product_experience_sentinel','synthetic-visual-assertion-000000000000'
  )$$,
  'P0001',
  'product_experience_sentinel_run_rejected',
  'visual sentinel rejects unbounded metric, hash, and aspect-ratio evidence'
);
select is(
  public.product_experience_record_sentinel_run(
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'shared','production','visual_product_experience_sentinel','Home',
    repeat('8',64),repeat('9',64),
    '{
      "screenshotEvidenceHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "cardViewportWidthRatio":0.94,
      "cardsVisibleAboveFold":1,
      "aspectRatio":"16:9",
      "densityScore":0.32,
      "baselineState":"needs_product_baseline_review",
      "baselineComparisonHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }'::jsonb,
    'finding_created','installed_ui_observed',
    'visual_product_experience_sentinel','synthetic-visual-assertion-000000000000'
  ) is not null,
  true,
  'visual sentinel accepts bounded baseline-review finding evidence'
);
insert into two_party_visual_passed_run(id)
select public.product_experience_record_sentinel_run(
  'b1000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'shared','production','visual_product_experience_sentinel','Home',
  repeat('8',64),repeat('e',64),
  '{
    "screenshotEvidenceHash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "cardViewportWidthRatio":0.42,
    "cardsVisibleAboveFold":6,
    "aspectRatio":"16:9",
    "densityScore":0.74,
    "baselineState":"approved_baseline",
    "baselineComparisonHash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
  }'::jsonb,
  'passed','installed_ui_observed',
  'visual_product_experience_sentinel','synthetic-visual-assertion-000000000000'
);
select throws_ok(
  $$select public.product_quality_record_finding(
    (select id from two_party_visual_passed_run),
    'visual-passed-run-baseline-fixture','Home',repeat('8',64),'low',repeat('9',64),
    array[repeat('e',64)],'layout_density',0.6000,'design_baseline_missing',
    repeat('b',64),repeat('c',64),repeat('d',64),'installed_ui_observed',
    'product_quality_triage_router','synthetic-triage-assertion-000000000000'
  )$$,
  'P0001',
  'product_quality_finding_rejected',
  'product triage rejects passed visual run as a governance finding'
);
select throws_ok(
  $$select public.product_experience_record_sentinel_run(
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'shared','production','installed_journey_sentinel','Home',
    repeat('8',64),repeat('9',64),
    '{
      "journeyStepCount":3,
      "unresolvedStateCount":1,
      "screenshotEvidenceHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "sourceRuntimeHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }'::jsonb,
    'finding_created','installed_ui_observed',
    'installed_journey_sentinel','synthetic-installed-assertion-000000000000'
  )$$,
  'P0001',
    'product_experience_sentinel_run_rejected',
    'installed journey sentinel rejects missing expected/observed state and duration evidence'
  );
select throws_ok(
  $$select public.product_experience_record_sentinel_run(
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'shared','production','installed_journey_sentinel','Home',
    repeat('8',64),repeat('9',64),
    '{
      "journeyStepCount":3,
      "unresolvedStateCount":0,
      "expectedState":"home_feed_visible",
      "observedState":"home_feed_visible",
      "maxDurationMs":999999999,
      "elapsedDurationMs":120000,
      "resultState":"success",
      "screenshotEvidenceHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "sourceRuntimeHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }'::jsonb,
    'passed','installed_ui_observed',
    'installed_journey_sentinel','synthetic-installed-assertion-000000000000'
  )$$,
  'P0001',
  'product_experience_sentinel_run_rejected',
  'installed journey sentinel pass rejects caller-overstated timing limits'
);
select throws_ok(
  $$select public.product_experience_record_sentinel_run(
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'shared','production','installed_journey_sentinel','Search',
    repeat('8',64),repeat('9',64),
    '{
      "journeyStepCount":999,
      "unresolvedStateCount":999,
      "expectedState":"home_feed_visible",
      "observedState":"not_a_reviewed_state",
      "maxDurationMs":5000,
      "elapsedDurationMs":1200,
      "resultState":"success",
      "screenshotEvidenceHash":"not-a-hash",
      "sourceRuntimeHash":"also-not-a-hash"
    }'::jsonb,
    'passed','installed_ui_observed',
    'installed_journey_sentinel','synthetic-installed-assertion-000000000000'
  )$$,
  'P0001',
  'product_experience_sentinel_run_rejected',
  'installed journey sentinel rejects malformed hashes and impossible step counts'
);
select is(
  public.product_experience_record_sentinel_run(
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'shared','production','installed_journey_sentinel','Home',
    repeat('8',64),repeat('9',64),
    '{
      "journeyStepCount":3,
      "unresolvedStateCount":0,
      "expectedState":"home_feed_visible",
      "observedState":"home_feed_visible",
      "maxDurationMs":5000,
      "elapsedDurationMs":1200,
      "resultState":"success",
      "screenshotEvidenceHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "sourceRuntimeHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }'::jsonb,
    'passed','installed_ui_observed',
    'installed_journey_sentinel','synthetic-installed-assertion-000000000000'
  ) is not null,
  true,
  'installed journey sentinel accepts bounded expected/observed state evidence'
);
select is(
  public.product_quality_record_finding(
    (select id from two_party_sentinel_run),
    'livekit-connecting-fixture','Live',repeat('8',64),'high',repeat('9',64),
    array[repeat('7',64),repeat('a',64)],'installed_ui_state',0.9000,'confirmed_defect',
    repeat('b',64),repeat('c',64),repeat('d',64),'installed_ui_observed',
    'product_quality_triage_router','synthetic-triage-assertion-000000000000'
  ) is not null,
  true,
  'product triage records an evidence-based sentinel finding without product mutation'
);
reset role;

with inserted as (
  insert into public.product_experience_sentinel_runs(
    task_id, project_id, platform, environment, sentinel_key, route_or_surface,
    runtime_identity_hash, evidence_manifest_hash, metric_manifest, result_status,
    physical_proof_status, created_at, retention_until
  ) values (
    'b1000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'shared','production','installed_journey_sentinel','ExpiredRetentionFixture',
    repeat('a',64),repeat('f',64),'{"retentionFixture":true}'::jsonb,
    'blocked','device_unavailable',
    transaction_timestamp()-interval '10 days',
    transaction_timestamp()-interval '1 day'
  ) returning id
)
insert into two_party_expired_sentinel_run(id)
select id from inserted;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select is(
  public.product_experience_erase_expired_evidence(
    'product_experience_sentinel_runs',
    (select id from two_party_expired_sentinel_run),
    repeat('e',64),
    'product_quality_triage_router',
    'synthetic-triage-assertion-000000000000'
  ) is not null,
  true,
  'expired sentinel evidence receives controlled retention tombstone'
);
reset role;

select is(
  (
    select erased_at is not null
    from public.product_experience_sentinel_runs
    where id = (select id from two_party_expired_sentinel_run)
  ),
  true,
  'retention tombstone marks expired sentinel evidence without deleting source row'
);
select is(
  (
    select count(*) = 1
    from public.cognitive_erasure_events
    where target_table = 'product_experience_sentinel_runs'
      and target_id = (select id from two_party_expired_sentinel_run)
  ),
  true,
  'retention tombstone records immutable erasure event'
);

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
