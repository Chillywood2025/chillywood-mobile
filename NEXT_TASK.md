# NEXT TASK

## Exact Next Task
The next exact task is a narrow **release-readiness doctrine-spec pass** on `main`. Use `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `docs/safety-moderation-implementation-spec.md`, `docs/channel-design-layout-implementation-spec.md`, `docs/search-discovery-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth. Start with `docs/release-hardening-implementation-spec.md`.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the profile/channel, access, live/event, audience, notifications, analytics, moderation, design, and discovery chapters as closed unless a real regression is found.
3. Define current release-readiness truth before implementation.
4. Separate must-have release blockers from can-ship-later work honestly.
5. Keep fake release-readiness claims, fake policy compliance claims, and fake Google Play readiness out.

## Exact Next Batch
- create `docs/release-hardening-implementation-spec.md`
- audit current release-readiness truth across settings/legal/support, unfinished feature gating, monetization honesty, moderation basics, onboarding/auth stability, and creator/public surface stability
- separate must-have release blockers from later improvements
- keep unrelated local dirt out of the checkpoint
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- inspect only the current release-hardening / Google Play readiness family
- preserve all current route truth and all previously landed chapter ownership
- keep must-have release blockers separate from can-ship-later polish
- avoid reopening already-landed access, audience, discovery, analytics, safety, or design implementation unless a real regression is found
- preserve all current route truth and all previously landed profile/channel, content-management, and access stages
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- reopen the broader profile/channel, content-management, access, live/event, audience, notifications, analytics, safety, design, or discovery chapters because of preference churn
- widen into new product systems during release hardening
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
- repo truth lands a durable release-hardening doctrine spec
- current release blockers are separated clearly from later polish
- unsupported or unproven release claims remain explicit instead of being implied or fabricated
- current public route truth remains unchanged
- no fake release-readiness claim or route drift is introduced
