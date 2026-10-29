# Recommended creator/buyer product plan

This is the recommended design following the source audit. It is not approval to
change financial policy, catalogs, providers, or production. See the coverage
ledger and domain matrices for implemented paths, defects and evidence limits.

## Product recommendation

Build one clear creator commerce experience around **creator-selected fixed
prices and capacity-limited virtual tickets**, with a durable buyer library.
Complete that before introducing auctions. Keep Chi'llywood Premium, each
creator's channel subscription, VIP membership, one-off video access, event
admission, Party Room admission and Live Stage participation visibly distinct.

For the owner's example, the creator should be able to create “Sunday, 8 PM”,
choose an explicit event timezone, set a supported price and virtual ticket
quantity, state what is included, choose when sales open and close, preview the
buyer page, and publish ahead of Sunday. A buyer should be able to pay in advance,
see a verified ticket in My Library, receive the chosen notices, and return to the
same ticket to enter the show. Purchasing and entering the show are separate.

## Creator journey

1. **Eligibility and setup.** Explain US launch and creator18+ before monetization
   setup. Show server-confirmed eligibility, missing requirements and retry paths.
   Keep unknown status closed. Separate permission to publish from verified
   payout readiness; onboarding success is not a payout.
2. **Create the product.** Ask what is being sold: a video, a virtual show ticket,
   a Party Room pass, Live Stage access/participation, channel subscription or VIP.
   Provide product-specific terms instead of one generic access switch.
3. **Price.** Let the creator choose from the platform's supported, approved
   currency/price points. Populate choices from an authoritative catalog shared
   by the editor and backend. Do not expose a freeform amount that can only charge
   a99-cent SKU. Represent unavailable platform tiers honestly. Fixed price and
   an auction starting bid are separate fields and products; no reserve is assumed.
4. **Schedule and inventory.** Persist the intended IANA timezone plus the UTC
   instant and schedule revision. Reject nonexistent DST times and require a
   choice for repeated times. Use “virtual tickets” for viewer capacity and
   “participation seats” only where a Live Stage permission is actually granted.
   Assigned seats and physical venues require a separate product design.
5. **Publish and manage.** Give draft, scheduled, selling, sold out, delayed, live,
   ended, replay-ready and canceled states clear controls. Distinguish stop sales
   from converting a paid event to free. Preview the exact buyer page, share a
   stable link, and edit future offers without rewriting past purchase terms.
6. **Earnings.** Show gross, provider-confirmed fees/taxes, creator share, pending,
   held/reserved, available and paid amounts separately. Preserve100% creator net
   on tips and80/20 on other specified creator sales. Do not label80% of a listing
   price as guaranteed take-home proceeds. Source settlement/hold machinery must
   have a verified ingestion and reconciliation path before payout activation.

## Buyer journey

1. **Discover.** Surface upcoming shows on the creator channel and appropriate
   discovery pages. A direct event link must resolve the purchased event even
   when it falls outside a limited discovery feed. Private audience controls
   still apply.
2. **Understand.** Before checkout show the creator, exact store price/currency,
   local start time plus event timezone, live/replay inclusion and expiry,
   virtual capacity, cancellation/reschedule policy and support path. Premium
   or another creator's membership must never be implied to include admission.
3. **Buy.** Bind buyer/session, creator/source, offer revision, amount, currency,
   provider product and environment into an immutable intent. Check the returned
   store quote before opening checkout. Revalidate current ownership after async
   work. Persist provider transaction uniqueness and process completion exactly
   once; cancelled or pending purchases do not grant entry.
4. **Recover.** Show pending verification, failure, cancellation and confirmed
   purchase distinctly. A timeout must offer status refresh instead of encouraging
   another charge. Restore and duplicate callbacks reconcile the original purchase.
   Add My Library sections for Upcoming tickets, Replays, Paid videos and
   Memberships, backed by owner-scoped durable grants and receipts rather than a
   transient success message.
5. **Attend.** Before start show a waiting state and the current schedule; when
   live, enter through the event's exact room authority. Afterward, show replay
   only if the purchase terms and current entitlement permit it. Expired,
   refunded or revoked access remains visible as history without granting media.
6. **Changes and help.** Preserve original terms alongside revised schedule/status.
   Give affected buyers clear notices and support/refund-request status. Treat
   transactional event notices separately from optional marketing reminders,
   subject to the owner's notification policy and user preferences.

## Capacity and payment decision

The existing fulfillment lock prevents an unlimited number of grants, but does
not reserve inventory before the store charges. The recommended design is a
server-owned reservation linked to an immutable intent, with atomic allocation,
bounded expiry and idempotent conversion to a ticket after verified payment.
Pending store purchases can outlive a reservation. Before implementing this,
the owner must choose the late-payment remedy and customer-facing policy; do not
promise an automatic refund that the payment/provider integration cannot deliver.

Test at least two independent database sessions for the final seat, duplicate
callbacks, timeout/retry, cancellation and capacity edits during checkout,
late completion and a refund racing entry. Keep charge success, ticket allocation,
grant authorization, ledger posting, notification and payout states distinct.

## Auctions

Do not make all limited products auctions. Fixed prices are predictable for
buyers and work with the existing platform-billing model. A later opt-in auction
for selected high-demand virtual shows could be considered after the baseline
journey is qualified; keep VIP separate. The creator's requested initial bid is
the starting bid, not an approved reserve-price feature.

Arbitrary winning prices do not map to the current finite store catalog. Provider
and platform eligibility, supported winning-price increments, winner payment
deadline, failed winner handling, ties, anti-abuse and capacity rules need an
explicit design. Do not round bids silently, introduce a wallet, charge for bids,
or reroute mobile digital purchases to Stripe. No auction code is included.

## Delivery sequence and exit criteria

| Stage | Scope | Exit evidence |
|---|---|---|
| 1. Bounded defect repair | Store quote checks, event editing/time clarity, offer lifecycle identity, receipt retry recovery | Production-code and SQL regression tests, negative controls, exact diff review, complete applicable exact-head CI; draft PR only until approved |
| 2. Authoritative offer contract | Creator-selectable catalog tiers, explicit inventory/windows, schedule revision and purchase terms | Owner pricing requirements implemented consistently on both mobile platforms; migration/RLS/intent tests; no live catalog mutation without separate authorization |
| 3. End-to-end ticket journey | Reservation/late-payment handling, exact event destination, ticket library, waiting/live/replay states, reschedule/cancel/no-show notices | Owner commercial-policy decisions; native concurrent DB tests and provider sandbox lifecycle evidence across each transition |
| 4. All-mode recovery and finance | Membership expiry/restore, video recovery, tips, refund/dispute reconciliation, verified settlement and payout status | No duplicate credits/grants, no stale-account grants, failed reads closed, immutable receipt lineage, fees/splits/holds checked against authoritative data |
| 5. Release qualification | Authorized migrations/provider configuration, signed Android and iOS builds, accessible navigation, real-device sandbox purchases/restore/refunds | Separate approval for each consequential operation; platform-specific evidence, rollout/rollback plan, then explicit release decision |

Audit coverage can be complete while stages2–5 remain unimplemented or unqualified.
This task does not claim that the complete paid-show experience is ready to sell.

## Owner decisions to resolve after reviewing the audit

- Confirm online capacity versus assigned/in-person seats, quantity per buyer,
  gifting and transferability.
- Choose supported fixed-price tiers/range and currency presentation; authorize
  catalog/provider changes separately after the source contract is reviewed.
- Choose reservation duration, sale cutoff and late-payment/oversell remedy.
- Define delay/reschedule/cancel/no-show and paid-to-free conversion policies,
  including refunds, support handling and creator settlement obligations.
- Define replay inclusion and expiry per product, plus transactional buyer notices
  versus optional reminders.
- Decide whether to investigate an optional auction later; no auction implementation
  is necessary to meet the approved creator-selected fixed-price requirement.
