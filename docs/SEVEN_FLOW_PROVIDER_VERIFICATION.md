# Seven-Flow Provider Verification

Date: 2026-06-25

Verdict: Partial.

This lane verifies provider dashboard readiness only. It does not activate purchases in the app, turn on live money, enable creator-money flows, enable payouts, create payable balances, execute provider refunds, complete real customer purchases, change pricing, or change app behavior.

Seven-flow app-side proof: Closed.

Seven-flow production switchboard: Partial.

Seven-flow production prep: Partial.

Seven-flow provider verification: Partial. Provider verification used browser dashboard evidence from Google Play Console and RevenueCat for the Android package `com.chillywood.mobile`. The configured product IDs are present in the dashboards and match the repo/app configuration. Production activation remains blocked by owner activation approval and, for creator-money flows, by owner decision on whether to keep the sandbox-labeled configured IDs or replace them with owner-approved production product IDs.

Creator-money production-labeled products: Partial. Owner chose option B: create clean production-labeled creator-money product IDs before any creator-money launch. The owner approved the recommended production IDs, recommended starting prices, Google Play-valid hyphenated purchase-option IDs, and United States only first. Browser dashboard setup created five one-time production-labeled Google Play Draft records (`cw_creator_tip_099`, `cw_paid_content_access_099`, `cw_watch_party_ticket_099`, `cw_vip_pass_499`, `cw_event_pass_099`), and RevenueCat imported those five as Draft consumables with no entitlement attachment and no Premium mapping. Browser dashboard setup also created Google Play subscription product record `cw_channel_subscription_monthly_499` / `Creator Channel Subscription` with `0` active base plans; the required `monthly` base plan remains missing because the single approved US-only auto-renewing Monthly USD 4.99 retry failed with `Your changes couldn't be saved`. Channel Subscription RevenueCat import/mapping remains blocked until the matching Google Play base plan exists. Sandbox-labeled IDs remain sandbox/test-only unless owner explicitly approves otherwise.

Creator-money production-labeled product IDs: Blocked.

Creator-money tax/legal/compliance plan: Partial.

Creator-money product creation: Partial.

Purchase-option IDs use Google Play-valid hyphenated values.

Codex must not guess tax/legal/compliance fields.

All activation switches remain OFF.

Premium-first launch remains pending owner activation and provider final check.

Creator-money flows remain OFF by default.

Creator payouts remain OFF.

Provider refunds remain manual/external.

Stripe payout and merch prep documented separately in `docs/STRIPE_PAYOUTS_AND_MERCH_PREP.md`.

Stripe payouts remain OFF.

Stripe merch checkout remains OFF.

Production provider products are verified only where dashboard/API evidence exists.

Approved starting prices are launch defaults, not the only future prices.

Future custom pricing requires provider-backed price tiers/products/base plans/offers.

Unsupported custom amounts fail closed.

United States only first.

Do not claim a flow provider-ready unless Google Play and RevenueCat evidence support it.

Do not activate creator-money until production-labeled IDs are verified, mapped, smoke-tested, and owner-approved.

## Repo And Dashboard Confirmation

| Item | Current value |
| --- | --- |
| Branch at lane start | `main` |
| Expected prior provider commit | `2938e6c450527ea646e27401483e5556be9f22f7` |
| Android package id | `com.chillywood.mobile` |
| Android versionCode | `55` |
| Android versionName | `1.0.0` |
| Product activation posture | OFF in the app |
| Google Play Console access | Verified by browser dashboard readback |
| RevenueCat access | Verified by browser dashboard readback |
| Dashboard/project inspected | Google Play app for package `com.chillywood.mobile`; RevenueCat project/app for the app Android Play Store integration |

No private provider screenshots, provider secrets, customer data, dashboard account identifiers, local env files, keys, tokens, signed URLs, or proof passwords were saved.

## Google Play Verification Matrix

| Flow | Expected product ID | Dashboard product ID | Product type | Status | Base plan if any | Match? | Blocker/action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Premium | `premium_subscription` | `premium_subscription` | Subscription | Active | `monthly`, monthly auto-renewing, United States | Yes | Pending owner activation; keep Premium purchase switch OFF until an approved Premium-only activation lane. |
| Tips | `cw_creator_tip_sandbox_099` | `cw_creator_tip_sandbox_099` | One-time product, `Buy` purchase option | Active | Not applicable | Yes | Dashboard product is sandbox-labeled and says not real money; owner must approve using it or create a production-labeled product before activation. |
| Paid Video | `cw_paid_content_access_sandbox_099` | `cw_paid_content_access_sandbox_099` | One-time product, `Buy` purchase option | Active | Not applicable | Yes | Dashboard product is sandbox-labeled and says not real money; owner must approve using it or create a production-labeled product before activation. |
| Watch-Party Ticket | `cw_watch_party_live_ticket_sandbox_099` | `cw_watch_party_live_ticket_sandbox_099` | One-time product, `Buy` purchase option | Active | Not applicable | Yes | Dashboard product is sandbox-labeled and says not real money; owner must approve using it or create a production-labeled product before activation. |
| Channel Subscription | `channel_subscription_sandbox_monthly_499` | `channel_subscription_sandbox_monthly_499` | Subscription | Active | `monthly`, monthly auto-renewing, United States | Yes | Dashboard product is sandbox-labeled; owner must approve using it or create a production-labeled subscription/base plan before activation. |
| VIP | `cw_vip_pass_sandbox_499` | `cw_vip_pass_sandbox_499` | One-time product, `Buy` purchase option | Active | Not applicable | Yes | Dashboard product is sandbox-labeled; owner must approve using it or create a production-labeled product before activation. |
| Event Pass | `cw_event_pass_sandbox_099` | `cw_event_pass_sandbox_099` | One-time product, `Buy` purchase option | Active | Not applicable | Yes | Dashboard product is sandbox-labeled and says not real money; owner must approve using it or create a production-labeled product before activation. |

## RevenueCat Verification Matrix

| Flow | Expected product ID | RevenueCat product | Entitlement | Offering/package | Match? | Blocker/action |
| --- | --- | --- | --- | --- | --- | --- |
| Premium | `premium_subscription:monthly` | Published Play Store product `premium_subscription:monthly` | `premium` entitlement associated only to the Premium monthly product | `premium` offering with `$rc_monthly` package | Yes | Pending owner activation and final Premium smoke. |
| Tips | `cw_creator_tip_sandbox_099` | Published Play Store product | Not applicable; dashboard shows no associated entitlements | Not applicable for direct one-time product flow | Yes | Sandbox-labeled product; owner approval or replacement production product required before activation. |
| Paid Video | `cw_paid_content_access_sandbox_099` | Published Play Store product | Not applicable; dashboard shows no associated entitlements | Not applicable for direct one-time product flow | Yes | Sandbox-labeled product; owner approval or replacement production product required before activation. |
| Watch-Party Ticket | `cw_watch_party_live_ticket_sandbox_099` | Published Play Store product | Not applicable; dashboard shows no associated entitlements | Not applicable for direct one-time product flow | Yes | Sandbox-labeled product; owner approval or replacement production product required before activation. |
| Channel Subscription | `channel_subscription_sandbox_monthly_499:monthly` | Published Play Store product `channel_subscription_sandbox_monthly_499:monthly` | `creator_channel_subscription` entitlement associated only to the channel subscription monthly product | Not applicable for current direct product fallback unless owner requires an offering/package | Yes | Sandbox-labeled product; owner approval or replacement production product required before activation. |
| VIP | `cw_vip_pass_sandbox_499` | Published Play Store product | Not applicable; dashboard shows no associated entitlements | Not applicable for direct one-time product flow | Yes | Sandbox-labeled product; owner approval or replacement production product required before activation. |
| Event Pass | `cw_event_pass_sandbox_099` | Published Play Store product | Not applicable; dashboard shows no associated entitlements | Not applicable for direct one-time product flow | Yes | Sandbox-labeled product; owner approval or replacement production product required before activation. |

RevenueCat dashboard evidence also confirms Premium does not map to creator products, creator one-time products do not map to Premium, and channel subscription maps to the separate creator-channel entitlement.

## App Config Match Matrix

| Flow | Repo/app expected ID | Dashboard match | Access mapping | Premium separation |
| --- | --- | --- | --- | --- |
| Premium | `premium_subscription` / `premium_subscription:monthly` | Google Play and RevenueCat match | `user_entitlements.entitlement_key=premium` only | Premium does not grant creator products. |
| Tips | `cw_creator_tip_sandbox_099` | Google Play and RevenueCat match | No durable access | Does not map to Premium. |
| Paid Video | `cw_paid_content_access_sandbox_099` | Google Play and RevenueCat match | Exact `paid_content_access` for one video/source | Does not map to Premium. |
| Watch-Party Ticket | `cw_watch_party_live_ticket_sandbox_099` | Google Play and RevenueCat match | Exact `watch_party_live_ticket` for one room/target | Does not map to Premium. |
| Channel Subscription | `channel_subscription_sandbox_monthly_499:monthly` | Google Play base product and RevenueCat product match | Exact creator-channel subscription/effective access | Does not map to Premium. |
| VIP | `cw_vip_pass_sandbox_499` | Google Play and RevenueCat match | Exact `vip_pass` for one creator | Does not map to Premium. |
| Event Pass | `cw_event_pass_sandbox_099` | Google Play and RevenueCat match | Exact `event_pass` for one event | Does not map to Premium. |

## Switch / Off-State Proof

| Control | Expected state | Evidence | Status |
| --- | --- | --- | --- |
| Global live money | OFF | `live_money_enabled: "off"` in money feature defaults | Verified locally |
| Creator payouts | OFF | `payouts_enabled: "off"` and runtime `payoutsEnabled: false` | Verified locally |
| Cash-out/withdrawal | OFF | runtime `cashoutEnabled: false`; no payout lane enabled | Verified locally |
| Premium purchase | OFF | `premiumPurchaseEnabled: false` and Premium purchase shell hold | Verified locally |
| Tips | OFF | `tips_enabled: "off"` and runtime `tipsEnabled: false` | Verified locally |
| Paid Video | OFF | `paid_content_enabled: "off"` and runtime paid checkout off | Verified locally |
| Watch-Party Ticket | OFF | `watch_party_tickets_enabled: "off"` | Verified locally |
| Channel Subscription | OFF | `digital_sales_enabled: "off"` | Verified locally |
| VIP | OFF | `digital_sales_enabled: "off"` | Verified locally |
| Event Pass | OFF | `digital_sales_enabled: "off"` | Verified locally |
| Provider refunds | Manual/external | final launch operations runbook and refund foundation | Verified locally |

Direct purchase intents remain blocked while switches are OFF through the money switchboard, backend switch guard, sandbox tester requirement, provider availability checks, and Premium purchase shell hold. This lane did not turn any switch ON.

## Premium-First Provider Readiness

- Premium product present: Yes, Google Play subscription `premium_subscription` is visible and active.
- Premium base plan/subscription ready: Yes, base plan `monthly` is visible and active.
- RevenueCat Premium product mapped: Yes, `premium_subscription:monthly` is published.
- RevenueCat Premium entitlement mapped: Yes, entitlement `premium` is associated to the Premium monthly product.
- Offering/package ready: Yes, offering `premium` contains package `$rc_monthly` for the Premium monthly product.
- App config match: Yes.
- Premium can remain OFF until owner activation: Yes, `premiumPurchaseEnabled=false`.
- Owner action remaining before turning Premium on: approve a Premium-only activation lane, final-check pricing/availability/support ownership, run Play-installed smoke, and keep rollback ready.
- Proof required before Premium launch: purchase sheet opens only under the owner-approved switch, provider result, entitlement readback, restore/manage/cancel, revoke/expiration readback, no creator-product unlock, and rollback proof.

## Creator-Money Provider Readiness

| Flow | Product present? | Correct type? | RevenueCat mapping present? | Access mapping safe? | Payouts off? | Switch off? | Exact blocker | Future activation proof needed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tips | Yes, configured sandbox-labeled product | One-time product | Yes, product imported; no entitlement | Yes, tips unlock nothing | Yes | Yes | Owner must approve using sandbox-labeled product or create production-labeled product | Controlled Play-installed tip with no access grant and no payout side effect |
| Paid Video | Yes, configured sandbox-labeled product | One-time product | Yes, product imported; no entitlement | Yes, exact video/source | Yes | Yes | Owner must approve using sandbox-labeled product or create production-labeled product | Exact video unlock, other-video denial, revoke/readback |
| Watch-Party Ticket | Yes, configured sandbox-labeled product | One-time product | Yes, product imported; no entitlement | Yes, exact room/target | Yes | Yes | Owner must approve using sandbox-labeled product or create production-labeled product | Exact room ticket, other-room denial, no LiveKit authority, revoke/readback |
| Channel Subscription | Yes, configured sandbox-labeled subscription/base plan | Subscription | Yes, product imported and `creator_channel_subscription` mapped | Yes, exact creator channel | Yes | Yes | Owner must approve using sandbox-labeled product or create production-labeled subscription/base plan | Subscription lifecycle, effective access, cancellation/expiration/revoke |
| VIP | Yes, configured sandbox-labeled product | One-time product | Yes, product imported; no entitlement | Yes, exact creator | Yes | Yes | Owner must approve using sandbox-labeled product or create production-labeled product | Exact creator VIP, other-creator denial, ownership/revoke/readback |
| Event Pass | Yes, configured sandbox-labeled product | One-time product | Yes, product imported; no entitlement | Yes, exact event | Yes | Yes | Owner must approve using sandbox-labeled product or create production-labeled product | Exact event pass, other-event denial, canceled/expired/revoke |

## Owner Action List

| Flow | Owner action |
| --- | --- |
| Premium | Approve Premium activation, final-check Google Play subscription/base plan, RevenueCat product/entitlement/offering, pricing, restore/manage/cancel behavior, support owner, monitoring owner, rollback owner, and run controlled live proof later. |
| Tips | Decide whether to use the configured sandbox-labeled one-time product or create a production-labeled product; confirm pricing/type; approve activation; run controlled live proof later. |
| Paid Video | Decide whether to use the configured sandbox-labeled one-time product or create a production-labeled product; confirm pricing/type; approve activation; run controlled exact-target proof later. |
| Watch-Party Ticket | Decide whether to use the configured sandbox-labeled one-time product or create a production-labeled product; confirm pricing/type; approve activation; run controlled same-room proof later. |
| Channel Subscription | Decide whether to use the configured sandbox-labeled subscription/base plan or create a production-labeled subscription/base plan; confirm pricing/type; approve activation; run controlled lifecycle proof later. |
| VIP | Decide whether to use the configured sandbox-labeled one-time product or create a production-labeled product; confirm pricing/type; approve activation; run controlled exact-creator proof later. |
| Event Pass | Decide whether to use the configured sandbox-labeled one-time product or create a production-labeled product; confirm pricing/type; approve activation; run controlled exact-event proof later. |

No creator-money flow has `No owner action needed`.

## Provider Verification Input

Dashboard/API verification is recorded through sanitized proof input outside the repo and verified with:

```sh
npm run proof:seven-flow-provider-verification -- --dashboard-reproof --provider-input /tmp/provider-verification.json
```

The input contains only sanitized status values and product IDs. It must not include provider secrets, private screenshots, customer data, tokens, keys, signed URLs, proof passwords, local env values, raw provider payloads, or private dashboard account identifiers.
