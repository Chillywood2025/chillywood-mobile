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

for principal in "${principals[@]}"; do
  login_role="${principal}_login"
  password_env="$(printf '%s' "${principal}_password" | tr '[:lower:]' '[:upper:]')"

  if [[ "$action" == "provision" ]]; then
    if [[ -z "${!password_env:-}" ]]; then
      echo "MISSING" >&2
      exit 1
    fi

    psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 >/dev/null <<SQL
\getenv runtime_password ${password_env}
select format(
  'create role %I login nosuperuser nocreatedb nocreaterole inherit noreplication nobypassrls',
  '${login_role}'
)
where not exists (
  select 1 from pg_catalog.pg_roles where rolname = '${login_role}'
)
\gexec
alter role "${login_role}"
  login nosuperuser nocreatedb nocreaterole inherit noreplication nobypassrls
  password :'runtime_password';
revoke service_role from "${login_role}";
revoke authenticated from "${login_role}";
revoke anon from "${login_role}";
grant "${principal}" to "${login_role}";
alter role "${login_role}" set search_path = cognitive_runtime, pg_catalog;
alter role "${login_role}" set statement_timeout = '15s';
alter role "${login_role}" set idle_in_transaction_session_timeout = '10s';
alter role "${login_role}" set lock_timeout = '3s';
SQL
  else
    psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 >/dev/null <<SQL
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
SQL
  fi
done

echo "PRESENT"
