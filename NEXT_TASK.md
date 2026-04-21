# NEXT TASK

## Exact Next Task
The second public profile/channel premium hierarchy batch is now closed cleanly on `main`. The next exact stage is `premium hierarchy batch 3`: tighten the remaining public-facing live-state and owner/public hierarchy seams in `app/profile/[userId].tsx` only if they can be improved safely without route drift, schema drift, or creator-console creep.

## Current Plan
1. Treat premium hierarchy batch 2 as closed.
2. Re-check the remaining Live tab and self-view seams for one final narrow public-route cleanup.
3. Keep the route public-facing and creator-led without turning it into a console.
4. Skip the batch entirely if the remaining work is already structural or too owner-operational.
5. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- compress leftover live-state memo density where it still reads too internal
- reduce any remaining owner/public hierarchy spill on the public route
- sharpen one last truthful CTA/handoff seam only if it stays narrow
- keep creator/public and room/doctrine boundaries intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `/profile/[userId]` as the canonical public profile/channel route
- focus only on remaining narrow live/public hierarchy seams on that owner
- leave completed account/support/chat/home/title route owners alone
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change current public/product route truth
- change schema or doctrine
- add creator-console behavior to the public route
- invent route proliferation or fake creator/platform powers
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the remaining public live/owner seams are either honestly tightened or explicitly judged too broad
- the route ends this lane feeling materially cleaner without drifting into creator-console behavior
- no route drift, schema drift, or doctrine drift is introduced
- the staged set stays task-pure
