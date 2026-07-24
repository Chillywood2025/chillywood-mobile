-- Isolated database boundary for Cognitive Level 0/1 private runtimes.
--
-- This migration intentionally creates NOLOGIN privilege roles only.  Runtime
-- LOGIN roles and their independent passwords are provisioned out of band after
-- migration review.  No password, provider credential, or service-role
-- membership is stored here.

create schema if not exists cognitive_runtime;
revoke all on schema cognitive_runtime from public;

-- PostgreSQL has no per-role DENY: a privilege inherited from the special
-- PUBLIC grantee cannot be revoked from one runtime role. Preserve the exact
-- effective schema access of every role that already exists, then remove the
-- PUBLIC fallback before creating any isolated runtime role. Existing Supabase
-- roles therefore retain their prior application-schema access while future
-- isolated logins receive none. The provider-owned pg_net schema is checked
-- separately by runtime_login_provisioning_ready(); the migration role cannot
-- truthfully revoke grants made by supabase_admin.
do $close_public_schema_fallback$
declare
  schema_name text;
  existing_role record;
begin
  foreach schema_name in array array['public']
  loop
    if not exists (
      select 1
      from pg_catalog.pg_namespace namespace
      where namespace.nspname = schema_name
    ) then
      continue;
    end if;

    for existing_role in
      select role.rolname
      from pg_catalog.pg_roles role
      where pg_catalog.has_schema_privilege(
        role.oid,
        schema_name,
        'USAGE'
      )
      order by role.rolname
    loop
      execute format(
        'grant usage on schema %I to %I',
        schema_name,
        existing_role.rolname
      );
    end loop;

    execute format('revoke usage on schema %I from public', schema_name);
  end loop;
end;
$close_public_schema_fallback$;

-- The product-quality evaluator is a distinct runtime principal and must not
-- receive the existing v1 independent-evaluator assertion. Extend only the
-- reviewed independent-evaluation operation to a new assertion identity while
-- preserving the original evaluator path.
alter table public.governance_two_party_service_assertions
  drop constraint governance_two_party_service_assertions_service_identity_check;
alter table public.governance_two_party_service_assertions
  add constraint governance_two_party_service_assertions_service_identity_check
  check (
    service_identity = any(array[
      'cognitive_approved_action_worker',
      'product_experience_baseline_service',
      'livekit_experience_sentinel',
      'visual_product_experience_sentinel',
      'installed_journey_sentinel',
      'product_quality_triage_router',
      'model_independence_attestation_service',
      'cognitive_independent_evaluator',
      'cognitive_product_quality_evaluator'
    ]::text[])
  );

create or replace function public.governance_service_identity_allows_operation(
  p_service_identity text,
  p_operation text
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_service_identity
    when 'cognitive_approved_action_worker' then p_operation = any(array[
      'bootstrap_control_plane','set_switch','public_research_ingest',
      'collective_deliberation','github_draft_pr','model_advisory'
    ]::text[])
    when 'product_experience_baseline_service'
      then p_operation = 'visual_experience_canary'
    when 'livekit_experience_sentinel'
      then p_operation = 'livekit_experience_canary'
    when 'visual_product_experience_sentinel'
      then p_operation = 'visual_experience_canary'
    when 'installed_journey_sentinel'
      then p_operation = 'installed_journey_canary'
    when 'product_quality_triage_router'
      then p_operation = 'product_quality_triage'
    when 'model_independence_attestation_service'
      then p_operation = 'model_independence_attestation'
    when 'cognitive_independent_evaluator'
      then p_operation = 'independent_evaluation'
    when 'cognitive_product_quality_evaluator'
      then p_operation = 'independent_evaluation'
    else false
  end;
$$;
revoke all on function
  public.governance_service_identity_allows_operation(text,text)
  from public,anon,authenticated,service_role;

alter table public.product_experience_sentinel_evaluator_proofs
  drop constraint
    product_experience_sentinel_evaluator__evaluator_identity_check;
alter table public.product_experience_sentinel_evaluator_proofs
  add constraint
    product_experience_sentinel_evaluator__evaluator_identity_check
  check (
    evaluator_identity in (
      'cognitive_independent_evaluator',
      'cognitive_product_quality_evaluator'
    )
  );

alter table public.governance_approved_execution_evaluator_proofs
  drop constraint
    governance_approved_execution_evaluato_evaluator_identity_check;
alter table public.governance_approved_execution_evaluator_proofs
  add constraint
    governance_approved_execution_evaluato_evaluator_identity_check
  check (
    evaluator_identity in (
      'cognitive_independent_evaluator',
      'cognitive_product_quality_evaluator'
    )
  );

do $extend_product_evaluator_identity$
declare
  function_name text;
  function_count integer;
  definition text;
  updated_definition text;
  identity_guard constant text :=
    '<> ''cognitive_independent_evaluator''';
  extended_guard constant text :=
    'not in (''cognitive_independent_evaluator'',' ||
    '''cognitive_product_quality_evaluator'')';
begin
  foreach function_name in array array[
    'governance_record_approved_execution_evaluator_proof',
    'governance_complete_approved_execution',
    'governance_evaluate_product_experience_baseline_v1',
    'governance_persist_product_experience_baseline_v1_internal',
    'product_quality_require_evaluator_for_collected_run',
    'product_quality_record_sentinel_evaluator_proof',
    'product_quality_triage_detection',
    'product_quality_triage_resolution'
  ]
  loop
    select count(*), min(pg_catalog.pg_get_functiondef(procedure.oid))
    into function_count, definition
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = function_name;

    if function_count <> 1
       or definition is null
       or (
         length(definition) - length(replace(definition, identity_guard, ''))
       ) / length(identity_guard) <> 1 then
      raise exception 'cognitive_product_evaluator_identity_patch_rejected:%',
        function_name
        using errcode = 'P0001';
    end if;

    updated_definition := replace(
      definition,
      identity_guard,
      extended_guard
    );
    execute updated_definition;
  end loop;
end;
$extend_product_evaluator_identity$;

-- A provider anomaly can report usage above the preflight reservation. The
-- ordinary settlement contract intentionally rejects values above that
-- reservation, so retain the exact bounded provider readback in a separate
-- immutable audit before conservatively settling the failed reservation at its
-- reserved ceiling. This evidence never expands the authorized budget.
create table public.cognitive_model_provider_overrun_audits (
  id uuid primary key default gen_random_uuid(),
  preflight_id uuid not null unique references
    public.cognitive_model_router_preflight_audits(id),
  capability_id uuid not null references
    public.cognitive_model_router_capabilities(id),
  budget_id uuid not null references public.intelligence_budgets(id),
  task_id uuid not null references public.intelligence_tasks(id),
  project_id uuid not null references public.cognitive_projects(id),
  platform public.cognitive_platform not null,
  environment public.cognitive_environment not null,
  reported_model_tokens bigint not null check (
    reported_model_tokens between 0 and 10000000
  ),
  reported_model_cost numeric(12,6) not null check (
    reported_model_cost between 0 and 100
  ),
  reserved_model_tokens bigint not null check (
    reserved_model_tokens between 128 and 100000
  ),
  reserved_model_cost numeric(12,4) not null check (
    reserved_model_cost between 0.0001 and 5
  ),
  provider_model_version text not null check (
    length(provider_model_version) between 2 and 120
  ),
  provider_response_id_hash text not null check (
    provider_response_id_hash ~ '^[a-f0-9]{64}$'
  ),
  failure_reason_hash text not null check (
    failure_reason_hash ~ '^[a-f0-9]{64}$'
  ),
  evidence_hash text not null check (
    evidence_hash ~ '^[a-f0-9]{64}$'
  ),
  latency_ms integer not null check (latency_ms between 0 and 120000),
  service_identity text not null check (
    service_identity = 'cognitive_model_router'
  ),
  recorded_at timestamptz not null default transaction_timestamp()
);

alter table public.cognitive_model_provider_overrun_audits enable row level security;
alter table public.cognitive_model_provider_overrun_audits force row level security;
revoke all on table public.cognitive_model_provider_overrun_audits
  from public,anon,authenticated,service_role;

create trigger cognitive_model_provider_overrun_audits_immutable
before update or delete on public.cognitive_model_provider_overrun_audits
for each row execute function public.reject_cognitive_evidence_mutation();

create function public.cognitive_model_router_record_provider_overrun(
  p_preflight_id uuid,
  p_reported_model_tokens bigint,
  p_reported_model_cost numeric,
  p_provider_model_version text,
  p_provider_response_id_hash text,
  p_failure_reason_hash text,
  p_evidence_hash text,
  p_latency_ms integer,
  p_service_identity_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  preflight_value public.cognitive_model_router_preflight_audits%rowtype;
  audit_id_value uuid;
begin
  perform public.cognitive_verify_service_token(
    'cognitive_model_router',
    p_service_identity_token
  );

  select * into preflight_value
  from public.cognitive_model_router_preflight_audits
  where id = p_preflight_id
  for update;

  if preflight_value.id is null
     or exists (
       select 1
       from public.cognitive_model_router_result_audits result
       where result.preflight_id = p_preflight_id
     )
     or exists (
       select 1
       from public.cognitive_model_provider_overrun_audits audit
       where audit.preflight_id = p_preflight_id
     )
     or exists (
       select 1
       from public.cognitive_model_router_recovery_audits recovery
       where recovery.preflight_id = p_preflight_id
     )
     or p_reported_model_tokens not between 0 and 10000000
     or p_reported_model_cost not between 0 and 100
     or (
       p_reported_model_tokens <= preflight_value.reserved_model_tokens
       and p_reported_model_cost <= preflight_value.reserved_model_cost
     )
     or p_provider_model_version is null
     or length(p_provider_model_version) not between 2 and 120
     or p_provider_response_id_hash !~ '^[a-f0-9]{64}$'
     or p_failure_reason_hash !~ '^[a-f0-9]{64}$'
     or p_evidence_hash !~ '^[a-f0-9]{64}$'
     or p_latency_ms not between 0 and 120000 then
    raise exception 'model_router_provider_overrun_rejected'
      using errcode = 'P0001';
  end if;

  insert into public.cognitive_model_provider_overrun_audits(
    preflight_id,capability_id,budget_id,task_id,project_id,
    platform,environment,reported_model_tokens,reported_model_cost,
    reserved_model_tokens,reserved_model_cost,provider_model_version,
    provider_response_id_hash,failure_reason_hash,evidence_hash,latency_ms,
    service_identity
  ) values (
    preflight_value.id,preflight_value.capability_id,
    preflight_value.budget_id,preflight_value.task_id,
    preflight_value.project_id,preflight_value.platform,
    preflight_value.environment,p_reported_model_tokens,
    p_reported_model_cost,preflight_value.reserved_model_tokens,
    preflight_value.reserved_model_cost,p_provider_model_version,
    p_provider_response_id_hash,p_failure_reason_hash,p_evidence_hash,
    p_latency_ms,'cognitive_model_router'
  )
  returning id into audit_id_value;

  return jsonb_build_object(
    'overrunAuditId', audit_id_value,
    'preflightId', preflight_value.id,
    'reportedModelTokens', p_reported_model_tokens,
    'reportedModelCost', p_reported_model_cost,
    'reservedModelTokens', preflight_value.reserved_model_tokens,
    'reservedModelCost', preflight_value.reserved_model_cost,
    'evidenceHash', p_evidence_hash,
    'authority', 'advisory_only',
    'quorumEligible', false
  );
end;
$$;
revoke all on function public.cognitive_model_router_record_provider_overrun(
  uuid,bigint,numeric,text,text,text,text,integer,text
) from public,anon,authenticated,service_role;

create function public.cognitive_model_router_enforce_overrun_settlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  overrun_value public.cognitive_model_provider_overrun_audits%rowtype;
begin
  select * into overrun_value
  from public.cognitive_model_provider_overrun_audits
  where preflight_id = new.preflight_id;

  if overrun_value.id is not null
     and (
       new.result_status <> 'provider_rejected'
       or new.actual_model_tokens <> overrun_value.reserved_model_tokens
       or new.actual_model_cost <> overrun_value.reserved_model_cost
       or new.provider_model_version is not null
       or new.provider_response_id_hash is not null
       or new.output_hash is not null
       or new.invocation_hash is not null
       or new.execution_identity_hash is not null
       or new.failure_reason_hash is distinct from
         overrun_value.failure_reason_hash
     ) then
    raise exception 'model_router_overrun_settlement_rejected'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;
revoke all on function
  public.cognitive_model_router_enforce_overrun_settlement()
  from public,anon,authenticated,service_role;

create trigger cognitive_model_router_overrun_settlement_guard
before insert on public.cognitive_model_router_result_audits
for each row execute function
  public.cognitive_model_router_enforce_overrun_settlement();

create function public.cognitive_model_router_enforce_overrun_recovery_exclusion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.cognitive_model_router_preflight_audits preflight
  where preflight.id = new.preflight_id
  for update;

  if tg_relid =
       'public.cognitive_model_provider_overrun_audits'::regclass
     and exists (
       select 1
       from public.cognitive_model_router_recovery_audits recovery
       where recovery.preflight_id = new.preflight_id
     ) then
    raise exception 'model_router_overrun_recovery_rejected'
      using errcode = 'P0001';
  elsif tg_relid =
          'public.cognitive_model_router_recovery_audits'::regclass
        and exists (
          select 1
          from public.cognitive_model_provider_overrun_audits overrun
          where overrun.preflight_id = new.preflight_id
        ) then
    raise exception 'model_router_overrun_recovery_rejected'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;
revoke all on function
  public.cognitive_model_router_enforce_overrun_recovery_exclusion()
  from public,anon,authenticated,service_role;

create trigger cognitive_model_provider_overrun_recovery_guard
before insert on public.cognitive_model_provider_overrun_audits
for each row execute function
  public.cognitive_model_router_enforce_overrun_recovery_exclusion();

create trigger cognitive_model_recovery_provider_overrun_guard
before insert on public.cognitive_model_router_recovery_audits
for each row execute function
  public.cognitive_model_router_enforce_overrun_recovery_exclusion();

do $database_temp$
declare
  preserved_role text;
begin
  execute format(
    'revoke temporary on database %I from public',
    current_database()
  );
  for preserved_role in
    select role_value.rolname
    from pg_catalog.pg_roles role_value
    where role_value.rolname <> all(array[
      'cognitive_product_baseline_executor',
      'cognitive_sentinel_collector',
      'cognitive_product_quality_evaluator',
      'cognitive_product_quality_triage',
      'cognitive_public_research_broker',
      'cognitive_research_evaluator',
      'cognitive_model_router',
      'cognitive_livekit_experience_collector',
      'cognitive_github_draft_pr_broker',
      'cognitive_level01_scheduler'
    ])
  loop
    execute format(
      'grant temporary on database %I to %I',
      current_database(),
      preserved_role
    );
  end loop;
end;
$database_temp$;

do $roles$
declare
  role_name text;
  role_state pg_catalog.pg_roles%rowtype;
begin
  foreach role_name in array array[
    'cognitive_product_baseline_executor',
    'cognitive_sentinel_collector',
    'cognitive_product_quality_evaluator',
    'cognitive_product_quality_triage',
    'cognitive_public_research_broker',
    'cognitive_research_evaluator',
    'cognitive_model_router',
    'cognitive_livekit_experience_collector',
    'cognitive_github_draft_pr_broker',
    'cognitive_level01_scheduler'
  ]
  loop
    if exists (
      select 1 from pg_catalog.pg_roles where rolname = role_name
    ) then
      raise exception 'cognitive_runtime_preexisting_role_rejected:%', role_name
        using errcode = '42501';
    end if;

    execute format(
      'create role %I nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls',
      role_name
    );

    select * into role_state
    from pg_catalog.pg_roles
    where rolname = role_name;

    if role_state.rolname is null
       or role_state.rolcanlogin
       or role_state.rolsuper
       or role_state.rolcreatedb
       or role_state.rolcreaterole
       or role_state.rolinherit
       or role_state.rolreplication
       or role_state.rolbypassrls then
      raise exception 'cognitive_runtime_role_state_rejected:%', role_name
        using errcode = '42501';
    end if;

    -- Do not issue ALTER ROLE ... NOSUPERUSER/NOREPLICATION/NOBYPASSRLS
    -- here. Supabase's migration role can create a least-privilege role but is
    -- intentionally not allowed to alter superuser-only attributes. Existing
    -- roles therefore fail closed above instead of being silently rewritten.
    execute format(
      'alter role %I set search_path = cognitive_runtime, pg_catalog',
      role_name
    );
    execute format('alter role %I set statement_timeout = %L', role_name, '15s');
    execute format(
      'alter role %I set idle_in_transaction_session_timeout = %L',
      role_name,
      '10s'
    );
    execute format('alter role %I set lock_timeout = %L', role_name, '3s');

    execute format('revoke all on schema public from %I', role_name);
    execute format('revoke all on all tables in schema public from %I', role_name);
    execute format('revoke all on all sequences in schema public from %I', role_name);
    execute format('revoke all on all functions in schema public from %I', role_name);
    if exists (
      select 1
      from pg_catalog.pg_namespace namespace
      where namespace.nspname = 'net'
        and namespace.nspowner = (
          select role_value.oid
          from pg_catalog.pg_roles role_value
          where role_value.rolname = current_user
        )
    ) then
      execute format('revoke all on schema net from %I', role_name);
      execute format('revoke all on all tables in schema net from %I', role_name);
      execute format('revoke all on all sequences in schema net from %I', role_name);
      execute format('revoke all on all functions in schema net from %I', role_name);
    end if;
    execute format('grant connect on database %I to %I', current_database(), role_name);
    execute format(
      'revoke temporary on database %I from %I',
      current_database(),
      role_name
    );
    execute format('grant usage on schema cognitive_runtime to %I', role_name);
  end loop;
end;
$roles$;

create function cognitive_runtime.runtime_login_provisioning_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with expected_roles(role_name) as (
    values
      ('cognitive_product_baseline_executor'),
      ('cognitive_sentinel_collector'),
      ('cognitive_product_quality_evaluator'),
      ('cognitive_product_quality_triage'),
      ('cognitive_public_research_broker'),
      ('cognitive_research_evaluator'),
      ('cognitive_model_router'),
      ('cognitive_livekit_experience_collector'),
      ('cognitive_github_draft_pr_broker'),
      ('cognitive_level01_scheduler')
  )
  select
    (select count(*) from expected_roles) = 10
    and not exists (
      select 1
      from expected_roles expected
      where to_regrole(expected.role_name) is null
         or pg_catalog.has_database_privilege(
           expected.role_name,
           current_database(),
           'TEMPORARY'
         )
         or exists (
           select 1
           from (values ('public'),('net')) schema_value(schema_name)
           where to_regnamespace(schema_value.schema_name) is not null
             and pg_catalog.has_schema_privilege(
               expected.role_name,
               schema_value.schema_name,
               'USAGE'
             )
         )
    );
$$;
revoke all on function
  cognitive_runtime.runtime_login_provisioning_ready()
  from public,anon,authenticated,service_role;

create function cognitive_runtime.runtime_operation_allowed(
  p_principal text,
  p_operation text
)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select (p_principal, p_operation) in (
    ('cognitive_product_baseline_executor', 'claim_approved_action'),
    ('cognitive_product_baseline_executor', 'begin_approved_execution'),
    ('cognitive_product_baseline_executor', 'stage_product_baseline'),
    ('cognitive_product_baseline_executor', 'complete_approved_execution'),
    ('cognitive_product_baseline_executor', 'persist_product_baseline'),
    ('cognitive_product_baseline_executor', 'fail_approved_execution'),
    ('cognitive_sentinel_collector', 'collect_sentinel_run'),
    ('cognitive_product_quality_evaluator', 'read_active_baseline'),
    ('cognitive_product_quality_evaluator', 'compute_detection_hash'),
    ('cognitive_product_quality_evaluator', 'compute_resolution_hash'),
    ('cognitive_product_quality_evaluator', 'evaluate_product_baseline'),
    ('cognitive_product_quality_evaluator', 'record_sentinel_evaluator_proof'),
    ('cognitive_product_quality_evaluator', 'read_product_quality_snapshot'),
    ('cognitive_product_quality_triage', 'triage_detection'),
    ('cognitive_product_quality_triage', 'triage_resolution'),
    ('cognitive_public_research_broker', 'record_research_source'),
    ('cognitive_public_research_broker', 'record_research_claim'),
    ('cognitive_public_research_broker', 'detect_research_contradiction'),
    ('cognitive_public_research_broker', 'expire_research'),
    ('cognitive_research_evaluator', 'derive_research_evaluation'),
    ('cognitive_research_evaluator', 'resolve_research_contradiction'),
    ('cognitive_research_evaluator', 'read_research_snapshot'),
    ('cognitive_model_router', 'recover_model_reservation'),
    ('cognitive_model_router', 'reserve_model_invocation'),
    ('cognitive_model_router', 'record_model_provider_overrun'),
    ('cognitive_model_router', 'settle_model_invocation'),
    ('cognitive_livekit_experience_collector', 'collect_livekit_sentinel_run'),
    ('cognitive_github_draft_pr_broker', 'record_github_provider_readback'),
    ('cognitive_github_draft_pr_broker', 'consume_github_capability'),
    ('cognitive_github_draft_pr_broker', 'accept_github_tool_result'),
    ('cognitive_level01_scheduler', 'read_scheduler_status'),
    ('cognitive_level01_scheduler', 'issue_recurring_child_task')
  );
$$;

create function cognitive_runtime.assert_runtime_invoker(
  p_expected_principal text,
  p_expected_operation text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  session_role_name text := session_user;
  principal_value pg_catalog.pg_roles%rowtype;
begin
  if not cognitive_runtime.runtime_operation_allowed(
    p_expected_principal,
    p_expected_operation
  ) then
    raise exception 'cognitive_runtime_operation_rejected'
      using errcode = '42501';
  end if;

  select * into principal_value
  from pg_catalog.pg_roles
  where rolname = p_expected_principal;

  if principal_value.rolname is null
     or principal_value.rolcanlogin
     or principal_value.rolsuper
     or principal_value.rolcreatedb
     or principal_value.rolcreaterole
     or principal_value.rolreplication
     or principal_value.rolbypassrls
     or session_role_name <> p_expected_principal || '_login'
     or not pg_catalog.pg_has_role(
       session_role_name,
       p_expected_principal,
       'member'
     ) then
    raise exception 'cognitive_runtime_principal_rejected'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function cognitive_runtime.runtime_operation_allowed(text,text)
  from public;
revoke all on function cognitive_runtime.assert_runtime_invoker(text,text)
  from public;

create function cognitive_runtime.runtime_role_preflight(
  p_expected_principal text,
  p_expected_operation text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform cognitive_runtime.assert_runtime_invoker(
    p_expected_principal,
    p_expected_operation
  );
  return jsonb_build_object(
    'allowed', true,
    'principal', p_expected_principal,
    'operation', p_expected_operation,
    'databaseRoleMode', 'isolated_nologin_membership',
    'serviceRoleMember', false,
    'emergencyStopActive',
      not public.governance_approval_emergency_active()
  );
end;
$$;

create function cognitive_runtime.runtime_revocation_status(
  p_expected_principal text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_operation text;
begin
  select operation into selected_operation
  from (
    values
      ('cognitive_product_baseline_executor', 'claim_approved_action'),
      ('cognitive_sentinel_collector', 'collect_sentinel_run'),
      ('cognitive_product_quality_evaluator', 'read_active_baseline'),
      ('cognitive_product_quality_triage', 'triage_detection'),
      ('cognitive_public_research_broker', 'record_research_source'),
      ('cognitive_research_evaluator', 'derive_research_evaluation'),
      ('cognitive_model_router', 'recover_model_reservation'),
      ('cognitive_livekit_experience_collector', 'collect_livekit_sentinel_run'),
      ('cognitive_github_draft_pr_broker', 'record_github_provider_readback'),
      ('cognitive_level01_scheduler', 'read_scheduler_status')
  ) allowed(principal, operation)
  where principal = p_expected_principal;

  perform cognitive_runtime.assert_runtime_invoker(
    p_expected_principal,
    selected_operation
  );

  return jsonb_build_object(
    'principal', p_expected_principal,
    'databaseAccessRevoked', false,
    'checkedAt', transaction_timestamp()
  );
end;
$$;

revoke all on function cognitive_runtime.runtime_role_preflight(text,text)
  from public;
revoke all on function cognitive_runtime.runtime_revocation_status(text)
  from public;

-- Existing sentinel/scheduler RPCs require a PostgREST service-role claim.  The
-- isolated direct-Postgres path receives dedicated wrappers that verify the
-- database principal first, establish the legacy claim for only the nested call,
-- and restore the prior setting before returning.
create function cognitive_runtime.collect_sentinel_run(
  p_task_id uuid,
  p_project_id uuid,
  p_platform text,
  p_environment text,
  p_sentinel_key text,
  p_route_or_surface text,
  p_runtime_identity_hash text,
  p_source_build_hash text,
  p_evidence_manifest_hash text,
  p_metric_manifest jsonb,
  p_result_status text,
  p_physical_proof_status text,
  p_observation_started_at timestamptz,
  p_observation_finished_at timestamptz,
  p_evaluation_expires_at timestamptz,
  p_collection_idempotency_hash text,
  p_service_assertion text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_request_role text := current_setting('request.jwt.claim.role', true);
  result_value jsonb;
begin
  perform cognitive_runtime.assert_runtime_invoker(
    'cognitive_sentinel_collector',
    'collect_sentinel_run'
  );
  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    result_value := public.product_experience_collect_sentinel_run(
      p_task_id,
      p_project_id,
      p_platform::public.cognitive_platform,
      p_environment::public.cognitive_environment,
      p_sentinel_key,
      p_route_or_surface,
      p_runtime_identity_hash,
      p_source_build_hash,
      p_evidence_manifest_hash,
      p_metric_manifest,
      p_result_status,
      p_physical_proof_status,
      p_observation_started_at,
      p_observation_finished_at,
      p_evaluation_expires_at,
      p_collection_idempotency_hash,
      'cognitive_sentinel_collector',
      p_service_assertion
    );
  exception when others then
    perform set_config(
      'request.jwt.claim.role',
      coalesce(prior_request_role, ''),
      true
    );
    raise;
  end;
  perform set_config(
    'request.jwt.claim.role',
    coalesce(prior_request_role, ''),
    true
  );
  return result_value;
end;
$$;

create function cognitive_runtime.collect_livekit_sentinel_run(
  p_task_id uuid,
  p_project_id uuid,
  p_platform text,
  p_environment text,
  p_route_or_surface text,
  p_runtime_identity_hash text,
  p_source_build_hash text,
  p_evidence_manifest_hash text,
  p_metric_manifest jsonb,
  p_result_status text,
  p_physical_proof_status text,
  p_observation_started_at timestamptz,
  p_observation_finished_at timestamptz,
  p_evaluation_expires_at timestamptz,
  p_collection_idempotency_hash text,
  p_service_assertion text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_request_role text := current_setting('request.jwt.claim.role', true);
  result_value jsonb;
begin
  perform cognitive_runtime.assert_runtime_invoker(
    'cognitive_livekit_experience_collector',
    'collect_livekit_sentinel_run'
  );
  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    result_value := public.product_experience_collect_sentinel_run(
      p_task_id,
      p_project_id,
      p_platform::public.cognitive_platform,
      p_environment::public.cognitive_environment,
      'livekit_experience_sentinel',
      p_route_or_surface,
      p_runtime_identity_hash,
      p_source_build_hash,
      p_evidence_manifest_hash,
      p_metric_manifest,
      p_result_status,
      p_physical_proof_status,
      p_observation_started_at,
      p_observation_finished_at,
      p_evaluation_expires_at,
      p_collection_idempotency_hash,
      'cognitive_sentinel_collector',
      p_service_assertion
    );
  exception when others then
    perform set_config(
      'request.jwt.claim.role',
      coalesce(prior_request_role, ''),
      true
    );
    raise;
  end;
  perform set_config(
    'request.jwt.claim.role',
    coalesce(prior_request_role, ''),
    true
  );
  return result_value;
end;
$$;

create function cognitive_runtime.scheduler_task_factory_status(
  p_task_id uuid,
  p_project_id uuid,
  p_platform text,
  p_environment text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  prior_request_role text := current_setting('request.jwt.claim.role', true);
  result_value jsonb;
begin
  perform cognitive_runtime.assert_runtime_invoker(
    'cognitive_level01_scheduler',
    'read_scheduler_status'
  );
  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    result_value := public.cognitive_level01_scheduler_task_factory_status(
      p_task_id,
      p_project_id,
      p_platform::public.cognitive_platform,
      p_environment::public.cognitive_environment
    );
  exception when others then
    perform set_config(
      'request.jwt.claim.role',
      coalesce(prior_request_role, ''),
      true
    );
    raise;
  end;
  perform set_config(
    'request.jwt.claim.role',
    coalesce(prior_request_role, ''),
    true
  );
  return result_value;
end;
$$;

create function cognitive_runtime.scheduler_prerequisite_snapshot(
  p_task_id uuid,
  p_project_id uuid,
  p_platform text,
  p_environment text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := transaction_timestamp();
  task_value public.intelligence_tasks%rowtype;
  project_value public.cognitive_projects%rowtype;
  emergency_status text;
  switch_count integer;
  schedule_count integer;
  switch_values jsonb;
  factory_ready boolean;
  github_value public.cognitive_level01_credential_attestations%rowtype;
  github_current boolean := false;
  canary_values jsonb;
  schedule_values jsonb;
  sentinel_ready boolean := false;
  sentinel_keys jsonb := '[]'::jsonb;
begin
  perform cognitive_runtime.assert_runtime_invoker(
    'cognitive_level01_scheduler',
    'read_scheduler_status'
  );

  if p_platform <> 'shared' or p_environment <> 'production' then
    raise exception 'cognitive_runtime_scheduler_scope_rejected'
      using errcode = '42501';
  end if;

  select * into task_value
  from public.intelligence_tasks task
  where task.id = p_task_id
    and task.project_id = p_project_id
    and task.platform = p_platform::public.cognitive_platform
    and task.environment = p_environment::public.cognitive_environment;

  select * into project_value
  from public.cognitive_projects project
  where project.id = p_project_id;

  if task_value.id is null
     or project_value.id is null
     or task_value.repository_full_name <>
       'Chillywood2025/chillywood-mobile'
     or project_value.repository_full_name <>
       task_value.repository_full_name
     or task_value.task_key <> 'cognitive-level01-canary-control'
     or task_value.parent_task_id is not null
     or task_value.data_class = 'user_derived'
     or project_value.production_authority then
    raise exception 'cognitive_runtime_scheduler_control_task_rejected'
      using errcode = '42501';
  end if;

  select emergency.status into emergency_status
  from public.autonomous_system_emergency_states emergency
  where emergency.system_id = 'product_intelligence_operator';

  if emergency_status is null then
    raise exception 'cognitive_runtime_scheduler_emergency_state_missing'
      using errcode = 'P0001';
  end if;

  with required_switches(switch_key) as (
    values
      ('cognitive_collective_deliberation_enabled'),
      ('cognitive_draft_pr_executor_enabled'),
      ('cognitive_installed_journey_sentinel_enabled'),
      ('cognitive_memory_enabled'),
      ('cognitive_research_enabled'),
      ('cognitive_scheduled_level01_enabled'),
      ('cognitive_user_derived_memory_enabled'),
      ('cognitive_visual_experience_sentinel_enabled'),
      ('cognitive_level2_production_repairs_enabled')
  ),
  scoped_switches as (
    select switch.switch_key, switch.enabled
    from public.cognitive_governance_switches switch
    join required_switches required
      on required.switch_key = switch.switch_key
    where switch.task_id = p_task_id
      and switch.project_id = p_project_id
      and switch.platform = p_platform::public.cognitive_platform
      and switch.environment = p_environment::public.cognitive_environment
  )
  select
    count(*)::integer,
    jsonb_object_agg(switch_key, enabled order by switch_key)
  into switch_count, switch_values
  from scoped_switches;

  if switch_count <> 9 then
    raise exception 'cognitive_runtime_scheduler_switch_manifest_rejected'
      using errcode = 'P0001';
  end if;

  select count(*)::integer into schedule_count
  from public.cognitive_level01_schedule_definitions schedule
  where schedule.task_id = p_task_id
    and schedule.project_id = p_project_id
    and schedule.platform = p_platform::public.cognitive_platform
    and schedule.environment = p_environment::public.cognitive_environment
    and schedule.schedule_key in (
      'daily_platform_policy_security',
      'daily_non_personal_support_observability',
      'weekly_ux_route_dead_control',
      'weekly_architecture_dependency',
      'weekly_experiment_outcome'
    );

  if schedule_count <> 5 then
    raise exception 'cognitive_runtime_scheduler_definition_manifest_rejected'
      using errcode = 'P0001';
  end if;

  factory_ready :=
    task_value.cancelled_at is null
    and task_value.quarantined_at is null
    and task_value.deadman_at > now_at;

  select * into github_value
  from public.cognitive_level01_credential_attestations attestation
  where attestation.task_id = p_task_id
    and attestation.project_id = p_project_id
    and attestation.platform = p_platform::public.cognitive_platform
    and attestation.environment = p_environment::public.cognitive_environment
    and attestation.credential_kind = 'github_draft_pr'
  order by attestation.verified_at desc
  limit 1;

  github_current :=
    github_value.id is not null
    and github_value.state = 'configured'
    and github_value.verified_at <= now_at
    and github_value.expires_at > now_at;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'key', canary.canary_key,
      'type', canary.canary_type,
      'resultStatus', canary.result_status,
      'evaluatorState', canary.evaluator_state,
      'completedAt', canary.completed_at
    )
    order by canary.canary_key
  ), '[]'::jsonb)
  into canary_values
  from (
    select distinct on (run.canary_key) *
    from public.cognitive_level01_canary_runs run
    where run.task_id = p_task_id
      and run.project_id = p_project_id
      and run.platform = p_platform::public.cognitive_platform
      and run.environment = p_environment::public.cognitive_environment
      and run.canary_key in (
        'platform_policy_research',
        'repository_architecture_ux',
        'dependency_security_research',
        'documentation_draft_pr',
        'test_only_draft_pr',
        'low_risk_source_draft_pr'
      )
      and run.result_status = 'passed'
      and run.evaluator_state = 'pass'
      and run.completed_at between
        now_at - case
          when run.canary_type = 'draft_pr' then interval '30 days'
          else interval '7 days'
        end
        and now_at
    order by run.canary_key, run.completed_at desc, run.id
  ) canary;

  select
    count(*) = 2,
    coalesce(jsonb_agg(sentinel_key order by sentinel_key), '[]'::jsonb)
  into sentinel_ready, sentinel_keys
  from (
    select distinct run.sentinel_key
    from public.product_experience_sentinel_runs run
    join public.intelligence_tasks sentinel_task
      on sentinel_task.id = run.task_id
     and sentinel_task.project_id = run.project_id
     and sentinel_task.platform = run.platform
     and sentinel_task.environment = run.environment
    join public.product_experience_sentinel_evaluator_proofs proof
      on proof.sentinel_run_id = run.id
     and proof.task_id = run.task_id
     and proof.project_id = run.project_id
     and proof.platform = run.platform
     and proof.environment = run.environment
    where run.project_id = p_project_id
      and sentinel_task.parent_task_id = p_task_id
      and run.platform in ('android', 'ios')
      and run.environment = p_environment::public.cognitive_environment
      and run.sentinel_key in (
        'installed_journey_sentinel',
        'visual_product_experience_sentinel'
      )
      and run.result_status in ('passed', 'failed')
      and run.erased_at is null
      and run.observation_finished_at >= now_at - interval '7 days'
      and run.observation_finished_at <= now_at
      and proof.verdict = 'passed'
      and proof.valid_until > now_at
  ) evaluated_sentinel;

  with definition_state as (
    select
      schedule.*,
      case schedule.schedule_key
      when 'daily_platform_policy_security' then
        array[
          'platform_policy_research',
          'repository_architecture_ux',
          'dependency_security_research'
        ]::text[]
      when 'daily_non_personal_support_observability' then
        array[
          'platform_policy_research',
          'repository_architecture_ux'
        ]::text[]
      when 'weekly_architecture_dependency' then
        array[
          'repository_architecture_ux',
          'dependency_security_research'
        ]::text[]
      when 'weekly_ux_route_dead_control' then
        array[
          'installed_journey_sentinel',
          'visual_product_experience_sentinel'
        ]::text[]
      when 'weekly_experiment_outcome' then
        array[
          'documentation_draft_pr',
          'test_only_draft_pr',
          'low_risk_source_draft_pr'
        ]::text[]
      else '{}'::text[]
      end as required_keys,
      case
        when schedule.schedule_key = 'weekly_ux_route_dead_control'
          then 'installed_sentinel'
        when schedule.schedule_key = 'weekly_experiment_outcome'
          then 'draft_pr'
        else 'research'
      end as canary_kind,
      case
        when schedule.schedule_key = 'weekly_experiment_outcome'
          then 30
        else 7
      end as maximum_age_days,
      case schedule.schedule_key
      when 'daily_platform_policy_security' then
        schedule.cadence = '0 14 * * *'
        and schedule.maximum_tasks = 3
        and schedule.maximum_cost = 5
        and schedule.timeout_seconds = 300
      when 'daily_non_personal_support_observability' then
        schedule.cadence = '30 14 * * *'
        and schedule.maximum_tasks = 2
        and schedule.maximum_cost = 3
        and schedule.timeout_seconds = 300
      when 'weekly_ux_route_dead_control' then
        schedule.cadence = '0 15 * * 1'
        and schedule.maximum_tasks = 3
        and schedule.maximum_cost = 5
        and schedule.timeout_seconds = 600
      when 'weekly_architecture_dependency' then
        schedule.cadence = '30 15 * * 1'
        and schedule.maximum_tasks = 3
        and schedule.maximum_cost = 5
        and schedule.timeout_seconds = 600
      when 'weekly_experiment_outcome' then
        schedule.cadence = '0 16 * * 1'
        and schedule.maximum_tasks = 2
        and schedule.maximum_cost = 3
        and schedule.timeout_seconds = 300
      else false
      end as definition_valid
    from public.cognitive_level01_schedule_definitions schedule
    where schedule.task_id = p_task_id
      and schedule.project_id = p_project_id
      and schedule.platform = p_platform::public.cognitive_platform
      and schedule.environment = p_environment::public.cognitive_environment
  ),
  passing_state as (
    select
      definition.*,
      case
        when definition.schedule_key = 'weekly_ux_route_dead_control'
          then sentinel_keys
        else coalesce((
          select jsonb_agg(key_value order by key_value)
          from (
            select distinct run.canary_key as key_value
            from public.cognitive_level01_canary_runs run
            where run.task_id = p_task_id
              and run.project_id = p_project_id
              and run.platform = p_platform::public.cognitive_platform
              and run.environment =
                p_environment::public.cognitive_environment
              and run.canary_key = any(definition.required_keys)
              and run.result_status = 'passed'
              and run.evaluator_state = 'pass'
              and run.completed_at between
                now_at - make_interval(
                  days => definition.maximum_age_days
                )
                and now_at
          ) passing
        ), '[]'::jsonb)
      end as passing_keys
    from definition_state definition
  ),
  prerequisite_state as (
    select
      passing.*,
      (
        passing.definition_valid
        and factory_ready
        and emergency_status = 'active'
        and (switch_values->>'cognitive_research_enabled')::boolean
        and (switch_values->>'cognitive_memory_enabled')::boolean
        and not (
          switch_values->>'cognitive_user_derived_memory_enabled'
        )::boolean
        and not (
          switch_values->>'cognitive_level2_production_repairs_enabled'
        )::boolean
        and jsonb_array_length(passing.passing_keys) =
          cardinality(passing.required_keys)
        and case passing.schedule_key
          when 'weekly_ux_route_dead_control' then
            (switch_values->>
              'cognitive_installed_journey_sentinel_enabled')::boolean
            and (switch_values->>
              'cognitive_visual_experience_sentinel_enabled')::boolean
            and sentinel_ready
          when 'weekly_experiment_outcome' then
            (switch_values->>
              'cognitive_collective_deliberation_enabled')::boolean
            and (switch_values->>
              'cognitive_draft_pr_executor_enabled')::boolean
            and github_current
          else true
        end
      ) as activation_pass,
      public.cognitive_level01_schedule_prerequisites_pass(
        passing.id,
        p_task_id,
        p_project_id,
        p_platform::public.cognitive_platform,
        p_environment::public.cognitive_environment
      ) as dispatch_pass
    from passing_state passing
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', schedule.id,
      'key', schedule.schedule_key,
      'cadence', schedule.cadence,
      'enabled', schedule.enabled,
      'maximumTasks', schedule.maximum_tasks,
      'maximumCost', schedule.maximum_cost,
      'timeoutSeconds', schedule.timeout_seconds,
      'definitionValid', schedule.definition_valid,
      'canaryState', jsonb_build_object(
        'kind', schedule.canary_kind,
        'requiredKeys', to_jsonb(schedule.required_keys),
        'passingKeys', schedule.passing_keys,
        'requiredCount', cardinality(schedule.required_keys),
        'passingCount', jsonb_array_length(schedule.passing_keys),
        'current',
          jsonb_array_length(schedule.passing_keys) =
            cardinality(schedule.required_keys),
        'maximumAgeDays', schedule.maximum_age_days
      ),
      'activationPrerequisitesPass', schedule.activation_pass,
      'dispatchPrerequisitesPass', schedule.dispatch_pass,
      'currentState', case
        when schedule.enabled and schedule.dispatch_pass
          then 'enabled_dispatch_eligible'
        when schedule.enabled then 'enabled_blocked'
        when schedule.activation_pass then 'disabled_activation_eligible'
        else 'disabled_blocked'
      end
    )
    order by schedule.schedule_key
  ), '[]'::jsonb)
  into schedule_values
  from prerequisite_state schedule;

  return jsonb_build_object(
    'snapshotVersion', 'v1',
    'scope', jsonb_build_object(
      'taskId', task_value.id,
      'projectId', task_value.project_id,
      'platform', task_value.platform,
      'environment', task_value.environment,
      'repository', task_value.repository_full_name,
      'taskKey', task_value.task_key,
      'controlTask', task_value.task_key =
        'cognitive-level01-canary-control',
      'cancelled', task_value.cancelled_at is not null,
      'quarantined', task_value.quarantined_at is not null,
      'deadmanCurrent', task_value.deadman_at > now_at,
      'dataClassAllowed', task_value.data_class <> 'user_derived',
      'productionAuthority', project_value.production_authority
    ),
    'emergency', jsonb_build_object(
      'systemId', 'product_intelligence_operator',
      'status', emergency_status,
      'active', emergency_status = 'active'
    ),
    'switches', switch_values,
    'freshTaskFactory', jsonb_build_object(
      'ready', factory_ready,
      'factoryIdentity', case when factory_ready
        then 'cognitive_level01_scheduler' else 'unavailable' end,
      'freshTaskPerExecution', factory_ready,
      'controlTaskReuseAllowed', false,
      'deadmanBounded', factory_ready,
      'retentionBounded', factory_ready,
      'version', case when factory_ready then 'v1' else 'unavailable' end
    ),
    'githubCredential', jsonb_build_object(
      'state', coalesce(github_value.state, 'missing'),
      'configured', coalesce(github_value.state = 'configured', false),
      'current', github_current,
      'verifiedAt', github_value.verified_at,
      'expiresAt', github_value.expires_at
    ),
    'canaries', canary_values,
    'schedules', schedule_values
  );
end;
$$;

create function cognitive_runtime.issue_recurring_child_task(
  p_capability_id uuid,
  p_schedule_definition_id uuid,
  p_parent_task_id uuid,
  p_project_id uuid,
  p_platform text,
  p_environment text,
  p_scheduled_for timestamptz,
  p_execution_idempotency_hash text,
  p_objective_hash text,
  p_work_state text,
  p_no_work_reason_hash text,
  p_service_assertion text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_request_role text := current_setting('request.jwt.claim.role', true);
  result_value jsonb;
begin
  perform cognitive_runtime.assert_runtime_invoker(
    'cognitive_level01_scheduler',
    'issue_recurring_child_task'
  );
  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    result_value := public.cognitive_level01_issue_recurring_child_task(
      p_capability_id,
      p_schedule_definition_id,
      p_parent_task_id,
      p_project_id,
      p_platform::public.cognitive_platform,
      p_environment::public.cognitive_environment,
      p_scheduled_for,
      p_execution_idempotency_hash,
      p_objective_hash,
      p_work_state,
      p_no_work_reason_hash,
      'cognitive_level01_scheduler',
      p_service_assertion
    );
  exception when others then
    perform set_config(
      'request.jwt.claim.role',
      coalesce(prior_request_role, ''),
      true
    );
    raise;
  end;
  perform set_config(
    'request.jwt.claim.role',
    coalesce(prior_request_role, ''),
    true
  );
  return result_value;
end;
$$;

-- Read-only, bounded snapshots replace direct table grants used by the
-- service-role Edge implementations.
create function cognitive_runtime.product_quality_evaluator_snapshot(
  p_sentinel_run_id uuid,
  p_finding_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_run public.product_experience_sentinel_runs%rowtype;
  selected_finding public.product_quality_findings%rowtype;
  active_baseline jsonb;
  result_value jsonb;
begin
  perform cognitive_runtime.assert_runtime_invoker(
    'cognitive_product_quality_evaluator',
    'read_product_quality_snapshot'
  );

  select * into selected_run
  from public.product_experience_sentinel_runs run
  where run.id = p_sentinel_run_id;

  if selected_run.id is null then
    return jsonb_build_object(
      'run', null,
      'finding', null,
      'detectionRun', null,
      'activeBaseline', jsonb_build_object('count', 0)
    );
  end if;

  if p_finding_id is not null then
    select * into selected_finding
    from public.product_quality_findings finding
    where finding.id = p_finding_id
      and finding.task_id = selected_run.task_id
      and finding.project_id = selected_run.project_id
      and finding.platform = selected_run.platform
      and finding.environment = selected_run.environment
      and finding.route_or_surface = selected_run.route_or_surface;
  end if;

  active_baseline :=
    public.product_experience_resolve_current_active_baseline(
      selected_run.task_id,
      selected_run.project_id,
      selected_run.platform,
      selected_run.environment,
      'streaming_mobile_content_density'
    );

  select jsonb_build_object(
    'run',
    (
      select to_jsonb(run_value)
      from (
        select
          id, task_id, project_id, platform, environment, sentinel_key,
          route_or_surface, source_build_hash, evidence_manifest_hash,
          metric_manifest, result_status, physical_proof_status,
          evaluation_expires_at, collector_capability_id, erased_at
        from public.product_experience_sentinel_runs
        where id = selected_run.id
      ) run_value
    ),
    'finding',
    (
      select to_jsonb(finding_value)
      from (
        select
          id, sentinel_run_id, task_id, project_id, platform, environment,
          route_or_surface, finding_key, finding_class, finding_scope_hash,
          current_status, current_evaluator_proof_id, resolution_hash,
          occurrence_count, evidence_hashes, erased_at
        from public.product_quality_findings
        where id = selected_finding.id
      ) finding_value
    ),
    'detectionRun',
    (
      select to_jsonb(detection_run_value)
      from (
        select
          id, task_id, project_id, platform, environment, sentinel_key,
          route_or_surface, source_build_hash, evidence_manifest_hash,
          metric_manifest, result_status, physical_proof_status,
          evaluation_expires_at, collector_capability_id, erased_at
        from public.product_experience_sentinel_runs
        where id = selected_finding.sentinel_run_id
          and task_id = selected_run.task_id
          and project_id = selected_run.project_id
          and platform = selected_run.platform
          and environment = selected_run.environment
          and route_or_surface = selected_run.route_or_surface
      ) detection_run_value
    ),
    'activeBaseline',
    case
      when active_baseline is null then jsonb_build_object('count', 0)
      else jsonb_build_object(
        'count', 1,
        'baselineId', active_baseline->>'baselineId',
        'selectedOptionCode', active_baseline->>'selectedOptionCode',
        'selectedOption', active_baseline->>'selectedOption',
        'baselineHash', active_baseline->>'baselineHash',
        'status', active_baseline->>'status'
      )
    end
  ) into result_value;

  return result_value;
end;
$$;

create function cognitive_runtime.record_research_claim_with_readback(
  p_task_id uuid,
  p_project_id uuid,
  p_platform text,
  p_environment text,
  p_canary_key text,
  p_bounded_claim text,
  p_category text,
  p_confidence numeric,
  p_freshness_deadline timestamptz,
  p_contradiction_state text,
  p_source_ids uuid[],
  p_service_identity_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim_id_value uuid;
  result_value jsonb;
begin
  perform cognitive_runtime.assert_runtime_invoker(
    'cognitive_public_research_broker',
    'record_research_claim'
  );

  claim_id_value := public.cognitive_record_public_research_claim_evidence(
    p_task_id,
    p_project_id,
    p_platform::public.cognitive_platform,
    p_environment::public.cognitive_environment,
    p_canary_key,
    p_bounded_claim,
    p_category,
    p_confidence,
    p_freshness_deadline,
    p_contradiction_state,
    p_source_ids,
    p_service_identity_token
  );

  select jsonb_build_object(
    'research_claim_id', claim.id,
    'claim_hash', claim.claim_hash,
    'retention_until', claim.retention_until,
    'erased_at', claim.erased_at
  )
  into result_value
  from public.research_claims claim
  where claim.id = claim_id_value
    and claim.task_id = p_task_id
    and claim.project_id = p_project_id
    and claim.platform = p_platform::public.cognitive_platform
    and claim.environment = p_environment::public.cognitive_environment;

  if result_value is null then
    raise exception 'cognitive_runtime_research_claim_readback_rejected'
      using errcode = 'P0001';
  end if;

  return result_value;
end;
$$;

create function cognitive_runtime.derive_research_evaluation_with_readback(
  p_task_id uuid,
  p_project_id uuid,
  p_platform text,
  p_environment text,
  p_subject_type text,
  p_subject_id uuid,
  p_service_identity_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  evaluation_id_value uuid;
  result_value jsonb;
begin
  perform cognitive_runtime.assert_runtime_invoker(
    'cognitive_research_evaluator',
    'derive_research_evaluation'
  );

  evaluation_id_value :=
    public.cognitive_derive_public_research_evaluation(
      p_task_id,
      p_project_id,
      p_platform::public.cognitive_platform,
      p_environment::public.cognitive_environment,
      p_subject_type,
      p_subject_id,
      p_service_identity_token
    );

  select jsonb_build_object(
    'evaluation_id', evaluation.id,
    'subject_type', evaluation.subject_type,
    'subject_id', evaluation.subject_id,
    'evaluation_status', evaluation.evaluation_status,
    'evidence_hash', evaluation.evidence_hash,
    'evaluator_identity_hash', evaluation.evaluator_identity_hash,
    'expires_at', evaluation.expires_at,
    'evidence_manifest_id', manifest.id,
    'manifest_derived_status', manifest.derived_status,
    'manifest_hash', manifest.manifest_hash,
    'manifest_expires_at', manifest.expires_at,
    'reasons', manifest.evidence_manifest->'reasons'
  )
  into result_value
  from public.cognitive_subject_evaluations evaluation
  join public.cognitive_subject_evidence_manifests manifest
    on manifest.id = evaluation.evidence_manifest_id
   and manifest.task_id = evaluation.task_id
   and manifest.project_id = evaluation.project_id
   and manifest.platform = evaluation.platform
   and manifest.environment = evaluation.environment
  where evaluation.id = evaluation_id_value
    and evaluation.task_id = p_task_id
    and evaluation.project_id = p_project_id
    and evaluation.platform = p_platform::public.cognitive_platform
    and evaluation.environment = p_environment::public.cognitive_environment
    and evaluation.subject_type = p_subject_type
    and evaluation.subject_id = p_subject_id
    and manifest.subject_type = evaluation.subject_type
    and manifest.subject_id = evaluation.subject_id
    and manifest.derived_status = evaluation.evaluation_status
    and manifest.manifest_hash = evaluation.evidence_hash
    and jsonb_typeof(manifest.evidence_manifest->'reasons') = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(manifest.evidence_manifest->'reasons') reason
      where jsonb_typeof(reason) <> 'string'
    );

  if result_value is null then
    raise exception 'cognitive_runtime_research_evaluation_readback_rejected'
      using errcode = 'P0001';
  end if;

  return result_value;
end;
$$;

create function cognitive_runtime.research_evaluator_snapshot(
  p_research_claim_id uuid,
  p_task_id uuid,
  p_project_id uuid,
  p_platform text,
  p_environment text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result_value jsonb;
begin
  perform cognitive_runtime.assert_runtime_invoker(
    'cognitive_research_evaluator',
    'read_research_snapshot'
  );

  select jsonb_build_object(
    'claim',
    (
      select to_jsonb(claim_value)
      from (
        select
          id, task_id, project_id, platform, environment, status,
          bounded_claim, claim_hash, confidence, category,
          freshness_deadline, contradiction_state, support_state,
          created_at, retention_until, erased_at
        from public.research_claims
        where id = p_research_claim_id
          and task_id = p_task_id
          and project_id = p_project_id
          and platform = p_platform::public.cognitive_platform
          and environment = p_environment::public.cognitive_environment
      ) claim_value
    ),
    'relations',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'source_id', relation.source_id,
          'relationship', relation.relationship
        )
        order by relation.source_id
      )
      from public.research_claim_sources relation
      where relation.claim_id = p_research_claim_id
        and relation.task_id = p_task_id
        and relation.project_id = p_project_id
        and relation.platform = p_platform::public.cognitive_platform
        and relation.environment = p_environment::public.cognitive_environment
    ), '[]'::jsonb),
    'sources',
    coalesce((
      select jsonb_agg(to_jsonb(source_value) order by source_value.id)
      from (
        select
          source.id, source.source_type, source.is_primary,
          source.ownership_identity, source.canonical_url_hash,
          source.content_hash, source.bounded_excerpt,
          source.citation_metadata, source.publication_date,
          source.retrieval_date, source.freshness_deadline,
          source.retention_until, source.erased_at,
          source.trusted_for_tool_execution
        from public.research_sources source
        join public.research_claim_sources relation
          on relation.source_id = source.id
        where relation.claim_id = p_research_claim_id
          and source.task_id = p_task_id
          and source.project_id = p_project_id
          and source.platform = p_platform::public.cognitive_platform
          and source.environment = p_environment::public.cognitive_environment
        order by source.id
        limit 8
      ) source_value
    ), '[]'::jsonb),
    'retrievals',
    coalesce((
      select jsonb_agg(to_jsonb(retrieval_value) order by retrieval_value.id)
      from (
        select
          retrieval.id, retrieval.source_id, retrieval.request_url_hash,
          retrieval.resolved_address_hashes, retrieval.response_hash,
          retrieval.result
        from public.research_retrieval_events retrieval
        join public.research_claim_sources relation
          on relation.source_id = retrieval.source_id
        where relation.claim_id = p_research_claim_id
          and retrieval.task_id = p_task_id
          and retrieval.project_id = p_project_id
          and retrieval.platform = p_platform::public.cognitive_platform
          and retrieval.environment = p_environment::public.cognitive_environment
        order by retrieval.id
        limit 16
      ) retrieval_value
    ), '[]'::jsonb),
    'contradictions',
    coalesce((
      select jsonb_agg(to_jsonb(contradiction_value) order by contradiction_value.id)
      from (
        select id, source_id, evidence_hash, resolution_state
        from public.research_contradictions
        where claim_id = p_research_claim_id
          and task_id = p_task_id
          and project_id = p_project_id
          and platform = p_platform::public.cognitive_platform
          and environment = p_environment::public.cognitive_environment
        order by id
        limit 16
      ) contradiction_value
    ), '[]'::jsonb),
    'contradictionEvents',
    coalesce((
      select jsonb_agg(to_jsonb(event_value) order by event_value.id)
      from (
        select
          id, contradiction_id, event_type, evidence_hash,
          prior_event_hash, proof_hash, proof_manifest
        from public.cognitive_research_contradiction_events
        where claim_id = p_research_claim_id
          and task_id = p_task_id
          and project_id = p_project_id
          and platform = p_platform::public.cognitive_platform
          and environment = p_environment::public.cognitive_environment
        order by id
        limit 32
      ) event_value
    ), '[]'::jsonb)
  ) into result_value;

  return result_value;
end;
$$;

revoke all on function cognitive_runtime.collect_sentinel_run(
  uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,
  timestamptz,timestamptz,timestamptz,text,text
) from public;
revoke all on function cognitive_runtime.collect_livekit_sentinel_run(
  uuid,uuid,text,text,text,text,text,text,jsonb,text,text,
  timestamptz,timestamptz,timestamptz,text,text
) from public;
revoke all on function cognitive_runtime.scheduler_task_factory_status(
  uuid,uuid,text,text
) from public;
revoke all on function cognitive_runtime.scheduler_prerequisite_snapshot(
  uuid,uuid,text,text
) from public;
revoke all on function cognitive_runtime.issue_recurring_child_task(
  uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,text,text,text
) from public;
revoke all on function cognitive_runtime.product_quality_evaluator_snapshot(
  uuid,uuid
) from public;
revoke all on function cognitive_runtime.research_evaluator_snapshot(
  uuid,uuid,uuid,text,text
) from public;
revoke all on function cognitive_runtime.record_research_claim_with_readback(
  uuid,uuid,text,text,text,text,text,numeric,timestamptz,text,uuid[],text
) from public;
revoke all on function cognitive_runtime.derive_research_evaluation_with_readback(
  uuid,uuid,text,text,text,uuid,text
) from public;

grant execute on function cognitive_runtime.collect_sentinel_run(
  uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,
  timestamptz,timestamptz,timestamptz,text,text
) to cognitive_sentinel_collector;
grant execute on function cognitive_runtime.collect_livekit_sentinel_run(
  uuid,uuid,text,text,text,text,text,text,jsonb,text,text,
  timestamptz,timestamptz,timestamptz,text,text
) to cognitive_livekit_experience_collector;
grant execute on function cognitive_runtime.scheduler_prerequisite_snapshot(
  uuid,uuid,text,text
) to cognitive_level01_scheduler;
grant execute on function cognitive_runtime.issue_recurring_child_task(
  uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,text,text,text
) to cognitive_level01_scheduler;
grant execute on function cognitive_runtime.product_quality_evaluator_snapshot(
  uuid,uuid
) to cognitive_product_quality_evaluator;
grant execute on function cognitive_runtime.research_evaluator_snapshot(
  uuid,uuid,uuid,text,text
) to cognitive_research_evaluator;
grant execute on function cognitive_runtime.record_research_claim_with_readback(
  uuid,uuid,text,text,text,text,text,numeric,timestamptz,text,uuid[],text
) to cognitive_public_research_broker;
grant execute on function cognitive_runtime.derive_research_evaluation_with_readback(
  uuid,uuid,text,text,text,uuid,text
) to cognitive_research_evaluator;

-- Runtime logins have no USAGE on public. Expose only same-signature forwarding
-- wrappers in cognitive_runtime. Each wrapper rechecks the session principal
-- and its closed operation before invoking the reviewed public RPC as the
-- migration owner.
do $domain_wrappers$
declare
  wrapper_row record;
  function_count integer;
  source_function pg_catalog.pg_proc%rowtype;
  wrapper_function regprocedure;
  argument_list text;
  call_list text;
  result_type text;
  wrapper_sql text;
begin
  perform set_config('search_path', '', true);

  for wrapper_row in
    select * from (values
      ('cognitive_product_baseline_executor', 'claim_approved_action', 'governance_claim_approved_action', null::integer),
      ('cognitive_product_baseline_executor', 'begin_approved_execution', 'governance_begin_approved_execution', null),
      ('cognitive_product_baseline_executor', 'stage_product_baseline', 'governance_stage_product_experience_baseline_v1', null),
      ('cognitive_product_baseline_executor', 'complete_approved_execution', 'governance_complete_approved_execution', null),
      ('cognitive_product_baseline_executor', 'persist_product_baseline', 'governance_product_baseline_persist_completed_execution', null),
      ('cognitive_product_baseline_executor', 'fail_approved_execution', 'governance_fail_approved_execution', null),
      ('cognitive_product_quality_evaluator', 'compute_detection_hash', 'product_quality_detection_assessment_hash', null),
      ('cognitive_product_quality_evaluator', 'compute_resolution_hash', 'product_quality_resolution_assessment_hash', null),
      ('cognitive_product_quality_evaluator', 'evaluate_product_baseline', 'governance_evaluate_product_experience_baseline_v1', null),
      ('cognitive_product_quality_evaluator', 'record_sentinel_evaluator_proof', 'product_quality_record_sentinel_evaluator_proof', null),
      ('cognitive_product_quality_triage', 'triage_detection', 'product_quality_triage_detection', null),
      ('cognitive_product_quality_triage', 'triage_resolution', 'product_quality_triage_resolution', null),
      ('cognitive_public_research_broker', 'record_research_source', 'cognitive_record_public_research_source_v2', null),
      ('cognitive_public_research_broker', 'detect_research_contradiction', 'cognitive_record_public_research_contradiction_detection', null),
      ('cognitive_public_research_broker', 'expire_research', 'cognitive_expire_public_research_maintenance', null),
      ('cognitive_research_evaluator', 'resolve_research_contradiction', 'cognitive_resolve_public_research_contradiction', null),
      ('cognitive_model_router', 'recover_model_reservation', 'cognitive_model_router_recover_expired', null),
      ('cognitive_model_router', 'reserve_model_invocation', 'cognitive_model_router_reserve', 21),
      ('cognitive_model_router', 'record_model_provider_overrun', 'cognitive_model_router_record_provider_overrun', null),
      ('cognitive_model_router', 'settle_model_invocation', 'cognitive_model_router_settle', null),
      ('cognitive_github_draft_pr_broker', 'record_github_provider_readback', 'cognitive_record_github_draft_pr_provider_readback', null),
      ('cognitive_github_draft_pr_broker', 'consume_github_capability', 'cognitive_consume_github_draft_pr_capability', null),
      ('cognitive_github_draft_pr_broker', 'accept_github_tool_result', 'cognitive_accept_github_draft_pr_tool_result', null)
    ) allowed(role_name, operation_name, function_name, argument_count)
  loop
    select count(*) into function_count
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = wrapper_row.function_name
      and (
        wrapper_row.argument_count is null
        or procedure.pronargs = wrapper_row.argument_count
      );

    if function_count <> 1 then
      raise exception 'cognitive_runtime_rpc_manifest_mismatch:%:%',
        wrapper_row.function_name,
        function_count;
    end if;

    select procedure.* into source_function
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = wrapper_row.function_name
      and (
        wrapper_row.argument_count is null
        or procedure.pronargs = wrapper_row.argument_count
      );

    result_type :=
      pg_catalog.pg_get_function_result(source_function.oid);
    select
      string_agg(
        format(
          '%I %s',
          source_function.proargnames[position],
          case
            when type_namespace.nspname = 'public'
             and argument_type.typname in (
               'cognitive_platform',
               'cognitive_environment'
             )
              then 'text'
            else pg_catalog.format_type(argument_type.oid, null)
          end
        ),
        ',' order by position
      ),
      string_agg(
        case
          when type_namespace.nspname = 'public'
           and argument_type.typname = 'cognitive_platform'
            then format('$%s::public.cognitive_platform', position)
          when type_namespace.nspname = 'public'
           and argument_type.typname = 'cognitive_environment'
            then format('$%s::public.cognitive_environment', position)
          else format('$%s', position)
        end,
        ',' order by position
      )
    into argument_list, call_list
    from unnest(source_function.proargtypes::oid[])
      with ordinality argument(type_oid, position)
    join pg_catalog.pg_type argument_type
      on argument_type.oid = argument.type_oid
    join pg_catalog.pg_namespace type_namespace
      on type_namespace.oid = argument_type.typnamespace;

    wrapper_sql := format(
      $wrapper_definition$
      create function cognitive_runtime.%1$I(%2$s)
      returns %3$s
      language plpgsql
      security definer
      set search_path = ''
      as $runtime_wrapper$
      begin
        perform cognitive_runtime.assert_runtime_invoker(%4$L, %5$L);
        return public.%1$I(%6$s);
      end;
      $runtime_wrapper$;
      $wrapper_definition$,
      wrapper_row.function_name,
      argument_list,
      result_type,
      wrapper_row.role_name,
      wrapper_row.operation_name,
      call_list
    );
    execute wrapper_sql;

    select procedure.oid::regprocedure into wrapper_function
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'cognitive_runtime'
      and procedure.proname = wrapper_row.function_name
      and procedure.pronargs = source_function.pronargs;

    execute format(
      'revoke all on function %s from public',
      wrapper_function
    );
    execute format(
      'grant execute on function %s to %I',
      wrapper_function,
      wrapper_row.role_name
    );
  end loop;
end;
$domain_wrappers$;

do $common_grants$
declare
  role_name text;
begin
  foreach role_name in array array[
    'cognitive_product_baseline_executor',
    'cognitive_sentinel_collector',
    'cognitive_product_quality_evaluator',
    'cognitive_product_quality_triage',
    'cognitive_public_research_broker',
    'cognitive_research_evaluator',
    'cognitive_model_router',
    'cognitive_livekit_experience_collector',
    'cognitive_github_draft_pr_broker',
    'cognitive_level01_scheduler'
  ]
  loop
    execute format(
      'grant execute on function cognitive_runtime.runtime_role_preflight(text,text) to %I',
      role_name
    );
    execute format(
      'grant execute on function cognitive_runtime.runtime_revocation_status(text) to %I',
      role_name
    );
  end loop;
end;
$common_grants$;

comment on schema cognitive_runtime is
  'Non-exposed RPC boundary for isolated Cognitive Level 0/1 runtime database roles.';
comment on function cognitive_runtime.runtime_role_preflight(text,text) is
  'Fail-closed database role and operation attestation; does not replace task, capability, evaluator, expiry, revocation, or emergency checks in domain RPCs.';
comment on function cognitive_runtime.runtime_revocation_status(text) is
  'Returns a sanitized active database-membership status. Revoked logins lose EXECUTE before this function can return.';
