# NEXT TASK

## Exact Next Task
The next exact task is a narrow schema-only reconciliation lane for `public.user_profiles`. Do not touch UI, runtime room/player/live-stage owners, RBAC, Rachi control-plane work, admin expansion, or generated DB types in this lane. The goal is to reconcile repo truth for `public.user_profiles` against the already-proved remote shape by capturing the live table definition in a forward-only repo migration: include `likes_visibility`, `shares_visibility`, and `updated_at`; preserve the primary key on `user_id`; preserve the `updated_at` index; preserve authenticated select behavior; and preserve self-owned insert/update behavior. This next task is file-and-schema only. No apply should happen in the planning note; the next pass should stop after the migration file is written and checked.

## Current Plan
1. Keep scope to `public.user_profiles` schema reconciliation only.
2. Re-read the current schema owners first: `_lib/userData.ts`, `_lib/chat.ts`, `app/profile/[userId].tsx`, `app/channel-settings.tsx`, and any current migrations or helpers that depend on `user_profiles`.
3. Reconfirm the already-proved remote shape before writing the migration file.
4. Write one forward-only reconciliation migration for `public.user_profiles`.
5. Preserve current runtime contract: authenticated select, self insert/update, `user_id` primary key, and `updated_at` index.
6. Include `likes_visibility`, `shares_visibility`, and `updated_at` in repo schema truth.
7. Stop after file creation and preflight audit; do not apply in the planning note.

## Exact Next Batch
- inspect the current `user_profiles` runtime owners and remote schema truth again
- write one narrow `public.user_profiles` reconciliation migration
- include `likes_visibility`
- include `shares_visibility`
- include `updated_at`
- preserve PK on `user_id`
- preserve the `updated_at` index
- preserve authenticated select plus self-owned insert/update behavior
- do not apply yet
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- be schema-only
- touch only the `public.user_profiles` reconciliation lane
- preserve current runtime shape expected by `_lib/userData.ts` and `_lib/chat.ts`
- preserve current auth/select/update semantics already proved remotely
- avoid generated DB types work in this lane
- avoid apply until the file is written and checked
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- touch UI
- touch runtime room/player/live-stage code
- touch RBAC or Rachi control-plane work
- broaden into admin expansion
- start generated DB types
- apply the `user_profiles` migration in the planning note
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- one forward-only repo migration exists for `public.user_profiles`
- the file includes `likes_visibility`, `shares_visibility`, and `updated_at`
- the file preserves PK on `user_id`
- the file preserves the `updated_at` index
- the file preserves authenticated select plus self insert/update behavior
- the file is reviewed before any apply step
