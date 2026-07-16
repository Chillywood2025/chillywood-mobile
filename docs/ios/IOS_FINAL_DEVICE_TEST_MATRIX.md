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

**Do not begin this matrix yet.** Build 6 is superseded. Replacement Simulator
`b9bb006e-1a96-4817-8ee2-6f3647983d8b` and internal TestFlight build 7 are now
recorded, but the current instruction is to stop before physical-device execution.
The readiness statuses below do not authorize a test or a feature-switch change.

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
| 12 | TestFlight StoreKit purchase | `AWAITING_BOUNDED_SANDBOX_APPROVAL` | After a separately approved bounded sandbox window, an approved account completes only a non-payable internal transaction for each supported product type. |
| 13 | Restore Purchases | `NOT_STARTED_DEPENDS_ON_12` | Premium restore reconciles the authenticated account; tips are not incorrectly restorable and Seat Pass access comes from the verified server ledger. |
| 14 | Renewal/cancellation/refund/revocation | `NOT_STARTED_DEPENDS_ON_12` | RevenueCat/App Store events preserve idempotency and update access according to verified lifecycle state without creating payable value. |
| 15 | VoiceOver/Dynamic Type/final device regression | `READY_NOT_STARTED` | Representative small/large text, VoiceOver, reduced motion, orientation, iPad, authentication, media, legal, moderation, and account-deletion paths pass. |
| 16 | Final owner legal declarations | `OWNER_ATTESTATION_REQUIRED` | Owner/legal reviewer submits truthful App Privacy, export compliance, content rights, age rating, and EU trader-status answers for the exact binary/provider state. |
| 17 | Final owner approval for public App Store release | `NOT_AUTHORIZED` | Explicit approval may occur only after items 1–16 and App Store review gates pass. It is outside the current internal-TestFlight authorization. |

## Test prerequisites

- Use only application source `d5a8db65edbdd19fec42ad37ca1162412f66a41e`,
  Simulator `b9bb006e-1a96-4817-8ee2-6f3647983d8b`, and exact internal TestFlight
  EAS build `8bfbd8cf-aa1b-4ba0-bebf-413ae0f60555` / Apple build
  `b5eaaad6-ef24-49c5-8e50-b10cf2807412`, version `1.0.0 (7)`. Build 6 and source
  `97cd97cd58b021d2f45021c3e121b8a35158cee8` are not eligible.
- Keep ordinary push, native calls, and App Store purchase switches off except for
  one bounded test capability at a time after backend/provider verification.
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

Never record a UDID, Apple ID, raw email, password, access token, push/VoIP token,
token fingerprint, room JWT, receipt, Firebase plist, private media, signed artifact
URL, private provider identifier, certificate, profile, or API credential.

## Exit rule

The remaining 10% is complete only when all items except public release approval
have directly observed evidence on the exact reviewed build and the owner has made
the required legal declarations. Public release remains a separate explicit owner
decision; internal TestFlight completion never implies it.
