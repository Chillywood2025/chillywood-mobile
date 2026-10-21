# Notification preference revision authority

## Scope

Feature `notifications-fcm`, `/settings` Notifications accordion, and the
preference readers in the app layout and Chat screen. This extends the local
ownership contract in `NOTIFICATION_SETTINGS_ASYNC_OWNERSHIP.md`; it does not
replace its session, focus, foreground, keyed-remount, or transport-settlement
controls. Android and iOS share this preference protocol. Existing switches,
labels, disabled states, and alerts remain the presentation and accessibility
surface. No native module, provider delivery, Premium, or payment policy changes.

The reproduced defect involved two independent app/helper runtimes. An old
dispatched false write could arrive after a newer successful true write and
overwrite durable settings while the newer screen still showed true. A
per-process lease cannot serialize independent runtimes.

## Server contract

- Atomic read/initialize inserts defaults only if the row is absent. It never
  replaces existing values or advances their revision. Reads remain replaceable.
- A server-generated immutable row incarnation plus a bigint revision identify
  the exact state. Both are captured with the user intent before any await;
  revisions cross the client boundary as decimal text, not JavaScript numbers.
- Accepted explicit mutations, including same-value writes, advance revision.
  A stale incarnation or revision returns a conflict and current preferences.
  The client never rebases or automatically resubmits the old intent.
- Operation IDs bind exact requests. A lost acknowledgement can be retried with
  that same request without applying twice. Historical receipts must not be
  presented as current success after another revision or row recreation.
- Read and mutation authority is the existing exact authenticated subject and
  session, rechecked after lock waits. No caller-selected owner is accepted.
- Direct authenticated INSERT/UPDATE is removed in the source migration; reads
  retain own-row policy. Existing service permissions are preserved. Server
  updates advance revision, and service deletion/recreation changes incarnation.

## User-visible outcomes and rollout

A conflict displays current preferences and explains that the stale change was
not saved. An uncertain transport or malformed acknowledgement is not treated as
noncommit: editable preferences are cleared and the user is asked to Refresh.
Refreshing shows current values, not proof that a particular lost operation was
or was not committed. Register Device requires loaded preference authority and
captures that authority before starting its existing provider flow.

This is an always-on write-contract change, not a dormant flag. The migration
must precede the matching updated client. Old clients that use direct upsert
will not be compatible after that change. Deployment requires separate approval
for the exact database permission/function changes; source approval does not
apply the migration. Rollback must retain server authority rather than restoring
unconditional writers. No production, provider, credential, build, OTA, or
release action is part of this source change.

## Evidence boundaries

Mounted whole-screen/helper and actual Supabase SDK tests cover the separate
runtime race, same-value latest intent, session changes, conflicts, unknown
acknowledgements, recreation, and refresh replacement. Actual migration tests
cover SQL admission and receipts; native PostgreSQL competing transactions in
Database CI are required for lock/revocation claims. Local PGlite execution is
not native concurrency proof. Signed/installed Android and iOS golden cases and
physical push delivery remain unproved by these source tests.

The historical reverse-patch controls retain their original provenance fields.
The old local helper baseline object was unavailable in the accessible local Git
databases and remote history. Its original byte identity is not claimed: the two
helper controls instead pin separately named current-context witnesses produced
from immutable main 191ffb8e and the existing reviewed reverse patches. The three
Settings witnesses also match their original target hashes. Rebased patches
reconstruct those exact witness bytes; failures must reach the named old race
assertions, not fail because of missing revision APIs or test-fixture exports.

Push token registration/revocation still has only its existing process-local
ordering and exact-owner controls. This preference CAS does not solve
cross-process provider registration versus revocation ordering, manufacture a
server push-intent sequence, or guarantee that a device registration is undone
when a subsequent preference save conflicts.
