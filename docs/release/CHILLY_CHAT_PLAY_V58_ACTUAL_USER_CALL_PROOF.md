# Chi'lly Chat Play v58 Actual-User Call Proof

Chi’lly Chat Play v58 actual-user call proof: Closed / Partial / Blocked

Final verdict: Partial.

v58 is Play-installed on both attached phones, and the latest amended source fix was pushed to `origin/main`, but v58 actual-user proof is not Closed. v58 installed is not enough without actual user flow proof. Source fixed is not installed-app proof. If Robert/testers cannot reproduce it in the Play-internal installed app, it is not actual-user Closed.

The owner later confirmed the search problem was fixed in a separate chat and instructed not to use the search box again until Chat is fixed and a v59 Play-internal build is available. No search-box-dependent v58 result is counted as Closed.

## Required Proof Doctrine

Same-thread proof is not enough.

Users must be able to start Voice/Video Call without both phones already inside the same thread.

Pre-created thread/call state is not actual-user proof.

Receiver elsewhere in app must get app-wide incoming call state or remain Partial.

Background push/ringing must be proved separately or remain Partial.

Source fixed is not installed-app proof.

v58 installed is not enough without actual user flow proof.

If Robert/testers cannot reproduce it in the Play-internal installed app, it is not actual-user Closed.

Out-of-scope is not an excuse to ignore visible user-facing problems.

Small safe visible issues were fixed where found.

Risky or larger issues were documented instead of hidden.

## Repo Commit Proved

The latest amended source fix to preserve was `0a22ab3e2612d4f888b4f56eac03c0639cac26ae` (`Fix chilly chat end to end call initiation`).

This commit contains the source fixes for normal visible call initiation, receiver invite state, delivery status, app-wide invite subscription, and profile fallback, but it is newer than the already-delivered v58 binary. Therefore, source is aligned and source-fixed, while installed-app actual-user proof remains Partial until a v59 Play-internal build carries the fix.

## Origin/Main Alignment

Before installed-app proof began, repo alignment was verified:

- `git status --short --branch`: `## main...origin/main`
- `git log --oneline -5`: top commit `0a22ab3 Fix chilly chat end to end call initiation`
- `git rev-parse HEAD` and `git rev-parse origin/main`: both `0a22ab3e2612d4f888b4f56eac03c0639cac26ae`
- Origin/main alignment documented: HEAD == origin/main.

Only pre-existing unrelated untracked local artifact directories/files were present; they were not touched.

## Device List

| Device | Role | Package | Installer | Version | Result |
| --- | --- | --- | --- | --- | --- |
| `R5CR120QCBF` | Phone A / R5 | `com.chillywood.mobile` | `com.android.vending` | versionName `1.0.0`, versionCode `58` | Attached, Play-installed, launched normally |
| `R3CXA0DS5JV` | Phone B / R3 | `com.chillywood.mobile` | `com.android.vending` | versionName `1.0.0`, versionCode `58` | Attached, Play-installed, launched normally |

The emulator was visible to adb but was not used as Play-internal proof.

## Package/Version/Installer Proof

`R5CR120QCBF`:

- package `com.chillywood.mobile`
- versionCode `58`
- versionName `1.0.0`
- installer `com.android.vending`
- last update time `2026-06-28 00:44:51`
- artifact: `/tmp/chillywood-play-v58-call-proof-20260628/R5CR120QCBF-package.txt`

`R3CXA0DS5JV`:

- package `com.chillywood.mobile`
- versionCode `58`
- versionName `1.0.0`
- installer `com.android.vending`
- last update time `2026-06-27 23:58:50`
- artifact: `/tmp/chillywood-play-v58-call-proof-20260628/R3CXA0DS5JV-package.txt`

Package proof closes only installed-version verification. It does not close actual-user call proof.

## Normal Inbox/Search Path Result

Status: Partial / deferred to v59.

R5 opened Chi'lly Chat from a normal visible path (`R5-03-chat-inbox-from-self-profile.png`). R3 also opened Chi'lly Chat from a normal visible path (`R3-03-chat-inbox-from-self-profile.png`).

Before the owner correction, v58 search attempts were captured and did not establish a full path between the two installed phones:

- R5 searching `chillywood92` did not find R3 in Chat or Explore.
- R3 searching `user230456` found an existing thread row but did not prove new thread creation from search.

After the owner correction, no more v58 search-box interactions are counted. The inbox/search actual-user call-start path waits for the v59 Play-internal build that contains the separate search fix and the latest Chat call source fix.

## Existing Thread Path Result

Status: Partial.

R3 had an existing visible direct thread with R5 (`Proof Normal @user230456`) in the Chat inbox. The inbox initially displayed pre-existing `Video call live` state, but opening the thread refreshed it to `No Active Call` (`R3-05b-existing-thread-open-preexisting-video.png`). That stale pre-existing state was not counted as proof.

From that existing direct thread, R3 tapped visible `Voice Call`. R3 reached a fresh `Voice call active` screen with room code visible and one local participant connected (`R3-06-existing-thread-voice-started.png`).

This is not Closed because R5 did not show receiver-visible app-wide incoming call UI and did not show the reciprocal thread as a joinable receiver state during the captured proof.

## Normal Profile Path Result

Status: Partial / source fixed, installed proof deferred.

Both self-profile routes opened normally:

- R5 self profile: `R5-02-self-profile.png`
- R3 self profile: `R3-02-self-profile.png`

The normal profile path source supports `Chi'lly Chat`, `Voice Call`, and `Video Call` for non-official profiles through `getOrCreateDirectThread()`. However, v58 installed proof did not close profile-to-other-user call start because the receiver discovery path was search-dependent and is deferred to the v59 Play-internal build.

## Deep-Link Fallback Result

Status: Source fixed, not retested as v58 actual-user Closed.

The source lane documents the deep-link fallback separately from normal in-app profile navigation. If a deep-linked profile has a valid target userId but missing public profile data, the app must not fake profile content. It may show a safe limited shell or route to Chi'lly Chat start/search fallback.

Deep-link profile unavailable does not prove normal in-app Profile is broken. It also does not close this v58 actual-user call lane.

## Receiver Same-Thread Result

Status: Partial.

Same-thread receiver proof was not closed on v58. The available visible same-thread-like state was stale/pre-existing and refreshed only after opening the thread. Same-thread proof is not enough, and it was not counted as full actual-user proof.

## Receiver Elsewhere-In-App Result

Status: Partial / must fix or prove in v59.

R5 was signed in and elsewhere in the app while R3 started the fresh voice call from an existing direct thread. R3 showed caller-side status: `Call started. The receiver has an in-app call alert; background push was not confirmed.` Artifact: `R3-07-voice-caller-back-to-thread-delivery.png`.

R5 did not show an app-wide incoming call banner/status in the captured receiver screenshots:

- `R5-06-receiver-elsewhere-voice-incoming.png`
- `R5-07-receiver-elsewhere-voice-after-dismiss-keyboard.png`
- `R5-08-receiver-inbox-after-clear-during-voice.png`

Because the visible receiver app-wide banner was not proved, receiver elsewhere-in-app remains Partial. The caller-side delivery copy may be overclaiming in-app alert availability on v58; this must be fixed or proved with v59 installed evidence before launch.

## Receiver Background/Push Result

Status: Partial.

Background/outside-app ringing was not proved on v58. No Android push/ring notification artifact was captured. Background push/ringing must be proved separately or remain Partial.

Caller-side status on v58 clearly said background push was not confirmed, which is acceptable as a Partial status but not a Closed background ringing proof.

## Voice Call Result

Status: Partial.

R3 started a fresh voice call from a normal visible existing direct thread and reached active local voice-call UI. R5 did not receive a visible app-wide incoming call banner and did not join, so the end-to-end voice call remains Partial.

## Video Call Result

Status: Partial.

No fresh v58 video call was started after the owner correction because the remaining path was search/discovery-dependent and the owner instructed not to use the search box again until v59. Pre-existing video-call rows were not counted as proof.

## Local/Remote Video Result

Status: Partial.

No v58 proof showed:

- Phone A local video
- Phone A remote video from Phone B
- Phone B local video
- Phone B remote video from Phone A

Video call Closed cannot be claimed without local and remote video on both phones.

## Fullscreen Video Fit Result

Status: Partial.

Fullscreen video aspect-fit behavior is source-fixed from the prior lane, but no v58 actual-user call reached the local/remote video state on both phones. Fullscreen video fit remains installed-app proof pending.

## Blocked/Restricted/Signed-Out Safety Result

Status: Source guarded, not v58 actual-user retested in this lane.

The source guard still requires signed-in users, receiver-visible thread state, invite persistence, account-restricted receiver unavailable status, and sanitized user-facing errors. No auth/RLS/chat/account-status permission weakening happened.

## Cross-Lane Issues Found

| Issue | Classification | Disposition |
| --- | --- | --- |
| v58 search did not let R5 find R3, and the owner said the search problem was fixed separately and should not be used again until v59. | Must fix before actual-user closeout | Deferred to v59 Play-internal installed proof. No search-box-dependent v58 result is counted as Closed. |
| R3 inbox showed stale pre-existing `Video call live` state for the R5 thread until opening the thread refreshed to `No Active Call`. | Should fix before launch | Documented. Existing thread stale ended call state must clear safely before users see false live-call rows in inbox. |
| R3 caller status said the receiver had an in-app call alert, but R5 showed no visible app-wide incoming call banner/status. | Must fix before launch | Documented. Caller must not see fake success if receiver-visible incoming call state was not actually available. |
| R5 `uiautomator dump` repeatedly exited with code 137 while screenshots still worked. | Can wait / tooling issue | Documented as tooling limitation. R5 screenshots were used; R3 XML was captured where available. |

## Fixes Made

No product source edits were made in this v58 installed proof lane after the owner correction. The latest source fix remains `0a22ab3e2612d4f888b4f56eac03c0639cac26ae`, already pushed to `origin/main`.

Small safe visible issues were fixed where found in the source lane. In this v58 installed lane, risky or larger issues were documented instead of hidden.

## Issues Documented But Not Fixed

- v59 Play-internal build is needed for the separately fixed search path and latest Chat call source fix.
- Receiver elsewhere-in-app banner was not visible on R5 during the fresh voice-call attempt.
- Caller delivery copy on v58 may overclaim `in-app call alert` when the receiver banner is not visible.
- Inbox stale live-call state can be visible until thread open/refresh.
- Background push/ringing was not proved.
- Video local/remote proof on both phones was not proved.

## Remaining Launch Blockers

1. Build and distribute v59 through Google Play internal testing with the latest Chat call source fix and the separately fixed search path.
2. Verify both phones are Play-installed v59 from `com.android.vending`.
3. Rerun normal inbox/search start-chat path without pre-created call state.
4. Rerun normal Profile path to other user without relying on broken deep-link-only state.
5. Prove receiver same-thread, receiver elsewhere-in-app, and receiver background/push separately.
6. Prove voice and video calls end-to-end, including local and remote video on both phones and fullscreen contain/aspect-fit behavior.
7. Prove caller delivery status does not overclaim receiver alert availability.

## Screenshots/XML/Log Artifact Paths

Artifact root:

- `/tmp/chillywood-play-v58-call-proof-20260628/`

Package and launch:

- `/tmp/chillywood-play-v58-call-proof-20260628/R5CR120QCBF-package.txt`
- `/tmp/chillywood-play-v58-call-proof-20260628/R3CXA0DS5JV-package.txt`
- `/tmp/chillywood-play-v58-call-proof-20260628/R5-00-home-before-proof.png`
- `/tmp/chillywood-play-v58-call-proof-20260628/R3-00-home-before-proof.png`
- `/tmp/chillywood-play-v58-call-proof-20260628/R3-00-home.xml`
- `/tmp/chillywood-play-v58-call-proof-20260628/R3-relaunch-after-cleanup.log`
- `/tmp/chillywood-play-v58-call-proof-20260628/R3-09-home-after-relaunch.png`
- `/tmp/chillywood-play-v58-call-proof-20260628/R5-14-final-v58-state.png`

Normal visible navigation:

- `/tmp/chillywood-play-v58-call-proof-20260628/R5-01b-explore.png`
- `/tmp/chillywood-play-v58-call-proof-20260628/R3-01-explore.png`
- `/tmp/chillywood-play-v58-call-proof-20260628/R3-01-explore.xml`
- `/tmp/chillywood-play-v58-call-proof-20260628/R5-02-self-profile.png`
- `/tmp/chillywood-play-v58-call-proof-20260628/R3-02-self-profile.png`
- `/tmp/chillywood-play-v58-call-proof-20260628/R3-02-self-profile.xml`
- `/tmp/chillywood-play-v58-call-proof-20260628/R5-03-chat-inbox-from-self-profile.png`
- `/tmp/chillywood-play-v58-call-proof-20260628/R3-03-chat-inbox-from-self-profile.png`

Pre-correction search artifacts, not counted as Closed after owner correction:

- `/tmp/chillywood-play-v58-call-proof-20260628/R5-04-chat-search-chillywood92.png`
- `/tmp/chillywood-play-v58-call-proof-20260628/R3-04-chat-search-user230456.png`
- `/tmp/chillywood-play-v58-call-proof-20260628/R3-04-chat-search-user230456.xml`
- `/tmp/chillywood-play-v58-call-proof-20260628/R5-10-explore-search-chillywood92.png`
- `/tmp/chillywood-play-v58-call-proof-20260628/R5-11-explore-search-admin.png`

Existing thread / receiver state:

- `/tmp/chillywood-play-v58-call-proof-20260628/R3-05b-existing-thread-open-preexisting-video.png`
- `/tmp/chillywood-play-v58-call-proof-20260628/R3-05b-existing-thread.xml`
- `/tmp/chillywood-play-v58-call-proof-20260628/R3-06-existing-thread-voice-started.png`
- `/tmp/chillywood-play-v58-call-proof-20260628/R3-06-existing-thread-voice-started.xml`
- `/tmp/chillywood-play-v58-call-proof-20260628/R5-06-receiver-elsewhere-voice-incoming.png`
- `/tmp/chillywood-play-v58-call-proof-20260628/R3-07-voice-caller-back-to-thread-delivery.png`
- `/tmp/chillywood-play-v58-call-proof-20260628/R3-07-voice-caller-back-to-thread-delivery.xml`
- `/tmp/chillywood-play-v58-call-proof-20260628/R5-07-receiver-elsewhere-voice-after-dismiss-keyboard.png`
- `/tmp/chillywood-play-v58-call-proof-20260628/R5-08-receiver-inbox-after-clear-during-voice.png`

Tooling limitation:

- R5 XML dumps intermittently failed with exit code 137. R5 screenshots were captured instead.

## Actual-User Proof Classification

| Item | Classification |
| --- | --- |
| Source fix commit `0a22ab3e2612d4f888b4f56eac03c0639cac26ae` pushed and aligned | Source Closed |
| Both phones Play-installed v58 from `com.android.vending` | Closed for package/version only |
| v58 actual-user inbox/search start-chat path | Partial / deferred to v59 |
| v58 existing direct thread voice-call start from R3 | Partial |
| v58 normal Profile path to other user | Partial / deferred to v59 |
| v58 deep-link fallback | Source fixed, not installed Closed |
| Receiver same-thread | Partial |
| Receiver elsewhere-in-app app-wide banner | Partial |
| Receiver background/push | Partial |
| Voice call joined by both phones | Partial |
| Video local/remote on both phones | Partial |
| Fullscreen video fit | Partial |

## Safety Confirmation

No auth/RLS/chat/account-status permission weakening happened.

No service-role chat proof was counted.

No provider/live-money mutation happened.

liveMoneyEnabled remains OFF.

No physical tester phone sideload happened in this v58 proof lane.

No uninstall/reinstall/clear-data happened.

No Play production submission happened.

No Premium bypass happened.

No current First Owner change happened.

No raw IDs, tokens, signed URLs, raw IPs, provider IDs, secrets, or private data were committed.
