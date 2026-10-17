# Expo Camera Android without optional barcode providers

This deterministic patch targets Expo Camera 17.0.10 and Expo Dev Launcher
6.0.21. `patches.json`
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

Actual app dependency resolution also found the two scanner SDKs imported
unconditionally by Expo Dev Launcher's Gradle file, with `barcode_ui` metadata
in its main manifest. Its sole scanner implementation is the development
launcher's QR action. Three additional version/hash-pinned source changes remove
those SDK edges and metadata and replace that action with an explicit error:
"QR scanning is disabled in this build. Enter the development server URL
manually." The existing error callback displays this message. Manual URL launch,
discovered development servers, launch history and all other launcher methods
are unchanged. No build variant is excluded from the provider guard to hide
this dependency. This removes a development-tool scanner, not an app effect.

The reviewed Dev Launcher npm archive is
`https://registry.npmjs.org/expo-dev-launcher/-/expo-dev-launcher-6.0.21.tgz`,
SHA-256 `e259fc80b71f36155f8487498c0b1af33e921349083ebb96b7c5f03ba864f5e7`.
Its cached archive bytes were verified against the unchanged package-lock
SHA-512 integrity; `patches.json` retains both values and all three file hashes.

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

The config plugin validates both package versions and all thirteen files before
any mutation across either package. Unit tests exercise
actual installed dependency bytes, idempotence/reversibility, version/hash drift,
provider reintroduction controls, complete source-body preservation and app usage.
Tests also execute the installed autolinking resolver, verify its Android
configuration and camera source directory, and reject missing/wrong source-build
pins. Resolver metadata is not evidence that Gradle actually selected source:
the native compiler must additionally require the real `:expo-camera` source
project and its Kotlin task, rather than accepting the default publication.
They also prove launcher version/hash drift and provider restoration cannot
leave camera files partially patched, and preserve the manual URL action body.
The native compiler must compile the changed Dev Launcher debug Kotlin and
inspect both Debug and Release application dependency graphs and manifests.
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
