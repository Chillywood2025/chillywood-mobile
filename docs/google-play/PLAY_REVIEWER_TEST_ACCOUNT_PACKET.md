# Google Play Reviewer Test Account Packet

Date: 2026-05-30
Status: field-ready copy; credentials must be entered only in Play Console

Do not commit real reviewer passwords, recovery codes, OTP seeds, service accounts, owner/admin credentials, Play Console credentials, or provider secrets. Put the live test credential values only in Google Play Console App access.

## Play Console App Access Fields

| Field | Value to enter |
| --- | --- |
| App name | Chi'llywood |
| Package | `com.chillywood.mobile` |
| Requires sign-in? | Yes for account features. Public browsing and legal pages are available without sign-in. |
| Test username/email | `[OWNER ENTERS SAFE NON-ADMIN TEST EMAIL IN PLAY CONSOLE ONLY]` |
| Test password | `[OWNER ENTERS PASSWORD IN PLAY CONSOLE ONLY. DO NOT COMMIT.]` |
| 2FA / OTP | Use a reviewer account that does not require 2FA, one-time codes, geo-dependent passwords, or recovery prompts. |
| Account role | Normal non-admin user. Do not provide Owner/Admin unless Google specifically requests admin-only legal/moderation proof. |

## Field-Ready Instructions To Paste

```text
Chi'llywood can be opened without signing in for public browsing and legal/support surfaces. Account features require a test account.

Test account:
- Email: [enter safe non-admin reviewer email here in Play Console only]
- Password: [enter password here in Play Console only]

Please do not use an owner/admin account for standard review. Admin, payout, live-money, and provider tools are restricted and are not part of normal user review.

Suggested review path:
1. Launch the app.
2. Open Home, Explore, Live, and Library from bottom navigation.
3. Open Settings from the account/profile area.
4. Open Settings > Legal and Support to view Privacy Policy, Terms of Use, Account Deletion and Data Deletion Policy, Copyright/DMCA, Community Guidelines, Creator Rules, Support, and Moderation Policy.
5. Open Profile and public Platform surfaces where visible.
6. Open a Player item from public or test content.
7. Use report actions where visible. Do not submit harmful or false reports unless the owner provides a clearly harmless disposable test target.
8. Premium/money features are gated or setup-only unless a licensed Play tester purchase path is provided. Live money, payouts, tips, paid creator content, sponsor checkout, merch checkout, ad revenue, and cash-out are off.
9. Chi'lly Chat, Watch-Party, Live, comments, likes, follows, and uploads depend on account state, permissions, and current test fixtures.

Legal/support links:
- Privacy Policy: https://chillywoodstream.com/privacy
- Terms: https://chillywoodstream.com/terms
- Account deletion: https://chillywoodstream.com/account-deletion
- Copyright/DMCA: https://chillywoodstream.com/copyright-report
- Support contact: support@chillywoodstream.com
```

## Signed-Out Review

Reviewers can test:

- app launch and public navigation;
- public legal pages;
- public support/account deletion URL;
- public Profile/Platform surfaces where allowed;
- sign-in handoffs for gated actions.

Do not claim signed-out users can use account-owned features such as posting, messaging, following, blocking, deleting, or account deletion fulfillment without sign-in.

## Signed-In Review

Reviewers can test with the non-admin account:

- Profile and account settings;
- public Platform/Player browsing;
- legal/support/account deletion request path;
- report flow entry points where visible;
- comments/likes/follows/chat only where policy and fixtures allow;
- notification permission prompts if they appear.

The test account should not expose private personal photos, real user reports, real user messages, owner/admin actions, provider secrets, payout tools, or live money controls.

## Setup-Only / Disabled Features

| Feature | Reviewer note |
| --- | --- |
| Live money / payouts | Off. No cash-out, transfers, tips, paid creator content, ad revenue, sponsor checkout, or creator payout execution is live. |
| Premium / purchases | Only test if owner provides a Play license tester path. Do not claim Premium is live unless provider proof matches the uploaded build. |
| Ads | Not active in current repo evidence. Owner must confirm the submitted build has no ad SDK/ad delivery/paid placements before declaring "No ads." |
| Admin | Owner/admin-only. Normal reviewer account should not see Admin tools. |
| iOS | Deferred. Android Public V1 only. |
| AI assistant | Not a Public V1 shipped feature unless a future lane adds and proves it. |

## Owner Pre-Submission Checks

- Confirm the reviewer account signs in successfully on the uploaded AAB.
- Confirm password does not expire and no OTP/2FA blocks review.
- Confirm account is not owner/admin/staff.
- Confirm account can reach representative signed-in flows.
- Confirm no private user data appears in the reviewer account.
- Save Play Console App access proof outside the repo.
