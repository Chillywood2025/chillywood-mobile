# Private local qualification build handoff

This is the separate operator path for the standalone record-only qualification
app. The ordinary `scripts/compile-native.mjs` CI command stays descriptor-free
and unchanged. The configured helper has only `stage` and `build` commands. It
does not install, launch, start Metro, configure a provider, call the receiver,
or purchase. No real configured build has been established by its portable tests.

The capture project is not selected. Do not use economic project `44662861` /
`proj44662861`, or mixed legacy project `c5629a24` / `projc5629a24`; the helper
rejects all these forms. It cannot create or qualify another project. A later
operator must first read back the actual dedicated project containing only the
one intended Test Store app, its catalog, and the deployed record-only receiver.
Those facts are currently required inputs, not invented defaults.

## Keep the key local

Use a private, non-synced directory outside **every Git checkout**, with mode
`0700`, and a regular, single-link descriptor file with mode `0600`. Use a local
editor to enter the public Test Store SDK key directly from the verified dedicated
app. Do not paste it into chat, a shell assignment, command arguments, `.env`,
Git, a CI variable, or a ticket. The descriptor itself is never copied to the
staged project. The helper rejects symlinked files/directories, hard links,
group/other-readable input and any Git ancestor.

For example, create an empty input file locally (these commands contain no key):

```sh
umask 077
mkdir -p "$HOME/Library/Application Support/ChillywoodPrivate/qualification"
chmod 700 "$HOME/Library/Application Support/ChillywoodPrivate/qualification"
touch "$HOME/Library/Application Support/ChillywoodPrivate/qualification/input.json"
chmod 600 "$HOME/Library/Application Support/ChillywoodPrivate/qualification/input.json"
```

The SDK key is a public native-app identifier, not a server secret. It will be
embedded in the generated native configuration and compiled app. Treat that
whole generated workspace as private: do not upload it or its generated
manifests, app archives, Metro caches, or dependency/build logs. A local process
running as the same OS user can inspect child environments; this helper prevents
accidental argv/log/Git exposure, not a hostile local-user compromise. Webhook
authorization, encryption keys, provider secret API keys and Supabase service
credentials have no place in this file or app and are rejected as extra fields.

## Exact input schema

The top-level keys are exactly `schema`, `descriptor`, and `readback`. Duplicate
JSON keys, unexpected fields, excessive size and nesting are rejected. Fill each
placeholder from actual operator readback; this deliberately unusable template
does not supply a project, endpoint, price, connection or key:

```json
{
  "schema": "scq-local-build-input-v1",
  "descriptor": {
    "qualificationConnectionId": "<actual UUID>",
    "qualificationConnectionRevision": null,
    "projectId": "<actual dedicated project>",
    "appId": "<actual Test Store app>",
    "publicSdkKey": "<enter locally; never in chat or argv>",
    "runId": "<operator-selected UUID v4>",
    "scenarios": [{
      "id": "<operator-selected UUID v4>",
      "label": "<local evidence label>",
      "providerOfferingId": "<read-back provider object ID>",
      "offeringIdentifier": "<read-back SDK lookup key>",
      "providerPackageId": "<read-back provider object ID>",
      "packageIdentifier": "<read-back SDK lookup key>",
      "providerProductId": "<read-back provider object ID>",
      "productId": "<read-back SKU>",
      "amountMinor": null,
      "currency": "usd",
      "intendedAction": "<purchase or cancel>"
    }]
  },
  "readback": {
    "observedAt": "<actual ISO time>",
    "expiresAt": "<ISO time no more than one hour later>",
    "project": {
      "id": "<same project>",
      "appIds": ["<same sole Test Store app>"],
      "stores": ["TEST_STORE"],
      "publicSdkKeySha256": "<SHA256 of the locally read-back public key>"
    },
    "receiver": {
      "endpoint": "<actual HTTPS endpoint ending /functions/v1/isolated-test-store-qualification-v1>",
      "connectionId": "<same actual connection UUID>",
      "connectionRevision": null,
      "projectId": "<same project>",
      "appId": "<same app>",
      "phase": "capturing",
      "maxEntries": null,
      "maxDeliveries": null,
      "maxTotalBytes": null,
      "entriesUsed": null,
      "deliveriesUsed": null,
      "totalBytesUsed": null
    },
    "catalog": [{
      "providerOfferingId": "<same object ID>",
      "offeringIdentifier": "<same lookup key>",
      "providerPackageId": "<same object ID>",
      "packageIdentifier": "<same lookup key>",
      "providerProductId": "<same object ID>",
      "productId": "<same SKU>",
      "amountMinor": null,
      "currency": "usd"
    }],
    "providerEvidenceSha256": "<digest of retained operator provider readback evidence>",
    "receiverEvidenceSha256": "<digest of retained operator receiver readback evidence>"
  }
}
```

`catalog` contains each distinct scenario tuple once; it must match every scenario
and cannot contain unrelated products. IDs and prices are not inferred from a
label, offering name or local SDK result. Receiver bounds must be positive and
not exhausted, within the existing SQL limits: 256 entries, 1,024 deliveries,
and 67,108,864 total bytes. The helper only checks the recorded assertion and
its age. It does **not** verify receiver deployment, signature handling,
connectivity, present capacity, or provider configuration independently. Receipt
fields say this explicitly. Keep readback evidence private; its hashes are
references, not cryptographic provider/receiver attestations.

## Stage, review, then build

From the reviewed repository root, use a new private output directory for each
platform. Only paths and platform names enter argv:

```sh
node qualification/test-store-debug/scripts/stage-configured-debug.mjs stage \
  --descriptor-file "$HOME/Library/Application Support/ChillywoodPrivate/qualification/input.json" \
  --output "$HOME/Library/Application Support/ChillywoodPrivate/qualification/ios-debug" \
  --platform ios
```

Stage copies an explicit standalone source list; no main app, `.git`, `.env`,
credentials, existing `node_modules`, generated native tree or descriptor is
copied. Review `receipt.json` and its exact source/configuration hashes. The
receipt contains the public key's SHA256, never the key or descriptor. A build
requires the same private input, helper source, staged source and platform.
Expired or changed readback requires a new explicit staged workspace, never a
silent rewrite of the old receipt.

After the concrete configured build action is authorized, the separate command
is the same as above with `build` instead of `stage`. The host must already have
the required toolchain; the helper does not install Xcode, Java or Android tools,
accept licenses, sign for distribution, or invoke EAS. Android requires
`JAVA_HOME` and `ANDROID_HOME`/`ANDROID_SDK_ROOT`, including
`cmdline-tools/latest/bin/apkanalyzer`. iOS requires macOS, Xcode and CocoaPods.

The helper installs the locked public dependencies, verifies standalone native
autolinking, and passes `SCQ_NATIVE_DESCRIPTOR` **only in the prebuild child's
environment**. Inherited descriptors, provider credentials and injection
variables are removed. No config-dump command is used. Raw child output is
bounded in memory, never printed or written to logs or receipts, even on error.
Failure records a generic status and retains the private workspace; it does not
claim a successful build or automatically retry. Local inspection of a failure
must not paste generated configuration into chat or telemetry.

Pinned Expo prebuild adds its ordinary `android` and `ios` package scripts. The
helper accepts exactly those additions, records the generated package digest,
then restores the original package bytes. Any dependency, version, existing
script or other package change fails. It does not relax source-hash validation.

Android builds only `:app:assembleDebug` and verifies the APK's exact embedded
configuration, application identity, debuggable flag, disabled backup and OTA.
Its development signing is distinct from store/release signing. iOS builds only
the generated **Debug simulator** app with signing disabled; it checks the
embedded configuration, simulator platform, empty generated entitlements and
disabled OTA. There is no Release override, TestFlight, Play-track or physical
iOS distribution path. Generated key-bearing files stay inside the private
workspace. A successful receipt says `compiled_not_installed` and records exact
artifact hashes, with `installed=false`, `launched=false` and `metroRequired=true`.

## Later launch rehearsal is a separate action

Ordinary native DEBUG builds use Metro. They are **not** self-contained offline
apps merely because OTA is disabled. Before any installation or launch:

1. Re-read the actual receiver connection/revision and bounded capturing phase;
   building can outlast the input's readback window. Verify the exact native
   configuration digest, source snapshot and artifact hashes.
2. Identify and authorize the exact Android emulator or iOS simulator plus the
   exact app artifact. Inventory existing qualification app data/owner/run first.
   Never uninstall, clear storage, reset ownership or reseed an unknown invocation
   to make a test pass. A conflicting retained installation requires a reviewed
   decision; a build receipt does not authorize erasure.
3. Use only the staged `project` directory as Metro's source, after checking its
   recorded hashes and locked dependencies. Verify port 8081 is unoccupied;
   never attach to or kill an unknown server. Start the pinned local Expo CLI
   with `start --localhost --offline --port 8081`, a scrubbed environment,
   `EXPO_NO_DOTENV=1`, `EXPO_NO_CLIENT_ENV_VARS=1`,
   `EXPO_NO_TELEMETRY=1`, and only the nonsecret `SCQ_PLATFORM` setting. Do not
   pass `SCQ_NATIVE_DESCRIPTOR` to Metro. No tunnel, LAN broadcast, Expo Go,
   runtime key switching or arbitrary dev-server substitution is permitted.
4. Install only the receipt-bound Debug artifact using the reviewed target's
   local tool, then launch the exact `com.chillywood.qualification.teststore`
   application. Observe native identity/configuration and retained storage before
   any explicit SDK action. Metro source delivery, native launch and provider
   purchase/receipt behavior still need actual evidence.
5. Each configured scenario remains an explicit record-only rehearsal. A client
   completion is not a verified receipt, grant, no-charge proof or receiver seal.
   Stop on unknown work; never automatically replay it. Independently correlate
   authenticated receiver evidence, and perform any authorized seal separately.

This document is an actionable handoff, not authorization to perform those
future actions. The current source-only task used synthetic test files and child
outputs; it did not select a capture project or use real provider configuration.

After those checks and action authorization, concrete local installation/launch
commands use only the reviewed target IDs and artifact paths, never the key:

```sh
xcrun simctl install "REVIEWED_SIMULATOR_UDID" "/private/reviewed/build/Exact.app"
xcrun simctl launch "REVIEWED_SIMULATOR_UDID" com.chillywood.qualification.teststore

adb -s "REVIEWED_EMULATOR_SERIAL" reverse tcp:8081 tcp:8081
adb -s "REVIEWED_EMULATOR_SERIAL" install "/private/reviewed/build/app-debug.apk"
adb -s "REVIEWED_EMULATOR_SERIAL" shell am start -n com.chillywood.qualification.teststore/.MainActivity
```

These are inert placeholder examples, not commands to execute now. An existing
Android installation makes the plain install fail; do not add reinstall, clear
or uninstall options automatically. Reconfirm the actual exported activity from
the verified APK and preserve existing app ownership/data before any update.
