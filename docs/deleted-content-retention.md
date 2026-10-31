# Deleted-content retention: disabled source implementation

## Worker result validation (October 31 source repair)

Text-expiry batches validate all IDs before the first expiry call, reject repeated
IDs (including differently cased UUIDs), and accept only documented SQL outcomes.
`purged` requires the database's claim ID. Failed, unknown or malformed receipts
stop the pass before media work or a successful heartbeat. The real Edge handler
returns its existing generic 503 without exposing private failure details.
Known hold, busy, not-due, unsupported-coverage and delegated-Brand outcomes remain
visible; they are not misrepresented as successful deletion.

This repair does not add provider coverage or enable retention. Current source
includes the legacy R2 provenance adapter, reviewed external-reference metadata
retention, and the exact Brand lifecycle described below. Secondary/HLS objects
and non-Brand legacy Supabase/Hetzner originals still need qualified coverage.
Provider qualification, client drain, scheduling and activation remain separate
unexecuted prerequisites. Historical inventory counts below are not a new live
inventory or evidence that any current object may be deleted.

## Reviewed external references (source-only)

Creator-video rows with no owned object or thumbnail key may use the distinct
`reviewed_external_reference` disposition only after privileged, row-specific
evidence recording. An external URL, placeholder hostname, missing key, zero
size, or another row with the same URL is not evidence. The new evidence ledger
starts empty; this migration does not classify any existing row or change
quarantine, scan status, visibility, rollout qualification, schedules or flags.

Evidence binds the exact owner/incarnation, complete locator/reference
fingerprints and schema. It is dormant evidence, not permanent admission:
disabled-period binding edits or new ownership/secondary references invalidate
current coverage. Binding edits, deletion and truncation permanently invalidate
the old evidence, so reverting fields does not restore it. Source
deletion/recreation cannot inherit an old proof even when a
caller reuses the same UUID and timestamp. The existing secondary-first checks
and producer hooks remain unchanged; no shared-master or HLS support is added.

Only the exact authenticated content-delete RPC can capture this class, using a
private transaction-bound intent. Capture retains application text/history for
720 elapsed hours, respects ordinary legal holds, and creates no media stage,
key retirement, download entitlement, clean-scan result or provider deletion
authority. Soft deletion and unknown historical archive conversion are not
supported. Text expiry checks the immutable capture/evidence binding and never
requests third-party media or invokes provider cleanup.

The no-owned-locator creator-video client path calls that RPC with the initiating
account session and exact source incarnation. Generic, authentication, timeout
and malformed failures never authorize fallback. Only an explicit disabled
response permits the legacy table-delete path, constrained to the initiating
token, owner, incarnation and still-null owned locators; this does not claim a
new server-side session-revocation guarantee for the preexisting disabled path.

Source merge is not rollout: applying the new migration, reviewing and recording
genuine per-row evidence, and delivering the client through an approved app
build/OTA are separate prerequisites. Global scan, secondary, Brand, provider,
client/drain, heartbeat and schedule gates remain in force. This feature retains
application metadata, not externally hosted bytes.

Verification includes actual source-client tests, executable SQL/schema replay,
ordinary retained-original regression coverage and the native disposable-clone
runner `scripts/test-external-reference-retention-concurrency.mjs`. PGlite or
transport-framing tests alone are not two-backend concurrency qualification.

This source change does not activate retention, schedule a worker, deploy a
function, change providers, or change production legal/privacy policy.

## Implemented and testable

- Current content stays in its source. No insert/activation copies or edit history.
- First genuine soft deletion and hard deletion capture allowlisted text in the
  same transaction. Reversible moderation does not count as deletion.
- Deletion time is database-owned; expiry is exactly 30 days later. Soft-to-hard
  cleanup and retries do not renew it. A new row incarnation is a new deletion.
- Private text snapshots are immutable, FORCE-RLS protected and inaccessible to
  consumer accounts. The inspection integration separately applies actor/session,
  target/context, staff grants and access audit. Owner-view exemption does not
  exempt capture, holds, claims or purge mutations.
- An explicit content-delete request binds the current session, owner, exact
  original, and source creation time. Source deletion stages and revokes the
  original in the same database transaction as capture. Metadata-first deletion
  uses the same trigger. Staging is never an inspection archive or byte copy.
- When staging is enabled, old record-bound object-only requests cannot create
  new stages or delete their parent. Existing retired originals always defer
  provider deletion, including while workers are stopped. Omitting a record ID
  does not bypass the decision. Unattached upload rollback keeps its existing
  behavior while inactive; the closed legacy-delete gate rejects object-only
  cleanup until a separately proven unattached cleanup protocol exists.
- The original consumer delivery revocation still runs before returning legacy
  `{ok:true}`. Provider deletion is skipped only when the staged decision says so.
- Text-only expiry has an irreversible claim and mutation audit. The same
  transaction advisory lock is enforced by a trigger on every legal-hold write,
  including existing service-role hold creation. Hold first blocks purge; claim
  first rejects later preservation with an explicit cannot-preserve error.
- Exact known hold targets, author/account holds and attachment parent bindings
  are respected. Unknown legal target scopes conservatively block expiry until
  an explicit verified mapping exists. No hold metadata flag substitutes for a
  real active legal-hold row.
- A manual service-only bounded worker processes at most 20 text records, 20
  stage recoveries and 20 proven media retirement claims per request.
  Settings default off; no schedule exists.
- A later retirement/expiry migration supports a bounded private R2 original-key
  class with permanent provenance and non-reuse guards. The worker rechecks the
  registry, live references and guard coverage, claims under the legal-hold lock,
  then uses an isolated private DELETE signer. It never supplies origin URLs to
  clients or widens the inspection reader's methods.

## Safe activation contract and remaining blockers

Media retention is not production-ready. All flags remain disabled. The
service-only `deleted_content_expiry_readiness()` reports actual source inventory,
guard coverage, unresolved stages, flags and qualification gaps separately.
Raising activation/capture/staging/expiry flags now checks that report under the
admission fence; setting `activation_ready=true` alone is insufficient.

The bounded contract is **verified private R2 canonical originals**, actual
deleted text, and explicitly identified empty metadata. It is not all-provider,
all-rendition coverage. The database checks source coverage and admission guards.
Privileged rollout evidence references assert client enforcement, worker
scheduling and origin cleanup qualification; the report labels those as operator
assertions, not independently observed facts. A recent completed worker pass is
liveness evidence only, including when all queues were disabled.

1. `s3` means Hetzner in the current origin configuration; it does not mean AWS.
   Existing upload reservations contain MIME/size, not a provider-immutable
   version ID. R2's documented conditional PUT/HEAD operations do not establish
   atomic conditional DELETE. An ordinary HEAD followed by DELETE is unsafe.
   Hetzner supports deleting an exact version ID, but the application does not
   currently preserve the original verified version ID. Hetzner remains outside
   the enabled key class. R2 cleanup instead relies on permanent logical-key
   retirement: all future legitimate admissions and delivery are denied. Late
   pre-retirement uploads may leave unreachable bytes until another cleanup pass.
   A HEAD 404 records only the observation time, never guaranteed permanent byte
   absence or an exact physical-deletion deadline. No unproven-key DELETE exists.
2. Legacy Supabase Storage `remove()` bypasses the gateway. Its bytes cannot be
   promised retained by a row snapshot trigger. That provider remains outside
   media-retention coverage. The read-only production inventory supplied on
   2026-10-20 contained 15 Supabase videos and 8 Supabase attachments, alongside
   12 R2 videos and 4 R2 attachments. R2 counts alone do not prove eligible
   provenance. Unsupported inventory blocks activation. Preferring R2 does not
   authorize migration or deletion. Full legacy coverage needs a separately
   approved migration with preserved originals/provenance and old-client
   exclusion, or a separately implemented and qualified provider adapter.
3. An abandoned object-delete stage keeps its original reconciliation deadline.
   An attached original returns `attached_requires_explicit_content_delete`;
   only fresh whole-content intent can delete that content. Missing/replaced
   originals can acquire a separate hold-serialized cleanup claim if exact
   immutable provenance, original parent scope and all reference guards pass.
   Cleanup never creates a deleted-content snapshot, adopts an edit as history,
   renews a clock, restores delivery, or deletes a parent. Old stages erroneously
   linked to a later deletion are selected by the registry's actual state.
   Claimed orphan keys remain permanently fenced and retryable after worker loss,
   failed DELETE/HEAD, ambiguous outcomes and runtime stops.
4. Media/shared-object reference traversal, retired-object write exclusion and
   per-object irreversible claims are implemented for that bounded key class
   and require independent review/full PostgreSQL CI before merge. Unknown
   locator tables, disabled admission guards, pending scans or shared references
   fail closed. At expiry, a parent-deleted attachment can remove only its exact
   original source incarnation after proving the parent deletion archive has
   expired and the parent is still deleted/absent. Restores, changed bindings and
   shared references block the claim; shared-reference failure rolls back source
   removal. Empty media metadata has a capture-time disposition and bounded text
   expiry. Historical unknown media does not acquire that proof retroactively.
   Distinct secondary media (covers, playback locators, renditions and producer
   jobs) and brand media remain outside this original-only cleanup contract and
   block readiness where present. A rendition metadata row is covered only when
   its exact object, owner, source incarnation and verified reservation prove it
   aliases the same original; a quality label alone is not proof. Other cleanup
   and retention paths need further reviewed scope.
   Soft media archives are covered only for the proven deleted-parent attachment
   path. Independent soft attachment deletion and soft metadata-only media have
   no supported expiry path and must block readiness. Current consumer attachment
   deletion uses a hard delete; privileged historical state is not assumed safe.
5. Account purge remains its existing restore-window-controlled deidentification
   workflow. It does not silently become content erasure or create new copies of
   identity fields, push tokens, notifications or other scrubbed personal data.
6. No schedule is installed. Client/server rollout, a qualified recurring worker,
   exact-head validation, provider failure qualification, and explicit production
   authorization remain required. Worker completion cannot certify R2 behavior.
   Stopping workers preserves claims/tombstones; restarting retries them without
   extending retention. Already authorized in-flight provider work may finish
   after a runtime stop, so a stop is not a claim cancellation.
7. The legacy object-delete gate starts open while retention is inactive. Before
   activation it must be explicitly closed and existing provider requests drained.
   SQL cannot hold a transaction lock across an earlier HTTP DELETE. A privileged
   drain-evidence reference must cover those in-flight requests and signed
   request validity; a guessed wait is not qualification. After the retention
   fence has armed, the gate cannot reopen. Failed/unattached upload cleanup and
   replacement/secondary-object deletion are not converted into content deletes;
   their active object-only requests fail closed. Qualifying that consumer
   behavior is required before enabling this bounded contract.
   A runtime stop after first activation is a fail-closed availability mode:
   retiring keys stay fenced and full media deletion can pause. It does not
   restore the old immediate byte-delete route.

## Production sequence (not executed by this source change)

1. Review the exact candidate and pass protected Required Validation. Source
   filenames now match the ten confirmed deployed receipts, from
   `20261020124645_owner_content_inspection_disabled` through
   `20261020141850_admin_reports_dmca_complete_history`, with SQL bytes preserved.
   The four dormant repairs were deployed through the approved Supabase migration
   API on 2026-10-20, which assigned these receipt versions:
   `20261020201310`, `20261020201322`, `20261020201336`, and `20261020201937`.
   This source reconciliation does not write remote history or deploy anything.
   All four deployed SQL bodies match the reviewed source byte-for-byte. All
   inspection/retention flags remain off, the reference fence is unarmed, and
   no worker qualification or heartbeat was recorded. Recheck exact version,
   name and body parity; do not reapply these bodies or edit deployed SQL.
2. Decide and authorize legacy-object coverage. Inventory every current original,
   secondary locator and producer path; resolve uncovered classes without
   deleting/moving originals merely to clear a gate.
3. Deploy the approved database/functions and compatible clients with every
   retention flag off. Verify exact session/owner delete behavior, unsupported
   old-client failures and unchanged inactive consumers. Separately authorize
   closing the legacy-delete gate and prove earlier provider requests drained.
4. Qualify origin cleanup and stopped/restarted workers using disposable approved
   objects; verify hold-before-claim, claim-before-hold, ambiguous provider
   responses, late uploads and monitoring. Authorize/configure a schedule
   separately, then collect a disabled-worker heartbeat and bound operator
   evidence to the approved source revision.
5. Recheck readiness and inventory immediately before any explicitly approved
   flag change. Enable only the qualified contract; retain permanent fences
   through rollback. Monitor overdue/held/shared-reference work and retry receipts.

## Validation

- `node scripts/test-deleted-content-retention-postgres.mjs`: actual synthetic
  PostgreSQL SQL in PGlite; not a multi-backend concurrency claim.
- `node --experimental-transform-types --test supabase/functions/_shared/deleted-content-retention.test.mjs supabase/functions/_shared/deleted-content-media-expiry.test.mjs`
- `supabase/tests/deleted_content_retention_test.sql`: canonical rollback-only
  pgTAP tests on the full migrated disposable database, plus
  `supabase/tests/deleted_content_media_expiry_test.sql` for media claims and the
  readiness, delete-intent (including real session-revocation rollback),
  stage-recovery and terminal-source-cleanup suites.
- `node scripts/test-deleted-content-retention-concurrency.mjs`: observed
  two-backend PostgreSQL lock orderings on a generated disposable local clone,
  including edit/delete, legal holds, activation/admission and abandoned stages.
  The runner also exercises the production worker
  against a real local TLS/SigV4 endpoint with provider failures and restarts.
  Synthetic local transport qualification does not establish live R2 behavior.
  The runner never points at a remote URL or modifies the local source database.

Official provider capability references reviewed 2026-10-20:

- https://docs.hetzner.com/storage/object-storage/supported-actions/
- https://developers.cloudflare.com/r2/api/s3/api/
- https://developers.cloudflare.com/r2/reference/consistency/

Expiry dispatch fairness: each bounded list call atomically leases selected IDs for
one minute in a private dispatch ledger. Text, media, and abandoned-stage queues
advance past held/unsupported items; those items automatically become eligible
again after the lease. A worker crash delays retry rather than losing work. Dispatch
leases never change deleted_at, expires_at, or the abandoned-stage deadline.
Synthetic SQL tests cover twenty held entries followed by a usable twenty-first
entry for both text and media, preservation of all holds, and subsequent retry.

Inactive compatibility: a private monotonic latch is installed with the first
retention migration, before any legal-hold trigger. Until capture is explicitly
enabled, existing writes take only a shared latch lock and do not acquire the
global retirement lock or impose READ COMMITTED on unrelated transactions.
Capture enablement waits for pre-enable writers. After it commits the latch
stays armed, even if runtime flags are disabled, to preserve existing claims and
retired-key fences. Rollback of enablement leaves the latch unarmed. Stale
repeatable-read snapshots fail on a changed locked row rather than bypassing the
fence. Activation still requires checking the enabled protocol's isolation and
provider assumptions; source merge does not enable it.

The fixed 30-day window is exactly 720 elapsed hours, including DST crossings;
server capture and both archive/retirement constraints use that same duration.

## Verified user-specific hold scope deployment

On 2026-10-25 at 08:32:49 UTC, the approved hold-matching correction was
installed as `20261025083249_deleted_content_user_id_hold_scope`. The source
filename now matches the installed identity; SQL bytes are unchanged, SHA-256
`033a73ec64f7ed5ab5233a1d87ca6f2998d845eb9a79949826a504de344c72e2`.

Independent readback verified the exact SQL and function body, all eight
owner/nonowner/malformed/unknown-scope behavior checks, and unchanged function
permissions, all 12 hold records (10 active), and retention, Brand and inspection
settings. No holds were released. Retention remained off; this deployment did
not enroll content, activate expiry, or deploy the separate copy/archive protocols.
# Archived empty-test disposition (source-only)

`20261025114152_platform_brand_empty_test_disposition.sql` adds a distinct
`archived_empty_test` retention evidence branch. It does not classify empty bytes
as clean media, repair historical scan outcomes, overwrite source sizes, or grant
delivery/publication access. Existing positive-byte proof and scan-receipt paths
remain unchanged. The migration contains no target authorizations or activation.

The required order is separately approved private exact-target PRE-archive
authorization, genuine authenticated asset-owner
`remove_platform_brand_empty_test_asset`, then trusted empty-origin measurement
and registration. The bounded wrapper calls unchanged canonical
`remove_platform_brand_asset`, preserving current session/legal/Premium/path
authority, the permanent server-observed tombstone and full 720-hour clock. It
atomically records one private immutable Owner-removal receipt. It cannot archive
another account's asset, reconstruct a past removal, or seed authorization.
Exact retries reestablish canonical current authority and preserve the clock.

The intent freezes the active draft, original incarnation, complete terminal
scan jobs and decision digest. The receipt freezes the postarchive core; only
canonical removal fields may differ. Every history exception, observation,
disposition, coverage and claim path requires both. Any failed reference, hold,
snapshot or receipt check rolls the entire new removal back. This path works
with global capture off and does not write global capture/delegation/audit rows
or change flags. Optional global records must be entirely absent or one fully
consistent pair; later legitimate capture does not invalidate frozen core
evidence. The receipt explicitly reports whether global capture existed at
removal, and is never itself described as global capture. Unknown/missing
bindings and mutable/claimable scan histories fail closed.

The existing operator migration endpoint's narrowly scoped
`record_brand_empty_test_disposition` action accepts only `assetId`, obtains an
authorization-bound observation token, streams the canonical authenticated origin,
and rechecks the exact archived generation before and after a complete HTTP 200
read. Zero actual bytes, empty SHA-256, successful EOF, identity encoding and no
Range/Content-Range are mandatory. Missing/failed/truncated responses, catalog size
alone, and caller-supplied hashes cannot qualify. Signed URLs/tokens are never
returned. Registration is immutable; only an identical observation/result retry
is idempotent. Conflicting evidence is rejected, not replaced.

Coverage reports `retained_empty_test` or `claimed_empty_test`, never
`brand_verified_original`. `platformBrandMissingCurrentScanProofCount` remains a
truthful positive-proof count; `platformBrandMissingRetentionEvidenceCount` and
`platformBrandSupportedEmptyTestCount` distinguish supported empty dispositions
from unresolved gaps. Holds prevent actions without mislabeling retained evidence
as uncovered. Exact authorized terminal jobs are audit evidence only and cannot
be changed, deleted, truncated or requeued. Additional aliases/references and
unrecognized locator schemas still block expiry.

Mature, qualified expiry atomically creates an immutable typed claim-evidence
sidecar bound to the disposition digest and original generation. Missing metadata
cannot qualify an initial claim. Existing claims are not reinterpreted; an exact
empty claim can subsequently recover without metadata only through its original
evidence. The existing dispatch-intent protocol remains at-most-once, including
observation-only recovery after uncertain dispatch. Provider qualification,
writer-drain/reference evidence, holds, absence checks and
`permanentlyAbsent: false` remain mandatory and unchanged.

Deployment of the bounded registration capability, exact private authorization
population, real Owner archival, origin credential use, expiry activation and
eventual permanent deletion each retain their separate approval boundaries.
Source validation authorizes none of those live operations. Local PGlite tests
cover SQL lifecycle/ACLs; the required hosted Database job additionally runs
independent-backend claim/dispatch contention and a mandatory unsafe-replay
mutation control in disposable PostgreSQL clones, never against providers.
