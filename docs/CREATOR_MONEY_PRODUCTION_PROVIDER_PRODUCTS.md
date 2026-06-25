# Creator-Money Production Provider Products

Date: 2026-06-25

Verdict: Partial.

This lane prepares clean production-labeled provider products for the six creator-money flows. It does not activate creator-money, live money, payouts, payable balances, withdrawals, cash-out, transfers, provider refunds, Premium, or public purchases.

Owner decision: use option B. Clean production-labeled creator-money product IDs must exist before any creator-money launch. The owner approved the recommended production IDs, the recommended starting prices, and United States only first. Sandbox-labeled IDs remain sandbox/test-only unless the owner explicitly approves otherwise in a later lane.

Creator-money production-labeled products: Partial. Browser dashboard setup created the Google Play subscription product record `cw_channel_subscription_monthly_499` with display name `Creator Channel Subscription`. The subscription has `0` active base plans, so the required `monthly` base plan remains missing and no purchase is available. The five one-time products remain blocked by the Google Play provider form because the visible create form requires product icon upload and age rating, and exposes tax/compliance category, purchase option, region, and pricing setup before completion. RevenueCat import/mapping remains blocked because the one-time Google Play products do not exist and the channel subscription base plan does not exist.

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

Creator-money activation still requires owner approval and controlled proof.

No creator-money product maps to Premium.

Do not activate creator-money until production-labeled IDs are verified, mapped, smoke-tested, and owner-approved.

## Dashboard Readback

| Provider | App/package | Result |
| --- | --- | --- |
| Google Play Console | `com.chillywood.mobile` | Browser readback reached the app product pages. The subscription product record `cw_channel_subscription_monthly_499` / `Creator Channel Subscription` now exists with `0` active base plans. The `monthly` base plan was not saved because the base-plan form initially selected all 174 countries/regions and the safe US-only pricing/availability path could not be completed without risking broad availability. The five one-time production-labeled IDs were not created because the visible form requires product icon upload and age rating, and exposes tax/compliance, purchase-option, region, and pricing setup. |
| RevenueCat | Android Play Store integration for the app | Browser readback reached Product Catalog. The six production-labeled IDs were not present. Premium entitlement/offering remains separate. RevenueCat import/mapping cannot complete until the matching Google Play one-time products and channel subscription base plan exist. |
| Stripe | Future payout and physical-merch rail | Browser readback stopped at Stripe sign-in. Stripe production payout/merch readiness is pending provider access and is not required for Android digital creator-product creation. Stripe is not used for Android digital creator-money purchases in this lane. |

No private dashboard screenshots, provider secrets, customer data, account identifiers, local env files, keys, tokens, signed URLs, or proof passwords were saved.

## Old-To-New Product ID Matrix

| Flow | Old sandbox-labeled ID | New production ID | Product type | Provider status | RevenueCat status | Activation status |
| --- | --- | --- | --- | --- | --- | --- |
| Tips | `cw_creator_tip_sandbox_099` | `cw_creator_tip_099` | One-time product / consumable-style support if supported by provider setup; `$0.99`, United States only first | Blocked by provider form | Blocked until Google Play product exists | OFF |
| Paid Video | `cw_paid_content_access_sandbox_099` | `cw_paid_content_access_099` | One-time product / consumable or exact-access product depending provider policy; `$0.99`, United States only first | Blocked by provider form | Blocked until Google Play product exists | OFF |
| Watch-Party Ticket | `cw_watch_party_live_ticket_sandbox_099` | `cw_watch_party_ticket_099` | One-time product; `$0.99`, United States only first | Blocked by provider form | Blocked until Google Play product exists | OFF |
| Channel Subscription | `channel_subscription_sandbox_monthly_499:monthly` | `cw_channel_subscription_monthly_499` + base plan `monthly` | Subscription; `$4.99/month`, United States only first | Created product record; base plan missing | Blocked until Google Play base plan exists | OFF |
| VIP | `cw_vip_pass_sandbox_499` | `cw_vip_pass_499` | One-time product / non-consumable-style creator-specific pass if supported by provider setup; `$4.99`, United States only first | Blocked by provider form | Blocked until Google Play product exists | OFF |
| Event Pass | `cw_event_pass_sandbox_099` | `cw_event_pass_099` | One-time product; `$0.99`, United States only first | Blocked by provider form | Blocked until Google Play product exists | OFF |

## Provider Creation Safety Decision

One provider product record was submitted in this lane: Google Play subscription `cw_channel_subscription_monthly_499` / `Creator Channel Subscription`. It has zero active base plans and cannot be purchased.

Google Play one-time product creation was blocked by provider form requirements because the visible form requires an immutable product ID, user-visible name and description, product icon, tax category, age rating, regional restrictions, purchase option, and pricing path before the product can be completed. The approved prompt supplied product ID, name, description, price, and US-only region, but not product icon or age rating. Tax/compliance category was visible and must not be guessed.

Google Play subscription creation was safe for the approved immutable product ID and user-visible name, so the subscription product record was created. The requested base plan `monthly` was not saved because the base-plan form initially selected all 174 countries/regions and the US-only availability/pricing path was not safely completed. The base plan remains missing.

RevenueCat product import/mapping was blocked because the clean Google Play one-time products do not exist and the channel subscription base plan does not exist yet. RevenueCat must import exact store IDs, attach only the channel subscription to `creator_channel_subscription`, and leave all creator-money products detached from `premium`.

Stripe was not used for Android digital products. Stripe payout and merch prep remains documented separately; Stripe payouts remain OFF and Stripe merch checkout remains OFF.

## Flow Product Plan

### Tips

- Old sandbox-labeled product ID: `cw_creator_tip_sandbox_099`.
- New production product ID: `cw_creator_tip_099`.
- Intended type: one-time product / consumable-style support if supported by provider setup.
- Display name: `Creator Tip`.
- Short description: `Send optional support to a creator. Tips do not unlock content.`
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
- Display name: `Paid Video Access`.
- Short description: `Unlock access to one paid creator video.`
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
- Display name: `Watch-Party Ticket`.
- Short description: `Unlock access to one ticketed Watch-Party room.`
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
- Display name: `Creator Channel Subscription`.
- Short description: `Monthly access to one creator's subscriber area.`
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
- Display name: `Creator VIP Pass`.
- Short description: `Unlock creator-specific VIP access.`
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
- Display name: `Creator Event Pass`.
- Short description: `Unlock access to one paid creator event.`
- Starting price: `$0.99`.
- Region: United States only first.
- RevenueCat mapping requirement: import Google Play product; no Premium entitlement; backend exact-event pass remains access source.
- App switch: `eventPassEnabled`; backend `digital_sales_enabled`.
- Access created: exact event target only.
- Access not created: Premium, VIP, subscription, paid videos, rooms, other events, payout.
- Activation status: OFF.
- Owner action needed: create Google Play one-time product, configure price/regions/purchase option, import/map in RevenueCat, verify no Premium entitlement, and approve later exact-event smoke.

## Google Play Product Matrix

| Flow | Production product ID | Product type | Display name | Base plan | Price target | Region | Dashboard status | Owner action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tips | `cw_creator_tip_099` | One-time product | `Creator Tip` | Not applicable | `$0.99` | United States only first | Blocked by provider form | Provide product icon and age rating; confirm tax/compliance and purchase-option setup; then create product and keep app switch OFF. |
| Paid Video | `cw_paid_content_access_099` | One-time product | `Paid Video Access` | Not applicable | `$0.99` | United States only first | Blocked by provider form | Provide product icon and age rating; confirm tax/compliance and purchase-option setup; then create product and keep app switch OFF. |
| Watch-Party Ticket | `cw_watch_party_ticket_099` | One-time product | `Watch-Party Ticket` | Not applicable | `$0.99` | United States only first | Blocked by provider form | Provide product icon and age rating; confirm tax/compliance and purchase-option setup; then create product and keep app switch OFF. |
| Channel Subscription | `cw_channel_subscription_monthly_499` | Subscription | `Creator Channel Subscription` | `monthly` missing | `$4.99/month` | United States only first | Created product record; base plan missing | Create `monthly` base plan with US-only availability/pricing; do not activate public purchase flow until owner proof. |
| VIP | `cw_vip_pass_499` | One-time product | `Creator VIP Pass` | Not applicable | `$4.99` | United States only first | Blocked by provider form | Provide product icon and age rating; confirm tax/compliance and purchase-option setup; then create product and keep app switch OFF. |
| Event Pass | `cw_event_pass_099` | One-time product | `Creator Event Pass` | Not applicable | `$0.99` | United States only first | Blocked by provider form | Provide product icon and age rating; confirm tax/compliance and purchase-option setup; then create product and keep app switch OFF. |

## RevenueCat Product Matrix

| Flow | Production RevenueCat product | Entitlement | Offering/package | Dashboard status | Owner action |
| --- | --- | --- | --- | --- | --- |
| Tips | `cw_creator_tip_099` | Not applicable | Not applicable for current direct product flow unless owner chooses package | Blocked until Google Play product exists | Import after Google Play product exists; verify no Premium entitlement. |
| Paid Video | `cw_paid_content_access_099` | Not applicable | Not applicable for current direct product flow unless owner chooses package | Blocked until Google Play product exists | Import after Google Play product exists; verify no Premium entitlement. |
| Watch-Party Ticket | `cw_watch_party_ticket_099` | Not applicable | Not applicable for current direct product flow unless owner chooses package | Blocked until Google Play product exists | Import after Google Play product exists; verify no Premium entitlement. |
| Channel Subscription | `cw_channel_subscription_monthly_499:monthly` | `creator_channel_subscription` | Not applicable for current direct product fallback unless owner requires package | Blocked until Google Play base plan exists | Import after Google Play subscription/base plan exists; attach only to creator-channel entitlement; do not attach to Premium. |
| VIP | `cw_vip_pass_499` | Not applicable | Not applicable for current direct product flow unless owner chooses package | Blocked until Google Play product exists | Import after Google Play product exists; verify no Premium entitlement. |
| Event Pass | `cw_event_pass_099` | Not applicable | Not applicable for current direct product flow unless owner chooses package | Blocked until Google Play product exists | Import after Google Play product exists; verify no Premium entitlement. |

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

1. Provide approved one-time product icons for Tips, Paid Video, Watch-Party Ticket, VIP, and Event Pass.
2. Provide approved age rating choices for the five one-time products.
3. Confirm the visible Google Play tax/compliance category and purchase-option setup for each one-time product.
4. Create the five Google Play one-time products with the production-labeled IDs above.
5. Create the `monthly` base plan for `cw_channel_subscription_monthly_499` with United States only first availability and `$4.99/month` pricing.
6. Import each product into RevenueCat only after matching Google Play records/base plans exist.
7. Attach only the channel subscription to `creator_channel_subscription`; do not attach any creator product to `premium`.
8. Re-run dashboard verification and Play-installed smoke in a separate lane.
9. Keep all creator-money switches OFF until owner-approved activation.

## Current Provider Docs Basis

Current provider docs checked on 2026-06-25: Google Play subscriptions require subscription/base-plan setup and activation for availability, Google Play one-time products are separate from subscriptions, RevenueCat products must match store identifiers exactly, RevenueCat entitlements represent access, and RevenueCat offerings/packages are presentation groupings where used.
