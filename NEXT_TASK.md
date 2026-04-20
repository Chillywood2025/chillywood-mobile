# NEXT TASK

## Exact Next Task
The next exact task is a narrow **notifications/reminders chapter closeout audit** on `main`. Use `docs/notification-reminder-implementation-spec.md`, `CURRENT_STATE.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/profile-channel-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth. Do not widen into push delivery, fake notification inbox behavior, or a generic notification center.

## Current Plan
1. Re-read `docs/notification-reminder-implementation-spec.md`, `CURRENT_STATE.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/profile-channel-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the current profile/channel, content-management, access, live/event, and audience chapters as closed unless a real regression is found.
3. Audit the landed notification/reminder foundation, helper layer, and first surface adoption together before choosing any additional work.
4. Keep reminder-ready event truth separate from reminder enrollment truth, and keep chat unread/read truth separate from a global notifications system.
5. Avoid any push provider, background delivery, fake notification-center behavior, or fake preference rollout.

## Exact Next Batch
- audit the landed `notifications` and `event_reminders` foundation, `_lib/notifications.ts`, `/channel-settings`, `/profile/[userId]`, and current chat/live owners together
- determine whether any meaningful narrow notification/reminder seam still remains
- keep reminder-ready event truth and chat unread/read truth as source inputs, not replacement notification tables
- keep push delivery, advanced preference systems, chat inbox redesign, and generic notification-center behavior explicitly later unless the audit proves otherwise
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- inspect only the landed notification/reminder family and decide whether the chapter is complete enough to move on
- preserve current route-owner truth and current helper ownership while checking for any last narrow seam
- keep notification categories and targets aligned with the landed doctrine
- keep the lane doctrine-first and avoid reopening already-landed access, audience, channel, content, room, or live/event implementation unless a real regression is found
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
- jump into notification UI, push delivery, or reminder behavior beyond the landed enrollment/data model
- fake VIP/mod/co-host audience logic
- reopen `/channel-settings` audience workflow work unless the doctrine pass proves a regression
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- repo truth clearly decides whether the notifications/reminders chapter has one last narrow batch or is complete enough to hand off
- notification/reminder truth remains grounded in current backed event, profile, chat, moderation, access, and route-owner reality
- creator/channel subscriber truth stays separate from premium entitlement truth where reminders later touch access
- unsupported push, ticketed, or marketing-heavy notification behavior remains explicitly later unless real truth exists
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or route drift is introduced
