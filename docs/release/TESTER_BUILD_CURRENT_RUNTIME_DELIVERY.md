# Tester Build Current Runtime Delivery

Tester build / current runtime delivery: Partial.

Status vocabulary: Tester build / current runtime delivery: Closed / Partial / Blocked.

Previous commit `25ecf6d55180144b7202c901c163f9e28e469609` was verified aligned with `origin/main` before delivery work began. This lane did not submit the app to production. This lane did not mutate Google Play, RevenueCat, Stripe, payouts, purchases, refunds, or provider dashboards. Safe public non-money systems remain enabled. Premium public purchase remains OFF. live_money_enabled remains OFF. Creator-money remains OFF. Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF. Provider refunds remain manual/external.

## Delivery Decision

EAS Update was enough for the current tester delivery because the installed tester binary already matches package `com.chillywood.mobile`, version `1.0.0`, Android versionCode `55`, and runtimeVersion `1.0.0`. The tracked changes since the prior EAS update include JavaScript/app-route changes, docs, scripts, public legal site files, and dev-only package metadata. No package ID change, runtimeVersion bump, production Play submission, Google Play product/base-plan mutation, RevenueCat mapping change, Stripe mutation, Premium purchase activation, live_money_enabled activation, creator-money activation, payout activation, provider refund execution, or provider dashboard mutation happened.

No new Android APK/AAB was created in this lane. A new binary is not required unless future changes alter native plugins, permissions, runtimeVersion, Android package ID, signing, build profile, native dependencies used by the app runtime, or Play/internal track packaging.

## Update / Build Metadata

| Field | Value |
| --- | --- |
| Delivery path | EAS Update |
| Branch/channel/profile | EAS branch `production`; installed Play/internal binary uses the `production` update channel |
| Update message | `Tester update: current public non-money readiness changes` |
| Update group | `4a21c89b-35ca-4997-8c62-28bb20f90469` |
| Android update ID | `019f020a-96a7-71d1-890c-b8406e78ab49` |
| Published commit | `25ecf6d55180144b7202c901c163f9e28e469609` |
| Runtime version | `1.0.0` |
| Package ID | `com.chillywood.mobile` |
| App version | `1.0.0` |
| Android versionCode | `55` |
| Installed device | `R5CR120QCBF` |
| Installer readback | `com.android.vending` |
| New APK/AAB build ID | Not created; EAS Update path used |

## Installed Device Smoke

Installed-device verification ran on attached Android device `R5CR120QCBF`. The app launched as foreground package `com.chillywood.mobile/.MainActivity`. Package readback returned package `com.chillywood.mobile`, versionName `1.0.0`, versionCode `55`, and installer `com.android.vending`. Logcat showed the app launched and Expo Updates performed an update check without fatal crash output in the captured window.

Update uptake is Partial: EAS metadata shows update group `4a21c89b-35ca-4997-8c62-28bb20f90469` published to branch `production` for runtime `1.0.0`, but the physical-device smoke did not capture a download/apply of that group during the short proof window. Testers should fully close and reopen the app on a validated network; if the app does not receive the update after normal EAS propagation, run the rollback/build fallback instructions below.

## Tester Instructions

1. Install or keep the current Play/internal tester app for package `com.chillywood.mobile`, version `1.0.0`, versionCode `55`.
2. Fully close and reopen the app on a validated network so the production-channel EAS update can be checked on launch.
3. Test Home, Search/Browse, title pages, Player, Favorites, Continue Watching, profile/settings, legal/support/account deletion links, reporting, blocking, Chi'lly Chat, chat calls, Watch-Party/Live guarded routes, notifications, scoped Admin Command Center denial for non-staff, and scoped staff flows only with approved proof accounts.
4. Report bugs with device model, app version, versionCode, approximate time, account persona, route, and sanitized screenshots only.
5. Do not include passwords, tokens, private emails, raw storage paths, signed URLs, raw IPs, push tokens, LiveKit tokens, private chat bodies, reporter identity, raw audit logs, provider transaction/customer/order records, tax IDs, bank details, or private evidence in reports.

## Known Disabled Systems

Testers should not treat these as bugs:

- Premium public purchase is OFF unless separately approved.
- Premium monthly public purchase remains a separate owner-approved proof lane.
- Premium annual remains Google Play base-plan provider-blocked.
- Creator Channel Subscription remains Google Play base-plan provider-blocked.
- Creator-money is OFF.
- Live money is OFF.
- Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement are OFF.
- Provider refunds remain manual/external.

## Rollback Instructions

Preferred rollback is an EAS Update rollback on branch `production` to the previous known-good update group if tester feedback shows a current-runtime regression. If an EAS rollback is insufficient, stop tester rollout and prepare an Android preview/internal build under the approved EAS profile. Do not submit to production from this lane. Do not change package ID, runtimeVersion, Google Play products/base plans, RevenueCat mappings, Stripe, payouts, purchases, refunds, or provider dashboards as part of rollback.

## Artifact

Artifact path: `/tmp/app-tester-build-current-runtime-delivery-20260625-224254/`.

The artifact contains sanitized update metadata, installed-device smoke summaries, proof output, guard output, blocker list, owner action list, and secret scan result. It does not include credentials, passwords, private emails, tokens, service-role keys, provider secrets, dashboard screenshots, signed URLs, raw storage paths, raw IPs, push tokens, LiveKit tokens, tax IDs, bank details, provider transaction/customer/order records, private chat bodies, reporter identity, raw audit logs, or private evidence.

## Final Verdict

Partial. The current runtime tester update was published successfully to EAS branch `production` and the installed Play/internal app launched on Android package `com.chillywood.mobile` versionCode `55` / runtime `1.0.0`. Installed-device uptake of update group `4a21c89b-35ca-4997-8c62-28bb20f90469` was not observed during the smoke window, so tester delivery should be treated as published/pending uptake rather than fully proven installed. Safe public non-money systems remain enabled, Premium public purchase remains OFF, live_money_enabled remains OFF, creator-money remains OFF, payouts/Stripe/merch remain OFF, and no provider mutation or Play production submission happened.
