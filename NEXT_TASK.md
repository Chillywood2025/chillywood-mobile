# NEXT TASK

## Exact Next Task
Carry forward the current room-seat checkpoint exactly as proved: this lane improves roles, seats, and request behavior, not full remote-live-media-for-everyone transport. Preserve as now proved that `Watch-Party Live` on `app/player/[id].tsx` is materially strong on two real phones: both phones show real shared-player video, host and viewer are both visible, the viewer request/promotion path works, the host can seat the viewer, and the viewer updates to `Seated`. Preserve as now proved that `Live Stage` hybrid on `app/watch-party/live-stage/[partyId].tsx` materially improved: both phones reached `/watch-party/live-stage/5RUUH4`, both entered the actual stage surface, `mode=hybrid` honors `Live Watch-Party`, the host hybrid panel shows the viewer as `Audience`, and the viewer hybrid panel now shows both `You · Audience` and `Host` because the hybrid self-visibility bug was fixed. Do not overclaim the remaining blocker as closed: the exact next lane is a narrow on-device proof/fix pass on `app/watch-party/live-stage/[partyId].tsx` for the host moderation action menu in hybrid, so the full Live Stage request/promote path can be honestly closed.

## Current Plan
1. Preserve the newly proved Watch-Party Live seat/request behavior exactly as recorded.
2. Preserve the Live Stage hybrid self-visibility fix without overstating the unproved moderation step.
3. Reopen only `app/watch-party/live-stage/[partyId].tsx` for the host hybrid moderation action-menu proof/fix lane.
4. Keep broader remote-live-media expansion and large-seat media scaling out of scope for this checkpoint.

## Exact Next Batch
- preserve the now-proved Watch-Party Live request/seating checkpoint truth
- preserve the Live Stage hybrid self-visibility fix on `app/watch-party/live-stage/[partyId].tsx`
- reopen only the host moderation action-menu path in hybrid Live Stage
- re-run real-device proof only for that exact remaining blocker before claiming the Live Stage request/promote path is closed

## Scope
This next pass should:
- preserve the current checkpoint truth without diluting it into vague closure language
- keep the next lane owner-local to `app/watch-party/live-stage/[partyId].tsx`
- avoid broad transport/media rewrites and avoid reopening already-proved Watch-Party player seating behavior
- keep unrelated code and worktree dirt out of any checkpoint

## Out Of Scope
Do not:
- overclaim that the full Live Stage request/promote path is already closed
- broaden into a new RTC/SFU architecture lane or a full remote-live-media-for-everyone build
- reopen unrelated player, chat, or non-seat room work without fresh proof
- mix unrelated runtime or local dirt into any future checkpoint

## Success Criteria
The next lane is successful when:
- the host hybrid moderation action menu on `app/watch-party/live-stage/[partyId].tsx` is honestly reachable and proved on-device
- the Live Stage request/promote path can then be called honestly closed at the same narrow runtime level already proved on `Watch-Party Live`
- the checkpoint remains truthful about current live-seat/request behavior without implying a larger remote-media build
