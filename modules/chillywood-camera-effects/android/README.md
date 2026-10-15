# Android outgoing camera effects

The local Expo module registers one uniquely named processor per configured
camera track. The JavaScript binding applies that name through the pinned
`@livekit/react-native-webrtc` capture API. Pixels are transformed before the
`VideoSource` feeds the encoder, so the local camera track and remote receivers
use the same processed stream. This code does not create a display overlay.

## Implementation constraints

- Face-following studio lighting uses bundled ML Kit face detection and samples
  the face's current luma for a feathered, highlight-preserving key light.
- Chicago Skyline uses a real selfie foreground-confidence mask, original
  procedural skyline art and different layer offsets driven by subject centroid.
  This is subject-based 2.5D parallax, not hardware or metric depth.
  Intensity controls background replacement opacity as well as parallax, and
  fresh centroid samples are smoothed within each processor generation.
- Crimson Aura creates a broad crimson halo immediately outside the segmented
  person. Neon Edge draws a stronger cyan/magenta outer contour. Both use a
  bounded mask-distance field and preserve fully foreground subject pixels.
- Spotlight darkens the original background and moves a soft colored light
  behind the person on a smooth 12-second orbit, without rapid flashing. All
  three stronger effects reuse the same bundled segmentation model and have
  visibly different output at 25% and 100% intensity.
- NV21 inference includes the original camera rotation. Upright face/mask
  coordinates are mapped back into raw I420 planes before composition. Output
  retains the input dimensions, rotation and timestamp.
- Capture must be even-sized and at most 1280 by 720 (or its portrait transpose).
  The JavaScript binding requests this; unsupported incoming frames pass through.
- Only one inference can be in flight, including across replacing generations.
  Private NV21 bytes are
  used asynchronously; camera frames are never held for inference. Results
  expire 250 ms after capture, including inference time.
- Three pooled output buffers bound memory while downstream consumers retain
  references. Slow composition pauses effects temporarily; stale detection,
  unavailable models, pool pressure and errors preserve original video.
- Closing a generation disables it immediately. Expo destruction/backgrounding
  releases registrations and ML resources. Late asynchronous results cannot
  reopen a closed generation. The JS layer rebinds after foregrounding.
- Provider mutations run on the pinned WebRTC module executor because its
  provider map is not thread-safe. The bridge package placement is intentional.
- For this pinned WebRTC wrapper, `null` is the safe passthrough value. A new
  output has one reference, which the wrapper releases. Never return the input
  without retaining it, or chain another processor without rechecking ownership.
- Android detachment passes a `null` names argument to the pinned WebRTC API.
  The unpatched SDK's empty array creates an empty processor chain that incorrectly
  releases the input twice. The version/hash-checked
  `withWebRtcCameraEffectOwnership` prebuild plugin fixes that path because a
  delayed attach can resolve an already-removed provider even when Off passes
  null. Real SDK executor tests cover both queue orderings; the old SDK is a
  required failing control.
- Native suspension and configure share one lifecycle monitor. A currently
  resumed Activity is required at configure time, background marks suspension
  before cleanup, and destruction is terminal. Foreground does not recreate
  processors without a new explicit configuration.

## Privacy and dependency review

The selected versions are bundled `face-detection:16.1.7` and
`segmentation-selfie:16.0.0-beta6`. There is no account creation, cloud inference,
image upload or downloaded model in this implementation. Selfie segmentation
is a beta API and must remain pinned until a reviewed upgrade.

This does **not** mean zero SDK telemetry. Google documents on-device processing
of inputs and outputs, plus collection of API diagnostics such as device/app
details, installation identifiers, latency, image dimensions, feature events and
errors. No supported telemetry opt-out was found in the documented public API.
Expo Camera already includes ML Kit barcode SDKs, but that does not prove the
app's existing privacy policy or store disclosures cover these additional uses.
Review these before any release:

- https://developers.google.com/ml-kit/terms
- https://developers.google.com/ml-kit/android-data-disclosure
- https://developers.google.com/ml-kit/vision/face-detection/android
- https://developers.google.com/ml-kit/vision/selfie-segmentation/android

## Validation

`JAVA_HOME=/path/to/jdk bash modules/chillywood-camera-effects/android/run-math-tests.sh`
runs the standalone compositor/rotation/stride/mask tests without an Android
SDK. `run-capture-contract-tests.sh` additionally needs
`CAMERA_EFFECTS_TEST_CLASSPATH` pointing at real Android, pinned WebRTC and ML Kit
dependency jars. It tests the actual WebRTC wrapper's frame ownership, pooled
buffer lifetime and closed-generation fallback without initializing ML Kit.
`run-lifecycle-tests.sh` executes the production admission policy, including
background/late-configure, foreground/rebind and concurrent cleanup ordering.

These host-JVM checks do not replace a full Android Gradle/Kotlin build or a
physical-device call. Before release, verify portrait/landscape, front/rear
cameras, subject edges, low light, device thermal load, repeated toggles,
background/foreground, track republish/reconnect and a second participant
actually receiving the effect. Status becomes active only after an output
frame is produced, which is not proof of remote receipt.
