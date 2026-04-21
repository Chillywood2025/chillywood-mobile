# NEXT TASK

## Exact Next Task
The player simplification pass is now underway on `main`, and Stage 3 is closed cleanly. The next exact stage in this chained lane is the optional **final narrow player cleanup** on `app/player/[id].tsx`. The live-mode branch is now materially cleaner, so the only justified follow-up before closeout is removing stale player-local style and concept baggage this pass made obsolete.

## Current Plan
1. Keep the active owner on `app/player/[id].tsx`.
2. Treat Stage 1 standalone access-and-control honesty as closed.
3. Treat Stage 2 shared playback chrome compression as closed.
4. Treat Stage 3 live-mode surface hierarchy as closed.
5. Remove only the stale player-local leftovers that are now clearly dead.
6. Leave unrelated local dirt out of the checkpoint.

## Exact Next Batch
- remove stale player-local style and concept baggage in `app/player/[id].tsx`
- keep the current Stage 1, 2, and 3 behavior exactly intact
- leave route truth and doctrine untouched
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve current product route truth and current doctrine
- focus on the canonical player owner first
- remove only the stale player-local leftovers this pass no longer needs
- leave the completed Stage 1, 2, and 3 player work intact
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change current public/product route truth
- change schema or doctrine
- widen into profile/channel, admin, infra, or database work
- change the canonical owner of profile, title, player, watch-party, live-stage, chat, or channel-settings routes
- turn Stage 2 into a broad player rewrite
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- stale player-only baggage is removed without changing live behavior
- no fresh functionality is introduced
- the player lane is ready for closeout audit
- no route drift, schema drift, or doctrine drift is introduced
- the staged set stays task-pure
