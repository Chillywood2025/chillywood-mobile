# Creator/buyer implementation decisions

Design reconciliation updated 2026-10-27. The original audit checkpoint was
`268711e4f9b68efe8fd3f905ad15d192ff8fb384`; recovery checkpoint
`4308e0324d2566549766ece4b22792a71a4d731e` preserves the existing implementation
before the recovery corrections. The original checkout is retained. Historical
observations are labeled below; full exact-head CI remains separate from these
local source results. The recovered publication at `c3823699` exposed a
reference-guard integration regression, recorded in the implementation ledger;
its repair does not alter the commercial decisions below. The owner approved
fixed-price virtual-show source/local-synthetic work on October26 at16:37 UTC and D1/D2 at
16:57 UTC. Those approvals are not requested again. Auctions, physical seats,
provider changes, live money operations, release, and money-sensitive merge
remain excluded.

## Approved policies and remaining owner decisions

| Decision / approval status | Owner policy or pending choice | Current implementation boundary | What must not be inferred |
| --- | --- | --- | --- |
| D1: Late verified payment — approved16:57 UTC | Atomically recover a place only if capacity remains and the original event schedule/replay terms remain valid. Otherwise retain a visible needs-resolution obligation. | Checkout starts only with a valid server reservation and current billing/source authority. A started unresolved attempt blocks another checkout after expiry or a new login. A verified late receipt uses its original immutable intent/revision and purchase timestamp, locks the source event, and cannot displace another valid hold. Failed recovery becomes `reconciliation_required`; payment evidence remains in history. | Recovery does not initiate another payment, grant a different event, promise available earnings/payout, or imply a refund completed. Expiry cannot cancel a pending store transaction or justify “nothing was charged.” |
| D2: Cancellation/no-show/material reschedule — eligibility approved16:57 UTC; thresholds pending | Affected purchases are eligible for a refund review through the payment provider's process. Owner still must select the material-change threshold, no-show grace period, consent/decline details and response responsibilities. | Preserve original terms, paid/pending history and exact ownership; stop new sales on cancellation; record eligibility separately from fulfillment and actual refund state. Reserved/purchased status transitions require managed lifecycle authority, including legacy edits to draft/ended/expired. Current entry follows authoritative event/stream state. Simple sales pause preserves existing access. | Eligibility is not a completed or guaranteed refund, amount, deadline, fee allocation, credit or payout promise. Do not automatically declare no-show after the start time, silently substitute another event, or invent the financial effects of paid-to-free conversion. |
| D3: Replay inclusion and expiry — pending | For new offers retain the existing explicit live-only/no-replay default; allow replay only with clear supported inclusion and expiry terms before purchase. Owner must decide whether replay is included, its availability deadline, expiry duration/basis, and remedy if promised replay is unavailable. | Snapshot purchased replay terms; preserve captured historical indefinite/until-expiration terms. Show a replay CTA only when event terms, current entitlement/window, and protected media authorization all permit it. At expiry retain history and deny replay. Legacy rows without captured terms require authoritative reconciliation, not invented rights. Restart is blocked when current or purchased terms promise replay because the current resolver cannot combine recording fragments. | A linked video, `replay_available` event status, or an unexpired event pass alone is not proof of protected-video entitlement. Do not shorten historical rights or substitute a later recording fragment for promised replay. Do not convert purchased virtual currency into an expiring entitlement. |
| D4: Creator self-start or per-show operator approval — pending | Decide whether an eligible creator may start their own show after technical qualification, or whether every show needs separate operator approval. The parent has asked asynchronously; no answer is recorded. | Prepare exact creator/event media authority and fail closed until required technical and current approval gates pass. No approval rows are seeded. A live-only replacement requires exact terminal provider/cleanup proof, current host/session/worker authority, the same finite approval, unchanged original terms and the original stop deadline. Keep source implementation distinct from deployed producer qualification. | A retry mechanism does not approve creator self-start. Do not treat lack of an answer as permission to remove operator approval, grant new roles, enable a provider, reset the cost deadline, retry an uncertain provider result, or claim live delivery. |

D1 recovery and D2 eligibility are approved. The remaining thresholds, replay
promise and D4 start policy are not. Reservation duration and sale windows are
visible technical settings, not substitutes for those decisions. A pending store
payment may outlive both the local hold and sale cutoff; provider success must
always be fulfilled under approved rules or reconciled visibly.

The recovery fixes implement independent authority and retry requirements; they
do not choose the outstanding commercial policies. Native PostgreSQL controls
passed for last-place admission, unresolved-checkout expiry, exact terminal
broadcast retry and original-deadline preservation. These are synthetic source
tests, not store purchases, provider receipts or permission to start a live show.

Suggested buyer copy for an unfulfilled verified payment: **“Your payment was
received, but your ticket is not confirmed. We need to reconcile this purchase.
Refresh its status or contact support; do not buy again.”** Use “payment status
is still being verified” when payment itself is unconfirmed. Neither message
promises a refund or completion date.

## Historical source evidence and implemented successors

The following observations describe the original checkpoint, not missing work
in the current implementation. The new reservation/revision, lifecycle/remedy,
purchase-library and protected-playback migrations now add the relevant source
contracts. The owner choices still pending are specifically identified above.

- [`202604200001_create_creator_events.sql`](../../supabase/migrations/202604200001_create_creator_events.sql)
  defaults `replay_policy` to `none`; permits `indefinite` and
  `until_expiration`; stores replay availability/expiry. Those mutable event
  fields do not establish an immutable per-ticket replay contract.
- [`20260827221500_historical_creator_access_lifecycle_closure.sql`](../../supabase/migrations/20260827221500_historical_creator_access_lifecycle_closure.sql)
  authorizes exact historical event passes with grant provenance, expiry,
  refund/revocation, creator/buyer and source-state checks. It excludes terminal
  source states but allows `replay_available`; it does not itself prove the
  replay media path enforces purchased event terms.
- [`20260827222000_revenuecat_ignored_charge_reconciliation.sql`](../../supabase/migrations/20260827222000_revenuecat_ignored_charge_reconciliation.sql)
  already creates service-owned obligations for verified charges that fail
  application authority. The disposition is
  `refund_or_authoritative_provider_reconciliation_required`; states are
  `pending_reconciliation`, `resolved_refund`, `resolved_authority`, and
  `resolved_no_charge`. Resolution requires a reference hash. A buyer-visible
  `reconciliation_required` presentation should map to this evidence, not
  expose privileged raw provider payloads or invent a second money record.
- [`20261026104519_creator_event_offer_lifecycle.sql`](../../supabase/migrations/20261026104519_creator_event_offer_lifecycle.sql)
  repairs update-in-place offer persistence while retaining existing semantics.
  It does not add organizer cancellation compensation, a no-show grace period,
  or a refund workflow. Source event cancellation and offer cancellation are
  different operations; the existing Free action is not a new Stop sales policy.
- [`_lib/creatorMonetization.ts`](../../_lib/creatorMonetization.ts) retains
  10000 creator basis points for tips and 8000/2000 for creator sales. Verified
  settlement, holds/reserves, reversals and payout readiness remain separate
  from price and gross receipts. No split, hold period or provider fee has been
  changed or newly promised by this design.

## Supported catalog evidence: all six modes

These are **repository catalog rows and calling contracts**, not a readback of
deployed tables, store approvals or available native products. The implemented
authoring catalog combines eligible existing platform rows and identifies each
tier's buyer-platform availability. Buyer lookup remains exact to platform,
environment, source type and currency. A reference-price row is not permission
to charge it. Preserve provider identity and validate the native quote exactly.

All amounts below are existing USD reference cents, not new prices.

| Mode | Google Play repository contract | App Store repository mappings | Current source qualification |
| --- | --- | --- | --- |
| Tips | Existing mapping99; **unavailable** under the existing minimum100 rule | Existing mappings99/299/499/999; eligible tips299/499/999 | Current catalog filters out99 on both platforms rather than changing the minimum or creating a product. Buyer selects an eligible tip; a pure tip grants no content entitlement. Stripe is not an alternative digital-sale rail. |
| Paid video | Existing sandbox99 | Existing99/299/499/999 | Current authoring supports eligible catalog tiers, with exact cents and platform availability. iOS selected tier is bound to the intent; Android returns no buyer product for a tier without its matching mapping. |
| Paid Watch-Party room | Existing sandbox99 | Existing99/299/499/999 | Current offer setter and room editor accept eligible catalog tiers. Historical iOS “Seat Pass” maps to exact Party Room viewer admission, not assigned seating or speaking permission. |
| Channel subscription | Existing499 monthly | Eight existing creator slots, each499 monthly | Authoring binds a supported existing price ID. Slots isolate creator identity, not eight prices. Current doctrine may include that creator's ordinary paid videos; VIP-only content and Premium stay separate. |
| VIP pass | Existing499 | Existing99/299/499/999 | Current authoring accepts a supported existing price ID and shows platform availability. VIP remains a nonrenewing30-day period from verified activation; no event admission or channel subscription is inferred. |
| Paid event | Existing sandbox99 | Existing99/299/499/999 | Current editor saves a supported fixed price, immutable terms and virtual-capacity/sale windows. Every purchase binds the exact event, revision, product, amount and reservation; unsupported buyer tiers fail closed. |

Live Stage is an additional subtype within the Watch-Party audit, not a physical
seat: Android has separate `live_watch_party_access_pass_sandbox_099` and
`live_watch_party_seat_pass_sandbox_099` products at 99. Participation eligibility
still requires host approval and underlying media authority. Do not reuse the
iOS Party Room `seat_pass` mapping as evidence that Live Stage iOS checkout is
qualified. Premium has its own product and entitlement and is outside these six
creator-sale catalog rows.

Catalog source evidence:

- [`20260603225500_sandbox_digital_product_mappings.sql`](../../supabase/migrations/20260603225500_sandbox_digital_product_mappings.sql):
  Android tip/video/room/stage/event sandbox products and their nonpayable flags.
- [`20260612224536_channel_subscriptions_v1_sandbox.sql`](../../supabase/migrations/20260612224536_channel_subscriptions_v1_sandbox.sql)
  and [`20260613104442_vip_passes_v1_sandbox.sql`](../../supabase/migrations/20260613104442_vip_passes_v1_sandbox.sql):
  499 subscription/VIP products and setters.
- [`20260715151250_ios_app_store_mappings.sql`](../../supabase/migrations/20260715151250_ios_app_store_mappings.sql)
  plus [`20260715174500_ios_app_store_purchase_intents.sql`](../../supabase/migrations/20260715174500_ios_app_store_purchase_intents.sql):
  iOS tip/room finite tiers and corrected Party Room product binding.
- [`202608210001_creator_money_production_readiness_ios_parity.sql`](../../supabase/migrations/202608210001_creator_money_production_readiness_ios_parity.sql):
  iOS video/event/VIP finite tiers and eight independent channel slots. Seeded
  mappings are sandbox and explicitly do not create payable balances; metadata
  includes unverified provider/device/release evidence.
- [`_lib/iosAppStoreCommerce.ts`](../../_lib/iosAppStoreCommerce.ts): matching
  reference catalog and exact tier resolution.
- [`20260827210000_creator_video_protected_authority_closure.sql`](../../supabase/migrations/20260827210000_creator_video_protected_authority_closure.sql):
  historical paid-video source price restriction, replaced by the current
  catalog-checked setter in the supported-prices successor below.
- [`20261026164507_creator_supported_prices_and_purchase_quotes.sql`](../../supabase/migrations/20261026164507_creator_supported_prices_and_purchase_quotes.sql):
  current supported tiers, exact buyer-platform filtering, catalog-checked author
  setters, immutable purchase quote and verified provider purchase timestamp.
- [`20261026164032_scheduled_virtual_event_reservations.sql`](../../supabase/migrations/20261026164032_scheduled_virtual_event_reservations.sql):
  event revisions, reservation admission and owner-approved late recovery.
- [`20261026165705_creator_event_lifecycle_controls.sql`](../../supabase/migrations/20261026165705_creator_event_lifecycle_controls.sql)
  and [`20261026170150_buyer_event_refund_eligibility_history.sql`](../../supabase/migrations/20261026170150_buyer_event_refund_eligibility_history.sql):
  lifecycle decisions and buyer-visible eligibility/history, separate from an
  actual provider refund.
- [`20260831120000_creator_access_product_doctrine_amendment.sql`](../../supabase/migrations/20260831120000_creator_access_product_doctrine_amendment.sql):
  current VIP period and creator-access doctrine; earlier seed metadata is not
  the final entitlement policy.
- [`20261026180230_creator_money_checkout_attempt_claims.sql`](../../supabase/migrations/20261026180230_creator_money_checkout_attempt_claims.sql)
  and [`20261026180500_event_checkout_attempt_claims.sql`](../../supabase/migrations/20261026180500_event_checkout_attempt_claims.sql):
  one native checkout dispatch per durable attempt, unresolved-outcome barriers
  across expiry and current authority checks immediately before checkout.
- [`20261026184512_creator_event_broadcast_recovery.sql`](../../supabase/migrations/20261026184512_creator_event_broadcast_recovery.sql):
  confirmed-terminal live-only recovery with preserved history, original terms,
  approval and deadline; unknown or replay-promising attempts remain closed.

## Provider-compatible implementation and evidence gaps

Previously verified official documentation is collected in
[`creator-buyer-provider-docs.md`](creator-buyer-provider-docs.md). It supports
separating payment, ticket fulfillment, entry, replay and settlement. Google
pending purchases grant no access; acknowledgement of a completed purchase
must not wait until the show. Apple/Google regional external-payment exceptions
do not authorize changing this app's selected platform billing route. RevenueCat
event delivery and restore transfer require durable identity reconciliation.

Current source includes catalog readback, immutable offer terms, atomic
reservations, explicit failed/pending/reconciliation states, owner-scoped ticket
history, exact event destination, and preservation of historical purchases.
The [implementation ledger](creator-buyer-implementation-ledger.md) distinguishes
implemented source, passed local checks and pending qualification. Local source
controls cover expiry versus provider success, duplicate callbacks, the final
ticket in parallel transactions, schedule changes while payment is pending,
unknown billing state, and expiry/refund racing entry. The ledger binds each
passing subset to its evidence and retains failures; it does not substitute
synthetic results for complete frozen-head validation or provider delivery.

Canonical CI found that the two new public immutable-terms tables were missing
the existing deleted-media and Brand reference INSERT/UPDATE triggers. Forward
migration [`20261027021608`](../../supabase/migrations/20261027021608_creator_monetization_reference_guard_integration.sql)
registers those four canonical guards without changing policy, permissions,
activation settings or guard behavior. Local native before/after proof restores
the existing readiness checks, with the exact evidence in the implementation
ledger. Full repaired-head CI remains required; this correction is not approval
to reopen prior retention/performance work or to change any owner decision.

Remaining external qualification is not an owner product decision: deployed
schema/catalog parity; approved/available native products on each platform;
RevenueCat restore and webhook configuration; real sandbox pending/declined/
restored/refunded lifecycle; protected live/replay delivery; native accessibility
and notification behavior; verified settlement ingestion; and operator/provider
reconciliation completion. Recovery Stripe account-list and Supabase project-list
reads returned no usable result before interruption; a later Stripe account-list
call after the user reported connection was also aborted without a result. No
account-specific or migration-history read completed. Access, catalog,
refund/onboarding mechanism and deployed migration parity remain unverified,
not confirmed disconnected. No account settings, credentials, products, prices,
payments, refunds or payouts were changed. No production sale or provider
activation follows from source approval.
