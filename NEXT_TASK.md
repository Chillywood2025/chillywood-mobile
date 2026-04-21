# NEXT TASK

## Exact Next Task
The player ownership-simplification pass is now underway on `main`, and Stage 3 is closed cleanly. The next exact stage in this chained lane is the **player ownership closeout audit** on `main`. The player now reads less like a second Party Room, so the next step is to decide honestly whether anything narrow remains or whether the remaining seam is broader and should be left alone for a later chapter.

## Current Plan
1. Keep the active owner on `app/player/[id].tsx`.
2. Treat Stage 1 player ownership split audit as closed.
3. Treat Stage 2 host-tools demotion / participant-context cleanup as closed.
4. Treat Stage 3 shared playback people-rail demotion as closed.
5. Audit whether any narrow player-ownership seam still remains.
6. Leave unrelated local dirt out of the checkpoint.

## Exact Next Batch
- audit the post-batch player owner honestly
- decide whether the lane is complete enough to close or whether any real narrow follow-up still exists
- keep the completed standalone/shared/live cleanup behavior intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve current product route truth and current doctrine
- stay centered on the canonical player owner first
- evaluate the player after the completed ownership-simplification batches without reopening a broad rewrite
- leave the completed narrow player cleanup work intact
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change current public/product route truth
- change schema or doctrine
- widen into profile/channel, admin, infra, or database work
- change the canonical owner of profile, title, player, watch-party, live-stage, chat, or channel-settings routes
- invent a fake Stage 4 if the remaining seam is already broader
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the player lane is classified honestly as complete enough or still broader-risk
- no fake narrow follow-up is invented if the remaining seam is broader
- the next exact stage stays explicit and task-pure
- no route drift, schema drift, or doctrine drift is introduced
- the staged set stays task-pure
