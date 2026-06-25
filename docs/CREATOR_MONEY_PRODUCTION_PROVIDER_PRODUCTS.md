# Creator-Money Production Provider Products

Date: 2026-06-25

Verdict: Partial.

This lane prepares clean production-labeled provider products for the six creator-money flows. It does not activate creator-money, live money, payouts, payable balances, withdrawals, cash-out, transfers, provider refunds, Premium, or public purchases.

Owner decision: use option B. Clean production-labeled creator-money product IDs must exist before any creator-money launch. The owner approved the recommended production IDs, the recommended starting prices, and United States only first. Sandbox-labeled IDs remain sandbox/test-only unless the owner explicitly approves otherwise in a later lane.

Creator-money production-labeled products: Partial. Browser dashboard execution on 2026-06-25 created the five one-time production-labeled Google Play product records as Draft, each with a Google Play-valid hyphenated purchase-option ID, United States-only availability, approved launch price, and approved public name/description. RevenueCat import then found those five draft products and imported them as Draft consumables with no entitlement attachment and no Premium mapping. The existing Google Play subscription product record `cw_channel_subscription_monthly_499` / `Creator Channel Subscription` still has `0` active base plans, so the required `monthly` base plan remains missing and no Channel Subscription purchase is available. The single approved Channel Subscription base-plan retry reached `monthly`, auto-renewing Monthly, United States only, USD 4.99, default 7-day grace period, and automatic account hold, but Google Play again returned `Your changes couldn't be saved`. Channel Subscription RevenueCat import/mapping remains blocked until the Google Play base plan exists.

Creator-money tax/legal/compliance plan: Partial. `docs/CREATOR_MONEY_TAX_LEGAL_COMPLIANCE_PLAN.md` is complete enough for owner/legal/tax review and records every visible provider field, recommended value, owner-confirmation requirement, and Codex proceed/stop rule. Codex must not guess tax/legal/compliance fields. Product creation is partial: the five one-time Draft records were created/imported with approved values, while the Channel Subscription base-plan save is still blocked by Google Play; any active age rating, tax category, or legal/compliance change also remains owner-controlled.

Creator-money product creation: Partial.

Purchase-option IDs use Google Play-valid hyphenated values.

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
| Google Play Console | `com.chillywood.mobile` | Browser readback reached the app product pages. Five one-time production-labeled products were created as Draft records: `cw_creator_tip_099` / `tip-099` / United States / USD 0.99, `cw_paid_content_access_099` / `paid-video-099` / United States / USD 0.99, `cw_watch_party_ticket_099` / `ticket-099` / United States / USD 0.99, `cw_vip_pass_499` / `vip-499` / United States / USD 4.99, and `cw_event_pass_099` / `event-099` / United States / USD 0.99. The subscription product record `cw_channel_subscription_monthly_499` / `Creator Channel Subscription` exists with `0` active base plans. The `monthly` base-plan retry was scoped to United States only and priced at USD 4.99, but save failed again with `Your changes couldn't be saved`. No product or base plan was activated. |
| RevenueCat | Android Play Store integration for the app | Browser readback reached Product Catalog and import. RevenueCat found the five new one-time Google Play Draft products and imported them as Draft consumables with no entitlement attachment. Premium entitlement/offering remains separate. `cw_channel_subscription_monthly_499:monthly` remains absent/blocked until the Google Play base plan exists. |
| Stripe | Future payout and physical-merch rail | Browser readback stopped at Stripe sign-in. Stripe production payout/merch readiness is pending provider access and is not required for Android digital creator-product creation. Stripe is not used for Android digital creator-money purchases in this lane. |

No private dashboard screenshots, provider secrets, customer data, account identifiers, local env files, keys, tokens, signed URLs, or proof passwords were saved.

## Old-To-New Product ID Matrix

| Flow | Old sandbox-labeled ID | New production ID | Product type | Provider status | RevenueCat status | Activation status |
| --- | --- | --- | --- | --- | --- | --- |
| Tips | `cw_creator_tip_sandbox_099` | `cw_creator_tip_099` | One-time product / consumable-style support; `$0.99`, United States only first | Created as Draft with `tip-099` | Imported as Draft consumable; no entitlement | OFF |
| Paid Video | `cw_paid_content_access_sandbox_099` | `cw_paid_content_access_099` | One-time product / consumable-style exact-access grant; `$0.99`, United States only first | Created as Draft with `paid-video-099` | Imported as Draft consumable; no entitlement | OFF |
| Watch-Party Ticket | `cw_watch_party_live_ticket_sandbox_099` | `cw_watch_party_ticket_099` | One-time product; `$0.99`, United States only first | Created as Draft with `ticket-099` | Imported as Draft consumable; no entitlement | OFF |
| Channel Subscription | `channel_subscription_sandbox_monthly_499:monthly` | `cw_channel_subscription_monthly_499` + base plan `monthly` | Subscription; `$4.99/month`, United States only first | Product record exists; base plan save failed after US-only USD 4.99 draft setup | Blocked until Google Play base plan exists | OFF |
| VIP | `cw_vip_pass_sandbox_499` | `cw_vip_pass_499` | One-time product / consumable-style exact creator grant; `$4.99`, United States only first | Created as Draft with `vip-499` | Imported as Draft consumable; no entitlement | OFF |
| Event Pass | `cw_event_pass_sandbox_099` | `cw_event_pass_099` | One-time product; `$0.99`, United States only first | Created as Draft with `event-099` | Imported as Draft consumable; no entitlement | OFF |

## Provider Creation Safety Decision

Six Google Play product records now exist in provider setup scope: five one-time Draft products and the existing Channel Subscription product record. None is activated through the app, and the app switches remain OFF.

Google Play one-time product creation succeeded as Draft for the five owner-approved one-time products using hyphenated purchase-option IDs. Each Draft uses the approved immutable product ID, approved user-visible name and description, default `Digital app sales` tax category, United States-only availability, and the approved launch price. Codex did not click Activate.

Google Play subscription product record `cw_channel_subscription_monthly_499` already exists. The requested base plan `monthly` was retried once with United States only, USD 4.99, auto-renewing Monthly, default 7-day grace period, and automatic account hold. Google Play returned `Your changes couldn't be saved`, so the base plan remains missing.

RevenueCat product import succeeded for the five one-time Draft products as Draft consumables with no entitlement attachment. RevenueCat import/mapping remains blocked for `cw_channel_subscription_monthly_499:monthly` because the clean Google Play base plan does not exist yet. RevenueCat must attach only the channel subscription to `creator_channel_subscription` after the base plan exists, and leave all creator-money products detached from `premium`.

Stripe was not used for Android digital products. Stripe payout and merch prep remains documented separately; Stripe payouts remain OFF and Stripe merch checkout remains OFF.

## Purchase-Option ID Matrix

| Flow | Product ID | Owner-approved purchase-option ID | Google Play validation | Status |
| --- | --- | --- | --- | --- |
| Tips | `cw_creator_tip_099` | `tip-099` | Valid: accepted in Google Play Draft setup. | Created as Draft |
| Paid Video | `cw_paid_content_access_099` | `paid-video-099` | Valid: accepted in Google Play Draft setup. | Created as Draft |
| Watch-Party Ticket | `cw_watch_party_ticket_099` | `ticket-099` | Valid: accepted in Google Play Draft setup. | Created as Draft |
| VIP | `cw_vip_pass_499` | `vip-499` | Valid: accepted in Google Play Draft setup. | Created as Draft |
| Event Pass | `cw_event_pass_099` | `event-099` | Valid: accepted in Google Play Draft setup. | Created as Draft |

Owner action: keep these Draft purchase options inactive until owner activation and controlled provider smoke are approved. Purchase-option IDs use Google Play-valid hyphenated values.

## Channel Subscription Base-Plan Matrix

| Product ID | Base plan ID | Type | Billing period | Price | Region | Grace/account hold | Save result | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cw_channel_subscription_monthly_499` | `monthly` | Auto-renewing | Monthly | `USD 4.99` | United States only | Google Play default visible state: 7-day grace period and calculate account hold automatically | Single approved retry returned `Your changes couldn't be saved` | Blocked |

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
- Owner action needed: keep Draft/off, verify no Premium entitlement remains attached, then approve a separate activation smoke before any switch changes.

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
- Owner action needed: keep Draft/off, verify no Premium entitlement remains attached, then approve a separate exact-video activation smoke before any switch changes.

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
- Owner action needed: keep Draft/off, verify no Premium entitlement remains attached, then approve a separate same-room activation smoke before any switch changes.

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
- Owner action needed: resolve the Google Play `Your changes couldn't be saved` base-plan blocker, create/save the approved `monthly` base plan, import `cw_channel_subscription_monthly_499:monthly` in RevenueCat, attach only to `creator_channel_subscription`, and approve later lifecycle smoke before any switch changes.

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
- Owner action needed: keep Draft/off, verify no Premium entitlement remains attached, then approve a separate exact-creator activation smoke before any switch changes.

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
- Owner action needed: keep Draft/off, verify no Premium entitlement remains attached, then approve a separate exact-event activation smoke before any switch changes.

## Google Play Product Matrix

| Flow | Production product ID | Product type | Display name | Base plan | Price target | Region | Dashboard status | Owner action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tips | `cw_creator_tip_099` | One-time product | `Creator Tip` | Not applicable | `$0.99` | United States only first | Created as Draft with `tip-099`; not activated | Later owner activation/proof; keep app switch OFF. |
| Paid Video | `cw_paid_content_access_099` | One-time product | `Paid Video Access` | Not applicable | `$0.99` | United States only first | Created as Draft with `paid-video-099`; not activated | Later owner activation/proof; keep app switch OFF. |
| Watch-Party Ticket | `cw_watch_party_ticket_099` | One-time product | `Watch-Party Ticket` | Not applicable | `$0.99` | United States only first | Created as Draft with `ticket-099`; not activated | Later owner activation/proof; keep app switch OFF. |
| Channel Subscription | `cw_channel_subscription_monthly_499` | Subscription | `Creator Channel Subscription` | `monthly` missing | `$4.99/month` | United States only first | Created product record; base plan save failed with `Your changes couldn't be saved` | Resolve Google Play save error and retry the approved US-only monthly base plan; do not activate public purchase flow until owner proof. |
| VIP | `cw_vip_pass_499` | One-time product | `Creator VIP Pass` | Not applicable | `$4.99` | United States only first | Created as Draft with `vip-499`; not activated | Later owner activation/proof; keep app switch OFF. |
| Event Pass | `cw_event_pass_099` | One-time product | `Creator Event Pass` | Not applicable | `$0.99` | United States only first | Created as Draft with `event-099`; not activated | Later owner activation/proof; keep app switch OFF. |

## RevenueCat Product Matrix

| Flow | Production RevenueCat product | Entitlement | Offering/package | Dashboard status | Owner action |
| --- | --- | --- | --- | --- | --- |
| Tips | `cw_creator_tip_099` | Not applicable | Not applicable for current direct product flow unless owner chooses package | Imported as Draft consumable; no entitlement attached | Later owner activation/proof; verify no Premium entitlement remains attached. |
| Paid Video | `cw_paid_content_access_099` | Not applicable | Not applicable for current direct product flow unless owner chooses package | Imported as Draft consumable; no entitlement attached | Later owner activation/proof; verify no Premium entitlement remains attached. |
| Watch-Party Ticket | `cw_watch_party_ticket_099` | Not applicable | Not applicable for current direct product flow unless owner chooses package | Imported as Draft consumable; no entitlement attached | Later owner activation/proof; verify no Premium entitlement remains attached. |
| Channel Subscription | `cw_channel_subscription_monthly_499:monthly` | `creator_channel_subscription` | Not applicable for current direct product fallback unless owner requires package | Blocked until Google Play base plan exists | Import after Google Play subscription/base plan exists; attach only to creator-channel entitlement; do not attach to Premium. |
| VIP | `cw_vip_pass_499` | Not applicable | Not applicable for current direct product flow unless owner chooses package | Imported as Draft consumable; no entitlement attached | Later owner activation/proof; verify no Premium entitlement remains attached. |
| Event Pass | `cw_event_pass_099` | Not applicable | Not applicable for current direct product flow unless owner chooses package | Imported as Draft consumable; no entitlement attached | Later owner activation/proof; verify no Premium entitlement remains attached. |

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
| Tips | `cw_creator_tip_099`, `$0.99`, United States only first | Additional tip price products or approved provider-backed price tiers | Yes | Yes | Documented / draft provider product exists |
| Paid Video | `cw_paid_content_access_099`, `$0.99`, United States only first | Creator selects from approved paid-video price tiers mapped to provider products | Yes | Yes | Documented / draft provider product exists |
| Watch-Party Ticket | `cw_watch_party_ticket_099`, `$0.99`, United States only first | Creator selects from approved ticket price tiers mapped to provider products | Yes | Yes | Documented / draft provider product exists |
| Channel Subscription | `cw_channel_subscription_monthly_499`, base plan `monthly`, `$4.99/month`, United States only first | Approved subscription products, base plans, or offers only | Yes | Yes | Documented / base plan blocked |
| VIP | `cw_vip_pass_499`, `$4.99`, United States only first | Approved VIP price tiers mapped to provider products | Yes | Yes | Documented / draft provider product exists |
| Event Pass | `cw_event_pass_099`, `$0.99`, United States only first | Approved event pass price tiers mapped to provider products | Yes | Yes | Documented / draft provider product exists |

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

1. Review `docs/CREATOR_MONEY_TAX_LEGAL_COMPLIANCE_PLAN.md`.
2. Keep the five one-time Google Play products in Draft/off state until a separate owner-approved activation lane.
3. Confirm the visible Google Play tax/compliance category if the dashboard asks for an active change.
4. Confirm whether exact-access products are consumed after backend grant or treated as non-consumable/owned access where Google Play asks explicitly.
5. Confirm the five RevenueCat Draft consumable imports remain detached from `premium`.
6. Retry the `monthly` base plan for `cw_channel_subscription_monthly_499`; the approved United States-only `$4.99/month` draft failed with `Your changes couldn't be saved`.
7. Import the Channel Subscription base plan into RevenueCat only after the matching Google Play base plan exists.
8. Attach only the channel subscription to `creator_channel_subscription`; do not attach any creator product to `premium`.
9. Re-run dashboard verification and Play-installed smoke in a separate lane.
10. Keep all creator-money switches OFF until owner-approved activation.

## Current Provider Docs Basis

Current provider docs checked on 2026-06-25: Google Play subscriptions require subscription/base-plan setup and activation for availability, Google Play one-time products are separate from subscriptions, RevenueCat products must match store identifiers exactly, RevenueCat entitlements represent access, and RevenueCat offerings/packages are presentation groupings where used.
