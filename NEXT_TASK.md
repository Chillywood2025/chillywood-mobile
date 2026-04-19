# NEXT TASK

## Exact Next Task
The next exact task is a narrow typed watch-party helper audit on `main`. Do not touch UI, runtime room/player/live-stage owners, RBAC, Rachi control-plane work, admin expansion, live schema, or remote DB state in this lane. The canonical bootstrap path and remote migration bookkeeping are already normalized, repo-owned database types are checked in, the shared Supabase clients are typed, and the config, monetization, beta, moderation, user-data, chat, and full communication helper batches are complete. The next task is to inspect `_lib/watchParty.ts` only, inventory the remaining handwritten row shims, loose casts, payload assumptions, and compatibility seams there, and choose the single smallest safe typed watch-party implementation batch without changing runtime behavior.

## Current Plan
1. Keep scope to `_lib/watchParty.ts` only.
2. Re-read the normalized schema and typed-schema checkpoint truth first: `CURRENT_STATE.md`, `NEXT_TASK.md`, and `supabase/database.types.ts`.
3. Audit `_lib/watchParty.ts` for the remaining handwritten row shims, read/result casts, write payload assumptions, realtime payload assumptions, and any compatibility branches tied to current room/live/watch-party schema truth.
4. Separate trivial, narrow, and broad/risky typed-adoption work inside that helper before changing code.
5. Pick the smallest safe next typed watch-party implementation batch only if it is obviously safe on `main`; otherwise stop at diagnosis.
6. Keep live schema unchanged in this lane.
7. Do not introduce feature migrations, UI work, or broader runtime behavior changes in this pass.

## Exact Next Batch
- inspect `_lib/watchParty.ts`
- inventory remaining handwritten row/result shims, payload assumptions, and realtime/compatibility seams
- identify the single smallest safe typed watch-party implementation batch
- keep live schema unchanged
- do not write or apply feature migrations yet
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- be helper-only typed-schema audit
- touch only `_lib/watchParty.ts`
- preserve the new single-baseline bootstrap path, the archived legacy chain, the checked-in `supabase/database.types.ts`, and the landed config/monetization typing
- preserve the now-landed repo truth for `app_configurations`, `creator_permissions`, `user_profiles`, the typed shared clients, and the typed config/monetization/beta/moderation/user-data/chat/full-communication helpers
- avoid live schema changes in this lane
- avoid new feature migration writes or applies until the next typed rollout batch is intentionally chosen
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- touch UI
- touch runtime room/player/live-stage code
- touch RBAC or Rachi control-plane work
- broaden into admin expansion
- write or apply new feature migrations in the planning note
- change remote DB state
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `_lib/watchParty.ts` has a clear typed-adoption inventory with the remaining row shims, loose casts, payload assumptions, realtime assumptions, and compatibility seams categorized by risk
- the single smallest next typed watch-party implementation batch is chosen without widening into screens or other helpers
- live schema remains unchanged
- no UI changes, feature migrations, or unrelated runtime refactors are introduced in that diagnosis lane
