# Google-Signed v60 Direct Chat Call Proof

Google-signed Play internal install proof: Closed / Partial / Blocked

Final verdict: Partial.

This lane delivered a Google Play internal, Google-signed versionCode `60` build to both attached phones and proved the fresh handle/search/direct-thread open path far enough to start a real voice call from a normal visible Chat search result. A follow-up receiver banner thread-readback migration fixed the installed v60 blocker where tapping the real incoming call banner opened `This Chi'lly Chat thread could not be found.` After the live migration, `R5CR120QCBF` tapped the incoming banner, opened the readable direct call thread, joined the call, and both phones showed `2 in call`. A later source-only video call layout cleanup fixes the observed cut-off lower video tile, oversized participant overlay, and unsafe bottom control spacing. Full Chi'lly Chat call closure remains Partial because v60 still recorded a false `Missed voice call` after a joined call ended, the app-side source fixes are not installed in a Google Play build yet, and video/background/decline/missed cleanup matrices remain incomplete.

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

Receiver banner must resolve a valid readable direct thread.

This Chi’lly Chat thread could not be found is not Closed.

Receiver banner tap must join or open the correct call thread.

Background push/ringing is Partial without installed-app evidence.

Video feed must not be cut off by bottom controls.

Participant metadata overlay must not block the center of the video.

Local and remote video must be visible on both phones.

Video tiles must adapt to phone size instead of hard-coded device hacks.

Cross-platform responsive support is not Closed without tested device/simulator coverage.

iOS/tablet/foldable proof remains Pending unless tested.

Fullscreen video fit is not Closed until proved on installed app.

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
- `supabase/migrations/20260628223157_chilly_chat_owner_initiated_thread_member_readback.sql`
- `supabase/migrations/20260628223918_chilly_chat_direct_member_platform_owner_thread_readback.sql`

Target Supabase migration history shows the repair path applied:

- `20260628211504 chilly_chat_direct_thread_open_repair`
- `20260628211710 chilly_chat_direct_thread_repair_safety_guards`
- `20260628211813 chilly_chat_direct_thread_repair_execute_grants`
- `20260628215838 chilly_chat_direct_thread_repair_ambiguous_pair_key`
- `20260628220027 chilly_chat_direct_thread_repair_member_upsert_constraint`
- `20260628223330 chilly_chat_owner_initiated_thread_member_readback`
- `20260628223918 chilly_chat_direct_member_platform_owner_thread_readback`

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

Receiver banner thread-readback fix:

- Root cause: the app-wide incoming call banner carried the correct invite/thread route, but receiver readback through `getChatThread(invite.threadId)` returned no readable thread when the direct thread contained a platform-owner member and the thread row had been created by the receiver/stale side. The receiver was an explicit `chat_thread_members` member, but the earlier platform-owner read guard still denied the thread.
- Files changed: `supabase/migrations/20260628223157_chilly_chat_owner_initiated_thread_member_readback.sql`, `supabase/migrations/20260628223918_chilly_chat_direct_member_platform_owner_thread_readback.sql`, `_lib/chillyChatCalls.ts`, and `app/chat/[threadId].tsx`.
- Migration/RPC changes: `public.can_access_chat_thread(uuid)` now lets authenticated explicit direct-thread members read a direct thread they already belong to even when a platform-owner member is present, while preserving account restriction checks, block checks, direct-thread membership checks, and direct-thread creation/open restrictions in `get_or_create_direct_chat_thread`.
- Live receiver-context verification after the second migration returned `callee_can_access=true`, `thread_readable_by_callee=true`, `callee_member_readable=true`, `has_platform_owner=true`, and `actor_is_current_platform_owner=false` for the latest proof thread.
- Supabase advisors still report existing project-wide warnings unrelated to this targeted function; this function keeps a fixed `search_path` and does not use service-role as chat proof.

Responsive video call layout cleanup:

- Root cause: Robert's physical-phone screenshots showed the fullscreen Chi'lly Chat video grid using guessed tile heights derived from the full window, not from the actual space left after the header, status pills, bottom controls, and safe area. The lower participant tile could sit behind the Camera/Mic/End Call row. The participant metadata overlay was also a wide dark card across the bottom of the tile, and fullscreen video could leave the actual camera feed boxed inside the available participant card.
- Files changed: `hooks/use-responsive-layout.ts`, `components/communication/in-room-communication-panel.tsx`, `components/communication/communication-participant-grid.tsx`, and `components/communication/communication-control-bar.tsx`.
- Responsive utilities added or verified: `useResponsiveLayout()`, `getDeviceClass()`, `responsiveSpacing()`, `responsiveFontSize()`, `responsiveTileHeight()`, `getContentBottomPadding()`, and `getSafeBottomControlPadding()`.
- Screenshots reviewed: Robert's physical-phone video-call screenshots showing connected video state, `2 in call`, and the lower feed cut off under the Camera/Mic/End Call controls. The issue was observed on an owner-involved call path as well.
- UI issues fixed in source: fullscreen controls now reserve bottom safe-area space as a normal layout sibling, the participant stage flexes only in the remaining space, tiles no longer use guessed fixed fullscreen heights, RTC video fills the tile, participant metadata is compact at the tile edge instead of a wide black card across the video, and control/back buttons use responsive minimum touch targets.
- Device classes supported by source rules: `compactPhone`, `regularPhone`, `tallPhone`, `largePhone`, `tablet`, `foldableOrExpanded`, and `landscape`. The rules use window dimensions, safe-area insets, orientation, and font scale, not exact device names.
- Per-class behavior documented in source: safe top padding comes from safe-area top plus responsive spacing; safe bottom padding uses `getSafeBottomControlPadding()` for Android gesture/three-button and iOS home-indicator behavior; content max width is capped for tablet/foldable/landscape; bottom control spacing comes from `bottomControlSpacing`; minimum touch target is `48` on Android and `44` on iOS; tile sizing comes from responsive tile minimums plus flex in the available stage; font scale is clamped more tightly on compact phones; content remains flexible/scroll-compatible where screens own scrolling outside this fullscreen call surface.
- Android proof result: source/dev proof passed. Android two-phone installed proof remains Partial until v61+ is installed from Google Play internal and reproduced on `R5CR120QCBF` and `R3CXA0DS5JV`.
- iOS proof result: Pending. Cross-platform responsive support is not Closed without tested device/simulator coverage.
- Tablet/foldable proof result: Pending. iOS/tablet/foldable proof remains Pending unless tested.
- Out-of-scope issues documented: stale existing inbox handle metadata, false missed-call event after a joined call ends, background push/ringing proof, wrong role/owner badge review, possible local/remote naming issues, camera mirror/rotation review, confusing status pills review, and installed two-phone video proof remain separate blockers.
- Whole-app responsive audit result: Direct Chat video call is source-fixed now. Chat inbox and thread generally use safe-area padding but need future keyboard/long-list verification; Profile needs future responsive card/header audit; Settings needs long-form/large-font review; Player and Watch-Party/Live Stage already contain local safe-area logic but need consolidation into the shared foundation; Waiting rooms, Home, Search/Explore People, and Money Center are not fully inspected in this lane.
- Proof result: source/typecheck/proof-script Partial. Responsive foundation added. Direct Chat video call layout adapts by dimensions and safe area. Source fixed is not installed-app proof and Google Play internal install is not enough without actual user flow proof.
- Remaining blockers: deliver a v61+ Google Play internal build containing this layout cleanup and prove local and remote video are visible on both phones with no bottom feed cutoff, no control overlap, no center-blocking metadata card, Back to Thread working, and End Call working.

## Google Play Internal Build Result

No new Google Play build was created for the receiver thread-readback backend migration. The installed proof below reuses Google Play-installed v60 because the failing path was a live Supabase read policy/RLS readback issue, not a binary routing issue. Source fixed is not installed-app proof: the app-side false missed-call cleanup fix in this commit requires a newer Google Play internal build, expected versionCode `61` or higher, before cleanup can be Closed.

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
- After `20260628223918_chilly_chat_direct_member_platform_owner_thread_readback`, Phone B tapped the incoming banner and joined the call.
- Both phones showed `Voice call active`, `Connected`, and `2 in call`.
- Caller End Call returned both phones to readable direct-thread screens with `No Active Call`.

Remaining blockers:

- Installed v60 recorded `Voice call ended` and then a false `Missed voice call` event for the same joined call because banner auto-join did not mark the invite accepted in the installed binary.
- The source fix for that cleanup is present in `_lib/chillyChatCalls.ts` and `app/chat/[threadId].tsx`, but it is not installed-app proof until delivered through Google Play.
- Video Call was not attempted after the source cleanup blocker was found.

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
- After the receiver thread-readback migration, `R5CR120QCBF` tapped the app-wide banner and joined the correct call surface.
- `R5CR120QCBF` showed `Voice call active`, `2 in call`, `Participant`, and `Connected`.
- `R3CXA0DS5JV` showed `Voice call active`, `2 in call`, and `Connected`.

Remaining Partial reason:

- This only proves the voice receiver-elsewhere banner join path. Background push/ringing, video local/remote, decline/missed cleanup, and installed source cleanup remain incomplete.

## Receiver Background/Push Result

Status: Partial.

Background push/ringing must be proved separately or remain Partial.

The caller delivery status said `push sent`, and the receiver saw a foreground/app-wide incoming banner while in app. Phone B backgrounded/outside-app Android push/ring proof was not run, so background ringing is not Closed.

## Voice Call Result

Status: Partial.

Installed v60 plus live receiver readback migration proved voice call start, receiver app-wide banner, banner tap, receiver join, both phones in `2 in call`, and caller end returning the thread to `No Active Call`.

Voice remains Partial for full closure because installed v60 also recorded a false `Missed voice call` after the joined call ended, and decline/missed/repeated/background cleanup was not fully proved.

## Video Call Local/Remote Result

Status: Partial.

Robert's physical-phone screenshots showed the owner-involved video path can reach connected video state with both users present, but the UI was not production-clean: the lower participant feed could be cut off by the bottom controls, metadata covered too much of the tile, and the video did not fill the available card cleanly.

Source fix result: `components/communication/in-room-communication-panel.tsx` and `components/communication/communication-participant-grid.tsx` now reserve bottom control/safe-area space, flex the video stage above it, compact participant metadata, and fill each tile with the RTC video view.

Installed proof remains Partial until local and remote video are visible on both phones through the Google Play internal app.

## Fullscreen Video Fit Result

Status: Partial.

Fullscreen video fit is not Closed until proved on installed app.

Source fix result: the fullscreen communication panel now keeps controls outside the video stage, pads for Android safe area, and prevents the bottom controls from covering the lower participant feed. The participant metadata overlay must not block the center of the video.

Installed proof remains Partial until a Google Play internal build containing the layout cleanup is reproduced on `R5CR120QCBF` and `R3CXA0DS5JV`.

## Call End / Decline / Missed Cleanup Result

Status: Partial.

Installed proof that passed:

- Caller End Call returned the thread header to `No Active Call` on `R3CXA0DS5JV`.
- `R5CR120QCBF` returned to the readable direct thread with `No Active Call`.
- Live backend readback after the joined call showed `chat_threads.active_communication_room_id` cleared and `chat_threads.active_call_type` cleared.
- No stuck incoming banner remained on R5 after caller ended the attempted calls.

Installed proof that failed:

- Installed v60 recorded `Voice call ended` and then `Missed voice call` at `5:42 PM` for the same joined call. Live readback showed the latest invite status as `missed` with no `accepted_at`, even though both phones had been in `2 in call`.
- Source fix: `_lib/chillyChatCalls.ts` now prevents stale missed/declined/busy/accepted updates from overwriting a non-ringing invite and only inserts call events when the invite row actually changed. `app/chat/[threadId].tsx` now marks the incoming invite `accepted` when the receiver joins through the banner/open-call route and clears the incoming timeout.
- Source fixed is not installed-app proof. This cleanup fix requires a new Google Play internal build and installed two-phone proof before cleanup can be Closed.

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
| Receiver tapping the app-wide incoming call banner opened `This Chi'lly Chat thread could not be found.` | Fixed in backend / installed proof passed | `20260628223918_chilly_chat_direct_member_platform_owner_thread_readback` fixed the receiver readback path. R5 tapped the real incoming banner and joined the correct voice call surface with both phones showing `2 in call`. |
| Joined installed v60 call recorded `Voice call ended` and then a false `Missed voice call`. | Must fix before launch | Source fixed in this commit; requires Google Play internal v61+ installed proof before cleanup can be Closed. |
| Video call lower participant feed is cut off by bottom controls and participant metadata covers too much video. | Source fixed / installed proof pending | `components/communication` layout now reserves safe-area control space and uses compact edge metadata; requires v61+ installed proof before fullscreen video fit can be Closed. |
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
- Added/applied `20260628223157_chilly_chat_owner_initiated_thread_member_readback.sql`.
- Added/applied `20260628223918_chilly_chat_direct_member_platform_owner_thread_readback.sql`.
- Updated `_lib/chillyChatCalls.ts` so stale missed/declined/busy/accepted invite updates only apply while the invite is still ringing and do not insert events when the invite row did not change.
- Updated `app/chat/[threadId].tsx` so receiver banner/open-call auto-join marks the invite accepted and clears the missed-call timeout before opening the call surface.
- Updated `components/communication/in-room-communication-panel.tsx` so fullscreen controls are pinned below the video stage with Android safe-area padding instead of competing with or covering the lower video tile.
- Updated `components/communication/communication-participant-grid.tsx` so fullscreen video tiles flex inside the available stage, RTC video fills the tile, and compact participant metadata stays at the tile edge instead of blocking the center of the video.
- Built EAS Android App Bundle `8642fea7-b782-4c18-98c8-5805b6c7c20e`, versionCode `60`.
- Submitted only to Google Play internal testing; both phones updated through Google Play.

## Issues Documented But Not Fixed

- Existing inbox row stale handle can still appear.
- Full search term matrix across all surfaces remains incomplete.
- Video call local/remote installed proof remains incomplete until v61+ is delivered through Google Play internal and reproduced on both phones.
- Background push/ring proof remains incomplete.
- The joined-call false missed-event source fix is not installed in Google Play yet.
- Decline/missed/killed-app cleanup matrix remains incomplete on installed app.

## Remaining Launch Blockers

1. Rebuild and deliver a new Google Play internal version after the source cleanup and video layout fixes, expected versionCode `61` or higher.
2. Prove that receiver banner/open-call auto-join marks the invite accepted and does not record a false missed event after a joined call ends.
3. Fix or refresh stale existing inbox participant handle metadata.
4. Prove receiver same-thread, elsewhere-in-app, and background/push separately.
5. Prove Video Call local/remote media on both phones and fullscreen fit, including no bottom feed cutoff, no control overlap, no center-blocking metadata card, Back to Thread working, and End Call working.
6. Prove call end/decline/missed/background cleanup with active call state cleared.

## Screenshots/XML/Log Artifact Paths

Artifact root:

- `/tmp/chillywood-google-signed-v60-direct-chat-call-proof-20260628/`
- `/tmp/chillywood-receiver-banner-thread-readback-fix-20260628/`

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
- `/tmp/chillywood-receiver-banner-thread-readback-fix-20260628/R5-after-second-fresh-voice-banner.png`
- `/tmp/chillywood-receiver-banner-thread-readback-fix-20260628/R5-after-second-banner-tap.png`
- `/tmp/chillywood-receiver-banner-thread-readback-fix-20260628/R3-after-second-banner-tap.xml`
- `/tmp/chillywood-receiver-banner-thread-readback-fix-20260628/R3-after-second-banner-tap.png`
- `/tmp/chillywood-receiver-banner-thread-readback-fix-20260628/R3-after-second-call-end.xml`
- `/tmp/chillywood-receiver-banner-thread-readback-fix-20260628/R3-after-second-call-end.png`
- `/tmp/chillywood-receiver-banner-thread-readback-fix-20260628/R5-after-second-call-end.png`
- `/tmp/chillywood-receiver-banner-thread-readback-fix-20260628/R5-package-after-readback-proof.txt`
- `/tmp/chillywood-receiver-banner-thread-readback-fix-20260628/R3-package-after-readback-proof.txt`

Do not commit or list raw signed URLs, tokens, private user IDs, private emails, private phone numbers, provider IDs, raw IPs, or secrets.

## Actual-User Proof Classification

Google-signed v60+ Direct Chat + Call actual-user proof remains Partial.

Google Play internal install proof for versionCode `60` on both attached phones is documented above. Visible Chat search -> direct-thread open is proved after live RPC repair. Receiver banner thread-readback and voice join are proved after the live readback migration. Full actual-user call closure is not Closed because the app-side cleanup and video layout fixes are source-only until a new Google Play internal build is installed, and video/background/decline/missed cleanup proof remains Partial.

## Safety Confirmation

No auth/RLS/chat/account-status permission weakening happened.

No service-role chat proof was counted.

No provider/live-money mutation happened.

liveMoneyEnabled remains OFF.

No sideload, adb install, APK manual install, logout, uninstall, reinstall, clear-data, or session reset happened.
