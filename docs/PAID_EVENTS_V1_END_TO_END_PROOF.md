# Paid Events V1 End-to-End Proof

Last updated: June 12, 2026

## Status

Paid Events V1 is repo-side implemented and remote-applied to Supabase project `bmkkhihfbmsnnmcqkoly`, but it is not sandbox-proven end to end yet.

The flow is sandbox-only. Live money remains disabled.

## Provider Path

- Provider rail: RevenueCat / Google Play sandbox-compatible dynamic purchase path.
- Product key: `event_pass_sandbox_099`
- Provider product id: `cw_event_pass_sandbox_099`
- Stripe Tips is not used.
- Premium is separate and does not unlock creator paid events.

The product row already existed remotely as a sandbox Android digital product with purchase intents required. Paid Events V1 reuses that approved product instead of introducing a new provider product.

## Implemented

- Canonical event model:
  - Existing `creator_events` remains the event schedule/source of truth.
- New tables:
  - `paid_creator_events`
  - `paid_creator_event_passes`
  - `creator_event_transactions`
  - `paid_event_events`
- RPCs:
  - `set_paid_creator_event_offer`
  - `resolve_paid_creator_event_pass_access`
  - `create_paid_creator_event_pass_purchase_intent`
  - `list_my_paid_creator_event_offers`
  - `list_my_paid_creator_event_transactions`
- Provider bridge:
  - Existing `revenuecat-webhook` verifies RevenueCat / Google Play events.
  - Verified `event_pass` access grants are mirrored into event passes and creator event-pass transactions.
  - Capacity-limit oversell guard blocks active pass creation when the event is sold out.
- Client:
  - Existing creator event cards in Platform Studio can save a sandbox Paid Event offer.
  - Creator profile event cards link to `/event/[eventId]`.
  - `/event/[eventId]` is now a real paid-event gate, not only a visual proof page.
  - Fan CTA is `Buy Event Pass`.
  - Money Center Offers and Transactions read Paid Event rows separately from Tips, Paid Videos, Paid Watch-Party tickets, and Premium.

## Gate Truth

Paid event access is enforced on `/event/[eventId]` before the paid event surface is shown.

Unpaid users see `Event pass required` plus this copy:

`This pass unlocks this creator event only. It does not include Premium, subscriptions, VIP, paid videos, Watch-Party rooms, other events, or other creator content.`

Paid Events V1 does not route Watch-Party rooms, does not route to Live Stage, and does not initialize LiveKit controls.

## Security

- Creators save paid-event offers through guarded RPC only.
- Authenticated clients have `SELECT` only on paid-event offer/pass/transaction tables.
- Clients cannot directly create active event passes.
- Clients cannot directly mark event transactions paid.
- Clients cannot directly increase `passes_sold`.
- Verified provider events are required before active passes are created.
- Pass metadata is constrained to avoid secrets, raw provider payloads, LiveKit publish authority, host controls, or admin power.
- Sandbox rows are not payable and do not create payout, cash-out, withdrawal, transfer, Premium, Tips, Paid Video, Watch-Party ticket, VIP, subscription, or LiveKit authority.

## Remote Apply Status

Applied remotely:

- `20260612201011_paid_events_v1_sandbox.sql`

Remote readback confirmed:

- `paid_creator_events`
- `paid_creator_event_passes`
- `creator_event_transactions`
- `paid_event_events`
- `set_paid_creator_event_offer`
- `resolve_paid_creator_event_pass_access`
- `create_paid_creator_event_pass_purchase_intent`
- `list_my_paid_creator_event_offers`
- `list_my_paid_creator_event_transactions`
- `sync_paid_creator_event_pass_from_access_grant`

## Proof Status

Not run yet on a Play/internal build containing this code.

Required proof before calling Paid Events V1 sandbox-proven:

1. Build and install a Play/internal runtime with installer `com.android.vending`.
2. Creator creates or opens a real `creator_events` row.
3. Creator taps `Set Paid Event` and saves a sandbox paid event offer.
4. Money Center Offers shows the Paid Event.
5. Unpaid fan opens `/event/[eventId]` and sees `Buy Event Pass`.
6. Direct event link remains gated for unpaid/logged-out users.
7. Fan completes Google Play / RevenueCat sandbox purchase.
8. Verified webhook creates provider event, consumed purchase intent, active `event_pass` grant, `paid_creator_event_passes` row, and `creator_event_transactions` row.
9. Paid fan can access the event page after refresh.
10. Second unpaid fan remains blocked.
11. Capacity limit proof passes or is honestly deferred with blocker.
12. Money Center Transactions shows the Paid Event transaction as sandbox/not-payable.

## Deferred

- Play/internal runtime proof.
- Successful sandbox purchase proof.
- Money Center visual transaction screenshot.
- Provider refund/revoke proof until RevenueCat / Google Play tooling and safe order identifiers are available.
- BrowserStack final regression remains deferred until all creator monetization flows have local/manual proof.

## Boundaries

- No Stripe Tips path is used for Paid Events.
- No Premium entitlement unlocks creator paid events.
- No Tips, Paid Videos, Paid Watch-Party Seats, Channel Subscriptions, VIP, LiveKit token logic, Watch-Party routing, Party Room routing, Live Stage routing, or Premium gates changed.
- Sandbox rows are not payable and do not create payout, cash-out, withdrawal, transfer, or available creator balance.
