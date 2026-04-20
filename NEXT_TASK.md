# NEXT TASK

## Exact Next Task
The next exact task is a narrow **audience management doctrine-spec pass** on `main`, starting with `docs/audience-management-implementation-spec.md`. Use `docs/profile-channel-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, `_lib/channelReadModels.ts`, `app/channel-settings.tsx`, and this file as governing truth. Do not implement the whole audience system yet, do not widen into analytics or deeper moderation workflows, and do not drift current route doctrine.

## Current Plan
1. Re-read `docs/live-event-scheduling-implementation-spec.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, `CURRENT_STATE.md`, `_lib/liveEvents.ts`, and this file first.
2. Treat the current profile/channel, content-management, and access-adoption families as closed unless a real regression is found.
3. Audit the current audience-management truth already landed from the profile/channel chapter: followers, creator/channel subscribers, pending requests, blocked audience, visibility defaults, and summary read models.
4. Define the current doctrine, missing workflow truth, and phased implementation order for the audience-management chapter.
5. Preserve locked route truth for `/profile/[userId]`, `/channel-settings`, Chi'lly Chat, and all current room/live owners.

## Exact Next Batch
- create the first durable audience-management implementation spec
- define the current audience truth already backed by schema and read models
- define the missing creator-facing management workflows for followers, subscribers, requests, and blocked audience
- choose the exact first implementation lane for the audience chapter after the spec lands
- keep unrelated local dirt out of the checkpoint
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- create `docs/audience-management-implementation-spec.md`
- audit current audience truth across the landed relationship tables, helper read models, and existing `/channel-settings` / `/profile/[userId]` summaries
- separate current doctrine, missing workflow truth, and later-phase audience ideas clearly
- identify the single next narrow audience-management implementation lane after the spec
- keep the lane doctrine-first and avoid reopening already-landed access, channel, content, or room adoption work unless a real regression is found
- preserve all current route truth and all previously landed profile/channel, content-management, and access stages
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- reopen the broader profile/channel, content-management, or access chapters because of preference churn
- widen into Home again, admin workflow tuning again, heavier monetization rollout, audience/analytics expansion, or deeper safety/admin work
- invent creator-platform routes or `/studio*` route truth
- fake content catalogs, fake programming, or fake analytics
- create `/studio*` routes
- touch broader runtime room/live-stage behavior in this doctrine lane
- touch RBAC or Rachi control-plane work
- implement follower/subscriber/block management workflows yet
- broaden into screen-owner adoption or UI work
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `docs/audience-management-implementation-spec.md` exists and is durable
- current audience truth is clearly separated from missing workflow truth and later-phase audience ideas
- the next exact audience-management implementation lane is grounded and singular
- `/profile/[userId]`, `/channel-settings`, `/chat`, and live/watch-party route truth remain unchanged
- no fake future scope or schema drift is introduced
