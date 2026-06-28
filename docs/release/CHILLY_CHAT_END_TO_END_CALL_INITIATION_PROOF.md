# Chi'lly Chat End-to-End Call Initiation Proof

Chi’lly Chat end-to-end call initiation proof: Closed / Partial / Blocked

Final verdict: Partial.

Source is fixed for normal visible call initiation paths. Installed-app actual-user proof remains Partial until a Play-internal build containing these source changes is installed on both tester phones and proves receiver ringing from same-thread, elsewhere-in-app, and background states.

June 28, 2026 v58 installed-app follow-up: `docs/release/CHILLY_CHAT_PLAY_V58_ACTUAL_USER_CALL_PROOF.md` is Partial. Both attached phones were Play-installed v58 from `com.android.vending`, and source commit `0a22ab3e2612d4f888b4f56eac03c0639cac26ae` was pushed/aligned with `origin/main`, but v58 actual-user call proof did not close. The owner confirmed the search problem was fixed separately and instructed not to use the v58 search box again until a v59 Play-internal build. No search-box-dependent v58 result is counted as Closed. Receiver elsewhere-in-app banner and background push/ringing remain Partial.

June 28, 2026 v59 Google Play internal follow-up: `docs/release/CHILLY_CHAT_GOOGLE_PLAY_INTERNAL_CALL_CLOSURE.md` is Partial. Both physical phones updated to Play-installed versionCode `59` from `com.android.vending`, and sessions survived without logout, uninstall, reinstall, clear-data, or sideload. Actual-user call proof did not close because no fresh v59 voice/video call completed through normal visible paths with receiver-visible incoming state, background push/ringing, local/remote video, fullscreen fit, and call cleanup proof.

June 28, 2026 `user230455` follow-up: installed v59 Chat People search can find the updated normal-user handle `user230455`, but tapping `Chi'lly Chat` or `Voice Call` from that visible result fails before direct-thread open/create. Owner evidence also showed Settings current handle `@user230455` while Profile/Chat still displayed stale `@user230456`. Source now fixes signed-in profile cache freshness, Settings handle cache persistence, direct-thread username enrichment, and authenticated direct-thread open/create repair, but source fixed is not installed-app proof.

June 28, 2026 v60 Google-signed receiver banner thread-readback + video layout follow-up: `docs/release/GOOGLE_SIGNED_V60_DIRECT_CHAT_CALL_PROOF.md` is Partial. Both phones are Play-installed versionCode `60` from `com.android.vending`; visible Chat search for `user230455` opens the direct thread after live authenticated RPC ambiguity fixes; caller can start a voice call; and receiver elsewhere in app sees an app-wide incoming call banner. A live receiver readback migration fixed the installed blocker where tapping the receiver banner opened `This Chi'lly Chat thread could not be found.`; after the fix, the receiver tapped the banner and both phones showed `2 in call`. Source now fixes the observed video layout issue where the lower feed could be cut off by bottom controls and the participant metadata card blocked too much video. Actual-user call closure is still not Closed because installed v60 recorded a false `Missed voice call` after the joined call ended, the cleanup/video layout source fixes are not installed in Google Play yet, and video/background/same-thread/full cleanup matrices remain incomplete.

## Required Proof Doctrine

Same-thread proof is not enough.

Users must be able to start Voice/Video Call without both phones already inside the same thread.

Pre-created thread/call state is not actual-user proof.

Receiver elsewhere in app must get app-wide incoming call state or remain Partial.

Background push/ringing must be proved separately or remain Partial.

Source fixed is not installed-app proof.

## Root Cause

The prior Chi'lly Chat call lane proved only a narrow thread-local path. A caller could start a call after both devices were already in the same thread, but the product path was incomplete for a real user who starts from the inbox/search path or profile path.

The source gaps were:

- Chi'lly Chat inbox people search routed new people profile-first instead of making search a true start-chat surface that opens or creates a direct thread and can begin Voice Call or Video Call.
- Receiver elsewhere-in-app ringing depended on foreground push notification delivery instead of also listening to real `chat_call_invites` rows for the signed-in callee.
- If call invite creation failed after the communication room and active thread state were created, the caller could still be left with local active-call UI. That is not acceptable because the receiver-visible invite state was not saved.
- Deep-linked profile unavailable state could block profile-only proof, even though normal in-app profile navigation has a separate working path.

## Normal Supported Call-Start Paths

1. Chi'lly Chat inbox/start-chat path: `/chat` search results now expose `Chi'lly Chat`, `Voice Call`, and `Video Call` actions for normal people results. New direct threads are opened through `getOrCreateDirectThread()`, then `/chat/[threadId]` receives optional `startCall=voice` or `startCall=video`.

2. Existing direct thread path: `/chat/[threadId]` keeps visible `Voice Call` and `Video Call` actions. The thread call path starts from real membership, writes active thread call state, creates `chat_call_invites`, and shows caller delivery status.

3. Profile path: normal in-app profile surfaces keep `Chi'lly Chat`, `Voice Call`, and `Video Call` actions for non-official user profiles. These actions use `getOrCreateDirectThread()` and pass `startCall` when a call is requested.

4. Deep-link fallback: if a profile route has a valid target route but backed public profile data is unavailable, the profile screen does not fake profile content. It shows a limited unavailable shell and routes the user to Chi'lly Chat search/start-chat fallback.

## Same-Thread Proof Result

Status: Source fixed, installed-app proof pending.

When Phone B is already inside the same direct thread, the thread-local subscription still reads real `chat_call_invites` and active thread call state. Phone B can accept from the in-thread incoming call sheet, and ending as host clears `chat_threads.active_communication_room_id` / `active_call_type`.

This remains installed-app Partial for this lane until both Play-internal phones run the updated build and prove the full flow without pre-created thread/call state.

## Receiver Elsewhere In App Proof Result

Status: Source fixed, installed-app proof pending.

`app/_layout.tsx` now subscribes to real ringing `chat_call_invites` for the signed-in callee through `subscribeToIncomingChillyChatCallInvites()`. It reads the latest non-expired invite with `readLatestRingingChillyChatCallInviteForCallee()` and shows the existing app-wide incoming call banner. Tapping the banner opens `/chat/[threadId]` with `openCall=1`.

This is real invite state, not pre-created state. It is still installed-app Partial until a Play-internal build proves Phone B receives the app-wide banner while signed in but away from the thread.

## Background/Push Proof Result

Status: Partial.

The source still dispatches incoming and missed call pushes through `chilly-chat-call-dispatch`, Android call channels remain configured, and caller delivery status distinguishes push sent, in-app banner available, push unconfirmed, invite failed, and receiver unavailable.

Background push/ringing is not Closed here. It must be proved separately on an installed Play-internal build with Phone B backgrounded/outside the app. If push cannot be proved, the caller must retain clear delivery status such as push unconfirmed/not available.

## Profile Normal Path Result

Status: Source fixed.

Normal in-app profile navigation supports:

- `Chi'lly Chat`
- `Voice Call`
- `Video Call`

Those profile actions call `getOrCreateDirectThread()` and navigate to the direct thread. Voice/video profile entries pass `startCall` so the thread starts the requested call after it loads.

## Profile Deep-Link Fallback Result

Status: Source fixed as a limited fallback.

Deep-linked profile unavailable state is documented separately from normal profile behavior. The fallback does not invent display name, avatar, profile posts, media, or public profile data. It shows a limited shell and an `Open Chi'lly Chat` action to the normal Chat search/start-chat path.

Profile unavailable from a deep link is not proof that normal in-app profile navigation is broken.

## Source Fixes Made

- `_lib/chillyChatCalls.ts`: added `readLatestRingingChillyChatCallInviteForCallee()` and `subscribeToIncomingChillyChatCallInvites()` so app-wide ringing can be driven by real callee invite rows.
- `_lib/chat.ts`: `startChatThreadCall()` now requires a callee, still fails if receiver-visible thread state is not saved, and now clears active state plus ends the new room if the invite row cannot be saved.
- `_lib/notifications.ts`: foreground call alerts carry optional invite ids for dedupe between push and realtime invite paths.
- `app/_layout.tsx`: app-wide incoming call banner now also listens to realtime `chat_call_invites` for the signed-in receiver.
- `app/chat/index.tsx`: inbox search results now open/create direct threads and expose visible Chi'lly Chat, Voice Call, and Video Call actions.
- `app/chat/[threadId].tsx`: caller delivery status now distinguishes push sent, in-app banner available, push unconfirmed, receiver unavailable, and invite failed without raw backend/provider errors.
- `app/profile/[userId].tsx`: deep-link unavailable profile fallback now routes to Chat search without faking profile content.
- `supabase/functions/chilly-chat-call-dispatch/index.ts`: account-restricted call participants now return an explicit blocked/receiver-unavailable delivery result instead of a generic function failure.
- `scripts/proof-chilly-chat-end-to-end-call-initiation.mjs`: added source/proof check.
- `scripts/guard-chilly-chat-end-to-end-call-initiation-policy.mjs`: added overclaim/safety guard.

## Installed-App Proof Result

Status: Partial.

Required phones:

- `R5CR120QCBF`
- `R3CXA0DS5JV`

Installed proof is not Closed until both phones run a Play-internal build containing this updated source, installer is verified as `com.android.vending`, and the normal visible paths are exercised:

- Inbox/search start-chat path creates/opens thread and starts Voice/Video Call.
- Existing thread starts Voice/Video Call.
- Normal profile path starts Chat/Voice/Video.
- Receiver same-thread joins and end clears state.
- Receiver elsewhere in app sees app-wide incoming call state and can join.
- Receiver backgrounded/outside app gets Android push/ring notification, or caller shows push unconfirmed/not available.

Source fixed is not installed-app proof.

Read-only installed metadata captured on June 28, 2026:

- `R5CR120QCBF`: package `com.chillywood.mobile`, installer `com.android.vending`, versionName `1.0.0`, versionCode `58`, first install time `2026-06-26 01:26:01`, last update time `2026-06-28 00:44:51`. This was updated through Google Play internal testing, not ADB sideload.
- `R3CXA0DS5JV`: package `com.chillywood.mobile`, installer `com.android.vending`, versionName `1.0.0`, versionCode `58`, last update time `2026-06-27 23:58:50`.

Because both phones have not completed the receiver proof flows on an installed build verified to contain this source patch, installed-app actual-user proof remains Partial.

## Remaining Blockers

- Build and install a Play-internal version containing these source changes, v58 or newer if versionCode 58 is the next release.
- Confirm both tester phones show installer `com.android.vending`.
- Run same-thread, elsewhere-in-app, and background/push receiver proof on installed app.
- Capture screenshots/XML/logs for all three receiver states.

## Screenshots/XML/Log Artifact Paths

Current source-lane validation artifact root:

- `/tmp/chillywood-chilly-chat-end-to-end-call-initiation-20260628/`
- `/tmp/chillywood-chilly-chat-end-to-end-call-initiation-20260628/adb-devices.txt`
- `/tmp/chillywood-chilly-chat-end-to-end-call-initiation-20260628/R5CR120QCBF-package.txt`
- `/tmp/chillywood-chilly-chat-end-to-end-call-initiation-20260628/R5CR120QCBF-package-after-play-v58.txt`
- `/tmp/chillywood-chilly-chat-end-to-end-call-initiation-20260628/R5CR120QCBF-play-v58-screen.png`
- `/tmp/chillywood-chilly-chat-end-to-end-call-initiation-20260628/R3CXA0DS5JV-package.txt`
- `/tmp/chillywood-chilly-chat-end-to-end-call-initiation-20260628/proof-chilly-chat-end-to-end-call-initiation.log`
- `/tmp/chillywood-chilly-chat-end-to-end-call-initiation-20260628/guard-chilly-chat-end-to-end-call-initiation-policy.log`
- `/tmp/chillywood-chilly-chat-end-to-end-call-initiation-20260628/validation-commands.log`

Expected installed proof artifacts after Play-internal build pickup:

- `/tmp/chillywood-chilly-chat-end-to-end-call-initiation-20260628/device-a-inbox-search-start-call.png`
- `/tmp/chillywood-chilly-chat-end-to-end-call-initiation-20260628/device-b-app-wide-incoming-call-banner.png`
- `/tmp/chillywood-chilly-chat-end-to-end-call-initiation-20260628/device-b-background-call-notification.png`
- `/tmp/chillywood-chilly-chat-end-to-end-call-initiation-20260628/device-a-call-delivery-status.xml`
- `/tmp/chillywood-chilly-chat-end-to-end-call-initiation-20260628/validation-commands.log`

If these installed artifacts are absent, installed-app proof remains Partial.

## Safety Confirmation

No auth/RLS/chat/account-status permission weakening happened.

No service-role chat proof was counted.

No provider/live-money mutation happened.

liveMoneyEnabled remains OFF.

No physical tester phone sideload, uninstall, reinstall, or clear-data is required for this source lane.

No raw IDs, tokens, signed URLs, raw IPs, provider IDs, secrets, or private data are required in proof artifacts.

No current First Owner change happened.
