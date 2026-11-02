# Renderer catalog/replay CI repair — 2026-11-02

## Diagnosis

PR #651 Product run `41479160016`, job `125392793947`, at remote head
`ed2b9580ac0b2e6d8eee9ccc4dbecb31af3a1709` exposed an incomplete explicit
November completion inventory, not a missing production-table migration:

- `20261102093836` and `20261102094308` were absent from the file inventory.
- Historical monetization/storefront checkpoints therefore omitted the original
  clip-export table migration but incorrectly replayed its bounded-pool successor.
  The missing `private.creator_clip_export_worker` error was that inconsistent
  historical fixture, not the full ordered migration chain.
- Full-chain totals were short by the nine reviewed new pool function signatures
  and two migrations. The ledger migration adds a table, not a callable function.

The explicit pool inventory now feeds the existing completion inventory,
historical exclusions and count formulas. No baseline totals, assertions,
timeouts, validation selection or SQL migrations were changed.

## Regression coverage and fresh results

The added pre/post-pool SQL catalog test verifies exactly nine added signatures,
six replaced bodies and no removals. Existing OIDs, ABI, ownership, ACLs and
security flags remain identical. It explicitly requires the one intentional
volatility change: safe status moves from immutable to volatile because it reads
current output, worker-session and controller state. All other volatility remains
unchanged. New helpers have no API execution; public worker RPCs are service-only;
all four new private tables have FORCE RLS and no API table privileges. Even a
previously enabled singleton upgrades to OFF/default-one, with no registered
workers, control ledger or scale-to-zero admission.

Fresh final-source command (Node `v24.22.1`, serialized with the shared heavy-test
lock):

```sh
flock /tmp/renderer-heavy-tests.lock \
  node --test --test-concurrency=1 \
  tests/database-runtime-catalog-repair.test.mjs \
  tests/database-runtime-mutation-repair.test.mjs
```

**9/9 passed**, zero failed/cancelled/skipped, `148596.81702 ms`. Both held and
included Studio mutation scenarios each ran 104 real-SQL assertions. The raw
summary is retained in `renderer-db-catalog-ci-20261102.log` beside this note.
Owned-file ESLint with `--max-warnings 0`, syntax checks and `git diff --check`
also passed. An initial development run identified the intended status-volatility
transition; the complete final-source rerun above includes its explicit contract.

These are isolated PGlite catalog/authority checks, not independent-backend race
proof or full Product validation. Native hosted concurrency remains the separate
mandatory gate, and the integrated PR requires fresh exact-head Required
Validation after this repair and the independently owned media fix.

## Immutable/operational boundaries

No migrations were edited. Deployed `20261101141646_creator_clip_export_jobs.sql`
remains SHA256
`1a10cdad08207afac96f39a7afc0a1152908f8c210a9b14c0b03adb3d941b9d5`.
This repair changes tests/inventory only, with no rendering activation,
deployment, live database/provider write, credential, purchase or build action.
