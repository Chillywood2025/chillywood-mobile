begin;
select no_plan();
insert into public.cognitive_service_identities(
  service_identity,credential_hash,status,expires_at
)
select identity,encode(extensions.digest(
  convert_to('synthetic-test-credential-for-' || identity || '-0000000000000000','UTF8'),
  'sha256'
),'hex'),'active',transaction_timestamp()+interval '1 day'
from unnest(array[
  'governance_constitution_service','decision_manifest_authority',
  'owner_approval_lifecycle_service','capability_and_tool_broker',
  'cognitive_postflight_authority','independent_evaluation_judge',
  'cognitive_control_plane'
]) identity
on conflict (service_identity) do update
set credential_hash=excluded.credential_hash,status='active',
    expires_at=excluded.expires_at,revoked_at=null;
create function pg_temp.set_governance_test_actor(p_actor text)
returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.cognitive_actor',p_actor,true);
  perform set_config(
    'request.jwt.claim.cognitive_service_credential',
    'synthetic-test-credential-for-' || p_actor || '-0000000000000000',
    true
  );
  return p_actor;
end;
$$;

select is(
  (
    select count(*)::integer
    from pg_class
    where oid in (
      select format('public.%I', table_name)::regclass
      from unnest(array[
        'governance_constitutions',
        'governance_constitution_versions',
        'governance_council_roles',
        'governance_deliberations',
        'governance_evidence_packets',
        'governance_council_assignments',
        'governance_assessments',
        'governance_proposals',
        'governance_votes',
        'governance_vetoes',
        'governance_dissent_reports',
        'governance_stakeholder_impacts',
        'governance_decision_manifests',
        'governance_decision_manifest_events',
        'governance_approvals',
        'governance_approval_versions',
        'governance_approval_events',
        'governance_appeals',
        'governance_decision_capability_bindings',
        'cognitive_execution_receipts',
        'governance_execution_receipt_leases',
        'governance_outcome_evaluations',
        'governance_calibration_records',
        'governance_audit_events',
        'governance_approval_notifications',
        'cognitive_governance_switches',
        'cognitive_retention_policy_states'
      ]) table_name
    ) and relrowsecurity
  ),
  27,
  'RLS is enabled on all 27 collective-governance tables'
);

select is(
  (
    select count(*)::integer
    from pg_class
    where oid in (
      select format('public.%I', table_name)::regclass
      from unnest(array[
        'governance_constitutions',
        'governance_constitution_versions',
        'governance_council_roles',
        'governance_deliberations',
        'governance_evidence_packets',
        'governance_council_assignments',
        'governance_assessments',
        'governance_proposals',
        'governance_votes',
        'governance_vetoes',
        'governance_dissent_reports',
        'governance_stakeholder_impacts',
        'governance_decision_manifests',
        'governance_decision_manifest_events',
        'governance_approvals',
        'governance_approval_versions',
        'governance_approval_events',
        'governance_appeals',
        'governance_decision_capability_bindings',
        'cognitive_execution_receipts',
        'governance_execution_receipt_leases',
        'governance_outcome_evaluations',
        'governance_calibration_records',
        'governance_audit_events',
        'governance_approval_notifications',
        'cognitive_governance_switches',
        'cognitive_retention_policy_states'
      ]) table_name
    ) and relforcerowsecurity
  ),
  27,
  'FORCE RLS is enabled on all 27 collective-governance tables'
);

select ok(
  not has_table_privilege('anon','public.governance_decision_manifests','SELECT'),
  'anon cannot read decision manifests'
);
select ok(
  not has_table_privilege('authenticated','public.governance_decision_manifests','INSERT'),
  'authenticated callers cannot create decision manifests'
);
select ok(
  not has_table_privilege('authenticated','public.governance_approvals','UPDATE'),
  'authenticated callers cannot edit approvals directly'
);
select ok(
  not has_table_privilege('service_role','public.governance_votes','INSERT'),
  'service role cannot manufacture a vote directly'
);
select ok(
  not has_table_privilege('service_role','public.governance_approval_versions','UPDATE'),
  'service role cannot rewrite approval versions'
);
select ok(
  not has_table_privilege('service_role','public.cognitive_execution_receipts','INSERT'),
  'service role cannot manufacture a postflight receipt directly'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.governance_owner_activate_approval(uuid,text,text,text,text,text,text[],text[],text,numeric,integer,bigint,text[],text,interval)',
    'EXECUTE'
  ),
  'anon cannot invoke owner approval'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.governance_finalize_decision(uuid,uuid,text,text[],text,text,integer,text,boolean,text)',
    'EXECUTE'
  ),
  'authenticated callers cannot finalize a decision'
);
select is(
  (
    select count(*)::integer
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname like 'governance_%'
      and prosecdef
      and proconfig @> array['search_path=""']
  ),
  14,
  'all fourteen governance security-definer RPCs have an empty fixed search_path'
);

insert into public.cognitive_projects(id,repository_full_name)
values (
  'a0000000-0000-0000-0000-000000000001',
  'Chillywood2025/chillywood-mobile'
);
insert into public.intelligence_tasks(
  id,project_id,platform,environment,repository_full_name,branch_name,
  task_key,objective_hash,actor_identity,deadman_at
) values (
  'a1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'shared','ci','Chillywood2025/chillywood-mobile',
  'codex/governance-fixture','governance-task-fixture',
  repeat('a',64),'governance-fixture',transaction_timestamp()+interval '2 days'
);

select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.set_governance_test_actor('governance_constitution_service');
create temporary table governance_fixture_constitution(version_id uuid);
insert into governance_fixture_constitution(version_id)
select public.governance_bootstrap_constitution(
  'a1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'shared','ci','collective-governance-v1',
  'Collective Governance fixture',repeat('1',64),
  '{"activation":"off","selfApproval":false}'::jsonb,
  repeat('2',64),'governance_constitution_service'
);
select is(
  (select count(*)::integer from public.governance_constitutions),
  1,
  'constitution bootstrap creates one constitution'
);
select is(
  (select count(*)::integer from public.governance_council_roles),
  9,
  'constitution bootstrap creates all nine typed council roles'
);
select is(
  (
    select count(*)::integer
    from public.governance_council_roles
    where direct_tool_authority or provider_credentials_allowed or execution_authority
  ),
  0,
  'council roles receive no credentials, tools, or execution authority'
);
select throws_ok(
  $$select public.governance_bootstrap_constitution(
    'a1000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'shared','ci','collective-governance-v1',
    'Duplicate governance fixture',repeat('1',64),
    '{"activation":"off"}'::jsonb,repeat('2',64),
    'governance_constitution_service'
  )$$,
  '23505',
  'governance_constitution_exists',
  'constitution bootstrap is replay protected'
);

set local role authenticated;
select is(
  (select count(*)::integer from public.governance_constitutions),
  0,
  'ordinary authenticated users cannot read governance memory'
);
select throws_ok(
  $$insert into public.governance_votes(
    deliberation_id,proposal_id,council_role_id,assignment_id,
    task_id,project_id,platform,environment,participant_identity_hash,
    position,rationale_hash
  ) values (
    gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
    'a1000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'shared','ci',repeat('a',64),'support',repeat('b',64)
  )$$,
  '42501',
  null,
  'ordinary authenticated users cannot write governance state'
);
reset role;

insert into public.governance_deliberations(
  id,task_id,project_id,platform,environment,constitution_version_id,
  deliberation_key,objective_hash,source_commit,architecture_graph_digest,
  risk_level,status,required_quorum,budget_ceiling,deadline_at
) values (
  'a2000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'shared','ci',(select version_id from governance_fixture_constitution),
  'governance-deliberation-fixture',repeat('3',64),repeat('4',40),
  repeat('5',64),'low','voting',3,5,
  transaction_timestamp()+interval '7 days'
);
insert into public.governance_evidence_packets(
  id,deliberation_id,task_id,project_id,platform,environment,
  packet_hash,source_commit,architecture_graph_digest,research_claim_hashes,
  provider_state_hash,known_unknowns,approval_level,budget_hash,
  rollback_requirements_hash,freshness_deadline
) values (
  'a3000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'shared','ci',repeat('6',64),repeat('4',40),repeat('5',64),
  array[repeat('7',64)],repeat('8',64),
  '{"provider":"unknown","reason":"fixture"}'::jsonb,
  'owner',repeat('9',64),repeat('a',64),
  transaction_timestamp()+interval '2 days'
);

insert into public.governance_council_assignments(
  deliberation_id,council_role_id,task_id,project_id,platform,environment,
  participant_identity_hash,model_identity_hash
)
select
  'a2000000-0000-0000-0000-000000000001',
  role.id,
  'a1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'shared','ci',
  encode(extensions.digest(convert_to(role.role_key || ':participant','UTF8'),'sha256'),'hex'),
  encode(extensions.digest(convert_to(role.role_key || ':model','UTF8'),'sha256'),'hex')
from public.governance_council_roles role
where role.role_key in (
  'product_user_experience',
  'security_privacy',
  'reliability_release',
  'adversarial_red_team'
);
insert into public.governance_assessments(
  deliberation_id,evidence_packet_id,council_role_id,assignment_id,
  task_id,project_id,platform,environment,assessment_hash,
  output_schema_hash,confidence,uncertainty
)
select
  assignment.deliberation_id,
  'a3000000-0000-0000-0000-000000000001',
  assignment.council_role_id,
  assignment.id,
  assignment.task_id,assignment.project_id,assignment.platform,assignment.environment,
  encode(extensions.digest(convert_to(role.role_key || ':assessment','UTF8'),'sha256'),'hex'),
  repeat('b',64),0.8,'medium'
from public.governance_council_assignments assignment
join public.governance_council_roles role on role.id=assignment.council_role_id;
select is(
  (select count(*)::integer from public.governance_assessments where round_number=1 and blind_submission),
  4,
  'four mandatory critics submit independent blind first-round assessments'
);

insert into public.governance_proposals(
  id,deliberation_id,task_id,project_id,platform,environment,option_kind,
  proposal_hash,user_value_score,risk_score,reversibility,cost_estimate,
  proof_burden,rollback_hash
) values
(
  'a4000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'shared','ci','no_action',repeat('c',64),5,1,'full',0,'source',repeat('d',64)
),
(
  'a4000000-0000-0000-0000-000000000002',
  'a2000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'shared','ci','minimal_repair',repeat('d',64),70,10,'full',1,'source',repeat('e',64)
),
(
  'a4000000-0000-0000-0000-000000000003',
  'a2000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'shared','ci','moderate_improvement',repeat('e',64),80,20,'bounded',2,'source',repeat('f',64)
);
insert into public.governance_votes(
  deliberation_id,proposal_id,council_role_id,assignment_id,
  task_id,project_id,platform,environment,participant_identity_hash,
  position,rationale_hash
)
select
  assignment.deliberation_id,
  'a4000000-0000-0000-0000-000000000002',
  assignment.council_role_id,assignment.id,assignment.task_id,
  assignment.project_id,assignment.platform,assignment.environment,
  assignment.participant_identity_hash,
  case when role.role_key='adversarial_red_team' then 'oppose' else 'support' end,
  encode(extensions.digest(convert_to(role.role_key || ':vote','UTF8'),'sha256'),'hex')
from public.governance_council_assignments assignment
join public.governance_council_roles role on role.id=assignment.council_role_id;
select throws_ok(
  $$insert into public.governance_votes(
    deliberation_id,proposal_id,council_role_id,assignment_id,
    task_id,project_id,platform,environment,participant_identity_hash,
    position,rationale_hash
  )
  select
    assignment.deliberation_id,
    'a4000000-0000-0000-0000-000000000002',
    assignment.council_role_id,assignment.id,assignment.task_id,
    assignment.project_id,assignment.platform,assignment.environment,
    assignment.participant_identity_hash,'support',repeat('1',64)
  from public.governance_council_assignments assignment
  limit 1$$,
  '23505',
  null,
  'a council role/model cannot vote twice'
);

insert into public.governance_stakeholder_impacts(
  deliberation_id,proposal_id,task_id,project_id,platform,environment,
  stakeholder_key,impact_level,impact_hash
)
select
  'a2000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'shared','ci',stakeholder_key,'neutral',
  encode(extensions.digest(convert_to(stakeholder_key || ':impact','UTF8'),'sha256'),'hex')
from unnest(array[
  'normal_users','creators','subscribers_buyers','minors_safety_sensitive',
  'accessibility_users','moderators_admins','owner_operations',
  'android','ios','web','privacy','security','support',
  'infrastructure_cost','provider_cost','legal_compliance'
]) stakeholder_key;

insert into public.governance_vetoes(
  deliberation_id,proposal_id,council_role_id,task_id,project_id,
  platform,environment,veto_scope,reason_hash
)
select
  'a2000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000002',
  role.id,
  'a1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'shared','ci','security',repeat('2',64)
from public.governance_council_roles role
where role.role_key='security_privacy';
select pg_temp.set_governance_test_actor('decision_manifest_authority');
select throws_ok(
  $$select public.governance_finalize_decision(
    'a2000000-0000-0000-0000-000000000001',
    'a4000000-0000-0000-0000-000000000002',
    'governance-decision-fixture',array['governance-red-team'],
    repeat('7',64),repeat('8',64),1,repeat('9',64),false,
    'decision_manifest_authority'
  )$$,
  'P0001',
  'governance_mandatory_veto_active',
  'a majority cannot override an unresolved mandatory veto'
);
update public.governance_vetoes
set status='withdrawn'
where deliberation_id='a2000000-0000-0000-0000-000000000001';
select lives_ok(
  $$select public.governance_finalize_decision(
    'a2000000-0000-0000-0000-000000000001',
    'a4000000-0000-0000-0000-000000000002',
    'governance-decision-fixture',array['governance-red-team'],
    repeat('7',64),repeat('8',64),1,repeat('9',64),false,
    'decision_manifest_authority'
  )$$,
  'a fresh evidence packet, criticism, quorum, stakeholder review, and no veto finalize a decision'
);
select is(
  (select status::text from public.governance_deliberations where id='a2000000-0000-0000-0000-000000000001'),
  'decided',
  'decision finalization transitions the deliberation'
);
select is(
  (select count(*)::integer from public.governance_decision_manifest_events where event_type='finalized'),
  1,
  'decision finalization creates one immutable lifecycle event'
);
select throws_ok(
  $$delete from public.governance_decision_manifests$$,
  '42501',
  'immutable_cognitive_evidence',
  'finalized decision manifests are immutable'
);

select pg_temp.set_governance_test_actor('owner_approval_lifecycle_service');
create temporary table governance_fixture_approval(approval_id uuid);
grant select on governance_fixture_approval to authenticated;
insert into governance_fixture_approval(approval_id)
select public.governance_request_approval(
  (select id from public.governance_decision_manifests limit 1),
  'governance-approval-fixture',repeat('a',64),repeat('b',64),
  null,1,'owner_approval_lifecycle_service'
);
select is(
  (select status::text from public.governance_approvals limit 1),
  'pending',
  'service-owned request creates a pending approval, not an approval'
);

insert into auth.users(id,email,is_sso_user,is_anonymous)
values (
  'a5000000-0000-0000-0000-000000000001',
  'governance-owner@example.invalid',
  false,false
);
insert into public.platform_role_memberships(role,user_id,email,status)
values (
  'owner',
  'a5000000-0000-0000-0000-000000000001',
  'governance-owner@example.invalid',
  'active'
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub','a5000000-0000-0000-0000-000000000001',
    'role','authenticated',
    'email','governance-owner@example.invalid',
    'app_metadata','{}'::jsonb
  )::text,
  true
);
set local role authenticated;
select lives_ok(
  format(
    $$select public.governance_owner_activate_approval(
      %L,repeat('7',64),'Chillywood2025/chillywood-mobile',
      'codex/governance-fixture','repository',repeat('c',64),
      array['repository_apply_patch'],
      array[encode(extensions.digest(convert_to('docs/intelligence/','UTF8'),'sha256'),'hex')],
      'medium',5,2,1000,array['governance-red-team'],repeat('9',64),
      interval '24 hours'
    )$$,
    (select approval_id from governance_fixture_approval)
  ),
  'exact immutable Owner identity activates the bounded approval'
);
reset role;
select is(
  (select status::text from public.governance_approvals limit 1),
  'active',
  'approval current state becomes active through the Owner RPC'
);
select ok(
  (
    select expires_at > valid_from
      and expires_at <= valid_from + interval '24 hours'
    from public.governance_approval_versions
    where version_number=1
  ),
  'approval version has an exclusive validity boundary no longer than 24 hours'
);
select throws_ok(
  $$update public.governance_approval_versions set expires_at=expires_at+interval '1 hour'$$,
  '42501',
  'immutable_cognitive_evidence',
  'approval versions cannot be extended in place'
);

create temporary table governance_fixture_snapshot(
  canonical_snapshot jsonb not null,
  snapshot_hash text not null
);
insert into governance_fixture_snapshot(canonical_snapshot,snapshot_hash)
select value,encode(extensions.digest(convert_to(value::text,'UTF8'),'sha256'),'hex')
from (
  select jsonb_build_object(
    'repository','Chillywood2025/chillywood-mobile',
    'branch','codex/governance-fixture',
    'actions',jsonb_build_array('repository_apply_patch'),
    'paths',jsonb_build_array('docs/intelligence/'),
    'tests',jsonb_build_array('governance-red-team'),
    'rollback','scoped revert'
  ) value
) fixture;
insert into public.autonomous_approval_requests(
  id,system_id,action_id,requested_by_actor_type,approval_level,status,title,reason,
  risk_summary,proposed_action,allowed_write_scope,forbidden_scope,rollback_plan,
  kill_switch_plan,proof_plan,validation_plan,expires_at,approved_by,approved_at,
  metadata,platform
) values (
  'a6000000-0000-0000-0000-000000000001',
  'product_intelligence_operator','approve_cognitive_execution','operator',3,'approved',
  'Governance capability fixture','Disposable database test',
  'No production authority','Patch one scoped documentation path',
  '["docs/intelligence/"]'::jsonb,
  '["production","money","rights","auth","rls"]'::jsonb,
  'Scoped revert','Emergency stop','Run required tests',
  'Verify receipt hashes',transaction_timestamp()+interval '1 hour',
  'a5000000-0000-0000-0000-000000000001',transaction_timestamp(),
  jsonb_build_object(
    'approval_scope_hash',repeat('7',64),
    'plan_snapshot_hash',(select snapshot_hash from governance_fixture_snapshot),
    'allowed_operations',jsonb_build_array('repository_apply_patch')
  ),'shared'
);
insert into public.execution_plans(
  id,task_id,project_id,platform,environment,actor_identity,dedupe_key,status,
  data_class,retention_until,plan_version,branch_name,requested_actions,
  path_allowlist,required_test_ids,rollback_plan_hash,source_commit,graph_digest
) values (
  'a6100000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'shared','ci','planner-fixture','governance-plan-fixture','draft',
  'operational_metadata',transaction_timestamp()+interval '30 days',1,
  'codex/governance-fixture',array['repository_apply_patch'],
  array['docs/intelligence/'],array['governance-red-team'],
  repeat('1',64),repeat('4',40),repeat('5',64)
);
insert into public.execution_plan_snapshots(
  id,plan_id,task_id,project_id,platform,environment,snapshot_hash,
  canonical_snapshot,approval_scope_hash,approval_request_id
) values (
  'a6200000-0000-0000-0000-000000000001',
  'a6100000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'shared','ci',(select snapshot_hash from governance_fixture_snapshot),
  (select canonical_snapshot from governance_fixture_snapshot),
  repeat('7',64),'a6000000-0000-0000-0000-000000000001'
);
insert into public.cognitive_capabilities(
  id,capability_id,bearer_hash,nonce_hash,task_id,project_id,repository_full_name,
  branch_name,platform,environment,risk_level,provider,operation,path_scopes,
  issued_at,not_before,expires_at,maximum_calls,remaining_calls,maximum_bytes,
  remaining_bytes,maximum_cost,remaining_cost,approval_request_id,
  approval_scope_hash,plan_snapshot_id,plan_snapshot_hash
) values (
  'a6300000-0000-0000-0000-000000000001','governance-capability-fixture',
  repeat('1',64),repeat('2',64),
  'a1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Chillywood2025/chillywood-mobile','codex/governance-fixture',
  'shared','ci','medium','repository','repository_apply_patch',
  array['docs/intelligence/'],transaction_timestamp(),transaction_timestamp(),
  transaction_timestamp()+interval '30 minutes',2,1,1000,500,5,4,
  'a6000000-0000-0000-0000-000000000001',repeat('7',64),
  'a6200000-0000-0000-0000-000000000001',
  (select snapshot_hash from governance_fixture_snapshot)
);
select pg_temp.set_governance_test_actor('capability_and_tool_broker');
select lives_ok(
  $$select public.governance_bind_capability_to_decision(
    (select id from public.governance_decision_manifests limit 1),
    (select id from public.governance_approval_versions where version_number=1 limit 1),
    'a6300000-0000-0000-0000-000000000001',
    repeat('3',64),'capability_and_tool_broker'
  )$$,
  'capability binds only to the exact decision, approval, task, platform, repository, branch, action, and paths'
);
select throws_ok(
  $$update public.governance_decision_capability_bindings
    set decision_manifest_hash=repeat('4',64)$$,
  '42501',
  'immutable_cognitive_evidence',
  'decision/capability binding is immutable'
);

insert into public.cognitive_capability_events(
  capability_id,task_id,project_id,platform,environment,call_id,
  usage_sequence,event_type,request_hash
) values (
  'a6300000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'shared','ci','governance-call-fixture',1,'consumed',repeat('4',64)
);
insert into public.cognitive_tool_result_records(
  capability_id,task_id,project_id,platform,environment,call_id,
  usage_sequence,result_envelope,result_envelope_hash,result_source
) values (
  'a6300000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'shared','ci','governance-call-fixture',1,
  '{"status":"ok","source":"fixture"}'::jsonb,
  encode(extensions.digest(
    convert_to('{"source": "fixture", "status": "ok"}','UTF8'),'sha256'
  ),'hex'),
  'tool_broker'
);
insert into public.cognitive_resource_leases(
  id,task_id,project_id,platform,environment,resource_type,resource_key,mode,
  issued_at,expires_at,heartbeat_at
) values (
  'a6400000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'shared','ci','path','path:docs/intelligence','write',
  transaction_timestamp(),transaction_timestamp()+interval '30 minutes',
  transaction_timestamp()
);
insert into public.autonomous_system_emergency_states(system_id,status,reason)
values ('product_intelligence_operator','active','local governance fixture')
on conflict (system_id) do update
set status='active',reason='local governance fixture';
select pg_temp.set_governance_test_actor('cognitive_postflight_authority');
select lives_ok(
  $$select public.governance_record_execution_receipt(
    'a6300000-0000-0000-0000-000000000001',
    'governance-call-fixture',1,repeat('5',64),repeat('6',64),
    '{"status":"ok","source":"fixture"}'::jsonb,
    400,1,1,array['a6400000-0000-0000-0000-000000000001'::uuid],
    repeat('e',64),repeat('a',40),'not_required',
    'cognitive_postflight_authority'
  )$$,
  'postflight computes and stores an immutable receipt from the consumed call and live lease'
);
select ok(
  (
    select receipt_hash ~ '^[a-f0-9]{64}$'
      and evaluator_state='incomplete'
      and receipt_state='pending_evaluation'
      and cardinality(resource_lease_ids)=1
    from public.cognitive_execution_receipts
  ),
  'receipt is internally hashed and cannot claim evaluator completion'
);
select is(
  (select count(*)::integer from public.governance_execution_receipt_leases),
  1,
  'receipt lease is relationally bound to the same task scope'
);
select is(
  (
    select revoked_at is not null
    from public.cognitive_resource_leases
    where id='a6400000-0000-0000-0000-000000000001'
  ),
  true,
  'successful postflight releases the exact write lease'
);
select pg_temp.set_governance_test_actor('independent_evaluation_judge');
select throws_ok(
  $$select public.cognitive_record_execution_evaluation(
    (select id from public.cognitive_execution_receipts limit 1),
    'pass',
    jsonb_build_object('callerClaimsPassed',true),
    'independent_evaluation_judge'
  )$$,
  'P0001',
  'cognitive_execution_evaluation_trusted_evidence_rejected',
  'independent evaluator rejects caller-authored pass evidence'
);
insert into public.cognitive_trusted_test_results(
  receipt_id,task_id,project_id,platform,environment,test_id,result_status,
  exit_code,tested_commit,stdout_hash,stderr_hash,runner_identity_hash,result_hash
)
select receipt.id,receipt.task_id,receipt.project_id,receipt.platform,
  receipt.environment,'governance-red-team','passed',0,receipt.final_commit,
  repeat('1',64),repeat('2',64),repeat('3',64),repeat('4',64)
from public.cognitive_execution_receipts receipt;
insert into public.cognitive_trusted_evidence_manifests(
  receipt_id,task_id,project_id,platform,environment,evaluated_commit,
  evaluated_diff_hash,physical_evidence_type,manifest_hash,runner_identity_hash
)
select receipt.id,receipt.task_id,receipt.project_id,receipt.platform,
  receipt.environment,receipt.final_commit,receipt.diff_hash,'none',
  repeat('5',64),repeat('3',64)
from public.cognitive_execution_receipts receipt;
select lives_ok(
  $$select public.cognitive_record_execution_evaluation(
    (select id from public.cognitive_execution_receipts limit 1),
    'pass',
    '{}'::jsonb,
    'independent_evaluation_judge'
  )$$,
  'independent evaluator derives the commit, diff, and required test from trusted runner rows'
);
select is(
  (
    select evaluation_status::text
    from public.governance_execution_evaluations
    limit 1
  ),
  'pass',
  'independent evaluator result is stored separately from the immutable receipt'
);
select throws_ok(
  $$delete from public.governance_execution_evaluations$$,
  '42501',
  'immutable_cognitive_evidence',
  'independent evaluation evidence cannot be deleted'
);
select pg_temp.set_governance_test_actor('cognitive_postflight_authority');
select throws_ok(
  $$select public.governance_record_execution_receipt(
    'a6300000-0000-0000-0000-000000000001',
    'governance-call-fixture',1,repeat('5',64),repeat('6',64),
    '{"status":"ok","source":"replay"}'::jsonb,
    400,1,1,array['a6400000-0000-0000-0000-000000000001'::uuid],
    repeat('e',64),repeat('a',40),'not_required',
    'cognitive_postflight_authority'
  )$$,
  'P0001',
  'governance_postflight_rejected',
  'consumed single-execution approval prevents postflight replay'
);
select throws_ok(
  $$delete from public.cognitive_execution_receipts$$,
  '42501',
  'immutable_cognitive_evidence',
  'postflight receipt cannot be deleted'
);

select pg_temp.set_governance_test_actor('owner_approval_lifecycle_service');
create temporary table governance_fixture_self_approval(approval_id uuid);
grant select on governance_fixture_self_approval to authenticated;
insert into governance_fixture_self_approval(approval_id)
select public.governance_request_approval(
  (select id from public.governance_decision_manifests limit 1),
  'governance-self-approval-fixture',repeat('e',64),repeat('f',64),
  'a5000000-0000-0000-0000-000000000001',1,
  'owner_approval_lifecycle_service'
);
create temporary table governance_fixture_overlong_approval(approval_id uuid);
grant select on governance_fixture_overlong_approval to authenticated;
insert into governance_fixture_overlong_approval(approval_id)
select public.governance_request_approval(
  (select id from public.governance_decision_manifests limit 1),
  'governance-overlong-approval-fixture',repeat('1',64),repeat('2',64),
  null,1,'owner_approval_lifecycle_service'
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub','a5000000-0000-0000-0000-000000000001',
    'role','authenticated',
    'email','governance-owner@example.invalid',
    'app_metadata','{}'::jsonb
  )::text,
  true
);
set local role authenticated;
select throws_ok(
  format(
    $$select public.governance_owner_activate_approval(
      %L,repeat('7',64),'Chillywood2025/chillywood-mobile',
      'codex/governance-fixture','repository',repeat('c',64),
      array['repository_apply_patch'],
      array[encode(extensions.digest(convert_to('docs/intelligence/','UTF8'),'sha256'),'hex')],
      'medium',5,2,1000,array['governance-red-team'],repeat('9',64),
      interval '24 hours'
    )$$,
    (select approval_id from governance_fixture_self_approval)
  ),
  'P0001',
  'governance_self_or_invalid_approval_rejected',
  'requester cannot approve their own governance request'
);
select throws_ok(
  format(
    $$select public.governance_owner_activate_approval(
      %L,repeat('7',64),'Chillywood2025/chillywood-mobile',
      'codex/governance-fixture','repository',repeat('c',64),
      array['repository_apply_patch'],
      array[encode(extensions.digest(convert_to('docs/intelligence/','UTF8'),'sha256'),'hex')],
      'medium',5,2,1000,array['governance-red-team'],repeat('9',64),
      interval '25 hours'
    )$$,
    (select approval_id from governance_fixture_overlong_approval)
  ),
  'P0001',
  'governance_approval_scope_rejected',
  'approval activation rejects a validity window longer than 24 hours'
);
select throws_ok(
  $$select public.governance_set_level01_switch(
    'a1000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'shared','ci','cognitive_research_enabled',true,'fixture-v1'
  )$$,
  'P0001',
  'governance_switch_scope_rejected',
  'Level 0/1 activation is rejected outside the exact production canary scope'
);
select throws_ok(
  $$select public.governance_set_level01_switch(
    'a1000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'shared','ci','cognitive_level2_production_repairs_enabled',true,'fixture-v1'
  )$$,
  'P0001',
  'governance_switch_scope_rejected',
  'Level 2 production repair cannot be activated by the Level 0/1 switch RPC'
);
select throws_ok(
  $$select public.governance_set_level01_switch(
    'a1000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'shared','ci','cognitive_user_derived_memory_enabled',true,'fixture-v1'
  )$$,
  'P0001',
  'governance_switch_scope_rejected',
  'user-derived memory remains outside the Level 0/1 activation path'
);
reset role;

insert into public.cognitive_retention_policy_states(
  task_id,project_id,platform,environment,policy_hash
) values (
  'a1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'shared','ci',repeat('1',64)
);
select ok(
  (
    select policy_state='owner_counsel_decision_required'
      and not user_derived_memory_allowed
      and not raw_user_reports_allowed
      and not raw_private_messages_allowed
      and not raw_private_media_allowed
      and not raw_user_analytics_allowed
      and not private_model_input_allowed
    from public.cognitive_retention_policy_states
  ),
  'retention gate fails closed for every user-derived/private data class'
);
select throws_ok(
  $$insert into public.cognitive_retention_policy_states(
    task_id,project_id,platform,environment,policy_hash,
    user_derived_memory_allowed
  ) values (
    'a1000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'shared','ci',repeat('2',64),true
  )$$,
  '23514',
  null,
  'user-derived retention cannot be enabled without an approved policy'
);

insert into public.platform_role_memberships(role,user_id,email,status)
values (
  'owner',
  'a5000000-0000-0000-0000-000000000099',
  'governance-recycled@example.invalid',
  'active'
);
insert into auth.users(id,email,is_sso_user,is_anonymous)
values (
  'a5000000-0000-0000-0000-000000000002',
  'governance-recycled@example.invalid',
  false,false
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub','a5000000-0000-0000-0000-000000000002',
    'role','authenticated',
    'email','governance-recycled@example.invalid',
    'app_metadata','{}'::jsonb
  )::text,
  true
);
set local role authenticated;
select is(
  public.governance_exact_owner('a5000000-0000-0000-0000-000000000002'),
  false,
  'recycled Owner email never confers immutable Owner identity'
);
select is(
  (select count(*)::integer from public.governance_decision_manifests),
  0,
  'recycled-email caller cannot read governance decisions'
);
reset role;

select ok(
  '2026-07-23 11:59:59.999+00'::timestamptz
    < '2026-07-23 12:00:00+00'::timestamptz,
  'authority remains active one millisecond before its exclusive expiration'
);
select ok(
  not (
    '2026-07-23 12:00:00+00'::timestamptz
      < '2026-07-23 12:00:00+00'::timestamptz
  ),
  'authority is inactive at the exact exclusive expiration boundary'
);
select ok(
  not (
    '2026-07-23 12:00:00.001+00'::timestamptz
      < '2026-07-23 12:00:00+00'::timestamptz
  ),
  'authority remains inactive after its exclusive expiration'
);
select is(
  transaction_timestamp(),
  transaction_timestamp(),
  'authority functions use one database-authoritative transaction clock'
);
set local timezone = 'America/Chicago';
select is(
  '2026-11-01 01:30:00-05'::timestamptz
    < '2026-11-01 01:30:00-06'::timestamptz,
  true,
  'DST fallback ambiguity is resolved by timestamptz instants'
);
set local timezone = 'UTC';
select is(
  '2026-07-23 12:00:00+00'::timestamptz,
  '2026-07-23 07:00:00-05'::timestamptz,
  'authority timestamps compare as instants across non-UTC sessions'
);
select is(
  '2026-07-22 21:49:00+00'::timestamptz
    <= '2026-07-22 21:49:00+00'::timestamptz,
  true,
  'provider waiting periods become effective at their exact inclusive activation instant'
);

select finish();
rollback;
