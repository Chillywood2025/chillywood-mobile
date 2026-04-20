# NEXT TASK

## Exact Next Task
The next exact task is a narrow **canonical notification/reminder data foundation pass** on `main`. Use `docs/notification-reminder-implementation-spec.md`, `CURRENT_STATE.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/profile-channel-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth. Do not widen into push delivery, fake notification inbox behavior, or reminder subscriptions beyond the minimum honest data model.

## Current Plan
1. Re-read `docs/notification-reminder-implementation-spec.md`, `CURRENT_STATE.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/profile-channel-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the current profile/channel, content-management, access, live/event, and audience chapters as closed unless a real regression is found.
3. Add only the minimum canonical foundation needed for notification records, read/dismiss state, reminder enrollment, and deep-link targets.
4. Keep reminder-ready event truth separate from reminder enrollment truth, and keep chat unread/read truth separate from a global notifications system.
5. Avoid any push provider, background delivery, or fake notification-center behavior.

## Exact Next Batch
- add the minimum canonical data truth for notifications and reminders
- cover notification records, type/category, read/dismiss state, reminder enrollment, and target/deep-link contract
- keep reminder-ready event truth and chat unread/read truth as source inputs, not replacement notification tables
- keep push delivery, advanced preference systems, and discovery/marketing messaging explicitly later unless current truth already supports them
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- add only the smallest honest schema/data layer needed for notification/reminder truth
- preserve current route-owner truth and current helper ownership while creating a new canonical notification/reminder foundation
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
- jump into notification UI, push delivery, or reminder subscriptions beyond the minimum honest enrollment/data model
- fake VIP/mod/co-host audience logic
- reopen `/channel-settings` audience workflow work unless the doctrine pass proves a regression
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- repo truth lands a minimal honest notification/reminder foundation
- notification/reminder truth is grounded in current backed event, profile, chat, moderation, access, and route-owner reality
- creator/channel subscriber truth stays separate from premium entitlement truth where reminders later touch access
- unsupported push, ticketed, or marketing-heavy notification behavior remains explicitly later unless real truth exists
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
