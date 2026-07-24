begin;
select no_plan();

select ok(
  has_function_privilege(
    'service_role',
    'public.cognitive_consume_capability(text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,public.cognitive_environment,text,text,text,uuid,bigint,numeric,text,text,text)',
    'EXECUTE'
  ),
  'service role retains the generic non-GitHub capability entry point'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.cognitive_consume_non_github_capability_internal(text,text,text,text,uuid,uuid,text,text,public.cognitive_platform,public.cognitive_environment,text,text,text,uuid,bigint,numeric,text,text,text)',
    'EXECUTE'
  ),
  'service role cannot bypass the generic GitHub rejection through the internal implementation'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.cognitive_accept_trusted_tool_result(text,text,text,text,jsonb,text,text,text,text,text)',
    'EXECUTE'
  ),
  'service role retains the generic non-GitHub postflight entry point'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.cognitive_accept_non_github_tool_result_internal(text,text,text,text,jsonb,text,text,text,text,text)',
    'EXECUTE'
  ),
  'service role cannot bypass dedicated GitHub postflight through the internal implementation'
);

set local role service_role;
select throws_ok(
  $$select public.cognitive_consume_capability(
    'missing-capability','bounded-bearer','bounded-nonce','bounded-call',
    gen_random_uuid(),gen_random_uuid(),
    'Chillywood2025/chillywood-mobile','codex/cognitive-canary/test',
    'shared','production','github','github_open_draft_pr',
    'docs/intelligence/canaries/test.md',gen_random_uuid(),1,0,
    repeat('1',64),repeat('2',64),repeat('3',64)
  )$$,
  '42501',
  'github_draft_pr_dedicated_broker_required',
  'generic GitHub open-draft-PR consumption fails before generic capability processing'
);

select throws_ok(
  $$select public.cognitive_consume_capability(
    'missing-capability','bounded-bearer','bounded-nonce','bounded-call',
    gen_random_uuid(),gen_random_uuid(),
    'Chillywood2025/chillywood-mobile','codex/cognitive-canary/test',
    'shared','production','github','github_update_draft_pr_body',
    'docs/intelligence/canaries/test.md',gen_random_uuid(),1,0,
    repeat('1',64),repeat('2',64),repeat('3',64)
  )$$,
  '42501',
  'github_draft_pr_dedicated_broker_required',
  'generic GitHub draft-PR update consumption also fails closed'
);

select throws_ok(
  $$select public.cognitive_consume_capability(
    'missing-capability','bounded-bearer','bounded-nonce','bounded-call',
    gen_random_uuid(),gen_random_uuid(),
    'Chillywood2025/chillywood-mobile','codex/cognitive-canary/test',
    'shared','production','repository','repository_read_file',
    'docs/intelligence/canaries/test.md',gen_random_uuid(),1,0,
    repeat('1',64),repeat('2',64),repeat('3',64)
  )$$,
  '42501',
  'cognitive_service_actor_mismatch',
  'unrelated generic operations delegate to the inherited authority implementation'
);
reset role;

select is(
  (
    select provolatile::text
    from pg_proc
    where oid=(
      'public.cognitive_public_research_runtime_ready(uuid,uuid,public.cognitive_platform,public.cognitive_environment)'
    )::regprocedure
  ),
  'v',
  'public research liveness is volatile because it acquires governance locks'
);

select ok(
  lower(pg_get_functiondef((
    'public.cognitive_public_research_runtime_ready(uuid,uuid,public.cognitive_platform,public.cognitive_environment)'
  )::regprocedure)) like '%for share%'
  and pg_get_functiondef((
    'public.cognitive_public_research_runtime_ready(uuid,uuid,public.cognitive_platform,public.cognitive_environment)'
  )::regprocedure) like '%cognitive_user_derived_memory_enabled%',
  'research writes lock task, emergency, switches, and the non-user-derived policy boundary'
);

select ok(
  pg_get_functiondef((
    'public.cognitive_level01_schedule_prerequisites_pass(uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment)'
  )::regprocedure) like '%documentation_draft_pr%'
  and pg_get_functiondef((
    'public.cognitive_level01_schedule_prerequisites_pass(uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment)'
  )::regprocedure) like '%test_only_draft_pr%'
  and pg_get_functiondef((
    'public.cognitive_level01_schedule_prerequisites_pass(uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment)'
  )::regprocedure) like '%low_risk_source_draft_pr%',
  'weekly outcome prerequisites require the exact three governed draft-PR canary keys'
);

select ok(
  not has_function_privilege(
    'service_role',
    'public.cognitive_level01_schedule_prerequisites_base(uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment)',
    'EXECUTE'
  ),
  'service role cannot bypass the exact draft-canary prerequisite wrapper'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid='public.cognitive_level01_scheduled_task_issuances'::regclass
      and tgname=
        'cognitive_level01_scheduled_task_issuances_locked_prerequisites'
      and not tgisinternal
  ),
  'scheduled issuance has a final locked prerequisite trigger'
);

select ok(
  pg_get_functiondef((
    'public.cognitive_level01_lock_issuance_prerequisites()'
  )::regprocedure) like '%pg_advisory_xact_lock%'
  and pg_get_functiondef((
    'public.cognitive_level01_lock_issuance_prerequisites()'
  )::regprocedure) like '%cognitive_user_derived_memory_enabled%'
  and pg_get_functiondef((
    'public.cognitive_level01_lock_issuance_prerequisites()'
  )::regprocedure) like '%cognitive_level2_production_repairs_enabled%',
  'schedule occurrence and permanently disabled Level 2/private-memory rows are locked'
);

select ok(
  pg_get_functiondef((
    'public.cognitive_level01_lock_issuance_prerequisites()'
  )::regprocedure) like '%cognitive_installed_journey_sentinel_enabled%'
  and pg_get_functiondef((
    'public.cognitive_level01_lock_issuance_prerequisites()'
  )::regprocedure) like '%cognitive_visual_experience_sentinel_enabled%'
  and pg_get_functiondef((
    'public.cognitive_level01_lock_issuance_prerequisites()'
  )::regprocedure) like '%cognitive_collective_deliberation_enabled%'
  and pg_get_functiondef((
    'public.cognitive_level01_lock_issuance_prerequisites()'
  )::regprocedure) like '%cognitive_draft_pr_executor_enabled%',
  'schedule-specific visual, journey, collective, and draft switches are included'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid='public.product_experience_sentinel_runs'::regclass
      and tgname='product_experience_sentinel_runs_exact_switch_live'
      and not tgisinternal
  ),
  'persisted sentinel runs lock the exact sentinel enable switch'
);

select ok(
  pg_get_functiondef((
    'public.product_experience_lock_exact_sentinel_switch()'
  )::regprocedure) like '%cognitive_livekit_experience_sentinel_enabled%'
  and pg_get_functiondef((
    'public.product_experience_lock_exact_sentinel_switch()'
  )::regprocedure) like '%cognitive_visual_experience_sentinel_enabled%'
  and pg_get_functiondef((
    'public.product_experience_lock_exact_sentinel_switch()'
  )::regprocedure) like '%cognitive_installed_journey_sentinel_enabled%'
  and lower(pg_get_functiondef((
    'public.product_experience_lock_exact_sentinel_switch()'
  )::regprocedure)) like '%for share%',
  'all three sentinel switch mappings are exact and row-locked'
);

select * from finish();
rollback;
