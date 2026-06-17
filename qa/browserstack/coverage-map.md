# BrowserStack Whole-App Coverage Map

Status: prepared, not run.

BrowserStack final regression is a runtime proof pass on Play/internal for the active Android lane. It does not replace the existing local/manual sandbox proof docs and must not claim live money.

Platform lanes:

| Platform | Status | Runtime rule | Notes |
| --- | --- | --- | --- |
| Android | Active proof lane | Google Play internal install; package `com.chillywood.mobile`; installer `com.android.vending`; not Expo Dev Launcher | Use for final public-v1 regression when approved. |
| iOS | Planned/deferred placeholder | No iOS build, signing, App Store Connect, App Store IAP, or RevenueCat Apple proof exists in this lane | Do not run until Android final regression is closed and user explicitly approves iOS. |

| Area | Coverage target | Flow contract | Device/session need | Purchase need | Local preflight |
| --- | --- | --- | --- | --- | --- |
| Runtime/install | Play internal install, package, installer, versionCode, app launch | `00-runtime-install.contract.md` | 1 device | No | `npm run validate:runtime` |
| Auth | login, logout, signup, reset, expired link handling, no token logging | `01-auth.contract.md` | 1 device plus disposable inbox | No | installed-app proof already passed; rerun on BrowserStack only when approved |
| Home/Explore/Library | Home, Explore search/typeahead, Library, honest empty/saved states | `02-home-explore-library.contract.md` | 1 device | No | local nav smoke |
| Profile/Platform | own/public profile, creator Platform, viewer state, wrong-user denial | `03-profile-platform.contract.md` | 1 device with account switching or 2 sessions | No | Brand public viewer proof passed |
| Platform Studio/Brand Studio | creator gate, non-Premium gate, Brand save/reload/public readback | `04-brand-studio.contract.md` | 1 device with account switching or 2 sessions | No | v53 Brand proof passed |
| Chi'lly Chat | inbox/thread, A->B message, voice decline, video accept/end | `05-chilly-chat.contract.md` | 2 devices/sessions | No | deferred until second session |
| Watch-Party Live | Player/Title content-first entry, room code, Party Waiting Room/Room, rail/comments/controls | `06-watch-party-live.contract.md` | 2 devices/sessions | Optional existing paid room denial smoke | deferred until second session |
| Live Watch-Party/Live Stage | Live tab entry, Live Waiting Room -> Live Stage, Back behavior, route separation | `07-live-watch-party.contract.md` | 1-2 devices/sessions | No | route guard |
| Player/Paid Video | normal playback, locked unpaid, Unlock Video, paid fan access if fixture works | `08-player-paid-video.contract.md` | 1 device with account switching | Optional if rerunning purchase | sandbox proof docs |
| Money Center | six-flow readback, sandbox/not_payable, no payout/live claim | `09-money-center.contract.md` | 1 creator session | No | v53 Money Center proof passed |
| Premium | Premium gate, Premium/creator purchase separation | `10-premium.contract.md` | 1 device with premium/nonpremium accounts | Optional Premium smoke only if approved | route/payment guards |
| Settings/Legal/App Access | Settings, Privacy/Terms/Support, account deletion, Data Safety references | `11-settings-legal.contract.md` | 1 device | No | local settings smoke |
| Direct-link denial | paid video, paid room, paid event, subscription, VIP, logged-out/wrong-user denial | `12-direct-link-denials.contract.md` | 1 device with account switching | No | proof docs + route guard |
| Admin/Owner | admin route gate, owner/admin controls hidden from normal users | `13-admin-owner.contract.md` | 1 normal user and owner/admin if approved | No | owner/admin audit |
| Final smoke | crash/ANR/loading, route sanity, artifact completion | `14-final-smoke.contract.md` | all chosen devices | No | all guards |

## Current Launch Blockers

- BrowserStack has not run.
- Chi'lly Chat two-user call proof still needs a second device/session or BrowserStack approval.
- Watch-Party/LiveKit two-user proof still needs a second device/session or BrowserStack approval.
- Live Watch-Party / Live Stage route smoke still needs final runtime regression.
- Provider refund/revoke/lifecycle gaps remain deferred by provider tooling/order identifiers.
- Live money and payouts remain disabled.
- Google Play external launch governance remains separate from BrowserStack prep.
- iOS BrowserStack remains a future placeholder and requires future Apple signing, App Store Connect, App Store IAP, and RevenueCat Apple product proof.

Sandbox Money Tester Experience is no longer a launch-blocking fixture gap: all six Android sandbox tester flows are Play-installed proved. BrowserStack should treat money as regression/readback, not first proof.

## Future iOS Placeholder Device Ideas

Do not run these yet. They are placeholders for a later approved iOS lane:

- current iPhone standard screen
- small iPhone screen
- larger iPhone Pro/Max class
- current iPad class, optional

## Safe Deferred Provider-Tooling Gaps

- Paid Videos refund/revoke.
- Paid Watch-Party refund/revoke and visual Money Center screenshot follow-up.
- Paid Events refund/revoke and capacity UI proof.
- Channel Subscription fresh signed lifecycle webhook delivery.
- VIP refund/revoke.
- Tips live payout/reversal operations.
