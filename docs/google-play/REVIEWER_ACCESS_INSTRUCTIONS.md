# Google Play Reviewer Access Instructions

Date: 2026-05-30
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
9. Premium/money features are gated or setup-only unless the owner provides a licensed Play test purchase path. Live money, payouts, tips, paid creator content, sponsor checkout, merch checkout, ad revenue, and cash-out are off.
10. Admin tools are owner/admin-only and are not visible to normal users. Reviewers should not need admin access for normal app review.

Disabled/setup-only features:
- Live money is off.
- Payouts are off.
- Ads are not active in the current app build unless the owner changes the release configuration later.
- RevenueCat/Google provider proof is setup/sandbox-only until owner links provider secrets and proves signed sandbox events.
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

- If the reviewer must test Premium, add the reviewer account as a Play license tester and provide the exact Premium test flow in Play Console only.
- Do not provide real owner/admin credentials in Play Console unless a separate legal/admin review is required and the owner explicitly approves a limited account.
- If Google flags login failure, update this document with the rejection reason and provide a new safe test account. Do not work around review by hiding real gates or adding fake bypass features.
