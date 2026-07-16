# Chi'llywood iOS Status

Checkpoint date: 2026-07-15

Overall verdict: **The 90% repository, provider, build, and internal-TestFlight
checkpoint is complete. RevenueCat's dedicated Apple In-App Purchase credential
now validates alongside the existing App Store Connect API credential. The final
physical-device and owner-attestation matrix remains intentionally unclaimed.**

## Repository and pull-request state

| Item | Current state |
| --- | --- |
| Integration branch | `codex/ios-integration-90` |
| Provider-closeout starting head | `97cd97cd58b021d2f45021c3e121b8a35158cee8` |
| Provider-closeout source hardening | `0ec109db` |
| Tested application source | `97cd97cd58b021d2f45021c3e121b8a35158cee8` |
| Screenshot-only follow-up | `a4ab1d49` |
| Release-workflow portability fix | `f7af588d` |
| Critical transitive advisory patch | `d6a95ed5` (`websocket-driver` 0.7.5 lockfile-only) |
| Stacked integration PR | [#10](https://github.com/Chillywood2025/chillywood-mobile/pull/10), open, draft, base `codex/ios-first-development-build` |
| Foundation branch | `codex/ios-first-development-build` at `a85fa0f42cf9b1a20f761c8817b0713fe27e43bd` |
| Foundation PR | [#9](https://github.com/Chillywood2025/chillywood-mobile/pull/9), open, draft, unmerged |
| Superseded PR | [#8](https://github.com/Chillywood2025/chillywood-mobile/pull/8), verified empty and closed |
| Unrelated local state | `deno.lock` remains untracked and is excluded from this work |

No PR has been merged. All seven separated Phase 1 checks passed at final
application source `97cd97cd58b021d2f45021c3e121b8a35158cee8`.

## Current integration status

| Area | Status | Evidence / boundary |
| --- | --- | --- |
| iOS identity | Configured | Bundle ID `com.chillywood.mobile`, Team ID `CU7536UQK9`, version `1.0.0`, tablet support and existing orientation/new-architecture/static-framework behavior preserved. |
| Firebase | Configured | Firebase Apple app exists for the exact bundle ID. `IOS_GOOGLE_SERVICES_FILE` is an EAS File secret in development, preview, and production. The plist is not in Git and was never printed. |
| App Store Connect app | Created | Chi'llywood app record exists with numeric app ID `6791217176`. No public release has been configured. |
| Apple product catalog | Created, sandbox/internal only | 2 Premium subscriptions and 8 consumables exist with localization, price, and USA availability. The App Store purchase switch remains off. |
| EAS signing | Configured | Development and App Store credentials are EAS-managed. The distribution certificate is valid through July 14, 2027, and the active App Store profile was regenerated without exporting credential material. One owner-authorized iPhone remains registered. |
| EAS submit | Configured and verified | Production iOS submit profile uses the real numeric app ID. Exact build submission succeeded; no `--latest`, auto-submit, external group, or public release path was used. |
| APNs credentials | Configured, delivery unproven | EAS has an ordinary APNs credential. A separate VoIP APNs key is stored only as Supabase secrets. Both ordinary iOS rollout and VoIP dispatch remain off. |
| Universal Links | Source and hosted deployment pass | Associated Domains is present. Canonical AASA is deployed with HTTP 200, no redirect, JSON content type, and matching source. Android App Links are preserved. |
| Supabase Auth redirects | Configured | The custom scheme and required HTTPS authentication routes are configured. Signed physical Universal Link proof remains pending. |
| Ordinary iOS push | Source and backend deployed; rollout off | Client registration, permission states, categories, badge/response handling, and platform-aware payload source exist. Updated dispatch functions are active. Physical APNs delivery is not claimed. |
| Native calls | Source compiles; backend deployed; rollout off | Swift CallKit/PushKit/AVAudioSession module, Expo plugin, JS bridge, VoIP token lifecycle, and APNs sender compile in the final-source EAS build. VoIP token/dispatch functions are active; runtime-visible calls and server dispatch remain disabled. |
| Commerce policy | Source and additive schema deployed; Apple rail off | Apple/Google providers are distinct, ten sandbox mappings are deployed, Google base plans remain Google-only, and tips/purchases cannot grant media authority or payable value. |
| RevenueCat Apple | **Configured; credentials valid** | Existing project `projc5629a24` and Apple app `app3a0ad1ba62` are configured for `com.chillywood.mobile`. Ten products, Premium entitlement, three offerings, package mappings, the sensitive EAS public-key variable, and the project-wide webhook all pass readback. A dedicated Apple In-App Purchase Key was generated once, stored outside Git with owner-only permissions and a Keychain record, uploaded directly to the Apple app, and remained `Valid credentials` after RevenueCat reload. The existing App Store Connect API credential also remains valid. |
| Stripe physical merch / Connect | Verified test-mode and platform-neutral | Required Supabase secret names are present. Existing test-mode merch and Connect webhooks are active; platform charges and payouts remain disabled. iOS has no Stripe digital checkout, and no payout, transfer, cash-out, or payable balance was created. |
| Privacy manifest | Source and generated prebuild pass | Canonical manifest is wired through Expo, tracking is false, and clean Android/prebuilt output contains the manifest. Current-source archive inspection is now available from the production build `a729aa9a-1a98-439c-8c81-48c381735d8d`. Local clean iOS prebuild requires a local `ios.googleServicesFile` path in this workspace and remains pending. |
| Store materials | Drafts prepared | Metadata, privacy worksheet, review notes, release checklist, and public-safe iPhone/iPad screenshot drafts exist. Owner marketing/legal approval is not attested. |
| Release automation | Prepared and manually verified | `ios-preview` and `ios-production` protected environments exist. Workflows are manual, validate first, pin EAS CLI 21.0.1, freeze production credentials, require an exact build ID, and bind the verified internal group. |
| Backend deployment | Verified, fail-closed | Three additive migrations and six Edge Functions are deployed after restricted local backup. Ordinary push, VoIP, Apple commerce, live money, payouts, and cash-out remain off. |
| Final-source Simulator | In use | Development-simulator build `6d8e5193-ea75-490f-9451-759419a3e7b3` from `97cd97cd58b021d2f45021c3e121b8a35158cee8` was installed and launched successfully. |
| Production build / TestFlight | Pass: internal only | Production build `a729aa9a-1a98-439c-8c81-48c381735d8d`, version `1.0.0 (6)`, finished from `97cd97cd58b021d2f45021c3e121b8a35158cee8`. EAS submission `ade71443-0a05-49c2-8aa4-c411d4cb3e28` uploaded it; Apple processing is `VALID`, the build is assigned only to `Chillywood Internal`, and bounded internal testing notes are configured. Build 6 supersedes prior build candidates. |

## Deployed backend inventory

Restricted backups exist outside Git under the owner-only Chi'llywood configuration
directory. All database changes were additive and backward-compatible.

Migrations:

- `20260715150522_ios_voip_push_token_foundation`;
- `20260715151250_ios_app_store_mappings`; and
- `20260715174500_ios_app_store_purchase_intents`.

Active Edge Functions:

- `notification-device-tokens` v49;
- `notification-dispatch` v49;
- `chilly-chat-call-dispatch` v33;
- `revenuecat-webhook` v69;
- `ios-voip-push-tokens` v1; and
- `ios-voip-call-dispatch` v1.

Ten App Store sandbox mappings exist. Ordinary push delivery, VoIP dispatch,
RevenueCat App Store purchase access, live money, payouts, and cash-out remain off.

## Safety switches

The following are intentionally fail-closed:

- `EXPO_PUBLIC_IOS_NATIVE_CALLS_ENABLED=false`;
- `IOS_VOIP_PUSH_DISPATCH_ENABLED=false`;
- `EXPO_PUBLIC_IOS_ORDINARY_PUSH_ENABLED=false`;
- `IOS_ORDINARY_PUSH_ROLLOUT_ENABLED=false`;
- `EXPO_PUBLIC_REVENUECAT_APP_STORE_ENABLED=false`;
- the server-side App Store purchase rail defaults off;
- live money is off;
- payouts, cash-out, withdrawals, transfers, and payable balances are off; and
- no production-visible iOS native call control is enabled.

`IOS_NATIVE_CALLS_ENABLED` may include the native capability in an internal build;
that build-time capability does not override the runtime and server rollout
switches.

## Implemented source and infrastructure

### Media readiness

- Camera, microphone, and Photos permission states cover undetermined, granted,
  denied, restricted where exposed, and Settings recovery.
- The picker is item-scoped; cancellation is non-error behavior and no Photos
  write usage description was added.
- HEIC/HEIF selection is normalized for upload without committing private media.
- Local media teardown covers room leave, unmount, app lifecycle, and sign-out.
- LiveKit audio route/reconnect behavior and a bounded two-client harness exist.
- These are source/simulator readiness claims, not physical proof.

### Links and routing

- One canonical parser handles HTTPS Universal Links, the custom scheme, and
  notification routes.
- AASA routes cover authentication, profile/channel, title/player, spectate, and
  watch-party paths without an unrestricted wildcard.
- Hosted AASA verification passes and Android App Links remain unchanged.

### Notifications and native calls

- Platform-neutral push APIs keep deprecated Android aliases temporarily.
- iOS ordinary tokens are registered as `platform=ios`, `provider=expo`, never as
  FCM tokens.
- Android payloads retain `channelId`; iOS payloads omit Android-only fields.
- Token dedupe, preferences, delivery attempts, receipt handling, and invalid-token
  revocation remain in policy.
- VoIP tokens are separate from ordinary tokens and use server-owned storage,
  authentication, RLS, rate limits, hash/fingerprint metadata, and revocation.
- CallKit/PushKit source handles answer, decline, end, cancel, timeout, missed call,
  cold-start transfer, audio session lifecycle, duplicate protection, and cleanup.
- Actual APNs and two-iPhone call proof remain in the final device matrix.

### Commerce

- Providers are explicit: `revenuecat_google_play` and
  `revenuecat_app_store`.
- Existing Android/Google values and parsing are preserved.
- Apple mapping uses exact product IDs; Google base-plan parsing is not applied to
  Apple events.
- The finite catalog supports Premium, four tip tiers, and four bounded Seat Pass
  tiers. Dynamic paid videos, general event passes, VIP, and channel subscriptions
  remain disabled on iOS rather than creating arbitrary permanent IDs.
- Tips never unlock access. Purchases never grant LiveKit host/publish/admin
  authority and never create a payable creator balance while money switches are
  off.
- RevenueCat generated a StoreKit configuration whose identifiers, product types,
  and subscription durations match the ten-product manifest. Provider prices and
  group truth now align with committed fixtures, and the provider configuration
  passed the local Simulator harness 3/3; physical TestFlight purchase, restore,
  refund, and revocation proof remains pending.

## Build evidence

Historical foundation artifacts remain valid evidence for the source that created
them, not for the current integration branch:

| Build | Profile | Source | Result / scope |
| --- | --- | --- | --- |
| `ddc48433-d29d-4a83-a847-0d8908e2da63` | `development-simulator` | `2ea49f421b1e1abbcd0889b273b0908b04aea2a4` | Historical Simulator artifact and bounded smoke proof. |
| `343b3b6a-53d3-49b2-bed0-57b6f25c23fa` | `development` | `5c5fa023cc8ac8532fd0abe76c6199d0a769788d` | Historical signed physical build; install, launch, Firebase startup, authentication, persistence, navigation, and sign-out passed; source precedence for current branch is build `97cd97cd`. |

The integration branch contains application, native, Expo, dependency, plugin,
workflow, and backend changes after those commits. The current final-source proof
references installed simulator build `6d8e5193-ea75-490f-9451-759419a3e7b3` and
production archive `a729aa9a-1a98-439c-8c81-48c381735d8d`.

| `98ad48a2-562b-4a66-bf79-2bdcbe875a3a` | `development-simulator` | `b65ab225` | Successful pre-advisory-refresh Simulator evidence, superseded by the final-source build below. |
| `012edf86-b525-4dee-b9bc-ff23a8281c93` | `production` | `b65ab225` | Successful internal build `1.0.0 (3)`, superseded after the audit feed exposed a patchable transitive critical advisory. It was never external or public. |
| `6d8e5193-ea75-490f-9451-759419a3e7b3` | `development-simulator` | `97cd97cd58b021d2f45021c3e121b8a35158cee8` | Development-simulator build installed and launched successfully; route-level smoke remains unobserved and is required in final device proof. |
| `a729aa9a-1a98-439c-8c81-48c381735d8d` | `production` | `97cd97cd58b021d2f45021c3e121b8a35158cee8` | Final-source production archive version `1.0.0 (6)`. Archive metadata confirms build version/channel/commit and completed build fingerprint. |

Final internal TestFlight submission `ade71443-0a05-49c2-8aa4-c411d4cb3e28`
succeeded for that exact build. Apple reports processing state `VALID`, the build is
assigned to `Chillywood Internal`, and the bounded testing note states that push,
native incoming calls, purchases, payouts, and live money remain disabled. This is
not external testing or public release.

Clean final-source iOS prebuild and CocoaPods generation pass. The EAS Simulator
build supplies terminal native Swift/Pods compile evidence; a separate slow local
Xcode compile was stopped and is not represented as a pass. Clean Android prebuild
passed at `63431991`: package identity, Firebase, FCM service, adaptive icon, App
Links, EAS sections, and provider behavior remained unchanged. Generated native
folders remain uncommitted.

## Validation

Local Node 20 results at tested application source `97cd97cd58b021d2f45021c3e121b8a35158cee8`:

| Diagnostic | Result |
| --- | --- |
| `npm ci` | Pass |
| `npm run lint` | Pass: 0 errors, 87 warnings; warnings remain visible |
| `npx tsc --noEmit` | Pass |
| `npm run validate:runtime` | Pass |
| Strict iOS runtime validation | Pass using only the secure file path; no plist value read or printed |
| `npm run guard:route-contracts` | Pass |
| `npm run guard:payment-rail-policy` | Pass |
| `npm run guard:notification-room-call-policy` | Pass |
| `npm run guard:watch-party-livekit` | Pass |
| `npm run guard:old-room-handling` | Pass |
| `npm run guard:ios-config-policy` | Pass |
| `npm run proof:ios-config` | Pass |
| AASA, commerce, media, push, native-call, VoIP, privacy, and release guards/proofs | Pass |
| `npx expo-doctor` | Pass: 18/18 |
| `git diff --check` | Pass |
| Expo public config resolution | Pass; no resolved secret values recorded |

Exact required GitHub check names:

- `Phase 1 / Repository Lint`
- `Phase 1 / TypeScript`
- `Phase 1 / Runtime Validation`
- `Phase 1 / Route Contracts`
- `Phase 1 / iOS Configuration`
- `Phase 1 / Android Regression Guards`
- `Phase 1 / Expo Doctor`

All seven passed remotely for `97cd97cd58b021d2f45021c3e121b8a35158cee8`.

Dependency audit status: the root mobile production graph contains 0 critical, 0
high, 21 moderate, and 1 low advisory. The independently locked alert-automation
package has a direct Nodemailer high advisory requiring a separate major-version
remediation PR. A newly surfaced critical `websocket-driver` advisory was resolved
with the supported 0.7.5 patch in the lockfile before the final builds. No
automatic or forced audit fix ran.

## Physical evidence and remaining proof

The historical signed iPhone build proved native launch, Firebase, sign-in, session
persistence, primary navigation, and sign-out for its exact source. It did not prove
the new integration source. Camera, microphone, Photos upload, two-device LiveKit,
APNs, Universal Links, PushKit/CallKit, StoreKit lifecycle, accessibility, and final
device regression remain explicitly unclaimed. See
`IOS_FINAL_DEVICE_TEST_MATRIX.md`.

## Remaining post-90 proof

No RevenueCat provider-credential gate remains. Execute the separately defined
final 10% physical-device and owner-attestation matrix while keeping the App Store
purchase rail, live money, payouts, and cash-out disabled except for explicitly
approved bounded sandbox/internal testing.

## Safety statement

At this checkpoint:

- no merge occurred;
- no public App Store release or external TestFlight distribution occurred;
- one internal production build candidate was uploaded only to `Chillywood Internal` at `a729aa9a-1a98-439c-8c81-48c381735d8d`; `build 6` supersedes earlier candidates after the patch-only audit correction. No external tester or public release was enabled;
- no production OTA was published;
- no live money, payable balance, payout, cash-out, withdrawal, or transfer was
  enabled;
- no Stripe path was created for iOS digital goods;
- no production-visible native iOS call or push rollout was enabled;
- no destructive migration was applied;
- no Android provider value was removed and no Android release behavior was
  intentionally changed;
- no Apple/Firebase/EAS/RevenueCat private credential, repository secret, plist
  content, profile, certificate, token, receipt, private media, or signed artifact
  URL was committed, printed, or placed in client configuration. Provider
  credentials were used only through approved secure local/provider stores. One OS
  process diagnostic exposed unrelated inherited
  Brevo and Cloudflare credential values; they were not used or committed and must
  be rotated; and
- no unrelated file, including `deno.lock` or `supabase/.temp`, was staged.
