# Owned Android audio contract fixture

Run from the repository root with JDK 17 or newer:

```sh
JAVA_HOME=/path/to/jdk17 node scripts/test-owned-android-audio-session.mjs
```

The runner applies the exact Expo plugin to disposable SDK packages, verifies
the generated hashes and idempotence, then compiles the complete generated
`AudioSwitchManager.java`, production `ChillywoodOwnedAudioSession.java`, and
pinned SDK `AudioDeviceKind.java`, together with the production
`ChillywoodAudioTrackRoute.java` and `ChillywoodAudioModuleAccessor.java`.
No lifecycle or routing methods are extracted,
rewritten, or reimplemented for the passing run. Temporary generation and class
files are deleted in `finally`.

The Java fixture controls the Android main queue and monotonic clock, framework
route availability/request acceptance/selected output, the AudioSwitch scanner
and cached preference, and React Native promise delivery. Framework and scanner
operations assert main-thread execution. Accepted selection requests can leave
the actual output unchanged. Scanner discovery, stale callbacks, device removal,
and cleanup failures can be scheduled independently.

Behavioral cases exercise owner replacement before queued work runs, stale
release and selection work, pending reads, bounded readiness/selection timeouts,
raw SDK mutation fences, API levels below 31, default device priority, listener
ownership, scanner-only availability events, stale scanner callbacks, and
retained manager/listener cleanup after failures. Startup fallback cases require
OS readback after an accepted request, preserve external routes and candidates,
wait for the preferred scanner device, and distinguish automatic route requests
from manual selections when an accessory appears. Deliberately broken variants
must fail specific behavioral cases; a mutant that compiles and passes fails
the runner.

## API 30 observation and source pins

API 31 and newer use `AudioManager.getCommunicationDevice()` for the selected
route. API 30 uses the existing shared WebRTC playout track. Before and after a
route read, the production probe requires the actual `WebRTCModule` factory ADM,
the options ADM, the LiveKit ADM, the observer ADM, and the current inner
`AudioTrack` identity to agree. The track must be initialized and playing.
Only that track's `AudioTrack.getRoutedDevice()` supplies the route receipt.
This proves the OS route reported for the playing track; it does not prove
audible sound reached a person.

The AudioSwitch selected-device cache and `AudioManager.isSpeakerphoneOn()` are
never selected-route proof. Android 30's broker updates `mForcedUseForCommExt`
before its queued native routing command executes. AudioSwitch selection and
`setSpeakerphoneOn()` are actuators only. A request can remain pending or fail
while the actual track still reports its previous output.

The plugin pins `@livekit/react-native` 2.10.0 and
`@livekit/react-native-webrtc` 144.0.0, including hashes for the native dependency
declaration (WebRTC 144.7559.01), R8 rules, actual factory source, and options
source. It preserves the reviewed sender patch. A generated accessor in the
factory package reads its existing package-private ADM field. Narrow reflection
reads only the bundled SDK's private `WebRtcAudioTrack.audioTrack` field; no
hidden Android API is used. Its exact name, private/nonstatic modifiers, type,
and enclosing class are checked. Missing or changed shape disables route
capability while ordinary session startup remains available.

The exact pinned WebRTC release maps to `ec20be4`. Its sole STOP callback runs
inside the nonnull-track branch, after `AudioTrack.stop()` and before release
nulls the field. START and STOP capture the existing track identity before
posting observer work. A replaced track cannot complete a selection issued for
its predecessor. Listener registration and removal failures revoke capability
and retain the exact listener for cleanup retry; the initial acquisition
receipt cannot optimistically advertise failed registration. Acquisition before
playout remains nonblocking and reports no selected route.

Primary source references:

- [WebRTC Android 144.7559.01 release](https://github.com/webrtc-sdk/android/releases/tag/v144.7559.01)
- [Pinned WebRtcAudioTrack source](https://github.com/webrtc-sdk/webrtc/blob/ec20be4/sdk/android/src/java/org/webrtc/audio/WebRtcAudioTrack.java)
- [Pinned JavaAudioDeviceModule source](https://github.com/webrtc-sdk/webrtc/blob/ec20be4/sdk/android/api/org/webrtc/audio/JavaAudioDeviceModule.java)
- [Android AudioTrack.getRoutedDevice documentation](https://developer.android.com/reference/android/media/AudioTrack#getRoutedDevice())
- [Android 30 AudioDeviceBroker source](https://android.googlesource.com/platform/prebuilts/fullsdk/sources/android-30/+/refs/heads/main/com/android/server/audio/AudioDeviceBroker.java)

The fixture independently controls actual track route and requested flags,
factory/options/LiveKit ADM identities, playback state, inner-track replacement
during a read, delayed old STOP and routing callbacks, and listener failures.
It checks that the observer never plays, stops, releases, or creates substitute
playout. API 30 cases reject any API 31 calls. Two successfully compiled SDK
shape variants (renamed private field and wrong private field type) must disable
routing at runtime; compiler errors do not satisfy those controls. Behavioral
mutants also remove factory binding, post-read identity, per-request track
binding, playing-state guards, observer readiness, or substitute cached route
preference, and must fail the relevant assertions.

The Kotlin bridge is checked for exact forwarding and route event wiring but is
not compiled here. Android, React Native, and AudioSwitch are controlled edges,
not the real operating system or scanner library. These contracts do not prove
an Android app build, installed device behavior, selected physical output,
audible speech, moving video, or any provider behavior. Those require separate
platform build and paired-device evidence.

`--check-source` runs only generation, hash, idempotence, and bridge source checks;
its output explicitly records that compilation and behavioral execution did not
run.
