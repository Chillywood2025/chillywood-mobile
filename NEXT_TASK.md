# NEXT TASK

## Exact Next Task
The next exact task is a narrow typed chat write-side batch on `main`. Do not touch UI, runtime room/player/live-stage owners, RBAC, Rachi control-plane work, admin expansion, live schema, or remote DB state in this lane. The canonical bootstrap path and remote migration bookkeeping are already normalized, repo-owned database types are checked in, the shared Supabase clients are typed, and the config, monetization, beta, moderation, user-data, and chat read-side helper batches are complete. The next task is to adopt generated DB typing more fully in `_lib/chat.ts` write paths only, without changing runtime behavior.

## Current Plan
1. Keep scope to `_lib/chat.ts` only.
2. Re-read the normalized schema and typed-schema checkpoint truth first: `CURRENT_STATE.md`, `NEXT_TASK.md`, and `supabase/database.types.ts`.
3. Replace the remaining untyped insert/update payloads in `_lib/chat.ts` for `chat_threads`, `chat_thread_members`, and `chat_messages` with generated insert/update typing where it can be done without behavior changes.
4. Keep the already-landed read-side thread/member/message typing and current chat behavior unchanged.
5. Verify `npm run typecheck` still passes.
6. Keep live schema unchanged in this lane.
7. Do not introduce feature migrations, UI work, or broader runtime behavior changes in this pass.

## Exact Next Batch
- inspect `_lib/chat.ts`
- type the remaining direct insert/update payloads for chat tables
- preserve current chat behavior and the landed read-side typing
- verify `npm run typecheck`
- keep live schema unchanged
- do not write or apply feature migrations yet
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- be helper-only typed-schema adoption
- touch only `_lib/chat.ts`
- preserve the new single-baseline bootstrap path, the archived legacy chain, the checked-in `supabase/database.types.ts`, and the landed config/monetization typing
- preserve the now-landed repo truth for `app_configurations`, `creator_permissions`, `user_profiles`, the typed shared clients, and the typed config/monetization/beta/moderation/user-data/chat-read-side helpers
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
- `_lib/chat.ts` write payloads rely on generated typing more directly than ad hoc object shapes
- runtime behavior and the landed read-side chat result shapes remain unchanged
- `npm run typecheck` passes
- live schema remains unchanged
- no UI changes, feature migrations, or unrelated runtime refactors are introduced in that lane
