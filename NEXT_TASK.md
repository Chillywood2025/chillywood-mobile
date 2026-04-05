# NEXT TASK

## Exact Next Task
Keep Stage 4 closed and recorded as completed/proved on the current build. The next exact lane is to verify the already-published preview-channel EAS Update on the installed Android preview build `3daa1615-d003-46d5-af7a-af8500497155` while preserving the newly proved Settings / Logout owner-surface truth.

## Current Plan
1. Preserve the current green Stage 4 truth exactly as recorded
2. Preserve the now-closed PostHog proof truth exactly as recorded
3. Preserve the newly re-closed auth/home regression fix exactly as recorded
4. Preserve the newly proved Home/Profile Settings / Logout truth exactly as recorded
5. Keep the current-build live-stage proof recorded as complete after the channel-topic fix
6. Use the now-published preview OTA checkpoint to verify delivery on the installed preview build before any production rollout

## Exact Next Batch
- preserve the newly proved PostHog runtime baseline: `.env.local` now loads into the current Expo session, the Android bundle carries the injected `EXPO_PUBLIC_POSTHOG_*` values, and the remote-default-off state keeps the chat thread stable with no smart-reply card visible
- preserve the newly re-proved April 5, 2026 auth/home truth: `adb shell pm clear host.exp.exponent` lands on `/login`, the valid test login returns to `/` without the prior unhandled tabs-group replace, and both visible Home `Chicago Streets` rails land on `/title/f0d03df8-ced8-433f-a5c0-e2b930813eb0` with `Play` visible instead of `Not found`
- preserve the newly proved April 5, 2026 Settings / Logout truth: Home now shows a visible `Settings` entry beside the self-profile avatar, own profile keeps its owner/control role while adding a self-only `Settings` chip, `/settings` owns `Log Out`, signing out returns to `/login`, a clean reopen while logged out still lands on `/login`, and other-user profile behavior remains the separate `Profile` + `Channel Home` + `Chi'lly Chat` surface with no Settings owner control
- preserve the new identified-user flag bridge in `app/_layout.tsx`; the current runtime now identifies the signed-in Supabase user to PostHog before reloading feature flags
- preserve the newly proved PostHog on-state truth from April 5, 2026: direct `/flags/?v=2` now returns both `chilly_chat_expanded_v1` and `ai_chat_suggestions_v1` as `enabled: true` with `condition_match`, and `/chat/[threadId]` now visibly renders `AI SMART REPLIES`, `PostHog gated`, and the three smart-reply chips
- keep the flag-owner bookkeeping exact: active chat-thread consumers are only `chilly_chat_expanded_v1` and `ai_chat_suggestions_v1`, while the waiting-room/live flags remain probe-only in `app/_layout.tsx`
- keep the proved live-stage fix recorded precisely as a channel-topic cleanup before stage subscribe, not as a broader room refactor
- keep the live-stage UI proof recorded as complete: `Live-First`, `Live Watch-Party`, `PROTECTED LIVE SESSION`, `LIVE FIRST FOCUS`, and `TAILORED LIVE WATCH-PARTY` are all now visible on the current build
- treat the Expo Go `Unable to activate keep awake` / intermittent Android ANR dialogs as environment noise unless the same behavior reproduces outside this proof lane or on a non-Expo-Go runtime
- use the reconciled proof harness baseline exactly as recorded: `SESSION_START_PROTOCOL.md` exists, the Maestro smoke lane is explicit, and the authenticated owner-rails flow no longer depends on missing subflows or dead ids
- preserve the new EAS Update truth exactly as recorded: `runtimeVersion` now uses `appVersion`, `updates.url` is repo-owned, `npm run validate:runtime` passes locally from `.env.local`, `expo-updates@~29.0.16` is repo-owned, Android preview build `3daa1615-d003-46d5-af7a-af8500497155` already exists on channel `preview`, and preview OTA group `7519a9ee-c320-4d24-939d-4deeec57048b` is now published from commit `c8cc828`
- verify the installed preview build against the published preview OTA with this exact manual checklist:
- logged-out first open lands on login
- valid login returns to Home
- `Top Rated` opens the real `/title/[id]` surface
- `Browse` opens the real `/title/[id]` surface
- Home shows a visible `Settings` entry
- own profile shows a visible `Settings` entry
- `Settings` opens
- `Log Out` clears session and returns to login
- other-user profile does not show a `Settings` control
- only after preview verification, prepare the first controlled production rollout; if no production build exists yet for runtime `1.0.0`, create it first with `npx eas-cli@latest build --platform android --profile production --non-interactive`

## Scope
This next pass should:
- preserve the proved Stage 4 baseline exactly
- preserve the closed PostHog proof lane
- preserve the newly re-closed auth/home regression fix without reopening app logic
- preserve the newly proved Settings / Logout owner-surface behavior without collapsing own-profile and other-user profile doctrine
- preserve the now-complete live-stage UI proof and stage-channel fix
- verify delivery of the already-published preview-channel EAS Update on the installed preview build without reopening app implementation work

## Out Of Scope
Do not:
- reopen Stage 4 unless new proof truly invalidates it
- broad-refactor the room surfaces, chat surfaces, or profile/channel surfaces
- change locked routes, naming, or communication ownership without new doctrine updates
- publish directly to `production` before preview verification

## Success Criteria
The next lane is successful when:
- Stage 4 still reads as completed/proved on the current build
- remote PostHog on-state delivery remains recorded as proven for the gated chat flags
- Home/Profile Settings / Logout truth remains recorded as proved without collapsing profile-role separation
- the live-stage route remains recorded as visibly proved, not merely log-proved
- preview OTA group `7519a9ee-c320-4d24-939d-4deeec57048b` is verified on preview build `3daa1615-d003-46d5-af7a-af8500497155`
- `CURRENT_STATE.md` and `NEXT_TASK.md` tell the same checkpoint story
