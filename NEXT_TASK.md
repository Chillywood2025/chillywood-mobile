# NEXT TASK

## Exact Next Task
The second public profile/channel owner-overlay batch is now closed cleanly on `main`. The next exact stage is `owner overlay batch 3` on `app/profile/[userId].tsx`: apply one final narrow self-view hierarchy cleanup only if it still helps, most likely by making the lower owner layer visually quieter now that the content and handoff structure are cleaner.

## Current Plan
1. Treat owner overlay batch 2 as closed.
2. Check whether the remaining owner layer still carries too much visual weight.
3. Only do one more pass if it stays narrow and route-owned.
4. Skip the batch if the remaining work is already medium or broader.
5. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- make the lower owner layer visually quieter if it still competes with the public route
- keep the cleaned handoff structure intact while reducing any remaining console-like weight
- preserve useful self-view convenience without reopening broader owner/public structure
- keep creator/public and room/doctrine boundaries intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `/profile/[userId]` as the canonical public profile/channel route
- focus on final owner-overlay hierarchy consistency only on that owner
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
- the lower owner layer no longer visually competes with the public route
- the route closes this lane feeling balanced without route or doctrine drift
- no route drift, schema drift, or doctrine drift is introduced
- the staged set stays task-pure
