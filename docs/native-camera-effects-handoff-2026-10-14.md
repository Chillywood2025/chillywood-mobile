# Internal native camera effects

## Scope

This additive implementation preserves the Live Stage/Watch-Party repairs and
uses the existing authorized local LiveKit camera. It never creates a secondary
capture, grants a speaking seat, requests new camera permission, or publishes a
new track. No database change is needed for camera effects.

Surfaces: `app/watch-party/live-stage/[partyId].tsx` (Live Stage) and the shared
Player's `LiveKitStageMediaSurface` (Watch-Party Live). The Party Room's explicit
local camera preview remains a preview. The corresponding Chi’llyfects sheets
have front/back switching, Off, named effect buttons, and 25/50/75/100% intensity.
Existing local Player tints remain explicitly labeled as local previews.

Effects:

- Studio Light: detected-face-following, brightness-adaptive local light
- Chicago Skyline: real person segmentation plus an original illustrated
  Chicago background with restrained layered subject parallax
- Crimson Aura: a clearly visible red glow outside the subject silhouette
- Neon Edge: bright silhouette outlines that leave the face visible
- Spotlight: a darker background with a slow-moving colored light behind people

Skyline is **2.5D subject parallax**, not measured scene depth, LiDAR, TrueDepth,
or a reconstructed 3D scene. No such sensor capability is advertised. Effects
transform outgoing camera frames, rather than placing a View over the preview.
No installed-device, remote-delivery, quality-percentage, or performance claim
follows from source/algorithm tests.

## Pinned integration and safeguards

- `@livekit/react-native` 2.10.0, `@livekit/react-native-webrtc` 144.0.0,
  `livekit-client` 2.22.0, Expo 54, React Native 0.81.5
- Expo local module `ChillywoodCameraEffects`, optional on older binaries/web
- Native WebRTC `VideoFrameProcessor` / `VideoFrameProcessorDelegate`, before
  encoding/publication; original frame rotation/timestamps are retained or
  transformed consistently with upright output
- Effects require both an actual `expo-updates` internal-v2 native channel and
  its matching internal runtime declaration. Older/public builds fail closed.
- Both caller role/grants and current LiveKit publish permissions are checked;
  the published local camera must be live and unmuted. Permission checks do not
  substitute for the existing authoritative room/auth/session controls.
- App background, role loss, disconnect, mute, track replacement, leave and
  native module destruction release processing. Foreground rebinds the current
  authorized track. Native background invalidation does not depend on JS running.
- Off synchronously invalidates native work before asynchronous SDK detach.
- Android 144.0.0 must detach with `_setVideoEffects(null)`: an empty array
  creates an upstream empty processor chain that double-releases the input.
  iOS's declared nonnull array uses its separate, safe empty-list implementation.
  The Android regression executes the actual pinned wrapper/refcount contract.
- Camera switching uses awaited `applyConstraints`, removes stale `deviceId`,
  checks returned facing mode, rejects double taps, invalidates old-camera
  detections and ignores stale switch completion after authority/track changes.
- Inference, detection freshness, rendering time and output-buffer ownership are
  bounded. Missing subjects, unsupported formats, errors and overload return
  original video. This is **not a privacy-background feature**: the real
  background can become visible whenever processing falls back.
- Active means the native callback produced a transformed frame, not merely
  that a configuration call returned. It expires when processed output stops.

## Privacy and dependencies

iOS uses Apple Vision/Core Image/Metal with no new third-party inference SDK.
Android pins bundled ML Kit face detection 16.1.7 and selfie segmentation
16.0.0-beta6. Camera inputs and model outputs remain on-device. No frame, face
template, mask, or video is stored or separately uploaded by this module.

**Android is not zero-telemetry.** ML Kit sends device/app/performance metrics to
Google: device/OS/build and ML accelerator information, app/package/version,
bundled-SDK install identifier, feature/API version and events, latency, input
format/resolution and input/output sizes, and error codes. Official disclosures
list no additional face/segmentation-specific categories. Expo Camera already
depends on ML Kit barcode scanning, but the new effect use creates additional
events. No documented supported diagnostics opt-out was found. Do not claim
that all processing-related metadata stays on-device.

Deployment must wait for the owner's specific diagnostic-transmission approval
and review of actual Play Data Safety/privacy declarations. Source implementation
and SDK compilation do not execute inference or authorize release. Selfie
segmentation is a beta API without an SLA. Do not silently accept new explicit
vendor agreements during a build/release flow.

Primary references reviewed:

- [ML Kit Android data disclosure](https://developers.google.com/ml-kit/android-data-disclosure)
- [ML Kit terms and on-device input/output statement](https://developers.google.com/ml-kit/terms)
- [Android face detection](https://developers.google.com/ml-kit/vision/face-detection/android)
- [Android selfie segmentation](https://developers.google.com/ml-kit/vision/selfie-segmentation/android)
- [Apple Vision person segmentation](https://developer.apple.com/documentation/vision/vngeneratepersonsegmentationrequest)
- [Pinned React Native capture SDK source](https://github.com/livekit/react-native-webrtc)

## Validation and release boundary

Local runnable coverage includes controller tests, mounted React lifecycle tests,
actual effect-control callbacks, pure-Java image math, actual WebRTC buffer
ownership contracts against real AARs, and portable C policy math. TypeScript,
lint, existing room repair regressions and generated Expo native/autolinking
checks are separate evidence. See platform README files for commands.

`scripts/compile-native-camera-effects.mjs` performs a complete module compile:

1. Copies config, modules, assets and dependencies into a disposable directory
2. Supplies nonfunctional Firebase config only to satisfy the config plugin
   for compilation; no real provider credential or app runtime is used
3. Verifies real Expo autolinking and generates native sources with actual plugins
4. Compiles Android Kotlin/Java through Gradle and iOS's camera Pod plus native
   dependencies for an unsigned Simulator target, including Vision/Core Image
   and the Expo Swift/Objective-C boundary
5. Reports source/generated hashes and removes disposable output

The strengthened existing macOS `native-sdk` CI lane runs this. It preserves
all previous validation and policy/owner review gates. `--generate-only` is
explicitly not a compilation pass. The Linux authoring machine has no Apple
SDK or complete Android SDK: real Java production sources compile against
the pinned AAR APIs locally; full Kotlin/Gradle and Apple module compilation
must pass CI before merge/internal delivery.

The source candidate advances to `internal-native-v14` and platform runtimes
`1.0.0-android-production-v14` / `1.0.0-ios-production-v14`, retaining V13's
recorded source digests as superseded history. Its committed native inputs must
match the sealed `git-native-inputs/v1` digests; new native edits require resealing
before exact-head validation. Release tests reject both a V13 binary and a new
camera binary mislabeled with the V13 runtime before any provider call.

Native inputs measured from committed source
`352af4601c59159951dca4d6c256ab7f917d5e07`:

- Android: `bd72fdf8c5125154a7d013375cad6421324e8a2f0353d7681dc9dcaa8554108e`
- iOS: `d29abe27d7197091ab2e17a9a142b2840a0992b706eeaa511af66eccca286352`

The digest receipt fields do not participate in their own hash. Recompute on
the final candidate; these values describe source inputs, not signed artifacts.
These modules cannot be delivered by an OTA to an old native runtime. Use only
`android-internal-v2` / `ios-internal-v2` authorized internal delivery profiles,
never generic production release workflows. No push, merge, EAS build, store
submission, database deployment or installed test was performed by this task.

Physical verification remains with Codex: both platforms, both live surfaces,
front/rear cameras, portrait/landscape, off/intensity/extreme settings, visible
remote-receiver effect output, face/person entering/leaving, dark light, hair
edges/diverse skin tones, rapid movement, camera switching during effects,
mute/demotion/session change, background/foreground, reconnect/leave, thermal
and slow-device fallback, and no frame/buffer leaks. The five effects must be
visually distinguishable on the receiving device; Java/C/source tests do not
establish that result.
