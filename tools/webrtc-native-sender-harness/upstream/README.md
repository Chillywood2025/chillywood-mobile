# Pinned Java disposal wrappers

`MediaStream.java` and `MediaStreamTrack.java` are retained from the official
WebRTC `refs/branch-heads/7559` Android Java sources, retrieved 2026-10-08:

- https://webrtc.googlesource.com/src/+/refs/branch-heads/7559/sdk/android/api/org/webrtc/MediaStream.java
- https://webrtc.googlesource.com/src/+/refs/branch-heads/7559/sdk/android/api/org/webrtc/MediaStreamTrack.java

The app's locked `@livekit/react-native-webrtc` 144.0.0 uses the native Android
artifact `io.github.webrtc-sdk:android:144.7559.01`. These source snapshots are
hash-pinned in `scripts/webrtc-native-release-contract.mjs`; source attribution
and the BSD license are retained. They are test fixtures, not shipped source.

The test compiles their actual Java ownership, removal, disposal and disposed
handle checks alongside the exact generated React Native bridge methods.
Only the JNI declarations receive deterministic test implementations; the
Java methods implicated by the physical crash execute unchanged. Minimal
AudioTrack/VideoTrack subclasses retain their native-handle delegation. React's
single executor is represented by an ordered queue. Capture ownership disposal
is counted, while camera hardware, the JVM-to-C++ boundary, and the signed app
process must still be validated on Android.

The old bridge and separate missing-audio/missing-video-detachment mutations
must throw `MediaStreamTrack has been disposed`. The repaired bridge must
preserve release(false), unrelated captures, and single owner disposal while
retiring recovered tracks shared by several native streams in either order.
