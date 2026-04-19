# NEXT TASK

## Exact Next Task
The next exact task is a narrow typed chat-helper audit on `main`. Do not touch UI, runtime room/player/live-stage owners, RBAC, Rachi control-plane work, admin expansion, live schema, or remote DB state in this lane. The canonical bootstrap path and remote migration bookkeeping are already normalized, repo-owned database types are checked in, the shared Supabase clients are typed, and the config, monetization, beta, moderation, and user-data helper batches are complete. The next task is to inspect `_lib/chat.ts` only, inventory the remaining handwritten row shims, nested relation casts, and loose payload assumptions there, and choose the single smallest safe typed-chat implementation batch without changing runtime behavior.

## Current Plan
1. Keep scope to `_lib/chat.ts` only.
2. Re-read the normalized schema and typed-schema checkpoint truth first: `CURRENT_STATE.md`, `NEXT_TASK.md`, and `supabase/database.types.ts`.
3. Audit the remaining helper-local row shims, nested relation casts, and payload assumptions for `chat_threads`, `chat_thread_members`, `chat_messages`, and any directly-joined profile data in `_lib/chat.ts`.
4. Separate trivial, narrow, and broad/risky adoption work inside that helper before changing code.
5. Pick the smallest next typed-chat implementation batch only if it is obviously safe on `main`; otherwise stop at diagnosis.
6. Keep live schema unchanged in this lane.
7. Do not introduce feature migrations, UI work, or broader runtime behavior changes in this pass.

## Exact Next Batch
- inspect `_lib/chat.ts`
- inventory remaining handwritten row/result shims and nested relation casts
- identify the smallest safe typed-chat implementation batch
- keep live schema unchanged
- do not write or apply feature migrations yet
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- be helper-only typed-schema audit
- touch only `_lib/chat.ts`
- preserve the new single-baseline bootstrap path, the archived legacy chain, the checked-in `supabase/database.types.ts`, and the landed config/monetization typing
- preserve the now-landed repo truth for `app_configurations`, `creator_permissions`, `user_profiles`, the typed shared clients, and the typed config/monetization/beta/moderation/user-data helpers
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
- `_lib/chat.ts` has a clear typed-adoption inventory with the remaining row shims, nested relation casts, and payload assumptions categorized by risk
- the single smallest next typed-chat implementation batch is chosen without widening into room/player/live-stage or other owners
- live schema remains unchanged
- no UI changes, feature migrations, or unrelated runtime refactors are introduced in that lane
