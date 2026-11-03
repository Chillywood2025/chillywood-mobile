# Tracking transport bounds and operational readback

Checked November 3, 2026, 20:59–21:01 UTC against main
`a7eb368b802f59c27783711c0857426afb80f99c`. This is source repair and
read-only verification, not provider activation or deletion commissioning.

## Concrete repairs

- An oversized tracking response awaited stream cancellation. When the
  underlying cancellation promise never settled, the advertised body deadline
  did not bound the request. Cleanup is now best effort and cannot delay the
  size-limit failure. Pending and rejected cancellation are covered for both
  oversized and stalled real Web Streams.
- The signed webhook previously had no database deadline, classified a rejected
  database request as an invalid notification, and acknowledged missing receipt
  data. It now shares the existing worker's five-second database deadline,
  distinguishes malformed input from retryable receipt failures, and requires
  the exact existing SQL response shape. A valid but ineligible assignment is
  explicitly acknowledged as not accepted.
- A timed-out receipt does not establish that SQL failed to commit. The retry
  preserves the identical payload hash, which the existing durable inbox uses
  for deduplication. Tests cover a late successful receipt followed by a retry.

No tracking registration, label purchase, provider call, schema change, money
activation, storage write, or deletion is introduced. Existing worker queue,
lease and aggregate limits are preserved.

## Fresh read-only operational evidence

- Production migration history contains 583 rows. Both deployed tracking
  closures match the baseline above byte-for-byte: reconcile version 2 and
  webhook version 3, each including the shared tracking, Stripe helper and exact
  subject-authority files. Existing `verify_jwt=false` is unchanged; the handlers
  retain their own worker-secret/signature authentication. This confirms the
  previously merged GET-only repair is deployed, not this new bounds repair.
- Tracking qualification, account and assignment counts are all zero. The
  financial reconciliation driver remains disabled. Actual Shippo account,
  signing, pricing, carrier payload and sustainable capacity qualification is
  still required.
- The owner-health monitor is active every five minutes and checked at 21:00 UTC.
  Its warning is `driver_disabled`. Two durable health events have two matching
  in-app notifications. These database records do not prove device push receipt
  or an owner's observation of an alert.
- Secondary-media registry and expiry switches remain off. Storage-transport
  qualification count is zero. Existing hold, owner, reference and immutable
  generation safeguards remain in place; irreversible deletion has not been
  activated or exercised.

The local handler and Web Stream tests do not qualify Shippo or storage-provider
transport. PostgreSQL/WASM fixture results are not native concurrent-server
proof. Protected exact-head Required Validation remains necessary before merge,
and any eventual deployment needs its own authority and independent readback.
