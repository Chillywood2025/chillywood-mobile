# NEXT TASK

## Exact Next Task
The next exact task is a narrow **creator analytics / conversion doctrine-spec pass** on `main`. Use `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth. Start with `docs/creator-analytics-implementation-spec.md`.

## Current Plan
1. Re-read `docs/notification-reminder-implementation-spec.md`, `CURRENT_STATE.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/profile-channel-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the current profile/channel, content-management, access, live/event, and audience chapters as closed unless a real regression is found.
3. Treat the profile/channel, content-management, access, live/event, audience, and notifications/reminders chapters as closed unless a real regression is found.
4. Define the current creator analytics / conversion doctrine from existing helper and summary truth before implementing deeper analytics surfaces.
5. Keep fake profile visits, fake conversion metrics, and fake monetization funnels explicitly out until they are truly backed.

## Exact Next Batch
- create `docs/creator-analytics-implementation-spec.md`
- audit the current analytics read-model truth already exposed in `_lib/channelReadModels.ts`, `/channel-settings`, and related analytics emitters/helpers
- separate current supported analytics truth from missing aggregates, later-phase conversions, and fake reporting
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- inspect only the current creator analytics / conversion family and define its doctrine before further implementation
- preserve current route-owner truth and current helper ownership while identifying what is and is not truly backed today
- keep creator/channel audience truth, access truth, live/event truth, and notifications truth separate from unsupported analytics claims
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
- reopen notifications/reminders, push delivery, or generic inbox work unless a real regression is found
- fake profile visits, content launches, conversion funnels, or attendance aggregates
- fake VIP/mod/co-host audience logic
- reopen `/channel-settings` audience workflow work unless the doctrine pass proves a regression
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- repo truth lands a durable creator analytics / conversion doctrine spec
- current supported analytics truth is separated clearly from missing or later aggregates
- unsupported creator metrics remain explicit instead of being zeroed or fabricated
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or route drift is introduced
