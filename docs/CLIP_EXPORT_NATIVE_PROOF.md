# Native Clip export contention proof

After the local Supabase migration chain is applied:

```sh
SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-clip-export-concurrency-postgres.mjs
```

The runner reads only the local CLI source database and restores an owned,
generated disposable clone with the existing Brand guard restoration adapter.
All writes are synthetic fixture writes in that clone. It refuses remote Docker
contexts and arbitrary target arguments. No providers, deployed settings or
credentials are changed; triggers and production functions stay intact.

The extracted fixture creates a real authenticated request, claims the worker,
reserves exact secondary output, supplies an explicitly synthetic receipt and
seals the producer. Each schedule uses independent PostgreSQL connections and
executes the actual API/mutation before retaining its natural transaction locks.
`pg_blocking_pids` must show the exact holder blocking the waiter. No injected
row lock stands in for the tested operation.

Eight schedules cover both commit and rollback for cancellation before finish,
finish before cancellation, source replacement before finish and worker disable
before finish. Assertions require one private, pending-scan, correctly owned
draft with two retention bindings on success, or no draft and only the original
binding on rejection. Cleanup uses the real failure API and drops only the
generated clone.

The local PGlite test validates this same fixture and authorization paths, but
does not establish native contention. This environment has no Docker binary;
the native command must pass in hosted Required Validation before claiming the
concurrency proof complete.
