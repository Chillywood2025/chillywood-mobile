# Chi'lly Chat Google Play Internal Call Closure

Chi’lly Chat Google Play internal actual-user call proof: Closed / Partial / Blocked

Final verdict: Partial.

Google Play internal v59 delivery is complete on both physical phones, but Chi'lly Chat end-to-end actual-user call closure is not Closed. Google Play internal install is not enough without actual user flow proof. Source fixed is not installed-app proof. If Robert/testers cannot reproduce it in the Play-internal installed app, it is not actual-user Closed.

June 28, 2026 v60 receiver banner thread-readback + video layout follow-up: `docs/release/GOOGLE_SIGNED_V60_DIRECT_CHAT_CALL_PROOF.md` is Partial. Both attached phones updated through Google Play internal to versionCode `60` with installer `com.android.vending`, and no logout, uninstall, reinstall, sideload, or clear-data happened. Fresh `user230455` search and visible direct-thread open succeeded after targeted authenticated RPC ambiguity fixes. A live receiver readback migration fixed the installed blocker where tapping the receiver banner opened `This Chi'lly Chat thread could not be found.`; after the fix, R5 tapped the real incoming banner and both phones showed `2 in call`. Source now also fixes the observed video layout issue where the lower feed could be cut off by bottom controls and a dark participant card covered too much of the feed. Full actual-user call closure remains Partial because installed v60 recorded a false `Missed voice call` after the joined call ended, the cleanup/video layout source fixes are not installed in Google Play yet, and video, background push, same-thread, decline/missed, and full cleanup proof remain incomplete.

## Required Proof Doctrine

Same-thread proof is not enough.

Users must be able to start Voice/Video Call without both phones already inside the same thread.

Pre-created thread/call state is not actual-user proof.

Receiver elsewhere in app must get app-wide incoming call state or remain Partial.

Background push/ringing must be proved separately or remain Partial.

Call end/decline/missed cleanup must be proved before full call closure.

Source fixed is not installed-app proof.

Google Play internal install is not enough without actual user flow proof.

No logout, uninstall, reinstall, or clear-data happened.

If Robert/testers cannot reproduce it in the Play-internal installed app, it is not actual-user Closed.

Out-of-scope is not an excuse to ignore visible user-facing problems.

Small safe visible issues were fixed where found.

Risky or larger issues were documented instead of hidden.

## Repo Commit Proved

Repo HEAD before the v59 build and submit was:

- `f0a41ab3b8bec606bc682b8e1d4494c8bd8cb580`
- Commit message: `Prove chilly chat play v58 calls`

This commit includes the required recent fixes:

- `0a22ab3e2612d4f888b4f56eac03c0639cac26ae` - Chi'lly Chat end-to-end call initiation fix.
- `55557539ceb076e8a073a155d5f5394007fe79d6` - cross-app people/handle search fix.
- `a3a006f90db48d4f5bda5cb08f1acb42212073cc` - Owner/Admin/Moderator search parity audit.

## Origin/Main Alignment

Before the build:

- `git status --short --branch`: `## main...origin/main`
- `git rev-parse HEAD`: `f0a41ab3b8bec606bc682b8e1d4494c8bd8cb580`
- `git rev-parse origin/main`: `f0a41ab3b8bec606bc682b8e1d4494c8bd8cb580`
- Origin/main alignment documented: HEAD == origin/main.

Only pre-existing unrelated untracked local artifact directories/files were present; they were not used as source proof and were not touched.

## Google Play Internal Build / Install Result

EAS production Android build:

- Build ID: `7cf16ebe-a3de-4efb-8170-63a5e9799653`
- Platform: Android App Bundle
- Build profile: `production`
- Distribution: store
- Channel: `production`
- VersionName: `1.0.0`
- VersionCode: `59`
- RuntimeVersion: `1.0.0`
- Commit SHA included: `f0a41ab3b8bec606bc682b8e1d4494c8bd8cb580`
- Build status: `FINISHED`

EAS submit:

- Submission ID: `0c9b2162-c259-4934-a0e8-5679f524b609`
- Google Play track: `internal`
- Release status: `COMPLETED`
- Google Play upload result: accepted by Google Play internal testing.
- Play production submission did not happen.

## Device Version Verification

Both devices were attached by adb and updated only through the Google Play listing for `com.chillywood.mobile`.

| Device | Role | Package | Installer | Version | Last update | Result |
| --- | --- | --- | --- | --- | --- | --- |
| `R5CR120QCBF` | Phone B / normal user receiver candidate | `com.chillywood.mobile` | `com.android.vending` | versionName `1.0.0`, versionCode `59` | `2026-06-28 15:03:23` | Play internal update installed and app launched |
| `R3CXA0DS5JV` | Phone A / Owner/Admin caller candidate | `com.chillywood.mobile` | `com.android.vending` | versionName `1.0.0`, versionCode `59` | `2026-06-28 15:02:36` | Play internal update installed and app launched |

The emulator was visible to adb but was not used as Play-internal proof.

## No Logout / No Data Reset Confirmation

No logout, uninstall, reinstall, or clear-data happened.

Both phones launched into signed-in app screens after the Play v59 update. No account session reset was performed. No sideload was used.

## Search Prerequisite Result

Status: Partial.

Normal user `R5CR120QCBF` searching Owner/Admin handle `chillywood92` returned no public People result. This is expected behavior under the current public People policy because normal users should not discover Owner/Admin proof identity through public People search. This is not treated as proof that normal public search is broken.

Owner/Admin `R3CXA0DS5JV` searching the normal user handle/display target `user230456` found one visible existing thread through the Chat inbox thread-search portion. The People suggestion panel showed no matching public People result because the direct thread already existed and the inbox filters existing direct-thread participants out of People suggestions. This opened the correct proof direction for existing-thread proof, but the subsequent call proof did not complete.

The owner reported other normal people search works. That report is consistent with the expected Owner/Admin search policy, but it is not counted as a full installed-app proof artifact by itself.

June 28 retry with updated normal-user handle:

- Owner/Admin R3 searched `user230455`.
- The People result appeared as `user230455 @user230455` with visible `Chi'lly Chat`, `Voice Call`, and `Video Call` actions.
- Public-safe anon comparison found `user230455` and did not find `user230456`; only hashed identity comparison was used, and no raw backend user IDs were retained in this proof.
- Tapping `Voice Call` from the visible People result did not start a call. The app stayed in the inbox search surface and showed safe copy: `Unable to open Chi'lly Chat with this person right now.`
- Tapping `Chi'lly Chat` from the same visible People result produced the same safe failure copy.
- This confirms the v59 installed blocker moved from search discovery to direct-thread open/create before call start.
- The owner also showed Settings reporting the handle as current at `@user230455` while normal Profile still displayed the stale `@user230456` handle. That is documented as a Settings/Profile/Chat stale identity propagation bug, not as Closed call proof.

## Inbox/Search Call Path Result

Status: Partial.

R3 opened Chi'lly Chat through the normal visible Profile -> Chi'lly Chat path and searched for the normal user `user230456`. The existing direct thread was found through the visible search/filter path.

The later `user230455` retry proved the updated handle can be found through the visible Chat inbox People search, but both `Chi'lly Chat` and `Voice Call` failed before opening or creating the direct thread. The user-facing error was sanitized and did not expose raw backend/provider details.

This does not close the full inbox/search path because no new v59 Voice Call or Video Call was completed from the search result with receiver-visible incoming call state.

If the direct thread does not exist, the source path still routes suggestion actions through `getOrCreateDirectThread()`, but v59 installed proof showed that the visible result can fail before thread open/create when stale identity/thread state exists. This remained Partial on installed v59.

## Existing Thread Call Path Result

Status: Partial.

R3 opened the existing direct thread with R5 from the Chat inbox. The thread initially showed stale `Video call live` state in the inbox, then opening the thread refreshed it to `No Active Call`.

That is useful cleanup evidence, but it is not full closure. No fresh v59 voice/video call was completed from this thread after both devices were verified on v59.

## Normal Profile Call Path Result

Status: Partial.

Both phones opened normal in-app self Profile routes after the v59 Play update:

- R3 profile showed `Chi'llywood Admin Proof @chillywood92` with visible `Chi'lly Chat`.
- R5 profile showed `user230456 @user230456` with visible `Chi'lly Chat`.
- The owner later showed the same user phone Settings reporting current handle `@user230455` while normal Profile still displayed stale `@user230456`.

Normal profile navigation works, but Profile handle freshness is not Closed on v59. The profile-to-other-user call path was not fully proved on v59, because the fresh call flow did not complete.

## Deep-Link Fallback Result

Status: Source fixed / installed proof not rerun.

If a deep-linked profile has a valid target userId but missing profile data, it must not fake profile content. It may show a limited safe shell or route to Chat search/start-chat fallback.

Deep-link behavior is documented separately from normal in-app Profile. A deep-link-only Profile unavailable state is not counted as proof that normal in-app Profile is broken.

## Receiver Same-Thread Result

Status: Partial.

No v59 same-thread receiver proof was completed. Same-thread proof is not enough even if it later passes.

## Receiver Elsewhere-In-App Result

Status: Partial.

R5 was signed in and not deliberately placed inside the R3/R5 thread for the v59 proof continuation. However, no fresh v59 call was completed and no receiver app-wide incoming call banner/status was proved.

Receiver elsewhere in app must get app-wide incoming call state or remain Partial.

## Receiver Background/Push Result

Status: Partial.

Background/outside-app ringing was not proved. No Android push/ring notification artifact was captured after v59 update. Background push/ringing must be proved separately or remain Partial.

## Voice Call Result

Status: Partial.

No fresh v59 voice call reached end-to-end caller/receiver joined state. Caller delivery status and receiver-visible incoming call state therefore remain unclosed for v59.

## Video Call Local/Remote Result

Status: Partial.

No fresh v59 video call showed:

- Phone A local video.
- Phone A remote video from Phone B.
- Phone B local video.
- Phone B remote video from Phone A.

Video call Closed cannot be claimed without local and remote video on both phones.

## Fullscreen Video Fit Result

Status: Partial.

Direct Chat fullscreen video layout is source-fixed in the v60+ layout lane so bottom controls reserve safe-area space and participant metadata stays compact at the tile edge, but no v59 installed two-phone video call reached the local/remote video state on both phones. Fullscreen video fit remains installed proof pending.

## Call End / Decline / Missed Cleanup Result

Status: Partial.

Opening the stale live-call thread refreshed it to `No Active Call`, but the required full cleanup matrix was not completed:

- caller ends call
- receiver declines call
- receiver ignores/misses call
- app killed/backgrounded during call
- repeated call attempts after end

Call end/decline/missed cleanup must be proved before full call closure.

## Blocked/Restricted/Signed-Out Safety Result

Status: Source guarded / not v59 actual-user rerun.

The existing source guards still require signed-in users, receiver-visible thread state, invite persistence, sanitized failure copy, and account-restricted receiver unavailable status. This v59 installed lane did not rerun blocked/restricted/signed-out manual proof.

## Cross-Lane Issues Found

| Issue | Classification | Disposition |
| --- | --- | --- |
| Normal user searching Owner/Admin handle `chillywood92` returns no public People result. | Not a bug / expected behavior | Owner/Admin proof identity should not be used as the normal public People target. Use Owner/Admin -> normal user or normal user -> normal public user for search proof. |
| Existing inbox rows showed stale `Video call live` / `Voice call live` state before thread open. | Must fix before full call closure | Opening the thread refreshed one stale row to `No Active Call`; inbox stale state still needs launch-blocker cleanup proof. |
| Public People suggestions hide existing direct-thread participants, leaving thread search as the visible result. | Not a bug / expected behavior | Existing direct thread path can be opened through the thread result; brand-new start-chat proof still needs a non-existing normal target. |
| Settings showed current handle `@user230455` while normal Profile and the existing Chat thread still showed stale `@user230456`. | Must fix before full call closure | Source fix now makes signed-in profile reads prefer remote profile data over stale AsyncStorage and saves handle updates into the shared profile cache. Installed proof still requires a new Play internal build. |
| Visible `user230455` People result exposed `Chi'lly Chat`, `Voice Call`, and `Video Call`, but both Chat and Voice failed before thread open/create. | Must fix before full call closure | Source fix now adds an authenticated direct-thread open/create repair RPC and client fallback after pair-key conflicts, member repair failures, and readback failures. Installed proof still requires a new Play internal build. |
| R3 left the target app during proof continuation. | Human review / proof blocker | Non-target captures were deleted and not counted. Installed call proof stopped rather than faking actual-user closure. |

## Fixes Made

Initial v59 lane fixes were documentation/proof-policy only. A mistaken source edit to treat Chat inbox search as authenticated staff search was reverted because Owner/Admin public hiding is expected.

Follow-up source fixes after the `user230455` retry:

Source fixes are now applied but not installed-app proof until a newer Google Play internal build contains these changes and the actual user flow is rerun.

- `_lib/userData.ts`: signed-in `readUserProfile()` now prefers the remote profile over stale AsyncStorage and only falls back to local cache when remote profile data is unavailable.
- `app/settings.tsx`: after a handle update succeeds, Settings writes the updated username into the shared local profile cache via `saveUserProfile()`.
- `_lib/chat.ts`: existing direct threads returned by `getOrCreateDirectThread()` are enriched with current username/profile data before navigation.
- `_lib/chat.ts`: direct-thread open/create now falls back to authenticated `get_or_create_direct_chat_thread` repair when a pair-key conflict, member repair failure, membership insert failure, or post-create readback failure prevents the visible People result from opening the thread.
- `supabase/migrations/20260628205325_chilly_chat_direct_thread_open_repair.sql`: adds a narrow authenticated direct-thread open/create repair function. It only operates on the caller/target pair, preserves platform-owner chat restrictions, returns only the thread id, and still requires normal RLS readback in the app before the caller sees success.

Small safe visible issues were fixed where found in prior source lanes. Risky or larger issues were documented instead of hidden.

## Issues Documented But Not Fixed

- Full v59 actual-user call flow was not completed after both phones updated.
- Stale live-call inbox state remains visible before thread refresh.
- v59 installed app still has stale handle propagation: Settings can show `@user230455` while Profile/Chat show `@user230456`.
- v59 installed app can find `user230455` in Chat People search but fail to open/create the direct thread before call start.
- Receiver elsewhere-in-app incoming call banner was not proved on v59.
- Background push/ringing was not proved on v59.
- Video local/remote on both phones was not proved on v59.
- Call end/decline/missed cleanup matrix was not proved on v59.

## Remaining Launch Blockers

1. Keep both phones on Play-installed v59 or newer from Google Play internal testing.
2. Put both phones on the target Chi'llywood app and keep them there during proof.
3. Use a proof direction that respects policy: Owner/Admin -> normal user, or normal public user -> normal public user. Do not treat normal user -> Owner/Admin no-result as a product search failure.
4. Deliver the source fixes after `e5d26fbe141e2c716c6154b5ab6a994fe821d5ee` through a new Google Play internal build.
5. Verify Settings, normal Profile, Chat inbox rows, and People search all agree on the current handle after a handle change.
6. Rerun inbox/search start-chat from `user230455` or another normal target and prove the direct thread opens/creates before starting a call.
7. Rerun existing direct thread and normal Profile paths.
8. Prove receiver same-thread, receiver elsewhere-in-app, and receiver background/push separately.
9. Prove Voice Call and Video Call with joined state on both phones.
10. Prove local/remote video and fullscreen aspect-fit behavior.
11. Prove call end/decline/missed cleanup clears active call state and does not leave stale inbox/thread rows.

## Screenshots/XML/Log Artifact Paths

Artifact root:

- `/tmp/chillywood-google-play-internal-call-closure-20260628/`

Build/submit:

- `/tmp/chillywood-google-play-internal-call-closure-20260628/eas-build-v59.json`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/eas-build-v59.stderr`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/eas-submit-v59.txt`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/eas-submit-v59.stderr`

Package/version/install:

- `/tmp/chillywood-google-play-internal-call-closure-20260628/adb-devices-before-v59-update.txt`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/R5CR120QCBF-package-before-v59-update.txt`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/R3CXA0DS5JV-package-before-v59-update.txt`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/R5CR120QCBF-package-after-second-play-v59-update-attempt.txt`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/R3CXA0DS5JV-package-after-first-play-v59-update-attempt.txt`

Play listing/update:

- `/tmp/chillywood-google-play-internal-call-closure-20260628/R5CR120QCBF-play-listing-v59-attempt.png`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/R3CXA0DS5JV-play-listing-v59-attempt.png`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/R3CXA0DS5JV-play-listing-v59-attempt.xml`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/R5CR120QCBF-play-v59-update-after-tap.png`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/R5CR120QCBF-play-v59-update-after-wait.png`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/R3CXA0DS5JV-play-v59-update-after-tap.png`

Session/profile/chat:

- `/tmp/chillywood-google-play-internal-call-closure-20260628/R5CR120QCBF-app-launch-after-play-v59.png`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/R3CXA0DS5JV-app-launch-after-play-v59.png`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/R3CXA0DS5JV-app-launch-after-play-v59.xml`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/R5CR120QCBF-self-profile-normal-path-native-tap-after-v59.png`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/R3CXA0DS5JV-self-profile-after-v59.png`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/R3CXA0DS5JV-self-profile-after-v59.xml`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/R5CR120QCBF-chat-inbox-from-profile-v59.png`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/R3CXA0DS5JV-chat-inbox-from-profile-v59.png`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/R3CXA0DS5JV-chat-inbox-from-profile-v59.xml`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/R5CR120QCBF-chat-search-chillywood92-v59.png`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/R3CXA0DS5JV-chat-search-user230456-v59.png`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/R3CXA0DS5JV-existing-thread-after-stale-open-v59.png`
- `/tmp/chillywood-google-play-internal-call-closure-20260628/R3CXA0DS5JV-existing-thread-after-stale-open-v59.xml`

June 28 `user230455` retry:

- `/tmp/chillywood-chilly-chat-retry-user230455-20260628/R3CXA0DS5JV-chat-search-user230455.png`
- `/tmp/chillywood-chilly-chat-retry-user230455-20260628/R3CXA0DS5JV-chat-search-user230455.xml`
- `/tmp/chillywood-chilly-chat-retry-user230455-20260628/R3CXA0DS5JV-after-user230455-voice-start-retry2.png`
- `/tmp/chillywood-chilly-chat-retry-user230455-20260628/R3CXA0DS5JV-after-user230455-voice-start-retry2.xml`
- `/tmp/chillywood-chilly-chat-retry-user230455-20260628/R3CXA0DS5JV-after-user230455-chat-action.png`
- `/tmp/chillywood-chilly-chat-retry-user230455-20260628/R3CXA0DS5JV-after-user230455-chat-action.xml`

Any accidental non-target or private-account screenshots captured during navigation were deleted and are not listed, counted, committed, or used as proof.

## Actual-User Proof Classification

Chi'lly Chat Google Play internal actual-user call proof remains Partial because v59 delivery succeeded but the actual end-to-end voice/video call flow was not completed through normal visible paths on both phones.

## Safety Confirmation

No auth/RLS/chat/account-status permission weakening happened.

No service-role chat proof was counted.

No provider/live-money mutation happened.

liveMoneyEnabled remains OFF.

No logout, uninstall, reinstall, clear-data, sideload, Play production submission, purchase, payout, cashout, refund execution, provider dashboard mutation, First Owner touch, raw secret/token/private-data exposure, or private account screenshot artifact was retained.
