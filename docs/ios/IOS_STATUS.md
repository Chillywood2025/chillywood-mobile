# Chi'llywood iOS Status

Checkpoint date: 2026-07-14

Overall verdict: **Partial — Firebase and EAS configuration are ready, the first iOS Simulator development build completed successfully, and that artifact is now installed with the bounded simulator smoke matrix passing. A signed physical-device build remains blocked because no iPhone or iPad is available for registration.**

## Current checkpoint

| Area | Status | Evidence / next gate |
| --- | --- | --- |
| Mac toolchain | Verified | Xcode 26.5, iOS 26.5 simulators, CocoaPods 1.17.0, Node 20, EAS CLI, and the Expo project link are working. This Mac is Intel, so it cannot act as an Apple Silicon iOS device-registration target. |
| Stable iOS identity | Configured | The resolved iOS bundle identifier is `com.chillywood.mobile`; the Apple Team contract is configured without inventing an App Store Connect numeric app ID. |
| Firebase iOS app | Registered | One Apple/iOS app exists in the existing Chi'llywood Firebase project for the exact bundle identifier. The downloaded plist is owner-local, outside Git, and restricted to the owner account. Android Firebase configuration was not changed. |
| EAS Firebase file variable | Configured | `IOS_GOOGLE_SERVICES_FILE` is a secret EAS File variable assigned to development, preview, and production. Only the development environment is authorized for this checkpoint. No plist contents or file download URL are recorded. |
| Apple App ID | Registered by EAS | The explicit App ID exists for the bundle identifier. Associated Domains and Push Notifications capabilities were synchronized, but website association and working production push are not claimed. |
| Signing certificate | EAS-managed | One Apple Distribution certificate exists and expires July 14, 2027. No private key or certificate material was downloaded, printed, or committed. |
| Development provisioning | Blocked by device availability | No iPhone or iPad is available, so there is no registered development device or ad hoc provisioning profile. A signed physical-device build was not attempted. |
| Simulator development build | Successful; installed and smoke tested | EAS build `ddc48433-d29d-4a83-a847-0d8908e2da63` finished for version `1.0.0` build `1` from source commit `2ea49f421b1e1abbcd0889b273b0908b04aea2a4`. It was installed with owner authorization on an iPhone 17 Pro Simulator running iOS 26.5, and the bounded matrix below passed. |
| TestFlight/App Store | Not started | No upload or submission occurred. A real `ascAppId` must come from an owner-created App Store Connect record in a later phase. |
| RevenueCat iOS | Later purchase-testing phase | Missing iOS RevenueCat configuration does not block this no-purchase development build. No products, purchases, payouts, or production money were enabled. |
| APNs / CallKit / PushKit | Later feature phases | No APNs key, production iOS push delivery, CallKit, PushKit, or native incoming-call integration is claimed. |
| App Privacy / screenshots | Later submission phases | App Privacy answers, screenshots, and store metadata remain pending. |
| Android regression protection | Passed | Android package remains `com.chillywood.mobile`; Android Firebase, EAS production app-bundle, and submit behavior remain unchanged and are protected by `guard:ios-config-policy`. |

## Development build history

| Build | Source commit | Result | Sanitized root cause |
| --- | --- | --- | --- |
| `499fa422-585d-4e4d-bc6e-4f1ffd4de68f` | `4a35854d4add574e31a6d4f481d92b30b3f43aa0` | Failed; no artifact | LiveKit WebRTC non-modular React headers were promoted to framework-module compiler errors under static frameworks. |
| `19098726-3354-4926-97fd-52ad1a1edafe` | `52988bf73a87a11b8355ad36cdd9e60ba92e620b` | Failed; no artifact | The first target-scoped CocoaPods compatibility setting did not suppress the Clang diagnostic. |
| `8e3c458f-5a73-45ba-a506-03555ad07123` | `6ee796982aa5d618c7c8c008dec6344d9249d1e0` | Failed; no artifact | WebRTC compiled, but its framework module was later precompiled by the `livekit-react-native` consumer without the same target-scoped diagnostic suppression. |
| `fbf58035-e5d1-481c-83bc-23e161612780` | `2753b3227744ad75edbeef3f35ff94ac3f7b7228` | Failed; no artifact | LiveKit compiled, then `RNFBApp` hit the same prebuilt-Core/static-framework module boundary. |
| `ddc48433-d29d-4a83-a847-0d8908e2da63` | `2ea49f421b1e1abbcd0889b273b0908b04aea2a4` | **Finished; artifact available** | All installed React Native Firebase modules use the Expo 54 `forceStaticLinking` contract; the complete remote Simulator build passed. |

Only the `development-simulator` profile was used. No preview, production, submission, or OTA command was run.

## Simulator installation and smoke proof

The installed application/native source is commit `2ea49f421b1e1abbcd0889b273b0908b04aea2a4`. Before installation, the exact comparison from that source to the then-current branch HEAD `4ba1fa93ce8e08e5bb52670f52f5803e03afd8ff` contained only this documentation file (13 changed lines); no application, Expo, EAS, native, Firebase, dependency, plugin, or workflow file changed. A rebuild was therefore not required.

The owner-approved `eas build:run --platform ios --id ddc48433-d29d-4a83-a847-0d8908e2da63` download completed, but its macOS System Events process check timed out before installation. The same approved artifact was then installed with `simctl` after verifying only its bundle identifier and version metadata. No private artifact URL was printed or recorded.

Test target:

- device: iPhone 17 Pro Simulator;
- runtime: iOS 26.5;
- application: `1.0.0` build `1`;
- bundle identifier: `com.chillywood.mobile`;
- EAS build: `ddc48433-d29d-4a83-a847-0d8908e2da63`; and
- application source: `2ea49f421b1e1abbcd0889b273b0908b04aea2a4`.

| # | Smoke check | Result | Sanitized evidence |
| ---: | --- | --- | --- |
| 1 | Application installs | Pass | `simctl` reported a successful install of the approved EAS artifact. |
| 2 | Application launches without a native crash | Pass | Bundle launch succeeded; the process stayed alive throughout the bounded matrix. |
| 3 | Splash screen resolves | Pass | The development bundle loaded and reached the sign-in UI. |
| 4 | Firebase default app initializes | Pass | Native Firebase activity was present; no default-app/configuration error appeared in sanitized simulator logs. |
| 5 | RNFirebase modules are present | Pass | No missing RNFirebase or native-module error appeared during launch or navigation. |
| 6 | LiveKit native foundation loads | Pass | The startup bootstrap ran without a `livekit-bootstrap`, missing-module, or initialization error. This is not physical LiveKit media proof. |
| 7 | Unconfigured RevenueCat does not crash | Pass | Launch and navigation remained stable; Premium purchase status stayed unavailable and no RevenueCat crash marker appeared. |
| 8 | Unsupported iOS push does not loop or crash | Pass | Settings reported push as unsupported/physical-device-only; no repeated-failure or crash marker appeared. |
| 9 | Sign-in screen opens | Pass | Email, password, and submit controls rendered. |
| 10 | Bounded test account signs in | Pass | The dedicated normal test account reached authenticated Home; no credential value is recorded here. |
| 11 | Session persists after relaunch | Pass | Terminate/relaunch without clearing application data returned to authenticated Home. |
| 12 | Sign-out works | Pass | Settings logout returned to the sign-in controls. |
| 13 | Home opens | Pass | Authenticated Home rendered. |
| 14 | Explore opens | Pass | Explore search rendered. |
| 15 | Live opens | Pass | Live and its informational control rendered without a native initialization failure. |
| 16 | Saved / Library opens | Pass | My Library rendered. |
| 17 | Profile opens | Pass | The dedicated tester profile rendered. |
| 18 | Settings opens | Pass | Account, notification, and Premium status surfaces rendered. |
| 19 | Chat list opens | Pass | Chat inbox and search rendered. |
| 20 | Normal title/player route opens | Pass | A known valid player route rendered without title-not-found or load-failure state. |
| 21 | Public profile / channel opens | Pass | The public Platform surface and handle rendered from the profile preview action. |
| 22 | Privacy / legal opens | Pass | Privacy Policy and Account Deletion and Data Deletion Policy rendered. |
| 23 | Support opens | Pass | Bug, safety, and help entry controls rendered; none was submitted. |
| 24 | Account deletion controls are visible | Pass | Delete Account and logout controls rendered; deletion was not executed. |
| 25 | Android full-screen call controls are not offered as working iOS controls | Pass | The status identified the capability as Android-only and no Android call-settings action was exposed. |
| 26 | iOS push remains honestly unavailable | Pass | The UI states that push requires a physical mobile device. |
| 27 | Native iOS calls remain disabled | Pass | No CallKit/PushKit or native iOS call control was enabled or claimed. |
| 28 | Purchases remain disabled / fail closed | Pass | Premium is not active and Purchase status is `Temporarily unavailable`; no purchase was attempted. |
| 29 | No Google Play-only wording is presented as an applicable iOS purchase action | Pass | The inspected iOS Premium status surface contained no Google Play purchase wording or active purchase CTA. Android-only call copy was explicitly labeled as Android-only. |

Sanitized final log classification: zero native-crash markers, zero JavaScript-fatal markers, zero Firebase default-app errors, zero missing-native-module errors, zero LiveKit bootstrap errors, zero RevenueCat crash markers, and zero push-loop markers. The macOS automation timeout above was an installer-driver issue, not an application failure.

This simulator proof is **not** APNs delivery, StoreKit, PushKit, CallKit, physical-device signing, camera/microphone, or physical LiveKit media proof. Those require a registered physical iPhone or iPad and separately authorized phases.

## Validation

Passed on Node 20:

- `npm ci`;
- standalone `npx tsc --noEmit`;
- `npm run validate:runtime`;
- `npm run guard:route-contracts`;
- `npm run guard:ios-config-policy`;
- `npm run proof:ios-config`;
- targeted lint for the iOS config, guard, and compatibility plugin;
- Expo public-configuration resolution without printing the resolved configuration;
- generated Podfile Ruby syntax and idempotence checks; and
- local Xcode iOS Simulator compiles of the LiveKit WebRTC and LiveKit consumer pods with compatibility settings scoped to those targets;
- static-library generation for every installed React Native Firebase pod; and
- a complete unsigned local Xcode build of the generated `Chillywood` Simulator workspace before the successful EAS retry.

PR #9 CI diagnostic, without weakening or suppressing the check:

| Diagnostic area | Result |
| --- | --- |
| TypeScript | Standalone Node 20 `npx tsc --noEmit` passes. GitHub did not reach its composite typecheck step because the preceding lint step failed. |
| iOS configuration | Local Node 20 `guard:ios-config-policy` and `proof:ios-config` pass. The current GitHub workflow does not run these checks. |
| Android regression guards | The iOS guard/proof confirms the Android package and EAS behavior remain unchanged. The composite local typecheck still reaches the pre-existing generated Android launcher-icon policy failure described below. |
| Repository lint baseline | The exact GitHub check `Phase 1 Checks / Lint and Typecheck` fails at lint with 69 errors and 88 warnings. The same 157-problem baseline is present on `origin/main`; this PR's post-build documentation-only change did not cause it. |
| Expo Doctor baseline | Local Expo Doctor passes 17 of 18 checks and reports the existing Expo SDK patch-version alignment finding described below. The current GitHub workflow does not run Expo Doctor. |

The PR remains draft, open, blocked by that unchanged repository lint baseline, and unmerged. Required checks were not changed.

Known pre-existing baseline failures, intentionally not repaired here:

- `npm run lint` reports 69 errors and 88 warnings in unchanged app/component files.
- `npm run typecheck` completes TypeScript successfully, then the existing Android launcher-icon policy guard rejects hashes in the ignored local generated `android/` tree.
- `npx expo-doctor` passes 17 of 18 checks and reports ten Expo SDK patch-version mismatches.

No dependency was modified and no automatic audit fix was run.

## Owner interactions and next gates

Completed owner interactions:

1. Authenticated Firebase CLI access to the existing Firebase project.
2. Authenticated the EAS/Expo project session.
3. Authenticated the Apple Developer credential workflow.
4. Authorized an iOS Simulator build after confirming that no physical iPhone is available.
5. Authorized installation of the exact successful Simulator build and the bounded smoke proof documented above.

Remaining gates:

1. Obtain an iPhone or iPad before registering a device, creating an ad hoc profile, or requesting a signed physical-device development build.
2. On that registered device, separately prove camera/microphone behavior, physical LiveKit media, APNs delivery, and any later authorized native-call work.
3. Verify the `apple-app-site-association` file for Universal Links.
4. Schedule RevenueCat/StoreKit, APNs/push, CallKit/PushKit, App Privacy, screenshots, preview, TestFlight, and App Store work as separate phases.

## Rollback

- Remove only the installed simulator copy with `xcrun simctl uninstall booted com.chillywood.mobile`; this does not revoke provider credentials or alter the repository.
- Revert the iOS foundation and LiveKit compatibility commits on this branch; do not rewrite `main`.
- Delete the EAS `IOS_GOOGLE_SERVICES_FILE` variable only after confirming that no active build profile depends on it.
- Revoke or delete Apple/Firebase/EAS credentials only through their provider dashboards and only with explicit owner approval.
- Delete the owner-local Firebase plist if local Firebase configuration is no longer needed.

## Safety statement

At this checkpoint:

- no TestFlight or App Store submission occurred;
- no preview or production EAS build occurred;
- no EAS Update was published;
- no Supabase migration or function was deployed;
- no live money or purchases were enabled;
- no native iOS calling feature was enabled;
- no private credential value or Firebase plist content was printed or committed;
- no provisioning profile or signed artifact URL was committed;
- only the owner-approved Simulator artifact was installed; no physical-device installation occurred;
- no new EAS build was started during installation/smoke proof;
- and no unrelated untracked file was staged.
