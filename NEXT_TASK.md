# NEXT TASK

## Exact Next Task
The next exact task is a narrow typed title-list screen batch on `main`. Do not touch runtime room/player/live-stage owners, RBAC, Rachi control-plane work, admin expansion, live schema, or remote DB state in this lane. The canonical bootstrap path and remote migration bookkeeping are already normalized, repo-owned database types are checked in, the shared Supabase clients are typed, and the config, monetization, beta, moderation, user-data, chat, communication, and full watch-party helper batches are complete. The next task is to adopt generated DB typing in the remaining smallest direct title-list screen owners, `app/(tabs)/explore.tsx` and `app/(tabs)/my-list.tsx`, without changing runtime behavior.

## Current Plan
1. Keep scope to `app/(tabs)/explore.tsx` and `app/(tabs)/my-list.tsx` only.
2. Re-read the normalized schema and typed-schema checkpoint truth first: `CURRENT_STATE.md`, `NEXT_TASK.md`, and `supabase/database.types.ts`.
3. Replace the remaining handwritten `TitleRow` shims and loose `as TitleRow[]` screen-level casts in `app/(tabs)/explore.tsx` and `app/(tabs)/my-list.tsx` with generated title row typing where it can be done without behavior changes.
4. Keep the landed helper typing and existing local fallback/title ordering behavior unchanged.
5. Verify `npm run typecheck` still passes.
6. Keep live schema unchanged in this lane.
7. Do not introduce feature migrations, UI work, or broader runtime behavior changes in this pass.

## Exact Next Batch
- inspect `app/(tabs)/explore.tsx` and `app/(tabs)/my-list.tsx`
- type the remaining direct title read/result shapes on those two screens
- preserve current title-list screen behavior and local fallback ordering
- verify `npm run typecheck`
- keep live schema unchanged
- do not write or apply feature migrations yet
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- be narrow typed-schema adoption
- touch only `app/(tabs)/explore.tsx` and `app/(tabs)/my-list.tsx`
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
- `app/(tabs)/explore.tsx` and `app/(tabs)/my-list.tsx` rely on generated title row typing more directly than local `TitleRow` shims and loose casts
- runtime behavior and the existing title-list screen ordering/fallback behavior remain unchanged
- `npm run typecheck` passes
- live schema remains unchanged
- no UI changes, feature migrations, or unrelated runtime refactors are introduced in that lane
