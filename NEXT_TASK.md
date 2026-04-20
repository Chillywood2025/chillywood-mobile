# NEXT TASK

## Exact Next Task
The next exact task is a narrow **current channel design / layout truth audit** on `main`. Use `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `docs/safety-moderation-implementation-spec.md`, `docs/channel-design-layout-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth. Audit `app/channel-settings.tsx`, `app/profile/[userId].tsx`, `_lib/appConfig.ts`, and any directly related presentation/config helpers before deciding whether a narrow structured design/layout slice is honestly supported.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the profile/channel, content-management, access, live/event, audience, notifications/reminders, analytics, and safety/moderation chapters as closed unless a real regression is found.
3. Treat `docs/channel-design-layout-implementation-spec.md` as the active doctrine for the chapter.
4. Audit current creator/public design/layout truth before building any structured slice.
5. Keep fake freeform layout systems, route drift, and design chaos explicitly out until structure is truly backed.

## Exact Next Batch
- audit the current channel design/layout truth already exposed in `/channel-settings`, `/profile/[userId]`, and related presentation/config helpers
- determine whether one narrow structured design/layout slice is honestly supported now
- separate current supported layout truth from missing or later design systems
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- inspect only the current channel design / layout family and determine what is already truly backed
- preserve `/channel-settings` as the creator-side owner and `/profile/[userId]` as the public presentation owner
- keep creator/channel audience truth, access truth, live/event truth, notifications truth, analytics truth, and safety truth separate from unsupported design claims
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
- the current design/layout truth audit is explicit about what is already real and what is still missing
- the next design/layout implementation decision is grounded in current config/profile/channel truth
- current supported channel presentation/layout truth is separated clearly from missing or later layout systems
- unsupported design systems remain explicit instead of being implied or fabricated
- `/profile/[userId]` and `/channel-settings` route truth remain unchanged
- no fake freeform layout system or route drift is introduced
- no fake future scope or route drift is introduced
