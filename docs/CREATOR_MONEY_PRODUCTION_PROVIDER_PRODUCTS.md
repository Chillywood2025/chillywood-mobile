# Creator-Money Production Provider Products

Date: 2026-06-25

Verdict: Blocked.

This lane prepares clean production-labeled provider products for the six creator-money flows. It does not activate creator-money, live money, payouts, payable balances, withdrawals, cash-out, transfers, provider refunds, Premium, or public purchases.

Owner decision: use option B. Clean production-labeled creator-money product IDs must exist before any creator-money launch. The owner approved the recommended production IDs, the recommended starting prices, and United States only first. Sandbox-labeled IDs remain sandbox/test-only unless the owner explicitly approves otherwise in a later lane.

Creator-money production-labeled products: Blocked. Browser dashboard readback found the six clean production-labeled IDs missing in Google Play Console and RevenueCat. Creating them remains blocked because Google Play submission requires required public metadata and provider/compliance choices that were not approved in this lane: user-visible product names/descriptions/icons, tax category, age rating, purchase options, subscription base plans, and any publishing/provider review steps. No product form was submitted.

Approved starting prices are launch defaults, not the only future prices.

Future custom pricing requires provider-backed price tiers/products/base plans/offers.

Unsupported custom amounts fail closed.

Creator-money activation remains OFF.

Premium remains unchanged.

Payouts remain OFF.

Provider refunds remain manual/external.

Stripe payout and merch prep documented separately in `docs/STRIPE_PAYOUTS_AND_MERCH_PREP.md`.

Stripe payouts remain OFF.

Stripe merch checkout remains OFF.

United States only first.

Do not activate creator-money until production-labeled IDs are verified, mapped, smoke-tested, and owner-approved.

## Dashboard Readback

| Provider | App/package | Result |
| --- | --- | --- |
| Google Play Console | `com.chillywood.mobile` | Browser readback reached the app product pages. The five one-time production-labeled IDs and one subscription production-labeled ID below were not present. One-time product creation requires immutable product ID plus user-visible name, description, icon, tax category, age rating, regional restrictions, purchase option, and pricing before availability/pricing completion. Subscription creation requires immutable product ID and user-visible name before base-plan creation. No product form was submitted. |
| RevenueCat | Android Play Store integration for the app | Browser readback reached Product Catalog, Entitlements, and Offerings. The six production-labeled IDs below were not present. Premium entitlement/offering remains separate, and `creator_channel_subscription` exists for the sandbox channel subscription only. RevenueCat import/mapping cannot complete until the matching Google Play products exist. |
| Stripe | Future payout and physical-merch rail | Browser readback stopped at Stripe sign-in. Stripe production payout/merch readiness is pending provider access and is not required for Android digital creator-product creation. Stripe is not used for Android digital creator-money purchases in this lane. |

No private dashboard screenshots, provider secrets, customer data, account identifiers, local env files, keys, tokens, signed URLs, or proof passwords were saved.

## Old-To-New Product ID Matrix

| Flow | Old sandbox-labeled ID | New production ID | Product type | Provider status | RevenueCat status | Activation status |
| --- | --- | --- | --- | --- | --- | --- |
| Tips | `cw_creator_tip_sandbox_099` | `cw_creator_tip_099` | One-time product / consumable-style support if supported by provider setup; `$0.99`, United States only first | Missing | Missing | OFF |
| Paid Video | `cw_paid_content_access_sandbox_099` | `cw_paid_content_access_099` | One-time product / consumable or exact-access product depending provider policy; `$0.99`, United States only first | Missing | Missing | OFF |
| Watch-Party Ticket | `cw_watch_party_live_ticket_sandbox_099` | `cw_watch_party_ticket_099` | One-time product; `$0.99`, United States only first | Missing | Missing | OFF |
| Channel Subscription | `channel_subscription_sandbox_monthly_499:monthly` | `cw_channel_subscription_monthly_499` + base plan `monthly` | Subscription; `$4.99/month`, United States only first | Missing | Missing | OFF |
| VIP | `cw_vip_pass_sandbox_499` | `cw_vip_pass_499` | One-time product / non-consumable-style creator-specific pass if supported by provider setup; `$4.99`, United States only first | Missing | Missing | OFF |
| Event Pass | `cw_event_pass_sandbox_099` | `cw_event_pass_099` | One-time product; `$0.99`, United States only first | Missing | Missing | OFF |

## Provider Creation Safety Decision

No provider product was submitted in this lane.

Google Play one-time product creation was blocked by owner/provider action because the visible form requires an immutable product ID, user-visible name and description, product icon, tax category, age rating, regional restrictions, purchase option, and pricing path before the product can be completed. Google Play subscription creation was blocked by owner/provider action because the visible form requires an immutable product ID and user-visible subscription name before base-plan creation, and the requested base plan `monthly` would still require follow-on pricing/region/provider setup.

RevenueCat product import/mapping was blocked because the clean Google Play products do not exist yet. RevenueCat must import exact store IDs, attach only the channel subscription to `creator_channel_subscription`, and leave all creator-money products detached from `premium`.

Stripe was not used for Android digital products. Stripe payout and merch prep remains documented separately; Stripe payouts remain OFF and Stripe merch checkout remains OFF.

## Flow Product Plan

### Tips

- Old sandbox-labeled product ID: `cw_creator_tip_sandbox_099`.
- New production product ID: `cw_creator_tip_099`.
- Intended type: one-time product / consumable-style support if supported by provider setup.
- Starting price: `$0.99`.
- Region: United States only first.
- RevenueCat mapping requirement: import Google Play product; no Premium entitlement; no durable access entitlement.
- App switch: `tipsEnabled`; backend `tips_enabled`.
- Access created: none / contribution receipt only.
- Access not created: Premium, content, room, VIP, subscription, event, payout.
- Activation status: OFF.
- Owner action needed: create Google Play one-time product, configure price/regions/purchase option, import/map in RevenueCat, verify no Premium entitlement, and approve later activation smoke.

### Paid Video

- Old sandbox-labeled product ID: `cw_paid_content_access_sandbox_099`.
- New production product ID: `cw_paid_content_access_099`.
- Intended type: one-time product / consumable or exact-access product depending provider policy.
- Starting price: `$0.99`.
- Region: United States only first.
- RevenueCat mapping requirement: import Google Play product; no Premium entitlement; backend exact-target grant remains access source.
- App switch: `paidVideoEnabled`; backend `paid_content_enabled`.
- Access created: exact paid video target only.
- Access not created: Premium, other videos, rooms, VIP, subscription, event, payout.
- Activation status: OFF.
- Owner action needed: create Google Play one-time product, configure price/regions/purchase option, import/map in RevenueCat, verify no Premium entitlement, and approve later exact-video smoke.

### Watch-Party Ticket

- Old sandbox-labeled product ID: `cw_watch_party_live_ticket_sandbox_099`.
- New production product ID: `cw_watch_party_ticket_099`.
- Intended type: one-time product.
- Starting price: `$0.99`.
- Region: United States only first.
- RevenueCat mapping requirement: import Google Play product; no Premium entitlement; backend exact-room ticket/grant remains access source.
- App switch: `watchPartyTicketEnabled`; backend `watch_party_tickets_enabled`.
- Access created: exact room/ticket target only.
- Access not created: Premium, other rooms, LiveKit publish/host/mod, VIP, subscription, payout.
- Activation status: OFF.
- Owner action needed: create Google Play one-time product, configure price/regions/purchase option, import/map in RevenueCat, verify no Premium entitlement, and approve later same-room smoke.

### Channel Subscription

- Old sandbox-labeled product ID: `channel_subscription_sandbox_monthly_499:monthly`.
- New production product ID: `cw_channel_subscription_monthly_499`.
- Intended type: subscription.
- Base plan: `monthly`.
- Starting price: `$4.99/month`.
- Region: United States only first.
- RevenueCat entitlement: `creator_channel_subscription` or current safe creator-specific subscription mapping.
- App switch: `channelSubscriptionEnabled`; backend `digital_sales_enabled`.
- Access created: exact creator Platform subscription only.
- Access not created: Premium, VIP, paid videos, rooms, events, other creators, payout.
- Activation status: OFF.
- Owner action needed: create Google Play subscription, create base plan `monthly`, configure price/regions, import product/base plan in RevenueCat as `cw_channel_subscription_monthly_499:monthly`, attach only to `creator_channel_subscription`, and approve later lifecycle smoke.

### VIP

- Old sandbox-labeled product ID: `cw_vip_pass_sandbox_499`.
- New production product ID: `cw_vip_pass_499`.
- Intended type: one-time product / non-consumable-style creator-specific pass if supported by provider setup.
- Starting price: `$4.99`.
- Region: United States only first.
- RevenueCat mapping requirement: import Google Play product; no Premium entitlement; backend exact-creator VIP pass remains access source.
- App switch: `vipEnabled`; backend `digital_sales_enabled`.
- Access created: exact creator VIP only.
- Access not created: Premium, subscription, other creators, paid videos, rooms, events, payout.
- Activation status: OFF.
- Owner action needed: create Google Play one-time product, configure price/regions/purchase option, import/map in RevenueCat, verify no Premium entitlement, and approve later exact-creator smoke.

### Event Pass

- Old sandbox-labeled product ID: `cw_event_pass_sandbox_099`.
- New production product ID: `cw_event_pass_099`.
- Intended type: one-time product.
- Starting price: `$0.99`.
- Region: United States only first.
- RevenueCat mapping requirement: import Google Play product; no Premium entitlement; backend exact-event pass remains access source.
- App switch: `eventPassEnabled`; backend `digital_sales_enabled`.
- Access created: exact event target only.
- Access not created: Premium, VIP, subscription, paid videos, rooms, other events, payout.
- Activation status: OFF.
- Owner action needed: create Google Play one-time product, configure price/regions/purchase option, import/map in RevenueCat, verify no Premium entitlement, and approve later exact-event smoke.

## Google Play Product Matrix

| Flow | Production product ID | Product type | Base plan | Price target | Region | Dashboard status | Owner action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tips | `cw_creator_tip_099` | One-time product | Not applicable | `$0.99` | United States only first | Missing / blocked by owner-provider setup | Create product, purchase option, pricing, regions, required public metadata, tax/compliance, age rating, and keep app switch OFF. |
| Paid Video | `cw_paid_content_access_099` | One-time product | Not applicable | `$0.99` | United States only first | Missing / blocked by owner-provider setup | Create product, purchase option, pricing, regions, required public metadata, tax/compliance, age rating, and keep app switch OFF. |
| Watch-Party Ticket | `cw_watch_party_ticket_099` | One-time product | Not applicable | `$0.99` | United States only first | Missing / blocked by owner-provider setup | Create product, purchase option, pricing, regions, required public metadata, tax/compliance, age rating, and keep app switch OFF. |
| Channel Subscription | `cw_channel_subscription_monthly_499` | Subscription | `monthly` | `$4.99/month` | United States only first | Missing / blocked by owner-provider setup | Create subscription, base plan, pricing, regions, required public metadata, tax/compliance, age rating, and keep app switch OFF. |
| VIP | `cw_vip_pass_499` | One-time product | Not applicable | `$4.99` | United States only first | Missing / blocked by owner-provider setup | Create product, purchase option, pricing, regions, required public metadata, tax/compliance, age rating, and keep app switch OFF. |
| Event Pass | `cw_event_pass_099` | One-time product | Not applicable | `$0.99` | United States only first | Missing / blocked by owner-provider setup | Create product, purchase option, pricing, regions, required public metadata, tax/compliance, age rating, and keep app switch OFF. |

## RevenueCat Product Matrix

| Flow | Production RevenueCat product | Entitlement | Offering/package | Dashboard status | Owner action |
| --- | --- | --- | --- | --- | --- |
| Tips | `cw_creator_tip_099` | Not applicable | Not applicable for current direct product flow unless owner chooses package | Missing | Import after Google Play product exists; verify no Premium entitlement. |
| Paid Video | `cw_paid_content_access_099` | Not applicable | Not applicable for current direct product flow unless owner chooses package | Missing | Import after Google Play product exists; verify no Premium entitlement. |
| Watch-Party Ticket | `cw_watch_party_ticket_099` | Not applicable | Not applicable for current direct product flow unless owner chooses package | Missing | Import after Google Play product exists; verify no Premium entitlement. |
| Channel Subscription | `cw_channel_subscription_monthly_499:monthly` | `creator_channel_subscription` | Not applicable for current direct product fallback unless owner requires package | Missing | Import after Google Play subscription/base plan exists; attach only to creator-channel entitlement. |
| VIP | `cw_vip_pass_499` | Not applicable | Not applicable for current direct product flow unless owner chooses package | Missing | Import after Google Play product exists; verify no Premium entitlement. |
| Event Pass | `cw_event_pass_099` | Not applicable | Not applicable for current direct product flow unless owner chooses package | Missing | Import after Google Play product exists; verify no Premium entitlement. |

## Repo Config Matrix

| Flow | Sandbox ID known | Production ID known | Current app active ID | Activation state |
| --- | --- | --- | --- | --- |
| Tips | Yes | Yes | Sandbox ID remains current proof config | OFF |
| Paid Video | Yes | Yes | Sandbox ID remains current proof config | OFF |
| Watch-Party Ticket | Yes | Yes | Sandbox ID remains current proof config | OFF |
| Channel Subscription | Yes | Yes | Sandbox ID/base plan remains current proof config | OFF |
| VIP | Yes | Yes | Sandbox ID remains current proof config | OFF |
| Event Pass | Yes | Yes | Sandbox ID remains current proof config | OFF |

## Custom Pricing Policy Matrix

| Flow | Launch default | Future custom method | Provider-backed? | Fail-closed? | Status |
| --- | --- | --- | --- | --- | --- |
| Tips | `cw_creator_tip_099`, `$0.99`, United States only first | Additional tip price products or approved provider-backed price tiers | Yes | Yes | Documented / provider products missing |
| Paid Video | `cw_paid_content_access_099`, `$0.99`, United States only first | Creator selects from approved paid-video price tiers mapped to provider products | Yes | Yes | Documented / provider products missing |
| Watch-Party Ticket | `cw_watch_party_ticket_099`, `$0.99`, United States only first | Creator selects from approved ticket price tiers mapped to provider products | Yes | Yes | Documented / provider products missing |
| Channel Subscription | `cw_channel_subscription_monthly_499`, base plan `monthly`, `$4.99/month`, United States only first | Approved subscription products, base plans, or offers only | Yes | Yes | Documented / provider products missing |
| VIP | `cw_vip_pass_499`, `$4.99`, United States only first | Approved VIP price tiers mapped to provider products | Yes | Yes | Documented / provider products missing |
| Event Pass | `cw_event_pass_099`, `$0.99`, United States only first | Approved event pass price tiers mapped to provider products | Yes | Yes | Documented / provider products missing |

Unsupported custom amounts fail closed: no purchase intent, no provider sheet, no access grant, no ledger row, no payout, no payable balance, and safe unavailable copy only. Future price expansion requires verified Google Play / RevenueCat products, price tiers, base plans, offers, or owner-approved product catalog entries.

## Switch / Off-State Proof

| Control | State |
| --- | --- |
| `live_money_enabled` | OFF |
| `tips_enabled` | OFF |
| `paid_content_enabled` | OFF |
| `watch_party_tickets_enabled` | OFF |
| `digital_sales_enabled` | OFF |
| `premiumPurchaseEnabled` | OFF |
| `payouts_enabled` / `payoutsEnabled` | OFF |
| `cashoutEnabled` | OFF |
| Provider refunds | Manual/external |
| Stripe payouts | OFF |
| Stripe merch checkout | OFF |

## Stripe Payout / Merch Matrix

| Area | Status | Enabled? | Action needed | Safety note |
| --- | --- | --- | --- | --- |
| Creator payouts | Future separate lane | No | Owner-approved Stripe Connect production payout lane | No payout, transfer, withdrawal, cash-out, payout batch, or payable creator balance is enabled. |
| Stripe Connect/onboarding | Sandbox readiness only; production dashboard access pending | No | Verify production Stripe access and Connect account-controller/capability choices separately | Android digital creator-money purchases do not use Stripe. |
| Merch checkout | Future physical-merch lane | No | Owner-approved production merch lane with fulfillment, returns/refunds, support, and Data Safety review | Physical merch remains separate from Android digital access. |
| Webhooks/secrets | No secret exposure | No | Configure secrets only through provider/runtime secret stores | No Stripe key or webhook secret is committed. |
| Refund automation | Manual/external | No | Separate provider-refund lane required | No provider refund action is executed. |

## Owner Action List

1. Approve the required user-visible product names/descriptions/icons, tax category, age rating, and any other provider/compliance fields needed by Google Play.
2. Create the five Google Play one-time products with the production-labeled IDs above.
3. Create the Google Play channel subscription `cw_channel_subscription_monthly_499` with base plan `monthly`.
4. Set the approved starting prices and United States only first availability.
5. Confirm purchase options, tax/compliance, age rating, publishing/provider review, and provider availability.
6. Import each product into RevenueCat only after Google Play records exist.
7. Attach only the channel subscription to `creator_channel_subscription`; do not attach any creator product to `premium`.
8. Re-run dashboard verification and Play-installed smoke in a separate lane.
9. Keep all creator-money switches OFF until owner-approved activation.

## Current Provider Docs Basis

Current provider docs checked on 2026-06-25: Google Play subscriptions require subscription/base-plan setup and activation for availability, Google Play one-time products are separate from subscriptions, RevenueCat products must match store identifiers exactly, RevenueCat entitlements represent access, and RevenueCat offerings/packages are presentation groupings where used.
