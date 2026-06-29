# Google-Signed v64 Chat Thread Hide Proof

Verdict: Closed.

The source/schema/RPC feature is implemented and Google Play internal versionCode `64` proved the actual-user hide/reopen flow plus the remaining two-phone checks. `R5CR120QCBF` and `R3CXA0DS5JV` were both Google Play-installed from `com.android.vending`, stayed signed in, and completed the per-user hide, other-participant copy, message/call history preservation, duplicate-prevention, and newer-message reappear proof.

## Build And Install

- Repo commit proved: `5c21c3b4282fa45a2f62106deba68d944b6024e4`.
- Follow-up proof commit before this closeout: `4fb2cc60d38ee8a3c4ab68b9a87e431a2584e8f5`.
- Origin/main alignment before proof completion: clean tracked tree, `HEAD == origin/main`.
- EAS build: `c3fd4029-48b4-49ad-a1a4-7a33fbfbad84`.
- EAS submit: `cbcaae0e-650e-4c5d-a3c7-9b5ab819a8c1`.
- Track: Google Play internal testing only.
- Version: `1.0.0`.
- VersionCode: `64`.
- Artifact type: Android App Bundle / Google Play store build.
- Play production submission: not performed.

Device install proof:

| Device | Result |
| --- | --- |
| `R5CR120QCBF` | Pass: package `com.chillywood.mobile`, versionCode `64`, versionName `1.0.0`, `installerPackageName=com.android.vending`, lastUpdateTime `2026-06-29 02:32:57`. |
| `R3CXA0DS5JV` | Pass: R3 ADB was recovered, the device was updated through Google Play internal only, and package readback showed `com.chillywood.mobile`, versionCode `64`, versionName `1.0.0`, `installerPackageName=com.android.vending`, lastUpdateTime `2026-06-29 08:20:56`. |

No sideload, manual APK install, adb install, uninstall, reinstall, logout, or clear-data action was used for the installed proof. A force-stop/relaunch was used only to clear a transient UI state on `R5CR120QCBF`; the signed-in session remained intact and no app data was reset.

## Supabase Verification

`supabase migration list` and `supabase db push --dry-run` were clean before build/proof and again during this closeout validation. The live target has the hide-thread migration in history, including `chat_thread_members.hidden_at`, `hide_chat_thread_from_inbox(text)`, and `unhide_chat_thread_for_me(text)`.

The RPCs are authenticated-user scoped. They update only the caller's `chat_thread_members` row and do not hard-delete `chat_threads`, `chat_messages`, `chat_call_events`, `chat_call_invites`, or the other participant's inbox copy.

## Actual-User Flow

Delete from my inbox is a per-user hide, not a hard delete. The other participant's copy is not deleted. Message and call history are preserved. Hidden direct threads must not create duplicate direct threads. Profile/Search -> Chi'lly Chat must reopen the existing direct thread. New message reappear is Closed only if a hidden thread reappears after newer message activity.

The initial v64 proof on `R5CR120QCBF` passed long-press thread action sheet, Delete from my inbox, confirmation copy, per-user hide from current inbox, Search -> Chi'lly Chat reopen/unhide of the same existing thread, preserved message history, composer availability, Voice Call availability, Video Call availability, and duplicate prevention.

The completion proof used `R3CXA0DS5JV` as the hiding user against the existing `user230455` direct thread, redacted thread id `e4db...05c`:

- R3 long-pressed `user230455` / `@user230455`; the action sheet showed Open Thread, Open Profile, Voice Call, Video Call, Delete from my inbox, and Cancel.
- The confirmation modal displayed: `This removes the conversation from your inbox. It does not delete it for the other person.`
- After confirmation, R3's inbox changed from `3 threads` to `2 threads`, and the selected `user230455` row disappeared.
- R5 still showed the same redacted thread id `e4db...05c`; opening it showed the direct thread, message history, call history, `Write a message`, Voice Call, and Video Call.
- R5 sent a safe proof message, `v64%20reappear%20proof`, from the preserved existing thread.
- R3's hidden thread reappeared at the top of the inbox after the newer message activity, with the same redacted thread id `e4db...05c` and the new message preview.
- Opening the reappeared thread on R3 showed the new message, message-first thread UI, composer, Voice Call, Video Call, and recent call history.

Other participant copy proof: Closed. R3's hide action did not delete or hide R5's copy.

New-message reappear proof: Closed. The hidden thread reappeared for R3 after newer message activity from R5.

Duplicate thread prevention: Closed. The same redacted thread id `e4db...05c` was hidden, retained by the other participant, used for the new message, and reappeared; no duplicate direct thread was observed.

`Proof Normal / @user230456` remained a legitimate separate proof account/thread. It was not mutated in this completion run. It may be hidden from the tester inbox without renaming, merging, or deleting that legitimate account/thread.

## Chat Thread Hide Final Hardening Audit

Verdict: Closed for source/backend hardening and existing v64 installed proof; the new friendly active-call UI copy is source-fixed and requires a future Google Play internal v65+ installed flow if product wants installed proof of that exact copy.

Delete from my inbox is a per-user hide, not a hard delete. The other participant's copy is not deleted. Message and call history are preserved. Hidden direct threads must not create duplicate direct threads. New message activity must reappear a hidden thread. Profile/Search -> Chi'lly Chat must reopen the existing direct thread. Do not hide identity bugs by deleting rows.

Edge-case audit results:

- Active call hide result: fixed. Migration `20260629140032_guard_active_chat_thread_hide.sql` updates `hide_chat_thread_from_inbox(text)` so active-call threads with `active_communication_room_id` cannot be hidden. The app source also shows `Call active in this thread` with `Finish or leave the active call before removing this conversation from your inbox.` before attempting the hide.
- Unread count result: source/schema reviewed. Message insert trigger updates `last_message_at`, clears unread for sender, and increments unread for other members. Because inbox visibility compares `last_message_at` to `hidden_at`, a newer unread message reappears the hidden thread and keeps unread state server-backed.
- App restart persistence result: source/schema reviewed plus v64 proof. Hidden state is persisted in `chat_thread_members.hidden_at`, not local-only state; app restart does not clear it. The v64 proof used relaunch/deep-link recovery without logout or data reset.
- Search/Profile reopen result: Closed. `getOrCreateDirectThread()` and its RPC reuse the existing pair key, then clear only the caller's `hidden_at` through `unhide_chat_thread_for_me(text)`.
- New message reappear result: Closed on v64 installed proof. R5 sent newer activity into the hidden thread and R3 saw the same thread reappear with the new preview.
- Other participant copy result: Closed on v64 installed proof. R3 hiding did not remove R5's copy.
- Message/call history result: Closed. The hide RPC updates only `chat_thread_members.hidden_at`; it does not delete shared `chat_threads`, `chat_messages`, `chat_call_events`, or `chat_call_invites`.
- Attachment history result: source reviewed. Attachments remain linked to preserved `chat_messages`; hide/unhide does not delete storage objects or attachment metadata.
- Call history result: source reviewed and v64 visually checked. Recent call rows remain preserved in the reopened thread; active-call hide is now blocked instead of silently hiding receiver-visible call state.
- Block/restrict/account-status result: source/schema reviewed. `can_access_chat_thread`, `get_or_create_direct_chat_thread`, membership account-access triggers, and chat message abuse/account guards continue to enforce account restriction and block checks.
- UI copy/action result: production-clean. The label remains `Delete from my inbox`, destructive action requires confirmation, cancel remains available, errors are friendly, and raw backend/RPC/provider errors are not shown.

Backend live status: `supabase db push --dry-run` showed only `20260629140032_guard_active_chat_thread_hide.sql`, `supabase db push` applied it, and a follow-up dry-run reported the remote database is up to date.

## Regression Notes

- Direct-thread messaging UX remains message-first: `MESSAGE THREAD`, `Chat stays primary`, composer, and compact recent-call rows were visible.
- Voice Call and Video Call controls remained available in the reopened/reappeared thread. New voice/video calls were not started during this focused completion lane to avoid unnecessary live-call noise.
- Receiver banner thread-readback was not rerun in this completion lane; prior receiver banner proof remains the governing evidence.
- People/Threads existing-thread copy remains governed by the v64 source behavior and the existing proof scripts.

## Proof Artifacts

Artifact root: `/tmp/app-google-signed-v64-chat-thread-hide-two-phone-proof-20260629-082000/`

Key sanitized files:

- `r5-package.txt`
- `r3-package-before-update.txt`
- `r3-package-after-update.txt`
- `r3-play-store-listing-before-update.png`
- `r3-user230455-action-card.png`
- `r3-user230455-hide-confirmation-attempt.png`
- `r3-inbox-after-user230455-hide.png`
- `r5-chat-expanded-scrolled-post-r3-hide.png`
- `r5-e4db-thread-open-after-r3-hide.png`
- `r5-e4db-message-sent.png`
- `r3-inbox-after-r5-new-message-realtime.png`
- `r3-reappeared-thread-open.png`
- `README.md`
- `proof-matrix.json`
- `secret-token-scan.txt`

The artifacts do not include credentials, service-role keys, provider/payment keys, push tokens, LiveKit tokens, signed URLs, reset links, proof passwords, private user data, or private screenshots.

## Validation

The requested proof/guard set was rerun after the v64 proof documentation updates. `supabase migration list` and `supabase db push --dry-run` were clean. Brand, route, live-stage, chat hide, cross-app people search, Google-signed direct chat/call, Play-internal chat/live, actual-user chat/call, typecheck, runtime validation, and git whitespace checks passed.

## Safety Confirmation

Source fixed is not installed-app proof. Google Play internal install is not enough without actual user flow proof. `installerPackageName` must be `com.android.vending`. Sideloaded APK proof is not accepted.

No logout, uninstall, reinstall, or clear-data happened. No auth/RLS/chat/account-status permission weakening happened. No service-role chat/social proof was counted. No provider/live-money mutation happened. `liveMoneyEnabled` remains OFF.
