# Google-Signed v64 Chat Thread Hide Proof

Verdict: Partial.

The source/schema/RPC feature is implemented and Google Play internal versionCode `64` proved the primary actual-user hide/reopen flow on `R5CR120QCBF`. The lane remains Partial because `R3CXA0DS5JV` was not visible to ADB during this proof window, so other-participant copy proof and new-message reappear proof were not completed on the second phone.

## Build And Install

- Repo commit proved: `5c21c3b4282fa45a2f62106deba68d944b6024e4`.
- Origin/main alignment before build: clean tracked tree, `HEAD == origin/main`.
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
| `R3CXA0DS5JV` | Pending: device was not visible to ADB during this proof window. |

No sideload, manual APK install, adb install, uninstall, reinstall, logout, or clear-data action was used for the installed proof.

## Supabase Verification

`supabase migration list` and `supabase db push --dry-run` were clean before build/proof. The live target has the hide-thread migration in history, including `chat_thread_members.hidden_at`, `hide_chat_thread_from_inbox(text)`, and `unhide_chat_thread_for_me(text)`.

The RPCs are authenticated-user scoped. They update only the caller's `chat_thread_members` row and do not hard-delete `chat_threads`, `chat_messages`, `chat_call_events`, `chat_call_invites`, or the other participant's inbox copy.

## Actual-User Flow

Delete from my inbox is a per-user hide, not a hard delete. The other participant's copy is not deleted. Message and call history are preserved. Hidden direct threads must not create duplicate direct threads. Profile/Search -> Chi'lly Chat must reopen the existing direct thread.

On `R5CR120QCBF`, a long-press on an existing direct thread opened the thread action sheet with:

- Open Thread
- Open Profile
- Voice Call
- Video Call
- Delete from my inbox
- Cancel

The confirmation modal displayed: `This removes the conversation from your inbox. It does not delete it for the other person.`

After confirmation, the selected thread disappeared from the current user's inbox and the app remained signed in. No raw backend/provider/RPC error appeared.

Reopen/unhide proof used a reachable proof thread for `Proof Device B 1777048824764` / `@user3ea3fcf92415`. After hide, the thread was absent from Threads search, appeared under People search with the Chi'lly Chat action, and tapping that action reopened the existing thread. The reopened thread preserved message history, showed `Write a message`, and kept Voice Call / Video Call available. Returning to the inbox restored the thread count from `5 threads` to `6 threads` with the same single thread row, supporting duplicate prevention.

`Proof Normal / @user230456` remained a legitimate separate proof account/thread. It was not separately hidden in this run because it was not reachable by search on the attached device during the proof window. It may be hidden from the tester inbox without renaming, merging, or deleting that legitimate account/thread.

## Partial Items

- Other participant copy proof: Pending because `R3CXA0DS5JV` was not visible to ADB.
- New message reappear proof: Pending because the second participant phone was unavailable.
- Proof Normal hide proof: Partial because the row was not reachable by search during this run.

## Validation

The requested proof/guard set was run for the source/schema lane and rerun after the v64 proof documentation updates. `supabase migration list` and `supabase db push --dry-run` were clean. Brand, route, live-stage, chat hide, cross-app people search, Google-signed direct chat/call, Play-internal chat/live, actual-user chat/call, typecheck, runtime validation, and git whitespace checks passed.

## Safety Confirmation

Source fixed is not installed-app proof. Google Play internal install is not enough without actual user flow proof. `installerPackageName` must be `com.android.vending`. Sideloaded APK proof is not accepted.

No logout, uninstall, reinstall, or clear-data happened. No auth/RLS/chat/account-status permission weakening happened. No service-role chat/social proof was counted. No provider/live-money mutation happened. `liveMoneyEnabled` remains OFF.
