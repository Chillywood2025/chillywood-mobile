# Final Production Readiness Checklist

## OTA-First Proof Rule

For JavaScript-only UI, routing, copy, or helper fixes, prefer EAS Update / OTA proof before creating a new Google Play internal build.

OTA proof is valid only when the installed app is Google-signed from Google Play and the proof report records package `com.chillywood.mobile`, `installerPackageName=com.android.vending`, installed binary `versionCode` / `versionName`, loaded EAS Update id/group, update commit hash, runtimeVersion compatibility, and UI proof executed after the update loaded.

Do not use OTA proof for native changes, runtimeVersion changes, Play Billing / RevenueCat native behavior, Android permission/manifest/plugin changes, push channel/native notification changes, or final binary closure.

Final reports must separate Play binary proof, OTA update proof, source proof, and native/build proof.

## Google-Signed V77 Native Chi'lly Chat CallStyle / Full-Screen

Status: Blocked / active background CallStyle proof blocked by unavailable R3 ADB visibility. The missing FCM server credential blocker is cleared.

Doc: `docs/release/GOOGLE_SIGNED_V77_NATIVE_CALLSTYLE_FULLSCREEN_PROOF.md`. Artifact folders: `/tmp/google-play-internal-v77-native-callstyle-fullscreen-proof-20260703-152217/`, `/tmp/google-play-internal-v78-native-callstyle-active-incoming-fix-20260703-215118/`, and `/tmp/google-play-internal-v78-native-callstyle-active-incoming-fix-20260703-215118/installed-fcm-secret-r3-recovery-proof-20260703-230212/`.

Source/native work is implemented and validated for Android CallStyle outside-app incoming calls. It adds `USE_FULL_SCREEN_INTENT`, `chilly_chat_calls_fullscreen_v1`, native channel creation, a custom Firebase messaging service that intercepts only Chi'lly Chat incoming-call data pushes, `NotificationCompat.CallStyle.forIncomingCall`, native Answer/Decline actions, Settings full-screen call alert permission readback/settings route, and data-only incoming call push dispatch.

This is not OTA-only. EAS Build `f888abdb-4154-40b8-91a3-2b410f58aa75` finished as Android App Bundle versionCode `77`, versionName `1.0.0`, runtime `1.0.0`, commit `fab16ef96368a637f96846846d4717d57d2ebb5e`. EAS Submit `47d90002-524f-41b7-968e-e975368d1285` and retry `f596f244-87c4-47bc-9561-2628f891bf37` to Google Play internal failed because Google Play required the full-screen intent declaration before API upload could complete. The same existing v77 AAB was then uploaded through Google Play Console internal testing; Play Console shows latest internal release `77 (1.0.0)` available to internal testers. Do not claim full-screen/lock-screen closure from v76, OTA, or source-only proof.

The Play Console full-screen intent declaration selected `Making and receiving calls`, opted in for pre-grant review, was saved, and is in review from Publishing overview. Both physical phones updated through Google Play only to versionCode `77` from installer `com.android.vending`. Installed readback shows `USE_FULL_SCREEN_INTENT` granted, `com.chillywood.mobile/.ChillyChatFirebaseMessagingService` registered, and channel `chilly_chat_calls_fullscreen_v1` present with ringtone audio attributes and vibration. R5 Settings showed `Full-screen call alerts` = `On`. Normal in-app outside-thread incoming calls showed the full app-wide modal with `Decline`, `Answer`, and `Reply in Chat`, and Decline cleared the caller to `No Active Call`.

Full readiness remains blocked: same-thread Accept landed on `This communication room is unavailable` with `1 in call` / `Connecting` while the caller cleared to `No Active Call`; background/outside-app voice call produced only a `Missed Chi'lly Chat voice call` notification under `chilly_chat_missed_calls`, with no Answer/Decline actions, while the caller still showed `1 in call`. The follow-up source/Edge/OTA fix now registers native Android FCM tokens, sends active incoming calls by direct FCM HTTP v1 with `nativeCallStyle=android_callstyle`, keeps missed calls on the normal Expo path, and re-reads the ringing invite plus active communication room before Accept. Edge functions `notification-device-tokens` and `chilly-chat-call-dispatch` were deployed; EAS Update production Android runtime `1.0.0` published group `9e0d00e8-e6cc-40e0-a4f2-7e9712b2fc0f`, Android update `019f2b09-1d13-7090-b307-917d221b7c7b`. Supabase now has `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` by name only, `chilly-chat-call-dispatch` was redeployed, and no secret value was printed, committed, or documented. R5 proved registered Expo/native call push status, a redacted native call fingerprint, `Full-screen call alerts` = `On`, DND/Zen `0`, nonzero ring/notification/media volumes, and channel `chilly_chat_calls_fullscreen_v1` with ringtone/vibration. Installed closure remains blocked until `R3CXA0DS5JV` is visible again for two-phone proof.

Validation passed: Deno check for `chilly-chat-call-dispatch` and `notification-device-tokens`, Expo Android prebuild, generated native Kotlin compile, notification/call guards, notification proof scripts, direct TypeScript check, runtime validation, and Supabase dry-run. The `npm run typecheck` wrapper failed after TypeScript on an existing Android launcher icon hash policy mismatch; no launcher icon files changed in this lane. No Money Center changes, provider mutation, live money, payout/cashout, auth/RLS weakening, WebRTC/media setup change, room routing change, Play production submission, sideload, `adb install`, logout, uninstall, reinstall, or clear data happened.

## Google-Signed V76 Modern Chi'lly Chat Ringtones

Status: Partial.

Doc: `docs/release/GOOGLE_SIGNED_V76_MODERN_CALL_RINGTONES_INSTALLED_PROOF.md`. Artifact folder: `/tmp/google-play-internal-v76-modern-call-ringtones-installed-proof-20260703-121053/`.

Source/audio assets are updated so the existing ringtone names and preference keys now point at original generated modern Chi'lly Chat ringtone WAVs instead of weak/click-like sounds. The asset guard verifies app/raw parity, format, duration/loudness bounds, preserved mappings, and no third-party ringtone files.

Latest app-side outside-app call fix `d23339bdbd251b4d070047d2dbe81c1e8620e3ab` is published by EAS Update production Android runtime `1.0.0`, group `0db0be81-fd60-49a1-ab7f-8bfb169122f4`, Android update `019f2909-5188-7ff6-82eb-907e47e3dd48`, with `chilly-chat-call-dispatch` redeployed. Outside-app calls now use `chilly_chat_calls_v3` with Android default notification sound, high/max importance, and vibration.

Installed proof remains Partial because audible outside-app sound is still governed by Android device/channel settings. Both proof phones remain Google Play-installed v76 from `com.android.vending` and both have DND/Zen off. R5 has nonzero notification volume and proved a sound/vibration-capable alerting outside-app call notification that opens the answerable incoming-call UI. R3 has Android notification stream volume `0`; it vibrates and shows the call notification but Android will not play audible notification sound until device notification volume/channel settings allow it.

OTA can update in-app preview/foreground sound assets and call notification channel selection. OTA cannot replace already-installed native `res/raw` channel sound files or implement continuous phone-call-style/full-screen background ringing. Those require a future owner-approved Play/native build with Android call-style/full-screen intent/channel work.

No copyrighted ringtone files, Play production submission, sideload, `adb install`, logout, uninstall, reinstall, clear data, provider mutation, live money, payout, cashout, auth/RLS weakening, Money Center change, room routing change, or WebRTC/media setup change happened.

## Google-Signed V76 Direct Chat Video Join Latency

Status: Closed for the reported Android two-phone installed video-answer split/render delay.

Doc: `docs/release/GOOGLE_SIGNED_V76_DIRECT_CHAT_VIDEO_JOIN_LATENCY_PROOF.md`. Artifact folder: `/tmp/google-play-internal-v76-video-join-latency-proof-20260702-171458/`.

Source commits `8c110ad4193bd9928355b72e6b7f8146c03a7286` and `9b6ab72d05a6b77d09a341945d47b9018f87e44d` were published by EAS Update on production Android runtime `1.0.0`; final group `10fc0b00-df0a-4fc8-9764-c27095a6d75d`, Android update `019f24f3-cb2f-7a52-baa2-0881849c32e5`.

The first follow-up OTA was not counted Closed because the caller still showed `1 in call` at the +8 second installed capture. After the final OTA and two safe app restarts on both phones, R3 started a normal visible Direct Chat video call, R5 answered from the real incoming banner, and both Google Play-installed v76 phones showed `2 in call`, split layout, local video, and remote video by the +4 second capture. The +8 second capture remained stable, and End Call returned the caller thread to `No Active Call`.

This closes the reported Android two-phone installed latency issue only. iOS/tablet/foldable, background push, and broader room-notification closure remain separate proof scopes. No Play build, Play production submission, sideload, `adb install`, logout, uninstall, reinstall, clear data, Money Center refactor, provider mutation, live money, payout, cashout, auth/RLS weakening, or private identifier exposure happened.

## Google-Signed V76 Incoming Call Surface Behavior

Status: Partial.

Doc: `docs/release/GOOGLE_SIGNED_V76_INCOMING_CALL_SURFACE_BEHAVIOR_PROOF.md`. Artifact folder: `/tmp/google-play-internal-v76-incoming-call-surface-behavior-20260703-005357/`.

Source commit `37b4c12cbe0b95702849ecba1e8a7149af4b334a` was published by EAS Update production Android runtime `1.0.0`, group `cb225e0f-37f7-40b3-a93e-127bfd64d97e`, Android update `019f268e-c117-7e3a-8aff-7e177037e1ac`.

The source fix resolves the observed presentation split: same-thread receivers keep the full thread-owned incoming-call sheet without duplicate app-wide UI; normal non-room surfaces use a full app-wide incoming-call modal with Answer / Decline / Reply in Chat; room-safe surfaces keep the compact room-safe banner with Decline / Reply in Chat / Leave room and answer. Guard coverage now fails if normal app surfaces regress to compact-only banner behavior or room-safe surfaces lose the compact banner.

Both `R5CR120QCBF` and `R3CXA0DS5JV` remain Google Play-installed v76 from `com.android.vending`. Both devices saw the OTA available/download path before two safe app restarts and later reported no newer update available. Android notification channel readback shows `chilly_chat_calls_v2` with high/max importance, `chilly_ring`, and vibration enabled.

Full readiness remains Partial until same-thread, normal outside-thread, room-safe, and background notification answer/decline behavior are physically rerun after the OTA. Android DND, notification permission, user channel settings, OEM restrictions, and native full-screen/call-style notification requirements must be documented separately if they suppress ring/vibration. No Play build, Play production submission, sideload, `adb install`, logout, uninstall, reinstall, clear data, provider mutation, live money, payout, cashout, auth/RLS weakening, or private identifier exposure happened.

## Google-Signed V76 UI Consistency Cleanup

Status: Closed for the four UI/UX consistency cleanup issues on Google Play-installed v76 plus verified runtime-compatible OTA behavior.

Doc: `docs/release/GOOGLE_SIGNED_V76_UI_CONSISTENCY_CLEANUP.md`. Artifact folders: `/tmp/google-play-internal-v76-ui-consistency-cleanup-20260702-161301/` and `/tmp/google-play-internal-v76-ui-consistency-cleanup-two-device-camera-proof-20260702-164050/`.

Final media-label source commit `83e93150937a633e8c844fbf4962ebe70b407cf9` was published by EAS Update production Android runtime `1.0.0`, group `f361c068-40b9-460f-99eb-70ba0ec6ff73`, Android update `019f24ce-6808-7cd9-87d3-8e3ebd1bde05`.

Google Play-installed v76 proved Chat percent-encoded text renders readable decoded spaces in both inbox preview and opened thread, Settings avoids full raw email as the primary account header identity, and Manage Premium sandbox copy hierarchy is cleaner while preserving sandbox/test-only and no-production-money/payout/cashout/payable-balance meaning. After `R3CXA0DS5JV` was recovered, two-device installed proof on `R5CR120QCBF` and `R3CXA0DS5JV` proved voice calls no longer show fake `Video connected`, video calls show local/remote renderable video on both phones, Camera Off -> On recovers to `Video connected` / `Cam On`, and End Call clears both phones to `No Active Call`.

No Play build, Play production submission, sideload, `adb install`, logout, uninstall, reinstall, clear data, Money Center refactor, provider mutation, live money, payout, cashout, auth/RLS weakening, or private identifier exposure happened.

## Google-Signed V76 Notifications / Money Center Proof

Status: Closed for the requested July 2 three-result installed proof lanes. Installed Money Center manager visibility remains Closed in `docs/release/GOOGLE_SIGNED_V76_NOTIFICATIONS_MONEY_CENTER_PROOF.md`.

Latest July 2 combined proof: `docs/release/GOOGLE_SIGNED_V76_THREE_RESULT_PROOF_AND_UI_CONSISTENCY.md`, artifact folder `/tmp/google-play-internal-v76-three-result-proof-and-ui-consistency-20260702-103354/`. The Google Play-installed v76 app on both physical phones proved the full six-row creator transaction notification matrix routes to Money Center Transactions; Premium-backed gates open Manage Premium / subscribe instead of dead-ending on Retry Offer Lookup; voice calls do not show fake `Video connected`; video calls render real local/remote video on both phones and clear to `No Active Call`; bell tray rows show readable timestamps and timestamped accessibility labels; Settings no longer renders Activity rows and Bell Activity owns notification records. The creator matrix rows are sandbox/proof/not-payable UI routing proof only, not purchase-generation proof, access grants, provider mutation, payout/cashout/payable-balance proof, or live-money proof.

Historical July 2 room/Profile update: `docs/release/GOOGLE_SIGNED_V76_FINAL_ROOM_NOTIFICATION_PROFILE_BELL_CLOSURE.md` proves Google-signed v76 plus OTA group `827b6eed-02fd-43be-8b38-f561392ea9e2` / Android update `019f2331-8f3b-7d34-8abb-a665efbdc95d` closed Profile bell alignment, Studio bell non-regression, Waiting Room tray, Live Stage tray shell, Reply in Chat, Leave room and answer, and stale Android call notification cleanup after Decline. That doc remained Partial only because the six-row creator matrix was not yet visible/proved; the later combined proof above closes that matrix.

Settings/Bell Activity ownership correction: source fixed and published by EAS Update production Android runtime `1.0.0`, group `f402a647-a04a-4920-9543-c9e3b7499f3e`, Android update `019f236d-1032-79d5-a333-ec0a4a7f62ca`, app-source commit `9c77ceaa72d574d9745b9d139630ea907b54c0f8`. Settings no longer renders the notification Activity list. The bell icon/tray owns Activity records, timestamps, read state, dismiss, and routing. Settings remains for notification preferences, device push registration, Register Device, Refresh, and call sound. Installed-app proof is closed by the July 2 combined three-result proof above.

Final notification/room/call closure attempt: Blocked for installed closure. Source fix commit `05446c8832004336bb42ee6d21f29fb5b1ed8cf4` fixes the creator notification Premium-gate race and stale actionable Chi'lly Chat call notification cleanup, and was published by EAS Update group `39609392-ad93-4bcb-86c0-b8b639daf393` / Android update `019f1f9f-b6e3-786c-b16f-97ab49d851ea` on production runtime `1.0.0`. Follow-up artifact `/tmp/google-play-internal-v76-two-device-final-closure-20260701-165920/` recovered R3 and proved both phones remain Google Play-installed v76 from `com.android.vending`. R3 proved the expected OTA bundle/update/group signals. R5 did not prove the expected OTA loaded after repeated safe launch/update checks; its latest summary showed `CheckCompleteUnavailable` without the expected update id, update group, or bundle signal. This blocks final installed UI flow closure because the current owner/creator account is on R5 and the remaining in-room call actions require two-device proof. Detailed doc: `docs/release/GOOGLE_SIGNED_V76_FINAL_NOTIFICATION_ROOM_CALL_CLOSURE.md`.

Google Play internal v76 included commit `e4f88365d33dcf0655597041800985131c045e40` and both physical phones read back package `com.chillywood.mobile`, `installerPackageName=com.android.vending`, versionCode `76`, versionName `1.0.0`. Runtime-compatible follow-ups were delivered by OTA on runtime `1.0.0`; Platform Studio premium snapshot group is `1c4834a5-439d-4e86-93b0-1eb0de8d8aac`, Android update `019f1def-e5bc-70fc-baca-790cdde0ab98`, commit `0bb2ba928e05773567b5d3868fbcc502334f7730`; push registration persistence group is `190e756f-4666-4af0-90e6-1092d4f6b065`, Android update `019f1efa-3a2c-74d3-8672-47b8efc7928e`, commit `f26f1236957edb635a3e0ed632295d4a31dbd638`; push Refresh action group is `84dd1be6-08e9-4405-b2bc-e564a99a0512`, Android update `019f1f0a-755b-75c8-9bda-c4f2e8fdd1cc`, commit `2dfaa9219a25a74e27c0357b22e1497642a1dbcd`.

R5 completed the Google Play sandbox Premium path through Manage Premium -> Start Sandbox Premium Test -> Subscribe. After the premium snapshot OTA, Platform Studio opened from the same installed session and Money Center passed visible manager proof for Open Ways to Earn, Tips, Paid Video, Watch-Party Seat Pass, Channel Subscription, VIP, Event Pass, and Cashout readiness. Cashout remains not live and not payable. `liveMoneyEnabled` remains OFF and payouts/cashout remain OFF.

Physical notification completion artifacts are under `/tmp/google-play-internal-v76-notifications-money-center-proof-20260701-0805/physical-notification-completion-20260701-090520/`. That pass Closed the visible installed call row in Settings Activity/tray, Chat routing without auto-answer, row dismiss behavior, and normal bell/tray shell behavior on Platform Studio / Money Center, Home, Explore, Live, and Saved. Push registration persistence artifacts are under `/tmp/google-play-internal-v76-push-registration-persistence-20260701-133921/`; both `R5CR120QCBF` and `R3CXA0DS5JV` stayed `Push Registered` / `Registered` after Settings reopen/expansion, and in-app Notifications / Activity remained account-level and visible independently of device push registration. The installed Refresh button was not counted as Closed after owner correction; source commit `2dfaa9219a25a74e27c0357b22e1497642a1dbcd` fixes it with a dedicated busy state/readback handler, but physical devices logged `No update available` for that OTA, so installed Refresh-button proof remains Partial.

Remaining Partial items before full public closure: buyer/creator seeded money notification route rows, the prepared missed-call fixture, the prepared event-reminder fixture, viewer Tip Sheet replay, room/live tray behavior inside active rooms, incoming chat call-in-room behavior, and actual push delivery where claimed. Seeded notification rows are UI fixtures only and are not proof that purchases generated notifications. Actual push delivery is not claimed without delivered-push evidence.

No Play production submission, sideload, `adb install`, logout, uninstall, reinstall, clear data, provider mutation, auth/RLS weakening, live money, payout, cashout, or fake purchase-generation proof happened.

Remaining v76 notification/room/push closure update: Partial. Artifact folder `/tmp/google-play-internal-v76-remaining-notification-room-push-closure-20260701-154412/` proves current-account buyer notification routes, current-account missed-call and event-starts-soon routes, actual delivered Android Chi'lly Chat call push, active Party Room room-safe tray open/close, and Party Room incoming call banner with Decline preserving room state. Full public closure remains blocked by creator notification rows hitting the Premium gate before Money Center Transactions, Waiting Room and Live Stage tray not separately proved, Reply in Chat / Leave room and answer not separately exercised from the room-safe incoming-call banner, and the delivered call notification remaining actionable after Decline while the caller room stayed active. Caller-side End Call cleared both devices to `No Active Call` and removed active Chi'llywood notification records. Validation passed; no live money, payout, cashout, provider mutation, sideload, logout, clear data, auth/RLS weakening, fake push, or fake purchase-generation proof happened.

## Google Play Proof Fixture Readiness

Status: Ready to Build for installed UI Activity/routing proof. Route/account packet `/tmp/google-play-proof-fixture-packet-20260630-232419/` contains the private fixture packet and redacted summaries. Notification-record packet `/tmp/google-play-notification-record-fixtures-20260630-233355/` contains the seeded-row summary, private row ids, validation logs, and push-readiness note.

Repo/source/backend validation is clean at `98ec176ed4f9f24aaff9e7127d877301670d0998`. Both physical devices were already visible/authorized and currently have Google Play-installed v74 from `com.android.vending`. Ignored local proof-account config authenticates the owner/operator creator, viewer, premium, and two-device call accounts; no credentials are committed here.

The owner/operator creator account has authenticated Money Center access and six sandbox/not-payable creator configs. Exact route fixtures are privately recorded in the packet, and route/backend resolver checks are ready for Channel, Channel Studio, Paid Video, Watch-Party Seat Pass, Event Pass, Channel Subscription, VIP, Tips, Chat, and Settings. Watch-Party Seat Pass remains the visible wording and routes to the Party Room path, not Live Stage.

Fourteen sandbox/proof/not-payable notification rows are ready for installed Activity/routing/retention proof: six buyer creator-money rows, six creator sale/support rows, one missed Chi'lly Chat call row, and one event-starts-soon row. The seeded notification rows are UI fixtures only; they are not counted as proof that purchases generated notifications. They do not grant access, create payouts/cashout/payable balances, mutate providers, or prove push delivery. Push dispatch fixture is ready, but Android token registration and actual push delivery remain pending installed Google Play proof.

No EAS build, Play build, sideload, adb install, clear data, logout, live money, payout, cashout, provider mutation, auth/RLS weakening, or fake production records happened.

## Local-Source Notifications / Money Center Proof

Local-source status: Partial/mostly-Closed for local web. Installed-app status: Pending for a later Google Play internal build.

Android emulator/dev-client proof remained blocked because the available emulator app did not request Metro/local source, so local web fallback was used before any Play build. Money Center human-tap proof passed for Open Ways to Earn, Tips, Paid Video, Watch-Party Seat Pass, Channel Subscription, VIP, Event Pass, and Cashout / Payout readiness. Settings Activity and bell tray read real records; Home, Explore, Live, Saved, and Platform Studio show the icon-only bell with real unread count; Watch-Party Waiting Room shows a room-safe bell and no full normal header.

Source-specific player/watch-party/event content proof remains fixture-limited without safe ids. Actual room tray-open behavior, LiveKit camera/mic preservation, Android push/device behavior, and two-device incoming Chi'lly Chat call behavior remain physical/Play proof items. Source/local proof is not installed-app proof.

No EAS build, Play build, sideload, physical-device adb install, physical-device clear data, physical-device logout, live money, payout, cashout, provider mutation, auth/RLS weakening, or Premium bypass happened.

## Important Notifications / Activity Retention

Source status: fixed. Installed-app status: Pending for a later Google Play internal build.

Important notifications remain easy to find until dismissed, handled, revoked, or expired. Read state does not remove important notifications. Dismiss hides notifications. Expired notifications are shown as expired/history rather than silently disappearing. Six creator-money flows are Important / Action Needed where actionable.

Settings Activity and the bell tray read active important notifications separately from recent activity, so older actionable rows are not buried by the recent-feed cap. Chi’lly Chat calls remain call/chat-owned and do not turn Chat into a money notification ledger. Seat Pass visible wording is enforced.

`liveMoneyEnabled` remains OFF. Payouts and cashout remain OFF. No auth/RLS/money permission weakening happened. No provider/live-money mutation happened. Source fixed is not installed-app proof.

## Creator-Money Notifications / Activity

Source status: fixed. Installed-app status: Pending for a later Google Play internal build.

Creator-money notifications are backed by real notification records. Notifications guide users to routes; they do not grant access. Destination routes re-check access/grant/status. Buyer and creator notifications are separate. Money Center remains the creator business home. Chat remains conversation-only and is not the creator-money notification ledger.

Buyer-side notification types are wired for Paid Video, Watch-Party Seat Pass, Channel Subscription, VIP, Event Pass, and Tips. Creator-side sale/support notification types are wired for the same six creator flows and route to Money Center Transactions. Tips do not unlock anything. Premium remains the app-wide subscription flow.

Android/Expo push dispatch is source-prepared only after a real notification record exists and preferences, Android token presence, safety eligibility, and dedupe pass. Push is Android/Expo only where proven; iOS/APNs remains later unless separately implemented.

`liveMoneyEnabled` remains OFF. Payouts and cashout remain OFF. No real payout, transfer, withdrawal, payable balance, or provider mutation was created by notifications. No auth/RLS/money permission weakening happened. No provider/live-money mutation happened. Source fixed is not installed-app proof.

Last two notification commits were audited together. Creator-money notification records and room-safe bell/call behavior are source/backend aligned. Remote migration status verified. Changed Edge functions deployed or verified unchanged; `revenuecat-webhook` is ACTIVE version 18. Installed-app proof remains pending. Source/backend readiness is not installed-app proof. Google Play internal build is still required for visible device closure.

## Creator Tips V68 Installed Blocker Source Fix

Source status: fixed. Installed-app status: Pending for a later Google Play internal build.

v68 installed proof was Partial because Tips failed. Creator-side Tips Manager save showed `Tip settings could not be saved. Try again later.`, and the viewer-side Platform Sandbox Tip CTA did not open the tip sheet. Tips creator setup save is now source-fixed: the Money Center Tips Manager saves `creator_tip_sandbox_099` through the sandbox/not-payable creator config path before best-effort public tip-status sync, then uses saved config readback for setup state. Sandbox Tip CTA opens the tip sheet and the test hook is attached to the actual tappable element.

Tips remain sandbox/not-payable. Tips do not unlock content, Premium, VIP, subscription, room, event, LiveKit authority, payout, cashout, or payable balance. `liveMoneyEnabled` remains OFF. Payouts and cashout remain OFF. Source fixed is not installed-app proof. No auth/RLS/money permission weakening happened. No provider/live-money mutation happened.

## Creator Monetization Setup And Cashout Readiness Activation

Source/backend status: Closed for setup/readiness mode. Installed-app status: Pending if Google Play internal proof is requested for this specific UI lane.

Source route/button wiring is fixed. Money Center is the single creator monetization home. `/creator-monetization-setup` is compatibility-only and lands in Money Center Offers setup. `/monetize`, `/revenue`, and `/payouts` compatibility routes land in the correct Money Center focus areas. Each creator monetization flow has a real setup action, not stale proof copy. Paid Video, Tips, Watch-Party Seat Pass, Channel Subscription, VIP, and Event Pass setup buttons now save sandbox/not-payable configs or route to the correct source-specific setup area, and saved config readback is visible in Money Center. Creator and viewer source wiring pairs are proved for each creator monetization flow: Paid Video maps to `/player/[id]`; Tips maps to the creator-surface tip CTA / tip sheet; Watch-Party Seat Pass maps to `/watch-party/[partyId]` and not Live Stage; Channel Subscription maps to `/channel-subscription/[creatorId]` and not `/subscribe`; VIP maps to `/vip-pass/[creatorId]`; Event Pass maps to `/event/[eventId]` with terminal/unsafe event states denied by `20260630091500_paid_event_pass_terminal_event_status_guard.sql`; Cashout/Payout has no viewer-side purchase flow.

Creator monetization setup is usable in sandbox/not-payable mode. Creator setup does not mean live money is active. Creators can access cashout readiness, but real cashout is not live. Cashout readiness does not execute payouts. No real payout, transfer, withdrawal, or payable balance is created. `liveMoneyEnabled` remains OFF. Payouts and cashout remain OFF for production money movement. Saved creator configs are sandbox/not-payable. Production sales require owner/provider activation. Production cashout requires Stripe/live provider approval, tax/KYC readiness, fraud/support/legal review, and owner approval.

Premium remains the app-wide subscription flow. Tips, Paid Video, Watch-Party Seat Pass, Channel Subscription, VIP, and Event Pass are creator monetization flows. The Money Center now exposes setup actions and cashout-readiness review instead of stale proved/readiness boxes that leave creators unable to configure their flows. No auth/RLS/money permission weakening happened. No provider/live-money mutation happened.

## Header profile avatar flicker fix

Source status: fixed. Installed-app status: Pending if Google Play internal v67+ proof is required.

Profile/avatar fallback must not flash while the real avatar is still loading. Last known avatar should remain visible during profile revalidation. Fallback avatar is only valid after profile loading completes and no avatar exists. The source fix keeps a shared last-known header profile snapshot, seeds it from Home, reads cached local profile before remote revalidation, renders a neutral placeholder while unresolved, and preserves the unified Home/Explore/Live/Saved header layout.

Source fixed is not installed-app proof. No auth/RLS/profile permission weakening happened. No provider/live-money mutation happened. liveMoneyEnabled remains OFF.

## Party Room / Live Stage route semantics verification

Party Room and Live Stage are separate product routes. Party Room normal watch-party flow must not route to Live Stage. Player → Watch-Party Live → Party Waiting Room → Party Room remains intact. Home → Live Watch-Party → Live Waiting Room → Live Room → Live Stage remains intact. Live Stage remains `/watch-party/live-stage/[partyId]`. Party Room remains `/watch-party/[partyId]`. Legacy `/communication/*` remains compatibility-only.

The ambiguous Party Room Go Live handoff introduced during validation cleanup was removed. Route-contract guards now enforce route separation. No auth/RLS/chat/account-status permission weakening happened. No provider/live-money mutation happened. liveMoneyEnabled remains OFF.

## Validation blocker cleanup

brand-spelling-policy is now clean. route-contracts guard is now clean. supabase db push --dry-run is now clean.

Root causes were generated legal-site brand anchors with `chi-llywood`, proof-script redaction regex literals with a contiguous lowercase brand token, stale Live Stage route guard expectations, stale paid Watch-Party Seat Pass callback scope, and Supabase migration drift. The cleanup regenerated public legal pages from the safer slugifier, aligned route guards to the locked dynamic Live Stage route, renamed direct-chat migrations to match remote history, applied six older local hardening migrations after a clean include-all dry-run, and verified ordinary `supabase db push --dry-run` reports the remote database is up to date.

No database reset, data drop, migration squash, production Play submission, provider/live-money mutation, Premium change, RLS weakening, auth weakening, chat/account-status permission weakening, logout, uninstall, reinstall, or clear-data happened. Source fixed is not installed-app proof. Google Play internal install is not enough without actual user flow proof. No service-role chat/social proof was counted. liveMoneyEnabled remains OFF.

## Chi’lly Chat delete/hide conversation

Source status: fixed. Installed-app status: Closed after Google Play internal versionCode `64` actual-user proof on `R5CR120QCBF` and `R3CXA0DS5JV`.

Delete from my inbox is a per-user hide, not a hard delete. The other participant’s copy is not deleted. Message and call history are preserved. Hidden direct threads must not create duplicate direct threads. Profile/Search → Chi’lly Chat must reopen the existing direct thread. Do not hide identity bugs by deleting rows. Proof Normal / @user230456 is a legitimate separate proof account/thread and may be hidden from the tester inbox without renaming or merging.

Implementation adds `chat_thread_members.hidden_at`, authenticated `hide_chat_thread_from_inbox` and `unhide_chat_thread_for_me`, app-side inbox filtering for the current user, and a long-press inbox action with confirmation copy: `This removes the conversation from your inbox. It does not delete it for the other person.` The shared `chat_threads`, `chat_messages`, call events, call invites, moderation, and other participant inbox state are preserved.

Google-signed v64 proof is documented in `docs/release/GOOGLE_SIGNED_V64_CHAT_THREAD_HIDE_PROOF.md`. EAS Build `c3fd4029-48b4-49ad-a1a4-7a33fbfbad84` / EAS Submit `cbcaae0e-650e-4c5d-a3c7-9b5ab819a8c1` delivered versionCode `64` from commit `5c21c3b4282fa45a2f62106deba68d944b6024e4` through Google Play internal testing. `R5CR120QCBF` installed from Google Play with `installerPackageName=com.android.vending`, versionCode `64`, and lastUpdateTime `2026-06-29 02:32:57`; `R3CXA0DS5JV` was recovered, updated only through Google Play internal testing, and read back `installerPackageName=com.android.vending`, versionCode `64`, and lastUpdateTime `2026-06-29 08:20:56`. R5 passed long-press, action sheet, confirmation copy, hide, Search → Chi’lly Chat reopen/unhide, message history preservation, composer, Voice Call, Video Call, and duplicate prevention. R3 then passed the remaining two-phone proof: hiding the `user230455` direct thread removed it only from R3, R5 retained the same thread and history, R5 sent a new proof message, and the hidden thread reappeared on R3 with the same thread id and new preview. New message reappear is Closed only if a hidden thread reappears after newer message activity, and this v64 proof did that. Proof Normal / @user230456 was not mutated in the completion run; it remains a legitimate separate proof account/thread and may be hidden later without renaming or merging. Source fixed is not installed-app proof. Google Play internal install is not enough without actual user flow proof. installerPackageName must be com.android.vending. Sideloaded APK proof is not accepted. No logout, uninstall, reinstall, or clear-data happened. No auth/RLS/chat/account-status permission weakening happened. No service-role chat/social proof was counted. No provider/live-money mutation happened. liveMoneyEnabled remains OFF.

Chat thread hide final hardening audit: Closed for source/backend behavior. Migration `20260629140032_guard_active_chat_thread_hide.sql` is applied remotely and makes `hide_chat_thread_from_inbox(text)` refuse active-call threads with `active_communication_room_id`. This prevents active receiver-visible call state from being silently hidden. App source now shows `Call active in this thread` and `Finish or leave the active call before removing this conversation from your inbox.` before attempting active-call hide; that friendly UI copy is source-fixed and requires future Google Play internal v65+ installed proof if exact-copy installed proof is required. Unread behavior is server-backed through `last_message_at`, `hidden_at`, and `unread_count`; attachment metadata, storage objects, message history, and call history are preserved; block/restrict/account-status behavior remains governed by existing chat access, direct-thread open, membership, and message guards.

## Home Settings + Direct Thread UI cleanup

Source status: fixed. Installed-app status: Closed after Google Play internal versionCode `66` proof.

Home now places a compact icon-only Settings gear in the left header cluster beside `HOME`, with accessibility label `Settings`, no visible Settings word, and no oversized pill treatment. Shared Explore/Live/Saved top bars also use compact icon-only Settings controls.

Direct chat threads no longer render the large `MESSAGE THREAD` / `Chat stays primary` explainer card. Header identity, Voice Call, Video Call, message history, lightweight recent-call rows, and the composer remain in place, with messages starting higher in the thread. Source fixed is not installed-app proof. No auth/RLS/chat/account-status permission weakening happened. No provider/live-money mutation happened. liveMoneyEnabled remains OFF.

Google-signed v66 proof is documented in `docs/release/GOOGLE_SIGNED_V66_HEADER_CHAT_UI_PROOF.md`. EAS Build `e4f13ffc-eb68-4e39-9605-277b4332dcee` / EAS Submit `262c27f6-19ef-4d68-aedd-92bce42b81f2` delivered commit `0373e99220e3094b304c81651e6c65ec744c2d8b` to Google Play internal testing as versionCode `66`, versionName `1.0.0`. `R5CR120QCBF` and `R3CXA0DS5JV` updated only through Google Play internal testing and both read back `installerPackageName=com.android.vending`, versionCode `66`. Home is the canonical header style. Settings is icon-only. The visible word Settings must not appear on Home, Explore, Live, or Saved top controls. Settings accessibility label remains Settings. Profile/avatar control sits alone on the right. Header controls must not overlap page labels, hero text, or content. Explore, Live, and Saved mirror Home's header-control treatment. Installed proof passed all tab headers on both phones, proved Settings opened from each tab, and proved the Direct Chat card removal with composer, Voice Call, and Video Call still available.

Google-signed v65 proof is documented in `docs/release/GOOGLE_SIGNED_V65_HOME_SETTINGS_CHAT_UI_PROOF.md`. EAS Build `3a5e65e3-352e-4c72-bc89-2347474496e2` / EAS Submit `482a1080-8a7a-4c86-9f79-64ea13b7f82a` delivered commit `a38e5ac5587591fab2ed4a9308c8dd90d46005a0` to Google Play internal testing as versionCode `65`, versionName `1.0.0`. `R5CR120QCBF` updated through Google Play internal testing with `installerPackageName=com.android.vending`, versionCode `65`, and lastUpdateTime `2026-06-29 12:23:25`. R5 installed proof passed Home only: Home Settings control is icon-only, the visible word Settings does not appear on the Home top control, accessibility label remains Settings, the icon does not overlap `HOME` or hero text, and tapping it opened Settings without logout or data reset. Explore/Live/Saved installed captures and v65 direct-thread installed captures remain Pending because R5 became ADB unauthorized before those flows were captured and `R3CXA0DS5JV` was not visible to ADB. Google Play internal install is not enough without actual user flow proof. Sideloaded APK proof is not accepted.

## Direct thread messaging UX restoration

Source status: fixed. Installed-app status: Closed for Play-installed Android versionCode `63`.

Chi’lly Chat direct thread must remain a real messaging thread. Calls live inside the thread, but must not replace the thread. Actual chat content must remain primary. Call event rows must not dominate the direct thread. Thread status UI must not push real chat content out.

The source fix in `app/chat/[threadId].tsx` restores a message-first direct-thread hierarchy while preserving in-thread voice/video calls, call event history, active-call state, composer, and attachments. Google Play internal install is not enough without actual user flow proof; this item has both Google Play install readback and actual thread-flow proof. EAS Build `1c7c497e-805f-4a30-9f67-ff34ed945645` / EAS Submit `7f4bd948-3554-42e7-926f-b3659bde5a5a` delivered versionCode `63` from commit `82364c4dccffa1c60e66a5ee10bbb4ad186fa920`. Both attached phones updated from Google Play internal testing with `installerPackageName=com.android.vending`; the `user230455` direct thread showed fresh header identity, Voice Call / Video Call actions, `MESSAGE THREAD`, `Chat stays primary`, compact `RECENT CALLS IN THIS THREAD`, and the `Write a message` composer. Sideloaded APK proof is not accepted. No logout, uninstall, reinstall, or clear-data happened. No auth/RLS/chat/account-status permission weakening happened. No service-role chat proof was counted. No provider/live-money mutation happened, and `liveMoneyEnabled` remains OFF.

Chi'lly Chat Google-signed v60 Direct Chat + Call proof: Partial in `docs/release/GOOGLE_SIGNED_V60_DIRECT_CHAT_CALL_PROOF.md`. EAS Build `8642fea7-b782-4c18-98c8-5805b6c7c20e` produced Google Play internal Android App Bundle versionCode `60`, versionName `1.0.0`, commit `c08c4bd1d98d3ea6672df5c3441c8d7b232b6b82`, and EAS Submit `7c6dd61c-16e9-4cd8-84b4-db489c19f794` submitted it to Google Play internal only. Both attached phones updated only through Google Play with installer `com.android.vending` and stayed signed in: `R5CR120QCBF` lastUpdateTime `2026-06-28 16:49:54`, `R3CXA0DS5JV` lastUpdateTime `2026-06-28 16:49:28`, both package `com.chillywood.mobile`, versionCode `60`. Settings/Profile/Chat search showed fresh `@user230455`, and visible Chat search -> direct-thread open passed after targeted authenticated Supabase RPC ambiguity/member-upsert migrations. A receiver banner thread-readback migration fixed the installed blocker where tapping the app-wide incoming voice-call banner opened `This Chi'lly Chat thread could not be found.`; after the fix, R5 tapped the real banner and both phones showed `2 in call`. Source now adds a shared responsive layout foundation and fixes the video layout issue where the bottom feed could be cut off by controls and participant metadata covered too much video. Video tiles must adapt to phone size instead of hard-coded device hacks, but fullscreen video fit is not Closed until proved on installed app and iOS/tablet/foldable proof remains Pending unless tested. Actual-user call closure remains Partial because installed v60 recorded a false `Missed voice call` after the joined call ended, the cleanup/responsive video layout source fixes are not installed in a Google Play build yet, and video, background push/ringing, receiver same-thread rerun, decline/missed, and full call cleanup are not Closed. Existing Chat inbox row metadata can still show stale `@user230456`. No logout, uninstall, reinstall, clear-data, sideload, Play production submission, auth/RLS/chat/account-status permission weakening, service-role chat proof, provider/live-money mutation, or `liveMoneyEnabled` activation happened.

Chi'lly Chat Google-signed v61 responsive video proof: Closed for Android two-phone installed responsive layout and Partial for broader call/cross-platform closure in `docs/release/GOOGLE_SIGNED_V60_DIRECT_CHAT_CALL_PROOF.md`. EAS Build `bc2e9532-6a1e-4174-a153-679345c6ef20` produced Google Play internal Android App Bundle versionCode `61`, versionName `1.0.0`, commit `70b276c336b1164a674a8ae51b421e0a039d0d35`, and EAS Submit `36c7bae7-4181-4c67-ac46-75070f76142f` submitted it to Google Play internal only. Both attached phones updated only through Google Play with installer `com.android.vending`: `R3CXA0DS5JV` lastUpdateTime `2026-06-28 19:05:47`, `R5CR120QCBF` lastUpdateTime `2026-06-28 19:06:13`, both package `com.chillywood.mobile`, versionCode `61`. Owner -> user Direct Chat video proof passed with receiver banner tap, readable thread/call surface, `2 in call`, local/remote video on both phones, no bottom feed cutoff, no bottom control overlap, compact participant metadata, Back to Thread, End Call, no visible false missed-call text after joined video calls, and repeated call after end using a new room. iOS/tablet/foldable proof remains Pending unless tested; background push/ringing, decline/missed/background cleanup, user -> owner direction, and stale existing inbox metadata remain Partial. No logout, uninstall, reinstall, clear-data, sideload, Play production submission, auth/RLS/chat/account-status permission weakening, service-role chat proof, provider/live-money mutation, or `liveMoneyEnabled` activation happened.

Cross-surface stale identity metadata fix: Classified after Play-installed versionCode `63` proof and sanitized DB readback. One user identity must render consistently across profile, chat, search, circle, followers, and following. Fresh remote profile must win over stale AsyncStorage and stale participant snapshots where the same user is involved. Settings/Profile/Chat must agree on the current handle. Circle/Followers/Following must not keep stale handle metadata as primary identity. Existing inbox rows must not show stale participant metadata as primary identity. Platform/owner/admin/moderator/creator surfaces now prefer the same fresh profile identity source where available, while role badges remain separate from handle/name/avatar identity. Fresh Profile, fresh Chat inbox/filter row, and fresh direct-thread header showed `user230455` / `@user230455`. The old `Proof Normal` / `@user230456` row was reproduced and read back safely; it is a legitimate separate proof account/thread with a different redacted user hash from `user230455`, no duplicate thread for that pair, and no stale member/profile disagreement for that stale member. Do not hide or delete stale rows just to pass proof. Source commit `8938356` updates existing-thread People copy to `Already in your threads. Open the matching thread below.`, but source fixed is not installed-app proof.

Chi'lly Chat handle freshness/direct-thread open blocker: after v59, Owner/Admin -> normal-user Chat People search finds `user230455 @user230455` with visible `Chi'lly Chat`, `Voice Call`, and `Video Call`, but installed v59 fails before direct-thread open/create with safe copy: `Unable to open Chi'lly Chat with this person right now.` Owner evidence also showed Settings current handle `@user230455` while normal Profile and the existing Chat thread still showed stale `@user230456`. Source now fixes profile cache freshness and direct-thread open/create repair, but this requires a new Google Play internal build and actual-user proof before Chat call closure can proceed.

Chi'lly Chat Google Play internal actual-user call proof: Partial in `docs/release/CHILLY_CHAT_GOOGLE_PLAY_INTERNAL_CALL_CLOSURE.md`. EAS Build `7cf16ebe-a3de-4efb-8170-63a5e9799653` produced Android App Bundle versionCode `59`, and EAS Submit `0c9b2162-c259-4934-a0e8-5679f524b609` submitted it to Google Play `internal` only. Both physical phones updated through Google Play internal testing (`R5CR120QCBF`, `R3CXA0DS5JV`, package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `59`, versionName `1.0.0`) and stayed signed in. Actual-user call proof is not Closed: no fresh v59 end-to-end Voice/Video Call completed through normal visible paths with receiver-visible incoming state, background push/ringing, local/remote video, fullscreen fit, and call end/decline/missed cleanup proof. Same-thread proof is not enough. Google Play internal install is not enough without actual user flow proof. No logout, uninstall, reinstall, clear-data, sideload, Play production submission, auth/RLS/chat/account-status permission weakening, service-role chat proof, provider/live-money mutation, or liveMoneyEnabled activation happened.

Chi'lly Chat Play v58 actual-user call proof: Partial in `docs/release/CHILLY_CHAT_PLAY_V58_ACTUAL_USER_CALL_PROOF.md`. Source commit `0a22ab3e2612d4f888b4f56eac03c0639cac26ae` was pushed and aligned with `origin/main`, and both attached phones were verified Play-installed v58 (`R5CR120QCBF`, `R3CXA0DS5JV`, package `com.chillywood.mobile`, installer `com.android.vending`, versionCode `58`, versionName `1.0.0`). Actual-user call proof is not Closed: the owner said the search problem was fixed separately and not to use the v58 search box until v59, receiver elsewhere-in-app did not visibly show the app-wide incoming call banner on R5, background push/ringing was not proved, and video local/remote proof on both phones was not captured. Same-thread proof is not enough. Source fixed is not installed-app proof. v58 installed is not enough without actual user flow proof. No auth/RLS/chat/account-status permission weakening happened, no service-role chat proof was counted, no provider/live-money mutation happened, and liveMoneyEnabled remains OFF.

Play internal v58 binary delivery: Closed for build and submit to Google Play internal track in `docs/release/PLAY_INTERNAL_V58_BINARY_DELIVERY.md`. EAS Build `b6bbe9d0-5e32-4ef8-b611-f68acec0bd2e` produced Android App Bundle versionCode `58`, runtime `1.0.0`, commit `f6869be8ed37890b564b7d6f2c818283dde923fc`, and EAS Submit `cb94e585-4330-4ed5-999c-a240b68b1f28` submitted to Google Play `internal` track only. This is not a Play production submission and not a provider mutation. Testers must update from Play internal before actual-user Chat/Live proof can close. No physical phone sideload, uninstall/reinstall/clear-data, live money activation, payout/refund execution, auth/RLS/Premium/chat/account-status/staff weakening, First Owner touch, or secrets exposure happened.

Play-internal two-phone Chat/Live proof: Partial in `docs/release/PLAY_INTERNAL_TWO_PHONE_CHAT_LIVE_PROOF.md`. Commit `873bb515e73930ef1b1cb6fb047293e18ce84449` was published by EAS Update to `production`, runtime `1.0.0`, update group `ccf8ee01-efa6-4792-bd4a-bf7e015bcd36`, Android update `019f0c20-a752-7fd2-a61e-c9fa1a27a734`, but installed-app update pickup was not confirmed because both physical Play-internal v57 phones logged `CheckCompleteUnavailable` and the release app is not debuggable for local update DB readback. Both phones were attached and launched from Play internal: `R5CR120QCBF` and `R3CXA0DS5JV`, package `com.chillywood.mobile`, installer `com.android.vending`, version `1.0.0`, versionCode `57`. Supporting automation showed Chat profile-to-chat blocked by visible `Profile unavailable`, and Live blocked by active Premium-required/status gates on both phones. Source fixed and EAS Update published are not installed-app Closed. Actual-user Chat video, fullscreen RTC fit, Live remote video, and Live host controls remain Partial until Robert/testers reproduce them in the Play-internal installed app. No sideload, destructive device action, provider/live-money mutation, auth/RLS/Premium/chat/account-status/staff weakening, or secrets exposure happened.

Cross-lane actual-user product QA sweep: Partial for actual-user installed-app closure. `docs/release/CROSS_LANE_ACTUAL_USER_PRODUCT_QA_SWEEP.md` reviewed recent screenshots, XML, logs, artifacts, release docs, proof scripts, user-facing realtime surfaces, Owner/Admin/Moderator surfaces, and proof-label claims. Small safe visible issues were fixed: Chi'lly Chat remote video now renders from actual stream URL presence instead of stale `cameraOn`, call/room count copy no longer says every peer is `connected`, and Live Stage remote video renders from stream URL presence. Actual-user installed-app proof remains Partial until both physical Play-internal phones pick up this code and reproduce the normal visible Chat Call and Live waiting-room paths. Proof scripts passing is not enough, diagnostic/backend proof is not actual-user proof, and if Robert/testers cannot reproduce it in the Play-internal installed app, it is not actual-user Closed. No auth/RLS/Premium/chat/account-status/staff permission weakening happened, no provider/live-money mutation happened, and liveMoneyEnabled remains OFF.

Chat Call remote-video / Live action UX sweep: Partial for actual-user proof. `docs/release/CHAT_CALL_REMOTE_VIDEO_LIVE_ACTION_UX_SWEEP.md` records source fixes for remote video not appearing, direct Chat fullscreen video layout/control overlap, compact participant metadata, a shared responsive foundation for Direct Chat video, and Live Watch-Party host action controls staying open/stuck after seat update failure. Actual-user installed-app proof remains Partial until both physical Play-internal phones run the updated code and reproduce the normal visible Chat Call and Live waiting-room paths; cross-platform responsive support is not Closed without tested device/simulator coverage. No physical phone sideload, provider mutation, live money activation, payout/refund execution, RLS/Premium/auth weakening, or secrets exposure happened.

Actual-user Chat Call and Live correction: `docs/release/ACTUAL_USER_CHAT_CALL_AND_LIVE_CLOSURE.md` is the current governing realtime result. Diagnostic media and backend readback remain Closed, Watch-Party installed UI remains Closed, but actual-user Chat Call proof is Partial and actual-user Live UI proof is Partial until the EAS update group `bc66e544-d7b8-44d7-8236-9957f378b95a` is confirmed active on the Play-internal phones or shipped in the next Play internal build, then manually rerun through the normal visible app paths. Pre-created thread/call state was not counted as actual-user Closed. `chat_threads` RLS was not weakened. Premium gates were not bypassed or weakened. No service-role chat permission proof was used. No provider mutation happened. liveMoneyEnabled remains OFF.

25 seeded participants realtime proof: Partial in `docs/release/TWENTY_FIVE_SEEDED_PARTICIPANTS_REALTIME_PROOF.md` because diagnostic realtime media/callback proof is Closed while installed-app UI closeout remains Partial. Targeted Watch-Party realtime migration apply: Closed in `docs/release/TARGETED_WATCH_PARTY_REALTIME_MIGRATION_APPLY.md`. Watch-Party realtime callback fix: Closed in `docs/release/WATCH_PARTY_REALTIME_CALLBACK_FIX.md`. Two-client installed-app realtime UI proof: Partial in `docs/release/TWO_CLIENT_INSTALLED_APP_REALTIME_UI_PROOF.md`, with final blocker details in `docs/release/FINAL_INSTALLED_REALTIME_UI_BLOCKERS.md`. The 25 proof-only participant identity pack is Closed. The latest authenticated RLS plus LiveKit RTC-node diagnostic at `/tmp/app-25-seeded-participants-realtime-proof-20260627123814/` proved 25 seeded participant sessions, 25 LiveKit viewer connections, 50 live media subscriptions, chat-call media with 2 subscriptions, Owner/Admin/Moderator publish-authority downgrade to viewer/no-publish, restricted fail-closed behavior, and cleanup. Only `supabase/migrations/20260627131501_watch_party_realtime_publication.sql` was applied to add `watch_party_rooms`, `watch_party_room_memberships`, `watch_party_room_messages`, and `watch_party_sync_events` to `supabase_realtime`; no unrelated pending migrations were applied, no broad `supabase db push` was run, RLS remained enabled, and no money/provider/payout tables changed. Focused Watch-Party artifact `/tmp/app-watch-party-realtime-callback-fix-20260627145327/` shows `SUBSCRIBED`, event emitted after subscription readiness, `watch_party_sync_events` callback observed, and playback readback matched. Two physical Play-internal v57 clients, `R3CXA0DS5JV` and `R5CR120QCBF`, were used in installed-app UI proof and affected reruns; matrix totals are 6 Closed, 3 Partial, 0 Blocked, 0 Failed. Watch-Party installed UI markers are Closed on both phones. Remaining installed-app UI blockers are direct chat-call setup through `chat_threads` RLS after app-safe setup-order repair, and Live participant UI Premium-required/status gates requiring a second Premium-capable seeded client or safe existing proof entitlement path. Premium gates were not bypassed or weakened, `chat_threads` RLS was not weakened, and no auth/account-status/chat permission bypass was added. The owner-approved emulator-only v57 sideload is diagnostic only, not tester delivery or Play proof. No physical tester phone sideload, install/uninstall/reinstall/clear-data, Play production submission, provider mutation, service-role authority proof, First Owner touch, purchase, refund, payout, live money activation, or secret/token/private-data exposure happened.

Stable seeded proof account pack: Closed in `docs/release/STABLE_SEEDED_PROOF_ACCOUNT_PACK.md`. All ten proof-only `@chillywood.test` accounts are created/reused/repaired and proved usable for repeat local proof use, with all credential pairs stored only in ignored `.env.browserstack-monetization.local`. Service-role bootstrap was used only for proof-only account creation/repair and proof-only fixtures; service-role bootstrap is not role/permission authority proof. Owner RPC staff grant path remains the authority proof and was used for Moderator/Admin role/scopes where possible. Seeded account installed login bridge is Closed for every non-restricted seeded proof account in `docs/release/SEEDED_ACCOUNT_INSTALLED_LOGIN_BRIDGE.md`; `proof_restricted_001` fails closed by backed account state as expected. One attached device full app automation proof is Closed for one-device route/control traversal after affected-only closure in `docs/release/FIVE_REMAINING_ONE_DEVICE_TRAVERSAL_BLOCKERS.md`: Play-installed v57 package/launch/readback and seeded UI login passed on `R5CR120QCBF`, with updated status counts Pass `80`, Human review `28`, Blocked `0`, Two-device required `4`, Fail `0`. Prior route-marker/control-proof blockers for normal `/chat`, normal `/admin`, creator `/channel-studio`, creator `/creator-monetization-setup`, and creator `/payouts` are Closed; two-device live/watch-party/chat-call proof remains required. Current First Owner was not touched, no real users were modified, no credentials were printed or committed, no auth bypass/RLS/account-status weakening happened, no provider mutation happened, and live money/payout/provider systems remain OFF/manual/external.

Play internal/closed testing AAB upload + tester smoke: Closed for Play internal v57 install and launch smoke in `docs/release/PLAY_INTERNAL_TEST_AAB_UPLOAD_TESTER_SMOKE.md`. The approved tester delivery path is Google Play internal/closed testing. The sideload v56 APK path was not owner-approved for tester delivery and must not be used for testers. The first Play update failed because a sideloaded v56 APK was installed on device `R5CR120QCBF`; the sideloaded package was removed so the approved Play internal v57 build could be installed. Play internal v57 installed successfully from Google Play with installer `com.android.vending`, package `com.chillywood.mobile`, version `1.0.0`, versionCode `57`, and launched as `com.chillywood.mobile/.MainActivity` with no fatal crash in the captured launch log window. This is install/launch smoke only, not full tester QA; testers still need to run current non-money flows. Future tester delivery must use Google Play internal/closed testing only unless the owner explicitly approves sideload in writing. Play production submission/promotion did not happen. No Google Play product/base-plan mutation, RevenueCat mapping change, Stripe mutation, purchases, provider refunds, Premium public purchase, live money, creator-money, payouts, Stripe Connect, or merch behavior changed.

Android tester binary build / install smoke: Partial in `docs/release/ANDROID_TESTER_BINARY_BUILD_INSTALL_SMOKE.md`. EAS internal Android APK build profile `production-apk` produced build ID `9e31b4b1-bd02-405c-8eeb-7aae3550d598`, package `com.chillywood.mobile`, versionName `1.0.0`, versionCode `56`, runtimeVersion `1.0.0`, and APK SHA-256 `5ab5390291a1556c85b1eda0fb66290181c035f17711d9f316b68070af0ace16`. Install-over-existing attached-device installs failed safely with signature mismatch; no uninstall was performed. Because prior successful tester install was Play/closed-testing, EAS store AAB profile `production` also produced build ID `d7cec74d-95f5-4cf5-be0e-eb53571efc18`, versionCode `57`, runtimeVersion `1.0.0`, and AAB SHA-256 `a71b8a9b8e35a284e62b7843df5c7f16ba94c54487ca63bcf67aba04598c9efa` for Play internal/closed testing upload outside this lane. After install attempts, the owner instructed no use attached device, so no further attached-device install/smoke actions are part of this lane. No production Play submission, provider mutation, purchase, refund, Premium activation, live money, creator-money, payout, Stripe, or merch behavior changed.

Tester build / current runtime delivery: Partial in `docs/release/TESTER_BUILD_CURRENT_RUNTIME_DELIVERY.md`. EAS Update was sufficient and published to branch `production` with update group `4a21c89b-35ca-4997-8c62-28bb20f90469`, runtimeVersion `1.0.0`, and commit `25ecf6d55180144b7202c901c163f9e28e469609`. Installed Android device `R5CR120QCBF` launched package `com.chillywood.mobile`, versionName `1.0.0`, versionCode `55`, installer `com.android.vending`; update uptake was not observed during the short smoke window, so testers should restart on a validated network. This lane did not submit the app to production and did not mutate Google Play, RevenueCat, Stripe, payouts, purchases, refunds, or provider dashboards. Safe public non-money systems remain enabled. Premium public purchase remains OFF. `live_money_enabled` remains OFF. Creator-money remains OFF. Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF. Provider refunds remain manual/external.

Final store/release readiness and Play submission packet alignment: Partial in `docs/release/FINAL_STORE_RELEASE_READINESS_PLAY_SUBMISSION_PACKET.md`. This lane did not submit the app to production. This lane did not mutate Google Play, RevenueCat, Stripe, payouts, purchases, refunds, or provider dashboards. Safe public non-money systems remain enabled. `live_money_enabled` remains OFF. Creator-money remains OFF. Premium public purchase remains OFF. Premium monthly public purchase remains a separate owner-approved proof lane. Premium annual remains Google Play base-plan provider-blocked. Creator Channel Subscription remains Google Play base-plan provider-blocked. Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF. Provider refunds remain manual/external. Data Safety evidence map matches actual app behavior; account deletion is documented and reachable; legal/support/DMCA/privacy/terms surfaces are documented; UGC/reporting/moderation policy is documented; App Access/reviewer packet is sanitized and does not commit credentials; provider dashboard private proof remains owner-confirmation-required; final Play Console acceptance remains owner/store external; final release build/smoke remains a release operation unless explicitly run in this lane.

Provider dashboard ownership and access governance: Partial for actual dashboard proof and Closed for repo-side governance in `docs/ops/PROVIDER_DASHBOARD_OWNERSHIP_ACCESS_GOVERNANCE.md`. First Owner / Owner owns provider dashboard accountability; each provider has a primary owner and backup owner requirement; company-controlled email is required where available; personal accounts are avoided for production ownership; provider roles must be least-privilege; MFA/2FA is required where supported; shared provider dashboard accounts are forbidden where individual access is supported; service accounts are not human staff accounts; API keys and provider secrets must live in secret managers/provider dashboards/EAS/Supabase/GitHub secrets, not repo; provider webhooks must be protected with signature/shared-secret validation where supported; credential rotation calendar and provider offboarding checklist exist; provider support tickets are tracked with sanitized references; provider decisions are mirrored into repo docs with sanitized facts; dashboard access proof remains owner-confirmation-required where repo cannot verify it. This lane did not mutate provider dashboards or activate money/provider/payout systems.

Moderation queue, case management, and escalation governance: Closed for repo-side queue separation, severity/SLA policy, notice templates, exact-scope action governance, proof, and guard coverage in `docs/legal/MODERATION_QUEUE_CASE_MANAGEMENT_ESCALATION_GOVERNANCE.md`. Moderation case operations completion is Closed in `docs/legal/MODERATION_CASE_OPERATIONS_COMPLETION.md`: case assignment is exact-scope/case-bound/audited where backed, internal notes are private/scoped/sanitized/audited where backed and never user-facing, canned reasons are templates only with human review, coordinated-report detection is signals only, repeated-offender aggregation is review/risk flags only, malicious reporting does not expose reporter identity, urgent SLA owner/escalation is documented, and no auto-punishment was added. Reports route to separated queues where appropriate; live safety reports are urgent; DMCA/legal reports are separate from general moderation; payment disputes are support/money cases, not general moderation; appeals are separate from initial moderation review; reporter identity and private evidence are not exposed; safe public non-money systems remain enabled; `live_money_enabled`, creator-money, Premium public purchase, payouts, Stripe Connect, merch checkout, and provider mutation remain OFF/not performed.

Staff access lifecycle, onboarding, and offboarding governance: Closed for repo-side governance in `docs/admin/STAFF_ACCESS_LIFECYCLE_ONBOARDING_OFFBOARDING_GOVERNANCE.md`. Support is not a backend role; support-workflow access is exact-scope permission work; shared staff accounts are forbidden; proof/test accounts are separate from staff accounts; service accounts are not human staff accounts; staff actions must be attributable to one human account; staff access requires Owner/First Owner approval where backed; staff permissions are least-privilege; staff access should be temporary or reviewable by default; staff MFA is required where the identity/provider supports it; monthly staff access review is required; staff removal revokes app roles and scopes where backed; staff removal invalidates sessions where backed and documents manual/future full Auth logout if not backed; offboarding is audited; emergency staff removal is supported or documented as manual/future; provider dashboard offboarding is documented as manual checklist in this lane; no provider dashboard access was changed.

Audit log integrity and privileged action evidence governance: Closed for current repo-side privileged-action evidence governance. Every privileged action must create an audit log where backed; failed or denied privileged attempts are audited where supported; audit logs are append-only from app/admin paths; audit logs cannot be edited or deleted through normal app/admin flows; audit readback requires exact scope; Moderator/support-workflow users cannot browse broad audit history by default; audit logs are privacy-safe and minimized; final proof artifacts include only sanitized audit evidence. Safe public non-money systems remain enabled, `live_money_enabled` remains OFF, creator-money remains OFF, payouts/Stripe/merch remain OFF, and no provider mutation happened.

Public non-money feature enablement: Closed for app-controlled public switchboard, route/copy cleanup, and proof/guard coverage in `docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md`. Safe public app systems are enabled or verified behind existing auth, runtime, Premium, reporting, blocking, account restriction, LiveKit, scan, legal/support, monitoring, and staff-scope gates. `live_money_enabled`, creator-money, payouts/payable balances/withdrawals/cash-out/transfers, Stripe Connect, merch checkout, payout movement, automatic/provider refunds, Premium annual, Creator Channel Subscription, and public Premium monthly purchase remain OFF, blocked, or pending separate owner-approved proof. No provider mutation happened.

Admin search privacy and export governance: Closed for repo-side Admin Search governance, support readback minimization, and export-default denial. Admin search requires exact scope; non-admin and unscoped attempts are denied; searches are audited with masked query preview; failed/denied searches are audited where supported; search results are minimized and bounded/paginated or safely limited; support-workflow readbacks are masked/minimized by default; Moderator does not see full email by default; Admin can see full email only with exact scope; phone/device search is disabled by default unless future case-scoped privacy review approves it; private chat/content evidence search requires exact scope and case/report/legal context; payment/provider search is masked/scoped summary only; deleted/de-identified users are not available in ordinary search; exports are disabled by default and require future Owner-approved audited lane.

Money admin authority and activation governance: Closed for repo-side governance. This lane does not activate money. First Owner / Owner controls activation authority; Premium monthly activation requires a separate owner-approved purchase proof lane; Premium annual remains provider-blocked; creator-money remains OFF; `live_money_enabled` remains OFF; payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF; provider refunds remain manual/external; manual refund support status can be recorded only with exact scope and audit; Admin can view/manage only exact money-support scopes; Moderator cannot activate money; provider transaction/customer/order data is masked/scoped; access grant revoke/removal requires exact scope, reason, target, and audit; dual approval is required for future payout activation and future `live_money_enabled`; emergency money kill switch is First Owner/Owner-controlled and audited; no Google Play, RevenueCat, Stripe, payout, purchase, refund, or product mutation happened.

Emergency controls, incident response, and kill-switch governance: Closed for repo-side governance in `docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md`. Safe public non-money systems remain enabled; emergency actions require exact scope, reason, and audit where backed; First Owner / Owner owns emergency control authority; Admin can operate only exact-scope emergency controls where explicitly allowed; Moderator cannot operate broad emergency controls; post-incident audit review is required; no refunds, purchases, payouts, transfers, or provider mutations are executed by emergency disable.

Date: 2026-06-25

Verdict: Partial / conditional go for the current launch mode.

This checklist excludes the known Google Play subscription base-plan provider blocker from app-controlled launch blocker classification. It does not activate Premium, creator-money, live money, payouts, Stripe, merch, withdrawals, cash-out, transfers, payable balances, provider refunds, or provider product changes.

## Current Launch Mode

- Broad app readiness: Conditional go, with no remaining app-controlled launch blocker found in this audit.
- Premium monthly: Verified at `$9.99/month`; may move to an owner-approved licensed/internal purchase proof lane before public activation.
- Premium annual: External/provider-blocked at `$99.99/year` pending Google Play support response and saved annual base plan.
- Creator-money: OFF. Five one-time products are Draft/readback verified; Creator Channel Subscription is provider-blocked by the same Google Play base-plan issue.
- Payouts, Stripe payouts, merch checkout, withdrawals, cash-out, transfers, payable balances, and refund automation: OFF/manual.
- Role terminology: Locked. Admin is the product-facing role backed by internal `operator`; Support is a work area, not a staff role; Moderator is separate from Admin/operator and can receive support duties through scoped permissions. Moderator role scope: Closed.

## Production Readiness Matrix

| Area | Status | Evidence | Blocker? | Next action |
| --- | --- | --- | --- | --- |
| Store/release | Partial | Package `com.chillywood.mobile`, Android `versionCode 55`, `versionName 1.0.0`; Play/internal installed proof exists in prior launch docs; Google Play support ticket submitted for subscription base plans. | No app-controlled blocker; external provider blocker remains for annual/channel subscription. | Keep release notes, app access instructions, store listing, Data Safety, content rating, target audience/ads disclosure, and Play review materials aligned before production rollout. |
| Auth/account lifecycle | Closed for current launch scope | Final go/no-go and closeout docs record sign-in, sign-out, reset, account deletion, disabled/deactivated denial, purge/de-identification, support/admin audit, and invalid/expired reset safety. | No. | Keep support/admin audit readback in final release smoke. |
| Public/private route safety | Closed for current launch scope | Production guards cover Profile, creator visibility, feed fanout, security context, route/deep-link safety, blocked/private fail-closed behavior, and no raw token/signed URL leakage. | No. | Rerun route/security guards before release cut. |
| Profile/Platform/Brand Studio | Closed | Profile production, Platform Brand Studio, creator video Circle visibility, and creator feed fanout guards are closed; public Platform excludes drafts and Circle-only/private creator content. | No. | Preserve Profile/Platform separation and owner-only draft controls in future work. |
| Creator media/VOD/uploads | Partial but launch-safe with gates | Upload, scan-pending hidden, clean scanned visible, malware/blocked hidden, safe playback resolver, and no raw storage path exposure are guarded; real rendition ladder and some installed attachment-heavy proof remain qualified future proof. | No current launch blocker if claims stay qualified. | Keep malware/content guards passing; finish real rendition/large attachment proof before marketing advanced media quality. |
| LiveKit/watch-party | Closed for current launch scope | `docs/live/LIVE_ROOM_MODERATION_INCIDENT_RESPONSE.md`, Watch-Party LiveKit guard, old-room handling, refresh policy, Live Stage contracts, 4 active camera/mic cap, token authority, live-room incident response, and no unauthorized publish authority are enforced. | No. | Live-room moderation is closed for current backed host controls/token authority. Real-device passive/TURN/cellular scale proof remains a future capacity lane, not a current active-seat launch blocker. |
| Chat/calls/notifications | Closed after validation | `docs/chat/CHAT_CALL_MODERATION_NOTIFICATION_ABUSE.md` and Chi'lly Chat/call/push policies cover exact chat-message reports, dedicated `chat_thread` conversation reports, report-linked chat-message hide/remove/restore, staff evidence scope/case context, blocked/restricted denial, chat-send rate limiting, call/ring dispatch dedupe, notification privacy, safe call metadata, no call content/recording, and scan-gated attachments. | No. | Include message/call/push sanity in release smoke. |
| Monetization/Premium/creator-money | Partial | Premium monthly verified; Premium annual provider-blocked; creator-money switchboard OFF; five one-time creator products Draft/readback verified; Creator Channel Subscription provider-blocked; no creator product maps to Premium. | Premium-first blocker until licensed/internal purchase proof and owner approval; creator-money future blocker. | Do not activate. Wait for owner-approved Premium monthly proof and Google response for annual/channel base plans. |
| Support/refund/dispute | Partial but policy-ready | Final operations runbook covers Premium support, creator-money support, manual/external provider refunds, disputes, paid-content unavailable states, event/room no-show handling, account deletion support, reporting/moderation support handoffs, content takedown access/refund support paths, DMCA/support privacy, and scoped support workflows. Support is not a staff role; Moderator or Admin may receive support scopes. | No for non-money or Premium proof preparation; money launch needs staffed support ownership. | Assign support workflow owner before Premium activation; keep refund execution manual/external. |
| Security/privacy/abuse | Closed for current launch scope | RLS posture, service-role boundary, admin/operator controls, reporting/moderation workflow, DMCA/support privacy, abuse/report/upload/chat/call/room throttles, trusted-network/security context proof, and no secret exposure are guarded. | No. | Keep guard and secret scans in every release lane. |
| Role operations | Closed for current launch scope | First Owner authority, Admin role scope, role terminology lock, Moderator role scope, and staff role hierarchy proof are closed. `operator` is only the internal/backend Admin alias; Support is a work area, not a role; Moderator support duties require exact scopes and backend enforcement. Owner/Admin Command Center UI is closed for current launch scope: `/admin` is the single entry point, production-labeled, fail-closed, privacy-safe, and money/provider/payout-disabled. | No. | Continue the final production readiness checklist with the next unresolved app-controlled launch area. |
| Staff access lifecycle | Closed repo-side / monthly review owner action pending | `docs/admin/STAFF_ACCESS_LIFECYCLE_ONBOARDING_OFFBOARDING_GOVERNANCE.md` documents onboarding approval, least privilege, temporary/reviewable access, MFA where supported, monthly review, app role/scope removal, partial session invalidation, emergency removal, proof/test account separation, service-account separation, shared-account prohibition, and provider-dashboard offboarding manual checklist. | No app-controlled blocker found; provider dashboard offboarding remains manual/future. | Assign monthly reviewer and provider-dashboard owners before broader launch. |
| First Owner authority | Enabled after validation | First Owner authority: Closed / Partial / Blocked. Only First Owner can grant or revoke Owner. First Owner cannot remove himself as the last active Owner. First Owner self-step-down requires successor, password re-auth, generated single-use passcode, typed confirmation, reason, and audit. Normal Owner dashboard viewing is not Break Glass. Break Glass is documented and audited when used. | No app-controlled blocker after migration apply; blocked only if production cannot seed exactly one First Owner marker from existing active Owner state. | Run `proof:first-owner-authority` and `guard:first-owner-authority-policy`; apply migration before production use. |
| Monitoring/analytics/crash | Closed repo-side / external SDK confirmation pending | `docs/monitoring/MONITORING_ANALYTICS_CRASH_RUNTIME_DIAGNOSTICS.md` documents Firebase Analytics/Crashlytics/Performance status, Sentry/PostHog disabled status, sanitized runtime diagnostics, scoped support/admin diagnostics, and incident/health checklist. Runtime error analytics avoid exception message text and root-boundary support feedback avoids raw error text. | No app-controlled blocker found. | Owner confirms final Firebase SDK/provider collection settings, runs release log audit, and monitors Crashlytics/analytics after rollout. |
| Legal/privacy/Data Safety | Closed repo-side / external legal-store acceptance pending | `docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md` aligns Terms, Privacy, DMCA, Support, Account Deletion, Data Safety evidence, Play reviewer packet, Premium/refund posture, reporting/moderation, takedown, live, chat, account restriction, and purge/de-identification truth. This is product/legal-readiness documentation alignment, not attorney legal advice. | No app-controlled blocker found; owner/legal and Play Console acceptance remain external. | Owner/legal final review, SDK/provider disclosure confirmation, Play Console Data Safety/account deletion/content-rating/App Access acceptance, support/account deletion SLA, and public-site redeploy. |
| UX polish/copy | Closed for guarded scope | Critical UX polish guard is passing; docs require no proof/dev/debug copy, no fake readiness claims, clear Premium and creator-money OFF copy, safe unavailable states, empty states, labels/test IDs. | No. | Keep copy guard passing and do not advertise annual/creator-money readiness before provider proof. |
| Build/validation/release gates | Pending this lane validation | Required proof scripts, production guards, typecheck, runtime validation, old-room, refresh, LiveKit, and diff checks are the release gate. Existing `proof:launch-candidate-installed` and `guard:big-app-qa-coverage` are available optional release gates. | Pending validation. | Run the full validation set and commit only if clean. |

## Detailed Checklist

### 1. Store / Release Readiness

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Play internal/closed track status | Partial | Owner decision needed | Prior Play-installed/internal v55 proof exists; final track/rollout decision remains owner-controlled. |
| Package/versionCode | Closed | Already closed | `com.chillywood.mobile`, `versionCode 55`, `versionName 1.0.0`. |
| Installer/readback proof | Closed for current proof | Already closed | Prior Play-installed proof recorded in final go/no-go and Premium proof docs. |
| Release notes | Needs final owner review | Owner decision needed | Prepare final non-provider-claiming release notes before production rollout. |
| Store listing basics | Needs final owner review | Owner decision needed | Confirm listing copy does not claim annual Premium or creator-money launch readiness. |
| Data Safety/privacy consistency | Closed repo-side / external acceptance pending | Owner decision needed | `docs/legal/LEGAL_PRIVACY_DATA_SAFETY_FINAL_ALIGNMENT.md` reconciles Data Safety with actual app behavior; owner/legal must confirm final SDK/provider settings before Play submission. |
| App access instructions | Needs final owner review | Owner decision needed | Keep reviewer credentials and app access instructions current outside repo secrets. |
| Content rating alignment | Needs final owner review | Owner decision needed | No app-controlled mismatch found; owner must confirm Play Console rating. |
| Target audience/ads disclosure | Needs final owner review | Owner decision needed | No in-lane change; confirm store answers match runtime. |
| Google Play policy blockers | Partial | External/provider blocker | Base-plan support ticket submitted; annual/channel subscription remain blocked. |

### 2. Auth / Account Lifecycle

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Sign in / sign out / sign up | Closed | Already closed | Covered by final readiness and account guard history. |
| Password reset | Closed | Already closed | Provider reset proof and invalid/expired reset safety documented. |
| Account deletion / restore / controlled purge | Closed | Already closed | Account purge/de-identification and deletion restore lanes documented. |
| Disabled/deactivated account denial | Closed | Already closed | Disabled/admin denial proof recorded in final readiness docs. |
| Support/admin audit readback | Closed | Already closed | Admin/support audit boundaries documented and guarded. |

### 3. Public / Private Route Safety

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Signed-out public/private routes | Closed | Already closed | Public/private route safety and Profile production guard are closed. |
| Deep-link / notification handoff safety | Closed | Already closed | Route contracts and final readiness docs cover fail-closed handoffs. |
| Blocked/deleted/scheduled-deletion denial | Closed | Already closed | Block/private/deleted content fail-closed behavior is guarded. |
| Token/signed URL leakage | Closed | Already closed | Security context and creator media guards forbid raw token/storage URL exposure. |

### 4. Profile / Platform / Brand Studio

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Profile vs Platform separation | Closed | Already closed | `guard:profile-production-policy` and Platform Brand Studio guard closed. |
| Public Platform draft exclusion | Closed | Already closed | Creator visibility and feed fanout guards closed. |
| Profile privacy/blocked behavior | Closed | Already closed | Profile production guard closed. |
| Profile media safety | Closed | Already closed | Guarded raw-path and private-safe rendering contracts. |
| Brand Studio draft/publish/readback | Closed | Already closed | Platform Brand Studio guard closed. |

### 5. Creator Media / VOD / Uploads

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Upload path and non-zero media proof | Partial | Post-launch polish | Current gates are launch-safe; broader installed media proof remains qualified. |
| Draft/private/public visibility | Closed | Already closed | Creator Circle visibility and feed fanout guards closed. |
| Scan-pending/clean/malware behavior | Closed for current launch scope | Already closed | Scan gates hide pending/blocked and allow clean scanned media. |
| Deletion/cleanup | Closed for current launch scope | Already closed | Final closeout docs cover deletion/cleanup posture. |
| Playback resolver / raw path safety | Closed | Already closed | Public resolver must not return raw playback URL, storage path, or object key. |
| Rendition/quality and heavy attachments | Partial | Post-launch polish | Do not overclaim quality ladder or attachment-heavy readiness until final installed proof. |

### 6. Watch-Party Live / LiveKit

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Route ownership and Live Stage flow | Closed | Already closed | Watch-Party LiveKit and Live Stage guards cover route ownership. |
| Shared player / old room handling | Closed | Already closed | Old-room handling guard required in validation. |
| Seat request/approval and 4 active cap | Closed | Already closed | Live Stage seat approval and active camera/mic cap are guarded. |
| Token authority / metrics | Closed | Already closed | LiveKit authority and metrics guards are part of proof history. |
| Passive viewer proof | Partial | Post-launch polish | Synthetic/passive proof closed; larger real-device capacity proof remains future. |

### 7. Chi'lly Chat / Calls / Notifications

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Inbox/thread/direct message basics | Closed | Already closed | Final readiness docs, `docs/chat/CHAT_CALL_MODERATION_NOTIFICATION_ABUSE.md`, and chat/call/push guard history. |
| Blocked chat denial | Closed | Already closed | Block enforcement remains required and guarded. |
| Call/ring dispatch and dedupe | Closed | Already closed | Call/push policy guard history covers dispatch/dedupe. |
| Disabled/deactivated denial and push safety | Closed | Already closed | Disabled user denial and private-data-safe push posture documented. |
| Chat/call moderation and notification abuse controls | Closed after validation | Already closed | Exact chat-message reporting is wired; dedicated `chat_thread` reporting is wired; report-linked `chat_message` hide/remove/restore is backed with exact scope, reason, case/report context, audit, and evidence preservation; staff private chat evidence is exact-scope and case/report scoped; blocked/disabled/deleted users fail closed; call/ring notifications are deduped/rate-limited; call content/recording is absent; attachments remain scan-gated. |

### 8. Monetization / Premium / Creator-Money

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Premium monthly | Verified | Already closed | Google Play `premium_subscription:monthly`, United States, USD 9.99; RevenueCat `$rc_monthly` maps to `premium`. |
| Premium annual | Provider-blocked | External/provider blocker | Google Play base-plan save/ID validation issue; support packet submitted, case ID pending. |
| Premium purchase proof | Pending | Premium-first blocker | Requires owner-approved licensed/internal purchase proof before public activation. |
| Creator-money switchboard | OFF | Already closed | All creator-money switches OFF; `live_money_enabled` OFF. |
| Five one-time creator products | Draft/readback verified | Creator-money future blocker | Products remain Draft; RevenueCat Draft consumables; no Premium mapping. |
| Creator Channel Subscription | Provider-blocked | External/provider blocker | Product exists; monthly base plan missing; RevenueCat mapping blocked. |
| Payouts/refunds/Stripe | OFF/manual | Already closed | Payouts and Stripe future-only; provider refunds manual/external. |

### 9. Refund / Support / Dispute Operations

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Premium support/restore/manage/cancel | Policy-ready | Premium-first blocker | Must be staffed and smoke-tested during licensed/internal purchase proof. |
| Creator-money support | Future-ready only | Creator-money future blocker | Do not activate creator-money until support/refund/dispute proof is run. |
| Manual/external refunds | Closed | Already closed | No provider refund execution or automation enabled. |
| Paid content unavailable / event no-show | Policy-ready | Creator-money future blocker | Keep manual support review until future activation lanes. |
| DMCA/support privacy | Closed | Already closed | Support privacy and DMCA posture documented. |

### 10. Security / Privacy / Abuse

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| RLS/service-role/admin boundaries | Closed | Already closed | No weakening in this lane; guards and docs require strict boundaries. |
| Abuse/report/upload/chat/call/room throttles | Closed | Already closed | No throttle removal; final guards cover abuse posture. |
| Trusted-network/security context | Closed | Already closed | Security context proxy proof guard closed. |
| No public raw IP/security context leakage | Closed | Already closed | Security context guard closed. |
| No committed secrets | Pending validation | Build/release gate | Secret scan artifact and diff review required before commit. |

### 11. Monitoring / Analytics / Crash

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Firebase Analytics / Crashlytics / Performance | Closed repo-side / external SDK confirmation pending | Owner decision needed | Firebase packages/helpers/bootstrap are documented; final production dashboard owner review and provider collection confirmation remain external. |
| PII-safe diagnostics | Closed | Already closed | Runtime unavailable and root error copy stay sanitized; runtime error analytics do not carry exception message text. |
| Production health checklist | Closed repo-side | Owner decision needed | Run immediately before and after any rollout using `docs/monitoring/MONITORING_ANALYTICS_CRASH_RUNTIME_DIAGNOSTICS.md`. |

### 12. Legal / Policy / Content Moderation

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Terms / Privacy / DMCA / Support | Closed repo-side / external legal review pending | Owner decision needed | Public legal surfaces stay free of proof/debug/internal public copy; owner/legal final review required. |
| Legal/privacy/Data Safety final alignment | Closed repo-side | Already closed | Legal/privacy/Data Safety final alignment: Closed for repo-side documentation alignment. This is product/legal-readiness documentation alignment, not attorney legal advice. Account deletion uses scheduled deletion, restore window where supported, and controlled purge/de-identification; evidence retention exceptions are preserved; Premium annual remains provider-blocked; creator-money remains OFF; provider refunds remain manual/external; no payouts/Stripe/merch/money movement are live. |
| Account deletion policy | Closed for current launch scope | Already closed | Account lifecycle proof recorded. |
| Account restriction and appeals | Closed after validation | Already closed | Account restriction and appeals operations: Closed for current production policy and existing backed enforcement. Reports do not auto-suspend or auto-ban. Suspension/deactivation/restore require exact scope, reason, target, and audit. First Owner cannot be suspended, deactivated, deleted, restored, or restricted by Admin/Moderator. Moderator cannot perform account-wide suspension/restoration by default. Restricted users fail closed for private app features where backed, Premium entitlement may remain provider-side while app access fails closed, paid-access/payment history is preserved, provider refunds remain manual/external, payouts and money movement remain disabled, and appeals use support/escalation workflow in V1 without exposing reporter identity or private evidence. |
| Content rights and creator upload disclosure | Partial | Owner decision needed | Keep rights posture and moderation copy aligned before public creator expansion. |
| Moderation/reporting | Closed after validation | Already closed | Users can report profiles, Profile media, Platform content, videos, paid videos, live rooms, exact chat messages, whole chat conversations, comments, replies, specific events, and VIP/subscriber content where the surface exists. Dedicated event report affordance: Closed after validation. Exact chat-message report affordance: Closed after validation. Dedicated chat_thread report target: Closed after validation. Chat-message hide/remove/restore: Closed after validation. Content takedown decisions: Closed for production decision policy and current backed enforcement after validation. Live-room moderation and incident response: Closed for production policy, current backed host controls, LiveKit token authority, and incident-response proof after validation. Chat/call moderation and notification abuse controls: Closed after validation. Normal reports, DMCA/legal, support, money/refund/access support, security incidents, live safety incidents, notification-abuse incidents, and appeals are separated. Reporter identity stays private by default, duplicate/false reports are deduped and rate-limited, reports do not auto-delete content, evidence/access history are preserved, and staff access requires exact scopes plus case/report context. |

### 13. UX Polish / Production Copy

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| No proof/dev/debug copy | Closed for guarded scope | Already closed | Critical UX polish guard closed. |
| No user-facing entity leaks | Closed for guarded scope | Already closed | Critical UX polish guard closed. |
| No fake readiness claims | Closed for current docs after this lane | Already closed | Stale support-packet wording corrected from prepared to submitted. |
| Premium UI clarity | Partial | Premium-first blocker | Do not advertise annual until provider-backed; run licensed/internal proof before launch. |
| Creator-money OFF clarity | Closed | Already closed | Creator-money remains OFF and future-only in docs. |

### 14. Build / Validation / Release Gates

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Proof scripts | Pending validation | Build/release gate | Run required final proof commands in this lane. |
| Production guards | Pending validation | Build/release gate | Run required production guards in this lane. |
| Typecheck/runtime validation | Pending validation | Build/release gate | `npm run typecheck` and `npm run validate:runtime`. |
| Old-room/refresh/LiveKit guards | Pending validation | Build/release gate | Run requested guard set. |
| Diff checks | Pending validation | Build/release gate | `git diff --check` and `git diff --cached --check`. |
| Clean tracked tree / push status | Pending commit | Build/release gate | Commit only intended files if validation is clean. |

## Launch Blocker Matrix

| Blocker | Severity | Owner | App-controlled? | External/provider? | Recommended action |
| --- | --- | --- | --- | --- | --- |
| Premium annual base plan does not save | External/provider blocker | Owner / Google Play Support | No | Yes | Track submitted support ticket, capture case ID, retry only in a separate approved provider lane. |
| Creator Channel Subscription base plan does not save | External/provider blocker / creator-money future blocker | Owner / Google Play Support | No | Yes | Keep creator-money OFF; resolve with Google before channel subscription activation. |
| Premium licensed/internal purchase proof not yet run for launch | Premium-first blocker | Owner / app operator | Yes, after owner approval | Provider involved | Run bounded licensed/internal Premium monthly proof; do not public activate before proof. |
| Premium public activation decision | Owner decision needed | Owner | Yes | No | Owner approves rollout window, switch scope, support owner, monitoring owner, rollback owner. |
| Creator-money activation | Creator-money future blocker | Owner | Yes | Provider involved | Keep OFF until products are verified/active, mapped, smoke-tested, and owner-approved. |
| Payouts / Stripe / merch | Future blocker only | Owner | Yes | Provider involved | Keep OFF; run separate payout/merch lanes later. |
| Final legal/store review | Owner decision needed | Owner/legal | No | Store/legal involved | Owner/legal review store listing, Data Safety, legal surfaces, app access instructions. |
| Media quality/large attachment and passive-scale proof | Post-launch polish | App operator | Yes | Device/provider involved | Finish before marketing advanced media/scale claims; not a blocker for current gated launch mode. |

## Premium-First Recommendation

Do not publicly activate Premium in this lane. Premium monthly is provider-ready at `$9.99/month`, but Premium-first launch still needs an owner-approved licensed/internal purchase proof covering product load, purchase sheet, licensed tester purchase, RevenueCat entitlement readback, restore/manage/cancel, gated feature unlock, revoke/expiration denial where possible, rollback, monitoring, and support ownership.

Premium annual remains external/provider-blocked. A monthly-only Premium launch can be considered only if the owner explicitly accepts launching without annual and the app does not advertise annual availability.

## Creator-Money Recommendation

Do not activate creator-money. Tips, Paid Video, Watch-Party Seat Pass, VIP, and Event Pass remain Draft/readback verified but OFF. Creator Channel Subscription cannot activate until Google Play creates the `monthly` base plan and RevenueCat imports/maps `cw_channel_subscription_monthly_499:monthly` without Premium mapping. Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and provider refund automation remain OFF/manual.

## Owner Decision List

1. Track the Google Play support ticket and record the case ID when provided.
2. Decide whether Premium monthly may move to licensed/internal proof while annual remains blocked, or whether Premium launch must wait for annual.
3. Approve the bounded Premium monthly licensed/internal proof lane, including tester account, rollout scope, support owner, monitoring owner, and rollback owner.
4. Complete final store/legal review: release notes, app access, Data Safety/privacy, content rating, target audience/ads answers, Terms, Privacy, DMCA, Support, and account deletion surfaces.
5. Keep creator-money, payouts, Stripe payouts, merch, and refund automation in future owner-approved lanes.

## Fixes Applied

- Added this final production readiness checklist.
- Corrected stale docs that said the Google Play support packet was only prepared; it was submitted through Google Play Console Help on 2026-06-25 at 12:25 CDT, with case ID pending.

## Safety Confirmation

- No provider dashboard mutation.
- No Premium public activation.
- No creator-money switches enabled.
- No `live_money_enabled`.
- No payouts, payable balances, withdrawals, cash-out, transfers, payout batches, Stripe Connect, or merch checkout.
- No provider refunds.
- No RevenueCat mapping change.
- No Premium product, pricing, entitlement, or offering change.
- No RLS weakening.
- No LiveKit authority loosening.
- No auth/reset weakening.
- No scan-gate weakening.
- No abuse-throttle removal.
- No block-enforcement weakening.
- No secrets committed.
- First Owner controls are enabled for authenticated First Owner after validation.
- No plaintext passcodes stored.
- No raw IP/token/signed URL exposure added.

## Admin Role Scope Closeout

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Admin role scope | Closed | Already closed | Admin is a real production role backed by `platform_role_memberships.role = 'operator'` and scoped grants. |
| Admin permissions | Closed | Already closed | Admin permissions are scoped and granted by Owner/First Owner through `platform_staff_permission_grants`. |
| Backend denial | Closed | Already closed | Backend denies non-admin and unscoped-admin attempts even if UI is bypassed. |
| Owner/First Owner boundary | Closed | Already closed | Admin cannot grant or revoke Owner, cannot alter First Owner succession, and cannot remove, demote, delete, or deactivate First Owner. |
| Money/provider boundary | Closed | Already closed | Admin cannot enable money/provider/payout systems and cannot execute provider refunds. |
| Refund status boundary | Closed | Already closed | Admin can record manual/external refund status only with permission; provider refunds remain manual/external. |
| Destructive actions | Closed | Already closed | Admin destructive actions require permission, reason, confirmation, and audit. |
| Admin UI buttons | Closed | Already closed | Broken Admin buttons are wired or open active access/status/resolution flows. |
| Private data safety | Closed | Already closed | No secrets, tokens, signed URLs, raw IPs, tax IDs, bank details, or provider secrets are exposed. |

## Every Visible Surface Active Wiring

## Native Chi'lly Chat CallStyle Proof Update

Google Play-installed v77 native CallStyle proof is Partial. Core background active incoming-call behavior is now installed-proved: both physical phones were visible, Google Play-installed from `com.android.vending`, and on versionCode `77`; active background voice/video calls delivered CallStyle notifications on `chilly_chat_calls_fullscreen_v1` with `Answer` and `Decline`; native Answer and Decline worked; same-thread Accept did not hit an unavailable room; and normal in-app Settings received the full incoming modal. Remaining readiness gaps are narrow: fresh room-safe regression with a current safe room fixture, clean missed-call timeout/expiry capture, and separate locked-screen full-screen visual proof if that is required for launch claims.

Every visible surface active wiring audit: Closed. No visible clickable dead buttons are allowed. Nothing visible should be hidden or disabled. Every visible control works, routes correctly, opens a setup/status/resolution flow, opens a support/review flow, or starts a tester-safe flow. Permission scopes must unlock backed behavior.

Tester-visible monetization UX is separate from live money settlement. Premium monthly tester flow is reachable where Play internal/licensed tester/provider setup supports it. Premium annual opens an active provider-blocked status/resolution flow. Creator Channel Subscription opens an active provider-blocked status/resolution flow. liveMoneyEnabled remains OFF. Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF. No Google Play, RevenueCat, Stripe, payout, refund, purchase, or provider mutation happened.

## Visible Surface Tester Delivery

Visible-surface active wiring tester delivery: Closed. Commit 7138dd2 was pushed to origin/main before delivery. Delivery classification was EAS Update eligible, and EAS Update group `d7aac53c-65bb-4bf7-ae69-04bfea248e0a` / Android update `019f0533-920e-7fca-8f45-74b1f538040a` was published to branch `production` for runtime `1.0.0`.

Play internal/closed testing remains the approved tester path. Sideload is not an approved tester delivery path. No APK sideload was used. No app uninstall/reinstall/clear-data happened unless explicitly owner-approved. Testers must verify visible controls in the installed tester build. No Play production submission happened. No provider mutation happened. liveMoneyEnabled remains OFF. Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF. Premium annual remains provider-blocked. Creator Channel Subscription remains provider-blocked.

## Room-Safe Notifications And Calls

Source-closed on June 30, 2026; installed-app proof remains pending until a future Google Play internal build. Notification bell is icon-only. Bell badge is backed by real notification unread summary. Normal app surfaces show the bell next to existing header actions. Room/live surfaces use room-safe notification tray/banner behavior.

Incoming Chi'lly Chat calls do not auto-answer. Incoming calls do not auto-leave or hijack room mic/camera. Leave room and answer requires explicit user action. Hosts receive an extra confirmation before leaving a hosted live room. Chat remains conversation-only. Money Center remains creator business home. Notifications guide users to routes; they do not grant access. Destination routes re-check access. liveMoneyEnabled remains OFF. Payouts and cashout remain OFF.

Last two notification commits were audited together. Creator-money notification records and room-safe bell/call behavior are source/backend aligned. Remote migration status verified. Changed Edge functions deployed or verified unchanged; `revenuecat-webhook` is ACTIVE version 18. Installed-app proof remains pending. Source/backend readiness is not installed-app proof. Google Play internal build is still required for visible device closure.
