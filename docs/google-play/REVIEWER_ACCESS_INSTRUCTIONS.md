# Google Play Reviewer Access Instructions

Date: 2026-06-01
Status: copy package prepared; credentials must be entered only in Play Console

Do not commit real reviewer passwords, recovery codes, service accounts, or admin credentials. Put live test credentials only in Play Console App access.

## Play Console App Access Copy

```text
App name: Chi'llywood
Package: com.chillywood.mobile

Chi'llywood can be opened without signing in for public browsing surfaces, but account features require a test account.

Test account:
- Email: [OWNER ENTERS SAFE NON-ADMIN TEST EMAIL IN PLAY CONSOLE ONLY]
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
- Premium purchases/restores: setup-only unless the owner provides a Play license tester path in Play Console and the uploaded build has the Android RevenueCat public SDK key configured through approved public config. Current repo proof still has the production Android public key missing, so Premium purchase/restore is not claimed.
- Platform Studio, Brand Studio, Clip Studio, and creator video uploads: Premium required for normal creator accounts. Owner/operator accounts may see setup-only owner tools, but that is not Premium entitlement and does not activate paid access.
- Premium-only live/watch-party access: non-Premium accounts are intentionally denied before full room/session/token/connect access.
- Live money is off.
- Payouts are off.
- Tips are off.
- Paid creator content checkout/access is off.
- Watch-Party tickets/seats are off unless a real Google Play/RevenueCat entitlement path is separately provided.
- Ads are not active in the current app build unless the owner changes the release configuration later.
- RevenueCat/Google provider proof is setup/sandbox-only until owner adds the Android public SDK key, links provider secrets/server permissions where needed, and proves signed sandbox purchase/restore/events.
- Stripe Connect, where visible, is payout readiness/setup only. Stripe must not be used for Android in-app digital goods, Premium, paid creator content, Watch-Party tickets/seats, or any digital access unlock.
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
| Non-admin account | Owner must create/confirm |
| Stable password | Owner enters in Play Console only |
| No 2FA/recovery challenge blocking reviewer | Owner confirms |
| Does not expose private personal data | Owner confirms |
| Can access representative signed-in areas | Owner confirms |
| Does not grant Owner/Admin, payout, live-money, or secret access | Required |

## Notes For Review

- If the reviewer must test Premium, add the reviewer account as a Play license tester and provide the exact Google Play/RevenueCat Premium test flow in Play Console only.
- Do not ask reviewers to test Premium purchase/restore from a build where `validate:runtime` still reports `revenueCatAndroidPublicKeyConfigured: false`.
- If no licensed Play tester path is provided, reviewers should expect Premium-only flows to deny access with Premium required/setup-needed copy.
- Do not provide real owner/admin credentials in Play Console unless a separate legal/admin review is required and the owner explicitly approves a limited account.
- If Google flags login failure, update this document with the rejection reason and provide a new safe test account. Do not work around review by hiding real gates or adding fake bypass features.
