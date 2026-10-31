# Physical merchandise: automatic tracking (provisional sandbox source)

This adds **tracking only**, not label purchasing or shipping tools. The seller
enters the carrier and existing tracking number once on the order. Tracking mode
was already frozen at purchase. A failed provider never changes it to untracked.

## Implemented path

1. `assign_merch_tracking` checks the current exact session, seller ownership,
   paid sandbox order and tracked mode. Assignment is immutable. A number cannot
   be assigned to another order, including apparent recycled numbers. Corrections
   use the reviewed pre-delivery supersession flow below; deleting tracking is not a bypass.
   Creators can now submit a proposed correction with a reason from the order.
   Intake never replaces the assignment, reserves the proposed identity, or
   changes payment, destination, delivery evidence or the accepted return clock.

### Reviewed pre-delivery corrections

The creator's current exact session and paid, tracked sandbox order are checked
before an append-only request is accepted. One pending proposal per order, bounded
notes, at most 100 historical proposals per order, normalized identity validation,
global already-assigned identity exclusion and frozen UUID replay checks prevent
silent edits or duplicated submissions. Buyers can read their own order status.
Submitting a request immediately adds a separate shipment verification/earnings
review hold. Existing carrier, return, dispute and financial holds remain intact.

Support has a keyset-paginated queue including declined-but-held requests. Both
existing `admin.support.manage` and `admin.refund_status.record` permissions are
required on every staff read/action. A staff reviewer cannot approve or decline
their own buyer or creator order. Declines are append-only and idempotent, and **do not clear the
verification hold**: rejecting a proposed number is not evidence that the old
number was correct. The UI distinguishes a request, approval, and carrier verification.

Owner-approved rule: staff may approve only before any delivery has EVER been
verified and only without immutable checkout/postal/full-address conflicts.
Revoking old delivery evidence does not reopen approval. Post-delivery and
address-conflict cases stay held; this flow cannot reset their return clock.

Approval locks the order, rechecks eligibility and global identity uniqueness,
appends a new assignment and immutable old-to-new supersession, retires the old
lease, and creates an unverified job for the new identity. Earlier assignments,
observations and registration state remain unchanged. The active leaf of the
supersession chain drives tracking reads, assignment retries, job claims,
completion, callback wake-ups and holds. Old callbacks cannot issue delivery
evidence for the replacement. Both serialized orders of approval versus carrier
delivery completion are covered by native contention schedules.

Approval resolves correction reports for the superseded identity, not delivery,
return/dispute clearance or payouts. The replacement stays held until fresh
authenticated merchant-scoped carrier reconciliation satisfies all existing
checks. Proposed identities are not reserved: if another order binds the number
first, approval fails without altering the order. Superseded numbers can never
be recycled across orders. Country/postcode corroboration is not exact-street
delivery proof. No provider qualification, credential, deployment or activation
is performed by this source change.

### Existing reconciliation path (continued)
2. Signed Shippo `track_updated` callbacks commit a bounded, hash-deduplicated
   private inbox receipt, then acknowledge. They do not directly issue delivery
   evidence. No unsigned notification is accepted.
3. The dedicated-secret `merch-tracking-reconcile` worker claims at most five
   jobs with expiring leases. Qualified merchant account identity is frozen on
   first claim. It registers the existing number at most once and performs an
   authenticated merchant-scoped GET. An uncertain registration is not re-POSTed;
   polling still works. Lost leases reject late completions.
4. The canonical signed Stripe Checkout lifecycle stores only shipping country
   and postal code, not full street/name. It uses the pinned Clover
   `collected_information.shipping_details.address`, never billing or metadata.
5. A matching carrier/number, test environment, destination country/postcode,
   plausible earliest tracking event after verified purchase, and explicit-offset
   delivery timestamp produce **corroborated** delivery. This starts the existing
   720-hour return clock automatically. It is not proof of parcel contents or an
   exact address. No platform-purchased label is required.
6. Missing/ambiguous destination or date, old/recycled shipment history, identity
   mismatch, corrections, returned/failure/unknown status or transport outage
   remain review-held. Prior delivery evidence is revoked append-only, retaining
   its original clock timestamp; corrections do not silently reset the clock.
   Carrier status remains separately visible. Return/dispute clearance is carried
   forward unchanged, never invented from tracking. No money is released.

The worker polls every six hours after successful checks; review/errors retry
after two hours. A carrier callback can wake it sooner. Reads add a review hold
when checks are older than twelve hours or qualification expires. At most one
registration POST plus approximately four routine GETs/day/shipment is expected,
with up to twelve GETs/day for review/errors and additional callback wakeups
(coalesced to at most once per fifteen minutes per assignment). Polling currently
continues until qualification expires; terminal archival/retention needs an
operational decision before live use.
This is an operational estimate, not a promised provider billing schedule.

## Still disabled / operational requirements

- The migration seeds **no** qualification or merchant account mapping. No API
  role may write those tables. Absent qualification yields no outbound calls.
- Adapter accepts only `shippo_test_` keys and provider `test:true` results.
  Synthetic tests use injected transport, never real provider calls. Real Shippo
  canned test tracking uses carrier `shippo`, while the seller form accepts actual
  USPS/UPS/FedEx assignments; these fixtures are not carrier compatibility proof.
- Account/marketplace qualification, mapping, test credentials, webhook HMAC
  setup, hosted worker schedule, observability/alerts, activation and deployment
  require separate authorized work. Nothing here creates them. A scheduler should
  invoke the worker regularly; otherwise no automatic operational service exists.
- Before live enablement, qualify actual USPS/UPS/FedEx fields/timezone precision,
  per-merchant access, rate limits, polling and registration billing, lifecycle
  retention, webhook signature header, privacy retention/deletion policy and
  carrier corrections. Qualification expiry must be maintained independently.
- Postal differences (including ZIP+4 versus ZIP5) are conservatively held rather
  than guessed. Missing original shipment dates/history are held. Provider data
  cannot prove contents. Fraud/support cases remain independent.
- There is no production release executor or order-wide case-clearance issuer.
  Fresh reconciliation must be included in any future financial release workflow.
  True multi-connection contention and managed PostgREST/cron need separate tests;
  embedded PostgreSQL tests do not prove network scheduler operation.

## Costs and provider qualification

Shippo's public API tracking price is $0.02 per unique external tracking number;
its free-label quota is not free external tracking. Marketplace managed-account
setup and HMAC require provider coordination, so this is not a confirmed
Chi'llywood contract or final total. Confirm GET/repeated registration treatment,
managed-account fees and rate limits before activation. No provider inquiry,
account acceptance or paid activation was performed by this source task.

Official references checked October 30, 2026:

- https://docs.goshippo.com/tracking/tracking
- https://docs.goshippo.com/tracking/webhooks
- https://docs.goshippo.com/tracking/webhook-security
- https://docs.goshippo.com/guides/integration-paths
- https://goshippo.com/pricing/api
- https://support.goshippo.com/hc/en-us/articles/360003855652-Shippo-Subscription-Plan-Overview
- https://github.com/stripe/stripe-php/blob/master/lib/Checkout/Session.php
- https://supabase.com/docs/guides/functions/auth

Environment contract (server only): `MERCH_SHIPPO_TEST_TOKEN`,
`MERCH_SHIPPO_WEBHOOK_SECRET`, `MERCH_TRACKING_WORKER_SECRET`, and existing
Supabase admin configuration. Never put these in the app bundle. HMAC is optional
for polling availability, not optional for accepting callbacks.

## Source validation

Focused synthetic checks cover signed callback → durable SQL inbox → injected
authenticated provider GET → append-only delivery evidence → 30-day projection,
lease exclusion/replay/null expiry, carrier corrections, destination conflicts,
recycled numbers, wrong actors, expired sessions, transport failure, qualification
expiry and preserved financial/case holds. Mounted tests exercise the real panel
and RPC adapter, including duplicate taps and interrupted focus.

`scripts/test-merch-tracking-concurrency-postgres.mjs` is registered in the existing
hosted database job. It creates its own disposable local CLI database clone and
requires observed PostgreSQL blocking edges for number reuse, duplicate inbox,
completion/revocation and policy-expiry races, plus simultaneous SKIP LOCKED
worker exclusion. It was **not executed locally**: native concurrency and the
12 new pgTAP assertions remain pending the hosted exact-head database job. Syntax
and source review are not a native pass. No production database is a test target.
