# NEXT TASK

## Exact Next Task
The next exact task is a narrow **safety / moderation workflow doctrine-spec pass** on `main`. Use `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `docs/safety-moderation-implementation-spec.md`, `docs/channel-design-layout-implementation-spec.md`, `docs/search-discovery-implementation-spec.md`, `docs/owner-admin-rachi-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the profile/channel, access, live/event, audience, notifications, analytics, moderation, design, and discovery chapters as closed unless a real regression is found.
3. Treat the Owner Admin + Rachi chapter as closed enough to move on unless a real regression is found.
4. Defer release hardening / Google Play readiness for now per explicit user priority.
5. Treat `docs/hetzner-first-deployment-implementation-spec.md` and `infra/hetzner/*.example` as deployment-planning reference only; the Hetzner side-lane now has a real hostname (`live.chillywoodstream.com`), live TLS, and an honest HTTPS placeholder edge, and the exact next infra blocker is a narrow `LiveKit ingress deployment prep`, without changing the active next product chapter.
6. Re-enter safety / moderation workflow deepening by starting from `docs/safety-moderation-implementation-spec.md` and current moderation/admin truth.
7. Stop immediately if the safety/moderation doctrine refresh would require fake moderation workflow or route drift.

## Exact Next Batch
- start with `docs/safety-moderation-implementation-spec.md`
- refresh or reaffirm the next safety / moderation workflow-deepening lane against current repo truth
- update repo-truth docs to point to the first honest safety/moderation implementation lane after that doctrine-spec pass
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- touch only the safety/moderation doctrine/spec surface family
- preserve all current route truth and all previously landed chapter ownership
- keep current product, creator, admin, and owner truths separate from unsupported moderation claims
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
- start release hardening / Google Play readiness work in this lane
- reopen notifications/reminders, push delivery, or generic inbox work unless a real regression is found
- fake moderation queues, strike systems, dispute workflows, trust scores, or creator safety controls that current truth does not back yet
- reopen creator analytics implementation unless the doctrine pass proves a regression
- fake VIP/mod/co-host audience logic
- reopen `/channel-settings` audience workflow work unless the doctrine pass proves a regression
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the next safety / moderation doctrine lane is re-established cleanly from current repo truth
- current product/admin/owner truths remain separated cleanly from unsupported moderation claims
- the landed owner bootstrap path remains secret-safe and isolated from committed client code
- unsupported or unproven moderation powers remain explicit instead of being implied or fabricated
- current public route truth remains unchanged
- no fake moderation workflow, fake safety-control claim, or route drift is introduced
