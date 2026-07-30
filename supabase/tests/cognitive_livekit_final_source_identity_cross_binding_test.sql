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

with negative_cases(label,matched) as (
  values
  (
    'target platform',
    public.cognitive_livekit_final_source_identity_matches_v3(
      'ios','fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
      '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
      '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
      'com.chillywood.mobile',
      'google_play_internal_testing','86',
      '1.0.0-android-chat-call-action-v1','android-chat-livekit-qa',
      'e3379ac9-61f0-40db-a014-81975be123e5',
      'fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44',
      'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050',
      '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0'
    )
  ),
  (
    'final source commit',
    public.cognitive_livekit_final_source_identity_matches_v3(
      'android',repeat('a',40),
      '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
      '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
      'com.chillywood.mobile','google_play_internal_testing','86',
      '1.0.0-android-chat-call-action-v1','android-chat-livekit-qa',
      'e3379ac9-61f0-40db-a014-81975be123e5',
      'fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44',
      'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050',
      '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0'
    )
  ),
  (
    'final source tree',
    public.cognitive_livekit_final_source_identity_matches_v3(
      'android','fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
      repeat('b',40),
      '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
      'com.chillywood.mobile','google_play_internal_testing','86',
      '1.0.0-android-chat-call-action-v1','android-chat-livekit-qa',
      'e3379ac9-61f0-40db-a014-81975be123e5',
      'fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44',
      'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050',
      '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0'
    )
  ),
  (
    'final deployment',
    public.cognitive_livekit_final_source_identity_matches_v3(
      'android','fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
      '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
      repeat('0',64),
      'com.chillywood.mobile','google_play_internal_testing','86',
      '1.0.0-android-chat-call-action-v1','android-chat-livekit-qa',
      'e3379ac9-61f0-40db-a014-81975be123e5',
      'fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44',
      'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050',
      '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0'
    )
  ),
  (
    'application identifier',
    public.cognitive_livekit_final_source_identity_matches_v3(
      'android','fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
      '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
      '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
      'com.example.invalid','google_play_internal_testing','86',
      '1.0.0-android-chat-call-action-v1','android-chat-livekit-qa',
      'e3379ac9-61f0-40db-a014-81975be123e5',
      'fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44',
      'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050',
      '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0'
    )
  ),
  (
    'distribution',
    public.cognitive_livekit_final_source_identity_matches_v3(
      'android','fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
      '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
      '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
      'com.chillywood.mobile','internal_testflight','86',
      '1.0.0-android-chat-call-action-v1','android-chat-livekit-qa',
      'e3379ac9-61f0-40db-a014-81975be123e5',
      'fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44',
      'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050',
      '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0'
    )
  ),
  (
    'build number',
    public.cognitive_livekit_final_source_identity_matches_v3(
      'android','fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
      '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
      '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
      'com.chillywood.mobile','google_play_internal_testing','87',
      '1.0.0-android-chat-call-action-v1','android-chat-livekit-qa',
      'e3379ac9-61f0-40db-a014-81975be123e5',
      'fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44',
      'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050',
      '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0'
    )
  ),
  (
    'runtime version',
    public.cognitive_livekit_final_source_identity_matches_v3(
      'android','fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
      '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
      '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
      'com.chillywood.mobile','google_play_internal_testing','86',
      'wrong-runtime','android-chat-livekit-qa',
      'e3379ac9-61f0-40db-a014-81975be123e5',
      'fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44',
      'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050',
      '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0'
    )
  ),
  (
    'channel',
    public.cognitive_livekit_final_source_identity_matches_v3(
      'android','fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
      '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
      '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
      'com.chillywood.mobile','google_play_internal_testing','86',
      '1.0.0-android-chat-call-action-v1','wrong-channel',
      'e3379ac9-61f0-40db-a014-81975be123e5',
      'fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44',
      'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050',
      '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0'
    )
  ),
  (
    'update id',
    public.cognitive_livekit_final_source_identity_matches_v3(
      'android','fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
      '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
      '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
      'com.chillywood.mobile','google_play_internal_testing','86',
      '1.0.0-android-chat-call-action-v1','android-chat-livekit-qa',
      '00000000-0000-0000-0000-000000000000',
      'fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44',
      'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050',
      '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0'
    )
  ),
  (
    'artifact hash',
    public.cognitive_livekit_final_source_identity_matches_v3(
      'android','fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
      '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
      '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
      'com.chillywood.mobile','google_play_internal_testing','86',
      '1.0.0-android-chat-call-action-v1','android-chat-livekit-qa',
      'e3379ac9-61f0-40db-a014-81975be123e5',
      repeat('0',64),
      'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050',
      '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0'
    )
  ),
  (
    'source build hash',
    public.cognitive_livekit_final_source_identity_matches_v3(
      'android','fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
      '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
      '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
      'com.chillywood.mobile','google_play_internal_testing','86',
      '1.0.0-android-chat-call-action-v1','android-chat-livekit-qa',
      'e3379ac9-61f0-40db-a014-81975be123e5',
      'fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44',
      repeat('0',64),
      '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0'
    )
  ),
  (
    'runtime identity hash',
    public.cognitive_livekit_final_source_identity_matches_v3(
      'android','fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
      '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
      '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
      'com.chillywood.mobile','google_play_internal_testing','86',
      '1.0.0-android-chat-call-action-v1','android-chat-livekit-qa',
      'e3379ac9-61f0-40db-a014-81975be123e5',
      'fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44',
      'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050',
      repeat('0',64)
    )
  )
)
select is(
  (select count(*)::integer from negative_cases where not matched),
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
  '50000000-0000-0000-0000-000000000001',
  'android',
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
  repeat('3',64),'store_sandbox_revenuecat_backend_installed_v1',
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
  '50000000-0000-0000-0000-000000000001',
  'android',
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

alter table public.product_experience_sentinel_runs disable trigger
  product_experience_sentinel_runs_collector_capability_required;

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
insert into public.product_experience_sentinel_runs (
  id,task_id,project_id,platform,environment,sentinel_key,
  route_or_surface,runtime_identity_hash,evidence_manifest_hash,
  metric_manifest,result_status,physical_proof_status,
  collector_capability_id,collection_idempotency_hash,
  source_build_hash,observation_started_at,observation_finished_at,
  evaluation_expires_at
)
select
  (
    '90000000-0000-0000-0000-' ||
    lpad(combinations.ordinal::text,12,'0')
  )::uuid,
  '40000000-0000-0000-0000-000000000001'::uuid,
  '50000000-0000-0000-0000-000000000001'::uuid,
  'android'::public.cognitive_platform,
  'production'::public.cognitive_environment,
  'livekit_experience_sentinel',
  combinations.route_or_surface,
  '5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0',
  encode(extensions.digest(
    convert_to(
      combinations.route_or_surface || '|' || combinations.scenario_type,
      'UTF8'
    ),
    'sha256'
  ),'hex'),
  jsonb_build_object(
    'schemaVersion',1,
    'metrics',jsonb_build_object(
      'scenarioType',combinations.scenario_type,
      'fixtureKind','synthetic_trigger_contract'
    )
  ),
  'blocked','source_only',
  '80000000-0000-0000-0000-000000000001'::uuid,
  encode(extensions.digest(
    convert_to(
      'idempotency|' || combinations.ordinal::text,
      'UTF8'
    ),
    'sha256'
  ),'hex'),
  'd890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050',
  transaction_timestamp() - interval '30 seconds',
  transaction_timestamp(),
  transaction_timestamp() + interval '1 hour'
from combinations;

alter table public.product_experience_sentinel_runs enable trigger
  product_experience_sentinel_runs_collector_capability_required;

create function pg_temp.livekit_v3_rejects_one_field(
  p_mutation text
)
returns boolean
language plpgsql
as $$
begin
  begin
    if p_mutation like 'authorization_%' then
      execute 'alter table public.cognitive_livekit_platform_canary_authorizations disable trigger cognitive_livekit_platform_canary_authorizations_immutable';
    else
      execute 'alter table public.product_experience_sentinel_runs disable trigger product_experience_sentinel_runs_retention_tombstone_only';
    end if;

    case p_mutation
      when 'authorization_source_commit' then
        update public.cognitive_livekit_platform_canary_authorizations
        set source_commit = repeat('a',40)
        where id = '20000000-0000-0000-0000-000000000001';
      when 'authorization_tests_hash' then
        update public.cognitive_livekit_platform_canary_authorizations
        set tests_hash = repeat('a',64)
        where id = '20000000-0000-0000-0000-000000000001';
      when 'run_source_build_hash' then
        update public.product_experience_sentinel_runs
        set source_build_hash = repeat('a',64)
        where id = '90000000-0000-0000-0000-000000000001';
      when 'run_runtime_identity_hash' then
        update public.product_experience_sentinel_runs
        set runtime_identity_hash = repeat('a',64)
        where id = '90000000-0000-0000-0000-000000000001';
      else
        raise exception 'unknown_negative_control'
          using errcode = '22023';
    end case;

    if p_mutation like 'authorization_%' then
      execute 'alter table public.cognitive_livekit_platform_canary_authorizations enable trigger cognitive_livekit_platform_canary_authorizations_immutable';
    else
      execute 'alter table public.product_experience_sentinel_runs enable trigger product_experience_sentinel_runs_retention_tombstone_only';
    end if;

    insert into public.cognitive_livekit_platform_activation_outcomes (
      id,authorization_id,shared_task_id,target_task_id,project_id,
      target_platform,owner_user_id,enabled,sentinel_run_count,
      evaluator_proof_count,normal_triage_consumption_count,
      fixture_attestation_count,fixture_triage_consumption_count,
      open_finding_count,canary_receipt_hash,
      emergency_stop_receipt_hash,principal_rollback_receipt_hash,
      outcome_hash
    )
    values (
      'a0000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001',
      'android',
      '60000000-0000-0000-0000-000000000001',
      true,9,0,0,0,0,0,
      repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64)
    );

    raise exception 'negative_control_was_not_rejected'
      using errcode = 'ZX001';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'livekit_final_source_identity_cross_binding_rejected'
      then
        raise;
      end if;
  end;

  return true;
end;
$$;

select is(
  pg_temp.livekit_v3_rejects_one_field('authorization_source_commit'),
  true,
  'enabled finalization rejects one changed authorization source commit'
);

select is(
  pg_temp.livekit_v3_rejects_one_field('authorization_tests_hash'),
  true,
  'enabled finalization rejects one changed authorization tests hash'
);

select is(
  pg_temp.livekit_v3_rejects_one_field('run_source_build_hash'),
  true,
  'enabled finalization rejects one changed run source hash'
);

select is(
  pg_temp.livekit_v3_rejects_one_field('run_runtime_identity_hash'),
  true,
  'enabled finalization rejects one changed run runtime hash'
);

select lives_ok(
  $$insert into public.cognitive_livekit_platform_activation_outcomes (
      id,authorization_id,shared_task_id,target_task_id,project_id,
      target_platform,owner_user_id,enabled,sentinel_run_count,
      evaluator_proof_count,normal_triage_consumption_count,
      fixture_attestation_count,fixture_triage_consumption_count,
      open_finding_count,canary_receipt_hash,
      emergency_stop_receipt_hash,principal_rollback_receipt_hash,
      outcome_hash
    )
    values (
      'a0000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001',
      'android',
      '60000000-0000-0000-0000-000000000001',
      true,9,0,0,0,0,0,
      repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64)
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
