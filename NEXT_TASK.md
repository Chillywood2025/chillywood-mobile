# NEXT TASK

## Exact Next Task
The first public profile/channel owner-overlay batch is now closed cleanly on `main`. The next exact stage is `owner overlay batch 2` on `app/profile/[userId].tsx`: tighten the remaining owner ribbon, quick actions, and prompt stack so self-view feels useful but more secondary, with clearer handoff energy and less setup/console weight.

## Current Plan
1. Treat owner overlay batch 1 as closed.
2. Tighten the remaining owner ribbon / prompt stack hierarchy next.
3. Keep self-view useful without letting the lower owner layer feel like a second console.
4. Make creator-management actions read even more clearly as handoffs to `/channel-settings`.
5. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- reduce duplication between the lower owner layer and `/channel-settings`
- tighten owner ribbon, quick actions, and setup prompts so they feel quieter and more decisive
- keep useful self-view convenience without removing honest owner handoffs
- keep creator/public and room/doctrine boundaries intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `/profile/[userId]` as the canonical public profile/channel route
- focus on the remaining owner-overlay hierarchy seam only on that owner
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
- the lower owner layer feels quieter and less duplicative
- the public route still offers useful owner convenience without reading like a creator console
- no route drift, schema drift, or doctrine drift is introduced
- the staged set stays task-pure
