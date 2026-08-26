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

insert into public.cognitive_service_identities(
  service_identity,credential_hash,status,expires_at
)
select identity,encode(extensions.digest(
  convert_to('synthetic-test-credential-for-' || identity || '-0000000000000000','UTF8'),
  'sha256'
),'hex'),'active',transaction_timestamp()+interval '1 day'
from unnest(array[
  'governance_canary_scheduler','governance_constitution_service',
  'capability_and_tool_broker','research_source_broker',
  'deliberation_orchestrator','independent_evaluation_judge'
]) identity
on conflict (service_identity) do update
set credential_hash=excluded.credential_hash,status='active',
    expires_at=excluded.expires_at,revoked_at=null;
create function pg_temp.set_level01_test_actor(p_actor text)
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

select ok(
  (
    select count(*) = 4
    from pg_class
    where oid in (
      'public.cognitive_level01_canary_runs'::regclass,
      'public.cognitive_level01_schedule_definitions'::regclass,
      'public.cognitive_level01_credential_attestations'::regclass,
      'public.governance_execution_evaluations'::regclass
    )
      and relrowsecurity
      and relforcerowsecurity
  ),
  'Level 0/1 canary tables have RLS and FORCE RLS'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.cognitive_level01_canary_runs',
    'INSERT'
  ),
  'authenticated clients cannot manufacture canary evidence'
);
select ok(
  not has_table_privilege(
    'service_role',
    'public.cognitive_level01_canary_runs',
    'INSERT'
  ),
  'service role cannot bypass the canary RPC with direct inserts'
);

select pg_temp.set_service_role_test_context();
select pg_temp.set_level01_test_actor('governance_canary_scheduler');
create temporary table level01_fixture(task_id uuid, project_id uuid);
insert into level01_fixture
select
  (result->>'taskId')::uuid,
  (result->>'projectId')::uuid
from (
  select public.cognitive_bootstrap_level01_canary(
    repeat('a',40),
    repeat('b',64),
    repeat('c',64),
    repeat('d',64),
    'governance_canary_scheduler'
  ) result
) bootstrap;
grant select on level01_fixture to authenticated;

select pg_temp.set_level01_test_actor('capability_and_tool_broker');
select is(
  public.cognitive_record_level01_credential_attestation(
    (select task_id from level01_fixture),
    (select project_id from level01_fixture),
    'shared','production','github_draft_pr','configured',
    repeat('e',64),
    'ccb0b53a380c2a14bae99680105c60aa1c78267f3a96dff3cb22aaa258588554',
    transaction_timestamp()+interval '1 day',
    'capability_and_tool_broker'
  ) is not null,
  true,
  'credential broker records only a bounded public fingerprint and scope attestation'
);
select ok(
  (
    select not private_material_stored
      and verified_at < expires_at
    from public.cognitive_level01_credential_attestations
  ),
  'credential attestation stores no private material and uses an exclusive expiry'
);
select throws_ok(
  $$update public.cognitive_level01_credential_attestations
      set state='revoked'$$,
  '42501',
  'immutable_cognitive_evidence',
  'credential attestations are immutable lifecycle evidence'
);

select is(
  (
    select environment::text
    from public.intelligence_tasks
    where id = (select task_id from level01_fixture)
  ),
  'production',
  'canary bootstrap creates the exact production environment scope'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_governance_switches
    where task_id = (select task_id from level01_fixture)
      and enabled
  ),
  0,
  'canary bootstrap leaves every switch disabled'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_level01_schedule_definitions
    where task_id = (select task_id from level01_fixture)
      and enabled
  ),
  0,
  'canary bootstrap creates five disabled schedules'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_level01_schedule_definitions
    where task_id = (select task_id from level01_fixture)
  ),
  5,
  'canary bootstrap creates exactly five bounded schedule definitions'
);
select ok(
  (
    select
      policy_state = 'owner_counsel_decision_required'
      and not user_derived_memory_allowed
      and not raw_user_reports_allowed
      and not raw_private_messages_allowed
      and not raw_private_media_allowed
      and not raw_user_analytics_allowed
      and not private_model_input_allowed
    from public.cognitive_retention_policy_states
    where task_id = (select task_id from level01_fixture)
  ),
  'retention gate starts fail closed for every user-derived data class'
);

select throws_ok(
  $$select public.governance_assert_level01_service_actor(
    array['research_source_broker'],
    'decision_manifest_authority'
  )$$,
  '42501',
  'cognitive_service_actor_mismatch',
  'service actor claims cannot cross the closed operation scope'
);

insert into auth.users(id,email,is_sso_user,is_anonymous,email_confirmed_at)
values (
  'b5000000-0000-0000-0000-000000000001',
  'level01-owner@example.invalid',
  false,
  false,
  now()
);
insert into auth.sessions(id,user_id)
values (
  'b5100000-0000-4000-8000-000000000001',
  'b5000000-0000-0000-0000-000000000001'
);
insert into public.platform_role_memberships(role,user_id,email,status)
values (
  'owner',
  'b5000000-0000-0000-0000-000000000001',
  'level01-owner@example.invalid',
  'active'
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub','b5000000-0000-0000-0000-000000000001',
    'session_id','b5100000-0000-4000-8000-000000000001',
    'role','authenticated',
    'email','level01-owner@example.invalid',
    'app_metadata','{}'::jsonb
  )::text,
  true
);
set local role authenticated;
select throws_ok(
  format(
    $$select public.governance_set_level01_switch(
      %L,%L,'shared','production','cognitive_research_enabled',true,
      'collective-governance-v1'
    )$$,
    (select task_id from level01_fixture),
    (select project_id from level01_fixture)
  ),
  'P0001',
  'two_party_owner_approval_required',
  'legacy Owner direct research switch is blocked by the two-party handoff'
);
select throws_ok(
  format(
    $$select public.governance_set_level01_switch(
      %L,%L,'shared','production','cognitive_memory_enabled',true,
      'collective-governance-v1'
    )$$,
    (select task_id from level01_fixture),
    (select project_id from level01_fixture)
  ),
  'P0001',
  'two_party_owner_approval_required',
  'legacy Owner direct memory switch is blocked by the two-party handoff'
);
reset role;
insert into public.cognitive_governance_switches(
  task_id, project_id, platform, environment, switch_key, enabled,
  policy_version, enabled_by, enabled_at, updated_at
)
select
  fixture.task_id, fixture.project_id, 'shared', 'production', switch_key,
  true, 'two-party-fixture', 'b5000000-0000-0000-0000-000000000001',
  transaction_timestamp(), transaction_timestamp()
from level01_fixture fixture
cross join unnest(array[
  'cognitive_research_enabled',
  'cognitive_memory_enabled'
]) switch_key
on conflict (task_id, switch_key) do update
set enabled = excluded.enabled,
    policy_version = excluded.policy_version,
    enabled_by = excluded.enabled_by,
    enabled_at = excluded.enabled_at,
    updated_at = excluded.updated_at;
set local session_replication_role=replica;
insert into public.cognitive_research_backup_retention_attestations(
  id,execution_id,evaluator_proof_id,task_id,project_id,platform,environment,
  provider,provider_plan,backup_state,backup_window_days,restore_available,
  point_in_time_recovery,restored_data_requires_tombstone_replay,
  provider_evidence_hash,provider_verified_at,expires_at
)
select
  'ca000000-0000-4000-8000-000000000001',
  'ca000000-0000-4000-8000-000000000002',
  'ca000000-0000-4000-8000-000000000003',
  fixture.task_id,fixture.project_id,'shared','production',
  'supabase','pro','provider_daily_backups_available',7,true,false,true,
  repeat('a',64),transaction_timestamp(),
  transaction_timestamp()+interval '1 day'
from level01_fixture fixture;
insert into public.cognitive_research_retention_processor_attestations(
  id,execution_id,evaluator_proof_id,backup_attestation_id,task_id,project_id,
  platform,environment,repository_full_name,source_commit,runtime_provider,
  worker_name,runtime_principal,database_role,schedule_cron,
  schedule_timezone,batch_limit,maximum_batches,timeout_ms,
  maximum_lag_seconds,retention_policy_id,retention_policy_hash,
  worker_version_hash,provider_configuration_hash,attestation_hash,expires_at
)
select
  'cb000000-0000-4000-8000-000000000001',
  'ca000000-0000-4000-8000-000000000002',
  'ca000000-0000-4000-8000-000000000003',
  'ca000000-0000-4000-8000-000000000001',
  fixture.task_id,fixture.project_id,'shared','production',
  'Chillywood2025/chillywood-mobile',repeat('a',40),
  'cloudflare_workers','chillywood-level01-public-research-broker',
  'cognitive_public_research_broker','cognitive_public_research_broker',
  '17 * * * *','UTC',100,1,50000,7200,
  'chillywood-cognitive-retention-v1',policy.policy_hash,
  repeat('b',64),repeat('c',64),repeat('d',64),
  transaction_timestamp()+interval '1 day'
from level01_fixture fixture
join public.cognitive_retention_policy_states policy
  on policy.task_id=fixture.task_id
  and policy.project_id=fixture.project_id
  and policy.platform='shared'
  and policy.environment='production';
insert into public.cognitive_research_retention_processor_heartbeats(
  id,processor_attestation_id,maintenance_run_id,task_id,project_id,
  platform,environment,scheduled_at,source_count,claim_count,total_count,
  no_work,attestation_hash,event_hash,completed_at,created_at
)
select
  'cc000000-0000-4000-8000-000000000001',
  'cb000000-0000-4000-8000-000000000001',
  'cc000000-0000-4000-8000-000000000002',
  fixture.task_id,fixture.project_id,'shared','production',
  case
    when date_trunc('hour',transaction_timestamp())+interval '17 minutes'
      <= transaction_timestamp()
    then date_trunc('hour',transaction_timestamp())+interval '17 minutes'
    else date_trunc('hour',transaction_timestamp())-interval '43 minutes'
  end,
  0,0,0,true,repeat('d',64),repeat('e',64),
  transaction_timestamp(),transaction_timestamp()
from level01_fixture fixture;
set local session_replication_role=origin;
select pg_temp.set_service_role_test_context();
select pg_temp.set_level01_test_actor('research_source_broker');

create temporary table level01_source(source_id uuid);
insert into level01_source
select (
  public.cognitive_record_public_research_source_v2(
    (select task_id from level01_fixture),
    (select project_id from level01_fixture),
    'shared',
    'production',
    'expo-docs',
    'docs.expo.dev',
    'official_documentation',
    'Expo',
    'expo',
    encode(extensions.digest(convert_to(
      'https://docs.expo.dev/versions/latest/','UTF8'
    ),'sha256'),'hex'),
    encode(extensions.digest(convert_to(
      'https://docs.expo.dev/versions/latest/','UTF8'
    ),'sha256'),'hex'),
    encode(extensions.digest(convert_to(
      'Official Expo documentation was retrieved for the bounded platform review.',
      'UTF8'
    ),'sha256'),'hex'),
    date_trunc(
      'milliseconds',transaction_timestamp()-interval '1 day'
    ),
    jsonb_build_object(
      'mode','published_metadata',
      'machineValue',to_char(
        date_trunc(
          'milliseconds',transaction_timestamp()-interval '1 day'
        ),
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ),
      'semanticIdentity','published-at:expo-canary',
      'evidenceHash',encode(extensions.digest(convert_to(concat_ws(
        '|','published_metadata',to_char(
          date_trunc(
            'milliseconds',transaction_timestamp()-interval '1 day'
          ),
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),'published-at:expo-canary'
      ),'UTF8'),'sha256'),'hex')
    ),
    transaction_timestamp(),
    transaction_timestamp()+interval '30 days',
    true,
    'Official Expo documentation was retrieved for the bounded platform review.',
    jsonb_build_object(
      'title','Expo documentation',
      'locator','https://docs.expo.dev/versions/latest/'
    ),
    array[repeat('e',64)],
    'synthetic-test-credential-for-research_source_broker-0000000000000000'
  )->>'source_id'
)::uuid;
grant select on level01_source to authenticated;
select is(
  (select count(*)::integer from level01_source),
  1,
  'bounded official public source ingestion succeeds only after owner switches'
);

select lives_ok(
  format(
    $$select public.cognitive_record_public_research_claim(
      %L,%L,'shared','production','platform_policy_research',
      'The reviewed Expo platform documentation is current for this canary.',
      'technical',0.900,transaction_timestamp()+interval '30 days','none',
      array[%L::uuid],repeat('a',40),'research_source_broker'
    )$$,
    (select task_id from level01_fixture),
    (select project_id from level01_fixture),
    (select source_id from level01_source)
  ),
  'public research claim requires fresh official provenance'
);
select lives_ok(
  format(
    $$select public.cognitive_record_public_research_claim(
      %L,%L,'shared','production','repository_architecture_ux',
      'The bounded repository route analysis uses non-personal source evidence.',
      'product',0.850,transaction_timestamp()+interval '30 days','none',
      array[%L::uuid],repeat('a',40),'research_source_broker'
    )$$,
    (select task_id from level01_fixture),
    (select project_id from level01_fixture),
    (select source_id from level01_source)
  ),
  'repository architecture and UX research canary retains bounded provenance'
);
select lives_ok(
  format(
    $$select public.cognitive_record_public_research_claim(
      %L,%L,'shared','production','dependency_security_research',
      'The bounded dependency review uses fresh official security evidence.',
      'security',0.900,transaction_timestamp()+interval '14 days','none',
      array[%L::uuid],repeat('a',40),'research_source_broker'
    )$$,
    (select task_id from level01_fixture),
    (select project_id from level01_fixture),
    (select source_id from level01_source)
  ),
  'dependency and security research canary requires official provenance'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_level01_canary_runs
    where canary_type = 'research'
      and result_status = 'passed'
      and not private_data_used
      and not user_derived_data_used
  ),
  3,
  'all three research canary records are immutable, non-personal, and passed'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub','b5000000-0000-0000-0000-000000000001',
    'session_id','b5100000-0000-4000-8000-000000000001',
    'role','authenticated',
    'email','level01-owner@example.invalid',
    'app_metadata','{}'::jsonb
  )::text,
  true
);
set local role authenticated;
select throws_ok(
  format(
    $$select public.governance_set_level01_switch(
      %L,%L,'shared','production',
      'cognitive_collective_deliberation_enabled',true,
      'collective-governance-v1'
    )$$,
    (select task_id from level01_fixture),
    (select project_id from level01_fixture)
  ),
  'P0001',
  'two_party_owner_approval_required',
  'legacy Owner direct collective-deliberation switch is blocked'
);
reset role;
insert into public.cognitive_governance_switches(
  task_id, project_id, platform, environment, switch_key, enabled,
  policy_version, enabled_by, enabled_at, updated_at
)
select
  fixture.task_id, fixture.project_id, 'shared', 'production',
  'cognitive_collective_deliberation_enabled', true, 'two-party-fixture',
  'b5000000-0000-0000-0000-000000000001', transaction_timestamp(),
  transaction_timestamp()
from level01_fixture fixture
on conflict (task_id, switch_key) do update
set enabled = excluded.enabled,
    policy_version = excluded.policy_version,
    enabled_by = excluded.enabled_by,
    enabled_at = excluded.enabled_at,
    updated_at = excluded.updated_at;
select pg_temp.set_service_role_test_context();
select pg_temp.set_level01_test_actor('deliberation_orchestrator');

select lives_ok(
  format(
    $$select public.cognitive_record_level01_deliberation_canary(
      %L,%L,'shared','production','low_risk_ux_deliberation',
      %L::jsonb,repeat('a',40),'deliberation_orchestrator'
    )$$,
    (select task_id from level01_fixture),
    (select project_id from level01_fixture),
    jsonb_build_object(
      'evidencePacketHash', repeat('1',64),
      'blindAssessments', jsonb_build_array('product','architecture','security','reliability'),
      'alternatives', jsonb_build_array('no_action','minimal_repair','moderate_improvement'),
      'criticisms', jsonb_build_array('security','reliability','product','red_team'),
      'dissent', jsonb_build_array('minority_report_preserved'),
      'votes', jsonb_build_array('support','support','support','abstain'),
      'mandatoryVetoes', jsonb_build_array(),
      'stakeholderImpacts', jsonb_build_array(
        'users','creators','subscribers','minors','accessibility','admins',
        'owner','android','ios','web','privacy','security','support','cost','legal'
      ),
      'selectedOption', 'minimal_repair',
      'decisionHash', repeat('2',64)
    )
  ),
  'bounded deliberation records blind assessments, alternatives, criticism, dissent, and stakeholders'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub','b5000000-0000-0000-0000-000000000001',
    'session_id','b5100000-0000-4000-8000-000000000001',
    'role','authenticated',
    'email','level01-owner@example.invalid',
    'app_metadata','{}'::jsonb
  )::text,
  true
);
set local role authenticated;
select throws_ok(
  format(
    $$select public.governance_set_level01_switch(
      %L,%L,'shared','production',
      'cognitive_draft_pr_executor_enabled',true,
      'collective-governance-v1'
    )$$,
    (select task_id from level01_fixture),
    (select project_id from level01_fixture)
  ),
  'P0001',
  'two_party_owner_approval_required',
  'draft-PR executor cannot be enabled by the legacy direct Owner RPC'
);
select throws_ok(
  format(
    $$select public.cognitive_set_level01_schedule_state(
      %L,%L,'shared','production',true
    )$$,
    (select task_id from level01_fixture),
    (select project_id from level01_fixture)
  ),
  '42501',
  'permission denied for function cognitive_set_level01_schedule_state',
  'superseded non-atomic schedule RPC is not executable'
);
reset role;

select throws_ok(
  $$update public.cognitive_level01_canary_runs
    set result_status = 'failed'$$,
  '42501',
  'immutable_cognitive_evidence',
  'canary evidence cannot be rewritten'
);

select * from finish();
rollback;
