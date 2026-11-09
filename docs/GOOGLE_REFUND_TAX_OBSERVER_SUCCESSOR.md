# Refund-tax observer589 successor

This is source preparation, not deployment qualification or authority. The old
social588 runner remains unchanged. Use the distinct observer runner only when
the exact cashout observer is already present.

The successor requires the original 583-entry inventory, three original
predecessors, two social migrations, and the exact
`20261105010859_sandbox_cashout_status_notifications` receipt. Before refund,
history contains 589 entries; after refund it contains 590. The history maximum
remains `20261107191000` because the observer's migration version sorts earlier.
The observer source body is pinned to
`032e549b053e368eef177e23579cd2f6a6db6bce34a908b68ba6ac82b4edb0dc`.

The full catalog projection, guarded data, financial holds, social catalog,
immutable refund DDL and Edge source closure are unchanged. Observer functions,
ACLs, triggers and notification constraint remain inside the full catalog
contract: they are not projected out. The replay test deliberately changes an
observer function grant and proves that apply rejects it. A matching receipt
alone returns only `post_observer_requires_independent_requalification`.

The committed baseline now records the independently authenticated November9
observer589 proof. Raw observed hashes or a partial probe cannot qualify it: the
complete frozen-anchor/source-delta/data/history predicates all passed, and the
exact executed packet plus result digest are retained in the source audit.
The current CLI still refuses apply without a reviewed current Edge readback
transport. SQL installation and the three intended Edge updates require their
own qualified source, current prerequisites and action-specific authorization.

Focused tests cover exact receipt identity, immutable source, pending-state
fail-closed behavior, drift, rollback and lost-response reconciliation. Disposable
PGlite replay is not evidence of native PostgreSQL 17 execution or target writes.
The replay supports the existing optional native database adapter when available.

## Independently proven database baseline, November9

The exact source-bound lower-memory packet559f444c succeeded once against the
observer589 target. All catalog/data/history predicates, frozen anchors, source
seed and holds passed without faults. The committed audit binds its exact packet
and raw result digest; the observation bracket is02:16:18.496193Z–02:17:07.820372Z.
`observedAt` is the completion upper bound, not an invented snapshot timestamp.
Fresh RevenueCat94 ACTIVE/JWTfalse and its exact seven-file closure are recorded.
This qualifies the database baseline in source only, not deployment authority.

Canonical array text is constructed explicitly, preserving SQLNULL as JSONnull,
empty arrays, ordering/collation, Unicode and exact digest bytes while avoiding
a second full aggregate JSONB tree. The generated proof still reproduces the
exact executed559f444c packet. The old combined query is an audit-only fixture.

Readback now uses three separately planned SELECTs inside one30-second DO and
one REPEATABLE READ READ ONLY transaction, initialized local state, strict result
protocol and rollback. All old classifier fields remain required. Writer isolation,
advisory-before-table lock order, both full exact guards, atomic receipt/postcheck
and the45-second outerDO ceiling remain unchanged. Both use local UTC/JIT-off,
4MBwork_mem and zero parallel workers; work_mem is not a total memory cap.

The CLI still refuses apply without a fresh verified predecessor Edge transport.
No source merge deploys the refund migration, any of the three target Edge callers,
or activates providers/money. Unknown write outcome still permits only exact
readback, never a write retry. Target headroom must be assessed independently.

Final native17 verification of the exact new source readback used three sequential
runs:0.681–0.695s and maximum142400KB (~139.1MiB), preserving every old field plus
its strict protocol under actual readonly identity. Exact source writer positive
synthetic-fixture trials ran1.195–1.310s, maximum234532KB (~229.0MiB), with full
rollback and both lost-response/no-retry paths verified. These are local unloaded
measurements, not target timeout recommendations or target headroom acceptance.
