begin;
select plan(23);

select has_function(
  'public',
  'cognitive_livekit_sandbox_premium_proof_v1',
  array[]::text[],
  'the non-identifying sandbox Premium proof helper exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.cognitive_livekit_sandbox_premium_proof_v1()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cognitive_livekit_sandbox_premium_proof_v1()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.cognitive_livekit_sandbox_premium_proof_v1()',
    'EXECUTE'
  ),
  'the internal Premium proof helper is not directly executable'
);

select has_function(
  'public',
  'governance_read_livekit_sandbox_premium_proof',
  array[]::text[],
  'the exact-Owner sandbox Premium proof readback exists'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.governance_read_livekit_sandbox_premium_proof()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.governance_read_livekit_sandbox_premium_proof()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.governance_read_livekit_sandbox_premium_proof()',
    'EXECUTE'
  ),
  'only authenticated exact Owner may read the Premium proof hash'
);

select ok(
  pg_get_functiondef(
    'public.cognitive_livekit_sandbox_premium_proof_v1()'::regprocedure
  ) like '%entitlement.source = ''revenuecat''%'
  and pg_get_functiondef(
    'public.cognitive_livekit_sandbox_premium_proof_v1()'::regprocedure
  ) like '%provider_event.environment = ''sandbox''%'
  and pg_get_functiondef(
    'public.cognitive_livekit_sandbox_premium_proof_v1()'::regprocedure
  ) like '%access_grant.status = ''sandbox_only''%'
  and pg_get_functiondef(
    'public.cognitive_livekit_sandbox_premium_proof_v1()'::regprocedure
  ) like '%active_manual_grant_count_value = 0%',
  'Premium proof requires provider-backed sandbox access and no active manual grant'
);

select has_function(
  'public',
  'cognitive_bind_livekit_platform_identity_v2',
  array[]::text[],
  'the forward-only platform identity binding trigger exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.cognitive_bind_livekit_platform_identity_v2()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cognitive_bind_livekit_platform_identity_v2()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.cognitive_bind_livekit_platform_identity_v2()',
    'EXECUTE'
  ),
  'the trigger helper is not directly executable by application roles'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid =
      'public.cognitive_livekit_platform_preflight_receipts'::regclass
      and tgname = 'cognitive_livekit_platform_identity_v2'
      and not tgisinternal
      and tgenabled = 'O'
  ),
  'the exact identity trigger is enabled'
);

select has_function(
  'public',
  'cognitive_require_livekit_platform_run_identity_v2',
  array[]::text[],
  'the final platform run-identity guard exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.cognitive_require_livekit_platform_run_identity_v2()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cognitive_require_livekit_platform_run_identity_v2()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.cognitive_require_livekit_platform_run_identity_v2()',
    'EXECUTE'
  ),
  'the final run-identity guard is not directly executable'
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
  'the v3 final run-identity trigger is enabled and v2 is retired'
);

select ok(
  pg_get_functiondef(
    'public.cognitive_require_livekit_platform_run_identity_v2()'::regprocedure
  ) like '%d890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050%'
  and pg_get_functiondef(
    'public.cognitive_require_livekit_platform_run_identity_v2()'::regprocedure
  ) like '%5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0%'
  and pg_get_functiondef(
    'public.cognitive_require_livekit_platform_run_identity_v2()'::regprocedure
  ) like '%73792a29b2de5445bc7fc718abd6463d812ffec6b566b00ab930045a32d266cb%'
  and pg_get_functiondef(
    'public.cognitive_require_livekit_platform_run_identity_v2()'::regprocedure
  ) like '%17d0bf8d12eed354ab5784cc94a3373620c4a9dc09b9aeda81bdb13103351bcf%',
  'successful finalization binds runs to both exact installed identities'
);

select ok(
  pg_get_functiondef(
    'public.cognitive_bind_livekit_platform_identity_v2()'::regprocedure
  ) like '%build_number := ''86''%'
  and pg_get_functiondef(
    'public.cognitive_bind_livekit_platform_identity_v2()'::regprocedure
  ) like '%1.0.0-android-chat-call-action-v1%'
  and pg_get_functiondef(
    'public.cognitive_bind_livekit_platform_identity_v2()'::regprocedure
  ) like '%android-chat-livekit-qa%',
  'Android is rebound to build 86 and its isolated native runtime/channel'
);

select ok(
  pg_get_functiondef(
    'public.cognitive_bind_livekit_platform_identity_v2()'::regprocedure
  ) like '%e3379ac9-61f0-40db-a014-81975be123e5%',
  'Android is rebound to the embedded reviewed update'
);

select ok(
  pg_get_functiondef(
    'public.cognitive_bind_livekit_platform_identity_v2()'::regprocedure
  ) like '%build_number := ''8''%'
  and pg_get_functiondef(
    'public.cognitive_bind_livekit_platform_identity_v2()'::regprocedure
  ) like '%1.0.0-iosqa1%'
  and pg_get_functiondef(
    'public.cognitive_bind_livekit_platform_identity_v2()'::regprocedure
  ) like '%ios-qa%',
  'iOS remains on internal TestFlight build 8 and its isolated runtime/channel'
);

select ok(
  pg_get_functiondef(
    'public.cognitive_bind_livekit_platform_identity_v2()'::regprocedure
  ) like '%019fb099-f7c3-7130-97aa-a4bb1c49792f%',
  'iOS is rebound to the last successfully launched internal update'
);

select ok(
  (
    select pg_get_constraintdef(oid) like
      '%fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6%'
      and pg_get_constraintdef(oid) like
        '%1abcd5e765a0dcac4ef0b40a2a90efb06f508fec%'
      and pg_get_constraintdef(oid) like
        '%7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0%'
    from pg_constraint
    where conrelid =
      'public.cognitive_livekit_platform_preflight_receipts'::regclass
      and conname =
        'cognitive_livekit_platform_preflight_chat_source_v2_check'
  ),
  'preflight receipts bind the merged Part A source tree and manifest hash'
);

select ok(
  (
    select pg_get_constraintdef(oid) like
      '%fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44%'
      and pg_get_constraintdef(oid) like
        '%24a951d58302dd73e13e4adc899fc28680472eb78f37cac04639ee95896e36d8%'
    from pg_constraint
    where conrelid =
      'public.cognitive_livekit_platform_preflight_receipts'::regclass
      and conname =
        'cognitive_livekit_platform_preflight_identity_v2_check'
  ),
  'preflight receipts bind each exact reviewed internal artifact hash'
);

select ok(
  (
    select pg_get_constraintdef(oid) like
      '%0fbe0c0d5bf2fe593b23f8970fe03e85c2e32e9195ec93ac9533d254b9014759%'
      and pg_get_constraintdef(oid) like
        '%37d14e930e6787973866b0a5f38c28e1484dac0cb187f4ecb5de363147528e48%'
    from pg_constraint
    where conrelid =
      'public.cognitive_livekit_platform_preflight_receipts'::regclass
      and conname =
        'cognitive_livekit_platform_preflight_identity_v2_check'
  ),
  'preflight receipts bind independent platform rollback contracts'
);

select ok(
  (
    select pg_get_constraintdef(oid) not like '%build_number = ''84''%'
      and pg_get_constraintdef(oid) not like
        '%1.0.0-android-imagemanipulator-v1%'
      and pg_get_constraintdef(oid) not like
        '%019f9c11-33c1-7d23-a0c0-8029c62e0ea4%'
    from pg_constraint
    where conrelid =
      'public.cognitive_livekit_platform_preflight_receipts'::regclass
      and conname =
        'cognitive_livekit_platform_preflight_identity_v2_check'
  ),
  'the obsolete Android build 84 activation identity is no longer admitted'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_livekit_platform_preflight_receipts
  ),
  0,
  'the binding migration creates no preflight receipt'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_livekit_platform_canary_authorizations
  ),
  0,
  'the binding migration enables no platform canary'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_level01_schedule_definitions
    where enabled
  ),
  0,
  'the binding migration enables no recurring schedule'
);

select * from finish();
rollback;
