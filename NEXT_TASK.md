# NEXT TASK

## Exact Next Task
The next exact task is a narrow typed player compatibility audit on `main`. Do not touch Home, title detail, profile/channel work, runtime room/live-stage owners, RBAC, Rachi control-plane work, admin expansion, live schema, or remote DB state in this lane. The canonical bootstrap path and remote migration bookkeeping are already normalized, repo-owned database types are checked in, the shared Supabase clients are typed, and the config, monetization, beta, moderation, user-data, chat, communication, watch-party, title-list screen, title-details screen, Home screen, and player title-hydration batches are complete. The next task is to inspect `app/player/[id].tsx` only, inventory the remaining local compatibility casts, local-fallback title/media seams, and non-DB typed drift there, and choose the single smallest safe player-screen follow-up batch without changing runtime behavior.

## Current Plan
1. Keep scope to `app/player/[id].tsx` only.
2. Re-read the normalized schema and typed-screen checkpoint truth first: `CURRENT_STATE.md`, `NEXT_TASK.md`, and `supabase/database.types.ts`.
3. Audit `app/player/[id].tsx` for the remaining local compatibility casts, local-fallback title/media seams, and non-DB typed drift after the landed DB-facing title-hydration work.
4. Separate trivial, narrow, and broad/risky follow-up cleanup inside that owner before changing code.
5. Pick the single smallest safe next player-screen typed implementation batch only if it is obviously safe on `main`; otherwise stop at diagnosis.
6. Keep live schema unchanged in this lane.
7. Do not introduce feature migrations, UI changes, or broader runtime behavior changes in this pass.

## Exact Next Batch
- inspect `app/player/[id].tsx`
- inventory the remaining local compatibility casts and local title/media fallback seams
- identify the single smallest safe typed player-screen follow-up batch
- keep live schema unchanged
- do not write or apply feature migrations
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- be diagnosis-first typed-screen audit
- touch only `app/player/[id].tsx`
- preserve the new single-baseline bootstrap path, the archived legacy chain, the checked-in `supabase/database.types.ts`, and the landed config/monetization typing
- preserve the now-landed repo truth for `app_configurations`, `creator_permissions`, `user_profiles`, the typed shared clients, and the typed config/monetization/beta/moderation/user-data/chat/full-communication/watch-party helpers plus title-list, title-details, Home, and player title-hydration work
- avoid live schema changes in this lane
- avoid new feature migration writes or applies in this lane
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- touch UI
- touch Home
- touch title detail
- touch runtime room/live-stage code outside the audited player owner
- touch RBAC or Rachi control-plane work
- broaden into admin expansion
- broaden into profile/channel work or other screen owners
- write or apply new feature migrations
- change remote DB state
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `app/player/[id].tsx` has a clear typed-adoption inventory for its remaining local compatibility casts, local-fallback title/media seams, and non-DB typed drift
- the single smallest safe typed player-screen implementation batch is chosen without widening into other owners
- live schema remains unchanged
- no UI changes, feature migrations, or unrelated runtime refactors are introduced in that diagnosis lane
