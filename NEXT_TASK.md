# NEXT TASK

## Exact Next Task
The next exact task is a narrow **creator-side safety summary normalization pass** on `main`. Use `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `docs/safety-moderation-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth. Start in `_lib/channelReadModels.ts`, switch the creator safety/admin summary onto the normalized recent queue truth from `_lib/moderation.ts`, and adopt only the smallest related summary adjustment in `/channel-settings`.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the profile/channel, content-management, access, live/event, audience, notifications/reminders, and analytics chapters as closed unless a real regression is found.
3. Treat `docs/safety-moderation-implementation-spec.md` as the active doctrine for the chapter and keep the next slice strictly inside current helper/schema/admin truth.
4. Normalize creator-side safety/admin summary onto the same helper-owned recent queue truth now used by `/admin`.
5. Keep fake enforcement workflows, fake report states, fake strike systems, assignment flow, and route drift explicitly out until they are truly backed.

## Exact Next Batch
- switch creator-side safety/admin summary from raw recent report rows to normalized recent queue truth
- adopt only the smallest related summary adjustment in `/channel-settings`
- then close out the moderation chapter if no meaningful seam remains
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- inspect only the current safety / moderation workflow family and keep the final moderation slice creator-side, summary-only, and helper-backed
- preserve current route-owner truth and current helper ownership while choosing the smallest honest creator/operator handoff slice
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
- creator-side safety/admin summary uses the normalized recent queue truth
- `/channel-settings` stays summary-only and does not become a moderation queue
- current supported moderation/admin/report truth is separated clearly from missing or later workflow systems
- unsupported moderation systems remain explicit instead of being implied or fabricated
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or route drift is introduced
