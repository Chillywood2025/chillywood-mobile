begin;
select no_plan();

select is(
  (
    select count(*)::integer
    from pg_class
    where oid in (
      'public.cognitive_provider_independent_visual_canary_authorizations'::regclass,
      'public.cognitive_provider_independent_visual_activation_outcomes'::regclass
    )
      and relrowsecurity
      and relforcerowsecurity
  ),
  2,
  'both provider-independent visual activation receipts have forced RLS'
);

select ok(
  has_table_privilege(
    'authenticated',
    'public.cognitive_provider_independent_visual_canary_authorizations',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.cognitive_provider_independent_visual_canary_authorizations',
    'INSERT,UPDATE,DELETE'
  )
  and has_table_privilege(
    'authenticated',
    'public.cognitive_provider_independent_visual_activation_outcomes',
    'SELECT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.cognitive_provider_independent_visual_activation_outcomes',
    'INSERT,UPDATE,DELETE'
  ),
  'authenticated callers can only read their exact-Owner receipts'
);

select ok(
  not has_table_privilege(
    'service_role',
    'public.cognitive_provider_independent_visual_canary_authorizations',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'service_role',
    'public.cognitive_provider_independent_visual_activation_outcomes',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'service-role cannot read or mutate visual activation receipts'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.governance_finalize_provider_independent_visual_canary(uuid,boolean,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.governance_finalize_provider_independent_visual_canary(uuid,boolean,text,text,text)',
    'EXECUTE'
  ),
  'only authenticated exact-Owner calls can open or finalize the visual canary'
);

select ok(
  pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%e05ff68c426e2ccb1bc268e14e9e5d19ba64efa9%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%5295d907e6806883e1de2dda5626d8e3a129783d%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%47779ee113dd79b7678569750aa2f96e4663e2e1ccc5b44262365817ce1611fb%',
  'opening is bound to the exact repaired Worker commit, tree, and graph'
);

select ok(
  pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%cognitive_visual_experience_sentinel_enabled%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) not like '%cognitive_research_enabled''%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) not like '%cognitive_memory_enabled''%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) not like '%cognitive_scheduled_level01_enabled''%',
  'the narrow authorization names no research, memory, or scheduler target'
);

select ok(
  pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%approval_version.version_number <> 3%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%approval_state.state <> ''completed''%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%baseline.status = ''owner_approved''%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%cognitive_product_quality_service_capabilities%',
  'opening requires completed Option C, one effective baseline, and core capabilities'
);

select ok(
  pg_get_functiondef(
    'public.governance_finalize_provider_independent_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%finding_detection%'
  and pg_get_functiondef(
    'public.governance_finalize_provider_independent_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%run_no_finding%'
  and pg_get_functiondef(
    'public.governance_finalize_provider_independent_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%finding_resolution%'
  and pg_get_functiondef(
    'public.governance_finalize_provider_independent_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%triage_consumption_count_value < 3%'
  and pg_get_functiondef(
    'public.governance_finalize_provider_independent_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%finding.current_status = ''resolved''%',
  'finalization requires finding, no-finding, resolution, and triage evidence'
);

select ok(
  pg_get_functiondef(
    'public.governance_finalize_provider_independent_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%emergency_paused%'
  and pg_get_functiondef(
    'public.governance_finalize_provider_independent_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%emergency_resumed%'
  and pg_get_functiondef(
    'public.governance_finalize_provider_independent_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%sibling.id <> target_switch.id%'
  and pg_get_functiondef(
    'public.governance_finalize_provider_independent_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%schedule.enabled%',
  'finalization requires emergency-stop proof and keeps siblings and schedules off'
);

select ok(
  pg_get_functiondef(
    'public.governance_finalize_provider_independent_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%p_enable and now_at >= authorization_value.expires_at%'
  and pg_get_functiondef(
    'public.product_experience_lock_exact_sentinel_switch()'::regprocedure
  ) like '%provider-independent-visual-canary-v1%'
  and pg_get_functiondef(
    'public.product_experience_lock_exact_sentinel_switch()'::regprocedure
  ) like '%transaction_timestamp() < authorization_row.expires_at%'
  and pg_get_functiondef(
    'public.product_experience_lock_exact_sentinel_switch()'::regprocedure
  ) like '%product_experience_visual_canary_expired%',
  'an expired canary blocks collection but remains explicitly rollbackable'
);

select ok(
  pg_get_functiondef(
    'public.governance_finalize_provider_independent_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%proof.assessment_kind = required.assessment_kind%'
  and pg_get_functiondef(
    'public.governance_finalize_provider_independent_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%consumption.evaluator_proof_id = proof.id%',
  'finalization requires independently consumed detection, no-finding, and resolution proofs'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_provider_independent_visual_canary_authorizations
  ),
  0,
  'the migration creates no canary authorization'
);
select is(
  (
    select count(*)::integer
    from public.cognitive_provider_independent_visual_activation_outcomes
  ),
  0,
  'the migration creates no activation outcome'
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

insert into public.platform_role_memberships(user_id, email, role, status)
values
  ('f1000000-0000-4000-8000-000000000001', null, 'owner', 'active'),
  ('f1000000-0000-4000-8000-000000000002', null, 'super_admin', 'active');

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
  $$select public.governance_open_provider_independent_visual_canary(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    '6b9d7da6b8bb0d707a92fa19bd0058529e6e0a6a',
    'cc040ff917f762d2c3d5e944202a00f7c68734cb',
    'd9a1b788775f358912946920106442036105e4f66b5bf72eb64518b1ee5b9a6f',
    repeat('1',64), repeat('2',64), repeat('3',64), repeat('4',64),
    interval '30 minutes'
  )$$,
  '42501',
  'governance_owner_identity_required',
  'a non-Owner cannot open the visual canary'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  'f1000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"f1000000-0000-4000-8000-000000000001"}',
  true
);
select throws_ok(
  $$select public.governance_open_provider_independent_visual_canary(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001',
    '6b9d7da6b8bb0d707a92fa19bd0058529e6e0a6a',
    'cc040ff917f762d2c3d5e944202a00f7c68734cb',
    'd9a1b788775f358912946920106442036105e4f66b5bf72eb64518b1ee5b9a6f',
    repeat('1',64), repeat('2',64), repeat('3',64), repeat('4',64),
    interval '30 minutes'
  )$$,
  'P0001',
  'provider_independent_visual_canary_authorization_rejected',
  'even the exact Owner cannot open a canary without completed prerequisites'
);
reset role;

select ok(
  (
    select count(*) = 2
    from pg_trigger
    where not tgisinternal
      and tgname in (
        'cognitive_provider_independent_visual_canary_authorizations_immutable',
        'cognitive_provider_independent_visual_activation_outcomes_immutable'
      )
  ),
  'both activation receipt tables are append-only'
);

select * from finish();
rollback;
