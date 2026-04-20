# NEXT TASK

## Exact Next Task
The next exact task is a narrow **safety / moderation chapter closeout and next-chapter handoff** on `main`. Use `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `docs/safety-moderation-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth. Re-audit `_lib/moderation.ts`, `_lib/channelReadModels.ts`, `app/admin.tsx`, `app/channel-settings.tsx`, and the report-entry owners, then either choose one real remaining narrow moderation seam or hand off to the channel design / layout chapter.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the profile/channel, content-management, access, live/event, audience, notifications/reminders, and analytics chapters as closed unless a real regression is found.
3. Treat `docs/safety-moderation-implementation-spec.md` as the active doctrine for the chapter and keep the next slice strictly inside current helper/schema/admin truth.
4. Re-audit whether report intake, creator-side summary, and read-only operator review now cover the honest moderation chapter boundary.
5. Keep fake enforcement workflows, fake report states, fake strike systems, assignment flow, and route drift explicitly out until they are truly backed.

## Exact Next Batch
- audit whether any meaningful narrow moderation seam still remains after helper-backed creator and operator adoption
- if none remains, close out the moderation chapter and hand off to channel design / layout
- keep broader enforcement systems explicitly later
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- inspect only the current safety / moderation workflow family and decide whether any meaningful narrow seam still remains
- preserve current route-owner truth and current helper ownership while choosing either a final moderation closeout or a justified last narrow seam
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
- the remaining moderation seams are explicitly classified as trivial, narrow, medium, or broad/risky
- the moderation chapter either closes cleanly or identifies one exact final narrow seam
- current supported moderation/admin/report truth is separated clearly from missing or later workflow systems
- unsupported moderation systems remain explicit instead of being implied or fabricated
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or route drift is introduced
