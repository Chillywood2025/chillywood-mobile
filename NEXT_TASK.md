# NEXT TASK

## Exact Next Task
The next exact task is Stage 1 implementation of the public unified `/profile/[userId]` profile/channel surface on `main`, using `docs/profile-channel-implementation-spec.md` as the governing implementation reference. Do not widen into `/channel-settings` expansion, profile/channel monetization rollout, `/studio*` route creation, schema work, remote DB state changes, watch-party/live route changes, RBAC, Rachi control-plane expansion, or unrelated screen/helpers in this lane. The typed cleanup family is now sufficiently clear to move on, and the landed spec now makes the next safe implementation step explicit: build the public unified profile/channel surface on the canonical `/profile/[userId]` owner while preserving owner mode on the same route, preserving canonical Chi'lly Chat handoff, and preserving locked `Watch-Party Live` / `Live Watch-Party` semantics.

## Current Plan
1. Re-read `docs/profile-channel-implementation-spec.md`, `CURRENT_STATE.md`, and `NEXT_TASK.md` first.
2. Keep the canonical route owner on `app/profile/[userId].tsx`.
3. Land the shared public profile/channel shell only: hero, identity/stats row, primary action row, tab strip, and the first public-tab implementation needed by Stage 1.
4. Preserve owner mode on the same route without widening into full owner-mode expansion yet.
5. Preserve `/channel-settings` as the separate studio-equivalent control center and keep `/chat` / `/chat/[threadId]` as the canonical communication owners.
6. Keep live schema unchanged and do not create `/studio*` routes in this lane.
7. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- implement Stage 1 public unified profile/channel work from `docs/profile-channel-implementation-spec.md`
- keep the owner route on `app/profile/[userId].tsx`
- land the canonical public profile/channel shell and tab structure without widening into full studio/settings expansion
- preserve `Chi'lly Chat`, `Watch-Party Live`, and `Live Watch-Party` doctrine
- keep live schema unchanged
- do not write or apply feature migrations
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- implement the Stage 1 public unified profile/channel surface
- keep the canonical public route on `app/profile/[userId].tsx`
- preserve owner mode on the same route
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
- `app/profile/[userId].tsx` reads as a unified public profile/channel surface aligned with `docs/profile-channel-implementation-spec.md`
- public identity, action-row, tab-strip, and public-surface responsibilities are clearer without route proliferation
- owner mode remains on the same canonical route
- `/channel-settings` remains the separate studio-equivalent owner
- `/chat` and `/chat/[threadId]` remain the canonical communication handoff owners
- locked `Watch-Party Live` and `Live Watch-Party` semantics remain intact
- live schema remains unchanged
- no route proliferation, schema work, feature migrations, or unrelated runtime refactors are introduced in that implementation lane
