# NEXT TASK

## Exact Next Task
The next exact stage is now `content engagement foundation` inside the active social graph + engagement chapter before any broad whole-app behavior or polish work continues. Repo truth is now explicit: native friend graph schema/helper truth is now real, title likes and shares still need the helper layer on top of already-backed schema, comments remain room/live-only, and Rachi remains official starter/contact presence outside the default friend graph.

## Current Plan
1. Treat the social graph + engagement truth audit and native friend graph foundation as closed.
2. Keep the locked doctrine: friendship is mutual, person-to-person, and private-first.
3. Land likes/share helper foundation only where schema is already real.
4. Keep comments limited to current room/live truth in this chapter.
5. Preserve current owner-above-Rachi authority, canonical profile/chat/admin routes, and follower/subscriber distinctions.
6. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- add the title-content helper foundation for `like` and `share` on top of `user_content_relationships`
- keep share truth distinct from room invite share-sheet behavior
- keep comments limited to current room/live message truth
- avoid public counts or public social dashboards unless one tiny read surface is separately justified later
- keep creator/public, admin/owner, and route/doctrine boundaries intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `/profile/[userId]`, `/channel-settings`, `/admin`, `/chat`, and `/chat/[threadId]` as the canonical owners
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- establish title-level like/share helpers only where schema is already backed
- stop short of public profile adoption, broad UI rollout, or fake shipped social behavior
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- start the broad whole-app behavior/polish pass yet
- change route truth
- invent a broad social rewrite lane
- invent fake friend counts, fake mutuals, fake Rachi-social behavior, fake comment systems, or fake creator/platform powers
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the native friend graph stays stable and distinct after its new schema/helper foundation
- title likes and shares have real helper foundations where schema already exists
- comments remain explicitly limited to current room/live truth unless separately backed later
- Rachi's official starter presence stays clearly separated from friend-graph truth and owner/admin truth
- public profile/chat/live routes still make no fake friend claims
- no route drift or fake social claims are introduced
- the staged set stays task-pure
