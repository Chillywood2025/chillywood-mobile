# Refund-tax social baseline successor

This is source preparation, not deployment authorization or production qualification.
The November 4 runner/manifest and every migration remain byte-for-byte unchanged.
Use `scripts/google-refund-tax-social-exact-deploy.mjs` only for this successor.

The exact history is the original 583 rows, three pinned tip/ingress/cashout
predecessors, and both pinned social migrations. It rejects unknown, missing,
duplicated or restamped history. Applying the older refund migration would yield
589 rows while the maximum remains `20261107191000`, not the refund timestamp.
The separately frozen social target catalog is checked in preflight, before
mutation and after mutation, in addition to the original full public/private/auth
invariant catalog and guarded data. The social target projection includes its
private schemas, public entrypoints and parent-table triggers.

The source-only manifest binds the current complete closures of all three target
Edges and the current RevenueCat webhook prerequisite. These hashes are source
inventory, not evidence of deployed bytes. No Edge is deployed by this runner;
the existing PR685 observer must remain untouched. Preserve JWT settings.

The committed baseline remains null. No live result is adopted as an expected
catalog/hash. Source tests use a clearly synthetic original history and disposable
PostgreSQL fixture; they do not qualify the real target. Before allowing an apply:

1. Independently reconcile the original catalog and exact successor source,
   full current history and controls, not merely a current hash observation.
2. Rehearse the actual native PostgreSQL 17 clone, current Management transport,
   drift, rollback and unknown-response reconciliation using reviewed inputs.
3. Verify the current complete prerequisite webhook closure and all three target
   Edge closures, and retain source/target readbacks.
4. Commit independently reviewed baseline evidence and a separately reviewed
   exact Edge readback transport. The current CLI intentionally refuses apply
   even if a baseline is later filled in.
5. Obtain applicable concrete deployment/lock-impact authorization and serialize
   against payout notifications and other backend writes. Installing either
   dormant repair invalidates the other's exact history baseline.

Existing locking and rollback behavior is unchanged: bounded table-lock waits,
transactional migration plus exact history receipt, no provider call, activation,
schedule or write retry. Lost write responses require independent readback. A
committed installation is retained for forward repair, not destructive rollback.

## Native catalog portability

The successor normalizes only the existing reviewed `redundantNotNull` predicate:
PostgreSQL 18 duplicates ordinary, enforced table NOT NULL constraints in
`pg_constraint`; PostgreSQL 17 stores their semantics in `pg_attribute` alone.
Column `attnotnull` remains fingerprinted, and unusual/nonredundant constraints
remain included. The original runner, manifest and migration are not changed.

Independent installation of the immutable target source in local PostgreSQL
17.6 and PGlite/PostgreSQL 18.3 produces the same normalized target digest:
`10bffb46a67a595be1e04869b5a73b438a1b33b158d1c59ad8e5a5774e9a7054`.
The older unnormalized PGlite digest differs only by seven redundant NOT NULL
rows. Neither digest was adopted from the production target.

`tests/google-refund-tax-social-catalog.test.mjs` verifies source derivation and
rejects actual nullability, check, foreign-key, grant, RLS and default drift.
To additionally run native PostgreSQL 17 qualification, set
`NATIVE_DEPLOYMENT_PG_BIN` to local PostgreSQL 17 binaries with pgcrypto/pg_trgm
installed and `NATIVE_PG_DRIVER` to an absolute `pg@8.16.3/lib/index.js` path.
The native adapter creates its own temporary cluster and unique Unix socket,
disables TCP, verifies its actual data directory and cleans up its owned server.
It never connects to an existing server using PGHOST/PGPORT or credentials.

The full replay uses a synthetic historical fixture, not the production
baseline. Native replay additionally proves a real second-session migration
history lock wait and rejection of a plan made stale by the other transaction.
It also covers rollback and reconciliation after a simulated lost response to a
successful local commit. These checks do not satisfy the independent live
baseline or Management/Edge transport prerequisites above.
