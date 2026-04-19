# NEXT TASK

## Exact Next Task
The next exact task is a narrow typed home-and-title screen audit on `main`. Do not touch runtime room/player/live-stage owners, RBAC, Rachi control-plane work, admin expansion, live schema, or remote DB state in this lane. The canonical bootstrap path and remote migration bookkeeping are already normalized, repo-owned database types are checked in, the shared Supabase clients are typed, and the config, monetization, beta, moderation, user-data, chat, communication, watch-party, and title-list screen batches are complete. The next task is to inspect `app/(tabs)/index.tsx` and `app/title/[id].tsx` only, inventory the remaining local title/live-metadata row shims, loose casts, and typed-client drift seams there, and choose the single smallest safe next screen-level implementation batch without changing runtime behavior.

## Current Plan
1. Keep scope to `app/(tabs)/index.tsx` and `app/title/[id].tsx` only.
2. Re-read the normalized schema and typed-schema checkpoint truth first: `CURRENT_STATE.md`, `NEXT_TASK.md`, and `supabase/database.types.ts`.
3. Audit `app/(tabs)/index.tsx` and `app/title/[id].tsx` for the remaining local title row shims, watch-party live-metadata row shims, loose result casts, and direct typed-client drift risks.
4. Separate trivial, narrow, and broad/risky typed-adoption work inside those two owners before changing code.
5. Pick the single smallest safe next screen-level typed implementation batch only if it is obviously safe on `main`; otherwise stop at diagnosis.
6. Keep live schema unchanged in this lane.
7. Do not introduce feature migrations, UI work, or broader runtime behavior changes in this pass.

## Exact Next Batch
- inspect `app/(tabs)/index.tsx` and `app/title/[id].tsx`
- inventory remaining local title/live-metadata row shims and loose casts
- identify the single smallest safe next typed home/title implementation batch
- keep live schema unchanged
- do not write or apply feature migrations yet
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- be diagnosis-first typed-schema audit
- touch only `app/(tabs)/index.tsx` and `app/title/[id].tsx`
- preserve the new single-baseline bootstrap path, the archived legacy chain, the checked-in `supabase/database.types.ts`, and the landed config/monetization typing
- preserve the now-landed repo truth for `app_configurations`, `creator_permissions`, `user_profiles`, the typed shared clients, and the typed config/monetization/beta/moderation/user-data/chat/full-communication/watch-party helpers
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
- `app/(tabs)/index.tsx` and `app/title/[id].tsx` have a clear typed-adoption inventory with the remaining title/live-metadata row shims, loose casts, and drift seams categorized by risk
- the single smallest next typed home/title implementation batch is chosen without widening into player, watch-party route owners, or helpers
- live schema remains unchanged
- no UI changes, feature migrations, or unrelated runtime refactors are introduced in that diagnosis lane
