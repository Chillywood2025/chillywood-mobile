# NEXT TASK

## Exact Next Task
The next exact task is a narrow schema-housekeeping diagnosis lane for Supabase bootstrap/history drift on `main`. Do not touch UI, runtime room/player/live-stage owners, RBAC, Rachi control-plane work, admin expansion, or generated DB types in this lane. The goal is to audit and explain the remaining migration-history mismatch now that `public.app_configurations`, `public.creator_permissions`, and `public.user_profiles` are all reconciled in repo truth and applied remotely: prove which historical versions exist only remotely, which versions exist only locally, and whether the safest follow-up is migration-history repair, baseline consolidation, or a later bootstrap cleanup plan. This next task is repo-truth and remote-history diagnosis only. Do not write new schema changes or apply anything in the planning note.

## Current Plan
1. Keep scope to migration-history / bootstrap drift diagnosis only.
2. Re-read the current schema checkpoint truth first: `CURRENT_STATE.md`, `NEXT_TASK.md`, and the three reconciliation migrations for `app_configurations`, `creator_permissions`, and `user_profiles`.
3. Re-list local migration files and remote migration history exactly.
4. Identify the remote-only historical versions and the local-only historical versions that still drift.
5. Explain whether the safest next move is remote history repair, new baseline/squash work, or a documented defer-until-later cleanup.
6. Do not write new migrations or generated DB types in that diagnosis pass.
7. Stop with an exact recommendation before any history rewrite or bootstrap cleanup.

## Exact Next Batch
- inspect local migration history and remote migration history side by side
- prove the remaining drift after the three reconciliation migrations
- identify remote-only historical versions
- identify local-only historical versions
- explain the safest cleanup direction
- do not write or apply new migrations yet
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- be schema-housekeeping diagnosis only
- touch only migration-history / bootstrap-truth analysis
- preserve the now-landed repo truth for `app_configurations`, `creator_permissions`, and `user_profiles`
- avoid generated DB types work in this lane
- avoid new migration writes or applies until the drift is clearly explained
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- touch UI
- touch runtime room/player/live-stage code
- touch RBAC or Rachi control-plane work
- broaden into admin expansion
- start generated DB types
- write or apply new migrations in the planning note
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- local and remote migration history drift is listed exactly
- the remaining bootstrap/history problem is explained without guesswork
- the recommendation for the next cleanup step is explicit
- no new migrations, UI changes, or generated DB types are introduced in that diagnosis pass
