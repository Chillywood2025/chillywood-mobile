# Google Play Reviewer Access Instructions

Date: 2026-06-01
Status: copy package prepared; credentials must be entered only in Play Console

Do not commit real reviewer passwords, recovery codes, service accounts, or admin credentials. Put live test credentials only in Play Console App access.

June 12, 2026 App Access safety update: Google Play automated app-access/pre-launch crawling can trigger the app's forgot-password flow for the App Access account. The Play Console Sign in details switch "Allow Android to use your sign in details for performance and app compatibility testing" is now turned off and saved, with Play Console showing "Change saved. Send for review in Publishing overview." Do not use the owner's personal/internal tester inbox. Use a disposable non-admin reviewer account whose inbox can safely receive automated reset, signup, and transactional auth emails.

June 12, 2026 disposable reviewer account update: Play Console App Access is configured with `play-reviewer-app-access@chillywoodstream.com`, not the owner's personal/internal tester email. The Supabase auth user id is `cb8c7b5f-6003-479a-887e-29644e677dca`, email confirmation is complete, the normal profile row exists, and active platform-role memberships are `0`. The password lives only in the local macOS Keychain item `chillywood-play-reviewer-app-access`; never write it in this repo or in Play reviewer docs. Play Console saved the Sign in details change and may still require sending the App content update from Publishing overview.

June 1 external acceptance update: `docs/google-play/EXTERNAL_ACCEPTANCE_TRACKER.md` is now the source of truth for whether App access/reviewer instructions have actually been entered in Play Console. In this repo lane they remain prepared only; no password was entered, saved, screenshotted, or committed.

## Play Console App Access Copy

```text
App name: Chi'llywood
Package: com.chillywood.mobile

Chi'llywood can be opened without signing in for public browsing surfaces, but account features require a test account.

Test account:
- Email: play-reviewer-app-access@chillywoodstream.com
- Password: [OWNER ENTERS PASSWORD IN PLAY CONSOLE ONLY]

Do not use an owner/admin account for review unless Google specifically requests admin-only legal/moderation proof.

Suggested review path:
1. Launch the app.
2. Open Home, Explore, Live, and Library from the bottom navigation.
3. Use the top profile/avatar entry or Settings to open account/Profile surfaces.
4. Open Settings > Legal and Support to view Terms, Privacy, Account Deletion, Support, Copyright/DMCA, and moderation policy surfaces.
5. Open Profile to inspect social posts/profile media where the test account has access.
6. Open public Platform from a visible creator/profile entry where available.
7. Open a Player item from public or test content.
8. Use report actions where visible; do not submit harmful or false reports unless the provided test instructions include a harmless disposable target.
9. Premium-only features should show a clean Premium required or setup-needed state unless the owner provides a licensed Google Play tester purchase path backed by RevenueCat/Google entitlement proof.
10. Admin tools are owner/admin-only and are not visible to normal users. Reviewers should not need admin access for normal app review.

Disabled/setup-only features:
- Premium purchases/restores: proved in Google Play / RevenueCat sandbox for the licensed tester only. The proof chain includes purchase, restore, real RevenueCat webhook delivery, backend `user_entitlements` write, and Platform Studio unlock. For normal review builds, the Premium purchase shell remains closed unless the owner intentionally opens it for bounded reviewer sandbox testing; current `/subscribe` proof shows purchase status `Temporarily unavailable`.
- Platform Studio, Brand Studio, Clip Studio, and creator video uploads: Premium required for normal creator accounts. Owner/operator accounts may see setup-only owner tools, but that is not Premium entitlement and does not activate paid access.
- Premium-only live/watch-party access: non-Premium accounts are intentionally denied before full room/session/token/connect access.
- Live money is off.
- Payouts are off.
- Tips are off.
- Paid creator content checkout/access is off.
- Watch-Party Seat Passes/seats are off unless a real Google Play/RevenueCat entitlement path is separately provided.
- Ads are not active in the current app build unless the owner changes the release configuration later.
- RevenueCat/Google provider proof is sandbox/test-only. Production Premium is not broadly live unless the owner confirms the uploaded build's public key, provider approval posture, Play licensed tester/product readiness, and an intentionally opened Premium purchase shell for the submitted test window.
- Stripe Connect, where visible, is payout readiness/setup only. Stripe must not be used for Android in-app digital goods, Premium, paid creator content, Watch-Party Seat Passes/seats, or any digital access unlock.
- iOS is deferred.

Support/legal:
- Privacy Policy: https://chillywoodstream.com/privacy
- Terms: https://chillywoodstream.com/terms
- Account deletion: https://chillywoodstream.com/account-deletion
- Support: support@chillywoodstream.com
- Copyright/DMCA: https://chillywoodstream.com/copyright-report
```

## Test Account Requirements

| Requirement | Status |
| --- | --- |
| Non-admin account | Created and verified: `play-reviewer-app-access@chillywoodstream.com`; zero active platform roles |
| Stable password | Stored only in local macOS Keychain and entered in Play Console App Access |
| No 2FA/recovery challenge blocking reviewer | Owner confirms |
| Does not expose private personal data | Owner confirms |
| Can access representative signed-in areas | Owner confirms |
| Does not grant Owner/Admin, payout, live-money, or secret access | Required |

## Notes For Review

- Current reviewer readiness proof is ready-but-closed: the Play-installed v13 app and RevenueCat/backend path are proved, but no fresh reviewer purchase was run because safe reviewer Chi'llywood credentials were not available in-repo/session and read-only Play API tester/product readback returned `403`.
- If the reviewer must test Premium, add the reviewer account as a Play license tester and provide the exact Google Play/RevenueCat Premium test flow in Play Console only.
- Do not ask reviewers to test Premium purchase/restore from a build where `validate:runtime` reports `revenueCatAndroidPublicKeyConfigured: false`, the Premium purchase shell is still on hold for that submitted build, or Play/RevenueCat sandbox tester/product setup is not confirmed.
- If no licensed Play tester path is provided, reviewers should expect Premium-only flows to deny access with Premium required/setup-needed copy.
- Do not provide real owner/admin credentials in Play Console unless a separate legal/admin review is required and the owner explicitly approves a limited account.
- If Google flags login failure, update this document with the rejection reason and provide a new safe test account. Do not work around review by hiding real gates or adding fake bypass features.
