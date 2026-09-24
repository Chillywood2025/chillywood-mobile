# Release, delivery, and physical-automation control plane

This runbook is the canonical restart point for internal delivery work. It does
not grant build, provider, submission, OTA, public-release, or money authority.
Provider mutations still require the active finite task to grant that exact
authority.

## Internal-v2 OTA

Use only `npm run ota:internal-v2 -- --platform <android|ios> --message <text>
--binary-receipt <path>` for governed publication. The receipt is a local,
non-secret JSON document containing:

```json
{
  "artifactSha256": "64 lowercase hex characters",
  "nativeCapabilities": [],
  "platform": "android",
  "revoked": false,
  "runtimeVersion": "1.0.0-android-production-v2",
  "sourceSha": "40 lowercase hex characters",
  "sourceTree": "40 lowercase hex characters",
  "valid": true
}
```

For iOS, `platform` is `ios`, the runtime is
`1.0.0-ios-production-v2`, and `nativeCapabilities` includes
`ios-native-calls`. The publisher requires a clean checkout at exact protected
main, derives the platform channel, binds commit/tree/runtime, checks signed
binary compatibility, and then invokes EAS. A raw `eas update` is diagnostic,
not governed publication authority. Publishing does not prove device uptake;
installed readback remains separate.

## iOS delivery and duplicate prevention

Create a current, redacted snapshot and run:

```sh
node scripts/ios-delivery-control.mjs --snapshot /private/path/readback.json \
  --receipt /private/path/resume-receipt.json
```

The snapshot binds one signed artifact by ID, SHA-256, source SHA/tree, validity,
and optional build number. Submission, Apple, TestFlight, and installation
observations must repeat the same artifact ID and digest. Keep raw provider
payloads, credentials, signed URLs, account data, and device identifiers out of
the snapshot and Git.

The modeled boundaries are distinct:

1. `SIGNED_ARTIFACT_READY`
2. `SUBMISSION_CREATED`
3. `EAS_SUBMIT_QUEUED`
4. `SUBMISSION_WORKER_ASSIGNED`
5. `APPLE_UPLOAD_ACCEPTED`
6. `APPLE_PROCESSING`
7. `TESTFLIGHT_INTERNAL_AVAILABLE`
8. `INSTALLED`

Only `SAFE_TO_CREATE_SUBMISSION` permits a new submission. Active EAS work,
Apple receipt/processing, or TestFlight availability reuses the existing
delivery. EAS `FINISHED` without authoritative Apple receipt is ambiguous and
fails closed. A failed transfer becomes retryable only when its exact failure
boundary is newly proved. Processing delay never invalidates an otherwise
valid signed artifact and never requires a rebuild.

## Physical automation reconstruction

Store only a redacted health snapshot outside Git and run:

```sh
node scripts/physical-automation-control.mjs --snapshot /private/path/health.json
```

The snapshot supplies platform plus SHA-256 identity hashes for the intended
device and app. Android independently records device visibility, trust,
developer authorization, ADB health, and UIAutomator2 session health. iOS also
records WDA, existing authorized tunnel, Appium, and XCUITest session health.

`NORMAL_RESTART_OR_RECONNECTION` means the existing trusted device can be
reconstructed in the returned order. Restart only task-owned Appium/WDA/tunnel
or ADB processes, then recreate a session bound to the exact device/app hashes.
`REAL_OWNER_AUTHORIZATION_REQUIRED` is reserved for actual trust or developer
authorization loss. A stopped process, expired shell, context reset, or Codex
usage interruption does not erase device trust or prior task authority.

## Protected-main lifecycle

The lifecycle installed by PR #489 and its bounded follow-up corrections owns
current-truth and merge semantics. Ordinary continuous protected-main
advancement is observed dynamically; a genuine authority transition reaches
one fixed point. Normal, exact-source Owner-bypass, and Owner-deferred outcomes
remain distinct. This release tooling neither edits current truth nor grants
merge authority. Ruleset 18940814 remains strict with Integration 4707730 as
the sole permanent bypass.
