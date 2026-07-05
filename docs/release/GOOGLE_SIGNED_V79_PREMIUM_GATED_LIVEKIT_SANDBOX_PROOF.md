# Google-Signed v79 Premium-Gated LiveKit Sandbox Proof

Date: 2026-07-05

Verdict: Partial.

Artifact folder: `/tmp/google-play-internal-v79-premium-gated-livekit-sandbox-proof-20260705-142126/`.

## Executive Summary

This lane fixed the app-controlled Premium gate problem that blocked current Watch-Party Live / Live Stage proof. Non-Premium users on Premium-required Watch-Party / Live Stage paths no longer get a contradictory `Open Party Room` primary action or a `Premium access is not currently available` dead end. Premium-required gates now route through `View Premium` to `/subscribe`, while Premium-active users can proceed to the gated room actions.

Both Google Play-installed v79 proof phones completed the approved Google Play / RevenueCat sandbox Premium test flow and read back active Premium in app. After that, current Watch-Party Party Room smoke passed with R5 hosting and R3 joining.

The lane remains Partial because current Watch-Party Live sidecar and Live Stage smoke still did not fully close after Premium became active. The remaining blockers are no longer Premium purchase/readback blockers: the sidecar showed a safe LiveKit feed unavailable alert, and Live Stage waiting-room entry did not reach Stage / `2 in room` during the current proof.

Follow-up real Home-route sidecar proof is recorded in `docs/release/GOOGLE_SIGNED_V79_REAL_HOME_DEMO_VIDEO_WATCH_PARTY_SIDECAR_PROOF.md`. It confirms Premium remains Closed and R5/R3 can both reach the same Party Room from the installed Home rail path, but it does not close sidecar playback: the visible Home player was still titled `Chi'llywood Originals Proof Fixture`, and `Open Shared Player` still showed `Live feed unavailable` / `Live video is temporarily unavailable. Try again in a moment.` before R3 saw actual playback.

## Repo / Origin Alignment

- Start baseline: `HEAD == origin/main == 2def0f202de7ce85c41a005598c8485a89838bfb`.
- Source commit: `aa6d01366b400680a2da692f3164c1862ae6c16c`.
- Pre-existing untracked artifact/temp files were left untouched.

## Root Cause

Two app-controlled Premium gate issues caused the bad installed states:

- Shared Premium access sheets could treat Premium-required flows as deferred monetization and show `Premium access is not currently available` with only `Got it`, even for approved sandbox testers.
- Live Stage blocked access could use room-entry labels such as `Open Party Room` while the user was still Premium-gated.

These were route/copy/state bugs, not a need to bypass Premium or manually grant entitlement.

## Source Changes

- `components/monetization/access-sheet.tsx`: Premium-required sheets bypass deferred-unavailable dead-end mode, show clean Premium-required copy, and use `View Premium` to open `/subscribe`.
- `app/watch-party/[partyId].tsx`: Premium-required Watch-Party gates label the action `View Premium`.
- `app/watch-party/live-stage/[partyId].tsx`: Premium blockers use Premium-specific actions and show the access sheet instead of replacing to a Party Room route.
- `scripts/guard-premium-sandbox-policy.mjs`: guard coverage now fails if Premium gates regress to unavailable dead ends, hidden sandbox path, or purchase-ready room CTAs while locked.

No payment/provider entitlement logic, Google Play / RevenueCat product setup, Premium checks, Money Center behavior, creator-money flow, auth/RLS, native call code, LiveKit server code, or WebRTC/media setup changed.

## OTA

- Branch: `production`
- Runtime: `1.0.0`
- Group: `743a7dd8-7233-4fac-b56e-4764f88c160b`
- Android update: `019f33bf-42d3-7bcd-84bc-8fed01845ab1`
- Commit: `aa6d01366b400680a2da692f3164c1862ae6c16c`
- Message: `Fix Premium gated LiveKit access CTAs`

Direct Expo update database readback was not required for closure. Installed proof used visible behavior introduced by the OTA on Google Play-installed v79.

## Device Proof

Both physical devices were visible and read back:

| Device | Package | Installer | versionCode | versionName |
| --- | --- | --- | --- | --- |
| `R5CR120QCBF` | `com.chillywood.mobile` | `com.android.vending` | `79` | `1.0.0` |
| `R3CXA0DS5JV` | `com.chillywood.mobile` | `com.android.vending` | `79` | `1.0.0` |

No sideload, `adb install`, logout, clear data, uninstall, or reinstall happened.

## Premium Gate CTA Result

Source and guard coverage now require Premium-required non-Premium states to use `View Premium` / `/subscribe`, not `Open Party Room`. The old dead-end `Premium access is not currently available` mode is bounded away from Premium-required sheets.

## Sandbox Premium Flow Result

Both proof devices opened `/subscribe` and showed:

- `Premium`
- `Premium is not active.`
- compact `Sandbox test mode -- no real money is charged.`
- primary `Start Sandbox Premium Test`
- secondary `Not now`
- footer `Already subscribed? Restore`

Both devices then opened the Google Play sandbox subscription sheet for `Chi'llywood Premium`, showing the Google Play test-card/no-real-charge sandbox language. After tapping Subscribe, both devices read back `Premium is active.` in the app.

This is sandbox Premium proof only. It is not live money and not creator-money purchase-generation proof.

## Premium Active Retry Result

After Premium active readback, the Watch-Party path no longer stopped at Premium required. R5 created a Party Room from a local title flow and R3 joined the same room.

## Watch-Party Party Room Smoke Result

Closed for current v79 smoke.

- R5 opened local title `Chicago Streets`, tapped `Watch-Party Live`, created a Party Room, and reached room `VLLM58`.
- R3 entered room code `VLLM58`, found the room, tapped `Join Now`, and reached the same Party Room.
- Both devices showed Party Room UI with title context, room code, room actions, and shared-player entry.
- No Not Found, Premium gate, or stuck loading blocked Party Room smoke after Premium active readback.

## Watch-Party Live Sidecar Smoke Result

Partial.

After Premium active readback and Party Room entry, R5 tapped `Open Shared Player`. The app showed the safe alert:

`Live feed unavailable`

`Live video is temporarily unavailable. Try again in a moment.`

This proves the current blocker is no longer Premium routing or sandbox purchase availability. It points to the current Watch-Party Live sidecar LiveKit join-contract/token readiness path needing a narrow follow-up proof/fix. No LiveKit tokens or secrets were printed.

## Live Stage Smoke Result

Partial.

Premium sandbox purchase/readback was proved before Live Stage smoke. Fresh Live Waiting Room surfaces loaded. R5 created room `4D9DSZ`, and R3 found that room and displayed a Live Room preview with `Join Now`. The current automated proof did not get the host `Create Live Room` or viewer `Join Now` actions into Live Stage / `2 in room`.

This is no longer a Premium access blocker. It remains a strict current-v79 normal-path Live Stage entry smoke gap.

## Proof History Reconciliation Result

The prior reconciliation remains correct with one supersession: current Premium sandbox purchase/readback is now proved. Status separation is:

- Watch-Party Party Room installed UI/realtime/playback readback: Closed for scoped proof; current v79 Party Room smoke also passed.
- LiveKit 25-participant RTC-node media diagnostic and publish-authority downgrade: Closed diagnostic support, not installed UI proof.
- Chi'lly Chat calls: separate RTC stack; v79 Android call behavior is Closed in call-specific docs.
- Watch-Party Live sidecar: source/diagnostic supported, current installed smoke Partial after safe Live feed unavailable alert.
- Live Stage: diagnostic/media support and older screenshot-backed evidence exist, but strict current-v79 actual-user entry smoke remains Partial.

## Safety Confirmation

No Premium bypass, manual entitlement mutation, service-role grant, live money, payout, cashout, payable balance, provider production mutation, creator-money product activation, Play production submission, sideload, `adb install`, logout, clear data, uninstall/reinstall, native call change, Money Center refactor, auth/RLS weakening, LiveKit server restart, token printing, TURN credential exposure, signed URL exposure, or secret exposure happened.

## Validation

Source validation before OTA passed:

- `npm run guard:premium-sandbox-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `npm run proof:premium-first-activation` (safe checks passed; known annual Google Play base-plan blocker remains separate)
- `npm run proof:live-stage-seat-approval`
- `npm run proof:watch-party-seat-request`
- `npx tsc --noEmit`
- `npm run validate:runtime`
- `npm run guard:route-contracts --if-present`
- `npm run guard:brand-spelling-policy`
- `npm run guard:payment-rail-policy`
- `git diff --check`
- `git diff --cached --check`

## Issues Fixed

- Premium-required gates no longer use a dead-end Premium unavailable sheet for approved sandbox testers.
- Non-Premium Premium-required LiveKit/Watch-Party surfaces no longer present `Open Party Room` as the locked primary action.
- Approved sandbox tester path to `/subscribe` and Google Play / RevenueCat sandbox Premium purchase/readback is proved on both devices.
- Premium-active retry into Watch-Party Party Room is proved.

## Issues Still Open

- Watch-Party Live sidecar current smoke: latest installed Home-route retest still shows safe Live feed unavailable copy after Premium active; R3 did not see actual playback, and the visible Home media is still titled as a proof fixture.
- Live Stage strict current-v79 entry smoke: Live Waiting Room loads and room discovery works, but current proof did not reach Stage / `2 in room`.
- Public production LiveKit readiness still needs current sidecar/Live Stage smoke plus load/reconnect/cellular/TURN/metrics hardening.

## Artifacts

`/tmp/google-play-internal-v79-premium-gated-livekit-sandbox-proof-20260705-142126/`
