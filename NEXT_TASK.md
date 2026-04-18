# NEXT TASK

## Exact Next Task
Carry forward the now-restored player/live-stage baseline exactly as proved: Standalone Player stays solo-first, `Watch-Party Live` stays a bounded shared-player layer inside the player/title lane instead of growing a second shell, and `Live First` keeps the visible lower comments/reactions/studio lane plus the visible mode toggle on the live-stage owner. Do not reopen `app/player/[id].tsx` or `app/watch-party/live-stage/[partyId].tsx` speculatively. Only return if fresh runtime proof shows a new regression in the restored standalone-vs-party split, the restored `Live First` lower lane, or the Party-vs-Live route doctrine. Otherwise move to the next user-prioritized runtime lane from the broader queue already recorded in repo truth.

## Current Plan
1. Preserve the restored standalone-player vs `Watch-Party Live` split exactly as now proved.
2. Preserve the restored `Live First` lower comments/reactions/studio lane and visible mode toggle.
3. Reopen the player or live-stage owners only if fresh runtime proof shows a real regression.
4. Otherwise continue with the next user-prioritized runtime lane from the broader queue.

## Exact Next Batch
- preserve the restored `Watch-Party Live` player context above playback and bounded shared-social layer below
- preserve the restored `Live First` lower comments/reactions/studio lane
- avoid speculative player or live-stage UI churn
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve the now-restored player/live-stage truth exactly as recorded
- avoid inventing new room shells or duplicating player structure
- keep route doctrine unchanged
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- reopen token issuance or transport debugging without fresh proof
- redesign the watch-party structure again
- broaden into Firebase/profile/admin/chat lanes
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the restored standalone-player vs `Watch-Party Live` split stays true
- the restored `Live First` lower comments lane stays regression-free
- the repo can move forward without rediscovering the stale player/live-stage structure
