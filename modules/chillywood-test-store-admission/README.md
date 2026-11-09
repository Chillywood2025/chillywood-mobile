# Isolated Test Store native admission

This module is an inactive build boundary for the separate `com.chillywood.mobile.teststoredebug` application. It does not qualify a RevenueCat project, obtain a key, activate checkout, or establish installed-device evidence. The checked-in configuration has no provider configuration.

The explicit `isolated-test-store-debug-*` profiles select Debug compilation, a different app ID, scheme, runtime and storage namespace. OTA updates are disabled. The config removes inherited production provider files, shared entitlements, app links and EAS project references. A TestFlight or Play release build is not admitted by selecting a JavaScript flag: Swift checks its compiled `DEBUG` condition; Android checks its module's `BuildConfig.DEBUG` and the application debuggable bit.

`readIsolatedTestStoreBuild()` reads signed native metadata through this Expo module. It never accepts Expo extra or a caller-supplied configuration. The configuration ID is SHA-256 of the ordered descriptor `{protocol,mode,platform,applicationId,projectId,appId,publicSdkKeySha256,storageNamespace}`. External project/app/key and Test Store exclusivity still need independent qualification; a digest is not that evidence. The public SDK key is never logged by this module.

`configureIsolatedTestStoreNative(providerAppUserId)` has no key or project argument. The native gate requires an explicit `scv1_teststore_` UUID-v4 identity, rejects an already configured SDK, and reserves its process-static latch before SDK configuration. Success, foreign configuration and uncertain failure all prevent another configuration attempt in that process. `ownsIsolatedTestStoreProviderIdentity()` requires both the one owned identity and the SDK's current identity. There is no native login, logout, reset or runtime project switch operation. JavaScript reload cannot recover permission to configure an existing instance.

The existing RevenueCat native bridge is unchanged. App source must suppress all legacy configuration and reconciliation paths for this flavor and use the dedicated native gate. This is not a claim of protection against malicious replacement JavaScript in a debug application. The SDK's own Test Store diagnostic behavior is not used as the admission gate.

Local qualification uses fixture-only configuration. The default build test registers seven portable JavaScript groups, with no skipped native test. The explicit macOS check `ISOLATED_TEST_STORE_NATIVE_POLICY=1 node --test tests/isolated-test-store-build.test.mjs` registers an eighth group that compiles and runs ten process scenarios against the actual Java and Swift policy sources, including a Swift Release executable. These callbacks do not initialize a real provider. Full Expo bridge compilation, generated project inspection and eventual installed-device/provider rehearsal are separate evidence; a policy test does not establish them.

Before any real rehearsal, independently qualify the exclusive Test Store project/app, native descriptor, backend digest/catalog, isolated authentication callback, real Debug artifact and one-user process lifecycle. Nothing here authorizes EAS publication, installation, provider configuration changes, receipt activation or live money operations.

### Read-only app transaction evidence (not admission)

`readAppTransactionEvidence()` is a dormant iOS-only explicit read, independent of the
unchanged debug Test Store gates. On iOS 16+ it reads `AppTransaction.shared` and accepts
only StoreKit `.verified` app transactions with both signed and installed bundle IDs
`com.chillywood.mobile`. Unsupported OS, verification failure, unavailable data and
wrong bundles return no transaction fields. Known environments are reported, including
production and Xcode; none grants permission. Android has no corresponding adapter.

This is **app evidence**, not IAP verification, account qualification, server attestation,
or proof of an exact installed build. `signedAppVersion` is Apple's app-version string;
`unsignedNativeVersion` and `unsignedNativeBuild` are separately labeled Bundle values.
All dispatch, provider, IAP, account and exact-build qualification flags are always false.
No receipt/JWS, app transaction identifier, raw error, or account identifier is exported.
There is no purchase, refresh, sign-in call, automatic startup read, or RevenueCat change.
Apple's shared read may require network/authentication; absence of OS UI is not promised.
Do not invoke it automatically as admission or until an explicit device observation.

Official API: https://developer.apple.com/documentation/storekit/apptransaction/shared
and https://developer.apple.com/documentation/storekit/apptransaction/appversion.
Run `bash tests/native-app-evidence/check-apple-sdk.sh` on an existing Xcode Mac: actual
Apple SDK iOS 15.1-target typecheck plus executable pure policy tests, never a StoreKit
read. This is compile/policy evidence only, not installed no-charge qualification.

Local verification (2026-11-09): Xcode 26.5 (17F42), Swift 6.3.2 and installed
IPhoneSimulator26.5 SDK successfully typechecked the actual adapter for iOS 15.1;
10 pure native policy cases executed successfully. The Expo wrapper remains covered by
the existing full native-module compile CI lane. No app transaction was read on a device.
