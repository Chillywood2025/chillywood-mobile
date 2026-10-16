# Isolated Android inference acceptance

This test compiles the production `LocalCameraInference`, `LocalInferenceMath`,
and `EffectMath` sources unchanged into a small self-instrumenting test APK. It
does not build or launch the app. The only dependencies are two SHA-256-pinned
standalone LiteRT 1.4.1 AARs downloaded from Google Maven by the build host. The
exact bundled models and their license inventory must match the reviewed pins.

The test APK declares **no permissions**, activities, providers, receivers or
services. It has no account data, camera access, Play services, runtime downloads
or telemetry SDK. The application UID cannot use Android Internet permission.
It is signed with a disposable test-only identity that is deleted with the
temporary build directory; no app/release signing material is used.

## Commands

From the repository root:

```sh
# Offline checks; this does not run inference or need an SDK.
node scripts/test-local-camera-inference-offline.mjs --source-check
node --test tests/ci/local-camera-inference-validation.test.mjs

# Requires JDK 17, Android SDK platform 35 and build tools 35.0.0.
JAVA_HOME="$JAVA_HOME_17_X64" node scripts/test-local-camera-inference-offline.mjs --build-only

# Also requires installed emulator, avdmanager and this official AOSP image:
# system-images;android-35;default;x86_64
JAVA_HOME="$JAVA_HOME_17_X64" node scripts/test-local-camera-inference-offline.mjs --emulator

# Optional: explicitly target your disposable, already running AOSP emulator.
# Physical-device serials and images containing Play services are rejected.
JAVA_HOME="$JAVA_HOME_17_X64" node scripts/test-local-camera-inference-offline.mjs --serial=emulator-5554
```

The runner never accepts SDK licenses. The reusable workflow installs missing
official SDK components only under licenses already present on the hosted
runner. It does not change host KVM permissions. Emulator startup/instrumentation
and the CI job have explicit deadlines; failure is mandatory, never skipped.
Owned emulator state and the APK are removed after execution. A supplied
emulator must be disposable: only this test package is installed/uninstalled.

## Required evidence and limits

The native test allocates both exact models through the production adapter,
invokes the face model eight times and segmenter sixteen times on synthetic
NV21 frames across all four rotations, checks output dimensions and every mask
value, verifies repeatability and source-frame immutability, and rejects blank
frames as faces. A negative control must reject Selfie Segmenter's actual
`Convolution2DTransposeBias` custom op with XNNPACK disabled. Enabling XNNPACK in
the unchanged production adapter must then succeed. Corrupt models and the
wrong model signature must fail closed. Success requires a complete native
instrumentation receipt, not a parser/unit-test result or a compiled APK alone.

The lane first runs `scripts/compile-native-camera-effects.mjs --android`,
including full camera Kotlin/Java compilation and app dependency/merged-manifest
provider checks. The existing required native aggregate depends on this lane;
no existing checks are removed. Path-planning tests cover adapter, models,
plugins, closure/compiler scripts and the harness itself.

This is x86_64 Android emulator evidence with synthetic inputs. It does not prove
real-person segmentation/face quality, visual correctness of all five effects,
ARM execution, physical-device performance, battery use or full-app traffic
behavior. Bundled LiteRT includes platform-local tracing/profiler hooks; this
test makes no claim that those hooks do not exist. Source/artifact review plus
the permission-free test process is not an absolute proof of every SDK behavior.
