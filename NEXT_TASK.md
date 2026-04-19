# NEXT TASK

## Exact Next Task
The next exact task is Stage 2 implementation of owner mode on the same canonical `/profile/[userId]` route on `main`, using `docs/profile-channel-implementation-spec.md` as the governing implementation reference. Do not widen into `/channel-settings` expansion, profile/channel monetization rollout, `/studio*` route creation, schema work, remote DB state changes, watch-party/live route changes, RBAC, Rachi control-plane expansion, or unrelated screen/helpers in this lane. Stage 1's unified public profile/channel surface is now landed, so the next safe step is to add owner-only stats, quick actions, and setup prompts on the same canonical profile/channel route while preserving the public visitor surface and preserving `/channel-settings` as the studio-equivalent destination.

## Current Plan
1. Re-read `docs/profile-channel-implementation-spec.md`, `CURRENT_STATE.md`, and `NEXT_TASK.md` first.
2. Keep the canonical route owner on `app/profile/[userId].tsx`.
3. Add owner-only stats ribbon, owner quick actions, and owner setup prompts on the same route.
4. Preserve the newly landed public tabbed profile/channel foundation for visitor mode.
5. Keep `/channel-settings` as the separate studio-equivalent control center and keep `/chat` / `/chat/[threadId]` as the canonical communication owners.
6. Keep live schema unchanged and do not create `/studio*` routes in this lane.
7. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- implement Stage 2 owner-mode work from `docs/profile-channel-implementation-spec.md`
- keep the owner route on `app/profile/[userId].tsx`
- add owner-only stats, quick actions, and setup prompts without splitting route truth
- preserve the public unified profile/channel surface from Stage 1
- preserve `Chi'lly Chat`, `Watch-Party Live`, and `Live Watch-Party` doctrine
- keep live schema unchanged
- do not write or apply feature migrations
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- implement Stage 2 owner mode on the same canonical route
- keep the canonical public route on `app/profile/[userId].tsx`
- preserve the Stage 1 public tabbed foundation
- preserve `/channel-settings` as the current studio-equivalent owner
- preserve `/chat` and `/chat/[threadId]` as canonical Chi'lly Chat routes
- preserve the landed typed foundation and helper/screen work
- avoid live schema changes in this lane
- avoid new feature migration writes or applies in this lane
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- touch `/channel-settings` expansion yet
- create `/studio*` routes
- touch runtime room/live-stage owners unless the profile surface needs an already-canonical handoff preserved
- touch RBAC or Rachi control-plane work
- broaden into admin expansion
- broaden into other screen owners
- write or apply new feature migrations
- change remote DB state
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `app/profile/[userId].tsx` shows owner-only stats, quick actions, and setup prompts on the same route
- public visitor mode remains intact on the same tabbed profile/channel surface
- owner mode remains on the same canonical route
- `/channel-settings` remains the separate studio-equivalent owner
- `/chat` and `/chat/[threadId]` remain the canonical communication handoff owners
- locked `Watch-Party Live` and `Live Watch-Party` semantics remain intact
- live schema remains unchanged
- no route proliferation, schema work, feature migrations, or unrelated runtime refactors are introduced in that implementation lane
