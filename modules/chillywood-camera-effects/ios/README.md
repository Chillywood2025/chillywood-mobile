# iOS outgoing camera effects

`ChillywoodCameraEffectsModule` is a synchronous Expo module backed by the
`VideoFrameProcessorDelegate` hook in `@livekit/react-native-webrtc` 144.0.0.
Its Core Image result becomes a new `RTCVideoFrame` returned to the WebRTC video
source, so this is an outgoing-camera transformation, not a preview overlay.
The original timestamp is retained. Processed pixels are oriented upright with
rotation zero; original fallback frames keep their original pixels and metadata.

The public Objective-C header is Foundation-only. A small private runtime bridge
looks up `WebRTCModule` and its queue through the verified React Native bridge
selectors, without importing `WebRTCModule.h` or its React headers. The processor
directly imports the actual SDK `VideoFrameProcessorDelegate` and the controller
directly imports `ProcessorProvider`, preserving compiler-checked SDK signatures.
These two headers import only WebRTC frame/capturer headers in 144.0.0.
CocoaPods sanitizes the dependency's framework/module name to
`livekit_react_native_webrtc`, so that prefix is selected first; a conditional
fallback handles the hyphenated non-framework public-header directory. No new
non-modular-header suppression flags are added. Actual framework/module build
behavior must be confirmed by the simulator compilation gate. Changing the
pinned SDK requires reviewing and compiling this boundary again.

## Contract and lifecycle

- `capabilities()` returns `studioLighting`, `chicagoSkyline`, `crimsonAura`,
  `neonEdge`, `spotlight`, `depthMode` (always
  `subject-parallax`), and an optional reason. It describes API/GPU availability,
  not completed device validation.
- `configure(trackId, effect, intensity)` returns a unique registered
  `processorName`, or null for Off, zero intensity, or an unavailable setup.
  JS must attach the returned name using the actual local camera track's
  `_setVideoEffects([name])`, or detach using `_setVideoEffects([])`.
- `status(trackId)` reports Off/starting/active/unavailable/error and the number
  of transformed frames returned for the current configuration. `active` is
  set only after a transformed frame has actually been returned to WebRTC and
  expires after 200 ms without another transformed output.
- `release(trackId)` synchronously disables the processor before removing its
  provider entry. JS must also detach the track's effects. Destruction releases
  all entries. The provider's unsynchronized dictionary is accessed only on
  `WebRTCModule.workerQueue`, including with React Native's bridge proxy.
- Every configuration/camera-orientation/size/facing change invalidates cached
  analysis through a generation. Off and release synchronously invalidate
  in-flight results. Frames already handed to the encoder cannot be recalled.
- Native Expo background listeners immediately disable all processors even when
  JS is suspended and enqueue registry cleanup without blocking the main thread.
  Foreground permits new configuration but does not resurrect
  old effects; JS must rebind/reselect its authorized camera on becoming active.

## Effects and bounded work

Studio Light detects a primary face with Apple Vision, tracks the rectangle
between periodic detections, measures local face luminance, and applies a soft,
bounded exposure/shadow/key-light adjustment. It does not reshape faces.

Chicago Skyline uses Vision person segmentation and an original, locally drawn
Chicago illustration. Three illustrated background layers move by at most 2.3%
of frame width, with smoothed movement derived from the person-mask centroid.
This is restrained 2.5D subject parallax. It is **not** measured depth, LiDAR,
TrueDepth, or a physical 3D reconstruction. No sensor-depth capability is claimed.
Intensity blends the background replacement while retaining the foreground.

The more visible creative options share the same Vision person mask:

- `crimson-aura`: a broad, soft crimson glow outside the person's silhouette
- `neon-edge`: a bright cyan-to-magenta contour with a soft outer glow
- `spotlight`: the original background darkened behind the person, with a violet
  spotlight moving smoothly on a 12-second loop, without a flash or strobe

Each composites the original person back over the modified background last, so
the confident foreground and face interior retain their source pixels. Creative
intensity uses a continuous square-root response so 25% is visibly meaningful;
exactly zero still bypasses processing. Broad blur and outline morphology run
on a mask at most 384 pixels per edge to bound GPU work. Only the skyline effect
creates skyline assets. The non-studio effects do not run a face detector.

Vision runs on a serial worker, with a global nonblocking admission slot allowing
only one inference in flight across all processor instances, including during
rapid release/recreation. Each processor schedules at most 15 requests per
second, on an image no larger than 512 pixels per edge. Capture
never waits for Vision. Cached masks/faces older than 200 ms are rejected;
inference taking over 120 ms is discarded with a retry cooldown. Rendering has
a 20 ms observed budget and an allocation-thresholded pixel buffer pool. Slow
rendered frames are discarded and the source is returned; this is a post-render
budget check, not a hard real-time GPU cancellation guarantee. Thermal pressure,
stale/missing detections, unsupported layouts, oversized inputs, and errors all
preserve the original camera frame. Native work contains no network requests,
paid SDKs, camera-frame storage, or logging of camera data.

Front and rear cameras use their source pixels and WebRTC rotation metadata.
Facing changes flush analysis even if dimensions stay the same. Preview-only
mirroring remains the preview renderer's responsibility. The implementation
supports BGRA and 8-bit NV12 camera buffers up to 1920×1080 pixels; adapted/cropped
buffers whose visible dimensions differ from the backing buffer and HDR formats
fall back rather than guessing mask alignment.

## Verification

Portable policy tests (no Apple SDK required):

```sh
cc -std=c11 -Wall -Wextra -Werror -pedantic \
  modules/chillywood-camera-effects/ios/tests/camera_effect_math_test.c \
  -lm -o /tmp/chillywood-camera-effect-math-test
/tmp/chillywood-camera-effect-math-test
```

The Linux authoring environment cannot compile/link Apple's frameworks, run
Vision, or verify camera/encoder behavior. Before claiming native readiness:

1. Run an iOS CocoaPods/autolinking build with the pinned WebRTC pod, including
   Swift/Objective-C visibility and the React Native new-architecture bridge.
2. On physical devices, verify the **remote receiver's** rendered video, not
   just the local preview, for all five effects at 25%, 50%, and 100%, plus zero.
3. Cover front/rear switches, all four rotations, foreground/background, poor
   light, no person/no face, rapid motion, different hair/skin/backgrounds,
   720p/1080p, a slow device, and thermal pressure.
4. Toggle Off during inference/render, switch effects rapidly, replace/end the
   camera track, leave/rejoin, and verify no old mask is applied and frames
   continue. Check pool pressure and capture/encode frame time on device.

API references reviewed:

- [Vision person segmentation](https://developer.apple.com/documentation/vision/vngeneratepersonsegmentationrequest)
- [Vision sequence handler](https://developer.apple.com/documentation/vision/vnsequencerequesthandler)
- [Vision object tracking](https://developer.apple.com/documentation/vision/vntrackobjectrequest)
- [CocoaPods module naming](https://guides.cocoapods.org/syntax/podspec.html#module_name)

The provider and delegate signatures were inspected directly in the installed
144.0.0 package. API review and portable tests do not replace the native build
or physical outgoing-video evidence above.
