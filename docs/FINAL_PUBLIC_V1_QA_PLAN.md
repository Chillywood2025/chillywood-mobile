# Final Public V1 QA Plan

Last updated: June 16, 2026

## Scope

This plan is the final public-v1 launch-readiness QA pass after creator monetization sandbox closeout. It does not add product features, enable live money, enable payouts, change LiveKit authority, change Watch-Party routing, or mix Premium with creator purchases.

Latest launch-blocker audit: `docs/PUBLIC_V1_FINAL_REGRESSION_AUDIT_20260616.md`.

Canonical monetization closeout truth: `docs/CREATOR_MONETIZATION_SANDBOX_CLOSEOUT_AUDIT.md`.

Launch-candidate polish record: `docs/LAUNCH_CANDIDATE_POLISH_PASS.md`. That pass made small copy/logging clarity fixes only; it did not run BrowserStack, enable live money, add features, or change route/payment authority.

Route-contract preflight: `npm run guard:route-contracts` is the local static check for core route doctrine before BrowserStack. It verifies Party Waiting Room -> Party Room, Live Waiting Room -> Live Stage, Player/Title content-first Watch-Party Live handoff, paid room-ticket buyers staying out of Live Stage, preferred Platform Studio route vs compatibility wrapper, canonical Chi'lly Chat routes, and Premium separation from creator purchases. It does not replace device/browser proof.

BrowserStack preparation package: `qa/browserstack/` now contains the whole-app final regression coverage map, persona template, env placeholder file, runbook, and flow contracts. BrowserStack is prepared, not run; no sessions were started, no app was uploaded, and no BrowserStack minutes were spent. Final execution still requires Play/internal runtime, not Expo Dev Launcher.

Platform scope: Android is the active proof lane. iOS is planned/deferred and must not start until Android final regression is closed and the user explicitly approves iOS work. Future iOS proof requires Apple signing, App Store Connect, App Store IAP products, and RevenueCat Apple product proof.

## June 13, 2026 Play/Internal QA Execution Status

Runtime delivery:

- Latest main includes polish commit `361e1d5`.
- EAS Update was published to branch `production`, runtime `1.0.0`, update group `c285901c-1489-4342-81be-53b20c9505f8`, Android update `019ec209-c5d9-7b1e-8709-e48bda72d67d`.
- The previously installed v52 Play/internal app checked for updates but reported `CheckCompleteUnavailable`; OTA delivery of the polish update could not be confirmed on that binary.
- A traceable Play/internal AAB was built from commit `361e1d5555b5b8dce4251aff10f3a14a2944dcf4`: EAS build `f7a0612b-acdc-40ad-91bd-c7870dbe573a`, versionCode `53`, app version `1.0.0`, runtime `1.0.0`, artifact type AAB.
- EAS submit `5237ae16-2efa-41ab-9768-02c437361515` submitted v53 to Google Play internal testing.
- Device `R5CR120QCBF` installed the update from Google Play: package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `53`, versionName `1.0.0`, not Expo Dev Launcher.

Proof artifacts are local-only under `/tmp/chillywood-final-qa-proof-20260613/`.

| Suite | Status | Result / blocker |
| --- | --- | --- |
| Runtime install | Passed | Play/internal v53 installed from Google Play with installer `com.android.vending`. |
| App launch / main shell | Passed | Home opened without crash or blank state. |
| Bottom navigation smoke | Passed | Home, Live hub, and Library rendered stable visible states on the Samsung device. |
| Watch-Party invalid direct link | Passed | `chillywoodmobile://watch-party/INVALIDQA` failed closed with `Room not found` and did not enter Party Room. |
| Reset route no-token smoke | Superseded by full pass | `chillywoodmobile://reset-password` opened the installed app reset route, not the public legal/support site; the later disposable-inbox proof completed recovery-session password reset end to end. |
| Settings / Premium gate smoke | Passed | Settings opened; Platform Studio entry for the current non-Premium tester showed an explicit `Premium required` gate instead of silently failing. |
| Brand Studio | Blocked | Current signed-in tester is not Premium/operator-authorized for Platform Studio; no Brand Studio edit/save was attempted. |
| Money Center six-flow visual readback | Blocked | Same Platform Studio Premium gate blocks Money Center for the current session. Existing six-flow proof docs remain canonical. |
| Auth reset/signup end to end | Not run | Requires dedicated disposable inbox and fresh reset/signup links; no owner/personal inbox was used. |
| Chi'lly Chat two-user calls | Not run | Requires a second signed-in device/account. |
| Watch-Party / LiveKit two-user flow | Not run | Requires a second signed-in device/account and a fresh valid room fixture. |
| Premium purchase/gate full proof | Not run | Only non-Premium gate visibility was checked. |
| Paid purchase regressions | Not run | Avoided running paid provider purchases during this launch-candidate smoke without explicit fresh fixture/account setup. Existing sandbox proof docs remain canonical. |
| BrowserStack | Deferred | Not started in this task. |

## June 13, 2026 Local Blocker-Clearing Pass

Persona readiness:

- Valid local sign-in labels confirmed through the normal anon auth path: `tips_creator_test`, `tips_blocked_test`, `paid_videos_fixture_creator`, `paid_videos_second_unpaid`, and `vip_non_vip`.
- Stale local credentials: `tips_fan_test` and the local Channel Subscription subscriber credential failed with `invalid_credentials`; do not use those local files for future proof until repaired through a secure handoff.
- `tips_creator_test` received a short-lived Premium `test_grant` for creator-tool QA only, expiring June 14, 2026 at 06:13 UTC. The metadata marks `live_money_enabled=false` and `creator_purchase_unlock=false`; this is not live money and does not grant creator purchase access.

Proof artifacts are local-only under `/tmp/chillywood-final-qa-clear-blockers-20260613/`.

| Suite | Status | Result / blocker |
| --- | --- | --- |
| Premium/operator creator access | Passed | `tips_creator_test` opened Platform Studio on Play/internal v53 after the short-lived proof entitlement. |
| Brand Studio load | Passed | Brand Studio loaded for `tips_creator_test` with the published `City Night` state. |
| Brand Studio save/reload | Passed with limitation | Saved/published the existing safe Brand Studio state without media upload; reload persisted `Published` / `City Night`. |
| Brand Studio wrong-user denial | Passed | Signed-in `paid_videos_second_unpaid` attempted to update `tips_creator_test` Brand Studio profile and received zero updated rows through RLS. |
| Money Center load | Passed | Money Center opened for `tips_creator_test`. |
| Money Center truth copy | Passed | UI showed live money inactive, sandbox activity inspection-only/not payable, no payout/cash-out/withdrawal/transfer, Premium separate from creator purchases, and six creator flows visible. |
| Money Center sections | Passed | Ways to Earn, Offers, Transactions, Payouts, Tax & Legal, and Provider Status were visible; Payouts showed `Disabled`, provider rows showed `Not payable`. |
| Non-Premium Platform Studio gate | Passed from v53 prior proof | The v53 run before the proof entitlement showed explicit `Premium required` copy instead of silent failure. A fresh second-user device login was not performed in this pass. |
| Auth reset/signup end to end | Blocked | No disposable inbox with readable reset/signup emails was available in this environment. No owner/personal inbox was used. |
| Chi'lly Chat two-user calls | Blocked | Only one attached Android device was available (`R5CR120QCBF`). |
| Watch-Party / LiveKit two-user flow | Blocked | Only one attached Android device was available; a fresh two-user room fixture was not created. |
| Paid purchase smoke | Deferred | Existing six-flow sandbox proof docs remain canonical; this pass verified Money Center truth labels and did not rerun paid purchases. |
| BrowserStack | Deferred | Still not started because local two-user/email blockers remain. |

## June 13, 2026 Final Persona Repair And Link Proof

Proof artifacts are local-only under `/tmp/chillywood-final-qa-second-account-20260613/`.

- Created/repaired `final_qa_simulator_test@chillywood.test` as an internal QA proof account through Supabase Auth admin tooling. The password is stored only in ignored `.env.final-qa-proof.local`; no password or service-role value is committed or documented.
- Corrected the Brand Studio public-viewer proof assertion. The public Platform renders the display name `Tips Creator Test`, handle `@tips_creator_test`, and viewer state `Viewer`, not the raw username without `@`.
- Brand Studio public-viewer readback passed on Play/internal v53 using the corrected assertion. Screenshot: `/tmp/chillywood-final-qa-second-account-20260613/brand-public-viewer-assert-current.png`.
- Disposable inbox proof used `mail.tm` domain `web-library.net`. Signup confirmation and password reset emails arrived from `no-reply@chillywoodstream.com` with auth links present. Result: `/tmp/chillywood-final-qa-second-account-20260613/auth-disposable-proof-result.json`.
- Installed-app signup verification passed on Play/internal v53 with a disposable `mail.tm` inbox opened from the phone. The signup request came from the installed app, the verification email arrived, the phone opened the email link without printing a token URL, and `com.chillywood.mobile` returned to login after verification. Proof artifacts: `/var/folders/n0/x_0xwyw50md5spq0_mqvrx_00000gn/T/chillywood-auth-installed-app-ui-proof-kdjMV8/`.
- Installed-app forgot-password proof passed after the reset route recovery-session fix: the reset request came from the installed app, the reset email arrived, the phone-opened link launched `com.chillywood.mobile` on the reset-password route, the recovery session opened, password update succeeded, the app returned to login, and sign-in with the new password reached Home. No token-bearing URLs were printed, documented, or committed. The hosted reset email template was also hardened to present the app recovery link as plain text to reduce email click-tracking prefetch risk.
- A local AVD (`Chi'llywood_API_34`) was available and booted, but installing the current 284 MB debug APK hung; the emulator was shut down. This is not a Play/internal proof surface and does not replace BrowserStack or a second physical device.

| Suite | Status | Result / blocker |
| --- | --- | --- |
| Final QA proof account | Passed | `final_qa_simulator_test@chillywood.test` exists, has a profile, and normal anon sign-in was verified. |
| Brand Studio public-viewer readback | Passed | Public Platform showed `Tips Creator Test`, `@tips_creator_test`, and `Viewer` on Play/internal v53. |
| Disposable inbox delivery | Passed | Signup confirmation and reset emails arrived in a disposable readable inbox. |
| Signup verification completion | Passed | Installed app requested signup, phone-opened verification link launched `com.chillywood.mobile`, and the app returned to login after verification. |
| Password reset completion | Passed | Installed app requested reset, phone-opened reset link launched `com.chillywood.mobile`, recovery session opened, password update succeeded, and sign-in with the new password reached Home. |
| Chi'lly Chat two-user calls | Blocked | Still needs a second interactive signed-in device/session; local emulator install was not usable. |
| Watch-Party / LiveKit two-user flow | Blocked | Still needs a second interactive signed-in device/session; local emulator install was not usable. |
| BrowserStack | Prepared / deferred | Persona and flow contracts are documented in `docs/BROWSERSTACK_FINAL_REGRESSION_PLAN.md` and `qa/browserstack/`; BrowserStack was not run. |

## Route Contract Preflight

Before BrowserStack, run `npm run guard:route-contracts` with the standard local validation set. The guard is local-only and does not use Supabase, Google Play, RevenueCat, BrowserStack, devices, or emulators.

Protected route doctrine:

- Party Waiting Room routes to Party Room at `/watch-party/[partyId]`.
- Live Waiting Room routes to Live Stage at `/watch-party/live-stage/[partyId]`.
- Player/Title handoff into Watch-Party Live remains content-first through the waiting-room route.
- Paid Watch-Party ticket buyers do not route to Live Stage.
- `/channel-studio` is the preferred Platform Studio route and `/channel-settings` remains compatibility.
- Chi'lly Chat canonical routes remain `/chat` and `/chat/[threadId]`.
- Premium route/gates remain separate from creator purchases.

## Current Launch Blockers

- BrowserStack final multi-device regression has not run.
- Chi'lly Chat two-user message/call proof still needs a second physical session or BrowserStack.
- Watch-Party Live / Party Room two-user participant rail, join/leave, comments, and controls still need a second physical session or BrowserStack.
- Live Watch-Party / Live Stage route smoke still needs final runtime regression.
- Live money remains disabled and must stay disabled until a separate owner-approved launch lane.
- Payouts, cash-out, withdrawals, transfers, payout release, and payable creator balances remain disabled.
- Provider refund/revoke/lifecycle proof remains incomplete for several creator-money flows because safe provider tooling/order identifiers are not available.
- Channel Subscription lifecycle webhook delivery is still provider-blocked until a fresh signed RevenueCat lifecycle event is received after the handler deployment.
- Paid Events capacity UI proof remains deferred because creator UI does not expose `capacity_limit`.
- Premium separation, direct-link gates, and BrowserStack still need release-candidate regression proof; installed-app signup verification and forgot-password reset completion passed on Play/internal v53 with a disposable inbox.
- External Google Play / legal / Data Safety / account-deletion acceptance and operational signoff remain launch-governance blockers where not separately closed.

Sandbox Money Tester Experience update: all six Android sandbox tester flows are now Play-installed proved. Final proof folders are `/tmp/chillywood-sandbox-money-final-three-proof-20260616-183633` and `/tmp/chillywood-vip-after-play-refund-proof-20260616-180235`. Future money work in this plan is regression/provider-lifecycle only unless a real regression appears.

## Safe Deferred Provider-Tooling Gaps

These do not invalidate sandbox closeout, but they block launch-live money claims:

- Paid Videos refund/revoke proof.
- Paid Watch-Party Seats refund/revoke proof.
- Paid Events refund/revoke proof.
- Channel Subscription fresh lifecycle webhook proof after deployed lifecycle handling.
- VIP Passes refund/revoke proof.
- Tips live payout/reversal operation proof.

No future proof may fake these states by manually mutating Supabase rows.

## Test Persona Labels

Credentials must live only in ignored local env files, local keychain, or another approved secret handoff. Do not commit passwords, raw tokens, provider secrets, or Google account passwords.

| Persona | Purpose | Credential rule |
| --- | --- | --- |
| `creator_host_test` | Creator Studio, Money Center, Brand Studio, creator setup | Internal/staging only |
| `paid_video_fan_test` | Paid Video purchased access | Internal/staging only |
| `unpaid_video_fan_test` | Paid Video denial | Internal/staging only |
| `watch_party_host_test` | Watch-Party room host and paid-ticket offer setup | Internal/staging only |
| `watch_party_paid_fan_test` | Paid room-ticket purchase and entry | Internal/staging only |
| `watch_party_unpaid_fan_test` | Paid room denial and direct-link denial | Internal/staging only |
| `event_creator_test` | Paid Event setup | Internal/staging only |
| `event_paid_fan_test` | Paid Event access | Internal/staging only |
| `event_unpaid_fan_test` | Paid Event denial | Internal/staging only |
| `channel_creator_test` | Channel Subscription setup/readback | Internal/staging only |
| `subscriber_fan_test` | Active subscriber state | Internal/staging only |
| `nonsubscriber_fan_test` | Subscriber-only denial | Internal/staging only |
| `vip_fan_test` | VIP access | Internal/staging only |
| `nonvip_fan_test` | VIP denial | Internal/staging only |
| `blocked_fan_test` | Blocked-user safety, if available | Internal/staging only |
| `premium_test_user` | Premium gate positive proof, if available | Internal/staging only |
| `nonpremium_test_user` | Premium gate denial proof, if available | Internal/staging only |

No fake production login bypass is allowed. No service-role key may appear in mobile code.

## Runtime Requirements

Release-candidate proof must use a Play/internal install:

- package `com.chillywood.mobile`
- installer `com.android.vending`
- versionCode equal to the latest internal candidate
- app version `1.0.0`
- runtime version `1.0.0`
- not Expo Dev Launcher

Latest monetization proof runtime currently documented: Play/internal versionCode `52` for VIP Passes V1. Before final QA execution, recheck Google Play internal track and attached device versionCode.

## Required QA Suites

### Auth Email Reset And Signup

Proof steps:

1. Trigger forgot-password reset from the Play-installed app using a dedicated disposable non-admin recovery-test inbox.
2. Confirm Brevo/Supabase delivers the reset email.
3. Tap the link on device and confirm it opens the installed app reset-password route.
4. Confirm password update succeeds.
5. Confirm the user returns to login or the correct auth state.
6. Sign in with the new password.
7. Create a new signup test account.
8. Confirm the verification email arrives.
9. Tap the verification link on device.
10. Confirm the installed app handles the auth callback and the account verifies.

Checks:

- no auth link lands on legal/support unless intentionally routed
- no tokens logged
- Brevo tracking does not break auth links
- Expo Dev Launcher is not accepted as proof
- do not use the owner's personal/internal tester inbox

### Brand Studio

Proof steps:

1. Creator opens Brand Studio.
2. Existing brand state loads.
3. Creator updates a safe test logo/banner/color.
4. Preview updates.
5. Save succeeds.
6. Reload persists.
7. Public channel/profile reflects updated brand.
8. Wrong user cannot edit.
9. RLS/admin boundaries hold.

Capture screenshots/logs.

### Chi'lly Chat

Proof steps:

1. Inbox loads with modern layout.
2. Existing thread opens.
3. User A sends message to User B.
4. User B receives message.
5. Voice call: incoming call sheet appears, ringtone/vibration works, decline works, declined call card appears.
6. Video call: accept works, both users route into the existing communication room, ringtone stops, ended call card appears.
7. Background push call notification remains pending if server dispatch is not fully proved.

Do not alter LiveKit token authority.

### Watch-Party / LiveKit

Proof steps:

1. Watch-Party Live player opens.
2. Shared player remains stable.
3. Participant rail shows `You`, a second user under `You`, and overflow scrolls inside the right rail.
4. Comments panel stays stable.
5. Bottom player controls stay stable.
6. Join/leave/reconnect smoke passes.
7. Old/expired room fails closed.
8. Paid Watch-Party direct Party Room link stays gated before camera/mic/membership/presence setup.
9. Join Now blocked states show an explicit expired/ticket/free/active-ticket outcome and do not silently fail.

Do not change route ownership or reroute to Live Stage.

### Money Center Six-Flow Regression

| Flow | Required smoke |
| --- | --- |
| Tips | Creator can enable Tips; sandbox tip proof/readback is current; no perk/access unlock; transaction remains sandbox/not-payable. |
| Paid Videos | Unpaid locked; paid fan access; second unpaid blocked; Money Center readback; refund/revoke deferred if tooling unavailable. |
| Paid Watch-Party Seats | Unpaid ticket gate; Buy Room Ticket; paid fan entry; direct-link blocked; seat limit held; Money Center readback or screenshot gap documented. |
| Paid Events | Unpaid event gate; paid access; second unpaid denied; Money Center readback; capacity/refund gaps documented. |
| Channel Subscriptions | Subscribed state; effective access fallback; non-subscriber denial; Money Center readback; lifecycle webhook delivery deferred. |
| VIP Passes | Get VIP; VIP fan access; non-VIP denial; Money Center readback; refund/revoke deferred if no safe order id. |

Global checks:

- every money row is sandbox/not-payable
- live money off
- no cash-out/withdrawal/transfer/payout release
- no mixing between Tips, Premium, Paid Videos, rooms, events, subscriptions, or VIP
- unavailable Subscribe/Get VIP cards explain the sandbox/provider blocker instead of showing a dead disabled CTA

### Google Play / Provider Readiness

Audit before paid regression:

- latest internal track versionCode
- tester opt-in and install path
- license tester status
- RevenueCat Android app products, offerings/packages where used, and entitlements
- Google Play one-time products and subscription base plans
- webhook endpoints for RevenueCat and Stripe Tips
- Stripe Connect Tips remains test/sandbox

Proof must capture package, installer, versionCode, product id/key, provider event id where purchases are run, and timestamps.

## Artifact Rules

Capture:

- screenshots
- screen recordings where useful
- sanitized logs
- device info
- package and installer
- versionCode
- test account labels only
- provider event ids and transaction/access ids where safe

Do not capture or commit passwords, tokens, raw provider payloads, service-role values, private keys, card details, or dashboard secrets.

## Go / No-Go Criteria

No-go:

- crash, blank screen, or stuck loading in primary routes
- auth reset/signup links fail or expose tokens
- Play/internal runtime is not installer `com.android.vending`
- any creator money UI claims live earnings, payout, cash-out, withdrawal, transfer, or payable balance
- Premium unlocks creator purchases or creator purchases unlock Premium
- paid Watch-Party routes to Live Stage
- unpaid direct link bypasses a paid gate
- LiveKit authority changes from payment status
- RLS/client write-denial regression

Go for public-v1 candidate review only:

- BrowserStack final regression passes or exact blockers are documented
- Play/internal runtime proof is captured
- live money and payouts remain off
- deferred provider-tooling gaps are explicitly documented
- owner/legal/store go/no-go signoff is separate and not implied by this QA plan
