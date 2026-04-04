# NEXT TASK

## Exact Next Task
Stage 4 is now completed/proved on the current build and must stay recorded that way: local/current-build Flow 08 is proved, the corrected Party / Live split is proved, local Flow 09 is proved, and the final cloud rerun `019d4809-ba44-75d1-a3bb-39bb8c16663c` finished green on commit `14b45f5bd0e00ce73a8e5c9a6b3bbbb347c14e91` with all cloud Maestro flows passing. Preserve that final truth accurately, do not reopen Stage 4 unless new proof truly invalidates it, move to the next roadmap checkpoint, and prove PostHog root flag delivery before any room-flow gating.

## Current Plan
1. Preserve Stage 4 as completed/proved on the current build
2. Begin Phase 5 multi-user validation planning from the now-green room/chat/profile baseline while proving PostHog root flag delivery
3. Report exact files changed, final proof status, and any newly discovered blocker if one appears
4. No final human verification pass
5. Do not reopen Stage 4 unless new current-build proof truly invalidates it

## Exact Next Batch
- keep Flow 08 recorded as completed/proved on the current build only because current terminal output proved it on the current build
- keep the now-proved Flow 08 path intact through Home -> self profile -> channel settings -> profile rails -> Chi'lly Chat inbox
- keep cloud Flow 08 recorded accurately as now proved green on the latest cloud rerun after the earlier smaller-viewport issue was corrected
- keep the corrected Party / Live split recorded accurately as completed/proved on the current build:
  - Party flow stops at Party Room and the shared watch-party player
  - Live Stage is entered only from the separate Home -> Live Watch-Party flow
  - the obsolete Party Room -> Live Stage branch is removed from active doctrine, code, and automation
- keep Flow 09 recorded accurately as completed/proved on the current build:
  - `explore-screen`
  - `title-like-button`
  - `title-copy-link-button`
  - `profile-likes-entry-t1`
  - `profile-shares-entry-t1`
- keep the earlier local Flow 09 proof-path blockers recorded accurately as fixed flow issues, not product regressions:
  - `profile-shares-section` scroll strictness
  - `tab-explore-button` transition determinism
- keep the newest Flow 09 proof-path blocker recorded accurately as fixed flow logic, not a product regression:
  - cloud-sized viewport stopped at `profile-shares-section` while `profile-shares-entry-t1` remained below the fold
- keep the latest cloud rerun recorded accurately as:
  - build passed
  - `auth-gate`, `home-to-title-to-player`, `home-to-live-watch-party`, `player-to-watch-party-live`, `06-player-to-party-room`, `07-home-live-watch-party-to-live-stage`, `08-home-profile-chat-and-channel-settings`, and `09-title-actions-to-self-profile-rails` all passed
- keep the bounded local 320x640-style replay recorded accurately as having passed after the new direct `profile-shares-entry-t1` scroll step
- keep Stage 4 recorded accurately as having no remaining automated blocker now
- prove remote PostHog flag delivery at the root for:
  - `live_waiting_room_enabled`
  - `party_waiting_room_enabled`
  - `watch_party_live_handoff_v2`
- keep PostHog wiring non-invasive:
  - `app/_layout.tsx` root provider only
  - `EXPO_PUBLIC_POSTHOG_API_KEY` / `EXPO_PUBLIC_POSTHOG_HOST` env wiring only
  - no Party/Live route gating yet
- treat the Expo `expo-localization` config-plugin warning as follow-up only if a current native build proves it necessary
- report exact files changed, exact fixes, and any remaining blocker

## Scope
This next pass should:
- preserve the now-green Stage 4 baseline exactly as proved on the current build
- plan the first Phase 5 validation slice around:
  - cross-account/device room-native communication proof
  - cross-account/device Chi'lly Chat messaging and thread-call proof
  - reconnect, background/foreground, and access-gate validation
- keep proof bookkeeping strict:
  - nothing counts as passed unless current terminal/workflow output proves it on the current build
  - keep locked product truth separate from checkpoint truth
  - keep completed Stage 4 proof separate from new Phase 5 work
- preserve the preview EAS environment values and the corrected Android bundled/cloud lanes so future validation remains runnable
- preserve canonical room routes, Chi'lly Chat routes, profile/channel truth, and the corrected Party / Live split while Phase 5 planning begins
- validate PostHog root flag delivery without changing room routes, waiting-room behavior, or live room ownership

## Out Of Scope
Do not:
- reopen Stage 4 unless new proof truly invalidates it
- reintroduce Party Room -> Live Stage behavior
- broad-refactor Party Room, Live Room, Chi'lly Chat, or profile/channel surfaces
- change locked routes, naming, or communication ownership without new doctrine updates

## Proof Requirements
Before claiming the next pass complete:
1. preserve the final green Stage 4 proof in repo truth
2. define the first concrete Phase 5 multi-user proof target
3. keep canonical room routes, Chi'lly Chat behavior, and profile/channel truth unchanged unless new proof requires targeted fixes
4. prove remote PostHog root flag delivery before enabling any room-flow gate

## Success Criteria
The next pass is successful when:
- Stage 4 remains recorded as completed/proved on the current build
- the repo points cleanly at Phase 5 as the next checkpoint
- no stale Stage 4 blocker language remains active in the control files
- Party flow stays on `/watch-party/[partyId]` and does not hand off to Live Stage
- Live Stage is reached only from the separate Live flow on `/watch-party/live-stage/[partyId]`
- canonical room routes remain unchanged:
  - `/watch-party/[partyId]`
  - `/watch-party/live-stage/[partyId]`
- `/communication` remains compatibility-only
- the repo stays structure-stable with no broad refactor
- Live Stage no longer surfaces the presence-init toast during canonical room handoff or rerun scenarios
- Player no longer surfaces the detach-surface runtime error while handing into the room-validation path
- PostHog root wiring stays env-driven and non-invasive until current-build proof exists for remote flag delivery
