# NEXT TASK

## Exact Next Task
The next exact task is a narrow typed watch-party sync-and-message batch on `main`. Do not touch UI, runtime room/player/live-stage owners, RBAC, Rachi control-plane work, admin expansion, live schema, or remote DB state in this lane. The canonical bootstrap path and remote migration bookkeeping are already normalized, repo-owned database types are checked in, the shared Supabase clients are typed, and the config, monetization, beta, moderation, user-data, chat, communication, and watch-party room/membership helper batches are complete. The next task is to adopt generated DB typing more fully in the remaining sync-event and message paths in `_lib/watchParty.ts` only, without changing runtime behavior.

## Current Plan
1. Keep scope to `_lib/watchParty.ts` only.
2. Re-read the normalized schema and typed-schema checkpoint truth first: `CURRENT_STATE.md`, `NEXT_TASK.md`, and `supabase/database.types.ts`.
3. Replace the remaining untyped sync-event and message payload/result shapes in `_lib/watchParty.ts` with generated row/insert typing where it can be done without behavior changes.
4. Keep the already-landed room/membership read-side and write-side typing plus compatibility fallbacks unchanged.
5. Verify `npm run typecheck` still passes.
6. Keep live schema unchanged in this lane.
7. Do not introduce feature migrations, UI work, or broader runtime behavior changes in this pass.

## Exact Next Batch
- inspect `_lib/watchParty.ts`
- type the remaining direct sync-event and message payload/result shapes
- preserve current watch-party behavior and the landed room/membership typing
- verify `npm run typecheck`
- keep live schema unchanged
- do not write or apply feature migrations yet
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- be helper-only typed-schema adoption
- touch only `_lib/watchParty.ts`
- preserve the new single-baseline bootstrap path, the archived legacy chain, the checked-in `supabase/database.types.ts`, and the landed config/monetization typing
- preserve the now-landed repo truth for `app_configurations`, `creator_permissions`, `user_profiles`, the typed shared clients, and the typed config/monetization/beta/moderation/user-data/chat/full-communication/watch-party-room-membership helpers
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
- `_lib/watchParty.ts` sync-event and message paths rely on generated typing more directly than ad hoc object shapes
- runtime behavior and the landed watch-party room/membership typed paths remain unchanged
- `npm run typecheck` passes
- live schema remains unchanged
- no UI changes, feature migrations, or unrelated runtime refactors are introduced in that lane
