# Android `ExpoImageManipulator` Crash Report

Date: 2026-07-20

Status: native replacement built and validated locally; Google upload-key reset pending until 2026-07-22 21:49 UTC; not submitted.

## Incident

The Android process could terminate with:

```text
com.facebook.react.common.JavascriptException
Cannot find native module 'ExpoImageManipulator'
```

This was a native-runtime compatibility failure, not an image-provider or upload-server failure.

## Proven root cause

The Google Play internal Android binary is build 80. Its provider-read-back release manifest is
`config/release/android-production.json`:

- EAS native build ID: `4c27d4a2-1b54-48d0-93a2-266c3c430dae`
- binary source: `08fd60e29a5040672c9f9dc91befc9142861d82e`
- channel/runtime: `production` / `1.0.0`

At that exact binary source, `package.json` did not contain
`expo-image-manipulator`. Build 80 therefore cannot contain the
`ExpoImageManipulator` Android native module.

Commit `94d1d4c688a86788b9793acbbed3f18c4519ee53` later added
`expo-image-manipulator ~14.0.8` and added this eager module-scope import to
`_lib/imageUploadNormalization.ts`:

```ts
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
```

JavaScript containing that import was then published into the same runtime
namespace used by build 80. The affected superseded Android OTA records are:

- group `bfce1629-6ef1-4f48-b827-4f9e8f364246`, update
  `019f7c98-b3e3-7641-999d-2081727cd410`, source
  `9084da67764b77dea87b6f653adabcf1891ce574`
- group `7d4e8224-73c4-48dc-9d7a-bbd861a7112d`, update
  `019f7c9c-e2ab-71b5-857a-108b563cbddb`, source
  `1334221b1dfbf418fba3fcaaae8757e7f5295df9`

Those sources contain the eager import. They must not be used as rollback
targets for Android build 80.

The exact exception is also proven from the installed package source:
`expo-image-manipulator/src/NativeImageManipulatorModule.ts` evaluates
`requireNativeModule('ExpoImageManipulator')` at module scope, and
`expo-modules-core/src/requireNativeModule.ts` throws the exact reported text
when that module is absent.

Therefore the root cause is an OTA/native runtime mismatch: JavaScript added a
native-module requirement without changing the runtime compatibility boundary
or replacing the older Android binary.

## Cause classification

| Candidate | Result | Repository evidence |
| --- | --- | --- |
| Missing dependency | Yes in build 80; no in current source | Build-80 source has no package entry. Current `package.json` and lockfile contain 14.0.8. |
| Missing Expo config plugin | No | Image Manipulator is an autolinked Expo module and does not require a separate app config plugin. |
| Native module omitted from build | Yes, because build 80 predates the dependency | This is expected from its exact source, not an autolinking defect. |
| Expo SDK mismatch | No | Expo 54.0.36 and Image Manipulator 14.0.8 pass `expo install --check` and Expo Doctor. |
| OTA/native runtime mismatch | Yes; primary cause | Runtime `1.0.0` accepted JS requiring a native module absent from build 80. |
| Conditional/lazy import issue | Historical eager import was unsafe | The initial import executed at module evaluation. A later dynamic import limited exposure to HEIC; the permanent guard now proves native availability before package evaluation. |
| Dynamic require/package resolution | No | npm, TypeScript, Metro, and Expo package resolution pass. |
| Android-only configuration | No | Current Expo autolinking and Gradle release runtime resolution both include 14.0.8. |
| ProGuard/R8 stripping | No | The dependency was absent before Gradle/R8 ran for build 80. Current release runtime resolves its AAR. |
| Dead code calling a removed module | No | The normalization module is on active profile and social-attachment import paths. |

## Crash location and affected flows

The historical fatal happened while the startup route bundle evaluated the
static import. It did not require a screen, button press, image selection, upload,
or editor action. Expo Router route modules reach the normalization module through
profile-media and social-attachment imports.

The native module's only intended product use is HEIC/HEIF-to-JPEG normalization
in `_lib/imageUploadNormalization.ts`. Active callers are:

- Profile photo and Profile background through `_lib/profileMedia.ts`, reachable
  from Profile and Settings.
- Chi'lly Chat attachments through `_lib/chat.ts`.
- Profile post and Profile post-comment attachments through
  `_lib/profilePosts.ts`.
- Creator-video comment attachments through `_lib/creatorVideoComments.ts`.
- Watch Party room-comment attachments.
- Live Stage room-comment attachments.

JPEG and PNG are pass-through inputs. The source has no
`manipulateAsync`, `useImageManipulator`, crop, resize, or rotate operation using
this module. Primary creator video uploads, cover/thumbnail validation, playback,
LiveKit media, and Watch Party video do not invoke it.

## Permanent source correction

`_lib/imageUploadNormalization.ts` now:

1. returns JPEG/PNG/non-HEIC inputs before any image-manipulator work;
2. calls Expo's non-throwing `requireOptionalNativeModule` for
   `ExpoImageManipulator`;
3. invokes the dynamic package import only after the native registry proves the
   module exists;
4. records one sanitized non-fatal capability event per reason without file URI,
   path, token, credential, or provider payload;
5. returns a bounded user-facing message when HEIC/HEIF conversion is unavailable;
6. releases conversion objects and temporary files through the existing cleanup
   path.

`_lib/imageManipulatorNativeBoundary.mjs` isolates this decision so CI can execute
the real absence/presence behavior without loading a native runtime. The absent
fixture proves the package loader is never called. Profile surfaces display the
message in an alert; Chat, Profile posts/comments, creator-video comments, Watch
Party, and Live Stage keep the error on their existing bounded composer/status
surfaces. The rest of the app stays usable.

The guard is tied to the provider-observed build-80 manifest. CI fails if the
package becomes eager again, if the optional-native check is removed, or if the
dynamic import moves before that check.

## OTA and binary decision

- The crash-prevention/fail-closed correction is JavaScript-only. A reviewed
  Android-only OTA compatible with production runtime `1.0.0` can protect existing
  build-80 users without a new binary.
- No OTA was published by the native closeout. Read-only update history proves
  build 80 is already protected by compatible Android safety update group
  `37a91fdc-f5bf-47e4-8e43-f8a8620ca0d5`, Android update
  `019f7cdd-b989-74e3-9775-254352ce68cd`, source
  `31ffc0ff0f67474b3b3a13d6277cabbac7845dd9`. That source has no eager package
  import; missing native conversion is translated to bounded JPEG/PNG guidance.
- An OTA cannot add `ExpoImageManipulator` to build 80. On build 80, HEIC/HEIF
  conversion must remain unavailable with the friendly JPEG/PNG guidance.
- A replacement Android binary is mandatory to make HEIC/HEIF conversion work.
  Current source is ready for such a binary: Expo autolinking and Gradle's release
  runtime classpath both include Image Manipulator 14.0.8.
- The existing iOS internal binaries are not affected by this native mismatch;
  their recorded source already included Image Manipulator. The shared guard is
  still safe on iOS.

## Validation

Validated with Node 20.20.2:

- `npm ci`: passed; lockfile unchanged.
- `expo install --check`: dependencies up to date.
- Expo Doctor: 18/18.
- TypeScript: passed.
- Lint: 0 errors and 86 pre-existing warnings; no new warning from this change.
- Android Metro/Hermes export: passed, 1,805 modules bundled.
- Android Expo autolinking: found `expo-image-manipulator` 14.0.8.
- Gradle `releaseRuntimeClasspath`: resolved
  `host.exp.exponent:expo.modules.imagemanipulator:14.0.8`; build successful.
- iOS Expo autolinking: found pod `ExpoImageManipulator` 14.0.8.
- Runtime, route, OTA native-boundary, image-upload native-boundary, Android
  regression, and media-readiness checks: passed.
- Deno checks for the current Edge Function suite: passed; no Edge Function was
  changed for this client crash.
- Android production bundle export reported one existing LiveKit package-export
  fallback warning; no new image-manipulator warning was introduced.

The behavioral fixtures cover absent native module, valid native module, failed
package load, invalid runtime, HEIC/HEIF recognition, JPEG/PNG pass-through, and
retention of every guarded profile/social caller. Picker cancel/permission paths,
large-image rejection, upload cleanup, and ordinary JPEG/PNG behavior remain on
their existing guarded paths. Physical gallery/provider upload proof and HEIC
conversion on a replacement Android binary remain device-level follow-up; they
are not claimed by source tests.

## Native replacement result

The replacement was built locally from committed source
`8c426f4e74de61de7d4529d32d124744833912dc`:

- app/package: `1.0.0` / `com.chillywood.mobile`
- versionCode/runtime/channel: `84` /
  `1.0.0-android-imagemanipulator-v1` / `production`
- AAB SHA-256:
  `de8f4da21956988bdcf7e8ea74bf96493a8d2649018557ed97d4914a7ceabb30`
- exact AAB-derived universal APK SHA-256:
  `1bdc302a633be44f96b2dc72c524d51762852acfafdb1726462626b1ee0cc1da`
- bundletool and signing validation: passed
- release DEX class: `expo.modules.imagemanipulator.ImageManipulatorModule`
- Expo registry name: `ExpoImageManipulator`
- minSdk/targetSdk/debuggable: `24` / `36` / `false`
- runtime diagnostic: module available, native path used, fallback not used

Release minification is disabled by the generated release configuration; the
exact class is present in the final DEX. This is packaging proof, not a claim about
behavior under an unconfigured R8-minified release.

Clean Android API 34 validation passed JPEG, PNG cancel, standard HEIC, standard
HEIF, 6000x4000 HEIC, corrupt-HEIC safe failure, repeated edits, and an app
background/foreground save without a duplicate storage object. Profile photo and
profile background were exercised directly. Chat, profile posts/comments,
creator-video comments, Watch Party comments, and Live Stage comments retain the
same guarded `createSocialAttachmentForSurface` source path but were not all
individually exercised on hardware. EXIF-orientation, permission-denied,
network-failure/retry, unsupported masquerade/no-extension picker behavior,
minimum API, second OEM, and low-memory behavior remain unobserved and are not
claimed.

The original upload key—not the Play app-signing key—was exposed by failed local
build diagnostics. It was removed from EAS and never reused. A new RSA-2048 upload
key was generated with two verified encrypted backups. Google accepted the reset
request; the replacement upload certificate becomes valid on 2026-07-22 at 21:49
UTC. The AAB is therefore `NOT_UPLOADABLE_PENDING_GOOGLE_UPLOAD_KEY_RESET` and
was not submitted. Build 80 is Play-app-signed while the local QA APK is
upload-key-signed, so direct in-place upgrade proof is `BLOCKED_SIGNING_SOURCE`.
True upgrade proof requires a later separately authorized Google Play internal or
closed-track delivery.

## Remaining action

1. After the waiting period, confirm Google Play's upload fingerprint matches the
   replacement public certificate and only then synchronize that credential to
   EAS.
2. Obtain separate authorization before any Google Play internal-track upload;
   none occurred during this closeout.
3. Run the remaining unobserved device/surface cases without weakening the
   permanent JavaScript fallback or reusing runtime `1.0.0` for native changes.
