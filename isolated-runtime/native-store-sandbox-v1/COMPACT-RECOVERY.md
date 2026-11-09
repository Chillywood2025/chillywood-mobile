# Compact native-install recovery (source only)

`install-recovery.mjs` prepares read-only SQL and classifies its exact result. It
has no executor, target connection, write callback or retry path. It does not
replace the current operational deployment workflow by itself.

Before dispatch, `compactBeforeReadSQL()` must run through the genuine qualified
read-only connection. Its single repeatable-read snapshot retains the existing
catalog/history/money hashes and dependency evidence, plus only the original
public schema row, expanded public ACL multiset and bootstrap role name. The
baseline must be saved with the source-bound operation. A legacy baseline missing
these fields is insufficient; never reconstruct them from the after state.

Recovery uses a single 20-second statement / 25-second transaction budget,
matching the existing preparation/envelope allowance, with a 10-second idle
guard and one-second lock limit, without rearming. The
separate private reader's five-second limits are unchanged. Early local proofs
passed at five seconds, but those timings are not a slower-host ceiling. It first
verifies genuine reader identity and examines the
receipt/counts and compact metadata. An absent exact migration version can be
`unchanged_observed` only when all original catalog/history/money hashes, history
count/maximum and compact metadata match. No installed function is needed.

An applied observation requires exactly one byte-equivalent JSONB receipt row
for the source-built body. Excluding only that version must reproduce the original
history hash, count and maximum. Public ACLs must equal the original multiset plus
the two source-authorized USAGE entries. The old catalog hash is recomputed after
filtering only source-defined new objects and restoring only the trusted original
public ACL slot. All other existing fields remain observed and must match.
Normalized added catalog rows use the unchanged source pin and JSONB EXCEPT ALL,
including duplicate multiplicity, required per-object ACLs, internal-trigger
normalization and original bootstrap identity.

Only compact verdicts leave the database. Missing, partial, changed, timed-out or
unreadable evidence stays unknown and never permits another write. No new table
grants, temporary-table privileges or persistent objects are required.

## Explicit administrative-DDL limitation

Repeatable-read catalog equality does **not** lock out a concurrent administrator
replacing a SECURITY DEFINER function before it is invoked. Therefore the default
packet never invokes the private-state reader and returns at most
`exact_source_receipt_observed_runtime_unqualified`, always with
`administrativeConcurrencyExcluded: false`. A caller boolean cannot remove this
limitation. The existing bounded private reader is a separate operational step
requiring real administrative-DDL coordination. Results from separate snapshots
must not be represented as one atomic fresh-state proof. No observation here
authorizes deployment, activation or retry.

## Tests and resource evidence

Focused unit tests cover trusted-before requirements, exact output shape, source
and receipt binding, identity and fixed budgets. The managed native harness flag
`--event-trigger-parity --oid-padding --recovery-proof` exercises actual readonly
sessions, unchanged/applied observations and wrong identity, malicious function,
catalog/ACL/receipt/history/multiplicity mutations. Dirty runtime stays explicitly
unqualified, and app-facing code is never executed by recovery.

Representative memory evidence is measured separately for before capture,
unchanged recovery and applied recovery. Compact output alone is not a memory
guarantee. Local process RSS is not incremental commitment or hosted headroom;
measurements supply no production execution permission.
