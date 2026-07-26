# iOS 90% Completion Record

Checkpoint date: 2026-07-16

Status: **Source, deployment, build-7 OTA, and local all-flags build-8 preparation
are complete.** Build 7 remains native-disabled by its immutable runtime key; its
iOS-only OTA enables only compatible JavaScript surfaces. Local build 8 is the
isolated `ios-qa` / `1.0.0-iosqa1` physical candidate with all four client QA
capabilities enabled and every private rollout/money switch still off. The final
physical/owner 10% remains unclaimed and has not begun.
This record deliberately separates committed source, provider configuration,
deployment evidence, build evidence, and the remaining physical/owner proof.

## Branch and pull requests

- Integration branch: `codex/ios-integration-90`.
- Provider-closeout starting head:
  `97cd97cd58b021d2f45021c3e121b8a35158cee8`.
- Provider-closeout source hardening: `0ec109db`.
- Previous tested application source: `97cd97cd58b021d2f45021c3e121b8a35158cee8`; superseded by the semantic correction.
- Screenshot-only follow-up: `a4ab1d49`.
- Release-workflow portability fix: `f7af588d`.
- Critical transitive advisory patch: `d6a95ed5`.
- Semantic call/RevenueCat correction:
  `e43f34ab41a7e936e6eeca9b0031faa3de557559`.
- Final application/build source:
  `d5a8db65edbdd19fec42ad37ca1162412f66a41e`.
- Final iOS QA and local build-8 source:
  `bbb9d6db67620b1d39e3a3e67ab8ef7166ce02ae`.
- Stacked draft PR: [#10](https://github.com/Chillywood2025/chillywood-mobile/pull/10), based on `codex/ios-first-development-build`.
- Foundation branch: `codex/ios-first-development-build` at
  `a85fa0f42cf9b1a20f761c8817b0713fe27e43bd`.
- Foundation PR [#9](https://github.com/Chillywood2025/chillywood-mobile/pull/9)
  remains open, draft, and unmerged.
- Superseded PR [#8](https://github.com/Chillywood2025/chillywood-mobile/pull/8)
  was verified to contain no unique changes and is closed.
- PRs [#11](https://github.com/Chillywood2025/chillywood-mobile/pull/11) and
  [#13](https://github.com/Chillywood2025/chillywood-mobile/pull/13) contained no
  unique product work absent from PR #10 and were closed as superseded.
- Neither PR has been merged.

The corrected source passes the full local Node 20 suite, 92 database assertions,
and all eight remote checks. Replacement Simulator, signed archive, submission,
Apple processing, and internal-group readbacks are recorded below.

## Completion against the required definition

| # | Requirement | Status | Evidence / remaining gate |
| ---: | --- | --- | --- |
| 1 | All required CI checks pass | **Pass** | All eight independent checks passed at `bbb9d6db67620b1d39e3a3e67ab8ef7166ce02ae`, including `Phase 1 / Supabase Database Integration`. |
| 2 | Repository lint is green | **Pass** | `npm run lint` exits zero with 0 errors and 87 warnings. Warnings remain visible and are not suppressed. |
| 3 | TypeScript is green | **Local pass** | `npx tsc --noEmit` passes after the commerce provider declaration-order correction. |
| 4 | Expo Doctor is green | **Pass** | `npx expo-doctor` reports 18/18 checks. |
| 5 | Android regression guards pass | **Pass** | Android package, Firebase behavior, EAS profiles, Google provider values, and notification payload behavior are preserved by the guards. |
| 6 | Final-source iOS Simulator native build passes | **Pass** | `b9bb006e-1a96-4817-8ee2-6f3647983d8b` from `d5a8db65` installed cleanly, launched, remained alive, and contained the Firebase/privacy manifests. |
| 7 | Production iOS archive builds | **Pass** | Exact EAS build `8bfbd8cf-aa1b-4ba0-bebf-413ae0f60555`, version `1.0.0 (7)`, finished from `d5a8db65`; strict signed-archive inspection passed. |
| 8 | Firebase iOS is configured | **Pass** | Firebase Apple app exists for `com.chillywood.mobile`; the plist remains outside Git and `IOS_GOOGLE_SERVICES_FILE` is an EAS File secret in development, preview, and production. |
| 9 | AASA is deployed and validates | **Pass** | `https://chillywoodstream.com/.well-known/apple-app-site-association` returns HTTP 200 directly with JSON content type and a body matching the canonical source. |
| 10 | Supabase Auth redirect URLs are configured | **Pass** | The custom scheme and the required HTTPS authentication routes are configured. Physical signed-build link proof remains in the device matrix. |
| 11 | Ordinary iOS push client code is complete | **Source complete** | Platform-neutral registration, permission states, physical-device gating, Expo token registration, categories, badge handling, response dedupe, activation refresh, and logout revocation are implemented. |
| 12 | Ordinary iOS push backend is deployed | **Pass; rollout off** | Platform-aware registration/dispatch functions are active; Android keeps `channelId`, iOS omits it, and rollout defaults off. |
| 13 | APNs credentials are configured | **Configured, unproven** | EAS has an APNs credential for ordinary notifications. A separate least-privilege VoIP APNs key is stored only as Supabase function secrets. No key material is in Git or this record. Physical delivery is unclaimed. |
| 14 | CallKit/PushKit source compiles | **Pass; server rollout off** | The Expo module and Swift implementation compile in local production-signed build 8; the native build/runtime gates are true only in the isolated QA binary. |
| 15 | VoIP token and APNs dispatch backend is deployed | **Pass; rollout off** | VoIP dispatch v5, dispatcher v37, transition v3, and retry worker v2 are active. Dispatch cannot mutate invite state; autonomous terminal retry is bounded and fail-closed. |
| 16 | Native iOS calls are isolated to the QA binary | **Pass** | Build 7 has native runtime default false and cannot be enabled by OTA. Build 8 uses `ios-qa` / `1.0.0-iosqa1` with both native gates true while private VoIP dispatch remains off. |
| 17 | RevenueCat Apple app is configured | **Pass** | Existing project `projc5629a24` contains Apple app `app3a0ad1ba62` for `com.chillywood.mobile`; ten products, entitlement/offering/packages, EAS public-key configuration, and webhook readback pass. A dedicated Apple In-App Purchase Key was uploaded directly and remained `Valid credentials` after reload; the existing App Store Connect API credential also remains valid. No private credential value is in Git. |
| 18 | App Store products exist | **Pass** | The permanent finite catalog exists in App Store Connect: 2 Premium subscriptions and 8 consumables, with required localizations, prices, and USA availability. |
| 19 | Store mappings exist | **Pass, sandbox-only** | The additive mapping schema is deployed with ten App Store sandbox mappings and generated types. |
| 20 | Store-aware webhook is deployed | **Pass; purchase rail off** | `revenuecat-webhook` v72 calls service-only atomic RPCs, accepts valid localized App Store consumables by permanent product/intent identity, records provider amount/currency, and preserves Google/base-plan parsing. |
| 21 | Apple purchase paths are sandbox/internal only | **Pass, disabled** | Catalog entries are sandbox-only and the App Store purchase switch defaults off. No payable transaction is enabled. |
| 22 | Live money remains off | **Pass** | No live-money switch was enabled. |
| 23 | Payouts and cash-out remain off | **Pass** | No payout, withdrawal, cash-out, transfer, or payable-balance path was enabled. |
| 24 | Privacy manifest is included | **Pass** | Canonical privacy source is wired through Expo and present in the signed production archive. Tracking remains false. |
| 25 | App Privacy working papers are complete | **Repository preparation complete** | Worksheet, review notes, metadata, and release checklist exist. Owner legal/privacy attestation remains explicitly uncompleted. |
| 26 | App Store metadata and screenshots are prepared | **Draft pass** | Metadata/review material and public-safe standard, large, small, and tablet-format screenshot drafts exist with provenance. Owner marketing/legal approval remains required. |
| 27 | EAS iOS submit profile exists | **Pass** | `submit.production.ios.ascAppId` uses the real App Store Connect numeric app ID; Android submit configuration is unchanged. |
| 28 | Production App Store build succeeds | **Pass** | Archive inspection passed bundle/team ID, arm64 signature, production APNs, Associated Domains, Firebase-file presence, privacy manifest, opaque icons, and expected background modes. Xcode logs record dSYM generation; EAS exposed no separate dSYM artifact. |
| 29 | Internal TestFlight upload succeeds | **Pass; internal only** | Submission `04b9bc95-eb1d-4fb3-95e0-dbf5de790fce` uploaded exact EAS build 7. Apple build `b5eaaad6-ef24-49c5-8e50-b10cf2807412` is `Ready to Submit` and assigned to exactly one group, `Chillywood Internal` (`Internal`); no individual/external testers exist. |
| 29a | Build-7 compatible iOS OTA exists | **Pass; iOS only** | Production/runtime `1.0.0` group `896eea68-859a-4cfe-9697-725299be45bf` enables ordinary push and App Store client surfaces while native calls remain false. Rollback target is `8e158980-75d1-47ef-bd26-f3f9e564fdab`. |
| 29b | Local all-flags QA binary exists | **Pass; internal only** | Local-only `1.0.0 (8)` IPA SHA-256 `24a951d58302dd73e13e4adc899fc28680472eb78f37cac04639ee95896e36d8` passed archive inspection with `ios-qa`, runtime `1.0.0-iosqa1`, and all four client flags true. Submission `e0b894e3-5dfc-44c5-9da2-e36c3b85bd5b` produced Apple build `a6ed5eda-fe76-4dd0-b18c-d00c72b0f00f`, assigned only to `Chillywood Internal` with zero individual testers and no external group. |
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
- EAS environment secrets include the Firebase file variable. Build 7's OTA keeps
  native calls false while enabling ordinary-push/App Store client surfaces;
  isolated build 8 enables all four client QA capabilities. Private server rollout
  and money switches remain off.
- Ten additive integration migrations and eight Edge Functions are active after
  restricted readback. Premium prices are `999`/`9999`; the Android catalog digest
  remains `4fb5d0565f6697269e2572a63d3bd678`; rollout and money switches remain off.
- Historical build 6 remains valid but superseded. Build 7 is assigned only to
  `Chillywood Internal`; no individual/external tester or public release exists.
- RevenueCat project `projc5629a24` reuses its existing API v2 configuration key;
  the key has all required configuration read/write scopes and no new key was
  created. Apple app `app3a0ad1ba62` is configured without replacing the Android
  app or mappings.
- The ten Apple product records comprise two subscriptions and eight consumables.
  Entitlement `premium` attaches only the two subscriptions. Offerings `default`,
  `creator_support`, and `seat_passes` contain their exact bounded packages; tips
  and Seat Passes grant no media, administrative, or payable authority.
- The public iOS SDK key is stored as the sensitive EAS variable
  `EXPO_PUBLIC_REVENUECAT_IOS_PUBLIC_SDK_KEY` in development, preview, and
  production. Only the masked suffix `appl…gpDW` is recorded.
- Existing project-wide webhook `whintgr38699522f7` was reused. Its bounded TEST
  passed signature/processing verification without granting Premium or taking a
  live-money action.
- A provider-generated StoreKit configuration matches all product identifiers,
  types, and durations and passes the Simulator harness 3/3. Current prices now
  align with the canonical fixtures; provider group labeling remains source of
  truth per existing App Store assignment. `SKInternalErrorDomain Code 3` did not
  recur.
- Stripe physical-merch and Connect lanes remain shared and platform-neutral in
  test mode. Required secret names and active webhook endpoints are present;
  charges, payouts, transfers, cash-out, and iOS digital Stripe checkout remain
  disabled.
- The dedicated Apple In-App Purchase Key is securely stored outside Git and in
  Keychain, and RevenueCat reports `Valid credentials` after reload. The existing
  App Store Connect API credential also remains valid.

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
- `npm run guard:chilly-chat-call-push-policy` — pass with response-schema,
  VoIP-only, terminal-action, and idempotency fixtures;
- `npm run guard:watch-party-livekit` — pass;
- `npm run guard:old-room-handling` — pass;
- `npm run guard:ios-config-policy` — pass;
- `npm run proof:ios-config` — pass;
- AASA, commerce catalog/policy, media, push-platform, native-call, VoIP, privacy,
  and release-workflow guards/proofs — pass;
- `npx expo-doctor` — pass, 18/18;
- `git diff --check` — pass; and
- `npx supabase test db` — pass, 92 assertions including durable transitions,
  duplicate/lifecycle/intent behavior, exact price readback, and every forced
  transaction rollback stage; and
- Expo public configuration resolution — pass without recording resolved secret
  values.

Android prebuild, managed-iOS prebuild, production archive, sanitized archive
inspection, and internal-TestFlight assignment were validated from final source.
The protected EAS Firebase file variable supplied clean iOS prebuild without
entering Git. A separate slow local Xcode compile was stopped and is not claimed;
the final-source EAS Simulator build provides terminal native Swift/Pods compile
evidence.

## Dependency security checkpoint

- Root mobile production graph: 0 critical, 0 high, 21 moderate, 1 low.
- A newly surfaced critical transitive `websocket-driver` advisory was resolved
  with the supported 0.7.5 patch-only lock update in `d6a95ed5`; no dependency
  manifest or major SDK changed.
- The independently locked `ops/alert-automation` package retains a direct high
  advisory in Nodemailer; its safe line requires a major-version update and is
  documented for a separate alerting-security PR.
- No `npm audit fix` or forced major upgrade was run.

## Post-90 final proof

The provider credential gate, semantic backend corrections, autonomous retry,
storefront-safe webhook, eight remote checks, build-7 OTA, and inspected local
build 8 are closed. The physical-device and owner-attestation matrix has not begun
and remains the unclaimed final 10%.
