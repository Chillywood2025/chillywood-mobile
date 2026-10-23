# Offline disposable R2 qualification proposal

Status: executable offline core, isolated ledger proposal, adapter and tests,
**not a deployed route or provider qualification**. Rebased on source
`333f7b63c0c2aee3dde342a324be5c8afeed207c`. The only existing file change adds
required tests to the existing Database CI job. No runtime or deployment
configuration, live database schema/ACL, credential, provider object,
scan job, retention flag, schedule or source row is changed.

## Why this is a proposal rather than another authority route

Current main's retention endpoint pins the approved canonical bearer with its
SHA-256 verifier, uses `timingSafeEqual` on two 32-byte digests, and binds the exact
project URL. The proposal factory now matches that algorithm and bounds the
bearer identically. It has no injected-key, token-claim, apikey or session fallback.
It supplies only the verified bearer to the caller's store factory. No credential
or verifier was read to write or test this source.

Matching an existing worker's authentication code does NOT authorize exposing a
new endpoint to the same privileged key. New endpoint access, its security
review, the isolated ledger RPC grants, deployment and every provider phase need
their own specific approval. There is no `Deno.serve` entrypoint, `config.toml`
registration, live client construction or new secret. `RUN_APPROVED` and
`CLEANUP_APPROVED` remain compile-time false, so even correctly authenticated
requests cannot reach the store or origin. Request/environment fields cannot
enable either gate. A future client must remain fixed-project and reject
redirects, matching the current worker's outbound credential confinement.

## Fixed proposed run, requiring separate approval

- Candidate run ID: `r2-retention-qualification-20261023-01`.
- Bucket: `chillywood-media-origin`.
- R2 account endpoint: the immutable manifest presently contains an all-zero
  synthetic account placeholder, NOT a known live endpoint. Commissioning must
  replace it with the approved non-secret endpoint before the first attempt.
  The endpoint is part of the durable manifest hash; runtime account/config drift
  is rejected before any request and cannot retarget cleanup into another account.
- Exactly two literal keys from `r2-disposable-qualification-manifest.ts`:
  `qualification/retention/r2-retention-qualification-20261023-01/control.txt`
  and `qualification/retention/r2-retention-qualification-20261023-01/target.txt`.
- Fixed short synthetic text, plus a fixed different target conflict payload.
- Deadline: `2026-10-24T20:00:00.000Z`. Every provider request is bounded by this
  deadline and a maximum 15-second request budget. No phase runs after expiry;
  status-only ledger inspection remains possible.
- Never touch scan fixture `c8ffaa91-0017-4646-98df-8392e170e7ae` or any actual
  media/source/scan row. No user account is needed by this proposal.
- The candidate ID/keys/deadline are NOT approved merely by appearing here. If
  the approved window changes, use a newly reviewed never-used run ID and new
  literal keys, not an extension/reset of an attempted run.

The request accepts exactly `runId` and one allowlisted `action`. It cannot accept
keys, URLs, bucket names, payloads, headers, lists, prefixes or cleanup approvals.
Responses contain statuses, reserved request counts, completed-step counts,
bounded byte counts, SHA-256 hashes and timestamps only. No raw body, credentials,
signed URL, object key or provider error is returned. Request budgets are durable
upper bounds on attempts, not an invented count of confirmed provider execution.

## Bounded phases

1. `prepare`: create-only PUT the control and target. Each signed PUT includes
   `If-None-Match: *` and the fixed content length/type/body hash. A preexisting
   object, even containing identical bytes, blocks the run and cannot be adopted
   as owned disposable data.
2. `read`: full GET of both objects, rejecting partial/ranged or compressed
   responses, mismatching declared lengths, and bodies above 1 KiB. Verify
   SHA-256 and exact byte length, not ETag or HEAD alone.
3. `conflict`: a create-only PUT of the different fixed target payload must
   receive exactly 412. Then full GET/hash both objects and prove the original
   target and control are unchanged. A 409, successful overwrite, unknown response
   or altered control is not a pass.
4. Stop. Review evidence and obtain explicit approval for exact-key cleanup.
5. `cleanup`: only a separately reviewed build with `CLEANUP_APPROVED` true may
   invoke the two exact DELETEs. First persist `cleanup_started`, permanently
   forbidding every write phase. Verify both objects return 404 afterward.

The happy path has at most 11 provider requests: three PUTs, six GETs and two
DELETEs. Up to three explicitly invoked reconciliations reserve two GETs each.
Repeated completed phases do not repeat provider operations. There is no cron,
automatic retry, arbitrary probe, prefix delete or listing capability.

## Isolated durable ledger proposal

Existing retention provenance/retirement and claim rows describe real media
lifecycle state, not disposable qualification runs. Reusing them would falsely
introduce content/scan/retirement state. Do not do that. No suitable existing
run-state adapter was identified in the reviewed source.

`supabase/proposals/r2-qualification-test-ledger.sql` and
`r2-disposable-qualification-store.ts` implement the missing source contract:

- One separately approved, pre-seeded record, bound to the exact manifest hash
  (including the literal R2 account endpoint) and run ID. The core never creates
  a missing record.
- Read-committed row-lock compare-and-swap with monotonically increasing revision.
  A stale revision returns false; lost acknowledgments are never retried. Every
  provider mutation receives a durable pending intent before dispatch. The adapter
  reads back state and validates the complete bounded response shape.
- No DELETE, reset, expiration, reinitialization or reuse of this record/key
  namespace. Preserve the final tombstone through deployments, rollback and
  database backup/restore. An in-memory Map is only a unit-test fixture.
- One private table under the new isolated `r2_qualification_test_private` schema.
  RLS and FORCE RLS are enabled; no permissive policy or direct service/user table
  privilege exists. Only two newly named exact-run RPCs receive service-role
  execution in the proposal SQL. They enforce the actual database role and fixed
  run/hash; security-definer bodies have an empty search path. No existing grant,
  schema, trigger, role membership or role setting is altered.
- The table is unseeded. No initialization/upsert/reset/expiry/delete/approval RPC
  exists. A later separately authorized setup must name the fixed run and approval
  reference. Delete and truncate triggers reject even ordinary owner DML. Source
  validation rejects extra fields, malformed JSON, different manifest hashes,
  skipped/backwards phases, wrong budgets and changed original/control hashes.
- Database cleanup additionally requires a separately recorded approval reference
  on the exact run, only after conflict verification. The service role cannot
  change that field. This is not inferred from a generic work request or prior
  worker approval. The independent compile-time cleanup gate remains necessary.
- SQL is deliberately outside migration discovery, creates no run rows and is
  exercised only against disposable test databases. No live migration,
  security change or setup/cleanup approval was applied. Fresh read-only catalog
  checks on 2026-10-23 found 457 installed migrations, ending
  `20261022205003_notification_registration_revision_authority`, and no proposed
  schema/RPC names. This is not statement-hash parity or deployment readiness.

The database validates ordering, binding and immutability, not external provider
truth. Its service worker is trusted to record actual PUT/412/DELETE receipts.
Possession of a privileged service key is not treated as an adversarial oracle
the ledger can make safe. Do not expose these RPCs or grant a new endpoint access
without the separate review/approval described above.

A privileged administrator can still disable triggers/drop objects or restore an
old backup. This source cannot establish restore-safe nonreuse alone. The native
test deliberately restores an old pre-intent snapshot and requires that its
synthetic runner reopens: this is a negative control demonstrating the missing
anti-rollback guarantee, NOT permission to do so in production. Current pending
and terminal snapshots are separately restored and must remain fenced.

Production commissioning must preserve/replay terminal and pending ledger state
from an independently durable authority across every restore and prevent
operational reuse of the fixed object keys. Merely restoring a database backup
or checking that the row is absent is insufficient. The approved namespace and
run identity must never be recycled. Stop the endpoint before rollback/restore;
keep it disabled until recovered state has been reconciled with independent
provider-operation/tombstone evidence. This proposal does not implement that
external recovery authority. No cleanup or recreation may proceed from a
restored pre-intent snapshot, even with the original approval reference.

CAS serializes the run. A lost receipt or crash leaves `pending` and does not
replay its mutation. Read-only reconciliation observes the exact two objects.
A missing or matching object does NOT clear an uncertain PUT: a late writer may
still arrive. The run stays blocked for separately approved investigation and
writer/request-drain evidence; this proposal deliberately has no timeout-based
takeover or "force continue" operation. Unknown conflict responses cannot be
inferred to have been 412 from unchanged bytes.

After the durable cleanup fence, an uncertain DELETE may be reconciled from an
exact 404, because a late DELETE cannot recreate anything. If bytes remain it is
not automatically retried. A lost read can be reconciled by a fresh bounded read.
Failed CAS operations dispatch no new request; uncertain durable acknowledgments
require state readback before any further action.

## Limits on conclusions and commissioning

A later approved successful live run would qualify only the named
route/credential/bucket's create-only behavior, bounded read/hash and exact
disposable cleanup observations. This offline artifact does NOT qualify
atomic conditional DELETE, permanent physical absence, production retention
activation, legal holds, legacy admission, other writers, existing signed-request
drain, stopped/restarted real workers, all media surfaces or client enforcement.
R2 retention remains permanent logical-key nonreuse plus qualified writer/request
drain. A guessed wait or a successful synthetic run cannot replace those gates.

The reviewed media gateway binds upload ownership to the first key component
(`media-storage/index.ts`); migration writes accept their own fixed original or
backup prefixes (`media-object-storage-migration/index.ts`). The proposed
`qualification/` namespace is outside these ordinary flows, but source inspection
is not a production proof that no external credential holder can write it.
Commissioning must establish that namespace's exclusive writer ownership and
preserve it permanently. No credential/provider/security setting change is
authorized by this proposal.

Before any live use, separately approve the real endpoint/run/keys/deadline,
the ledger design and new isolated grants, new endpoint access/security scope,
production migration and setup seed, minimal client/entrypoint, deployment, and
non-destructive provider operations. Validate the frozen exact source first.
Keep cleanup false until the later exact-object deletion approval and ledger
approval recording. Updating either gate is a source change requiring review and
validation, not a mutable feature flag. Leave retention flags/schedules off and
held shared-master/secondary-copy work untouched.

## Offline validation

`node --test supabase/functions/_shared/r2-disposable-qualification.test.mjs supabase/functions/_shared/r2-disposable-qualification-store.test.mjs tests/ci/r2-qualification-database-validation.test.mjs`

The new tests use synthetic credentials and in-memory objects, verify the SigV4
signature independently, and never contact a network/provider. They cover wrong
auth, non-allowlisted inputs, deadline, repeated actions, conditional conflicts,
control integrity, cleanup approval/fence, bounded reads, missing/mismatched
state, concurrent prepare, lost durable receipts and ambiguous provider results.
Node tests and Deno type checking are focused offline evidence, not the protected
exact-head CI result or live R2 evidence.

`node scripts/test-r2-qualification-ledger-postgres.mjs`

This additional suite executes the actual isolated SQL and adapter on disposable
PGlite PostgreSQL, covering ACL/RLS, unseeded state, wrong identity/JSON, monotonic
CAS, SQL clock deadline, independent cleanup approval, disk-close/reopen retention,
unknown PUTs, lost committed acknowledgments, exact readback and irreversible
terminal fencing. It also replays all repository migrations using the existing
managed-service doubles, verifies unchanged existing schema/ACL/control-state
fingerprints, and tests the proposal against those full-schema grants. All
provider objects/credentials are synthetic. This is NOT native multi-backend
contention, genuine managed Supabase services, the full pgTAP suite, or live
migration statement/hash parity.

Both suites use a strictly allowlisted local TypeScript transpiler compatible
with the existing Node 20 CI runtime. Test SQL alone substitutes the single exact
admission clock with `2026-10-23T22:00:00.000Z`, so tests cannot silently expire
with the one-shot proposal. The canonical SQL, manifest hash, deadline and closed
gates remain unchanged. Direct unmodified deadline-predicate tests cover the
millisecond before cutoff, exact cutoff and later.

`SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-r2-qualification-ledger-concurrency.mjs`

This required Database-job invocation follows existing `supabase start`, full
`supabase db reset` and `supabase test db`. It never moves the proposal into
migration discovery. It performs:

- Full read-only dump of the local Supabase database, restore to generated
  disposable databases, and unchanged original fingerprints before/after.
- Twelve focused pgTAP assertions in the generated clone, with rollback.
- Three observed independent-backend lock queues: committed winner rejects stale
  CAS; rolled-back and terminated uncommitted holders permit exactly one waiter.
- Durable pending intent after committed-client termination, lost committed
  completion acknowledgment readback, and no duplicate synthetic provider call.
- Current pending/terminal logical backup restore plus the explicitly unsafe
  stale-snapshot negative control described above.
- Two actual postmaster SIGKILL/restart cases for committed pending and terminal
  state, in a separately owned generated container. It reuses the already-present
  local PostgreSQL image by immutable image ID, never pulls an image, uses no
  external network/published port/host mount/live credential, and enables fsync,
  synchronous commit and full-page writes. The shared Supabase cluster is never
  stopped, killed or restarted. Only marked generated databases/container are
  removed afterward. This is process-crash recovery, not hardware power loss or
  a provider/production restore drill.

The workflow edit only adds these tests to the existing protected job. No CI
policy, condition, permissions, timeout, required aggregate or approval exception
is weakened. CI regression tests reject omitted/skipped/swallowed/wrong-target
or pre-reset native invocation. Source review remains separate from publication,
exact-head protected validation and every live approval listed above.

At preparation time the dot workspace has no Docker executable; native execution
fails before any database access with `spawnSync docker ENOENT`. Therefore native
pgTAP, independent-backend, process-crash and logical-restore tests are **prepared
but not claimed passed** until the frozen head's required CI runs them. Hardware
power loss, production restore/anti-rollback authority and live R2 remain unproved.

Implementation references reviewed: [PostgreSQL row locking](https://www.postgresql.org/docs/17/sql-select.html),
[secure function definition](https://www.postgresql.org/docs/17/sql-createfunction.html),
and [Supabase function privileges](https://supabase.com/docs/guides/database/functions).
