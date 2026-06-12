# Paid Watch-Party Seats V1 End-to-End Proof

Last updated: June 12, 2026

## Status

Paid Watch-Party Seats / Room Tickets V1 is implemented repo-side and remote-applied to Supabase project `bmkkhihfbmsnnmcqkoly`. Play/internal v44 proved the first RevenueCat / Google Play sandbox purchase path, provider-created ticket/transaction rows, paid-fan Party Room entry, seat-limit sold-out state, second authenticated unpaid normal-route denial, and Money Center RPC transaction readback. Play/internal v45 proved the direct Party Room deep-link gate fix and a fresh paid-ticket purchase/entry path.

Visual Money Center screenshot and provider refund/revoke proof remain deferred. Money Center RPC readback passed for the exact v45 transaction.

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
  - Party Room blocks unpaid paid-room direct links before camera/mic permission startup after v45 proof.
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
- v42 build `bf2d363f-91e5-4b4c-911a-47b1caf6005c` finished with artifact `https://expo.dev/artifacts/eas/b7yuw-t842YFN37SxgYOut1aTeShtDKNT1raeKnTOGc.aab`, but it does not include the later Join Now handler-path relookup/logging patch. It was not submitted for proof.
- v43 build `a96b3f80-0804-4b21-a108-97c3e9cb4bb3` targeted commit `a3c8e81` but stayed `IN_PROGRESS` with no artifact and was canceled.
- v44 build `46456ea4-6d5f-4098-8f05-de84e182e423` targets commit `a3c8e81` and versionCode `44`; artifact `https://expo.dev/artifacts/eas/fP9vNUu_BoJ_atkgTnJd9VCIyWnWGP_3phrfCRkr4nE.aab` was submitted to Play internal through EAS submission `b84b4e4c-46da-4717-82bc-062201ed3d7c` and installed from Google Play on `R5CR120QCBF`.

## Proof Status

Partial proof ran on Play/internal v38 and v40. Play/internal v44 ran the real ticket purchase proof.

Passed so far:

- Creator fixture created Party Room code `XWAKVC`.
- Creator offer setup passed after the backend fixes.
- Paid Watch-Party offer `eab7c92b-ee11-4d27-b222-fbcc8d74df71` exists for party `XWAKVC`, product `cw_watch_party_live_ticket_sandbox_099`, product key `watch_party_live_ticket_sandbox_099`, status `sandbox`, and seat limit `1`.
- Resolver readback for the host returned `allowed=true`, `reason=host_or_admin`.
- Resolver readback for the paid-fan fixture returned `allowed=false`, `reason=ticket_required`, with the correct offer/product.
- The original `XWAKVC` room expired under the 15-minute active-room window, which made later lookup attempts flash loading and then fail closed.
- Fresh active room `X75JHC` with paid offer `ca9b34b8-8815-4d9e-8a2e-34643769a29c` was created through the creator-authenticated room path plus guarded offer RPC.
- v40 `Find Room` on `X75JHC` rendered the room preview.

v44 Join Now handler proof:

- Fresh active room `N3CXJD` with paid offer `0b7f955e-5898-4204-a370-51f0d5a04533` was created through the creator-authenticated room path plus guarded offer RPC because `X75JHC` expired.
- Device install proof: package `com.chillywood.mobile`, versionCode `44`, installer `com.android.vending`.
- `Find Room` rendered the room preview.
- `Join Now` no longer silently failed for a paid room without a ticket. Log branch:
  - `join_now_pressed`
  - `join_now_room_lookup_start`
  - `join_now_room_lookup_success`
  - `join_now_ticket_check_start`
  - `join_now_paid_offer_detected`
  - `join_now_ticket_missing`
  - `join_now_route_waiting_room`
- Visible UI showed `Room ticket required`, the no-Premium/no-other-access copy, and reachable `Buy Room Ticket`.
- DB readback for `N3CXJD` showed offer status `sandbox`, price `99`, currency `usd`, seat limit `1`, seats sold `0`, product key `watch_party_live_ticket_sandbox_099`, provider product id `cw_watch_party_live_ticket_sandbox_099`, and resolver access `allowed=false`, `reason=ticket_required`, `requiresPurchase=true`.
- Proof files: `/tmp/chillywood-watch-party-ticket-proof-v44/01-after-join-now-ticket-gate.png`, `/tmp/chillywood-watch-party-ticket-proof-v44/02-ticket-gate-buy-button-visible.png`, `/tmp/chillywood-watch-party-ticket-proof-v44/03-join-now-branch-logs.txt`, `/tmp/chillywood-watch-party-ticket-proof-v44/04-room-offer-readback.json`.

v44 purchase proof:

- Device install proof: package `com.chillywood.mobile`, versionCode `44`, installer `com.android.vending`.
- Original purchase fixture `N3CXJD` / offer `0b7f955e-5898-4204-a370-51f0d5a04533` launched Google Play Billing and completed a sandbox purchase. The app returned to `Room not found` because the room aged out under the Watch-Party active-window lookup before paid-fan entry could be completed. Server proof still passed for that purchase:
  - Ticket `6708d1bc-7022-4c65-96a7-eb37bfaa5cc1`
  - Transaction `55c3ca26-ed71-4ddf-8eb9-8a674bed3fb6`
  - Provider transaction `B62F3435-5652-4EBD-BB2A-51CF615C89A6`
  - Offer moved to `sold_out`, `seats_sold=1`
  - Resolver returned `allowed=true`, `reason=ticket_confirmed`
- Fresh purchase fixture `ZT5MWV` / offer `143fdf4e-e235-4f98-81a4-e22194a8550a` was created to finish entry proof before expiration.
- Google Play Billing sheet opened for `Watch-Party ticket sandbox` / `$0.99` / test card.
- Purchase intent `60cac129-dbc3-43c3-9300-4d654ce12f8a` moved to `consumed`.
- Provider event id recorded on the transaction: `f3016f01-2514-40d7-b29d-103d3ced6fc2`.
- Creator room-ticket transaction `fff398a9-59f6-452a-81f7-1c8e7ad04e50` was created as `paid`, `environment=sandbox`, `payout_status=not_payable`.
- Active ticket `a2108d63-8b84-4dd1-8f60-ef485ce5efdc` was created for the paid fan.
- Offer moved to `sold_out`, `seats_sold=1`, `seat_limit=1`.
- Resolver for the paid fan returned `allowed=true`, `reason=ticket_confirmed`.
- Paid fan entered Party Room as viewer for `ZT5MWV`. The visible route was Party Room, not Live Stage.
- No Tips rows and no Paid Video content grants were created in the proof window.

Second unpaid / seat-limit proof:

- Authenticated second unpaid tester `c2afa6cc-52f2-4714-b972-89863582d05a` had zero active tickets for offer `143fdf4e-e235-4f98-81a4-e22194a8550a`.
- Resolver returned `allowed=false`, `reason=sold_out`, `requiresPurchase=false`.
- Normal Find Room -> Join Now path stayed blocked with `This room ticket is not available right now.`
- Logs showed `join_now_ticket_missing` and `join_now_route_waiting_room` with reason `sold_out`.
- Server seat-limit state stayed `seats_sold=1` / `seat_limit=1`; no oversell occurred.

Money Center readback:

- Creator RPC `list_my_paid_watch_party_transactions` returned the `ZT5MWV` transaction as `paid`, `environment=sandbox`, `payoutStatus=not_payable`, provider `revenuecat_google_play`, product `cw_watch_party_live_ticket_sandbox_099`.
- Creator RPC `list_my_paid_watch_party_offers` returned the offer as `sold_out`, `seatLimit=1`, `seatsSold=1`.
- Visual Money Center transaction screenshot remains pending.

v45 direct-link fix and purchase proof:

- Commit: `541dafd`
- EAS build: `8f923a8f-4efd-4412-bac8-f4eb3c1b900d`
- VersionCode: `45`
- Artifact type: AAB
- Artifact URL: `https://expo.dev/artifacts/eas/Jtf8Ehq4E39-MYPem8hdr2D434LSSxeVAG7f303Vxik.aab`
- Play internal submission: `50f966fb-1c05-49f7-8ebe-32d1f0c1d6c2`
- Device install: `R5CR120QCBF`, package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `45`
- Fresh fixture: room `WNFUUF`, offer `ba02fbe7-97a7-4871-86f3-9ca62a141d76`, product `cw_watch_party_live_ticket_sandbox_099`, product key `watch_party_live_ticket_sandbox_099`, seat limit `1`
- Unpaid direct-link proof: tester `c2afa6cc-52f2-4714-b972-89863582d05a` had resolver `allowed=false`, `reason=ticket_required`; direct link rendered `Buy Room Ticket` and no-Premium/no-other-access copy before camera permission, membership, presence, or room controls.
- Google Play Billing sheet opened for `Watch-Party ticket sandbox`, `$0.99`, test card.
- Provider event `f768e840-3208-4251-ac84-95358987eb8b` created transaction `912a9d0a-3621-4070-826d-be2035856e47` as `paid`, `payout_status=not_payable`, provider `revenuecat_google_play`.
- Active ticket `8c2906da-8d02-43b2-afb9-9a7ba514fba2` was created with provider transaction `9CDB9B27-362C-478B-BCA3-8241C876D10D`.
- Offer moved to `sold_out`, `seats_sold=1`, `seat_limit=1`; no oversell occurred.
- Paid fan entered Party Room for `WNFUUF` as viewer with active membership; route did not go to Live Stage.
- No Tips rows and no Paid Video content grants were created in the v45 proof window.
- Creator Money Center RPC readback returned transaction `912a9d0a-3621-4070-826d-be2035856e47` as `paid`, `environment=sandbox`, `payoutStatus=not_payable`, provider `revenuecat_google_play`, product `cw_watch_party_live_ticket_sandbox_099`, and metadata `tipsPath=false`, `premiumUnlock=false`, `paidVideoUnlock=false`, `liveStageAccess=false`.
- Proof files: `/tmp/chillywood-watch-party-ticket-proof-v45/`

Deferred proof:

- Provider refund/revoke remains deferred because safe RevenueCat / Google Play refund tooling and a safe order id are not available here. Do not fake refund by manual DB mutation.
- Visual Money Center Transactions screenshot remains deferred; RPC readback for the exact transaction passed.
- BrowserStack remains deferred until final regression after all monetization flows are implemented and locally/manual proved.
