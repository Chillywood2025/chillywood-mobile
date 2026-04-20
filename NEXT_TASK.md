# NEXT TASK

## Exact Next Task
The next exact task is a narrow **communication room/session access cleanup pass** on `main`, using `_lib/accessEntitlements.ts`, `docs/access-entitlement-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, and this file as governing truth. Do not reopen `/profile/[userId]`, `/channel-settings`, `/chat`, title/player route truth, or schema ownership unless a real regression is proved. The Party Room resolver adoption pass is now landed: `app/watch-party/[partyId].tsx` consumes shared deeper room gating truth from `_lib/accessEntitlements.ts`, and the next pass should clean up the one smaller remaining communication-room/session seam in `hooks/use-communication-room-session.ts`.

## Current Plan
1. Re-read `docs/access-entitlement-implementation-spec.md`, `ROADMAP.md`, `CURRENT_STATE.md`, and this file first.
2. Treat the current profile/channel and content-management chapters as closed unless a real regression is found.
3. Stay brutally narrow and clean up only the remaining communication room/session seam next.
4. Replace the remaining local direct `evaluateCommunicationRoomAccess(...)` use in `hooks/use-communication-room-session.ts` with resolver-backed room truth if it can be done without changing runtime/session behavior.
5. Keep event access, live-stage adoption, and any broader live/event scheduling work out of scope for this lane.
6. Preserve `/profile/[userId]`, `/channel-settings`, `/chat`, `/chat/[threadId]`, and all watch-party/live route truth unchanged.
7. Keep unsupported later-phase purchase, ticketed, and formal invite concepts explicitly unsupported instead of faking them.

## Exact Next Batch
- adopt `_lib/accessEntitlements.ts` into `hooks/use-communication-room-session.ts` for the remaining deeper communication-room/session access check
- preserve current `room_full` vs `room_unavailable` handling
- keep runtime/session behavior intact
- leave `app/watch-party/live-stage/[partyId].tsx` untouched
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- adopt the landed shared resolver only where the communication room/session hook still bypasses it today
- use `_lib/accessEntitlements.ts` as the canonical room-access owner in `hooks/use-communication-room-session.ts`
- keep the lane limited to the communication hook and avoid reopening Party Room or Live Room / Live Stage
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
- touch broader runtime room/live-stage behavior in this cleanup lane
- touch RBAC or Rachi control-plane work
- broaden into event access adoption before the room/session closeout is settled
- broaden into other screen owners
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `hooks/use-communication-room-session.ts` no longer bypasses the shared room resolver where the audit already proved it should not
- `room_full` vs `room_unavailable` handling stays intact
- event access remains explicitly later instead of being faked
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
