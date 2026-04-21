# NEXT TASK

## Exact Next Task
The third public profile/channel owner-overlay batch is now closed cleanly on `main`. The next exact stage is the `lane closeout audit`: decide whether the public profile/channel owner-overlay lane is complete enough to close cleanly, or whether one final trivial/narrow pass is still honestly justified inside `app/profile/[userId].tsx`.

## Current Plan
1. Treat owner overlay batch 3 as closed.
2. Audit what this lane fully improved on `/profile/[userId]`.
3. Separate any remaining trivial/narrow seam from medium or broader work honestly.
4. Only do one more pass if it is clearly justified and still fully route-owned.
5. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- audit whether any final trivial/narrow owner-overlay cleanup remains
- close the lane if the remaining seams are already medium or broader
- preserve useful self-view convenience without reopening broader owner/public structure
- keep creator/public and room/doctrine boundaries intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `/profile/[userId]` as the canonical public profile/channel route
- focus on honest lane closeout and next-step grounding only on that owner
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
- the route's landed owner-overlay improvements are clearly recorded
- any remaining seam is classified honestly as trivial, narrow, medium, or broad/risky
- no route drift, schema drift, or doctrine drift is introduced
- the staged set stays task-pure
