begin;
select no_plan();

select ok(
  to_regprocedure(
    'public.product_experience_livekit_derived_failure_category(public.cognitive_platform,text,jsonb)'
  ) is not null,
  'the exact LiveKit derived-category signature remains present'
);

select is(
  (
    select procedure.provolatile
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname =
        'product_experience_livekit_derived_failure_category'
  ),
  's',
  'the table-reading LiveKit derived-category function is STABLE'
);

select ok(
  (
    select
      pg_catalog.pg_get_functiondef(procedure.oid) like
        '%product_experience_livekit_bounded_failure_fixture_is_valid%'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%product_experience_detailed_metric_manifest_is_valid%'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%remote_subscription_failure%'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%deadline_exceeded%'
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname =
        'product_experience_livekit_derived_failure_category'
  ),
  'the STABLE function preserves deterministic category behavior'
);

create temporary table expected_runtime_operations(
  principal text not null,
  operation text not null,
  primary key(principal,operation)
) on commit drop;

insert into expected_runtime_operations(principal,operation) values
  ('cognitive_product_baseline_executor','claim_approved_action'),
  ('cognitive_product_baseline_executor','begin_approved_execution'),
  ('cognitive_product_baseline_executor','stage_product_baseline'),
  ('cognitive_product_baseline_executor','complete_approved_execution'),
  ('cognitive_product_baseline_executor','persist_product_baseline'),
  ('cognitive_product_baseline_executor','fail_approved_execution'),
  ('cognitive_sentinel_collector','collect_sentinel_run'),
  ('cognitive_product_quality_evaluator','read_active_baseline'),
  ('cognitive_product_quality_evaluator','compute_detection_hash'),
  ('cognitive_product_quality_evaluator','compute_no_finding_hash'),
  ('cognitive_product_quality_evaluator','compute_resolution_hash'),
  ('cognitive_product_quality_evaluator','evaluate_product_baseline'),
  ('cognitive_product_quality_evaluator','record_sentinel_evaluator_proof'),
  ('cognitive_product_quality_evaluator','read_product_quality_snapshot'),
  ('cognitive_product_quality_evaluator','attest_livekit_bounded_failure_no_finding'),
  ('cognitive_product_quality_triage','triage_detection'),
  ('cognitive_product_quality_triage','triage_no_finding'),
  ('cognitive_product_quality_triage','triage_resolution'),
  ('cognitive_public_research_broker','record_research_source'),
  ('cognitive_public_research_broker','record_research_claim'),
  ('cognitive_public_research_broker','detect_research_contradiction'),
  ('cognitive_public_research_broker','expire_research'),
  ('cognitive_research_evaluator','derive_research_evaluation'),
  ('cognitive_research_evaluator','resolve_research_contradiction'),
  ('cognitive_research_evaluator','read_research_snapshot'),
  ('cognitive_model_router','recover_model_reservation'),
  ('cognitive_model_router','reserve_model_invocation'),
  ('cognitive_model_router','record_model_provider_overrun'),
  ('cognitive_model_router','settle_model_invocation'),
  ('cognitive_livekit_experience_collector','collect_livekit_sentinel_run'),
  ('cognitive_livekit_experience_collector','issue_livekit_failure_fixture'),
  ('cognitive_livekit_experience_collector','consume_livekit_failure_fixture'),
  ('cognitive_github_draft_pr_broker','record_github_provider_readback'),
  ('cognitive_github_draft_pr_broker','consume_github_capability'),
  ('cognitive_github_draft_pr_broker','accept_github_tool_result'),
  ('cognitive_level01_scheduler','read_scheduler_status'),
  ('cognitive_level01_scheduler','issue_recurring_child_task');

select is(
  (select count(*)::integer from expected_runtime_operations),
  37,
  'the complete effective runtime operation inventory is explicit'
);

select ok(
  (
    select bool_and(
      cognitive_runtime.runtime_operation_allowed(principal,operation)
    )
    from expected_runtime_operations
  ),
  'every inherited runtime operation remains allowed'
);

select ok(
  cognitive_runtime.runtime_operation_allowed(
    'cognitive_product_quality_evaluator',
    'attest_livekit_bounded_failure_no_finding'
  )
  and not cognitive_runtime.runtime_operation_allowed(
    'cognitive_product_quality_triage',
    'attest_livekit_bounded_failure_no_finding'
  )
  and not cognitive_runtime.runtime_operation_allowed(
    'cognitive_livekit_experience_collector',
    'attest_livekit_bounded_failure_no_finding'
  )
  and not cognitive_runtime.runtime_operation_allowed(
    'cognitive_research_evaluator',
    'attest_livekit_bounded_failure_no_finding'
  ),
  'only the product evaluator receives the LiveKit attestation operation'
);

select ok(
  pg_catalog.has_function_privilege(
    'cognitive_product_quality_evaluator',
    'cognitive_runtime.product_quality_attest_livekit_bounded_failure_no_finding(uuid,text,text,text,text)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'public',
    'cognitive_runtime.product_quality_attest_livekit_bounded_failure_no_finding(uuid,text,text,text,text)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'cognitive_runtime.product_quality_attest_livekit_bounded_failure_no_finding(uuid,text,text,text,text)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'cognitive_runtime.product_quality_attest_livekit_bounded_failure_no_finding(uuid,text,text,text,text)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'service_role',
    'cognitive_runtime.product_quality_attest_livekit_bounded_failure_no_finding(uuid,text,text,text,text)',
    'EXECUTE'
  ),
  'the wrapper grant is exact and excludes client and generic service roles'
);

select ok(
  not pg_catalog.has_table_privilege(
    'cognitive_product_quality_evaluator',
    'public.product_experience_livekit_no_finding_attestations',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  ),
  'the evaluator has no direct access to attestation persistence'
);

select ok(
  (
    select
      procedure.prosecdef
      and procedure.proconfig @> array['search_path=""']
      and pg_catalog.pg_get_function_arguments(procedure.oid) not like
        '%verdict%'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%assert_runtime_invoker(%'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%governance_assert_two_party_service_principal(%'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%product_experience_livekit_derived_failure_category(%'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%livekit_bounded_failure_no_finding_attestation_replay_rejected%'
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'cognitive_runtime'
      and procedure.proname =
        'product_quality_attest_livekit_bounded_failure_no_finding'
  ),
  'the wrapper independently derives, two-party validates, and replay-protects the attestation'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_roles role_value
    where role_value.rolname like 'cognitive_%'
      and pg_catalog.has_function_privilege(
        role_value.rolname,
        'cognitive_runtime.product_quality_attest_livekit_bounded_failure_no_finding(uuid,text,text,text,text)',
        'EXECUTE'
      )
  ),
  1,
  'exactly one cognitive principal role can execute the wrapper'
);

select * from finish();
rollback;
