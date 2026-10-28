# Reproduce native profile SQL checks locally

These tests create and drop **disposable local databases**. They are not a
production migration runner, provider transport test, physical-device test, or
production capacity qualification. Do not point them at a shared or production
server. The canonical fixture substitutes managed Auth/Storage/Cron services;
the same explicit fixture exclusions apply to embedded and native runs.

## Prerequisites

Use an unprivileged local account, Node.js, and PostgreSQL server tools
(`initdb`, `postgres`, `pg_isready`) on PATH, including the fixture's required
extensions such as pgcrypto and pg_trgm. The recorded native engine is
PostgreSQL 17.11. Install node-postgres 8.16.3 from the official npm registry in a
separate directory, not as an application dependency:

```sh
npm install --prefix /absolute/disposable/pg-driver --ignore-scripts --no-save pg@8.16.3
export NATIVE_PG_DRIVER=/absolute/disposable/pg-driver/node_modules/pg/lib/index.js
export NATIVE_PG_ADAPTER="$PWD/tests/helpers/native-profile-database.mjs"
```

The adapter requires the exact driver version and an absolute local module
path. It refuses non-IPv4-loopback hosts, connection URLs, saved credentials,
service/host-address overrides and SSL overrides. It will not answer a password
authentication challenge. Local trust authentication must therefore be confined
to the new disposable cluster and loopback listener below. This is not a
recommendation to change an existing database's authentication settings.

## Fresh cluster per test

Run from the repository root, choosing a free local port. Start the server and
client in the same shell/network environment. Use a fresh cluster for **each**
canonical test because fixture roles are cluster-global. Save this function in
the current shell:

```sh
native_profile_test() (
  set -eu
  export PGHOST=127.0.0.1 PGPORT=55433 PGUSER=postgres PGDATABASE=postgres
  unset PGHOSTADDR PGSERVICE PGSERVICEFILE PGPASSWORD PGPASSFILE PGOPTIONS
  unset PGSSLMODE PGSSLCERT PGSSLKEY DATABASE_URL
  data=$(mktemp -d)
  initdb -D "$data" -U postgres -A trust --no-locale -E UTF8 > "$data-init.log"
  postgres -D "$data" -c unix_socket_directories='' -c listen_addresses=127.0.0.1 \
    -p "$PGPORT" > "$data/server.log" 2>&1 &
  server=$!
  trap 'kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true' EXIT
  ready=0
  for attempt in $(seq 1 100); do
    if pg_isready -q; then ready=1; break; fi
    kill -0 "$server"
    sleep 0.1
  done
  test "$ready" = 1
  kill -0 "$server"
  node "$@"
)
native_profile_test supabase/tests/profile_feed_guarded_candidates.test.mjs
native_profile_test supabase/tests/profile_engagement_counters.test.mjs
native_profile_test supabase/tests/profile_relationship_feed_cursor.test.mjs
native_profile_test scripts/test-profile-migration-transaction-guards.mjs
```

The adapter only drops its randomly generated `profile_replay_…` database. The
wrapper stops its own server and intentionally retains the temporary cluster
and logs for diagnosis; remove them only after reviewing the evidence. Do not
reuse a cluster that failed setup or use a forwarded port to another server.

Optional synthetic scale measurements are enabled by the environment flags
documented at the top of the corresponding test. Record engine, hardware,
source hashes, data size, query plans and competing work. Sequential read
timings are not concurrent throughput. Fixture-only trigger suppression used
for large synthetic seeding is not a write-throughput test.

The separate checked-in `scripts/test-profile-engagement-concurrency.mjs`
tests real competing PostgreSQL sessions, but uses minimal source tables.
Neither those cases nor this adapter alone prove complete account-purge or
provider behavior. Adapter guard/lifecycle regression tests run with
`node --test tests/native-profile-database-adapter.test.mjs` and intentionally
do not start a database.
