# NEXT TASK

## Exact Next Task
The next exact task is a narrow **Explore discovery adoption pass** on `main`. Use `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/channel-design-layout-implementation-spec.md`, `docs/search-discovery-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file as governing truth.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/profile-channel-implementation-spec.md`, `docs/access-entitlement-implementation-spec.md`, `docs/live-event-scheduling-implementation-spec.md`, `docs/audience-management-implementation-spec.md`, `docs/notification-reminder-implementation-spec.md`, `docs/creator-analytics-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat Home and public profile/channel discovery truth as already backed unless a real regression is found.
3. Adopt existing title-programming discovery truth inside `app/(tabs)/explore.tsx` without inventing search sophistication or recommendation logic.
4. Keep discovery MVP-only and explicitly defer advanced personalization unless current truth supports more.
5. Keep fake recommendation logic, route drift, discovery sprawl, and fake search sophistication explicitly out until structure is truly backed.

## Exact Next Batch
- update `app/(tabs)/explore.tsx` to consume current title-programming discovery truth instead of acting like a raw latest-title dump
- use only already-backed discovery signals such as `featured`, `is_trending`, `pin_to_top_row`, `sort_order`, and real live cues already derivable from current title/watch-party truth
- keep Home, `/profile/[userId]`, title/player, and live/event route ownership unchanged
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- inspect only the current Explore discovery owner and the existing discovery truth it should consume
- preserve Home as the primary discovery owner and `/profile/[userId]` as the public creator/channel discovery owner
- keep current title-programming truth and live cues separate from unsupported recommendation claims
- avoid reopening already-landed access, audience, channel, content, room, live/event, analytics, safety, or design implementation unless a real regression is found
- preserve all current route truth and all previously landed profile/channel, content-management, and access stages
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- reopen the broader profile/channel, content-management, access, live/event, audience, notifications, analytics, safety, or design chapters because of preference churn
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
- Explore consumes current backed discovery truth instead of presenting a raw latest-title list
- current supported discovery truth stays clearly separated from missing or later recommendation systems
- unsupported discovery/recommendation systems remain explicit instead of being implied or fabricated
- current public route truth remains unchanged
- no fake recommendation engine or route drift is introduced
