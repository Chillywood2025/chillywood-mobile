# NEXT TASK

## Exact Next Task
The next exact task is a narrow **owner admin + Rachi Control doctrine-spec pass** on `main`. Use `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `docs/safety-moderation-implementation-spec.md`, `docs/channel-design-layout-implementation-spec.md`, `docs/search-discovery-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth. Start with `docs/owner-admin-rachi-implementation-spec.md`.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the profile/channel, access, live/event, audience, notifications, analytics, moderation, design, and discovery chapters as closed unless a real regression is found.
3. Define current doctrine for owner authority, admin workflow, staff-role separation, Rachi control, and emergency owner controls before implementation.
4. Keep owner authority explicitly above Rachi and keep creator-facing routes separate from admin-facing routes.
5. Keep fake admin controls, fake Rachi powers, insecure owner bootstrap handling, and route drift out.

## Exact Next Batch
- create `docs/owner-admin-rachi-implementation-spec.md`
- audit the current admin, moderation, official-account, and control-plane truth already present in `/admin`, `_lib/moderation.ts`, current role-aware helpers, and related operator surfaces
- separate current honest admin/owner truth from later-phase Rachi automation and staff-role expansion
- keep unrelated local dirt out of the checkpoint
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- inspect only the current owner/admin/Rachi-control family
- preserve all current route truth and all previously landed chapter ownership
- keep owner-only truth, admin truth, and Rachi truth clearly separated
- avoid reopening already-landed access, audience, discovery, analytics, safety, or design implementation unless a real regression is found
- preserve all current route truth and all previously landed profile/channel, content-management, and access stages
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- reopen the broader profile/channel, content-management, access, live/event, audience, notifications, analytics, safety, design, or discovery chapters because of preference churn
- widen into new product systems outside the owner/admin/Rachi-control chapter
- invent creator-platform routes or `/studio*` route truth
- fake content catalogs, fake programming, or fake analytics
- create `/studio*` routes
- touch broader runtime room/live-stage behavior in this doctrine lane
- fake owner bootstrap, fake emergency controls, or fake Rachi automation powers
- reopen notifications/reminders, push delivery, or generic inbox work unless a real regression is found
- fake moderation queues, strike systems, dispute workflows, trust scores, or creator safety controls that current truth does not back yet
- reopen creator analytics implementation unless the doctrine pass proves a regression
- fake VIP/mod/co-host audience logic
- reopen `/channel-settings` audience workflow work unless the doctrine pass proves a regression
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- repo truth lands a durable owner-admin / Rachi doctrine spec
- owner authority, admin workflow, and Rachi-control boundaries are separated clearly from later automation or staffing ideas
- unsupported or unproven admin/Rachi powers remain explicit instead of being implied or fabricated
- current public route truth remains unchanged
- no fake admin control, fake Rachi power, or route drift is introduced
