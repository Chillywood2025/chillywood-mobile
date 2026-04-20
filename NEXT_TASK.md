# NEXT TASK

## Exact Next Task
The next exact task is a narrow **content access resolver adoption pass** on `main`, using `_lib/accessEntitlements.ts`, `docs/access-entitlement-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, and this file as governing truth. Do not reopen `/profile/[userId]`, `/channel-settings`, `/chat`, watch-party/live route truth, or schema ownership unless a real regression is proved. The channel access resolver adoption pass is now landed: the canonical profile/channel owners consume shared channel posture truth from `_lib/accessEntitlements.ts`, and the next pass should adopt only the content portion of that resolver into `app/title/[id].tsx` and `app/player/[id].tsx` so title/player gating stops deriving content access locally.

## Current Plan
1. Re-read `docs/access-entitlement-implementation-spec.md`, `ROADMAP.md`, `CURRENT_STATE.md`, and this file first.
2. Treat the current profile/channel and content-management chapters as closed unless a real regression is found.
3. Stay brutally narrow and adopt only the content-access portion next.
4. Replace duplicated title/player content gating derivation in `app/title/[id].tsx` and `app/player/[id].tsx` with `_lib/accessEntitlements.ts` `resolveContentAccess(...)` plus `getAccessLabel(...)` where it already fits.
5. Keep room adoption and event access out of scope for this lane.
6. Preserve `/profile/[userId]`, `/channel-settings`, `/chat`, `/chat/[threadId]`, and all watch-party/live route truth unchanged.
7. Keep unsupported later-phase purchase, ticketed, and formal invite concepts explicitly unsupported instead of faking them.

## Exact Next Batch
- adopt `_lib/accessEntitlements.ts` into `app/title/[id].tsx` and `app/player/[id].tsx` for content gating truth only
- replace scattered local content-access derivation with shared content resolver outputs
- preserve existing screen structure and wording where current doctrine already fits
- keep `Chi'lly Chat`, `Watch-Party Live`, and `Live Watch-Party` doctrine unchanged
- keep room access and event access out of scope for this lane
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- adopt the landed shared resolver only where content gating is already being derived today
- reuse `_lib/accessEntitlements.ts` for canonical content-access outputs in `app/title/[id].tsx` and `app/player/[id].tsx`
- keep the lane limited to title/player content surfaces and avoid reopening profile/channel, room/session, or live/event access owners
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
- broaden into room access adoption before the content resolver pass is settled
- broaden into other screen owners
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `app/title/[id].tsx` and `app/player/[id].tsx` consume the landed shared content resolver instead of deriving content gating locally
- shared content access labels come from `_lib/accessEntitlements.ts`
- room/session adoption remains untouched
- event access remains explicitly later instead of being faked
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
