# NEXT TASK

## Exact Next Task
The active broader watch-party/live seam is now the combined watch-party entry / waiting-room chapter. Repo truth is explicit: the Live Room pre-stage shell and the Party Room setup shell are already isolated cleanly, and the next safe batch should focus on `app/watch-party/index.tsx` so the entry flow reads more action-first, less duplicated, and more behaviorally honest without reopening Party Room or Live Stage semantics.

## Current Plan
1. Treat the monetization, whole-app proof / QA, Party Room shell, and admin / owner / Rachi chapters as closed cleanly enough to stay untouched in this pass.
2. Preserve the landed Live Room pre-stage shell isolation on `app/watch-party/live-stage/[partyId].tsx`.
3. Preserve the landed Party Room setup shell isolation on `app/watch-party/[partyId].tsx`.
4. Keep `app/watch-party/index.tsx` as the active owner for the entry/waiting-room cleanup.
5. Make the entry flow more action-first by isolating and demoting duplicated support chrome instead of rewriting route truth.
6. Keep create/join/invite/access behavior honest and visible without flattening waiting-room, Party Room, and Live Stage into one thing.
7. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- isolate the watch-party entry support shell inside `app/watch-party/index.tsx` so the route stops mixing action cards, readiness rows, access copy, and invite/code chrome in one long inline stack
- trim duplicated next-room explanation in the entry owner so create/join cards own the handoff and the support shell stops repeating it
- keep invite/code and access truth visible only when the entry route has meaningful setup context such as a room code, title lock, preview, or in-progress preparation
- leave `app/watch-party/live-stage/[partyId].tsx` structurally intact for now and treat any remaining pre-stage copy density there as a later, smaller follow-up only if still justified after the entry cleanup
- keep Party Room, Live Stage, room sync, moderation, and host/viewer semantics unchanged
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `app/watch-party/index.tsx` as the canonical watch-party entry owner
- preserve `app/watch-party/live-stage/[partyId].tsx` as the Live Room / Live Stage owner while only using it for direct waiting-room alignment if needed
- preserve `app/watch-party/[partyId].tsx` as the already-closed Party Room owner and do not reopen it in this pass
- keep the current social baseline, monetization/access truth, and no-fake-comments/no-fake-ads doctrine intact
- make the entry route feel more premium and less memo-like by tightening route-local hierarchy instead of changing doctrine
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- keep the player, monetization, proof / QA, Party Room, and admin chapters closed unless a future broader audit proves a real structural reason to reopen one
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
 - change route truth
 - change room sync or Live Stage semantics
 - reopen Party Room or admin / owner / Rachi in this pass
 - reopen Google Play readiness, OVH work, or database-move work
 - invent fake room powers, fake comments, fake social claims, fake ads, or fake entitlements
 - mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `app/watch-party/index.tsx` becomes materially cleaner without changing create/join/invite/access behavior
- the entry route reads action-first instead of repeating the same handoff truth across too many setup cards
- invite/code, readiness, and access support stay visible when the route actually has meaningful setup context and stay out of the way when it does not
- `app/watch-party/live-stage/[partyId].tsx` stays structurally isolated and semantically unchanged during this pass
- Party Room and admin / owner / Rachi stay closed cleanly in this pass
- no route drift, schema drift, fake room powers, or fake social claims are introduced
- the staged set stays task-pure
