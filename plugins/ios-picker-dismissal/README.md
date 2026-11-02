# iOS picker dismissal barrier

This maintained config plugin targets the lockfile's **expo-image-picker
17.0.11** and **expo-document-picker 14.0.8** only. No SDK upgrade is included.
`patches.json` records each package's npm integrity and every original/patched
source digest. Unknown versions, lock integrity, source, existing helper, and
dependencies resolved outside the disposable project fail before any write.

## Why native code changes

Expo ImagePicker's legacy camera/photo and PHPicker delegates forwarded selected
media or cancellation before `dismiss(animated: true)`. Cancellation could resolve
the JS promise immediately; a fast successful import could do so too. A JS lease
held until that promise settles therefore did not establish that UIKit was ready
for the next attachment/source sheet.

Expo DocumentPicker's delegate likewise forwarded Files selection/cancellation
without a dismissal receipt. Files can already be auto-dismissing at that point.
The same barrier covers its events without replacing its selected-item importer.

The helper accepts exactly one result and forwards it only after:

- the explicit UIKit dismissal completion;
- an already-running dismissal transition completes without cancellation;
- `presentationControllerDidDismiss`, including interactive dismissal; or
- the picker already has no presenter and is not being dismissed.

A cancelled interactive transition is explicitly dismissed before forwarding.
An in-flight transition with no coordinator falls back to UIKit's dismissal
completion, not a timer. Duplicate/later delegate events cannot overwrite a
selection, cancel a subsequent operation, or settle twice. The pending callback
retains its native delegate when the JS caller unmounts and releases it on
completion. Missing-current-view-controller errors still reject before any UI
is presented in the unchanged Expo modules.

UIKit's transition registration Boolean describes the animation block, not a
promise settlement receipt; it is never treated as permission to resolve JS.
The helper and UIKit callbacks are main-actor isolated.

References: [UIKit dismissal completion](https://developer.apple.com/documentation/uikit/uiviewcontroller/dismiss(animated:completion:)),
[transition completion](https://developer.apple.com/documentation/uikit/uiviewcontrollertransitioncoordinator/animate(alongsidetransition:completion:)),
[interactive dismissal](https://developer.apple.com/documentation/uikit/uiadaptivepresentationcontrollerdelegate/presentationcontrollerdiddismiss(_:)),
and [selected document URLs](https://developer.apple.com/documentation/uikit/uidocumentpickerdelegate/documentpicker(_:didpickdocumentsat:)).
Expo uses document import/as-copy mode; imported temporary documents remain
available beyond dismissal until application termination. The patch does not
change their copying, security scope, type filters, metadata or error handling.

## Build and privacy boundary

`app.config.ts` installs `withIosPickerDismissal` for iOS prebuild. The plugin
copies the reviewed helper into each SDK and forces those two podspecs to compile
source, never an unpatched optional XCFramework. It changes no Android code,
permissions, entitlements, usage descriptions, release settings, selected Photos
privacy, PHPicker representation/cloud import, camera options, transcoding,
file-system copying, or module promise/error processing.

**A new iOS binary is required. An OTA cannot install this native correction.**
The user has explicitly held new builds and OTA until the resumed tasks are
completed as far as possible. This source change does not start a distribution
build, deployment, submission, release, or runtime/cohort migration.

## Verification and remaining device coverage

- `node --test tests/ios-picker-dismissal.test.mjs` checks exact patching,
  reversibility/idempotence, fail-before-write and shared-dependency confinement.
- `node scripts/test-ios-picker-dismissal.mjs --check-source` generates the real
  patched files in disposable package roots and checks their hashes. It does
  **not** compile or execute Swift.
- `node scripts/test-ios-picker-dismissal.mjs` in the existing macOS Native SDK
  required lane compiles/runs the complete actual helper and delegate sources
  with controlled UIKit edges, rejects all six original premature-result paths
  and early/duplicate-result mutations, and compiles those actual sources plus
  Expo's status-bar controller against the real UIKit/PhotosUI simulator SDK.
  No timer or sleeps drive the controlled lifecycle tests.
- The existing generated-native compile lane must compile the actual
  `ExpoImagePicker` and `ExpoDocumentPicker` source pod targets as well.

The Linux workspace has no Swift/Xcode toolchain. Source checks are not a claim
that hosted Swift compilation, real UIKit UI transitions, or devices passed.
The controlled harness is not real UIKit runtime evidence. Once a new binary is
authorized and available, exercise iPhone/iPad Photos, Camera and Files cancel,
success, interactive sheet dismiss/cancelled swipe, automatic Files dismissal,
parent/navigation removal, no-coordinator/nonanimated dismissal, cloud import,
import failure, rapid cancel/reopen, and caller unmount/navigation. Verify the
next source sheet presents once and stale callbacks do not target newer work.
