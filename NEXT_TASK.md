# NEXT TASK

## Exact Next Task
The player simplification pass is now underway on `main`, and Stage 4 is closed cleanly. The next exact stage in this chained lane is the **player lane closeout audit** on `main`. The active player now has the intended narrow simplification slices in place, so the next step is to decide whether the lane is cleanly done or whether any remaining seam is still broad enough to defer.

## Current Plan
1. Keep the active owner on `app/player/[id].tsx`.
2. Treat Stage 1 standalone access-and-control honesty as closed.
3. Treat Stage 2 shared playback chrome compression as closed.
4. Treat Stage 3 live-mode surface hierarchy as closed.
5. Treat Stage 4 stale player-local cleanup as closed.
6. Audit whether the remaining player seam is now narrow, medium, or broad/risky.
7. Leave unrelated local dirt out of the checkpoint.

## Exact Next Batch
- audit the post-cleanup player lane honestly
- decide whether one more narrow pass is justified or whether the lane should close
- keep the current Stage 1 through 4 behavior exactly intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve current product route truth and current doctrine
- focus on the canonical player owner first
- evaluate the cleaned-up player lane without reopening broad implementation
- leave the completed Stage 1 through 4 player work intact
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
- the player lane is classified honestly as complete enough or still broad/risky
- no fake narrow follow-up is invented if the remaining seam is broader
- the next exact product lane is explicit before implementation resumes
- no route drift, schema drift, or doctrine drift is introduced
- the staged set stays task-pure
