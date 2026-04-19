# NEXT TASK

## Exact Next Task
The next exact task is a narrow typed-schema foundation lane on `main`. Do not touch UI, runtime room/player/live-stage owners, RBAC, Rachi control-plane work, admin expansion, or new schema features in this lane. The canonical future bootstrap path is now the single baseline file in `supabase/migrations/`, the old chain is archived in `supabase/migrations_legacy/`, and remote migration-history bookkeeping now matches that cutover. The next task is to generate and check in repo-owned database types from the normalized current schema truth, then wire the shared Supabase client owners to those types without changing live schema shape.

## Current Plan
1. Keep scope to typed-schema generation and client typing only.
2. Re-read the normalized schema checkpoint truth first: `CURRENT_STATE.md`, `NEXT_TASK.md`, and the single active baseline file.
3. Generate repo-owned database types from the accepted current schema truth.
4. Update the shared Supabase client owners to use those generated types.
5. Keep live remote schema unchanged in this lane.
6. Do not introduce new feature migrations, UI work, or broader runtime refactors in this pass.
7. Stop after typed schema truth is checked in and verified.

## Exact Next Batch
- inspect the shared Supabase client owners and current untyped schema assumptions
- generate repo-owned database types from the normalized schema truth
- wire the shared Supabase clients to those types
- verify typecheck still passes for the typed schema owners
- keep live schema unchanged
- do not write or apply feature migrations yet
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- be typed-schema foundation only
- touch only generated database types and the shared Supabase client owners that consume them
- preserve the new single-baseline bootstrap path and the archived legacy chain
- preserve the now-landed repo truth for `app_configurations`, `creator_permissions`, and `user_profiles`
- avoid live schema changes in this lane
- avoid new feature migration writes or applies until typed schema truth is landed
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- touch UI
- touch runtime room/player/live-stage code
- touch RBAC or Rachi control-plane work
- broaden into admin expansion
- write or apply new feature migrations in the planning note
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- repo-owned database types are checked in from the normalized current schema truth
- shared Supabase client owners use those types
- live schema remains unchanged
- no UI changes, feature migrations, or unrelated runtime refactors are introduced in that lane
