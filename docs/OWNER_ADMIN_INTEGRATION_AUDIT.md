# Owner/Admin Integration Audit After Route Cleanup

Date: June 14, 2026

## Summary

This audit reviewed the repo after issues #1-#7 route/product cleanup. It did not add monetization features, enable live money, enable payouts, change LiveKit authority, change Watch-Party route ownership, change Premium gates, weaken RLS, or start BrowserStack.

Recommendation: proceed toward BrowserStack prep after local validation. The only code fix made during this audit was replacing raw Watch-Party proof `console.log` calls with existing sanitized dev-only `debugLog` calls.

## Issue #1-#7 Status

| Issue | Status | Evidence |
| --- | --- | --- |
| #1 raw title-id UX | Closed | `app/watch-party/index.tsx` no longer asks normal users for raw title ids; no source shows `Choose content first to start Watch-Party Live.` plus `Browse Titles`. |
| #2 Live tab choices | Closed | `app/(tabs)/live.tsx` presents `Live Watch-Party`, `Enter Watch-Party Code`, and `Browse Titles` with existing navigation. |
| #3 Live Stage ownership | Audited | Live Stage remains `/watch-party/live-stage/[partyId]`; Party Room remains `/watch-party/[partyId]`. |
| #4 stale proof instructions | Closed | `NEXT_TASK.md` marks historical room codes as history only and says to use a current active room or create a fresh paid room/offer. |
| #5 paid ticket truth | Closed | Paid Watch-Party ticket copy stays sandbox/test, not payable, room-specific, and separate from Premium, Paid Videos, Paid Events, VIP, Channel Subscriptions, Tips, and Live Stage. |
| #6 Platform Studio wrapper | Closed | `/channel-studio` is preferred; `/channel-settings` remains compatibility backed by the same `ChannelStudioScreen`. |
| #7 route contract guard | Closed | `npm run guard:route-contracts` is wired to `scripts/guard-route-contracts.mjs`. |

## Owner/Creator Surface Audit

| Surface | Role and access | Current truth |
| --- | --- | --- |
| Platform Studio | Signed-in creator/owner with existing creator-tool gate; non-Premium/non-authorized users see a gate. | Preferred route is `/channel-studio`; compatibility route is `/channel-settings`. |
| Brand Studio | Creator/owner behind Platform Studio gate. | Owner save/reload proof passed; wrong-user edit denied through normal RLS. |
| Channel Settings | Compatibility implementation route for Platform Studio. | Kept for old links; not a separate product surface. |
| Money Center | Creator/owner behind Platform Studio gate. | Shows Overview, Ways to Earn, Offers, Transactions, Payouts, Tax & Legal, and Provider Status. |
| Offers | Creator/owner for own offers. | Six creator flows have separate offer rows/readbacks where backed. |
| Transactions | Creator/owner for own transactions. | Tips, Paid Videos, Rooms, Subscriptions, VIP, and Events are separated and labeled sandbox/not payable. |
| Payouts | Creator/owner read-only/setup. | Disabled while live money/payouts are off; no cash-out, withdrawal, transfer, or payable balance. |
| Tax & Legal | Creator/owner readiness only. | No tax/KYC or payout approval is faked. |
| Provider Status | Creator/owner sanitized readiness. | Provider readiness can be inspected; it does not activate live money. |
| Creator video upload/edit | Creator/owner. | Paid Video setup remains separate from Tips/Premium and uses RevenueCat/Google Play sandbox path. |
| Paid Watch-Party ticket setup | Creator/host proof path. | Sandbox-only ticket setup remains usable and proof-truthful. Purchases route Party Waiting Room -> Party Room. |
| Paid Event setup | Creator/owner. | Sandbox-only event pass setup remains separate from VIP, subscriptions, rooms, videos, Tips, and Premium. |
| Channel Subscription setup | Creator/owner. | Sandbox subscription setup remains separate from Premium/VIP/other creator purchases and uses effective access for user-facing state. |
| VIP Pass setup | Creator/owner. | Sandbox VIP setup remains creator-specific and does not grant Premium, subscriptions, paid videos, rooms, events, or LiveKit authority. |

No owner/creator surface was found to expose admin-only controls. No surface reviewed implied live money, payout, cash-out, withdrawal, transfer, or payable balances.

## Admin/Operator Surface Audit

| Area | Current capability | Gap/deferred state |
| --- | --- | --- |
| Provider readiness | Admin/owner can inspect sanitized readiness rows and provider-event/audit counts. | No dashboard action activates live money while `live_money_enabled` is off. |
| Sandbox purchases | Owner/Admin Money Center can inspect sandbox purchase/provider/audit rows where readable. | Inspection only; no mark-paid or fake production action. |
| Transaction audit | Admin money audit rows can be inspected through Admin surfaces. | Refund/revoke actions remain provider-tooling dependent. |
| Reports/moderation/content safety | Admin Command Center has report, DMCA, moderation, and content review lanes. | These are separate from creator money and do not create payout authority. |
| Creator status/offer disable | Existing admin/runtime controls and offer statuses can block where already supported. | Not every flow has an in-app admin revoke/disable UI; unsupported actions are documented as deferred. |
| Refund/revoke visibility | Provider events and lifecycle/readback rows can be reviewed where present. | Paid Videos, Paid Watch-Party, Paid Events, Channel Subscriptions lifecycle delivery, and VIP refund/revoke remain deferred/provider-blocked as documented. |
| Payout/cash-out | Admin surfaces explicitly state payouts/cash-out/withdrawal/transfer are disabled. | Production payout execution requires a later owner-approved lane. |

Admin-only controls remain scoped to `/admin` and backend-role protected surfaces. Creator/fan routes reviewed do not expose admin provider, refund, payout, or role controls.

## Added/Removed/Wired/Missing Route Matrix

| Route/surface | Owner | Creator | Fan | Admin/operator | Logged-out | Premium required | Creator-only | Sandbox-only | Direct-link behavior | Guard exists | Missing/stale wiring |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/channel/[userId]` | Owner controls when owner | Public creator view | Public viewer | No admin controls | Public-safe where profile policy allows | No creator-money bypass | Owner controls hidden from viewers | No | Public-safe, no draft/owner write access | RLS/profile/channel policy | None found |
| `/channel-studio` | Yes | Yes | No | No | Blocked/gated | Existing Platform Studio gate | Yes | Money sections are sandbox/readback only | Unsupported params fall back safely | `guard:route-contracts` | None found |
| `/channel-settings` | Yes | Yes | No | No | Blocked/gated | Same as Studio | Yes | Same as Studio | Compatibility route to same implementation | `guard:route-contracts` | Kept intentionally |
| `/channel-subscription/[creatorId]` | Creator can view/manage context | Creator owner path | Subscriber/non-subscriber fan | No | Blocked/sign-in as needed | Premium does not unlock | No | Product is sandbox-only | Effective access controls route | route guard plus access helper | Lifecycle webhook proof deferred |
| `/vip-pass/[creatorId]` | Creator can view/manage context | Creator owner path | VIP/non-VIP fan | No | Blocked/sign-in as needed | Premium does not unlock | No | Product is sandbox-only | Active VIP pass controls route | route guard plus access helper | Refund/revoke deferred |
| `/watch-party` | Host entry | Host entry | Join by code/content-first entry | No | Sign-in/Premium/runtime gates where required | Existing room policy | No | Paid tickets are sandbox-only | No source points to Browse Titles; code lookup preserved | `guard:route-contracts` | None found |
| `/watch-party/[partyId]` | Host/member | Host/member | Ticket/member fan | No | Fails closed | Existing room policy | No | Paid tickets are sandbox-only | Party Room direct links are gated before camera/mic/membership/presence | `guard:route-contracts`, old-room guard | None found |
| `/watch-party/live-stage/[partyId]` | Live host/member | Live host/member | Live participant | No | Fails closed | Existing live/Premium/runtime policy | No | Not a paid room-ticket target | Live Waiting Room/Live Stage only | `guard:route-contracts`, LiveKit guard | Existing raw live-stage proof logs are outside this task scope |
| `/player/[id]` | Viewer/owner where entitled | Creator content owner where allowed | Viewer | No | Entitlement/source gated | Premium separate from creator buys | No | Paid video is sandbox-only | Player/Title handoff goes to `/watch-party` first | route guard | None found |
| `/title/[id]` | Viewer | Creator where relevant | Viewer | No | Public/entitlement gated | Premium separate | No | No | Title handoff goes to `/watch-party` first | route guard | None found |
| `/tip-status` | No | Tip status/receipt as applicable | Tip fan as applicable | No | Route policy applies | No | No | Tips test/sandbox only | Tips create no access/perk | money guards | None found |
| `/reset-password` | User only | User only | User only | No | Auth-link entry | No | No | No | Recovery link opens app route; token URLs not logged | auth guard/docs | None found |
| auth callback routes | User only | User only | User only | No | Auth-link entry | No | No | No | Verification/reset links handled without documenting tokens | auth guard/docs | None found |
| `/chat` | User | User | User | No | Sign-in required | No | No | No | Canonical inbox | `guard:route-contracts` | Two-user proof deferred |
| `/chat/[threadId]` | Thread participant | Thread participant | Thread participant | No | Sign-in required | No | No | No | Canonical thread | `guard:route-contracts` | Two-user call proof deferred |
| `/subscribe` | User | User | User | No | Sign-in/payment policy | Premium route only | No | Premium sandbox policy | Premium remains separate from creator purchases | `guard:route-contracts` | None found |
| `/admin` | Owner/admin | No | No | Yes | Blocked | No | No | Admin/readiness only | Backend-role protected command center | admin guards/RLS | BrowserStack/admin smoke pending |

## Money Center Integration Status

| Flow | Setup visible | Offer readback | Transaction readback | Sandbox/not payable | Refund/revoke/lifecycle state | Separation |
| --- | --- | --- | --- | --- | --- | --- |
| Tips | Yes | Settings/readiness | Yes | Yes | Failed/declined proof passed; live payout disabled | Pure contribution; no access/perks |
| Paid Videos | Yes | Yes | Yes | Yes | Refund/revoke deferred | Only purchased video |
| Paid Watch-Party Seats | Yes | Yes | RPC readback passed; visual screenshot follow-up deferred | Yes | Refund/revoke deferred | Only linked Party Waiting Room/Party Room; not Live Stage |
| Paid Events | Yes | Yes | Yes | Yes | Capacity UI and refund/revoke deferred | Only linked event |
| Channel Subscriptions | Yes | Yes | Yes | Yes | Fresh lifecycle webhook delivery provider-blocked; effective-access fallback passed | Only creator subscriber area |
| VIP Passes | Yes | Yes | Yes | Yes | Refund/revoke deferred | Only creator-specific VIP area |

Money Center copy reviewed in `app/channel-settings.tsx` keeps sandbox/test/not-payable labels visible and does not imply withdrawable balances, live earnings, cash-out, withdrawal, transfer, payout release, Premium unlocks, or Tips-as-digital-access.

## RLS And Security Posture

This task did not change schema, RLS, migrations, Edge Functions, or provider logic. The audit relied on existing implementation/proof docs and source boundaries:

- creators read/write only their own allowed offer/settings rows through guarded helpers/RPCs
- fans read their own purchase/access rows only
- public users do not read private transactions
- clients cannot directly mark provider-backed rows paid
- clients cannot directly create active grants/tickets/passes/subscriptions/VIP rows
- provider readiness and paid status mutation stay server/admin-side
- service-role and provider secrets remain out of mobile code
- expired/refunded/revoked/canceled states are documented as non-granting and are enforced where proof exists

## Launch Blockers

- BrowserStack final regression has not run.
- Chi'lly Chat two-user message/call proof remains deferred until a second device/session or approved BrowserStack.
- Watch-Party/LiveKit two-user proof remains deferred until a second device/session or approved BrowserStack.
- Some provider refund/revoke/lifecycle proofs remain blocked by provider tooling/order identifiers.
- Paid Watch-Party visual Money Center screenshot follow-up remains deferred; RPC/readback proof exists.
- External Google Play launch governance, Data Safety, app access, support/privacy/terms, and production review remain separate launch lanes.

## Safe Deferred Items

- Paid Videos refund/revoke proof.
- Paid Watch-Party refund/revoke and visual Money Center screenshot.
- Paid Events refund/revoke and capacity UI proof.
- Channel Subscription fresh signed lifecycle webhook delivery.
- VIP refund/revoke.
- Broader payout/tax/KYC/fraud/support/live-money activation.

## Recommendation

No owner/admin integration blocker was found in the route/product cleanup. BrowserStack prep can continue after local validation, with live money and payouts still off and the deferred provider-tooling gaps kept out of launch-live claims.
