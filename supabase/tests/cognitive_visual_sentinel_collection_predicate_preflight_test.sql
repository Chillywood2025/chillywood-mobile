begin;
select no_plan();

select has_function(
  'cognitive_runtime',
  'preflight_visual_sentinel_collection',
  array[
    'uuid','uuid','text','text','text','text','text','text','text',
    'jsonb','text','text','timestamp with time zone',
    'timestamp with time zone','timestamp with time zone','text','text'
  ],
  'the principal-bound visual collection predicate preflight exists'
);

select ok(
  (
    select procedure.prosecdef
      and procedure.provolatile = 'v'
      and procedure.proconfig @> array['search_path=""']
    from pg_catalog.pg_proc procedure
    where procedure.oid =
      'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ),
  'the diagnostic is a locked volatile security-definer boundary'
);

select ok(
  has_function_privilege(
    'cognitive_sentinel_collector',
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'public',
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)',
    'EXECUTE'
  ),
  'only the sentinel collector principal receives diagnostic execute'
);

select ok(
  not has_function_privilege(
    'cognitive_product_baseline_executor',
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'cognitive_product_quality_evaluator',
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'cognitive_product_quality_triage',
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)',
    'EXECUTE'
  ),
  'active sibling principals cannot execute the collector diagnostic'
);

select ok(
  cognitive_runtime.runtime_operation_allowed(
    'cognitive_sentinel_collector',
    'preflight_visual_sentinel_collection'
  )
  and not cognitive_runtime.runtime_operation_allowed(
    'cognitive_product_quality_triage',
    'preflight_visual_sentinel_collection'
  )
  and not cognitive_runtime.runtime_operation_allowed(
    'cognitive_sentinel_collector',
    'preflight_triage_product_quality'
  ),
  'the operation allowlist binds the diagnostic to one exact principal'
);

select ok(
  pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%assert_runtime_invoker(%''cognitive_sentinel_collector''%''preflight_visual_sentinel_collection''%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%set_config(''request.jwt.claim.role'', ''service_role'', true)%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%coalesce(prior_request_role, '''')%',
  'runtime identity is asserted and the nested claim is restored'
);

select ok(
  lower(pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  )) not like '%insert into%'
  and lower(pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  )) not like '%update public.%'
  and lower(pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  )) not like '%delete from%'
  and lower(pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  )) not like '%set enabled = true%',
  'the diagnostic contains no evidence, capability, authorization, or switch write'
);

select ok(
  pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%governance_exact_owner(capability.registered_by)%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%capability.operation = ''collect_sentinel_run''%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%cognitive_product_quality_service_capability_revocations%',
  'capability checks require exact Owner registration, operation, expiry, and non-revocation'
);

select ok(
  pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%extensions.digest(%convert_to(p_service_assertion, ''UTF8'')%''sha256''%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) not like '%''assertionHash''%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) not like '%''serviceAssertion''%',
  'the assertion is compared privately and no raw value or digest is returned'
);

select ok(
  pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%task.task_key = ''cognitive-level01-canary-control''%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%task.repository_full_name =%''Chillywood2025/chillywood-mobile''%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%platform_value = ''android''::public.cognitive_platform%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%environment_value = ''production''::public.cognitive_environment%',
  'task, repository, Android platform, and production environment are exact'
);

select ok(
  pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%task.cancelled_at is null%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%task.quarantined_at is null%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%transaction_timestamp() < task.deadman_at%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%governance_approval_emergency_active()%',
  'cancel, quarantine, deadman, and emergency predicates remain fail closed'
);

select ok(
  pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%cognitive_visual_experience_sentinel_enabled%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%provider-independent-visual-canary-v2%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%cognitive_provider_independent_visual_canary_authorizations%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%cognitive_provider_independent_visual_activation_outcomes%',
  'the exact enabled switch and one open, unexpired authorization are required'
);

select ok(
  pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%length(p_route_or_surface) between 1 and 160%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%cognitive_text_has_secret(p_route_or_surface)%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%cognitive_text_has_private_identifier(%p_route_or_surface%',
  'route or surface data is bounded and sanitized'
);

select ok(
  pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%p_runtime_identity_hash ~ ''^[a-f0-9]{64}$''%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%p_source_build_hash ~ ''^[a-f0-9]{64}$''%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%p_evidence_manifest_hash ~ ''^[a-f0-9]{64}$''%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%p_collection_idempotency_hash ~ ''^[a-f0-9]{64}$''%',
  'runtime, build, manifest, and idempotency hashes remain exact'
);

select ok(
  pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%p_result_status in (''passed'', ''blocked'', ''failed'')%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%p_physical_proof_status in (%''installed_ui_observed''%''simulator_observed''%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%p_result_status = ''blocked''%or p_physical_proof_status in (%',
  'result and physical-proof statuses retain their mutually valid contract'
);

select ok(
  pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%interval ''30 minutes''%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%interval ''5 minutes''%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%interval ''24 hours''%',
  'observation and evaluation timestamp bounds are unchanged'
);

select ok(
  pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%product_experience_metric_manifest_is_bounded(%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%product_experience_detailed_metric_manifest_is_valid(%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%product_experience_objective_touch_target_is_independent(%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%product_experience_lock_effective_baseline_v1(%',
  'generic, detailed visual, independent touch-target, and baseline validators are reused'
);

select ok(
  pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%run.collection_idempotency_hash%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%p_collection_idempotency_hash%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%run.evidence_manifest_hash = p_evidence_manifest_hash%'
  and pg_get_functiondef(
    'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
  ) like '%run.route_or_surface = p_route_or_surface%',
  'idempotency reuse and conflicting existing runs are separately rejected'
);

select ok(
  (
    select count(*) = 22
    from unnest(array[
      'legacy_nested_claim',
      'collector_capability_current',
      'collector_assertion_digest',
      'collector_sentinel_key',
      'collector_android_scope',
      'android_task_scope',
      'emergency_stop',
      'android_task_writes',
      'route_or_surface',
      'runtime_identity_hash',
      'source_build_hash',
      'evidence_manifest_hash',
      'collection_idempotency',
      'status_physical_proof_pair',
      'observation_timestamps',
      'evaluation_expiry',
      'metric_manifest_generic',
      'metric_manifest_visual_detail',
      'effective_baseline',
      'conflicting_existing_run',
      'android_visual_switch',
      'android_visual_authorization'
    ]::text[]) reason_code
    where pg_get_functiondef(
      'cognitive_runtime.preflight_visual_sentinel_collection(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)'::regprocedure
    ) like '%' || reason_code || '%'
  ),
  'the diagnostic exposes every reviewed bounded failed-predicate reason'
);

select is(
  (
    select count(*)::integer
    from public.product_experience_sentinel_runs
  ),
  0,
  'installing the preflight creates no sentinel evidence'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_provider_independent_visual_canary_authorizations
  ),
  0,
  'installing the preflight creates no authorization'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_governance_switches
    where enabled
  ),
  0,
  'installing the preflight enables no switch'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_level01_schedule_definitions
    where enabled
  ),
  0,
  'installing the preflight enables no schedule'
);

set local role authenticated;
select throws_ok(
  $$select cognitive_runtime.preflight_visual_sentinel_collection(
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    'android',
    'production',
    'visual_product_experience_sentinel',
    'Home main tab',
    repeat('a', 64),
    repeat('b', 64),
    repeat('c', 64),
    '{}'::jsonb,
    'blocked',
    'source_only',
    transaction_timestamp() - interval '1 minute',
    transaction_timestamp(),
    transaction_timestamp() + interval '1 hour',
    repeat('d', 64),
    'not-returned'
  )$$,
  '42501',
  'permission denied for schema cognitive_runtime',
  'an authenticated client cannot invoke the diagnostic'
);
reset role;

select * from finish();
rollback;
