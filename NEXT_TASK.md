# NEXT TASK

## Exact Next Task
The combined watch-party entry / waiting-room chapter is still active, but its first safe entry-owner batch is now landed cleanly. Repo truth is explicit: `app/watch-party/index.tsx` now reads more action-first, while the Live Room pre-stage shell and the Party Room setup shell both remain structurally isolated. The exact next step is the chapter closeout audit, with a second batch allowed only if one final narrow waiting-room or pre-stage alignment pass is clearly justified.

## Current Plan
1. Treat monetization, whole-app proof / QA, Party Room shell, and admin / owner / Rachi chapters as closed and untouched in this pass.
2. Preserve the landed entry-owner waiting-room support-shell cleanup on `app/watch-party/index.tsx`.
3. Preserve the already-isolated Live Room pre-stage shell on `app/watch-party/live-stage/[partyId].tsx`.
4. Run the chapter closeout audit before considering any second batch.
5. Only reopen `app/watch-party/live-stage/[partyId].tsx` for one final narrow pass if the closeout audit proves a real remaining seam that is still safe.
6. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- do not auto-open a second batch now that the entry-owner cleanup is landed
- audit whether the chapter can stop cleanly with `app/watch-party/index.tsx` improved and `app/watch-party/live-stage/[partyId].tsx` unchanged
- only if clearly justified, use one final narrow pass for waiting-room / pre-stage alignment without touching room sync or route truth
- otherwise close the chapter and record the exact later watch-party/live seam
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `app/watch-party/index.tsx` as the canonical watch-party entry owner
- preserve `app/watch-party/live-stage/[partyId].tsx` as the Live Room / Live Stage owner while only using it for direct waiting-room alignment if needed
- preserve `app/watch-party/[partyId].tsx` as the already-closed Party Room owner and do not reopen it in this pass
- keep the current social baseline, monetization/access truth, and no-fake-comments/no-fake-ads doctrine intact
- keep the landed entry route cleanup intact and decide honestly whether another narrow alignment pass is still justified
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
- `app/watch-party/index.tsx` stays materially cleaner without changing create/join/invite/access behavior
- the entry route now reads action-first instead of repeating the same handoff truth across too many setup cards
- invite/code, readiness, and access support now stay visible when the route actually has meaningful setup context and stay out of the way when it does not
- `app/watch-party/live-stage/[partyId].tsx` stays structurally isolated and semantically unchanged during this pass
- Party Room and admin / owner / Rachi stay closed cleanly in this pass
- no route drift, schema drift, fake room powers, or fake social claims are introduced
- the staged set stays task-pure
