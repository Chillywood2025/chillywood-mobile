# NEXT TASK

## Exact Next Task
The next exact task is a narrow **channel design / layout doctrine-spec pass** on `main`. Use `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `docs/safety-moderation-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth. Start with `docs/channel-design-layout-implementation-spec.md`.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the profile/channel, content-management, access, live/event, audience, notifications/reminders, and analytics chapters as closed unless a real regression is found.
3. Treat the safety / moderation chapter as closed enough to move on unless a real regression is found.
4. Define the current channel design / layout doctrine from existing `/channel-settings`, `/profile/[userId]`, and public/channel presentation truth before implementation.
5. Keep fake freeform layout systems, route drift, and design chaos explicitly out until structure is truly backed.

## Exact Next Batch
- create `docs/channel-design-layout-implementation-spec.md`
- audit the current channel design/layout truth already exposed in `/channel-settings`, `/profile/[userId]`, and related presentation/config helpers
- separate current supported layout truth from missing or later design systems
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- inspect only the current channel design / layout family and define its doctrine before implementation
- preserve `/channel-settings` as the creator-side owner and `/profile/[userId]` as the public presentation owner
- keep creator/channel audience truth, access truth, live/event truth, notifications truth, and analytics truth separate from unsupported moderation claims
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
- fake moderation queues, strike systems, dispute workflows, trust scores, or creator safety controls that current truth does not back yet
- reopen creator analytics implementation unless the doctrine pass proves a regression
- fake VIP/mod/co-host audience logic
- reopen `/channel-settings` audience workflow work unless the doctrine pass proves a regression
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- repo truth lands a durable channel design / layout doctrine spec
- current supported channel presentation/layout truth is separated clearly from missing or later layout systems
- unsupported design systems remain explicit instead of being implied or fabricated
- `/profile/[userId]` and `/channel-settings` route truth remain unchanged
- no fake freeform layout system or route drift is introduced
- no fake future scope or route drift is introduced
