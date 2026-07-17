# iOS Final Device-Test Matrix (Remaining 10%)

Checkpoint date: 2026-07-16

This matrix contains only work that inherently requires repeated physical Apple
device access or owner legal/release attestation. Repository coding, provider
setup, credentials, backend deployment, workflows, products, screenshots, and
internal TestFlight upload are not permitted to be moved into this list; they are
part of the 90% integration task.

The successful historical physical build
`343b3b6a-53d3-49b2-bed0-57b6f25c23fa` proved launch, Firebase startup,
authentication, session persistence, primary navigation, and sign-out for source
`5c5fa023cc8ac8532fd0abe76c6199d0a769788d`. The current integration branch has
application and native changes after that source. Historical results therefore do
not satisfy this final-current-build matrix.

## Exact remaining 10%

**Build 8 is processed and available in `Chillywood Internal`; the matrix is
ready but has not begun.** Build 7 cannot serve as the native-call candidate because
`ChillywoodNativeCallsRuntimeDefaultEnabled=false`; its JavaScript OTA cannot
change that native key. Local build 8 is the exact all-flags QA target, isolated on
channel `ios-qa` and runtime `1.0.0-iosqa1`. The readiness statuses below do not
authorize a test or a feature-switch change.

Autonomous source/backend readiness is complete separately from this matrix.
Backend probes can validate delivery tables, retry scheduling, catalog/provider
policy, release capability availability, and shared LiveKit router health, but
they cannot convert any row below to a physical pass. Current provider adapters
leave release/observability/TestFlight readiness blocked where EAS, App Store
Connect, or Firebase read-only truth is unavailable. No device row or
second-device row was fabricated.

The all-platform autonomy parity closeout does not change this gate. It adds truthful shared/Android/iOS source and provider readiness, local-binary attestation, scheduled adapters, report routing, and deduplicated blockers only. It cannot promote any physical row below to a pass.

| # | Required proof | Status | Completion evidence required |
| ---: | --- | --- | --- |
| 1 | Physical iPhone camera permission and preview | `READY_NOT_STARTED` | Prompt state, allow flow, real preview, camera off/on, lifecycle, and truthful denied/restricted recovery without private imagery. |
| 2 | Physical iPhone microphone capture/publish | `READY_NOT_STARTED` | Permission, real local track, mute/unmute, lifecycle, and denied/restricted recovery without recording private conversation. |
| 3 | Physical iPhone photo picker and upload | `READY_NOT_STARTED` | Select a non-private HEIC asset, cancel safely, limited-library behavior if offered, prepare/upload/render, and verify item-scoped access. |
| 4 | Two-device LiveKit audio/video | `BLOCKED_SECOND_PHYSICAL_CLIENT` | Two bounded accounts join one approved room; bidirectional audio/video, mute, camera, leave cleanup, background/return, and network recovery pass. |
| 5 | APNs foreground delivery | `READY_NOT_STARTED` | Exact final build receives a permitted ordinary notification in foreground with correct route/category/badge behavior and no token exposure. |
| 6 | APNs background delivery | `READY_NOT_STARTED` | Background delivery and response route pass without duplicate handling. |
| 7 | APNs terminated-app delivery | `READY_NOT_STARTED` | Terminated launch opens the intended bounded route exactly once. |
| 8 | Universal Link verification on a signed physical build | `READY_NOT_STARTED` | Cold, warm, and already-running app tests cover authentication and content routes while Android App Links remain unchanged. |
| 9 | Two-iPhone PushKit/CallKit incoming call | `BLOCKED_SECOND_IPHONE_DEVICE_PROOF` | Real VoIP push presents native incoming-call UI on a second signed iPhone without exposing the token. Production-visible rollout remains deliberately off. |
| 10 | Call answer/decline/cancel/timeout/lock-screen proof | `BLOCKED_SECOND_IPHONE_DEVICE_PROOF` | Every native lifecycle state reaches React Native/LiveKit correctly, duplicate/cold-start recovery works, and cleanup is complete. |
| 11 | Bluetooth/AirPods and interruption testing | `PENDING_HARDWARE` | Speaker/receiver/Bluetooth routing, interruption, background/return, and AVAudioSession cleanup pass on the final build. |
| 12 | TestFlight StoreKit purchase | `READY_NOT_STARTED_SANDBOX_ONLY` | The owner-approved rail is bounded to `sandbox_only`; an approved internal account must still complete and record the non-payable physical StoreKit transaction proof. |
| 13 | Restore Purchases | `NOT_STARTED_DEPENDS_ON_12` | Premium restore reconciles the authenticated account; tips are not incorrectly restorable and Seat Pass access comes from the verified server ledger. |
| 14 | Renewal/cancellation/refund/revocation | `NOT_STARTED_DEPENDS_ON_12` | RevenueCat/App Store events preserve idempotency and update access according to verified lifecycle state without creating payable value. |
| 15 | VoiceOver/Dynamic Type/final device regression | `READY_NOT_STARTED` | Representative small/large text, VoiceOver, reduced motion, orientation, iPad, authentication, media, legal, moderation, and account-deletion paths pass. |
| 16 | Final owner legal declarations | `OWNER_ATTESTATION_REQUIRED` | Owner/legal reviewer submits truthful App Privacy, export compliance, content rights, age rating, and EU trader-status answers for the exact binary/provider state. |
| 17 | Final owner approval for public App Store release | `NOT_AUTHORIZED` | Explicit approval may occur only after items 1–16 and App Store review gates pass. It is outside the current internal-TestFlight authorization. |

## Test prerequisites

- Use only application source `bbb9d6db67620b1d39e3a3e67ab8ef7166ce02ae`
  and exact local/TestFlight build `1.0.0 (8)`, Apple build
  `a6ed5eda-fe76-4dd0-b18c-d00c72b0f00f`. Its inspected channel is `ios-qa`,
  runtime is `1.0.0-iosqa1`, and all four client QA capabilities are true.
  Builds 6 and 7 are not eligible for the complete native-call matrix.
- Before StoreKit proof, confirm build 8 has loaded iOS update
  `019f722b-d1e8-77c3-940f-1ec2a67bca23` from group
  `9b320d78-8def-4235-a909-1f82908eb53e`. Fully close and relaunch after the
  update downloads. Roll back to the embedded build-8 update if the JavaScript
  lane regresses.
- Ordinary-push and VoIP rollout remain off unless separately authorized. The App
  Store purchase rail may remain `sandbox_only` for the approved internal lane;
  this does not authorize live money, public purchase rollout, or public release.
- Use bounded test accounts with no owner/admin/payout authority.
- Use non-private media and approved test rooms only.
- Do not bypass room membership, account status, block, moderation, entitlement,
  purchase, or publishing policy to obtain a pass.
- Do not represent Simulator, local CallKit debug UI, native startup, or source
  guards as physical APNs, StoreKit, PushKit, CallKit, or two-party LiveKit proof.

The local StoreKit harness passed the required proof matrix with provider-aligned
prices.

## Evidence policy

Record only:

- sanitized device class and OS version;
- app version/build, bundle identifier, exact source commit, and EAS build ID;
- pass/fail state and a sanitized root cause; and
- whether each feature switch was restored to off after bounded testing.

After every bounded test, confirm no payable balance, payout, transfer,
withdrawal, or cash-out was created.

Never record a UDID, Apple ID, raw email, password, access token, push/VoIP token,
token fingerprint, room JWT, receipt, Firebase plist, private media, signed artifact
URL, private provider identifier, certificate, profile, or API credential.

## Exit rule

The remaining 10% is complete only when all items except public release approval
have directly observed evidence on the exact reviewed build and the owner has made
the required legal declarations. Public release remains a separate explicit owner
decision; internal TestFlight completion never implies it.
