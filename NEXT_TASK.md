# NEXT TASK

## Exact Next Task
The next exact task is a narrow **owner / super-admin foundation pass** on `main`. Use `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `docs/safety-moderation-implementation-spec.md`, `docs/channel-design-layout-implementation-spec.md`, `docs/search-discovery-implementation-spec.md`, `docs/owner-admin-rachi-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the profile/channel, access, live/event, audience, notifications, analytics, moderation, design, and discovery chapters as closed unless a real regression is found.
3. Add only the minimum owner/super-admin role and gate truth the current architecture can honestly support.
4. Implement only a safe isolated owner bootstrap path that keeps raw credentials out of committed source, docs, and client bundles.
5. Keep owner authority explicitly above Rachi and keep creator-facing routes separate from admin-facing routes.
6. Keep fake admin controls, fake Rachi powers, insecure owner bootstrap handling, and route drift out.

## Exact Next Batch
- land the minimum first-class owner role truth needed for the bounded admin architecture
- add owner-aware gate truth where the current moderation/admin helpers already support it
- add a safe isolated bootstrap path for the initial owner account that reads sensitive credentials only from runtime input or environment
- keep broader staff-role assignment, Rachi control-plane state, emergency controls, and fake admin powers explicitly later
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- touch only the current owner/admin/Rachi-control foundation family
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
- reopen notifications/reminders, push delivery, or generic inbox work unless a real regression is found
- fake moderation queues, strike systems, dispute workflows, trust scores, or creator safety controls that current truth does not back yet
- reopen creator analytics implementation unless the doctrine pass proves a regression
- fake VIP/mod/co-host audience logic
- reopen `/channel-settings` audience workflow work unless the doctrine pass proves a regression
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the owner / super-admin foundation lands only the minimum safe role and gate truth the current architecture supports
- the initial owner bootstrap path exists without raw credentials entering committed source, docs, or client bundles
- owner authority, admin workflow, and Rachi-control boundaries remain separated clearly from later automation or staffing ideas
- unsupported or unproven admin/Rachi powers remain explicit instead of being implied or fabricated
- current public route truth remains unchanged
- no fake admin control, fake Rachi power, or route drift is introduced
