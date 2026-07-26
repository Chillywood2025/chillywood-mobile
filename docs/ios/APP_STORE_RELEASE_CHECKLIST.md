# App Store Release Checklist

Status: internal readiness checklist. Internal TestFlight upload may be authorized separately; public App Store release, external TestFlight distribution, legal attestation, and automatic release are not authorized by this document.

## 1. Source and configuration

- [ ] Exact release commit is recorded and the worktree is clean.
- [ ] Bundle ID is `com.chillywood.mobile`; Apple Team ID is `CU7536UQK9`.
- [ ] Android package and Android release behavior remain unchanged.
- [ ] Firebase iOS file variable resolves during the EAS build without entering Git.
- [ ] Associated Domains and the deployed AASA file pass their guards and hosted verification.
- [ ] A canonical privacy-manifest object from `config/ios/privacy-manifest.json` is wired through Expo’s supported `ios.privacyManifests` path.
- [ ] CocoaPods privacy-manifest aggregation is enabled and static-framework compatibility remains unchanged.
- [ ] `node scripts/guard-ios-privacy-manifest.mjs` passes after `npm ci`.
- [ ] Generated `ios/` and `android/` folders are inspected but not committed under the current ownership model.

## 2. Required-reason and privacy review

- [ ] Final archive contains `PrivacyInfo.xcprivacy`.
- [ ] Archive reasons equal the canonical source plus legitimate resolved dependency reasons; unexplained categories stop the release.
- [ ] Xcode privacy report and Apple upload warnings are reviewed.
- [ ] Firebase, LiveKit, RevenueCat, Expo, React Native, and other native SDK manifests are present or correctly aggregated.
- [ ] No ATT/IDFA API, framework, tracking domain, or usage string exists unless separately reviewed and disclosed.
- [ ] `APP_STORE_PRIVACY_WORKSHEET.md` is reconciled to the exact binary and production provider settings.
- [ ] Owner/App Manager completes and publishes App Privacy answers; source documentation is not treated as attestation.
- [ ] Privacy Policy and account-deletion pages are live and match actual behavior.

## 3. Safety, moderation, and account controls

- [ ] Report controls work on representative UGC surfaces.
- [ ] Block controls work on supported profile/chat surfaces.
- [ ] Community Guidelines, Terms, Privacy, Support, and account deletion open from the submitted build.
- [ ] Account deletion is visible and tested only with an approved disposable account.
- [ ] Support inbox ownership and escalation path are confirmed.
- [ ] Reviewer content is public-safe, licensed, and free of private user information.

## 4. Commerce

- [ ] Permanent Apple product manifest is owner-approved before product creation.
- [ ] Products, product types, subscription groups, prices, territories, localizations, tax categories, and review media match App Store Connect.
- [ ] RevenueCat Apple credentials validate without secrets entering GitHub or the repository.
- [ ] Store mappings select `revenuecat_app_store` on iOS and preserve `revenuecat_google_play` on Android.
- [ ] Tips do not unlock digital access; purchases do not grant LiveKit publish/host/admin authority.
- [ ] Restore, expiration, cancellation, refund, and revocation behavior is documented and sandbox-tested.
- [ ] Apple purchase kill switch remains off except for a bounded approved sandbox/internal test.
- [ ] Live money, payouts, cash-out, withdrawals, and payable balances remain off.

## 5. Metadata and review packet

- [ ] App name, subtitle, description, keywords, categories, support URL, privacy URL, copyright, and SKU are owner-approved.
- [ ] Age-rating questionnaire is completed truthfully for UGC, chat, live media, and unrestricted content.
- [ ] Export compliance, content rights, and EU trader status are completed by the owner/legal reviewer.
- [ ] Review notes match the exact feature flags and provider state.
- [ ] Primary and second reviewer accounts work and have no owner/admin/money authority.
- [ ] Credentials are stored only in App Store Connect protected review fields or the private owner credential system.

## 6. Screenshot QA

- [ ] Large iPhone and 13-inch iPad required sets are captured at current accepted dimensions.
- [ ] Standard and small iPhone layouts pass internal QA.
- [ ] No screenshot contains test credentials, raw email, private chat/media, token, receipt, signed URL, or admin surface.
- [ ] App icon is 1024×1024, opaque, correctly cropped, and visually inspected after archive extraction.
- [ ] Screenshots show real app use rather than only splash/login and make no unsupported feature or purchase claim.

## 7. Validation and archive inspection

- [ ] Node 20 `npm ci`, lint, TypeScript, runtime validation, route contracts, iOS guard/proof, Android regression guards, Expo Doctor, and every new guard pass.
- [ ] Fresh final-source iOS Simulator build launches and completes automated regression.
- [ ] Production EAS build succeeds with a recorded build ID, source commit, app version, and build number.
- [ ] Extracted archive has the expected bundle ID, signing team, entitlements, Firebase plist, privacy manifest, icons, architectures, background modes, and dSYMs.
- [ ] No private key, certificate, provisioning profile, Firebase plist, signed URL, or provider secret is copied into repository evidence.

## 8. Internal TestFlight only

- [ ] Submission uses the exact reviewed EAS build ID, never an implicit latest build.
- [ ] App Store Connect processing succeeds and upload warnings are resolved.
- [ ] Build is assigned only to the approved internal tester group.
- [ ] External testing, automatic release, phased public release, and public App Store release remain disabled.
- [ ] Internal testers receive limitations and the final physical-device matrix.

## 9. Owner gates before any public release

- [ ] Final App Privacy attestation.
- [ ] Export compliance attestation.
- [ ] Content-rights attestation.
- [ ] Age-rating confirmation.
- [ ] EU trader-status decision and required verification.
- [ ] Final pricing, territories, agreements, tax, and banking readiness.
- [ ] Final physical-device accessibility, notification, Universal Link, media, CallKit/PushKit, and StoreKit testing.
- [ ] VoiceOver, Dynamic Type, contrast, reduced-motion behavior, and small-screen navigation receive final physical-device review.
- [ ] Explicit owner approval for public release.

## Rollback

1. Do not merge or publicly release a failing build.
2. Disable the affected iOS runtime/provider switch without weakening Android behavior or security controls.
3. Remove the build from internal tester availability if necessary; do not delete credentials or products impulsively.
4. Revert the smallest subsystem commit, rerun all guards, and build from a clean exact commit.
5. For website metadata/AASA regressions, redeploy the last known-good static output and verify HTTPS status, content type, redirect count, and body hash.
6. For webhook/backend regressions, roll back only through reviewed additive migrations/function versions while preserving event and audit evidence.

References: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/), and [Expo iOS submission](https://docs.expo.dev/submit/ios/).
