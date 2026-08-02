begin;
select plan(36);

select ok(
  to_regclass('public.cognitive_livekit_platform_preflight_receipts')
    is not null,
  'LiveKit platform preflight receipts exist'
);
select ok(
  to_regclass('public.cognitive_livekit_platform_canary_authorizations')
    is not null,
  'LiveKit platform canary authorizations exist'
);
select ok(
  to_regclass('public.cognitive_livekit_platform_activation_outcomes')
    is not null,
  'LiveKit platform activation outcomes exist'
);
select ok(
  to_regclass(
    'public.product_experience_livekit_no_finding_attestation_consumptions'
  ) is not null,
  'bounded-failure no-finding triage consumptions exist'
);

select ok(
  (
    select bool_and(relrowsecurity and relforcerowsecurity)
    from pg_class
    where oid in (
      'public.cognitive_livekit_platform_preflight_receipts'::regclass,
      'public.cognitive_livekit_platform_canary_authorizations'::regclass,
      'public.cognitive_livekit_platform_activation_outcomes'::regclass,
      'public.product_experience_livekit_no_finding_attestation_consumptions'::regclass
    )
  ),
  'all new evidence relations force row-level security'
);
select ok(
  (
    select count(*) = 4
    from pg_trigger
    where tgrelid in (
      'public.cognitive_livekit_platform_preflight_receipts'::regclass,
      'public.cognitive_livekit_platform_canary_authorizations'::regclass,
      'public.cognitive_livekit_platform_activation_outcomes'::regclass,
      'public.product_experience_livekit_no_finding_attestation_consumptions'::regclass
    )
      and tgname like '%immutable'
      and not tgisinternal
  ),
  'all new evidence relations are immutable'
);
select ok(
  not has_table_privilege(
    'anon',
    'public.cognitive_livekit_platform_preflight_receipts',
    'SELECT'
  )
  and not has_table_privilege(
    'service_role',
    'public.cognitive_livekit_platform_preflight_receipts',
    'SELECT'
  )
  and has_table_privilege(
    'authenticated',
    'public.cognitive_livekit_platform_preflight_receipts',
    'SELECT'
  ),
  'preflight readback is exposed only through authenticated Owner RLS'
);

select ok(
  (
    select pg_get_constraintdef(oid) like
      '%UNIQUE (assertion_hash, task_id, project_id, platform, environment, operation)%'
    from pg_constraint
    where conrelid =
      'public.cognitive_product_quality_service_capabilities'::regclass
      and conname =
        'cognitive_quality_capability_assertion_operation_scope_key'
  ),
  'one assertion fingerprint is unique per exact platform operation'
);
select ok(
  (
    select pg_get_constraintdef(oid) like
      '%cognitive_livekit_experience_collector%'
    from pg_constraint
    where conrelid =
      'public.cognitive_product_quality_service_capabilities'::regclass
      and conname =
        'cognitive_product_quality_service_capabi_service_identity_check'
  ),
  'the exact LiveKit principal is a capability identity'
);
select ok(
  (
    select pg_get_constraintdef(oid) like
      '%collect_livekit_sentinel_run%'
      and pg_get_constraintdef(oid) like
        '%issue_livekit_failure_fixture%'
      and pg_get_constraintdef(oid) like
        '%consume_livekit_failure_fixture%'
    from pg_constraint
    where conrelid =
      'public.cognitive_product_quality_service_capabilities'::regclass
      and conname =
        'cognitive_product_quality_service_capabilities_operation_check'
  ),
  'the three exact LiveKit capability operations are admitted'
);

select has_function(
  'public',
  'governance_register_livekit_collector_capability',
  array['public.cognitive_platform','text','text','timestamptz'],
  'exact Owner LiveKit capability registration exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.governance_register_livekit_collector_capability(public.cognitive_platform,text,text,timestamptz)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.governance_register_livekit_collector_capability(public.cognitive_platform,text,text,timestamptz)',
    'EXECUTE'
  ),
  'only authenticated exact Owner may register LiveKit capabilities'
);
select ok(
  pg_get_functiondef(
    'public.governance_register_livekit_collector_capability(public.cognitive_platform,text,text,timestamptz)'::regprocedure
  ) like '%Chillywood2025/chillywood-mobile%'
  and pg_get_functiondef(
    'public.governance_register_livekit_collector_capability(public.cognitive_platform,text,text,timestamptz)'::regprocedure
  ) like '%cognitive-level01-canary-control%'
  and pg_get_functiondef(
    'public.governance_register_livekit_collector_capability(public.cognitive_platform,text,text,timestamptz)'::regprocedure
  ) like '%production%',
  'capability registration resolves the exact repository task tuple'
);

select ok(
  pg_get_functiondef(
    'public.product_experience_collect_sentinel_run(uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text,text)'::regprocedure
  ) like '%collect_livekit_sentinel_run%'
  and pg_get_functiondef(
    'public.product_experience_collect_sentinel_run(uuid,uuid,public.cognitive_platform,public.cognitive_environment,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text,text)'::regprocedure
  ) like '%cognitive_livekit_experience_collector%',
  'sentinel persistence selects the exact LiveKit operation and principal'
);
select ok(
  pg_get_functiondef(
    'cognitive_runtime.collect_livekit_sentinel_run(uuid,uuid,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%cognitive_livekit_experience_collector%'
  and pg_get_functiondef(
    'cognitive_runtime.collect_livekit_sentinel_run(uuid,uuid,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) not like '%''cognitive_sentinel_collector''%',
  'the isolated LiveKit wrapper no longer borrows visual authority'
);
select ok(
  pg_get_functiondef(
    'public.product_experience_require_collector_capability()'::regprocedure
  ) like '%cognitive_livekit_experience_collector%'
  and pg_get_functiondef(
    'public.product_experience_require_collector_capability()'::regprocedure
  ) like '%collect_livekit_sentinel_run%',
  'the insert trigger independently rechecks exact LiveKit authority'
);
select ok(
  pg_get_functiondef(
    'cognitive_runtime.issue_livekit_failure_fixture(uuid,uuid,text,text,text,text,text,text,jsonb,text,text,text,timestamptz,timestamptz,text)'::regprocedure
  ) like '%issue_livekit_failure_fixture%',
  'fixture issuance asserts its exact operation'
);
select ok(
  pg_get_functiondef(
    'cognitive_runtime.consume_livekit_failure_fixture_and_collect(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%consume_livekit_failure_fixture%'
  and pg_get_functiondef(
    'cognitive_runtime.consume_livekit_failure_fixture_and_collect(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%collect_livekit_sentinel_run%',
  'fixture consumption requires both consume and collect authority'
);

select has_function(
  'cognitive_runtime',
  'product_quality_triage_livekit_bounded_no_finding',
  array['uuid','text'],
  'exact bounded-failure triage wrapper exists'
);
select ok(
  has_function_privilege(
    'cognitive_product_quality_triage',
    'cognitive_runtime.product_quality_triage_livekit_bounded_no_finding(uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'cognitive_product_quality_evaluator',
    'cognitive_runtime.product_quality_triage_livekit_bounded_no_finding(uuid,text)',
    'EXECUTE'
  ),
  'bounded-failure triage consumption belongs only to triage'
);
select ok(
  cognitive_runtime.runtime_operation_allowed(
    'cognitive_product_quality_triage',
    'triage_livekit_bounded_failure_no_finding'
  )
  and not cognitive_runtime.runtime_operation_allowed(
    'cognitive_product_quality_evaluator',
    'triage_livekit_bounded_failure_no_finding'
  ),
  'runtime allowlist keeps fixture triage principal-separated'
);

select has_function(
  'public',
  'governance_prepare_livekit_platform_preflight',
  array[
    'public.cognitive_platform','text','text','text','text','text',
    'text','text','text','text','text','text','interval'
  ],
  'platform preflight function exists'
);
select has_function(
  'public',
  'governance_open_livekit_platform_canary',
  array['uuid','interval'],
  'one-use platform authorization function exists'
);
select has_function(
  'public',
  'governance_finalize_livekit_platform_canary',
  array['uuid','boolean','text','text','text'],
  'immutable platform finalization function exists'
);
select ok(
  pg_get_functiondef(
    'public.cognitive_bind_livekit_platform_identity_v2()'::regprocedure
  ) like '%e3379ac9-61f0-40db-a014-81975be123e5%'
  and pg_get_functiondef(
    'public.cognitive_bind_livekit_platform_identity_v2()'::regprocedure
  ) like '%019fb099-f7c3-7130-97aa-a4bb1c49792f%'
  and (
    select pg_get_constraintdef(oid) like '%build_number = ''86''%'
      and pg_get_constraintdef(oid) like
        '%1.0.0-android-chat-call-action-v1%'
      and pg_get_constraintdef(oid) like
        '%fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44%'
      and pg_get_constraintdef(oid) like
        '%24a951d58302dd73e13e4adc899fc28680472eb78f37cac04639ee95896e36d8%'
    from pg_constraint
    where conrelid =
      'public.cognitive_livekit_platform_preflight_receipts'::regclass
      and conname =
        'cognitive_livekit_platform_preflight_identity_v2_check'
  ),
  'preflight binds the exact current Android and iOS installed identities'
);
select ok(
  pg_get_functiondef(
    'public.governance_prepare_livekit_platform_preflight(public.cognitive_platform,text,text,text,text,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%provider-independent-visual-live-v2%'
  and pg_get_functiondef(
    'public.governance_prepare_livekit_platform_preflight(public.cognitive_platform,text,text,text,text,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%provider-independent-ios-visual-live-v1%',
  'preflight requires both existing visual live policies'
);
select ok(
  pg_get_functiondef(
    'public.governance_open_livekit_platform_canary(uuid,interval)'::regprocedure
  ) like '%provider-independent-android-livekit-canary-v1%'
  and pg_get_functiondef(
    'public.governance_open_livekit_platform_canary(uuid,interval)'::regprocedure
  ) like '%provider-independent-ios-livekit-canary-v1%',
  'authorization enables only the selected platform canary policy'
);
select ok(
  pg_get_functiondef(
    'public.governance_finalize_livekit_platform_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%provider-independent-android-livekit-live-v1%'
  and pg_get_functiondef(
    'public.governance_finalize_livekit_platform_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%provider-independent-ios-livekit-live-v1%',
  'finalization has distinct platform live policies'
);
select ok(
  pg_get_functiondef(
    'public.governance_finalize_livekit_platform_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%expected_scenario_count_value <> 9%'
  and pg_get_functiondef(
    'public.governance_finalize_livekit_platform_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%fixture_triage_count_value < 3%',
  'success requires all route/scenario pairs and fixture triage'
);
select ok(
  pg_get_functiondef(
    'public.product_experience_lock_exact_sentinel_switch()'::regprocedure
  ) like '%provider-independent-android-livekit-canary-v1%'
  and pg_get_functiondef(
    'public.product_experience_lock_exact_sentinel_switch()'::regprocedure
  ) like '%provider-independent-ios-livekit-canary-v1%',
  'run inserts require one unexpired exact platform authorization'
);
select ok(
  pg_get_functiondef(
    'public.product_experience_lock_exact_sentinel_switch()'::regprocedure
  ) like '%provider-independent-visual-canary-v1%'
  and pg_get_functiondef(
    'public.product_experience_lock_exact_sentinel_switch()'::regprocedure
  ) like '%provider-independent-ios-visual-canary-v1%',
  'the working Android/iOS visual canary lock is preserved'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_livekit_platform_preflight_receipts
  ),
  0,
  'migration creates no LiveKit preflight receipt'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_livekit_platform_canary_authorizations
  ),
  0,
  'migration opens no LiveKit authorization'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_livekit_platform_activation_outcomes
  ),
  0,
  'migration creates no LiveKit outcome'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_product_quality_service_capabilities
    where service_identity = 'cognitive_livekit_experience_collector'
  ),
  0,
  'migration registers no live capability'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_level01_schedule_definitions
    where enabled
  ),
  0,
  'migration enables no recurring schedule'
);

select * from finish();
rollback;
