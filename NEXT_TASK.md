# NEXT TASK

## Exact Next Task
The player ownership-simplification pass is now underway on `main`, and Stage 2 is closed cleanly. The next exact stage in this chained lane is **ownership simplification batch 2** on `app/player/[id].tsx`. The player is already less visually room-management-heavy, and the next safe step is to isolate and quiet the remaining mode-specific playback-adjacent layers without reopening route ownership.

## Current Plan
1. Keep the active owner on `app/player/[id].tsx`.
2. Treat Stage 1 player ownership split audit as closed.
3. Treat Stage 2 host-tools demotion / participant-context cleanup as closed.
4. Use Stage 3 to isolate the next safest mode-specific playback-adjacent chunk.
5. Keep the new participant-context summary behavior intact.
6. Leave unrelated local dirt out of the checkpoint.

## Exact Next Batch
- isolate one more mode-specific playback-adjacent chunk inside `app/player/[id].tsx`
- reduce the remaining “second Party Room / second Live Stage” feel without touching route owners
- keep the completed standalone/shared/live cleanup behavior intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve current product route truth and current doctrine
- stay centered on the canonical player owner first
- keep isolating mode-specific presentation without reopening a broad rewrite
- leave the completed narrow player cleanup work intact
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change current public/product route truth
- change schema or doctrine
- widen into profile/channel, admin, infra, or database work
- change the canonical owner of profile, title, player, watch-party, live-stage, chat, or channel-settings routes
- turn this stage into a broad player rewrite
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the next player-owned layer is isolated or demoted cleanly without doctrine drift
- the player feels less like it owns full room management inline
- the next exact stage stays explicit and task-pure
- no route drift, schema drift, or doctrine drift is introduced
- the staged set stays task-pure
