#!/usr/bin/env bash
set -euo pipefail

# Local-only integration test for one isolated Cognitive Level 0/1 database
# LOGIN. Administrative setup uses the local Supabase Postgres container's
# socket; the runtime path reconnects over TCP with the disposable password.
# No credential is written or printed.

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
runtime_principal="cognitive_model_router"
runtime_login="${runtime_principal}_login"
runtime_password="$(openssl rand -hex 32)"
service_token="$(openssl rand -hex 32)"
provisioned=0
net_public_usage_before=""
test_stage="initialization"

admin_psql() {
  docker exec -i \
    -e TEST_LOGIN_PASSWORD="$runtime_password" \
    -e TEST_SERVICE_TOKEN="$service_token" \
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

  if [[ "$provisioned" -ne 1 ]]; then
    return 0
  fi

  if [[ "$net_public_usage_before" == "t" ]]; then
    restore_net_sql="grant usage on schema net to public;"
  fi

  if ! admin_psql >/dev/null 2>&1 <<SQL
begin;
drop role if exists ${runtime_login};
delete from public.cognitive_service_identities
where service_identity = '${runtime_principal}';
${restore_net_sql}
commit;
SQL
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

  unset runtime_password service_token

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

# Provision exactly one disposable LOGIN. Refuse to overwrite any existing
# LOGIN or service identity. The transaction also proves that closing the local
# pg_net PUBLIC fallback makes the reviewed closed-world preflight true.
test_stage="fixture_provisioning"
if ! admin_psql >/dev/null 2>&1 <<'SQL'
\getenv runtime_password TEST_LOGIN_PASSWORD
\getenv service_token TEST_SERVICE_TOKEN
begin;
select 'select 1 / 0'
where to_regrole('cognitive_model_router_login') is not null
   or exists (
        select 1
        from public.cognitive_service_identities
        where service_identity = 'cognitive_model_router'
      )
\gexec
revoke usage on schema net from public;
select 'select 1 / 0'
where not cognitive_runtime.runtime_login_provisioning_ready()
\gexec
create role cognitive_model_router_login
  login nosuperuser nocreatedb nocreaterole inherit noreplication nobypassrls
  password :'runtime_password';
revoke create, temporary on database postgres
  from cognitive_model_router_login;
alter role cognitive_model_router_login
  set search_path = cognitive_runtime, pg_catalog;
alter role cognitive_model_router_login set statement_timeout = '15s';
alter role cognitive_model_router_login
  set idle_in_transaction_session_timeout = '10s';
alter role cognitive_model_router_login set lock_timeout = '3s';
select format(
  'alter role %I valid until %L',
  'cognitive_model_router_login',
  transaction_timestamp() + interval '10 minutes'
)
\gexec
grant cognitive_model_router to cognitive_model_router_login
  with admin false, inherit true, set false;
insert into public.cognitive_service_identities(
  service_identity,
  credential_hash,
  status,
  issued_at,
  expires_at,
  revoked_at
) values (
  'cognitive_model_router',
  encode(
    extensions.digest(convert_to(:'service_token', 'UTF8'), 'sha256'),
    'hex'
  ),
  'active',
  transaction_timestamp(),
  transaction_timestamp() + interval '1 hour',
  null
);
commit;
SQL
then
  exit 1
fi
provisioned=1

# Keep one TCP-authenticated psql session alive across every assertion. The
# successful recovery call has no matching preflight row and therefore performs
# no product mutation; it exists only to exercise the legacy service-role bridge.
test_stage="runtime_assertions"
if ! docker exec -i \
  -e PGPASSWORD="$runtime_password" \
  -e TEST_SERVICE_TOKEN="$service_token" \
  "$database_container" \
  psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 \
    --host 127.0.0.1 --port 5432 \
    --username "$runtime_login" --dbname "$database_name" \
    >/dev/null 2>&1 <<'SQL'
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

do $integration$
declare
  result_value jsonb;
begin
  if session_user <> 'cognitive_model_router_login' then
    raise exception 'runtime_login_session_identity_rejected';
  end if;

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

  if pg_catalog.has_function_privilege(
    session_user,
    'cognitive_runtime.collect_sentinel_run(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz,text,text)',
    'EXECUTE'
  ) then
    raise exception 'runtime_login_sibling_execute_grant_rejected';
  end if;
  begin
    perform cognitive_runtime.runtime_role_preflight(
      'cognitive_sentinel_collector',
      'collect_sentinel_run'
    );
    raise exception 'runtime_login_sibling_preflight_did_not_fail';
  exception
    when sqlstate '42501' then
      if sqlerrm <> 'cognitive_runtime_principal_rejected' then
        raise;
      end if;
  end;
end;
$integration$;

\! psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 --username postgres --dbname postgres --command "alter role cognitive_model_router_login valid until '2000-01-01 00:00:00+00'" >/dev/null 2>&1

do $expiry$
begin
  begin
    perform cognitive_runtime.runtime_role_preflight(
      'cognitive_model_router',
      'recover_model_reservation'
    );
    raise exception 'runtime_login_expiry_did_not_fail';
  exception
    when sqlstate '42501' then
      if sqlerrm <> 'cognitive_runtime_principal_rejected' then
        raise;
      end if;
  end;
end;
$expiry$;
SQL
then
  exit 1
fi

test_stage="fixture_cleanup"
cleanup_fixture
unset runtime_password service_token
test_stage="complete"
echo "PASS"
