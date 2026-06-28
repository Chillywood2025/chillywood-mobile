# Chat Call Remote Video And Live Action UX Sweep

Verdict: Partial.

This lane follows `docs/release/ACTUAL_USER_PROOF_STANDARD.md`. A fix is Closed for actual users only when Robert or a normal tester can reproduce it through the Google Play internal/closed testing app using the normal visible path.

## Primary Issue

Primary issue result: Partial.

Reported symptoms:

- Chi'lly Chat video call local video renders, but remote video does not appear.
- One device video is cut off because the two phones have different screen sizes/aspect ratios.
- Live Watch-Party participant action controls appear, but after host approval failure they do not respond usefully and stay stuck.

Available last-12-hour evidence:

| Evidence | Result |
| --- | --- |
| `/tmp/codex-remote-attachments/019efc95-a8df-7f30-aaae-e71949180bb0/9b817405-529a-40b3-956d-935948e834dd/1-Photo-1.jpg` | Reviewed. Shows host Live Stage alert `Seat update unavailable` while participant action controls remain open behind the alert. |
| `/tmp/app-*` artifact directories | Not present in this workspace during this lane. |
| Recent XML/log/image files under `/tmp`, `artifacts`, and `docs` | Only current release docs and the attached photo were available in the 12-hour filesystem window. |
| Current release docs/proof scripts | Reviewed for prior actual-user proof limitation and current Partial status. |

## Root Cause

1. Chat remote video could be hidden by stale presence state. `useCommunicationRoomSession()` provided a remote stream URL, but `CommunicationParticipantGrid` rendered `RTCView` only when `participant.cameraOn` was also true. If the media track arrived before presence/membership camera state updated, the remote tile showed avatar/waiting state even though the stream existed.
2. Android can surface audio before video. The prior track handler returned early for audio-first events unless the primary stream already had a video track. On some devices, the video receiver can become available without a second clean video track callback, leaving the remote render stream unbound.
3. A later direct Chat video-call layout lane found a separate fullscreen issue after receiver banner/thread-readback was fixed: the participant grid used guessed fixed heights, the lower tile could sit behind bottom controls, and the metadata card covered too much of the video feed.
4. Live host participant actions had no busy state and kept the action grid open on persistence failure. When `emitParticipantUpdate()` returned false, the alert appeared but the action controls stayed open behind it, matching the supplied screenshot.

## Fix Applied

- `hooks/use-communication-room-session.ts`
  - Treat a remote participant as camera-ready when a real remote stream URL exists.
  - Add delayed audio-first binding when the peer connection exposes a later video receiver.
  - Keep remote connection state connected when the delayed stream bind succeeds.
- `components/communication/communication-participant-grid.tsx`
  - Cross-lane QA correction: render remote RTC video when a real stream URL exists, even if presence `cameraOn` is stale.
  - Cross-lane QA correction: show `Video connected` from stream presence instead of showing a remote card as `Connection failed` when media is already available.
  - Later direct Chat video layout cleanup: flex fullscreen participant tiles inside the actual remaining stage, fill each tile with the RTC video view, and keep participant metadata as compact edge badges instead of a wide card across the feed.
- `components/communication/in-room-communication-panel.tsx`
  - Later direct Chat video layout cleanup: reserve Android safe-area bottom control space outside the video stage so Camera/Mic/End Call cannot cover the lower participant feed.
- `components/communication/in-room-communication-panel.tsx` and `components/communication/communication-room-header.tsx`
  - Cross-lane QA correction: change participant count copy from `connected` to `in call` / `in room` so a count does not imply every peer has a healthy media connection.
- `app/watch-party/live-stage/[partyId].tsx`
  - Cross-lane QA correction: render remote Live Stage RTC video from stream URL presence instead of requiring stale `cameraOn` presence.
- `app/watch-party/live-stage/[partyId].tsx`
  - Add a per-participant busy state for host seat/mute/remove actions.
  - Collapse host participant controls before showing failure alerts.
  - Make action buttons larger and show `Saving...` while persistence is in flight.
  - Broadcast saved mute state after successful persistence and collapse controls on success.

## Adjacent UI / UX Issues Found

| Issue | Classification | Result |
| --- | --- | --- |
| Remote video hidden while stream exists | Must fix now | Fixed in source. |
| Direct Chat video lower tile can sit under bottom controls | Must fix now | Fixed in source with safe-area control spacing and flexed fullscreen tiles; installed proof pending. |
| Participant metadata card covers too much of video feed | Must fix now | Fixed in source with compact edge metadata; installed proof pending. |
| Live participant action controls stay open behind seat failure alert | Must fix now | Fixed in source. |
| Live participant action buttons were very small and had no in-flight feedback | Should fix now if small/safe | Fixed in source. |
| Prior actual-user Chat Call manual ring/background push remains Partial | Human review | Existing Partial status preserved; this lane did not claim background ringing Closed. |
| Second physical Play-internal phone not attached during this lane (`R3CXA0DS5JV` absent from adb) | Human review | Two-phone actual-user proof remains Partial until both physical phones are online with this update active. |
| Prior `/tmp/app-*` XML/log/screenshot artifacts unavailable | Human review | Documented honestly; no missing artifact was counted as reviewed evidence. |

## Actual-User Installed-App Proof Result

Actual-user installed-app proof result: Partial.

Preflight saw one physical Play-internal v57 phone:

| Device | Status | Package | Version | versionCode | Installer |
| --- | --- | --- | --- | --- | --- |
| `R5CR120QCBF` | Attached | `com.chillywood.mobile` | `1.0.0` | `57` | `com.android.vending` |
| `R3CXA0DS5JV` | Not attached in adb during this lane | Not verified in this lane | Not verified in this lane | Not verified in this lane | Not verified in this lane |

Because the second physical Play-internal phone was not attached and this JS fix still needs delivery to the installed runtime, the affected two-phone normal user paths were not honestly Closed in this lane.

Required rerun after delivery/update uptake:

1. Chi'lly Chat video call from normal visible app path on both physical Play-internal phones.
2. Verify local and remote video render on both sides.
3. Verify fullscreen/large remote video is not cut off by bottom controls, participant metadata does not block the center of the video, and the camera feed fills the participant tile cleanly.
4. Live Watch-Party waiting-room/seat request path.
5. Verify Approve Seat, Mute, Seat Participant, and Remove either persist, show `Saving...`, collapse controls on failure, and leave the host with a clear retry path.

## Issues Left For Human Review

- Reproduce the updated Chat Call path on two physical Play-internal phones after the EAS update is active or the code ships in the next Play internal build.
- Reproduce the updated Live waiting-room seat approval path using the normal installed UI.
- Confirm whether Android background ringing/push is required for the manual Chat Call experience beyond the same-thread/app-foreground path.

## Safety Confirmation

- No physical phone sideload was used.
- No install, uninstall, reinstall, clear-data, or wipe-cache happened.
- No Play production submission happened.
- No provider mutation happened.
- No Google Play product/base-plan mutation happened.
- No RevenueCat provider configuration mutation happened.
- No Stripe mutation happened.
- No purchases were executed.
- No provider refunds were executed.
- No payouts/cashout/withdrawals/transfers happened.
- No Stripe Connect production happened.
- No payable balances were enabled.
- Current First Owner was not touched.
- `chat_threads` RLS was not weakened.
- Premium gates were not bypassed or weakened.
- No auth/account-status/chat permission bypass was added.
- liveMoneyEnabled remains OFF.
- Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF.
- No secrets/tokens/private data were committed or artifacted.
