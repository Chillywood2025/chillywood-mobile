# NEXT TASK

## Exact Next Task
The next exact task is a narrow **current notification/reminder truth audit** on `main`. Use `docs/notification-reminder-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/profile-channel-implementation-spec.md`, `CURRENT_STATE.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth. Do not jump straight into notification UI, push delivery, or reminder enrollment implementation until the audit proves the minimum honest data foundation and helper ownership are safe.

## Current Plan
1. Re-read `docs/notification-reminder-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/profile-channel-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, and this file first.
2. Treat the current profile/channel, content-management, access, live/event, and audience chapters as closed unless a real regression is found.
3. Audit current notification and reminder truth across analytics emitters, chat owners, live/event helpers, creator/public event surfaces, and moderation/access sources.
4. Determine what is real notification/reminder truth versus event emission or local runtime feedback only.
5. Decide whether a minimal canonical data foundation is safe to implement next without faking delivery or route behavior.

## Exact Next Batch
- audit what reminder-ready and notification-adjacent truth already exists across live/event, profile/channel, chat, moderation/admin, and monetization surfaces
- separate real notification/reminder truth from analytics emission and runtime-only feedback
- determine whether notifications, read/dismiss state, reminder enrollment, and deep-link contract need minimal new foundation
- keep push delivery, advanced preference systems, and discovery/marketing messaging explicitly later unless current truth already supports them
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- audit current reminder-ready event truth, chat unread/read truth, moderation/admin source truth, and monetization/access outcome truth before proposing notification surfaces
- identify the exact source-of-truth gaps that still block honest notification/reminder behavior
- prove whether the minimum canonical data foundation can be added safely next
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
- jump into notification UI, push delivery, or reminder subscriptions before the audit proves the owner truth
- fake VIP/mod/co-host audience logic
- reopen `/channel-settings` audience workflow work unless the doctrine pass proves a regression
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- repo truth clearly identifies what notification/reminder truth already exists and what is still missing
- notification/reminder truth is grounded in current backed event, profile, chat, moderation, access, and route-owner reality
- creator/channel subscriber truth stays separate from premium entitlement truth where reminders later touch access
- unsupported push, ticketed, or marketing-heavy notification behavior remains explicitly later unless real truth exists
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
