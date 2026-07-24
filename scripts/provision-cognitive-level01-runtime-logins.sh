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
if [[ "$action" != "provision" && "$action" != "revoke" ]]; then
  echo "usage: $0 provision|revoke" >&2
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

if [[ "$action" == "provision" ]]; then
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
fi

for principal in "${principals[@]}"; do
  login_role="${principal}_login"
  password_env="$(printf '%s' "${principal}_password" | tr '[:lower:]' '[:upper:]')"

  if [[ "$action" == "provision" ]]; then
    if [[ -z "${!password_env:-}" ]]; then
      echo "MISSING" >&2
      exit 1
    fi

    psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 >/dev/null <<SQL
begin;
\getenv runtime_password ${password_env}
select format(
  'create role %I login nosuperuser nocreatedb nocreaterole inherit noreplication nobypassrls',
  '${login_role}'
)
where not exists (
  select 1 from pg_catalog.pg_roles where rolname = '${login_role}'
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
  login inherit
  password :'runtime_password';
alter role "${login_role}" set search_path = cognitive_runtime, pg_catalog;
alter role "${login_role}" set statement_timeout = '15s';
alter role "${login_role}" set idle_in_transaction_session_timeout = '10s';
alter role "${login_role}" set lock_timeout = '3s';
grant "${principal}" to "${login_role}";
commit;
SQL
  else
    psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 >/dev/null <<SQL
begin;
select format('alter role %I nologin', '${login_role}')
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
  fi
done

echo "PRESENT"
