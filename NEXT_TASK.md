# NEXT TASK

## Exact Next Task
The next exact task is a narrow **audience chapter closeout audit / next-chapter handoff** on `main`, scoped to `app/profile/[userId].tsx`, `app/channel-settings.tsx`, `_lib/channelAudience.ts`, `_lib/channelReadModels.ts`, `CURRENT_STATE.md`, `NEXT_TASK.md`, and `docs/audience-management-implementation-spec.md`. Use those files plus `docs/profile-channel-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, and `ROADMAP.md` as governing truth. Do not widen back into implementation unless the closeout audit proves a remaining audience seam that is still clearly justified.

## Current Plan
1. Re-read `docs/audience-management-implementation-spec.md`, `docs/profile-channel-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, `_lib/channelReadModels.ts`, and this file first.
2. Treat the current profile/channel, content-management, and access-adoption families as closed unless a real regression is found.
3. Audit the current audience chapter owners and helpers to determine whether any meaningful audience seam still remains after follower removal and the public visibility slice.
4. Choose exactly one next move: audience chapter closeout / next-chapter selection unless the audit proves a remaining audience seam that still clearly outranks moving on.
5. Preserve locked route truth for `/profile/[userId]`, `/channel-settings`, Chi'lly Chat, and all current room/live owners.

## Exact Next Batch
- audit the audience chapter after the landed public visibility pass and follower-removal workflow
- verify what audience truth is now fully real across `/channel-settings`, `/profile/[userId]`, `_lib/channelAudience.ts`, and `_lib/channelReadModels.ts`
- determine whether any remaining seam is trivial, narrow, medium, or broad/risky
- keep creator/channel subscriber truth separate from account-tier premium truth
- keep VIP/mod/co-host audience roles explicitly later unless the audit proves otherwise
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- audit `app/profile/[userId].tsx`, `app/channel-settings.tsx`, `_lib/channelAudience.ts`, and `_lib/channelReadModels.ts` against the landed audience doctrine
- identify whether any meaningful audience-management seam still remains after public visibility posture and follower removal landed
- avoid creator-only workflow controls on the public route and avoid reopening already-landed `/channel-settings` workflows unless a real regression is found
- keep `_lib/channelReadModels.ts` as the summary/read-model owner and `_lib/channelAudience.ts` as the mutation/workflow owner without widening helper scope
- keep the lane doctrine-first and avoid reopening already-landed access, channel, content, room, or live/event work unless a real regression is found
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
- jump into broader audience implementation again unless the closeout audit proves one final narrow seam
- fake VIP/mod/co-host audience logic
- reopen `/channel-settings` workflow work unless the audit proves a regression or a clearly stronger remaining seam
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- repo truth clearly identifies whether the audience chapter is complete enough to move on or still needs one final narrow batch
- any recommended remaining audience batch is grounded in current backed audience truth only
- creator/channel subscriber truth stays separate from premium entitlement truth
- unsupported VIP/mod/co-host audience roles remain explicitly later
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
