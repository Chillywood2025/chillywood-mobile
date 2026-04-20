# NEXT TASK

## Exact Next Task
The next exact task is a narrow **Owner Admin + Rachi chapter closeout audit** on `main`. Use `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `docs/safety-moderation-implementation-spec.md`, `docs/channel-design-layout-implementation-spec.md`, `docs/search-discovery-implementation-spec.md`, `docs/owner-admin-rachi-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the profile/channel, access, live/event, audience, notifications, analytics, moderation, design, and discovery chapters as closed unless a real regression is found.
3. Audit whether the landed owner/super-admin foundation, bounded admin dashboard, Rachi Control basics, and new staff/audit visibility slice leave any meaningful narrow owner-admin seam.
4. Keep actual owner bootstrap execution as a secure local follow-up unless service-role env is intentionally supplied outside repo code.
5. Keep owner authority above Rachi and keep creator-facing routes separate from admin-facing routes.
6. Stop immediately if the remaining owner/admin surfaces still require fake data or unbacked workflows.

## Exact Next Batch
- determine whether the chapter is now complete enough to move on or still has one final trivial/narrow owner-admin seam
- implement only that one final narrow seam if it is already backed and clearly justified
- otherwise close the chapter honestly and hand off to the next grounded chapter
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
- pretend that identity-level Rachi truth already means a live automation queue or rule engine
- fake support queues, fake refunds/disputes, fake staff-role management, fake admin analytics, or fake audit systems
- reopen notifications/reminders, push delivery, or generic inbox work unless a real regression is found
- fake moderation queues, strike systems, dispute workflows, trust scores, or creator safety controls that current truth does not back yet
- reopen creator analytics implementation unless the doctrine pass proves a regression
- fake VIP/mod/co-host audience logic
- reopen `/channel-settings` audience workflow work unless the doctrine pass proves a regression
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the closeout audit identifies whether any meaningful narrow owner-admin seam still remains
- owner authority, admin workflow, and Rachi-control boundaries remain separated clearly from later automation or staffing ideas
- unsupported support, staffing, monetization, and analytics powers remain explicit instead of implied
- the landed owner bootstrap path remains secret-safe and isolated from committed client code
- unsupported or unproven admin/Rachi powers remain explicit instead of being implied or fabricated
- current public route truth remains unchanged
- no fake admin control, fake Rachi power, or route drift is introduced
