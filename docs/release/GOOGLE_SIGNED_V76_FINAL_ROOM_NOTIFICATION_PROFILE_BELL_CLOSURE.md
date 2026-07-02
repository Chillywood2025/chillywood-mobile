# Google-Signed V76 Final Room Notification Profile Bell Closure

Date: 2026-07-02

Latest combined follow-up: the remaining full six-row creator transaction notification matrix is now Closed in `docs/release/GOOGLE_SIGNED_V76_THREE_RESULT_PROOF_AND_UI_CONSISTENCY.md`. Artifact folder: `/tmp/google-play-internal-v76-three-result-proof-and-ui-consistency-20260702-103354/`. All six sandbox/proof/not-payable creator rows were visible/tapped on the Google Play-installed v76 app and routed to Platform Studio Money Center Transactions with no Premium gate and no Not Found. These rows are UI/routing proof only, not purchase-generation proof, access grants, payout/cashout/payable-balance proof, provider mutation, or live-money proof.

Original verdict for this doc: Partial at the time of capture. Google-signed v76 plus verified OTA closed the Profile bell alignment, Waiting Room tray, Live Stage tray shell, Reply in Chat, Leave room and answer, and stale Android call notification cleanup after Decline. The later combined follow-up above closed the previously missing six-row creator notification matrix.

## Executive Summary

Both physical phones remained Google Play-installed v76 from `com.android.vending`. No sideload, `adb install`, logout, uninstall, reinstall, clear data, Play production submission, provider mutation, live money, payout, cashout, auth/RLS weakening, or First Owner mutation happened.

Source commit `e7681efc01fa6d85399079e92eccc0e3c452445c` was published by EAS Update to production runtime `1.0.0`: group `827b6eed-02fd-43be-8b38-f561392ea9e2`, Android update `019f2331-8f3b-7d34-8abb-a665efbdc95d`. The update adds the explicit Android presented-notification sweep fallback used only after call actions.

Proof artifacts:

- `/tmp/google-play-internal-v76-final-room-notification-profile-bell-closure-20260702-071900/`

## Device Binary / OTA Proof

- `R5CR120QCBF`: package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `76`, versionName `1.0.0`.
- `R3CXA0DS5JV`: package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `76`, versionName `1.0.0`.
- OTA summary: `ota-proof/e7681ef-ota-summary.txt`.
- Sanitized OTA logs: `ota-proof/R5CR120QCBF-after-e7681ef-ota-second-logcat-sanitized.txt`, `ota-proof/R3CXA0DS5JV-after-e7681ef-ota-second-logcat-sanitized.txt`.

## Results

- Profile bell alignment: Closed. Profile bell is top-right aligned like Studio, icon-only, badge uses real unread count, and tapping opens the tray.
- Studio bell non-regression: Closed. Studio bell stayed top-right and icon-only.
- Creator transaction route: Partial. Visible creator rows `Tip received` and `Event Pass sold` opened Platform Studio Money Center Transactions with no Premium gate after Google Play sandbox Premium. Other creator row types were not visible in this installed no-logout session, so the full six-row creator matrix is not claimed Closed.
- Waiting Room tray: Closed. Room-safe tray opened and closed without leaving Waiting Room.
- Live Stage / Live Room tray: Closed for reachable tray shell behavior. Tray opened/closed without leaving Live Stage; active camera/mic side-effect assertions remain limited because the Live Stage media provider showed unavailable in this installed proof.
- Reply in Chat: Closed. Receiver was inside a room-safe surface, tapped Reply in Chat, opened Chi'lly Chat, did not auto-answer, and did not start mic/camera without consent.
- Leave room and answer: Closed. Receiver explicitly confirmed leave-room-and-answer; call opened only after explicit action and did not auto-answer beforehand.
- Stale call notification cleanup after Decline: Closed. R5 received an incoming call while inside Party Room, tapped Decline, stayed in Party Room, R3 returned to `No Active Call`, and Android notification readback stayed `incoming_call_notifications=0`, `missed_call_notifications=0`.

Key cleanup artifacts:

- `decline-cleanup/R5-party-room-incoming-e7681ef-final-call.png`
- `decline-cleanup/R5-after-decline-e7681ef-final-party-room.png`
- `decline-cleanup/R3-after-decline-e7681ef-final-party-room.png`
- `decline-cleanup/R5-notification-count-before-e7681ef-final-party-room.txt`
- `decline-cleanup/R5-notification-count-after-decline-e7681ef-final-party-room.txt`

## Safety Confirmation

The Premium step was Google Play sandbox only through Manage Premium -> Start Sandbox Premium Test -> Subscribe. It did not activate live money, payouts, cashout, payable balances, provider production settings, or creator-money settlement.

`liveMoneyEnabled` remains OFF. No service-role purchase-generation proof was counted. Seeded/sandbox notification rows remain UI/routing proof only. No raw Expo tokens, auth tokens, emails, user ids, provider ids, service keys, signed URLs, or credentials are included in committed docs.

## Validation

Passed:

- `npm run proof:notification-center-money-activity`
- `npm run proof:important-notification-accessibility`
- `npm run proof:creator-money-notification-routing`
- `npm run proof:notification-icon-surface-wiring`
- `npm run proof:room-safe-notification-and-call-behavior`
- `npm run guard:notification-action-retention-policy`
- `npm run guard:notification-money-policy`
- `npm run guard:notification-room-call-policy`
- `npm run guard:chat-call-moderation-notification-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:money-center-policy`
- `npm run guard:route-contracts --if-present`
- `npm run guard:brand-spelling-policy`
- `npm run typecheck`
- `npm run validate:runtime`
- `supabase db push --dry-run`
- `git diff --check`
- `git diff --cached --check`

Validation logs are under `validation/` in the proof artifact folder.
