# NEXT TASK

## Exact Next Task
Keep Stage 4 closed and recorded as completed/proved on the current build. The next lane is to prove remote PostHog delivery for the gated chat flags with real credentials or admin access, then reconcile the doc/proof-harness drift without touching EAS Update.

## Current Plan
1. Preserve the current green Stage 4 truth exactly as recorded
2. Prove remote PostHog delivery for `chilly_chat_expanded_v1` and `ai_chat_suggestions_v1`, and confirm whether the waiting-room/live probe flags need any proof-harness alignment
3. Keep the current-build live-stage proof recorded as complete after the channel-topic fix
4. Reconcile the missing or out-of-sync docs and Maestro inventory so the checkpoint files and harness inventory agree

## Exact Next Batch
- prove remote PostHog delivery for `chilly_chat_expanded_v1` and `ai_chat_suggestions_v1`; the local default-off short-circuit is already proved, so the missing piece is remote on-state with real credentials or admin access
- keep the flag-owner bookkeeping exact: active chat-thread consumers are only `chilly_chat_expanded_v1` and `ai_chat_suggestions_v1`, while the waiting-room/live flags remain probe-only in `app/_layout.tsx`
- keep the proved live-stage fix recorded precisely as a channel-topic cleanup before stage subscribe, not as a broader room refactor
- keep the live-stage UI proof recorded as complete: `Live-First`, `Live Watch-Party`, `PROTECTED LIVE SESSION`, `LIVE FIRST FOCUS`, and `TAILORED LIVE WATCH-PARTY` are all now visible on the current build
- reconcile the proof harness and docs drift: `SESSION_START_PROTOCOL.md` missing, Maestro flow inventory out of sync, and `_subflows/ensure-authenticated.yaml` / referenced flows missing
- keep `CURRENT_STATE.md` and this file aligned on the single active blocker: remote PostHog on-state delivery

## Scope
This next pass should:
- preserve the proved Stage 4 baseline exactly
- focus on remote PostHog delivery proof for the gated chat layer
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
- remote PostHog delivery is proven for the gated chat flags, or the missing credentials/access are explicitly recorded as the blocker
- the live-stage route remains recorded as visibly proved, not merely log-proved
- the docs and Maestro inventory no longer disagree about the active proof surface
- `CURRENT_STATE.md` and `NEXT_TASK.md` tell the same checkpoint story
