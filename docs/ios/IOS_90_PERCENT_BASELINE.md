# Chi'llywood iOS 90 Percent Baseline

Checkpoint date: 2026-07-15

## Stack and repository truth

| Item | Starting state |
| --- | --- |
| Base branch | `codex/ios-first-development-build` |
| Verified base commit | `a85fa0f42cf9b1a20f761c8817b0713fe27e43bd` |
| Integration branch | `codex/ios-integration-90` |
| Main comparison commit | `3e32999513f5c96ccb36de545acde089315e3317` |
| Foundation pull request | PR #9; open, draft, unmerged, based on `main` |
| Superseded pull request | PR #8; closed after GitHub reported zero changed files, additions, and deletions |
| Unrelated local file | `deno.lock`; untracked and excluded from this work unless a deliberate Deno dependency change later requires it |

The integration branch was created directly from the verified foundation commit. Existing local physical-media status documentation was carried onto the integration branch rather than committed to the foundation branch.

## Established iOS foundation

- Bundle identifier: `com.chillywood.mobile`.
- Apple Team ID: `CU7536UQK9`.
- Firebase Apple application: registered for the exact bundle identifier.
- `IOS_GOOGLE_SERVICES_FILE`: configured as an EAS File secret in development, preview, and production environments.
- Simulator EAS build: `ddc48433-d29d-4a83-a847-0d8908e2da63`.
- Physical-device EAS build: `343b3b6a-53d3-49b2-bed0-57b6f25c23fa`.
- One owner-authorized iPhone and its development provisioning profile exist.
- Physical launch, Firebase startup, sign-in, session persistence, primary navigation, and sign-out passed on application source `5c5fa023cc8ac8532fd0abe76c6199d0a769788d`.
- Android package, Firebase file behavior, EAS build behavior, and submit behavior are unchanged.

## Starting CI state

The foundation workflow reports seven independent pull-request checks:

| Check | Starting result |
| --- | --- |
| `Phase 1 / Repository Lint` | Fail: 157 findings (69 errors and 88 warnings) |
| `Phase 1 / TypeScript` | Pass |
| `Phase 1 / Runtime Validation` | Pass |
| `Phase 1 / Route Contracts` | Pass |
| `Phase 1 / iOS Configuration` | Pass |
| `Phase 1 / Android Regression Guards` | Pass |
| `Phase 1 / Expo Doctor` | Fail: 17 of 18 checks pass; ten Expo SDK patch-alignment findings |

Additional starting validation facts:

- the composite Android launcher-icon policy depends on ignored generated native output and needs a tracked-source truth contract;
- no automatic audit fix is authorized;
- the existing audit checkpoint records one critical and seven high transitive production-graph advisories; and
- no major Expo or React Native upgrade is part of this integration.

## Starting integration gaps

- Physical camera, microphone, and Photos behavior is not yet proven.
- True two-device LiveKit media is blocked until a second approved physical client is available.
- iOS ordinary push registration is intentionally unsupported by the foundation client.
- notification dispatch currently selects Android push tokens in several backend functions.
- Android FCM full-screen call handling exists; iOS CallKit/PushKit source and VoIP-token backend do not yet exist.
- Associated Domains is present, but a canonical deployed Apple App Site Association source and guard are not yet established.
- RevenueCat contains an iOS SDK-key path, but commerce policy, product mappings, webhook store detection, and user-facing copy remain Google Play-centric.
- App Store Connect application/product records, RevenueCat Apple provider configuration, privacy manifest, submission profile, release workflows, final archive, and internal TestFlight upload are not yet evidenced.

## Non-negotiable boundaries

- No merge, public App Store release, external TestFlight distribution, automatic release, or production OTA publication.
- No live money, payable balance, creator payout, cash-out, or withdrawal activation.
- No destructive migration, RLS weakening, authority bypass, or removal of Android provider values.
- Runtime-visible iOS native calls and Apple purchase paths remain off until their stated verification gates pass.
- Credentials remain only in approved provider secret stores and are never printed or committed.
- Generated `ios/`, generated `android/`, `supabase/.temp`, downloaded artifacts, provider environment files, certificates, profiles, and unrelated files are excluded from commits.

This baseline records facts only. Completion claims belong in `IOS_90_PERCENT_COMPLETION.md` after the final source, provider, deployment, build, and internal-TestFlight evidence exists.
