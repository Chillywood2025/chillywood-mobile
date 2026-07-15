# Chi'llywood iOS Status

Checkpoint date: 2026-07-14

Overall verdict: **Partial — Firebase and EAS configuration are ready and an EAS-managed distribution certificate exists. Three iOS Simulator development attempts exposed a LiveKit static-framework compatibility issue; the expanded target-scoped fix now passes the exact local consumer-pod compile. A signed physical-device build remains blocked because no iPhone or iPad is available for registration.**

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
| Simulator development build | Retry pending | The first three `development-simulator` attempts failed without artifacts. The exact third-attempt failure now passes a local build of both LiveKit pod targets. |
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

Only the `development-simulator` profile was used. No preview, production, submission, or OTA command was run.

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
- a local Xcode iOS Simulator compile of the `livekit-react-native-webrtc` pod with the compatibility setting applied only to that target.

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

Remaining gates:

1. Run the validated `development-simulator` retry, then install it in an Xcode Simulator only after explicit owner authorization.
2. Run a simulator launch and basic authentication/navigation smoke test. Simulator testing does not prove camera, microphone, push, or physical-device behavior.
3. Obtain an iPhone or iPad before registering a device, creating an ad hoc profile, or requesting a signed physical-device development build.
4. Verify the `apple-app-site-association` file for Universal Links.
5. Schedule RevenueCat, APNs/push, CallKit/PushKit, App Privacy, screenshots, preview, TestFlight, and App Store work as separate phases.

## Rollback

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
- no provisioning profile or signed artifact URL was committed; and
- no unrelated untracked file was staged.
