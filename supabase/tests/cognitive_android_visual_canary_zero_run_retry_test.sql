begin;
select no_plan();

select ok(
  has_function_privilege(
    'authenticated',
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)',
    'EXECUTE'
  ),
  'only authenticated callers may enter the exact-Owner zero-run retry gate'
);

select ok(
  (
    select prosecdef
      and proconfig @> array['search_path=""']
    from pg_proc
    where oid =
      'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ),
  'zero-run retry is a locked security-definer boundary'
);

select ok(
  pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) like '%governance_assert_exact_owner%'
  and pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) like '%pg_advisory_xact_lock%',
  'retry requires exact Owner under an advisory transaction lock'
);

select ok(
  pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) like '%scope.platform = ''android''%'
  and pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) like '%provider-independent-visual-canary-rolled-back-v2%'
  and pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) like '%outcome.target_task_id = target_scope.platform_task_id%'
  and pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) like '%outcome.target_platform = ''android''%',
  'retry is bound to the exact rolled-back Android target'
);

select ok(
  pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) like '%prior_outcome.sentinel_run_count <> 0%'
  and pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) like '%prior_outcome.evaluator_proof_count <> 0%'
  and pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) like '%prior_outcome.triage_consumption_count <> 0%'
  and pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) like '%prior_outcome.finding_event_count <> 0%',
  'retry rejects any rollback that recorded partial canary evidence'
);

select ok(
  pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) like '%from public.product_experience_sentinel_runs run%'
  and pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) like '%run.task_id = target_scope.platform_task_id%',
  'retry independently proves the Android target still has zero runs'
);

select ok(
  pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) like '%sibling.enabled%'
  and pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) like '%schedule.enabled%'
  and pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) like '%governance_approval_emergency_active%',
  'retry requires every switch and schedule off with emergency state active'
);

select ok(
  pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) like '%cognitive_sentinel_collector%'
  and pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) like '%cognitive_product_quality_triage%'
  and pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) like '%capability.task_id = target_scope.platform_task_id%'
  and pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) like '%not exists (%cognitive_product_quality_service_capability_revocations%',
  'retry requires both unrevoked Android capability domains'
);

select ok(
  pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) like '%set policy_version = ''collective-governance-v1''%'
  and pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) like '%enabled_by = null%'
  and pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) like '%enabled_at = null%'
  and pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_canary_retry(uuid,uuid)'::regprocedure
  ) not like '%set enabled = true%',
  'retry restores disabled metadata and never activates the switch'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_provider_independent_visual_canary_authorizations
  ),
  0,
  'the retry migration opens no authorization'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_provider_independent_visual_activation_outcomes
  ),
  0,
  'the retry migration fabricates no outcome'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_governance_switches
    where enabled
  ),
  0,
  'the retry migration enables no switch'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_level01_schedule_definitions
    where enabled
  ),
  0,
  'the retry migration enables no schedule'
);

insert into public.platform_role_memberships(user_id, email, role, status)
values
  ('f4000000-0000-4000-8000-000000000001', null, 'owner', 'active'),
  ('f4000000-0000-4000-8000-000000000002', null, 'super_admin', 'active');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'f4000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"f4000000-0000-4000-8000-000000000002"}',
  true
);
select throws_ok(
  $$select public.governance_prepare_provider_independent_visual_canary_retry(
    'f5000000-0000-4000-8000-000000000001',
    'f6000000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  'governance_owner_identity_required',
  'a non-Owner cannot prepare a retry'
);
reset role;

select * from finish();
rollback;
