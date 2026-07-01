# BrowserStack Final Regression Plan

Last updated: June 14, 2026

## Purpose

BrowserStack is the final multi-device regression pass after cheap local/manual proof. It is not the first proof for creator monetization, purchases, LiveKit, auth, or Brand Studio.

Preparation status: whole-app BrowserStack readiness contracts are prepared under `qa/browserstack/`. BrowserStack has not been started, no app has been uploaded to BrowserStack, and no BrowserStack minutes have been spent.

Platform scope: Android is the active proof lane. iOS is a planned/deferred future lane only; do not run iOS BrowserStack until Android final regression is closed and the user explicitly approves iOS work. iOS requires future Apple signing, App Store Connect setup, App Store IAP products, and RevenueCat Apple product proof before install or purchase proof can be claimed.

## Required Runtime

Use a Google Play internal testing runtime:

- package `com.chillywood.mobile`
- installer `com.android.vending`
- latest internal versionCode
- app version `1.0.0`
- runtime version `1.0.0`
- not Expo Dev Launcher

Before starting BrowserStack, record:

- commit SHA
- EAS build id if a new build is used
- Google Play internal track status
- installed versionCode
- device model and Android version
- tester account labels only

Latest launch-candidate runtime documented before BrowserStack: versionCode `53`, EAS build `f7a0612b-acdc-40ad-91bd-c7870dbe573a`, EAS submission `5237ae16-2efa-41ab-9768-02c437361515`, commit `361e1d5`, installed on physical device `R5CR120QCBF` from Google Play internal testing with installer `com.android.vending`.

BrowserStack has not started. It should use the v53-or-newer Play/internal runtime, not Expo Dev Launcher and not an unsubmitted local APK.

Local blocker-clearing status before BrowserStack: Platform Studio, Brand Studio creator save/reload, Brand Studio wrong-user denial, and Money Center truth-copy proof passed on Play/internal v53. BrowserStack should not start until the remaining local blockers are either cleared or explicitly accepted: disposable inbox auth reset/signup proof, two-device Chi'lly Chat call proof, two-device Watch-Party/LiveKit proof, and Brand Studio public-viewer readback.

Final local prep update before BrowserStack: Brand Studio public-viewer readback passed with corrected public assertions. Disposable inbox email delivery passed for signup and reset. Installed-app signup verification and forgot-password reset completion passed on Play/internal v53 without retaining token-bearing URLs. A local AVD booted but could not be made into a reliable second app runtime because current debug APK install hung; it is not a Play/internal runtime and does not replace BrowserStack. BrowserStack remains prepared but not run.

June 14 readiness update: `qa/browserstack/README.md`, `qa/browserstack/coverage-map.md`, `qa/browserstack/personas.example.json`, `qa/browserstack/env.example`, `qa/browserstack/runbook.md`, and `qa/browserstack/flows/*.contract.md` define the future BrowserStack regression system. These files are contracts only and do not contain passwords, BrowserStack keys, app uploads, or executable cloud invocations. Chi'lly Chat and Watch-Party/LiveKit two-user proof remain deferred until a second physical session or explicit BrowserStack approval.

## Prepared Contract Package

The prepared BrowserStack package lives in `qa/browserstack/`:

- `README.md`: scope, runtime rule, and no-execution boundary.
- `coverage-map.md`: whole-app coverage matrix and known blockers.
- `personas.example.json`: persona labels, account-state requirements, and secret-source placeholders only.
- `env.example`: placeholder env names only; no keys.
- `runbook.md`: approval-gated execution order.
- `flows/00-runtime-install.contract.md` through `flows/14-final-smoke.contract.md`: flow contracts for runtime, auth, Home/Explore/Library, Profile/Platform, Brand Studio, Chi'lly Chat, Watch-Party Live, Live Watch-Party/Live Stage, Player/Paid Video, Money Center, Premium, Settings/Legal, direct-link denials, Admin/Owner, and final smoke.

Route-contract preflight before BrowserStack: run `npm run guard:route-contracts` with the standard local guards. This static check protects Party Waiting Room -> Party Room, Live Waiting Room -> Live Stage, Player/Title content-first Watch-Party Live handoff, paid Watch-Party Seat Pass buyers staying out of Live Stage, `/channel-studio` preferred Platform Studio route vs `/channel-settings` compatibility, canonical Chi'lly Chat `/chat` and `/chat/[threadId]`, and Premium separation from creator purchases. BrowserStack still needs runtime route smoke on Play/internal.

## Device Matrix

Android active lane:

Minimum:

| Device class | Purpose |
| --- | --- |
| Samsung current-device class | Match physical proof device behavior and One UI quirks. |
| Pixel medium screen | Baseline Android reference. |
| Older Android version | Catch OS permission, notification, and billing sheet differences. |
| Small-screen Android | Prove no cramped Money Center, auth, player, or purchase CTA overlap. |

Optional if budget allows:

- tablet
- foldable
- low-memory profile
- Android 15/16 newest image when available in BrowserStack

Future iOS placeholders, deferred:

- current iPhone standard screen
- small iPhone screen
- larger iPhone Pro/Max class
- iPad class if later approved

Do not run the iOS placeholders in the current Android-first final regression lane.

## Personas

Use test labels only:

- `creator_host_test`
- `paid_video_fan_test`
- `unpaid_video_fan_test`
- `watch_party_host_test`
- `watch_party_paid_fan_test`
- `watch_party_unpaid_fan_test`
- `event_creator_test`
- `event_paid_fan_test`
- `event_unpaid_fan_test`
- `channel_creator_test`
- `subscriber_fan_test`
- `nonsubscriber_fan_test`
- `vip_fan_test`
- `nonvip_fan_test`
- `blocked_fan_test` if available
- `premium_test_user` if available
- `nonpremium_test_user` if available

Passwords must come from local secure handoff only and must not be committed, logged, or placed in BrowserStack public artifacts.

Prepared local persona notes:

| Persona | Current prepared label | BrowserStack use |
| --- | --- | --- |
| Creator / Brand Studio / Money Center | `tips_creator_test` | Positive creator-tool proof while short-lived Premium/operator-equivalent proof access is active or freshly regranted. |
| Public viewer / non-owner | `final_qa_simulator_test` | Brand Studio public-viewer, non-owner denial, logged-in viewer smoke. |
| Blocked/safety fan | `tips_blocked_test` | Blocked-user smoke if fixture relation is needed. |
| Paid Video creator fixture | `paid_videos_fixture_creator` | Existing Paid Video fixture readback only. |
| Second unpaid paid-video fan | `paid_videos_second_unpaid` | Existing non-owner/RLS denial and unpaid-flow smoke. |
| VIP non-VIP fan | `vip_non_vip` | Existing VIP denial smoke. |

Stale credentials that must not be used until secure handoff repair: `tips_fan_test` local env credential and the local Channel Subscription subscriber credential.

## Flow Contracts

These are the BrowserStack contracts to execute once BrowserStack starts:

| Contract | Required result |
| --- | --- |
| Auth reset | Disposable reset email arrives, token link opens installed app, password update succeeds, sign-in with new password succeeds. |
| Auth signup | Disposable signup email arrives, token link opens installed app, account verifies, user lands in a clear login/auth state. |
| Brand Studio | Creator save/reload stays passed; public viewer sees public Platform state without owner controls. |
| Chi'lly Chat | User A sends to User B; User B receives; voice decline and video accept/end produce visible call states. |
| Watch-Party / LiveKit | Host and joiner appear in participant rail; join/leave works; old room fails closed; paid direct room link gates before camera/mic/presence. |
| Route contracts | Local `npm run guard:route-contracts` passes before BrowserStack; BrowserStack confirms runtime route smoke for the same doctrine. |
| Money Center | Six-flow readback remains sandbox/not_payable; live money and payout actions remain disabled. |
| Premium separation | Premium does not unlock creator purchases; creator purchases do not unlock Premium. |
| Direct-link denial | Paid Video, paid Watch-Party, Paid Event, Channel Subscription, and VIP direct links remain gated for unpaid/logged-out users. |

## Test Suites

1. Auth email reset/signup smoke.
2. Brand Studio load/edit/save/public readback.
3. Chi'lly Chat messaging and in-app call smoke.
4. Watch-Party participant rail smoke.
5. Watch-Party / LiveKit join, leave, old-room denial, reconnect smoke.
6. Premium gate smoke.
7. Tips smoke.
8. Paid Videos smoke.
9. Paid Watch-Party Seats smoke.
10. Paid Events smoke.
11. Channel Subscriptions smoke.
12. VIP Passes smoke.
13. Money Center readback smoke.
14. Direct-link denial smoke.
15. Logged-out denial smoke.
16. Blocked-user safety smoke where fixtures exist.

## Suite Details

### Auth

- Reset password email arrives.
- Reset link opens installed app.
- Password update succeeds.
- Signup confirmation email arrives.
- Confirmation link opens installed app and verifies account.
- No link routes to public legal/support accidentally.
- No tokens in logs.

### Brand Studio

- Creator can load existing brand state.
- Safe test logo/banner/color update previews and saves.
- Reload persists.
- Public profile/channel reflects update.
- Wrong user cannot edit.

### Chi'lly Chat

- Inbox loads.
- Thread opens.
- User A sends and User B receives message.
- Voice call incoming sheet, ringtone/vibration, decline, call card.
- Video call accept routes both users into existing communication room and stops ringtone.
- Background push call notification remains pending if dispatch proof is unavailable.

### Watch-Party / LiveKit

- Watch-Party Live player opens.
- Shared player controls remain stable.
- Participant rail shows `You`, second user, and scrollable overflow.
- Comments panel remains usable.
- Join/leave/reconnect smoke passes.
- Expired room fails closed.
- Paid room direct Party Room link is gated before camera/mic/membership/presence.

### Creator Money

Each creator-money flow should be smoke-tested against existing sandbox proof or a fresh sandbox purchase only when provider state is ready:

- Tips: contribution only, no unlock/perk.
- Paid Videos: paid fan plays, unpaid/direct link locked.
- Paid Watch-Party Seats: Seat Pass gate, paid room entry, direct-link denial, Party Waiting Room -> Party Room only.
- Paid Events: paid event access, unpaid denial.
- Channel Subscriptions: active/effective access, non-subscriber denial, expired access does not unlock.
- VIP Passes: VIP access, non-VIP denial.

Money Center must show sandbox/not-payable readback with no withdrawable or live payout claim.

## Proof Artifacts

Capture:

- screenshots
- screen recordings if available
- BrowserStack session id
- device model and Android version
- package, installer, versionCode
- sanitized logs
- test account labels only
- provider event ids / transaction ids when safe
- timestamps

Do not capture:

- passwords
- raw auth tokens
- provider secrets
- service-role values
- raw private provider payloads
- full card/payment details

## Setup Blockers To Document

If BrowserStack cannot run, document the exact blocker:

- account access
- Play internal install unavailability
- app not installable from Play/internal
- Google Play Billing unavailable in BrowserStack device
- missing license tester access
- device lacks required OS/image
- CAPTCHA/2FA/manual dashboard approval needed
- provider propagation delay

Do not replace BrowserStack with Expo Dev Launcher proof.

## Pass Criteria

BrowserStack final regression passes only when:

- no crash, ANR, blank screen, or stuck loading on required routes
- no unsafe money/live/payout copy appears
- no paid gate bypass occurs
- no Premium/creator-purchase mixing occurs
- no paid Watch-Party route goes to Live Stage
- no LiveKit authority changes from payment status
- auth links open the installed app correctly
- Money Center readbacks remain sandbox/not-payable
- all failures are either fixed or explicitly accepted as launch blockers
