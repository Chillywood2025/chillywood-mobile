# NEXT TASK

## Exact Next Task
The next exact task is a narrow **Owner Admin basics pass** on `main`. Use `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `docs/safety-moderation-implementation-spec.md`, `docs/channel-design-layout-implementation-spec.md`, `docs/search-discovery-implementation-spec.md`, `docs/owner-admin-rachi-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the profile/channel, access, live/event, audience, notifications, analytics, moderation, design, and discovery chapters as closed unless a real regression is found.
3. Keep the new owner foundation narrow and use it only to expose the smallest honest bounded admin sections now backed by current truth.
4. Treat actual owner bootstrap execution as a secure local follow-up unless service-role env is intentionally supplied outside repo code.
5. Keep owner authority explicitly above Rachi and keep creator-facing routes separate from admin-facing routes.
6. Keep fake admin controls, fake Rachi powers, insecure owner bootstrap handling, and route drift out.

## Exact Next Batch
- shape `/admin` into the smallest honest bounded Owner Admin surface using only current truth already backed by moderation, content/programming, creator-permission, and config sources
- prioritize real sections for Admin Dashboard, Reports, Content, Creators, Live & Rooms, and basic audit-oriented visibility where the current data already exists
- keep owner-only powers, staff-role assignment, Rachi controls, and emergency/system controls explicitly separate until they are truly backed
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- touch only the current owner/admin/Rachi-control surface family
- preserve all current route truth and all previously landed chapter ownership
- keep owner-only truth, admin truth, and Rachi truth clearly separated
- avoid reopening already-landed access, audience, discovery, analytics, safety, or design implementation unless a real regression is found
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- reopen the broader profile/channel, content-management, access, live/event, audience, notifications, analytics, safety, design, or discovery chapters because of preference churn
- widen into new product systems outside the owner/admin/Rachi-control chapter
- invent creator-platform routes or `/studio*` route truth
- fake content catalogs, fake programming, or fake analytics
- create `/studio*` routes
- touch broader runtime room/live-stage behavior in this doctrine lane
- hardcode or expose the owner bootstrap password in committed source, docs, or client bundles
- fake owner bootstrap, fake emergency controls, or fake Rachi automation powers
- widen `/admin` into a messy god-panel or leak owner-only controls to general roles
- reopen notifications/reminders, push delivery, or generic inbox work unless a real regression is found
- fake moderation queues, strike systems, dispute workflows, trust scores, or creator safety controls that current truth does not back yet
- reopen creator analytics implementation unless the doctrine pass proves a regression
- fake VIP/mod/co-host audience logic
- reopen `/channel-settings` audience workflow work unless the doctrine pass proves a regression
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `/admin` exposes only real bounded admin sections backed by current moderation, content, creator-permission, and config truth
- owner authority, admin workflow, and Rachi-control boundaries remain separated clearly from later automation or staffing ideas
- the landed owner bootstrap path remains secret-safe and isolated from committed client code
- unsupported or unproven admin/Rachi powers remain explicit instead of being implied or fabricated
- current public route truth remains unchanged
- no fake admin control, fake Rachi power, or route drift is introduced
