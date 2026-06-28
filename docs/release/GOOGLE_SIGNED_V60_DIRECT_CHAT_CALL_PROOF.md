# Google-Signed v60 Direct Chat Call Proof

Google-signed Play internal install proof: Closed / Partial / Blocked

Final verdict: Partial.

This lane delivered a Google Play internal, Google-signed versionCode `60` build to both attached phones and proved the fresh handle/search/direct-thread open path far enough to start a real voice call from a normal visible Chat search result. Full Chi'lly Chat call closure remains Partial because the receiver elsewhere-in-app can see the incoming call banner, but tapping it on `R5CR120QCBF` opens `This Chi'lly Chat thread could not be found.` and the caller remains `1 in call`.

## Required Proof Doctrine

installerPackageName must be com.android.vending.

Sideloaded APK proof is not accepted.

No logout, uninstall, reinstall, or clear-data happened.

Fresh remote profile must win over stale AsyncStorage.

Settings/Profile/Chat must agree on the current handle.

Visible People result must open or create a direct thread.

Direct-thread repair must be authenticated and RLS-safe.

Unable to open Chi’lly Chat with this person right now is not Closed.

Same-thread proof is not enough.

Call end/decline/missed cleanup must be proved before full call closure.

Source fixed is not installed-app proof.

Google Play internal install is not enough without actual user flow proof.

If Robert/testers cannot reproduce it in the Google-signed Play-internal installed app, it is not actual-user Closed.

No auth/RLS/chat/account-status permission weakening happened.

No service-role chat proof was counted.

No provider/live-money mutation happened.

liveMoneyEnabled remains OFF.

## Repo Commit Proved

- Play build source HEAD: `c08c4bd1d98d3ea6672df5c3441c8d7b232b6b82`
- Required included source fix: `0b563c79384e5270440bc0ad076bbc4ca687bf57`
- Source included the Settings handle cache write, signed-in remote profile preference, Chat direct-thread enrichment, and authenticated direct-thread repair RPC client call.
- Post-install backend fix added two targeted Supabase migrations for the live repair RPC ambiguity. Those migrations are source changes in this closeout commit and are not a new mobile binary by themselves.

## Origin/Main Alignment

Before the v60 build and installed proof:

- `git status --short --branch`: `## main...origin/main`
- `git rev-parse HEAD`: `c08c4bd1d98d3ea6672df5c3441c8d7b232b6b82`
- `git rev-parse origin/main`: `c08c4bd1d98d3ea6672df5c3441c8d7b232b6b82`
- Origin/main alignment documented: HEAD == origin/main.

Only unrelated pre-existing untracked local artifact/temp files were present; they were not used as source proof.

## Supabase RPC / Migration Verification

Repo migration files:

- `supabase/migrations/20260628205325_chilly_chat_direct_thread_open_repair.sql`
- `supabase/migrations/20260628212500_chilly_chat_direct_thread_repair_safety_guards.sql`
- `supabase/migrations/20260628213000_chilly_chat_direct_thread_repair_execute_grants.sql`
- `supabase/migrations/20260628215750_chilly_chat_direct_thread_repair_ambiguous_pair_key.sql`
- `supabase/migrations/20260628215943_chilly_chat_direct_thread_repair_member_upsert_constraint.sql`

Target Supabase migration history shows the repair path applied:

- `20260628211504 chilly_chat_direct_thread_open_repair`
- `20260628211710 chilly_chat_direct_thread_repair_safety_guards`
- `20260628211813 chilly_chat_direct_thread_repair_execute_grants`
- `20260628215838 chilly_chat_direct_thread_repair_ambiguous_pair_key`
- `20260628220027 chilly_chat_direct_thread_repair_member_upsert_constraint`

Live RPC verification:

- RPC name: `get_or_create_direct_chat_thread`
- Parameters match client call: `p_target_user_id`, `p_target_display_name`, `p_target_avatar_url`, `p_target_tagline`
- Authenticated execute: true
- Anonymous execute: false
- Service-role execute: false
- Checks blocked relationship before thread insert: true
- Checks account access before thread insert: true
- Checks target profile exists before thread insert: true
- API probe result for anonymous caller: `exists_permission_denied_for_anon`
- Sanitized installed-proof diagnostic found and fixed SQLSTATE `42702` ambiguous `participant_pair_key` / member-upsert references before the visible Chat action succeeded.

The repair function is authenticated and RLS-safe for this lane: it operates only on the authenticated caller and requested target pair, denies account-restricted/unavailable/blocked/unauthorized targets before creating a thread, preserves platform-owner chat restrictions, returns only the thread id, and still requires normal RLS readback in the app before the caller sees success. No service-role chat proof was counted.

## Google Play Internal Build Result

EAS production Android store build:

- Build ID: `8642fea7-b782-4c18-98c8-5805b6c7c20e`
- Artifact type: Android App Bundle / store distribution
- Build profile: `production`
- Channel: `production`
- VersionCode: `60`
- VersionName: `1.0.0`
- RuntimeVersion: `1.0.0`
- Commit SHA included: `c08c4bd1d98d3ea6672df5c3441c8d7b232b6b82`
- Build status: FINISHED
- EAS submit ID: `7c6dd61c-16e9-4cd8-84b4-db489c19f794`
- Google Play internal testing upload status: delivered to internal testing
- Tester availability status: both attached phones received the Play `Update`
- Rollout/download availability status: both attached phones updated through Google Play

No Play production release happened.

## Google-Signed Install Verification

Status: Closed for Google-signed install only.

Both physical phones updated through Google Play internal testing. No `adb install`, downloaded APK manual install, sideload, uninstall, reinstall, clear data, logout, or session reset happened.

## Device Version / Installer Proof

| Device | Package | Installer | Version | Update proof |
| --- | --- | --- | --- | --- |
| `R5CR120QCBF` | `com.chillywood.mobile` | `com.android.vending` | versionCode `60`, versionName `1.0.0` | `lastUpdateTime=2026-06-28 16:49:54`, first install time remained `2026-06-26 01:26:01` |
| `R3CXA0DS5JV` | `com.chillywood.mobile` | `com.android.vending` | versionCode `60`, versionName `1.0.0` | `lastUpdateTime=2026-06-28 16:49:28`, first install time remained present from the prior Play install |

## No Logout / No Data Reset Confirmation

No logout, uninstall, reinstall, or clear-data happened. Both apps launched after the Google Play update into signed-in app screens, not auth/login screens.

## Fresh Profile Handle Result

Status: Partial.

Installed proof that passed:

- `R5CR120QCBF` Settings Account showed `Current handle: @user230455`.
- `R5CR120QCBF` normal Profile from Settings showed `user230455` and `@user230455`.
- `R3CXA0DS5JV` Chi'lly Chat search for `user230455` returned a visible People result `user230455` / `@user230455`.
- The opened direct-thread header showed `user230455` / `@user230455`.

Remaining handle issue:

- The existing Chat inbox row initially still displayed `Proof Normal @user230456` before searching/opening the fresh result. That means Settings/Profile/search/thread-header freshness improved, but an existing inbox row can still show stale participant metadata and must remain a launch follow-up.

## People Search Result

Status: Partial.

Installed proof that passed:

- Chi'lly Chat inbox/start-chat search found `user230455`.
- The visible result preserved meaningful numbers and showed `@user230455`.
- No raw IDs/private email/phone/provider data were shown in the visible result.
- The no-thread state copy was distinct from backend unavailable copy.

Not fully retested in this pass:

- `@user230455`, `User230455`, `user 230455`, display name, username, and handle variants across every required surface.
- Explore People search and Profile entry from that search result.

## Direct Thread Open/Create Repair Result

Status: Passed for installed visible Chat search open/create after live RPC fixes.

Observed sequence:

1. `R3CXA0DS5JV` opened Chi'lly Chat from normal profile navigation.
2. `R3CXA0DS5JV` searched `user230455`.
3. The installed app returned a visible People result.
4. First visible `Chi'lly Chat` action failed safely with `Unable to open Chi'lly Chat with this person right now.`
5. Sanitized backend diagnostics identified the live RPC ambiguity.
6. Targeted migrations fixed ambiguous pair-key and member-upsert resolution.
7. The same Google Play-installed v60 app then opened the direct thread from the visible People result without hidden/pre-created UI proof.

Pre-created thread/call state is not actual-user proof. The backend diagnostic was used only to identify the RPC failure; the counted installed proof is the visible app action after the live RPC repair.

## Inbox/Search Call Path Result

Status: Partial.

Installed proof that passed:

- Phone A used Chi'lly Chat search to find Phone B by visible handle.
- The app opened the direct thread.
- Phone A tapped Voice Call.
- Caller saw `Voice call active`, `Connected`, `1 in call`, and delivery status `push sent`.
- Phone B, while elsewhere in app, received an incoming call banner.
- Caller End Call returned the thread to `No Active Call`.

Remaining blocker:

- Phone B tapping the incoming banner did not join. It opened `This Chi'lly Chat thread could not be found.`
- Code review after proof points to the normal `/chat/{threadId}` readback path, not the banner tap handler: the app-wide banner pushes the correct chat route, but the receiver cannot read that owner-to-user thread under the current platform-owner chat guard. Changing that guard is a policy/RLS decision and was not made in this lane.
- Video Call was not attempted after the voice join blocker.

## Existing Thread Call Path Result

Status: Partial.

The opened direct thread could start a voice call, but this pass did not separately prove the existing-direct-thread path from inbox after clearing search. The stale inbox row handle issue also remains.

## Normal Profile Call Path Result

Status: Partial.

Normal profile navigation worked for entering Chi'lly Chat on the owner phone, and Settings -> Profile showed the fresh handle on the receiver phone. This pass did not fully prove opening Phone B's profile through normal in-app search and starting Voice/Video directly from Profile.

## Receiver Same-Thread Result

Status: Partial.

Same-thread receiver proof was not rerun after the live RPC fix. Same-thread proof is not enough for full actual-user closure by itself.

## Receiver Elsewhere-In-App Result

Status: Partial.

Receiver elsewhere in app must get app-wide incoming call state or remain Partial.

Installed proof that passed:

- `R5CR120QCBF` was signed in and remained on its Profile, not inside the thread.
- `R3CXA0DS5JV` started a real voice call from the visible search-opened direct thread.
- `R5CR120QCBF` showed an app-wide incoming banner: `Incoming Chi'lly Chat voice call`, caller copy, `Tap to answer`, and `Dismiss`.

Installed proof that failed:

- Tapping the banner opened `This Chi'lly Chat thread could not be found.`
- `R3CXA0DS5JV` stayed at `1 in call`.
- Both phones did not reach joined state.

## Receiver Background/Push Result

Status: Partial.

Background push/ringing must be proved separately or remain Partial.

The caller delivery status said `push sent`, and the receiver saw a foreground/app-wide incoming banner while in app. Phone B backgrounded/outside-app Android push/ring proof was not run, so background ringing is not Closed.

## Voice Call Result

Status: Partial.

Voice call start from the visible direct thread worked for the caller and produced receiver-visible incoming state. Voice call join did not close because tapping the receiver banner routed to a missing-thread screen.

## Video Call Local/Remote Result

Status: Partial.

Video was not attempted after the voice receiver-join blocker. No local/remote video on both phones was proved.

## Fullscreen Video Fit Result

Status: Partial.

Fullscreen video contain/aspect-fit was not proved.

## Call End / Decline / Missed Cleanup Result

Status: Partial.

Installed proof that passed:

- Caller End Call returned the thread header to `No Active Call`.
- No stuck incoming banner remained on R5 after caller ended the attempted calls.

Not proved:

- Receiver decline.
- Missed call event cleanup.
- Backgrounded/killed app cleanup.
- Repeated call after end across both joined participants.
- Database-level verification that `chat_threads.active_communication_room_id` and `chat_threads.active_call_type` cleared after every required state.

Call end/decline/missed cleanup must be proved before full call closure.

## Blocked/Restricted/Signed-Out Safety Result

Status: Source/RPC verified / installed proof partial.

RPC safety checks deny restricted/unavailable/blocked/unauthorized targets before thread creation. Manual installed proof for blocked/restricted/signed-out cases was not rerun in this pass.

## Cross-Lane Issues Found

| Issue | Classification | Disposition |
| --- | --- | --- |
| Existing Chat inbox row can still display stale `@user230456` after Settings/Profile/search show `@user230455`. | Must fix before launch | Documented; do not call Settings/Profile/Chat handle agreement fully Closed. |
| Receiver tapping the app-wide incoming call banner opens `This Chi'lly Chat thread could not be found.` | Must fix before launch | Documented as the installed call-closure blocker. Code review points to the receiver thread readback being blocked by the current platform-owner chat guard for owner-to-user direct threads. |
| `R5CR120QCBF` Profile displays an `Owner` badge for `user230455` during proof. | Human review | Review account role/badge source before launch; no account mutation happened in this lane. |
| Android logcat included Firebase push/FIS auth errors while Settings showed push not registered on R5 earlier. | Should fix before launch | Push/ringing remains Partial until background push is proved on installed app. |

Out-of-scope is not an excuse to ignore visible user-facing problems.

Small safe visible issues were fixed where found.

Risky or larger issues were documented instead of hidden.

## Fixes Made

- Applied target Supabase migration `chilly_chat_direct_thread_open_repair`.
- Added/applied `20260628212500_chilly_chat_direct_thread_repair_safety_guards.sql`.
- Added/applied `20260628213000_chilly_chat_direct_thread_repair_execute_grants.sql`.
- Added/applied `20260628215750_chilly_chat_direct_thread_repair_ambiguous_pair_key.sql`.
- Added/applied `20260628215943_chilly_chat_direct_thread_repair_member_upsert_constraint.sql`.
- Built EAS Android App Bundle `8642fea7-b782-4c18-98c8-5805b6c7c20e`, versionCode `60`.
- Submitted only to Google Play internal testing; both phones updated through Google Play.

## Issues Documented But Not Fixed

- Receiver banner answer route cannot read/open the target thread on R5.
- Existing inbox row stale handle can still appear.
- Full search term matrix across all surfaces remains incomplete.
- Video call local/remote proof remains incomplete.
- Background push/ring proof remains incomplete.
- Decline/missed/killed-app cleanup matrix remains incomplete.

## Remaining Launch Blockers

1. Fix receiver answer route/thread readback so app-wide incoming call banner joins the active call instead of showing thread-not-found.
   - The current evidence suggests this requires an explicit owner-to-user chat policy decision or a two-normal-user proof path, not a blind RLS relaxation.
2. Fix or refresh stale existing inbox participant handle metadata.
3. Rebuild and deliver a new Google Play internal version after source changes that affect the installed app.
4. Prove receiver same-thread, elsewhere-in-app, and background/push separately.
5. Prove Video Call local/remote media on both phones and fullscreen fit.
6. Prove call end/decline/missed/background cleanup with active call state cleared.

## Screenshots/XML/Log Artifact Paths

Artifact root:

- `/tmp/chillywood-google-signed-v60-direct-chat-call-proof-20260628/`

Key artifacts:

- `/tmp/chillywood-google-signed-v60-direct-chat-call-proof-20260628/R5CR120QCBF-package-after-v60-play-update-attempt-1.txt`
- `/tmp/chillywood-google-signed-v60-direct-chat-call-proof-20260628/R3CXA0DS5JV-package-after-v60-play-update-attempt-1.txt`
- `/tmp/chillywood-google-signed-v60-direct-chat-call-proof-20260628/eas-build-v60-plus-view-sanitized.txt`
- `/tmp/chillywood-google-signed-v60-direct-chat-call-proof-20260628/eas-submit-v60-plus.txt`
- `/tmp/chillywood-google-signed-v60-direct-chat-call-proof-20260628/supabase-direct-thread-rpc-ambiguity-fix-readback.txt`
- `/tmp/chillywood-google-signed-v60-direct-chat-call-proof-20260628/R5CR120QCBF-settings-account-expanded-v60.png`
- `/tmp/chillywood-google-signed-v60-direct-chat-call-proof-20260628/R5CR120QCBF-profile-v60-from-settings.png`
- `/tmp/chillywood-google-signed-v60-direct-chat-call-proof-20260628/R3-chat-search-user230455-v60.png`
- `/tmp/chillywood-google-signed-v60-direct-chat-call-proof-20260628/R3-visible-chat-action-after-live-rpc-fixes-v60.png`
- `/tmp/chillywood-google-signed-v60-direct-chat-call-proof-20260628/R5-voice-call-incoming-elsewhere-result-v60.png`
- `/tmp/chillywood-google-signed-v60-direct-chat-call-proof-20260628/R5-second-voice-after-answer-tap-v60.png`
- `/tmp/chillywood-google-signed-v60-direct-chat-call-proof-20260628/R3-after-ending-voice-call-v60.png`
- `/tmp/chillywood-google-signed-v60-direct-chat-call-proof-20260628/R3-visible-direct-thread-failure-sanitized-logcat.txt`

Do not commit or list raw signed URLs, tokens, private user IDs, private emails, private phone numbers, provider IDs, raw IPs, or secrets.

## Actual-User Proof Classification

Google-signed v60+ Direct Chat + Call actual-user proof remains Partial.

Google Play internal install proof for versionCode `60` on both attached phones is documented above. Visible Chat search -> direct-thread open is proved after live RPC repair. Full actual-user call closure is not Closed because the receiver cannot join from the app-wide incoming call banner.

## Safety Confirmation

No auth/RLS/chat/account-status permission weakening happened.

No service-role chat proof was counted.

No provider/live-money mutation happened.

liveMoneyEnabled remains OFF.

No sideload, adb install, APK manual install, logout, uninstall, reinstall, clear-data, or session reset happened.
