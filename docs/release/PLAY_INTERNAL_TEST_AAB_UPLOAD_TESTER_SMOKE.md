# Play Internal Test AAB Upload Tester Smoke

Play internal/closed testing AAB upload + tester smoke: Closed for Play internal v57 install and launch smoke.

Status vocabulary: Play internal/closed testing AAB upload + tester smoke: Closed / Partial / Blocked.

Previous commit `9361c45987d6dd37ec7574dca7f9fb1e37c9fb9a` was pushed and verified aligned with `origin/main` before Play upload work began. The approved tester delivery path is Google Play internal/closed testing. The v57 AAB was uploaded through EAS Submit to the Google Play `internal` track only, and Play internal v57 installed successfully from Google Play. This lane did not submit to Play production. This lane did not promote a release to production. This lane did not mutate Google Play products/base plans, RevenueCat, Stripe, payouts, purchases, refunds, or provider dashboards. Safe public non-money systems remain enabled. Premium public purchase remains OFF. live_money_enabled remains OFF. Creator-money remains OFF. Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF. Provider refunds remain manual/external.

## Reason For Play Internal Upload

EAS Update group `4a21c89b-35ca-4997-8c62-28bb20f90469` / Android update ID `019f020a-96a7-71d1-890c-b8406e78ab49` was published earlier, but installed-device uptake was not observed. A fresh APK build then proved that the attached phone had a Play-installed/closed-testing app: update-over-install failed with `INSTALL_FAILED_UPDATE_INCOMPATIBLE` because the sideload APK signing key differed from the Play-installed app. The sideload v56 APK path was not owner-approved for tester delivery and must not be used for testers. Existing Play/internal/closed testers therefore need the v57 AAB delivered through Google Play internal/closed testing. Future tester delivery must use Google Play internal/closed testing only unless the owner explicitly approves sideload in writing.

## AAB Metadata

| Field | Value |
| --- | --- |
| AAB path | `/tmp/app-android-tester-binary-build-install-smoke-20260625-235636/chillywood-production-aab-v57.aab` |
| EAS build ID | `d7cec74d-95f5-4cf5-be0e-eb53571efc18` |
| Package ID | `com.chillywood.mobile` |
| Version name | `1.0.0` |
| Version code | `57` |
| Runtime version | `1.0.0` |
| Git commit | `de3f9eb69798cebb5fab7fe0f34ce00fc0a10d8c` |
| SHA-256 | `a71b8a9b8e35a284e62b7843df5c7f16ba94c54487ca63bcf67aba04598c9efa` |

## Play Upload / Manual Pending Status

Upload path used: automated EAS Submit with existing `production` submit profile.

| Field | Value |
| --- | --- |
| Play track target | `internal` |
| Submit profile | `production` |
| Release status reported by EAS Submit | `COMPLETED` |
| EAS Submit result | Submitted to Google Play internal track |
| Production submission | Not performed |
| Product/base-plan mutation | Not performed |
| RevenueCat/Stripe/provider mutation | Not performed |

## Release Notes

```text
Current tester build with public non-money readiness updates, role/admin/moderation governance proof, reporting/safety improvements, legal/support/account deletion alignment, monitoring/runtime diagnostics, and current guarded app flows.

Premium purchase, creator-money, live money, payouts, Stripe/merch, Premium annual, Creator Channel Subscription, and provider refunds remain unavailable/off.
```

## Tester Instructions

1. Join the Google Play internal testing program for the app using the owner-provided tester link or Play Console tester list.
2. Update/install the app from Google Play after the internal release is available.
3. Verify package `com.chillywood.mobile`, versionName `1.0.0`, versionCode `57`.
4. Test Home, Search/Browse, title pages, Player, Favorites, Continue Watching, profile/settings, legal/support/account deletion, reporting, blocking, Chilly Chat, calls, Watch-Party/Live guarded routes, notifications, and approved staff proof flows.
5. Report bugs with device, app version, versionCode, persona, route, approximate time, and sanitized screenshots only.
6. Do not include credentials, passwords, private emails, tokens, service-role keys, provider secrets, signed URLs, raw storage paths, raw IPs, private chat bodies, reporter identity, raw audit logs, or private evidence in bug reports.

## Installed Play Tester Smoke

Installed Play tester smoke is Closed for install and launch only. The first Play update failed because a sideloaded v56 APK was installed on the device. The sideloaded package was removed so the approved Play internal v57 build could be installed. Play internal v57 installed successfully from Google Play.

Final install/launch smoke result:

- Device is `R5CR120QCBF`.
- Installer is `com.android.vending`.
- Package is `com.chillywood.mobile`.
- Version is `1.0.0`.
- versionCode is `57`.
- App launched successfully as `com.chillywood.mobile/.MainActivity`.
- No fatal crash appeared in the captured launch log window.

This is install/launch smoke only, not full tester QA. Testers still need to run current non-money flows.

## Known Disabled Systems

Testers should not treat these as bugs:

- Premium public purchase is OFF.
- Premium monthly public purchase remains a separate owner-approved proof lane.
- Premium annual remains Google Play base-plan provider-blocked.
- Creator Channel Subscription remains Google Play base-plan provider-blocked.
- Creator-money is OFF.
- Live money is OFF.
- Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement are OFF.
- Provider refunds remain manual/external.

## Rollback Instructions

Rollback for Play internal testers should use Play internal testing release controls with the prior approved Play artifact. Do not promote to production as rollback. Do not mutate provider dashboards, change Google Play products/base plans, change RevenueCat mappings, mutate Stripe, execute purchases, execute refunds, or activate money as part of rollback.

## Proof Artifact

Artifact path: `/tmp/app-play-internal-test-aab-upload-tester-smoke-20260626-010754/`.

The artifact contains sanitized AAB metadata, upload result, Play track target, release notes, tester instructions, smoke pending status, disabled-system list, rollback instructions, proof output, guard output, blocker list, owner action list, and secret scan result. It does not include credentials, passwords, private emails, Play service account JSON, API keys, tokens, service-role keys, provider secrets, dashboard screenshots, signed URLs, raw storage paths, raw IPs, push tokens, LiveKit tokens, tax IDs, bank details, provider transaction/customer/order records, private chat bodies, reporter identity, raw audit logs, or private evidence.

## Final Verdict

Closed for Play internal v57 install and launch smoke. The v57 AAB was found, verified by SHA-256, submitted through EAS Submit to the Google Play internal track, installed successfully from Google Play on device `R5CR120QCBF`, and launched as `com.chillywood.mobile/.MainActivity` with no fatal crash in the captured launch log window. This is install/launch smoke only, not full tester QA. Testers still need to run current non-money flows. Play production submission did not happen. Google Play products/base plans, RevenueCat, Stripe, payouts, purchases, refunds, and provider dashboards were not mutated.

## Every Visible Surface Active Wiring Follow-Up

Every visible surface active wiring audit: Closed. The approved tester delivery path remains Google Play internal/closed testing, and testers should use v57 or a later approved Play internal build to verify the active route/status/tester-safe flows after the next binary/update includes this lane.

No visible clickable dead buttons are allowed. Nothing visible should be hidden or disabled. Every visible control works, routes correctly, opens a setup/status/resolution flow, opens a support/review flow, or starts a tester-safe flow. Permission scopes must unlock backed behavior.

Tester-visible monetization UX is separate from live money settlement. Premium monthly tester flow is reachable where Play internal/licensed tester/provider setup supports it. Premium annual opens an active provider-blocked status/resolution flow. Creator Channel Subscription opens an active provider-blocked status/resolution flow. liveMoneyEnabled remains OFF. Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF. No Google Play, RevenueCat, Stripe, payout, refund, purchase, or provider mutation happened.
