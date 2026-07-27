begin;
select plan(12);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid =
      'public.cognitive_provider_independent_visual_canary_authorizations'
        ::regclass
      and conname = 'cognitive_visual_canary_worker_source_tuple_check'
      and contype = 'c'
  ),
  'authorization source tuples are exact and composite'
);

select ok(
  pg_get_constraintdef(
    (
      select oid
      from pg_constraint
      where conrelid =
        'public.cognitive_provider_independent_visual_canary_authorizations'
          ::regclass
        and conname = 'cognitive_visual_canary_worker_source_tuple_check'
    )
  ) like '%6b9d7da6b8bb0d707a92fa19bd0058529e6e0a6a%'
  and pg_get_constraintdef(
    (
      select oid
      from pg_constraint
      where conrelid =
        'public.cognitive_provider_independent_visual_canary_authorizations'
          ::regclass
        and conname = 'cognitive_visual_canary_worker_source_tuple_check'
    )
  ) like '%e05ff68c426e2ccb1bc268e14e9e5d19ba64efa9%',
  'historical and repaired source tuples remain independently exact'
);

select is(
  pg_get_function_result(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'
      ::regprocedure
  ),
  'jsonb',
  'the bounded Owner authorization ABI is unchanged'
);

select ok(
  pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'
      ::regprocedure
  ) like '%e05ff68c426e2ccb1bc268e14e9e5d19ba64efa9%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'
      ::regprocedure
  ) like '%5295d907e6806883e1de2dda5626d8e3a129783d%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'
      ::regprocedure
  ) like '%47779ee113dd79b7678569750aa2f96e4663e2e1ccc5b44262365817ce1611fb%',
  'the authorization binds the exact repaired Worker source tuple'
);

select ok(
  pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'
      ::regprocedure
  ) like '%32cfa7d5337b441d7bd9ae0cc7c673d05c28855195d19023ebfe4dd0fa56b8c7%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'
      ::regprocedure
  ) like '%d6d518926b87636634be4db1db6e4e5a1fcbb1cc2bf40ad5188ec9073eebf22c%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'
      ::regprocedure
  ) like '%c944d126fad70623dfe337dbd008bc1e48256725556503af3d25100cd6675022%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'
      ::regprocedure
  ) like '%02914c94f35a085e9a47b36f91142271f55a79417236467506a7a3c457090e53%',
  'review, tests, deployment, and rollback receipts are exact'
);

select ok(
  pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'
      ::regprocedure
  ) like '%approval_version.source_commit <>%6b9d7da6b8bb0d707a92fa19bd0058529e6e0a6a%'
  and pg_get_functiondef(
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)'
      ::regprocedure
  ) like '%approval_version.architecture_graph_digest <>%d9a1b788775f358912946920106442036105e4f66b5bf72eb64518b1ee5b9a6f%',
  'the completed Option C approval lineage is preserved rather than rewritten'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)',
    'EXECUTE'
  ),
  'authenticated exact Owner retains the only public invocation path'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)',
    'EXECUTE'
  ),
  'anonymous callers remain denied'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.governance_open_provider_independent_visual_canary(uuid,uuid,text,text,text,text,text,text,text,interval)',
    'EXECUTE'
  ),
  'generic service-role callers remain denied'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_provider_independent_visual_canary_authorizations
  ),
  0,
  'the source-binding migration creates no authorization'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_governance_switches
    where enabled
  ),
  0,
  'the source-binding migration enables no switch'
);

select is(
  (
    select count(*)::integer
    from public.cognitive_level01_schedule_definitions
    where enabled
  ),
  0,
  'the source-binding migration enables no schedule'
);

select * from finish();
rollback;
