# Premium-First Activation Proof

Date: 2026-06-25

Verdict: Partial.

Premium-first activation proof: Partial. Premium monthly: Verified at `$9.99/month`. Premium annual: Blocked at `$99.99/year` after a browser dashboard setup attempt because Google Play kept base plan ID `annual` marked invalid and returned `Your changes couldn't be saved` even after Yearly, United States-only availability, and `USD 99.99` were selected. Premium annual: Provider-blocked pending Google Play support/base-plan resolution. Premium public activation remains OFF, no Premium purchase was completed, and no public purchase path was enabled. Creator-money flows remain OFF. Channel Subscription remains provider-blocked until Google Play base plan issue is resolved. Creator Channel Subscription: Provider-blocked pending Google Play support/base-plan resolution. Creator payouts remain OFF. Stripe payouts remain OFF. Stripe merch checkout remains OFF. Provider refunds remain manual/external. Premium launch still requires licensed/internal purchase proof and owner approval. Creator-money activation remains a separate future lane. Google Play support packet: Submitted through Google Play Console Help on 2026-06-25 at 12:25 CDT; case ID pending. No provider products/base plans were changed.

This is a Premium-only proof lane. It does not activate creator-money, live money, payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, or provider refund automation.

## Provider Evidence

Dashboard evidence used browser readback on 2026-06-25 for Google Play Console package `com.chillywood.mobile` and RevenueCat project `Chi'llywood`.

Official provider behavior checked:

- Google Play subscriptions use subscription products with base plans and offers; deactivating a base plan prevents new purchases without affecting existing subscribers. Source: https://support.google.com/googleplay/android-developer/answer/140504
- RevenueCat offerings control which products are displayed without requiring an app update. Source: https://www.revenuecat.com/docs/offerings/overview
- RevenueCat entitlements represent purchased access and are the right Premium access readback concept. Source: https://www.revenuecat.com/docs/getting-started/entitlements
- RevenueCat restore/customer info readback is the expected way to resync and inspect purchase state. Sources: https://www.revenuecat.com/docs/getting-started/restoring-purchases and https://www.revenuecat.com/docs/customers/customer-info
- RevenueCat exposes subscription management URLs for manage/cancel support where available. Source: https://www.revenuecat.com/docs/subscription-guidance/managing-subscriptions

## Premium Provider Matrix

| Row | Finding | Status |
| --- | --- | --- |
| Google Play product | `premium_subscription` exists under package `com.chillywood.mobile`. | Verified |
| Product type | Subscription. | Verified |
| Monthly base plan/package | Base plan `monthly`; Monthly, auto-renewing; United States; Active. | Verified |
| Monthly price | Google Play base-plan detail shows `USD 9.99`. | Verified |
| Annual base plan/package | Add-base-plan form accepted the approved draft values `annual`, Yearly, United States only, and `USD 99.99`, but Google Play kept `Base plan ID` invalid and returned `Your changes couldn't be saved`; no saved annual base-plan record was created. | Blocked |
| Annual price | `$99.99/year` was entered for United States only in the unsaved Google Play draft; no saved Google Play annual base plan or RevenueCat annual package exists. | Blocked |
| RevenueCat product | `premium_subscription:monthly` exists as `Chi'llywood Premium Monthly`, Published. | Verified |
| RevenueCat entitlement | Entitlement `premium` exists and has exactly one associated product: `premium_subscription:monthly`. | Verified |
| RevenueCat offering/package | Offering `premium` exists with one package, `Monthly` / `$rc_monthly`, mapped to `premium_subscription:monthly`; no `$rc_annual` package is visible. | Monthly verified / annual blocked |
| Creator-product separation | RevenueCat product catalog shows the five production-labeled creator products as Draft with no entitlement attachment; Premium entitlement detail shows no creator product. | Verified |
| Restore/manage/cancel support | App code exposes RevenueCat restore/customer info and Google Play subscription management URL support; no live action was performed. | Prepared / not live-proved in this lane |

Shared blocker note: `docs/GOOGLE_PLAY_SUBSCRIPTION_BASE_PLAN_ESCALATION.md` documents that valid-format base-plan ID probes (`annual`, `yearly`, `annual-9999`, `monthly`, `monthly-499`, `creator-monthly`, `m-499`) remained invalid across Premium annual and Creator Channel Subscription. No public purchase activation occurred.

## Installed Proof Matrix

| Check | Result | Status |
| --- | --- | --- |
| Installed app source | Physical Android `R5CR120QCBF` has `com.chillywood.mobile`, versionCode `55`, versionName `1.0.0`, installer `com.android.vending`. | Verified |
| Premium screen opens | Deep link opened `screen-premium` on the Play-installed app. | Verified |
| Premium product loads | Provider setup is verified, but the purchase shell stayed in safe/off state; no purchase sheet was opened. | Partial |
| Correct monthly price appears | Provider dashboard verifies `USD 9.99`; installed screen readback did not scroll to a visible price row in this lane. | Provider-verified / installed-price pending |
| Correct annual price appears | Annual provider setup is blocked before saved provider setup; no annual package can be displayed from RevenueCat yet. | Blocked |
| Purchase sheet opens | Not attempted because this lane did not enable the Premium purchase shell publicly or make a real customer purchase. | Pending controlled tester proof |
| Licensed/internal test purchase completes | Not attempted; no real purchase was performed. | Pending controlled tester proof |
| RevenueCat entitlement `premium` becomes active | Not newly proved in this lane; prior sandbox proof remains historical. | Pending controlled tester proof |
| Premium-gated features unlock | Not newly proved in this lane. | Pending controlled tester proof |
| Creator products do not unlock | Installed Premium copy states creator subscriptions, VIP passes, tips, paid videos, Watch-Party Seat Passes, and paid events are separate creator products; provider mapping confirms no creator product maps to Premium. | Verified |
| Creator-money CTAs remain off | Creator-money runtime defaults and money kill-switch defaults remain off; no creator-money product was touched. | Verified |
| Restore purchases | Code path exists; not run in this lane. | Prepared / not live-proved |
| Manage/cancel route | Code/provider support exists through Google Play management URL; not run in this lane. | Prepared / not live-proved |
| Revoked/expired Premium denies gates | Historical revoke/readback proof remains; no new revoke was performed in this lane. | Prepared / not live-proved |
| No creator-money access grant | No purchase was performed; provider mapping keeps Premium separate. | Verified |
| No payout/payable balance | Runtime defaults and Money Center switches keep payouts/live money off. | Verified |
| No LiveKit authority change | Premium purchase was not performed; Premium docs keep creator products and LiveKit authority separate. | Verified |

## Creator-Money Off-State Matrix

| Flow | Provider state | App switch/off state | Premium mapping safe? | Status |
| --- | --- | --- | --- | --- |
| Tips | Google Play Draft `cw_creator_tip_099`; RevenueCat Draft consumable. | `tipsEnabled=false`; `tips_enabled=off`; `live_money_enabled=off`. | Not attached to `premium`. | OFF |
| Paid Video | Google Play Draft `cw_paid_content_access_099`; RevenueCat Draft consumable. | `paidContentCheckoutEnabled=false`; `paid_content_enabled=off`; `live_money_enabled=off`. | Not attached to `premium`. | OFF |
| Watch-Party Ticket | Google Play Draft `cw_watch_party_ticket_099`; RevenueCat Draft consumable. | `watch_party_tickets_enabled=off`; `live_money_enabled=off`. | Not attached to `premium`. | OFF |
| Channel Subscription | Google Play product `cw_channel_subscription_monthly_499` exists; monthly base plan missing. | `channelSubscriptionEnabled=false`; `digital_sales_enabled=off`; `live_money_enabled=off`. | Separate entitlement `creator_channel_subscription`; no Premium mapping. | OFF / provider-blocked |
| VIP | Google Play Draft `cw_vip_pass_499`; RevenueCat Draft consumable. | `vipEnabled=false`; `digital_sales_enabled=off`; `live_money_enabled=off`. | Not attached to `premium`. | OFF |
| Event Pass | Google Play Draft `cw_event_pass_099`; RevenueCat Draft consumable. | `eventPassEnabled=false`; `digital_sales_enabled=off`; `live_money_enabled=off`. | Not attached to `premium`. | OFF |

## Support / Refund / Rollback Matrix

| Area | Current plan | Status |
| --- | --- | --- |
| Paid but Premium did not unlock | User runs Restore Purchases; support verifies Google Play/RevenueCat receipt and backend entitlement readback. | Prepared |
| Restore | RevenueCat restore/customer info path is the expected readback; app should not grant Premium locally without trusted entitlement. | Prepared |
| Revoke/expiration | Backend/provider entitlement readback and `revoked_at`/inactive state deny Premium gates. | Prepared |
| Cancellation/manage | App can route to Google Play subscription management where provider data supplies a management URL/path. | Prepared |
| Refund | Provider refunds remain manual/external; no instant refund promise and no in-app refund execution. | Prepared |
| Rollback | Keep or set `premiumPurchaseEnabled=false`; do not weaken Premium gates; preserve valid existing entitlements unless provider/revoke policy requires otherwise. | Prepared |
| Emergency disable | Premium purchase shell remains separate from creator `live_money_enabled`; creator-money emergency stop stays off. | Prepared |
| Monitoring | RevenueCat customer info, Google Play subscription/base-plan status, backend entitlement row, restore/revoke readback, Crashlytics/analytics purchase/restore/error events. | Prepared |
| Post-activation health | Verify purchase start/result, entitlement active, restore, manage/cancel link, no creator grant, no payout/payable rows, and no crash/fatal logs. | Required before launch |

## Owner Action List

1. Submit the Google Play support escalation packet in `docs/GOOGLE_PLAY_SUBSCRIPTION_BASE_PLAN_ESCALATION.md` and resolve the annual base-plan blocker for `premium_subscription` / `annual`, or approve a different annual base-plan ID only if Google Play support confirms `annual` cannot be saved.
2. After the Google Play annual base plan exists, import/verify `premium_subscription:annual` in RevenueCat, attach it only to entitlement `premium`, and add it to offering `premium` as `$rc_annual` or RevenueCat's annual package equivalent without changing monthly.
3. Approve a bounded Premium-only internal/licensed-tester purchase window.
4. Open the Premium purchase shell only for the approved environment and tester path.
5. Complete no-charge licensed/internal test purchase proof, entitlement readback, restore, manage/cancel, and revoked/expired denial proof.
6. Confirm creator-money switches remain OFF and no creator product maps to Premium after the Premium proof.
7. Keep provider refunds manual/external unless a separate provider-refund lane is approved.

## Safety Confirmation

No creator-money switch was enabled. `live_money_enabled` remains OFF. Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and provider refund automation remain OFF. Premium public activation remains OFF. Premium monthly remains unchanged. The attempted Premium annual draft did not save and no purchase was completed. Creator-money product IDs, prices, regions, purchase options, and RevenueCat mappings were not changed. No creator-money product maps to Premium. No real customer account or real paid customer purchase was used.
