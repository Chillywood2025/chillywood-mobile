# Android Image Manipulator Native Fix

Date: 2026-07-22

Status: `ANDROID_IMAGE_MANIPULATOR_INCIDENT_CLOSED`

## Root cause and compatibility boundary

Google Play build 80 was compiled before `expo-image-manipulator` was part of the
native dependency graph. A later runtime-`1.0.0` update evaluated JavaScript that
required `ExpoImageManipulator`, so the absent module caused a fatal React Native
exception. This was an OTA/native-runtime compatibility failure, not an upload,
Samsung, codec, ProGuard, or Expo SDK defect.

The permanent JavaScript boundary remains in
`_lib/imageUploadNormalization.ts` and
`_lib/imageManipulatorNativeBoundary.mjs`: it uses
`requireOptionalNativeModule`, checks the native API before importing the package,
loads once, and fails HEIC/HEIF conversion with safe guidance when unavailable.
JPEG, PNG, navigation, and unrelated app features continue to work. Cleanup is
idempotent after success and failure.

Build 80 remains on runtime `1.0.0`. Replacement build 84 uses runtime
`1.0.0-android-imagemanipulator-v1`; Expo Updates therefore cannot deliver a
runtime-`1.0.0` update to build 84.

## Exact replacement

| Field | Observed value |
| --- | --- |
| Build source | `8c426f4e74de61de7d4529d32d124744833912dc` |
| Package | `com.chillywood.mobile` |
| App version | `1.0.0` |
| Version code | `84` |
| Runtime | `1.0.0-android-imagemanipulator-v1` |
| Channel | `production` |
| Expo SDK | `54.0.36` |
| Image Manipulator | `14.0.8` |
| Native compatibility digest | `4abe7acf4df511520c4645be55ea01b0c5762f8184c76a4f48ed6ab31a47a50a` |
| Build profile | `android-production-local-recovery` |
| Release state | `INTERNAL_BUILD_AVAILABLE` |

`expo-modules-autolinking` resolved
`expo.modules.imagemanipulator.ImageManipulatorModule`. Gradle's release runtime
classpath resolved
`host.exp.exponent:expo.modules.imagemanipulator:14.0.8`; no config plugin,
`react-native link`, or manual package-list edit is required.

## Actual release-artifact proof

The production AAB was built locally from the exact committed source. On
2026-07-22, its SHA-256 was recomputed before provider mutation and the unchanged
artifact was uploaded to Google Play Internal Testing only. Google Play now shows
versionCode 84 as the active internal bundle and build 80 as deactivated on that
track. Production, open testing, and closed testing were not changed.

| Artifact | SHA-256 |
| --- | --- |
| Production AAB | `de8f4da21956988bdcf7e8ea74bf96493a8d2649018557ed97d4914a7ceabb30` |
| AAB-derived APK set | `d5f36daf6e60947428c05bebfa8d7eac16f6e67c19d04822a006183fbde36bce` |
| AAB-derived universal QA APK | `1bdc302a633be44f96b2dc72c524d51762852acfafdb1726462626b1ee0cc1da` |

Bundletool validation and signing validation passed. The manifest proves package
`com.chillywood.mobile`, versionCode 84, versionName 1.0.0, minSdk 24, targetSdk
36, `debuggable=false`, the replacement runtime, production update channel, and
arm64 plus the expected additional ABIs. The release DEX contains exact class
descriptor `expo.modules.imagemanipulator.ImageManipulatorModule` and registry
name `ExpoImageManipulator`. Release minification is disabled in this build; the
class is present in the actual release artifact. An artifact scan found no
keystore, credential file, private key, password, raw build job, or private build
log.

## Credential incident

Read-only Google Play App Integrity comparison proved the exposed certificate was
the upload certificate and did not match the Play app-signing certificate. The
Play app-signing key was not changed. The compromised EAS credential was removed
immediately and was not reused.

A replacement RSA-2048 upload key was generated outside Git. Its public
certificate SHA-256 is:

`6D:37:4C:35:AE:3E:AA:1E:9D:2E:01:9F:EE:63:CF:2F:9B:BF:D4:1E:65:F8:85:A5:49:58:21:6F:57:83:A2:C7`

Two encrypted owner-controlled backups were verified by public fingerprint and
alias readback. No private key, password, or keystore location is in the
repository. Google's post-activation App Integrity readback now shows the
replacement upload certificate as active. The Play app-signing certificate
remains unchanged. EAS, Google Play, the preserved AAB, and the local replacement
certificate all match the replacement public SHA-256 above; the compromised EAS
credential remains removed. The replacement credential is now the default
Android build credential in EAS. No build was started during synchronization.

The exact preserved AAB was submitted at `2026-07-22T22:33:08Z` through the
repository's `production` submit profile, whose Android target is `internal`.
Sanitized submission identifier SHA-256:
`196c2535dde720cc3a618f37e18067689b3bef46f37ef2a8ef882c33747ed4a2`.
Google Play accepted and processed it, and the existing bounded internal email
list remains selected with 17 testers. No tester identity or join URL is recorded.

## Runtime and fixture result

The exact AAB-derived universal APK installed cleanly on a Google Android API 34
emulator. Settings reported version 1.0.0, build 84, production channel,
replacement runtime, and `HEIC native module = Available`. A real HEIC save
therefore proved native-path use; the legacy fallback was not used.

| Test | Result |
| --- | --- |
| Startup / historical crash signature | Pass; absent from logcat and React Native fatal logs |
| JPEG profile photo | Pass; saved once |
| PNG | Picker/review/cancel pass; no upload |
| Standard iPhone HEIC | Pass; normalized and stored as JPEG |
| Standard HEIF | Pass; normalized and stored as JPEG |
| 6000x4000 HEIC | Pass; no fatal or out-of-memory event |
| Corrupted HEIC | Safe user-facing failure; process remained alive |
| Multiple consecutive edits | Pass; latest profile object count remained one |
| Background/foreground during background-photo save | Pass; one JPEG object |
| Low-memory recovery | `NOT_OBSERVED` |
| EXIF orientation | `NOT_OBSERVED`; the generated fixture had no trustworthy orientation tag |
| No-extension picker item | Source fixture covered; device picker did not index the fixture |
| Unsupported masquerade | Source guard covered; device picker proof not observed |
| Direct cache-file inspection | Not available on the non-debuggable release app |

The database/storage readback was sanitized: successful profile assets used `.jpg`,
one current object remained for each tested slot, and no URL, content URI, image
name, token, account credential, or private image was recorded.

## Surface scope

Profile photo and profile background were exercised directly. The shared guarded
normalization path is retained by Chat attachments, profile posts/comments,
creator-video comments, Watch Party comments, and Live Stage comments. Those
callers are behaviorally source-tested, but each was not individually exercised
on a physical device in this closeout. Primary creator video, title/channel video,
LiveKit media, and thumbnail validation are not direct Image Manipulator callers.

## Installation and legacy truth

On 2026-07-22, `QA Android A` (Samsung physical device class, Android 11) began on
the Google Play-installed build 80/runtime `1.0.0`. Google Play Internal Testing
updated the same installation to build 84 without uninstalling, clearing app data,
or sideloading. The package stayed `com.chillywood.mobile`; the Play installer and
unchanged Play app-signing public certificate matched. The existing signed-in
session, safe settings, notification state, and profile state survived the update,
full termination, and relaunch.

The updated app reported runtime
`1.0.0-android-imagemanipulator-v1`, production channel, build 84, embedded launch,
emergency launch false, and `HEIC native module = Available`. Successful HEIC and
HEIF saves prove the guarded native path was used and the missing-module fallback
was not used. Build 80 remains protected by the existing safety OTA for testers
who have not upgraded; that OTA prevents the startup fatal but intentionally does
not add the missing native module.

| Play-delivered physical test | Result |
| --- | --- |
| Build 80 to 84 in-place update | Pass; Google Play only, no uninstall/data clear/sideload |
| Session and safe settings | Preserved through update and relaunch |
| JPEG | Saved once |
| PNG | Review and cancel passed |
| Standard HEIC | Native conversion and save passed |
| Standard HEIF | Native conversion and save passed |
| High-resolution HEIC | Saved; no fatal or observed OOM |
| Corrupted HEIC | Bounded user-facing failure; process remained alive |
| Background/foreground | Review resumed and saved once |
| Duplicate prevention | One active profile-photo slot observed |
| Historical fatal signature | Zero occurrences in bounded logcat window |

## Autonomous release/readiness readback

The Android provider adapter read Google Play build 84 as
`available_to_internal_testers` on `internal`; its EAS build and channel reads also
completed. EAS cloud-build history truthfully still identifies the historical
cloud runtime `1.0.0`, because build 84 was built locally. That historical cloud
identity was not substituted for the Play-delivered binary.

The reviewed Android binary attestation is now `verified` with build 84, the
replacement runtime, exact source commit, and AAB digest. Installed QA records a
sanitized `play_installed_upgrade_pass`, `native_module_available`,
`heic_conversion_observed`, and `historical_fatal_not_observed` physical-proof
event. The scheduled release snapshot remains blocked until its host adapter is
given the same sanitized Play/local-attestation composition; it was not falsely
rewritten as healthy. No autonomous system moved or can move the release to
production.

Read-only Expo history shows build 80 is protected by compatible safety update
group `37a91fdc-f5bf-47e4-8e43-f8a8620ca0d5`, Android update
`019f7cdd-b989-74e3-9775-254352ce68cd`. It avoids eager package evaluation and
fails HEIC/HEIF conversion safely. It does not add the missing native module.
Superseded eager-import update groups in `ANDROID_CRASH_REPORT.md` are prohibited
rollback targets.

## Remaining gates

The incident-specific upgrade gate is closed. Remaining optional breadth includes
a second OEM, minimum API, permission-denied, network retry, low-memory, trusted
EXIF orientation, no-extension/masquerade picker behavior, and individual physical
tests for every social attachment surface. None of those broader cases is claimed
complete here, and build 84 remains Internal Testing only.

If build 84 must be withdrawn, deactivate/remove only its
Internal Testing release or pause that track, leave production/open/closed tracks
untouched, and keep build 80 on the reviewed safety OTA. Delete local AAB/APKS/APK
copies only when the owner intentionally discards the release evidence. Keep the
new runtime boundary and defensive JavaScript guard, retain credential-incident
audit evidence and backups, and use normal git revert for documentation/source
changes. Never restore the compromised key or roll build 80 back to an eager-import
update.
