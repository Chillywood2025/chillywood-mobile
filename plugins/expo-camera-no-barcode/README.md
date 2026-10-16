# Expo Camera Android without optional barcode providers

This deterministic patch targets only Expo Camera 17.0.10. `patches.json`
records the official npm tarball SHA-256, each original/patched file SHA-256,
and exact line changes. Upgrades and unexpected source edits fail before any
file is written. Repeated prebuild is idempotent. No iOS file is modified.

SDK 54 can link Expo Camera's published AAR by default. Editing its installed
Kotlin files alone does not change that binary. Production `package.json`
therefore requires `expo.autolinking.android.buildFromSource: ["^expo-camera$"]`.
Installed `expo-modules-autolinking` 3.0.27 passes this Android option to Gradle,
which converts entries to Kotlin regexes and matches the Gradle project name
`expo-camera`. The anchored pattern selects only that project and disables its
publication route. The config plugin fails before any source mutation when the
exact Android source-build setting is absent or changed. This is a production
build input, not a compile-check-only override; no dependency version changed.

The complete tracked application source audit found Expo Camera previews in
Player, Watch Party and `components/room/live-bottom-strip.tsx`, with no barcode,
URL-scanning or modern-scanner API calls. The retained test repeats that audit
for app/components/_lib/hooks. A future scanner feature requires explicit review.

Removed Android paths:
- `com.google.mlkit:barcode-scanning`
- `com.google.android.gms:play-services-code-scanner`
- `androidx.camera:camera-mlkit-vision`
- `barcode_ui` provider-download manifest metadata
- Scanner/analyzer/serializer implementations and optional provider probing
- The unused barcode `ImageAnalysis` use case and barcode-coordinate callbacks

The modern-scanner availability property returns false. URL scan, launch and
dismiss calls explicitly reject with `BarcodeScannerUnsupportedException`.
Enabling preview scanning or providing scanner settings also rejects; disabling
scanning is harmless. Enum values remain JS-compatible without provider imports.

Ordinary permissions, preview, photo and video handlers remain unchanged. The
`ImageProxy.PlaneProxy.toByteArray` helper is retained byte-for-byte at its
original package/file identity because ordinary photo capture imports it.

The config plugin validates all ten files before mutation. Unit tests exercise
actual installed dependency bytes, idempotence/reversibility, version/hash drift,
provider reintroduction controls, complete source-body preservation and app usage.
Tests also execute the installed autolinking resolver, verify its Android
configuration and camera source directory, and reject missing/wrong source-build
pins. Resolver metadata is not evidence that Gradle actually selected source:
the native compiler must additionally require the real `:expo-camera` source
project and its Kotlin task, rather than accepting the default publication.
The native CI compiler additionally compiles Expo Camera Kotlin and resolves the
actual application runtime dependency graph and merged app manifest, rejecting
MLKit/scanner artifacts, MediaPipe Tasks, GMS-hosted TFLite and downloader metadata.
It also requires the exact reviewed LiteRT and LiteRT API versions and SHA-256s
of the actual resolved AARs. Unrelated Firebase transport remains outside this
camera-provider check. These are compile/source proofs,
not installed-device qualification or proof that unrelated app SDKs send no data.

Upstream: https://www.npmjs.com/package/expo-camera/v/17.0.10
Source: https://github.com/expo/expo/tree/main/packages/expo-camera
Upstream Expo source is MIT licensed; retain its license in the installed package.
