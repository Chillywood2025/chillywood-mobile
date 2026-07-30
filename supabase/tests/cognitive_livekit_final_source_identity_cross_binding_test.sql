begin;
select plan(27);
select has_table(
  'public',
  'cognitive_livekit_final_source_identity_bindings',
  'the immutable final source identity manifest exists'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_livekit_final_source_identity_bindings
    where binding_version = 'livekit-final-source-identity-v3'
  ),
  2,
  'one exact binding exists for each platform'
);
select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid =
      'public.cognitive_livekit_final_source_identity_bindings'::regclass
  ),
  'the manifest enables and forces RLS'
);
select ok(
  not has_table_privilege(
    'anon',
    'public.cognitive_livekit_final_source_identity_bindings',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.cognitive_livekit_final_source_identity_bindings',
    'SELECT'
  )
  and not has_table_privilege(
    'service_role',
    'public.cognitive_livekit_final_source_identity_bindings',
    'SELECT'
  ),
  'application roles cannot read the internal identity manifest'
);
select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid =
      'public.cognitive_livekit_final_source_identity_bindings'::regclass
      and tgname =
        'cognitive_livekit_final_source_identity_bindings_immutable'
      and not tgisinternal
  ),
  'the manifest rejects update and delete'
);
select throws_ok(
  $$update public.cognitive_livekit_final_source_identity_bindings
    set channel = channel
    where target_platform = 'android'$$,
  '42501',
  'immutable_cognitive_evidence',
  'the manifest update path is behaviorally immutable'
);
select throws_ok(
  $$delete from public.cognitive_livekit_final_source_identity_bindings
    where target_platform = 'android'$$,
  '42501',
  'immutable_cognitive_evidence',
  'the manifest delete path is behaviorally immutable'
);
select ok(
  to_regprocedure(
    'public.cognitive_livekit_final_source_identity_matches_v3(public.cognitive_platform,text,text,text,text,text,text,text,text,uuid,text,text,text)'
  ) is not null,
  'the exact cross-binding predicate exists'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid =
      'public.cognitive_livekit_final_source_identity_matches_v3(public.cognitive_platform,text,text,text,text,text,text,text,text,uuid,text,text,text)'::regprocedure
  ),
  array['search_path=""'],
  'the cross-binding predicate has an empty search_path'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.cognitive_livekit_final_source_identity_matches_v3(public.cognitive_platform,text,text,text,text,text,text,text,text,uuid,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cognitive_livekit_final_source_identity_matches_v3(public.cognitive_platform,text,text,text,text,text,text,text,text,uuid,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.cognitive_livekit_final_source_identity_matches_v3(public.cognitive_platform,text,text,text,text,text,text,text,text,uuid,text,text,text)',
    'EXECUTE'
  ),
  'the internal cross-binding predicate is not application-executable'
);
select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid =
      'public.cognitive_livekit_platform_activation_outcomes'::regclass
      and tgname = 'cognitive_livekit_platform_run_identity_v3'
      and not tgisinternal
      and tgenabled = 'O'
  )
  and not exists (
    select 1
    from pg_trigger
    where tgrelid =
      'public.cognitive_livekit_platform_activation_outcomes'::regclass
      and tgname = 'cognitive_livekit_platform_run_identity_v2'
      and not tgisinternal
  ),
  'v3 replaces the incomplete v2 enabled-outcome guard'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid =
      'public.cognitive_require_livekit_platform_run_identity_v3()'::regprocedure
  ),
  array['search_path=""'],
  'the enabled-outcome trigger function has an empty search_path'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.cognitive_require_livekit_platform_run_identity_v3()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cognitive_require_livekit_platform_run_identity_v3()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.cognitive_require_livekit_platform_run_identity_v3()',
    'EXECUTE'
  ),
  'the trigger function is not directly application-executable'
);
select is(
  public.cognitive_livekit_final_source_identity_matches_v3(
    'android','fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
    '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
    '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
    'com.chillywood.mobile','google_play_internal_testing','86',
    '1.0.0-android-chat-call-action-v1','android-chat-livekit-qa',
    'e3379ac9-61f0-40db-a014-81975be123e5',
    'fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44',
    'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050',
    '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0'
  ),
  true,
  'the exact Android receipt, artifact, source, and runtime match'
);
select is(
  public.cognitive_livekit_final_source_identity_matches_v3(
    'ios','fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
    '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
    '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
    'com.chillywood.mobile','internal_testflight','8',
    '1.0.0-iosqa1','ios-qa',
    '019fb099-f7c3-7130-97aa-a4bb1c49792f',
    '24a951d58302dd73e13e4adc899fc28680472eb78f37cac04639ee95896e36d8',
    '73792a29b2de5445bc7fc718abd6463d812ffec6b566b00ab930045a32d266cb',
    '17d0bf8d12eed354ab5784cc94a3373620c4a9dc09b9aeda81bdb13103351bcf'
  ),
  true,
  'the exact iOS receipt, artifact, source, and runtime match'
);
select ok(
  not exists (
    select 1
    from public.cognitive_livekit_final_source_identity_bindings binding
    where binding.expected_source_build_hash <> encode(
      extensions.digest(
        convert_to(binding.delivered_source_commit,'UTF8'),
        'sha256'
      ),
      'hex'
    )
  ),
  'each run source hash is derived from its delivered source commit'
);
create function pg_temp.livekit_v3_mutation_is_rejected(p_field text)
returns boolean
language sql
stable
as $$
  select not public.cognitive_livekit_final_source_identity_matches_v3(
    case when p_field = 'platform' then 'ios'::public.cognitive_platform
      else 'android'::public.cognitive_platform end,
    case when p_field = 'commit' then repeat('a',40)
      else 'fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6' end,
    case when p_field = 'tree' then repeat('b',40)
      else '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec' end,
    case when p_field = 'deployment' then repeat('0',64)
      else '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0' end,
    case when p_field = 'app' then 'com.example.invalid'
      else 'com.chillywood.mobile' end,
    case when p_field = 'distribution' then 'internal_testflight'
      else 'google_play_internal_testing' end,
    case when p_field = 'build' then '87' else '86' end,
    case when p_field = 'runtime' then 'wrong-runtime'
      else '1.0.0-android-chat-call-action-v1' end,
    case when p_field = 'channel' then 'wrong-channel'
      else 'android-chat-livekit-qa' end,
    case when p_field = 'update' then '00000000-0000-0000-0000-000000000000'::uuid
      else 'e3379ac9-61f0-40db-a014-81975be123e5'::uuid end,
    case when p_field = 'artifact' then repeat('0',64)
      else 'fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44' end,
    case when p_field = 'source' then repeat('0',64)
      else 'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050' end,
    case when p_field = 'runtime_hash' then repeat('0',64)
      else '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0' end
  );
$$;
with negative_cases(field_name) as (
  values ('platform'),('commit'),('tree'),('deployment'),('app'),
    ('distribution'),('build'),('runtime'),('channel'),('update'),
    ('artifact'),('source'),('runtime_hash')
)
select is(
  (select count(*)::integer from negative_cases
   where pg_temp.livekit_v3_mutation_is_rejected(field_name)),
  13,
  'every receipt, artifact, source, and runtime comparator fails alone'
);
with definition as (
  select pg_get_functiondef(
    'public.cognitive_livekit_final_source_identity_matches_v3(public.cognitive_platform,text,text,text,text,text,text,text,text,uuid,text,text,text)'::regprocedure
  ) as body
), comparators(fragment) as (
  values
    ('binding.target_platform = p_target_platform'),
    ('binding.final_source_commit = p_final_source_commit'),
    ('binding.final_source_tree_hash = p_final_source_tree_hash'),
    ('binding.final_deployment_hash = p_final_deployment_hash'),
    ('binding.application_identifier = p_application_identifier'),
    ('binding.distribution = p_distribution'),
    ('binding.build_number = p_build_number'),
    ('binding.runtime_version = p_runtime_version'),
    ('binding.channel = p_channel'),
    ('binding.internal_update_id = p_internal_update_id'),
    ('binding.installed_artifact_hash = p_installed_artifact_hash'),
    ('binding.expected_source_build_hash = p_source_build_hash'),
    ('binding.expected_runtime_identity_hash = p_runtime_identity_hash')
)
select is(
  (select count(*)::integer from definition,comparators
   where position(comparators.fragment in definition.body) > 0),
  13,
  'the predicate source contains all thirteen exact comparators'
);
with definition as (
  select pg_get_functiondef(
    'public.cognitive_require_livekit_platform_run_identity_v3()'::regprocedure
  ) as body
), shared_columns(column_name) as (
  values
    ('shared_task_id'),('target_task_id'),('project_id'),('shared_platform'),
    ('target_platform'),('environment'),('owner_user_id'),
    ('baseline_version_id'),('source_commit'),('source_tree_hash'),
    ('independent_review_hash'),('tests_hash'),('deployment_hash'),
    ('rollback_hash')
)
select is(
  (select count(*)::integer from definition,shared_columns
   where position(
     'authorization_value.' || shared_columns.column_name ||
     ' is distinct from receipt_value.' || shared_columns.column_name
     in definition.body
   ) > 0),
  14,
  'finalization binds every shared authorization field to its receipt'
);
with definition as (
  select pg_get_functiondef(
    'public.cognitive_require_livekit_platform_run_identity_v3()'::regprocedure
  ) as body
), comparators(fragment) as (
  values
    ('run.source_build_hash is distinct from binding_value.expected_source_build_hash'),
    ('run.runtime_identity_hash is distinct from binding_value.expected_runtime_identity_hash'),
    ('binding.internal_update_id = receipt_value.internal_update_id'),
    ('binding.installed_artifact_hash = receipt_value.installed_artifact_hash')
)
select ok(
  (select count(*) from definition,comparators
   where position(comparators.fragment in definition.body) > 0) = 4
  and position(
    'case receipt_value.target_platform'
    in pg_get_functiondef(
      'public.cognitive_require_livekit_platform_run_identity_v3()'::regprocedure
    )
  ) = 0,
  'enabled runs use the selected immutable manifest row without duplicated platform constants'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_livekit_platform_activation_outcomes
  ),
  0,
  'the correction creates no activation outcome'
);
create function pg_temp.sha256(p_value text)
returns text language sql immutable
as $$
  select encode(
    extensions.digest(convert_to(p_value,'UTF8'),'sha256'),
    'hex'
  );
$$;
insert into auth.users(id,is_sso_user,is_anonymous) values
  ('61000000-0000-0000-0000-000000000001',false,false),
  ('61000000-0000-0000-0000-000000000002',false,false);
insert into public.chat_call_livekit_canary_users(
  user_id,enabled,enrolled_by
) values
  (
    '61000000-0000-0000-0000-000000000001',true,
    '61000000-0000-0000-0000-000000000001'
  ),
  (
    '61000000-0000-0000-0000-000000000002',true,
    '61000000-0000-0000-0000-000000000001'
  );
insert into public.provider_events(
  id,provider_event_id,provider,user_id,app_user_id,environment,
  event_type,status,idempotency_key,raw_payload_hash
) values
  (
    '62000000-0000-0000-0000-000000000001','b1-sandbox-premium-a',
    'revenuecat','61000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000001','sandbox',
    'INITIAL_PURCHASE','processed','b1-sandbox-premium-a',
    pg_temp.sha256('b1-sanitized-revenuecat-a')
  ),
  (
    '62000000-0000-0000-0000-000000000002','b1-sandbox-premium-b',
    'revenuecat','61000000-0000-0000-0000-000000000002',
    '61000000-0000-0000-0000-000000000002','sandbox',
    'INITIAL_PURCHASE','processed','b1-sandbox-premium-b',
    pg_temp.sha256('b1-sanitized-revenuecat-b')
  );
insert into public.user_entitlements(
  user_id,entitlement_key,status,source,starts_at,expires_at,metadata
) values
  (
    '61000000-0000-0000-0000-000000000001','premium','active',
    'revenuecat',transaction_timestamp(),
    transaction_timestamp() + interval '1 hour',
    '{"environment":"sandbox","sandbox":true}'::jsonb
  ),
  (
    '61000000-0000-0000-0000-000000000002','premium','active',
    'revenuecat',transaction_timestamp(),
    transaction_timestamp() + interval '1 hour',
    '{"environment":"sandbox","sandbox":true}'::jsonb
  );
insert into public.access_grants(
  user_id,grant_type,source_type,source_id,provider,provider_event_id,
  environment,status,starts_at,expires_at
) values
  (
    '61000000-0000-0000-0000-000000000001','premium','provider_event',
    '62000000-0000-0000-0000-000000000001','revenuecat',
    '62000000-0000-0000-0000-000000000001','sandbox','sandbox_only',
    transaction_timestamp(),transaction_timestamp() + interval '1 hour'
  ),
  (
    '61000000-0000-0000-0000-000000000002','premium','provider_event',
    '62000000-0000-0000-0000-000000000002','revenuecat',
    '62000000-0000-0000-0000-000000000002','sandbox','sandbox_only',
    transaction_timestamp(),transaction_timestamp() + interval '1 hour'
  );
create temporary table b1_sandbox_premium_proof(proof jsonb not null)
on commit drop;
insert into b1_sandbox_premium_proof
select public.cognitive_livekit_sandbox_premium_proof_v1();
do $$
declare proof_value jsonb;
begin
  select proof into proof_value from b1_sandbox_premium_proof;
  if proof_value->>'eligible' <> 'true'
     or (proof_value->>'canaryCount')::integer <> 2
     or (proof_value->>'activeRoleMembershipCount')::integer <> 0
     or (proof_value->>'activeManualGrantCount')::integer <> 0
     or (proof_value->>'qualifiedRevenueCatSandboxRowCount')::integer <> 2
     or (proof_value->>'qualifiedPremiumUserCount')::integer <> 2 then
    raise exception 'sanitized_sandbox_premium_fixture_rejected'
      using errcode = 'P0001';
  end if;
end;
$$;
insert into public.cognitive_projects (
  id,repository_full_name,source_state,activation_state,
  scheduler_state,production_authority
) values (
  '50000000-0000-0000-0000-000000000001',
  'Chillywood2025/chillywood-mobile',
  'collective_governance_source_complete_not_deployed',
  'off','none',false
);
insert into public.intelligence_tasks (
  id,project_id,platform,environment,repository_full_name,branch_name,
  task_key,objective_hash,actor_identity,deadman_at
) values
(
  '30000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  'shared','production','Chillywood2025/chillywood-mobile',
  'codex/assurance-livekit-v3-trigger-contract',
  'assurance-livekit-v3-shared-fixture',repeat('1',64),
  'assurance-livekit-v3-trigger-contract',
  transaction_timestamp() + interval '1 day'
),
(
  '40000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  'android','production','Chillywood2025/chillywood-mobile',
  'codex/assurance-livekit-v3-trigger-contract',
  'assurance-livekit-v3-android-fixture',repeat('2',64),
  'assurance-livekit-v3-trigger-contract',
  transaction_timestamp() + interval '1 day'
);
insert into public.product_experience_baseline_versions (
  id,task_id,project_id,platform,environment,baseline_key,
  baseline_version,baseline_hash
) values (
  '70000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  'shared','production','livekit_experience_deadlines',1,repeat('3',64)
);
insert into public.cognitive_product_quality_service_capabilities (
  id,service_identity,operation,task_id,project_id,platform,environment,
  assertion_hash,allowed_sentinel_keys,registered_by,expires_at
) values
(
  '80000000-0000-0000-0000-000000000001',
  'cognitive_livekit_experience_collector','collect_livekit_sentinel_run',
  '40000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001','android','production',
  repeat('4',64),array['livekit_experience_sentinel'],
  '60000000-0000-0000-0000-000000000001',
  transaction_timestamp() + interval '1 hour'
),
(
  '80000000-0000-0000-0000-000000000002',
  'cognitive_livekit_experience_collector','issue_livekit_failure_fixture',
  '40000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001','android','production',
  repeat('5',64),array['livekit_experience_sentinel'],
  '60000000-0000-0000-0000-000000000001',
  transaction_timestamp() + interval '1 hour'
),
(
  '80000000-0000-0000-0000-000000000003',
  'cognitive_livekit_experience_collector','consume_livekit_failure_fixture',
  '40000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001','android','production',
  repeat('6',64),array['livekit_experience_sentinel'],
  '60000000-0000-0000-0000-000000000001',
  transaction_timestamp() + interval '1 hour'
),
(
  '80000000-0000-0000-0000-000000000004',
  'cognitive_product_quality_triage','triage_product_quality',
  '40000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001','android','production',
  repeat('7',64),'{}'::text[],
  '60000000-0000-0000-0000-000000000001',
  transaction_timestamp() + interval '1 hour'
);
insert into public.cognitive_livekit_platform_preflight_receipts (
  id,shared_task_id,target_task_id,project_id,target_platform,owner_user_id,
  baseline_version_id,collect_capability_id,issue_capability_id,
  consume_capability_id,triage_capability_id,
  collector_assertion_fingerprint,evaluator_assertion_fingerprint,
  application_identifier,distribution,app_version,build_number,
  runtime_version,channel,internal_update_id,installed_artifact_hash,
  sandbox_premium_proof_hash,premium_proof_kind,
  role_free_account_attested,manual_grant_absent,real_charge_absent,
  telemetry_contract_hash,source_commit,source_tree_hash,
  independent_review_hash,tests_hash,deployment_hash,rollback_hash,
  receipt_hash,created_at,expires_at
)
values (
  '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001','android',
  '60000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000002',
  '80000000-0000-0000-0000-000000000003',
  '80000000-0000-0000-0000-000000000004',
  repeat('1',64),repeat('2',64),
  'com.chillywood.mobile','google_play_internal_testing','1.0.0','86',
  '1.0.0-android-chat-call-action-v1','android-chat-livekit-qa',
  'e3379ac9-61f0-40db-a014-81975be123e5',
  'fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44',
  (select proof->>'proofHash' from b1_sandbox_premium_proof),
  'store_sandbox_revenuecat_backend_installed_v1',
  true,true,true,repeat('4',64),
  'fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
  '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
  repeat('5',64),repeat('6',64),
  '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
  '0fbe0c0d5bf2fe593b23f8970fe03e85c2e32e9195ec93ac9533d254b9014759',
  repeat('7',64),
  transaction_timestamp() - interval '2 minutes',
  transaction_timestamp() + interval '8 minutes'
);
create function pg_temp.insert_enabled_outcome(p_authorization_id uuid)
returns void
language sql
as $$
  insert into public.cognitive_livekit_platform_activation_outcomes(
    id,authorization_id,shared_task_id,target_task_id,project_id,
    target_platform,owner_user_id,enabled,sentinel_run_count,
    evaluator_proof_count,normal_triage_consumption_count,
    fixture_attestation_count,fixture_triage_consumption_count,
    open_finding_count,canary_receipt_hash,
    emergency_stop_receipt_hash,principal_rollback_receipt_hash,outcome_hash
  ) values (
    'a0000000-0000-0000-0000-000000000001',p_authorization_id,
    '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001','android',
    '60000000-0000-0000-0000-000000000001',
    true,9,0,0,0,0,0,
    repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64)
  );
$$;
create function pg_temp.livekit_v3_rejects_new_authorization(
  p_mutation text
)
returns boolean
language plpgsql
as $$
declare authorization_id_value uuid := case p_mutation
  when 'authorization_source_commit'
    then '21000000-0000-0000-0000-000000000001'::uuid
  else '21000000-0000-0000-0000-000000000002'::uuid
end;
begin
  begin
    insert into public.cognitive_livekit_platform_canary_authorizations(
      id,preflight_receipt_id,shared_task_id,target_task_id,project_id,
      target_platform,owner_user_id,baseline_version_id,source_commit,
      source_tree_hash,independent_review_hash,tests_hash,deployment_hash,
      rollback_hash,authorization_hash,opened_at,expires_at
    ) values (
      authorization_id_value,
      '10000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001','android',
      '60000000-0000-0000-0000-000000000001',
      '70000000-0000-0000-0000-000000000001',
      case when p_mutation = 'authorization_source_commit'
        then repeat('a',40)
        else 'fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6' end,
      '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
      repeat('5',64),
      case when p_mutation = 'authorization_tests_hash'
        then repeat('a',64) else repeat('6',64) end,
      '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
      '0fbe0c0d5bf2fe593b23f8970fe03e85c2e32e9195ec93ac9533d254b9014759',
      pg_temp.sha256('negative-authorization|' || p_mutation),
      transaction_timestamp() - interval '1 minute',
      transaction_timestamp() + interval '19 minutes'
    );
    perform pg_temp.insert_enabled_outcome(authorization_id_value);
    raise exception 'negative_control_was_not_rejected'
      using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'livekit_final_source_identity_cross_binding_rejected'
    then raise; end if;
  end;
  return true;
end;
$$;
create temporary table b1_negative_controls(
  mutation text primary key,
  rejected boolean not null
) on commit drop;
insert into b1_negative_controls values
  ('authorization_source_commit',
   pg_temp.livekit_v3_rejects_new_authorization(
     'authorization_source_commit')),
  ('authorization_tests_hash',
   pg_temp.livekit_v3_rejects_new_authorization(
     'authorization_tests_hash'));
insert into public.cognitive_livekit_platform_canary_authorizations (
  id,preflight_receipt_id,shared_task_id,target_task_id,project_id,
  target_platform,owner_user_id,baseline_version_id,source_commit,
  source_tree_hash,independent_review_hash,tests_hash,deployment_hash,
  rollback_hash,authorization_hash,opened_at,expires_at
)
values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001','android',
  '60000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  'fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
  '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
  repeat('5',64),repeat('6',64),
  '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
  '0fbe0c0d5bf2fe593b23f8970fe03e85c2e32e9195ec93ac9533d254b9014759',
  repeat('8',64),
  transaction_timestamp() - interval '1 minute',
  transaction_timestamp() + interval '19 minutes'
);
insert into public.cognitive_governance_switches (
  task_id,project_id,platform,environment,switch_key,enabled,
  policy_version,enabled_by,enabled_at,updated_at
) values (
  '40000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  'android','production','cognitive_livekit_experience_sentinel_enabled',
  true,'provider-independent-android-livekit-canary-v1',
  '60000000-0000-0000-0000-000000000001',
  transaction_timestamp(),transaction_timestamp()
);
create temporary table b1_livekit_fixture_state on commit drop as
with routes(route_or_surface,ordinal) as (
  values ('live-stage',2),('watch-party-live',5),('chat-call',8)
), fixture as (
  select route_or_surface,ordinal,
    pg_temp.sha256('fixture|' || route_or_surface) fixture_id,
    pg_temp.sha256('attestation|' || route_or_surface) attestation_hash,
    'cognitive-test-b1-' || replace(route_or_surface,'-','') room_name,
    pg_temp.sha256('correlation|' || route_or_surface) correlation_hash,
    pg_temp.sha256(
      'evidence|' || route_or_surface || '|bounded_failure_fixture'
    ) evidence_hash,
    pg_temp.sha256('idempotency|' || ordinal) idempotency_hash,
    date_trunc('milliseconds',
      transaction_timestamp() - interval '5 seconds'
    ) observation_started_at,
    date_trunc('milliseconds',
      transaction_timestamp() - interval '1 second'
    ) observation_finished_at,
    transaction_timestamp() - interval '20 seconds' issued_at,
    transaction_timestamp() + interval '100 seconds' expires_at,
    transaction_timestamp() claimed_at
  from routes
)
select fixture.*,
  public.product_experience_livekit_synthetic_room_hash(room_name) room_hash
from fixture;
insert into public.product_experience_livekit_failure_fixture_issuances(
  fixture_id,task_id,project_id,platform,environment,principal,
  source_commit,capability_id,fixture_type,condition,
  fixture_attestation_hash,synthetic_room_name,synthetic_room_name_hash,
  room_run_correlation_hash,issued_at,expires_at,issuance_hash
)
select fixture_id,
  '40000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001','android','production',
  'cognitive_livekit_experience_collector',
  'fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
  '80000000-0000-0000-0000-000000000002',
  'controlled_test_endpoint_timeout',
  public.product_experience_livekit_failure_fixture_condition(
    'controlled_test_endpoint_timeout'
  ),
  attestation_hash,room_name,room_hash,correlation_hash,issued_at,expires_at,
  public.product_experience_livekit_fixture_issuance_hash(
    fixture_id,'40000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001','android','production',
    'cognitive_livekit_experience_collector',
    'fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
    '80000000-0000-0000-0000-000000000002',
    'controlled_test_endpoint_timeout',
    public.product_experience_livekit_failure_fixture_condition(
      'controlled_test_endpoint_timeout'
    ),
    attestation_hash,room_name,room_hash,correlation_hash,issued_at,expires_at
  )
from b1_livekit_fixture_state;
insert into public.product_experience_livekit_failure_fixture_consumptions(
  fixture_id,task_id,project_id,platform,environment,principal,
  source_commit,fixture_attestation_hash,synthetic_room_name,
  synthetic_room_name_hash,room_run_correlation_hash,route_or_surface,
  runtime_identity_hash,source_build_hash,evidence_manifest_hash,
  collection_idempotency_hash,observation_started_at,
  observation_finished_at,claimed_at,consumption_hash
)
select fixture_id,
  '40000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001','android','production',
  'cognitive_livekit_experience_collector',
  'fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
  attestation_hash,room_name,room_hash,correlation_hash,route_or_surface,
  '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0',
  'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050',
  evidence_hash,idempotency_hash,observation_started_at,
  observation_finished_at,claimed_at,
  public.product_experience_livekit_fixture_consumption_hash(
    fixture_id,'40000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001','android','production',
    'cognitive_livekit_experience_collector',
    'fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
    attestation_hash,room_name,room_hash,correlation_hash,route_or_surface,
    '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0',
    'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050',
    evidence_hash,idempotency_hash,observation_started_at,
    observation_finished_at,claimed_at
  )
from b1_livekit_fixture_state;
create function pg_temp.livekit_metric(
  p_route text,
  p_scenario text
)
returns jsonb
language plpgsql
stable
as $$
declare
  fixture b1_livekit_fixture_state%rowtype;
  healthy boolean := p_scenario <> 'bounded_failure_fixture';
  recovering boolean := p_scenario = 'background_foreground_recovery';
  evidence_hash_value text :=
    pg_temp.sha256('evidence|' || p_route || '|' || p_scenario);
  metrics jsonb;
begin
  metrics := jsonb_build_object(
    'scenarioType',p_scenario,'tokenRequestStarted',true,
    'tokenRequested',true,'tokenReturned',true,
    'tokenResultStatus','success','websocketConnected',healthy,
    'iceGatheringObserved',healthy,'iceCheckingObserved',healthy,
    'iceState',case when healthy then 'connected' else 'new' end,
    'peerConnectionEstablished',healthy,'roomConnected',healthy,
    'localTrackPublished',healthy,'remoteParticipantJoined',healthy,
    'remoteTrackSubscribed',healthy,'firstAudioVideoObserved',healthy,
    'connectingResolved',healthy,'backgrounded',recovering,
    'foregrounded',recovering,'backgroundForegroundRecovery',recovering,
    'cleanupDisconnected',true,'buildRuntimeMatched',true,
    'installedUiObserved',p_scenario = 'bounded_failure_fixture',
    'installedUiEvidenceHash',case
      when p_scenario = 'bounded_failure_fixture'
        then to_jsonb(pg_temp.sha256('installed-ui|' || p_route))
      else 'null'::jsonb end,
    'localMediaSource',case when healthy then 'test_tone' else 'none' end,
    'networkState','ready','permissionState','granted',
    'providerState',case when healthy then 'healthy' else 'degraded' end,
    'remoteMediaKind',case when healthy then 'audio' else 'none' end,
    'stageFailureCategory',case
      when healthy then 'none' else 'websocket_failure' end,
    'headlessParticipantUsed',true,'tokenIssuedElapsedMs',500,
    'roomConnectElapsedMs',case when healthy then 1000 else 0 end,
    'uiStateResolutionElapsedMs',1000,
    'firstRemoteMediaElapsedMs',case when healthy then 1000 else 0 end
  );
  if p_scenario <> 'bounded_failure_fixture' then
    return jsonb_build_object(
      'schemaVersion','product-sentinel-v1',
      'sanitizationVersion','bounded-nonpersonal-v1',
      'observationKind','livekit_experience',
      'evidenceHashes',jsonb_build_array(evidence_hash_value),
      'metrics',metrics
    );
  end if;
  select * into fixture from b1_livekit_fixture_state
  where route_or_surface = p_route;
  metrics := metrics || jsonb_build_object(
    'headlessObservationStartedAt',to_char(
      fixture.observation_started_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'headlessObservationFinishedAt',to_char(
      (fixture.observation_started_at + interval '1 second') at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'headlessParticipantIdentityHash',
      pg_temp.sha256('headless|' || p_route),
    'installedObservationStartedAt',to_char(
      (fixture.observation_started_at + interval '2 seconds') at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'installedObservationFinishedAt',to_char(
      fixture.observation_finished_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'installedParticipantIdentityHash',
      pg_temp.sha256('installed|' || p_route),
    'installedRoomRunCorrelationHash',fixture.correlation_hash,
    'installedRuntimeIdentityHash',
      '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0',
    'installedSourceBuildHash',
      'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050',
    'participantIdentityDistinct',true,
    'roomRunCorrelationHash',fixture.correlation_hash,
    'tokenClaimsValidated',true
  );
  return jsonb_build_object(
    'schemaVersion','product-sentinel-v1',
    'sanitizationVersion','bounded-nonpersonal-v1',
    'observationKind','livekit_experience',
    'evidenceHashes',
      jsonb_build_array(fixture.attestation_hash,fixture.evidence_hash),
    'failureFixtureBinding',jsonb_build_object(
      'condition',
        public.product_experience_livekit_failure_fixture_condition(
          'controlled_test_endpoint_timeout'
        ),
      'fixtureAttestationHash',fixture.attestation_hash,
      'fixtureId',fixture.fixture_id,
      'fixtureType','controlled_test_endpoint_timeout',
      'principal','cognitive_livekit_experience_collector',
      'roomRunCorrelationHash',fixture.correlation_hash,
      'sourceCommit','fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
      'syntheticRoomNameHash',fixture.room_hash
    ),
    'metrics',metrics
  );
end;
$$;
with combinations(route_or_surface,scenario_type,ordinal) as (
  values
    ('live-stage','success_baseline',1),
    ('live-stage','bounded_failure_fixture',2),
    ('live-stage','background_foreground_recovery',3),
    ('watch-party-live','success_baseline',4),
    ('watch-party-live','bounded_failure_fixture',5),
    ('watch-party-live','background_foreground_recovery',6),
    ('chat-call','success_baseline',7),
    ('chat-call','bounded_failure_fixture',8),
    ('chat-call','background_foreground_recovery',9)
)
insert into public.product_experience_sentinel_runs(
  id,task_id,project_id,platform,environment,sentinel_key,
  route_or_surface,runtime_identity_hash,evidence_manifest_hash,
  metric_manifest,result_status,physical_proof_status,
  collector_capability_id,collection_idempotency_hash,
  source_build_hash,observation_started_at,observation_finished_at,
  evaluation_expires_at
)
select (
    '90000000-0000-0000-0000-' || lpad(ordinal::text,12,'0')
  )::uuid,
  '40000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001','android','production',
  'livekit_experience_sentinel',route_or_surface,
  '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0',
  pg_temp.sha256('evidence|' || route_or_surface || '|' || scenario_type),
  pg_temp.livekit_metric(route_or_surface,scenario_type),
  case when scenario_type = 'bounded_failure_fixture'
    then 'failed' else 'blocked' end,
  case when scenario_type = 'bounded_failure_fixture'
    then 'installed_ui_observed' else 'source_only' end,
  '80000000-0000-0000-0000-000000000001',
  pg_temp.sha256('idempotency|' || ordinal),
  'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050',
  coalesce(
    (select observation_started_at from b1_livekit_fixture_state
     where b1_livekit_fixture_state.route_or_surface =
       combinations.route_or_surface
       and scenario_type = 'bounded_failure_fixture'),
    transaction_timestamp() - interval '30 seconds'
  ),
  coalesce(
    (select observation_finished_at from b1_livekit_fixture_state
     where b1_livekit_fixture_state.route_or_surface =
       combinations.route_or_surface
       and scenario_type = 'bounded_failure_fixture'),
    transaction_timestamp()
  ),
  transaction_timestamp() + interval '1 hour'
from combinations;
create function pg_temp.livekit_v3_rejects_new_run(p_mutation text)
returns boolean
language plpgsql
as $$
declare
  run_id_value uuid := case p_mutation
    when 'run_source_build_hash'
      then '91000000-0000-0000-0000-000000000001'::uuid
    else '91000000-0000-0000-0000-000000000002'::uuid
  end;
begin
  begin
    insert into public.product_experience_sentinel_runs(
      id,task_id,project_id,platform,environment,sentinel_key,
      route_or_surface,runtime_identity_hash,evidence_manifest_hash,
      metric_manifest,result_status,physical_proof_status,
      collector_capability_id,collection_idempotency_hash,
      source_build_hash,observation_started_at,observation_finished_at,
      evaluation_expires_at
    ) values (
      run_id_value,'40000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001','android','production',
      'livekit_experience_sentinel','live-stage',
      case when p_mutation = 'run_runtime_identity_hash'
        then repeat('a',64)
        else '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0'
      end,
      pg_temp.sha256('negative-evidence|' || p_mutation),
      jsonb_set(
        pg_temp.livekit_metric('live-stage','success_baseline'),
        '{evidenceHashes}',
        jsonb_build_array(pg_temp.sha256('negative-evidence|' || p_mutation))
      ),
      'blocked','source_only',
      '80000000-0000-0000-0000-000000000001',
      pg_temp.sha256('negative-idempotency|' || p_mutation),
      case when p_mutation = 'run_source_build_hash'
        then repeat('a',64)
        else 'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050'
      end,
      transaction_timestamp() - interval '10 seconds',
      transaction_timestamp(),transaction_timestamp() + interval '1 hour'
    );
    perform pg_temp.insert_enabled_outcome(
      '20000000-0000-0000-0000-000000000001'
    );
    raise exception 'negative_control_was_not_rejected'
      using errcode = 'ZX001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'livekit_final_source_identity_cross_binding_rejected'
    then raise; end if;
  end;
  return true;
end;
$$;
insert into b1_negative_controls values
  (
    'run_source_build_hash',
    pg_temp.livekit_v3_rejects_new_run('run_source_build_hash')
  ),
  (
    'run_runtime_identity_hash',
    pg_temp.livekit_v3_rejects_new_run('run_runtime_identity_hash')
  );
select is(
  (select rejected from b1_negative_controls
   where mutation = 'authorization_source_commit'),
  true,
  'enabled finalization rejects one changed authorization source commit'
);
select is(
  (select rejected from b1_negative_controls
   where mutation = 'authorization_tests_hash'),
  true,
  'enabled finalization rejects one changed authorization tests hash'
);
select is(
  (select rejected from b1_negative_controls
   where mutation = 'run_source_build_hash'),
  true,
  'enabled finalization rejects one changed run source hash'
);
select is(
  (select rejected from b1_negative_controls
   where mutation = 'run_runtime_identity_hash'),
  true,
  'enabled finalization rejects one changed run runtime hash'
);
select lives_ok(
  $$select pg_temp.insert_enabled_outcome(
    '20000000-0000-0000-0000-000000000001'
  )$$,
  'the actual enabled v3 finalization trigger accepts one exact tuple'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_livekit_platform_activation_outcomes
    where id = 'a0000000-0000-0000-0000-000000000001'
      and enabled
  ),
  1,
  'the positive enabled outcome is inserted exactly once in the transaction'
);
select * from finish();
rollback;
