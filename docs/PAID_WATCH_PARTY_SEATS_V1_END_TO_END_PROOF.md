# Paid Watch-Party Seats V1 End-to-End Proof

Last updated: June 11, 2026

## Status

Paid Watch-Party Seats / Room Tickets V1 is implemented repo-side and remote-applied to Supabase project `bmkkhihfbmsnnmcqkoly`, but it is not sandbox-proven through a Play/internal build yet.

Live money remains disabled. Room tickets are sandbox/not-payable only.

## Provider Path

- Provider rail: RevenueCat / Google Play sandbox-compatible dynamic purchase path.
- Product key: `watch_party_live_ticket_sandbox_099`
- Provider product id: `cw_watch_party_live_ticket_sandbox_099`
- Stripe Tips is not used.
- Premium is separate and does not unlock creator room tickets.

## Implemented

- Tables:
  - `paid_watch_party_offers`
  - `paid_watch_party_tickets`
  - `creator_room_ticket_transactions`
  - `room_ticket_events`
- RPCs:
  - `set_paid_watch_party_offer`
  - `resolve_paid_watch_party_ticket_access`
  - `create_paid_watch_party_ticket_purchase_intent`
  - `list_my_paid_watch_party_offers`
  - `list_my_paid_watch_party_transactions`
- Provider bridge:
  - Existing `revenuecat-webhook` verifies RevenueCat / Google Play events.
  - Verified `watch_party_live_ticket` access grants are mirrored into room tickets and creator room-ticket transactions.
  - Seat-limit oversell guard blocks active ticket creation when the offer is sold out.
- Client:
  - Party Waiting Room checks paid-ticket access before routing to Party Room.
  - Party Room re-checks paid-ticket access before membership/session/presence setup.
  - Direct deep links to Party Room cannot bypass the paid ticket check.
  - Host can create a sandbox $0.99 room-ticket offer from Party Waiting Room after a Party Room code exists.
  - Fan CTA is `Buy Room Ticket`.
  - Money Center Offers and Transactions read Paid Watch-Party rows separately from Tips and Paid Videos.

## Routing Truth

Paid Watch-Party seats route:

`Watch-Party Live / Player / Title surface -> Buy Room Ticket -> Party Waiting Room -> Party Room`

They do not route to Live Stage. Live Watch-Party / Live Stage behavior was not changed.

## Security

- Creators manage room-ticket offers through guarded RPC only.
- Authenticated clients have `SELECT` only on `paid_watch_party_offers`; they cannot directly mutate `seats_sold`.
- Clients cannot directly create active tickets.
- Clients cannot directly mark room-ticket transactions paid.
- Verified provider events are required before active tickets are created.
- Ticket metadata is constrained to avoid secrets, raw provider payloads, LiveKit publish authority, host controls, or admin power.
- Sandbox rows are not payable and do not create payout, cash-out, withdrawal, transfer, Premium, Tips, Paid Video, VIP, subscription, event, or LiveKit authority.

## Remote Apply Status

Applied remotely:

- `20260611231512_paid_watch_party_seats_v1_sandbox.sql`
- `20260611232455_paid_watch_party_seat_limit_verification_guard.sql`
- `20260611232545_paid_watch_party_offer_direct_write_tightening.sql`

Remote readback confirmed:

- New tables exist.
- Resolver and purchase-intent RPCs exist.
- Existing sandbox product mapping exists.
- `watch_party_tickets_enabled=sandbox_only`
- `watch_party_seats_enabled=sandbox_only`
- `live_money_enabled=off`
- Oversell trigger exists.
- Authenticated direct grants on `paid_watch_party_offers` are `SELECT` only.

## Proof Status

Not yet run on Play/internal runtime with this code.

Pending proof:

- Creator creates a paid Watch-Party ticket offer.
- Unpaid fan is blocked before Party Waiting Room / Party Room.
- Fan completes RevenueCat / Google Play sandbox ticket purchase.
- Signed provider event creates a transaction and active room ticket.
- Paid fan enters Party Waiting Room and Party Room.
- Second unpaid fan remains blocked by normal route and direct link.
- Money Center visually shows Paid Watch-Party transaction.
- Seat limit proof.
- Provider refund/revoke proof, if tooling allows.

BrowserStack remains deferred until final regression after all monetization flows are implemented and locally/manual proved.
