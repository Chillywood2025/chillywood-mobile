# Google Play Reviewer Test Account Packet

Date: 2026-06-01
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
8. Premium-only features are gated unless a licensed Play tester purchase path backed by RevenueCat/Google entitlement proof is provided. Non-Premium accounts should see Premium required or setup-needed copy.
9. Chi'lly Chat, Watch-Party, Live, comments, likes, follows, and uploads depend on account state, permissions, and current test fixtures.
10. Money features, tickets/seats, tips, paid creator content, and payouts are not active in the submitted test scope unless the owner separately provides provider-backed proof.

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

June 1, 2026 reviewer posture: current repo/device proof has the Android RevenueCat production public SDK key configured and `validate:runtime` passing, but sandbox purchase is not proved. Restore was attempted on `R5CR120QCBF` and completed with `Premium is not active`. Reviewers should see Premium-required or setup-needed copy for Premium creator tools unless the owner separately provides a Play licensed tester account, Play-installed matching build, active RevenueCat/Google product mapping, and an intentionally enabled sandbox purchase path inside Play Console/App access. Do not include a reviewer password in this repo.

| Feature | Reviewer note |
| --- | --- |
| Live money / payouts | Off. No cash-out, transfers, tips, paid creator content, ad revenue, sponsor checkout, or creator payout execution is live. |
| Premium / purchases | Only test if owner provides a Google Play license tester path backed by RevenueCat/Google entitlement proof. Current repo proof has the Android production RevenueCat public SDK key configured locally and `validate:runtime` passing, but the Premium purchase shell remains on hold, sandbox purchase is not claimed, and restore returned `Premium is not active` for the current signed-in device account. Reviewers should expect Premium-locked/setup-only tools unless the uploaded build includes matching provider proof and an intentionally enabled sandbox purchase path. Production Premium is not live unless provider proof matches the uploaded build. |
| Platform Studio / creator uploads | Premium required for normal creator accounts. Owner/operator accounts may see setup-only owner tools, but that is not Premium entitlement and does not activate paid access. |
| Watch-Party tickets/seats | Off/setup-only for Watch-Party Live and Live Watch-Party / Live Stage unless a real Google Play/RevenueCat entitlement path is separately provided. Paid seats do not bypass Premium gates or speaker approval, and no buy button should appear without provider backing. |
| Tips | Off. No tip checkout, tip totals, tip balances, badges, perks, rankings, or digital unlocks are active. |
| Paid creator content | Off. No paid digital content checkout or fake paid-access records are active. Android digital access must use Google Play/RevenueCat or another approved Play-compliant path, not Stripe checkout. |
| Money Center | Readiness/setup only. It may show provider status and setup copy, but no live money, fake earnings, fake balances, fake checkout, fake payout, or cash-out action is active. |
| Stripe / payouts | Stripe Connect is payout readiness/setup only. Stripe checkout must not be used for Android in-app digital goods, Premium, paid creator content, Watch-Party tickets/seats, or digital access unlocks. |
| Ads | Not active in current repo evidence. Owner must confirm the submitted build has no ad SDK/ad delivery/paid placements before declaring "No ads." |
| Admin | Owner/admin-only. Normal reviewer account should not see Admin tools. |
| iOS | Deferred. Android Public V1 only. |
| AI assistant | Not a Public V1 shipped feature unless a future lane adds and proves it. |

## Owner Pre-Submission Checks

- Confirm the reviewer account signs in successfully on the uploaded AAB.
- Confirm password does not expire and no OTP/2FA blocks review.
- Confirm account is not owner/admin/staff.
- Confirm account can reach representative signed-in flows.
- If Premium sandbox testing is requested, confirm the account is an approved Google Play license tester and the uploaded build has the matching RevenueCat/Google sandbox configuration.
- Confirm the uploaded build has the Android RevenueCat public SDK key in approved public config, a freshly generated release bundle, a licensed tester/product path, and the Premium purchase shell intentionally enabled before asking reviewers to test Premium purchase/restore.
- Confirm no private user data appears in the reviewer account.
- Save Play Console App access proof outside the repo.
