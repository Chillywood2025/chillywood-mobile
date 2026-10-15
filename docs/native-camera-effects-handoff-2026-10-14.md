# Internal native camera effects

## Scope

This additive implementation preserves the Live Stage/Watch-Party repairs and
uses the existing authorized local LiveKit camera. Effects add no secondary
capture, speaking-seat grant or publication. Camera switching stops only the
owned video source, follows the existing camera-permission path and replaces
that source within the same publication. No database change is needed.

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
- Android detaches with `_setVideoEffects(null)`. A version/hash-checked config
  plugin also repairs the pinned wrapper's empty-chain ownership bug: a delayed
  RN bridge lookup can follow synchronous Expo provider removal despite using
  the same final SDK executor. The real executor/provider/wrapper regression
  exercises both orderings; the former SDK fails the delayed-attach control.
  iOS's declared nonnull array uses its separate, safe empty-list implementation.
- Camera switching uses the existing video-only native acquisition helper and
  the published `LocalVideoTrack.replaceTrack` owner, never facing changes through
  unsupported `applyConstraints`. Only old video stops; microphone/publication
  remain. A retained capture reservation stops late results after authority,
  background or teardown changes. New facing, sender identity and native
  acknowledgment are checked before effects rebind or success; RN preview gets
  the SDK Restarted event. Failure leaves retry guidance rather than success.
  Primary simulcast is supported; extra backup-codec capture disables switching
  with an explicit reason instead of partially replacing its senders. Measured
  resolution/FPS is preserved within the existing live policy (up to 720p/30);
  the shared helper's original conservative defaults remain unchanged elsewhere.
- Interrupted switching distinguishes retained publication ownership from
  temporary capture authorization. Signal reconnect/background cancellation
  immediately marks the stopped owned camera muted and gives Off/On retry
  guidance, without acquiring another camera automatically. The same publication
  and microphone survive; late native results cannot re-mute a newer user
  restart or a successor publication. Mounted real-SDK regression cases run on
  both platform normalizations and reject the preserved former source.
- Android lifecycle suspension, configuration and registry changes share one
  lock. Configuration additionally requires a resumed native Activity. A late
  configure cannot recreate processing after background/destroy cleanup, and
  foreground still requires explicit current-owner rebind.
- Inference, detection freshness, rendering time and output-buffer ownership are
  bounded. Missing subjects, unsupported formats, errors and overload return
  original video. This is **not a privacy-background feature**: the real
  background can become visible whenever processing falls back.
- Android skips texture conversion when it has neither fresh analysis nor an
  admitted inference job. Synchronous conversion/preparation and fallback paths
  also enforce the processing budget; model-unavailable/cooldown frames remain
  cheap original-frame pass-through. Deterministic production-processor tests
  use real SDK classes with only clock/executor control, including former-source
  counterexamples. These checks do not measure physical-device performance.
- Active means the native callback produced a transformed frame, not merely
  that a configuration call returned. It expires when processed output stops.
- The iOS camera Pod consumes the pinned SDK's actual frame-processor headers.
  Its importer context needs the same narrowly scoped non-modular React-header
  compatibility as the repository's two existing LiveKit Pods. The existing
  plugin now includes this exact target, preserves custom/inherited flags, and
  leaves unrelated Pods, app diagnostics and Swift modules unchanged. The
  validation runner executes generated Ruby boundary fixtures and verifies the
  actual Pods project settings before the complete unsigned Simulator compile.

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
`27fbc44bbcec100e1501d65b5c779ca75d7fb132` (including interrupted-camera recovery,
Android fallback budget repairs and the previously compiled target-scoped iOS
importer compatibility fix):

- Android: `831741a268f6535e817ae5af6deb3b5c1ad17a0e4274923fa9dfcf5baa93119e`
- iOS: `2379ee957676700297617c60ad6b4cdb76566df3d20e8f768c763f919277f594`

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
