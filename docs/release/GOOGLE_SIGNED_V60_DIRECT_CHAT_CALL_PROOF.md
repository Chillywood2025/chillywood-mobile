# Google-Signed v60 Direct Chat Call Proof

Google-signed Play internal install proof: Closed / Partial / Blocked

Final verdict: Partial.

## Direct thread messaging UX restoration

Source status: fixed. Installed-app status: Pending.

Chi’lly Chat direct thread must remain a real messaging thread. Calls live inside the thread, but must not replace the thread. Actual chat content must remain primary. Call event rows must not dominate the direct thread. Thread status UI must not push real chat content out.

Root cause: the direct thread body rendered an oversized thread status card and full-width call event cards before the message scroll body, so screens with recent call activity could read as a call/status log instead of a direct-message conversation.

Files changed: `app/chat/[threadId].tsx`.

Screenshots reviewed: Pic 1 shows the intended message-first thread direction with calling available in-thread. Pic 2 shows the broken call/status-heavy hierarchy where repeated call events dominate before the conversation.

Thread message list path reviewed: `renderedMessages` still maps real `chat_messages` into the `chat-thread-messages-scroll` body. The source fix keeps that scroll body as the primary thread content.

Call event rendering path reviewed: `listChillyChatCallEvents(threadId)` remains intact, but call events now render inside the message timeline as a compact `Recent calls in this thread` section, limited to the latest three lightweight rows.

Thread status card reviewed: the former `THREAD STATUS` card is now a compact `MESSAGE THREAD` context strip with smaller copy and pills. It no longer sits as the visual purpose of the page.

Composer path reviewed: `chat-thread-composer`, attachment picker, text input, and Send behavior remain in place.

Proof result: source fixed and typechecked. Source fixed is not installed-app proof. Google Play internal install is not enough without actual user flow proof. `installerPackageName` must be `com.android.vending`. Sideloaded APK proof is not accepted. No logout, uninstall, reinstall, or clear-data happened. No auth/RLS/chat/account-status permission weakening happened. No service-role chat proof was counted. No provider/live-money mutation happened. `liveMoneyEnabled` remains OFF.

This lane delivered a Google Play internal, Google-signed versionCode `60` build to both attached phones and proved the fresh handle/search/direct-thread open path far enough to start a real voice call from a normal visible Chat search result. A follow-up receiver banner thread-readback migration fixed the installed v60 blocker where tapping the real incoming call banner opened `This Chi'lly Chat thread could not be found.` After the live migration, `R5CR120QCBF` tapped the incoming banner, opened the readable direct call thread, joined the call, and both phones showed `2 in call`. The responsive video layout fix was then delivered in Google Play internal versionCode `61`; both attached phones updated through Google Play with installer `com.android.vending`, and the owner-involved Direct Chi'lly Chat video path passed Android two-phone installed proof for local/remote video visibility, bottom-control safe-area spacing, compact participant metadata, Back to Thread, End Call, and repeated call after end. Source now adds a cross-surface stale identity metadata fix so existing Chat inbox rows, call/room participant labels, shared profile display, Circle, Followers, Following, invite/user-card, and platform role surfaces prefer fresh remote profile identity over stale snapshots. Full Chi'lly Chat call closure remains Partial because that identity fix is source-only until a v62+ Google Play internal build is installed and proved, and background push/ringing, decline/missed/background cleanup, user -> owner direction, and iOS/tablet/foldable responsive proof remain incomplete.

## Required Proof Doctrine

installerPackageName must be com.android.vending.

Sideloaded APK proof is not accepted.

No logout, uninstall, reinstall, or clear-data happened.

Fresh remote profile must win over stale AsyncStorage.

Settings/Profile/Chat must agree on the current handle.

One user identity must render consistently across profile, chat, search, circle, followers, and following.

Fresh remote profile must win over stale AsyncStorage.

Circle/Followers/Following must not keep stale handle metadata as primary identity.

Existing inbox rows must not show stale participant metadata as primary identity.

Stale @user230456 is not Closed if it still appears as the primary inbox, circle, follower, following, or user-card identity.

Platform/owner/admin/moderator/creator surfaces must use the same fresh profile identity source as Chat/Profile/Search/Circle/Followers.

Role badges may show role/status, but they must not cause stale handle/name/avatar metadata to win.

The app must not confuse role identity with profile identity.

Platform-owner paths must not be used to bypass normal user identity/RLS/chat/social rules.

First Owner permissions and ownership rules were not changed in this lane.

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

No service-role chat/social proof was counted.

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
- Android proof result: Google-signed v61 Android two-phone installed proof passed on `R5CR120QCBF` and `R3CXA0DS5JV` for the owner -> user Direct Chi'lly Chat video layout path.
- iOS proof result: Pending. Cross-platform responsive support is not Closed without tested device/simulator coverage.
- Tablet/foldable proof result: Pending. iOS/tablet/foldable proof remains Pending unless tested.
- Out-of-scope issues documented: stale existing inbox handle metadata, false missed-call event after a joined call ends, background push/ringing proof, wrong role/owner badge review, possible local/remote naming issues, camera mirror/rotation review, confusing status pills review, and installed two-phone video proof remain separate blockers.
- Whole-app responsive audit result: Direct Chat video call is source-fixed now. Chat inbox and thread generally use safe-area padding but need future keyboard/long-list verification; Profile needs future responsive card/header audit; Settings needs long-form/large-font review; Player and Watch-Party/Live Stage already contain local safe-area logic but need consolidation into the shared foundation; Waiting rooms, Home, Search/Explore People, and Money Center are not fully inspected in this lane.
- Proof result: Android two-phone installed responsive video layout proof passed. Responsive foundation added. Direct Chat video call layout adapts by dimensions and safe area. Source fixed is not installed-app proof; this result is based on Google Play-installed v61 actual user flow proof.
- Remaining blockers: iOS/tablet/foldable proof remains Pending unless tested; background push/ringing and decline/missed/background cleanup remain Partial; user -> owner video direction was not separately rerun; stale existing inbox participant metadata can still appear.

Google-signed v61 responsive video call proof:

- Repo commit proved: `70b276c336b1164a674a8ae51b421e0a039d0d35` (`Fix responsive cross-platform video layout`).
- Origin/main alignment before build: `git status --short --branch` showed `## main...origin/main`; tracked working tree was clean except unrelated untracked local artifact/temp files.
- EAS build id: `bc2e9532-6a1e-4174-a153-679345c6ef20`.
- Build artifact type: Android App Bundle / store distribution.
- VersionCode/versionName: versionCode `61`, versionName `1.0.0`, runtimeVersion `1.0.0`.
- Commit SHA included: `70b276c336b1164a674a8ae51b421e0a039d0d35`.
- Google Play internal upload status: EAS Submit `36c7bae7-4181-4c67-ac46-75070f76142f` completed with release track `internal` and release status `COMPLETED`; no Play production release happened.
- Tester availability / rollout result: both phones saw the Google Play `Update` button and updated through Google Play only.
- Installed package proof: `R3CXA0DS5JV` and `R5CR120QCBF` both show package `com.chillywood.mobile`, installerPackageName `com.android.vending`, versionCode `61`, versionName `1.0.0`.
- `R3CXA0DS5JV` update proof: lastUpdateTime `2026-06-28 19:05:47`.
- `R5CR120QCBF` update proof: lastUpdateTime `2026-06-28 19:06:13`.
- No logout/data reset confirmation: both apps launched after the Play update into signed-in Home/Profile surfaces, not login. No logout, uninstall, reinstall, or clear-data happened.
- Responsive layout proof result: Android two-phone installed proof passed for the Direct Chi'lly Chat video path. Video feed must not be cut off by bottom controls. Bottom controls must respect safe area. Participant metadata overlay must not block the center of the video. Local and remote video must be visible on both phones. Video tiles must adapt to phone size instead of hard-coded device hacks.
- Direct Chat video call result: `R3CXA0DS5JV` opened Chi'lly Chat from the visible Profile button, opened the visible `user230455 @user230455` thread from the inbox, tapped `Video Call`, and `R5CR120QCBF` received a real incoming video call overlay while elsewhere in app.
- Receiver banner result: `R5CR120QCBF` tapped `Open incoming Chi'lly Chat call`; the app opened the readable direct thread/call surface and did not show `This Chi'lly Chat thread could not be found`.
- Two-phone video result: both phones showed `2 in call`, `Connected`, local video, and remote video. Room `622ZK4` proved the first joined call; room `5ZVR4J` proved repeated call after end used a new active room rather than stale ended state.
- Bottom feed cutoff result: passed on both phones; bottom video tile stayed above the Camera/Mic/End Call row.
- Participant overlay/card result: passed; metadata appeared as compact edge badging, not a wide dark card across the center of video.
- Video fill result: passed; local and remote camera feeds filled the available tile/card cleanly with no visible control overlap.
- Owner-involved video result: passed for owner account `chillywood92` -> user `user230455`. User -> owner direction was not separately rerun and remains unproved.
- Back to Thread result: passed. `Back to Thread` returned `R3CXA0DS5JV` to the thread while preserving a visible `Join Video Call` active-call path.
- End Call result: passed. Host `End Call` returned both phones to direct-thread screens with `No Active Call`.
- Call cleanup result: passed for caller-ended joined video calls and repeated call after end. After both ended calls, final XML showed `No Active Call`, no `Video call active`, and no visible `Missed voice/video call`. Receiver decline, ignored/missed, background/killed-app cleanup, and raw database field readback were not fully tested and remain Partial.
- Fresh profile handle result: passed for current primary surfaces. `R5CR120QCBF` profile showed `user230455` / `@user230455`, `R3CXA0DS5JV` inbox/thread showed `user230455` / `@user230455`; stale `Proof Normal @user230456` remains visible as an existing separate inbox metadata row and is documented, not hidden.
- Android proof result: Android two-phone installed proof passed.
- iOS proof result: Pending. Cross-platform responsive support is not Closed without tested device/simulator coverage.
- Tablet/foldable proof result: Pending. iOS/tablet/foldable proof remains Pending unless tested.
- Screenshots/XML/log artifact paths: `/tmp/chillywood-google-signed-v61-responsive-video-proof-20260628/`.
- Key artifacts: `R3CXA0DS5JV-package-after-play-v61.txt`, `R5CR120QCBF-package-after-play-v61.txt`, `R5CR120QCBF-video-call-banner-v61.png`, `R5CR120QCBF-after-banner-tap-v61.png`, `R3CXA0DS5JV-after-receiver-banner-tap-v61.png`, `R3CXA0DS5JV-back-to-thread-during-call-v61.png`, `R3CXA0DS5JV-after-end-call-v61.png`, `R5CR120QCBF-after-end-call-v61.png`, `R3CXA0DS5JV-second-call-after-wait-v61.png`, `R5CR120QCBF-second-call-after-wait-v61.png`, `R3CXA0DS5JV-final-after-second-end-v61.xml`, `R5CR120QCBF-final-after-second-end-v61.xml`, and paired logcat files.
- Out-of-scope issues found: stale existing inbox handle metadata, background push/ringing proof still pending, receiver decline/missed/background/killed-app cleanup pending, user -> owner direction pending, and whole-app responsive audit pending for non-call surfaces.
- Actual-user proof classification: Closed for Google-signed v61 Android two-phone Direct Chat responsive video layout; Partial for full cross-platform responsive coverage and full call cleanup matrix.
- Safety confirmation: No auth/RLS/chat/account-status permission weakening happened. No service-role chat proof was counted. No provider/live-money mutation happened. liveMoneyEnabled remains OFF. Sideloaded APK proof is not accepted and was not used.

## Google Play Internal Build Result

No new Google Play build was created for the receiver thread-readback backend migration. The receiver readback installed proof below reused Google Play-installed v60 because the failing path was a live Supabase read policy/RLS readback issue, not a binary routing issue. A later Google Play internal v61 build was created and installed for the responsive Direct Chat video layout proof.

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

EAS production Android store build for responsive v61:

- Build ID: `bc2e9532-6a1e-4174-a153-679345c6ef20`
- Artifact type: Android App Bundle / store distribution
- Build profile: `production`
- Channel: `production`
- VersionCode: `61`
- VersionName: `1.0.0`
- RuntimeVersion: `1.0.0`
- Commit SHA included: `70b276c336b1164a674a8ae51b421e0a039d0d35`
- Build status: FINISHED
- AAB artifact: `https://expo.dev/artifacts/eas/0KeAVPInuAxlT12896tNzivWnSdwPlvbI5r0b3vCFT0.aab`
- EAS submit ID: `36c7bae7-4181-4c67-ac46-75070f76142f`
- Google Play internal testing upload status: submitted to Google Play internal; EAS output ended with `Submitted your app to Google Play Store!`
- Tester availability status: both attached phones received the Play `Update`
- Rollout/download availability status: both attached phones updated through Google Play
- No Play production release happened.

## Google-Signed Install Verification

Status: Closed for Google-signed install only.

Both physical phones updated through Google Play internal testing. No `adb install`, downloaded APK manual install, sideload, uninstall, reinstall, clear data, logout, or session reset happened.

## Device Version / Installer Proof

| Device | Package | Installer | Version | Update proof |
| --- | --- | --- | --- | --- |
| `R5CR120QCBF` | `com.chillywood.mobile` | `com.android.vending` | versionCode `60`, versionName `1.0.0` | `lastUpdateTime=2026-06-28 16:49:54`, first install time remained `2026-06-26 01:26:01` |
| `R3CXA0DS5JV` | `com.chillywood.mobile` | `com.android.vending` | versionCode `60`, versionName `1.0.0` | `lastUpdateTime=2026-06-28 16:49:28`, first install time remained present from the prior Play install |

Google-signed v61 responsive video layout proof:

| Device | Package | Installer | Version | Update proof |
| --- | --- | --- | --- | --- |
| `R5CR120QCBF` | `com.chillywood.mobile` | `com.android.vending` | versionCode `61`, versionName `1.0.0` | `lastUpdateTime=2026-06-28 19:06:13`, first install time remained `2026-06-26 01:26:01` |
| `R3CXA0DS5JV` | `com.chillywood.mobile` | `com.android.vending` | versionCode `61`, versionName `1.0.0` | `lastUpdateTime=2026-06-28 19:05:47`, first install time remained present from the prior Play install |

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
- Source fixed is not installed-app proof. The v61 installed proof passed for joined video-call end cleanup and repeated call after end at the UI level: both phones returned to `No Active Call`, no visible false missed-call text appeared, and the repeated call used a new room. Receiver decline, ignored/missed, background/killed-app cleanup, and database-level active-call field readback remain Partial.

Not proved:

- Receiver decline.
- Missed call event cleanup.
- Backgrounded/killed app cleanup.
- Repeated video call after end across both joined participants was proved once on v61 with new room `5ZVR4J`.
- Database-level verification that `chat_threads.active_communication_room_id` and `chat_threads.active_call_type` cleared after every required state.

Call end/decline/missed cleanup must be proved before full call closure.

## Blocked/Restricted/Signed-Out Safety Result

Status: Source/RPC verified / installed proof partial.

RPC safety checks deny restricted/unavailable/blocked/unauthorized targets before thread creation. Manual installed proof for blocked/restricted/signed-out cases was not rerun in this pass.

## Cross-surface stale identity metadata fix

Status: Source fixed / installed proof pending v62+.

Root cause: existing user-list and participant surfaces could let stale local options, denormalized member rows, or role/read-model identity labels win over the current remote `user_profiles` row. That allowed Settings/Profile/Chat search/direct-thread header to show fresh `@user230455` while an existing Chat inbox row could still show stale `@user230456`.

One user identity must render consistently across profile, chat, search, circle, followers, and following. Fresh remote profile must win over stale AsyncStorage. Settings/Profile/Chat must agree on the current handle. Circle/Followers/Following must not keep stale handle metadata as primary identity. Existing inbox rows must not show stale participant metadata as primary identity. Stale @user230456 is not Closed if it still appears as the primary inbox, circle, follower, following, or user-card identity.

Files changed:

- `_lib/userData.ts`
- `_lib/chat.ts`
- `_lib/communication.ts`
- `_lib/adminReadModels.ts`
- `_lib/moderation.ts`
- `_lib/platformIdentity.ts`
- `components/chat/internal-invite-sheet.tsx`

Cache path reviewed: signed-in Profile now prefers fresh remote profile over stale AsyncStorage, and Settings saves still write the shared profile cache after the remote username/display state is known.

Remote profile path reviewed: `buildUserChannelProfile()` now chooses remote `displayName`, `username`, active profile avatar, and tagline before stale caller-provided options.

Inbox metadata query/render path reviewed: `listChatThreads()` enriches thread members from current `user_profiles`, and `subscribeToInbox()` reloads when any readable thread member metadata changes. Existing inbox rows should no longer keep stale participant metadata as primary identity after the updated app refreshes.

Circle query/render path reviewed: Circle rows are built through `readUserProfileByUserId()` and the shared channel-profile helper, so they inherit fresh remote profile priority.

Followers query/render path reviewed: channel audience/follower rows read `user_profiles` directly and do not rely on relationship-table display snapshots; installed proof remains pending.

Following query/render path reviewed: friend/following rows are built through `readUserProfileByUserId()` and the shared channel-profile helper, so they inherit fresh remote profile priority.

Shared user-card/profile-display path reviewed: invite/user-card merge now prefers fresh search results over existing thread snapshots; profile and channel display helpers prefer remote profile identity before stale fallback metadata.

Platform and role identity path reviewed: Platform/owner/admin/moderator/creator surfaces must use the same fresh profile identity source as Chat/Profile/Search/Circle/Followers. Role badges may show role/status, but they must not cause stale handle/name/avatar metadata to win. The app must not confuse role identity with profile identity. A user can have a platform role, but their visible handle must still refresh from the current remote profile. Platform-owner paths must not be used to bypass normal user identity/RLS/chat/social rules. First Owner permissions and ownership rules were not changed. Role surfaces not reached in installed proof are Not inspected, not Closed.

Supabase RPC / migration changes: none for this lane. This is an app-side identity display and self-snapshot refresh fix using the authenticated client and existing RLS.

Proof result: Source fixed. Google Play internal install is not enough without actual user flow proof, and this source fix is not installed-app proof until a v62+ Google Play internal build is installed by Google Play on both phones and the identity comparison is rerun.

## Cross-Lane Issues Found

| Issue | Classification | Disposition |
| --- | --- | --- |
| Existing Chat inbox row can still display stale `@user230456` after Settings/Profile/search show `@user230455`. | Source fixed / installed proof pending | Cross-surface stale identity metadata fix updates the shared profile display priority, refreshes signed-in denormalized membership snapshots after remote profile save, reloads inbox on any readable member metadata change, and refreshes platform-role labels from `user_profiles`. Source fixed is not installed-app proof; v62+ Google Play internal proof is still required. |
| Receiver tapping the app-wide incoming call banner opened `This Chi'lly Chat thread could not be found.` | Fixed in backend / installed proof passed | `20260628223918_chilly_chat_direct_member_platform_owner_thread_readback` fixed the receiver readback path. R5 tapped the real incoming banner and joined the correct voice call surface with both phones showing `2 in call`. |
| Joined installed v60 call recorded `Voice call ended` and then a false `Missed voice call`. | Partially fixed / more cleanup proof needed | v61 joined video-call end proof showed `No Active Call` on both phones and no visible false missed-call text; receiver decline, ignored/missed, background/killed-app cleanup, and database field readback remain Partial. |
| Video call lower participant feed is cut off by bottom controls and participant metadata covers too much video. | Closed for Android two-phone installed responsive layout | Google Play-installed v61 proved no bottom feed cutoff, no control overlap, compact metadata, and local/remote video on both phones. iOS/tablet/foldable proof remains Pending unless tested. |
| `R5CR120QCBF` Profile displays an `Owner` badge for `user230455` during proof. | Human review | Review account role/badge source before launch; no account mutation happened in this lane. |
| Android logcat included Firebase push/FIS auth errors while Settings showed push not registered on R5 earlier. | Should fix before launch | Push/ringing remains Partial until background push is proved on installed app. |

Out-of-scope is not an excuse to ignore visible user-facing problems.

Small safe visible issues were fixed where found.

Risky or larger issues were documented instead of hidden.

## Fixes Made

- Added cross-surface stale identity metadata source fix.
- Updated `_lib/userData.ts` so `buildUserChannelProfile()` prefers fresh remote profile display name, handle, avatar, and tagline over stale options/AsyncStorage snapshots.
- Updated `_lib/userData.ts` so successful Settings profile saves refresh the signed-in user's `chat_thread_members`, `communication_room_memberships`, and `watch_party_room_memberships` display snapshots without logout, reinstall, clear-data, or service-role proof.
- Updated `_lib/chat.ts` so existing inbox rows are enriched from current `user_profiles` and the inbox subscription reloads when any readable thread member metadata changes, not only the current user's member row.
- Updated `_lib/communication.ts` so call/room identity reads pass the full current profile into the shared profile display helper.
- Updated `components/chat/internal-invite-sheet.tsx` so fresh search results win over existing thread snapshots in the invite/user-card merge path.
- Updated `_lib/adminReadModels.ts`, `_lib/moderation.ts`, and `_lib/platformIdentity.ts` so Platform owner, Admin, Moderator, Creator, and role roster identity labels prefer fresh profile display/handle while role badges remain role/status only.
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

- Cross-surface stale identity source fix is not installed-app proof. v62+ Google Play internal proof must confirm Settings/Profile/Chat/Search/Thread/Inbox/Circle/Followers/Following/shared user-card/platform-role surfaces no longer show stale `@user230456` as primary identity.
- Platform owner, First Owner, Admin, Moderator, Creator, Host, and role-badge surfaces were source-audited for identity priority; any surface not reached in the installed app remains Not inspected, not Closed.
- Full search term matrix across all surfaces remains incomplete.
- Video call local/remote Android installed proof is Closed for the owner -> user v61 path; user -> owner direction and iOS/tablet/foldable proof remain incomplete.
- Background push/ring proof remains incomplete.
- Joined video-call end cleanup is proved at the UI level on v61, but decline/missed/background/killed-app cleanup and database-level active-call field readback remain incomplete.

## Remaining Launch Blockers

1. Build and install a v62+ Google Play internal update containing the cross-surface stale identity metadata fix, then prove existing inbox, Circle, Followers, Following, shared user-card, and platform/role identity surfaces agree on the current handle.
2. Prove receiver decline, ignored/missed, background/killed-app cleanup, and database-level active-call field readback.
3. Prove receiver same-thread and background/push separately where not already covered by the v60/v61 foreground proofs.
4. Prove user -> owner video direction if needed for symmetric proof.
5. Prove iOS/tablet/foldable responsive coverage before claiming cross-platform responsive support Closed.

## Screenshots/XML/Log Artifact Paths

Artifact root:

- `/tmp/chillywood-google-signed-v60-direct-chat-call-proof-20260628/`
- `/tmp/chillywood-receiver-banner-thread-readback-fix-20260628/`
- `/tmp/chillywood-google-signed-v61-responsive-video-proof-20260628/`

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
- `/tmp/chillywood-google-signed-v61-responsive-video-proof-20260628/R3CXA0DS5JV-package-after-play-v61.txt`
- `/tmp/chillywood-google-signed-v61-responsive-video-proof-20260628/R5CR120QCBF-package-after-play-v61.txt`
- `/tmp/chillywood-google-signed-v61-responsive-video-proof-20260628/R5CR120QCBF-video-call-banner-v61.png`
- `/tmp/chillywood-google-signed-v61-responsive-video-proof-20260628/R5CR120QCBF-after-banner-tap-v61.png`
- `/tmp/chillywood-google-signed-v61-responsive-video-proof-20260628/R3CXA0DS5JV-after-receiver-banner-tap-v61.png`
- `/tmp/chillywood-google-signed-v61-responsive-video-proof-20260628/R3CXA0DS5JV-back-to-thread-during-call-v61.png`
- `/tmp/chillywood-google-signed-v61-responsive-video-proof-20260628/R3CXA0DS5JV-final-after-second-end-v61.xml`
- `/tmp/chillywood-google-signed-v61-responsive-video-proof-20260628/R5CR120QCBF-final-after-second-end-v61.xml`
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

No service-role chat/social proof was counted.

No provider/live-money mutation happened.

liveMoneyEnabled remains OFF.

No sideload, adb install, APK manual install, logout, uninstall, reinstall, clear-data, or session reset happened.
