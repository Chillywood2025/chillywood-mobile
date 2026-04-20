# NEXT TASK

## Exact Next Task
The next exact task is a narrow **live/event scheduling doctrine-spec pass** on `main`, starting with `docs/live-event-scheduling-implementation-spec.md` and using `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, `docs/access-entitlement-implementation-spec.md`, `docs/profile-channel-implementation-spec.md`, and this file as governing truth. Do not reopen the closed-enough access-adoption family, do not implement event access yet, and do not touch schema, routes, or public/live UI in this doctrine pass. The access/entitlement chapter is now complete enough to move on for current truth, and event access remains explicitly later until the live/event chapter creates canonical event truth.

## Current Plan
1. Re-read `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, `docs/access-entitlement-implementation-spec.md`, `docs/profile-channel-implementation-spec.md`, and this file first.
2. Treat the current profile/channel, content-management, and access-adoption families as closed unless a real regression is found.
3. Create the durable live/event chapter doctrine in `docs/live-event-scheduling-implementation-spec.md` only; do not start implementation yet.
4. Preserve locked semantics and route truth for `Watch-Party Live`, `Live Watch-Party`, `Live First`, `/watch-party/[partyId]`, `/watch-party/live-stage/[partyId]`, `/profile/[userId]`, and `/channel-settings`.
5. Keep event access implementation out of scope until the live/event chapter defines canonical event truth.
6. Keep unsupported later-phase purchase, ticketed, and formal invite concepts explicitly unsupported instead of faking them.

## Exact Next Batch
- create `docs/live-event-scheduling-implementation-spec.md`
- define canonical live/event doctrine for scheduled live and scheduled watch-party surfaces without changing route truth
- preserve the locked distinction between `Watch-Party Live`, `Live Watch-Party`, and `Live First`
- confirm event access remains later until canonical event truth exists
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- create the first durable live/event scheduling implementation spec
- use the access spec handoff, current room doctrine, and current route/control-file truth to define what live/event scheduling means now versus later
- keep the lane doctrine-first and avoid reopening already-landed access, channel, content, or room adoption work unless a real regression is found
- preserve all current route truth and all previously landed profile/channel, content-management, and access stages
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- reopen the broader profile/channel, content-management, or access chapters because of preference churn
- widen into Home again, profile again, channel-settings again, admin workflow tuning again, live/event scheduling implementation, heavier monetization rollout, audience/analytics expansion, or deeper safety/admin work
- invent creator-platform routes or `/studio*` route truth
- fake content catalogs, fake programming, or fake analytics
- create `/studio*` routes
- touch schema or backend ownership in this doctrine lane
- touch broader runtime room/live-stage behavior in this doctrine lane
- touch RBAC or Rachi control-plane work
- implement event access before the live/event chapter creates canonical event truth
- broaden into screen-owner adoption or UI work
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `docs/live-event-scheduling-implementation-spec.md` lands as durable doctrine
- the repo defines exactly what current live/event truth is versus what remains later-phase
- event access remains explicitly later instead of being faked
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
