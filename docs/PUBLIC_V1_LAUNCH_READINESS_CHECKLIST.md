# Public V1 Launch Readiness Checklist

Last updated: June 20, 2026

## Status

Public-v1 is not launch-approved by this checklist yet. This document separates launch blockers, safe deferred provider-tooling gaps, and post-v1 enhancements.

Launch-candidate polish pass: `docs/LAUNCH_CANDIDATE_POLISH_PASS.md`. This pass made small copy/logging clarity fixes only and did not run BrowserStack or approve launch.

June 13, 2026 final Play/internal QA execution status is recorded in `docs/FINAL_PUBLIC_V1_QA_PLAN.md`. The traceable v53 AAB from commit `361e1d5` was submitted to Play internal and installed on `R5CR120QCBF` with installer `com.android.vending`; app launch, main navigation, invalid Watch-Party deep-link fail-closed behavior, reset-route app handling, Settings, and a non-Premium Platform Studio gate smoke passed. BrowserStack, auth email end-to-end, two-user chat/call, two-user Watch-Party/LiveKit, Brand Studio edit/save, and Money Center current-session visual readback remain open.

June 13 blocker-clearing update: a short-lived Premium `test_grant` let `tips_creator_test` open Platform Studio, Brand Studio, and Money Center on Play/internal v53. Brand Studio safe-state save/reload passed, wrong-user Brand Studio write was denied by RLS using `paid_videos_second_unpaid`, and Money Center showed sandbox/not-payable/live-money-off/payout-disabled truth. The later final persona repair pass closed the disposable-inbox auth proof; two-user Chi'lly Chat / Watch-Party proof remains blocked on a second attached device/account.

June 13 final persona repair update: `final_qa_simulator_test@chillywood.test` was created/repaired as an internal QA proof account with credentials stored only in ignored `.env.final-qa-proof.local`. Brand Studio public-viewer readback passed on Play/internal v53 with corrected assertions for `Tips Creator Test`, `@tips_creator_test`, and `Viewer`. Disposable inbox delivery passed for signup and reset emails using `mail.tm`; installed-app signup verification now passes from a phone-opened email link without exposing token URLs. Installed-app forgot-password proof also passed after the reset recovery-session fix: the phone-opened reset link launched `com.chillywood.mobile`, opened the recovery session, allowed password update, returned to login, and sign-in with the new password reached Home. BrowserStack personas and flow contracts are prepared, but BrowserStack has not run.

June 14 owner/admin integration audit after route cleanup is recorded in `docs/OWNER_ADMIN_INTEGRATION_AUDIT.md`. The audit found no route/product blocker for BrowserStack prep, kept BrowserStack deferred, and made only sanitized Watch-Party proof logging cleanup.

June 14 BrowserStack readiness package is prepared under `qa/browserstack/`. It includes coverage map, persona labels without secrets, placeholder env names, approval-gated runbook, and 15 whole-app flow contracts. BrowserStack has not run, no app has been uploaded to BrowserStack, and no BrowserStack minutes have been spent.

Android remains the active proof lane. iOS BrowserStack is a planned/deferred future lane only and requires later Apple signing, App Store Connect, App Store IAP, and RevenueCat Apple product proof before it can run.

June 20 money closeout: Seven-flow money proof: CLOSED / app-side proof complete. Premium, Tips, Paid Video, Watch-Party Ticket, Channel Subscription, VIP, and Event Pass are closed for Android app-side proof. Do not reopen the money lane unless a new regression appears. Remaining future work is provider/test-account maintenance and live-production rollout governance, not app-code proof. Sandbox proof does not enable live money or payouts.

June 20 integration/proof closeout update: forgot/reset password routing, positive Admin/Owner access, selected non-LiveKit closeout, Chi'lly Chat non-media messaging/call-route proof, Profile/Platform visibility gates, seven-flow money app-side proof, and Live Stage media/authority proof are closed. Watch-Party shared Player camera/mic remote-render proof is still deferred until a stable second session or BrowserStack. BrowserStack/App Live final regression, fresh creator upload-to-playback proof, attachment-heavy comments proof, and external launch governance/provider/legal readiness remain pending. Audit folder: `/tmp/chillywood-production-integration-confusion-audit-20260620-185544`.

## 1. Auth

- [x] Forgot-password reset email proof on Play/internal runtime.
- [x] Forgot-password reset email arrives in disposable readable inbox.
- [x] Reset link opens installed app, not legal/support.
- [x] Password update succeeds and sign-in works.
- [x] Signup confirmation email proof on Play/internal runtime.
- [x] Signup confirmation email arrives in disposable readable inbox.
- [x] Signup link opens installed app and verifies account.
- [x] No token-bearing URLs are documented or committed.
- [x] Owner/internal personal inbox is not used for routine proof.

## 2. Premium

- [ ] Premium gate smoke on Play/internal runtime.
- [ ] Premium remains platform subscription only.
- [ ] Premium does not unlock creator paid videos, room tickets, events, subscriptions, or VIP.
- [ ] Creator purchases do not unlock Premium.
- [ ] Premium purchase shell status matches current approved policy.

## 3. Creator Monetization Sandbox

- [x] Seven-flow money proof closed for app-side Android proof.
- [x] Premium app-wide separation proved as part of the seven-flow lane.
- [x] Tips V1 sandbox-proven.
- [x] Paid Videos V1 sandbox-proven.
- [x] Paid Watch-Party Seats V1 purchase/readback/exact-target entry proven.
- [x] Paid Events V1 sandbox-proven.
- [x] Channel Subscriptions V1 purchase/effective-access safety proven.
- [x] VIP Passes V1 provider ownership reset and fresh first-purchase proven.
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
- [x] Creator Channel Subscription and VIP unavailable states explain the sandbox blocker instead of leaving a disabled CTA unexplained.

## 5. Brand Studio

- [x] Creator can load Brand Studio.
- [x] Creator can update/save safe Brand Studio state without media upload.
- [x] Preview/state loads with published `City Night`.
- [x] Save succeeds.
- [x] Reload persists.
- [x] Public channel/profile reflects update as a viewer. Corrected proof asserts `Tips Creator Test`, `@tips_creator_test`, and `Viewer`.
- [x] Wrong-user edit denied by RLS proof.

## 6. Chi'lly Chat

- [x] Inbox / direct-thread route smoke for non-media proof.
- [x] Two-user message send/receive/reply proof.
- [x] Call route/state non-media proof.
- [x] Unauthorized/thread membership boundaries checked in non-media proof.
- [ ] Background call push notification proof or documented pending state.
- [ ] No LiveKit token authority change.

## 7. Watch-Party / LiveKit

- [ ] Watch-Party Live player smoke.
- [x] Participant rail join/leave route/membership proof.
- [ ] Comments panel smoke.
- [x] Join/leave proof for participant rail.
- [ ] Watch-Party shared Player camera/mic remote-render proof on stable second session or BrowserStack.
- [ ] Reconnect smoke.
- [ ] Expired room fails closed.
- [ ] Paid Watch-Party direct link blocks before camera/mic/membership/presence.
- [x] Invalid Watch-Party direct link fails closed on Play/internal v53 with `Room not found`.
- [x] Paid Watch-Party stays Party Waiting Room -> Party Room, not Live Stage in route-contract/app-side proof.
- [x] Live Stage media/authority proof passed; viewer publish authority stayed restricted.
- [x] Join Now proof logs are sanitized dev-only logs, not raw production console logs.

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

- [x] Owner/admin route/product integration audit after issues #1-#7.
- [x] Admin/owner runtime route smoke with real owner account.
- [x] Normal user denied from Admin.
- [ ] Blocked-user fixture smoke where available.
- [ ] Report/support/legal surfaces smoke.
- [ ] No admin-only controls exposed to creators/fans.
- [ ] No raw provider payloads/secrets in UI.

## 13. BrowserStack Final Regression

- [x] BrowserStack readiness contracts prepared in `qa/browserstack/`.
- [x] Android marked as active proof lane.
- [x] iOS marked as deferred future lane.
- [ ] BrowserStack account/tooling ready.
- [ ] Play/internal install path available.
- [ ] Required device matrix selected.
- [ ] BrowserStack run completed.
- [ ] Artifacts captured.
- [ ] Failures triaged/fixed or marked launch blockers.

## 14. Google Play Internal Release

- [x] Latest committed SHA built. v53 build `f7a0612b-acdc-40ad-91bd-c7870dbe573a` used commit `361e1d5`.
- [x] AAB submitted to internal testing. EAS submission `5237ae16-2efa-41ab-9768-02c437361515`.
- [x] Internal versionCode recorded: `53`.
- [x] Device install proves installer `com.android.vending`.
- [x] App is not Expo Dev Launcher.
- [ ] App access reviewer account current and non-admin.
- [x] App access reviewer account must remain non-admin and credentials must live only in Play Console or secure handoff.
- [ ] Automated compatibility testing setting remains intentional.

## 15. Known Deferred Gaps

Safe deferred provider-tooling gaps:

- Paid Videos refund/revoke.
- Paid Watch-Party refund/revoke provider tooling.
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
- Watch-Party shared Player camera/mic remote-render proof remains deferred until a stable second session or BrowserStack.
- Fresh creator upload-to-playback proof remains pending.
- Attachment-heavy comments proof remains pending if attachment paths are public-v1 critical.
- BrowserStack final regression remains pending until explicitly approved.

## 17. Go / No-Go Decision

Current decision: **No-go for broad public launch** until final regression, external launch governance, and listed launch blockers are closed.

Current decision: **Go for continued Play/internal QA** with live money and payouts off, sandbox rows not payable, and provider-tooling gaps documented.
