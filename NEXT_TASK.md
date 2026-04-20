# NEXT TASK

## Exact Next Task
The next exact task is a narrow **creator scheduling surface pass** on `main`, scoped to `app/channel-settings.tsx` and the newly landed `_lib/liveEvents.ts` helper layer. Use `docs/live-event-scheduling-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, `_lib/liveEvents.ts`, and this file as governing truth. Do not implement event access yet, do not widen into public event UI, and do not drift current route doctrine.

## Current Plan
1. Re-read `docs/live-event-scheduling-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, `_lib/liveEvents.ts`, and this file first.
2. Treat the current profile/channel, content-management, and access-adoption families as closed unless a real regression is found.
3. Add the first real creator scheduling surface under `/channel-settings` using the landed `creator_events` model and `_lib/liveEvents.ts`.
4. Keep that surface honest for event type, timing, replay setting, reminder readiness, and lifecycle status only.
5. Keep event access implementation and public UI adoption out of scope in this creator-surface lane.
6. Preserve locked semantics and route truth for `Watch-Party Live`, `Live Watch-Party`, `Live First`, `/watch-party/[partyId]`, `/watch-party/live-stage/[partyId]`, `/profile/[userId]`, and `/channel-settings`.

## Exact Next Batch
- add creator event scheduling controls to `/channel-settings`
- let creators truthfully see and manage upcoming events, type, timing, replay setting, reminder readiness, and status
- keep the route owner canonical and avoid `/studio*` drift
- use `_lib/liveEvents.ts` instead of scattering event logic locally
- confirm event access remains later until canonical event truth exists
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- add the first creator-facing scheduling/control surface inside `app/channel-settings.tsx`
- use the landed `creator_events` truth and `_lib/liveEvents.ts` without reopening title scheduling or runtime room tables
- keep the creator surface honest for replay/reminder-ready state without faking event access or analytics
- keep the lane doctrine-first and avoid reopening already-landed access, channel, content, or room adoption work unless a real regression is found
- preserve all current route truth and all previously landed profile/channel, content-management, and access stages
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- reopen the broader profile/channel, content-management, or access chapters because of preference churn
- widen into Home again, profile again, public event UI, admin workflow tuning again, heavier monetization rollout, audience/analytics expansion, or deeper safety/admin work
- invent creator-platform routes or `/studio*` route truth
- fake content catalogs, fake programming, or fake analytics
- create `/studio*` routes
- touch broader runtime room/live-stage behavior in this creator-surface lane
- touch RBAC or Rachi control-plane work
- implement event access before the live/event chapter creates canonical event truth
- broaden into screen-owner adoption or UI work
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `/channel-settings` owns a real creator scheduling surface under current route doctrine
- creator event controls are grounded in the landed event model and `_lib/liveEvents.ts`
- title publication scheduling remains separate from event truth
- runtime room tables remain separate from scheduled-event truth
- event access remains explicitly later instead of being faked
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
