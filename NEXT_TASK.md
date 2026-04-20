# NEXT TASK

## Exact Next Task
The next exact task is a narrow **public audience surface audit** on `main`, scoped to `app/profile/[userId].tsx`. Use `docs/audience-management-implementation-spec.md`, `docs/profile-channel-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, `_lib/channelReadModels.ts`, `_lib/channelAudience.ts`, and this file as governing truth. Do not jump straight into public audience UI implementation until the audit proves which backed visibility belongs on the canonical public profile/channel route.

## Current Plan
1. Re-read `docs/audience-management-implementation-spec.md`, `docs/profile-channel-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, `_lib/channelReadModels.ts`, and this file first.
2. Treat the current profile/channel, content-management, and access-adoption families as closed unless a real regression is found.
3. Audit the canonical public profile/channel owner on `/profile/[userId]` for what audience visibility is already backed and what should remain private or creator-only.
4. Determine whether any additional public follower/subscriber visibility should be adopted now or explicitly deferred.
5. Preserve locked route truth for `/profile/[userId]`, `/channel-settings`, Chi'lly Chat, and all current room/live owners.

## Exact Next Batch
- audit `/profile/[userId]` for backed audience visibility seams only
- determine whether follower/subscriber/public-activity surfaces have enough truth for a narrow public adoption lane
- keep creator/channel subscriber truth separate from account-tier premium truth
- keep VIP/mod/co-host audience roles explicitly later
- keep creator-only workflow controls out of the public route
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- audit `app/profile/[userId].tsx` against the landed audience-management doctrine and current read-model truth
- identify what audience visibility is already backed enough for public rendering and what should remain later
- avoid creator-only workflow controls on the public route
- keep `_lib/channelReadModels.ts` as the summary/read-model owner and `_lib/channelAudience.ts` as the mutation/workflow owner without widening helper scope
- keep the lane doctrine-first and avoid reopening already-landed access, channel, content, or room adoption work unless a real regression is found
- preserve all current route truth and all previously landed profile/channel, content-management, and access stages
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- reopen the broader profile/channel, content-management, or access chapters because of preference churn
- widen into Home again, admin workflow tuning again, heavier monetization rollout, audience/analytics expansion, or deeper safety/admin work
- invent creator-platform routes or `/studio*` route truth
- fake content catalogs, fake programming, or fake analytics
- create `/studio*` routes
- touch broader runtime room/live-stage behavior in this doctrine lane
- touch RBAC or Rachi control-plane work
- jump into broad public audience modules on `/profile/[userId]` before the audit proves them
- fake VIP/mod/co-host audience logic
- reopen `/channel-settings` workflow work unless the audit proves a regression
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- repo truth clearly identifies whether a narrow public audience adoption batch is justified
- any recommended public audience adoption is grounded in current backed follower/subscriber/visibility truth only
- creator/channel subscriber truth stays separate from premium entitlement truth
- unsupported VIP/mod/co-host audience roles remain explicitly later
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
