# Android picker Activity-recreation repair

## Scope and evidence boundary

This is an exact-source repair for `expo-modules-core@3.0.30` and
`expo-image-picker@17.0.11`, with the existing React Native 0.81.5 new-architecture
runtime. It does not upgrade packages, add permissions, reset the global request
allocator, unlock on a timer, or import a previous process's picker result.

The supported Expo path is Camera / ImageLibrary with `allowsEditing: false`.
All shared Expo attachment launches must keep that option. A separate native
Gallery module is outside this vendor patch. The vendor's editing /
crop recreation pipeline is **not repaired** or used by the shared adapter.
Files uses its separate direct activity-result implementation and is untouched.

When an external picker destroys MainActivity while ReactHost/AppContext and the
original coroutine survive, upstream unregister removes the original callback.
Re-registration uses a different key, leaving the old request result pending
without its original continuation. The retained callback must instead settle
the original request; a new screen or picker request cannot adopt it.

`withExpoImagePickerAndroidResultRetention` checks both package versions and all
six reviewed predecessor/output SHA-256 values before writing. It rejects
shared/symlinked dependency escapes. `package.json` forces precisely Expo Camera
and ImagePicker to compile from source; the published ImagePicker AAR does not
contain this repair. Generated native directories are not committed.

## Ownership and lifecycle

- A separate generic core opt-in interface avoids changing the existing
  contract ABI or recognizing obfuscation-sensitive class names. Only the two
  no-edit ImagePicker inputs implement it.
- ON_DESTROY removes the old Activity lifecycle observer but preserves only
  the launched request's main callback, contract, original input, and mapping.
- An actual success/cancel result resumes that original continuation. The old
  key is consumed once and released in `finally`; later duplicate results have
  no mapping. New registrations remain independent.
- Unreadable/revoked URI provider exceptions become the vendor's existing Error
  result for no-edit picks. ImagePicker then rejects its original promise and
  releases native ownership instead of throwing before the continuation runs.
- In-flight opted-in requests are omitted from persisted fallback snapshots:
  a new process cannot reconstruct the JS account/target that owned them. All
  non-opted-in persistence behavior is unchanged.
- Full AppContext destruction still cancels module scopes and disposes these
  callbacks on the main thread, using a main Handler when destruction arrives
  off-main. It does not use the already-cancelled coroutine queue.
- Shared JS still holds its native picker lease through actual settlement and
  copying/import. Navigation, account change, or unmount discards stale results;
  it does not release an in-flight lease or transfer ownership to another screen.

## Automated checks

`node --test tests/android-picker-result-retention.test.mjs
tests/expo-camera-no-barcode.test.mjs` validates source transformations,
fail-closed guards, source-build configuration, and ownership boundaries. These
checks alone are **not** native lifecycle or physical-device evidence.

The hosted native SDK gate must compile Debug and Release Kotlin/Java for the
actual autolinked `:expo-modules-core` and `:expo-image-picker` source projects,
verify their source roots and the app's resolved runtime graph, then invoke:

```sh
node scripts/test-android-picker-result-retention.mjs \
  artifacts/native-camera-compile/run-EXAMPLE/project
```

The argument is the existing disposable Expo-generated native SDK project,
never a source checkout. The runner executes the production registry under
AndroidX lifecycle/Robolectric, plus the actual internal Camera/Library/Crop
contracts. It verifies complete, non-skipped JUnit results; disables retention,
removes exact-key cleanup, and restores unsafe snapshot persistence as separate
production-source negative controls; then restores sources and reruns baseline.
Compilation failure, missing XML, skipped tests, and setup errors cannot count
as a rejected negative control. The runner adds only test-scoped JUnit 4.13.2
and Robolectric 4.11.1 dependencies already pinned in Expo core.

No Android SDK, emulator, or physical device was present in the implementation
container. Native compilation and these executable Kotlin tests must therefore
be established by the hosted gate, not inferred from Node source checks.

## Required device QA before a native release

Use the exact candidate native build after release/build authorization. Do not
substitute an OTA into an older native binary. Record only platform/version,
source/native digest, result counts, and redacted outcomes; no private media,
provider payloads, or raw device identifiers.

1. On Android, enable **Don't keep activities** for this test and confirm that
   the Activity is recreated while the React host stays alive. For Studio,
   profile avatar/banner, comments and representative shared attachment callers:
   open Photos, select one/multiple supported assets, return, verify exactly one
   import to the original target, then immediately open another picker.
2. Repeat with Cancel and system Back, Photos plus Camera, and permission denial
   followed by retry. No sheet should reopen, promise hang, or duplicate appear.
3. Keep an external picker open across repeated app background/foreground and
   host recreation. An unrelated new request must remain blocked until the real
   result settles; it must never receive the old request's asset.
4. While external UI/copy is pending, invalidate the original JS owner through
   navigation/unmount or account change. Return a result: stale data is discarded
   and no new account/target receives it. A fresh pick works after settlement.
5. Exercise revoked/unreadable provider URIs and cancel while import/copy is
   pending. The original request must reject/cancel once and permit a subsequent
   pick only after its actual work ends.
6. Kill the process while the external picker is open, relaunch, and verify no
   previous-process media is automatically imported. Test Files separately as a
   regression control; it must remain independent of this vendor patch.
7. Disable Don't keep activities again and repeat normal success/cancel/retry.

Do not claim full picker completion without the applicable hosted native pass
and recreation/device evidence. Editing/cropping recreation remains outside
this no-edit app contract.
