# NEXT TASK

## Exact Next Task
The public profile/channel owner-overlay audit is now closed cleanly on `main`. The next exact stage is `owner overlay batch 1` on `app/profile/[userId].tsx`: make self-view open more like a public channel destination by lowering or quieting the heaviest owner-only block, keeping useful owner convenience available, and making the deeper creator-management path read more clearly as a handoff to `/channel-settings`.

## Current Plan
1. Treat the owner-overlay audit as closed.
2. Reduce the highest-placed owner-only weight first.
3. Keep self-view useful without letting the public route open like a creator console.
4. Preserve honest owner/public boundaries while making deeper creator control read as a handoff.
5. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- lower or quiet the heaviest owner-only block in self-view
- keep genuinely useful owner actions available without overpowering the public route
- make deeper creator-management cues read more clearly as a handoff to `/channel-settings`
- keep creator/public and room/doctrine boundaries intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `/profile/[userId]` as the canonical public profile/channel route
- focus on the highest-value owner-overlay hierarchy seam only on that owner
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
- self-view opens more like a premium public route with a lighter owner layer
- the public route still offers useful owner convenience without reading like a creator console
- no route drift, schema drift, or doctrine drift is introduced
- the staged set stays task-pure
