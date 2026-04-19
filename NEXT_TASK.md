# NEXT TASK

## Exact Next Task
The next exact task is Stage 3 implementation of the `/channel-settings` studio-equivalent expansion on `main`, using `docs/profile-channel-implementation-spec.md` as the governing implementation reference. Do not widen into access/monetization rollout, `/studio*` route creation, schema work, remote DB state changes, watch-party/live route changes, RBAC, Rachi control-plane expansion, or unrelated screen/helpers in this lane. Stages 1 and 2 are now landed, so the next safe step is to make `app/channel-settings.tsx` read as the current structured creator control center for Identity, Design, Layout, and Content while preserving `/profile/[userId]` as the canonical public/owner surface and preserving `/channel-settings` as the current studio-equivalent route.

## Current Plan
1. Re-read `docs/profile-channel-implementation-spec.md`, `CURRENT_STATE.md`, and `NEXT_TASK.md` first.
2. Keep the canonical owner on `app/channel-settings.tsx`.
3. Expand the route into the current studio-equivalent section architecture for Identity, Design, Layout, and Content.
4. Preserve `/profile/[userId]` as the shared public + owner identity/channel surface.
5. Keep `/chat` / `/chat/[threadId]` and all watch-party/live route truth unchanged.
6. Keep live schema unchanged and do not create `/studio*` routes in this lane.
7. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- implement Stage 3 `/channel-settings` structure work from `docs/profile-channel-implementation-spec.md`
- keep the owner route on `app/channel-settings.tsx`
- add current-structure sections for Identity, Design, Layout, and Content without route drift
- preserve the public + owner unified profile/channel surface from Stages 1 and 2
- preserve `Chi'lly Chat`, `Watch-Party Live`, and `Live Watch-Party` doctrine
- keep live schema unchanged
- do not write or apply feature migrations
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- implement Stage 3 `/channel-settings` expansion
- keep the canonical route owner on `app/channel-settings.tsx`
- add current creator-control sections for Identity, Design, Layout, and Content
- preserve the Stage 1 and Stage 2 profile/channel foundation on `app/profile/[userId].tsx`
- preserve `/channel-settings` as the current studio-equivalent owner
- preserve `/chat` and `/chat/[threadId]` as canonical Chi'lly Chat routes
- preserve the landed typed foundation and helper/screen work
- avoid live schema changes in this lane
- avoid new feature migration writes or applies in this lane
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- touch access/monetization rollout yet
- create `/studio*` routes
- touch runtime room/live-stage owners
- touch RBAC or Rachi control-plane work
- broaden into admin expansion
- broaden into other screen owners
- write or apply new feature migrations
- change remote DB state
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `app/channel-settings.tsx` clearly reads as the current studio-equivalent control center
- Identity, Design, Layout, and Content sections are present on the existing route
- `/profile/[userId]` remains the separate shared public + owner surface
- `/channel-settings` remains the separate studio-equivalent owner route
- `/chat` and `/chat/[threadId]` remain the canonical communication handoff owners
- locked `Watch-Party Live` and `Live Watch-Party` semantics remain intact
- live schema remains unchanged
- no route proliferation, schema work, feature migrations, or unrelated runtime refactors are introduced in that implementation lane
