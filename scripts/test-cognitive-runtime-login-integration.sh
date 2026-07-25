#!/usr/bin/env bash
set -euo pipefail

# Local-only integration test for all ten isolated Cognitive Level 0/1 database
# LOGIN identities. Administrative setup uses the local Supabase Postgres
# container's socket; every runtime identity reconnects over TCP with an
# independent disposable password. Credentials remain process-only and no
# credential value is written or printed.

if [[ "${-}" == *x* ]]; then
  echo "FAIL" >&2
  exit 1
fi

repository_root="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1
  pwd
)"
project_name="$(basename "$repository_root")"
database_container="${SUPABASE_DB_CONTAINER:-supabase_db_${project_name}}"
database_name="${SUPABASE_LOCAL_DB_NAME:-postgres}"
if [[ ! "$database_name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "FAIL" >&2
  exit 1
fi
service_token="$(openssl rand -hex 32)"
provisioned=0
net_public_usage_before=""
test_stage="initialization"

principals=(
  cognitive_product_baseline_executor
  cognitive_sentinel_collector
  cognitive_product_quality_evaluator
  cognitive_product_quality_triage
  cognitive_public_research_broker
  cognitive_research_evaluator
  cognitive_model_router
  cognitive_livekit_experience_collector
  cognitive_github_draft_pr_broker
  cognitive_level01_scheduler
)

operation_sets=(
  "claim_approved_action,begin_approved_execution,stage_product_baseline,complete_approved_execution,persist_product_baseline,fail_approved_execution"
  "collect_sentinel_run"
  "read_active_baseline,compute_detection_hash,compute_no_finding_hash,compute_resolution_hash,evaluate_product_baseline,record_sentinel_evaluator_proof,read_product_quality_snapshot"
  "triage_detection,triage_resolution"
  "record_research_source,record_research_claim,detect_research_contradiction,expire_research"
  "derive_research_evaluation,resolve_research_contradiction,read_research_snapshot"
  "recover_model_reservation,reserve_model_invocation,record_model_provider_overrun,settle_model_invocation"
  "collect_livekit_sentinel_run"
  "record_github_provider_readback,consume_github_capability,accept_github_tool_result"
  "read_scheduler_status,issue_recurring_child_task"
)

wrapper_sets=(
  "governance_claim_approved_action,governance_begin_approved_execution,governance_stage_product_experience_baseline_v1,governance_complete_approved_execution,governance_product_baseline_persist_completed_execution,governance_fail_approved_execution"
  "collect_sentinel_run"
  "product_quality_detection_assessment_hash,product_quality_no_finding_assessment_hash,product_quality_resolution_assessment_hash,governance_evaluate_product_experience_baseline_v1,product_quality_record_sentinel_evaluator_proof,product_quality_evaluator_snapshot"
  "product_quality_triage_detection,product_quality_triage_resolution"
  "cognitive_record_public_research_source_v2,record_research_claim_with_readback,cognitive_record_public_research_contradiction_detection,cognitive_expire_public_research_maintenance"
  "derive_research_evaluation_with_readback,cognitive_resolve_public_research_contradiction,research_evaluator_snapshot"
  "cognitive_model_router_recover_expired,cognitive_model_router_reserve,cognitive_model_router_settle_provider_overrun,cognitive_model_router_settle"
  "collect_livekit_sentinel_run"
  "cognitive_record_github_draft_pr_provider_readback,cognitive_consume_github_draft_pr_capability,cognitive_accept_github_draft_pr_tool_result"
  "scheduler_prerequisite_snapshot,issue_recurring_child_task"
)

runtime_passwords=()
for principal in "${principals[@]}"; do
  runtime_passwords[${#runtime_passwords[@]}]="$(openssl rand -hex 32)"
done

admin_psql() {
  docker exec -i \
    -e TEST_DATABASE_NAME="$database_name" \
    "$database_container" \
    sh -c '
      PGPASSWORD="${POSTGRES_PASSWORD:?}"
      export PGPASSWORD
      exec psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 \
        --username supabase_admin --dbname "$TEST_DATABASE_NAME"
    '
}

cleanup_fixture() {
  local restore_net_sql=""
  local principal

  if [[ "$provisioned" -ne 1 ]]; then
    return 0
  fi

  if [[ "$net_public_usage_before" == "t" ]]; then
    restore_net_sql="grant usage on schema net to public;"
  fi

  if ! {
    printf '%s\n' "begin;"
    for principal in "${principals[@]}"; do
      printf 'drop role if exists %s;\n' "${principal}_login"
    done
    printf '%s\n' \
      "delete from public.cognitive_service_identities" \
      "where service_identity = 'cognitive_model_router';"
    if [[ -n "$restore_net_sql" ]]; then
      printf '%s\n' "$restore_net_sql"
    fi
    printf '%s\n' "commit;"
  } | admin_psql >/dev/null 2>&1
  then
    return 1
  fi

  provisioned=0
}

on_exit() {
  local status="$?"
  trap - EXIT INT TERM

  if ! cleanup_fixture; then
    status=1
  fi

  unset service_token
  unset runtime_passwords

  if [[ "$status" -ne 0 ]]; then
    echo "FAIL:${test_stage}" >&2
  fi
  exit "$status"
}
trap on_exit EXIT INT TERM

test_stage="container_preflight"
if ! docker inspect "$database_container" >/dev/null 2>&1; then
  exit 1
fi

net_public_usage_before="$(
  docker exec "$database_container" \
    psql --no-psqlrc --quiet --tuples-only --no-align \
      --username postgres --dbname "$database_name" \
      --command "
        select exists (
          select 1
          from pg_catalog.pg_namespace namespace
          cross join lateral pg_catalog.aclexplode(
            coalesce(
              namespace.nspacl,
              pg_catalog.acldefault('n', namespace.nspowner)
            )
          ) schema_acl
          where namespace.nspname = 'net'
            and schema_acl.grantee = 0
            and schema_acl.privilege_type = 'USAGE'
        );
      " 2>/dev/null
)"
test_stage="net_acl_preflight"
if [[ "$net_public_usage_before" != "t" \
   && "$net_public_usage_before" != "f" ]]; then
  exit 1
fi

# Provision all ten disposable LOGIN identities atomically. Closing the local
# pg_net PUBLIC fallback proves that the reviewed closed-world preflight becomes
# true before any password-bearing role is created.
test_stage="fixture_provisioning"
if ! {
  printf '%s\n' "begin;"
  for principal in "${principals[@]}"; do
    printf '%s\n' \
      "select 'select 1 / 0'" \
      "where to_regrole('${principal}_login') is not null" \
      "\\gexec"
  done
  printf '%s\n' \
    "select 'select 1 / 0'" \
    "where exists (" \
    "  select 1 from public.cognitive_service_identities" \
    "  where service_identity = 'cognitive_model_router'" \
    ")" \
    "\\gexec" \
    "revoke usage on schema net from public;" \
    "select 'select 1 / 0'" \
    "where not cognitive_runtime.runtime_login_provisioning_ready()" \
    "\\gexec"

  index=0
  for principal in "${principals[@]}"; do
    printf "\\set runtime_password '%s'\n" "${runtime_passwords[$index]}"
    printf '%s\n' \
      "create role ${principal}_login" \
      "  login nosuperuser nocreatedb nocreaterole inherit" \
      "  noreplication nobypassrls password :'runtime_password';" \
      "revoke create, temporary on database ${database_name}" \
      "  from ${principal}_login;" \
      "alter role ${principal}_login" \
      "  set search_path = cognitive_runtime, pg_catalog;" \
      "alter role ${principal}_login set statement_timeout = '15s';" \
      "alter role ${principal}_login" \
      "  set idle_in_transaction_session_timeout = '10s';" \
      "alter role ${principal}_login set lock_timeout = '3s';" \
      "select format(" \
      "  'alter role %I valid until %L'," \
      "  '${principal}_login'," \
      "  transaction_timestamp() + interval '10 minutes'" \
      ")" \
      "\\gexec" \
      "grant ${principal} to ${principal}_login" \
      "  with admin false, inherit true, set false;"
    index=$((index + 1))
  done

  printf "\\set service_token '%s'\n" "$service_token"
  printf '%s\n' \
    "insert into public.cognitive_service_identities(" \
    "  service_identity, credential_hash, status, issued_at," \
    "  expires_at, revoked_at" \
    ") values (" \
    "  'cognitive_model_router'," \
    "  encode(" \
    "    extensions.digest(convert_to(:'service_token', 'UTF8'), 'sha256')," \
    "    'hex'" \
    "  )," \
    "  'active'," \
    "  transaction_timestamp()," \
    "  transaction_timestamp() + interval '1 hour'," \
    "  null" \
    ");" \
    "commit;"
} | admin_psql >/dev/null 2>&1
then
  exit 1
fi
provisioned=1

run_runtime_assertions() {
  local index="$1"
  local principal="${principals[$index]}"
  local runtime_login="${principal}_login"
  local runtime_password="${runtime_passwords[$index]}"
  local operations="${operation_sets[$index]}"
  local wrappers="${wrapper_sets[$index]}"
  local sibling_index=$(((index + 1) % ${#principals[@]}))
  local sibling="${principals[$sibling_index]}"

  PGPASSWORD="$runtime_password" TEST_SERVICE_TOKEN="$service_token" \
    docker exec -i \
      -e PGPASSWORD \
      -e TEST_SERVICE_TOKEN \
      "$database_container" \
      psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 \
        --host 127.0.0.1 --port 5432 \
        --username "$runtime_login" --dbname "$database_name" \
        >/dev/null 2>&1 <<SQL
\getenv service_token TEST_SERVICE_TOKEN
select set_config(
  'cognitive.runtime_login_test.service_token',
  :'service_token',
  false
);
select set_config(
  'request.jwt.claim.role',
  'authenticated',
  false
);

do \$integration\$
declare
  expected_operations text[] := string_to_array('${operations}', ',');
  expected_wrappers text[] := string_to_array('${wrappers}', ',');
  canonical_expected_wrappers text[];
  observed_wrappers text[];
  observed_schemas text[];
  grant_test_wrapper oid;
  operation_name text;
  result_value jsonb;
  login_value pg_catalog.pg_roles%rowtype;
  membership_count integer;
  membership_is_exact boolean;
begin
  if session_user <> '${runtime_login}' then
    raise exception 'runtime_login_session_identity_rejected';
  end if;

  select * into login_value
  from pg_catalog.pg_roles
  where rolname = session_user;
  if login_value.rolname is null
     or not login_value.rolcanlogin
     or login_value.rolsuper
     or login_value.rolcreatedb
     or login_value.rolcreaterole
     or not login_value.rolinherit
     or login_value.rolreplication
     or login_value.rolbypassrls
     or login_value.rolvaliduntil is null
     or login_value.rolvaliduntil <= transaction_timestamp()
     or cardinality(coalesce(login_value.rolconfig, '{}'::text[])) <> 4
     or (
       coalesce(login_value.rolconfig, '{}'::text[]) @> array[
         'search_path=cognitive_runtime, pg_catalog',
         'statement_timeout=15s',
         'idle_in_transaction_session_timeout=10s',
         'lock_timeout=3s'
       ]::text[]
     ) is not true then
    raise exception 'runtime_login_attribute_contract_rejected';
  end if;

  select
    count(*)::integer,
    coalesce(
      bool_and(
        granted_role.rolname = '${principal}'
        and not membership.admin_option
        and membership.inherit_option
        and not membership.set_option
      ),
      false
    )
  into membership_count, membership_is_exact
  from pg_catalog.pg_auth_members membership
  join pg_catalog.pg_roles member_role
    on member_role.oid = membership.member
  join pg_catalog.pg_roles granted_role
    on granted_role.oid = membership.roleid
  where member_role.rolname = session_user;
  if membership_count <> 1 or not membership_is_exact then
    raise exception 'runtime_login_membership_contract_rejected';
  end if;

  if not pg_catalog.has_database_privilege(
       session_user, current_database(), 'CONNECT'
     )
     or pg_catalog.has_database_privilege(
       session_user, current_database(), 'CREATE'
     )
     or pg_catalog.has_database_privilege(
       session_user, current_database(), 'TEMPORARY'
     ) then
    raise exception 'runtime_login_database_privilege_rejected';
  end if;

  select pg_catalog.array_agg(namespace.nspname order by namespace.nspname)
  into observed_schemas
  from pg_catalog.pg_namespace namespace
  where namespace.nspname not like 'pg_temp_%'
    and namespace.nspname not like 'pg_toast_temp_%'
    and pg_catalog.has_schema_privilege(
      session_user,
      namespace.oid,
      'USAGE'
    );
  if observed_schemas is distinct from array[
       'cognitive_runtime',
       'information_schema',
       'pg_catalog'
     ]::text[] then
    raise exception 'runtime_login_schema_contract_rejected';
  end if;

  foreach operation_name in array expected_operations
  loop
    result_value := cognitive_runtime.runtime_role_preflight(
      '${principal}',
      operation_name
    );
    if coalesce((result_value->>'allowed')::boolean, false) is not true
       or result_value->>'principal' <> '${principal}'
       or result_value->>'operation' <> operation_name then
      raise exception 'runtime_login_operation_preflight_rejected';
    end if;
  end loop;

  result_value := cognitive_runtime.runtime_revocation_status('${principal}');
  if result_value->>'principal' <> '${principal}'
     or coalesce(
       (result_value->>'databaseAccessRevoked')::boolean,
       true
     ) then
    raise exception 'runtime_login_revocation_status_rejected';
  end if;

  select pg_catalog.array_agg(wrapper_name order by wrapper_name)
  into canonical_expected_wrappers
  from pg_catalog.unnest(expected_wrappers) wrapper_name;

  select pg_catalog.array_agg(procedure.proname order by procedure.proname)
  into observed_wrappers
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'cognitive_runtime'
    and procedure.proname not in (
      'runtime_role_preflight',
      'runtime_revocation_status'
    )
    and pg_catalog.has_function_privilege(
      session_user,
      procedure.oid,
      'EXECUTE'
    );
  if observed_wrappers is distinct from canonical_expected_wrappers then
    raise exception 'runtime_login_wrapper_acl_rejected';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'cognitive_runtime'
      and procedure.proname <> all(expected_wrappers)
      and procedure.proname not in (
        'runtime_role_preflight',
        'runtime_revocation_status'
      )
      and pg_catalog.has_function_privilege(
        session_user,
        procedure.oid,
        'EXECUTE'
      )
  ) then
    raise exception 'runtime_login_sibling_execute_grant_rejected';
  end if;

  begin
    execute 'select count(*) from public.intelligence_tasks';
    raise exception 'runtime_login_direct_select_did_not_fail';
  exception
    when insufficient_privilege then null;
  end;
  begin
    execute 'delete from public.intelligence_tasks where false';
    raise exception 'runtime_login_direct_dml_did_not_fail';
  exception
    when insufficient_privilege then null;
  end;
  begin
    execute
      'create table cognitive_runtime.runtime_login_forbidden(id integer)';
    raise exception 'runtime_login_object_create_did_not_fail';
  exception
    when insufficient_privilege then null;
  end;
  begin
    execute 'create temporary table runtime_login_forbidden(id integer)';
    raise exception 'runtime_login_temp_create_did_not_fail';
  exception
    when insufficient_privilege then null;
  end;
  select procedure.oid into grant_test_wrapper
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'cognitive_runtime'
    and procedure.proname = expected_wrappers[1];
  if grant_test_wrapper is null
     or pg_catalog.has_function_privilege(
       session_user,
       grant_test_wrapper,
       'EXECUTE WITH GRANT OPTION'
     )
     or pg_catalog.has_function_privilege(
       '${sibling}',
       grant_test_wrapper,
       'EXECUTE'
     ) then
    raise exception 'runtime_login_grant_precondition_rejected';
  end if;
  execute format(
    'grant execute on function %s to %I',
    grant_test_wrapper::regprocedure,
    '${sibling}'
  );
  if pg_catalog.has_function_privilege(
    '${sibling}',
    grant_test_wrapper,
    'EXECUTE'
  ) then
    raise exception 'runtime_login_grant_mutation_did_not_fail';
  end if;
  if '${principal}' = 'cognitive_model_router' then
    result_value := cognitive_runtime.cognitive_model_router_recover_expired(
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      1,
      repeat('a', 64),
      current_setting('cognitive.runtime_login_test.service_token')
    );
    if result_value ->> 'recoveredCount' <> '0' then
      raise exception 'runtime_login_bridge_result_rejected';
    end if;
    if current_setting('request.jwt.claim.role', true) <> 'authenticated' then
      raise exception 'runtime_login_success_claim_restore_rejected';
    end if;

    begin
      perform cognitive_runtime.cognitive_model_router_recover_expired(
        'ffffffff-ffff-4fff-8fff-ffffffffffff',
        0,
        repeat('b', 64),
        current_setting('cognitive.runtime_login_test.service_token')
      );
      raise exception 'runtime_login_failure_fixture_did_not_fail';
    exception
      when sqlstate 'P0001' then
        if sqlerrm <> 'model_router_recovery_rejected' then
          raise;
        end if;
    end;
    if current_setting('request.jwt.claim.role', true) <> 'authenticated' then
      raise exception 'runtime_login_failure_claim_restore_rejected';
    end if;
  end if;
end;
\$integration\$;

\set ON_ERROR_STOP off
set role ${sibling};
\set set_role_sqlstate :SQLSTATE
\set ON_ERROR_STOP on
select :'set_role_sqlstate' = '42501' as set_role_denied
\gset
\if :set_role_denied
\else
select 1 / 0;
\endif

\! sh -c 'PGPASSWORD="\${POSTGRES_PASSWORD:?}" psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 --username supabase_admin --dbname ${database_name} --command "alter role ${runtime_login} valid until \$\$2000-01-01 00:00:00+00\$\$" >/dev/null 2>&1'
\if :SHELL_ERROR
\quit 1
\endif

do \$expiry\$
begin
  begin
    perform cognitive_runtime.runtime_role_preflight(
      '${principal}',
      '${operations%%,*}'
    );
    raise exception 'runtime_login_expiry_did_not_fail';
  exception
    when sqlstate '42501' then
      if sqlerrm <> 'cognitive_runtime_principal_rejected' then
        raise;
      end if;
  end;
end;
\$expiry\$;

\! sh -c 'PGPASSWORD="\${POSTGRES_PASSWORD:?}" psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 --username supabase_admin --dbname ${database_name} --command "alter role ${runtime_login} valid until \$\$infinity\$\$; revoke ${principal} from ${runtime_login}" >/dev/null 2>&1'
\if :SHELL_ERROR
\quit 1
\endif

do \$revocation\$
begin
  begin
    perform cognitive_runtime.runtime_role_preflight(
      '${principal}',
      '${operations%%,*}'
    );
    raise exception 'runtime_login_revocation_did_not_fail';
  exception
    when insufficient_privilege then null;
  end;
end;
\$revocation\$;
SQL
}

# Keep each TCP-authenticated psql session alive across its permission matrix,
# expiry check, and membership revocation check. The model-router session also
# exercises one successful and one failed legacy-claim bridge without product
# mutation.
test_stage="runtime_assertions"
index=0
for principal in "${principals[@]}"; do
  test_stage="runtime_assertions:${principal}"
  if ! run_runtime_assertions "$index"; then
    exit 1
  fi
  index=$((index + 1))
done

# Restore the exact principal memberships after the same-session revocation
# assertions so the bounded helper is tested against ten independently capable
# logins rather than an already-revoked fixture.
test_stage="restore_memberships_for_bounded_revocation"
if ! {
  printf '%s\n' "begin;"
  for principal in "${principals[@]}"; do
    printf 'grant %s to %s_login with admin false, inherit true, set false;\n' \
      "$principal" "$principal"
  done
  printf '%s\n' "commit;"
} | admin_psql >/dev/null 2>&1
then
  exit 1
fi

# Execute the reviewed bounded revocation helper itself against one disposable
# login. The other nine logins must retain LOGIN, membership, and live preflight
# capability, proving that revoke-one does not silently broaden into the
# preserved global revoke.
test_stage="bounded_single_principal_revocation"
bounded_revoke_output="$(
  docker exec -i \
    -e TEST_DATABASE_NAME="$database_name" \
    "$database_container" bash -c '
    set -euo pipefail
    service_file="$(mktemp)"
    chmod 600 "$service_file"
    trap '\''rm -f "$service_file"'\'' EXIT
    printf "%s\n" \
      "[local_admin]" \
      "host=/var/run/postgresql" \
      "port=5432" \
      "dbname=${TEST_DATABASE_NAME:?}" \
      "user=supabase_admin" >"$service_file"
    PGSERVICEFILE="$service_file" \
      PGSERVICE=local_admin \
      PGPASSWORD="${POSTGRES_PASSWORD:?}" \
      bash -s -- revoke-one cognitive_level01_scheduler
  ' <"$repository_root/scripts/provision-cognitive-level01-runtime-logins.sh"
)"
if [[ "$bounded_revoke_output" != "PRESENT" ]]; then
  exit 1
fi
unset bounded_revoke_output

bounded_revoke_state="$(
  docker exec "$database_container" \
    psql --no-psqlrc --quiet --tuples-only --no-align \
      --username postgres --dbname "$database_name" \
      --command "
        select case
          when (
            select not rolcanlogin
            from pg_catalog.pg_roles
            where rolname = 'cognitive_level01_scheduler_login'
          )
          and (
            select count(*) = 9
            from pg_catalog.pg_auth_members membership
            join pg_catalog.pg_roles granted_role
              on granted_role.oid = membership.roleid
            join pg_catalog.pg_roles member_role
              on member_role.oid = membership.member
            where member_role.rolname = any(array[
              'cognitive_product_baseline_executor_login',
              'cognitive_sentinel_collector_login',
              'cognitive_product_quality_evaluator_login',
              'cognitive_product_quality_triage_login',
              'cognitive_public_research_broker_login',
              'cognitive_research_evaluator_login',
              'cognitive_model_router_login',
              'cognitive_livekit_experience_collector_login',
              'cognitive_github_draft_pr_broker_login'
            ]::text[])
              and member_role.rolcanlogin
              and granted_role.rolname
                    = regexp_replace(member_role.rolname, '_login$', '')
              and not membership.admin_option
              and membership.inherit_option
              and not membership.set_option
          )
          then 'MATCH'
          else 'MISMATCH'
        end;
      " 2>/dev/null
)"
if [[ "$bounded_revoke_state" != "MATCH" ]]; then
  exit 1
fi
unset bounded_revoke_state

test_stage="bounded_single_principal_sibling_capability"
index=0
while [[ "$index" -lt 9 ]]; do
  principal="${principals[$index]}"
  runtime_login="${principal}_login"
  runtime_password="${runtime_passwords[$index]}"
  operation="${operation_sets[$index]%%,*}"
  if ! PGPASSWORD="$runtime_password" docker exec -i \
    -e PGPASSWORD \
    "$database_container" \
    psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 \
      --host 127.0.0.1 --port 5432 \
      --username "$runtime_login" --dbname "$database_name" \
      >/dev/null 2>&1 \
      --command "select cognitive_runtime.runtime_role_preflight('${principal}', '${operation}');"
  then
    exit 1
  fi
  index=$((index + 1))
done

test_stage="fixture_cleanup"
cleanup_fixture
unset service_token
unset runtime_passwords
test_stage="complete"
echo "PASS"
