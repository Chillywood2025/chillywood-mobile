# Creator replay lock ordering and qualification

This continuation preserves local checkpoint `1738e25f2e6fe1faf8ae26c55dbb3c8d6708d5d1`
and integrates main `fc99f5d2dbab9aa7b381e2b46c92c2004b6d13f9`, including merged
PRs #631 and #632. Draft PR #626 is the existing creator branch. Its complete
diff includes the earlier, still undeployed creator work; qualifying only the
small replay repair would not qualify that release. The unpublished alternative
`f43835d24cd691d579cb227120ac6c48501aae3b` was unavailable in the inspected local
repositories, so no comparison or combination with it is claimed.

## Lock-order repair

The original anchor migration removes the observation fact's foreign-key lock
on the mutable event row. Further native tests found independent provider/replay,
worker/attempt, and opposite-event observation cycles. A shared media-retention
lock also creates a provider/replay cycle after a provider updates broadcast
state. Each negative control requires native PostgreSQL SQLSTATE `40P01` and
recorded reciprocal blocking edges; a timeout is a failure, never deadlock proof.

The successor migration queues distinct changed event IDs within the writing
transaction, then captures their final source states in sorted event order with
a deferred constraint trigger. Rollback removes the queued work. Capture still
uses the existing observation lock, predicate, deduplication, and insertion-time
timestamp. Intermediate states inside a single provider transaction are not
externally visible states. Existing facts, cutover timestamps, purchased terms,
replay deadlines, and earned remedies remain unchanged. Eager buyer evaluation
continues to capture current source state.

| Flow | Ordering and coverage boundary |
| --- | --- |
| Creator event change / ticket wallet | Wallet locks all event rows, then observation locks, in event-ID order. Managed lifecycle acts on one event. Native harness runs wallet-first and lifecycle-first schedules and compares exact purchased terms and purchase identity. |
| Buyer event lock / direct replay edit | Private anchors remove the child-to-event FK lock. Native harness holds the buyer event lock, commits the authenticated creator replay change, then executes the real buyer wallet RPC. |
| Provider completion / creator replay edit | Provider owns event, attempt, existing replay row, and stop job before public media writes. Native receipt and post-broadcast barriers cover both formerly cyclic stages. |
| Provider / stop worker | Worker locks attempts before jobs and skips provider-owned attempts for a later poll. It prelocks the complete sorted job set before processing. Native harness verifies the skipped poll and provider completion without a user-visible transaction error. |
| Multiple event observations | Deferred capture sorts the full transaction set. Native opposite-order replay/receipt batches verify both commits and an empty pending queue. This is synthetic service-batch stress, not a claim that the app exposes a batch RPC. |
| Lifecycle / stop worker and creator-wide approval revocation | Source review traces early lifecycle job acquisition and revocation's complete sorted job set before public media writes. Approval locking prevents concurrent start from adding jobs beneath revocation. These specific concurrency schedules require separate evidence; they are not inferred from provider tests. |

The repair does not promise that arbitrary SQL transactions are deadlock-free.
For example, combining eager buyer reads with later writes or composing multiple
event lifecycle mutations in one custom transaction can introduce other orders.
Application RPC transaction boundaries are the supported scope. No retry loop,
try-lock rejection, disabled trigger, or user-facing failure replaces lock repair.

## Broader database fixture and timeout investigation

The retained native bootstrap lacked managed auth scalar-claim compatibility and
API-role USAGE on the pgTAP extension schema. The test helper now reproduces the
managed auth precedence, including cleared values and invalid UUID behavior;
extensions USAGE permits test assertions. Application grants, RLS, and production
functions are unchanged by this fixture correction. The previously failing API
privilege and chat tests pass with their original assertions.

A reproduced 50-second admin-history cutoff occurred during active setup/query
work, with no lock wait or blocking backend. An extended diagnostic executed all
27 unchanged assertions in 221.521 seconds with no skips, TODOs or remaining
session. Its source changed during execution, so it is timing evidence only.
The earliest timeout did not retain partial query diagnostics, so its exact
wait state cannot be reconstructed from that run.
The final native runner uses explicit file/statement/lock/suite budgets and marks
timeouts, malformed or incomplete TAP, skipped/TODO assertions, unrun files, dirty
inputs and changed source as failures. Query/blocker snapshots and raw TAP survive
failed runs. See the exact-head run receipts for the final result.

An attempted clean schema replay in the retained PostgreSQL cluster stopped at
`42501 cognitive_runtime_preexisting_role_rejected:cognitive_product_baseline_executor`.
That operation was stopped. The guard and existing roles were not changed. A
separate, explicitly labeled template-clone qualification uses the previously
prepared complete synthetic schema, verifies its original migration hashes and
schema/ACL copy, and applies only the supplied new migrations. It is not a claim
of fresh-cluster migration replay; canonical clean Supabase CI remains required.

## Reproduction and evidence

`scripts/test-creator-replay-lock-order-native.py` requires explicit retained
container, image, template, and preparation-manifest inputs. It verifies there
are no container networks, published ports or host mounts and checks PostgreSQL
17.6 and disabled money/payout switches. It uses separate `psql` Unix-socket
sessions and synthetic fixtures. Provider transport is never called. The runner
records source hashes, actual SQLSTATEs, blockers, commit results and cleanup.

`scripts/test-native-pgtap-isolated.py` runs every SQL file against a verified
template clone. For the measured admin workload, pass `--test-timeout 600
--statement-timeout 180 --lock-timeout 10 --suite-timeout 2100`. Supply both new
forward migrations with `--patch` and the original successful preparation
manifest with `--prepared-manifest`. Full runs require committed inputs and a
stable head. Canonical `supabase db reset; supabase test db` stays in CI.

Final local qualification receipts are retained outside Git in the task's
`evidence/integration` directory; earlier timing/fixture diagnostics are under
`evidence`. Final commit, PR/check IDs, pass/fail totals and gaps belong in the PR
and delivery report. Earlier checkpoint or diagnostic results do not qualify a
later head. Mounted, PGlite, Edge-handler, native PostgreSQL, CI, deployment and
physical-device evidence are separate categories.

## Release and rollback boundary

Merge requires the exact final commit's `Chi'llywood / Required Validation`, all
applicable jobs and current repository rules. Deployment additionally requires
fresh migration/function/ACL parity and the internal release-review gate.
Read-only preflight found pre-existing history differences: 26 migrations have
different deployed versions and 28 payload hashes need reconciliation. Examples
include comment omission, deployment timeout/verification wrappers and additional
historical receipt fields. These are not authorization to replay, rename or
overwrite historical migrations. Resolve the relevant deployment preconditions
before any production mutation; use narrowly targeted canonical deployment, never
a broad database push that might replay those versions.

Prepare each deployment's exact bytes, prerequisite history/function fingerprints,
bounded lock/statement budget, forward recovery and post-apply history/function/ACL
readback before execution. Preserve current deployment receipts for #631/#632,
enabled discovery, and internal Android/iOS release settings. Database recovery
is forward-only; do not erase observation facts, reservations, terms, ledger or
provider receipt history. Client rollback requires the established platform,
runtime, channel and native compatibility gate. Source rollback tests do not
constitute production restore or installed-device proof.

No live payments, payouts, auctions, credentials, branch protections or phone
settings are changed by this repair. A green code result alone does not establish
deployment, real provider delivery or physical Android/iOS verification.
