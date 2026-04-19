# NEXT TASK

## Exact Next Task
The next exact task is a narrow typed Home screen batch on `main`. Do not touch title detail, profile/channel work, runtime room/player/live-stage owners, RBAC, Rachi control-plane work, admin expansion, live schema, or remote DB state in this lane. The canonical bootstrap path and remote migration bookkeeping are already normalized, repo-owned database types are checked in, the shared Supabase clients are typed, and the config, monetization, beta, moderation, user-data, chat, communication, watch-party, title-list screen, and title-details screen batches are complete. The next task is to update `app/(tabs)/index.tsx` only so its direct `titles`, `watch_party_rooms`, and `watch_party_room_messages` reads rely on generated typing instead of the remaining local row shims and loose casts, while keeping runtime behavior unchanged.

## Current Plan
1. Keep scope to `app/(tabs)/index.tsx` only.
2. Re-read the normalized schema and typed-screen checkpoint truth first: `CURRENT_STATE.md`, `NEXT_TASK.md`, and `supabase/database.types.ts`.
3. Replace the remaining local `TitleRow`, `WatchPartyRoomRow`, and `WatchPartyRoomMessageRow` shims with generated `Tables<>` / `Pick<>`-based aliases.
4. Move the Home screen's direct title and watch-party live-metadata reads onto typed client returns and remove the remaining loose casts.
5. Preserve the existing Home title ordering, local fallback behavior, live-room metadata aggregation, and rendering behavior.
6. Keep live schema unchanged in this lane.
7. Do not introduce feature migrations, UI changes, or broader runtime behavior changes in this pass.

## Exact Next Batch
- update `app/(tabs)/index.tsx` only
- replace the remaining local `titles` / watch-party live-metadata row shims with generated `Tables<>` / `Pick<>` aliases
- remove the remaining direct title and live-metadata result casts
- keep live schema unchanged
- do not write or apply feature migrations
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- be a narrow typed-screen implementation pass
- touch only `app/(tabs)/index.tsx`
- preserve the new single-baseline bootstrap path, the archived legacy chain, the checked-in `supabase/database.types.ts`, and the landed config/monetization typing
- preserve the now-landed repo truth for `app_configurations`, `creator_permissions`, `user_profiles`, the typed shared clients, and the typed config/monetization/beta/moderation/user-data/chat/full-communication/watch-party helpers plus title-list and title-details screens
- avoid live schema changes in this lane
- avoid new feature migration writes or applies in this lane
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- touch UI
- touch title detail
- touch runtime room/player/live-stage code
- touch RBAC or Rachi control-plane work
- broaden into admin expansion
- broaden into profile/channel work or other screen owners
- write or apply new feature migrations
- change remote DB state
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `app/(tabs)/index.tsx` replaces its remaining local `titles`, `watch_party_rooms`, and `watch_party_room_messages` row shims with generated `Tables<>` / `Pick<>`-based aliases
- the remaining direct title and live-metadata result casts are removed without widening into other owners
- Home title ordering, local fallback behavior, live-room metadata aggregation, and rendering remain unchanged
- live schema remains unchanged
- `npm run typecheck` passes
- no UI changes, feature migrations, or unrelated runtime refactors are introduced in that implementation lane
