# iOS 90% Completion Record

Checkpoint date: 2026-07-16

Status: **Semantic source/backend correction complete; replacement build pending.**
Call orchestration is canonical and durable, RevenueCat normalized events are
transactional, and the corrected Premium prices are deployed. Build 6 is
superseded; this record must not be called source-closeout complete until the new
Simulator and internal TestFlight candidate pass.
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
- Stacked draft PR: [#10](https://github.com/Chillywood2025/chillywood-mobile/pull/10), based on `codex/ios-first-development-build`.
- Foundation branch: `codex/ios-first-development-build` at
  `a85fa0f42cf9b1a20f761c8817b0713fe27e43bd`.
- Foundation PR [#9](https://github.com/Chillywood2025/chillywood-mobile/pull/9)
  remains open, draft, and unmerged.
- Superseded PR [#8](https://github.com/Chillywood2025/chillywood-mobile/pull/8)
  was verified to contain no unique changes and is closed.
- Neither PR has been merged.

The corrected working tree passes the full local Node 20 suite and 76 database
assertions. Seven remote checks and replacement build evidence are pending the new
commit.

## Completion against the required definition

| # | Requirement | Status | Evidence / remaining gate |
| ---: | --- | --- | --- |
| 1 | All required CI checks pass | **Pass** | All seven independent checks passed at final application source `97cd97cd58b021d2f45021c3e121b8a35158cee8`. |
| 2 | Repository lint is green | **Pass** | `npm run lint` exits zero with 0 errors and 87 warnings. Warnings remain visible and are not suppressed. |
| 3 | TypeScript is green | **Local pass** | `npx tsc --noEmit` passes after the commerce provider declaration-order correction. |
| 4 | Expo Doctor is green | **Pass** | `npx expo-doctor` reports 18/18 checks. |
| 5 | Android regression guards pass | **Pass** | Android package, Firebase behavior, EAS profiles, Google provider values, and notification payload behavior are preserved by the guards. |
| 6 | Final-source iOS Simulator native build passes | **Replacement pending** | Prior Simulator build `6d8e5193-ea75-490f-9451-759419a3e7b3` is superseded. A new corrected-source artifact must be installed and smoked before physical testing. |
| 7 | Production iOS archive builds | **Replacement pending** | Prior archive `a729aa9a-1a98-439c-8c81-48c381735d8d`, version `1.0.0 (6)`, is superseded. Build 7 or higher is required. |
| 8 | Firebase iOS is configured | **Pass** | Firebase Apple app exists for `com.chillywood.mobile`; the plist remains outside Git and `IOS_GOOGLE_SERVICES_FILE` is an EAS File secret in development, preview, and production. |
| 9 | AASA is deployed and validates | **Pass** | `https://chillywoodstream.com/.well-known/apple-app-site-association` returns HTTP 200 directly with JSON content type and a body matching the canonical source. |
| 10 | Supabase Auth redirect URLs are configured | **Pass** | The custom scheme and the required HTTPS authentication routes are configured. Physical signed-build link proof remains in the device matrix. |
| 11 | Ordinary iOS push client code is complete | **Source complete** | Platform-neutral registration, permission states, physical-device gating, Expo token registration, categories, badge handling, response dedupe, activation refresh, and logout revocation are implemented. |
| 12 | Ordinary iOS push backend is deployed | **Pass; rollout off** | Platform-aware registration/dispatch functions are active; Android keeps `channelId`, iOS omits it, and rollout defaults off. |
| 13 | APNs credentials are configured | **Configured, unproven** | EAS has an APNs credential for ordinary notifications. A separate least-privilege VoIP APNs key is stored only as Supabase function secrets. No key material is in Git or this record. Physical delivery is unclaimed. |
| 14 | CallKit/PushKit source compiles | **Pass; runtime off** | The Expo module, Swift CallKit/PushKit/AVAudioSession implementation, plugin, and source guards compiled in the final-source EAS Simulator build. |
| 15 | VoIP token and APNs dispatch backend is deployed | **Pass; rollout off** | VoIP dispatch v2 is independent of ordinary tokens and in-app insert success. The canonical dispatcher v34 and durable transition v1 are active; runtime and server rollout switches remain off. |
| 16 | Native iOS calls remain runtime-disabled pending proof | **Pass** | Build capability can be included, while `EXPO_PUBLIC_IOS_NATIVE_CALLS_ENABLED=false` and VoIP dispatch remains disabled. |
| 17 | RevenueCat Apple app is configured | **Pass** | Existing project `projc5629a24` contains Apple app `app3a0ad1ba62` for `com.chillywood.mobile`; ten products, entitlement/offering/packages, EAS public-key configuration, and webhook readback pass. A dedicated Apple In-App Purchase Key was uploaded directly and remained `Valid credentials` after reload; the existing App Store Connect API credential also remains valid. No private credential value is in Git. |
| 18 | App Store products exist | **Pass** | The permanent finite catalog exists in App Store Connect: 2 Premium subscriptions and 8 consumables, with required localizations, prices, and USA availability. |
| 19 | Store mappings exist | **Pass, sandbox-only** | The additive mapping schema is deployed with ten App Store sandbox mappings and generated types. |
| 20 | Store-aware webhook is deployed | **Pass; purchase rail off** | `revenuecat-webhook` v70 calls service-only atomic Premium/consumable RPCs and preserves Google/base-plan parsing plus exact Apple matching. The App Store switch remains off. |
| 21 | Apple purchase paths are sandbox/internal only | **Pass, disabled** | Catalog entries are sandbox-only and the App Store purchase switch defaults off. No payable transaction is enabled. |
| 22 | Live money remains off | **Pass** | No live-money switch was enabled. |
| 23 | Payouts and cash-out remain off | **Pass** | No payout, withdrawal, cash-out, transfer, or payable-balance path was enabled. |
| 24 | Privacy manifest is included | **Pass** | Canonical privacy source is wired through Expo and present in the signed production archive. Tracking remains false. |
| 25 | App Privacy working papers are complete | **Repository preparation complete** | Worksheet, review notes, metadata, and release checklist exist. Owner legal/privacy attestation remains explicitly uncompleted. |
| 26 | App Store metadata and screenshots are prepared | **Draft pass** | Metadata/review material and public-safe standard, large, small, and tablet-format screenshot drafts exist with provenance. Owner marketing/legal approval remains required. |
| 27 | EAS iOS submit profile exists | **Pass** | `submit.production.ios.ascAppId` uses the real App Store Connect numeric app ID; Android submit configuration is unchanged. |
| 28 | Production App Store build succeeds | **Pass** | Archive inspection passed bundle/team ID, arm64 signature, production APNs, Associated Domains, Firebase-file presence, privacy manifest, opaque icons, and expected background modes. Xcode logs record dSYM generation; EAS exposed no separate dSYM artifact. |
| 29 | Internal TestFlight upload succeeds | **Replacement pending** | Historical build 6 remains internal only but is superseded. A new exact build 7 or higher must be uploaded only to `Chillywood Internal`; no external/public distribution is authorized. |
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
- Seven additive integration migrations and seven Edge Functions are active after
  restricted readback. Premium prices are `999`/`9999`; the Android catalog digest
  remains `4fb5d0565f6697269e2572a63d3bd678`; rollout and money switches remain off.
- Historical build 6 remains valid but superseded in `Chillywood Internal`; no
  external or public release exists.
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
- `npx supabase test db` — pass, 76 assertions including durable transitions,
  duplicate/lifecycle/intent behavior, exact price readback, and every forced
  transaction rollback stage; and
- Expo public configuration resolution — pass without recording resolved secret
  values.

Android prebuild, production archive, sanitized archive inspection, and
internal-TestFlight upload were validated from final source. Local clean iOS
prebuild still requires `expo.ios.googleServicesFile` in the active environment
path during local runs and therefore was not completed to completion in this
workspace. A separate slow local Xcode compile was stopped and is not claimed;
the final-source EAS simulator build provides terminal native Swift/Pods compile
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

The provider credential gate and semantic backend corrections are closed. The
replacement commit, seven remote checks, Simulator smoke, archive inspection, and
internal build 7+ are still required before the physical-device matrix. The final
10% remains unclaimed.
