# Google Play Base Plan API Read-Only Research

Date: 2026-06-25

Verdict: Blocked.

This lane investigated whether Google Play Developer API read-only access can clarify the subscription/base-plan blocker affecting Premium annual and Creator Channel Subscription. No provider mutation was performed. No Google Play product, subscription, base plan, offer, price, RevenueCat mapping, switch, payout, Stripe, merch, refund, or purchase behavior was changed.

Premium monthly: Verified. Premium annual: Provider-blocked pending Google Play support/base-plan resolution. Creator Channel Subscription: Provider-blocked pending Google Play support/base-plan resolution. Premium public activation remains OFF. Creator-money switches remain OFF. `live_money_enabled` remains OFF. Creator payouts remain OFF. Stripe payout/merch remains OFF. Provider refunds remain manual/external. No creator-money product maps to Premium.

## Executive Finding

Google Play Developer API read-only access was not available with the local credentials in this environment. A default local `gcloud` access token was available, but the read-only subscription catalog request returned sanitized error status `403 PERMISSION_DENIED` with message `Request had insufficient authentication scopes.`

Because the API readback could not run with the required Android Publisher scope, this lane did not determine whether the missing base plans are truly absent, hidden/draft/ghosted, corrupted, archived, or invisible in the Console but visible by API. The most likely cause remains the prior classification: Google Play Console provider-side UI/backend state validation blocker, with hidden draft/base-plan state, permission, merchant/payment, and tax/compliance constraints still possible until owner-provided Android Publisher API access or Google Support confirms backend state.

## API Capability Summary

| Area | Finding | Source | Lane decision |
| --- | --- | --- | --- |
| Read subscription catalog | `monetization.subscriptions.list` can list subscriptions for a package. | Google Play Developer API `monetization.subscriptions.list`. | Allowed if authenticated with proper Android Publisher scope. |
| Read one subscription | `monetization.subscriptions.get` can read one subscription resource. | Google Play Developer API `monetization.subscriptions.get`. | Allowed if authenticated with proper Android Publisher scope. |
| Base plans in readback | Subscription resources include `basePlans[]`; each base plan includes `basePlanId`, `state`, `regionalConfigs`, and base-plan type. | Google Play Developer API `monetization.subscriptions` resource. | Expected readback path for hidden/draft/active/inactive base-plan state. |
| Base-plan states | Base plan states include `DRAFT`, `ACTIVE`, and `INACTIVE`; draft/inactive plans can be activated/deleted and active plans can be made inactive through dedicated endpoints. | Google Play Developer API `BasePlan` resource. | Useful for diagnosing hidden/draft state if API access is granted. |
| Base-plan ID rule | API resource says base-plan IDs are immutable, unique in the subscription, use lowercase letters, numbers, and hyphens, and are at most 63 characters. | Google Play Developer API `BasePlan` resource. | The blocked IDs remain valid by documented rules. |
| Base-plan resource methods | `monetization.subscriptions.basePlans` has no persistent resource data and provides mutation methods to activate, deactivate, delete, and migrate prices. | Google Play Developer API basePlans resource. | No basePlans mutation method was run. |
| Required OAuth scope | Google Play Developer API uses OAuth and Android Publisher authorization; API calls require access token authorization. | Google Play Developer API authorization docs. | Local credentials lacked the required Android Publisher scope. |
| RevenueCat dependency | RevenueCat Android subscription product identifiers use `<subscription_id>:<base-plan-id>`. | RevenueCat Android products docs. | RevenueCat remains blocked until Google Play base plans exist. |

Source URLs:

- https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions
- https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions/get
- https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions/list
- https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions.basePlans
- https://developers.google.com/android-publisher/authorization
- https://support.google.com/googleplay/android-developer/answer/140504
- https://www.revenuecat.com/docs/getting-started/entitlements/android-products

## API Access Status

| Check | Result | Sanitized evidence | Status |
| --- | --- | --- | --- |
| API credentials supplied by environment | No Android Publisher service-account or OAuth credential env var was present. | Only unrelated process/system env names were visible; no credential values were printed. | Unavailable |
| Repo credential search | No Android Publisher service-account JSON was found in the repo search. Firebase `google-services.json` files exist but are not Android Publisher API credentials. | File names only; file contents were not printed. | Unavailable |
| Local Google client libraries | `google-auth-library` and `googleapis` are not installed in local `node_modules`. | Package resolution check only. | Not available |
| `gcloud` availability | `gcloud` exists locally. | Command path only. | Available |
| Android Publisher scoped token | `gcloud auth print-access-token --scopes=https://www.googleapis.com/auth/androidpublisher` failed before producing a token because local gcloud allowed scopes did not include Android Publisher. | Sanitized error: invalid scopes value. | Blocked |
| Default gcloud token | Default `gcloud auth print-access-token` succeeded, but `GET /androidpublisher/v3/applications/com.chillywood.mobile/subscriptions` returned `403 PERMISSION_DENIED`. | Sanitized API error: `Request had insufficient authentication scopes.` | Blocked |
| Mutation guard | No POST, PATCH, PUT, DELETE, create, update, activate, deactivate, delete, migrate, batch update, or price mutation call was run. | Only one GET request was attempted. | Pass |

## API Readback Matrix

| Subscription | Console product state | API product state | Console base plans | API base plans | Hidden/draft/archived base plans found? | Warnings/errors returned? | Likely blocker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `premium_subscription` | Product exists; monthly base plan `monthly` is Active, United States, USD 9.99/month; annual target `annual` remains unsaved. | Not read because Android Publisher API access returned `403 PERMISSION_DENIED` / insufficient scopes. | `monthly` visible and Active; `annual` absent in Console. | Unknown. | Unknown. | API auth blocked before product readback. | API access/permission blocker for this lane; provider-side Console/backend blocker remains likely. |
| `cw_channel_subscription_monthly_499` | Product exists with 0 base plans; target `monthly` remains unsaved because valid IDs are invalid before Save. | Not read because Android Publisher API access returned `403 PERMISSION_DENIED` / insufficient scopes. | No visible base plans. | Unknown. | Unknown. | API auth blocked before product readback. | API access/permission blocker for this lane; provider-side Console/backend blocker remains likely. |

## RevenueCat Read-Only Matrix

| Product | Expected state | Current read-only status | Mutation performed? | Status |
| --- | --- | --- | --- | --- |
| `premium_subscription:monthly` | Exists, Published, maps to entitlement `premium` and offering `premium` package `$rc_monthly`. | Verified by prior RevenueCat dashboard/proof readback and current proof scripts. | No | Verified |
| `premium_subscription:annual` | Should exist only after Google Play annual base plan exists. | Absent/blocked by missing Google Play annual base plan. | No | Blocked |
| `cw_channel_subscription_monthly_499:monthly` | Should exist only after Google Play channel subscription monthly base plan exists. | Absent/blocked by missing Google Play monthly base plan. | No | Blocked |
| Creator one-time products | Draft consumables, no Premium mapping. | Prior dashboard/proof readback keeps five creator one-time products as Draft consumables with no Premium entitlement attachment. | No | Verified / OFF |

## Root-Cause Hypothesis Update

| Hypothesis | Confidence after API lane | API evidence | Interpretation | Recommended next step |
| --- | --- | --- | --- | --- |
| Google Play Console provider-side UI/backend state blocker | High | API readback did not run, but the prior Console evidence remains unchanged. | Still the leading cause because valid IDs fail across two products by Console. | Google Support backend review. |
| Hidden/ghost draft base plan | Medium | API could not confirm or rule out hidden base plans due insufficient scopes. | Still possible. API readback remains the best non-mutating check if owner provides proper access. | Owner-approved Android Publisher API credentials or Google Support. |
| Product state corrupted | Medium | API could not confirm product resources. | Still possible, especially for the channel product; Premium monthly being Active makes full product corruption less likely for Premium. | Google Support should inspect backend state before any recreation. |
| Permission limitation | Medium-High for API lane; Medium for Console blocker | The attempted API GET returned insufficient authentication scopes. This proves local API credentials are insufficient, not that Console saves fail for permissions. | API lane is blocked by credentials/scopes. Console permission limitation remains possible but unproven. | Owner/admin confirms exact Play Console API and monetization permissions. |
| Merchant/payments/tax hidden blocker | Medium-Low | API could not inspect subscription fields. | Still possible because API did not return resource-level tax/compliance details. | Owner/admin verifies payments/tax setup; ask Google if hidden state can surface as invalid ID. |
| Console UI validation bug | High | API did not rule it out. | Prior Console behavior still strongly indicates UI/backend validation mismatch. | Clean-session retry only after owner approval and permission/payment checks. |
| Google Play backend provider bug | High | API did not rule it out. | Valid IDs failing across products remain provider-side until proven otherwise. | Google Support backend inspection. |
| RevenueCat dependency | Low / ruled out | API readback blocked before Google Play product state; RevenueCat still only depends on saved Google Play base plans. | RevenueCat cannot create the missing base plans. | Import/map only after Google Play base plans exist. |
| App-code issue | Low / ruled out | API/Console blocker occurs in provider catalog setup, not app runtime. | No app behavior change is needed to create provider base plans. | No app-code lane for this blocker. |

## Recommended Next Step

1. Owner/admin provides Android Publisher API access with the correct `https://www.googleapis.com/auth/androidpublisher` authorization, or runs the read-only GET calls directly and shares sanitized output.
2. Run only these read-only calls:
   - `GET https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.chillywood.mobile/subscriptions`
   - `GET https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.chillywood.mobile/subscriptions/premium_subscription`
   - `GET https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.chillywood.mobile/subscriptions/cw_channel_subscription_monthly_499`
3. Inspect only `productId`, `basePlans[].basePlanId`, `basePlans[].state`, `basePlans[].autoRenewingBasePlanType.billingPeriodDuration`, and sanitized regional availability.
4. Do not run create/update/delete/activate/deactivate/migrate/batch endpoints.
5. If API readback also fails with proper Android Publisher credentials, escalate to Google Support as a permission/account backend blocker.
6. If API readback shows hidden/draft base plans, ask Google Support how to clear or repair them before any product recreation.
7. If API readback agrees with Console and shows absent annual/monthly base plans, the remaining blocker is likely Console save/validation or hidden account/compliance state.

## Forbidden API Calls

The following were not run and must not be run in this read-only lane:

- `monetization.subscriptions.create`
- `monetization.subscriptions.patch`
- `monetization.subscriptions.batchUpdate`
- `monetization.subscriptions.delete`
- `monetization.subscriptions.archive`
- `monetization.subscriptions.basePlans.activate`
- `monetization.subscriptions.basePlans.deactivate`
- `monetization.subscriptions.basePlans.delete`
- `monetization.subscriptions.basePlans.migratePrices`
- `monetization.subscriptions.basePlans.batchMigratePrices`
- `monetization.subscriptions.basePlans.batchUpdateStates`
- Any offer create/update/activate/deactivate/delete endpoint.
- Any pricing migration or product mutation endpoint.

## Safety Confirmation

- No provider mutation.
- No Premium public activation.
- No creator-money switches enabled.
- No `live_money_enabled`.
- No payouts, payable balances, withdrawals, cash-out, transfers, payout batches, Stripe Connect, or merch checkout.
- No provider refunds.
- No RevenueCat mapping changes.
- No Premium product, pricing, entitlement, offering, or Google Play monthly change.
- No creator-money product, price, purchase option, base plan, or mapping change.
- No RLS weakening.
- No LiveKit authority loosening.
- No auth/reset weakening.
- No scan-gate weakening.
- No abuse-throttle removal.
- No block-enforcement weakening.
- No provider secrets, service-account keys, OAuth tokens, access tokens, refresh tokens, payment keys, Stripe keys, private dashboard screenshots, tax IDs, bank details, customer data, signed URLs, local env files, or proof passwords added.
