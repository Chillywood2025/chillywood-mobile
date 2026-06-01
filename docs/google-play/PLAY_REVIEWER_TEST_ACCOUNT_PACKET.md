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

June 1 backend entitlement sync follow-up: Play-installed sandbox purchase and restore have been proved, and the backend `revenuecat-webhook` now has a verified-event sync path for Premium. The server-side RevenueCat webhook secret and dashboard webhook integration are configured, and dashboard `TEST` delivery is received with no Premium grant. However, no real active Premium RevenueCat event has updated `user_entitlements`, and sanitized backend readback currently shows zero Premium rows. Reviewers should not be told that Premium creator tools unlock from backend entitlement until that active-event proof is complete. Platform Studio may still show `Premium required` when backend entitlement is missing.

June 1, 2026 reviewer posture: current repo/device proof has the Android RevenueCat production public SDK key configured and `validate:runtime` passing. The later Play-installed internal-test proof completed a Google Play / RevenueCat sandbox purchase and restore for the licensed tester, and the RevenueCat webhook secret/dashboard integration is now configured. Backend `user_entitlements` sync is still blocked on a fresh active Premium event because the post-setup Restore Purchases attempt returned Premium not active. Reviewers should see Premium-required or setup-needed copy for Premium creator tools unless the owner separately confirms the submitted build has both licensed tester purchase access and backend entitlement row proof. Do not include a reviewer password in this repo.

June 1 Play-installed v12 follow-up: `R5CR120QCBF` accepted the internal-test invite and now has `com.chillywood.mobile` installed from Google Play internal testing with `installer=com.android.vending`, `versionCode=12`, and `versionName=1.0.0`. RevenueCat dashboard proof confirms the Premium mapping: product `premium_subscription:monthly`, subscription id `premium_subscription`, base plan `monthly`, entitlement `premium`, and offering `premium`. Do not ask reviewers to test Premium purchase/restore yet: the app is signed out after reinstall, no reviewer/test password is committed, and the v12 build still has the Premium purchase shell on hold. Premium purchase/restore should be offered only after owner-approved App access credentials and a bounded purchase-shell build/update are ready.

June 1 signed-in Premium sandbox proof: owner-approved bounded EAS update group `b678522a-8734-49a1-a582-f2bc6743c756` opened only the Premium shell for the Play-installed internal-test v12 build. The licensed tester flow loaded the Google Play sandbox `Chi'llywood Premium` subscription, purchase completed, `/subscribe` showed `Premium is active`, and restore completed with `Purchases restored. Premium is active.` The shell was closed again with EAS update group `82f7e7fd-d213-4f50-9c5d-6e6a328884db`. Production Premium is not claimed live, and reviewers should not be told that creator monetization or payouts are active. Backend `user_entitlements` sync/readback remains a blocker for Premium creator-tool unlock; Platform Studio still shows clean `Premium required` copy after purchase.

| Feature | Reviewer note |
| --- | --- |
| Live money / payouts | Off. No cash-out, transfers, tips, paid creator content, ad revenue, sponsor checkout, or creator payout execution is live. |
| Premium / purchases | Play-installed sandbox purchase/restore and RevenueCat webhook delivery setup are proved for the licensed tester path, but backend creator-tool unlock is still blocked until a fresh active Premium event writes an active `user_entitlements` row. Reviewers should expect Premium-locked/setup-only creator tools unless the owner explicitly provides a licensed tester path and confirms backend entitlement row proof for the submitted build. Production Premium is not live unless provider proof matches the uploaded build. |
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
