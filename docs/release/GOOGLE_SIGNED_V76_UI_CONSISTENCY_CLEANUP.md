# Google-Signed V76 UI Consistency Cleanup

Date: 2026-07-02

Verdict: Closed for the four UI/UX consistency cleanup issues on Google Play-installed v76 plus verified runtime-compatible OTA behavior. The final two-device voice/video camera-toggle proof passed after `R3CXA0DS5JV` was recovered over ADB.

Proof artifacts:

- `/tmp/google-play-internal-v76-ui-consistency-cleanup-20260702-161301/`
- `/tmp/google-play-internal-v76-ui-consistency-cleanup-two-device-camera-proof-20260702-164050/`

## Executive Summary

This narrow cleanup fixed the four UI/UX consistency issues recorded in `docs/release/GOOGLE_SIGNED_V76_THREE_RESULT_PROOF_AND_UI_CONSISTENCY.md` without broad redesign, Money Center refactor, navigation refactor, room architecture refactor, provider mutation, live money, payouts, cashout, sideload, logout, uninstall, reinstall, or clear data.

Source fixes:

- Chat message display now decodes safe visible percent escapes such as `%20` at the display layer.
- Chat inbox previews use the same safe display normalization as thread messages.
- Settings account header prefers display name/handle and masks email fallback instead of exposing a full private email as the primary account identifier.
- Premium sandbox copy on Live/Platform Premium surfaces and Manage Premium is shorter and easier to scan while preserving sandbox-only and no-money safety meaning.
- Direct call camera labels distinguish `Camera Off`, `Camera Connecting`, and `Camera On` / renderable-video states.

## Repo / Origin Alignment

Start state:

- Baseline expected: `3c8795a55e114245fb96a94b871e0e48f008d25a` or newer.
- Source fix commits pushed during this pass:
  - `248dae434e922c556abfcac923d69876f87db19b` - base UI consistency cleanup.
  - `90f2f714a6367954ba465c8b38459b67174fdb08` - Premium sandbox copy hierarchy on Manage Premium.
  - `9558545bc29ba6df8e636098ca6da616fda646df` - Chat inbox preview decoding.
  - `83e93150937a633e8c844fbf4962ebe70b407cf9` - voice calls no longer infer video labels from non-video media streams.

Tracked source tree was clean before proof except pre-existing untracked local artifact/temp folders.

## Device Binary / OTA Proof

Installed proof used Google Play-installed v76 on both proof phones:

- Package: `com.chillywood.mobile`.
- Installer: `com.android.vending`.
- versionCode: `76`.
- versionName: `1.0.0`.
- Runtime: `1.0.0`.

`R5CR120QCBF` and `R3CXA0DS5JV` were both visible/authorized for the final camera proof. Both retained Google Play installer `com.android.vending`; no sideload, `adb install`, logout, uninstall, reinstall, or clear data happened.

Cleanup OTA published to production Android runtime `1.0.0`:

- Group: `bfc909ca-3956-4085-bd78-d4a003dbbbfe`.
- Android update: `019f24bf-0dc8-7885-af09-45001b67bb50`.
- Commit: `9558545bc29ba6df8e636098ca6da616fda646df`.

Follow-up media-label OTA published to production Android runtime `1.0.0`:

- Group: `f361c068-40b9-460f-99eb-70ba0ec6ff73`.
- Android update: `019f24ce-6808-7cd9-87d3-8e3ebd1bde05`.
- Commit: `83e93150937a633e8c844fbf4962ebe70b407cf9`.

Earlier intermediate OTA groups in the first cleanup pass were superseded by the cleanup OTA above. The media-label OTA is the final OTA used for the two-device voice/video proof.

No Play build, Play production submission, sideload, `adb install`, logout, uninstall, reinstall, clear data, provider mutation, live money, payout, cashout, auth/RLS weakening, or secret exposure happened.

## Chi'lly Chat URL-Encoding Result

Closed on source and proved on R5 installed v76 plus OTA.

Proof:

- Existing inbox preview that previously showed `v64%20reappear%20proof` now renders as `v64 reappear proof`.
- Opening the same direct thread shows the message body as `v64 reappear proof`.
- The fix is display-layer only and does not mutate stored message/database content.
- Malformed percent text is guarded by try/catch and does not throw.

Artifact examples:

- `chilly-chat-decoded-text/R5-chat-inbox-after-inbox-ota.xml`.
- `chilly-chat-decoded-text/R5-chat-thread-after-precise-tap.xml`.

## Settings Account Header Privacy Result

Closed on source and proved on R5 installed v76 plus OTA.

Settings now shows the signed-in identity as a safe display identity. In this proof the header showed the handle rather than a raw private email. If email is the only available identity, the display helper masks it instead of exposing the full address.

Artifact examples:

- `settings-header/R5-settings-after-final-ota.xml`.
- `settings-header/R5-settings-after-final-ota.png`.

## Premium / Platform Studio Copy Hierarchy Result

Closed on source and proved on R5 installed v76 plus OTA for Manage Premium.

Premium sandbox copy now separates:

- Short mode label: `SANDBOX TEST MODE`.
- Primary message: `Premium sandbox test path`.
- Sandbox-only summary: `Google Play / RevenueCat sandbox only.`
- Safety detail: `No production money, payout, cash-out, withdrawal, transfer, or payable balance is enabled.`
- Sandbox-dashboard detail: `Test purchases may appear only in Google Play and RevenueCat sandbox dashboards.`

The no-money safety meaning remains present. No Premium/creator-money confusion, live-money implication, payout/cashout implication, provider mutation, or purchase claim was added.

Artifact examples:

- `premium-copy/R5-subscribe-after-final-ota.xml`.
- `premium-copy/R5-subscribe-after-final-ota.png`.

## Voice Call Label Result

Closed on source and installed two-device proof.

The final source derives call tile labels from call type plus renderable media state:

- Audio-only calls should not show `Video connected`.
- Camera state is not implied active unless a renderable video stream exists.
- Self-camera labels now account for requested local camera state to avoid stale or misleading self-tile copy.
- Voice calls never infer `Video connected`, `Cam On`, or `Camera Connecting` from an underlying non-video media stream.

Installed proof:

- `R5CR120QCBF` and `R3CXA0DS5JV` opened the same direct thread through the visible Chat inbox.
- R5 started a voice call and R3 accepted through the real incoming call UI.
- Both phones reached `Voice call active`, `2 in call`, and `Connected`.
- Neither XML dump contained `Video connected`, `Cam On`, `Camera Connecting`, or `Connection failed`.
- R5 ended the voice call and both phones returned to `No Active Call`.

Artifact examples:

- `voice-call/R5CR120QCBF-voice-connected-after-final-ota-late.xml`.
- `voice-call/R3CXA0DS5JV-voice-connected-after-final-ota-late.xml`.
- `voice-call/R5CR120QCBF-after-voice-end.xml`.
- `voice-call/R3CXA0DS5JV-after-voice-end.xml`.

## Video Camera Toggle Result

Closed on source and installed two-device proof.

The UI now distinguishes:

- `Camera Off`.
- `Camera Connecting`.
- `Camera On` / video connected only when a renderable video track exists.

This did not rewrite WebRTC, LiveKit, room architecture, or call setup.

Installed proof:

- R5 started a video call and R3 accepted through the real incoming video call UI.
- Both phones reached `Video call active`, `2 in call`, `Connected`, `You · live video`, `Video connected`, and `Cam On`.
- Both phones showed local and remote camera video in the installed UI.
- R5 toggled Camera Off and back On during the active video call.
- After the toggle recovered, both phones again showed `Video connected`, `Cam On`, no `Camera Connecting`, and no `Connection failed`.
- R5 ended the video call and both phones returned to `No Active Call`.

Artifact examples:

- `video-call/R5CR120QCBF-after-r5-camera-on-toggle.png`.
- `video-call/R3CXA0DS5JV-after-r5-camera-on-toggle.png`.
- `video-call/R5CR120QCBF-after-r5-camera-on-toggle.xml`.
- `video-call/R3CXA0DS5JV-after-r5-camera-on-toggle.xml`.
- `video-call/R5CR120QCBF-after-video-end.xml`.
- `video-call/R3CXA0DS5JV-after-video-end.xml`.

## Safety Confirmation

No Money Center refactor, navigation refactor, room architecture refactor, provider setup change, Play production submission, sideload, `adb install`, logout, uninstall, reinstall, clear data, auth/RLS weakening, provider mutation, live money, payout, cashout, payable balance, or secret/private identifier exposure happened.

`liveMoneyEnabled` remains OFF.

## Validation Results

Validation passed. Logs are stored under:

- `/tmp/google-play-internal-v76-ui-consistency-cleanup-20260702-161301/validation/`
- `/tmp/google-play-internal-v76-ui-consistency-cleanup-two-device-camera-proof-20260702-164050/validation/full-validation-after-voice-label-fix.log`

Passed commands:

- `npm run proof:notification-center-money-activity`
- `npm run proof:important-notification-accessibility`
- `npm run proof:notification-icon-surface-wiring`
- `npm run proof:room-safe-notification-and-call-behavior`
- `npm run proof:creator-money-notification-routing`
- `npm run proof:creator-monetization-route-button-wiring`
- `npm run guard:notification-action-retention-policy`
- `npm run guard:notification-money-policy`
- `npm run guard:notification-room-call-policy`
- `npm run guard:chat-call-moderation-notification-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:money-center-policy`
- `npm run guard:brand-spelling-policy`
- `npm run guard:route-contracts --if-present`
- `npm run typecheck`
- `npm run validate:runtime`
- `supabase db push --dry-run`
- `git diff --check`
- `git diff --cached --check`

## Issues Fixed

- Chat thread visible percent-encoded message text.
- Chat inbox preview visible percent-encoded message text.
- Settings primary account header raw-email exposure risk.
- Premium sandbox copy hierarchy while preserving required money safety.
- Camera/call label clarity and installed two-device proof.

## Issues Still Open

- iOS/tablet/foldable proof is not part of this lane.
