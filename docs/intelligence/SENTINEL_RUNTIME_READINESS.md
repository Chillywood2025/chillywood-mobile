# Sentinel Runtime Readiness

Status: Partial / blocked. This inventory is read-only and sanitized.

Inventory command:

`npm run sentinel:readiness-inventory`

Owner-approved prerequisite attestation:

`npm run sentinel:readiness-inventory -- --prerequisite-attestation=/absolute/path/outside-git/sentinel-prerequisites.json`

Runnable canary commands:

- `npm run sentinel:canary:livekit -- --evidence <sanitized-evidence.json>`
- `npm run sentinel:canary:visual -- --evidence <sanitized-evidence.json>`
- `npm run sentinel:canary:journey -- --evidence <sanitized-evidence.json>`
- `npm run sentinel:canary:self-test`

## Current Read-Only Inventory

Generated from the local isolated worktree on 2026-07-24T02:11:04Z.

| Requirement | Status | Sanitized evidence |
| --- | --- | --- |
| Android internal build | Pass | One connected Android device has `com.chillywood.mobile` version `1.0.0`, build `84`, installer `com.android.vending`. The recorded build-84 source contains the in-app runtime/channel/update diagnostics and LiveKit render telemetry. |
| iOS internal/simulator build | Blocked | One booted simulator has `com.chillywood.mobile` version `1.0.0`, build `1`, runtime `1.0.0`, channel `development`; it is not the expected `ios-qa` / `1.0.0-iosqa1` internal canary candidate. |
| Runtime/channel proof | Partial | Android has the required installed diagnostics surface, but the active values were not read because no approved synthetic session was available. The iOS simulator is a development-channel build. |
| Approved synthetic accounts | Blocked | No owner-approved sanitized fixture labels are available locally; no private account identities were read or stored. |
| Android device/emulator | Pass | `adb` is available; one Android device is online; screenshot capture, UI automation, and log-buffer capability are available. |
| iOS simulator/device | Partial | `xcrun` is available; one simulator is booted and supports screenshot/log/UI automation capability, but it is not an `ios-qa` canary build. |
| Two LiveKit participants | Blocked | Two distinct approved participants are not available to this runner. Do not infer participant availability from source fixtures. |
| Screenshot capture | Pass | Capability only. No raw screenshot was captured or committed. |
| UI automation | Pass | Maestro and platform UI automation capabilities are present. |
| Log capture | Pass | Capability only. No raw log was captured or committed. |
| Provider/backend read-only telemetry | Blocked | Local read-only provider/backend credentials are not available; no provider/backend calls were attempted. |

## Sanitized Prerequisite Attestation

The readiness runner defaults all three external prerequisites to blocked. It
can accept them only through the explicit `--prerequisite-attestation=` argument.
The file must:

- be an absolute path outside every Git worktree;
- be a regular, non-symlink file owned by the current user;
- have exact mode `0600` and be no larger than 32 KiB;
- carry schema version `1`, `ownerApproved: true`, a SHA-256
  `ownerApprovalHash`, and an issued/expiry window no longer than six hours;
- contain only the exact allowlisted objects and fields below.

The three allowlisted objects are:

- `approvedSyntheticAccounts`: `approved`, bounded `count`, safe `labels`, and
  `evidenceHash`;
- `twoLiveKitParticipants`: `approved`, bounded `count`, safe `labels`, and
  `evidenceHash`;
- `providerBackendReadOnlyTelemetry`: `approvedReadOnly`, safe
  `providerFamily`, safe `backendFamily`, and `evidenceHash`.

Safe labels are lowercase alphanumeric, underscore, or hyphen labels. Account
readiness requires every role label already declared by
`approvedSyntheticFixtureContract`. Participant readiness requires at least two
approved participants, the `installed_app` label, and either
`second_installed_app` or `headless_sdk`.

No identity, email, password, access token, refresh token, LiveKit token, JWT,
provider credential, service key, URL, private media, screenshot, or raw log
field is accepted. Unknown fields, invalid permissions, files inside Git,
expired/unbounded attestations, malformed counts/labels/hashes, and missing
approval all fail closed. The report emits only status categories, safe provider
family labels, expiry, and a SHA-256 fingerprint of a fully validated
attestation. It never echoes the file path or raw contents.

## Artifact Decision

| Platform | Exact decision | Basis | Action gate |
| --- | --- | --- | --- |
| Android | `NO_ARTIFACT_CHANGE_REQUIRED` | Play-internal build 84 is installed; screenshot, UI automation, and log-buffer capabilities are available. Its recorded source commit contains runtime/channel/update diagnostics and LiveKit render telemetry. No missing native capability or JS instrumentation gap was proved. | Do not build or publish an OTA. Provide approved synthetic fixtures, then read active diagnostics and collect sanitized evidence from the existing installed app. The production channel must not be used as an internal-QA OTA target. |
| iOS | `INTERNAL_QA_BINARY_REQUIRED` | The installed development build is runtime `1.0.0` / channel `development`, while the approved canary contract is runtime `1.0.0-iosqa1` / channel `ios-qa`. An OTA cannot cross that runtime/channel boundary. | First reuse and install the already-recorded internal build-8 candidate if it remains available. Start at most one new internal QA binary only if that exact candidate cannot be retrieved or verified. Do not publish an OTA and do not make a public release. |

`INTERNAL_QA_OTA_REQUIRED` applies to neither platform. Android has no proved
JS-only instrumentation gap, and its production channel is not an authorized
internal-QA-only OTA target. iOS has a runtime/channel mismatch that an OTA cannot
repair.

## Canary Readiness

| Canary | Status | Blocker |
| --- | --- | --- |
| LiveKit experience | Blocked | Android can be the installed observed app and a bounded headless client can be the second participant; both approved participant fixtures are still missing. iOS is not required to unblock an Android-plus-headless canary. |
| Visual experience metrics | Ready with blockers | Needs sanitized screenshot metrics and approved-baseline state. Current constitution still requires product baseline review. |
| Installed journey | Ready with blockers | Needs owner-approved synthetic account fixtures and sanitized journey evidence. |

The current safe no-artifact platform is Android. Once the non-artifact
prerequisites are supplied, the existing Play-internal app can support LiveKit,
visual, and journey evidence collection. No real installed-product canary ran in
this lane because the approved synthetic fixtures, two participants, and
sanitized installed evidence were absent. Only the read-only inventory and local
sentinel self-tests ran; they are readiness proof, not installed-product proof.

## Evidence Contract

The runner accepts sanitized JSON only. Evidence may contain package/runtime
labels, bounded timings, boolean stage flags, route/result state labels,
screenshot hashes, runtime hashes, device class, and orientation. Evidence must
not contain raw screenshots, raw logs, tester identities, emails, tokens, JWTs,
LiveKit tokens, provider credentials, signed URLs, private media, private chat
bodies, or provider records.

If the currently installed binary cannot expose the needed runtime, channel,
update, screenshot-hash, UI-state, or LiveKit media telemetry, the canary must
return exactly `NEW_BINARY_OR_OTA_REQUIRED`. Source fixtures are not installed
proof.

## Coordinator Action

Coordinator action required:

- use an approved synthetic session to read Android build-84 runtime, channel,
  update ID, embedded/emergency-launch state, and sanitized sentinel evidence
  from the existing installed diagnostics; do not build or publish an OTA;
- retrieve and install the existing TestFlight/internal or signed simulator iOS
  build-8 candidate on channel `ios-qa`, runtime `1.0.0-iosqa1`; create a new
  internal binary only if that candidate is unavailable or fails verification;
- provide owner-approved synthetic account fixture labels for at least two
  LiveKit participants and one installed journey user through an external secret
  store;
- provide read-only backend/provider telemetry access for canary health labels;
- approve or explicitly leave pending the product visual baseline.

No build, OTA publish, deployment, Play/TestFlight/provider mutation, install,
sideload, raw screenshot capture, or raw log capture happened in this lane.
