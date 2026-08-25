begin;
select no_plan();

select ok(
  (
    select count(*) = 4
    from information_schema.columns
    where table_schema = 'public'
      and (
        (
          table_name =
            'cognitive_provider_independent_visual_canary_authorizations'
          and column_name in ('target_task_id','target_platform')
        )
        or (
          table_name =
            'cognitive_provider_independent_visual_activation_outcomes'
          and column_name in ('target_task_id','target_platform')
        )
      )
  ),
  'authorization and outcome receipts preserve an exact platform target'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.governance_prepare_provider_independent_visual_platform_scopes(uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.governance_prepare_provider_independent_visual_platform_scopes(uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.governance_prepare_provider_independent_visual_platform_scopes(uuid,uuid)',
    'EXECUTE'
  ),
  'only authenticated callers may enter the exact-Owner scope preparation'
);

select ok(
  (
    select prosecdef
      and proconfig @> array['search_path=""']
    from pg_proc
    where oid =
      'public.governance_prepare_provider_independent_visual_platform_scopes(uuid,uuid)'::regprocedure
  ),
  'platform-scope preparation is a locked security-definer boundary'
);

select ok(
  pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_platform_scopes(uuid,uuid)'::regprocedure
  ) like '%governance_assert_exact_owner%'
  and pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_platform_scopes(uuid,uuid)'::regprocedure
  ) like '%provider-independent-visual-canary-rolled-back-v1%'
  and pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_platform_scopes(uuid,uuid)'::regprocedure
  ) like '%outcome.sentinel_run_count = 0%'
  and pg_get_functiondef(
    'public.governance_prepare_provider_independent_visual_platform_scopes(uuid,uuid)'::regprocedure
  ) like '%governance_materialize_product_sentinel_platform_scopes%',
  'scope preparation requires exact Owner and the immutable zero-run rollback'
);

select ok(
  pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%scope.platform = ''android''%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%target_scope.platform_task_id%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%provider-independent-visual-canary-v2%',
  'opening targets only the materialized Android switch'
);

select ok(
  pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%capability.task_id = target_scope.platform_task_id%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%capability.platform = ''android''%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%cognitive_sentinel_collector%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%cognitive_product_quality_triage%',
  'opening requires exact Android collector and triage capabilities'
);

select ok(
  pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%sibling.project_id = p_project_id%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%sibling.enabled%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'::regprocedure
  ) like '%schedule.enabled%',
  'opening requires every shared and platform sibling switch and schedule off'
);

select ok(
  pg_get_functiondef(
    'public.governance_finalize_provider_independent_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%run.task_id = authorization_value.target_task_id%'
  and pg_get_functiondef(
    'public.governance_finalize_provider_independent_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%run.platform = authorization_value.target_platform%'
  and pg_get_functiondef(
    'public.governance_finalize_provider_independent_visual_canary(uuid,boolean,text,text,text)'::regprocedure
  ) like '%provider-independent-visual-live-v2%',
  'finalization counts and retains only exact Android evidence'
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
  ) like '%finding_resolution%',
  'Android finalization still requires consumed detection, no-finding, and resolution'
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
  ) like '%sibling.id <> target_switch.id%',
  'finalization requires emergency proof and keeps every sibling off'
);

select ok(
  pg_get_functiondef(
    'public.product_experience_lock_exact_sentinel_switch()'::regprocedure
  ) like '%provider-independent-visual-canary-v2%'
  and pg_get_functiondef(
    'public.product_experience_lock_exact_sentinel_switch()'::regprocedure
  ) like '%authorization_row.target_task_id = new.task_id%'
  and pg_get_functiondef(
    'public.product_experience_lock_exact_sentinel_switch()'::regprocedure
  ) like '%authorization_row.target_platform = new.platform%'
  and pg_get_functiondef(
    'public.product_experience_lock_exact_sentinel_switch()'::regprocedure
  ) like '%transaction_timestamp() < authorization_row.expires_at%',
  'the table boundary enforces exact Android authorization and expiry'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_product_sentinel_platform_scopes
  ),
  0,
  'the migration materializes no platform scope by itself'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_provider_independent_visual_canary_authorizations
  ),
  0,
  'the migration opens no authorization'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_provider_independent_visual_activation_outcomes
  ),
  0,
  'the migration records no activation outcome'
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

insert into auth.users(id, is_sso_user, is_anonymous, email_confirmed_at)
values
  ('f1000000-0000-4000-8000-000000000001', false, false, now()),
  ('f1000000-0000-4000-8000-000000000002', false, false, now());

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
  $$select public.governance_prepare_provider_independent_visual_platform_scopes(
    'f2000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  'governance_owner_identity_required',
  'a non-Owner cannot materialize platform scope'
);
reset role;

select * from finish();
rollback;
