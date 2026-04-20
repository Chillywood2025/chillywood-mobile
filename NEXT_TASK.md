# NEXT TASK

## Exact Next Task
The next exact task is a narrow **`/channel-settings` audience workflow adoption pass** on `main`, starting with `app/channel-settings.tsx`. Use `docs/audience-management-implementation-spec.md`, `docs/profile-channel-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, `_lib/channelReadModels.ts`, `_lib/channelAudience.ts`, and this file as governing truth. Do not jump to public audience modules yet, do not widen into analytics or deeper moderation workflows, and do not drift current route doctrine.

## Current Plan
1. Re-read `docs/audience-management-implementation-spec.md`, `docs/profile-channel-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, `_lib/channelReadModels.ts`, and this file first.
2. Treat the current profile/channel, content-management, and access-adoption families as closed unless a real regression is found.
3. Adopt the landed `_lib/channelAudience.ts` helper into the creator-side audience owner on `/channel-settings`.
4. Deepen the current audience summary area into real workflow sections for current honest buckets only.
5. Preserve locked route truth for `/profile/[userId]`, `/channel-settings`, Chi'lly Chat, and all current room/live owners.

## Exact Next Batch
- adopt `_lib/channelAudience.ts` inside `app/channel-settings.tsx`
- expose real creator workflows for current honest buckets such as requests and blocked audience, with follower/subscriber posture only where the helper truth already supports it
- keep creator/channel subscriber truth separate from account-tier premium truth
- keep VIP/mod/co-host audience roles explicitly later
- keep public profile audience modules explicitly out of scope in this lane
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- adopt the landed audience helper/read-model truth into `app/channel-settings.tsx`
- cover only current honest creator-side audience workflows such as request review and block/unblock, plus any small backed viewer-relationship posture the current helper already supports
- avoid public profile adoption in the same lane unless a tiny directly-related type import is required
- keep `_lib/channelReadModels.ts` as the summary/read-model owner and `_lib/channelAudience.ts` as the mutation/workflow owner
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
- jump into broad public audience modules on `/profile/[userId]`
- fake VIP/mod/co-host audience logic
- broaden beyond the canonical creator owner on `/channel-settings`
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `/channel-settings` consumes `_lib/channelAudience.ts` for current honest creator-side audience workflows
- current request/block workflows are no longer summary-only
- creator/channel subscriber truth stays separate from premium entitlement truth
- unsupported VIP/mod/co-host audience roles remain explicitly later
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
