# NEXT TASK

## Exact Next Task
The next exact task is a narrow **room access resolver adoption pass** on `main`, using `_lib/accessEntitlements.ts`, `docs/access-entitlement-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, and this file as governing truth. Do not reopen `/profile/[userId]`, `/channel-settings`, `/chat`, title/player route truth, or schema ownership unless a real regression is proved. The content access resolver adoption pass is now landed: the canonical title/player owners consume shared content gating truth from `_lib/accessEntitlements.ts`, and the next pass should adopt only the room portion of that resolver into `app/watch-party/index.tsx` and `app/communication/index.tsx` so room-entry access stops deriving room gating locally.

## Current Plan
1. Re-read `docs/access-entitlement-implementation-spec.md`, `ROADMAP.md`, `CURRENT_STATE.md`, and this file first.
2. Treat the current profile/channel and content-management chapters as closed unless a real regression is found.
3. Stay brutally narrow and adopt only the room-access portion next.
4. Replace duplicated room-entry gating derivation in `app/watch-party/index.tsx` and `app/communication/index.tsx` with `_lib/accessEntitlements.ts` `resolveRoomAccess(...)` plus `getAccessLabel(...)` where it already fits.
5. Keep event access and deeper live-stage/room-owner adoption out of scope for this lane.
6. Preserve `/profile/[userId]`, `/channel-settings`, `/chat`, `/chat/[threadId]`, and all watch-party/live route truth unchanged.
7. Keep unsupported later-phase purchase, ticketed, and formal invite concepts explicitly unsupported instead of faking them.

## Exact Next Batch
- adopt `_lib/accessEntitlements.ts` into `app/watch-party/index.tsx` and `app/communication/index.tsx` for room-entry gating truth only
- replace scattered local room-access derivation with shared room resolver outputs
- preserve existing screen structure and wording where current doctrine already fits
- keep `Chi'lly Chat`, `Watch-Party Live`, and `Live Watch-Party` doctrine unchanged
- keep deeper room-owner adoption and event access out of scope for this lane
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- adopt the landed shared resolver only where room-entry gating is already being derived today
- reuse `_lib/accessEntitlements.ts` for canonical room-access outputs in `app/watch-party/index.tsx` and `app/communication/index.tsx`
- keep the lane limited to room-entry surfaces and avoid reopening profile/channel, title/player, or live/event access owners
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
- broaden into live-stage or event access adoption before the room-entry resolver pass is settled
- broaden into other screen owners
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `app/watch-party/index.tsx` and `app/communication/index.tsx` consume the landed shared room resolver instead of deriving room-entry gating locally
- shared room access labels come from `_lib/accessEntitlements.ts`
- deeper room/session adoption remains untouched
- event access remains explicitly later instead of being faked
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
