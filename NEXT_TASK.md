# NEXT TASK

## Exact Next Task
The next exact task is a narrow **search / discovery / recommendation doctrine-spec pass** on `main`. Use `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `docs/safety-moderation-implementation-spec.md`, `docs/channel-design-layout-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth. Start with `docs/search-discovery-implementation-spec.md`.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the profile/channel, content-management, access, live/event, audience, notifications/reminders, analytics, safety/moderation, and design/layout chapters as closed unless a real regression is found.
3. Define the current search / discovery / recommendation doctrine from existing public routes and helpers before implementation.
4. Keep discovery MVP-only and explicitly defer advanced personalization unless current truth supports more.
5. Keep fake recommendation logic, route drift, and discovery sprawl explicitly out until structure is truly backed.

## Exact Next Batch
- create `docs/search-discovery-implementation-spec.md`
- audit the current discovery truth already exposed in Home, public profile/channel, title/player, and live/event public surfaces
- separate current supported discovery truth from missing or later recommendation systems
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- inspect only the current search / discovery / recommendation family and define its doctrine before implementation
- preserve existing public route ownership while clarifying what discovery already exists
- keep creator/channel audience truth, access truth, live/event truth, notifications truth, analytics truth, safety truth, and design truth separate from unsupported discovery claims
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
- repo truth lands a durable search / discovery / recommendation doctrine spec
- current supported discovery truth is separated clearly from missing or later recommendation systems
- unsupported discovery/recommendation systems remain explicit instead of being implied or fabricated
- current public route truth remains unchanged
- no fake recommendation engine or route drift is introduced
