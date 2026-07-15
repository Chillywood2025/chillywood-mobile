# Chi'llywood iOS Physical Media Proof

Checkpoint date: 2026-07-15

Overall status: **In progress — the signed physical-device foundation is verified. Camera, microphone, and Photos results below remain unclaimed until direct physical execution. True two-party LiveKit media is `BLOCKED_SECOND_DEVICE`.**

## Test chain

| Item | Sanitized value |
| --- | --- |
| Branch | `codex/ios-first-development-build` |
| Signed EAS build | `343b3b6a-53d3-49b2-bed0-57b6f25c23fa` |
| Tested application source | `5c5fa023cc8ac8532fd0abe76c6199d0a769788d` |
| Application | `1.0.0` build `1` |
| Bundle identifier | `com.chillywood.mobile` |
| Device | Registered physical iPhone; name and identifiers omitted |
| Runtime | iOS 26.5.2 |

Changes after the tested application source consist only of documentation and pull-request CI workflow changes. No application, Expo, EAS, native, Firebase, dependency, plugin, or Android configuration changed. A new device build is therefore not required for this proof.

No screenshot, captured media, account identifier, room credential, device identifier, signed artifact URL, or private log is committed.

## Physical media matrix

Result labels are `PASS`, `FAIL`, `PENDING_PHYSICAL_EXECUTION`, `NOT_APPLICABLE`, `NOT_RUN_OWNER_APPROVAL_REQUIRED`, `BLOCKED_PREEXISTING_ACCESS`, and `BLOCKED_SECOND_DEVICE`.

### Camera

| Check | Result | Sanitized evidence |
| --- | --- | --- |
| Camera permission prompt appears | `PENDING_PHYSICAL_EXECUTION` | |
| Allow grants access | `PENDING_PHYSICAL_EXECUTION` | |
| Real camera preview appears | `PENDING_PHYSICAL_EXECUTION` | |
| Camera disable and re-enable | `PENDING_PHYSICAL_EXECUTION` | |
| Background and foreground recovery | `PENDING_PHYSICAL_EXECUTION` | |
| Portrait and landscape handling | `PENDING_PHYSICAL_EXECUTION` | |
| Front/rear switching | `NOT_APPLICABLE` | The current product exposes a front-facing call camera but no camera-switch control. This is a code-audit finding, not a physical pass. |
| Permission denial | `NOT_RUN_OWNER_APPROVAL_REQUIRED` | The permission state will not be changed without explicit owner approval. |

### Microphone

| Check | Result | Sanitized evidence |
| --- | --- | --- |
| Microphone permission prompt appears | `PENDING_PHYSICAL_EXECUTION` | |
| Allow grants access | `PENDING_PHYSICAL_EXECUTION` | |
| Real local audio track is created or published | `PENDING_PHYSICAL_EXECUTION` | |
| Mute and unmute | `PENDING_PHYSICAL_EXECUTION` | |
| Default speaker or receiver route remains stable | `PENDING_PHYSICAL_EXECUTION` | |
| Bluetooth or AirPods route | `NOT_APPLICABLE` | Update only if approved hardware is available. |
| Permission denial | `NOT_RUN_OWNER_APPROVAL_REQUIRED` | The permission state will not be changed without explicit owner approval. |

### Photos

| Check | Result | Sanitized evidence |
| --- | --- | --- |
| Native image picker opens | `PENDING_PHYSICAL_EXECUTION` | |
| Picker cancellation returns safely | `PENDING_PHYSICAL_EXECUTION` | |
| Normal non-private image selection | `PENDING_PHYSICAL_EXECUTION` | |
| Limited-library behavior, if offered | `PENDING_PHYSICAL_EXECUTION` | |
| Normal iPhone HEIC image | `PENDING_PHYSICAL_EXECUTION` | Support must not be claimed and source must not be changed until physically observed. |
| Image preparation and upload on an approved disposable account | `PENDING_PHYSICAL_EXECUTION` | |
| Uploaded image renders | `PENDING_PHYSICAL_EXECUTION` | |
| Permission scope | `PENDING_PHYSICAL_EXECUTION` | Code uses the item-scoped native picker and does not configure Photos-library write access; physical behavior remains to be observed. |

### LiveKit

| Check | Result | Sanitized evidence |
| --- | --- | --- |
| Native LiveKit startup | `PASS` | Existing physical launch completed without a bootstrap, missing-module, or initialization crash. This is startup proof only. |
| Pre-existing room access | `PENDING_PHYSICAL_EXECUTION` | No entitlement may be purchased or bypassed to enter a room. |
| iPhone room connection | `PENDING_PHYSICAL_EXECUTION` | |
| Local microphone track | `PENDING_PHYSICAL_EXECUTION` | |
| Local camera track | `PENDING_PHYSICAL_EXECUTION` | |
| Both clients authenticate and join one approved room | `BLOCKED_SECOND_DEVICE` | Only one approved physical client is currently available. |
| Remote side receives iPhone audio and video | `BLOCKED_SECOND_DEVICE` | |
| iPhone receives remote audio and video | `BLOCKED_SECOND_DEVICE` | |
| Two-party mute and camera toggles | `BLOCKED_SECOND_DEVICE` | |
| Room leave stops local media | `PENDING_PHYSICAL_EXECUTION` | |
| Background and foreground behavior | `PENDING_PHYSICAL_EXECUTION` | |
| Temporary network interruption | `PENDING_PHYSICAL_EXECUTION` | |
| Existing publishing policy remains bounded | `PASS` | Existing Android-sensitive and room-policy guards pass; this does not replace two-party runtime proof. |

A single-device startup or local-track result must not be described as two-party LiveKit proof. Simulator or physical startup proof is not APNs, StoreKit, PushKit, CallKit, or production media-delivery proof.

## CI diagnostic separation

The pull-request workflow now reports these exact independent check names:

- `Phase 1 / Repository Lint`
- `Phase 1 / TypeScript`
- `Phase 1 / Runtime Validation`
- `Phase 1 / Route Contracts`
- `Phase 1 / iOS Configuration`
- `Phase 1 / Android Regression Guards`
- `Phase 1 / Expo Doctor`

Corrected split-run result:

| Check | Result | Classification |
| --- | --- | --- |
| `Phase 1 / Repository Lint` | Fail | Unchanged `origin/main` baseline: 157 findings (69 errors and 88 warnings). Nothing was suppressed. |
| `Phase 1 / TypeScript` | Pass | The first clean split run lacked the locked nested `ops/alert-automation` dependencies. The TypeScript job now runs scoped `npm ci --prefix ops/alert-automation`, then passes. No dependency version changed. |
| `Phase 1 / Runtime Validation` | Pass | |
| `Phase 1 / Route Contracts` | Pass | |
| `Phase 1 / iOS Configuration` | Pass | |
| `Phase 1 / Android Regression Guards` | Pass | |
| `Phase 1 / Expo Doctor` | Fail | Unchanged baseline: 17 of 18 checks pass; ten Expo SDK patch-version alignment findings remain. |

The split does not weaken a command, convert a failure to success, or expose production secrets. It ensures TypeScript runs independently when repository lint fails.

## Boundaries

- No application rebuild was required because this phase changed only CI and documentation.
- No merge, OTA, preview or production build, TestFlight or App Store submission, or Supabase deployment occurred.
- Push, CallKit, PushKit, purchases, Premium, money, payouts, and cash-out remain disabled.
- No credential or private test data is recorded.
