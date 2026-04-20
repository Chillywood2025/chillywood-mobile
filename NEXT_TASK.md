# NEXT TASK

## Exact Next Task
The next exact task is a narrow **channel access resolver adoption pass** on `main`, using `_lib/accessEntitlements.ts`, `docs/access-entitlement-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, and this file as governing truth. Do not reopen `/chat`, watch-party/live route truth, schema ownership, or the landed profile/channel and content-management chapters unless a real regression is proved. The shared resolver foundation is now landed: `_lib/accessEntitlements.ts` centralizes current-truth access resolution for channel, content, and room/session access, but no screen owners consume it yet. The next pass should adopt only the channel portion of that resolver into `/profile/[userId]` and `/channel-settings` so those two canonical channel surfaces stop deriving access posture locally.

## Current Plan
1. Re-read `docs/access-entitlement-implementation-spec.md`, `ROADMAP.md`, `CURRENT_STATE.md`, and this file first.
2. Treat the current profile/channel and content-management chapters as closed unless a real regression is found.
3. Stay brutally narrow and adopt only the channel-access portion first.
4. Replace duplicated local access-posture derivation in `/profile/[userId]` and `/channel-settings` with `_lib/accessEntitlements.ts` `resolveChannelAccess(...)` plus `getAccessLabel(...)`.
5. Keep title/player adoption, room adoption, and event access out of scope for this lane.
6. Preserve `/profile/[userId]`, `/channel-settings`, `/chat`, `/chat/[threadId]`, and all watch-party/live route truth unchanged.
7. Keep unsupported later-phase purchase, ticketed, and formal invite concepts explicitly unsupported instead of faking them.

## Exact Next Batch
- adopt `_lib/accessEntitlements.ts` into `/profile/[userId]` and `/channel-settings` for channel posture/access summary truth only
- replace scattered local `Public` / `Private` / `Subscriber Access` / `Mixed Access` derivation with shared channel resolver outputs
- preserve existing screen structure and wording where current doctrine already fits
- keep `Chi'lly Chat`, `Watch-Party Live`, and `Live Watch-Party` doctrine unchanged
- keep title/player access, room access, and event access out of scope for this lane
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- adopt the landed shared resolver only where channel posture is already being derived today
- reuse `_lib/accessEntitlements.ts` for canonical channel-access outputs in `/profile/[userId]` and `/channel-settings`
- keep the lane limited to channel surfaces and avoid reopening title/player, room/session, or live/event access owners
- avoid reopening landed public consumer work, source-of-truth hardening, or broader Content Studio redesign
- preserve all current route truth and all previously landed profile/channel stages
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- reopen the broader profile/channel or content-management chapters because of preference churn
- widen into Home again, profile again, channel-settings again, admin workflow tuning again, live/event scheduling implementation, heavier monetization rollout, audience/analytics expansion, or deeper safety/admin work
- invent creator-platform routes or `/studio*` route truth
- fake content catalogs, fake programming, or fake analytics
- create `/studio*` routes
- touch schema or backend ownership in this adoption lane
- touch runtime room/live-stage owners in this lane
- touch RBAC or Rachi control-plane work
- broaden into title/player or room access adoption before the channel resolver pass is settled
- broaden into other screen owners
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `/profile/[userId]` and `/channel-settings` consume the landed shared channel resolver instead of deriving posture locally
- shared channel access labels come from `_lib/accessEntitlements.ts`
- title/player and room/session adoption remain untouched
- event access remains explicitly later instead of being faked
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
