begin;

select plan(43);

select has_table(
  'cognitive_runtime',
  'net_acl_provider_attestations',
  'provider ACL verification has immutable sanitized evidence'
);

select has_table(
  'cognitive_runtime',
  'research_provider_plan_attestations',
  'provider plan and backup verification has immutable sanitized evidence'
);

select is(
  (
    select count(*)::integer
    from cognitive_runtime.net_acl_provider_attestations
    where attestation_version = 1
      and ticket_id = 'SU-431426'
      and project_ref = 'bmkkhihfbmsnnmcqkoly'
      and schema_owner = 'supabase_admin'
      and extension_owner = 'supabase_admin'
      and extension_version = '0.19.5'
      and postgres_version_num = 170006
      and public_usage_denied
      and required_role_grants_present
      and cognitive_principals_denied
      and trusted_function_regression_passed
      and not automatic_acl_repair_attempted
  ),
  1,
  'SU-431426 attestation records the exact sanitized provider readback'
);

select is(
  (
    select count(*)::integer
    from cognitive_runtime.research_provider_plan_attestations
    where attestation_version = 1
      and provider = 'supabase'
      and provider_plan = 'pro'
      and backup_state = 'provider_daily_backups_available'
      and backup_window_days = 7
      and restore_available
      and not point_in_time_recovery
      and walg_enabled
      and observed_backup_count = 8
      and restored_data_requires_tombstone_replay
      and not research_activated
      and not user_derived_memory_enabled
  ),
  1,
  'effective retention truth is Pro with seven-day restorable daily backups'
);

select ok(
  not has_table_privilege(
    'anon',
    'cognitive_runtime.net_acl_provider_attestations',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'authenticated',
    'cognitive_runtime.net_acl_provider_attestations',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'service_role',
    'cognitive_runtime.net_acl_provider_attestations',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'provider ACL evidence is unavailable to clients and service credentials'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_trigger trigger_value
    where trigger_value.tgrelid =
      'cognitive_runtime.net_acl_provider_attestations'::regclass
      and trigger_value.tgname =
        'net_acl_provider_attestations_immutable'
      and not trigger_value.tgisinternal
  ),
  1,
  'provider ACL evidence has an immutable trigger'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_trigger trigger_value
    where trigger_value.tgrelid =
      'cognitive_runtime.research_provider_plan_attestations'::regclass
      and trigger_value.tgname =
        'research_provider_plan_attestations_immutable'
      and not trigger_value.tgisinternal
  ),
  1,
  'provider plan evidence has an immutable trigger'
);

select has_function(
  'cognitive_runtime',
  'net_acl_guard_snapshot',
  array[]::text[],
  'read-only ACL guard snapshot exists'
);

select has_function(
  'cognitive_runtime',
  'net_acl_guard_passes',
  array[]::text[],
  'fail-closed ACL guard predicate exists'
);

select has_function(
  'public',
  'cognitive_record_net_acl_guard_readback',
  array[]::text[],
  'existing security readback path can record sanitized guard evidence'
);

select ok(
  pg_get_functiondef(
    'cognitive_runtime.runtime_login_provisioning_ready()'::regprocedure
  ) like '%cognitive_runtime.net_acl_guard_passes()%',
  'runtime login provisioning requires the permanent ACL guard'
);

select ok(
  pg_get_functiondef(
    'cognitive_runtime.assert_runtime_invoker(text,text)'::regprocedure
  ) like '%cognitive_net_acl_guard_blocked%'
  and pg_get_functiondef(
    'cognitive_runtime.assert_runtime_invoker(text,text)'::regprocedure
  ) like '%cognitive_runtime.net_acl_guard_passes()%',
  'every isolated runtime invocation rechecks the permanent ACL guard'
);

select ok(
  pg_get_functiondef(
    'cognitive_runtime.net_acl_guard_snapshot()'::regprocedure
  ) not like '%grant usage on schema net%'
  and pg_get_functiondef(
    'cognitive_runtime.net_acl_guard_snapshot()'::regprocedure
  ) not like '%revoke usage on schema net%'
  and pg_get_functiondef(
    'cognitive_runtime.net_acl_guard_snapshot()'::regprocedure
  ) not like '%alter schema net%',
  'ACL snapshot contains no repair or provider ACL mutation'
);

select ok(
  pg_get_functiondef(
    'public.cognitive_record_net_acl_guard_readback()'::regprocedure
  ) not like '%grant usage on schema net%'
  and pg_get_functiondef(
    'public.cognitive_record_net_acl_guard_readback()'::regprocedure
  ) not like '%revoke usage on schema net%'
  and pg_get_functiondef(
    'public.cognitive_record_net_acl_guard_readback()'::regprocedure
  ) not like '%alter schema net%',
  'security evidence recorder contains no repair or provider ACL mutation'
);

select ok(
  pg_get_functiondef(
    'public.cognitive_record_net_acl_guard_readback()'::regprocedure
  ) like '%pg_advisory_xact_lock%'
  and pg_get_functiondef(
    'public.cognitive_record_net_acl_guard_readback()'::regprocedure
  ) like '%hashtextextended%'
  and pg_get_functiondef(
    'public.cognitive_record_net_acl_guard_readback()'::regprocedure
  ) like '%observed_hash%',
  'matching ACL observations serialize before deduplicated alert routing'
);

select is(
  cognitive_runtime.net_acl_guard_snapshot()->>'guard_status',
  'FAIL',
  'local provider-default PUBLIC access is detected fail closed'
);

select ok(
  (cognitive_runtime.net_acl_guard_snapshot()
    ->>'public_usage_denied')::boolean is false,
  'PUBLIC net usage is reported as the local mismatch'
);

create temporary table acl_guard_test_counts on commit drop as
select
  (select count(*) from public.autonomous_provider_readback_capabilities)
    as provider_count,
  (select count(*) from public.security_operator_events)
    as event_count,
  (select count(*) from public.security_required_review_flags)
    as review_count,
  (select count(*) from public.owner_command_requests)
    as command_count,
  (select count(*) from public.owner_command_blockers)
    as blocker_count;

create temporary table acl_guard_test_result on commit drop as
select public.cognitive_record_net_acl_guard_readback() as value;

select is(
  (select value->>'guard_status' from acl_guard_test_result),
  'FAIL',
  'security readback preserves the fail-closed status'
);

select ok(
  (select (value->>'evidence_recorded')::boolean
   from acl_guard_test_result)
  and (select (value->>'owner_command_routed')::boolean
       from acl_guard_test_result)
  and not (select (value->>'automatic_repair_attempted')::boolean
           from acl_guard_test_result),
  'mismatch records evidence, routes Owner Command, and never repairs'
);

select is(
  (
    select count(*) - (select provider_count from acl_guard_test_counts)
    from public.autonomous_provider_readback_capabilities
  )::integer,
  1,
  'ACL guard appends one provider-readback observation'
);

select is(
  (
    select count(*) - (select event_count from acl_guard_test_counts)
    from public.security_operator_events
  )::integer,
  1,
  'ACL guard appends one Security Owner audit event'
);

select is(
  (
    select count(*) - (select review_count from acl_guard_test_counts)
    from public.security_required_review_flags
  )::integer,
  1,
  'ACL mismatch opens one deduplicated security review flag'
);

select is(
  (
    select count(*) - (select command_count from acl_guard_test_counts)
    from public.owner_command_requests
  )::integer,
  1,
  'ACL mismatch routes one provider-administration Owner Command'
);

select is(
  (
    select count(*) - (select blocker_count from acl_guard_test_counts)
    from public.owner_command_blockers
  )::integer,
  1,
  'Owner Command records the isolated-execution blocker'
);

select ok(
  exists (
    select 1
    from public.owner_command_requests request
    where request.metadata->>'request_source' =
        'cognitive_net_acl_guard'
      and request.status = 'approval_required'
      and request.target_systems =
        array['security_owner_operator']::text[]
      and request.forbidden_scope @>
        '["automatic ACL repair","database ACL mutation"]'::jsonb
  ),
  'Owner Command is provider-administration only and forbids ACL repair'
);

select ok(
  pg_get_functiondef(
    'public.governance_research_retention_activation_hash(text,text,text,text,text)'
      ::regprocedure
  ) like '%provider_project_backups_absent%'
  and pg_get_functiondef(
    'public.governance_research_retention_activation_hash(text,text,text,text,text)'
      ::regprocedure
  ) like '%free%',
  'historical v1 Free attestation hash remains immutable history'
);

select ok(
  pg_get_functiondef(
    'public.governance_research_retention_activation_hash(text,text,text,text,text,timestamptz,timestamptz)'
      ::regprocedure
  ) like '%chillywood-research-retention-processor-v2%'
  and pg_get_functiondef(
    'public.governance_research_retention_activation_hash(text,text,text,text,text,timestamptz,timestamptz)'
      ::regprocedure
  ) like '%provider_project_backups_absent%'
  and pg_get_functiondef(
    'public.governance_research_retention_activation_hash(text,text,text,text,text,timestamptz,timestamptz)'
      ::regprocedure
  ) like '%free%',
  'historical timestamp-bound v2 Free hash remains deterministic'
);

select ok(
  pg_get_functiondef(
    'public.governance_research_retention_activation_hash_v3(text,text,text,text,text,timestamptz,timestamptz)'
      ::regprocedure
  ) like '%chillywood-research-retention-processor-v3%'
  and pg_get_functiondef(
    'public.governance_research_retention_activation_hash_v3(text,text,text,text,text,timestamptz,timestamptz)'
      ::regprocedure
  ) like '%provider_daily_backups_available%'
  and pg_get_functiondef(
    'public.governance_research_retention_activation_hash_v3(text,text,text,text,text,timestamptz,timestamptz)'
      ::regprocedure
  ) like '%pro%'
  and pg_get_functiondef(
    'public.governance_research_retention_activation_hash_v3(text,text,text,text,text,timestamptz,timestamptz)'
      ::regprocedure
  ) not like '%provider_project_backups_absent%',
  'effective timestamp-bound v3 hash uses only current Pro truth'
);

select is(
  public.governance_research_retention_activation_hash(
    repeat('1',40),repeat('2',64),repeat('3',64),repeat('4',64),
    repeat('5',64),
    '2026-07-27 00:00:00+00'::timestamptz,
    '2026-07-28 00:00:00+00'::timestamptz
  ),
  'f9a0da9e7c6ba5d347ffd41fb7b10b19b7c1056033ba13e653f4635f02aa268e',
  'historical timestamp-bound v2 Free digest is byte-exact'
);

select is(
  public.governance_research_retention_activation_hash_v3(
    repeat('1',40),repeat('2',64),repeat('3',64),repeat('4',64),
    repeat('5',64),
    '2026-07-27 00:00:00+00'::timestamptz,
    '2026-07-28 00:00:00+00'::timestamptz
  ),
  'f8c5b0ad0282aefca8b5ba64571679745d66f1351597d5edf13d16de91995f5e',
  'current timestamp-bound v3 Pro digest is byte-exact'
);

select ok(
  pg_get_functiondef(
    'public.governance_persist_research_retention_activation(uuid,text,text,text,text,timestamptz,text,timestamptz,text,text)'
      ::regprocedure
  ) like '%governance_research_retention_activation_hash_v3(%'
  and pg_get_functiondef(
    'public.governance_persist_research_retention_activation(uuid,text,text,text,text,timestamptz,text,timestamptz,text,text)'
      ::regprocedure
  ) not like '%governance_research_retention_activation_hash(%'
  and pg_get_functiondef(
    'public.governance_persist_research_retention_activation(uuid,text,text,text,text,timestamptz,text,timestamptz,text,text)'
      ::regprocedure
  ) like '%provider_daily_backups_available%'
  and pg_get_functiondef(
    'public.governance_persist_research_retention_activation(uuid,text,text,text,text,timestamptz,text,timestamptz,text,text)'
      ::regprocedure
  ) not like '%''supabase'',''free''%',
  'new processor persistence writes only the Pro provider tuple'
);

select ok(
  pg_get_functiondef(
    'public.cognitive_run_attested_research_retention_maintenance(uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment,timestamptz,integer,text)'
      ::regprocedure
  ) like '%backup_value.provider_plan <> ''pro''%'
  and pg_get_functiondef(
    'public.cognitive_run_attested_research_retention_maintenance(uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment,timestamptz,integer,text)'
      ::regprocedure
  ) like '%provider_daily_backups_available%'
  and pg_get_functiondef(
    'public.cognitive_run_attested_research_retention_maintenance(uuid,uuid,uuid,public.cognitive_platform,public.cognitive_environment,timestamptz,integer,text)'
      ::regprocedure
  ) like '%backup_window_days <> 7%',
  'retention maintenance rejects any non-Pro or non-seven-day tuple'
);

select ok(
  pg_get_functiondef(
    'public.cognitive_research_retention_processor_ready(uuid,uuid,public.cognitive_platform,public.cognitive_environment)'
      ::regprocedure
  ) like '%backup.provider_plan = ''pro''%'
  and pg_get_functiondef(
    'public.cognitive_research_retention_processor_ready(uuid,uuid,public.cognitive_platform,public.cognitive_environment)'
      ::regprocedure
  ) like '%provider_daily_backups_available%'
  and pg_get_functiondef(
    'public.cognitive_research_retention_processor_ready(uuid,uuid,public.cognitive_platform,public.cognitive_environment)'
      ::regprocedure
  ) like '%backup.restore_available%',
  'research readiness requires the exact current Pro backup tuple'
);

select ok(
  (
    select pg_get_constraintdef(constraint_value.oid)
    from pg_catalog.pg_constraint constraint_value
    where constraint_value.conrelid =
      'public.cognitive_research_backup_retention_attestations'::regclass
      and constraint_value.conname =
        'cognitive_research_backup_retention_provider_tuple_check'
  ) like '%provider_plan = ''free''%'
  and (
    select pg_get_constraintdef(constraint_value.oid)
    from pg_catalog.pg_constraint constraint_value
    where constraint_value.conrelid =
      'public.cognitive_research_backup_retention_attestations'::regclass
      and constraint_value.conname =
        'cognitive_research_backup_retention_provider_tuple_check'
  ) like '%provider_plan = ''pro''%',
  'table constraint preserves historical Free rows and admits exact Pro rows'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.cognitive_record_net_acl_guard_readback()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.cognitive_record_net_acl_guard_readback()',
    'EXECUTE'
  ),
  'ordinary clients cannot record or route ACL guard evidence'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.cognitive_record_net_acl_guard_readback()',
    'EXECUTE'
  ),
  'existing Security Owner service path can record ACL guard evidence'
);

select ok(
  not has_table_privilege(
    'anon',
    'cognitive_runtime.research_provider_plan_attestations',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'authenticated',
    'cognitive_runtime.research_provider_plan_attestations',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'service_role',
    'cognitive_runtime.research_provider_plan_attestations',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'provider plan evidence is unavailable to clients and service credentials'
);

select ok(
  not exists (
    select 1
    from public.cognitive_governance_switches switch
    where switch.switch_key = 'cognitive_user_derived_memory_enabled'
      and switch.enabled
  ),
  'user-derived memory remains off'
);

select ok(
  not exists (
    select 1
    from public.cognitive_governance_switches switch
    where switch.switch_key like '%level2%'
      and switch.enabled
  ),
  'Cognitive Level 2 remains off'
);

select ok(
  not exists (
    select 1
    from public.cognitive_governance_switches switch
    where switch.switch_key = 'cognitive_research_enabled'
      and switch.enabled
  ),
  'retention correction does not activate research'
);

select is(
  (
    select normalized_acl_sha256
    from cognitive_runtime.net_acl_provider_attestations
    where attestation_version = 1
  ),
  '864674950bb9fa2a3ab0528f7a8b46cdaa2455f910181602238adbaa2563d4c9',
  'attestation pins the independently normalized provider ACL hash'
);

select ok(
  (
    with observed_versions as (
      select
        current_setting('server_version_num')::integer
          as postgres_version_num,
        (
          select extension.extversion
          from pg_catalog.pg_extension extension
          where extension.extname = 'pg_net'
        ) as extension_version
    ),
    guard_snapshot as (
      select cognitive_runtime.net_acl_guard_snapshot() as value
    )
    select
      (guard_snapshot.value->>'postgres_version_match')::boolean =
        (observed_versions.postgres_version_num = 170006)
      and
      (guard_snapshot.value->>'extension_version_match')::boolean =
        (observed_versions.extension_version = '0.19.5')
      and (
        observed_versions.postgres_version_num = 170006
        or guard_snapshot.value->'finding_codes'
          ? 'POSTGRES_VERSION_REVALIDATION_REQUIRED'
      )
      and (
        observed_versions.extension_version = '0.19.5'
        or guard_snapshot.value->'finding_codes'
          ? 'PG_NET_VERSION_REVALIDATION_REQUIRED'
      )
    from observed_versions
    cross join guard_snapshot
  ),
  'Postgres and pg_net upgrades are detected and require revalidation'
);

select ok(
  (
    select public_usage_denied
      and required_role_grants_present
      and cognitive_principals_denied
      and trusted_function_regression_passed
    from cognitive_runtime.net_acl_provider_attestations
    where attestation_version = 1
  ),
  'provider attestation binds every Phase 1 acceptance gate'
);

select * from finish();
rollback;
