# NEXT TASK

## Exact Next Task
The next exact task is a narrow creator-analytics blocker-resolution pass on `main`, using `docs/profile-channel-implementation-spec.md`, `CURRENT_STATE.md`, and this file as governing truth. Do not widen into Stage 5 UI, route proliferation, fake analytics, watch-party/live route changes, RBAC expansion, Rachi control-plane work, or unrelated screen/helpers. The audience relationship schema foundation and the owner-safe audience/safety helper summaries are now landed, so the remaining honest blocker before Stage 5 UI is canonical creator-analytics summary truth.

## Current Plan
1. Re-read `docs/profile-channel-implementation-spec.md`, `CURRENT_STATE.md`, and `NEXT_TASK.md` first.
2. Keep the lane focused on creator-analytics truth, not Stage 5 UI.
3. Prove exactly which creator analytics fields can now be derived honestly from existing room/session truth.
4. Separate what can be landed as helper-level summary reads now from what still requires backend/schema aggregation work.
5. Preserve `/profile/[userId]`, `/channel-settings`, `/chat`, `/chat/[threadId]`, and all watch-party/live route truth unchanged.
6. Keep profile visits/follows/subscriber/content aggregates honest and blocked if no real source-of-truth path exists.

## Exact Next Batch
- audit and, if safe, land the narrow creator-analytics helper summary slice implied by existing room/session truth
- keep unsupported analytics fields explicitly missing instead of fabricating them
- keep Stage 5 UI out of scope
- keep `Chi'lly Chat`, `Watch-Party Live`, and `Live Watch-Party` doctrine unchanged
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- prove the exact minimal `CreatorAnalyticsReadModel` slice that can be supported honestly now
- optionally land helper-level creator analytics reads only for room/session metrics that already exist in current schema truth
- leave profile visits, content performance, monetization conversion, and any unsupported creator aggregates blocked until real truth exists
- preserve all current route truth and all previously landed profile/channel stages
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- implement Stage 5 UI
- fake audience counts or creator analytics
- widen or redesign the new audience relationship schema unless a real proof gap is found
- treat `user_subscriptions` as creator/channel subscriber truth
- create `/studio*` routes
- touch runtime room/live-stage owners
- touch RBAC or Rachi control-plane work
- broaden into unrelated admin expansion
- broaden into other screen owners
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the repo proves exactly which creator analytics fields are now honest from current truth
- any helper summary added stays narrow and does not fake unsupported metrics
- Stage 5 UI remains blocked until unsupported aggregates are resolved
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake analytics or audience metrics are introduced
