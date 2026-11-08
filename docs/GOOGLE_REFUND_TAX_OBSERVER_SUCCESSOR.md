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

The committed expected baseline is still null. Neither current catalog hashes
nor a successful read-only probe promote it. Independent managed-catalog
provenance and complete source-derived reconstruction are still required.
The current CLI still refuses apply without a reviewed current Edge readback
transport. SQL installation and the three intended Edge updates require their
own qualified source, current prerequisites and action-specific authorization.

Focused tests cover exact receipt identity, immutable source, pending-state
fail-closed behavior, drift, rollback and lost-response reconciliation. Disposable
PGlite replay is not evidence of native PostgreSQL 17 execution or target writes.
The replay supports the existing optional native database adapter when available.
