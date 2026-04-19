# NEXT TASK

## Exact Next Task
The next exact task is Stage 4 implementation of the profile/channel access & monetization layer on `main`, using `docs/profile-channel-implementation-spec.md` as the governing implementation reference. Do not widen into audience/analytics/safety rollout, `/studio*` route creation, schema work, remote DB state changes, watch-party/live route changes, RBAC, Rachi control-plane expansion, or unrelated screen/helpers in this lane. Stages 1 through 3 are now landed, so the next safe step is to make public access rules visibly coherent on `/profile/[userId]` and expand `/channel-settings` with the current access-and-monetization section language that the repo already supports, without inventing unsupported backend behavior.

## Current Plan
1. Re-read `docs/profile-channel-implementation-spec.md`, `CURRENT_STATE.md`, and `NEXT_TASK.md` first.
2. Keep the canonical owners on `app/profile/[userId].tsx` and `app/channel-settings.tsx`.
3. Make public-facing access rules visible and coherent on the profile/channel surface without changing route truth.
4. Expand `/channel-settings` with current access and monetization section framing that matches existing helper truth.
5. Preserve `/chat` / `/chat/[threadId]` and all watch-party/live route truth unchanged.
6. Keep live schema unchanged and do not create `/studio*` routes in this lane.
7. Stop honestly if the stage requires unsupported backend/schema behavior.

## Exact Next Batch
- implement Stage 4 access-and-monetization surface work from `docs/profile-channel-implementation-spec.md`
- keep the canonical route owners on `app/profile/[userId].tsx` and `app/channel-settings.tsx`
- make access rules visible and coherent for public profile/channel visitors
- add `/channel-settings` section framing for access and monetization without route drift
- preserve `Chi'lly Chat`, `Watch-Party Live`, and `Live Watch-Party` doctrine
- keep live schema unchanged
- do not write or apply feature migrations
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- implement Stage 4 access and monetization surface work
- keep the canonical route owners on `app/profile/[userId].tsx` and `app/channel-settings.tsx`
- add visible access-state and monetization framing only where current repo truth already supports it
- preserve the Stage 1 and Stage 2 profile/channel foundation on `app/profile/[userId].tsx`
- preserve the Stage 3 `/channel-settings` control-center structure
- preserve `/channel-settings` as the current studio-equivalent owner
- preserve `/chat` and `/chat/[threadId]` as canonical Chi'lly Chat routes
- preserve the landed typed foundation and helper/screen work
- avoid live schema changes in this lane
- avoid new feature migration writes or applies in this lane
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- invent unsupported purchase/backend behavior
- create `/studio*` routes
- touch runtime room/live-stage owners beyond preserving current access semantics already visible from profile
- touch RBAC or Rachi control-plane work
- broaden into admin expansion
- broaden into other screen owners
- write or apply new feature migrations
- change remote DB state
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `/profile/[userId]` makes public/private/subscriber/mixed access rules visibly coherent where current helper truth supports them
- `/channel-settings` contains clear Access & Monetization section framing on the current route
- `/profile/[userId]` remains the separate shared public + owner surface
- `/channel-settings` remains the separate studio-equivalent owner route
- `/chat` and `/chat/[threadId]` remain the canonical communication handoff owners
- locked `Watch-Party Live` and `Live Watch-Party` semantics remain intact
- live schema remains unchanged
- no route proliferation, schema work, feature migrations, or unrelated runtime refactors are introduced in that implementation lane
