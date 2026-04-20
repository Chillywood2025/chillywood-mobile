# NEXT TASK

## Exact Next Task
The next exact task is a narrow **safety / moderation workflow doctrine-spec pass** on `main`. Use `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth. Start with `docs/safety-moderation-implementation-spec.md`.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the profile/channel, content-management, access, live/event, audience, notifications/reminders, and analytics chapters as closed unless a real regression is found.
3. Define the current safety / moderation workflow doctrine from existing helper, schema, admin, and channel-summary truth before implementing deeper workflow surfaces.
4. Preserve current admin, report-intake, official-account, and channel safety summary truth while separating current supported workflow from later moderation systems.
5. Keep fake enforcement workflows, fake report states, fake strike systems, and route drift explicitly out until they are truly backed.

## Exact Next Batch
- create `docs/safety-moderation-implementation-spec.md`
- audit the current safety/moderation truth already exposed in `_lib/moderation.ts`, `app/admin.tsx`, `/channel-settings`, profile/report-entry owners, and existing official-account protections
- separate current supported workflow truth from missing or later moderation systems
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- inspect only the current safety / moderation workflow family and define its doctrine before further implementation
- preserve current route-owner truth and current helper ownership while clarifying what is and is not truly backed today
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
- repo truth lands a durable safety / moderation workflow doctrine spec
- current supported moderation/admin/report truth is separated clearly from missing or later workflow systems
- unsupported moderation systems remain explicit instead of being implied or fabricated
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or route drift is introduced
