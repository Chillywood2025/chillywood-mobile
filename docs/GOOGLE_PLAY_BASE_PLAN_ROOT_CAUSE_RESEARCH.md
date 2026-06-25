# Google Play Base Plan Root Cause Research

Date: 2026-06-25

Verdict: Blocked.

This research-only lane investigates the shared Google Play subscription base-plan blocker affecting Premium annual and Creator Channel Subscription. No provider dashboard mutation was performed. No product, base plan, offer, RevenueCat mapping, switch, payout, Stripe, merch, refund, or purchase behavior was changed.

Premium monthly: Verified. Premium annual: Provider-blocked pending Google Play support/base-plan resolution. Creator Channel Subscription: Provider-blocked pending Google Play support/base-plan resolution. Premium public activation remains OFF. Creator-money switches remain OFF. `live_money_enabled` remains OFF. Creator payouts remain OFF. Stripe payout/merch remains OFF. Provider refunds remain manual/external. No creator-money product maps to Premium.

## Executive Finding

The most likely cause is a Google Play Console provider-side validation/backend state blocker affecting subscription base-plan creation for this app, not an app-code issue, RevenueCat dependency, or invalid base-plan ID format.

The strongest evidence is that multiple valid-format base-plan IDs remain invalid across two unrelated subscription contexts:

- `premium_subscription`, a mature subscription with an existing Active monthly base plan, rejects valid annual IDs such as `annual`, `yearly`, and `annual-9999`.
- `cw_channel_subscription_monthly_499`, a newer subscription product with no base plan, rejects valid monthly IDs such as `monthly`, `monthly-499`, `creator-monthly`, and `m-499`.

Both failures happen before a saved Google Play base plan exists, and both align with the same visible Play Console symptom: the Base plan ID field remains invalid or the form returns `Your changes couldn't be saved`.

## Official Source Findings

| Source | Relevant finding | Impact |
| --- | --- | --- |
| Google Play Console Help: create and manage subscriptions/base plans | Base plan IDs must be unique within a subscription, cannot be changed or reused after activation, must start with a number or lowercase letter, and may contain lowercase letters, numbers, and hyphens. | All tested target IDs comply with the documented format. |
| Google Play Console Help: understanding subscriptions | A subscription can contain multiple base plans; base plans define billing period, renewal type, and price; a single subscription can have multiple plans such as monthly and annual. | Premium annual under `premium_subscription` is a valid product model. |
| Google Play Console Help: subscriptions/base plans | A subscription needs at least one base plan to be available. Base plans can exist as Draft, Inactive, or Active. | Creator Channel Subscription correctly remains unavailable until a base plan exists. |
| Google Play Console Help: payments profile | Selling paid apps or in-app purchases requires a payments center profile linked to Play Console. | Merchant/payment profile should be verified by the owner/admin, but existing Premium monthly and one-time drafts reduce confidence that this is the direct blocker. |
| Google Play tax/compliance documentation | Subscriptions and in-app products may require tax/compliance product information. | Hidden tax/compliance requirements remain possible, but read-only dashboard evidence did not show an explicit tax/compliance blocker. |
| Google Play product catalog API docs | Play product catalogs can be managed via Play Console or Google Play Developer API. Subscription endpoints can manage subscriptions/base plans/offers. | A future owner-approved read-only API check could confirm hidden backend state without using the Console UI. |
| Google Play Developer API `monetization.subscriptions.list` | API can list subscription resources for a package using Android Publisher authorization. | Read-only API access could verify whether hidden draft/ghost base plans exist. |
| RevenueCat Android products docs | RevenueCat Google Play subscription products map to base plans and use identifiers like `<subscription_id>:<base-plan-id>` for newly configured products. | RevenueCat annual/channel mapping is blocked until Google Play base plans exist. RevenueCat is not the source of the Play Console ID validation failure. |

Source URLs:

- https://support.google.com/googleplay/android-developer/answer/140504
- https://support.google.com/googleplay/android-developer/answer/12154973
- https://support.google.com/googleplay/android-developer/answer/3092739
- https://support.google.com/googleplay/android-developer/answer/10463498
- https://developer.android.com/google/play/billing/manage-catalog
- https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions/list
- https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions.basePlans
- https://www.revenuecat.com/docs/getting-started/entitlements/android-products

## Read-Only Dashboard Observation Summary

No Save, Create, Apply, Activate, Submit, purchase, refund, RevenueCat mapping, or provider mutation action was taken during this research-only lane.

| Area | Observation | Interpretation |
| --- | --- | --- |
| Google Play monetization setup | Read-only inspection showed monetization setup and subscription settings pages accessible. No visible payment profile, merchant, tax, warning, error, action-required, permission-denied, or base-plan-specific alert was observed in the readback. | No obvious global monetization setup blocker was visible. This does not rule out a hidden merchant/tax/backend limitation. |
| Google Play users/permissions | Users and permissions page was accessible, with manage-user and permission UI visible. No visible `denied`, `not authorized`, or permission error was observed. | No visible role blocker was observed. Exact monetization/base-plan edit permission still needs owner/admin confirmation. |
| Premium subscription parent | Prior read-only dashboard evidence showed `premium_subscription` has saved parent details, tax/policy settings `Digital app sales` / `Service`, and Active monthly base plan `monthly`, United States, USD 9.99/month. | Premium product state is not obviously incomplete. Annual failure is not explained by missing parent details alone. |
| Premium annual form | Valid-format IDs `annual`, `yearly`, and `annual-9999` stayed invalid; the form also produced `Your changes couldn't be saved`. | Strong evidence for provider-side field validation/backend state issue. |
| Creator Channel Subscription parent | Prior read-only dashboard evidence showed product `cw_channel_subscription_monthly_499` exists with 0 base plans; tax/policy settings show `Digital app sales` / `Service`; benefits are recommended but not proven required for ID validation. | Product exists but cannot create its first base plan. |
| Creator Channel base-plan form | Valid-format IDs `monthly`, `monthly-499`, `creator-monthly`, `m-499`, and earlier probes `m1` / `1monthly` stayed invalid before Save. | Not explained by a single duplicate ID or hidden character in `monthly`. |
| RevenueCat | Prior dashboard evidence showed `premium_subscription:monthly` present and mapped to `premium`; `premium_subscription:annual` and `cw_channel_subscription_monthly_499:monthly` absent because Google Play base plans do not exist. | RevenueCat is blocked downstream, not the root cause. |

## Root Cause Hypothesis Matrix

| Hypothesis | Evidence for | Evidence against | Source/doc support | Read-only dashboard observations | Confidence | Recommended next action | Owner action required? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Google Play Console provider-side bug or backend state blocker | Multiple valid-format IDs fail across two subscription products; one product is mature with an Active monthly base plan, while the other is new with no base plan; visible error is generic and not tied to an owner decision field. | Google has not confirmed backend state yet. | Google docs say the tested IDs are valid and a subscription can have multiple base plans. | Base plan ID remains invalid for compliant IDs; no visible permission/tax error. | High | Send support packet and ask Google to inspect backend subscription/base-plan state. | Yes |
| Hidden draft/ghost base-plan conflict | Failed draft attempts may have left hidden UI/backend state; multiple valid IDs fail even when no visible base plan exists. | Different valid IDs fail on the same form, so it is unlikely to be a single reserved ID. | Google docs say IDs cannot be changed/reused after activation, but do not document hidden failed-draft reservation behavior. | No visible hidden base-plan entries were found from read-only dashboard inspection. | Medium | Ask Google whether hidden failed drafts exist and whether they can clear backend draft state. Consider owner-approved read-only API list/get. | Yes |
| Role/permission limitation | A user might view product forms but lack exact monetization/base-plan save rights; Google Play/API docs distinguish permission surfaces. | Parent pages expose Add base plan; users/permissions page is accessible; no permission-denied message appeared. | Google Play user/permission docs define app/account-level permissions. API setup may require specific permissions for billing/catalog operations. | No visible permission denial. Exact edit role was not conclusively proven. | Medium | Owner/admin should confirm exact monetization/base-plan/pricing permissions; include in Google support request. | Yes |
| Merchant/payments profile incomplete | Google docs require a payments profile to sell paid apps/IAP; hidden merchant setup can block monetized products. | Premium monthly is Active and one-time products were draft-created; no visible payments profile warning was seen in monetization setup readback. | Google Play payments profile docs say a payments profile is required for paid apps/IAPs. | No visible merchant/payment alert, but payments page was not conclusively inspected. | Medium-Low | Owner/admin should verify payment profile/tax setup in Play Console/Payments Center; ask Google to confirm no hidden merchant limitation. | Yes |
| Tax/compliance incomplete | Google docs say subscriptions/IAP may require tax/compliance product info; hidden tax state can block monetized product saves. | Parent products show `Digital app sales` / `Service`; no tax/compliance prompt or owner-stop field was visible; Premium monthly is Active. | Google Play tax/compliance docs support that tax/compliance can be required. | No visible tax/compliance blocker in read-only dashboard. | Medium-Low | Ask Google whether hidden tax/compliance state can make valid base-plan IDs invalid. Owner should verify tax/compliance settings. | Yes |
| Parent subscription product incomplete | Creator Channel Subscription has no benefits displayed and setup recommends benefits; product-level required fields could block base plan save. | Premium parent appears complete and still fails for annual; Google docs/examples discuss benefits but the failing field is Base plan ID. | Google docs define subscription benefits and base plans separately. | Premium parent complete; Creator benefits recommended. | Low | Owner may add benefits later if Google says required, but this is unlikely to explain both products. | Possibly |
| Region/pricing order issue | Pricing/availability are part of base-plan setup; US-only narrowing might interact with price save. | Base plan ID is invalid before Save and persists across ID-only probes; pricing reached target values in prior forms. | Google docs define regional availability/pricing as base-plan fields and note US parent region handling. | US pricing was visible in prior forms; no explicit regional validation error. | Low | In a future owner-approved retry, follow a controlled order: ID, type, period, US-only, price, then save. | Yes |
| Browser/session/UI cache issue | Generic `Your changes couldn't be saved` can happen in stale dashboard forms; browser/session problems can cause false UI validation. | Clean forms and stale forms reproduced earlier; both products affected. No retry is allowed in this research lane. | Public reports sometimes mention browser/session fixes, but official docs do not identify this exact symptom. | Read-only dashboard access works; no mutation attempted. | Medium-Low | Future owner-approved retry can use incognito/new browser profile after confirming permissions/payment/tax. | Yes |
| Developer API readback needed | API can list/manage subscriptions/base plans and may expose hidden backend state that UI hides. | API access requires owner-approved credentials/permissions; this lane did not use API credentials. | Google product catalog and Android Publisher API docs support subscription/base-plan management through API. | Dashboard only gives visible UI state. | Medium as next diagnostic, not root cause | Owner-approved read-only `monetization.subscriptions.list/get` and base-plan state inspection. Do not mutate. | Yes |
| RevenueCat dependency misunderstanding | RevenueCat annual/channel products are missing. | RevenueCat cannot create Google Play base plans; Google Play base plan must exist first. | RevenueCat docs say Android subscription products map to Google Play base plans and use `<subscription_id>:<base-plan-id>`. | RevenueCat monthly Premium exists; absent products match absent Google Play base plans. | Low / ruled out as root cause | Keep RevenueCat follow-up blocked until Google Play base plans exist. | No |

## Most Likely Cause Ranking

1. High confidence: Google Play provider-side UI/backend state validation blocker for subscription base-plan creation.
2. Medium confidence: hidden draft/ghost base-plan state or backend concurrency/state corruption that is not visible in the Console.
3. Medium confidence: exact account role/permission limitation that lets the user view/edit forms but not complete base-plan validation/save.
4. Medium-low confidence: merchant/payments profile or tax/compliance limitation hidden from the visible product pages.
5. Low confidence: parent product benefit/detail incompleteness.
6. Low confidence: region/pricing order issue.
7. Low confidence as root cause, but useful as a diagnostic path: browser/session/UI cache.
8. Ruled out as root cause: RevenueCat configuration. RevenueCat is downstream of the missing Google Play base plans.

## Future Action Plan

### Safe Owner Dashboard Retry Checklist

Do not execute this checklist without an owner-approved retry lane.

1. Confirm the Google Play user has monetization/subscription/base-plan/pricing edit permissions.
2. Confirm the payments profile, tax/compliance, and merchant setup have no hidden action-required status.
3. Open Play Console in a clean browser profile or incognito window.
4. Confirm `premium_subscription` parent details and active monthly base plan remain unchanged.
5. Attempt a single annual base-plan save using approved values: `annual`, auto-renewing, yearly, United States only, USD 99.99/year.
6. Confirm `cw_channel_subscription_monthly_499` parent details.
7. Attempt a single channel base-plan save using approved values: `monthly`, auto-renewing, monthly, United States only, USD 4.99/month.
8. Stop immediately if any legal/tax/rating/merchant/publishing field appears or if the Base plan ID field is invalid before Save.

### Google Play Support Path

1. Send the updated support packet in `docs/GOOGLE_PLAY_SUBSCRIPTION_BASE_PLAN_ESCALATION.md`.
2. Ask Google to inspect backend state for `premium_subscription` and `cw_channel_subscription_monthly_499`.
3. Ask Google to confirm whether hidden merchant/tax/permission constraints can surface as invalid base-plan IDs.
4. Ask Google whether failed Add base plan drafts can create hidden conflicts.
5. Ask Google whether the products should be recreated or repaired.

### Developer API Read-Only Path

Do not execute without owner-approved API credentials/access.

1. Use Android Publisher API read-only/list calls to inspect subscriptions for `com.chillywood.mobile`.
2. Confirm whether `premium_subscription` contains any hidden/draft annual base plan.
3. Confirm whether `cw_channel_subscription_monthly_499` contains any hidden/draft monthly base plan.
4. Do not create, update, delete, activate, deactivate, or migrate prices through the API in a read-only lane.

### Fallback Product Strategy

Do not execute without owner approval and Google guidance.

- Premium: avoid replacing `premium_subscription` unless Google confirms the product state is corrupted. Existing Premium monthly is verified and tied to that subscription.
- Creator Channel Subscription: if Google confirms the product is corrupted, owner can approve a replacement product such as `cw_channel_subscription_499` or `cw_creator_channel_subscription_499`.

## Current Blockers

| Blocker | Impact | Owner/provider action |
| --- | --- | --- |
| Premium annual base plan missing | Premium launch remains blocked because owner wants monthly and annual before launch. | Google Play support or owner-approved dashboard/API diagnostic. |
| Creator Channel Subscription base plan missing | Creator Channel Subscription cannot be activated or imported into RevenueCat production mapping. | Google Play support or owner-approved dashboard/API diagnostic. |
| RevenueCat annual/channel products missing | RevenueCat cannot map products that do not exist in Google Play. | Import/map after Google Play base plans exist. |

## Safety Confirmation

- No provider dashboard mutation.
- No Premium public activation.
- No creator-money switches enabled.
- No `live_money_enabled`.
- No payouts, payable balances, withdrawals, cash-out, transfers, payout batches, Stripe Connect, or merch checkout.
- No provider refunds.
- No Premium product, pricing, entitlement, offering, or RevenueCat mapping change.
- No creator-money product, price, purchase option, base plan, or mapping change.
- No RLS weakening.
- No LiveKit authority loosening.
- No auth/reset weakening.
- No scan-gate weakening.
- No abuse-throttle removal.
- No block-enforcement weakening.
- No secrets, private dashboard screenshots, tax IDs, bank details, customer data, tokens, signed URLs, local env files, or proof passwords added.
