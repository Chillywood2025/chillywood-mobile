# Event provider coverage (source/test only)

The normal event broadcast transport already authenticates HTTPS Egress RPCs
against the event's assigned LiveKit server. This change carries a **whitelisted
projection** of those responses through the existing producer, then atomically
records the existing playback receipt and a new immutable private timing receipt.
No webhook secret, new provider, credential, scheduler activation or deployment is
introduced. Existing history is not backfilled from dispatch/receipt timestamps.

## Provider meaning and limits

Reviewed 2026-10-30:

- [LiveKit Egress API](https://docs.livekit.io/reference/other/egress/api/):
  `EgressInfo` start/end and `SegmentsInfo` start/end, duration and count.
- [Official protocol](https://github.com/livekit/protocol/blob/main/protobufs/livekit_egress.proto):
  corresponding int64 fields, errors, retry count and backup-storage indicator.
- Local pinned `@livekit/protocol` 1.50.4 generated types also declare segmented
  output start/end/duration/count as int64/bigint. The existing server transport
  imports `livekit-server-sdk@2` but reads raw authenticated ProtoJSON RPC responses;
  it does not use lossy JavaScript numbers for these int64 facts.

`evidence_available` means **provider-reported recorded-output interval evidence**, with
private live activation observed during the service window and no known
interruption in retained receipts/inspected manifests. It does not establish each
viewer's reception, subjective performance quality, host presence continuously,
or absence of every unobserved network gap. The private-origin verifier checks the
manifest and first segment; it is not a full media audit. Duration is provider
reported, not inferred from callback arrival. Missing or conflicting evidence
holds rather than being upgraded to successful delivery.

## Integration

`private.creator_event_verified_coverage(event_uuid, original_revision_terms)`
returns an evidence object, never a broad fulfillment or payout qualification:

```
{ evidence_available: true, full_original_interval: true, review_required: false,
  provider_started_at_ns: '<exact decimal string>',
  provider_ended_at_ns: '<exact decimal string>',
  output_started_at_ns: '<exact decimal string>',
  output_ended_at_ns: '<exact decimal string>',
  duration_ns: '<exact decimal string>', segment_count: '<exact decimal string>',
  provider_ended_at: '<timestamp rounded down to database microseconds>',
  evidence_reference: 'creator_event_provider_coverage:<immutable-receipt-uuid>',
  promise_hash: '<sha256-original-terms-jsonb>',
  coverage_kind: 'provider_recorded_output_interval' }
```

The caller must supply the contract's actual immutable offer-revision terms,
bind returned facts to its contract/allocation, and separately enforce replay
expiry and replay evidence, available Stripe funds, unresolved issue/remedy/refund
holds and exact test-environment restrictions. This helper issues no money or
release authority and has no API-role execution grants. It takes the event row
lock in the same order as the provider recorder, serializing issuance with new
receipts in the caller's transaction. A later contradictory/unknown receipt makes
a new evaluation fail; callers must re-evaluate before dispatch, not cache success.
An ACTIVE observation can arrive after scheduled start while the actual provider
timestamp proves an earlier recording start; existing D2 verified-start/no-show
rules remain separate and are not replaced with a new observation-time policy.
An authenticated ENDING result remains pending cleanup, not UNKNOWN or fulfilled;
only a subsequent complete output can qualify it.

Missing/contradictory facts return `evidence_available:false`,
`full_original_interval:false`, `review_required:true`. Valid actual intervals
shorter than the full original promise return the interval facts with
`evidence_available:true`, `full_original_interval:false`, `review_required:true`,
and reason `original_interval_unverified`. The automatic payout path can remain
review-held for insufficient evidence. Neither case means the creator failed,
creates a no-show/refund/rejection, or changes access.

The existing D2 **30-minute no-show threshold is unchanged**. It is not permission
to shorten promised service, and exact original-interval evidence is not a new
no-grace punctuality/refund rule. Issuers and UI must preserve this distinction:
"needs review / insufficient full-interval evidence", never "no-show" merely
because `full_original_interval` is false. Material reschedule and accepted-choice
policy remain in the original contract-policy evaluator; this primitive only
compares the exact terms supplied by that trusted evaluator.

One completed attempt must cover the complete original start/end interval;
multiple restarts are not silently stitched together. The output duration must
cover its recorded interval and cannot exceed the overall Egress interval. Exact
event/session/server/room/output/egress identity, successful private activation and
complete private output are required. Failed, aborted, unknown, retried, conflicting
or missing timing, provider error/details, backup storage and known HLS GAP or
DISCONTINUITY hold. Alternate providers, missing timing, changed schedules and
unsupported representations require future explicit evidence handling; this
change never guesses or adds a buyer-satisfaction policy.

## Verification

- `node --test tests/creator-money/event-provider-coverage-postgres.test.mjs`:
  actual parser → runtime → complete migration-chain PGlite SQL, real service and
  authenticated roles, short elapsed synthetic event, positive and malformed,
  unknown, interrupted, early-ending, wrong-output/identity, immutable and ACL
  controls. Provider payloads are synthetic; no network or money operations.
- Existing event producer/runtime tests retain playback/recovery behavior;
  additional manifest-marker tests preserve playback while excluding coverage.
- `supabase/tests/creator_event_provider_coverage_test.sql` adds native pgTAP
  schema/ACL/int64/forward-only assertions. Hosted native database/concurrency and
  complete exact-head Required Validation remain integration gates, not claimed
  by an embedded single-connection test.

Remote migration-history artifact reviewed through `20261030001043`; new migration
`20261030203644` was created with the cached official Supabase CLI. Creation
succeeded; the CLI subsequently reported analytics shutdown timeout. No migration
was applied remotely. Rollback is source revert before deployment; once deployed,
schema correction is forward-only and immutable facts must be retained.
