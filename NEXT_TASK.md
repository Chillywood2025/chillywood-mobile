# NEXT TASK

## Exact Next Task
The next exact task is a narrow **notifications / reminders doctrine-spec pass** on `main`, starting with `docs/notification-reminder-implementation-spec.md`. Use `CURRENT_STATE.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/profile-channel-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth. Do not jump straight into notification UI or push delivery before the doctrine/spec pass locks current truth, missing truth, route owners, deep-link expectations, and phased implementation order.

## Current Plan
1. Re-read `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/profile-channel-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, and this file first.
2. Treat the current profile/channel, content-management, access, live/event, and audience chapters as closed unless a real regression is found.
3. Audit current notification and reminder truth across the existing event, profile/channel, chat, and admin owners without widening into full implementation.
4. Define the canonical notification/reminder doctrine, current missing truth, later-phase ideas, and phased implementation order.
5. Preserve locked route truth for `/profile/[userId]`, `/channel-settings`, Chi'lly Chat, and all current room/live owners.

## Exact Next Batch
- create `docs/notification-reminder-implementation-spec.md`
- audit what reminder-ready and notification-adjacent truth already exists across live/event, profile/channel, and chat surfaces
- define canonical notification types, deep-link ownership, and in-app truth before any delivery implementation
- keep push delivery, advanced preference systems, and discovery/marketing messaging explicitly later unless current truth already supports them
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- audit current reminder-ready event truth, chat follow-up truth, and existing route owners before proposing notification surfaces
- define the current doctrine for in-app notifications and reminders without implementing them yet
- identify the exact owners and data truth a later notification/reminder chapter should use
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
- jump into notification UI, push delivery, or reminder subscriptions before the doctrine/spec pass proves the owner truth
- fake VIP/mod/co-host audience logic
- reopen `/channel-settings` audience workflow work unless the doctrine pass proves a regression
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- repo truth clearly defines the notification/reminder chapter doctrine and phased implementation order
- notification/reminder truth is grounded in current backed event, profile, chat, and route-owner reality
- creator/channel subscriber truth stays separate from premium entitlement truth where reminders later touch access
- unsupported push, ticketed, or marketing-heavy notification behavior remains explicitly later unless real truth exists
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
