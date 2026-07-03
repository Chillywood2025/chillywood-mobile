# Google-Signed V76 Incoming Call Surface Behavior Proof

Date: 2026-07-03

Verdict: Partial.

Proof artifact folder:

- `/tmp/google-play-internal-v76-incoming-call-surface-behavior-20260703-005357/`

## Executive Summary

Robert's screenshots showed the wrong receiver behavior for Chi'lly Chat calls:

- Same-thread receivers could see both the full incoming-call sheet and the app-wide top banner.
- Normal in-app surfaces outside the thread showed only the compact top banner.
- Background Android notifications used the call channel, but the real ring/vibrate result can still be affected by Android permission, DND, channel settings, OEM behavior, and native full-screen/call-style limits.

Source commit `37b4c12cbe0b95702849ecba1e8a7149af4b334a` fixes the in-app surface split. Same-thread calls are owned by the full chat-thread incoming-call sheet. Normal non-room app surfaces now render a full app-wide incoming-call modal with Answer, Decline, and Reply in Chat. Room-safe surfaces keep the compact room-safe banner with Decline, Reply in Chat, and Leave room and answer.

The JS-only fix was published by EAS Update to Google Play-installed v76 on runtime `1.0.0`. Both proof phones remain Google Play-installed from `com.android.vending`. Device logs show the update was offered/downloaded before two safe app restarts and then reported no further update available. The Android call channel is configured as high-importance with the `chilly_ring` sound and vibration enabled.

This remains Partial because the full same-thread, normal outside-thread, room-safe, and background answer/decline matrix was not physically rerun after the OTA on both phones. `R3CXA0DS5JV` was visible over ADB but was on the lock screen during the final capture window, so the foreground two-phone receiver UI flow was not completed. Source fixed is not installed-app user-flow proof.

## Root Cause

`IncomingCallNotificationBridge` in `app/_layout.tsx` used the compact app-wide top banner for every non-room app-wide incoming call. It also did not suppress itself when the receiver was already on the same chat route, so same-thread receivers could see duplicate incoming-call UI: the correct chat-thread modal plus the app-wide banner.

The Android background push path already targeted the Chi'lly Chat call channel, but phone-call-like lock-screen/full-screen behavior is not guaranteed from an Expo JS-only update. Android channel/user/DND settings and native full-screen intent/call-style support control how aggressive the final notification presentation can be.

## Source Fix Summary

Files changed:

- `app/_layout.tsx`
- `scripts/proof-room-safe-notification-and-call-behavior.mjs`
- `scripts/guard-notification-room-call-policy.mjs`
- `scripts/proof-chilly-chat-end-to-end-call-initiation.mjs`
- `scripts/guard-chilly-chat-end-to-end-call-initiation-policy.mjs`
- `scripts/guard-chilly-chat-google-play-internal-call-policy.mjs`
- `scripts/guard-chilly-chat-play-v58-actual-user-call-policy.mjs`

Behavior added:

- Same-thread app-wide bridge returns `null`, so the thread's full incoming-call sheet owns same-thread ringing.
- Normal non-room surfaces render `app-wide-incoming-call-modal` with full Answer / Decline / Reply in Chat actions.
- Room-safe routes still render `room-safe-incoming-call-banner`.
- Ring/vibration startup and cleanup remain routed through the existing incoming-call bridge lifecycle.
- Guards now fail if normal app surfaces only use the compact banner or if room-safe surfaces lose the compact banner.

## Device Binary / OTA Proof

Both devices were attached and authorized:

- `R5CR120QCBF`
- `R3CXA0DS5JV`

Both devices read back:

- package: `com.chillywood.mobile`
- `installerPackageName=com.android.vending`
- versionCode `76`
- versionName `1.0.0`

OTA:

- EAS Update group: `cb225e0f-37f7-40b3-a93e-127bfd64d97e`
- Android update: `019f268e-c117-7e3a-8aff-7e177037e1ac`
- runtimeVersion: `1.0.0`
- source commit: `37b4c12cbe0b95702849ecba1e8a7149af4b334a`

R3 and R5 logs showed the update available/download path for this group/update. After two safe app restarts on both phones, both devices reported `CheckCompleteUnavailable` / `No update available`, which is consistent with no newer OTA being offered after the update cycle. This is OTA uptake evidence, not a substitute for actual two-phone call-flow proof.

No Play build, Play production submission, sideload, `adb install`, logout, uninstall, reinstall, or clear data happened.

## Same-Thread Incoming Call Result

Source fixed, installed user-flow proof pending.

Expected behavior after the fix:

- Receiver already in the same Chi'lly Chat thread gets the full incoming-call sheet/card.
- The app-wide top banner is suppressed for that same chat route.
- Ring/vibration remains active.
- Accept and Decline remain on the full call sheet.
- Duplicate stacked call UI should not appear.

This was not physically rerun after the OTA, so it remains Partial for installed proof.

## Normal In-App Outside-Thread Incoming Call Result

Source fixed, installed user-flow proof pending.

Expected behavior after the fix on Home, Explore, Saved, Settings, Profile, Platform/Channel, and other non-room surfaces:

- Receiver gets the full app-wide incoming-call modal, not only the compact top banner.
- The modal shows Answer, Decline, and secondary Reply in Chat.
- Answer opens/joins the call.
- Decline stops sound/vibration and clears stale active incoming-call state.
- Reply in Chat opens the chat without auto-answering.

This was not physically rerun after the OTA, so it remains Partial for installed proof.

## Room-Safe Incoming Call Result

Source preserved, installed regression proof pending for this OTA.

Room-safe surfaces keep the compact top banner:

- Watch-Party Live
- Party Room
- Live Stage
- Live Room
- active media room surfaces

The compact banner keeps Decline, Reply in Chat, and Leave room and answer. It must not cover the full room or disconnect/mute/camera-toggle unless the user explicitly chooses Leave room and answer. This lane did not rerun the physical room-safe matrix after the OTA, so it remains Pending for this specific update.

## Background / Outside-App Notification Result

Partial.

Device notification readbacks show `chilly_chat_calls_v2` is configured as the Chi'lly Chat calls channel with high/max importance, `chilly_ring` sound, and vibration enabled. Captured R3 notification records also showed incoming Chi'lly Chat call payloads using `notificationChannelId="chilly_chat_calls_v2"` and open-call routing data.

What remains unproved:

- Whether the device audibly rang during the final post-OTA background test.
- Whether it vibrated during the final post-OTA background test.
- Whether tapping a fresh background notification after this exact OTA opens the answerable incoming-call UI.

Android caveats:

- DND can suppress sound/vibration.
- User-modified notification channel settings can suppress sound/vibration.
- OEM battery/notification restrictions can reduce presentation.
- Phone-call-like full-screen/lock-screen takeover may require native Android full-screen intent/call-style notification work and cannot be truthfully claimed from this JS-only OTA.

## Validation Results

Passed before commit:

- `npm run proof:room-safe-notification-and-call-behavior`
- `npm run guard:notification-room-call-policy`
- `npm run guard:chat-call-moderation-notification-policy`
- `npm run proof:notification-icon-surface-wiring`
- `npm run proof:important-notification-accessibility`
- `npm run guard:notification-action-retention-policy`
- `npm run proof:chilly-chat-end-to-end-call-initiation`
- `npm run guard:chilly-chat-end-to-end-call-initiation-policy`
- `npm run guard:chilly-chat-google-play-internal-call-policy`
- `npm run guard:chilly-chat-play-v58-actual-user-call-policy`
- `npm run typecheck`
- `npm run validate:runtime`
- `supabase db push --dry-run`
- `git diff --check`
- `git diff --cached --check`

Validation logs are under:

- `/tmp/google-play-internal-v76-incoming-call-surface-behavior-20260703-005357/validation/`

## Remaining Open Items

- Physically rerun same-thread incoming voice/video call on Google Play-installed v76 plus the fixed OTA.
- Physically rerun normal in-app outside-thread incoming voice/video call on Home, Settings/Profile, and Platform/Channel.
- Physically rerun room-safe incoming call on Party Room / Watch-Party Live and Live Stage.
- Physically rerun background notification tap-to-answer/decline proof.
- Classify any Android DND/channel/native full-screen limitation separately from app source behavior.

## Safety Confirmation

No Money Center change, provider mutation, Play production submission, sideload, `adb install`, logout, uninstall, reinstall, clear data, live money, payout, cashout, auth/RLS weakening, First Owner change, service-role chat proof, fake call proof, or private identifier exposure happened. `liveMoneyEnabled` remains OFF.
