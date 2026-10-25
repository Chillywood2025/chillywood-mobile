# Supabase original copy cutover

Source-only implementation. Installing this migration does not copy bytes,
change a locator, activate retention, deploy a worker, create credentials, or
delete anything. The original Supabase object has no deletion authority in this
protocol and remains preserved even after its R2 successor is retained.

## Bounded state machine

1. The existing explicit `copy_supabase_original` operation writes a new,
   receipt-specific R2 key with create-only semantics and full independent
   source/target byte comparison. Its immutable receipt is not scan or delivery
   authority. Existing deny-only preflight remains deliberately unchanged.
2. The separate explicit `cutover_supabase_original` endpoint action accepts only
   a receipt ID. Existing operator authentication is unchanged. It reads the
   exact Supabase object generation, downloads both complete objects, compares
   them to the receipt, and calls the bounded commit RPC. No PUT or DELETE is
   performed by this step.
3. Commit rechecks the unchanged source snapshot, generation, legal holds,
   reference coverage, old/new aliases, immutable history, exact source size
   metadata matching the measured receipt, and absence of every
   rendition or transcode. Reference-producer table locks fail immediately on
   contention. Existing queue triggers must create a new pending job with zero
   attempts and the same measured size. Missing or incorrect source size is a
   refusal, never a silent metadata repair. Commit and its permanent ledger are atomic; rollback preserves the
   old locator. Exact retries reuse the original job, never enqueue another one.
4. The existing trusted scanner downloads the new target through its existing
   private-job gateway. A separate observation/receipt protocol binds the actual
   downloaded digest and length to the exact job incarnation, claim, attempt,
   owner, target, completion and propagated clean ClamAV result. A failed read,
   scan, receipt write, or manual-review outcome cannot grant proof. Receipt
   failure never repeats completion or changes the ordinary scanner outcome.
5. `enroll_supabase_copy_retention_provenance` requires that genuine receipt plus
   separately reviewed writer-drain evidence and reviewer identity. It rechecks
   holds, aliases, secondary media and history. The immutable provenance row is
   explicitly tagged `supabase_copy_cutover`; both historical-audit fields must
   be NULL and both copy proof references must exist. Historical provenance
   retains its original non-NULL audit contract and unchanged predecessor bodies.
6. Delivery stays unavailable until the new proof chain is valid. This can mean
   a temporary delivery interruption after cutover. Retention then uses the
   existing staging, permanent delivery revocation, capture, deadline and expiry
   machinery. No fake upload reservation, historical audit, clean result or
   retained-inspection authority is introduced.

## Deployment boundary

Provider operations, locator changes, source-only RPC deployment, scanner restart
and enrollment require a separate live plan/authorization. This document is not
that authorization. The current shared key, credentials, retention flags and
held-secondary guard are not changed. All secondary/shared-master cases remain
unsupported, including exact-looking original-rendition aliases.

## Validation

- `test-supabase-copy-cutover-postgres.mjs`: reduced PostgreSQL source fixture
  using real queue/retention functions; includes rollback, stale generation,
  proof replay, aliases, holds, full capture/revocation, ACLs and historical parity.
- `supabase-original-cutover.test.mjs`: full-read bounds, digest/size failures,
  redirects, malformed identity and uncertain commit responses.
- Scanner handler and streamed-byte tests: actual worker and bytes passed to a
  deliberately synthetic scanner. These are not claims of ClamAV efficacy.
- `test-supabase-copy-cutover-concurrency.mjs`: native PostgreSQL, independent
  backends against a generated local clone only. Includes contested source,
  storage generation, holds, transcodes, duplicate commits, rollback and stale
  scan claims. No remote database URLs or provider traffic are accepted.
- Full migration replay, pgTAP/ACL tests and exact-head Required Validation must
  pass before merge. Reduced PGlite tests are not native concurrency evidence.
