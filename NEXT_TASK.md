# NEXT TASK

## Exact Next Task
The next exact task is a narrow schema-housekeeping lane for remote migration-history normalization / cutover bookkeeping on `main`. Do not touch UI, runtime room/player/live-stage owners, RBAC, Rachi control-plane work, admin expansion, generated DB types, or new schema features in this lane. The canonical future bootstrap path is now the single baseline file in `supabase/migrations/`, while the old chain is archived in `supabase/migrations_legacy/` as legacy-only history. The next task is to normalize the remaining local-vs-remote migration bookkeeping around that cutover without changing live schema shape. Do not write or apply feature migrations in this lane.

## Current Plan
1. Keep scope to remote migration-history normalization / cutover bookkeeping only.
2. Re-read the current schema checkpoint truth first: `CURRENT_STATE.md`, `NEXT_TASK.md`, the single active baseline file, and the archived legacy chain layout.
3. Re-list remote migration history against the new local cutover layout exactly.
4. Decide the safest bookkeeping path for the archived legacy versions, the single active baseline version, and the previously remote-only historical versions.
5. Keep live remote schema unchanged while resolving the history/bookkeeping mismatch.
6. Do not introduce new schema features or generated DB types before this lane is resolved.
7. Stop with an exact remote-history normalization plan before any broader schema work resumes.

## Exact Next Batch
- inspect the single active baseline path and the archived legacy chain side by side with remote migration history
- prove the remaining bookkeeping mismatch after the baseline cutover
- identify how remote-only historical versions should be handled now that the old chain is legacy-only
- identify how the archived local legacy versions and baseline version should be reflected in remote history
- keep live schema unchanged while planning the bookkeeping normalization
- do not write or apply feature migrations yet
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- be schema-housekeeping and migration-history normalization planning only
- touch only baseline-cutover bookkeeping and remote history normalization analysis
- preserve the new single-baseline bootstrap path and the archived legacy chain
- preserve the now-landed repo truth for `app_configurations`, `creator_permissions`, and `user_profiles`
- avoid generated DB types work in this lane
- avoid new feature migration writes or applies until the bookkeeping mismatch is intentionally resolved
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- touch UI
- touch runtime room/player/live-stage code
- touch RBAC or Rachi control-plane work
- broaden into admin expansion
- start generated DB types
- write or apply new feature migrations in the planning note
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the single active baseline path and archived legacy chain are both treated as repo truth
- the remaining remote migration-history mismatch is listed exactly
- the bookkeeping normalization plan is explicit without guesswork
- no live schema changes, UI changes, feature migrations, or generated DB types are introduced in that lane
