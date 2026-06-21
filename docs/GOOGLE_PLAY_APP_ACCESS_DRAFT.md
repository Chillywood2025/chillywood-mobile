# Google Play App Access / Sign-In Details Draft

Date: 2026-06-21
Status: Ready-to-paste draft; password must be entered only in Play Console

Do not commit real passwords, one-time codes, owner/admin credentials, Play Console credentials, provider secrets, service-role keys, or recovery links.

## Play Console Fields

| Field | Value |
| --- | --- |
| App name | Chi'llywood |
| Package name | `com.chillywood.mobile` |
| Requires sign-in? | Yes for account features. Public browsing and legal/support pages are available without sign-in. |
| Test email | `play-reviewer-app-access@chillywoodstream.com` |
| Test password | `[OWNER ENTERS PASSWORD IN PLAY CONSOLE ONLY]` |
| 2FA / OTP | Use a reviewer account with no 2FA, OTP, geo-lock, or recovery prompt. |
| Account role | Normal non-admin user. |

## Ready-To-Paste Instructions

```text
Chi'llywood can be opened without signing in for public browsing and legal/support surfaces. Account features require signing in.

Test account:
- Email: play-reviewer-app-access@chillywoodstream.com
- Password: [enter password here in Play Console only]

Please do not use an owner/admin account for standard review. Admin, payout, live-money, provider, and private operator tools are gated and are not part of normal consumer review.

Suggested review path:
1. Launch the app.
2. Sign in with the reviewer account above.
3. Open Home, Explore, Live, and Library from bottom navigation.
4. Open Settings from the account/profile area.
5. Open Settings > Legal and Support to view Privacy Policy, Terms of Use, Community Guidelines, Account Deletion, Copyright/DMCA, Support, and Moderation Policy.
6. Open public Profile and Platform surfaces where visible.
7. Open a Player item from public or test content.
8. Use report/support entry points where visible. Do not submit harmful or false reports unless Chi'llywood provides a harmless disposable test target.

Purchases/live money:
- Live money, creator payouts, cash-out, withdrawal, transfers, and payable creator balances are off.
- Creator money production is not active for normal public review unless Chi'llywood separately provides a licensed tester path.
- Premium is app-wide Chi'llywood Premium through Google Play/RevenueCat when enabled for the submitted test scope.
- Creator subscriptions, VIP, tips, tickets, event passes, and paid videos are separate from Premium and must not be treated as creator cash-out or payout systems.

Private/admin surfaces:
- Admin Command Center and owner/operator tools are private and not required for standard consumer review unless Chi'llywood provides a separate admin review packet.
```

## Legal / Support Links

- Privacy Policy: `https://chillywoodstream.com/privacy`
- Terms of Use: `https://chillywoodstream.com/terms`
- Account Deletion: `https://chillywoodstream.com/account-deletion`
- Community Guidelines: `https://chillywoodstream.com/community-guidelines`
- Copyright/DMCA: `https://chillywoodstream.com/copyright-report`
- Support: `https://chillywoodstream.com/support`
- Support email: `support@chillywoodstream.com`

## Owner Checklist Before Saving

- Confirm the reviewer account signs in on the exact uploaded Play artifact.
- Confirm the password is current and stored only in Play Console/secure handoff.
- Confirm the account has no owner/admin/staff roles.
- Confirm the account has no private real-user data.
- Confirm any Premium purchase testing is intentionally opened only for licensed tester review.
- Confirm automated compatibility testing with sign-in details remains intentional.
