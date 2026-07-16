# iOS 90% Completion Record

Checkpoint date: 2026-07-15

Status: **Not yet 90% complete.** This record deliberately separates committed
source, provider configuration, deployment evidence, build evidence, and physical
proof. The branch must not be described as 90% complete until every item in the
definition below is supported by terminal evidence.

## Branch and pull requests

- Integration branch: `codex/ios-integration-90`.
- Tested application source: `d6a95ed5`.
- Screenshot-only follow-up: `a4ab1d49`.
- Release-workflow portability fix: `f7af588d`.
- Critical transitive advisory patch: `d6a95ed5`.
- Stacked draft PR: [#10](https://github.com/Chillywood2025/chillywood-mobile/pull/10), based on `codex/ios-first-development-build`.
- Foundation branch: `codex/ios-first-development-build` at
  `a85fa0f42cf9b1a20f761c8817b0713fe27e43bd`.
- Foundation PR [#9](https://github.com/Chillywood2025/chillywood-mobile/pull/9)
  remains open, draft, and unmerged.
- Superseded PR [#8](https://github.com/Chillywood2025/chillywood-mobile/pull/8)
  was verified to contain no unique changes and is closed.
- Neither PR has been merged.

All seven separated Phase 1 checks passed remotely at final application source
`d6a95ed5`.

## Completion against the required definition

| # | Requirement | Status | Evidence / remaining gate |
| ---: | --- | --- | --- |
| 1 | All required CI checks pass | **Pass** | All seven independent checks passed at final application source `d6a95ed5`. |
| 2 | Repository lint is green | **Pass** | `npm run lint` exits zero with 0 errors and 87 warnings. Warnings remain visible and are not suppressed. |
| 3 | TypeScript is green | **Local pass** | `npx tsc --noEmit` passes after the commerce provider declaration-order correction. |
| 4 | Expo Doctor is green | **Pass** | `npx expo-doctor` reports 18/18 checks. |
| 5 | Android regression guards pass | **Pass** | Android package, Firebase behavior, EAS profiles, Google provider values, and notification payload behavior are preserved by the guards. |
| 6 | Final-source iOS Simulator native build passes | **Pass** | EAS build `da3e6e33-fd7a-4ed2-88fb-881d2df6ef7c` finished from `d6a95ed5`, installed on iOS 26.5, and reached splash/sign-in without a native crash after the cold Metro bundle completed. Current-build authentication was not exercised and is not claimed. |
| 7 | Production iOS archive builds | **Pass** | EAS build `3a1b9d40-06b7-4e1f-99d0-5839e6154eab`, version `1.0.0 (4)`, finished from `d6a95ed5`. |
| 8 | Firebase iOS is configured | **Pass** | Firebase Apple app exists for `com.chillywood.mobile`; the plist remains outside Git and `IOS_GOOGLE_SERVICES_FILE` is an EAS File secret in development, preview, and production. |
| 9 | AASA is deployed and validates | **Pass** | `https://chillywoodstream.com/.well-known/apple-app-site-association` returns HTTP 200 directly with JSON content type and a body matching the canonical source. |
| 10 | Supabase Auth redirect URLs are configured | **Pass** | The custom scheme and the required HTTPS authentication routes are configured. Physical signed-build link proof remains in the device matrix. |
| 11 | Ordinary iOS push client code is complete | **Source complete** | Platform-neutral registration, permission states, physical-device gating, Expo token registration, categories, badge handling, response dedupe, activation refresh, and logout revocation are implemented. |
| 12 | Ordinary iOS push backend is deployed | **Pass; rollout off** | Platform-aware registration/dispatch functions are active; Android keeps `channelId`, iOS omits it, and rollout defaults off. |
| 13 | APNs credentials are configured | **Configured, unproven** | EAS has an APNs credential for ordinary notifications. A separate least-privilege VoIP APNs key is stored only as Supabase function secrets. No key material is in Git or this record. Physical delivery is unclaimed. |
| 14 | CallKit/PushKit source compiles | **Pass; runtime off** | The Expo module, Swift CallKit/PushKit/AVAudioSession implementation, plugin, and source guards compiled in the final-source EAS Simulator build. |
| 15 | VoIP token and APNs dispatch backend is deployed | **Pass; rollout off** | Additive schema plus authenticated register/status/rotate/revoke and APNs dispatch functions are deployed. Runtime and server rollout switches remain off. |
| 16 | Native iOS calls remain runtime-disabled pending proof | **Pass** | Build capability can be included, while `EXPO_PUBLIC_IOS_NATIVE_CALLS_ENABLED=false` and VoIP dispatch remains disabled. |
| 17 | RevenueCat Apple app is configured | **Blocked: provider permission** | The authenticated RevenueCat dashboard account cannot create app configurations. No Apple app, offering, entitlement mapping, or webhook completion is claimed. |
| 18 | App Store products exist | **Pass** | The permanent finite catalog exists in App Store Connect: 2 Premium subscriptions and 8 consumables, with required localizations, prices, and USA availability. |
| 19 | Store mappings exist | **Pass, sandbox-only** | The additive mapping schema is deployed with ten App Store sandbox mappings and generated types. |
| 20 | Store-aware webhook is deployed | **Backend pass; provider connection blocked** | `revenuecat-webhook` v69 is active and preserves Google parsing/exact Apple matching. RevenueCat's external Apple app/webhook configuration remains blocked by account permission. |
| 21 | Apple purchase paths are sandbox/internal only | **Pass, disabled** | Catalog entries are sandbox-only and the App Store purchase switch defaults off. No payable transaction is enabled. |
| 22 | Live money remains off | **Pass** | No live-money switch was enabled. |
| 23 | Payouts and cash-out remain off | **Pass** | No payout, withdrawal, cash-out, transfer, or payable-balance path was enabled. |
| 24 | Privacy manifest is included | **Pass** | Canonical privacy source is wired through Expo and present in the signed production archive. Tracking remains false. |
| 25 | App Privacy working papers are complete | **Repository preparation complete** | Worksheet, review notes, metadata, and release checklist exist. Owner legal/privacy attestation remains explicitly uncompleted. |
| 26 | App Store metadata and screenshots are prepared | **Draft pass** | Metadata/review material and public-safe standard, large, small, and tablet-format screenshot drafts exist with provenance. Owner marketing/legal approval remains required. |
| 27 | EAS iOS submit profile exists | **Pass** | `submit.production.ios.ascAppId` uses the real App Store Connect numeric app ID; Android submit configuration is unchanged. |
| 28 | Production App Store build succeeds | **Pass** | Archive inspection passed bundle/team ID, arm64 signature, production APNs, Associated Domains, Firebase-file presence, privacy manifest, opaque icons, and expected background modes. Xcode logs record dSYM generation; EAS exposed no separate dSYM artifact. |
| 29 | Internal TestFlight upload succeeds | **Pass: internal only** | Submission `ade71443-0a05-49c2-8aa4-c411d4cb3e28` uploaded exact build `3a1b9d40-06b7-4e1f-99d0-5839e6154eab`; Apple processing is `VALID`, group `Chillywood Internal` is assigned, and bounded testing notes are configured. Build 4 supersedes internal build 3. |
| 30 | No public release occurs | **Pass** | Public release and external TestFlight are not authorized and have not occurred. |
| 31 | Exact evidence and remaining device matrix exist | **Pass as an interim record** | This document and `IOS_FINAL_DEVICE_TEST_MATRIX.md` preserve exact evidence without converting provider/device blockers into completion. |

## Verified provider and store preparation

- App Store Connect app: Chi'llywood, bundle `com.chillywood.mobile`, version
  `1.0.0`, numeric app ID `6791217176`.
- Apple catalog: 2 auto-renewing Premium subscriptions, 4 consumable tip tiers,
  and 4 consumable Seat Pass tiers. Dynamic paid video, general event, VIP, and
  per-channel products remain disabled on iOS rather than fabricating permanent
  product IDs.
- AASA deployment and Supabase Auth redirect configuration are complete.
- Protected GitHub environments `ios-preview` and `ios-production` exist, and
  release workflows require manual dispatch and protected-environment approval.
- EAS environment secrets include the Firebase file variable; ordinary push,
  native calls, and App Store purchases remain runtime-disabled.
- Three additive migrations and six Edge Functions are deployed after restricted
  backup. Ten sandbox store mappings exist; rollout and money switches remain off.
- Production build `3a1b9d40-06b7-4e1f-99d0-5839e6154eab` is valid in internal
  TestFlight group `Chillywood Internal`; no external or public release exists.
- RevenueCat Apple setup is the only known provider-dashboard permission blocker.

## Local validation at this checkpoint

Run with Node 20 and passing unless marked otherwise:

- `npm ci` — pass;
- `npm run lint` — pass, 0 errors and 87 warnings;
- `npx tsc --noEmit` — pass;
- `npm run validate:runtime` — pass;
- strict iOS runtime validation with the owner-local Firebase path — pass without
  reading or printing the file;
- `npm run guard:route-contracts` — pass;
- `npm run guard:payment-rail-policy` — pass;
- `npm run guard:notification-room-call-policy` — pass;
- `npm run guard:watch-party-livekit` — pass;
- `npm run guard:old-room-handling` — pass;
- `npm run guard:ios-config-policy` — pass;
- `npm run proof:ios-config` — pass;
- AASA, commerce catalog/policy, media, push-platform, native-call, VoIP, privacy,
  and release-workflow guards/proofs — pass;
- `npx expo-doctor` — pass, 18/18;
- `git diff --check` — pass; and
- Expo public configuration resolution — pass without recording resolved secret
  values.

Clean iOS prebuild/CocoaPods, final-source EAS Simulator build, clean Android
prebuild, production archive, sanitized archive inspection, and internal-TestFlight
upload all pass. A separate slow local Xcode compile was stopped and is not claimed;
the EAS Simulator build provides terminal native Swift/Pods compile evidence.

## Dependency security checkpoint

- Root mobile production graph: 0 critical, 0 high, 21 moderate, 1 low.
- A newly surfaced critical transitive `websocket-driver` advisory was resolved
  with the supported 0.7.5 patch-only lock update in `d6a95ed5`; no dependency
  manifest or major SDK changed.
- The independently locked `ops/alert-automation` package retains a direct high
  advisory in Nodemailer; its safe line requires a major-version update and is
  documented for a separate alerting-security PR.
- No `npm audit fix` or forced major upgrade was run.

## Gates before a 90% claim

1. Obtain RevenueCat app-configuration permission and complete the Apple app,
   product import, entitlements/offering, SDK key, and webhook.
2. Obtain green CI on the final documentation/workflow-only head.

The physical-device and owner-attestation matrix is the explicitly defined final
10%; it remains after a valid 90% claim and is not hidden inside the provider gate.

Until those gates close, the accurate verdict is **partial integration readiness,
not 90% complete**.
