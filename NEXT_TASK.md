# NEXT TASK

## Exact Next Task
The next exact task is a narrow **canonical live/event data foundation pass** on `main`, starting with the smallest honest event table/model that stays separate from title metadata and current runtime room tables. Use `docs/live-event-scheduling-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, `docs/access-entitlement-implementation-spec.md`, and this file as governing truth. Do not implement event access yet, do not widen into public event UI, and do not drift current route doctrine.

## Current Plan
1. Re-read `docs/live-event-scheduling-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, and this file first.
2. Treat the current profile/channel, content-management, and access-adoption families as closed unless a real regression is found.
3. Add the smallest canonical event foundation needed for scheduled `Live First`, `Live Watch-Party`, and `Watch-Party Live` truth.
4. Keep that event truth separate from title publication scheduling and separate from current runtime room tables.
5. Store only honest current-doctrine fields for timing, lifecycle status, replay availability / expiration, reminder-ready state, and optional linked title context.
6. Keep event access implementation and public UI adoption out of scope in this foundation lane.
7. Preserve locked semantics and route truth for `Watch-Party Live`, `Live Watch-Party`, `Live First`, `/watch-party/[partyId]`, `/watch-party/live-stage/[partyId]`, `/profile/[userId]`, and `/channel-settings`.

## Exact Next Batch
- add the smallest canonical event schema/model
- keep it separate from title publication truth and current room runtime truth
- support event type, timing, lifecycle status, replay availability / expiration, reminder-ready truth, and optional linked title context
- update repo-owned database typing if the schema changes
- confirm event access remains later until canonical event truth exists
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- add the smallest event foundation under `supabase/migrations` and repo-owned database typing only as needed
- keep the event model generic enough for creator scheduling, public summaries later, replay truth, and reminder-ready truth
- keep the lane doctrine-first and avoid reopening already-landed access, channel, content, or room adoption work unless a real regression is found
- preserve all current route truth and all previously landed profile/channel, content-management, and access stages
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- reopen the broader profile/channel, content-management, or access chapters because of preference churn
- widen into Home again, profile again, channel-settings again, admin workflow tuning again, public event UI, heavier monetization rollout, audience/analytics expansion, or deeper safety/admin work
- invent creator-platform routes or `/studio*` route truth
- fake content catalogs, fake programming, or fake analytics
- create `/studio*` routes
- touch broader runtime room/live-stage behavior in this foundation lane
- touch RBAC or Rachi control-plane work
- implement event access before the live/event chapter creates canonical event truth
- broaden into screen-owner adoption or UI work
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the repo has a minimal canonical event foundation
- title publication scheduling remains separate from event truth
- runtime room tables remain separate from scheduled-event truth
- event access remains explicitly later instead of being faked
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
