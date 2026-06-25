# Google Play Subscription Base Plan Escalation

Date: 2026-06-25

Verdict: Blocked.

This lane investigates the shared Google Play subscription base-plan blocker affecting Premium annual and Creator Channel Subscription. It does not activate Premium, creator-money, live money, payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, or provider refund automation.

Premium monthly: Verified. Premium annual: Provider-blocked pending Google Play support/base-plan resolution. Creator Channel Subscription: Provider-blocked pending Google Play support/base-plan resolution. Premium public activation remains OFF. Creator-money switches remain OFF. Creator payouts remain OFF. Stripe payout/merch remains OFF. Provider refunds remain manual/external. No creator-money product maps to Premium. Support escalation packet prepared.

Research update: `docs/GOOGLE_PLAY_BASE_PLAN_ROOT_CAUSE_RESEARCH.md` ranks the most likely cause as a Google Play Console provider-side UI/backend state validation blocker, with hidden draft/base-plan state and hidden permission/merchant/tax constraints as secondary possibilities that require owner/admin or Google Support confirmation. The research update was read-only and did not retry saving any form.

API research update: `docs/GOOGLE_PLAY_BASE_PLAN_API_READONLY_RESEARCH.md` documents that Google Play Developer API readback could not run with local credentials. The default local `gcloud` token produced a sanitized `403 PERMISSION_DENIED` / `Request had insufficient authentication scopes` response for the read-only subscriptions list request. No API mutation call was run. Hidden/ghost base-plan state remains unconfirmed until the owner provides Android Publisher API credentials with the required scope or Google Support checks backend state.

## Official Provider Rules Checked

- Google Play subscriptions are composed of subscription products, base plans, and offers. Source: https://support.google.com/googleplay/android-developer/answer/12154973
- Google Play base plan IDs must be unique within a subscription, cannot be changed or reused after activation, must start with a number or lowercase letter, and may contain numbers, lowercase letters, and hyphens. Source: https://support.google.com/googleplay/android-developer/answer/140504
- Google Play Billing models subscription purchase options through base plans and offers. Source: https://developer.android.com/google/play/billing/subscriptions
- RevenueCat Android subscription product identifiers for newly configured Google Play products use `<subscription_id>:<base-plan-id>`. Source: https://www.revenuecat.com/docs/getting-started/entitlements/android-products
- RevenueCat offerings are dashboard-managed product groups for display, and entitlements are the access readback concept. Sources: https://www.revenuecat.com/docs/offerings/overview and https://www.revenuecat.com/docs/getting-started/entitlements

## Provider Evidence Summary

Browser dashboard evidence was collected from Google Play Console for package `com.chillywood.mobile` and RevenueCat project `Chi'llywood`.

No private dashboard screenshots, provider account private identifiers, provider secrets, tax IDs, bank details, customer data, tokens, signed URLs, local env files, or proof passwords were saved in the repo.

## Premium Annual Investigation Matrix

| Area | Finding | Action taken | Status |
| --- | --- | --- | --- |
| Product state | Google Play subscription `premium_subscription` exists. Parent product details are saved with Product ID `premium_subscription`, benefits `Premium live access`, `Creator platform tools`, and `Ad-free viewing`, and tax/policy settings `Digital app sales` / `Service`. | Read-only parent product inspection. | Product exists / parent complete |
| Existing base plans | Base plan `monthly` exists, is Monthly auto-renewing, United States, Active, last updated May 15, 2026. | Read-only parent product inspection. | Premium monthly verified |
| Target base plan | Target remains `annual`, Yearly auto-renewing, United States only, `USD 99.99/year`. | Reopened existing Add base plan tab; no public activation. | Target approved / unsaved |
| Base-plan ID behavior | `annual` is 6 characters and matches Google Play's documented format, but the `Base plan ID field` remains `aria-invalid=true`. Valid-format non-saving probes `annual`, `yearly`, and `annual-9999` all stayed invalid. | Filled only the Base plan ID field for non-saving validation probes, then restored `annual`. No Save submitted. | Provider UI/state blocker |
| Base-plan type | Auto-renewing is selected and visible. | Read-only form inspection. | Pass |
| Billing period | Yearly is visible as the selected billing period. | Read-only form inspection. | Pass |
| Grace/account hold | Google Play visible default is 14-day grace period and calculated 46-day account hold. | Read-only form inspection; no custom lifecycle settings changed. | Pass |
| Region/pricing | Existing failed draft form shows United States `USD 99.99` and no VAT with location overrides. | Read-only form inspection. | Target values reached but unsaved |
| Hidden validation messages | Visible field-level instruction repeats the documented valid ID format; no separate hidden required field was visible in the form readback. | DOM/form state inspection. | Blocked at Base plan ID/save |
| Exact visible error | Existing form still shows `Your changes couldn't be saved`. | Read-only error readback. | Blocked |
| Role/permission signs | Parent product exposes enabled `Add base plan` and `Add offer` buttons; no visible permission denial appeared. | Read-only parent product inspection. | No visible permission blocker |

## Creator Channel Subscription Investigation Matrix

| Area | Finding | Action taken | Status |
| --- | --- | --- | --- |
| Product state | Google Play subscription product `cw_channel_subscription_monthly_499` / `Creator Channel Subscription` exists. Parent page shows setup tasks and Product ID `cw_channel_subscription_monthly_499`; tax/policy settings are `Digital app sales` / `Service`. | Read-only parent product inspection. | Product exists |
| Existing base plans | Parent page says the subscription needs at least 1 base plan. No active base plan exists. | Read-only parent product inspection. | Missing base plan |
| Parent details completeness | Parent task list recommends adding subscription benefits and requires a base plan before offers/activation. Benefits are displayed as `-`, which appears recommended rather than the field-level Base plan ID blocker. | Read-only parent product inspection. | Benefits recommended / not proven root cause |
| Target base plan | Target remains `monthly`, Monthly auto-renewing, United States only, `USD 4.99/month`. | Reopened existing Add base plan tab; no public activation. | Target approved / unsaved |
| Base-plan ID behavior | `monthly` is 7 characters and matches Google Play's documented format, but the `Base plan ID field` remains `aria-invalid=true`. Valid-format non-saving probes `monthly`, `monthly-499`, `creator-monthly`, and `m-499` all stayed invalid. Prior probes `m1` and `1monthly` also stayed invalid. | Filled only the Base plan ID field for non-saving validation probes, then restored `monthly`. No Save submitted. | Provider UI/state blocker |
| Base-plan type | Auto-renewing is selected and visible. | Read-only form inspection. | Pass |
| Billing period | Monthly is visible as the selected billing period. | Read-only form inspection. | Pass |
| Grace/account hold | Google Play visible default is 7-day grace period and calculated 53-day account hold. | Read-only form inspection; no custom lifecycle settings changed. | Pass |
| Region/pricing | Existing failed draft form shows United States `USD 4.99` and no VAT with location overrides. | Read-only form inspection. | Target values reached but unsaved |
| Hidden validation messages | Visible field-level instruction repeats the documented valid ID format; no separate hidden required field was visible in the form readback. | DOM/form state inspection. | Blocked at Base plan ID/save |
| Exact visible error | Existing form still shows `Your changes couldn't be saved`. | Read-only error readback. | Blocked |
| Role/permission signs | Parent product exposes enabled `Add base plan`; no visible permission denial appeared. | Read-only parent product inspection. | No visible permission blocker |

## Comparison Matrix

| Row | Premium annual | Creator Channel Subscription | Interpretation |
| --- | --- | --- | --- |
| Parent product | Saved and complete; monthly base plan Active. | Saved product record; benefits recommended; no base plan. | The blocker affects both a mature subscription and a new subscription, so it is not explained only by missing benefits. |
| Existing base plans | `monthly` Active. | None. | Premium proves this account/app can have at least one valid base plan. |
| Add base-plan action | Enabled. | Enabled. | No visible role denial at the parent page. |
| Base-plan ID field | `annual` invalid despite matching documented format. | `monthly` invalid despite matching documented format. | Shared ID validation/provider state issue. |
| Valid ID probes | `annual`, `yearly`, `annual-9999` invalid. | `monthly`, `monthly-499`, `creator-monthly`, `m-499` invalid. | Not a single duplicate/ghost ID. |
| Billing period | Yearly visible. | Monthly visible. | Billing period selector is not the failing field. |
| Pricing/region | United States `USD 99.99`. | United States `USD 4.99`. | Target pricing reached in stale forms but could not save. |
| Visible error | `Your changes couldn't be saved`. | `Your changes couldn't be saved`. | Shared Google Play save/state failure. |

## Valid ID Probe Matrix

| Product | Probe ID | Expected by Google format | Dashboard result | Status |
| --- | --- | --- | --- | --- |
| `premium_subscription` | `annual` | Valid format | `aria-invalid=true` | Blocked |
| `premium_subscription` | `yearly` | Valid format | `aria-invalid=true` | Blocked |
| `premium_subscription` | `annual-9999` | Valid format | `aria-invalid=true` | Blocked |
| `cw_channel_subscription_monthly_499` | `monthly` | Valid format | `aria-invalid=true` | Blocked |
| `cw_channel_subscription_monthly_499` | `monthly-499` | Valid format | `aria-invalid=true` | Blocked |
| `cw_channel_subscription_monthly_499` | `creator-monthly` | Valid format | `aria-invalid=true` | Blocked |
| `cw_channel_subscription_monthly_499` | `m-499` | Valid format | `aria-invalid=true` | Blocked |

## Role / Permission Matrix

| Permission area | Visible evidence | Status |
| --- | --- | --- |
| Create subscription base plans | Parent pages expose enabled `Add base plan` buttons. | No visible permission denial |
| Save pricing | Add-base-plan forms expose `Set prices`, pricing table, and enabled `Save`; prior submitted forms reached target pricing. | No visible permission denial; save still fails |
| Activate/deactivate plans | No activation action was attempted. Parent task text says activation requires at least one base plan. | Not attempted |
| Edit monetization products | Parent subscription pages and Add base plan forms are accessible. | Appears available |
| Tax/compliance settings | Parent pages show `Digital app sales` / `Service`; no new tax/legal certification prompt appeared. | No visible owner-stop field in this lane |

## Safe Alternate Paths Tried

1. Existing stale Add base-plan tabs were inspected without saving.
2. Parent subscription pages were opened directly for both affected products.
3. Valid-format base-plan IDs were tested only in the ID field, without saving.
4. Approved IDs were restored after probes.
5. No product was activated, no public purchase flow was enabled, no purchase was completed, and no RevenueCat mapping was changed.

## Alternate Paths Not Taken

- Recreating `premium_subscription` was not attempted because the active monthly production Premium product is tied to that subscription.
- Recreating `cw_channel_subscription_monthly_499` was not attempted because replacement product IDs require owner approval and would need a separate provider setup lane.
- Archive/delete paths were not attempted.
- Google Play support contact was not submitted by Codex.
- RevenueCat import was not attempted for absent Google Play base plans.

Possible future replacement IDs to consider only after owner approval and Google Play guidance:

- Premium annual: keep under `premium_subscription` if possible. If Google Play support says the product state is corrupted, owner must decide the migration risk because monthly production Premium is already tied to `premium_subscription`.
- Creator Channel Subscription replacement: `cw_channel_subscription_499` or `cw_creator_channel_subscription_499`.

## RevenueCat Follow-Up Matrix

| Flow | Expected RevenueCat product | Current RevenueCat state | Required follow-up | Status |
| --- | --- | --- | --- | --- |
| Premium monthly | `premium_subscription:monthly` | Present, Published, entitlement `premium`, offering `premium` package `$rc_monthly`. | Preserve unchanged. | Verified |
| Premium annual | `premium_subscription:annual` | Missing because Google Play annual base plan does not exist. | After Google Play annual exists, import/map only to entitlement `premium` and offering `premium` as `$rc_annual` or RevenueCat's annual package equivalent. | Blocked |
| Creator Channel Subscription | `cw_channel_subscription_monthly_499:monthly` | Missing because Google Play monthly base plan does not exist. | After Google Play base plan exists, import/map only to `creator_channel_subscription` or direct-product fallback; never map to `premium`. | Blocked |
| Creator one-time products | `cw_creator_tip_099`, `cw_paid_content_access_099`, `cw_watch_party_ticket_099`, `cw_vip_pass_499`, `cw_event_pass_099` | Present as Draft consumables with no entitlement attachment. | Preserve read-only/off-state until future owner activation lane. | Verified / OFF |

## Google Play Support Escalation Packet

Subject: Base plan ID validation/save failure for valid subscription base-plan IDs in `com.chillywood.mobile`

App package: `com.chillywood.mobile`

Affected products:

1. `premium_subscription`
   - Existing base plan: `monthly`
   - Existing base-plan status: Active
   - Existing price/region: United States, `USD 9.99/month`
   - Target base plan: `annual`
   - Target period/price/region: Yearly, United States only, `USD 99.99/year`
   - Observed issue: valid base-plan IDs such as `annual`, `yearly`, and `annual-9999` remain marked invalid in the Base plan ID field, and the form shows `Your changes couldn't be saved`.

2. `cw_channel_subscription_monthly_499`
   - Product exists: yes
   - Existing base plans: none
   - Target base plan: `monthly`
   - Target period/price/region: Monthly, United States only, `USD 4.99/month`
   - Observed issue: valid base-plan IDs such as `monthly`, `monthly-499`, `creator-monthly`, and `m-499` remain marked invalid in the Base plan ID field, and the form shows `Your changes couldn't be saved`.

Observed behavior:

- Valid base plan IDs that comply with Google Play's documented ID format are marked invalid before save.
- Valid-format probes across two different subscription products reproduce the failure.
- A mature subscription product with an active monthly base plan (`premium_subscription`) and a newer subscription product with no base plan (`cw_channel_subscription_monthly_499`) both reproduce the same issue.
- Parent pages expose enabled Add base plan controls and no visible permission-denied message.
- Tax/policy settings visible on both parent products show `Digital app sales` / `Service`.

Expected behavior:

- Google Play should accept base plan IDs that start with a number or lowercase letter and contain only lowercase letters, numbers, and hyphens, when the IDs are unique within the subscription.
- The base plan should be savable as a draft/configured plan without public app purchase activation until the owner activates the plan later.

What was not changed:

- No app activation switches were enabled.
- No Premium public activation occurred.
- No creator-money switches were enabled.
- No purchases were completed.
- No public purchase flow was activated.
- No payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, or provider refunds were enabled.
- RevenueCat monthly Premium mapping was not changed.
- No creator-money product maps to Premium.

Questions for Google Support:

1. Is there a hidden required subscription/product field blocking base-plan creation for these products?
2. Is there a permission, merchant-account, payment profile, or monetization-account limitation causing the Base plan ID field to stay invalid?
3. Is either subscription product state corrupted?
4. Is there a hidden draft/ghost base plan conflict for these base-plan IDs?
5. Is this a Play Console UI validation bug?
6. Should either product be recreated, and what are the risks for the active `premium_subscription:monthly` product if Premium remains under the same subscription?
7. Can Google clear stale failed draft state for the affected Add base plan forms?
8. Can Google inspect backend subscription/base-plan state for `premium_subscription` and `cw_channel_subscription_monthly_499` and confirm whether any hidden draft/base-plan objects exist?
9. Can Google confirm whether a hidden merchant, tax/compliance, or permission issue can make valid base-plan IDs appear invalid before Save?
10. Would Android Publisher API readback show the hidden state causing this issue, and is read-only API inspection recommended before any product recreation?
11. Does a `403 PERMISSION_DENIED` / insufficient authentication scopes result on `monetization.subscriptions.list` indicate that the current API user/service account lacks Android Publisher scope only, or can it also indicate missing Play Console monetization/catalog permissions?
12. Which exact Play Console role/API permissions should be granted for read-only subscription/base-plan catalog inspection without mutation rights?

Most likely root cause ranking from research:

1. Google Play provider-side UI/backend state validation blocker.
2. Hidden draft/ghost base-plan state or backend product-state conflict.
3. Exact account role/permission limitation not visible in the form.
4. Hidden merchant/payments profile or tax/compliance limitation.
5. Parent product detail incompleteness.
6. Region/pricing order issue.
7. Browser/session UI cache issue.
8. RevenueCat dependency: ruled out as root cause because RevenueCat cannot create Google Play base plans.

Steps already tried:

- Read-only inspection of Play Console monetization setup and users/permissions pages.
- Read-only parent product inspection for `premium_subscription` and `cw_channel_subscription_monthly_499`.
- Prior non-saving Base plan ID validation probes using valid-format IDs across both affected products.
- Prior safe form attempts reached approved period/region/price values but failed with `Your changes couldn't be saved`.
- RevenueCat readback confirmed annual/channel subscription products remain absent because Google Play base plans do not exist.

Steps intentionally not tried without owner approval:

- No new Save/Create/Apply/Activate/Submit action.
- No provider product recreation, archive, delete, or replacement ID creation.
- No Android Publisher API mutation call.
- No support ticket submission by Codex.
- No RevenueCat mapping change.

API read-only result:

- Allowed read-only target: `GET /androidpublisher/v3/applications/com.chillywood.mobile/subscriptions`.
- Local default API auth result: `403 PERMISSION_DENIED` with sanitized message `Request had insufficient authentication scopes`.
- Scoped Android Publisher token attempt: blocked by local gcloud scope restrictions before a token was produced.
- No hidden/ghost base-plan state was confirmed or ruled out by API because authenticated Android Publisher readback was unavailable.
- Required next step: owner/admin provides Android Publisher API access with the required `https://www.googleapis.com/auth/androidpublisher` authorization or asks Google Support to inspect backend state directly.

## Owner Action List

1. Submit the support escalation packet to Google Play Console support.
2. Ask Google whether the account has all required monetization/base-plan permissions and whether the merchant/payment profile has any hidden limitation.
3. Ask Google to confirm whether the failed draft forms can be cleared or whether product recreation is required.
4. Do not activate Premium annual until Google Play saves the annual base plan and RevenueCat imports/maps `premium_subscription:annual`.
5. Do not activate Creator Channel Subscription until Google Play saves the monthly base plan and RevenueCat imports/maps `cw_channel_subscription_monthly_499:monthly` without Premium attachment.
6. Keep Premium monthly unchanged.
7. Keep creator-money switches OFF, live money OFF, payouts OFF, Stripe payout/merch OFF, and provider refunds manual/external.

## Switch / Off-State Proof

| Control | State | Evidence |
| --- | --- | --- |
| Premium public activation | OFF | `premiumPurchaseEnabled=false` and Premium purchase shell remains on hold in repo proof. |
| Creator-money switches | OFF | `tipsEnabled=false`, `paidContentCheckoutEnabled=false`, `channelSubscriptionEnabled=false`, `vipEnabled=false`, `eventPassEnabled=false`, and money switches remain off. |
| `live_money_enabled` | OFF | Runtime/money flags remain off. |
| Payouts/cash-out/withdrawals/transfers | OFF | Runtime/money flags and Money Center policy remain off. |
| Stripe payout/merch | OFF | Stripe remains future-only for payout and physical merch lanes. |
| Provider refunds | Manual/external | Docs and proof scripts keep refund execution external/manual. |
| Creator product to Premium mapping | None | RevenueCat dashboard readback shows creator one-time Draft products detached from Premium; Premium entitlement remains `premium_subscription:monthly` only. |

## Conclusion

The blocker is currently classified as a Google Play provider-side UI/state validation blocker, not an app-code blocker. The strongest evidence is that multiple valid-format base-plan IDs remain invalid across two different subscription products, including one mature subscription with an active monthly base plan. Owner/provider action is required before either Premium annual or Creator Channel Subscription can be completed.
