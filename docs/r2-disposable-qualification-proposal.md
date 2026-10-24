# Bounded non-delete R2 qualification

Status: source commissioning for the bounded setup approved on 2026-10-24,
**not deployment or live provider qualification evidence**. The approved run
creates two synthetic objects, reads their complete contents and verifies that
an overwrite attempt is rejected. It retains three permanent mutation receipts.
Deletion, real-media changes and retention activation are not approved.

The source now includes a private endpoint with JWT verification retained and a
literal non-delete run gate. The approved receipt-prefix protection was verified
by exact provider readback at 2026-10-24 11:39:44 UTC, as detailed below. Live ledger
setup, validated source deployment and invocation verification remain pending.
No provider protection, live schema/ACL, credential, object, scan job, retention
flag, schedule or source row is changed by this source preparation. The existing
Database validation remains mandatory; the existing Sensitive Deno check gains
only the new entrypoint, with its options and conditions unchanged.

## Exact authority and execution boundaries

Current main's retention endpoint pins the approved canonical bearer with its
SHA-256 verifier, uses `timingSafeEqual` on two 32-byte digests, and binds the exact
project URL. The proposal factory now matches that algorithm and bounds the
bearer identically. It has no injected-key, token-claim, apikey or session fallback.
It supplies only the verified bearer to the caller's store factory. No credential
or verifier was read to write or test this source.

Matching an existing worker's authentication code alone does NOT authorize a
new endpoint. The bounded endpoint/setup/non-delete scope was explicitly
approved before this source change. Its `Deno.serve` entrypoint composes the
existing handler with an inert runtime factory; `config.toml` explicitly keeps
`verify_jwt = true`. `RUN_APPROVED` is compile-time true; `CLEANUP_APPROVED` stays
compile-time false. Request/environment fields cannot enable or change either
gate. Cleanup is rejected before client construction, even with valid auth.

The runtime constructs no client or origin and reads no environment variable at
import time. Only authenticated, validated actions can reach a lazily created
store client. The verified bearer can leave only as POST to the exact fixed
project's `read_r2_qualification_test_run` or `cas_r2_qualification_test_run` RPC
path. No query, fragment, arbitrary path/method, alternate credential, or redirect
is accepted. Headers/body are rebuilt from the verified key and fixed store
arguments; no SDK Request metadata is forwarded. Each logical RPC has its own
one-dispatch allowance, including when an SDK attempts a late or concurrent
retry. Origin configuration is read only when an origin operation is needed.

The entrypoint pins `npm:@supabase/supabase-js@2.100.0`. Local tests exercise the
installed `2.100.0-chillywood.1` SDK and local types, not exact vanilla npm
resolution. A local cached-only exact-import attempt was denied after attempting
network resolution and was not retried. The normal mandatory Sensitive CI check
must validate the exact source import; a local substitute is not that evidence.

## Fixed approved non-delete run

- Candidate run ID: `r2-retention-qualification-20261023-01`.
- Bucket: `chillywood-media-origin`.
- R2 account endpoint:
  `https://4771291298ef43dbe09e51f2900e04dc.r2.cloudflarestorage.com`.
  An owner-scoped read-only account/bucket lookup on 2026-10-24 verified account
  `4771291298ef43dbe09e51f2900e04dc`, this bucket, default jurisdiction and ENAM
  placement. ENAM is not the SigV4 region; signing remains `auto`. No credentials
  were exposed and no provider setting changed. This replaces the prior synthetic
  placeholder, not the separate approval required for commissioning. The endpoint
  is bound by manifest hash
  `2e3acd9b1075aa82d485dfb543776e7f72ff709ba03c2bd3f016a74e6a662201`;
  all SQL bindings and the offline pgTAP fixture match. Runtime account/config
  drift is rejected before any request, never repaired by changing credentials.
- Exactly two literal keys from `r2-disposable-qualification-manifest.ts`:
  `qualification/retention/r2-retention-qualification-20261023-01/control.txt`
  and `qualification/retention/r2-retention-qualification-20261023-01/target.txt`.
- Fixed short synthetic text, plus a fixed different target conflict payload.
- Five permanent receipt definitions, one for each modeled mutation, under the
  exact `qualification/retention/r2-retention-qualification-20261023-01/receipts/`
  prefix. Their literal keys and payloads are in `MUTATION_RECEIPTS`; they are
  included in the manifest hash and are NEVER disposable or cleanup targets.
  The approved non-delete run may create only the `put_control`, `put_target`
  and `conflict_target` receipts. The two deletion receipts remain unused because
  cleanup is not approved. All created receipts require indefinite preservation.
  Keeping all five definitions preserves the reviewed manifest binding; it does
  not grant permission to create deletion receipts or delete objects. The declared
  `RECEIPT_PROTECTION` rule identity is a commissioning requirement, not evidence
  that a provider lock exists.
- Deadline: `2026-10-24T20:00:00.000Z`. No new provider request is dispatched at
  or after this deadline; each has a maximum 15-second client request budget.
  Earlier requests may still complete late: expiry/abort is not writer-drain
  evidence. Ledger inspection and recording an already-admitted completion remain
  possible without dispatching another request.
  This includes reconciliation and later separately approved cleanup. The
  account-binding update does not extend the deadline or change any run/key.
  Do not start unless
  source validation, exact live approvals and provider-lock verification leave
  sufficient time; CI timing is not guaranteed. If an unattempted candidate no
  longer fits, review a fresh never-used run/key namespace rather than relaxing
  the deadline. If an attempted run expires, stop and preserve its state.
- Never touch scan fixture `c8ffaa91-0017-4646-98df-8392e170e7ae` or any actual
  media/source/scan row. No user account is needed by this proposal.
- The run ID/keys/deadline are not authority merely by appearing here. Only the
  explicitly approved non-delete scope is enabled. If
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

The approved non-delete happy path has 10 provider requests: three permanent
receipt PUTs, three disposable-object PUT attempts and four GETs. It leaves the
two original synthetic objects and three receipts in place. Cleanup is denied.
The complete modeled path, only after a separate future cleanup approval, would
have 16 requests: five receipt PUTs, three object PUTs, six GETs and two DELETEs.
Up to three explicitly invoked reconciliations reserve two GETs each; the source
ceiling of 22 includes that separately gated cleanup model, not its approval.
Repeated completed phases do not repeat provider operations. There is no cron,
automatic retry, arbitrary probe, prefix delete or listing capability.
These are budgets within one continuous ledger history, not a lifetime cap across
arbitrary stale restores. Restores can cause more rejected receipt attempts or
reads; the independent fence limits protected mutation dispatch, not every
provider request. Neither counter nor reconciliation cap is magically immune to
database rollback.

## Minimal R2-backed restore fence

The concrete signed origin, not a caller-supplied permit or database flag, first
PUTs the matching permanent receipt with `If-None-Match: *`. Only that same
invocation's fresh HTTP 200 acknowledgment permits its single protected mutation.
The protected request checks its deadline again. A duplicate, lock denial,
unexpected status or exception stops before that mutation. A receipt's 412 is
never returned as the target conflict's 412. There is no receipt GET/adopt,
delete/overwrite, retry loop, returned reusable token or persisted permit.

The receipt namespace is fixed by the protected object namespace and operation,
not a changing manifest hash or revision. Never rotate receipt keys while
reusing protected keys. Every first/live binary for this run must contain the
mandatory fence; an old unfenced implementation can bypass it and must never be
commissioned. Neither a receipt nor a bucket lock prevents an administrator from
deploying code that omits the fence.

Before commissioning, approve and verify an indefinite R2 lock covering ONLY
the receipt prefix, not target/control. Its rule must remain intact permanently.
Cloudflare documents that such a lock prevents receipt overwrite/deletion and
lifecycle removal while allowing initial creation. Removing the rule remains
an administrative capability: this is not administrator-proof WORM.
[R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)

Verified setup readback on 2026-10-24 at 11:39:44 UTC: account
`4771291298ef43dbe09e51f2900e04dc`, bucket `chillywood-media-origin`, exactly one
enabled rule named `r2-retention-qualification-20261023-01-receipts`, prefix
`qualification/retention/r2-retention-qualification-20261023-01/receipts/`,
condition type `Indefinite`. There were zero rules before this bounded setup.
No object was created by the lock setup. This establishes that prerequisite at
the readback time, not any object-operation result or future permanence against
an administrator changing the rule. Preserve and recheck the exact binding
before live invocation; do not change other bucket settings.

The narrowly supported invariant is: R2-backed, Supabase-restore-independent
at-most-once dispatch of each of the five fixed mutations, subject to documented
R2 behavior, permanent receipt protection and mandatory fenced source. This is
not provider-independent empirical proof of R2 atomicity. Conditional create is
a documented safety assumption while the disposable run checks this route's
integration behavior. A negative read cannot clear an unknown receipt or write.
[R2 conditional operations](https://developers.cloudflare.com/r2/api/s3/extensions/)

If an unknown receipt request never commits, a stale database restore may permit
another receipt attempt. That later acknowledged winner can dispatch once; a
late original request then loses. If the first request committed but its response
was lost, no later request can acquire the receipt, so no protected mutation is
replayed. This deliberately sacrifices liveness rather than adopting an existing
receipt. Do not describe it as permanent refusal of every receipt retry across
all restores, or as proof that an unknown provider request drained.

## Isolated durable ledger source migration

Existing retention provenance/retirement and claim rows describe real media
lifecycle state, not disposable qualification runs. Reusing them would falsely
introduce content/scan/retirement state. Do not do that. No suitable existing
run-state adapter was identified in the reviewed source.

`supabase/proposals/r2-qualification-test-ledger.sql` remains the canonical reviewed
SQL reference. Its byte-identical forward migration is
`supabase/migrations/20261024160321_r2_qualification_test_ledger.sql`.
The proposal SHA-256 remains
`e7020770b9bb8799ee7bfd34b62d836452684cbf511c013e4606f4a61a774bf3`.
The preserved SQL header describes the original offline proposal: the migration
is now the **only discovery/execution path**. Never apply both files. Keeping the
reference in `supabase/proposals` does not create a second migration or a setup
script. Together with `r2-disposable-qualification-store.ts`, it implements:

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
- This source change adds exactly one forward migration after
  `20261024093048_deleted_content_reviewed_external_reference`. It creates no run,
  setup approval or cleanup approval row. It does not deploy or apply anything
  live; production apply and setup remain separate authorized operations. The
  canonical SQL, run ID, manifest hash and deadline are unchanged. Read-only catalog
  checks on 2026-10-24 found 458 installed migrations, ending
  `20261024093048_deleted_content_reviewed_external_reference`. Earlier scoped
  catalog checks found no proposed schema/RPC names; fresh absence/parity checks
  remain required before any live application. Migration-list readback alone is
  not statement-hash parity or deployment readiness.

The database validates ordering, binding and immutability, not external provider
truth. Its service worker is trusted to record actual PUT/412/DELETE receipts.
Possession of a privileged service key is not treated as an adversarial oracle
the ledger can make safe. Do not expose these RPCs or grant a new endpoint access
without the separate review/approval described above.

A privileged administrator can still disable triggers/drop objects or restore an
old backup. The native ledger-only negative control deliberately restores an old
pre-intent snapshot and requires an UNFENCED synthetic runner to reopen. It remains
`restoreSafeNonreuse:false`; a database-only guarantee must not be claimed.
Additional native cases retain the external synthetic receipt store while
restoring 17 real database snapshots, including every committed CAS prefix and
the independent cleanup approval. They exercise the concrete signed origin and
actual SQL adapter and require zero repeated protected mutations. A separate race
uses two independently restored databases, not a shared row-lock winner.

The external fixture is a model, not production evidence. The earlier inventory
found no existing verified independent immutable ledger or receipt lock. The
approved bounded lock setup now has the exact readback documented above; the
source implements its consuming fence. Live readiness still requires validated
source deployment and exact ledger setup. No new
general recovery system is proposed. Do not resume a restored run blindly:
stop it, preserve receipts forever, and reconcile actual uncertainty before any
separately approved action. A lost/blocked run may remain permanently incomplete.

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

A successful approved non-delete live run would qualify only the named
route/credential/bucket's create-only behavior, bounded read/hash and observed
rejection of the overwrite attempt. It would provide no cleanup observation.
Source preparation and synthetic tests do NOT qualify
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
preserve it permanently. No credential change or broader provider/security
change follows from this document; only the explicitly approved receipt-prefix
protection is in the bounded setup scope.

Before live invocation, complete exact reviewed ledger setup, private endpoint
deployment and readback verification of the approved permanent receipt-prefix
lock. Validate the frozen exact source first, including the new route and actual
literal gate values. Earlier no-route/false-gate test results are not validation
of this commissioned build. This source work does not establish that those live
prerequisites are complete or authorize additional provider actions.
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
The allowlisted TypeScript test loader replaces its default `fetch` with a hard
failure, so even a missing synthetic transport cannot contact the now account-bound
endpoint. Regression tests pin the account/full manifest, reject the old placeholder
and prove the loader cannot inherit global network access.
Node tests and Deno type checking are focused offline evidence, not the protected
exact-head CI result or live R2 evidence.

The runtime tests are imported by the existing main qualification suite, so the
protected Database command selects them without a second optional test command.
They exercise the actual handler/runtime/installed SDK/store/core/signed-origin
composition on a synthetic transport: prepare, read and conflict leave exactly
two original objects and three receipts, repeated actions dispatch nothing, and
cleanup is denied before any database/provider access. Wrong auth, missing state,
origin configuration errors, unknown outcomes and deadline expiry remain closed.
The loader's hard-denied default fetch is unchanged; there is no injected or
environment-controlled approval gate.

`node --test supabase/functions/_shared/r2-disposable-qualification-fence.test.mjs`

This separate suite runs the concrete signed transport over a strictly bounded
synthetic R2 model and independently verifies both request signatures. It covers
all five receipt/dispatch paths, non-success and unknown receipts, receipt-412
separation, concurrent divergent state, late acquisition, deadline after receipt,
lost protected outcomes and all restored in-memory prefixes. Four additional
PGlite data-directory restores use actual SQL and adapter state while retaining
the same external fixture. Negative controls remove receipt preservation or
break both conditional creation and lock behavior and must demonstrate replay.
These tests prove source behavior under stated assumptions, not live R2 locks.

`node scripts/test-r2-qualification-ledger-postgres.mjs`

This additional suite executes the actual isolated SQL and adapter on disposable
PGlite PostgreSQL, covering ACL/RLS, unseeded state, wrong identity/JSON, monotonic
CAS, SQL clock deadline, independent cleanup approval, disk-close/reopen retention,
unknown PUTs, lost committed acknowledgments, exact readback and irreversible
terminal fencing. It also replays all repository migrations using the existing
managed-service doubles, verifies unchanged existing schema/ACL/control-state
fingerprints, and tests the canonical migration against those full-schema grants.
The replay explicitly omits only the exact new migration from its baseline, then
applies that complete, unmodified migration exactly once. Its definitions,
non-owner grants, RLS, constraints, triggers, defaults and empty rows must match
a pristine canonical install. It does not claim full replay by skipping the target
or substituting a frozen-clock version for the canonical migration. All
provider objects/credentials are synthetic. This is NOT native multi-backend
contention, genuine managed Supabase services, the full pgTAP suite, or live
migration statement/hash parity.

Both suites use a strictly allowlisted local TypeScript transpiler compatible
with the existing Node 20 CI runtime. Test SQL alone substitutes the single exact
admission clock with `2026-10-23T22:00:00.000Z`, so tests cannot silently expire
with the one-shot proposal. Full-schema/native clones verify the unmodified
canonical ledger first, then replace only `guard_run()` with the exact source body
containing that one frozen clock. No schema/table drop, trigger disabling or
duplicate migration execution is allowed. The canonical SQL, manifest hash,
deadline and cleanup gate remain unchanged. Direct unmodified deadline-predicate tests cover the
millisecond before cutoff, exact cutoff and later.

`SUPABASE_DB_CONTAINER=supabase_db_chillywood-mobile node scripts/test-r2-qualification-ledger-concurrency.mjs`

This required Database-job invocation follows existing `supabase start`, full
`supabase db reset` and `supabase test db`. The full reset applies the new migration
once. The harness never applies the proposal or migration again to that migrated
database or its full-schema clone. It performs:

- Full read-only dump of the local Supabase database, restore to generated
  disposable databases, and unchanged original fingerprints before/after,
  including the original qualification schema, real clock and empty rows.
- Exact qualification catalog parity against a separate generated empty database
  with one unmodified canonical migration install, before replacing only the
  generated clone's admission clock. The canonical ledger must be unseeded.
- Twelve focused pgTAP assertions in the generated clone, with rollback.
- Three observed independent-backend lock queues: committed winner rejects stale
  CAS; rolled-back and terminated uncommitted holders permit exactly one waiter.
- Durable pending intent after committed-client termination, lost committed
  completion acknowledgment readback, and no duplicate synthetic provider call.
- Current pending/terminal logical backup restore plus the explicitly unsafe
  stale-snapshot negative control described above.
- Seventeen fenced full logical snapshots restored after cleanup, keeping the
  external synthetic R2 receipt store intact, and a race between two independent
  database instances using the concrete signed transport. The model's provider
  preservation remains explicitly unqualified in the test output.
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

The merged PR 607 passed both full validation runs, including 5,214 pgTAP tests,
42 native commissioning checks and 17 fenced snapshot restores. Those historical
passes do not validate this account-binding follow-up: its frozen head must run
the selected protected checks again. The dot workspace still lacks Docker, so
local tests are not native concurrency proof. Hardware power loss, production
restore/anti-rollback authority and live R2 remain unproved.

Implementation references reviewed: [PostgreSQL row locking](https://www.postgresql.org/docs/17/sql-select.html),
[secure function definition](https://www.postgresql.org/docs/17/sql-createfunction.html),
and [Supabase function privileges](https://supabase.com/docs/guides/database/functions).
