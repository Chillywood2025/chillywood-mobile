# Record-only Test Store qualification app

This is a standalone Expo DEBUG app. It has no Chi'llywood account, Premium,
commerce, grant, payout, restoration or live-store integration. Native SDK pins
match the reviewed Test Store Package-context versions: iOS 5.96.1 and Android
10.28.1. No RevenueCat JavaScript configure/login/purchase bridge is included.

Source defaults are unavailable. A reviewed build descriptor must identify the
actual dedicated Test Store project/app, public SDK key, record-only receiver
connection/revision and actual read-backed Offering/Package/product tuples.
Run/scenario labels are local evidence only. No client metadata authenticates a
provider receipt or grants economic rights. The independent receiver retains
authenticated encrypted webhook bytes and excludes their customer/economic
lineage from commerce; sealing it never enables purchases or grants.

The app has no receiver enrollment or capture-status API. Before a later
approved rehearsal, the operator must independently verify the receiver's
exact connection and bounded capturing phase. The compiled connection label
does not attest that the receiver is deployed or recording. Stopping local
attempts does not seal the receiver.

The native owner persists a distinct installation and fixed `scq_teststore_`
identity. It configures once, refuses foreign/preexisting SDK ownership, retains
the actual SDK Package between inspection and explicit purchase, and saves each
invocation before crossing the SDK boundary. Completion is local SDK evidence,
not receipt truth or no-charge proof. Unknown interrupted work stays blocked;
there is no timeout unlock, automatic retry, logout, alias, restore or reset.
Any native persistence or readback failure also blocks every later write in that
process, including sealing and completion. This preserves uncertain disk evidence
instead of overwriting it with an older in-memory snapshot; recovery requires a
new process to read valid retained storage. Healthy sealing still allows an
already-running native callback to record its completion.

Android requires both a DEBUG module and a debuggable app. iOS requires DEBUG.
Release, TestFlight and Play-track distribution are not supported. App identity,
storage and runtime are separate from all main-app v1/v2 profiles; OTA is off.

Local source/config/policy tests and disposable compile are engineering checks.
They do not provision a project, configure a receiver, authorize an installed
purchase, or demonstrate any actual provider/device behavior. Those actions
require a concrete reviewed descriptor and their applicable action approval.

The build selects `SCQ_PLATFORM=ios|android`. `SCQ_NATIVE_DESCRIPTOR` is a JSON
descriptor validated by `config.js`; absent descriptor means no SDK actions.
Do not put provider secrets or webhook authorization keys in this app. Native
inspection never returns the public SDK key or raw customer-info object to UI.

The required macOS native lane runs this command from the repository root:

```sh
node qualification/test-store-debug/scripts/compile-native.mjs
```

The runner must already supply Xcode, CocoaPods, Java through `JAVA_HOME`, and an
Android SDK through `ANDROID_HOME` or `ANDROID_SDK_ROOT`. The command accepts no
configuration or skip flags. It copies an explicit source list into a disposable
directory, installs the locked public npm dependencies with scripts disabled,
and generates both platforms with no provider descriptor. It checks actual Expo
configuration and autolinking, executes the Java and Swift policy tests, compiles
the Android Debug/Release Kotlin and Java module, and compiles the unsigned iOS
Debug simulator module against the pinned RevenueCat SDK. It never installs or
launches the app, accepts SDK licenses, or configures a provider connection.

`artifacts/qualification-native/receipt.json` records source, generated-file,
command-output and actual compiled-artifact hashes. Redacted command logs are
stored beside it. The disposable project is removed after success or failure;
incomplete compilation or cleanup fails validation. This evidence establishes
source compilation only. It does not replace receiver readiness, installation,
provider webhook, repeated purchase, cancellation or restart qualification.
