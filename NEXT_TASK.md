# NEXT TASK

## Exact Next Task
The next exact task is a narrow **live/event helper read/write model pass** on `main`, starting with `_lib/liveEvents.ts` and the newly landed `creator_events` schema truth. Use `docs/live-event-scheduling-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, `supabase/database.types.ts`, and this file as governing truth. Do not implement event access yet, do not widen into public event UI, and do not drift current route doctrine.

## Current Plan
1. Re-read `docs/live-event-scheduling-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, `supabase/database.types.ts`, and this file first.
2. Treat the current profile/channel, content-management, and access-adoption families as closed unless a real regression is found.
3. Create `_lib/liveEvents.ts` as the narrow helper owner for `creator_events`.
4. Keep the helper layer grounded in the landed event model only: create/update events, creator event summaries, public event summaries, replay availability, and reminder-ready reads.
5. Keep event access implementation and public UI adoption out of scope in this helper lane.
6. Preserve locked semantics and route truth for `Watch-Party Live`, `Live Watch-Party`, `Live First`, `/watch-party/[partyId]`, `/watch-party/live-stage/[partyId]`, `/profile/[userId]`, and `/channel-settings`.

## Exact Next Batch
- create `_lib/liveEvents.ts`
- implement narrow create/update/read helpers over `creator_events`
- support creator summaries, public summaries, replay availability reads, and reminder-ready reads
- keep helper APIs narrow and grounded in the landed event model
- confirm event access remains later until canonical event truth exists
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- add one narrow helper owner for the new event model
- use the landed `creator_events` truth without reopening title scheduling or runtime room tables
- keep helper reads honest for replay/reminder-ready state without faking event access or analytics
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
- touch broader runtime room/live-stage behavior in this helper lane
- touch RBAC or Rachi control-plane work
- implement event access before the live/event chapter creates canonical event truth
- broaden into screen-owner adoption or UI work
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `_lib/liveEvents.ts` exists as the narrow event helper owner
- helper reads/writes are grounded in the landed event model
- title publication scheduling remains separate from event truth
- runtime room tables remain separate from scheduled-event truth
- event access remains explicitly later instead of being faked
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
