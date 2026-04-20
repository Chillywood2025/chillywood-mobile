# NEXT TASK

## Exact Next Task
The next exact task is a narrow **public event surface adoption pass** on `main`, starting with `app/profile/[userId].tsx` and the landed `_lib/liveEvents.ts` helper layer. Use `docs/live-event-scheduling-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, `_lib/liveEvents.ts`, and this file as governing truth. Do not implement event access yet, do not widen into discovery or reminder delivery, and do not drift current route doctrine.

## Current Plan
1. Re-read `docs/live-event-scheduling-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, `_lib/liveEvents.ts`, and this file first.
2. Treat the current profile/channel, content-management, and access-adoption families as closed unless a real regression is found.
3. Adopt the landed `creator_events` truth onto the current public channel surface without creating new event routes.
4. Keep the public surface honest for live-now, upcoming, replay-available/expired, and reminder-ready state only when those states are really backed.
5. Keep event access implementation, discovery, and notification delivery out of scope in this public-surface lane.
6. Preserve locked semantics and route truth for `Watch-Party Live`, `Live Watch-Party`, `Live First`, `/watch-party/[partyId]`, `/watch-party/live-stage/[partyId]`, `/profile/[userId]`, and `/channel-settings`.

## Exact Next Batch
- add the first real public event summary surface to `/profile/[userId]`
- show honest live-now, upcoming, replay, and reminder-ready event state from `_lib/liveEvents.ts`
- preserve the locked distinction between `Watch-Party Live`, `Live Watch-Party`, and `Live First`
- keep the route owner canonical and avoid route proliferation
- confirm event access remains later until canonical event truth exists
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- adopt public event truth into `app/profile/[userId].tsx` first, and only widen to adjacent current public owners if the file proves it is necessary
- use the landed `creator_events` truth and `_lib/liveEvents.ts` without reopening title scheduling or runtime room tables
- keep the public surface honest for replay/reminder-ready state without faking event access, discovery, or countdown systems
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
- touch broader runtime room/live-stage behavior in this public-surface lane
- touch RBAC or Rachi control-plane work
- implement event access before the live/event chapter creates canonical event truth
- broaden into screen-owner adoption or UI work
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `/profile/[userId]` shows real public event state under current route doctrine
- public event cards are grounded in the landed event model and `_lib/liveEvents.ts`
- title publication scheduling remains separate from event truth
- runtime room tables remain separate from scheduled-event truth
- event access remains explicitly later instead of being faked
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
