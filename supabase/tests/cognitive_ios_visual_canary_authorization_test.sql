begin;
select no_plan();

select ok(
  to_regclass(
    'public.cognitive_ios_visual_canary_preflight_receipts'
  ) is not null,
  'the iOS preflight receipt relation exists'
);

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid =
      'public.cognitive_ios_visual_canary_preflight_receipts'::regclass
  ),
  'iOS preflight receipts force row-level security'
);

select ok(
  has_table_privilege(
    'authenticated',
    'public.cognitive_ios_visual_canary_preflight_receipts',
    'SELECT'
  )
  and not has_table_privilege(
    'anon',
    'public.cognitive_ios_visual_canary_preflight_receipts',
    'SELECT'
  )
  and not has_table_privilege(
    'service_role',
    'public.cognitive_ios_visual_canary_preflight_receipts',
    'SELECT'
  ),
  'only authenticated exact-Owner policy reads are exposed'
);

select ok(
  (
    select count(*) = 1
    from pg_trigger
    where tgrelid =
      'public.cognitive_ios_visual_canary_preflight_receipts'::regclass
      and tgname =
        'cognitive_ios_visual_canary_preflight_receipts_immutable'
      and not tgisinternal
  ),
  'iOS preflight receipts are immutable'
);

select ok(
  (
    select pg_get_constraintdef(oid)
      like '%UNIQUE (assertion_hash, task_id, project_id, platform, environment, operation)%'
    from pg_constraint
    where conrelid =
      'public.cognitive_product_quality_service_capabilities'::regclass
      and conname =
        'cognitive_quality_capability_assertion_operation_scope_key'
  ),
  'unchanged Worker assertions may bind separate exact platform operations'
);

select ok(
  not exists (
    select 1
    from pg_constraint
    where conrelid =
      'public.cognitive_product_quality_service_capabilities'::regclass
      and conname =
        'cognitive_product_quality_service_capabiliti_assertion_hash_key'
  ),
  'the incompatible global assertion-hash uniqueness constraint is removed'
);

select ok(
  (
    select pg_get_constraintdef(oid)
      like '%target_platform = ANY (ARRAY[''android''%'
      and pg_get_constraintdef(oid) like '%''ios''%'
    from pg_constraint
    where conrelid =
      'public.cognitive_provider_independent_visual_canary_authorizations'::regclass
      and conname = 'cognitive_visual_canary_target_pair_check'
  ),
  'visual authorizations accept only the historical Android or successor iOS target'
);

select ok(
  (
    select pg_get_constraintdef(oid)
      like '%target_platform = ANY (ARRAY[''android''%'
      and pg_get_constraintdef(oid) like '%''ios''%'
    from pg_constraint
    where conrelid =
      'public.cognitive_provider_independent_visual_activation_outcomes'::regclass
      and conname = 'cognitive_visual_outcome_target_pair_check'
  ),
  'visual outcomes accept only the historical Android or successor iOS target'
);

select ok(
  (
    select pg_get_constraintdef(oid)
      like '%ios_preflight_receipt_id IS NOT NULL%'
      and pg_get_constraintdef(oid)
        like '%target_platform = ''ios''%'
    from pg_constraint
    where conrelid =
      'public.cognitive_provider_independent_visual_canary_authorizations'::regclass
      and conname =
        'cognitive_visual_canary_ios_preflight_pair_check'
  ),
  'every iOS authorization requires an iOS preflight receipt'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.governance_prepare_ios_visual_canary_preflight(uuid,uuid,text,text,jsonb,text,text,interval)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.governance_prepare_ios_visual_canary_preflight(uuid,uuid,text,text,jsonb,text,text,interval)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.governance_prepare_ios_visual_canary_preflight(uuid,uuid,text,text,jsonb,text,text,interval)',
    'EXECUTE'
  ),
  'only an authenticated caller may enter the exact-Owner iOS preflight'
);

select ok(
  (
    select prosecdef
      and proconfig @> array['search_path=""']
    from pg_proc
    where oid =
      'public.governance_prepare_ios_visual_canary_preflight(uuid,uuid,text,text,jsonb,text,text,interval)'::regprocedure
  ),
  'the iOS preflight is a locked security-definer boundary'
);

select ok(
  position(
    'product_experience_generic_manifest_predicates'
    in pg_get_functiondef(
      'public.governance_prepare_ios_visual_canary_preflight(uuid,uuid,text,text,jsonb,text,text,interval)'::regprocedure
    )
  ) > 0
  and position(
    'failedSubpredicate'
    in pg_get_functiondef(
      'public.governance_prepare_ios_visual_canary_preflight(uuid,uuid,text,text,jsonb,text,text,interval)'::regprocedure
    )
  ) > 0
  and position(
    'product_experience_detailed_metric_manifest_is_valid'
    in pg_get_functiondef(
      'public.governance_prepare_ios_visual_canary_preflight(uuid,uuid,text,text,jsonb,text,text,interval)'::regprocedure
    )
  ) > 0
  and position(
    '''ios'''
    in pg_get_functiondef(
      'public.governance_prepare_ios_visual_canary_preflight(uuid,uuid,text,text,jsonb,text,text,interval)'::regprocedure
    )
  ) > 0,
  'all generic subpredicates and the detailed iOS validator gate the receipt'
);

select ok(
  position(
    'verified_physical'
    in pg_get_functiondef(
      'public.governance_prepare_ios_visual_canary_preflight(uuid,uuid,text,text,jsonb,text,text,interval)'::regprocedure
    )
  ) > 0
  and position(
    'p_validity > interval ''15 minutes'''
    in pg_get_functiondef(
      'public.governance_prepare_ios_visual_canary_preflight(uuid,uuid,text,text,jsonb,text,text,interval)'::regprocedure
    )
  ) > 0,
  'the iOS receipt requires physical proof and expires in at most fifteen minutes'
);

select ok(
  pg_get_functiondef(
    'public.governance_prepare_ios_visual_canary_preflight(uuid,uuid,text,text,jsonb,text,text,interval)'::regprocedure
  ) like '%capability.platform = ''ios''%'
  and pg_get_functiondef(
    'public.governance_prepare_ios_visual_canary_preflight(uuid,uuid,text,text,jsonb,text,text,interval)'::regprocedure
  ) like '%cognitive_sentinel_collector%'
  and pg_get_functiondef(
    'public.governance_prepare_ios_visual_canary_preflight(uuid,uuid,text,text,jsonb,text,text,interval)'::regprocedure
  ) like '%cognitive_product_quality_triage%'
  and pg_get_functiondef(
    'public.governance_prepare_ios_visual_canary_preflight(uuid,uuid,text,text,jsonb,text,text,interval)'::regprocedure
  ) like '%count(distinct capability.service_identity) <> 2%',
  'exactly two current iOS-only collector and triage capabilities are required'
);

select ok(
  pg_get_functiondef(
    'public.governance_prepare_ios_visual_canary_preflight(uuid,uuid,text,text,jsonb,text,text,interval)'::regprocedure
  ) like '%provider-independent-visual-live-v2%'
  and pg_get_functiondef(
    'public.governance_prepare_ios_visual_canary_preflight(uuid,uuid,text,text,jsonb,text,text,interval)'::regprocedure
  ) like '%sibling.platform = ''android''%'
  and pg_get_functiondef(
    'public.governance_prepare_ios_visual_canary_preflight(uuid,uuid,text,text,jsonb,text,text,interval)'::regprocedure
  ) like '%schedule.enabled%',
  'only the finalized Android visual sibling may remain live and schedules stay off'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.governance_open_provider_independent_ios_visual_canary(uuid,text,text,text,text,text,text,text,interval)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.governance_open_provider_independent_ios_visual_canary(uuid,text,text,text,text,text,text,text,interval)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.governance_open_provider_independent_ios_visual_canary(uuid,text,text,text,text,text,text,text,interval)',
    'EXECUTE'
  ),
  'only an authenticated caller may enter the exact-Owner iOS authorization'
);

select ok(
  pg_get_functiondef(
    'public.governance_open_provider_independent_ios_visual_canary(uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%e05ff68c426e2ccb1bc268e14e9e5d19ba64efa9%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_ios_visual_canary(uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%5295d907e6806883e1de2dda5626d8e3a129783d%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_ios_visual_canary(uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%47779ee113dd79b7678569750aa2f96e4663e2e1ccc5b44262365817ce1611fb%',
  'the iOS authorization retains the reviewed deployed Worker source tuple'
);

select ok(
  pg_get_functiondef(
    'public.governance_open_provider_independent_ios_visual_canary(uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%ios_preflight_receipt_id%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_ios_visual_canary(uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%receipt_value.expires_at%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_ios_visual_canary(uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%provider-independent-ios-visual-canary-v1%',
  'one unexpired unconsumed iOS receipt binds the exact iOS switch authorization'
);

select ok(
  pg_get_functiondef(
    'public.governance_open_provider_independent_ios_visual_canary(uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%count(distinct capability.service_identity) <> 2%',
  'authorization rechecks one current collector and one current triage capability'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.governance_finalize_provider_independent_ios_visual_canary(uuid,boolean,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.governance_finalize_provider_independent_ios_visual_canary(uuid,boolean,text,text,text)',
    'EXECUTE'
  ),
  'only an authenticated caller may enter exact-Owner iOS finalization'
);

select ok(
  pg_get_functiondef(
    'public.governance_finalize_provider_independent_ios_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%run.platform = ''ios''%'
  and pg_get_functiondef(
    'public.governance_finalize_provider_independent_ios_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%finding_detection%'
  and pg_get_functiondef(
    'public.governance_finalize_provider_independent_ios_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%run_no_finding%'
  and pg_get_functiondef(
    'public.governance_finalize_provider_independent_ios_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%finding_resolution%',
  'finalization counts only iOS detection, no-finding, and resolution evidence'
);

select ok(
  pg_get_functiondef(
    'public.governance_finalize_provider_independent_ios_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%emergency_paused%'
  and pg_get_functiondef(
    'public.governance_finalize_provider_independent_ios_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%emergency_resumed%'
  and pg_get_functiondef(
    'public.governance_finalize_provider_independent_ios_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%schedule.enabled%'
  and pg_get_functiondef(
    'public.governance_finalize_provider_independent_ios_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%provider-independent-visual-live-v2%',
  'iOS finalization retains emergency, schedule, and Android sibling gates'
);

select ok(
  pg_get_functiondef(
    'public.product_experience_lock_exact_sentinel_switch()'::regprocedure
  ) like '%provider-independent-ios-visual-canary-v1%'
  and pg_get_functiondef(
    'public.product_experience_lock_exact_sentinel_switch()'::regprocedure
  ) ilike '%authorization_row.ios_preflight_receipt_id is not null%'
  and pg_get_functiondef(
    'public.product_experience_lock_exact_sentinel_switch()'::regprocedure
  ) like '%authorization_row.target_platform = new.platform%',
  'the write trigger requires the exact open iOS authorization and receipt'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_ios_visual_canary_preflight_receipts
  ),
  0,
  'the migration creates no iOS preflight receipt'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_provider_independent_visual_canary_authorizations
  ),
  0,
  'the migration opens no visual authorization'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_product_quality_service_capabilities
  ),
  0,
  'the migration creates no collector or triage capability'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_governance_switches
    where enabled
  ),
  0,
  'the migration enables no switch'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_level01_schedule_definitions
    where enabled
  ),
  0,
  'the migration enables no schedule'
);

select is(
  (
    select count(*)::integer
    from public.product_experience_sentinel_runs
  ),
  0,
  'the migration creates no Android or iOS evidence'
);

insert into public.platform_role_memberships(user_id, email, role, status)
values
  ('f1000000-0000-4000-8000-000000000001', null, 'owner', 'active'),
  (
    'f1000000-0000-4000-8000-000000000002',
    null,
    'super_admin',
    'active'
  );

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'f1000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"f1000000-0000-4000-8000-000000000002"}',
  true
);
select throws_ok(
  $$select public.governance_prepare_ios_visual_canary_preflight(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    repeat('a', 64),
    repeat('b', 64),
    '{}'::jsonb,
    'passed',
    'verified_physical',
    interval '15 minutes'
  )$$,
  '42501',
  'governance_owner_identity_required',
  'a non-Owner cannot create an iOS preflight receipt'
);
reset role;

select * from finish();
rollback;
