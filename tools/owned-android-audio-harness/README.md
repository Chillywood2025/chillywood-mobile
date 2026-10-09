# Owned Android audio contract fixture

Run from the repository root with JDK 17 or newer:

```sh
JAVA_HOME=/path/to/jdk17 node scripts/test-owned-android-audio-session.mjs
```

The runner applies the exact Expo plugin to a disposable SDK package, verifies
the generated hashes and idempotence, then compiles the complete generated
`AudioSwitchManager.java`, production `ChillywoodOwnedAudioSession.java`, and
pinned SDK `AudioDeviceKind.java`. No lifecycle or routing methods are extracted,
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

The Kotlin bridge is checked for exact forwarding and route event wiring but is
not compiled here. Android, React Native, and AudioSwitch are controlled edges,
not the real operating system or scanner library. These contracts do not prove
an Android app build, installed device behavior, selected physical output,
audible speech, moving video, or any provider behavior. Those require separate
platform build and paired-device evidence.

`--check-source` runs only generation, hash, idempotence, and bridge source checks;
its output explicitly records that compilation and behavioral execution did not
run.
