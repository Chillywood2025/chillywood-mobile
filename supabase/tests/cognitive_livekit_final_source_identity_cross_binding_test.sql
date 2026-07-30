begin;
select plan(14);

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

select ok(
  to_regprocedure(
    'public.cognitive_livekit_final_source_identity_matches_v3(public.cognitive_platform,text,text,text,text,text,text,text,text,uuid,text,text,text)'
  ) is not null,
  'the exact cross-binding predicate exists'
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

with negative_cases(label,matched) as (
  values
  (
    'stale android source',
    public.cognitive_livekit_final_source_identity_matches_v3(
      'android','fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
      '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
      repeat('7',64),'com.chillywood.mobile',
      'google_play_internal_testing','86',
      '1.0.0-android-chat-call-action-v1','android-chat-livekit-qa',
      'e3379ac9-61f0-40db-a014-81975be123e5',
      repeat('f',64),repeat('a',64),repeat('5',64)
    )
  ),
  (
    'stale ios source',
    public.cognitive_livekit_final_source_identity_matches_v3(
      'ios','fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
      '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
      repeat('7',64),'com.chillywood.mobile','internal_testflight','8',
      '1.0.0-iosqa1','ios-qa',
      '019fb099-f7c3-7130-97aa-a4bb1c49792f',
      repeat('2',64),repeat('a',64),repeat('1',64)
    )
  ),
  (
    'wrong final source',
    public.cognitive_livekit_final_source_identity_matches_v3(
      'android',repeat('a',40),repeat('1',40),repeat('7',64),
      'com.chillywood.mobile','google_play_internal_testing','86',
      '1.0.0-android-chat-call-action-v1','android-chat-livekit-qa',
      'e3379ac9-61f0-40db-a014-81975be123e5',
      repeat('f',64),repeat('d',64),repeat('5',64)
    )
  ),
  (
    'wrong update',
    public.cognitive_livekit_final_source_identity_matches_v3(
      'android','fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
      '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
      '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
      'com.chillywood.mobile','google_play_internal_testing','86',
      '1.0.0-android-chat-call-action-v1','android-chat-livekit-qa',
      '00000000-0000-0000-0000-000000000000',
      repeat('f',64),repeat('d',64),repeat('5',64)
    )
  ),
  (
    'wrong runtime',
    public.cognitive_livekit_final_source_identity_matches_v3(
      'android','fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
      '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
      '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
      'com.chillywood.mobile','google_play_internal_testing','86',
      'wrong-runtime','android-chat-livekit-qa',
      'e3379ac9-61f0-40db-a014-81975be123e5',
      repeat('f',64),repeat('d',64),repeat('5',64)
    )
  ),
  (
    'wrong artifact',
    public.cognitive_livekit_final_source_identity_matches_v3(
      'android','fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6',
      '1abcd5e765a0dcac4ef0b40a2a90efb06f508fec',
      '7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0',
      'com.chillywood.mobile','google_play_internal_testing','86',
      '1.0.0-android-chat-call-action-v1','android-chat-livekit-qa',
      'e3379ac9-61f0-40db-a014-81975be123e5',
      repeat('0',64),repeat('d',64),repeat('5',64)
    )
  )
)
select is(
  (select count(*)::integer from negative_cases where not matched),
  6,
  'stale or mismatched source, receipt, update, runtime, and artifact cases fail'
);

select ok(
  pg_get_functiondef(
    'public.cognitive_require_livekit_platform_run_identity_v3()'::regprocedure
  ) like '%authorization_value.source_commit <> receipt_value.source_commit%'
  and pg_get_functiondef(
    'public.cognitive_require_livekit_platform_run_identity_v3()'::regprocedure
  ) like
    '%authorization_value.deployment_hash <> receipt_value.deployment_hash%',
  'finalization independently binds authorization lineage to its receipt'
);

select ok(
  pg_get_functiondef(
    'public.cognitive_require_livekit_platform_run_identity_v3()'::regprocedure
  ) like '%run.source_build_hash%'
  and pg_get_functiondef(
    'public.cognitive_require_livekit_platform_run_identity_v3()'::regprocedure
  ) like '%run.runtime_identity_hash%'
  and pg_get_functiondef(
    'public.cognitive_require_livekit_platform_run_identity_v3()'::regprocedure
  ) like '%receipt_value.internal_update_id%'
  and pg_get_functiondef(
    'public.cognitive_require_livekit_platform_run_identity_v3()'::regprocedure
  ) like '%receipt_value.installed_artifact_hash%',
  'enabled runs are checked against the receipt update, artifact, source, and runtime'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_livekit_platform_activation_outcomes
  ),
  0,
  'the correction creates no activation outcome'
);

select * from finish();
rollback;
