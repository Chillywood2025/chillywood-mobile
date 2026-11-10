# Exact shared exclusion forward deployment

This is source preparation, not an executor or activation decision. The sole
runtime addition is the exact merged `exclusion.sql` function. No old48 module,
role, helper, control, journal, receipt or runtime row is recreated or changed.

`deployment-source.json` binds the original merged source, exact byte/body hash,
native PostgreSQL definition hash, and CLI-generated fixed migration identity.
Supabase CLI 3.1.0 generated
`20261110021153_revenuecat_native_legacy_exclusion_v1.sql` using the supported
local `migration new` command. The migration is deliberately outside the
automatic `supabase/migrations` chain. Its one history statement is exactly the
existing `exclusion.sql` bytes, including comments and final newline.

## Offline packet

Run the seven `deployment-queries/*.sql` packets separately through the genuine
read-only connection. Each is one result set, with a 4-second statement budget,
5-second transaction deadline, 500-millisecond lock timeout, disabled JIT and
parallel workers, and 1 MiB work memory. They return metadata only. Never flatten
different observations into an assertion that they were one snapshot. The write
envelope rechecks the full expected small metadata set under its own transaction.

Build the `baseline` array from packets 02, 04, 05 and 06, plus packet 03 rows
wrapped as `{kind: 'eventTrigger', metadata: row}`. Context comes from packet 00.
Packet 01 must show no overload with the new function name. No history trigger
or rewrite rule is accepted. Supply the pinned `deployment-contract.json`.

The public `buildPacket({commit, baseline, contract, context})` path verifies all
deployment artifacts against the specified Git commit with replace objects
disabled. It also verifies that the function bytes still equal the original
merged source, and requires the exact known old48 history receipt hash. A dirty,
uncommitted, wrong-source, changed-definition or arbitrary old48 receipt cannot
produce a qualified public packet. The separate local fixture builder only emits
SQL bound to database `shared_exclusion_fixture`, never the hosted `postgres`.
The fixed version must be later than current migration history. This shared
extension's CLI identity precedes the separately generated Play extension, so
apply it first if both are independently qualified. Refresh metadata before
each deployment; never reuse the original baseline after another migration.

The standalone writer transaction has one non-renewed 20-second total deadline,
while each statement retains its 4-second deadline and each lock wait remains
bounded to 500 milliseconds. The total covers the repeated catalog/history
scans, checks and atomic receipt, rather than allowing any one statement more
time. The seven reader packets and independent readback retain their 4-second
statement and 5-second transaction deadlines. A read-cost measurement is not a
guarantee that the complete writer transaction will fit its deadline.
It requires the real `postgres` session/current identity, pinned database start
and PostgreSQL 17.6, an advisory fence, NOWAIT ACCESS SHARE locks on its ten
dependencies, and a NOWAIT SHARE ROW EXCLUSIVE migration-history lock. Runtime
writes to dependencies are not blocked by those ACCESS SHARE installation locks.

Before commit it verifies the exact function body, definition, arguments,
return type, language, security mode, search path, lock timeout, volatility,
parallel/strict/leakproof attributes, cost, comment, owner, semantic ACL and
effective anon/authenticated/service privileges. It requires unchanged defaults,
roles, memberships, event-trigger definitions and dependency metadata. Rowwise
temporary snapshots and sort-based EXCEPT ALL preserve retained catalog rows,
existing function OIDs and related object identities, and all prior history.
There is no large catalog JSON aggregate or permanent verification helper.

Exactly one fixed-version history row is inserted atomically. Defaults and
event triggers are retained, not disabled, replaced or relaxed. Every failed
precondition, postcondition, lock or deadline rolls back the function and receipt.
The function itself takes SHARE NOWAIT inventory locks at runtime and fails
closed when busy. "Read-only proof" means no table DML, not that valid execution
is compatible with a PostgreSQL READ ONLY transaction.

## Independent committed readback

`readbackSQL(contract, baseline)` runs separately after the write connection has
ended, through the actual `supabase_read_only_user` session. It checks function
metadata, exact single source receipt, unchanged old48 receipt and the retained
small relevant metadata set in one repeatable-read read-only observation. The
classifier rejects role impersonation, microsecond-level database-start drift,
missing/extra/changed receipts, grants, functions, or relevant dependencies.

`classifyReadback` never grants retry permission, including after a lost reply.
Its successful classification is only
`exact_function_receipt_and_dependencies_observed_runtime_unqualified`.
It does not independently rescan the entire global catalog after commit; the
transactional retained-catalog check and the transport's confirmed single
dispatch remain separate evidence. Read the existing qualified private-state
reader separately to establish native controls remain off. Do not weaken that
reader or infer empty runtime state from catalog metadata.

## Required operational gates

- Freeze these exact artifacts in Git, review the final diff and pass Required
  Validation on that exact head before target dispatch.
- Use a separately reviewed, durable once-only Management API `database/query`
  writer that preserves this single transaction and manual identity. The generic
  `apply_migration` API generates its own version and is not this transport.
  This module contains no transport, credentials, network calls or retry loop.
- Qualify target identity, health, capacity, request size, response semantics,
  once-only dispatch and uncertain-response recovery for this exact packet.
- Coordinate administrative DDL through validation, write and readback. Locks
  and before/after snapshots do not exclude arbitrary concurrent admin DDL.
- After any uncertain outcome, stop writes and perform independent committed
  readback. Do not replay the old48 bundle or retry this extension automatically.
- Provider routes, environment flags and buying remain off. This deployment
  cannot qualify provider, normal-build, device or no-charge settlement evidence.

## Local proof

`node isolated-runtime/native-store-shared-routing-v1/deployment.native.mjs
--local-bin /absolute/path/to/pg17/bin` owns a disposable native PostgreSQL 17.6
cluster. It replays actual legacy migrations but not old48, models the eight
observed event triggers, then uses a non-superuser installer and a genuine
read-only session. It proves rollback on altered source/defaults/grants/history,
same-definition old-function recreation with changed OID, extra objects,
contention and deadlines, including cumulative transaction timeout after the
receipt with individually sub-4-second statements; exact commit/readback; and
refusal to repeat a commit.
The existing shared routing test independently exercises the real handler and
legacy migrated SQL with purchase/replay/refund/collision/obligation coverage.
Neither test is hosted execution or activation proof.
