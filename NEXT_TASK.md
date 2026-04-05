# NEXT TASK

## Exact Next Task
Keep Stage 4 closed and recorded as completed/proved on the current build. The next lane is to reconcile the repo/docs/proof-harness drift now that PostHog remote on-state delivery is proved, without touching EAS Update.

## Current Plan
1. Preserve the current green Stage 4 truth exactly as recorded
2. Preserve the now-closed PostHog proof truth exactly as recorded
3. Keep the current-build live-stage proof recorded as complete after the channel-topic fix
4. Reconcile the missing or out-of-sync docs and Maestro inventory so the checkpoint files and harness inventory agree

## Exact Next Batch
- preserve the newly proved PostHog runtime baseline: `.env.local` now loads into the current Expo session, the Android bundle carries the injected `EXPO_PUBLIC_POSTHOG_*` values, and the remote-default-off state keeps the chat thread stable with no smart-reply card visible
- preserve the new identified-user flag bridge in `app/_layout.tsx`; the current runtime now identifies the signed-in Supabase user to PostHog before reloading feature flags
- preserve the newly proved PostHog on-state truth from April 5, 2026: direct `/flags/?v=2` now returns both `chilly_chat_expanded_v1` and `ai_chat_suggestions_v1` as `enabled: true` with `condition_match`, and `/chat/[threadId]` now visibly renders `AI SMART REPLIES`, `PostHog gated`, and the three smart-reply chips
- keep the flag-owner bookkeeping exact: active chat-thread consumers are only `chilly_chat_expanded_v1` and `ai_chat_suggestions_v1`, while the waiting-room/live flags remain probe-only in `app/_layout.tsx`
- keep the proved live-stage fix recorded precisely as a channel-topic cleanup before stage subscribe, not as a broader room refactor
- keep the live-stage UI proof recorded as complete: `Live-First`, `Live Watch-Party`, `PROTECTED LIVE SESSION`, `LIVE FIRST FOCUS`, and `TAILORED LIVE WATCH-PARTY` are all now visible on the current build
- treat the Expo Go `Unable to activate keep awake` / intermittent Android ANR dialogs as environment noise unless the same behavior reproduces outside this proof lane or on a non-Expo-Go runtime
- reconcile the proof harness and docs drift: `SESSION_START_PROTOCOL.md` missing, Maestro flow inventory out of sync, and `_subflows/ensure-authenticated.yaml` / referenced flows missing
- keep `CURRENT_STATE.md` and this file aligned on the next real lane: repo/doc drift reconciliation

## Scope
This next pass should:
- preserve the proved Stage 4 baseline exactly
- preserve the closed PostHog proof lane and focus on repo/doc drift reconciliation
- preserve the now-complete live-stage UI proof and stage-channel fix
- repair the docs/proof-harness mismatch if it blocks reliable future proofing
- leave EAS Update untouched

## Out Of Scope
Do not:
- reopen Stage 4 unless new proof truly invalidates it
- broad-refactor the room surfaces, chat surfaces, or profile/channel surfaces
- change locked routes, naming, or communication ownership without new doctrine updates
- spend the lane on EAS Update

## Success Criteria
The next lane is successful when:
- Stage 4 still reads as completed/proved on the current build
- remote PostHog on-state delivery remains recorded as proven for the gated chat flags
- the live-stage route remains recorded as visibly proved, not merely log-proved
- the docs and Maestro inventory no longer disagree about the active proof surface
- `CURRENT_STATE.md` and `NEXT_TASK.md` tell the same checkpoint story
