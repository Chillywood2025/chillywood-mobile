# Paid Watch-Party Seats V1 End-to-End Proof

Last updated: June 11, 2026

## Status

Paid Watch-Party Seats / Room Tickets V1 is implemented repo-side and remote-applied to Supabase project `bmkkhihfbmsnnmcqkoly`, but it is not sandbox-proven through a Play/internal build yet.

Play/internal versionCode `38` was installed from Google Play internal testing on device `R5CR120QCBF` with installer `com.android.vending`. That proof run found and fixed two backend setup blockers plus one device UI blocker:

- `set_paid_watch_party_offer` initially failed on uuid/text host comparison.
- The ticket metadata safety constraint rejected false-valued LiveKit safety keys.
- The Watch-Party preview `Join Now` action did not fire on the Play-installed device, blocking the fan ticket gate and purchase proof.

The backend blockers were fixed by remote-applied migrations, and the `Join Now` button hitbox/layering fix is committed in `2ffbbce`. Play/internal versionCode `40` was installed, and a fresh active room proved `Find Room` can render the preview. `Join Now` still appeared visually unchanged because the ticket-gate CTA rendered lower in the setup shell instead of inside the preview card; the follow-up patch makes the `Room ticket required` / `Buy Room Ticket` state visible directly inside the preview and adds sanitized proof logs.

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
- `20260612001337_fix_paid_watch_party_host_uuid_comparisons.sql`
- `20260612001448_fix_paid_watch_party_metadata_safe_flags.sql`

Remote readback confirmed:

- New tables exist.
- Resolver and purchase-intent RPCs exist.
- Existing sandbox product mapping exists.
- `watch_party_tickets_enabled=sandbox_only`
- `watch_party_seats_enabled=sandbox_only`
- `live_money_enabled=off`
- Oversell trigger exists.
- Authenticated direct grants on `paid_watch_party_offers` are `SELECT` only.

## Play/Internal Build Status

- v38 build `710b9c52-5158-4e56-8ccf-fbc41576aa50`, submission `11c21df8-6e12-4bb5-a3db-e1d60c5fc7ee`, installed from Google Play internal testing on `R5CR120QCBF` with versionCode `38` and installer `com.android.vending`.
- v39 build `115a42f1-107a-4eab-a4cb-7f7131a8fce4` was canceled because it did not produce a useful new artifact.
- v40 build `c2021b08-cacd-4a37-87f6-99c260d426c8` targets commit `2ffbbce` and versionCode `40`; it was submitted and installed from Google Play internal testing.
- v41 build `9fe1e661-a56e-45ed-9a32-64627062f610` was canceled because fresh device proof showed the next blocker was ticket-gate visibility, not room lookup.
- v42 build `bf2d363f-91e5-4b4c-911a-47b1caf6005c` targets the inline ticket-gate patch and versionCode `42`; latest readback was still `IN_PROGRESS` with no artifact URL.

## Proof Status

Partial proof has run on Play/internal v38 and v40, but sandbox purchase proof is still blocked until a new Play/internal build includes the inline ticket-gate preview state.

Passed so far:

- Creator fixture created Party Room code `XWAKVC`.
- Creator offer setup passed after the backend fixes.
- Paid Watch-Party offer `eab7c92b-ee11-4d27-b222-fbcc8d74df71` exists for party `XWAKVC`, product `cw_watch_party_live_ticket_sandbox_099`, product key `watch_party_live_ticket_sandbox_099`, status `sandbox`, and seat limit `1`.
- Resolver readback for the host returned `allowed=true`, `reason=host_or_admin`.
- Resolver readback for the paid-fan fixture returned `allowed=false`, `reason=ticket_required`, with the correct offer/product.
- The original `XWAKVC` room expired under the 15-minute active-room window, which made later lookup attempts flash loading and then fail closed.
- Fresh active room `X75JHC` with paid offer `ca9b34b8-8815-4d9e-8a2e-34643769a29c` was created through the creator-authenticated room path plus guarded offer RPC.
- v40 `Find Room` on `X75JHC` rendered the room preview.

Blocked/pending proof:

- v40 `Join Now` did not visibly surface the ticket-gate CTA because the buy action lived below the current viewport; unpaid fan gate, purchase checkout, ticket creation, paid fan entry, second unpaid denial, seat-limit device proof, Money Center transaction readback, and refund/revoke proof remain pending.
- v42 or newer must be submitted and installed from Google Play internal testing before retrying the fan ticket gate and purchase proof.

BrowserStack remains deferred until final regression after all monetization flows are implemented and locally/manual proved.
