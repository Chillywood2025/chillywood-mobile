# Sentinel Runtime Readiness

Status: Partial / blocked. This inventory is read-only and sanitized.

Inventory command:

`npm run sentinel:readiness-inventory`

Runnable canary commands:

- `npm run sentinel:canary:livekit -- --evidence <sanitized-evidence.json>`
- `npm run sentinel:canary:visual -- --evidence <sanitized-evidence.json>`
- `npm run sentinel:canary:journey -- --evidence <sanitized-evidence.json>`
- `npm run sentinel:canary:self-test`

## Current Read-Only Inventory

Generated from the local isolated worktree on 2026-07-24T00:42:10Z.

| Requirement | Status | Sanitized evidence |
| --- | --- | --- |
| Android internal build | Pass | One connected Android device, hashed id `450937c25ed966ad`, has `com.chillywood.mobile` version `1.0.0`, build `84`, installer `com.android.vending`. |
| iOS internal/simulator build | Blocked | One booted simulator has `com.chillywood.mobile` version `1.0.0`, build `1`, runtime `1.0.0`, channel `development`; it is not the expected `ios-qa` / `1.0.0-iosqa1` internal canary candidate. |
| Runtime/channel proof | Blocked | Android package readback does not expose current Expo update id/runtime/channel from the installed app. iOS simulator is a development-channel build. Record `NEW_BINARY_OR_OTA_REQUIRED`. |
| Approved synthetic accounts | Blocked | No owner-approved sanitized fixture labels are available locally; no private account identities were read or stored. |
| Android device/emulator | Pass | `adb` is available; one Android device is online; screenshot capture, UI automation, and log-buffer capability are available. |
| iOS simulator/device | Partial | `xcrun` is available; one simulator is booted and supports screenshot/log/UI automation capability, but it is not an `ios-qa` canary build. |
| Two LiveKit participants | Blocked | Two distinct approved participants are not available to this runner. Do not infer participant availability from source fixtures. |
| Screenshot capture | Pass | Capability only. No raw screenshot was captured or committed. |
| UI automation | Pass | Maestro and platform UI automation capabilities are present. |
| Log capture | Pass | Capability only. No raw log was captured or committed. |
| Provider/backend read-only telemetry | Blocked | Local read-only provider/backend credentials are not available; no provider/backend calls were attempted. |

## Canary Readiness

| Canary | Status | Blocker |
| --- | --- | --- |
| LiveKit experience | Blocked | `NEW_BINARY_OR_OTA_REQUIRED` plus two approved participants and read-only telemetry are required. |
| Visual experience metrics | Ready with blockers | Needs sanitized screenshot metrics and approved-baseline state. Current constitution still requires product baseline review. |
| Installed journey | Ready with blockers | Needs owner-approved synthetic account fixtures and sanitized journey evidence. |

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

- install or expose an Android runtime/update diagnostics surface for build `84`
  without changing release state, or provide a matching OTA/binary that emits the
  required sanitized telemetry;
- provide a TestFlight/internal or signed simulator iOS canary candidate on
  channel `ios-qa`, runtime `1.0.0-iosqa1`, build `8`, or provide a matching OTA;
- provide owner-approved synthetic account fixture labels for at least two
  LiveKit participants and one installed journey user through an external secret
  store;
- provide read-only backend/provider telemetry access for canary health labels;
- approve or explicitly leave pending the product visual baseline.

No build, OTA publish, deployment, Play/TestFlight/provider mutation, install,
sideload, raw screenshot capture, or raw log capture happened in this lane.
