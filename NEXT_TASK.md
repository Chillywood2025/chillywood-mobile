# NEXT TASK

## Exact Next Task
Keep Stage 4 closed and recorded as completed/proved on the current build. The next exact lane is to create and install a fresh preview build that includes `expo-updates`, then publish and verify the first preview-channel EAS Update from the now-ready checkpoint baseline.

## Current Plan
1. Preserve the current green Stage 4 truth exactly as recorded
2. Preserve the now-closed PostHog proof truth exactly as recorded
3. Keep the current-build live-stage proof recorded as complete after the channel-topic fix
4. Use the now-ready EAS Update config/docs baseline to rebuild preview with `expo-updates`, then publish and verify a preview OTA before any production rollout

## Exact Next Batch
- preserve the newly proved PostHog runtime baseline: `.env.local` now loads into the current Expo session, the Android bundle carries the injected `EXPO_PUBLIC_POSTHOG_*` values, and the remote-default-off state keeps the chat thread stable with no smart-reply card visible
- preserve the new identified-user flag bridge in `app/_layout.tsx`; the current runtime now identifies the signed-in Supabase user to PostHog before reloading feature flags
- preserve the newly proved PostHog on-state truth from April 5, 2026: direct `/flags/?v=2` now returns both `chilly_chat_expanded_v1` and `ai_chat_suggestions_v1` as `enabled: true` with `condition_match`, and `/chat/[threadId]` now visibly renders `AI SMART REPLIES`, `PostHog gated`, and the three smart-reply chips
- keep the flag-owner bookkeeping exact: active chat-thread consumers are only `chilly_chat_expanded_v1` and `ai_chat_suggestions_v1`, while the waiting-room/live flags remain probe-only in `app/_layout.tsx`
- keep the proved live-stage fix recorded precisely as a channel-topic cleanup before stage subscribe, not as a broader room refactor
- keep the live-stage UI proof recorded as complete: `Live-First`, `Live Watch-Party`, `PROTECTED LIVE SESSION`, `LIVE FIRST FOCUS`, and `TAILORED LIVE WATCH-PARTY` are all now visible on the current build
- treat the Expo Go `Unable to activate keep awake` / intermittent Android ANR dialogs as environment noise unless the same behavior reproduces outside this proof lane or on a non-Expo-Go runtime
- use the reconciled proof harness baseline exactly as recorded: `SESSION_START_PROTOCOL.md` exists, the Maestro smoke lane is explicit, and the authenticated owner-rails flow no longer depends on missing subflows or dead ids
- preserve the new EAS Update readiness truth exactly as recorded: `runtimeVersion` now uses `appVersion`, `updates.url` is repo-owned, `npm run validate:runtime` now passes locally from `.env.local`, and `expo-updates@~29.0.16` is now repo-owned in `package.json` / `package-lock.json`
- create a fresh preview build first so the binary actually contains `expo-updates`; then publish the first preview OTA with `npx eas-cli@latest update --channel preview --message "Chi'llywood preview OTA"` and verify it with `npx eas-cli@latest update:list` / `npx eas-cli@latest update:view` plus a cold restart on that fresh preview build
- only after preview verification, prepare the first controlled production rollout; if no production build exists yet for runtime `1.0.0`, create it first with `npx eas-cli@latest build --platform android --profile production --non-interactive`

## Scope
This next pass should:
- preserve the proved Stage 4 baseline exactly
- preserve the closed PostHog proof lane
- preserve the now-complete live-stage UI proof and stage-channel fix
- create a fresh preview build with `expo-updates`, then execute the first preview-channel EAS Update publish and delivery verification without reopening proof

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
- the live-stage route remains recorded as visibly proved, not merely log-proved
- the first preview OTA is published from the proved checkpoint and verified on a fresh preview build/runtime that includes `expo-updates`
- `CURRENT_STATE.md` and `NEXT_TASK.md` tell the same checkpoint story
