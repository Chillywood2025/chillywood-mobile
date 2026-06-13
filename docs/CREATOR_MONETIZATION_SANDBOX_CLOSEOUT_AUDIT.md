# Creator Monetization Sandbox Closeout Audit

Last updated: June 13, 2026

## Scope

This audit closes the six-flow creator monetization sandbox buildout for review. It does not approve live money, payouts, cash-out, withdrawals, transfers, or launch-live monetization.

Money Center remains the single creator-facing creator-money hub in Platform Studio with these sections:

- Overview
- Ways to Earn
- Offers
- Transactions
- Payouts
- Tax & Legal
- Provider Status

Live money remains off. Payouts remain off. Sandbox rows remain not payable.

Remote switch readback from Supabase project `bmkkhihfbmsnnmcqkoly`:

| Switch | State | Truth |
| --- | --- | --- |
| `live_money_enabled` | `off` | Production money movement is disabled. |
| `payouts_enabled` | `off` | Sandbox/setup rows are not payable. |
| `tips_enabled` | `sandbox_only` | Stripe test-mode Tips proof only. |
| `watch_party_tickets_enabled` | `sandbox_only` | Watch-Party ticket proof only. |
| `watch_party_seats_enabled` | `sandbox_only` | Watch-Party seat/ticket proof only. |

## Flow Truth Table

| Flow | Provider path | Sandbox proof status | Access/result created | Money Center readback | Refund/revoke/lifecycle | Launch status | Proof reference |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tips V1 | Stripe Connect test-mode Checkout + signed Stripe webhook | Sandbox-proven end to end | Verified tip transaction only; no access grant or perk | Creator readback passed with `payout_status=not_payable` | Failed/declined proof passed; live payout remains disabled | Sandbox only; not live | `docs/TIPS_V1_END_TO_END_PROOF.md` |
| Paid Videos V1 | RevenueCat / Google Play sandbox product `cw_paid_content_access_sandbox_099` | Sandbox-proven for purchase, access grant, player unlock, unpaid/logged-out/direct-link denial, Money Center readback, RLS denial | Video-specific `access_grants` + mirrored `content_access_grants` | Visual readback passed as sandbox/not-payable | Refund/revoke deferred; no safe provider order/tooling path | Sandbox only; not live | `docs/PAID_VIDEOS_V1_END_TO_END_PROOF.md` |
| Paid Watch-Party Seats V1 | RevenueCat / Google Play sandbox product `cw_watch_party_live_ticket_sandbox_099` | Sandbox-proven for ticket purchase, waiting-room gate, Party Room direct-link gate, paid entry, second unpaid denial, seat-limit, RPC Money Center readback | Active room ticket only for the purchased room | RPC readback passed as sandbox/not-payable; visual screenshot deferred | Refund/revoke deferred; no safe provider order/tooling path | Sandbox only; not live | `docs/PAID_WATCH_PARTY_SEATS_V1_END_TO_END_PROOF.md` |
| Paid Events V1 | RevenueCat / Google Play sandbox product `cw_event_pass_sandbox_099` | Sandbox-proven end to end for event creation, unpaid gate, purchase, pass creation, paid access, second unpaid denial, Money Center readback, RLS denial | Event-specific pass/access only | Visual readback passed as sandbox/not-payable | Capacity UI proof deferred; refund/revoke deferred | Sandbox only; not live | `docs/PAID_EVENTS_V1_END_TO_END_PROOF.md` |
| Channel Subscriptions V1 | RevenueCat / Google Play subscription `channel_subscription_sandbox_monthly_499:monthly` | Sandbox purchase-proven with Money Center readback, authenticated non-subscriber denial, and stale-row effective-access safety | Creator-channel subscription row + access grant while effective period is active | Visual readback passed; expired provider periods are labeled safely | Lifecycle handler implemented; fresh signed lifecycle delivery remains provider-blocked/deferred | Sandbox only; not live | `docs/CHANNEL_SUBSCRIPTIONS_V1_END_TO_END_PROOF.md` |
| VIP Passes V1 | RevenueCat / Google Play non-consumable product `cw_vip_pass_sandbox_499` | Sandbox-proven for provider setup, purchase, VIP pass/access creation, VIP route access, second non-VIP denial, Money Center readback | Creator-specific VIP pass/access only | Visual readback passed as sandbox/not-payable | Refund/revoke deferred; no safe provider order/tooling path | Sandbox only; not live | `docs/VIP_PASSES_V1_END_TO_END_PROOF.md` |

## Product Separation

Tips are pure contributions. They do not unlock content, badges, VIP, rooms, subscriptions, events, rankings, Premium, LiveKit authority, payout access, or any other digital benefit.

Digital creator purchases use RevenueCat / Google Play sandbox paths, not Stripe Tips:

- Paid Videos unlock only the purchased creator video.
- Paid Watch-Party tickets unlock only the linked Party Waiting Room and Party Room.
- Paid Events unlock only the linked creator event.
- Channel Subscriptions unlock only subscriber state/area for that creator channel while effective access is active.
- VIP Passes unlock only creator-specific VIP status/area for that creator.

Premium remains a Chi'llwood platform subscription. It does not automatically unlock creator paid videos, room tickets, paid events, channel subscriptions, or VIP passes.

VIP and Channel Subscription status do not unlock each other and do not unlock Paid Videos, Paid Watch-Party tickets, or Paid Events.

Paid Watch-Party routing remains:

`Player / Title / Channel surface -> Buy Room Ticket / Join -> Party Waiting Room -> Party Room`

Paid Watch-Party routes do not go to Live Stage. LiveKit token, host, speaker, seat, camera, and viewer authority were not changed for this closeout.

## Money Center Truth

Money Center currently shows the six creator monetization flows in Ways to Earn and backed offer/transaction rows in Offers and Transactions. Transactions are separated by Tips, Videos, Rooms, Subscriptions, VIP, Events, and Merch.

Creator-facing copy now states:

- sandbox activity is inspection/readback only
- sandbox rows are not payable
- no available balance, payout, cash-out, withdrawal, transfer, or payout release is available
- Stripe Connect is for creator payout readiness and Tips test-mode contribution handling, not Android digital access collection
- Premium is separate from creator purchases

Payouts, cash-out, withdrawal, transfer, available balance, payout release, and live-money activation remain unavailable.

## Refund, Revoke, And Lifecycle Matrix

| Flow | Provider reversal proof | Safe access posture | Deferred reason |
| --- | --- | --- | --- |
| Tips V1 | Failed/declined payment proof passed; refund handling exists in webhook path but live payout is off | Tips create no access grant or perk | Live payout/reversal operations are not approved. |
| Paid Videos V1 | Deferred | Access is grant-scoped; unpaid/logged-out/direct-link users remain blocked | No safe RevenueCat / Google Play refund tooling or order id was available. |
| Paid Watch-Party Seats V1 | Deferred | Waiting Room and Party Room require active ticket; direct Party Room link is gated | No safe RevenueCat / Google Play refund tooling or order id was available. |
| Paid Events V1 | Deferred | Event route requires active pass; second unpaid user stayed blocked | No safe RevenueCat / Google Play refund tooling or order id was available. |
| Channel Subscriptions V1 | Fresh post-handler lifecycle webhook proof deferred | User-facing access uses effective access, not stale subscription row alone | Google Play refund/removal was accepted, but RevenueCat did not emit a fresh signed webhook during the proof window. |
| VIP Passes V1 | Deferred | VIP route requires active creator-specific VIP pass; second non-VIP stayed blocked | No safe Google Play order id/tooling path was available. |

No proof used manual Supabase mutation to fake provider refund, revoke, cancellation, or expiration.

## RLS And Server-Verification Audit

Remote RLS inspection confirmed RLS is enabled on the creator money offer, transaction, pass/ticket/subscription, shared access grant, purchase intent, and ledger tables used by the six flows.

The current policy posture is:

- creators and participants can read only their own/source-safe rows
- public/fans cannot read other fans' purchase/access rows
- paid transaction, pass, ticket, subscription, VIP, and shared grant writes are owner/operator or server-side paths
- creator offer management uses guarded RPCs where required
- verified provider webhooks create paid rows and active access grants
- direct client paid-row/access writes were explicitly proved denied for multiple flows during sandbox proof

No service-role key, Stripe secret, RevenueCat secret, Google service-account secret, LiveKit secret, Brevo secret, raw password, or private provider payload belongs in mobile code or committed docs.

## Route And Deep-Link Gates

Current route-gate truth:

| Surface | Gate result |
| --- | --- |
| Paid video direct link | Paid fan can play; logged-out and second unpaid fan stay locked. |
| Paid Watch-Party Party Room direct link | Unpaid direct link is blocked before camera/mic permission, membership, presence, or room controls. |
| Paid event direct link | Unpaid and second authenticated unpaid users stay blocked. |
| Channel subscription route | Requires effective active subscription access; stale active subscription rows alone do not unlock. |
| VIP-only route | Requires active creator-specific VIP pass; second non-VIP user stays blocked. |

Premium does not bypass these creator-purchase gates. VIP/subscription status does not bypass paid video, paid event, or paid room gates.

## Launch Blockers

These are launch-live blockers:

- live-money approval is not complete
- payouts/cash-out/withdrawal/transfer are not enabled
- provider refund/revoke/lifecycle proof is incomplete for several flows
- payout, tax/legal, fraud/risk, support, refund, and owner approval lanes are not launch-closed
- BrowserStack final multi-device regression has not run
- no flow should be advertised as live creator earnings

These are safe deferred provider-tooling gaps for sandbox closeout:

- Paid Videos refund/revoke
- Paid Watch-Party refund/revoke and visual Money Center screenshot
- Paid Events refund/revoke and capacity UI proof
- Channel Subscription fresh lifecycle webhook delivery
- VIP refund/revoke and optional direct client active-VIP write-denial hardening proof

## Final BrowserStack Regression Plan

BrowserStack remains deferred until cheap/local/manual proof is complete and a Play/internal runtime includes the final launch candidate. BrowserStack should use the Play/internal runtime, not Expo Dev Launcher.

Personas:

- creator/host
- paid fan
- unpaid fan
- subscriber fan
- non-subscriber fan
- VIP fan
- non-VIP fan
- blocked fan if available

Final regression flows:

1. Auth email reset/signup smoke.
2. Brand Studio smoke.
3. Chi'lly Chat call smoke.
4. Watch-Party participant rail smoke.
5. Tips proof smoke.
6. Paid Videos proof smoke.
7. Paid Watch-Party Seats proof smoke.
8. Paid Events proof smoke.
9. Channel Subscriptions proof smoke.
10. VIP Passes proof smoke.
11. Premium separation proof.
12. Direct-link denial proof.
13. Money Center readback proof.

BrowserStack is final regression, not first proof.
