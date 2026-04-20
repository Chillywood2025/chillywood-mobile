# NEXT TASK

## Exact Next Task
The next exact task is a narrow **audience action/helper foundation pass** on `main`, starting with `_lib/channelAudience.ts`. Use `docs/audience-management-implementation-spec.md`, `docs/profile-channel-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, `_lib/channelReadModels.ts`, and this file as governing truth. Do not jump to broad audience UI yet, do not widen into analytics or deeper moderation workflows, and do not drift current route doctrine.

## Current Plan
1. Re-read `docs/audience-management-implementation-spec.md`, `docs/profile-channel-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, `_lib/channelReadModels.ts`, and this file first.
2. Treat the current profile/channel, content-management, and access-adoption families as closed unless a real regression is found.
3. Create `_lib/channelAudience.ts` as the shared mutation/workflow helper owner for current supported audience actions only.
4. Keep the foundation honest for followers, creator/channel subscribers, requests, and blocked audience without faking VIP/mod/co-host systems.
5. Preserve locked route truth for `/profile/[userId]`, `/channel-settings`, Chi'lly Chat, and all current room/live owners.

## Exact Next Batch
- create the shared audience action/helper owner in `_lib/channelAudience.ts`
- centralize current supported audience mutations instead of scattering them into screen owners
- keep creator/channel subscriber truth separate from account-tier premium truth
- keep VIP/mod/co-host audience roles explicitly later
- set up the clean helper foundation for a later `/channel-settings` audience management surface pass
- keep unrelated local dirt out of the checkpoint
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- create `_lib/channelAudience.ts`
- support only currently honest audience actions such as follow/unfollow, request creation/cancelation, owner approval/decline, and block/unblock where current schema already supports them
- avoid broad UI adoption in the same lane unless a tiny directly-related helper/type import is required
- keep `_lib/channelReadModels.ts` as the summary/read-model owner
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
- jump straight into broad `/channel-settings` audience UI
- fake VIP/mod/co-host audience logic
- broaden into screen-owner UI work
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `_lib/channelAudience.ts` exists and is a real shared helper owner
- current supported audience actions are centralized instead of screen-local
- creator/channel subscriber truth stays separate from premium entitlement truth
- unsupported VIP/mod/co-host audience roles remain explicitly later
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
