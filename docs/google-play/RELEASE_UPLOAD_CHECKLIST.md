# Google Play Release Upload Checklist

Date: 2026-05-30
Status: release-upload prep; no Play upload claimed

This checklist prepares the owner/operator for Google Play upload. It does not upload an AAB, submit for review, or claim Google Play acceptance.

## Current Artifact Evidence

| Artifact | Path | Size / hash | Status |
| --- | --- | --- | --- |
| Prior proof AAB | `android/app/build/outputs/bundle/release/app-release.aab` | 126M; `fbe91629a16e3d0143106296d527b91e86bbb1dad80f3a53b01994d416be2f0a` from prior proof | Evidence only. Rebuild before final Play upload. |
| Prior proof APK | `android/app/build/outputs/apk/release/app-release.apk` | 196M local file present | Install/open proof evidence only. Do not upload APK to Play unless release strategy explicitly requires APK. |

The AAB proof artifact was produced before the latest docs/package lane and should not be treated as a fresh current-HEAD release candidate. Because later lanes changed code before this docs-only lane, build a fresh AAB before Play upload.

## Build Commands

Use the repo's normal release process. Current local native build commands:

```bash
cd android
./gradlew clean
./gradlew bundleRelease
```

Optional local install proof after APK build:

```bash
cd android
./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

EAS release process should follow `docs/ANDROID_RELEASE_EAS_RUNBOOK.md` if the owner chooses cloud signing/submission.

## Version Checks

| Field | Current repo value | Owner action |
| --- | --- | --- |
| Package | `com.chillywood.mobile` | Confirm Play app record and artifact match. |
| Runtime version | `1.0.0` | Confirm OTA/runtime compatibility. |
| Version name | `1.0.0` | Confirm this is acceptable for the track. |
| Version code | `8` | Confirm greater than the last Play-uploaded versionCode before upload. Increment in a separate release-build lane if needed. |
| Target SDK | From Android Gradle config | Confirm Play target API policy passes during upload. |

## Upload Order

1. Rebuild final AAB from current `main`.
2. Record path, size, SHA-256, HEAD commit, date/time, and build command.
3. Upload to Closed testing first unless owner explicitly chooses another track.
4. Add tester list and App access reviewer instructions.
5. Complete App content, Data Safety, Content Rating, Ads, Target Audience, Privacy Policy, Account deletion, and Store listing before sending for review.
6. Run Play pre-launch report and fix actual blockers only.
7. Save external screenshots/proof outside the repo.
8. Update readiness docs with non-secret proof status after Play Console returns results.

## Release Notes Template

Use only actual shipped behavior:

```text
Public V1 Android readiness build for Chi'llywood.

- Profile, Platform, Player, Explore, Library, Live, Watch-Party, support, legal, and reporting surfaces are available according to account permissions.
- Legal/support/account deletion paths are reachable.
- Live money, payouts, ad revenue, tips, paid creator content, and cash-out remain off unless separately enabled and proved.
```

Owner should revise this before upload and remove any feature not actually available in the artifact.

## Closed Testing Recommendation

Closed testing is the safer first track because the remaining P0 is external Play/Data Safety/account-deletion/legal acceptance and P1 proof gaps still exist for fixture-heavy runtime behavior.

Use closed testing to validate:

- app launch and splash;
- Home, Explore, Live, Library, Profile, Platform, Platform Studio, Player;
- Settings > Legal and Support;
- account deletion path;
- report entry points;
- sign-in/sign-out;
- non-admin reviewer account access;
- no owner/admin tools for normal users;
- no raw storage path, token, or secret exposure.

## Do Not Enable During This Release

- live money;
- real payouts;
- tips;
- paid creator content;
- Watch-Party seat sales;
- ad delivery or paid placements;
- unproved provider purchases;
- creator earnings/cash-out;
- iOS release;
- AI assistant or any unproved future feature.

## Proof To Save Outside Repo

- Play AAB upload accepted screenshot;
- versionCode/versionName screenshot;
- pre-launch report result;
- App content completion screenshots;
- Data Safety submitted/accepted screenshot;
- account deletion URL accepted screenshot;
- content rating receipt;
- closed-testing release screenshot;
- tester/app-access setup screenshot with passwords redacted if exported;
- launch/review decision emails without private tokens.
