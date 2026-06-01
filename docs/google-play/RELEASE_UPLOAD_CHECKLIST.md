# Google Play Release Upload Checklist

Date: 2026-05-30
Status: release-upload prep; no Play upload claimed

This checklist prepares the owner/operator for Google Play upload. It does not upload an AAB, submit for review, or claim Google Play acceptance.

June 1, 2026 external acceptance update: `docs/google-play/EXTERNAL_ACCEPTANCE_TRACKER.md` records upload status as not performed in this repo lane. `R5CR120QCBF` is Play-installed versionCode `13`, but the current local repo AAB remains debug-signed with `CN=Android Debug` and must not be uploaded. Use only an owner-approved signed non-debug AAB or Play/EAS upload-signing path, and do not submit production without explicit owner approval.

June 1 artifact proof for the external acceptance tracker: current local repo AAB `android/app/build/outputs/bundle/release/app-release.aab` has SHA-256 `57f8f8da17f21959ef7d3f4abb661fad5135757caa277d2b9a03ddec192ad199` and jarsigner shows `CN=Android Debug`; current local repo APK has SHA-256 `f56a393e541f8deef91a4adab8651f52efa38d35ceaae5522305b950313ec62c`; prior signed candidate `artifacts/google-play-proof/chillywood-v12.aab` has SHA-256 `e256d62de976fbf1b930e5c81cda921f2798ce55f0e4b421139f624e5d2956c1` and remains outside tracked source. No upload was performed.

## Current Artifact Evidence

June 1, 2026 Google Play API upload readiness check: do not upload the current repo-built AAB because `jarsigner` confirms it is signed with `CN=Android Debug`. A broader local search found a prior signed candidate at `artifacts/google-play-proof/chillywood-v12.aab` with SHA-256 `e256d62de976fbf1b930e5c81cda921f2798ce55f0e4b421139f624e5d2956c1`; its signer is non-debug SHA256withRSA with blank DN. The service-account JSON is outside the repo at `/Users/loverslane/secrets/chillywood/revenuecat-google-play-service-account.json`, and no secret contents were printed. Using legacy gcloud ADC for `chillywood-revenuecat-play@chillywood-app.iam.gserviceaccount.com`, Android Publisher edit create/read/delete works, and internal track currently reports completed release `1.0.0` with versionCode `12`. No bundle was uploaded, no edit was committed, and no track/tester state changed. Owner must decide whether to use/install the existing internal v12 build from Play or explicitly approve an API upload/update of a specific signed AAB.

| Artifact | Path | Size / hash | Status |
| --- | --- | --- | --- |
| Fresh current-HEAD proof AAB | `android/app/build/outputs/bundle/release/app-release.aab` | `132125002` bytes / 126M; SHA-256 `57f8f8da17f21959ef7d3f4abb661fad5135757caa277d2b9a03ddec192ad199` | Current local build proof from HEAD `12c97e56de6bb0a5f435f1c9aa81742f700af4dc`. Signing boundary below applies before Play upload. |
| Fresh current-HEAD proof APK | `android/app/build/outputs/apk/release/app-release.apk` | `205639147` bytes / 196M; SHA-256 `abc67ba63c4679ca005d9b3fcb9dc2a5286dd74c48525f1580c7d1ea94f5ed33` | Installed/opened on `R5CR120QCBF` and used for route-smoke proof. Do not upload APK to Play unless release strategy explicitly requires APK. |

Proof folder: `/tmp/chillywood-current-head-play-upload-proof-20260530/`.

Signing boundary: the current local Gradle `release` build uses `signingConfigs.debug`. APK/AAB signing proof shows `CN=Android Debug`. Treat these local artifacts as current-HEAD release build/install/open proof, not as final Play-upload signing proof, unless the owner confirms that this signing certificate is accepted for the target Play app. Actual Play upload should use the owner-approved EAS/Play upload signing path or a corrected release signing config.

## Build Commands

Use the repo's normal release process. Current local native build commands:

```bash
cd android
./gradlew clean assembleRelease bundleRelease
```

May 30, 2026 note: `clean assembleRelease bundleRelease` hit stale ignored native cache/prefab/OOM issues locally. The successful current-HEAD proof used:

```bash
cd android
./gradlew :react-native-worklets:prefabReleasePackage
GRADLE_OPTS='-Xmx6g -XX:MaxMetaspaceSize=2g -Dfile.encoding=UTF-8' \
  ./gradlew --no-daemon assembleRelease bundleRelease \
  -Dorg.gradle.jvmargs='-Xmx6g -XX:MaxMetaspaceSize=2g -Dfile.encoding=UTF-8'
```

Only ignored/generated build cache was moved aside; no source/native config change was made.

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
| Target SDK | `36` from installed release APK proof | Confirm Play target API policy passes during upload. |
| Local signing | Gradle release currently uses debug signing | Use owner-approved EAS/Play upload signing or correct release signing before upload unless Play accepts the current cert. |

## Upload Order

1. Confirm the Play upload signing path: EAS production signing, Play App Signing upload key, or corrected local Gradle release signing.
2. Use the fresh current-HEAD metadata above as build proof, or rebuild again after any code/config change.
3. Record path, size, SHA-256, HEAD commit, date/time, build command, and signing certificate proof.
4. Upload to Closed testing first unless owner explicitly chooses another track.
5. Add tester list and App access reviewer instructions.
6. Complete App content, Data Safety, Content Rating, Ads, Target Audience, Privacy Policy, Account deletion, and Store listing before sending for review.
7. Run Play pre-launch report and fix actual blockers only.
8. Save external screenshots/proof outside the repo.
9. Update readiness docs with non-secret proof status after Play Console returns results.

## May 30 Current-HEAD Android Proof

- Device: `R5CR120QCBF`.
- Install command result: `adb install -r -d android/app/build/outputs/apk/release/app-release.apk` returned `Success`.
- Installed package: `com.chillywood.mobile`, `versionCode=8`, `versionName=1.0.0`, `targetSdk=36`.
- Open proof: app launched past splash into Home and focused `com.chillywood.mobile/.MainActivity`.
- Route smoke captured: Home, Explore loaded, Live, Library, Profile/avatar entry, Settings/legal area, Player `/player/t1`, Platform Studio, Money Center, and Admin.
- App crash scan: `/tmp/chillywood-current-head-play-upload-proof-20260530/android/44b-route-smoke-app-crash-scan.txt` has zero fatal/ANR matches.

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
