begin;

select plan(43);

create temporary table expected_runtime_roles(
  role_name text primary key
) on commit drop;

insert into expected_runtime_roles(role_name) values
  ('cognitive_product_baseline_executor'),
  ('cognitive_sentinel_collector'),
  ('cognitive_product_quality_evaluator'),
  ('cognitive_product_quality_triage'),
  ('cognitive_public_research_broker'),
  ('cognitive_research_evaluator'),
  ('cognitive_model_router'),
  ('cognitive_livekit_experience_collector'),
  ('cognitive_github_draft_pr_broker'),
  ('cognitive_level01_scheduler');

create temporary table expected_runtime_grants(
  role_name text not null,
  schema_name text not null,
  function_name text not null,
  primary key(role_name, schema_name, function_name)
) on commit drop;

insert into expected_runtime_grants(role_name, schema_name, function_name) values
  ('cognitive_product_baseline_executor','cognitive_runtime','governance_claim_approved_action'),
  ('cognitive_product_baseline_executor','cognitive_runtime','governance_begin_approved_execution'),
  ('cognitive_product_baseline_executor','cognitive_runtime','governance_stage_product_experience_baseline_v1'),
  ('cognitive_product_baseline_executor','cognitive_runtime','governance_complete_approved_execution'),
  ('cognitive_product_baseline_executor','cognitive_runtime','governance_product_baseline_persist_completed_execution'),
  ('cognitive_product_baseline_executor','cognitive_runtime','governance_fail_approved_execution'),
  ('cognitive_sentinel_collector','cognitive_runtime','collect_sentinel_run'),
  ('cognitive_product_quality_evaluator','cognitive_runtime','product_quality_detection_assessment_hash'),
  ('cognitive_product_quality_evaluator','cognitive_runtime','product_quality_resolution_assessment_hash'),
  ('cognitive_product_quality_evaluator','cognitive_runtime','governance_evaluate_product_experience_baseline_v1'),
  ('cognitive_product_quality_evaluator','cognitive_runtime','product_quality_record_sentinel_evaluator_proof'),
  ('cognitive_product_quality_evaluator','cognitive_runtime','product_quality_evaluator_snapshot'),
  ('cognitive_product_quality_triage','cognitive_runtime','product_quality_triage_detection'),
  ('cognitive_product_quality_triage','cognitive_runtime','product_quality_triage_resolution'),
  ('cognitive_public_research_broker','cognitive_runtime','cognitive_record_public_research_source_v2'),
  ('cognitive_public_research_broker','cognitive_runtime','record_research_claim_with_readback'),
  ('cognitive_public_research_broker','cognitive_runtime','cognitive_record_public_research_contradiction_detection'),
  ('cognitive_public_research_broker','cognitive_runtime','cognitive_expire_public_research_maintenance'),
  ('cognitive_research_evaluator','cognitive_runtime','derive_research_evaluation_with_readback'),
  ('cognitive_research_evaluator','cognitive_runtime','cognitive_resolve_public_research_contradiction'),
  ('cognitive_research_evaluator','cognitive_runtime','research_evaluator_snapshot'),
  ('cognitive_model_router','cognitive_runtime','cognitive_model_router_recover_expired'),
  ('cognitive_model_router','cognitive_runtime','cognitive_model_router_reserve'),
  ('cognitive_model_router','cognitive_runtime','cognitive_model_router_settle_provider_overrun'),
  ('cognitive_model_router','cognitive_runtime','cognitive_model_router_settle'),
  ('cognitive_livekit_experience_collector','cognitive_runtime','collect_livekit_sentinel_run'),
  ('cognitive_github_draft_pr_broker','cognitive_runtime','cognitive_record_github_draft_pr_provider_readback'),
  ('cognitive_github_draft_pr_broker','cognitive_runtime','cognitive_consume_github_draft_pr_capability'),
  ('cognitive_github_draft_pr_broker','cognitive_runtime','cognitive_accept_github_draft_pr_tool_result'),
  ('cognitive_level01_scheduler','cognitive_runtime','scheduler_prerequisite_snapshot'),
  ('cognitive_level01_scheduler','cognitive_runtime','issue_recurring_child_task');

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_roles role_value
    join expected_runtime_roles expected
      on expected.role_name = role_value.rolname
  ),
  10,
  'all ten isolated runtime privilege roles exist'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_roles role_value
    join expected_runtime_roles expected
      on expected.role_name = role_value.rolname
    where role_value.rolcanlogin
       or role_value.rolsuper
       or role_value.rolcreatedb
       or role_value.rolcreaterole
       or role_value.rolinherit
       or role_value.rolreplication
       or role_value.rolbypassrls
  ),
  'runtime privilege roles are NOLOGIN, NOINHERIT, and have no elevated role attributes'
);

select ok(
  not exists (
    select 1
    from expected_runtime_roles expected
    where pg_catalog.pg_has_role(
      expected.role_name,
      'service_role',
      'member'
    )
  ),
  'no runtime role is a service_role member'
);

select ok(
  not exists (
    select 1
    from expected_runtime_roles left_role
    cross join expected_runtime_roles right_role
    where left_role.role_name <> right_role.role_name
      and pg_catalog.pg_has_role(
        left_role.role_name,
        right_role.role_name,
        'member'
      )
  ),
  'no runtime role can assume a sibling runtime role'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    join pg_catalog.pg_roles owner_role
      on owner_role.oid = relation.relowner
    join expected_runtime_roles expected
      on expected.role_name = owner_role.rolname
    where namespace.nspname in ('public', 'cognitive_runtime')
  ),
  'runtime roles own no application or runtime objects'
);

select ok(
  not exists (
    select 1
    from expected_runtime_roles expected
    cross join pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    cross join (values
      ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),
      ('REFERENCES'),('TRIGGER')
    ) privilege_value(privilege_name)
    where namespace.nspname = 'public'
      and relation.relkind in ('r','p','v','m','f')
      and pg_catalog.has_table_privilege(
        expected.role_name,
        relation.oid,
        privilege_value.privilege_name
      )
  ),
  'runtime roles have no effective direct application relation privileges'
);

select ok(
  not exists (
    select 1
    from expected_runtime_roles expected
    where pg_catalog.has_schema_privilege(
      expected.role_name,
      'cognitive_runtime',
      'CREATE'
    )
       or pg_catalog.has_schema_privilege(
         expected.role_name,
         'public',
         'CREATE'
       )
  ),
  'runtime roles cannot create objects in runtime or public schemas'
);

select ok(
  not exists (
    select 1
    from expected_runtime_roles expected
    where not pg_catalog.has_database_privilege(
      expected.role_name,
      current_database(),
      'CONNECT'
    )
       or not pg_catalog.has_schema_privilege(
         expected.role_name,
         'cognitive_runtime',
         'USAGE'
       )
  ),
  'runtime roles have only the required database connection and runtime schema access'
);

select ok(
  not pg_catalog.has_database_privilege(
    'public',
    current_database(),
    'TEMPORARY'
  )
  and not exists (
    select 1
    from expected_runtime_roles expected
    where pg_catalog.has_database_privilege(
            expected.role_name,
            current_database(),
            'TEMPORARY'
          )
       or pg_catalog.has_database_privilege(
            expected.role_name,
            current_database(),
            'CREATE'
          )
  )
  and pg_catalog.has_database_privilege(
    'authenticated',
    current_database(),
    'TEMPORARY'
  )
  and pg_catalog.has_database_privilege(
    'service_role',
    current_database(),
    'TEMPORARY'
  ),
  'runtime roles cannot create database or temporary objects while existing product roles retain prior access'
);

select ok(
  not exists (
    select 1
    from expected_runtime_roles expected
    where pg_catalog.has_schema_privilege(
      expected.role_name,
      'public',
      'USAGE'
    )
  ),
  'NOLOGIN runtime roles cannot resolve application-schema objects'
);

select ok(
  not cognitive_runtime.runtime_login_provisioning_ready(),
  'provider-owned pg_net PUBLIC access blocks password-bearing runtime logins'
);

select ok(
  pg_catalog.has_schema_privilege('anon', 'public', 'USAGE')
  and pg_catalog.has_schema_privilege('authenticated', 'public', 'USAGE')
  and pg_catalog.has_schema_privilege('service_role', 'public', 'USAGE'),
  'closing the PUBLIC fallback preserves existing Supabase role access'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_namespace namespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        namespace.nspacl,
        pg_catalog.acldefault('n', namespace.nspowner)
      )
    ) schema_acl
    where namespace.nspname = 'public'
      and schema_acl.grantee = 0
      and schema_acl.privilege_type = 'USAGE'
  ),
  'application schema has no PUBLIC usage fallback'
);

select ok(
  not exists (
    select 1
    from expected_runtime_roles expected
    join pg_catalog.pg_roles role_value
      on role_value.rolname = expected.role_name
    cross join pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        procedure.proacl,
        pg_catalog.acldefault('f', procedure.proowner)
      )
    ) function_acl
    where namespace.nspname in ('public', 'net')
      and function_acl.grantee = role_value.oid
      and function_acl.privilege_type = 'EXECUTE'
  ),
  'runtime roles receive no explicit public or pg_net function grants'
);

select ok(
  not exists (
    select 1
    from expected_runtime_roles expected
    join pg_catalog.pg_roles role_value
      on role_value.rolname = expected.role_name
    cross join pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace
      on namespace.oid = relation.relnamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        relation.relacl,
        pg_catalog.acldefault(
          case
            when relation.relkind = 'S' then 'S'::"char"
            else 'r'::"char"
          end,
          relation.relowner
        )
      )
    ) relation_acl
    where namespace.nspname = 'net'
      and relation_acl.grantee = role_value.oid
  ),
  'runtime roles receive no explicit pg_net relation grants'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_roles role_value
    join expected_runtime_roles expected
      on expected.role_name = role_value.rolname
    where not coalesce(
      role_value.rolconfig @> array[
        'search_path=cognitive_runtime, pg_catalog',
        'statement_timeout=15s',
        'idle_in_transaction_session_timeout=10s',
        'lock_timeout=3s'
      ],
      false
    )
  ),
  'runtime roles carry restricted search path and bounded transaction timeouts'
);

select ok(
  not exists (
    select 1
    from expected_runtime_grants expected
    where not exists (
      select 1
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_namespace namespace
        on namespace.oid = procedure.pronamespace
      where namespace.nspname = expected.schema_name
        and procedure.proname = expected.function_name
        and pg_catalog.has_function_privilege(
          expected.role_name,
          procedure.oid,
          'EXECUTE'
        )
    )
  ),
  'every principal can execute its exact reviewed operation set'
);

select is(
  (
    with runtime_roles as (
      select role_value.oid, role_value.rolname
      from pg_catalog.pg_roles role_value
      join expected_runtime_roles expected
        on expected.role_name = role_value.rolname
    ),
    explicit_grants as (
      select
        runtime_role.rolname,
        namespace.nspname,
        procedure.oid::regprocedure::text as signature
      from runtime_roles runtime_role
      cross join pg_catalog.pg_proc procedure
      join pg_catalog.pg_namespace namespace
        on namespace.oid = procedure.pronamespace
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) function_acl
      where function_acl.grantee = runtime_role.oid
        and function_acl.privilege_type = 'EXECUTE'
    )
    select encode(
      extensions.digest(
        convert_to(
          string_agg(
            rolname || '|' || nspname || '|' || signature,
            E'\n'
            order by rolname, nspname, signature
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
    from explicit_grants
  ),
  '6d8ce362090d90b485ccb27dd7ec2314e6fcb005ba05fd1291fb2f4fee62734e',
  'exact role-to-function-signature grant manifest is deterministic'
);

select ok(
  not exists (
    select 1
    from expected_runtime_roles expected
    join pg_catalog.pg_roles role_value
      on role_value.rolname = expected.role_name
    cross join pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        procedure.proacl,
        pg_catalog.acldefault('f', procedure.proowner)
      )
    ) function_acl
    where function_acl.grantee = role_value.oid
      and function_acl.privilege_type = 'EXECUTE'
      and namespace.nspname in ('public', 'cognitive_runtime')
      and procedure.proname not in (
        'runtime_role_preflight',
        'runtime_revocation_status'
      )
      and not exists (
        select 1
        from expected_runtime_grants allowed
        where allowed.role_name = expected.role_name
          and allowed.schema_name = namespace.nspname
          and allowed.function_name = procedure.proname
      )
  ),
  'no principal receives an explicit function grant outside its reviewed manifest'
);

select ok(
  not pg_catalog.has_function_privilege(
    'cognitive_sentinel_collector',
    'cognitive_runtime.collect_livekit_sentinel_run(uuid,uuid,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'cognitive_livekit_experience_collector',
    'cognitive_runtime.collect_sentinel_run(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)',
    'EXECUTE'
  ),
  'general and LiveKit sentinel collectors cannot call each other wrappers'
);

select ok(
  not pg_catalog.has_schema_privilege(
    'cognitive_level01_scheduler',
    'public',
    'USAGE'
  ),
  'scheduler cannot bypass its role-aware wrappers'
);

select ok(
  not pg_catalog.has_schema_privilege(
    'cognitive_sentinel_collector',
    'public',
    'USAGE'
  )
  and not pg_catalog.has_schema_privilege(
    'cognitive_livekit_experience_collector',
    'public',
    'USAGE'
  ),
  'collectors cannot bypass fixed principal and operation binding'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'cognitive_runtime'
      and (
        (
          procedure.proname = 'product_quality_record_sentinel_evaluator_proof'
          and pg_catalog.has_function_privilege(
            'cognitive_product_quality_triage',
            procedure.oid,
            'EXECUTE'
          )
        )
        or (
          procedure.proname in (
            'product_quality_triage_detection',
            'product_quality_triage_resolution'
          )
          and pg_catalog.has_function_privilege(
            'cognitive_product_quality_evaluator',
            procedure.oid,
            'EXECUTE'
          )
        )
      )
  ),
  'evaluator and triage mutation authorities remain separated'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'cognitive_runtime'
      and (
        (
          procedure.proname in (
            'cognitive_derive_public_research_evaluation',
            'cognitive_resolve_public_research_contradiction'
          )
          and pg_catalog.has_function_privilege(
            'cognitive_public_research_broker',
            procedure.oid,
            'EXECUTE'
          )
        )
        or (
          procedure.proname in (
            'cognitive_record_public_research_source_v2',
            'cognitive_record_public_research_claim_evidence',
            'cognitive_record_public_research_contradiction_detection',
            'cognitive_expire_public_research_maintenance'
          )
          and pg_catalog.has_function_privilege(
            'cognitive_research_evaluator',
            procedure.oid,
            'EXECUTE'
          )
        )
        or (
          procedure.proname = 'cognitive_record_public_research_claim_evidence'
          and pg_catalog.has_function_privilege(
            'cognitive_public_research_broker',
            procedure.oid,
            'EXECUTE'
          )
        )
        or (
          procedure.proname = 'cognitive_derive_public_research_evaluation'
          and pg_catalog.has_function_privilege(
            'cognitive_research_evaluator',
            procedure.oid,
            'EXECUTE'
          )
        )
      )
  ),
  'research broker and evaluator mutation authorities remain separated'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'cognitive_runtime'
      and (
        (
          procedure.proname in (
            'cognitive_consume_github_draft_pr_capability',
            'cognitive_accept_github_draft_pr_tool_result',
            'cognitive_record_github_draft_pr_provider_readback'
          )
          and pg_catalog.has_function_privilege(
            'cognitive_model_router',
            procedure.oid,
            'EXECUTE'
          )
        )
        or (
          procedure.proname in (
            'cognitive_model_router_recover_expired',
            'cognitive_model_router_reserve',
            'cognitive_model_router_settle'
          )
          and pg_catalog.has_function_privilege(
            'cognitive_github_draft_pr_broker',
            procedure.oid,
            'EXECUTE'
          )
        )
      )
  ),
  'model and GitHub broker database authorities remain separated'
);

select is(
  (
    select pg_catalog.array_agg(procedure.pronargs order by procedure.pronargs)
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'cognitive_runtime'
      and procedure.proname = 'cognitive_model_router_reserve'
      and pg_catalog.has_function_privilege(
        'cognitive_model_router',
        procedure.oid,
        'EXECUTE'
      )
  ),
  array[21]::smallint[],
  'model router can execute only the 21-argument credential-bound reserve overload'
);

select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'cognitive_runtime.runtime_role_preflight(text,text)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'cognitive_runtime.runtime_role_preflight(text,text)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'service_role',
    'cognitive_runtime.runtime_role_preflight(text,text)',
    'EXECUTE'
  ),
  'client and generic service roles cannot enter the isolated runtime boundary'
);

select ok(
  not pg_catalog.has_function_privilege(
    'service_role',
    'public.cognitive_model_router_record_provider_overrun(uuid,bigint,numeric,text,text,text,text,integer,text)',
    'EXECUTE'
  ),
  'generic service_role cannot record isolated model provider overruns'
);

select ok(
  pg_catalog.has_function_privilege(
    'cognitive_model_router',
    'cognitive_runtime.cognitive_model_router_settle_provider_overrun(uuid,bigint,numeric,text,text,text,text,integer,text,text)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'service_role',
    'cognitive_runtime.cognitive_model_router_settle_provider_overrun(uuid,bigint,numeric,text,text,text,text,integer,text,text)',
    'EXECUTE'
  )
  and strpos(
    pg_catalog.pg_get_functiondef(
      'cognitive_runtime.cognitive_model_router_settle_provider_overrun(uuid,bigint,numeric,text,text,text,text,integer,text,text)'::regprocedure
    ),
    'public.cognitive_model_router_record_provider_overrun'
  ) > 0
  and strpos(
    pg_catalog.pg_get_functiondef(
      'cognitive_runtime.cognitive_model_router_settle_provider_overrun(uuid,bigint,numeric,text,text,text,text,integer,text,text)'::regprocedure
    ),
    'public.cognitive_model_router_settle'
  ) > strpos(
    pg_catalog.pg_get_functiondef(
      'cognitive_runtime.cognitive_model_router_settle_provider_overrun(uuid,bigint,numeric,text,text,text,text,integer,text,text)'::regprocedure
    ),
    'public.cognitive_model_router_record_provider_overrun'
  ),
  'provider overrun evidence and conservative settlement share one isolated transaction'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'cognitive_runtime'
      and (
        pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE')
        or pg_catalog.has_function_privilege(
          'authenticated',
          procedure.oid,
          'EXECUTE'
        )
        or pg_catalog.has_function_privilege(
          'service_role',
          procedure.oid,
          'EXECUTE'
        )
        or exists (
          select 1
          from lateral pg_catalog.aclexplode(
            coalesce(
              procedure.proacl,
              pg_catalog.acldefault('f', procedure.proowner)
            )
          ) function_acl
          where function_acl.grantee = 0
            and function_acl.privilege_type = 'EXECUTE'
        )
      )
  ),
  'PUBLIC, anon, authenticated, and service_role cannot execute any isolated runtime entrypoint'
);

select ok(
  not pg_catalog.has_function_privilege(
    'cognitive_product_baseline_executor',
    'cognitive_runtime.product_quality_evaluator_snapshot(uuid,uuid)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'cognitive_product_quality_evaluator',
    'cognitive_runtime.research_evaluator_snapshot(uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  'bounded read snapshots are principal-specific'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'cognitive_runtime'
      and procedure.prosecdef
      and procedure.proconfig @> array['search_path=""']
  ),
  37,
  'all thirty-seven runtime boundary helpers and wrappers are security definer with an empty search path'
);

select ok(
  public.governance_service_identity_allows_operation(
    'cognitive_product_quality_evaluator',
    'independent_evaluation'
  )
  and not public.governance_service_identity_allows_operation(
    'cognitive_product_quality_evaluator',
    'product_quality_triage'
  )
  and (
    select count(*) = 2
    from pg_catalog.pg_constraint constraint_value
    where constraint_value.conname in (
      'product_experience_sentinel_evaluator__evaluator_identity_check',
      'governance_approved_execution_evaluato_evaluator_identity_check'
    )
      and pg_catalog.pg_get_constraintdef(
        constraint_value.oid
      ) like '%cognitive_product_quality_evaluator%'
  ),
  'product evaluator has a distinct assertion identity limited to independent evaluation'
);

select ok(
  cognitive_runtime.runtime_operation_allowed(
    'cognitive_sentinel_collector',
    'collect_sentinel_run'
  )
  and not cognitive_runtime.runtime_operation_allowed(
    'cognitive_sentinel_collector',
    'triage_detection'
  ),
  'operation allowlist rejects cross-principal operations'
);

select throws_ok(
  $$
    select cognitive_runtime.runtime_role_preflight(
      'cognitive_sentinel_collector',
      'triage_detection'
    )
  $$,
  '42501',
  'cognitive_runtime_operation_rejected',
  'preflight rejects an operation outside the principal allowlist'
);

select throws_ok(
  $$
    select cognitive_runtime.runtime_role_preflight(
      'cognitive_sentinel_collector',
      'collect_sentinel_run'
    )
  $$,
  '42501',
  'cognitive_runtime_principal_rejected',
  'preflight rejects a session without the expected role membership'
);

select throws_ok(
  $$
    select cognitive_runtime.runtime_revocation_status(
      'cognitive_sentinel_collector'
    )
  $$,
  '42501',
  'cognitive_runtime_principal_rejected',
  'revocation status fails closed when role membership is absent'
);

select ok(
  not exists (
    select 1
    from expected_runtime_roles expected
    join pg_catalog.pg_roles login_role
      on login_role.rolname = expected.role_name || '_login'
    where login_role.rolcanlogin
  ),
  'migration creates no password-bearing runtime login roles'
);

select ok(
  not pg_catalog.has_function_privilege(
    'cognitive_sentinel_collector',
    'cognitive_runtime.issue_recurring_child_task(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,text,text,text)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'cognitive_level01_scheduler',
    'cognitive_runtime.collect_sentinel_run(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)',
    'EXECUTE'
  ),
  'scheduler and sentinel wrapper privileges are mutually isolated'
);

select ok(
  not exists (
    select 1
    from expected_runtime_roles expected
    cross join pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'governance_execute_approved_switch'
      and pg_catalog.has_function_privilege(
        expected.role_name,
        procedure.oid,
        'EXECUTE'
      )
  ),
  'no isolated runtime role receives the generic switch execution authority'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'public.cognitive_model_router_record_provider_overrun(uuid,bigint,numeric,text,text,text,text,integer,text)'::regprocedure
  ) ~* 'for[[:space:]]+update'
  and pg_catalog.pg_get_functiondef(
    'public.cognitive_model_router_settle(uuid,text,bigint,numeric,text,text,text,text,text,text,text,integer,text)'::regprocedure
  ) ~* 'for[[:space:]]+update',
  'concurrent overrun and settlement paths serialize on the same preflight row'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger trigger_value
    where trigger_value.tgrelid =
      'public.cognitive_model_router_result_audits'::regclass
      and trigger_value.tgname =
        'cognitive_model_router_overrun_settlement_guard'
      and trigger_value.tgenabled <> 'D'
  )
  and lower(pg_catalog.pg_get_functiondef(
    'public.cognitive_model_router_enforce_overrun_settlement()'::regprocedure
  )) like '%new.result_status <> ''provider_rejected''%'
  and lower(pg_catalog.pg_get_functiondef(
    'public.cognitive_model_router_enforce_overrun_settlement()'::regprocedure
  )) like '%new.actual_model_tokens <> overrun_value.reserved_model_tokens%'
  and pg_catalog.pg_get_functiondef(
    'public.cognitive_model_router_enforce_overrun_settlement()'::regprocedure
  ) ~* 'new\.failure_reason_hash[[:space:]]+is[[:space:]]+distinct[[:space:]]+from[[:space:]]+overrun_value\.failure_reason_hash',
  'overrun settlement trigger rejects contradictory result evidence'
);

select ok(
  (
    select count(*) = 2
    from pg_catalog.pg_trigger trigger_value
    where trigger_value.tgname in (
      'cognitive_model_provider_overrun_recovery_guard',
      'cognitive_model_recovery_provider_overrun_guard'
    )
      and trigger_value.tgenabled <> 'D'
  )
  and pg_catalog.pg_get_functiondef(
    'public.cognitive_model_router_enforce_overrun_recovery_exclusion()'::regprocedure
  ) ~* 'for[[:space:]]+update'
  and pg_catalog.pg_get_functiondef(
    'public.cognitive_model_router_enforce_overrun_recovery_exclusion()'::regprocedure
  ) like '%model_router_overrun_recovery_rejected%',
  'overrun and recovery evidence are mutually exclusive under one preflight lock'
);

select * from finish();
rollback;
