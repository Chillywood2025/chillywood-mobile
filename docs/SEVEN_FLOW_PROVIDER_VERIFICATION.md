# Seven-Flow Provider Verification

Date: 2026-06-25

Verdict: Blocked.

This lane verifies provider readiness only. It does not activate purchases in the app, turn on live money, enable creator-money flows, enable payouts, create payable balances, execute provider refunds, complete real customer purchases, change pricing, or change app behavior.

Seven-flow app-side proof: Closed.

Seven-flow production switchboard: Partial.

Seven-flow production prep: Partial.

Seven-flow provider verification: Blocked. Current production Google Play Console and RevenueCat dashboard/API evidence was not available in this session. Local app/config product IDs and switch defaults are proved, but production provider products are verified only where dashboard/API evidence exists. In this pass, no current provider dashboard/API evidence exists, so production provider readiness remains blocked by provider access.

All activation switches remain OFF.

Premium-first launch remains pending owner activation and provider final check.

Creator-money flows remain OFF by default.

Creator payouts remain OFF.

Provider refunds remain manual/external.

Production provider products are verified only where dashboard/API evidence exists.

## Repo And Runtime Confirmation

| Item | Current value |
| --- | --- |
| Branch at lane start | `main` |
| Expected prior prep commit | `c3e74e338a90e2f36ae8f0bdc75f1fd51dac7dad` |
| Android package id | `com.chillywood.mobile` |
| Android versionCode | `55` |
| Android versionName | `1.0.0` |
| Product activation posture | OFF in the app |
| Provider dashboard access | Blocked by provider access |

## Provider Verification Matrix

| Flow | Expected product ID | Product type | Google Play status | Base plan status | RevenueCat product status | RevenueCat entitlement status | RevenueCat offering/package status | App config match | Activation status | Blocker | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Premium | `premium_subscription` | Subscription | Blocked by provider access | Blocked by provider access for base plan `monthly` or owner-approved equivalent | Blocked by provider access | Blocked by provider access for entitlement `premium` | Blocked by provider access for offering `premium` / package | Verified locally in `_lib/monetization.ts`, `_lib/sevenFlowSwitchboard.ts`, and webhook product checks | OFF | Owner/provider dashboard or API evidence required | Blocked by provider access |
| Tips | `cw_creator_tip_sandbox_099`; production product ID pending | Consumable unless provider confirms otherwise | Blocked by provider access | Not applicable | Blocked by provider access | Not applicable; tips unlock no durable access | Blocked by provider access if package is used | Verified locally as sandbox product; production ID is pending | OFF | Owner must verify/create production one-time product and RevenueCat product/package if used | Blocked by provider access |
| Paid Video | `cw_paid_content_access_sandbox_099`; production product ID pending | Consumable unless provider confirms otherwise | Blocked by provider access | Not applicable | Blocked by provider access | Not applicable; backend exact-target access grant is source of access | Blocked by provider access if package is used | Verified locally as sandbox product; production ID is pending | OFF | Owner must verify/create production one-time product and RevenueCat product/package if used | Blocked by provider access |
| Watch-Party Ticket | `cw_watch_party_live_ticket_sandbox_099`; production product ID pending | Consumable unless provider confirms otherwise | Blocked by provider access | Not applicable | Blocked by provider access | Not applicable; backend exact-room ticket/access grant is source of access | Blocked by provider access if package is used | Verified locally as sandbox product; production ID is pending | OFF | Owner must verify/create production one-time product and RevenueCat product/package if used | Blocked by provider access |
| Channel Subscription | `channel_subscription_sandbox_monthly_499:monthly`; production product/base plan pending | Subscription | Blocked by provider access | Blocked by provider access for production base plan | Blocked by provider access | Blocked by provider access for creator-channel subscription entitlement/mapping | Blocked by provider access for creator-channel package | Verified locally as sandbox product/base-plan candidate; production ID is pending | OFF | Owner must verify/create production subscription, base plan, RevenueCat product, entitlement/mapping, and package | Blocked by provider access |
| VIP | `cw_vip_pass_sandbox_499`; production product ID pending | Non-consumable unless provider confirms otherwise | Blocked by provider access | Not applicable | Blocked by provider access | Not applicable; backend exact-creator VIP grant/pass is source of access | Blocked by provider access if package is used | Verified locally as sandbox product; production ID is pending | OFF | Owner must verify/create production one-time product and RevenueCat product/package if used | Blocked by provider access |
| Event Pass | `cw_event_pass_sandbox_099`; production product ID pending | Consumable unless provider confirms otherwise | Blocked by provider access | Not applicable | Blocked by provider access | Not applicable; backend exact-event pass/access grant is source of access | Blocked by provider access if package is used | Verified locally as sandbox product; production ID is pending | OFF | Owner must verify/create production one-time product and RevenueCat product/package if used | Blocked by provider access |

## App Config Match Matrix

| Flow | Local product ID evidence | Entitlement/offering evidence | Switch evidence | Exact-target access evidence | Result |
| --- | --- | --- | --- | --- | --- |
| Premium | `_lib/monetization.ts`, `_lib/sevenFlowSwitchboard.ts`, `supabase/functions/revenuecat-webhook/index.ts` reference `premium_subscription` | `_lib/monetization.ts` maps offering `premium` and entitlement `premium`; webhook maps Premium only to `user_entitlements` | `premiumPurchaseEnabled=false`; Premium purchase shell hold remains | No creator grant created | Verified locally |
| Tips | `_lib/sevenFlowSwitchboard.ts`, creator monetization guards, and setup docs reference `cw_creator_tip_sandbox_099` | No durable access entitlement required | `tips_enabled=off`; `live_money_enabled=off` | Tips create no access | Verified locally for sandbox; production ID pending |
| Paid Video | `_lib/creatorPaidVideos.ts` and switchboard reference `cw_paid_content_access_sandbox_099` | No Premium entitlement mapping | `paid_content_enabled=off`; `live_money_enabled=off` | `paid_content_access` for one video/source | Verified locally for sandbox; production ID pending |
| Watch-Party Ticket | Switchboard and setup docs reference `cw_watch_party_live_ticket_sandbox_099` | No Premium entitlement mapping | `watch_party_tickets_enabled=off`; `live_money_enabled=off` | `watch_party_live_ticket` for one room/target | Verified locally for sandbox; production ID pending |
| Channel Subscription | `_lib/channelSubscriptions.ts` and switchboard reference `channel_subscription_sandbox_monthly_499:monthly` | Sandbox entitlement `creator_channel_subscription` documented; not Premium | `digital_sales_enabled=off`; `live_money_enabled=off` | One creator-channel subscription/effective access | Verified locally for sandbox; production ID pending |
| VIP | Switchboard/setup docs reference `cw_vip_pass_sandbox_499` | No Premium entitlement mapping | `digital_sales_enabled=off`; `live_money_enabled=off` | `vip_pass` for one creator | Verified locally for sandbox; production ID pending |
| Event Pass | Switchboard/setup docs reference `cw_event_pass_sandbox_099` | No Premium entitlement mapping | `digital_sales_enabled=off`; `live_money_enabled=off` | `event_pass` for one event | Verified locally for sandbox; production ID pending |

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

- Is Premium product present? Blocked by provider access for current production verification.
- Is Premium base plan/subscription ready? Blocked by provider access for base plan `monthly` or owner-approved equivalent.
- Is RevenueCat Premium entitlement mapped? Blocked by provider access for current verification; local app expects entitlement `premium`.
- Is offering/package ready? Blocked by provider access for current verification; local app expects offering `premium`.
- Does app config match? Verified locally for `premium_subscription`, offering `premium`, and entitlement `premium`.
- Can Premium remain OFF until owner activation? Yes. `premiumPurchaseEnabled=false` and Premium purchase shell hold remain in source.
- Exact owner action before turning Premium on: verify Google Play subscription/base plan, RevenueCat product, entitlement, offering/package, pricing, restore/manage/cancel behavior, support owner, monitoring owner, rollback owner, and then approve a Premium-only activation lane.
- Proof required before Premium launch: Play-installed smoke for offer load, purchase sheet opening under owner-approved switch, provider result, active entitlement readback, restore/manage/cancel, revoke/expiration readback, no creator-product unlock, and rollback.

## Creator-Money Provider Readiness

| Flow | Product present? | Correct type? | RevenueCat mapping present? | Access mapping safe? | Payouts off? | Switch off? | Exact blocker | Future activation proof needed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tips | Blocked by provider access | Blocked by provider access | Blocked by provider access | Yes, no access grant | Yes | Yes | Production product/mapping not verified | Controlled Play-installed tip with no access grant and no payout side effect |
| Paid Video | Blocked by provider access | Blocked by provider access | Blocked by provider access | Yes, exact video/source | Yes | Yes | Production product/mapping not verified | Exact video unlock, other-video denial, revoke/readback |
| Watch-Party Ticket | Blocked by provider access | Blocked by provider access | Blocked by provider access | Yes, exact room/target | Yes | Yes | Production product/mapping not verified | Exact room ticket, other-room denial, no LiveKit authority, revoke/readback |
| Channel Subscription | Blocked by provider access | Blocked by provider access | Blocked by provider access | Yes, exact creator channel | Yes | Yes | Production subscription/base plan/product/mapping not verified | Subscription lifecycle, effective access, cancellation/expiration/revoke |
| VIP | Blocked by provider access | Blocked by provider access | Blocked by provider access | Yes, exact creator | Yes | Yes | Production product/mapping not verified | Exact creator VIP, other-creator denial, ownership/revoke/readback |
| Event Pass | Blocked by provider access | Blocked by provider access | Blocked by provider access | Yes, exact event | Yes | Yes | Production product/mapping not verified | Exact event pass, other-event denial, canceled/expired/revoke |

## Owner Action List

| Flow | Owner action |
| --- | --- |
| Premium | Owner must verify Google Play subscription `premium_subscription`, base plan `monthly` or approved equivalent, RevenueCat product, entitlement `premium`, offering/package, pricing, restore/manage/cancel behavior, and approve a later activation decision. |
| Tips | Owner must create or verify a production Google Play one-time product, confirm consumable behavior, map/import it in RevenueCat if used, create package/offering if the app surface uses one, confirm pricing, approve activation, and run controlled live proof later. |
| Paid Video | Owner must create or verify a production Google Play one-time product, confirm consumable behavior, map/import it in RevenueCat if used, create package/offering if needed, confirm pricing, approve activation, and run controlled exact-target proof later. |
| Watch-Party Ticket | Owner must create or verify a production Google Play one-time product, confirm consumable behavior, map/import it in RevenueCat if used, create package/offering if needed, confirm pricing, approve activation, and run controlled same-room proof later. |
| Channel Subscription | Owner must create or verify production Google Play subscription/base plan, map/import it in RevenueCat, create/verify creator-channel entitlement/mapping and offering/package, confirm pricing, approve activation, and run controlled lifecycle proof later. |
| VIP | Owner must create or verify a production Google Play one-time product, confirm non-consumable or provider-confirmed behavior, map/import it in RevenueCat if used, create package/offering if needed, confirm pricing, approve activation, and run controlled exact-creator proof later. |
| Event Pass | Owner must create or verify a production Google Play one-time product, confirm consumable behavior, map/import it in RevenueCat if used, create package/offering if needed, confirm pricing, approve activation, and run controlled exact-event proof later. |

No flow currently has `No owner action needed`.

## Provider Verification Input

If dashboard/API verification is performed manually, save a sanitized JSON file outside the repo and run:

```sh
npm run proof:seven-flow-provider-verification -- --provider-input /tmp/provider-verification.json
```

The input must contain only sanitized status values and product IDs. It must not include provider secrets, private screenshots, customer data, tokens, keys, signed URLs, proof passwords, local env values, or raw provider payloads.

Allowed status values are `Verified`, `Pending provider verification`, `Missing`, `Mismatch`, `Blocked by provider access`, `Blocked by owner action`, and `Not applicable`.
