# Legacy R2 original retention adapter

## Source scope

The forward-only migration `20261021134020_deleted_media_legacy_provenance_adapter.sql`
adds a distinct immutable legacy-provenance identity. It does not fabricate upload
reservations or verified/attached timestamps. Enrollment is privileged database
work, not a consumer or service-role RPC, and requires separately reviewed exact
origin/ownership/scan/writer-drain evidence plus one matching historical migration
audit. The record freezes owner, source incarnation, exact locator and attachment
parent. Evidence digests are reviewed assertions, not provider proof PostgreSQL
can independently establish.

Stages and permanent retirement records carry exactly one provenance type: a
real upload reservation or the legacy record. Source coverage, registration,
capture, recovery and claim binding preserve that tag. Legacy references exclude
no upload reservations; competing reservations cannot disappear through SQL NULL
comparison. Cleanup uses frozen attachment-parent identity, not guessed key
segments. Separate immutable delivery revocation replaces the old fallback which
would have manufactured a deleted upload reservation.

The migration changes no flags, qualification assertions, staff grants, existing
evidence or objects. Enrolled keys cannot be overwritten through the updated
migration writer or reopened by source recreation, even while capture is stopped.
The normal 720-hour retention clock, legal holds, reference guards and permanent
retirement remain in force. Retained legacy inspection stays unavailable because
this adapter does not invent the required verified scan/reservation inspection
proof. Current-content inspection/report work is outside this change.

`media-storage` evaluates the negative-only legacy delivery fence at admission
and around asynchronous URL signing. Missing RPCs and malformed replies fail
closed. SQL must deploy before this gateway bundle. Previously returned signed
URLs retain their existing bounded provider TTL; immediate invalidation is not
claimed.

## Provider write contract

The migration copier checks retirement before copying and signs/sends
If-None-Match: * on PUT. A conflict is an error, never an unconditional overwrite
retry. Backup/export namespaces cannot be enrolled as legacy originals. This
source change does not cancel old signed requests, prove they drained, or ensure
permanent physical absence after late creates. Cloudflare documents atomic
conditional PUT in its [S3 compatibility reference](https://developers.cloudflare.com/r2/api/s3/api/)
and [S3 extensions](https://developers.cloudflare.com/r2/api/s3/extensions/).
Documentation is not qualification of the deployed credential, bucket or route.

## Validation and honest limits

- `tests/retention-legacy-admission-plan.test.mjs`: offline evidence planner only;
  always returns no admission/deletion authority.
- `scripts/test-legacy-provenance-postgres.mjs`: ledger component executed in
  disposable PostgreSQL (PGlite), including stale/ambiguous audit, exact retry,
  immutable evidence, ACL, legal holds, source binding and safe locator checks.
- `scripts/test-legacy-retention-runtime-postgres.mjs`: actual combined migration,
  registration/capture/revocation/claim boundaries, without provider operations.
- `tests/retention-legacy-delivery.test.mjs` and
  `tests/retention-migration-writer.test.mjs`: fail-closed gateway transport and
  actual copier/signer functions, including create-only conflict behavior.
- `supabase/tests/deleted_media_legacy_provenance_test.sql`: full-schema pgTAP.
- `scripts/test-legacy-retention-concurrency.mjs`: independent native PostgreSQL
  sessions for enrollment/source changes, retry conflicts and hold/claim ordering.

The normal Required Validation workflow includes these tests. Native concurrency
and full-schema results must pass on the exact candidate head before merge.
PGlite results are not multi-session proof. No test result is live R2 proof.

## Remaining inventory and rollout decisions

The read-only 2026-10-21 production snapshot had 39 uncovered originals:
16 R2 originals and 23 Supabase originals. All 16 R2 originals lacked matching
verified/attached reservations and canonical new-upload key shape. This adapter
only makes exact, individually qualified R2 originals representable; it does not
automatically enroll those files or establish their historical evidence.

The same snapshot had 31 secondary records, 63 brand assets and 41 unresolved scan
jobs. Supabase originals still need a supported retention adapter or an explicitly
approved verified migration to R2. Secondary media and brand assets need their
own complete provenance/revocation/reference/claim lifecycle or approved migration
plus an appropriate lifecycle; moving bytes alone does not cover them. None is
excluded from global readiness. The held scanner remediation is untouched.

Before production enrollment/activation, separately qualify the exact current
provider route, ownership/incarnation/origin evidence, clean scan of those bytes,
all legitimate writers, prior signed-request drain, client enforcement, worker
schedule and origin cleanup. Deploying source, inspecting provider objects,
copying objects, changing persistent access, enabling capture/schedules and
irreversible cleanup are distinct actions with their applicable approvals.

There is no production enrollment, provider read/write/delete, credential setup,
unsafe rescan, activation, deployment or push performed by this source change.
