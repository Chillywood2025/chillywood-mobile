# Gallery-app selection: source candidate, not installed proof

This optional Android Expo module adds an **installed gallery app chooser** to
the common attachment sheet. It does not replace the system photo library or
Files, does not hardcode a Google/Samsung package, and does not request storage
or broad media-library permission. It uses the repository's local-module
autolinking pattern; no `node_modules` patch or generated native tree is needed.

## Meaning and compatibility

`ACTION_PICK` receives an image/video MediaStore collection and returns one
selected URI. `Intent.createChooser` exposes matching installed handlers rather
than relying on a previously selected default. The module reports capability
only if a matching handler resolves, and handles disappearance before launch.
The OS/app chooses what handlers exist; this cannot manufacture a separate OEM
Gallery app when none is installed. It is **not a local-only guarantee**.
The narrow manifest queries expose these intent handlers, not all packages.
[Android Intent contract](https://developer.android.com/reference/android/content/Intent#ACTION_PICK)

The older shipped binary has no `ChillywoodGalleryPicker` module. The JavaScript
wrapper reports `requires_native_build`; the UI does not advertise Gallery app
there. iOS reports `different_platform` and continues using Apple's selected-item
Photos picker, with the corrected real-dismissal and authority checks in the
shared hook. This Android source is not an OTA-installed capability.

## API

- `capabilities("image" | "video")`: API version, availability, maximum selection
  `1`, and `localOnly: false`. It does not inspect library content.
- `launchGalleryAsync({ requestId, mediaKind, maximumBytes })`: canceled or one copied
  `asset` (`uri`, actual MIME, actual byte count, optional provider name), plus an
  opaque `selectionId`. A native request identity serializes chooser/import.
- `discardSelectionAsync(selectionId)`: deletes only this module's owned cache
  entry. The JS adapter retains its cleanup handle across later async adapter,
  coordinator and hook boundaries, not just the first native result check.
- `cancelRequestAsync(requestId)`: retires only that request and signals its
  provider/import stream. It does **not** settle or release an open chooser.

Only `content:` results are imported under the returned grant. Missing grants,
wrong type, empty content, malformed/multiple selections and oversized streams
fail closed. Byte copies are bounded without buffering the whole file. Failed
or lifecycle-retired copies are deleted. A non-exported proxy Activity owns the
platform result independently of Expo54's recreated-host callback keys. It
preserves request identity and launched state across recreation and remains
alive through importing to retain the selected URI grant. The process-local
registry never revives account authority: host destruction retires it, and
process-restored Activities without a matching request finish without relaunch.
The native lease ends only after real result/import settlement **and** proxy
Activity dismissal, not merely a timer or `finish()` request.

The chooser supports **one item per invocation** and is omitted from
`multiple: true` evidence requests; direct multi-Gallery requests fail clearly.
Photos/Files retain their existing multi-select behavior. This avoids
claiming portable multi-selection from an `ACTION_PICK` contract. Existing
surface limits, normalization, moderation, explicit Save/Upload/Publish and
selection cancellation remain outside this module and unchanged.

## Import cancellation, limits and cache ownership

The 60-second import deadline requests `CancellationSignal` cancellation and
closes the registered input stream independently, off the UI/deadline thread.
A blocking provider cancellation cannot prevent stream closure. The actual
provider-cancel and close executors each have at most two workers and no pending
queue; saturation is recorded, never converted into native settlement. The actual
reader/writer must exit before cleanup, native settlement or retry; cancellation
does not abandon a writer or permit its late result. Android does not guarantee
that a broken provider honors cancellation/close: such a provider can still
hold the operation pending, rather than falsely unlocking a live importer.

The generic image import cap is 250 MiB; creator video is 5 GiB, matching the
existing maximum movie upload policy. Profile avatar/background wrappers pass
their 10/20 MiB bounds and product photos pass 20 MiB. Other surface limits
still validate before upload; callers may pass a narrower `maximumBytes`.
Profile explicitly permits a bounded 250 MiB HEIC/HEIF input because its
existing size validation runs **after** conversion; other raw formats still
stop at the narrower limit. This does not change final upload validation.
Files remains an alternative, not a bypass of downstream validation.

Only generated UUID files are written. Actual total retained bytes and file
count impose a **6 GiB / 64-file** cache budget. A process-static cache directory
and opaque-ID map survive module/Activity recreation. First use in a genuinely
new process removes only prior-process Gallery-owned directories (including
partial writes); accepted Gallery drafts are currently memory-only, not saved
across process death. Same-process uploads/previews are never classified as
orphans. JVM tests execute two real processes to exercise this boundary.
When full, new Gallery imports fail with a clear Files alternative; the module
never evicts a file which a draft, preview, retry or upload may still need.
`retainPickedMedia(fileOrWrappedResult)` explicitly retains UI/send/recovery/
preview ownership, returning an idempotent release callback. Acquire a new owner
before clearing the previous one. `withPickedMediaRead(uri, start)` retains an
exact Gallery-issued URI through the **raw native reader promise**, outside any
caller timeout. `releasePickedMedia(fileOrWrappedResult)` requests deletion only
after every owner and raw reader is finished; it never deletes arbitrary URI
prefix matches. Failed, invalid or retired selections request cleanup
automatically. Accepted selections
remain app-owned until explicitly released or OS cache eviction; no claim is
made that every existing caller immediately releases accepted drafts. This
bounded-retention fallback prevents repeated imports growing without limit.

## Distinct future options, not implemented claims

`ACTION_PICK_IMAGES` documents `EXTRA_LOCAL_ONLY`, but that filters selectable
content; it does not promise a non-Google UI or installed gallery-app choice.
Expo ImagePicker17.0.11 does not expose it. A future local-only mode must check
the exact supported action rather than silently falling back to cloud-inclusive
content while keeping a device-only label.
[Android Photo Picker contract](https://developer.android.com/reference/android/provider/MediaStore#ACTION_PICK_IMAGES)

An inline grid inside our sheet is different work. Android's privacy-preserving
embedded picker requires Android14/API34 plus SDK Extensions15; older devices
need an honest native-picker fallback. It still includes device/cloud media by
default, so embedding alone does not solve local-only selection.
[Android embedded picker](https://developer.android.com/training/data-storage/shared/photo-picker/embedded)

For iPhone, retain PHPicker's selected-item access rather than requesting broad
Photos access to draw a custom grid. A future iOS17+ inline PhotosUI host can
embed the system picker, with the modal system picker on older supported iOS.
It needs a Swift native view/module and per-platform lifecycle/import tests;
do not invent a cloud-exclusion filter. Current iOS video import explicitly
uses HighestQuality export to avoid Expo17's PHAsset Passthrough resource branch;
the sheet discloses possible conversion, and Files remains available.
[Apple embedded Photos picker](https://developer.apple.com/videos/play/wwdc2023/10107/),
[Apple selected-item privacy](https://developer.apple.com/documentation/photokit/selecting-photos-and-videos-in-ios)

## Verification and release gates

Executed locally: production shared-hook/JS-adapter tests, actual Java importer
JVM tests, source-boundary tests, TypeScript and lint. Source tests are **not**
Kotlin/Android compilation, intent-resolution proof, or installed experience.
This executor has no Android SDK/ADB or Xcode/iOS device, so those checks remain
unrun. No Android/iOS build, publication, OTA or deployment was performed.

Before any new binary is called ready:

1. Required Validation's existing Native SDK compiler now requires actual
   Gallery/Core/ImagePicker Debug and Release Kotlin/Java compilation, eight
   real proxy Activity/contract Robolectric tests (zero skips), actual runtime
   source closure, and the exact-version Expo registry lifecycle suite. Generate
   in a disposable workspace; inspect module autolinking, scoped queries,
   permissions, native digest/runtime and unchanged iOS entitlements. Compile the
   Android module against the locked Expo54 dependencies; run native tests.
2. Test a handset with a separate OEM gallery installed, another with only one
   handler, and no-handler coverage. Confirm the actual chooser and resulting
   cached bytes, not just JavaScript labels. Keep provider package/device data
   out of ordinary logs.
3. Test JPEG/PNG/WebP/HEIC and MP4/MOV; malformed/unreadable/empty/oversized media;
   cancellation; rapid repeated taps; previous-file preservation; background,
   activity recreation (`Don't keep activities`, while process survives),
   process death, query/open/read cancellation and deadline, full cache without
   evicting an active draft; account/session/target changes during
   native selection and copying. Verify exact old-result cleanup.
4. Independently test iPhone PHPicker limited-library/no-broad-permission flow,
   actual app-sheet dismissal, iCloud-only video import/failure, compatible
   conversion, Files, cancel/retry and current identity. Test VoiceOver/Dynamic
   Type and Android TalkBack/font scaling for the shared sheet.
5. Bind platform/source/runtime/native digest to the separately authorized build
   and release process. Source approval is not distribution or OTA authority.
   Existing `git-native-inputs/v1` already includes local module registration and
   Android source; regression tests prove this differs from old-binary inputs.
   No V18 binary receipt or runtime version is rewritten to claim this new code
   is installed. Android/iOS new builds and all OTA publication remain held.
