# NEXT TASK

## Exact Next Task
The next exact task is a narrow **creator analytics support-status normalization pass** on `main`. Use `docs/creator-analytics-implementation-spec.md`, `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth.

## Current Plan
1. Re-read `docs/creator-analytics-implementation-spec.md`, `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the profile/channel, content-management, access, live/event, audience, and notifications/reminders chapters as closed unless a real regression is found.
3. Normalize creator analytics support status on the existing read-model owner before adding any new metrics.
4. Upgrade the current creator analytics status discipline from two states to:
   - `available`
   - `missing`
   - `later`
5. Keep fake profile visits, fake conversion metrics, and fake monetization funnels explicitly out until they are truly backed.

## Exact Next Batch
- update `_lib/channelReadModels.ts` so creator analytics support-status truth distinguishes `available`, `missing`, and `later`
- update `/channel-settings` analytics summary messaging to reflect the landed support-status discipline without inventing new aggregates
- keep current backed creator metrics unchanged
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- inspect only the current creator analytics summary owner and normalize support-status truth
- preserve current route-owner truth and current helper ownership while clarifying what is and is not truly backed today
- keep creator/channel audience truth, access truth, live/event truth, and notifications truth separate from unsupported analytics claims
- avoid reopening already-landed access, audience, channel, content, room, or live/event implementation unless a real regression is found
- preserve all current route truth and all previously landed profile/channel, content-management, and access stages
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- reopen the broader profile/channel, content-management, access, live/event, or audience chapters because of preference churn
- widen into Home again, admin workflow tuning again, heavier monetization rollout, analytics expansion, or deeper safety/admin work
- invent creator-platform routes or `/studio*` route truth
- fake content catalogs, fake programming, or fake analytics
- create `/studio*` routes
- touch broader runtime room/live-stage behavior in this doctrine lane
- touch RBAC or Rachi control-plane work
- reopen notifications/reminders, push delivery, or generic inbox work unless a real regression is found
- fake profile visits, content launches, conversion funnels, or attendance aggregates
- add new creator analytics aggregates before the support-status discipline is normalized
- fake VIP/mod/co-host audience logic
- reopen `/channel-settings` audience workflow work unless the doctrine pass proves a regression
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- repo truth lands the normalized `available` / `missing` / `later` creator analytics support-status discipline
- current backed creator metrics remain unchanged
- unsupported creator metrics remain explicit instead of being zeroed or fabricated
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or route drift is introduced
