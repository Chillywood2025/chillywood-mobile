# Public V1 Launch Readiness Checklist

Last updated: June 13, 2026

## Status

Public-v1 is not launch-approved by this checklist yet. This document separates launch blockers, safe deferred provider-tooling gaps, and post-v1 enhancements.

## 1. Auth

- [ ] Forgot-password reset email proof on Play/internal runtime.
- [ ] Reset link opens installed app, not legal/support.
- [ ] Password update succeeds and sign-in works.
- [ ] Signup confirmation email proof on Play/internal runtime.
- [ ] Signup link opens installed app and verifies account.
- [ ] No tokens or passwords in logs/artifacts.
- [ ] Owner/internal personal inbox is not used for routine proof.

## 2. Premium

- [ ] Premium gate smoke on Play/internal runtime.
- [ ] Premium remains platform subscription only.
- [ ] Premium does not unlock creator paid videos, room tickets, events, subscriptions, or VIP.
- [ ] Creator purchases do not unlock Premium.
- [ ] Premium purchase shell status matches current approved policy.

## 3. Creator Monetization Sandbox

- [x] Tips V1 sandbox-proven.
- [x] Paid Videos V1 sandbox-proven.
- [x] Paid Watch-Party Seats V1 core sandbox-proven.
- [x] Paid Events V1 sandbox-proven.
- [x] Channel Subscriptions V1 purchase/effective-access safety proven.
- [x] VIP Passes V1 sandbox-proven.
- [x] Live money remains off.
- [x] Payouts remain off.
- [x] Sandbox rows remain not payable.

## 4. Money Center Truth / Copy

- [x] Money Center is the single creator money hub.
- [x] Sections are Overview, Ways to Earn, Offers, Transactions, Payouts, Tax & Legal, Provider Status.
- [x] Six creator flows appear in Ways to Earn.
- [x] Transactions are separated by flow.
- [x] Copy says sandbox/not-payable.
- [x] No live earnings, cash-out, withdrawal, transfer, payout release, or payable balance claim.
- [x] Premium separation copy present.

## 5. Brand Studio

- [ ] Creator can load Brand Studio.
- [ ] Creator can update safe test logo/banner/color.
- [ ] Preview updates.
- [ ] Save succeeds.
- [ ] Reload persists.
- [ ] Public channel/profile reflects update.
- [ ] Wrong-user edit denied.

## 6. Chi'lly Chat

- [ ] Inbox smoke.
- [ ] Messaging A -> B.
- [ ] Voice call incoming sheet/ringtone/vibration/decline/call card.
- [ ] Video call accept/route/end card.
- [ ] Background call push notification proof or documented pending state.
- [ ] No LiveKit token authority change.

## 7. Watch-Party / LiveKit

- [ ] Watch-Party Live player smoke.
- [ ] Participant rail smoke.
- [ ] Comments panel smoke.
- [ ] Join/leave/reconnect smoke.
- [ ] Expired room fails closed.
- [ ] Paid Watch-Party direct link blocks before camera/mic/membership/presence.
- [ ] Paid Watch-Party stays Party Waiting Room -> Party Room, not Live Stage.

## 8. Player / Video

- [ ] Normal public video playback smoke.
- [ ] Paid video locked state for unpaid user.
- [ ] Paid fan playback.
- [ ] Logged-out/direct-link denial.
- [ ] Player controls and fullscreen smoke.

## 9. RevenueCat / Google Play Products

- [ ] Latest internal track versionCode recorded.
- [ ] License testers confirmed.
- [ ] Paid Video product available.
- [ ] Watch-Party ticket product available.
- [ ] Event pass product available.
- [ ] Channel Subscription product/base plan available.
- [ ] VIP product available.
- [ ] RevenueCat webhook configured.
- [ ] Products remain sandbox/test for proof.

## 10. Stripe Connect Tips Test Mode

- [x] Tips checkout function deployed.
- [x] Stripe tip webhook deployed and signature-gated.
- [x] Stripe Connect test account proof passed.
- [x] Test tip succeeded.
- [x] Failed tip did not credit earnings.
- [ ] Live Stripe/payout approval remains separate and not enabled.

## 11. Supabase Migrations / RLS

- [x] Current remote database dry-run is up to date as of closeout.
- [x] Money/access tables have RLS enabled in audit.
- [x] Client cannot directly mark paid rows or active access for proved flows.
- [ ] Final prelaunch `supabase db push --dry-run`.
- [ ] Final prelaunch RLS/advisor check if schema changes occur.

## 12. Admin / Safety

- [ ] Admin/owner route smoke.
- [ ] Normal user denied from Admin.
- [ ] Blocked-user fixture smoke where available.
- [ ] Report/support/legal surfaces smoke.
- [ ] No admin-only controls exposed to creators/fans.
- [ ] No raw provider payloads/secrets in UI.

## 13. BrowserStack Final Regression

- [ ] BrowserStack account/tooling ready.
- [ ] Play/internal install path available.
- [ ] Required device matrix selected.
- [ ] BrowserStack run completed.
- [ ] Artifacts captured.
- [ ] Failures triaged/fixed or marked launch blockers.

## 14. Google Play Internal Release

- [ ] Latest committed SHA built.
- [ ] AAB submitted to internal testing.
- [ ] Internal versionCode recorded.
- [ ] Device install proves installer `com.android.vending`.
- [ ] App is not Expo Dev Launcher.
- [ ] App access reviewer account current and non-admin.
- [ ] Automated compatibility testing setting remains intentional.

## 15. Known Deferred Gaps

Safe deferred provider-tooling gaps:

- Paid Videos refund/revoke.
- Paid Watch-Party refund/revoke and visual Money Center screenshot.
- Paid Events refund/revoke and capacity UI proof.
- Channel Subscription fresh lifecycle webhook delivery.
- VIP refund/revoke.
- Tips live payout/reversal operation proof.

Post-v1 enhancements:

- broader creator payout operations
- production money activation lane
- richer refund/revoke automation
- expanded moderation/fraud workflows
- larger LiveKit load tests

## 16. Launch Blockers

Launch blockers until explicitly closed:

- BrowserStack final regression not run.
- live money approval not complete.
- payouts/cash-out/withdrawal/transfer not enabled.
- external Play/legal/Data Safety/account-deletion acceptance not fully closed where applicable.
- final auth reset/signup proof on Play/internal runtime not closed in this QA pass.
- Brand Studio final proof not closed in this QA pass.
- Chi'lly Chat two-user call proof not closed in this QA pass.
- Watch-Party/LiveKit two-user final proof not closed in this QA pass.

## 17. Go / No-Go Decision

Current decision: **No-go for broad public launch** until final regression, external launch governance, and listed launch blockers are closed.

Current decision: **Go for continued Play/internal QA** with live money and payouts off, sandbox rows not payable, and provider-tooling gaps documented.
