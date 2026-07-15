# iOS StoreKit automation harness

This harness runs three real `SKTestSession` transaction tests against the
canonical `config/ios/Chillywood.storekit` catalog:

- every declared consumable and subscription can be purchased;
- a subscription can renew, expire, and be refunded;
- a consumable can be refunded.

Run it with:

```sh
npm run test:ios-storekit
```

The runner bounds `xcodebuild` to 240 seconds by default; override that only
for diagnostics with `CHILLYWOOD_STOREKIT_TIMEOUT_SECONDS`.

The generated test project copies the canonical StoreKit file, makes it the
active StoreKit configuration in the shared Xcode scheme, and records the
In-App Purchase capability on the host target. The runner also verifies those
conditions before starting `xcodebuild`.

## Result contract

- Exit `0`: all three transaction and lifecycle tests passed.
- Exit `78` with `BLOCKED_APPLE_STOREKIT_TOOLCHAIN`: all three tests ran on an
  affected Apple Simulator runtime and failed with both
  `StoreKitError.notEntitled` and `SKInternalErrorDomain Code 3`. This is a
  blocker, not a pass.
- Any other nonzero exit: a build, configuration, or test failure that needs
  investigation.

On this Mac, Xcode 26.5 with the iOS 26.5 Simulator reproduces the open Apple
toolchain failure even after the scheme and capability setup is correct. Apple
documents the required scheme setup in [Setting up StoreKit Testing in
Xcode](https://developer.apple.com/documentation/xcode/setting-up-storekit-testing-in-xcode/).
The matching iOS 26.5 failure and Code 3 signature are tracked in [Apple
Developer Forums thread 826364](https://developer.apple.com/forums/thread/826364).

If an unaffected Simulator runtime is installed, set
`CHILLYWOOD_STOREKIT_SIMULATOR_ID` to that available iPhone Simulator's ID for
the run. Do not convert exit `78` to success in CI; rerun on an unaffected
runtime or after Apple ships a corrected toolchain/runtime.

The separate `guard:ios-commerce-catalog` and `proof:ios-commerce` commands
continue to validate the static product catalog and source policy, but they do
not replace successful StoreKit transaction testing.
