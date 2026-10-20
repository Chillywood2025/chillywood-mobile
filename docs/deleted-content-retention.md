# Deleted-content retention: disabled source implementation

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
   The four undeployed repairs were allocated later versions by the Supabase CLI:
   `20261020142315`, `20261020142317`, `20261020142318`, and `20261020142319`.
   This source reconciliation does not write remote history or deploy anything.
   Recheck exact version, name and body parity before separately authorized
   deployment; do not reapply deployed bodies or edit historical deployed SQL.
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
