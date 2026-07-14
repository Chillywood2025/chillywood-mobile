# Chi'llywood iOS Status

Checkpoint date: 2026-07-14

Overall verdict: **Partial — the iOS source foundation is implemented, while repository-wide baseline checks, external setup, and all build/device/TestFlight proof remain pending.**

## Current checkpoint

| Area | Status | Evidence / next gate |
| --- | --- | --- |
| Mac toolchain | Verified at owner checkpoint | Xcode 26.5, iOS 26.5 simulators, CocoaPods 1.17.0, Node/npm, EAS CLI, and Expo project link were verified before this branch. |
| App Store Connect API | Local read-only authentication verified | Credential remains owner-local and outside the repository. No key material is represented here. |
| Stable iOS identity | Source-configured in the foundation branch | `guard:ios-config-policy` must prove the resolved bundle identifier and Apple Team contract without inventing an App Store Connect numeric app ID. |
| iOS permissions | Source-configured in the foundation branch | Camera, microphone, and photo-library selection descriptions are declared; photo-library write permission is intentionally absent. |
| Universal Links | Source-configured / external proof pending | Associated Domain is `applinks:chillywoodstream.com`; Apple App ID capability and website association still require owner verification. |
| Firebase iOS | Source injection supported / external file pending | `IOS_GOOGLE_SERVICES_FILE` and an ignored local fallback are supported. Firebase iOS registration and EAS file upload remain owner actions. |
| EAS environments | Source-configured in the foundation branch | Development, preview, and production profiles bind to their matching environments; `development-simulator` is an iOS Simulator profile. |
| Signing credentials | Pending owner review | No certificate or provisioning profile was created, printed, downloaded, or committed by this phase. |
| Physical device | Pending | Device registration, ad hoc profile inclusion, and installed development smoke remain owner actions. |
| iOS build history | None for this checkpoint | No EAS iOS build was started by the foundation phase. |
| TestFlight/App Store | Not started | No upload or submission occurred. A real `ascAppId` must come from an owner-created App Store Connect record in a later phase. |
| RevenueCat iOS | Later purchase-testing phase | Missing iOS key does not block a no-purchase development build. No products, purchases, or production money were created. |
| APNs / CallKit / PushKit | Later feature phases | No production iOS push delivery or native calling integration is claimed. |
| App Privacy / screenshots | Later submission phases | Includes required iPhone assets and, because tablet support remains on, iPad behavior/assets. |
| Android regression protection | Source configuration guard passes | Android package remains `com.chillywood.mobile`; production Android app-bundle and submit behavior are protected by `guard:ios-config-policy`. The composite local `typecheck` remains blocked later by pre-existing ignored native launcher-icon drift. |

## Foundation branch validation

Passed on Node 20:

- `npm ci`;
- standalone `tsc --noEmit`;
- runtime validation and non-strict no-purchase iOS validation;
- route, payment-rail, notification/room/call, Watch-Party LiveKit, and iOS configuration guards;
- `proof:ios-config`;
- Expo public-configuration resolution without printing the resolved configuration;
- expected strict failure when the Firebase file path is absent;
- expected purchase-gate failure only when iOS purchases are explicitly required; and
- JSON/YAML parsing, changed-file lint with no errors, and `git diff --check`.

Known pre-existing baseline failures, intentionally not repaired in this dependency-free iOS foundation PR:

- `npm run lint` reports 69 errors and 88 warnings in unchanged app/component files.
- `npm run typecheck` completes TypeScript successfully, then the existing Android launcher-icon policy guard rejects hashes in the ignored local generated `android/` tree.
- `npx expo-doctor` passes 17 of 18 checks and reports ten Expo SDK patch-version mismatches.

The dependency versions, product UI lint debt, and ignored Android native tree are outside this first-development-build branch and require separately scoped work.

## Owner actions remaining

1. Verify the Apple Team and register/confirm the explicit Apple App ID.
2. Enable Associated Domains for that App ID and verify the website association file.
3. Create the App Store Connect app record only when the next phase needs it; retain the real numeric Apple ID outside placeholders.
4. Register the exact iOS bundle identifier in the existing Firebase project.
5. Upload `GoogleService-Info.plist` to EAS as the `IOS_GOOGLE_SERVICES_FILE` file variable for intended environments.
6. Run strict iOS runtime validation from an owner-controlled shell.
7. Review or create EAS-managed signing credentials with owner interaction.
8. Register a physical iPhone without publishing its UDID.
9. Explicitly authorize and run the first development build in a later phase.
10. Schedule RevenueCat, APNs, App Privacy, screenshots, preview, TestFlight, and App Store work as separate gates.

## Safety statement

At this checkpoint:

- no iOS build was started;
- no Apple/TestFlight/App Store submission occurred;
- no EAS Update was published;
- no Supabase migration or function was deployed;
- no production money was enabled;
- no Apple/EAS/Firebase credential was created or rotated by the repository work; and
- no private key, certificate, provisioning profile, Firebase plist, password, token, or unrelated ambient credential was committed.
