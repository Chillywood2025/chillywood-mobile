# NEXT TASK

## Exact Next Task
The next exact task is Stage 5 implementation of the audience / analytics / safety layer on `main`, using `docs/profile-channel-implementation-spec.md` as the governing implementation reference. Do not widen into route proliferation, schema work, remote DB state changes, watch-party/live route changes, RBAC, Rachi control-plane expansion, or unrelated screen/helpers in this lane. Stages 1 through 4 are now landed, so the next safe step is to grow `/channel-settings` into the current owner-facing audience, analytics, and safety/admin summary surface while only adding the smallest profile hooks the spec actually calls for.

## Current Plan
1. Re-read `docs/profile-channel-implementation-spec.md`, `CURRENT_STATE.md`, and `NEXT_TASK.md` first.
2. Keep the canonical owner on `app/channel-settings.tsx`, with only spec-backed profile hooks if truly needed.
3. Add audience, analytics, and safety/admin section surfaces under the current `/channel-settings` route.
4. Preserve `/profile/[userId]`, `/chat`, `/chat/[threadId]`, and all watch-party/live route truth unchanged.
5. Keep live schema unchanged and do not create `/studio*` routes in this lane.
6. Stop honestly if the stage requires unsupported backend/schema behavior.

## Exact Next Batch
- implement Stage 5 audience / analytics / safety surface work from `docs/profile-channel-implementation-spec.md`
- keep the canonical route owner on `app/channel-settings.tsx`, plus only minimal profile hooks if the spec needs them
- add audience, analytics, and safety/admin sections under the current `/channel-settings` route
- keep the already-landed access & monetization framing intact
- preserve `Chi'lly Chat`, `Watch-Party Live`, and `Live Watch-Party` doctrine
- keep live schema unchanged
- do not write or apply feature migrations
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- implement Stage 5 audience / analytics / safety surface work
- keep the canonical route owner on `app/channel-settings.tsx`
- add audience summary, analytics summary, and safety/admin section surfaces on the current route
- preserve the Stage 1 and Stage 2 profile/channel foundation on `app/profile/[userId].tsx`
- preserve the Stage 3 `/channel-settings` structure and Stage 4 access framing
- preserve `/channel-settings` as the current studio-equivalent owner
- preserve `/chat` and `/chat/[threadId]` as canonical Chi'lly Chat routes
- preserve the landed typed foundation and helper/screen work
- avoid live schema changes in this lane
- avoid new feature migration writes or applies in this lane
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- invent unsupported analytics, audience, or safety backend behavior
- create `/studio*` routes
- touch runtime room/live-stage owners
- touch RBAC or Rachi control-plane work
- broaden into unrelated admin expansion
- broaden into other screen owners
- write or apply new feature migrations
- change remote DB state
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `/channel-settings` contains clear audience, analytics, and safety/admin sections on the current route
- any profile hook added is small, honest, and still preserves `/profile/[userId]` as the shared public + owner surface
- `/channel-settings` remains the separate studio-equivalent owner route
- `/chat` and `/chat/[threadId]` remain the canonical communication handoff owners
- locked `Watch-Party Live` and `Live Watch-Party` semantics remain intact
- live schema remains unchanged
- no route proliferation, schema work, feature migrations, or unrelated runtime refactors are introduced in that implementation lane
