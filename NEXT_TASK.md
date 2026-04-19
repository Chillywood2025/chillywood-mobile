# NEXT TASK

## Exact Next Task
The next exact task is a narrow typed-schema adoption audit on `main`. Do not touch UI, runtime room/player/live-stage owners, RBAC, Rachi control-plane work, admin expansion, live schema, or remote DB state in this lane. The canonical bootstrap path and remote migration bookkeeping are already normalized, repo-owned database types are now checked in, and the shared Supabase clients are now typed. The next task is to inventory the remaining direct Supabase call sites that still rely on loose casts, manual row types, or untyped payload assumptions, then produce the single smallest exact implementation batch for broader typed-schema rollout.

## Current Plan
1. Keep scope to typed-schema adoption audit only.
2. Re-read the normalized schema and typed-schema checkpoint truth first: `CURRENT_STATE.md`, `NEXT_TASK.md`, and `supabase/database.types.ts`.
3. Inventory remaining direct Supabase owners on `main` that still use loose casts, manual row shims, or payload shapes that the typed clients do not yet model directly.
4. Separate current typed-safe owners from remaining compatibility targets.
5. Produce one exact next implementation batch only after that inventory is proved.
6. Keep live schema unchanged in this lane.
7. Do not introduce feature migrations, UI work, or broader runtime behavior changes in this pass.

## Exact Next Batch
- inspect remaining direct Supabase call sites on current `main`
- identify which owners are already type-safe under the new shared typed clients
- identify exact loose-cast or payload-shape mismatches that still block broader typed adoption
- produce the smallest exact next implementation batch from that inventory
- keep live schema unchanged
- do not write or apply feature migrations yet
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- be typed-schema adoption audit only
- touch no runtime behavior unless a control-file follow-up explicitly approves a typed compatibility implementation batch
- preserve the new single-baseline bootstrap path, the archived legacy chain, and the checked-in `supabase/database.types.ts`
- preserve the now-landed repo truth for `app_configurations`, `creator_permissions`, `user_profiles`, and the typed shared clients
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
- the remaining direct Supabase owners are truthfully inventoried against the checked-in `Database` / `Json` types
- the repo clearly distinguishes already-safe typed owners from remaining compatibility targets
- the single smallest next implementation batch is named exactly
- live schema remains unchanged
- no UI changes, feature migrations, or unrelated runtime refactors are introduced in that lane
