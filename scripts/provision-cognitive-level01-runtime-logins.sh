#!/usr/bin/env bash
set -euo pipefail

# Owner-only provisioning helper. It never generates, writes, or prints a
# credential. Configure a reviewed libpq PGSERVICE for the administrative
# connection and provide each independent password through the named process
# environment variable. Do not run this script with shell tracing enabled.

if [[ "${-}" == *x* ]]; then
  echo "shell tracing must be disabled" >&2
  exit 1
fi

if [[ -z "${PGSERVICE:-}" ]]; then
  echo "PGSERVICE is required" >&2
  exit 1
fi

action="${1:-}"
if [[ "$action" != "provision" \
   && "$action" != "revoke" \
   && "$action" != "revoke-one" ]]; then
  echo "usage: $0 provision|revoke|revoke-one <principal>" >&2
  exit 2
fi

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

principal_is_allowed() {
  local requested_principal="$1"
  local principal

  for principal in "${principals[@]}"; do
    if [[ "$principal" == "$requested_principal" ]]; then
      return 0
    fi
  done
  return 1
}

revoke_principal() {
  local principal="$1"
  local login_role="${principal}_login"

  psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 >/dev/null <<SQL
begin;
select format(
  'alter role %I nologin valid until %L',
  '${login_role}',
  transaction_timestamp()
)
where exists (
  select 1 from pg_catalog.pg_roles where rolname = '${login_role}'
)
\gexec
select format('revoke %I from %I', '${principal}', '${login_role}')
where exists (
  select 1
  from pg_catalog.pg_auth_members membership
  join pg_catalog.pg_roles granted_role
    on granted_role.oid = membership.roleid
  join pg_catalog.pg_roles member_role
    on member_role.oid = membership.member
  where granted_role.rolname = '${principal}'
    and member_role.rolname = '${login_role}'
)
\gexec
select format('alter role %I reset all', '${login_role}')
where exists (
  select 1 from pg_catalog.pg_roles where rolname = '${login_role}'
)
\gexec
select pg_catalog.pg_terminate_backend(activity.pid)
from pg_catalog.pg_stat_activity activity
where activity.usename = '${login_role}'
  and activity.pid <> pg_catalog.pg_backend_pid();
commit;
SQL
}

if [[ "$action" == "provision" ]]; then
  if [[ "$#" -ne 1 ]]; then
    echo "MISMATCH" >&2
    exit 1
  fi

  # Validate the complete credential set before the first database mutation so
  # a missing later password cannot leave a partially provisioned role set.
  observed_passwords=()
  for principal in "${principals[@]}"; do
    password_env="$(printf '%s' "${principal}_password" | tr '[:lower:]' '[:upper:]')"
    runtime_password="${!password_env:-}"
    if [[ ${#runtime_password} -lt 40 ]]; then
      echo "MISSING" >&2
      exit 1
    fi
    for observed_password in "${observed_passwords[@]}"; do
      if [[ "$runtime_password" == "$observed_password" ]]; then
        echo "MISMATCH" >&2
        exit 1
      fi
    done
    observed_passwords+=("$runtime_password")
    unset runtime_password
  done

  # PostgreSQL has no per-role DENY for privileges inherited from PUBLIC.
  # Refuse to create any password-bearing login while an application/provider
  # schema remains reachable through that fallback. Supabase currently owns the
  # pg_net schema as supabase_admin, so this check also prevents a normal
  # migration role from mistaking an ineffective REVOKE for isolation.
  psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 >/dev/null <<'SQL'
select 'select 1 / 0'
where not cognitive_runtime.runtime_login_provisioning_ready()
\gexec
SQL

  # Emit one transaction for all principals. A failure in any later role rolls
  # back every earlier role mutation from the same provisioning attempt.
  {
    printf '%s\n' 'begin;'
    for principal in "${principals[@]}"; do
      login_role="${principal}_login"
      password_env="$(printf '%s' "${principal}_password" | tr '[:lower:]' '[:upper:]')"
      cat <<SQL
\getenv runtime_password ${password_env}
select exists (
  select 1 from pg_catalog.pg_roles where rolname = '${login_role}'
) as login_role_preexisting
\gset
select format(
  'create role %I login nosuperuser nocreatedb nocreaterole inherit noreplication nobypassrls connection limit 6',
  '${login_role}'
)
where not exists (
  select 1 from pg_catalog.pg_roles where rolname = '${login_role}'
)
\gexec
select format(
  'revoke create, temporary on database %I from %I',
  current_database(),
  '${login_role}'
)
\gexec
select 'select 1 / 0'
where exists (
  select 1
  from pg_catalog.pg_roles
  where rolname = '${login_role}'
    and (
      rolsuper
      or rolcreatedb
      or rolcreaterole
      or rolreplication
      or rolbypassrls
      or rolconnlimit <> 6
      or pg_catalog.has_database_privilege(
        rolname,
        current_database(),
        'CREATE'
      )
      or pg_catalog.has_database_privilege(
        rolname,
        current_database(),
        'TEMPORARY'
      )
      or exists (
        select 1
        from pg_catalog.pg_namespace namespace
        where namespace.nspowner = pg_roles.oid
      )
      or exists (
        select 1
        from pg_catalog.pg_class relation
        where relation.relowner = pg_roles.oid
      )
      or exists (
        select 1
        from pg_catalog.pg_proc procedure
        where procedure.proowner = pg_roles.oid
      )
      or exists (
        select 1
        from pg_catalog.pg_type type_value
        where type_value.typowner = pg_roles.oid
      )
      or (
        :'login_role_preexisting'::boolean
        and (
          (
            rolcanlogin
            and (
              coalesce(rolconfig, '{}'::text[]) @>
                array[
                  'search_path=cognitive_runtime, pg_catalog',
                  'statement_timeout=15s',
                  'idle_in_transaction_session_timeout=10s',
                  'lock_timeout=3s'
                ]::text[]
            ) is not true
          )
          or (
            rolcanlogin
            and cardinality(coalesce(rolconfig, '{}'::text[])) <> 4
          )
          or (
            not rolcanlogin
            and cardinality(coalesce(rolconfig, '{}'::text[])) <> 0
          )
          or rolvaliduntil is null
          or rolvaliduntil > transaction_timestamp() + interval '31 days'
        )
      )
      or exists (
        select 1
        from pg_catalog.pg_auth_members membership
        join pg_catalog.pg_roles granted_role
          on granted_role.oid = membership.roleid
        where membership.member = pg_roles.oid
          and granted_role.rolname <> '${principal}'
      )
      or exists (
        select 1
        from pg_catalog.pg_auth_members membership
        join pg_catalog.pg_roles granted_role
          on granted_role.oid = membership.roleid
        where membership.member = pg_roles.oid
          and granted_role.rolname = '${principal}'
          and (
            membership.admin_option
            or not membership.inherit_option
            or membership.set_option
          )
      )
      or exists (
        select 1
        from pg_catalog.pg_namespace namespace,
          lateral pg_catalog.aclexplode(
            coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))
          ) acl
        where acl.grantee = pg_roles.oid
      )
      or exists (
        select 1
        from pg_catalog.pg_class relation,
          lateral pg_catalog.aclexplode(
            coalesce(
              relation.relacl,
              acldefault(
                case
                  when relation.relkind = 'S' then 'S'::"char"
                  else 'r'::"char"
                end,
                relation.relowner
              )
            )
          ) acl
        where acl.grantee = pg_roles.oid
      )
      or exists (
        select 1
        from pg_catalog.pg_proc procedure,
          lateral pg_catalog.aclexplode(
            coalesce(procedure.proacl, acldefault('f', procedure.proowner))
          ) acl
        where acl.grantee = pg_roles.oid
      )
    )
)
\gexec
alter role "${login_role}"
  login inherit connection limit 6
  password :'runtime_password';
alter role "${login_role}" set search_path = cognitive_runtime, pg_catalog;
alter role "${login_role}" set statement_timeout = '15s';
alter role "${login_role}" set idle_in_transaction_session_timeout = '10s';
alter role "${login_role}" set lock_timeout = '3s';
select format(
  'alter role %I valid until %L',
  '${login_role}',
  transaction_timestamp() + interval '30 days'
)
\gexec
grant "${principal}" to "${login_role}" with admin false;
grant "${principal}" to "${login_role}" with inherit true;
grant "${principal}" to "${login_role}" with set false;
select 'select 1 / 0'
where not pg_catalog.has_schema_privilege(
            '${login_role}',
            'cognitive_runtime',
            'USAGE'
          )
   or pg_catalog.has_schema_privilege(
        '${login_role}',
        'cognitive_runtime',
        'CREATE'
      )
   or exists (
        select 1
        from pg_catalog.pg_namespace namespace
        where namespace.nspname not in (
                'cognitive_runtime',
                'information_schema',
                'pg_catalog'
              )
          and namespace.nspname not like 'pg_temp_%'
          and namespace.nspname not like 'pg_toast_temp_%'
          and pg_catalog.has_schema_privilege(
            '${login_role}',
            namespace.oid,
            'USAGE'
          )
      )
\gexec
SQL
    done
    printf '%s\n' 'commit;'
  } | psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 >/dev/null

  echo "PRESENT"
  exit 0
fi

if [[ "$action" == "revoke-one" ]]; then
  requested_principal="${2:-}"
  if [[ -z "$requested_principal" ]] \
     || ! principal_is_allowed "$requested_principal"; then
    echo "MISMATCH" >&2
    exit 1
  fi
  if [[ "$#" -ne 2 ]]; then
    echo "MISMATCH" >&2
    exit 1
  fi

  revoke_principal "$requested_principal"
  echo "PRESENT"
  exit 0
fi

if [[ "$#" -ne 1 ]]; then
  echo "MISMATCH" >&2
  exit 1
fi

for principal in "${principals[@]}"; do
  revoke_principal "$principal"
done

echo "PRESENT"
