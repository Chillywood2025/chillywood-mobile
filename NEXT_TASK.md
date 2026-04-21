# NEXT TASK

## Exact Next Task
The player simplification pass is now underway on `main`, and Stage 2 is closed cleanly. The next exact stage in this chained lane is **live mode surface hierarchy** on `app/player/[id].tsx`. The shared playback branch now carries less duplicate room chrome and a clearer Party Room handoff, so the next grounded seam is live mode still stacking too many simultaneous layers around the core live player.

## Current Plan
1. Keep the active owner on `app/player/[id].tsx`.
2. Treat Stage 1 standalone access-and-control honesty as closed.
3. Treat Stage 2 shared playback chrome compression as closed.
4. Reduce live-mode layer noise without removing real host, comments, filters, or reaction powers.
5. Leave unrelated local dirt out of the checkpoint.

## Exact Next Batch
- tighten the live-mode branch in `app/player/[id].tsx`
- reduce duplicate participant / presence / control layering without removing real powers
- keep `Watch-Party Live`, `Live Watch-Party`, and `Live First` distinct
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve current product route truth and current doctrine
- focus on the canonical player owner first
- reduce live-mode layer noise while preserving real room/social behavior
- leave the completed Stage 1 and Stage 2 player work intact
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
- live mode feels cleaner and more readable
- duplicate participant/presence/control layering is reduced safely
- real live powers and room truth stay intact
- no route drift, schema drift, or doctrine drift is introduced
- the staged set stays task-pure
