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
- Legacy gateway storage-first deletes can stage verified upload bindings before
  delivery revocation. Metadata deletion finalizes them. Staging is never an
  inspection archive and never copies object bytes.
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
  stage classifications and 20 proven media retirement claims per request.
  Settings default off; no schedule exists.
- A later retirement/expiry migration supports a bounded private R2 original-key
  class with permanent provenance and non-reuse guards. The worker rechecks the
  registry, live references and guard coverage, claims under the legal-hold lock,
  then uses an isolated private DELETE signer. It never supplies origin URLs to
  clients or widens the inspection reader's methods.

## Activation blockers and honest coverage

Media retention is not production-ready. The schema's readiness flag records a
future explicitly reviewed activation; it is not proof that these blockers are
solved. Do not enable capture or staging until bounded storage cleanup is proved.

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
   media-retention coverage.
3. An abandoned legacy object-delete stage has a fixed one-hour reconciliation
   deadline. The classifier distinguishes finalized deletion, an attached source
   whose metadata delete did not arrive, a replacement, and a missing deletion
   commit. It never renews the deadline, invents a deletion snapshot, restores
   delivery, or deletes the parent. Automatic repair is blocked: an old object
   delete cannot authorize deleting the whole parent, and restoring delivery
   would contradict the requested byte deletion. Complete this with an explicit
   content-delete operation plus a proven exact-object deletion adapter before
   enabling staging. Merely classifying an overdue stage is not completed cleanup.
4. Media/shared-object reference traversal, retired-object write exclusion and
   per-object irreversible claims are implemented for that bounded key class
   and require independent review/full PostgreSQL CI before merge. Unknown
   locator tables, disabled admission guards, pending scans or shared references
   fail closed. Soft-deleted original rows and parent-deleted attachments whose
   metadata remains stored conservatively block cleanup; no restore admission is
   silently removed. The text expiry function refuses attached/staged media.
5. Account purge remains its existing restore-window-controlled deidentification
   workflow. It does not silently become content erasure or create new copies of
   identity fields, push tokens, notifications or other scrubbed personal data.

## Validation

- `node scripts/test-deleted-content-retention-postgres.mjs`: actual synthetic
  PostgreSQL SQL in PGlite; not a multi-backend concurrency claim.
- `node --experimental-transform-types --test supabase/functions/_shared/deleted-content-retention.test.mjs supabase/functions/_shared/deleted-content-media-expiry.test.mjs`
- `supabase/tests/deleted_content_retention_test.sql`: canonical rollback-only
  pgTAP tests on the full migrated disposable database, plus
  `supabase/tests/deleted_content_media_expiry_test.sql` for media claims.
- `node scripts/test-deleted-content-retention-concurrency.mjs`: six observed
  two-backend PostgreSQL lock orderings on a generated disposable local clone:
  edit/delete in both orders and legal hold/text expiry and hold/media claim in
  both orders. Never points
  at a remote URL or modifies the local source database.

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
