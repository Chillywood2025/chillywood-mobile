# NEXT TASK

## Exact Next Task
The next exact task is a narrow **current live/event truth audit** on `main`, using `docs/live-event-scheduling-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, `docs/access-entitlement-implementation-spec.md`, and this file as governing truth. Audit only the current live/channel/admin owners and helpers needed to prove what live/session truth, title scheduling truth, replay truth, reminder truth, and missing event truth already exist. Do not implement event access yet, and do not touch schema, routes, or public/live UI in this audit pass unless a real regression is proved.

## Current Plan
1. Re-read `docs/live-event-scheduling-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, `docs/access-entitlement-implementation-spec.md`, and this file first.
2. Treat the current profile/channel, content-management, and access-adoption families as closed unless a real regression is found.
3. Audit the current live/channel/admin owners and helpers to determine exactly what live/session truth already exists now.
4. Determine whether title-level scheduling truth can be reused or whether canonical event truth must be separate.
5. Keep event access implementation, schema changes, and UI changes out of scope for this audit lane.
6. Preserve locked semantics and route truth for `Watch-Party Live`, `Live Watch-Party`, `Live First`, `/watch-party/[partyId]`, `/watch-party/live-stage/[partyId]`, `/profile/[userId]`, and `/channel-settings`.

## Exact Next Batch
- audit current live/session truth
- audit current scheduling, replay, and reminder truth
- prove whether a minimal canonical event model can be defined safely
- confirm event access remains later until canonical event truth exists
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- audit `app/channel-settings.tsx`, `app/profile/[userId].tsx`, `app/watch-party/index.tsx`, `app/watch-party/[partyId].tsx`, `app/watch-party/live-stage/[partyId].tsx`, `_lib/watchParty.ts`, `_lib/communication.ts`, `app/admin.tsx`, and current scheduling truth only as needed
- use the new live/event spec plus current route/control-file truth to separate current live truth from missing event truth
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
- touch schema or backend ownership in this audit lane
- touch broader runtime room/live-stage behavior in this audit lane
- touch RBAC or Rachi control-plane work
- implement event access before the live/event chapter creates canonical event truth
- broaden into screen-owner adoption or UI work
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the repo records exactly what current live/session truth already exists
- the repo records what scheduling, replay, and reminder truth are still missing
- the repo ends with one clear next move for canonical event foundation work if it is safe
- event access remains explicitly later instead of being faked
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
