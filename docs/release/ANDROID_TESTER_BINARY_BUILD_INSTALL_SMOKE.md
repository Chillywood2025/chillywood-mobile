# Android Tester Binary Build Install Smoke

Play internal/closed testing AAB upload + tester smoke is tracked in `docs/release/PLAY_INTERNAL_TEST_AAB_UPLOAD_TESTER_SMOKE.md`. VersionCode `57` AAB `/tmp/app-android-tester-binary-build-install-smoke-20260625-235636/chillywood-production-aab-v57.aab` was submitted through EAS Submit to the Google Play internal track only; Play production submission/promotion did not happen. The approved tester delivery path is Google Play internal/closed testing. The sideload v56 APK path was not owner-approved for tester delivery and must not be used for testers. The first Play update failed because a sideloaded v56 APK was installed on device `R5CR120QCBF`; the sideloaded package was removed so the approved Play internal v57 build could be installed. Play internal v57 installed successfully from Google Play with installer `com.android.vending`, package `com.chillywood.mobile`, version `1.0.0`, versionCode `57`, and launched as `com.chillywood.mobile/.MainActivity` with no fatal crash in the captured launch log window. This is install/launch smoke only, not full tester QA; testers still need to run current non-money flows. Future tester delivery must use Google Play internal/closed testing only unless the owner explicitly approves sideload in writing.

Android tester binary build / install smoke: Partial.

Status vocabulary: Android tester binary build / install smoke: Closed / Partial / Blocked.

Previous commit `de3f9eb69798cebb5fab7fe0f34ce00fc0a10d8c` was pushed and verified aligned with `origin/main` before the build started. A fresh Android tester binary was chosen because EAS Update group `4a21c89b-35ca-4997-8c62-28bb20f90469` / Android update ID `019f020a-96a7-71d1-890c-b8406e78ab49` was published in the prior lane but installed-device uptake was not observed. This lane did not submit the app to production. This lane did not mutate Google Play, RevenueCat, Stripe, payouts, purchases, refunds, or provider dashboards. Safe public non-money systems remain enabled. Premium public purchase remains OFF. live_money_enabled remains OFF. Creator-money remains OFF. Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF. Provider refunds remain manual/external.

## Build Decision

The first selected path was EAS Android internal APK build using profile `production-apk`. This profile uses the production runtime/channel and internal distribution, but it does not submit to Play production. It created a fresh tester APK from commit `de3f9eb69798cebb5fab7fe0f34ce00fc0a10d8c`.

VersionCode was bumped by EAS remote app versioning from `55` to `56`. This was required by the chosen `production-apk` profile because `eas.json` has `autoIncrement: true`, `cli.appVersionSource` is remote, and a newer tester binary must have a higher Android build version than the installed v55 app. No repo-side package ID, app version, or runtimeVersion change was made.

After the APK failed to install over Play/closed-testing installs with signature mismatch, the reliable update path for those testers was identified: a Play-uploadable AAB must be distributed through Play internal/closed testing because the installed v55 app is Play-installed and Play-signed. A second EAS build used profile `production` to create a store AAB artifact only. This lane did not upload the AAB to Play, did not submit production, and did not mutate Google Play.

EAS remote app versioning bumped versionCode from `56` to `57` for the AAB build. This was required by the `production` profile and Play update semantics. No repo-side package ID, app version, or runtimeVersion change was made.

## Build Metadata

| Field | Value |
| --- | --- |
| Build system | EAS Build |
| Build profile | `production-apk` |
| Build ID | `9e31b4b1-bd02-405c-8eeb-7aae3550d598` |
| Distribution | `INTERNAL` |
| Platform | Android |
| Package ID | `com.chillywood.mobile` |
| Version name | `1.0.0` |
| Version code | `56` |
| Runtime version | `1.0.0` |
| Git commit | `de3f9eb69798cebb5fab7fe0f34ce00fc0a10d8c` |
| Build status | `FINISHED` |
| Build completed | `2026-06-26T05:18:31.135Z` |
| Local artifact path | `/tmp/app-android-tester-binary-build-install-smoke-20260625-235636/chillywood-production-apk-v56.apk` |
| APK SHA-256 | `5ab5390291a1556c85b1eda0fb66290181c035f17711d9f316b68070af0ace16` |

## Play Internal / Closed Testing AAB Metadata

| Field | Value |
| --- | --- |
| Build system | EAS Build |
| Build profile | `production` |
| Build ID | `d7cec74d-95f5-4cf5-be0e-eb53571efc18` |
| Distribution | `STORE` |
| Platform | Android |
| Package ID | `com.chillywood.mobile` |
| Version name | `1.0.0` |
| Version code | `57` |
| Runtime version | `1.0.0` |
| Git commit | `de3f9eb69798cebb5fab7fe0f34ce00fc0a10d8c` |
| Build status | `FINISHED` |
| Build completed | `2026-06-26T05:46:51.562Z` |
| Local artifact path | `/tmp/app-android-tester-binary-build-install-smoke-20260625-235636/chillywood-production-aab-v57.aab` |
| AAB SHA-256 | `a71b8a9b8e35a284e62b7843df5c7f16ba94c54487ca63bcf67aba04598c9efa` |

## Install / Device Smoke

Install result is Partial. The APK was not installed on the attached devices because Android rejected update-over-install due to signing mismatch:

- Physical device `R5CR120QCBF`: `INSTALL_FAILED_UPDATE_INCOMPATIBLE`.
- Emulator `emulator-5554`: `INSTALL_FAILED_UPDATE_INCOMPATIBLE`.

No uninstall was performed. The existing Play-installed app on `R5CR120QCBF` remains intact. Because the fresh APK could not be installed over the existing package, installed-device smoke for the new v56 APK did not run. The APK metadata was verified with Android SDK tooling: package `com.chillywood.mobile`, versionName `1.0.0`, versionCode `56`, target SDK `36`.

After the install attempts, the owner instructed: no use attached device. No further attached-device install or smoke actions are part of this lane.

Tester-safe paths from here:

1. Use Google Play internal/closed testing for tester delivery.
2. Do not use the sideload v56 APK path for testers; it was not owner-approved for tester delivery.
3. Future tester delivery must use Google Play internal/closed testing only unless the owner explicitly approves sideload in writing.
4. If a sideload is explicitly approved later, document the reason and expect signature mismatch on devices that already have a Play-installed package.

## Tester Instructions

1. Use Google Play internal/closed testing for tester delivery.
2. Verify package `com.chillywood.mobile`, versionName `1.0.0`, versionCode `57`, installer `com.android.vending`.
3. Do not use the sideload v56 APK path for testers unless the owner explicitly approves sideload in writing.
4. Test Home, Search/Browse, title pages, Player, Favorites, Continue Watching, profile/settings, legal/support/account deletion, reporting, blocking, Chilly Chat, calls, Watch-Party/Live guarded routes, notifications, and approved staff proof flows.
5. Report bugs with device, app version, versionCode, persona, route, time, and sanitized screenshots only.

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

For devices that install the APK cleanly, rollback means uninstalling the APK and reinstalling the prior approved tester build or Play/internal app. For Play/internal or closed-testing testers, use Play internal/closed testing rollout controls with the previous approved Play artifact. Do not submit to production, mutate provider dashboards, change Google Play products/base plans, change RevenueCat mappings, mutate Stripe, execute purchases, execute refunds, or activate money as part of rollback.

## Artifact

Artifact path: `/tmp/app-android-tester-binary-build-install-smoke-20260625-235636/`.

The artifact contains sanitized build metadata, APK/AAB SHA-256, package badging, install results, tester instructions, rollback instructions, proof output, guard output, blocker list, owner action list, and secret scan result. It does not include credentials, passwords, private emails, tokens, service-role keys, provider secrets, dashboard screenshots, signed URLs, raw storage paths, raw IPs, push tokens, LiveKit tokens, tax IDs, bank details, provider transaction/customer/order records, private chat bodies, reporter identity, raw audit logs, or private evidence.

## Final Verdict

Partial for the original sideload binary lane, superseded for tester delivery by the Play internal v57 install smoke lane. A fresh Android internal tester APK was built successfully from current commit `de3f9eb69798cebb5fab7fe0f34ce00fc0a10d8c`, with package `com.chillywood.mobile`, versionName `1.0.0`, versionCode `56`, runtimeVersion `1.0.0`, and SHA-256 `5ab5390291a1556c85b1eda0fb66290181c035f17711d9f316b68070af0ace16`. Installation over existing attached-device installs failed safely with signature mismatch. A Play-uploadable AAB was also built successfully from the same commit, with versionCode `57` and SHA-256 `a71b8a9b8e35a284e62b7843df5c7f16ba94c54487ca63bcf67aba04598c9efa`. The approved tester delivery path is Google Play internal/closed testing. The sideload v56 APK path was not owner-approved for tester delivery and must not be used for testers unless the owner explicitly approves sideload in writing.
